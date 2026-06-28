const { gamesConfigDB } = require('./configDB');
const { redisClient } = require('../../redisClient');
const Cache = require('./cacheManager');

function getSecondsUntilMidnight() {
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0);
    return Math.max(60, Math.floor((midnight.getTime() - now.getTime()) / 1000));
}

function buildReturnedGameData(player) {
    const rootFields = ['id', 'user_id', 'server_id', 'nickname', 'level', 'combat_power', 'resources', 'idle_timestamps'];
    const returnedGameData = {};
    Object.entries(player).forEach(([key, val]) => {
        if (!rootFields.includes(key) && !['gameId', 'deviceId', 'sessionId', 'partnerId', 'username'].includes(key)) {
            returnedGameData[key] = val;
        }
    });
    return returnedGameData;
}

// Глобальные локеры против Race Conditions (состояний гонки при спаме кнопками)
if (!global.guildLocks) global.guildLocks = new Set();

// --- 1. КРЕАТОР КЛАНА С ГАРАНТИРОВАННОЙ ПОСЛЕДОВАТЕЛЬНОЙ ЗАПИСЬЮ ---
exports.createGuild = async function(userId, serverId, gameId, guildName) {
    const GameConfig = gamesConfigDB[gameId];
    if (!GameConfig?.social?.guild_system) return { error: true, message: "Config missing" };

    const gConfig = GameConfig.social.guild_system;
    const costResource = gConfig.creation_cost?.resource || "diamond";
    const costAmount = gConfig.creation_cost?.amount || 500;

    const lockKey = `create:${userId}`;
    if (global.guildLocks.has(lockKey)) return { error: true, message: "Запрос обрабатывается..." };
    global.guildLocks.add(lockKey);

    try {
        let player = await Cache.getPlayer(userId, serverId);
        if (!player) throw new Error("Profile missing in Redis");

        if (player.guild_id) return { error: true, message: "Вы уже состоите в клане" };
        if ((parseInt(player.resources?.[costResource]) || 0) < costAmount) {
            return { error: true, message: "Недостаточно ресурсов" };
        }

        const guildId = `g_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

        const newGuildObj = {
            id: guildId,
            name: guildName,
            level: 1,
            exp: 0,
            join_conditions: { min_level: 1, min_power: 0, auto_accept: false },
            requests: [],
            members: [{
                id: String(player.id),
                nickname: player.nickname,
                level: player.level,
                combat_power: player.combat_power,
                rank: "leader"
            }]
        };

        player.resources[costResource] -= costAmount;
        player.guild_id = guildId;

        // СНАЧАЛА жестко пишем в Postgres. Если база упадет, транзакция прервется и ресурсы не спишутся!
        const insertSql = `INSERT INTO guilds (id, server_id, name, level, exp, members_count, raw_data) VALUES ($1, $2, $3, 1, 0, 1, $4);`;
        await global.pool.query(insertSql, [guildId, serverId, guildName, JSON.stringify(newGuildObj)]);

        // Только после успеха в СУБД обновляем RAM-кэш
        await redisClient.set(`guild:${serverId}:${guildId}`, JSON.stringify(newGuildObj));
        await Cache.setPlayer(player);

        const { markPlayerDirty } = require('./lazyWrite');
        await markPlayerDirty(player.id, serverId);

        return { success: true, guild_id: guildId, game_data: buildReturnedGameData(player), resources: player.resources, active_guild: newGuildObj };
    } catch (e) {
        console.error("[GuildsDB:createGuild] Critical Error:", e.message);
        return { error: true, message: "Server database failure" };
    } finally {
        global.guildLocks.delete(lockKey);
    }
};

// --- 2. ОПТИМИЗИРОВАННЫЙ ПОИСК КЛАНОВ ИЗ POSTGRES (БЕЗ KEYS) ---
exports.searchGuilds = async function(userId, serverId) {
    try {
        const selectQuery = `SELECT id, name, level, members_count, (raw_data->'join_conditions') AS conditions FROM guilds WHERE server_id = $1 LIMIT 20;`;
        const { rows } = await global.pool.query(selectQuery, [serverId]);

        const guildList = rows.map(r => ({
            id: r.id,
            name: r.name,
            level: r.level,
            membersCount: r.members_count || 0,
            conditions: r.conditions || { min_level: 1, min_power: 0 }
        }));
        return { guilds: guildList };
    } catch (e) { return { error: true, message: e.message }; }
};

// --- 3. ПОДАЧА ЗАЯВКИ / АВТО-ВСТУПЛЕНИЕ ---
exports.applyToGuild = async function(userId, serverId, gameId, targetGuildId) {
    const GameConfig = gamesConfigDB[gameId];
    const gConfig = GameConfig?.social?.guild_system;
    if (!gConfig) return { error: true, message: "Конфигурация не найдена" };

    const lockKey = `apply:${userId}`;
    if (global.guildLocks.has(lockKey)) return { error: true, message: "Запрос обрабатывается..." };
    global.guildLocks.add(lockKey);

    try {
        let player = await Cache.getPlayer(userId, serverId);
        if (!player) throw new Error("Профиль игрока не найден");
        if (player.guild_id) return { error: true, message: "Вы уже состоите в клане" };

        const gCached = await redisClient.get(`guild:${serverId}:${targetGuildId}`);
        if (!gCached) return { error: true, message: "Целевой клан не существует" };
        let guild = JSON.parse(gCached);

        const lvlCapNode = gConfig.level_caps?.[guild.level] || { max_members: 20 };
        if ((guild.members?.length || 0) >= lvlCapNode.max_members) return { error: true, message: "В клане нет свободных мест" };

        const cond = guild.join_conditions || { min_level: 1, min_power: 0, auto_accept: false };
        if ((player.level || 1) < cond.min_level) return { error: true, message: "Ваш уровень слишком мал" };
        if ((player.combat_power || 0) < cond.min_power) return { error: true, message: "Ваша боевая сила слишком мала" };

        if (guild.requests?.map(id => String(id)).includes(String(userId))) return { error: true, message: "Вы уже подали заявку" };

        if (cond.auto_accept) {
            guild.members.push({ id: String(player.id), nickname: player.nickname, level: player.level, combat_power: player.combat_power, rank: "member" });
            player.guild_id = targetGuildId;

            // Сначала фиксируем изменения в Postgres
            await global.pool.query(`UPDATE guilds SET members_count = $1, raw_data = $2 WHERE id = $3;`, [guild.members.length, JSON.stringify(guild), targetGuildId]);

            // Затем пишем в RAM
            // Внутри applyToGuild под cond.auto_accept:
            player.guild_id = targetGuildId;

            // ИСПРАВЛЕНИЕ: Жестко пишем guild_id прямо в game_data через jsonb_set
            const updatePlayerGuildSql = `UPDATE player_server_profiles SET game_data = jsonb_set(game_data, '{guild_id}', $1::jsonb) WHERE id = $2 AND server_id = $3;`;
            await global.pool.query(updatePlayerGuildSql, [JSON.stringify(targetGuildId), String(player.id), serverId]);

            await Cache.setPlayer(player);

            await redisClient.set(`guild:${serverId}:${targetGuildId}`, JSON.stringify(guild));

            const { markPlayerDirty } = require('./lazyWrite');
            await markPlayerDirty(player.id, serverId);
            return { success: true, joined: true, guild_id: targetGuildId, active_guild: guild, game_data: buildReturnedGameData(player) };
        }

        if (!guild.requests) guild.requests = [];
        guild.requests.push(String(userId));

        await global.pool.query(`UPDATE guilds SET raw_data = $1 WHERE id = $2;`, [JSON.stringify(guild), targetGuildId]);
        await redisClient.set(`guild:${serverId}:${targetGuildId}`, JSON.stringify(guild));

        return { success: true, joined: false, message: "Заявка успешно отправлена", active_guild: guild };
    } catch (e) { return { error: true, message: e.message }; }
    finally { global.guildLocks.delete(lockKey); }
};

// --- 4. СПИСОК ВХОДЯЩИХ ЗАЯВОК + ОСТАТКИ РОСТЕРА ---
exports.getGuildRequestsList = async function(userId, serverId) {
    try {
        let player = await Cache.getPlayer(userId, serverId);
        if (!player || !player.guild_id) return { error: true, message: "Вы не состоите в клане" };

        const gCached = await redisClient.get(`guild:${serverId}:${player.guild_id}`);
        if (!gCached) return { error: true, message: "Клан не найден" };
        const guild = JSON.parse(gCached);

        const me = guild.members.find(m => String(m.id) === String(userId));
        if (!me || (me.rank !== 'leader' && me.rank !== 'officer')) return { error: true, message: "Доступ запрещен" };

        const reqUids = guild.requests || [];
        if (reqUids.length === 0) return { requests: [], active_guild: guild };

        const selectQuery = `SELECT id, nickname, level, combat_power, (game_data->>'avatar_icon') AS avatar_icon FROM player_server_profiles WHERE id = ANY($1) AND server_id = $2;`;
        const { rows } = await global.pool.query(selectQuery, [reqUids, serverId]);
        return { requests: rows, active_guild: guild };
    } catch (e) { return { error: true, message: e.message }; }
};

// --- 3. ПОДАЧА ЗАЯВКИ / АВТО-ВСТУПЛЕНИЕ ---
exports.applyToGuild = async function(userId, serverId, gameId, targetGuildId) {
    const GameConfig = gamesConfigDB[gameId];
    const gConfig = GameConfig?.social?.guild_system;
    if (!gConfig) return { error: true, message: "Конфигурация не найдена" };

    const lockKey = `apply:${userId}`;
    if (global.guildLocks.has(lockKey)) return { error: true, message: "Запрос обрабатывается..." };
    global.guildLocks.add(lockKey);

    try {
        let player = await Cache.getPlayer(userId, serverId);
        if (!player) throw new Error("Профиль игрока не найден");
        if (player.guild_id) return { error: true, message: "Вы уже состоите в клане" };

        const gCached = await redisClient.get(`guild:${serverId}:${targetGuildId}`);
        if (!gCached) return { error: true, message: "Целевой клан не существует" };
        let guild = JSON.parse(gCached);

        const lvlCapNode = gConfig.level_caps?.[guild.level] || { max_members: 20 };
        if ((guild.members?.length || 0) >= lvlCapNode.max_members) return { error: true, message: "В клане нет свободных мест" };

        const cond = guild.join_conditions || { min_level: 1, min_power: 0, auto_accept: false };
        if ((player.level || 1) < cond.min_level) return { error: true, message: "Ваш уровень слишком мал" };
        if ((player.combat_power || 0) < cond.min_power) return { error: true, message: "Ваша боевая сила слишком мала" };

        if (guild.requests?.map(id => String(id)).includes(String(userId))) return { error: true, message: "Вы уже подали заявку" };

        if (cond.auto_accept) {
            guild.members.push({ id: String(player.id), nickname: player.nickname, level: player.level, combat_power: player.combat_power, rank: "member" });
            player.guild_id = targetGuildId;

            // Сначала фиксируем изменения в Postgres
            await global.pool.query(`UPDATE guilds SET members_count = $1, raw_data = $2 WHERE id = $3;`, [guild.members.length, JSON.stringify(guild), targetGuildId]);

            // Затем пишем в RAM
            await Cache.setPlayer(player);
            await redisClient.set(`guild:${serverId}:${targetGuildId}`, JSON.stringify(guild));

            const { markPlayerDirty } = require('./lazyWrite');
            await markPlayerDirty(player.id, serverId);
            return { success: true, joined: true, guild_id: targetGuildId, active_guild: guild, game_data: buildReturnedGameData(player) };
        }

        if (!guild.requests) guild.requests = [];
        guild.requests.push(String(userId));

        await global.pool.query(`UPDATE guilds SET raw_data = $1 WHERE id = $2;`, [JSON.stringify(guild), targetGuildId]);
        await redisClient.set(`guild:${serverId}:${targetGuildId}`, JSON.stringify(guild));

        return { success: true, joined: false, message: "Заявка успешно отправлена", active_guild: guild };
    } catch (e) { return { error: true, message: e.message }; }
    finally { global.guildLocks.delete(lockKey); }
};

// --- 4. СПИСОК ВХОДЯЩИХ ЗАЯВОК + ОСТАТКИ РОСТЕРА ---
exports.getGuildRequestsList = async function(userId, serverId) {
    try {
        let player = await Cache.getPlayer(userId, serverId);
        if (!player || !player.guild_id) return { error: true, message: "Вы не состоите в клане" };

        const gCached = await redisClient.get(`guild:${serverId}:${player.guild_id}`);
        if (!gCached) return { error: true, message: "Клан не найден" };
        const guild = JSON.parse(gCached);

        const me = guild.members.find(m => String(m.id) === String(userId));
        if (!me || (me.rank !== 'leader' && me.rank !== 'officer')) return { error: true, message: "Доступ запрещен" };

        const reqUids = guild.requests || [];
        if (reqUids.length === 0) return { requests: [], active_guild: guild };

        const selectQuery = `SELECT id, nickname, level, combat_power, (game_data->>'avatar_icon') AS avatar_icon FROM player_server_profiles WHERE id = ANY($1) AND server_id = $2;`;
        const { rows } = await global.pool.query(selectQuery, [reqUids, serverId]);
        return { requests: rows, active_guild: guild };
    } catch (e) { return { error: true, message: e.message }; }
};

// --- 5. ОБРАБОТКА ЗАЯВКИ (ПРИНЯТЬ / ОТКЛОНИТЬ) ---
exports.handleGuildRequest = async function(userId, serverId, gameId, candidateId, action) {
    const GameConfig = gamesConfigDB[gameId];
    const gConfig = GameConfig?.social?.guild_system;

    const lockKey = `handle:${candidateId}`;
    if (global.guildLocks.has(lockKey)) return { error: true, message: "Заявка обрабатывается..." };
    global.guildLocks.add(lockKey);

    try {
        let manager = await Cache.getPlayer(userId, serverId);
        if (!manager || !manager.guild_id) return { error: true, message: "Вы не в клане" };

        const gCached = await redisClient.get(`guild:${serverId}:${manager.guild_id}`);
        if (!gCached) return { error: true, message: "Клан не найден" };
        let guild = JSON.parse(gCached);

        const me = guild.members.find(m => String(m.id) === String(userId));
        if (!me || (me.rank !== 'leader' && me.rank !== 'officer')) return { error: true, message: "Доступ запрещен" };

        guild.requests = (guild.requests || []).filter(id => String(id) !== String(candidateId));

        if (action === 'accept') {
            const lvlCapNode = gConfig?.level_caps?.[guild.level] || { max_members: 20 };
            if (guild.members.length >= lvlCapNode.max_members) return { error: true, message: "Клан переполнен" };

            let candObj = await Cache.getPlayer(candidateId, serverId);
            if (candObj) {
                if (candObj.guild_id) return { error: true, message: "Игрок уже вступил в другой клан" };
                candObj.guild_id = manager.guild_id;

                // ИСПРАВЛЕНИЕ: Жестко фиксируем в СУБД для онлайн-кандидата
                const updateCandGuildSql = `UPDATE player_server_profiles SET game_data = jsonb_set(game_data, '{guild_id}', $1::jsonb) WHERE id = $2 AND server_id = $3;`;
                await global.pool.query(updateCandGuildSql, [JSON.stringify(manager.guild_id), String(candidateId), serverId]);

                await Cache.setPlayer(candidateId, serverId, candObj);
                guild.members.push({ id: String(candObj.id), nickname: candObj.nickname, level: candObj.level, combat_power: candObj.combat_power, rank: "member" });
            }
            else {
                const { rows } = await global.pool.query(`SELECT id, nickname, level, combat_power, game_data FROM player_server_profiles WHERE id = $1 AND server_id = $2;`, [candidateId, serverId]);
                if (rows.length === 0) return { error: true, message: "Кандидат не найден в БД" };

                // ИСПРАВЛЕНИЕ: rows — это массив, берем первый элемент rows[0]
                let candGameData = rows[0].game_data || {};
                if (candGameData.guild_id) return { error: true, message: "Игрок уже в другом клане" };

                guild.members.push({ id: String(rows[0].id), nickname: rows[0].nickname, level: rows[0].level, combat_power: rows[0].combat_power, rank: "member" });

                const updateCandSql = `UPDATE player_server_profiles SET game_data = jsonb_set(game_data, '{guild_id}', $1::jsonb) WHERE id = $2 AND server_id = $3;`;
                await global.pool.query(updateCandSql, [JSON.stringify(manager.guild_id), candidateId, serverId]);
            }
        }

        // ИСПРАВЛЕНИЕ: Добавлены скобки для вызова метода query() базы данных
        await global.pool.query(`UPDATE guilds SET members_count = $1, raw_data = $2 WHERE id = $3;`, [guild.members.length, JSON.stringify(guild), manager.guild_id]);
        await redisClient.set(`guild:${serverId}:${manager.guild_id}`, JSON.stringify(guild));

        return { success: true, action: action, requests: guild.requests, active_guild: guild };
    } catch (e) { return { error: true, message: e.message }; }
    finally { global.guildLocks.delete(lockKey); }
};

// --- 6. СМЕНА ДОЛЖНОСТИ ---
exports.changeMemberRank = async function(userId, serverId, gameId, targetMemberId, newRank) {
    const GameConfig = gamesConfigDB[gameId];
    const gConfig = GameConfig?.social?.guild_system;
    if (!['officer', 'member'].includes(newRank)) return { error: true, message: "Недопустимый ранг" };

    try {
        let leader = await Cache.getPlayer(userId, serverId);
        if (!leader || !leader.guild_id) return { error: true, message: "Вы не в клане" };

        const gCached = await redisClient.get(`guild:${serverId}:${leader.guild_id}`);
        if (!gCached) return { error: true, message: "Клан не найден" };
        let guild = JSON.parse(gCached);

        const me = guild.members.find(m => String(m.id) === String(userId));
        if (!me || me.rank !== 'leader') return { error: true, message: "Только лидер меняет должности" };

        const target = guild.members.find(m => String(m.id) === String(targetMemberId));
        if (!target) return { error: true, message: "Игрок не найден в ростере" };

        if (newRank === 'officer') {
            const lvlCapNode = gConfig?.level_caps?.[guild.level] || { max_officers: 2 };
            const currentOfficersCount = guild.members.filter(m => m.rank === 'officer').length;
            if (currentOfficersCount >= lvlCapNode.max_officers) return { error: true, message: "Достигнут лимит офицеров" };
        }

        target.rank = newRank;

        await global.pool.query(`UPDATE guilds SET raw_data = $1 WHERE id = $2;`, [JSON.stringify(guild), leader.guild_id]);
        await redisClient.set(`guild:${serverId}:${leader.guild_id}`, JSON.stringify(guild));

        return { success: true, active_guild: guild };
    } catch (e) { return { error: true, message: e.message }; }
};

// --- 7. ЕЖЕДНЕВНЫЕ ВНОСЫ (TRIBUTES) ---
exports.submitGuildTribute = async function(userId, serverId, gameId, tributeId) {
    const GameConfig = gamesConfigDB[gameId];
    const gConfig = GameConfig?.social?.guild_system;
    const tribute = gConfig?.donation_modes?.[tributeId];
    if (!tribute) return { error: true, message: "Внос не найден в конфиге" };

    const costResource = tribute.cost?.resource || "gold";
    const costAmount = tribute.cost?.amount || 10000;
    const rewardExp = tribute.rewards?.guild_exp || 100;
    const rewardCoin = tribute.rewards?.guild_coin || 50;

    const lockKey = `tribute:${userId}`;
    if (global.guildLocks.has(lockKey)) return { error: true, message: "Обработка платежа..." };
    global.guildLocks.add(lockKey);

    try {
        let player = await Cache.getPlayer(userId, serverId);
        if (!player || !player.guild_id) return { error: true, message: "Вы не в клане" };

        const nowStr = new Date().toISOString().split('T')[0];
        const donHistoryKey = `g_don:${serverId}:${gameId}:${userId}:${nowStr}`;
        if (await redisClient.get(donHistoryKey)) return { error: true, message: "Вы уже делали внос сегодня" };

        if ((parseInt(player.resources?.[costResource]) || 0) < costAmount) return { error: true, message: "Недостаточно ресурсов" };

        const gCached = await redisClient.get(`guild:${serverId}:${player.guild_id}`);
        if (!gCached) return { error: true, message: "Клан не найден" };
        let guild = JSON.parse(gCached);

        await redisClient.setEx(donHistoryKey, getSecondsUntilMidnight(), "1");
        player.resources[costResource] -= costAmount;
        const shopCurrencyKey = gConfig.shop?.currency_resource_id || "guild_coin";
        player.resources[shopCurrencyKey] = (parseInt(player.resources[shopCurrencyKey]) || 0) + rewardCoin;

        guild.exp += rewardExp;
        const maxGLevel = gConfig.max_guild_level || 10;
        if (guild.exp >= guild.level * 1000 && guild.level < maxGLevel) {
            guild.level += 1;
        }

        // Атомарно фиксируем транзакцию в СУБД, затем RAM
        await global.pool.query(`UPDATE guilds SET level = $1, exp = $2, raw_data = $3 WHERE id = $4;`, [guild.level, guild.exp, JSON.stringify(guild), player.guild_id]);
        await redisClient.set(`guild:${serverId}:${player.guild_id}`, JSON.stringify(guild));
        await Cache.setPlayer(player);

        const { markPlayerDirty } = require('./lazyWrite');
        await markPlayerDirty(player.id, serverId);

        return { success: true, guild_level: guild.level, active_guild: guild, game_data: buildReturnedGameData(player), resources: player.resources };
    } catch (e) { return { error: true, message: e.message }; }
    finally { global.guildLocks.delete(lockKey); }
};

// --- 8. ВЫХОД ИЗ КЛАНА (LEAVE) ---
exports.leaveGuild = async function(userId, serverId) {
    try {
        let player = await Cache.getPlayer(userId, serverId);
        if (!player || !player.guild_id) return { error: true, message: "Вы не состоите в клане" };

        const guildId = player.guild_id;
        const gCached = await redisClient.get(`guild:${serverId}:${guildId}`);
        if (!gCached) return { error: true, message: "Клан не найден" };
        let guild = JSON.parse(gCached);

        const me = guild.members.find(m => String(m.id) === String(userId));
        if (!me) return { error: true, message: "Вы не найдены в ростере" };
        if (me.rank === 'leader') return { error: true, message: "Лидер не может покинуть клан" };

        guild.members = guild.members.filter(m => String(m.id) !== String(userId));
        player.guild_id = null;

        await global.pool.query(`UPDATE guilds SET members_count = $1, raw_data = $2 WHERE id = $3;`, [guild.members.length, JSON.stringify(guild), guildId]);
        await redisClient.set(`guild:${serverId}:${guildId}`, JSON.stringify(guild));
        await Cache.setPlayer(player);

        // ИСПРАВЛЕНИЕ: Принудительно зануляем ячейку в базе данных
        const clearGuildSql = `UPDATE player_server_profiles SET game_data = jsonb_set(game_data, '{guild_id}', 'null'::jsonb) WHERE id = $1 AND server_id = $2;`;
        await global.pool.query(clearGuildSql, [String(userId), serverId]);

        await global.pool.query(`UPDATE guilds SET members_count = $1, raw_data = $2 WHERE id = $3;`, [guild.members.length, JSON.stringify(guild), guildId]);

        return { success: true, active_guild: null, game_data: buildReturnedGameData(player) };
    } catch (e) { return { error: true, message: e.message }; }
};

// --- 9. ИСКЛЮЧЕНИЕ ИЗ КЛАНА (KICK) ---
exports.kickFromGuild = async function(userId, serverId, targetMemberId) {
    if (String(userId) === String(targetMemberId)) return { error: true, message: "Нельзя выгнать самого себя" };

    try {
        let manager = await Cache.getPlayer(userId, serverId);
        if (!manager || !manager.guild_id) return { error: true, message: "Вы не состоите в клане" };

        const guildId = manager.guild_id;
        const gCached = await redisClient.get(`guild:${serverId}:${guildId}`);
        if (!gCached) return { error: true, message: "Клан не найден" };
        let guild = JSON.parse(gCached);

        const me = guild.members.find(m => String(m.id) === String(userId));
        const target = guild.members.find(m => String(m.id) === String(targetMemberId));

        if (!me || !target) return { error: true, message: "Игрок не найден" };
        if (me.rank === 'officer' && target.rank !== 'member') return { error: true, message: "Недостаточно прав" };
        if (me.rank !== 'leader' && me.rank !== 'officer') return { error: true, message: "Доступ запрещен" };

        guild.members = guild.members.filter(m => String(m.id) !== String(targetMemberId));

        await global.pool.query(`UPDATE guilds SET members_count = $1, raw_data = $2 WHERE id = $3;`, [guild.members.length, JSON.stringify(guild), guildId]);
        await redisClient.set(`guild:${serverId}:${guildId}`, JSON.stringify(guild));

        let targetObj = await Cache.getPlayer(targetMemberId, serverId);
        if (targetObj) {
            targetObj.guild_id = null;

            // ИСПРАВЛЕНИЕ: Жестко зануляем в базе для онлайн игрока, которого кикнули
            const clearKickSql = `UPDATE player_server_profiles SET game_data = jsonb_set(game_data, '{guild_id}', 'null'::jsonb) WHERE id = $1 AND server_id = $2;`;
            await global.pool.query(clearKickSql, [String(targetMemberId), serverId]);

            await Cache.setPlayer(targetMemberId, serverId, targetObj);
        }
        else {
            const updateSql = `UPDATE player_server_profiles SET game_data = jsonb_set(game_data, '{guild_id}', 'null'::jsonb) WHERE id = $1 AND server_id = $2;`;
            await global.pool.query(updateSql, [targetMemberId, serverId]);
        }

        return { success: true, active_guild: guild };
    } catch (e) { return { error: true, message: e.message }; }
};

// --- 10. РОСПУСК КЛАНА (DISBAND) ---
exports.disbandGuild = async function(userId, serverId) {
    try {
        let leader = await Cache.getPlayer(userId, serverId);
        if (!leader || !leader.guild_id) return { error: true, message: "Вы не состоите в клане" };

        const guildId = leader.guild_id;
        const gCached = await redisClient.get(`guild:${serverId}:${guildId}`);
        if (!gCached) return { error: true, message: "Клан не найден" };
        const guild = JSON.parse(gCached);

        const me = guild.members.find(m => String(m.id) === String(userId));
        if (!me || me.rank !== 'leader') return { error: true, message: "Только лидер может распустить клан" };

        const memberIds = guild.members.map(m => String(m.id));

        await global.pool.query(`DELETE FROM guilds WHERE id = $1;`, [guildId]);
        await redisClient.del(`guild:${serverId}:${guildId}`);

        for (let mId of memberIds) {
            let memberObj = await Cache.getPlayer(mId, serverId);
            if (memberObj) {
                memberObj.guild_id = null;
                await Cache.setPlayer(mId, serverId, memberObj);
            }
        }

        const purgeSql = `UPDATE player_server_profiles SET game_data = jsonb_set(game_data, '{guild_id}', 'null'::jsonb) WHERE id = ANY($1) AND server_id = $2;`;
        await global.pool.query(purgeSql, [memberIds, serverId]);

        return { success: true, disbanded: true, active_guild: null };
    } catch (e) { return { error: true, message: e.message }; }
};

// --- 11. МЕТОД ЗАГРУЗКИ ПРИ ВХОДЕ ИЗ ГЛАВНОГО МЕНЮ ---

exports.getGuildMainData = async function(userId, serverId) {
    try {
        let player = await Cache.getPlayer(userId, serverId);
        if (!player) throw new Error("Профиль не найден");

        if (player.guild_id) {
            const gCached = await redisClient.get(`guild:${serverId}:${player.guild_id}`);
            if (gCached) {
                return { active_guild: JSON.parse(gCached) };
            }
        }
        return { active_guild: null };
    } catch (e) {
        console.error("[GuildsDB:getGuildMainData] Error:", e.message);
        return { error: true, message: e.message };
    }
};




// const {gamesConfigDB} = require('./configDB');
// const { redisClient } = require('../../redisClient');
// const Cache = require('./cacheManager');
//
// function getSecondsUntilMidnight() {
//     const now = new Date();
//     const midnight = new Date(now);
//     midnight.setHours(24, 0, 0, 0);
//     return Math.max(60, Math.floor((midnight.getTime() - now.getTime()) / 1000));
// }
//
// function buildReturnedGameData(player) {
//     const rootFields = ['id', 'user_id', 'server_id', 'nickname', 'level', 'combat_power', 'resources', 'idle_timestamps'];
//     const returnedGameData = {};
//     Object.entries(player).forEach(([key, val]) => {
//         if (!rootFields.includes(key) && !['gameId', 'deviceId', 'sessionId', 'partnerId', 'username'].includes(key)) {
//             returnedGameData[key] = val;
//         }
//     });
//     return returnedGameData;
// }
//
// // --- 1. КРЕАТОР КЛАНА С ЗАПИСЬЮ В ПОСТГРЕС ---
// // --- 1. КРЕАТОР КЛАНА (БЕЗОПАСНЫЙ И ОПТИМИЗИРОВАННЫЙ) ---
// exports.createGuild = async function(userId, serverId, gameId, guildName) {
//     const GameConfig = gamesConfigDB[gameId];
//     if (!GameConfig?.social?.guild_system) return { error: true, message: "Config missing" };
//
//     const gConfig = GameConfig.social.guild_system;
//     const costResource = gConfig.creation_cost?.resource || "diamond";
//     const costAmount = gConfig.creation_cost?.amount || 500;
//
//     // Локальный локер на уровне Node.js против двойного клика
//     if (!global.guildCreationLock) global.guildCreationLock = {};
//     if (global.guildCreationLock[userId]) {
//         return { error: true, message: "Запрос уже обрабатывается" };
//     }
//     global.guildCreationLock[userId] = true;
//
//     try {
//         let player = await Cache.getPlayer(userId, serverId);
//         if (!player) throw new Error("Profile missing in Redis");
//
//         if (player.guild_id) {
//             delete global.guildCreationLock[userId];
//             return { error: true, message: "Вы уже состоите в клане" };
//         }
//         if ((parseInt(player.resources?.[costResource]) || 0) < costAmount) {
//             delete global.guildCreationLock[userId];
//             return { error: true, message: "Недостаточно ресурсов" };
//         }
//
//         const guildId = `g_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
//
//         const newGuildObj = {
//             id: guildId,
//             name: guildName,
//             level: 1,
//             exp: 0,
//             join_conditions: { min_level: 1, min_power: 0, auto_accept: false },
//             requests: [],
//             members: [{
//                 id: player.id,
//                 nickname: player.nickname,
//                 level: player.level,
//                 combat_power: player.combat_power,
//                 rank: "leader"
//             }]
//         };
//
//         player.resources[costResource] -= costAmount;
//         player.guild_id = guildId;
//
//         // 1. Пишем клан в Redis и в таблицу guilds
//         await redisClient.set(`guild:${serverId}:${guildId}`, JSON.stringify(newGuildObj));
//         const insertSql = `INSERT INTO guilds (id, server_id, name, level, exp, members_count, raw_data) VALUES ($1, $2, $3, 1, 0, 1, $4);`;
//         await global.pool.query(insertSql, [guildId, serverId, guildName, JSON.stringify(newGuildObj)]);
//
//         // 2. Сохраняем игрока в кэш
//         await Cache.setPlayer(player);
//
//         delete global.guildCreationLock[userId];
//
//         // Возвращаем плоский пакет строго под твои сокеты
//         return {
//             success: true,
//             guild_id: guildId,
//             game_data: buildReturnedGameData(player),
//             resources: player.resources,
//             active_guild: newGuildObj
//         };
//
//     } catch (e) {
//         delete global.guildCreationLock[userId];
//         console.warn("[Create Guild Error]:", e.message);
//         return { error: true, message: e.message };
//     }
// };
//
//
// // --- 2. ОПТИМИЗИРОВАННЫЙ ПОИСК КЛАНОВ ИЗ POSTGRES (БЕЗ KEYS) ---
// exports.searchGuilds = async function(userId, serverId) {
//     try {
//         // ИСПРАВЛЕНИЕ: Никаких keys(). Быстрый, индексированный SELECT из таблицы СУБД
//         const selectQuery = `
//             SELECT id, name, level, members_count, (raw_data->'join_conditions') AS conditions
//             FROM guilds
//             WHERE server_id = $1
//             LIMIT 20;
//         `;
//         const { rows } = await global.pool.query(selectQuery, [serverId]);
//
//         const guildList = rows.map(r => ({
//             id: r.id,
//             name: r.name,
//             level: r.level,
//             membersCount: r.members_count || 0,
//             conditions: r.conditions || { min_level: 1, min_power: 0 }
//         }));
//
//         return { guilds: guildList };
//     } catch (e) {
//         console.error("[GuildsDB:searchGuilds] Error:", e.message);
//         return { error: true, message: e.message };
//     }
// };
//
// // --- 3. ПОДАЧА ЗАЯВКИ В КЛАН С ПРОВЕРКОЙ УСЛОВИЙ ВСТУПЛЕНИЯ ---
// exports.applyToGuild = async function(userId, serverId, gameId, targetGuildId) {
//     const GameConfig = gamesConfigDB[gameId];
//     const gConfig = GameConfig?.social?.guild_system;
//     if (!gConfig) return { error: true, message: "Конфигурация не найдена" };
//
//     if (redisClient.isOpen && redisClient.isReady) {
//         try {
//             let player = await Cache.getPlayer(userId, serverId);
//             if (!player) throw new Error("Профиль игрока не найден");
//             if (player.guild_id) return { error: true, message: "Вы уже состоите в клане" };
//
//             const gCached = await redisClient.get(`guild:${serverId}:${targetGuildId}`);
//             if (!gCached) return { error: true, message: "Целевой клан не существует" };
//             let guild = JSON.parse(gCached);
//
//             const lvlCapNode = gConfig.level_caps?.[guild.level] || { max_members: 20 };
//             if ((guild.members?.length || 0) >= lvlCapNode.max_members) {
//                 return { error: true, message: "В клане нет свободных мест" };
//             }
//
//             // Жесткая валидация условий вступления (уровень и сила)
//             const cond = guild.join_conditions || { min_level: 1, min_power: 0, auto_accept: false };
//             if ((player.level || 1) < cond.min_level) return { error: true, message: "Ваш уровень слишком мал" };
//             if ((player.combat_power || 0) < cond.min_power) return { error: true, message: "Ваша боевая сила слишком мала" };
//
//             if (guild.requests?.includes(userId)) return { error: true, message: "Вы уже подали заявку" };
//
//             // Мгновенный авто-инжект, если у клана включен auto_accept
//             if (cond.auto_accept) {
//                 guild.members.push({ id: player.id, nickname: player.nickname, level: player.level, combat_power: player.combat_power, rank: "member" });
//                 player.guild_id = targetGuildId;
//                 await Cache.setPlayer(player);
//                 await redisClient.set(`guild:${serverId}:${targetGuildId}`, JSON.stringify(guild));
//
//                 return { success: true, joined: true, guild_id: targetGuildId, game_data: buildReturnedGameData(player) };
//             }
//
//             // Иначе ставим в очередь заявок
//             if (!guild.requests) guild.requests = [];
//             guild.requests.push(userId);
//             await redisClient.set(`guild:${serverId}:${targetGuildId}`, JSON.stringify(guild));
//
//             return { success: true, joined: false, message: "Заявка успешно отправлена на рассмотрение" };
//         } catch (e) { console.warn(e); }
//     }
//     return { error: true, message: "Cache subsystem failure" };
// };
//
// // --- 4. СПИСОК ВХОДЯЩИХ ЗАЯВК ДЛЯ ОФИЦЕРОВ КЛАНА ---
// // --- 4. СПИСОК ВХОДЯЩИХ ЗАЯВК ДЛЯ ОФИЦЕРОВ КЛАНА (ИСПРАВЛЕННЫЙ) ---
// exports.getGuildRequestsList = async function(userId, serverId) {
//     try {
//         let player = await Cache.getPlayer(userId, serverId);
//         if (!player || !player.guild_id) return { error: true, message: "Вы не состоите в клане" };
//
//         const gCached = await redisClient.get(`guild:${serverId}:${player.guild_id}`);
//         if (!gCached) return { error: true, message: "Клан не найден" };
//         const guild = JSON.parse(gCached);
//
//         // Проверка прав
//         const me = guild.members.find(m => String(m.id) === String(userId));
//         if (!me || (me.rank !== 'leader' && me.rank !== 'officer')) {
//             return { error: true, message: "Недостаточно прав для управления заявками" };
//         }
//
//         const reqUids = guild.requests || [];
//         if (reqUids.length === 0) {
//             return { requests: [], active_guild: guild };
//         }
//
//         const selectQuery = `SELECT id, nickname, level, combat_power, (game_data->>'avatar_icon') AS avatar_icon FROM player_server_profiles WHERE id = ANY($1) AND server_id = $2;`;
//         const { rows } = await global.pool.query(selectQuery, [reqUids, serverId]);
//
//         // ИСПРАВЛЕНИЕ: Возвращаем и список заявок, и саму гильдию целиком
//         return {
//             requests: rows,
//             active_guild: guild
//         };
//     } catch (e) {
//         console.error("[GuildsDB:getGuildRequestsList] Error:", e.message);
//         return { error: true, message: e.message };
//     }
// };
//
// // --- 5. ОБРАБОТКА ЗАЯВКИ (ПРИНЯТЬ / ОТКЛОНИТЬ) ---
// exports.handleGuildRequest = async function(userId, serverId, gameId, candidateId, action) {
//     const GameConfig = gamesConfigDB[gameId];
//     const gConfig = GameConfig?.social?.guild_system;
//
//     try {
//         let manager = await Cache.getPlayer(userId, serverId);
//         if (!manager || !manager.guild_id) return { error: true, message: "Вы не состоите в клане" };
//
//         const gCached = await redisClient.get(`guild:${serverId}:${manager.guild_id}`);
//         if (!gCached) return { error: true, message: "Клан не найден" };
//         let guild = JSON.parse(gCached);
//
//         const me = guild.members.find(m => m.id === userId);
//         if (!me || (me.rank !== 'leader' && me.rank !== 'officer')) return { error: true, message: "Доступ запрещен" };
//
//         guild.requests = (guild.requests || []).filter(id => id !== candidateId);
//
//         if (action === 'accept') {
//             const lvlCapNode = gConfig?.level_caps?.[guild.level] || { max_members: 20 };
//             if (guild.members.length >= lvlCapNode.max_members) return { error: true, message: "Клан переполнен" };
//
//             // Пытаемся подгрузить сессию кандидата из Redis (если он онлайн)
//             let candidateOnline = false;
//             let candObj = await Cache.getPlayer(candidateId, serverId);
//             if (candObj) {
//                 if (candObj.guild_id) return { error: true, message: "Игрок уже вступил в другой клан" };
//                 candObj.guild_id = manager.guild_id;
//                 await Cache.setPlayer(candidateId, serverId, candObj);
//
//                 guild.members.push({ id: candObj.id, nickname: candObj.nickname, level: candObj.level, combat_power: candObj.combat_power, rank: "member" });
//                 candidateOnline = true;
//             }
//
//             // Если оффлайн, добираем его базовые статы из БД для ростера клана
//             if (!candidateOnline) {
//                 const { rows } = await global.pool.query(`SELECT id, nickname, level, combat_power, game_data FROM player_server_profiles WHERE id = $1 AND server_id = $2;`, [candidateId, serverId]);
//                 if (rows.length === 0) return { error: true, message: "Профиль кандидата не найден" };
//
//                 let candGameData = rows[0].game_data || {};
//                 if (candGameData.guild_id) return { error: true, message: "Игрок уже состоит в другом клане" };
//
//                 guild.members.push({ id: rows[0].id, nickname: rows[0].nickname, level: rows[0].level, combat_power: rows[0].combat_power, rank: "member" });
//
//                 // Ленивый накат флага клана в БД оффлайн игроку
//                 candGameData.guild_id = manager.guild_id;
//                 await global.pool.query(`UPDATE player_server_profiles SET game_data = $3 WHERE id = $1 AND server_id = $2;`, [candidateId, serverId, JSON.stringify(candGameData)]);
//             }
//         }
//
//         await redisClient.set(`guild:${serverId}:${manager.guild_id}`, JSON.stringify(guild));
//         // Вставь эту команду перед return в методы handleGuildRequest, changeMemberRank и submitGuildTribute:
//         await global.pool.query(
//             `UPDATE guilds SET level = $1, exp = $2, members_count = $3, raw_data = $4 WHERE id = $5;`,
//             [guild.level, guild.exp, guild.members.length, JSON.stringify(guild), manager.guild_id || leader.guild_id || guild.id]
//         );
//
//
//         return { success: true, action: action, requests: guild.requests, members: guild.members };
//     } catch (e) { return { error: true, message: e.message }; }
// };
//
// // --- 6. ИЕРАРХИЯ КЛАНА: ИЗМЕНЕНИЕ РАНГОВ И ДОЛЖНОСТЕЙ ---
// exports.changeMemberRank = async function(userId, serverId, gameId, targetMemberId, newRank) {
//     const GameConfig = gamesConfigDB[gameId];
//     const gConfig = GameConfig?.social?.guild_system;
//
//     if (!['officer', 'member'].includes(newRank)) return { error: true, message: "Недопустимый ранг" };
//
//     try {
//         let leader = await Cache.getPlayer(userId, serverId);
//         if (!leader || !leader.guild_id) return { error: true, message: "Вы не в клане" };
//
//         const gCached = await redisClient.get(`guild:${serverId}:${leader.guild_id}`);
//         if (!gCached) return { error: true, message: "Клан не найден" };
//         let guild = JSON.parse(gCached);
//
//         // Только Лидер имеет право менять должности
//         const me = guild.members.find(m => m.id === userId);
//         if (!me || me.rank !== 'leader') return { error: true, message: "Только лидер может менять должности" };
//
//         const target = guild.members.find(m => m.id === targetMemberId);
//         if (!target) return { error: true, message: "Игрок не найден в ростере клана" };
//
//         // Валидация капа офицеров из конфига админки
//         if (newRank === 'officer') {
//             const lvlCapNode = gConfig?.level_caps?.[guild.level] || { max_officers: 2 };
//             const currentOfficersCount = guild.members.filter(m => m.rank === 'officer').length;
//             if (currentOfficersCount >= lvlCapNode.max_officers) {
//                 return { error: true, message: `Достигнут лимит офицеров для ${guild.level} уровня клана` };
//             }
//         }
//
//         target.rank = newRank;
//         await redisClient.set(`guild:${serverId}:${leader.guild_id}`, JSON.stringify(guild));
//         // Вставь эту команду перед return в методы handleGuildRequest, changeMemberRank и submitGuildTribute:
//         await global.pool.query(
//             `UPDATE guilds SET level = $1, exp = $2, members_count = $3, raw_data = $4 WHERE id = $5;`,
//             [guild.level, guild.exp, guild.members.length, JSON.stringify(guild), manager.guild_id || leader.guild_id || guild.id]
//         );
//
//         return { success: true, members: guild.members };
//     } catch (e) { return { error: true, message: e.message }; }
// };
//
// // --- 7. ЕЖЕДНЕВНЫЕ КЛАНОВЫЕ ВНОСЫ (TRIBUTES) ---
// exports.submitGuildTribute = async function(userId, serverId, gameId, tributeId) {
//     const GameConfig = gamesConfigDB[gameId];
//     const gConfig = GameConfig?.social?.guild_system;
//     const tribute = gConfig?.donation_modes?.[tributeId];
//     if (!tribute) return { error: true, message: "Тип вноса не найден в конфиге" };
//
//     const costResource = tribute.cost?.resource || "gold";
//     const costAmount = tribute.cost?.amount || 10000;
//     const rewardExp = tribute.rewards?.guild_exp || 100;
//     const rewardCoin = tribute.rewards?.guild_coin || 50;
//
//     if (redisClient.isOpen && redisClient.isReady) {
//         try {
//             let player = await Cache.getPlayer(userId, serverId);
//             if (!player) throw new Error("Профиль не найден в Redis");
//
//             const guildId = player.guild_id;
//             if (!guildId) return { error: true, message: "Вы не состоите в клане" };
//
//             const nowStr = new Date().toISOString().split('T')[0];
//             const donHistoryKey = `g_don:${serverId}:${gameId}:${userId}:${nowStr}`;
//             const alreadyDonated = await redisClient.get(donHistoryKey);
//             if (alreadyDonated) return { error: true, message: "Вы уже делали клановый внос сегодня" };
//
//             if ((parseInt(player.resources?.[costResource]) || 0) < costAmount) {
//                 return { error: true, message: "Недостаточно ресурсов для вноса" };
//             }
//
//             const gCached = await redisClient.get(`guild:${serverId}:${guildId}`);
//             if (!gCached) return { error: true, message: "Клан не найден в кэше" };
//             let guild = JSON.parse(gCached);
//
//             // Фиксируем суточный лимит вноса со сбросом ровно в 00:00 сервера
//             await redisClient.setEx(donHistoryKey, getSecondsUntilMidnight(), "1");
//
//             // Списываем цену, начисляем валюту клан-шопа игроку в JS-сессию
//             player.resources[costResource] -= costAmount;
//             const shopCurrencyKey = gConfig.shop?.currency_resource_id || "guild_coin";
//             player.resources[shopCurrencyKey] = (parseInt(player.resources[shopCurrencyKey]) || 0) + rewardCoin;
//
//             // Прокачиваем опыт клана
//             guild.exp += rewardExp;
//             const maxGLevel = gConfig.max_guild_level || 10;
//             if (guild.exp >= guild.level * 1000 && guild.level < maxGLevel) {
//                 guild.level += 1;
//             }
//
//             await redisClient.set(`guild:${serverId}:${guildId}`, JSON.stringify(guild));
//             await Cache.setPlayer(player);
//
//             // Вставь эту команду перед return в методы handleGuildRequest, changeMemberRank и submitGuildTribute:
//             await global.pool.query(
//                 `UPDATE guilds SET level = $1, exp = $2, members_count = $3, raw_data = $4 WHERE id = $5;`,
//                 [guild.level, guild.exp, guild.members.length, JSON.stringify(guild), manager.guild_id || leader.guild_id || guild.id]
//             );
//
//             return { success: true, guild_level: guild.level, game_data: buildReturnedGameData(player), resources: player.resources };
//         } catch (cacheErr) { console.warn(cacheErr); }
//     }
//     return { error: true, message: "Клан-кэш недоступен" };
// };
//
//
//
//
//
//
// // --- 8. ВЫХОД ИЗ КЛАНА (LEAVE) ---
// exports.leaveGuild = async function(userId, serverId) {
//     if (redisClient.isOpen && redisClient.isReady) {
//         try {
//             let player = await Cache.getPlayer(userId, serverId);
//             if (!player || !player.guild_id) return { error: true, message: "Вы не состоите в клане" };
//
//             const guildId = player.guild_id;
//             const gCached = await redisClient.get(`guild:${serverId}:${guildId}`);
//             if (!gCached) return { error: true, message: "Клан не найден" };
//             let guild = JSON.parse(gCached);
//
//             const me = guild.members.find(m => m.id === userId);
//             if (!me) return { error: true, message: "Вы не найдены в ростере клана" };
//
//             // Жесткий блок из твоей задумки: Лидер не может просто выйти
//             if (me.rank === 'leader') {
//                 return { error: true, message: "Лидер не может покинуть клан. Передайте полномочия или распустите клан" };
//             }
//
//             // Удаляем игрока из ростера клана
//             guild.members = guild.members.filter(m => m.id !== userId);
//
//             // Сбрасываем флаг клана у игрока в RAM
//             player.guild_id = null;
//             await Cache.setPlayer(player);
//
//             // Сохраняем обновленный клан в Redis и дублируем в Postgres
//             await redisClient.set(`guild:${serverId}:${guildId}`, JSON.stringify(guild));
//             await global.pool.query(
//                 `UPDATE guilds SET members_count = $1, raw_data = $2 WHERE id = $3;`,
//                 [guild.members.length, JSON.stringify(guild), guildId]
//             );
//
//             return { success: true, game_data: buildReturnedGameData(player) };
//         } catch (e) { console.warn(e); return { error: true, message: e.message }; }
//     }
//     return { error: true, message: "Redis layer offline" };
// };
//
// // --- 9. ИСКЛЮЧЕНИЕ ИЗ КЛАНА (KICK) ---
// exports.kickFromGuild = async function(userId, serverId, targetMemberId) {
//     if (userId === targetMemberId) return { error: true, message: "Нельзя выгнать самого себя" };
//
//     try {
//         let manager = await Cache.getPlayer(userId, serverId);
//         if (!manager || !manager.guild_id) return { error: true, message: "Вы не состоите в клане" };
//
//         const guildId = manager.guild_id;
//         const gCached = await redisClient.get(`guild:${serverId}:${guildId}`);
//         if (!gCached) return { error: true, message: "Клан не найден" };
//         let guild = JSON.parse(gCached);
//
//         const me = guild.members.find(m => m.id === userId);
//         const target = guild.members.find(m => m.id === targetMemberId);
//
//         if (!me || !target) return { error: true, message: "Игрок не найден" };
//
//         // Офицер может кикать только рядовых. Лидер может кикать всех.
//         if (me.rank === 'officer' && target.rank !== 'member') {
//             return { error: true, message: "Недостаточно прав для исключения этого игрока" };
//         }
//         if (me.rank !== 'leader' && me.rank !== 'officer') {
//             return { error: true, message: "Доступ запрещен" };
//         }
//
//         // Удаляем из ростера клана
//         guild.members = guild.members.filter(m => m.id !== targetMemberId);
//         await redisClient.set(`guild:${serverId}:${guildId}`, JSON.stringify(guild));
//         await global.pool.query(`UPDATE guilds SET members_count = $1, raw_data = $2 WHERE id = $3;`, [guild.members.length, JSON.stringify(guild), guildId]);
//
//         // Обрабатываем исключаемого игрока
//         let targetObj = await Cache.getPlayer(targetMemberId, serverId);
//         if (targetObj) {
//             // Если он онлайн — мгновенно чистим RAM сессию
//             targetObj.guild_id = null;
//             await Cache.setPlayer(targetMemberId, serverId, targetObj);
//         } else {
//             // Если он оффлайн — БЕЗОПАСНО точечно зануляем guild_id в Postgres через jsonb_set
//             const updateSql = `UPDATE player_server_profiles SET game_data = jsonb_set(game_data, '{guild_id}', 'null'::jsonb) WHERE id = $1 AND server_id = $2;`;
//             await global.pool.query(updateSql, [targetMemberId, serverId]);
//         }
//
//         return { success: true, members: guild.members };
//     } catch (e) { return { error: true, message: e.message }; }
// };
//
// // --- 10. РОСПУСК КЛАНА (DISBAND) ---
// exports.disbandGuild = async function(userId, serverId) {
//     try {
//         let leader = await Cache.getPlayer(userId, serverId);
//         if (!leader || !leader.guild_id) return { error: true, message: "Вы не состоите в клане" };
//
//         const guildId = leader.guild_id;
//         const gCached = await redisClient.get(`guild:${serverId}:${guildId}`);
//         if (!gCached) return { error: true, message: "Клан не найден" };
//         const guild = JSON.parse(gCached);
//
//         const me = guild.members.find(m => m.id === userId);
//         if (!me || me.rank !== 'leader') return { error: true, message: "Только лидер может распустить клан" };
//
//         // Собираем ID всех участников клана для очистки
//         const memberIds = guild.members.map(m => m.id);
//
//         // 1. Стираем сам клан отовсюду
//         await redisClient.del(`guild:${serverId}:${guildId}`);
//         await global.pool.query(`DELETE FROM guilds WHERE id = $1;`, [guildId]);
//
//         // 2. Очищаем флаг клана у всех участников
//         for (let mId of memberIds) {
//             let memberObj = await Cache.getPlayer(mId, serverId);
//             if (memberObj) {
//                 memberObj.guild_id = null;
//                 await Cache.setPlayer(mId, serverId, memberObj);
//             }
//         }
//
//         // 3. Пакетно обнуляем guild_id в Postgres для всех оффлайн-членов (безопасный jsonb_set)
//         const purgeSql = `UPDATE player_server_profiles SET game_data = jsonb_set(game_data, '{guild_id}', 'null'::jsonb) WHERE id = ANY($1) AND server_id = $2;`;
//         await global.pool.query(purgeSql, [memberIds, serverId]);
//
//         return { success: true, disbanded: true };
//     } catch (e) { return { error: true, message: e.message }; }
// };
//
//
//

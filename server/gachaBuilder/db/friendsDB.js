const {gamesConfigDB} = require('./configDB');
const { redisClient } = require('../../redisClient');
const Cache = require('./cacheManager');

function getSecondsUntilMidnight() {
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0);
    return Math.max(60, Math.floor((midnight.getTime() - now.getTime()) / 1000));
}

// Вспомогательный сборщик ответа game_data под фронтенд
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

// --- 1. ОПТИМИЗИРОВАННЫЙ ДЕТАЛЬНЫЙ СПИСОК ДРУЗЕЙ И ИСТОРИЯ СЕРДЕЧЕК ---
// --- 1. КРАСИВЫЙ И ОПТИМИЗИРОВАННЫЙ СПИСОК ДРУЗЕЙ ---
exports.getFriendsDetailedList = async function(userId, serverId, gameId) {
    if (redisClient.isOpen && redisClient.isReady) {
        try {
            let player = await Cache.getPlayer(userId, serverId);
            if (!player) throw new Error("Профиль не найден в Redis");

            const friendUids = player.friend_uids || [];
            if (friendUids.length === 0) return { friends: [] }; // Больше никакой sent_hearts не возвращаем

            const selectQuery = `
                SELECT id, nickname, level, combat_power, idle_timestamps, (game_data->>'avatar_icon') AS avatar_icon 
                FROM player_server_profiles 
                WHERE id = ANY($1) AND server_id = $2;
            `;
            const { rows } = await global.pool.query(selectQuery, [friendUids, serverId]);

            const detailedList = [];
            const nowStr = new Date().toISOString().split('T')[0]; // Исправлено: строго строка даты
            const onlineSetKey = `online_players:${serverId}`;

            for (let row of rows) {
                const isOnline = await redisClient.sIsMember(onlineSetKey, String(row.id));

                // Проверяем отправку сердца в Redis
                const sentHistoryKey = `f_sent:${serverId}:${gameId}:${userId}:${row.id}:${nowStr}`;
                const alreadySent = await redisClient.get(sentHistoryKey);

                const idles = row.idle_timestamps || {};
                detailedList.push({
                    id: row.id,
                    nickname: row.nickname,
                    level: row.level,
                    combatPower: row.combat_power,
                    avatar_icon: row.avatar_icon || '',
                    isOnline: isOnline,
                    lastSeen: isOnline ? Date.now() : (Number(idles.last_seen) || 0),
                    isHeartSent: !!alreadySent // ИСПРАВЛЕНИЕ: Прямой флаг! true, если уже отправлено, иначе false
                });
            }
            return { friends: detailedList };
        } catch (cacheErr) { console.warn(cacheErr); }
    }
    return { error: true, message: "Cache subsystem failure" };
};


// --- 2. СПИСОК ВХОДЯЩИХ ЗАЯВОК В ДРУЗЬЯ ---
exports.getInboundRequests = async function(userId, serverId) {
    try {
        const reqKey = `f_req:inbound:${serverId}:${userId}`;
        const uids = await redisClient.sMembers(reqKey);

        if (!uids || uids.length === 0) return { friend_requests: [] };

        // ИСПРАВЛЕНИЕ: Принудительно конвертируем массив строк из Redis в массив чисел для Postgres
        // const numericIds = uids.map(id => Number(id)).filter(id => !isNaN(id));
        const numericIds = uids;

        if (numericIds.length === 0) return { friend_requests: [] };

        const selectQuery = `
            SELECT id, nickname, level, combat_power, (game_data->>'avatar_icon') AS avatar_icon 
            FROM player_server_profiles 
            WHERE id = ANY($1) AND server_id = $2;
        `;
        const { rows } = await global.pool.query(selectQuery, [numericIds, serverId]);
        return { friend_requests: rows };
    } catch (e) {
        console.error("[FriendsDB:getInboundRequests] Error:", e.message);
        return { error: true, message: e.message };
    }
};

// --- 3. ОТПРАВКА ЗАЯВКИ В ДРУЗЬЯ (РЕАЛИЗАЦИЯ В КЭШЕ) ---
exports.sendFriendRequest = async function(userId, serverId, gameId, targetFriendId) {
    if (Number(userId) === Number(targetFriendId)) return { error: true, message: "Нельзя добавить самого себя" };

    if (redisClient.isOpen && redisClient.isReady) {
        try {
            let player = await Cache.getPlayer(userId, serverId);
            if (!player) throw new Error("Профиль не найден");

            const friendUids = player.friend_uids || [];
            // Приводим к Number для надежности сравнения
            if (friendUids.map(id => Number(id)).includes(Number(targetFriendId))) {
                return { error: true, message: "Уже в друзьях" };
            }

            const inboundKey = `f_req:inbound:${serverId}:${targetFriendId}`;
            const outboundKey = `f_req:outbound:${serverId}:${userId}`;

            // sAdd возвращает количество ДЕЙСТВИТЕЛЬНО добавленных новых элементов
            const addedInbound = await redisClient.sAdd(inboundKey, String(userId));
            const addedOutbound = await redisClient.sAdd(outboundKey, String(targetFriendId));

            // Ставим TTL (3 дня) только если ключ создался впервые или обновился
            if (addedInbound > 0) await redisClient.expire(inboundKey, 259200);
            if (addedOutbound > 0) await redisClient.expire(outboundKey, 259200);

            // return { success: true, message: "Request successfully sent" };
            return exports.getAddRecommendations(userId, serverId, gameId);
        } catch (e) {
            console.error("[FriendsDB:sendFriendRequest] Error:", e.message);
            return { error: true, message: e.message };
        }
    }
    return { error: true, message: "Redis subsystem failure" };
};

// --- 4. ПРИНЯТИЕ ЗАЯВКИ В ДРУЗЬЯ (ДВУСТОРОННИЙ МЭТЧ) ---
exports.acceptFriendRequest = async function(userId, serverId, gameId, friendId) {
    const GameConfig = gamesConfigDB[gameId];
    const maxFriendsLimit = GameConfig?.social?.friend_system?.max_friends_limit || 50;

    if (redisClient.isOpen && redisClient.isReady) {
        try {
            let player = await Cache.getPlayer(userId, serverId);
            let friendObj = await Cache.getPlayer(friendId, serverId);
            if (!player) throw new Error("Профиль не найден в Redis");

            if (!player.friend_uids) player.friend_uids = [];
            if (player.friend_uids.length >= maxFriendsLimit) return { error: true, message: "Список друзей заполнен" };
            if (player.friend_uids.includes(friendId)) return { error: true, message: "Уже в друзьях" };

            // Чистим ключи заявок из Redis Sets
            await redisClient.sRem(`f_req:inbound:${serverId}:${userId}`, String(friendId));
            await redisClient.sRem(`f_req:outbound:${serverId}:${friendId}`, String(userId));

            // Добавляем ID в RAM сессии обоих игроков
            player.friend_uids.push(friendId);
            await Cache.setPlayer(player);

            if (friendObj) {
                if (!friendObj.friend_uids) friendObj.friend_uids = [];
                if (!friendObj.friend_uids.includes(userId)) friendObj.friend_uids.push(userId);
                await Cache.setPlayer(friendId, serverId, friendObj);
            }

            // Накатываем ленивые апдейты в СУБД для надежности
            const updateSql = `UPDATE player_server_profiles SET game_data = jsonb_set(game_data, '{friend_uids}', (COALESCE(game_data->'friend_uids', '[]'::jsonb) || $1::jsonb)) WHERE id = $2 AND server_id = $3;`;
            await global.pool.query(updateSql, [JSON.stringify([friendId]), userId, serverId]);
            await global.pool.query(updateSql, [JSON.stringify([userId]), friendId, serverId]);

            // return { success: true, friend_uids: player.friend_uids };
            return exports.getInboundRequests(userId, serverId);
        } catch (cacheErr) { console.warn(cacheErr); }
    }
    return { error: true, message: "Redis layer error" };
};

// --- 10. ОТКЛОНЕНИЕ ЗАЯВКИ В ДРУЗЬЯ (ТОЛЬКО REDIS) ---
exports.declineFriendRequest = async function(userId, serverId, friendId) {
    if (redisClient.isOpen && redisClient.isReady) {
        try {
            // Удаляем у себя из входящих, у отправителя — из исходящих
            await redisClient.sRem(`f_req:inbound:${serverId}:${userId}`, String(friendId));
            await redisClient.sRem(`f_req:outbound:${serverId}:${friendId}`, String(userId));

            return exports.getInboundRequests(userId, serverId);
        } catch (e) {
            console.error("[FriendsDB:declineFriendRequest] Error:", e.message);
            return { error: true, message: e.message };
        }
    }
    return { error: true, message: "Redis subsystem offline" };
};

// --- 5. УДАЛЕНИЕ ИЗ ДРУЗЕЙ ---
exports.removeFriend = async function(userId, serverId, gameId, friendId) {
    if (redisClient.isOpen && redisClient.isReady) {
        try {
            let player = await Cache.getPlayer(userId, serverId);
            if (!player) throw new Error("Профиль не найден в Redis");

            if (player.friend_uids) player.friend_uids = player.friend_uids.filter(id => id !== friendId);
            await Cache.setPlayer(player);

            let friendObj = await Cache.getPlayer(friendId, serverId);
            if (friendObj && friendObj.friend_uids) {
                friendObj.friend_uids = friendObj.friend_uids.filter(id => id !== userId);
                await Cache.setPlayer(friendId, serverId, friendObj);
            }

            const targetSql = `UPDATE player_server_profiles SET game_data = jsonb_set(game_data, '{friend_uids}', COALESCE((SELECT jsonb_agg(elem) FROM jsonb_array_elements(game_data->'friend_uids') elem WHERE elem->>0 != $1), '[]'::jsonb)) WHERE id = $2 AND server_id = $3;`;
            await global.pool.query(targetSql, [userId, friendId, serverId]);
            await global.pool.query(targetSql, [friendId, userId, serverId]);

            // return { success: true, friend_uids: player.friend_uids };
            return exports.getFriendsDetailedList(userId, serverId, gameId);
        } catch (cacheErr) { console.warn(cacheErr); }
    }
    return { error: true, message: "Redis subsystem offline" };
};

// --- 6. БЛОКИРОВКА ПОЛЬЗОВАТЕЛЯ ---
exports.blockUser = async function(userId, serverId, gameId, targetId) {
    if (redisClient.isOpen && redisClient.isReady) {
        try {
            let player = await Cache.getPlayer(userId, serverId);
            if (!player) throw new Error("Профиль не найден в Redis");

            if (player.friend_uids) player.friend_uids = player.friend_uids.filter(id => id !== targetId);
            if (!player.blocked_uids) player.blocked_uids = [];
            if (!player.blocked_uids.includes(targetId)) player.blocked_uids.push(targetId);

            await Cache.setPlayer(player);

            const purgeTargetSql = `UPDATE player_server_profiles SET game_data = jsonb_set(game_data, '{friend_uids}', COALESCE((SELECT jsonb_agg(elem) FROM jsonb_array_elements(game_data->'friend_uids') elem WHERE elem->>0 != $1), '[]'::jsonb)) WHERE id = $2 AND server_id = $3;`;
            await global.pool.query(purgeTargetSql, [userId, targetId, serverId]);

            return { success: true, friend_uids: player.friend_uids, blocked_uids: player.blocked_uids };
        } catch (cacheErr) { console.warn(cacheErr); }
    }
    return { error: true, message: "Redis layer failure" };
};

// --- 7. СПИСОК РЕКОМЕНДАЦИЙ (С ИСКЛЮЧЕНИЕМ УЖЕ ОТПРАВЛЕННЫХ ЗАЯВОК) ---
// --- 7. СПИСОК РЕКОМЕНДАЦИЙ (ИСПРАВЛЕННЫЙ ПОД UUID СТРОКИ) ---
exports.getAddRecommendations = async function(userId, serverId, gameId) {
    // Работаем строго со СТРОКАМИ (UUID)
    let excludedSet = new Set([String(userId)]);
    let playerLevel = 1;

    if (redisClient.isOpen && redisClient.isReady) {
        try {
            const player = await Cache.getPlayer(userId, serverId);
            if (player) {
                if (player.friend_uids) player.friend_uids.forEach(id => excludedSet.add(String(id)));
                if (player.blocked_uids) player.blocked_uids.forEach(id => excludedSet.add(String(id)));
                playerLevel = player.level || 1;
            }

            // Вытаскиваем исходящие заявки
            const outboundKey = `f_req:outbound:${serverId}:${userId}`;
            const outboundUids = await redisClient.sMembers(outboundKey);
            if (outboundUids) {
                outboundUids.forEach(id => excludedSet.add(String(id)));
            }

            // Вытаскиваем входящие заявки
            const inboundKey = `f_req:inbound:${serverId}:${userId}`;
            const inboundUids = await redisClient.sMembers(inboundKey);
            if (inboundUids) {
                inboundUids.forEach(id => excludedSet.add(String(id)));
            }
        } catch (e) { console.warn('[Recommendations Cache Error]:', e); }
    }

    try {
        // УБРАЛИ фильтрацию по !isNaN, оставляем чистые строки-UUID
        const excludedArray = Array.from(excludedSet);

        const selectQuery = `
            SELECT id, nickname, level, combat_power, (game_data->>'avatar_icon') AS avatar_icon 
            FROM player_server_profiles 
            WHERE server_id = $1 
              AND NOT (id = ANY($2))
              AND level BETWEEN $3 AND $4
            LIMIT 5;
        `;

        const minLvl = Math.max(1, playerLevel - 10);
        const maxLvl = playerLevel + 10;

        const { rows } = await global.pool.query(selectQuery, [serverId, excludedArray, minLvl, maxLvl]);

        return { friend_recommendations: rows };
    } catch (e) {
        return { error: true, message: e.message };
    }
};



// --- 8. ОПТИМИЗИРОВАННЫЙ СПИСОК ЗАБЛОКИРОВАННЫХ ИЗ REDIS КЭША ---
exports.getBlockedUsersList = async function(userId, serverId) {
    // ------------------------------------------------------------------------
    // ЭШЕЛОН 1: ОПЕРАЦИЯ В СВЕРХБЫСТРОМ REDIS КЭШЕ (ТВОЙ ШАБЛОН)
    // ------------------------------------------------------------------------
    if (redisClient.isOpen && redisClient.isReady) {
        try {
            let player = await Cache.getPlayer(userId, serverId);
            if (!player) throw new Error("Профиль не найден в Redis");

            const blockedUids = player.blocked_uids || [];
            if (blockedUids.length === 0) return { blacklist: [] };

            // Тянем из БД только легкие метаданные (никнеймы) для забаненных ID из кэша
            const selectBlockedSql = `
                SELECT id, nickname 
                FROM player_server_profiles 
                WHERE id = ANY($1) AND server_id = $2;
            `;
            const { rows } = await global.pool.query(selectBlockedSql, [blockedUids, serverId]);
            return { blacklist: rows };
        } catch (cacheErr) {
            console.warn('[Friends:BlockedList] Сбой Redis, падаю в Postgres Fallback:', cacheErr);
        }
    }

    try {
        const selectQuery = `SELECT game_data FROM player_server_profiles WHERE id = $1 AND server_id = $2;`;
        const { rows: pRows } = await global.pool.query(selectQuery, [userId, serverId]);
        if (pRows.length === 0) return { error: true, message: "Профиль не найден" };

        const blockedUids = pRows[0].game_data?.blocked_uids || [];
        if (blockedUids.length === 0) return { blacklist: [] };

        const { rows } = await global.pool.query(`SELECT id, nickname FROM player_server_profiles WHERE id = ANY($1) AND server_id = $2;`, [blockedUids, serverId]);
        return { blacklist: rows };
    } catch (e) {
        return { error: true, message: e.message };
    }
};

// --- 9. ОТПРАВКА СЕРДЕЧКА ДРУГУ (СБРОС В ПОЛНОЧЬ) ---
exports.sendFriendHeart = async function(userId, serverId, gameId, friendId) {
    if (redisClient.isOpen && redisClient.isReady) {
        try {
            const nowStr = new Date().toISOString().split('T')[0];
            const sentHistoryKey = `f_sent:${serverId}:${gameId}:${userId}:${friendId}:${nowStr}`;

            // Проверяем, не отправляли ли уже сегодня
            const alreadySent = await redisClient.get(sentHistoryKey);
            if (alreadySent) return { error: true, message: "Сердечко этому другу сегодня уже отправлено" };

            // Фиксируем отправку в Redis со сроком жизни до полуночи
            const ttl = getSecondsUntilMidnight();
            await redisClient.setEx(sentHistoryKey, ttl, '1');

            // ТУТ ЛОГИКА: Здесь можно начислить принимающему другу валюту/очки дружбы,
            // если у тебя это летит сразу в БД, или записать ему в «входящие сердечки»

            // return { success: true, message: "Сердечко успешно отправлено" };
            return exports.getFriendsDetailedList(userId, serverId, gameId);
        } catch (e) { return { error: true, message: e.message }; }
    }
    return { error: true, message: "Redis subsystem failure" };
};

exports.unblockUser = async function(userId, serverId, targetId) {
    if (redisClient.isOpen && redisClient.isReady) {
        try {
            let player = await Cache.getPlayer(userId, serverId);
            if (!player) throw new Error("Профиль не найден");

            if (player.blocked_uids) {
                player.blocked_uids = player.blocked_uids.filter(id => id !== targetId);
            }
            await Cache.setPlayer(player);

            // Чистим в Postgres
            const sql = `UPDATE player_server_profiles SET game_data = jsonb_set(game_data, '{blocked_uids}', COALESCE((SELECT jsonb_agg(elem) FROM jsonb_array_elements(game_data->'blocked_uids') elem WHERE elem->>0 != $1), '[]'::jsonb)) WHERE id = $2 AND server_id = $3;`;
            await global.pool.query(sql, [targetId, userId, serverId]);

            // return { success: true, blocked_uids: player.blocked_uids };
            return exports.getBlockedUsersList(userId, serverId);
        } catch (e) { return { error: true, message: e.message }; }
    }
    return { error: true, message: "Redis failure" };
};


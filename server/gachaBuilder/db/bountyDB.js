const {gamesConfigDB} = require('./configDB');
const { redisClient } = require('../../redisClient');
const Cache = require('./cacheManager');

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

// Вспомогательная функция полуночного бесплатного обновления доски
function checkAndResetBountyBoard(player, bbConfig) {
    if (!player.bounty_board_state) {
        player.bounty_board_state = { last_free_reset_day: "" };
    }

    const nowStr = new Date().toLocaleDateString('sv-SE'); // гггг-мм-дд

    // Если наступили новые сутки, принудительно обновляем доступные контракты
    if (player.bounty_board_state.last_free_reset_day !== nowStr) {
        if (!player.bounty_missions) player.bounty_missions = [];

        // Фильтруем только запущенные миссии (их удалять нельзя!)
        const runningMissions = [];
        for (const m of player.bounty_missions) {
            if (m.status === 'dispatched') {
                runningMissions.push(m);
            }
        }

        // Генерируем 5 новых бесплатных контрактов взамен старых неиспользованных
        const freshMissions = [];
        for (let i = 0; i < 5; i++) {
            const rolledTemplateId = rollRandomMissionTemplateId(bbConfig.mission_generation_rates, bbConfig.mission_pool);
            freshMissions.push({
                instance_id: `bounty_${Date.now()}_${i}_${Math.floor(Math.random() * 100)}`,
                mission_template_id: rolledTemplateId,
                status: "available",
                end_at: 0,
                assigned_heroes: []
            });
        }

        // Прямое присвоение в корень объекта player
        player.bounty_missions = [...runningMissions, ...freshMissions];
        player.bounty_board_state.last_free_reset_day = nowStr;

        return true; // Флаг, что данные изменились и их надо сохранить
    }
    return false;
}


// Вспомогательный рандомизатор миссий по весам шансов из конфига админки
function rollRandomMissionTemplateId(ratesConfig, poolConfig) {
    const r = Math.random() * 100;
    let accumulatedChance = 0;
    let rolledRarity = "R";

    // Идем по грейдам: R, SR, SSR, UR
    for (const [rarity, chance] of Object.entries(ratesConfig)) {
        accumulatedChance += chance;
        if (r <= accumulatedChance) {
            rolledRarity = rarity;
            break;
        }
    }

    // Фильтруем шаблоны пула, подходящие под выпавшую редкость
    const validIds = Object.keys(poolConfig).filter(k => poolConfig[k].rarity === rolledRarity);
    if (validIds.length === 0) return Object.keys(poolConfig)[0]; // Фолбэк на самый первый шаблон

    return validIds[Math.floor(Math.random() * validIds.length)];
}

// --- 1. СЛУЧАЙНАЯ ГЕНЕРАЦИЯ / ОБНОВЛЕНИЕ ДОСКИ МИССИЙ ЗА АЛМАЗЫ ---
// --- 1. СЛУЧАЙНАЯ ГЕНЕРАЦИЯ / ОБНОВЛЕНИЕ ДОСКИ МИССИЙ (БЕЗ УЯЗВИМОСТЕЙ СПАМА) ---
exports.refreshBountyBoard = async function(userId, serverId, gameId, isPaidReroll) {
    const GameConfig = gamesConfigDB[gameId];
    const bbConfig = GameConfig?.bounty_board;
    if (!bbConfig || !bbConfig.mission_pool || !bbConfig.mission_generation_rates) {
        return { error: true, message: "Конфигурация Экспедиций не найдена" };
    }

    const costResource = bbConfig.refresh_cost?.resource || "diamond";
    const costAmount = bbConfig.refresh_cost?.amount || 10;

    // Вспомогательный генератор пачки контрактов
    const generateContractsPack = () => {
        const pack = [];
        for (let i = 0; i < 5; i++) {
            pack.push({
                instance_id: `bounty_${Date.now()}_${i}_${Math.floor(Math.random() * 100)}`,
                mission_template_id: rollRandomMissionTemplateId(bbConfig.mission_generation_rates, bbConfig.mission_pool),
                status: "available",
                end_at: 0,
                assigned_heroes: []
            });
        }
        return pack;
    };

    if (redisClient.isOpen && redisClient.isReady) {
        try {
            let player = await Cache.getPlayer(userId, serverId);
            if (!player) throw new Error("Профиль не найден в Redis");

            if (!player.bounty_missions) player.bounty_missions = [];

            // 1. ПЕРВАЯ ПРОВЕРКА: Если это обычный ежедневный вход (бесплатный запрос)
            if (!isPaidReroll) {
                const isResetHappened = checkAndResetBountyBoard(player, bbConfig);

                if (isResetHappened) {
                    // Если день сменился, доска УЖЕ обновилась внутри checkAndResetBountyBoard
                    await Cache.setPlayer(player);
                    // Мгновенно возвращаем новые бесплатные миссии, не идя к платным проверкам ниже!
                    return { success: true, bounty_missions: player.bounty_missions, game_data: buildReturnedGameData(player), resources: player.resources };
                }

                // Если день НЕ сменился, а игрок пытается обновиться БЕСПЛАТНО еще раз — жестко бьем по рукам
                if (player.bounty_missions.length > 0) {
                    return { error: true, message: "Обновление доски контрактов требует алмазы" };
                }
            }

            // 2. ЛОГИКА ПЛАТНОГО РЕРОЛЛА (Сработает только если isPaidReroll === true)
            if (isPaidReroll) {
                if ((parseInt(player.resources?.[costResource]) || 0) < costAmount) {
                    return { error: true, message: "Недостаточно валюты для обновления доски" };
                }
                player.resources[costResource] -= costAmount;
            }

            // Фильтруем только запущенные экспедиции (их стирать нельзя)
            const runningMissions = [];
            for (const m of player.bounty_missions) {
                if (m.status === 'dispatched') runningMissions.push(m);
            }

            // Принудительный платный реролл: заменяем доступные миссии на новые
            player.bounty_missions = [...runningMissions, ...generateContractsPack()];

            await Cache.setPlayer(player);

            return { success: true, bounty_missions: player.bounty_missions, game_data: buildReturnedGameData(player), resources: player.resources };
        } catch (cacheErr) {
            console.warn('[Bounty:Refresh] Сбой Redis, ухожу в Postgres:', cacheErr);
        }
    }


    // ЭШЕЛОН 2: POSTGRESQL FALLBACK
    const client = await global.pool.connect();
    try {
        await client.query('BEGIN');
        const { rows } = await client.query(`SELECT game_data FROM player_server_profiles WHERE id = $1 AND server_id = $2 FOR UPDATE;`, [userId, serverId]);
        if (rows.length === 0) throw new Error("Профиль не найден");

        let gameData = rows[0].game_data || {};
        if (!gameData.bounty_missions) gameData.bounty_missions = [];

        if (!isPaidReroll && gameData.bounty_missions.length > 0) {
            await client.query('ROLLBACK');
            return { error: true, message: "Обновление доски контрактов требует алмазы" };
        }

        if (isPaidReroll) {
            if ((parseInt(gameData.resources?.[costResource]) || 0) < costAmount) {
                await client.query('ROLLBACK');
                return { error: true, message: "Недостаточно валюты" };
            }
            gameData.resources[costResource] -= costAmount;
        }

        const runningMissions = [];
        for (const m of gameData.bounty_missions) {
            if (m.status === 'dispatched') runningMissions.push(m);
        }

        gameData.bounty_missions = [...runningMissions, ...generateContractsPack()];

        // Исправлено: Пишем консистентный gameData, ресурсы внутри него обновлены синхронно
        await client.query(`UPDATE player_server_profiles SET game_data = $3 WHERE id = $1 AND server_id = $2;`, [userId, serverId, JSON.stringify(gameData)]);
        await client.query('COMMIT');

        return { success: true, bounty_missions: gameData.bounty_missions, game_data: buildReturnedGameData(gameData), resources: gameData.resources };
    } catch (e) { await client.query('ROLLBACK'); return { error: true, message: e.message }; } finally { client.release(); }
};


// --- 2. ОТПРАВКА ГЕРОЕВ НА КОНТРАКТ ---
// --- 2. ОТПРАВКА ГЕРОЕВ НА КОНТРАКТ (ДВА ЭШЕЛОНА С ПОЛНОЙ ВАЛИДАЦИЕЙ) ---
exports.dispatchHeroesToExpedition = async function(userId, serverId, gameId, instanceId, heroIdsArray) {
    const GameConfig = gamesConfigDB[gameId];
    const bbConfig = GameConfig?.bounty_board;
    if (!bbConfig || !bbConfig.mission_pool) return { error: true, message: "Конфиг не найден" };

    // Единый метод валидации и сборки стейта (общий для Редиса и Базы)
    const runDispatchLogic = (playerData) => {
        if (!playerData.bounty_missions) playerData.bounty_missions = [];

        // Ищем нужный контракт на доске
        const mission = playerData.bounty_missions.find(m => m.instance_id === instanceId);
        if (!mission) return { error: true, message: "Контракт не найден" };
        if (mission.status !== 'available') return { error: true, message: "Экспедиция уже запущена или завершена" };

        const meta = bbConfig.mission_pool[mission.mission_template_id];
        if (!meta) return { error: true, message: "Шаблон контракта отсутствует" };

        const req = meta.requirements || {};

        // 1. Валидация количества слотов
        if (heroIdsArray.length !== (req.slots_count || 1)) {
            return { error: true, message: `Необходимо отправить ровно ${req.slots_count || 1} героев` };
        }

        // 2. Валидация занятости героев (через прямые циклы for...of)
        const busyHeroes = [];
        for (const m of playerData.bounty_missions) {
            if (m.status === 'dispatched' && m.assigned_heroes) {
                for (const hId of m.assigned_heroes) {
                    busyHeroes.push(hId);
                }
            }
        }

        for (const id of heroIdsArray) {
            if (busyHeroes.includes(id)) {
                return { error: true, message: "Один или несколько выбранных героев уже находятся в экспедиции" };
            }
        }

        // 3. Валидация статов, стихий и классов персонажей
        let matchClass = !req.required_class_id;
        let matchElement = !req.required_element_id;

        for (const hId of heroIdsArray) {
            const pHero = playerData.heroes?.find(h => h.instance_id === hId || h.id === hId);
            if (!pHero) return { error: true, message: "Один из героев не найден на аккаунте" };

            if (pHero.level < (req.min_hero_level || 1)) {
                return { error: true, message: `Минимальный уровень героя для этой миссии: ${req.min_hero_level}` };
            }

            const heroMeta = GameConfig.catalog?.heroes?.[pHero.hero_id || pHero.id];
            if (heroMeta) {
                if (req.required_class_id && heroMeta.class_id === req.required_class_id) matchClass = true;
                if (req.required_element_id && heroMeta.element_id === req.required_element_id) matchElement = true;
            }
        }

        if (!matchClass) return { error: true, message: `В отряде должен быть минимум один герой класса ${req.required_class_id}` };
        if (!matchElement) return { error: true, message: `В отряде должен быть минимум один герой стихии ${req.required_element_id}` };

        // Пишем изменения в контракт
        mission.status = "dispatched";
        mission.end_at = Date.now() + (meta.duration_ms || 14400000);
        mission.assigned_heroes = [...heroIdsArray];

        return { valid: true };
    };

    if (redisClient.isOpen && redisClient.isReady) {
        try {
            let player = await Cache.getPlayer(userId, serverId);
            if (!player) throw new Error("Профиль не найден в Redis");

            const res = runDispatchLogic(player);
            if (res.error) return res;

            await Cache.setPlayer(player);
            return { success: true, bounty_missions: player.bounty_missions, game_data: buildReturnedGameData(player) };
        } catch (cacheErr) {
            console.warn('[Bounty:Dispatch] Сбой Redis, ухожу в Postgres:', cacheErr);
        }
    }

    // ЭШЕЛОН 2: POSTGRESQL FALLBACK
    const client = await global.pool.connect();
    try {
        await client.query('BEGIN');
        const { rows } = await client.query(`SELECT game_data FROM player_server_profiles WHERE id = $1 AND server_id = $2 FOR UPDATE;`, [userId, serverId]);
        if (rows.length === 0) throw new Error("Профиль не найден");

        let gameData = rows[0].game_data || {};
        const res = runDispatchLogic(gameData);
        if (res.error) { await client.query('ROLLBACK'); return res; }

        await client.query(`UPDATE player_server_profiles SET game_data = $3 WHERE id = $1 AND server_id = $2;`, [userId, serverId, JSON.stringify(gameData)]);
        await client.query('COMMIT');

        return { success: true, bounty_missions: gameData.bounty_missions, game_data: buildReturnedGameData(gameData) };
    } catch (e) { await client.query('ROLLBACK'); return { error: true, message: e.message }; } finally { client.release(); }
};

// --- 3. СБОР НАГРАД ЗАВЕРШЕННОЙ ЭКСПЕДИЦИИ ---
// --- 3. СБОР НАГРАД ЗАВЕРШЕННОЙ ЭКСПЕДИЦИИ (ПРЯМАЯ ОЧИСТКА И ФОЛЛБЭК) ---
exports.claimBountyReward = async function(userId, serverId, gameId, instanceId) {
    const GameConfig = gamesConfigDB[gameId];
    const bbConfig = GameConfig?.bounty_board;
    if (!bbConfig || !bbConfig.mission_pool) return { error: true, message: "Конфиг отсутствует" };

    const applyClaimLogic = (playerData) => {
        if (!playerData.bounty_missions) playerData.bounty_missions = [];

        const missionIdx = playerData.bounty_missions.findIndex(m => m.instance_id === instanceId);
        if (missionIdx === -1) return { error: true, message: "Контракт не найден" };

        const mission = playerData.bounty_missions[missionIdx];
        if (mission.status !== 'dispatched') return { error: true, message: "Миссия не находится на этапе выполнения" };
        if (Date.now() < mission.end_at) return { error: true, message: "Экспедиция еще не завершилась" };

        const meta = bbConfig.mission_pool[mission.mission_template_id];
        if (!meta) return { error: true, message: "Шаблон наград отсутствует" };

        // Начисляем ресурсы прямо в корень объекта playerData
        if (meta.rewards?.resources) {
            if (!playerData.resources) playerData.resources = {};
            for (const [resKey, resVal] of Object.entries(meta.rewards.resources)) {
                playerData.resources[resKey] = (parseInt(playerData.resources[resKey]) || 0) + resVal;
            }
        }

        // Начисляем предметы прямо в корень объекта playerData
        if (meta.rewards?.items) {
            if (!playerData.inventory) playerData.inventory = {};
            for (const item of meta.rewards.items) {
                playerData.inventory[item.itemId] = (parseInt(playerData.inventory[item.itemId]) || 0) + item.amount;
            }
        }

        // Прямое и безопасное удаление элемента из массива
        playerData.bounty_missions.splice(missionIdx, 1);
        return { valid: true };
    };

    if (redisClient.isOpen && redisClient.isReady) {
        try {
            let player = await Cache.getPlayer(userId, serverId);
            if (!player) throw new Error("Профиль не найден в Redis");

            const res = applyClaimLogic(player);
            if (res.error) return res;

            await Cache.setPlayer(player);
            return { success: true, bounty_missions: player.bounty_missions, game_data: buildReturnedGameData(player), resources: player.resources };
        } catch (cacheErr) {
            console.warn('[Bounty:Claim] Сбой Redis, ухожу в Postgres:', cacheErr);
        }
    }

    // ЭШЕЛОН 2: POSTGRESQL FALLBACK
    const client = await global.pool.connect();
    try {
        await client.query('BEGIN');
        const { rows } = await client.query(`SELECT game_data FROM player_server_profiles WHERE id = $1 AND server_id = $2 FOR UPDATE;`, [userId, serverId]);
        if (rows.length === 0) throw new Error("Профиль не найден");

        let gameData = rows.game_data || {};
        const res = applyClaimLogic(gameData);
        if (res.error) { await client.query('ROLLBACK'); return res; }

        await client.query(`UPDATE player_server_profiles SET game_data = $3 WHERE id = $1 AND server_id = $2;`, [userId, serverId, JSON.stringify(gameData)]);
        await client.query('COMMIT');

        return { success: true, bounty_missions: gameData.bounty_missions, game_data: buildReturnedGameData(gameData), resources: gameData.resources };
    } catch (e) { await client.query('ROLLBACK'); return { error: true, message: e.message }; } finally { client.release(); }
};

// --- 4. МГНОВЕННОЕ ЗАВЕРШЕНИЕ ЭКСПЕДИЦИИ ЗА АЛМАЗЫ (SPEED-UP) ---
exports.speedUpBountyMission = async function(userId, serverId, gameId, instanceId) {
    const GameConfig = gamesConfigDB[gameId];
    if (!GameConfig?.bounty_board) return { error: true, message: "Конфиг отсутствует" };

    const costResource = "diamond";
    const now = Date.now();

    const applySpeedUpLogic = (playerData) => {
        if (!playerData.bounty_missions) playerData.bounty_missions = [];

        const mission = playerData.bounty_missions.find(m => m.instance_id === instanceId);
        if (!mission) return { error: true, message: "Контракт не найден" };
        if (mission.status !== 'dispatched') return { error: true, message: "Миссия не находится в процессе выполнения" };

        const msLeft = mission.end_at - now;
        if (msLeft <= 0) return { error: true, message: "Миссия уже завершена, просто заберите награду" };

        // Расчёт стоимости: 1 алмаз за каждые 10 минут (600 000 мс) оставшегося времени, минимум 5 алмазов
        const minutesLeft = Math.ceil(msLeft / 600000);
        const totalCost = Math.max(5, minutesLeft);

        // Проверяем баланс алмазов
        if ((parseInt(playerData.resources?.[costResource]) || 0) < totalCost) {
            return { error: true, message: `Недостаточно алмазов. Требуется: ${totalCost}` };
        }

        // Списываем алмазы напрямую из корня
        playerData.resources[costResource] -= totalCost;

        // Мгновенно переводим таймер в прошлое, завершая миссию
        mission.end_at = now - 1000;

        return { valid: true, cost: totalCost };
    };

    if (redisClient.isOpen && redisClient.isReady) {
        try {
            let player = await Cache.getPlayer(userId, serverId);
            if (!player) throw new Error("Профиль не найден в Redis");

            const res = applySpeedUpLogic(player);
            if (res.error) return res;

            await Cache.setPlayer(player);
            return { success: true, bounty_missions: player.bounty_missions, game_data: buildReturnedGameData(player), resources: player.resources };
        } catch (cacheErr) {
            console.warn('[Bounty:SpeedUp] Сбой Redis, ухожу в Postgres:', cacheErr);
        }
    }

    // ЭШЕЛОН 2: POSTGRESQL FALLBACK
    const client = await global.pool.connect();
    try {
        await client.query('BEGIN');
        const { rows } = await client.query(`SELECT game_data FROM player_server_profiles WHERE id = $1 AND server_id = $2 FOR UPDATE;`, [userId, serverId]);
        if (rows.length === 0) throw new Error("Профиль не найден");

        let gameData = rows[0].game_data || {};
        const res = applySpeedUpLogic(gameData);
        if (res.error) { await client.query('ROLLBACK'); return res; }

        await client.query(`UPDATE player_server_profiles SET game_data = $3 WHERE id = $1 AND server_id = $2;`, [userId, serverId, JSON.stringify(gameData)]);
        await client.query('COMMIT');

        return { success: true, bounty_missions: gameData.bounty_missions, game_data: buildReturnedGameData(gameData), resources: gameData.resources };
    } catch (e) { await client.query('ROLLBACK'); return { error: true, message: e.message }; } finally { client.release(); }
};


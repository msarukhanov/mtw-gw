// backend/db/playersDB.js
const axios = require('axios');

// const isDemo = process.env.env === 'demo';
const isDemo = true;
const demoUrl = (isDemo ? 'https://mtw-gw.onrender.com' : 'http://localhost:3000') + '/api/auth';

const {pool} = global;
const {gamesConfigDB} = require('./configDB');
const { redisClient } = require('../../redisClient');
const {getCurrentIdleRate} = require('./_shared');

const Cache = require('./cacheManager');


const playersDB = {};

// backend/db/playersDB.js

async function getOrCreatePlayer(username, password, gameId, deviceId) {
    if (!playersDB[gameId]) playersDB[gameId] = {};

    try {
        if (!playersDB[gameId][deviceId]) {
            const integration = {
                url: demoUrl,
                secret: 'demo_showcase_secure_token',
                body: {
                    username,
                    password,
                    partnerId: 'demo_mtwtech',
                }
            };

            const response = await axios.post(`${integration.url}`, integration.body);

            if (!response.data || !response.data.sessionId) {
                return { error: true, message: 'Invalid session data' };
            }

            delete response.data.jackpot;
            delete response.data.config;

            playersDB[gameId][deviceId] = response.data;
        }
        return playersDB[gameId][deviceId];
    }
    catch (e) {
        console.error(e);
        return { error: true, e };
    }
}

async function logInServer(username, gameId, serverId, deviceId) {
    // 1. Сначала получаем сессию/токен из твоего внешнего API
    let apiSessionData = {};
    try {
        const apiResponse = await getOrCreatePlayer(username, '', gameId, deviceId);
        if (apiResponse && !apiResponse.error && !apiResponse.err) {
            apiSessionData = apiResponse;
        }
    } catch (authError) {
        console.error("Внешняя авторизация провалилась:", authError);
    }

    // ЗАЩИТА: Если внешнее API не вернуло id пользователя, прекращаем выполнение,
    // чтобы не слать undefined в PostgreSQL и не ронять Node.js
    if (!apiSessionData || !apiSessionData.id) {
        return {
            error: true,
            message: "Authentication failed: External API did not return a valid user ID"
        };
    }

    // 2. Генерируем дефолтные динамические данные, если игрока еще нет в БД
    const heroInstId = "h_inst_" + Math.random().toString(36).substr(2, 5);

    const defaultNickname = username || ("NeoGod_" + Math.floor(100 + Math.random() * 900));
    const defaultLevel = 10;
    const defaultCombatPower = 1500; // Пример начальной боевой силы твоих героев

    // Динамические ресурсы (берем баланс из API, если он есть)
    const defaultResources = {
        gold: apiSessionData.realBalance || 10000,
        diamond: apiSessionData.bonusBalance || 2500,
        exp: 500,
        friendship: 150
    };

    // Динамические таймстамы для айдл-механик
    const defaultIdleTimestamps = {
        main_loot_claim_at: Date.now(),
        gold_mine_claim_at: Date.now()
    };

    // Тяжелые массивы
    const defaultGameData = {
        level: 10,
        exp: 340,
        max_exp: 1000,
        vip_level: 3,
        vip_exp: 340,
        max_vip_exp: 1000,
        viewed_dialogs: [],
        "pve_main": [],
        "pve_progress": {
            "campaign": "stage_1_1",
            "towers": {
                "main_tower": 0,
                "faction_light": 0,
                "faction_thunder": 0
            }
        },
        avatar_icon: './gacha/assets/images/heroes/heroAvatars/eleniel.webp',
        active_home_hero: heroInstId,
        heroes: [
            { instance_id: heroInstId, hero_id: "eleniel", level: 120, stars: 5, exp: 0, equipped: {weapon: null} },
            { instance_id: "h_inst_" + Math.random().toString(36).substr(2, 5), hero_id: "adelina", level: 100, stars: 5, exp: 0, equipped: {weapon: null} }
        ],
        games: [
            { instance_id: "h_inst_" + Math.random().toString(36).substr(2, 5), game_id: "slots53char", level: 10, stars: 1 }
        ],
        inventory: {"scroll_epic": 5, "rusty_sword": 1},
        gacha_pity: {"banner_standard_01": { main: 0, every: {} }},
        achievements: [],
        match_history: []
    };

    // 3. Делаем атомарный UPSERT запрос в PostgreSQL
    const upsertQuery = `
        INSERT INTO player_server_profiles 
        (user_id, server_id, nickname, level, combat_power, resources, idle_timestamps, game_data)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (user_id, server_id) 
        DO UPDATE SET 
            updated_at = CURRENT_TIMESTAMP
        RETURNING *;
    `;

    // Теперь здесь гарантированно валидный id
    const values = [
        apiSessionData.id,
        serverId,
        defaultNickname,
        defaultLevel,
        defaultCombatPower,
        JSON.stringify(defaultResources),
        JSON.stringify(defaultIdleTimestamps),
        JSON.stringify(defaultGameData)
    ];

    try {
        const { rows } = await global.pool.query(upsertQuery, values);

        if (!rows || rows.length === 0) {
            return { error: true, message: "No rows returned from database upsert" };
        }

        const playerProfile = rows[0];

        // 4. Формируем финальный объект для Node.js/клиента, склеивая JSONB обратно
        const finalPlayerObject = {
            id: playerProfile.id,
            user_id: playerProfile.user_id,
            server_id: playerProfile.server_id,
            nickname: playerProfile.nickname,
            level: playerProfile.level,

            // ИСПРАВЛЕНО: Достаем параметры из существующего объекта playerProfile.game_data
            exp: playerProfile.game_data?.exp !== undefined ? playerProfile.game_data.exp : 340,
            max_exp: playerProfile.game_data?.max_exp !== undefined ? playerProfile.game_data.max_exp : 1000,
            vip_level: playerProfile.game_data?.vip_level !== undefined ? playerProfile.game_data.vip_level : 3,
            vip_exp: playerProfile.game_data?.vip_exp !== undefined ? playerProfile.game_data.vip_exp : 340,
            max_vip_exp: playerProfile.game_data?.max_vip_exp !== undefined ? playerProfile.game_data.max_vip_exp : 1000,

            combat_power: playerProfile.combat_power,
            resources: playerProfile.resources,
            idle_timestamps: playerProfile.idle_timestamps,

            sessionId: apiSessionData.sessionId || null,
            partnerId: apiSessionData.partnerId || 'demo_mtwtech',
            username: username,

            ...playerProfile.game_data // Разворачиваем тяжелые массивы (heroes, inventory) наружу
        };

        // if (redisClient.isOpen && redisClient.isReady) {
        //     const redisPlayerKey = `p:${serverId}:${gameId}:${deviceId}`;
        //     const leaderboardKey = `lb:${serverId}:arena`;
        //     const currentRating = finalPlayerObject.resources?.arena_rating || 1000;
        //
        //     // 1. Прогреваем кэш сессии игрока в RAM
        //     await redisClient.setEx(redisPlayerKey, 1200, JSON.stringify(finalPlayerObject));
        //
        //     // 2. Сразу пушим его актуальный pvp-рейтинг в глобальный Лидерборд Редиса
        //     await redisClient.zAdd(leaderboardKey, {
        //         score: parseInt(currentRating),
        //         value: String(finalPlayerObject.id) // Передаем UUID строки
        //     });
        // }

        if (redisClient.isOpen && redisClient.isReady) {
            // ФИКС КЛЮЧА: Строго привязываем к серверу и юзернейму
            const redisPlayerKey = `p:${serverId}:${username}`;
            const leaderboardKey = `lb:${serverId}:arena`;
            const currentRating = finalPlayerObject.resources?.arena_rating || 1000;

            // 1. Прогреваем кэш сессии игрока в RAM по единому ключу
            await redisClient.setEx(redisPlayerKey, 1200, JSON.stringify(finalPlayerObject));

            // 2. Пушим скоры в ZSET Лидерборды по UUID строки таблицы (id)
            await redisClient.zAdd(leaderboardKey, { score: parseInt(currentRating), value: String(finalPlayerObject.id) });
            await redisClient.zAdd(`lb:${serverId}:combat_power`, { score: parseInt(finalPlayerObject.combat_power) || 0, value: String(finalPlayerObject.id) });
            await redisClient.zAdd(`lb:${serverId}:level`, { score: parseInt(finalPlayerObject.level) || 1, value: String(finalPlayerObject.id) });
        }

        return finalPlayerObject;
    } catch (e) {
        console.error("Критическая ошибка авторизации на сервере:", e);
        return { error: true, message: e.message };
    }

}

async function getPlayerServersList(userId) {
    const query = `
        SELECT server_id, level, nickname, combat_power, updated_at
        FROM player_server_profiles
        WHERE user_id = $1
        ORDER BY updated_at DESC;
    `;
    try {
        const { rows } = await global.pool.query(query, [userId]);
        return rows; // Возвращает массив легких объектов [{ server_id: 'eu_1', level: 10, ... }]
    } catch (e) {
        console.error("Ошибка при получении списка серверов:", e);
        return [];
    }
}



// async function getPlayerHistory(username, sessionId, type) {
//     try {
//         const integration = {
//             url: ((isDemo ? 'https://mtw-gw.onrender.com' : 'http://localhost:3000') + '/api/') + 'player/history?type='+type,
//             secret: 'demo_showcase_secure_token',
//             body: {
//                 username,
//                 sessionId,
//                 partnerId: 'demo_mtwtech',
//             }
//         };
//
//         const response = await axios.post(`${integration.url}`, integration.body);
//
//         if (!response.data) {
//             return { error: true, message: 'Invalid session data' };
//         }
//
//         return response.data;
//     }
//     catch (e) {
//         console.error(e);
//         return { error: true, e };
//     }
// }
//
// async function updatePlayerResources(username, gameId, serverId, deviceId, resourceChanges) {
//     if (Object.keys(resourceChanges).length === 0) return;
//
//     let apiSessionData = {}, userId;
//     try {
//         const apiResponse = await getOrCreatePlayer(username, '', gameId, deviceId);
//         if (apiResponse && !apiResponse.error) {
//             apiSessionData = apiResponse;
//             userId = apiSessionData.id;
//         }
//     } catch (authError) {
//         console.error("Внешняя авторизация провалилась:", authError);
//     }
//
//     // ЗАЩИТА: Если userId не получен из API, мы не сможем сделать UPDATE.
//     // Тут нужно либо прерывать функцию, либо искать userId локально в базе по username.
//     if (!userId) {
//         console.error("Не удалось определить userId для обновления ресурсов");
//         return { error: true, message: "Auth failed, no userId" };
//     }
//
//     let jsonbBuildPairs = [];
//     Object.entries(resourceChanges).forEach(([key, value]) => {
//         jsonbBuildPairs.push(`'${key}'`, `COALESCE((resources->>'${key}')::bigint, 0) + ${value}`);
//     });
//
//     const query = `
//         UPDATE player_server_profiles
//         SET
//             resources = resources || jsonb_build_object(${jsonbBuildPairs.join(', ')}),
//             updated_at = CURRENT_TIMESTAMP
//         WHERE user_id = $1 AND server_id = $2
//         RETURNING resources;
//     `;
//
//     try {
//         const { rows } = await global.pool.query(query, [userId, serverId]);
//         // Твое исправление rows[0].resources правильное (добавил проверку на пустой rows)
//         return rows[0] ? rows[0].resources : null;
//     } catch (e) {
//         console.error("Ошибка при обновлении ресурсов в БД:", e);
//         throw e;
//     }
// }
//
// async function getPendingIdleRewards(userId, serverId, gameId, idleKey) {
//     const GameConfig = gamesConfigDB[gameId];
//     if (!GameConfig || !GameConfig.mechanics.idle || !GameConfig.mechanics.idle[idleKey]) return { error: true, message: "Config not found" };
//
//     // const ratesPerMinute = GameConfig.mechanics.idle[idleKey].rate || {};
//     const ratesPerMinute = getCurrentIdleRate(gameData, GameConfig, idleKey);
//     const maxHoursLimit = GameConfig.mechanics.idle[idleKey].maxHours || 12;
//
//     const query = `SELECT idle_timestamps FROM player_server_profiles WHERE user_id = $1 AND server_id = $2;`;
//     const { rows } = await global.pool.query(query, [userId, serverId]);
//     if (rows.length === 0) return {};
//
//     const idleTimestamps = rows[0].idle_timestamps || {};
//     const lastClaim = idleTimestamps[idleKey] ? Number(idleTimestamps[idleKey]) : Date.now();
//
//     const now = Date.now();
//     let msPassed = Math.max(0, now - lastClaim);
//
//     // Ограничиваем максимальным временем офлайна
//     const maxMs = maxHoursLimit * 60 * 60 * 1000;
//     if (msPassed > maxMs) msPassed = maxMs;
//
//     const minutesPassed = msPassed / (1000 * 60);
//
//     const pendingRewards = {};
//     Object.entries(ratesPerMinute).forEach(([resKey, rate]) => {
//         pendingRewards[resKey] = Math.floor(minutesPassed * rate);
//     });
//
//     return {
//         pending: pendingRewards,
//         minutesPassed: Math.floor(minutesPassed)
//     };
// }

/**
 * 1. ИСТОРИЯ ИГРОКА ИЗ ВНЕШНЕГО API (Чистый сетевой метод, Редис тут не нужен)
 */
async function getPlayerHistory(username, sessionId, type) {
    try {
        const gwUrl = isDemo ? 'https://mtw-gw.onrender.com' : 'http://localhost:3000';
        const integration = {
            url: `${gwUrl}/api/player/history?type=${type}`,
            secret: 'demo_showcase_secure_token',
            body: { username, sessionId, partnerId: 'demo_mtwtech' }
        };

        const response = await axios.post(`${integration.url}`, integration.body);
        if (!response.data) return { error: true, message: 'Invalid session data' };
        return response.data;
    } catch (e) {
        console.error(e);
        return { error: true, e };
    }
}

/**
 * 2. ПОКУПКА / ИЗМЕНЕНИЕ РЕСУРСОВ СИСТЕМОЙ (Гибридный метод)
 */
async function updatePlayerResources(userId, serverId, resourceChanges) {
    if (!resourceChanges || Object.keys(resourceChanges).length === 0) return null;

    // ------------------------------------------------------------------------
    // ЭШЕЛОН 1: REDIS RAM (БЫСТРЫЙ ПУТЬ)
    // ------------------------------------------------------------------------
    if (redisClient.isOpen && redisClient.isReady) {
        try {
            let player = await Cache.getPlayer(userId, serverId);
            if (player) {
                if (!player.resources) player.resources = {};

                // Применяем инкременты ресурсов прямо в памяти
                Object.entries(resourceChanges).forEach(([key, value]) => {
                    const currentVal = parseInt(player.resources[key]) || 0;
                    player.resources[key] = currentVal + parseInt(value);
                });

                // Сохраняем в кэш и помечаем грязным для LazyWrite
                await Cache.setPlayer(userId, serverId, player);
                return player.resources;
            }
        } catch (cacheErr) {
            console.warn('[PlayersDB:UpdateResources] Сбой Redis, падаю в Postgres Fallback:', cacheErr);
        }
    }

    // ------------------------------------------------------------------------
    // ЭШЕЛОН 2: ТВОЙ СТАРЫЙ SQL FALLBACK (ПРЯМОЙ АПДЕЙТ В ТАБЛИЦУ)
    // ------------------------------------------------------------------------
    let jsonbBuildPairs = [];
    Object.entries(resourceChanges).forEach(([key, value]) => {
        jsonbBuildPairs.push(`'${key}'`, `COALESCE((resources->>'${key}')::bigint, 0) + ${value}`);
    });

    const query = `
        UPDATE player_server_profiles
        SET 
            resources = resources || jsonb_build_object(${jsonbBuildPairs.join(', ')}),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $1 AND server_id = $2
        RETURNING resources;
    `;

    try {
        // ИСПРАВЛЕНО: Твой контроллер шлет UUID (id) из req.player, поэтому ищем строку по id
        const { rows } = await global.pool.query(query, [userId, serverId]);
        return rows[0] ? rows[0].resources : null;
    } catch (e) {
        console.error("Ошибка при обновлении ресурсов в БД:", e);
        throw e;
    }
}

/**
 * 3. ВИЗУАЛЬНЫЙ ПРОСМОТР НАБЕЖАВШИХ АЙДЛ-РЕСУРСОВ (Гибридный метод)
 */
async function getPendingIdleRewards(userId, serverId, gameId, idleKey) {
    const GameConfig = gamesConfigDB[gameId];
    if (!GameConfig || !GameConfig.mechanics.idle || !GameConfig.mechanics.idle[idleKey]) {
        return { error: true, message: "Config not found" };
    }

    const maxHoursLimit = GameConfig.mechanics.idle[idleKey].maxHours || 12;

    // ------------------------------------------------------------------------
    // ЭШЕЛОН 1: РАСЧЕТ ИЗ REDIS КЭША (0 МИЛЛИСЕКУНД)
    // ------------------------------------------------------------------------
    if (redisClient.isOpen && redisClient.isReady) {
        try {
            let player = await Cache.getPlayer(userId, serverId);
            if (player) {
                const idleTimestamps = player.idle_timestamps || {};
                // Если таймстампа первого сбора нет, отсчитываем от текущего времени
                const lastClaim = idleTimestamps[idleKey] ? Number(idleTimestamps[idleKey]) : Date.now();

                const now = Date.now();
                let msPassed = Math.max(0, now - lastClaim);

                const maxMs = maxHoursLimit * 60 * 60 * 1000;
                if (msPassed > maxMs) msPassed = maxMs;

                const minutesPassed = msPassed / (1000 * 60);

                // ФИКС: Передаем весь объект player как gameData для вычисления динамического рейта
                const ratesPerMinute = getCurrentIdleRate(player, GameConfig, idleKey);

                const pendingRewards = {};
                Object.entries(ratesPerMinute).forEach(([resKey, rate]) => {
                    pendingRewards[resKey] = Math.floor(minutesPassed * rate);
                });

                return {
                    pending: pendingRewards,
                    minutesPassed: Math.floor(minutesPassed)
                };
            }
        } catch (cacheErr) {
            console.warn('[PlayersDB:PendingIdle] Сбой Redis, падаю в Postgres Fallback:', cacheErr);
        }
    }

    // ------------------------------------------------------------------------
    // ЭШЕЛОН 2: ТВОЙ СТАРЫЙ SQL FALLBACK ДЛЯ ПРОСМОТРА ОФЛАЙН ДОХОДА
    // ------------------------------------------------------------------------
    const query = `SELECT idle_timestamps, game_data FROM player_server_profiles WHERE id = $1 AND server_id = $2;`;
    try {
        const { rows } = await global.pool.query(query, [userId, serverId]);
        if (rows.length === 0) return {};

        const idleTimestamps = rows[0].idle_timestamps || {};
        const dbGameData = rows[0].game_data || {};
        const lastClaim = idleTimestamps[idleKey] ? Number(idleTimestamps[idleKey]) : Date.now();

        const now = Date.now();
        let msPassed = Math.max(0, now - lastClaim);

        const maxMs = maxHoursLimit * 60 * 60 * 1000;
        if (msPassed > maxMs) msPassed = maxMs;

        const minutesPassed = msPassed / (1000 * 60);

        // ИСПРАВЛЕНО: Подставляем game_data, вытащенный из строки Постгреса
        const ratesPerMinute = getCurrentIdleRate(dbGameData, GameConfig, idleKey);

        const pendingRewards = {};
        Object.entries(ratesPerMinute).forEach(([resKey, rate]) => {
            pendingRewards[resKey] = Math.floor(minutesPassed * rate);
        });

        return {
            pending: pendingRewards,
            minutesPassed: Math.floor(minutesPassed)
        };
    } catch (e) {
        console.error("Ошибка при получении айдл наград:", e);
        return { error: true, message: e.message };
    }
}


// async function claimIdleRewards(username, serverId, gameId, deviceId, idleKey) {
//     // Безопасное извлечение конфигов (защита от падения сервера)
//     const GameConfig = gamesConfigDB[gameId];
//     if (!GameConfig || !GameConfig.mechanics.idle || !GameConfig.mechanics.idle[idleKey]) return { error: true, message: "Config not found" };
//
//     // const ratesPerMinute = GameConfig.mechanics.idle[idleKey].rate || {};
//     const ratesPerMinute = getCurrentIdleRate(gameData, GameConfig, idleKey);
//     const maxHoursLimit = GameConfig.mechanics.idle[idleKey].maxHours || 12;
//
//     let apiSessionData = {}, userId;
//     try {
//         const apiResponse = await getOrCreatePlayer(username, '', gameId, deviceId);
//         if (apiResponse && !apiResponse.error) {
//             apiSessionData = apiResponse;
//             userId = apiSessionData.id;
//         }
//     } catch (authError) {
//         console.error("Внешняя авторизация провалилась:", authError);
//     }
//
//     // ЗАЩИТА: без userId мы не сможем сделать запросы к БД
//     if (!userId) {
//         return { error: true, message: "Authentication failed, userId not found" };
//     }
//
//     // 1. Получаем текущие таймстамы из базы
//     const selectQuery = `
//         SELECT idle_timestamps FROM player_server_profiles
//         WHERE user_id = $1 AND server_id = $2;
//     `;
//
//     const { rows } = await global.pool.query(selectQuery, [userId, serverId]);
//     if (rows.length === 0) return { error: true, message: "Профиль не найден" };
//
//     const idleTimestamps = rows[0].idle_timestamps || {};
//     // Использовать Date.now() как дефолт — отлично, но для таймстампа базы лучше хранить его в миллисекундах
//     const lastClaim = idleTimestamps[idleKey] ? Number(idleTimestamps[idleKey]) : Date.now();
//
//     const now = Date.now();
//     let msPassed = now - lastClaim;
//     if (msPassed < 0) msPassed = 0;
//
//     // 2. Проверяем лимит капа (максимум N часов офлайна)
//     const maxMs = maxHoursLimit * 60 * 60 * 1000;
//     if (msPassed > maxMs) {
//         msPassed = maxMs;
//     }
//
//     const minutesPassed = msPassed / (1000 * 60);
//
//     // 3. Считаем награду
//     const rewardsToGive = {};
//     Object.entries(ratesPerMinute).forEach(([resKey, rate]) => {
//         rewardsToGive[resKey] = Math.floor(minutesPassed * rate);
//     });
//
//     // Если прошло слишком мало времени и капать нечему, просто выходим без апдейта базы
//     if (Object.keys(rewardsToGive).length === 0) {
//         return { gained: {}, message: "Too early to claim" };
//     }
//
//     // 4. Записываем новый таймстамп и прибавляем ресурсы в одном запросе
//     let jsonbBuildPairs = [];
//     Object.entries(rewardsToGive).forEach(([key, value]) => {
//         jsonbBuildPairs.push(`'${key}'`, `COALESCE((resources->>'${key}')::bigint, 0) + ${value}`);
//     });
//
//     const updateQuery = `
//         UPDATE player_server_profiles
//         SET
//             idle_timestamps = jsonb_set(idle_timestamps, '{${idleKey}}', $3::jsonb),
//             resources = resources || jsonb_build_object(${jsonbBuildPairs.join(', ')}),
//             updated_at = CURRENT_TIMESTAMP
//         WHERE user_id = $1 AND server_id = $2
//         RETURNING resources, idle_timestamps;
//     `;
//
//     // ИСПРАВЛЕНО: Добавлен [0] к updateRows для безопасного извлечения данных
//     const { rows: updateRows } = await global.pool.query(updateQuery, [userId, serverId, JSON.stringify(now)]);
//
//     if (!updateRows || updateRows.length === 0) {
//         return { error: true, message: "Failed to update profile data" };
//     }
//
//     return {
//         gained: rewardsToGive,
//         current_resources: updateRows[0].resources,
//         current_idles: updateRows[0].idle_timestamps
//     };
// }
//
// async function getServerLeaderboard(serverId, userId, sortBy = 'combat_power', limit = 100) {
//     // Защита от SQL-инъекций: жестко проверяем имя колонки для сортировки
//     const validSortColumns = ['combat_power', 'level'];
//     if (!validSortColumns.includes(sortBy)) {
//         sortBy = 'combat_power';
//     }
//
//     // Запрос 1: Получаем топ-N игроков сервера
//     const leaderboardQuery = `
//         SELECT
//             user_id,
//             nickname,
//             level,
//             combat_power,
//             game_data->>'avatar_icon' AS avatar_icon,
//             -- Ипользуем оконную функцию для генерации красивых мест (1, 2, 3...)
//             ROW_NUMBER() OVER (ORDER BY ${sortBy} DESC, updated_at ASC) as rank
//         FROM player_server_profiles
//         WHERE server_id = $1
//         ORDER BY ${sortBy} DESC, updated_at ASC
//         LIMIT $2;
//     `;
//
//     // Запрос 2: Узнаем точное место конкретного игрока, который вызвал этот топ
//     const playerRankQuery = `
//         WITH RankedPlayers AS (
//             SELECT
//                 user_id,
//                 ROW_NUMBER() OVER (ORDER BY ${sortBy} DESC, updated_at ASC) as rank
//             FROM player_server_profiles
//             WHERE server_id = $1
//         )
//         SELECT rank FROM RankedPlayers WHERE user_id = $2;
//     `;
//
//     try {
//         // Запускаем оба запроса параллельно ради экономии времени
//         const [leaderboardRes, playerRankRes] = await Promise.all([
//             global.pool.query(leaderboardQuery, [serverId, limit]),
//             global.pool.query(playerRankQuery, [serverId, userId])
//         ]);
//
//         const topPlayers = leaderboardRes.rows.map(row => ({
//             rank: parseInt(row.rank),
//             userId: row.user_id,
//             nickname: row.nickname,
//             level: row.level,
//             combatPower: row.combat_power,
//             avatar_icon: row.avatar_icon,
//         }));
//
//         const myRank = playerRankRes.rows.length > 0 ? parseInt(playerRankRes.rows[0].rank) : null;
//
//         return {
//             leaderboard: topPlayers,
//             myRank: myRank // Вернет число (например, 125) или null, если у игрока нет профиля
//         };
//
//     } catch (e) {
//         console.error("Ошибка при получении лидерборда:", e);
//         return { error: true, message: "Database error" };
//     }
// }

/**
 * 4. ФАКТИЧЕСКИЙ СБОР АЙДЛ-НАГРАД В БАЗУ (Гибридный метод)
 */
async function claimIdleRewards(username, serverId, gameId, deviceId, idleKey) {
    const GameConfig = gamesConfigDB[gameId];
    if (!GameConfig || !GameConfig.mechanics.idle || !GameConfig.mechanics.idle[idleKey]) {
        return { error: true, message: "Config not found" };
    }

    const maxHoursLimit = GameConfig.mechanics.idle[idleKey].maxHours || 12;

    // ------------------------------------------------------------------------
    // ЭШЕЛОН 1: ОПЕРАЦИЯ В СВЕРХБЫСТРОМ REDIS КЭШЕ (0 МИЛЛИСЕКУНД)
    // ------------------------------------------------------------------------
    if (redisClient.isOpen && redisClient.isReady) {
        try {
            // Поскольку игрок уже прошел мидлвейр, его сессия p:${serverId}:${gameId}:${deviceId} горячая в RAM.
            // Нам не нужно заново вызывать getOrCreatePlayer через сеть!
            const redisPlayerKey = `p:${serverId}:${gameId}:${deviceId}`;
            const cachedData = await redisClient.get(redisPlayerKey);

            if (cachedData) {
                let player = JSON.parse(cachedData);

                if (!player.idle_timestamps) player.idle_timestamps = {};
                if (!player.resources) player.resources = {};

                const lastClaim = player.idle_timestamps[idleKey] ? Number(player.idle_timestamps[idleKey]) : Date.now();
                const now = Date.now();
                let msPassed = Math.max(0, now - lastClaim);

                const maxMs = maxHoursLimit * 60 * 60 * 1000;
                if (msPassed > maxMs) msPassed = maxMs;

                const minutesPassed = msPassed / (1000 * 60);
                const ratesPerMinute = getCurrentIdleRate(player, GameConfig, idleKey);

                const rewardsToGive = {};
                Object.entries(ratesPerMinute).forEach(([resKey, rate]) => {
                    rewardsToGive[resKey] = Math.floor(minutesPassed * rate);
                });

                if (Object.keys(rewardsToGive).length === 0) {
                    return { gained: {}, message: "Too early to claim" };
                }

                // Обновляем таймстамп сбора и ресурсы прямо в памяти JS-объекта
                player.idle_timestamps[idleKey] = now;
                Object.entries(rewardsToGive).forEach(([key, value]) => {
                    player.resources[key] = (parseInt(player.resources[key]) || 0) + value;
                });

                // Пушим обновленный объект обратно в Редис. Lazy Write сбросит изменения в Postgres по колонкам.
                // Так как у нас ключ привязан к девайсу, мы используем прямой метод записи
                await redisClient.setEx(redisPlayerKey, 1200, JSON.stringify(player));
                // Помечаем UUID игрока грязным для фонового демона lazyWrite
                const { markPlayerDirty } = require('./lazyWrite');
                await markPlayerDirty(player.id, serverId);

                return {
                    gained: rewardsToGive,
                    current_resources: player.resources,
                    current_idles: player.idle_timestamps
                };
            }
        } catch (cacheErr) {
            console.warn('[PlayersDB:ClaimIdle] Сбой Redis, падаю в Postgres Fallback:', cacheErr);
        }
    }

    // ------------------------------------------------------------------------
    // ЭШЕЛОН 2: ТВОЙ СТАРЫЙ SQL FALLBACK (ТРАНЗАКЦИЯ И ПОЛНЫЙ АПДЕЙТ В СУБД)
    // ------------------------------------------------------------------------
    let apiSessionData = {}, userId;
    try {
        const apiResponse = await getOrCreatePlayer(username, '', gameId, deviceId);
        if (apiResponse && !apiResponse.error) {
            apiSessionData = apiResponse;
            userId = apiSessionData.id;
        }
    } catch (authError) {
        console.error("Внешняя авторизация провалилась в Fallback:", authError);
    }

    if (!userId) return { error: true, message: "Authentication failed, userId not found" };

    try {
        const selectQuery = `SELECT idle_timestamps, game_data FROM player_server_profiles WHERE id = $1 AND server_id = $2;`;
        const { rows } = await global.pool.query(selectQuery, [userId, serverId]);
        if (rows.length === 0) return { error: true, message: "Профиль не найден" };

        const idleTimestamps = rows[0].idle_timestamps || {};
        const dbGameData = rows[0].game_data || {};
        const lastClaim = idleTimestamps[idleKey] ? Number(idleTimestamps[idleKey]) : Date.now();

        const now = Date.now();
        let msPassed = Math.max(0, now - lastClaim);

        const maxMs = maxHoursLimit * 60 * 60 * 1000;
        if (msPassed > maxMs) msPassed = maxMs;

        const minutesPassed = msPassed / (1000 * 60);
        const ratesPerMinute = getCurrentIdleRate(dbGameData, GameConfig, idleKey);

        const rewardsToGive = {};
        Object.entries(ratesPerMinute).forEach(([resKey, rate]) => {
            rewardsToGive[resKey] = Math.floor(minutesPassed * rate);
        });

        if (Object.keys(rewardsToGive).length === 0) {
            return { gained: {}, message: "Too early to claim" };
        }

        let jsonbBuildPairs = [];
        Object.entries(rewardsToGive).forEach(([key, value]) => {
            jsonbBuildPairs.push(`'${key}'`, `COALESCE((resources->>'${key}')::bigint, 0) + ${value}`);
        });

        const updateQuery = `
            UPDATE player_server_profiles
            SET 
                idle_timestamps = jsonb_set(idle_timestamps, '{${idleKey}}', $3::jsonb),
                resources = resources || jsonb_build_object(${jsonbBuildPairs.join(', ')}),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $1 AND server_id = $2
            RETURNING resources, idle_timestamps;
        `;

        const { rows: updateRows } = await global.pool.query(updateQuery, [userId, serverId, JSON.stringify(now)]);

        if (!updateRows || updateRows.length === 0) {
            return { error: true, message: "Failed to update profile data" };
        }

        return {
            gained: rewardsToGive,
            current_resources: updateRows[0].resources,
            current_idles: updateRows[0].idle_timestamps
        };
    } catch (e) {
        console.error("Критическая ошибка SQL ClaimIdle:", e);
        return { error: true, message: e.message };
    }
}

/**
 * 5. ПОЛУЧЕНИЕ ТОП-ЛИСТА СЕРВЕРА (Гибридный метод под combat_power и level)
 */
/**
 * ПОЛУЧЕНИЕ ТОП-ЛИСТА СЕРВЕРА (Гибридный метод: Redis ZSET + Postgres Fallback)
 */
async function getServerLeaderboard(serverId, userId, sortBy = 'combat_power', limit = 100) {
    const validSortColumns = ['combat_power', 'level'];
    if (!validSortColumns.includes(sortBy)) sortBy = 'combat_power';

    // ------------------------------------------------------------------------
    // ЭШЕЛОН 1: РЕАКТИВНЫЙ REDIS ZSET ЛИДЕРБОРД (0 МИЛЛИСЕКУНД БЕЗ НАГРУЗКИ НА CPU)
    // ------------------------------------------------------------------------
    const { redisClient } = require('./redisClient');
    if (redisClient.isOpen && redisClient.isReady) {
        try {
            // Динамический ключ под выбранный тип топа (lb:world_01:combat_power или lb:world_01:level)
            const leaderboardKey = `lb:${serverId}:${sortBy}`;

            // Вытаскиваем топ-N UUID игроков с их скорами из Sorted Set (в порядке убывания REV)
            const topUsers = await redisClient.zRangeWithScores(leaderboardKey, 0, limit - 1, { REV: true });

            // Находим точное место (ранг) конкретного запрашивающего игрока.
            // Индексация в Redis с нуля, поэтому прибавляем 1. REV означает от большего к меньшему.
            const myRawRank = await redisClient.zRevRank(leaderboardKey, String(userId));
            const myRank = myRawRank !== null ? myRawRank + 1 : null;

            const leaderboardResult = [];
            let currentRank = 1;

            for (const cell of topUsers) {
                // Ищем профиль игрока по маске ключа сессии имени: p:serverId:*
                // Чтобы собрать ники, уровни и аватарки в реальном времени
                const userPattern = `p:${serverId}:*`;
                const keys = await redisClient.keys(userPattern);

                let nickname = 'Hero';
                let level = 1;
                let combatPower = 0;
                let avatarIcon = './gacha/assets/images/heroes/heroAvatars/eleniel.webp';

                // Сканируем кэш, чтобы найти профиль с соответствующим UUID (id)
                for (const uKey of keys) {
                    const cachedData = await redisClient.get(uKey);
                    if (cachedData) {
                        const profile = JSON.parse(cachedData);
                        if (String(profile.id) === String(cell.value)) {
                            nickname = profile.nickname || nickname;
                            level = profile.level || level;
                            combatPower = profile.combat_power || combatPower;
                            avatarIcon = profile.avatar_icon || avatarIcon;
                            break;
                        }
                    }
                }

                leaderboardResult.push({
                    rank: currentRank++,
                    userId: cell.value,
                    nickname,
                    level: parseInt(level),
                    combatPower: parseInt(combatPower),
                    avatar_icon: avatarIcon
                });
            }

            return {
                leaderboard: leaderboardResult,
                myRank: myRank
            };
        } catch (cacheErr) {
            console.warn('[PlayersDB:Leaderboard] Сбой Redis ZSET, падаю в Postgres Fallback:', cacheErr);
        }
    }
    // ------------------------------------------------------------------------
    // ЭШЕЛОН 2: ТВОЙ СТАРЫЙ ОРИГИНАЛЬНЫЙ SQL FALLBACK (ОКОННЫЕ ФУНКЦИИ СУБД)
    // ------------------------------------------------------------------------
    const leaderboardQuery = `
        SELECT 
            id as user_id, 
            nickname, 
            level, 
            combat_power,
            game_data->>'avatar_icon' AS avatar_icon,
            ROW_NUMBER() OVER (ORDER BY ${sortBy} DESC, updated_at ASC) as rank
        FROM player_server_profiles
        WHERE server_id = $1
        ORDER BY ${sortBy} DESC, updated_at ASC
        LIMIT $2;
    `;

    const playerRankQuery = `
        WITH RankedPlayers AS (
            SELECT 
                id as user_id,
                ROW_NUMBER() OVER (ORDER BY ${sortBy} DESC, updated_at ASC) as rank
            FROM player_server_profiles
            WHERE server_id = $1
        )
        SELECT rank FROM RankedPlayers WHERE user_id = $2;
    `;

    try {
        // Запускаем оба запроса параллельно ради экономии времени
        const [leaderboardRes, playerRankRes] = await Promise.all([
            global.pool.query(leaderboardQuery, [serverId, limit]),
            global.pool.query(playerRankQuery, [serverId, userId])
        ]);

        const topPlayers = leaderboardRes.rows.map(row => ({
            rank: parseInt(row.rank),
            userId: row.user_id,
            nickname: row.nickname,
            level: row.level,
            combatPower: row.combat_power,
            avatar_icon: row.avatar_icon,
        }));

        const myRank = playerRankRes.rows.length > 0 ? parseInt(playerRankRes.rows[0].rank) : null;

        return {
            leaderboard: topPlayers,
            myRank: myRank
        };

    } catch (e) {
        console.error("Ошибка при получении лидерборда из SQL:", e);
        return { error: true, message: "Database error" };
    }
}


// async function getServerLeaderboard(serverId, userId, sortBy = 'combat_power', limit = 100) {
//     const validSortColumns = ['combat_power', 'level'];
//     if (!validSortColumns.includes(sortBy)) sortBy = 'combat_power';
//
//     // ------------------------------------------------------------------------
//     // ЭШЕЛОН 1: РЕАКТИВНЫЙ REDIS ZSET ЛИДЕРБОРД (0 МИЛЛИСЕКУНД БЕЗ НАГРУЗКИ НА CPU)
//     // ------------------------------------------------------------------------
//     if (redisClient.isOpen && redisClient.isReady) {
//         try {
//             // Динамический ключ под выбранный тип топа (lb:world_01:combat_power или lb:world_01:level)
//             const leaderboardKey = `lb:${serverId}:${sortBy}`;
//
//             // Вытаскиваем топ-N игроков с их скорами из Sorted Set (в порядке убывания REV)
//             const topUsers = await redisClient.zRangeWithScores(leaderboardKey, 0, limit - 1, { REV: true });
//
//             // Находим ранг (место) конкретного запрашивающего игрока.
//             // так как индексация с нуля, прибавляем 1. REV означает от большего к меньшему.
//             const myRawRank = await redisClient.zRevRank(leaderboardKey, String(userId));
//             const myRank = myRawRank !== null ? myRawRank + 1 : null;
//
//             const leaderboardResult = [];
//             let currentRank = 1;
//
//             for (const cell of topUsers) {
//                 // Ищем профили игроков по маске, чтобы собрать ники и аватарки
//                 // Для надежности, если сессия p: вылетела, мы берем базовые поля
//                 const userPattern = `p:${serverId}:*:${cell.value}`;
//                 const foundKeys = await redisClient.keys(userPattern);
//
//                 let nickname = 'Hero';
//                 let level = 1;
//                 let combatPower = 0;
//                 let avatarIcon = './gacha/assets/images/heroes/heroAvatars/eleniel.webp';
//
//                 if (foundKeys.length > 0) {
//                     const cachedData = await redisClient.get(foundKeys[0]);
//                     if (cachedData) {
//                         const profile = JSON.parse(cachedData);
//                         nickname = profile.nickname || nickname;
//                         level = profile.level || level;
//                         combatPower = profile.combat_power || combatPower;
//                         avatarIcon = profile.avatar_icon || avatarIcon;
//                     }
//                 }
//
//                 leaderboardResult.push({
//                     rank: currentRank++,
//                     userId: cell.value,
//                     nickname,
//                     level: parseInt(level),
//                     combatPower: parseInt(combatPower),
//                     avatar_icon: avatarIcon
//                 });
//             }
//
//             return {
//                 leaderboard: leaderboardResult,
//                 myRank: myRank
//             };
//         } catch (cacheErr) {
//             console.warn('[PlayersDB:Leaderboard] Сбой Redis ZSET, падаю в Postgres Fallback:', cacheErr);
//         }
//     }
//
//     // ------------------------------------------------------------------------
//     // ЭШЕЛОН 2: ТВОЙ СТАРЫЙ ОРИГИНАЛЬНЫЙ SQL FALLBACK С СЛОЖНЫМИ ОКНАМИ И WITH
//     // ------------------------------------------------------------------------
//     const leaderboardQuery = `
//         SELECT
//             id as user_id,
//             nickname,
//             level,
//             combat_power,
//             game_data->>'avatar_icon' AS avatar_icon,
//             -- Ипользуем оконную функцию для генерации красивых мест (1, 2, 3...)
//             ROW_NUMBER() OVER (ORDER BY ${sortBy} DESC, updated_at ASC) as rank
//         FROM player_server_profiles
//         WHERE server_id = $1
//         ORDER BY ${sortBy} DESC, updated_at ASC
//         LIMIT $2;
//     `;
//
//     // Запрос 2: Узнаем точное место конкретного игрока, который вызвал этот топ
//     const playerRankQuery = `
//         WITH RankedPlayers AS (
//             SELECT
//                 id as user_id,
//                 ROW_NUMBER() OVER (ORDER BY ${sortBy} DESC, updated_at ASC) as rank
//             FROM player_server_profiles
//             WHERE server_id = $1
//         )
//         SELECT rank FROM RankedPlayers WHERE user_id = $2;
//     `;
//
//     try {
//         // Запускаем оба запроса параллельно ради экономии времени
//         const [leaderboardRes, playerRankRes] = await Promise.all([
//             global.pool.query(leaderboardQuery, [serverId, limit]),
//             global.pool.query(playerRankQuery, [serverId, userId])
//         ]);
//
//         const topPlayers = leaderboardRes.rows.map(row => ({
//             rank: parseInt(row.rank),
//             userId: row.user_id,
//             nickname: row.nickname,
//             level: row.level,
//             combatPower: row.combat_power,
//             avatar_icon: row.avatar_icon,
//         }));
//
//         const myRank = playerRankRes.rows.length > 0 ? parseInt(playerRankRes.rows[0].rank) : null;
//
//         return {
//             leaderboard: topPlayers,
//             myRank: myRank // Вернет число (например, 125) или null, если у игрока нет профиля
//         };
//
//     } catch (e) {
//         console.error("Ошибка при получении лидерборда из SQL:", e);
//         return { error: true, message: "Database error" };
//     }
// }

// async function getPlayerInventory(userId, serverId) {
//     const query = `
//         SELECT resources, game_data->'inventory' as inventory
//         FROM player_server_profiles
//         WHERE user_id = $1 AND server_id = $2;
//     `;
//     try {
//         const { rows } = await global.pool.query(query, [userId, serverId]);
//         if (rows.length === 0) return { error: true, message: "Профиль игрока не найден" };
//
//         return {
//             resources: rows[0].resources || {},
//             inventory: rows[0].inventory || {} // Возвращает объект вида {"scroll_epic": 5, "rusty_sword": 1}
//         };
//     } catch (e) {
//         console.error("Ошибка при получении инвентаря из БД:", e);
//         return { error: true, message: e.message };
//     }
// }
//
// async function saveViewedDialog(userId, serverId, dialogId) {
//     const client = await pool.connect();
//     try {
//         await client.query('BEGIN');
//
//         // Проверяем текущую game_data
//         const selectQuery = `SELECT game_data FROM player_server_profiles WHERE user_id = $1 AND server_id = $2 FOR UPDATE;`;
//         const { rows } = await client.query(selectQuery, [userId, serverId]);
//         if (rows.length === 0) throw new Error("Профиль не найден");
//
//         let gameData = rows[0].game_data || {};
//
//         // Инициализируем массив, если его по какой-то причине не было со старта
//         if (!gameData.viewed_dialogs) {
//             gameData.viewed_dialogs = [];
//         }
//
//         // Защита от дубликатов на уровне СУБД: пушим только если диалога еще нет в массиве
//         if (!gameData.viewed_dialogs.includes(dialogId)) {
//             gameData.viewed_dialogs.push(dialogId);
//         }
//
//         // Сохраняем обновленный JSONB в базу
//         const updateQuery = `
//             UPDATE player_server_profiles
//             SET game_data = $3, updated_at = CURRENT_TIMESTAMP
//             WHERE user_id = $1 AND server_id = $2
//             RETURNING game_data;
//         `;
//         const { rows: updateRows } = await client.query(updateQuery, [userId, serverId, JSON.stringify(gameData)]);
//         await client.query('COMMIT');
//
//         return { success: true, game_data: updateRows[0].game_data };
//     } catch (e) {
//         await client.query('ROLLBACK');
//         console.error("Ошибка при сохранении просмотренного диалога:", e);
//         return { error: true, message: e.message };
//     } finally {
//         client.release();
//     }
// }

/**
 * 6. ПОЛУЧЕНИЕ ИНВЕНТАРЯ И РЕСУРСОВ (Гибридный метод)
 */
async function getPlayerInventory(userId, serverId) {
    // ------------------------------------------------------------------------
    // ЭШЕЛОН 1: БЫСТРЫЙ ПУТЬ ЧЕРЕЗ REDIS КЭШ (0 МИЛЛИСЕКУНД)
    // ------------------------------------------------------------------------
    if (redisClient.isOpen && redisClient.isReady) {
        try {
            let player = await Cache.getPlayer(userId, serverId);
            if (player) {
                return {
                    resources: player.resources || {},
                    inventory: player.inventory || {} // В Редисе объект развернут в корень
                };
            }
        } catch (cacheErr) {
            console.warn('[PlayersDB:GetInventory] Сбой Redis, падаю в Postgres Fallback:', cacheErr);
        }
    }

    // ------------------------------------------------------------------------
    // ЭШЕЛОН 2: ТВОЙ СТАРЫЙ SQL FALLBACK (ПРЯМОЙ SELECT ИЗ СУБД)
    // ------------------------------------------------------------------------
    const query = `
        SELECT resources, game_data->'inventory' as inventory
        FROM player_server_profiles
        WHERE id = $1 AND server_id = $2;
    `;
    try {
        // ИСПРАВЛЕНО: контроллер шлет UUID (id) из req.player, поэтому ищем по id
        const { rows } = await global.pool.query(query, [userId, serverId]);
        if (rows.length === 0) return { error: true, message: "Профиль игрока не найден" };

        return {
            resources: rows[0].resources || {},
            inventory: rows[0].inventory || {}
        };
    } catch (e) {
        console.error("Ошибка при получении инвентаря из БД:", e);
        return { error: true, message: e.message };
    }
}

/**
 * 7. СОХРАНЕНИЕ ПРОСМОТРЕННОГО ДИАЛОГА (Гибридный метод)
 */
async function saveViewedDialog(userId, serverId, dialogId) {
    // ------------------------------------------------------------------------
    // ЭШЕЛОН 1: БЫСТРЫЙ ПУТЬ ЧЕРЕЗ REDIS КЭШ (В ПАМЯТИ JS)
    // ------------------------------------------------------------------------
    if (redisClient.isOpen && redisClient.isReady) {
        try {
            let player = await Cache.getPlayer(userId, serverId);
            if (player) {
                // Инициализируем массив прямо в корне плоского объекта, если его не было
                if (!player.viewed_dialogs) {
                    player.viewed_dialogs = [];
                }

                // Защита от дубликатов в памяти
                if (!player.viewed_dialogs.includes(dialogId)) {
                    player.viewed_dialogs.push(dialogId);
                }

                // Записываем обновленный плоский профиль обратно в Редис
                await Cache.setPlayer(userId, serverId, player);

                // Имитируем возвращаемую структуру под твой фронтенд
                // Наш lazyWrite при фоновом апдейте сам запакует все лишнее обратно в game_data
                return { success: true, game_data: player };
            }
        } catch (cacheErr) {
            console.warn('[PlayersDB:SaveDialog] Сбой Redis, падаю в Postgres Fallback:', cacheErr);
        }
    }

    // ------------------------------------------------------------------------
    // ЭШЕЛОН 2: ТВОЙ СТАРЫЙ SQL FALLBACK С ТРАНЗАКЦИЕЙ И БЛОКИРОВКОЙ СУБД
    // ------------------------------------------------------------------------
    const client = await global.pool.connect();
    try {
        await client.query('BEGIN');

        const selectQuery = `SELECT game_data FROM player_server_profiles WHERE id = $1 AND server_id = $2 FOR UPDATE;`;
        const { rows } = await client.query(selectQuery, [userId, serverId]);
        if (rows.length === 0) throw new Error("Профиль не найден");

        let gameData = rows[0].game_data || {};

        if (!gameData.viewed_dialogs) {
            gameData.viewed_dialogs = [];
        }

        if (!gameData.viewed_dialogs.includes(dialogId)) {
            gameData.viewed_dialogs.push(dialogId);
        }

        const updateQuery = `
            UPDATE player_server_profiles 
            SET game_data = $3, updated_at = CURRENT_TIMESTAMP 
            WHERE id = $1 AND server_id = $2
            RETURNING game_data;
        `;
        const { rows: updateRows } = await client.query(updateQuery, [userId, serverId, JSON.stringify(gameData)]);
        await client.query('COMMIT');

        return { success: true, game_data: updateRows[0].game_data };
    } catch (e) {
        await client.query('ROLLBACK');
        console.error("Ошибка при сохранении просмотренного диалога:", e);
        return { error: true, message: e.message };
    } finally {
        client.release();
    }
}


module.exports = {
    getOrCreatePlayer,
    logInServer,
    getPlayerHistory,
    getPlayerServersList,
    updatePlayerResources,
    getPendingIdleRewards,
    claimIdleRewards,
    getServerLeaderboard,
    getPlayerInventory,
    saveViewedDialog
};

// const { getOrCreatePlayer } = require('../db/playersDB');
//
// async function playerAuthMiddleware(req, res, next) {
//     // 1. Извлекаем данные авторизации из Headers (в приоритете) или подстраховываемся из body/query
//     const username = req.headers['x-username']   || req.body.username  || req.query.username;
//     const gameId   = req.headers['x-game-id']    || req.body.game_id   || req.body.gameId   || req.query.game_id || req.query.gameId;
//     const deviceId = req.headers['x-device-id']  || req.body.device_id || req.body.deviceId || req.query.device_id || req.query.deviceId;
//     const serverId = req.headers['x-server-id']  || req.body.server_id || req.body.serverId || req.query.server_id || req.query.serverId;
//
//     // Жесткая проверка обязательных полей для авторизации сессии внешнего API
//     if (!username || !gameId || !deviceId) {
//         return res.status(400).json({
//             error: true,
//             message: "Missing authentication data. Please provide x-username, x-game-id, and x-device-id in headers or request body."
//         });
//     }
//
//     try {
//         // 2. Вызываем твою функцию авторизации сессии
//         const apiResponse = await getOrCreatePlayer(username, '', gameId, deviceId);
//
//         if (!apiResponse || apiResponse.error || apiResponse.err) {
//             return res.status(401).json({ error: true, message: "External API authentication failed" });
//         }
//
//         // --- МАГИЯ СИНХРОНИЗАЦИИ ---
//         // Сохраняем чистый ID из Postgres в req.player (для новых модулей типа инвентаря)
//         req.player = {
//             id: apiResponse.id,
//             username,
//             gameId,
//             deviceId,
//             serverId
//         };
//
//         if(req.body) {
//             // Записываем полученный из базы id прямо в req.body.user_id.
//             // Теперь любой контроллер сможет забрать его отсюда!
//             req.body.user_id = apiResponse.id;
//             req.body.username = username;
//             req.body.gameId = gameId;
//             req.body.deviceId = deviceId;
//             req.body.serverId = serverId;
//         }
//
//         next();
//     } catch (e) {
//         console.error("Auth Middleware Error:", e);
//         return res.status(500).json({ error: true, message: "Internal Auth Middleware Error" });
//     }
// }
//
// module.exports = playerAuthMiddleware;


const { redisClient } = require('../../redisClient');
const { logInServer } = require('../db/playersDB');

async function playerAuthMiddleware(req, res, next) {
    const username = req.headers['x-username']   || req.body.username  || req.query.username;
    const gameId   = req.headers['x-game-id']    || req.body.game_id   || req.body.gameId   || req.query.game_id || req.query.gameId;
    const deviceId = req.headers['x-device-id']  || req.body.device_id || req.body.deviceId || req.query.device_id || req.query.deviceId;
    const serverId = req.headers['x-server-id']  || req.body.server_id || req.body.serverId || req.query.server_id || req.query.serverId || 'world_01';

    if (!username || !gameId || !deviceId) {
        return res.status(400).json({
            error: true,
            message: "Missing authentication data."
        });
    }

    // Собираем уникальный ключ для кэша сессии игрока в Редисе
    const redisPlayerKey = `p:${serverId}:${gameId}:${deviceId}`;

    try {
        // 1. Сначала проверяем Редис. Если игрок активен, забираем его за 0 мс
        if (redisClient.isOpen && redisClient.isReady) {
            const cachedPlayer = await redisClient.get(redisPlayerKey);
            if (cachedPlayer) {
                const playerProfile = JSON.parse(cachedPlayer);

                // Прокидываем готовый плоский профиль в req.player для всех контроллеров
                req.player = {...playerProfile, username, gameId, serverId, deviceId};

                // Продлеваем время жизни в кэше на 20 минут
                await redisClient.expire(redisPlayerKey, 1200);
                return next();
            }
        }

        // 2. FALLBACK: Если в кэше пусто, вызываем твою тяжелую функцию сборки и UPSERT-а
        console.log(`[Cache Fallback] Профиль отсутствует в RAM. Запускаю logInServer для: ${username}`);
        const playerProfile = await logInServer(username, gameId, serverId, deviceId);

        if (!playerProfile || playerProfile.error) {
            return res.status(401).json({ error: true, message: playerProfile?.message || "Server login failed" });
        }

        // 3. Сохраняем собранный плоский профиль в Редис, чтобы избавить сервер от нагрузок в будущем
        if (redisClient.isOpen && redisClient.isReady) {
            await redisClient.setEx(redisPlayerKey, 1200, JSON.stringify(playerProfile));
        }

        req.player = {...playerProfile, username, gameId, serverId, deviceId};
        next();

    } catch (e) {
        console.error("Auth Middleware Error:", e);
        return res.status(500).json({ error: true, message: "Internal Auth Error" });
    }
}

module.exports = playerAuthMiddleware;

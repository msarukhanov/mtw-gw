const { Server } = require('socket.io');
const { redisClient } = require('./redisClient');

global.onlinePlayers = {};  // Реестр: { "demo_partner_Марк": "socket_id" }
global.onlineByDomains = {}; // Реестр: { "localhost": ["Марк"] }

function init(server) {
    const io = new Server(server, {
        cors: { origin: "*", methods: ["GET", "POST"], credentials: true },
        transports: ['websocket', 'polling']
    });

    const virtualArena = require('./battles/virtualArena');
    virtualArena.startArenaEngine(300000, io);

    io.on('connection', async (socket) => {
        // 🪄 МАГИЯ БЕЗОПАСНОСТИ: Вытаскиваем защищенный заголовок Origin или Referer
        const handshakeOrigin = socket.handshake.headers.origin || socket.handshake.headers.referer || '';

        let clientDomain = 'localhost'; // Дефолт, если заголовков нет (например, кастомный клиент тестировщика)
        if (handshakeOrigin && handshakeOrigin.startsWith('http')) {
            try {
                const parsedUrl = new URL(handshakeOrigin);
                clientDomain = parsedUrl.hostname.toLowerCase(); // Чистый домен без http:// и портов (например: 'localhost' или 'casino.com')
            } catch (urlErr) {
                console.error("❌ [Socket Auth] Ошибка парсинга Origin URL:", urlErr.message);
            }
        }

        console.log(`📡 [Socket Connected] Новое соединение. Защищенный определенный Origin домен: ${clientDomain}`);

        let sessionRoomKey = null;
        let domainRoomKey = null;
        let currentUserName = null;
        let activePartnerId = null;

        // Игрок шлет ТОЛЬКО свой username (или токен), больше ничего передавать не нужно!
        socket.on('platform_join', async (data) => {
            const { username, serverId } = data;
            if (!username) return socket.emit('error', { message: 'Username is required to map network gateway socket node.' });

            try {
                // 🔎 Ищем в PostgreSQL, какому партнеру принадлежит этот защищенный домен
                const webCheck = await global.pool.query(
                    'SELECT partner_id FROM b2b_websites WHERE domain_name = $1 AND is_active = 1 LIMIT 1',
                    [clientDomain]
                );

                if (webCheck.rowCount === 0) {
                    console.warn(`⚠️ [Socket Security] Отказ в регистрации сокета. Домен "${clientDomain}" не зарегистрирован в нашей B2B-платформе!`);
                    return socket.emit('error', { message: 'This brand domain configuration mismatch.' });
                }

                // Извлекаем честный partner_id напрямую из Postgres!
                activePartnerId = webCheck.rows[0].partner_id;
                currentUserName = username;

                // 1. Изолированная комната обновлений игрока (например: demo_mtwtech_world01_Марк)
                sessionRoomKey = `${activePartnerId}_${serverId}_${username}`;
                socket.join(sessionRoomKey);

                // 2. Общая брендовая комната всего домена (точки заменяем на _, чтобы не ломать селекторы Socket.io)
                const safeDomainString = clientDomain.replace(/\./g, '_');
                domainRoomKey = `domain_${safeDomainString}`;
                socket.join(domainRoomKey);

                // 3. Фиксируем статус "Онлайн" в оперативной памяти Node.js
                global.onlinePlayers[sessionRoomKey] = socket.id;

                console.log(`✅ [Socket Mapped] Игрок "${username}" успешно заперт в комнатах: [${sessionRoomKey}] и [${domainRoomKey}]. PartnerID: ${activePartnerId}`);

                if (!global.onlineByDomains[clientDomain]) global.onlineByDomains[clientDomain] = [];
                if (!global.onlineByDomains[clientDomain].includes(username)) {
                    global.onlineByDomains[clientDomain].push(username);
                }

                socket.emit('platform_join', {
                    key: sessionRoomKey
                })
            } catch (dbErr) {
                console.error("❌ [Socket DB Error] Не удалось сопоставить домен в Postgres:", dbErr.message);
            }
        });

        socket.on('join_arena_room', (data) => {
            const { gameId, serverId } = data;
            if (gameId && serverId) {
                const roomName = `room_${gameId}_${serverId}`;
                socket.join(roomName);
                console.log(`⚔️ Сокет ${socket.id} успешно вошел в комнату: ${roomName}`);
            }
        });

        socket.on('player_request', async (req) => {
            try {
                const { username, deviceId, gameId, serverId, partnerId, type, method, data } = req;
                // Защищенный sessionKey, привязанный к b2b-домену партнера
                const sessionKey = `${activePartnerId}_${serverId}_${username}`;

                if (!username || !deviceId || !gameId || !serverId || !partnerId || !type || !method) {
                    socket.emit('player_update', { error: true, msg: 'Invalid params.' });
                    return;
                }

                let playerRaw;
                // ИСПРАВЛЕНО: Ключ в Редисе должен точно совпадать с твоей b2b-структурой `p:${serverId}:${gameId}:${deviceId}`
                // const redisKey = `p:${serverId}:${gameId}:${deviceId}`;
                const redisKey = `p:${serverId}:${username}`;

                if (redisClient.isOpen && redisClient.isReady) {
                    try {
                        playerRaw = await redisClient.get(redisKey);
                    } catch (err) {
                        console.error("[Socket Router Redis Error]:", err.message);
                    }
                }

                if (!playerRaw) {
                    socket.emit('player_update', {
                        error: true,
                        msg: 'Invalid player profile cache or session expired.',
                        username, deviceId, gameId, serverId, partnerId, type, method
                    });
                    return;
                }

                // Парсим плоский объект игрока из строки Редиса
                let playerObj = JSON.parse(playerRaw);

                const controllersMap = {
                    'auth': './gachaBuilder/controllers/authController',
                    'arena': './gachaBuilder/controllers/battleController',
                    'battle': './gachaBuilder/controllers/battleController',
                    'gacha': './gachaBuilder/controllers/gachaController',
                    'game': './gachaBuilder/controllers/gameController',
                    'hero': './gachaBuilder/controllers/heroesController',
                    'items': './gachaBuilder/controllers/itemsController',
                    'player': './gachaBuilder/controllers/playerController',
                    'shop': './gachaBuilder/controllers/shopController',
                };

                if (!controllersMap[type]) {
                    socket.emit('player_update', { error: true, msg: 'Invalid controller type.', type });
                    return;
                }

                // Динамически подключаем нужный контроллер ядра
                const controller = require(controllersMap[type]);

                if (!controller[method]) {
                    socket.emit('player_update', { error: true, msg: 'Invalid controller method.', type, method });
                    return;
                }

                // Передаем эстафету Части 2 — Эмуляции Express объектов req и res
                // --- ЭМУЛЯЦИЯ СТРУКТУРЫ EXPRESS REQ / RES ---
                // Собираем объект req в точности так, как его ждут твои 11 контроллеров
                const fakeReq = {
                    player: {
                        id: playerObj.id, // Наш UUID из базы Постгреса
                        serverId: serverId,
                        gameId: gameId,
                        username: username,
                        deviceId: deviceId,
                        partnerId: activePartnerId
                    },
                    query: { ...data },
                    body: { ...data }
                };

                // Перехватываем вызовы ответов res.json и res.status
                const fakeRes = {
                    status: function(statusCode) {
                        this.statusCode = statusCode;
                        return this; // Возвращаем сам объект для цепочки вызовов .status().json()
                    },
                    json: function(backendResponse) {
                        // Если база или контроллер вернули ошибку
                        if (this.statusCode >= 400 || backendResponse.error) {
                            return socket.emit('player_update', {
                                username,
                                type: 'error',
                                data: { message: backendResponse.message || backendResponse.error || "Action failed" }
                            });
                        }

                        let updateType = 'award';
                        let responseData = {};

                        const actualResources = backendResponse.resources || backendResponse.game_data?.resources || playerObj.resources;
                        const actualInventory = backendResponse.inventory || backendResponse.game_data?.inventory || playerObj.inventory;

                        if (type === 'battle') {
                            updateType = 'battle';
                            responseData = backendResponse;
                        }
                        else if (type === 'hero') {
                            updateType = 'hero';
                            responseData = {
                                heroes: backendResponse.heroes || {},
                                instanceId: data.instanceId
                            };
                        }
                        else if (type === 'arena') {
                            updateType = 'arena';
                            responseData = {
                                arena_rating: actualResources?.arena_rating || playerObj.resources?.arena_rating,
                                pvp_opponents: backendResponse.opponents || backendResponse.pvp_opponents || []
                        };
                        }
                        // ДОБАВЛЕНО: Маппинг ответа глобального лидерборда под сокет-событие фронтенда!
                        else if (type === 'game') {
                            updateType = 'leaderboard'; // Твой будущий case 'leaderboard' на клиенте
                            responseData = {
                                leaderboard: backendResponse.leaderboard || [],
                                my_rank: backendResponse.myRank || null
                            };
                        }
                        else if (type === 'gacha') {
                            updateType = 'gacha';
                            responseData = {
                                gacha_list: backendResponse.state || backendResponse.gacha_list || {},
                                heroes: backendResponse.heroes || {},
                                resources: actualResources,
                                inventory: actualInventory,
                            };
                        }
                        else if (type === 'shop') {
                            updateType = 'shop';
                            // responseData = backendResponse;
                            responseData = {
                                resources: backendResponse.state || {},
                                state: backendResponse.state || {},

                            };
                        }
                        else if (type === 'boss') {
                            updateType = 'boss';
                            responseData = {
                                boss_list: backendResponse.statuses || backendResponse.boss_list || {}
                            };
                        }
                        else {
                            // Для 'items', 'player', 'heroes', 'gacha'
                            responseData = {
                                resources: actualResources,
                                inventory: actualInventory
                            };
                        }

                        responseData.add_resources = backendResponse.rewards?.resources || backendResponse.gained || null;
                        responseData.add_items = backendResponse.rewards?.items || null;

                        // Выстреливаем идеально отформатированный пакет изменений в твой фронтенд!
                        socket.emit('player_update', {
                            username: username,
                            type: updateType,
                            data: responseData
                        });
                    }
                };

                // Запускаем метод контроллера! Он отработает на полную мощность,
                // выполнит математику и сам вернет ответ через наш fakeRes.json
                try {
                    controller[method](fakeReq, fakeRes);
                } catch (controllerErr) {
                    console.error(`❌ [Socket Router] Ошибка внутри метода ${type}:${method}:`, controllerErr);
                    global.io.to(sessionKey).emit('player_update', {
                        username,
                        type: 'error',
                        data: { message: "Ошибка выполнения логики на сервере." }
                    });
                }
            }
            catch (e) {
                console.error(e);
            }

        }); // Конец слушателя player_request

        // 3. АВТОМАТИЧЕСКАЯ ОЧИСТКА ПАМЯТИ ПРИ ОТКЛЮЧЕНИИ УСТРОЙСТВА
        socket.on('disconnect', () => {
            if (sessionRoomKey && global.onlinePlayers[sessionRoomKey]) {
                delete global.onlinePlayers[sessionRoomKey];
            }

            if (clientDomain && global.onlineByDomains[clientDomain]) {
                global.onlineByDomains[clientDomain] = global.onlineByDomains[clientDomain].filter(u => u !== currentUserName);
                if (global.onlineByDomains[clientDomain].length === 0) {
                    delete global.onlineByDomains[clientDomain];
                }
            }
            console.log(`🔴 [Socket Disconnected] Устройство игрока ${currentUserName} покинуло сеть домена ${clientDomain}`);
        });
    });

    global.io = io;

    // 4. ГЛОБАЛЬНЫЙ МИНУТНЫЙ ЦИКЛ РАССЫЛКИ БАЛАНСОВ ДЖЕКПОТОВ ПО КОМНАТАМ ПАРТНЕРОВ
    setInterval(async () => {
        if (!global.io) return;

        try {
            // Вытягиваем текущие суммы всех активных джекпотов из PostgreSQL
            const res = await global.pool.query(
                'SELECT partner_id, level_name, current_amount::numeric FROM b2b_jackpots WHERE is_active = 1'
            );

            if (res.rowCount === 0) return;

            // Группируем балансы джекпотов по партнерам (B2B-сегментация)
            const jackpotPack = {};
            res.rows.forEach(row => {
                if (!jackpotPack[row.partner_id]) jackpotPack[row.partner_id] = {};
                jackpotPack[row.partner_id][row.level_name.toLowerCase()] = Number(row.current_amount);
            });

            // Выстреливаем балансы джекпотов раздельно в комнаты каждого партнера
            for (const partnerId in jackpotPack) {
                // Отправляем пакет вида { mini: 342.10, major: 4120.50, mega: 12450.00 }
                global.io.emit(`jackpot_pulse_${partnerId}`, jackpotPack[partnerId]);
            }
        } catch (err) {
            // Тихо перехватываем ошибку, чтобы не спамить консоль при перезагрузках базы данных
            console.error("[Jackpot Pulse Error]:", err.message);
        }
    }, 60000); // Строго раз в минуту
}

module.exports = init;





// const { Server } = require('socket.io');
// const url = require('url'); // Встроенный модуль Node.js для парсинга ссылок
//
// global.onlinePlayers = {};  // Реестр: { "demo_partner_Марк": "socket_id" }
// global.onlineByDomains = {}; // Реестр: { "localhost": ["Марк"] }
//
// function init(server) {
//     const io = new Server(server, {
//         cors: { origin: "*", methods: ["GET", "POST"], credentials: true },
//         transports: ['websocket', 'polling']
//     });
//
//     io.on('connection', async (socket) => {
//         // 🪄 МАГИЯ БЕЗОПАСНОСТИ: Вытаскиваем защищенный заголовок Origin или Referer
//         const handshakeOrigin = socket.handshake.headers.origin || socket.handshake.headers.referer || '';
//
//         let clientDomain = 'localhost'; // Дефолт, если заголовков нет (например, кастомный клиент тестировщика)
//         if (handshakeOrigin && handshakeOrigin.startsWith('http')) {
//             try {
//                 const parsedUrl = new URL(handshakeOrigin);
//                 clientDomain = parsedUrl.hostname.toLowerCase(); // Чистый домен без http:// и портов (например: 'localhost' или 'casino.com')
//             } catch (urlErr) {
//                 console.error("❌ [Socket Auth] Ошибка парсинга Origin URL:", urlErr.message);
//             }
//         }
//
//         console.log(`📡 [Socket Connected] Новое соединение. Защищенный определенный Origin домен: ${clientDomain}`);
//
//         let sessionRoomKey = null;
//         let domainRoomKey = null;
//         let currentUserName = null;
//         let activePartnerId = null;
//
//         // Игрок шлет ТОЛЬКО свой username (или токен), больше ничего передавать не нужно!
//         socket.on('platform_join', async (data) => {
//             const { username } = data;
//             if (!username) return socket.emit('error', { message: 'Username is required to map network gateway socket node.' });
//
//             try {
//                 // 🔎 Ищем в PostgreSQL, какому партнеру принадлежит этот защищенный домен
//                 const webCheck = await global.pool.query(
//                     'SELECT partner_id FROM b2b_websites WHERE domain_name = $1 AND is_active = 1 LIMIT 1',
//                     [clientDomain]
//                 );
//
//                 if (webCheck.rowCount === 0) {
//                     console.warn(`⚠️ [Socket Security] Отказ в регистрации сокета. Домен "${clientDomain}" не зарегистрирован в нашей B2B-платформе!`);
//                     return socket.emit('error', { message: 'This brand domain configuration mismatch.' });
//                 }
//
//                 // Извлекаем честный partner_id напрямую из Postgres!
//                 activePartnerId = webCheck.rows[0].partner_id;
//                 currentUserName = username;
//
//                 // 1. Изолированная комната обновлений игрока (например: demo_mtwtech_Марк)
//                 sessionRoomKey = `${activePartnerId}_${username}`;
//                 socket.join(sessionRoomKey);
//
//                 // 2. Общая брендовая комната всего домена (точки заменяем на _, чтобы не ломать селекторы Socket.io)
//                 const safeDomainString = clientDomain.replace(/\./g, '_');
//                 domainRoomKey = `domain_${safeDomainString}`;
//                 socket.join(domainRoomKey);
//
//                 // 3. Фиксируем статус "Онлайн" в оперативной памяти Node.js
//                 global.onlinePlayers[sessionRoomKey] = socket.id;
//
//                 if (!global.onlineByDomains[clientDomain]) global.onlineByDomains[clientDomain] = [];
//                 if (!global.onlineByDomains[clientDomain].includes(username)) {
//                     global.onlineByDomains[clientDomain].push(username);
//                 }
//
//                 console.log(`✅ [Socket Mapped] Игрок "${username}" успешно заперт в комнатах: [${sessionRoomKey}] и [${domainRoomKey}]. PartnerID: ${activePartnerId}`);
//
//             } catch (dbErr) {
//                 console.error("❌ [Socket DB Error] Не удалось сопоставить домен в Postgres:", dbErr.message);
//             }
//         });
//
//         // Автоматическая очистка памяти при отключении устройства
//         socket.on('disconnect', () => {
//             if (sessionRoomKey && global.onlinePlayers[sessionRoomKey]) {
//                 delete global.onlinePlayers[sessionRoomKey];
//             }
//
//             if (clientDomain && global.onlineByDomains[clientDomain]) {
//                 global.onlineByDomains[clientDomain] = global.onlineByDomains[clientDomain].filter(u => u !== currentUserName);
//                 if (global.onlineByDomains[clientDomain].length === 0) {
//                     delete global.onlineByDomains[clientDomain];
//                 }
//             }
//             console.log(`🔴 [Socket Disconnected] Устройство игрока ${currentUserName} покинуло сеть домена ${clientDomain}`);
//         });
//     });
//
//     global.io = io;
//
//     setInterval(async () => {
//         if (!global.io) return;
//
//         try {
//             // Вытягиваем текущие суммы всех активных джекпотов из PostgreSQL
//             const res = await global.pool.query(
//                 'SELECT partner_id, level_name, current_amount::numeric FROM b2b_jackpots WHERE is_active = 1'
//             );
//
//             if (res.rowCount === 0) return;
//
//             // Группируем балансы по партнерам
//             const jackpotPack = {};
//             res.rows.forEach(row => {
//                 if (!jackpotPack[row.partner_id]) jackpotPack[row.partner_id] = {};
//                 jackpotPack[row.partner_id][row.level_name.toLowerCase()] = Number(row.current_amount);
//             });
//
//             // Выстреливаем балансы джекпотов раздельно в комнаты каждого партнера
//             for (const partnerId in jackpotPack) {
//                 // Отправляем пакет { mini: 342.10, major: 4120.50, mega: 12450.00 }
//                 global.io.emit(`jackpot_pulse_${partnerId}`, jackpotPack[partnerId]);
//             }
//         } catch (err) {
//             // Тихо перехватываем ошибку, чтобы не спамить консоль при перезагрузках
//         }
//     }, 60000);
// }
//
// module.exports = init;
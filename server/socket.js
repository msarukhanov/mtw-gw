const { Server } = require('socket.io');
const url = require('url'); // Встроенный модуль Node.js для парсинга ссылок

global.onlinePlayers = {};  // Реестр: { "demo_partner_Марк": "socket_id" }
global.onlineByDomains = {}; // Реестр: { "localhost": ["Марк"] }

function init(server) {
    const io = new Server(server, {
        cors: { origin: "*", methods: ["GET", "POST"], credentials: true },
        transports: ['websocket', 'polling']
    });

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
            const { username } = data;
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

                // 1. Изолированная комната обновлений игрока (например: demo_mtwtech_Марк)
                sessionRoomKey = `${activePartnerId}_${username}`;
                socket.join(sessionRoomKey);

                // 2. Общая брендовая комната всего домена (точки заменяем на _, чтобы не ломать селекторы Socket.io)
                const safeDomainString = clientDomain.replace(/\./g, '_');
                domainRoomKey = `domain_${safeDomainString}`;
                socket.join(domainRoomKey);

                // 3. Фиксируем статус "Онлайн" в оперативной памяти Node.js
                global.onlinePlayers[sessionRoomKey] = socket.id;

                if (!global.onlineByDomains[clientDomain]) global.onlineByDomains[clientDomain] = [];
                if (!global.onlineByDomains[clientDomain].includes(username)) {
                    global.onlineByDomains[clientDomain].push(username);
                }

                console.log(`✅ [Socket Mapped] Игрок "${username}" успешно заперт в комнатах: [${sessionRoomKey}] и [${domainRoomKey}]. PartnerID: ${activePartnerId}`);

            } catch (dbErr) {
                console.error("❌ [Socket DB Error] Не удалось сопоставить домен в Postgres:", dbErr.message);
            }
        });

        // Автоматическая очистка памяти при отключении устройства
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

    setInterval(async () => {
        if (!global.io) return;

        try {
            // Вытягиваем текущие суммы всех активных джекпотов из PostgreSQL
            const res = await global.pool.query(
                'SELECT partner_id, level_name, current_amount::numeric FROM b2b_jackpots WHERE is_active = 1'
            );

            if (res.rowCount === 0) return;

            // Группируем балансы по партнерам
            const jackpotPack = {};
            res.rows.forEach(row => {
                if (!jackpotPack[row.partner_id]) jackpotPack[row.partner_id] = {};
                jackpotPack[row.partner_id][row.level_name.toLowerCase()] = Number(row.current_amount);
            });

            // Выстреливаем балансы джекпотов раздельно в комнаты каждого партнера
            for (const partnerId in jackpotPack) {
                // Отправляем пакет { mini: 342.10, major: 4120.50, mega: 12450.00 }
                global.io.emit(`jackpot_pulse_${partnerId}`, jackpotPack[partnerId]);
            }
        } catch (err) {
            // Тихо перехватываем ошибку, чтобы не спамить консоль при перезагрузках
        }
    }, 60000);
}

module.exports = init;
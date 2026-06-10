const crypto = require('crypto');
const state = require('../state');

// Хранилище активных демо-сессий витрины в оперативной памяти: { "session_token_xyz": "username" }

exports.initPublicWebsite = async (req, res) => {
    try {
        const domain = req.query.domain || 'localhost';
        const partnerId = req.query.partnerId || 'demo_mtwtech';

        // 1. Ищем сайт в СУБД по домену
        const webRes = await global.pool.query(
            `SELECT id, title, settings, meta, styles 
             FROM b2b_websites 
             WHERE partner_id = $1 AND domain_name = $2 AND is_active = 1 LIMIT 1`,
            [partnerId, domain.toLowerCase()]
        );

        if (webRes.rowCount === 0) {
            return res.status(404).json({ success: false, error: "BRAND_NOT_FOUND" });
        }
        const web = webRes.rows[0];

        // 2. Сразу вытягиваем все активные баннеры для этого сайта
        const bannersRes = await global.pool.query(
            `SELECT banner_type, image_url, click_url 
             FROM b2b_banners 
             WHERE website_id = $1 AND is_active = 1 
             ORDER BY sort_order ASC`,
            [web.id]
        );

        // Группируем баннеры по типам для удобства фронтенда
        const banners = { home: [], casino: [], sport: [] };
        bannersRes.rows.forEach(b => {
            if (banners[b.banner_type]) banners[b.banner_type].push(b);
        });

        res.json({
            success: true,
            title: web.title,
            settings: typeof web.settings === 'string' ? JSON.parse(web.settings) : web.settings,
            meta: typeof web.meta === 'string' ? JSON.parse(web.meta) : web.meta,
            styles: typeof web.styles === 'string' ? JSON.parse(web.styles) : web.styles,
            banners: banners // Сгруппированные массивы баннеров
        });

    } catch (err) {
        console.error("❌ Public website init crash:", err.message);
        res.status(500).json({ error: "Ecosystem boot failure" });
    }
};

// 1. ЛОГИН НА ПЛАТФОРМУ: Генерируем sessionId для фронтенда
exports.login = async (req, res) => {
    const { username } = req.body;
    if (!username || typeof username !== 'string' || username.trim().length < 2) {
        return res.status(400).json({ error: "Invalid username" });
    }

    const cleanName = username.trim();
    const partnerId = "demo_mtwtech";

    try {
        // Убеждаемся, что игрок создан в game.db
        const player = await state.getOrCreatePlayer(cleanName, partnerId);

        // Генерируем криптографически безопасный случайный токен сессии
        const sessionId = 'ss_' + crypto.randomBytes(16).toString('hex');

        // Связываем токен сессии с реальным именем игрока в памяти
        global.activePlayerSessions[sessionId] = cleanName;

        // Удаляем сессию через 24 часа для безопасности
        setTimeout(() => { delete global.activePlayerSessions[sessionId]; }, 24 * 60 * 60 * 1000);

        res.json({
            success: true,
            username: player.username,
            sessionId: sessionId, // Отдаем сгенерированный токен для iFrame!
            balance: player.balance
        });
    } catch (err) {
        res.status(500).json({ error: "Platform login failed" });
    }
};

// 2. ВАЛИДАЦИЯ (Seamless Webhook): Игровой сервер присылает токен из iFrame, мы отдаем имя и баланс
exports.validate = async (req, res) => {
    const { token, secret } = req.body; // Игровой сервер присылает sessionId в поле token
    // Ищем, какому игроку принадлежит этот токен сессии
    const realUsername = global.activePlayerSessions[token];
    if (!realUsername) {
        return res.status(401).json({ error: "Session token invalid or expired" });
    }

    try {
        const player = await state.getOrCreatePlayer(realUsername, "demo_mtwtech");
        res.json({ username: player.username, balance: player.balance });
    } catch (err) { res.status(500).json({ error: "Validation query failed" }); }
};

// 3. Списание баланса (Debit) по токену сессии
exports.debit = async (req, res) => {
    const { token, amount } = req.body; // Игры шлют либо token, либо username
    const realUsername = global.activePlayerSessions[token] || req.body.username;
    const partnerId = "demo_mtwtech";

    if (!realUsername) return res.status(401).json({ error: "Session authentication failed" });

    try {
        const player = await state.getOrCreatePlayer(realUsername, partnerId);
        if (player.balance < amount) return res.status(400).json({ error: "Insufficient funds" });

        const newBalance = Number(player.balance) - Number(amount);
        const upd = await state.updateBalance(realUsername, partnerId, newBalance);

        const io = req.app.get('io');

        res.json({ balance: newBalance });
    } catch (err) { res.status(500).json({ error: "Debit processing failed" }); }
};

// 4. Начисление выигрыша (Credit) по токену сессии
exports.credit = async (req, res) => {
    const { token, amount } = req.body;
    const realUsername = global.activePlayerSessions[token] || req.body.username;
    const partnerId = "demo_mtwtech";

    if (!realUsername) return res.status(401).json({ error: "Session authentication failed" });

    try {
        const player = await state.getOrCreatePlayer(realUsername, partnerId);
        const newBalance = Number(player.balance) + Number(amount);
        const upd = await state.updateBalance(realUsername, partnerId, newBalance);

        res.json({ balance: newBalance });
    } catch (err) { res.status(500).json({ error: "Credit processing failed" }); }
};

// Эндпоинт для обновления шапки сайта-витрины (по токену сессии)
exports.getUserInfo = async (req, res) => {
    const { sessionId } = req.query;
    const realUsername = global.activePlayerSessions[sessionId];
    if (!realUsername) return res.status(401).json({ error: "Session invalid" });

    const player = await state.getOrCreatePlayer(realUsername, "demo_mtwtech");
    res.json({ username: player.username, balance: player.balance });
};

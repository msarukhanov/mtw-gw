const crypto = require('crypto');
const state = require('../state');

// Хранилище активных демо-сессий витрины в оперативной памяти: { "session_token_xyz": "username" }

exports.initPublicWebsite222 = async (req, res) => {
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

exports.initPublicWebsite = async (req, res) => {
    try {
        const domain = req.query.domain || 'localhost';
        const partnerId = req.query.partnerId || 'demo_mtwtech';

        // 1. Ищем сайт, подтягивая lang_settings
        const webRes = await global.pool.query(
            `SELECT id, title, settings, meta, styles, lang_settings 
             FROM b2b_websites 
             WHERE partner_id = $1 AND domain_name = $2 AND is_active = 1 AND is_banned = FALSE LIMIT 1`,
            [partnerId, domain.toLowerCase()]
        );

        if (webRes.rowCount === 0) return res.status(404).json({ success: false, error: "BRAND_NOT_FOUND" });
        const web = webRes.rows[0];

        const langSettings = typeof web.lang_settings === 'string' ? JSON.parse(web.lang_settings) : (web.lang_settings || { supported_langs: ['en'], default_lang: 'en' });

        // 2. Вытягиваем ВСЕ переводы, загруженные админом для этого конкретного сайта
        const transRes = await global.pool.query(
            `SELECT lang_code, payload FROM b2b_website_translations WHERE website_id = $1`,
            [web.id]
        );

        // Собираем объект локализации на лету из строк базы данных
        const websiteTranslations = {};
        transRes.rows.forEach(row => {
            websiteTranslations[row.lang_code] = typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload;
        });

        // 3. Вытягиваем баннеры (оставляем без изменений)
        const bannersRes = await global.pool.query(
            `SELECT banner_type, image_url, click_url FROM b2b_banners WHERE website_id = $1 AND is_active = 1 ORDER BY sort_order ASC`,
            [web.id]
        );
        const banners = { home: [], casino: [], sport: [] };
        bannersRes.rows.forEach(b => { if (banners[b.banner_type]) banners[b.banner_type].push(b); });

        res.json({
            success: true,
            title: web.title,
            settings: typeof web.settings === 'string' ? JSON.parse(web.settings) : web.settings,
            meta: typeof web.meta === 'string' ? JSON.parse(web.meta) : web.meta,
            styles: typeof web.styles === 'string' ? JSON.parse(web.styles) : web.styles,
            banners: banners,
            // 🌐 НОВЫЕ ПАРАМЕТРЫ ДИНАМИЧЕСКОЙ ЛОКАЛИЗАЦИИ
            langSettings: langSettings,         // {"supported_langs": ["en", "ru"], "default_lang": "en"}
            translations: websiteTranslations   // Динамические тексты из Postgres b2b_website_translations
        });

    } catch (err) {
        console.error("❌ Public website init crash:", err.message);
        res.status(500).json({ error: "Ecosystem boot failure" });
    }
};


exports.getWelcomeBonus = async (req, res) => {
    try {
        const partnerId = req.query.partnerId || "demo_mtwtech";
        const websiteId = req.query.websiteId;

        if (!websiteId) return res.status(400).json({ error: "Missing websiteId parameter" });

        const config = await stateMethods.getAdminWelcomeBonusConfig(partnerId, websiteId);
        res.json({ success: true, config });
    } catch (err) {
        res.status(500).json({ error: "Failed to load welcome bonus structure" });
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
    const { token, amount, round_id, game_code } = req.body;
    const realUsername = global.activePlayerSessions[token] || req.body.username;
    const partnerId = "demo_mtwtech";

    if (!realUsername) return res.status(401).json({ error: "Session authentication failed" });

    try {
        const player = await state.getOrCreatePlayer(realUsername, partnerId);

        // Проверяем по суммарному (виртуальному) балансу, хватает ли денег на ставку
        if (player.totalBalance < Number(amount)) {
            return res.status(400).json({ error: "Insufficient funds" });
        }

        const upd = await state.updateBalance(realUsername, partnerId, -1*Number(amount));

        // Тянем свежие данные из апдейта для корректного ответа игре
        const updatedPlayer = upd.rows[0];
        const totalPlayable = Number(updatedPlayer.balance) + Number(updatedPlayer.bonus_balance);

     //    if(round_id || game_code) {
     //        const roundId = req.body.round_id || `rnd_${crypto.randomBytes(6).toString('hex')}`;
     //        const gameCode = req.body.game_code || 'unknown_slot';
     //
     //        await global.pool.query(
     //            `INSERT INTO player_spin_history (partner_id, username, round_id, game_code, bet_amount, win_amount)
     // VALUES ($1, $2, $3, $4, $5, 0.00)
     // ON CONFLICT (partner_id, round_id) DO NOTHING`,
     //            [partnerId, realUsername, roundId, gameCode, Number(amount)]
     //        );
     //    }

        res.json({ balance: totalPlayable });
    } catch (err) {
        res.status(500).json({ error: "Debit processing failed" });
    }
};

// 4. Начисление выигрыша (Credit) по токену сессии
exports.credit = async (req, res) => {
    const { token, amount, round_id } = req.body;
    const realUsername = global.activePlayerSessions[token] || req.body.username;
    const partnerId = "demo_mtwtech";

    if (!realUsername) return res.status(401).json({ error: "Session authentication failed" });

    try {
        const player = await state.getOrCreatePlayer(realUsername, partnerId);

        const upd = await state.updateBalance(realUsername, partnerId, Number(amount));

        const updatedPlayer = upd.rows[0];
        const totalPlayable = Number(updatedPlayer.balance) + Number(updatedPlayer.bonus_balance);

        // const roundId = req.body.round_id;
        //
        // if (roundId) {
        //     await global.pool.query(
        //         `UPDATE player_spin_history
        //  SET win_amount = $1
        //  WHERE partner_id = $2 AND round_id = $3`,
        //         [Number(amount), partnerId, roundId]
        //     );
        // }

        res.json({ balance: totalPlayable });
    } catch (err) {
        res.status(500).json({ error: "Credit processing failed" });
    }
};



// Эндпоинт для обновления шапки сайта-витрины (по токену сессии)
exports.getUserInfo = async (req, res) => {
    const { sessionId } = req.query;
    const realUsername = global.activePlayerSessions[sessionId];
    if (!realUsername) return res.status(401).json({ error: "Session invalid" });

    const player = await state.getOrCreatePlayer(realUsername, "demo_mtwtech");
    res.json({ username: player.username, balance: player.balance });
};

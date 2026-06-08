// Мидлвар проверки игровой сессии по токену запуска gl_...
const checkGameSession = async (req, res, next) => {
    try {
        // Извлекаем токен из query-строки (для GET) или из тела запроса / заголовков (для POST)
        const token = req.query.token || req.body.token || req.headers['x-game-token'];

        // Извлекаем partnerId для дополнительной верификации
        const partnerId = req.query.partnerId || req.body.partnerId || req.headers['x-partner-id'];

        if (!token) {
            return res.status(401).json({ error: "Game launch token required" });
        }

        // Запрашиваем сессию из таблицы game_sessions в Postgres Neon
        // Проверяем, что сессия активна и время её жизни (expired_at) еще не истекло
        const sessionRes = await pool.query(
            `SELECT * FROM game_sessions 
             WHERE token = $1 AND is_active = true AND expired_at > NOW() 
             LIMIT 1`,
            [token]
        );

        if (sessionRes.rowCount === 0) {
            return res.status(401).json({ error: "Game session invalid, expired or closed" });
        }

        const session = sessionRes.rows[0];

        // Дополнительная B2B защита: сверяем, что запрос пришел от правильного партнера
        if (partnerId && session.partner_id !== partnerId) {
            return res.status(403).json({ error: "B2B Partner routing mismatch" });
        }

        // Пробрасываем критически важные данные сессии в объект запроса Express (req)
        req.partnerId = session.partner_id;
        req.isDemo = !!session.is_demo;
        req.gameSlug = session.game_slug;
        req.theme = session.theme || 'default';

        // Если это РЕАЛЬНЫЙ режим, вытаскиваем игрока и синхронизируем сессию
        if (!session.is_demo) {
            req.username = session.username;

            // Запрашиваем из Postgres полную модель игрока для игр
            const state = require('../state');
            const player = await state.getOrCreatePlayer(session.username, session.partner_id);

            req.player = player;
            // Подменяем sessionId на токен запуска, чтобы дебиты/кредиты шли под этим идентификатором
            req.sessionId = player.sessionId || token;
        } else {
            // Если это ДЕМО режим, создаем виртуального фейкового игрока в RAM, чтобы игры не падали
            req.username = "Demo_Player";
            req.player = {
                username: "Demo_Player",
                balance: 5000, // Даем демо-баланс 5000 коинов
                history: [],
                dailyQuests: { gamesPlayed: 0, claimed: false }
            };
            req.sessionId = token;
        }

        // Сессия валидна, передаем управление контроллеру игры!
        next();

    } catch (err) {
        console.error("❌ [Game Session Middleware Error]:", err.message);
        res.status(500).json({ error: "Internal game authentication crash" });
    }
};

module.exports = checkGameSession;
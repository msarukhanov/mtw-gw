const state = require('../state');
const seamless = require('../services/seamlessService');

const bcrypt = require('bcrypt'); // Для безопасного хэширования паролей

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
// Эндпоинт 1: Чистый профиль игрока (Баланс)
exports.getUserProfile = async (req, res) => {
    try {
        const { username, partnerId } = req; // Из middleware checkPlayer

        const pRes = await global.pool.query(
            'SELECT balance FROM players WHERE username = $1 AND partner_id = $2 LIMIT 1',
            [username, partnerId]
        );
        if (pRes.rowCount === 0) return res.status(404).json({ error: "User not found" });

        res.json({
            success: true,
            balance: Number(pRes.rows[0].balance).toFixed(2)
        });
    } catch (err) {
        res.status(500).json({ error: "Failed to load profile" });
    }
};

// Эндпоинт 2: История активности с фильтрацией по типу лога
exports.getUserHistory = async (req, res) => {
    try {
        const { username, partnerId } = req;
        const type = req.query.type || 'all'; // 'all', 'bets', 'cashier'

        let queryText = `SELECT category, action_type, description, amount_change::numeric, timestamp 
                         FROM player_history 
                         WHERE username = $1 AND partner_id = $2`;
        let queryParams = [username, partnerId];

        // Фильтруем историю на уровне базы данных PostgreSQL
        if (type === 'bets') {
            queryText += ` AND category IN ('casino', 'sport')`;
        } else if (type === 'cashier') {
            // В cashier попадают депозиты, выводы, промокоды и кэшбэки
            queryText += ` AND category = 'system'`;
        }

        queryText += ` ORDER BY timestamp DESC LIMIT 30`; // отдаем последние 30 записей

        const historyRes = await global.pool.query(queryText, queryParams);

        const formattedHistory = historyRes.rows.map(h => ({
            type: h.action_type.toUpperCase(),
            description: h.description,
            amount: Number(h.amount_change),
            date: new Date(h.timestamp).toLocaleDateString('en-US', {
                month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
            })
        }));

        res.json({ success: true, history: formattedHistory });
    } catch (err) {
        res.status(500).json({ error: "Failed to load history" });
    }
};


exports.changePassword = async (req, res) => {
    try {
        const { username, partnerId } = req;
        const { newPassword } = req.body;

        if (!newPassword || newPassword.length < 6) {
            return res.status(400).json({ success: false, error: "Password must be at least 6 characters long." });
        }

        // Хэшируем пароль перед записью в СУБД (Защита от утечек)
        const salt = await bcrypt.genSalt(10);
        const hash = await bcrypt.hash(newPassword, salt);

        await global.pool.query(
            'UPDATE players SET password_hash = $1 WHERE username = $2 AND partner_id = $3',
            [hash, username, partnerId]
        );

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: "Failed to update credential hashes" });
    }
};

// Контроллер получения статуса квестов и лидерборда
exports.getGamificationOverview = async (req, res) => {
    try {
        const { username, partnerId } = req; // забираем данные из checkPlayer middleware
        const status = await state.getPlayerGamificationStatus(username, partnerId);

        if (!status) return res.status(404).json({ error: "Player data missing" });
        res.json({ success: true, data: status });
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch gamification data" });
    }
};

// Контроллер ручного забора награды (клик по кнопке "Claim Reward")
exports.claimQuestReward = async (req, res) => {
    try {
        const { username, partnerId, sessionId } = req;
        const result = await state.claimDailyQuestReward(username, partnerId, sessionId);

        if (!result.success) return res.status(400).json(result);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: "Failed to execute claim sequence" });
    }
};

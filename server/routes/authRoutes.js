const express = require('express');
const router = express.Router();
const state = require('../state');
const seamless = require('../services/seamlessService');

// ПОСРЕДНИК АВТОРИЗАЦИИ (Сделан асинхронным для NeDB)
router.checkPlayer = async (req, res, next) => {
    const { username, sessionId } = req.body;

    if (!username && !sessionId) {
        return res.status(401).json({ error: "Unauthorized seamless session" });
    }

    // ВАЛИДАЦИЯ: Проверяем длину имени
    if (!username || typeof username !== 'string' || username.trim().length < 2 || username.length > 20) {
        return res.status(400).json({ error: "Invalid username. Must be 2-20 characters." });
    }

    // Защита от запрещенных символов
    const validUsernameRegex = /^[a-zA-Z0-9_]+$/;
    if (!validUsernameRegex.test(username)) {
        return res.status(400).json({ error: "Username can only contain letters, numbers and underscores." });
    }

    try {
        // Достаем игрока из базы данных NeDB через await
        const player = await state.getOrCreatePlayer(username.trim());
        req.player = player;
        req.username = player.username;

        if (sessionId) {
            player.sessionId = sessionId; // привязываем сокет/сессию
        }

        next();
    } catch (err) {
        res.status(500).json({ error: "Database error" });
    }
};

router.post('/auth/seamless', async (req, res) => {
    const { sessionId } = req.body;
    if (!sessionId) return res.status(400).json({ error: "Session ID required" });

    // Идем к внешней платформе проверять токен
    const externalUser = await seamless.validateSession(sessionId);
    if (!externalUser) {
        return res.status(401).json({ error: "Invalid or expired session token" });
    }

    // Создаем/обновляем локальный кэш игрока
    const player = await state.getOrCreatePlayer(externalUser.username);
    player.sessionId = sessionId;
    player.balance = externalUser.balance; // Синхронизируем баланс с платформой
    await state.updateBalance(player.username, player.balance);

    res.json({
        username: player.username,
        balance: player.balance,
        jackpot: state.getJackpot(),
        config: state.getConfig()
    });
});

// Маршрут логина
router.post('/auth', async (req, res) => {
    const { username } = req.body;
    if (!username || typeof username !== 'string') {
        return res.status(400).json({ error: "Username is required" });
    }

    try {
        const player = await state.getOrCreatePlayer(username.trim());

        res.json({
            username: player.username,
            balance: player.balance,
            jackpot: state.getJackpot(),
            config: state.getConfig()
        });
    } catch (err) {
        res.status(500).json({ error: "Database error" });
    }
});


module.exports = router;

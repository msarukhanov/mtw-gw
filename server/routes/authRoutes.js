const express = require('express');
const router = express.Router();
const state = require('../state');

// ПОСРЕДНИК АВТОРИЗАЦИИ (Сделан асинхронным для NeDB)
router.checkPlayer = async (req, res, next) => {
    const { username } = req.body;

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
        next();
    } catch (err) {
        res.status(500).json({ error: "Database error" });
    }
};

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

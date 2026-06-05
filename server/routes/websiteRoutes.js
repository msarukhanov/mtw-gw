const express = require('express');
const router = express.Router();

// Фейковая база данных игроков платформы в оперативной памяти для демо
const platformPlayers = {
    "DemoAdmin": { balance: 5000, token: "demo_token_123" }
};

const showcaseController = require('../controllers/showcaseController');

// Роуты, которые имитируют эндпоинты внешней платформы
router.post('/showcase/validate', showcaseController.validate);
router.post('/showcase/debit', showcaseController.debit);
router.post('/showcase/credit', showcaseController.credit);
router.get('/showcase/user-info', showcaseController.getUserInfo);
router.post('/showcase/login', showcaseController.login);

// 1. Эндпоинт проверки сессии (Validate)
router.post('/platform/validate', (req, res) => {
    const { token, secret } = req.body;
    // Находим игрока по токену сессии
    const userKey = Object.keys(platformPlayers).find(k => platformPlayers[k].token === token);

    if (!userKey) return res.status(401).json({ error: "Session expired" });

    res.json({
        username: userKey,
        balance: platformPlayers[userKey].balance
    });
});

// 2. Эндпоинт списания ставки (Debit)
router.post('/platform/debit', (req, res) => {
    const { username, token, amount } = req.body;
    const player = platformPlayers[username];

    if (!player || player.token !== token) return res.status(401).json({ error: "Auth failed" });
    if (player.balance < amount) return res.status(400).json({ error: "Low balance" });

    player.balance -= Number(amount); // Списываем деньги на платформе
    res.json({ balance: player.balance });
});

// 3. Эндпоинт начисления выигрыша (Credit)
router.post('/platform/credit', (req, res) => {
    const { username, token, amount } = req.body;
    const player = platformPlayers[username];

    if (!player) return res.status(404).json({ error: "Player not found" });

    player.balance += Number(amount); // Начисляем выигрыш
    res.json({ balance: player.balance });
});

// Дополнительный роут, чтобы фронтенд платформы мог просто запрашивать текущий баланс для шапки
router.get('/platform/user-info', (req, res) => {
    res.json({ username: "DemoAdmin", balance: platformPlayers["DemoAdmin"].balance });
});

module.exports = router;
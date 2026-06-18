const state = require('../state');

// 1. Имитация Validate: Проверяем игрока по имени (вместо токена для простоты демо)
exports.validate = async (req, res) => {
    const { token, secret } = req.body; // В качестве token на фронтенде передадим username
    if (!token) return res.status(401).json({ error: "Invalid token" });

    try {
        const player = await state.getOrCreatePlayer(token, "demo_mtwtech");
        res.json({ username: player.username, balance: player.balance });
    } catch (err) {
        res.status(500).json({ error: "Showcase validation failed" });
    }
};

// 2. Имитация Debit: Списание баланса в game.db
exports.debit = async (req, res) => {
    const { username, amount } = req.body;
    try {
        const player = await state.getOrCreatePlayer(username, "demo_mtwtech");
        if (player.balance < amount) return res.status(400).json({ error: "Low platform balance" });

        const newBalance = player.balance - Number(amount);
        await state.updateBalance(username, "demo_mtwtech", -1*Number(amount));

        res.json({ balance: newBalance });
    } catch (err) {
        res.status(500).json({ error: "Showcase debit failed" });
    }
};

// 3. Имитация Credit: Начисление баланса в game.db
exports.credit = async (req, res) => {
    const { username, amount } = req.body;
    try {
        const player = await state.getOrCreatePlayer(username, "demo_mtwtech");
        const newBalance = player.balance + Number(amount);
        await state.updateBalance(username, "demo_mtwtech", -1*Number(amount));

        res.json({ balance: newBalance });
    } catch (err) {
        res.status(500).json({ error: "Showcase credit failed" });
    }
};

// Эндпоинт, чтобы шапка сайта-витрины могла быстро узнать баланс игрока для отрисовки
exports.getUserInfo = async (req, res) => {
    const { username } = req.query;
    if (!username) return res.status(400).json({ error: "Username required" });
    const player = await state.getOrCreatePlayer(username, "demo_mtwtech");
    res.json({ username: player.username, balance: player.balance });
};

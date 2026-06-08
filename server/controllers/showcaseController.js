const crypto = require('crypto');
const state = require('../state');

// Хранилище активных демо-сессий витрины в оперативной памяти: { "session_token_xyz": "username" }
const activeShowcaseSessions = {};

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
        activeShowcaseSessions[sessionId] = cleanName;

        // Удаляем сессию через 24 часа для безопасности
        setTimeout(() => { delete activeShowcaseSessions[sessionId]; }, 24 * 60 * 60 * 1000);

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
    const realUsername = activeShowcaseSessions[token];
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
    const realUsername = activeShowcaseSessions[token] || req.body.username;
    const partnerId = "demo_mtwtech";

    if (!realUsername) return res.status(401).json({ error: "Session authentication failed" });

    try {
        const player = await state.getOrCreatePlayer(realUsername, partnerId);
        if (player.balance < amount) return res.status(400).json({ error: "Insufficient funds" });

        const newBalance = player.balance - Number(amount);
        await state.updateBalance(realUsername, partnerId, newBalance);

        // Отправляем пуш-обновление в комнату сокетов витрины
        const io = req.app.get('io');
        if (io) {
            io.to(`${partnerId}_${realUsername}`).emit('wallet_update', { balance: newBalance });
        }

        res.json({ balance: newBalance });
    } catch (err) { res.status(500).json({ error: "Debit processing failed" }); }
};

// 4. Начисление выигрыша (Credit) по токену сессии
exports.credit = async (req, res) => {
    const { token, amount } = req.body;
    const realUsername = activeShowcaseSessions[token] || req.body.username;
    const partnerId = "demo_mtwtech";

    if (!realUsername) return res.status(401).json({ error: "Session authentication failed" });

    try {
        const player = await state.getOrCreatePlayer(realUsername, partnerId);
        const newBalance = player.balance + Number(amount);
        await state.updateBalance(realUsername, partnerId, newBalance);

        const io = req.app.get('io');
        if (io) {
            io.to(`${partnerId}_${realUsername}`).emit('wallet_update', { balance: newBalance });
        }

        res.json({ balance: newBalance });
    } catch (err) { res.status(500).json({ error: "Credit processing failed" }); }
};

// Эндпоинт для обновления шапки сайта-витрины (по токену сессии)
exports.getUserInfo = async (req, res) => {
    const { sessionId } = req.query;
    const realUsername = activeShowcaseSessions[sessionId];
    if (!realUsername) return res.status(401).json({ error: "Session invalid" });

    const player = await state.getOrCreatePlayer(realUsername, "demo_mtwtech");
    res.json({ username: player.username, balance: player.balance });
};

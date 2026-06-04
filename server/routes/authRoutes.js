const express = require('express');
const router = express.Router();
const state = require('../state');
const seamless = require('../services/seamlessService');


// ПОСРЕДНИК АВТОРИЗАЦИИ (Изолирует игрока на основе пары username + partnerId)
router.checkPlayer = async (req, res, next) => {
    // ИСПРАВЛЕНО: Извлекаем partnerId из тела, заголовков или токена
    const { username, sessionId } = req.body;
    const partnerId = req.body.partnerId || req.headers['x-partner-id'];

    if (!partnerId) {
        return res.status(400).json({ error: "Missing required B2B partner identifier (partnerId)" });
    }

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
        // ИСПРАВЛЕНО: Достаем игрока строго в рамках текущего партнера
        const player = await state.getOrCreatePlayer(username.trim(), partnerId);

        req.player = player;
        req.username = player.username;
        req.partnerId = partnerId; // Пробрасываем partnerId в запрос Express для игр

        if (sessionId) {
            player.sessionId = sessionId; // привязываем сокет/сессию
        }

        next();
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Database error during player synchronization" });
    }
};

// БЕСШОВНЫЙ ВХОД (Seamless Webhook для внешних операторов)
router.post('/auth/seamless', async (req, res) => {
    // ИСПРАВЛЕНО: Внешняя платформа обязательно шлет свой идентификатор
    const { sessionId, partnerId } = req.body;
    if (!sessionId) return res.status(400).json({ error: "Session ID required" });
    if (!partnerId) return res.status(400).json({ error: "Partner ID required for B2B routing" });

    // Идем к конкретной внешней платформе проверять токен (передаем partnerId)
    let externalUser = await seamless.validateSession(sessionId, partnerId);
    if (!externalUser) {
        return res.status(401).json({ error: "Invalid or expired session token" });
    }

    if(!externalUser || !externalUser.username) {
        externalUser = {username:'Player1'}
    }

    // Создаем/обновляем локальный кэш игрока под нужного партнера
    const player = await state.getOrCreatePlayer(externalUser.username, partnerId);
    player.sessionId = sessionId;
    if(externalUser && externalUser.balance) {
        player.balance = externalUser.balance; // Синхронизируем баланс с платформой
    }

    // ИСПРАВЛЕНО: Обновляем баланс с привязкой к бренду
    try {
        await state.updateBalance(player.username, partnerId, player.balance);
    }
    catch (e) {}

    res.json({
        username: player.username,
        partnerId: partnerId,
        balance: player.balance,
        // ИСПРАВЛЕНО: Отдаем изолированные банки и конфиги для этого сайта
        jackpot: state.getJackpot(partnerId),
        config: state.getConfig(partnerId)
    });
});

// ПРЯМОЙ ДЕМО-ВХОД (Для тестов и презентаций инвесторам)
router.post('/auth', async (req, res) => {
    const { username, partnerId } = req.body;

    if (!username || typeof username !== 'string') {
        return res.status(400).json({ error: "Username is required" });
    }
    // Если партнер не указан, ставим дефолтную заглушку для демонстрации
    const targetPartnerId = partnerId || "demo_skin_default";

    try {
        // ИСПРАВЛЕНО: Инициализируем демо-игрока внутри нужного скина
        const player = await state.getOrCreatePlayer(username.trim(), targetPartnerId);

        res.json({
            username: player.username,
            partnerId: targetPartnerId,
            balance: player.balance,
            // ИСПРАВЛЕНО: Изолируем выдачу под текущий скин
            jackpot: state.getJackpot(targetPartnerId),
            config: state.getConfig(targetPartnerId)
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Database error during direct auth" });
    }
});

module.exports = router;
const express = require('express');
const router = express.Router();
const crypto = require('crypto');

const state = require('../state');
const seamless = require('../services/seamlessService');
const showcase = require('../controllers/showcaseController');

// ПОСРЕДНИК АВТОРИЗАЦИИ (Изолирует игрока на основе пары username + partnerId)
router.checkPlayer = async (req, res, next) => {
    const { username, sessionId } = req.body;
    // Поддерживаем извлечение токена/партнера из любых типов входящих запросов
    const partnerId = req.body.partnerId || req.headers['x-partner-id'] || req.query.partnerId;

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
        // ИСПРАВЛЕНО: Передаем функцию валидации сессии шлюза третьим аргументом.
        // Теперь стейт при авторизации сам заберет баланс с Render платформы!
        const player = await state.getOrCreatePlayer(username.trim(), partnerId, async () => {
            if (sessionId) {
                return await seamless.validateSession(sessionId, partnerId);
            }
            return null;
        });

        req.player = player;
        req.username = player.username;
        req.partnerId = partnerId;
        req.sessionId = sessionId || (req.headers['x-session-id'] || null); // Пробрасываем сессию в req для игр

        if (sessionId) {
            player.sessionId = sessionId;
        }

        next();
    } catch (err) {
        console.error("Auth middleware synchronization error:", err.message);
        res.status(500).json({ error: "Database error during player synchronization" });
    }
};

// БЕСШОВНЫЙ ВХОД (Seamless Webhook для внешних операторов)
router.post('/auth/seamless', async (req, res) => {
    const { sessionId, partnerId } = req.body;
    if (!sessionId) return res.status(400).json({ error: "Session ID required" });
    if (!partnerId) return res.status(400).json({ error: "Partner ID required for B2B routing" });

    try {
        // Идем к конкретной внешней платформе проверять токен (передаем partnerId)
        let externalUser = await seamless.validateSession(sessionId, partnerId);

        // Исправлено: безопасный фолбэк перенесен выше критических проверок
        if (!externalUser || !externalUser.username) {
            externalUser = { username: 'Player1', balance: 200 };
        }

        // Создаем/обновляем локальный кэш игрока под нужного партнера,
        // передавая колбэком уже готовые данные внешней сессии, чтобы не делать повторный HTTP-запрос
        const player = await state.getOrCreatePlayer(externalUser.username, partnerId, async () => {
            return externalUser;
        });

        player.sessionId = sessionId;

        // Принудительно синхронизируем баланс NeDB с тем, что прислал шлюз
        const freshBalance = externalUser.balance !== undefined ? Number(externalUser.balance) : player.balance;
        await state.updateBalance(player.username, partnerId, freshBalance);

        res.json({
            username: player.username,
            partnerId: partnerId,
            balance: freshBalance,
            sessionId,
            jackpot: state.getJackpot(partnerId),
            config: state.getConfig(partnerId)
        });
    } catch (err) {
        console.error("Seamless Webhook auth error:", err.message);
        res.status(401).json({ error: "Invalid or expired session token" });
    }
});

// ПРЯМОЙ ДЕМО-ВХОД (Для тестов и презентаций инвесторам)
router.post('/auth', async (req, res) => {
    const { username, partnerId } = req.body;

    if (!username || typeof username !== 'string' || username.trim().length < 2) {
        return res.status(400).json({ error: "Username is required (min 2 chars)" });
    }
    const targetPartnerId = partnerId || "demo_mtwtech";

    try {
        // Инициализируем демо-игрока внутри нужного скина.
        // Для демо-входа шлюз не опрашиваем, игрок стартует с балансом по умолчанию из NeDB
        const player = await state.getOrCreatePlayer(username, targetPartnerId);

        const sessionId = 'ss_' + crypto.randomBytes(16).toString('hex');
        global.activePlayerSessions[sessionId] = username;

        setTimeout(() => { delete global.activePlayerSessions[sessionId]; }, 24 * 60 * 60 * 1000);

        res.json({
            username: player.username,
            partnerId: targetPartnerId,
            balance: player.balance,
            sessionId,
            jackpot: state.getJackpot(targetPartnerId),
            config: state.getConfig(targetPartnerId)
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Database error during direct auth" });
    }
});

// Роут привязки реферала
router.post('/auth/link-ref', async (req, res) => {
    const { username, partnerId, refCode } = req.body;
    if (!username || !partnerId || !refCode) {
        return res.status(400).json({ error: "Missing referral data" });
    }

    try {
        const linked = await state.linkReferral(username, partnerId, refCode);
        res.json({ success: linked });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

module.exports = router;
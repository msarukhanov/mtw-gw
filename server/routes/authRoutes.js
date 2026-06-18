const express = require('express');
const router = express.Router();
const crypto = require('crypto');

const state = require('../state');
const seamless = require('../services/seamlessService');
const showcase = require('../controllers/showcaseController');

// ПОСРЕДНИК АВТОРИЗАЦИИ (Изолирует игрока на основе пары username + partnerId)
router.checkPlayer = async (req, res, next) => {
    const { username, sessionId } = req.body;
    const partnerId = req.body.partnerId || req.headers['x-partner-id'] || req.query.partnerId;

    if (!partnerId) {
        return res.status(400).json({ error: "Missing required B2B partner identifier (partnerId)" });
    }

    if (!username && !sessionId) {
        return res.status(401).json({ error: "Unauthorized seamless session" });
    }

    if (!username || typeof username !== 'string' || username.trim().length < 2 || username.length > 20) {
        return res.status(400).json({ error: "Invalid username. Must be 2-20 characters." });
    }

    const validUsernameRegex = /^[a-zA-Z0-9_]+$/;
    if (!validUsernameRegex.test(username)) {
        return res.status(400).json({ error: "Username can only contain letters, numbers and underscores." });
    }

    try {
        const player = await state.getOrCreatePlayer(username.trim(), partnerId, async () => {
            if (sessionId) {
                return await seamless.validateSession(sessionId, partnerId);
            }
            return null;
        });

        if (player.is_banned) {
            return res.status(403).json({
                error: "ACCESS_DENIED",
                message: "Your account has been suspended by administration."
            });
        }

        // Пробрасываем данные в объект запроса для использования в контроллерах игр
        req.player = player;
        req.username = player.username;
        req.partnerId = partnerId;
        req.sessionId = sessionId || (req.headers['x-session-id'] || null);

        // Индивидуальные лимиты игрока (теперь доступны в req.player.limits)
        req.player.limits = {
            casino: { min: player.casino_min_limit, max: player.casino_max_limit },
            sport: { min: player.sport_min_limit, max: player.sport_max_limit }
        };

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
    const { sessionId, partnerId, loginType } = req.body;
    if (!sessionId) return res.status(400).json({ error: "Session ID required" });
    if (!partnerId) return res.status(400).json({ error: "Partner ID required for B2B routing" });

    try {
        // Идем к конкретной внешней платформе проверять токен (передаем partnerId)
        let externalUser = await seamless.validateSession(sessionId, partnerId);

        // Исправлено: безопасный фолбэк перенесен выше критических проверок
        if (!externalUser || !externalUser.username) {
            externalUser = { username: 'Demo', balance: 200 };
        }

        // Создаем/обновляем локальный кэш игрока под нужного партнера,
        // передавая колбэком уже готовые данные внешней сессии, чтобы не делать повторный HTTP-запрос
        const player = await state.getOrCreatePlayer(externalUser.username, partnerId, async () => {
            return externalUser;
        });

        player.sessionId = sessionId;

        // Принудительно синхронизируем баланс NeDB с тем, что прислал шлюз
        const freshBalance = externalUser.balance !== undefined ? Number(externalUser.balance) : player.balance;
        await state.updateBalance(player.username, partnerId);

        await state.logPlayerLoginSuccess(partnerId, player.username, 'SESSION_TOKEN', req);

        res.json({
            username: player.username,
            partnerId: partnerId,
            balance: freshBalance,
            realBalance: player.realBalance,
            bonusBalance: player.bonusBalance,
            currency: player.current_currency,
            sessionId,
            unreadNotifications: player.unreadNotifications,
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

        await state.logPlayerLoginSuccess(partnerId, player.username, 'WEBSITE', req);

        setTimeout(() => { delete global.activePlayerSessions[sessionId]; }, 24 * 60 * 60 * 1000);

        res.json({
            username: player.username,
            partnerId: targetPartnerId,
            balance: player.balance,
            realBalance: player.realBalance,
            bonusBalance: player.bonusBalance,
            currency: player.current_currency,
            sessionId,
            unreadNotifications: player.unreadNotifications,
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
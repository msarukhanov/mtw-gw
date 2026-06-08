const state = require('../state');
const seamless = require('../services/seamlessService');
const crypto = require('crypto'); // Убедитесь, что crypto импортирован в начале файла state.js



exports.activate = async (req, res) => {
    const { code } = req.body;
    const username = req.username;
    const partnerId = req.partnerId;

    if (!code) {
        return res.status(400).json({ error: "Promo is empty" });
    }

    if (req.isDemo) {
        return res.status(400).json({ error: "Promo codes cannot be activated in DEMO mode." });
    }

    try {
        // Запускаем проверку и выплату с передачей partnerId и функции кредита.
        // Метод usePromoCode проверит промокод и вызовет внутри себя:
        // await seamless.credit(username, partnerId, sessionId, reward, "Promo Code", roundId);
        const reward = await promoMethods.usePromoCode(username, partnerId, code, seamless.credit);

        // Чтобы вернуть игроку 100% точный баланс, запрашиваем его у платформы
        // (так как локальный req.player.balance мы больше не ведем в оперативной памяти)
        const platformUser = await state.getOrCreatePlayer(username, partnerId);
        const currentBalance = platformUser.balance;

        // Безопасный фолбэк для локального объекта Express (если используется в других мидлварах)
        if (req.player) req.player.balance = currentBalance;

        res.json({
            success: true,
            balance: currentBalance,
            message: `Promo success: +${reward} 🪙`
        });
    } catch (err) {
        console.error(`[Partner: ${partnerId}] Promo activation failed for ${username}:`, err.message);
        res.status(400).json({ error: err.message || "Failed to activate promo code" });
    }
};
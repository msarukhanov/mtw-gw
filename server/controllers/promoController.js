const state = require('../state');
const seamless = require('../services/seamlessService');

exports.activate = async (req, res) => {
    const { code } = req.body;
    const username = req.username; // Имя авторизованного игрока из мидлвара
    const partnerId = req.partnerId; // Идентификатор партнера из мидлвара

    if (!code) {
        return res.status(400).json({ error: "Promo is empty" });
    }

    try {
        // ИСПРАВЛЕНО: Запускаем проверку и выплату с передачей partnerId
        // Метод usePromoCode проверит код внутри базы этого партнера и вызовет seamless.credit с правильным маршрутом
        const reward = await state.usePromoCode(username, partnerId, code, seamless.credit);

        // Обновляем локальный баланс сессии запроса
        req.player.balance += reward;

        res.json({
            success: true,
            balance: req.player.balance,
            message: `Promo success : +${reward} 🪙`
        });
    } catch (err) {
        res.status(400).json({ error: err.message || "Failed to activate promo code" });
    }
};

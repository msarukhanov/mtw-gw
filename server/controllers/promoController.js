const state = require('../state');
const seamless = require('../services/seamlessService');

exports.activate = async (req, res) => {
    const { code } = req.body;
    const username = req.username; // Имя авторизованного игрока из твоего мидлвара

    if (!code) {
        return res.status(400).json({ error: "Promo is empty" });
    }

    try {
        // Запускаем проверку и выплату
        const reward = await state.usePromoCode(username, code, seamless.credit);

        req.player.balance += reward;

        res.json({ success: true, balance: req.player.balance, message: `Promo success : +${reward} 🪙` });
    } catch (err) {
        res.status(400).json({ error: err.message || "Не удалось активировать промокод" });
    }
};

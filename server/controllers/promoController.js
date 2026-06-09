const state = require('../state');
const seamless = require('../services/seamlessService');
const crypto = require('crypto'); // Убедитесь, что crypto импортирован в начале файла state.js

exports.activate = async (req, res) => {
    const { code } = req.body;
    const { username, partnerId } = req; // из middleware checkPlayer

    const result = await state.usePromoCode(username, partnerId, code, seamless.credit);

    if (!result.success) {
        return res.status(400).json(result);
    }

    res.json(result);
};

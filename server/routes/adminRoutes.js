const express = require('express');
const router = express.Router();
const path = require('path');

const adminController = require('../controllers/adminController');
const checkAdminAuth = require('../middlewares/auth'); // Подключаем защиту
const state = require('../state'); // ИСПРАВЛЕНО: Добавлен импорт модуля state

// Защищаем ВСЕ роуты админки с помощью мидлвара (расшифровывает JWT и вешает req.partnerId)
// router.use(checkAdminAuth);

// Роуты для админ-панели
router.get('/admin/data', adminController.getAdminData);
router.post('/admin/update-config', adminController.updateConfig);
router.post('/admin/update-jackpot', adminController.updateJackpot);
router.post('/admin/update-balance', adminController.updateBalance);
router.post('/admin/end-tournament', adminController.endTournament);
router.post('/admin/add-promocode', adminController.addPromoCode);
router.post('/admin/run-cashback', adminController.runCashback);

router.get('/admin/finance/report', adminController.getFinanceReport)

// Эндпоинты для админки Спортсбука
router.get('/admin/sports/pending', async (req, res) => {
    try {
        const partnerId = req.partnerId || req.query.partnerId || "demo_skin_default";

        // ИСПРАВЛЕНО: Запрашиваем нерассчитанные ставки строго для текущего partnerId
        const bets = await state.getPendingBets(partnerId);
        res.json({ bets });
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch pending sports slips" });
    }
});

router.post('/admin/sports/settle', async (req, res) => {
    const { betId, status } = req.body; // status: "WON" или "LOST"
    const seamless = require('../services/seamlessService');

    try {
        // Метод settleBet внутри state автоматически извлечет из купона нужный partnerId и отправит выплату
        const result = await state.settleBet(betId, status, seamless.credit);
        if (!result) return res.status(404).json({ error: "Bet slip not found or already settled" });

        res.json({ success: true, result });
    } catch (err) {
        res.status(500).json({ error: err.message || "Failed to settle sports ticket" });
    }
});


module.exports = router;

const express = require('express');
const router = express.Router();
const path = require('path');

const adminController = require('../controllers/adminController');
const gameController = require('../controllers/gameController');
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

router.get('/admin/withdrawals', adminController.getAdminWithdrawalsList);
router.post('/admin/withdrawals/process', adminController.processAdminWithdrawalAction);

router.get('/admin/finance/dashboard', adminController.getFinanceDashboard);
router.get('/admin/finance/report', adminController.getFinanceReport);
router.get('/admin/finance/chart', adminController.getAdminChart);
router.get('/admin/bets/report', adminController.getBetReport);

router.get('/admin/players', adminController.getPlayers)
;router.post('/admin/players/update', adminController.updatePlayer);

router.get('/admin/promos', adminController.getPromoCodes);
router.post('/admin/promos/create', adminController.createPromoCode);
router.post('/admin/promos/toggle', adminController.togglePromo);

router.get('/admin/cashback/config', adminController.getCashbackConfig);
router.post('/admin/cashback/config/save', adminController.saveCashbackConfig);
router.post('/admin/cashback/run', adminController.triggerCashback);

router.get('/admin/gamification/config', adminController.getGamificationConfig);
router.post('/admin/gamification/config/save', adminController.saveGamificationConfig);


router.get('/admin/quests', adminController.getAdminQuests);
router.post('/admin/quests/create', adminController.createAdminQuest);
router.post('/admin/quests/delete', adminController.deleteAdminQuest);

router.get('/admin/tournaments', adminController.getAdminTournamentsOverview);
router.post('/admin/tournaments/create', adminController.createAdminTournament);
router.post('/admin/tournament/end', adminController.triggerEndTournament);

router.get('/admin/websites', adminController.getWebsites);
router.post('/admin/websites/create', adminController.createWebsite);
router.post('/admin/websites/update', adminController.updateWebsite);
router.post('/admin/websites/delete', adminController.deleteWebsite);

router.get('/admin/banners', adminController.getBanners);
router.post('/admin/banners/create', adminController.createBanner);
router.post('/admin/banners/update', adminController.updateBanner);
router.post('/admin/banners/delete', adminController.deleteBanner);

router.get('/admin/antifraud', adminController.getAdminAlerts);
router.post('/admin/antifraud/dismiss', adminController.dismissAlert);

router.get('/admin/bonus/welcome', adminController.getWelcomeBonus);
router.post('/admin/bonus/welcome/save', adminController.saveWelcomeBonus);


router.post('/admin/catalog/collection', gameController.adminAddCollection);
router.put('/admin/catalog/collection/:slug', gameController.adminEditCollection);
router.delete('/admin/catalog/collection/:slug', gameController.adminDeleteCollection);

router.post('/admin/catalog/aggregator', gameController.adminUpdateAggregator);
router.post('/admin/catalog/game-setup', gameController.adminUpdateGameSettings);

// Эндпоинты для админки Спортсбука
router.get('/admin/sports/pending', async (req, res) => {
    try {
        const partnerId = req.partnerId || req.query.partnerId || "demo_mtwtech";

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

router.get('/admin/bgs', async (req, res)=>{


    res.json({ success: true, BGS: state.BGS });
});

router.post('/admin/bgs', async (req, res)=>{
    const { service, status } = req.body;

    switch (service) {
        case 'sport':
            state.setBGS('sport', status);
            if(status) {
                const vfootball = require('../vfootball');
                vfootball.startEngine(5000, io);
            }
            break;
        case 'crash':
            state.setBGS('crash', status);
            if(status) {
                const { initCrashService } = require('../services/crashService');
                initCrashService(io);
            }
            break;
        case 'lottery':
            state.setBGS('lottery', status);
            if(status) {
                const { initLotteryService } = require('../services/lotteryService');
                initLotteryService(io);
            }
            break;
        case 'roulette':
            state.setBGS('roulette', status);
            if(status) {
                const { initRouletteService } = require('../services/rouletteService');
                initRouletteService(io);
            }
            break;
    }
});


module.exports = router;

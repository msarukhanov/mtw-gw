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
router.get('/data', adminController.getAdminData);
router.post('/update-config', adminController.updateConfig);
// router.post('/update-jackpot', adminController.updateJackpot);
router.post('/update-balance', adminController.updateBalance);
router.post('/end-tournament', adminController.endTournament);
router.post('/add-promocode', adminController.addPromoCode);
router.post('/run-cashback', adminController.runCashback);

router.get('/jackpots/list', adminController.getAdminJackpots);
router.post('/jackpots/save', adminController.saveAdminJackpotRow);

router.get('/withdrawals', adminController.getAdminWithdrawalsList);
router.post('/withdrawals/process', adminController.processAdminWithdrawalAction);

router.get('/finance/dashboard', adminController.getFinanceDashboard);
router.get('/finance/report', adminController.getFinanceReport);
router.get('/finance/chart', adminController.getAdminChart);
router.get('/bets/report', adminController.getBetReport);

router.get('/players', adminController.getPlayers)
;router.post('/players/update', adminController.updatePlayer);
router.get('/players/auth-logs', adminController.getPlayersAuthLogs);

router.get('/promos', adminController.getPromoCodes);
router.post('/promos/create', adminController.createPromoCode);
router.post('/promos/toggle', adminController.togglePromo);

router.get('/cashback/config', adminController.getCashbackConfig);
router.post('/cashback/config/save', adminController.saveCashbackConfig);
router.post('/cashback/run', adminController.triggerCashback);

router.get('/gamification/config', adminController.getGamificationConfig);
router.post('/gamification/config/save', adminController.saveGamificationConfig);


router.get('/quests', adminController.getAdminQuests);
router.post('/quests/create', adminController.createAdminQuest);
router.post('/quests/update', adminController.updateAdminQuest);
router.post('/quests/delete', adminController.deleteAdminQuest);

router.get('/tournaments', adminController.getAdminTournamentsOverview);
router.post('/tournaments/create', adminController.createAdminTournament);
router.post('/tournament/end', adminController.triggerEndTournament);

router.get('/websites', adminController.getWebsites);
router.post('/websites/create', adminController.createWebsite);
router.post('/websites/update', adminController.updateWebsite);
router.post('/websites/delete', adminController.deleteWebsite);

router.get('/websites/translations', adminController.getWebsiteTranslationConfig);
router.post('/websites/translations/save', adminController.saveWebsiteTranslationConfig);

router.get('/analytics/online', adminController.getAdminOnlineAnalytics);

router.get('/banners', adminController.getBanners);
router.post('/banners/create', adminController.createBanner);
router.post('/banners/update', adminController.updateBanner);
router.post('/banners/delete', adminController.deleteBanner);

router.get('/achievements', adminController.getAdminAchievements);
router.post('/achievements/create', adminController.createAdminAchievement);
router.post('/achievements/update', adminController.updateAdminAchievement);
router.post('/achievements/delete', adminController.deleteAdminAchievement);

router.get('/clans/quests', adminController.getAdminClanQuests);
router.post('/clans/quests/create', adminController.createAdminClanQuest);

router.get('/antifraud', adminController.getAdminAlerts);
router.post('/antifraud/dismiss', adminController.dismissAlert);

router.get('/bonus/welcome', adminController.getWelcomeBonus);
router.post('/bonus/welcome/save', adminController.saveWelcomeBonus);


router.post('/catalog/collection', gameController.adminAddCollection);
router.put('/catalog/collection/:slug', gameController.adminEditCollection);
router.delete('/catalog/collection/:slug', gameController.adminDeleteCollection);

router.post('/catalog/aggregator', gameController.adminUpdateAggregator);
router.post('/catalog/game-setup', gameController.adminUpdateGameSettings);

// Эндпоинты для админки Спортсбука
router.get('/sports/pending', async (req, res) => {
    try {
        const partnerId = req.partnerId || req.query.partnerId || "demo_mtwtech";

        // ИСПРАВЛЕНО: Запрашиваем нерассчитанные ставки строго для текущего partnerId
        const bets = await state.getPendingBets(partnerId);
        res.json({ bets });
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch pending sports slips" });
    }
});

router.post('/sports/settle', async (req, res) => {
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

router.get('/bgs', async (req, res)=>{


    res.json({ success: true, BGS: state.BGS });
});

router.post('/bgs', async (req, res)=>{
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

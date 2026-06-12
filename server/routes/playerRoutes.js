const express = require('express');
const router = express.Router();
const path = require('path');


const auth = require('./authRoutes'); // импорт middleware
const state = require('../state'); // ИСПРАВЛЕНО: Добавлен импорт модуля state

const playerController = require('../controllers/playerController');
const paymentController = require('../controllers/paymentController');

router.post('/', auth.checkPlayer, playerController.login);
router.post('/info', auth.checkPlayer, playerController.getUserProfile);
router.post('/history', auth.checkPlayer, playerController.getUserHistory);
router.post('/change-password', auth.checkPlayer, playerController.changePassword);

router.post('/notifications', auth.checkPlayer, playerController.getPlayerNotificationsList);
router.post('/notifications/read', auth.checkPlayer, playerController.markNotificationsAsRead);

router.post('/gamification', auth.checkPlayer, playerController.getGamificationOverview);
router.post('/gamification/claim', auth.checkPlayer, playerController.claimQuestReward);

router.post('/wallets', auth.checkPlayer, playerController.getPlayerWalletsList);
router.post('/wallets/switch', auth.checkPlayer, playerController.switchActiveWallet);

router.post('/deposit/init', auth.checkPlayer, paymentController.initiateDeposit);
router.post('/withdraw/init', auth.checkPlayer, paymentController.initiateWithdraw);

router.post('/stats', auth.checkPlayer, playerController.getPlayerStats);

router.post('/clan/create', auth.checkPlayer, playerController.playerCreateClan);
router.get('/clan/list', playerController.getPublicClansList);
router.post('/clan/join', auth.checkPlayer, playerController.playerJoinClan);


module.exports = router;

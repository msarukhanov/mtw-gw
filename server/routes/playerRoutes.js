const express = require('express');
const router = express.Router();
const path = require('path');

const playerController = require('../controllers/playerController');
const auth = require('./authRoutes'); // импорт middleware
const state = require('../state'); // ИСПРАВЛЕНО: Добавлен импорт модуля state

const paymentController = require('../controllers/paymentController');

router.post('/player', auth.checkPlayer, playerController.login);
router.post('/info', auth.checkPlayer, playerController.getUserProfile);
router.post('/history', auth.checkPlayer, playerController.getUserHistory);
router.post('/change-password', auth.checkPlayer, playerController.changePassword);
router.post('/gamification', auth.checkPlayer, playerController.getGamificationOverview);
router.post('/gamification/claim', auth.checkPlayer, playerController.claimQuestReward);

router.post('/deposit/init', auth.checkPlayer, paymentController.initiateDeposit);
router.post('/withdraw/init', auth.checkPlayer, paymentController.initiateWithdraw);


module.exports = router;

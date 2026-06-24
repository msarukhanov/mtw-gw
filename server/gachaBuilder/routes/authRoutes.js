const express = require('express');
const router = express.Router();

const authController = require('../controllers/authController');
const playerController = require('../controllers/playerController');

router.get('/init-game', authController.initGame);
router.post('/login', authController.login);
router.post('/enter', authController.enter);
router.post('/history', playerController.playerHistory);

module.exports = router;
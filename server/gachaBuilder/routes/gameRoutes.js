const express = require('express');
const router = express.Router();
const gameController = require('../controllers/gameController');

router.get('/leaderboard', gameController.getLeaderboard);
router.get('/idle/pending', gameController.getPendingIdle);
router.post('/idle/claim', gameController.claimIdle);
router.post('/change-resources', gameController.changeResources);

router.post('/dialog/save', gameController.saveDialog);

module.exports = router;

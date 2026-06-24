const express = require('express');
const router = express.Router();

const battleController = require('../controllers/battleController');

router.post('/pve/campaign', battleController.pve);
router.post('/pve/tower', battleController.pve);

router.get('/pve/boss/statuses', battleController.getBossStatuses);
router.post('/pve/boss', battleController.boss);

router.post('/pve/event', battleController.pve);

router.get('/pvp/opponents', battleController.getOpponents);
router.post('/pvp', battleController.pvp);



router.get('/pvp/arena-line', battleController.getArenaLineRoute);
router.post('/pvp/bet', battleController.placeArenaBetRoute);
router.post('/pvp/arena-generate', battleController.triggerArenaGeneration);

module.exports = router;
const express = require('express');
const router = express.Router();

const authController = require('../controllers/authController');
const inventoryController = require('../controllers/inventoryController');
const itemsController = require('../controllers/itemsController');
const playerController = require('../controllers/playerController');

router.get('/init-game', authController.initGame);
router.post('/login', authController.login);
router.post('/enter', authController.enter);

module.exports = router;
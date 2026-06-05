const express = require('express');
const router = express.Router();
const state = require('../state');
const auth = require('./authRoutes'); // импорт middleware

const sportsController = require('../controllers/sportsController');

router.get('/sports/line', sportsController.getLine);
router.post('/sports/bet', sportsController.placeBet);

module.exports = router;

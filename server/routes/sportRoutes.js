const express = require('express');
const router = express.Router();
const state = require('../state');
const auth = require('./authRoutes'); // импорт middleware

const sportsController = require('../controllers/sportsController');

router.get('/sports/line', sportsController.getLine);
router.post('/sports/bet', sportsController.placeBet);

router.get('/sports/my-bets', sportsController.userBets);

// 2. Роут для получения текущей динамической стоимости кэшаута
// GET /api/sports/cashout-value?betId=sports_bet_123
router.get('/sports/cashout-value', sportsController.cashoutValue);

// 3. Роут для подтверждения и выполнения кэшаута (списания/начисления)
// POST /api/sports/cashout
router.post('/sports/cashout', sportsController.cashout);

router.get('/sports/results', sportsController.results);

module.exports = router;

const express = require('express');
const router = express.Router();
const state = require('../state');
const auth = require('./authRoutes'); // импорт middleware
const checkSession = require('../middlewares/session'); // импорт middleware

// Импорт контроллеров
const game = require('../controllers/gameController');

const slots3x3 = require('../controllers/slots3x3Controller');
const slots5x3 = require('../controllers/slots5x3Controller');
const wheel = require('../controllers/wheelController');
const roulette = require('../controllers/rouletteController');
const lottery = require('../controllers/lotteryController');
const scratch = require('../controllers/scratchController');
const mines = require('../controllers/minesController');
const crash = require('../controllers/crashController');
const dice = require('../controllers/diceController');
const hilo = require('../controllers/hiloController');
const blackjack = require('../controllers/blackjackController');
const holdem = require('../controllers/holdemController');
const leaderboard = require('../controllers/leaderboardController');
const promo = require('../controllers/promoController');

router.get('/catalog/collections', game.getCollections);
router.get('/catalog/categories', game.getAllCategories);
router.get('/catalog/providers', game.getAllProviders);
router.get('/catalog/collection/:slug', game.getGamesByCollection);
router.get('/catalog/category/:categoryName', game.getGamesByCategory);

// Роут запуска игры. B2B операторы будут вызывать его со своего бэкенда, чтобы получить ссылку для iFrame
router.post('/game/:gameSlug/launch', game.launchGame);


// Публичный эндпоинт таблицы лидеров
router.get('/leaderboard', leaderboard.getTop);
router.post('/promo/activate', auth.checkPlayer, promo.activate);

router.post('/slots5x3/spin', checkSession, slots5x3.spin);
router.post('/slots5x3/buy-bonus', checkSession, slots5x3.buyBonus);

router.post('/slots3x3/spin', checkSession, slots3x3.spin);

router.post('/hilo/turn', checkSession, hilo.turn);

router.post('/dice/roll', checkSession, dice.roll);

router.post('/crash/bet', checkSession, crash.placeBet);
router.post('/crash/cashout', checkSession, crash.cashout);

router.post('/blackjack/deal', checkSession, blackjack.deal);
router.post('/blackjack/action', checkSession, blackjack.action);

router.post('/holdem/spin', checkSession, holdem.spinHoldem);

router.post('/roulette/bet', checkSession, roulette.placeBet);

router.post('/wheel/spin', checkSession, wheel.spin);
router.post('/scratch/buy', checkSession, scratch.buy);

router.post('/mines/start', checkSession, mines.start);
router.post('/mines/open', checkSession, mines.openCell);
router.post('/mines/cashout', checkSession, mines.cashout);

router.post('/lottery/buy', checkSession, lottery.buy);
router.get('/lottery/history', lottery.history);

// Эндпоинт получения единой истории всех игр для игрока
router.post('/player/history', auth.checkPlayer, async (req, res) => {
    try {
        const history = await state.getPlayerHistory(req.username);
        res.json({ history });
    } catch (err) {
        res.status(500).json({ error: "Failed to load general history" });
    }
});

module.exports = router;

const express = require('express');
const router = express.Router();
const state = require('../state');
const auth = require('./authRoutes'); // импорт middleware

// Импорт контроллеров
const slots3x3 = require('../controllers/slots3x3Controller');
const slots5x3 = require('../controllers/slots5x3Controller');
const wheel = require('../controllers/wheelController');
const scratch = require('../controllers/scratchController');
const mines = require('../controllers/minesController');
const crash = require('../controllers/crashController');
const dice = require('../controllers/diceController');
const hilo = require('../controllers/hiloController');
const leaderboard = require('../controllers/leaderboardController');

// Публичный эндпоинт таблицы лидеров
router.get('/leaderboard', leaderboard.getTop);

// Добавьте к остальным роутам ваших игр
router.post('/slots5x3/spin', auth.checkPlayer, slots5x3.spin);
router.post('/slots3x3/spin', auth.checkPlayer, slots3x3.spin);

// Добавьте к остальным роутам ваших игр
router.post('/hilo/turn', auth.checkPlayer, hilo.turn);

// Добавьте к остальным роутам ваших игр
router.post('/dice/roll', auth.checkPlayer, dice.roll);


router.post('/crash/bet', auth.checkPlayer, crash.placeBet);
router.post('/crash/cashout', auth.checkPlayer, crash.cashout);

// 2. Назначаем защищенные роуты (добавьте к остальным играм)

// Назначаем роуты и защищаем их проверкой игрока (auth.checkPlayer)

router.post('/wheel/spin', auth.checkPlayer, wheel.spin);
router.post('/scratch/buy', auth.checkPlayer, scratch.buy);

router.post('/mines/start', auth.checkPlayer, mines.start);
router.post('/mines/open', auth.checkPlayer, mines.openCell);
router.post('/mines/cashout', auth.checkPlayer, mines.cashout);

// Покупка билета лотереи с подгрузкой настроек сервера
router.post('/lottery/buy', auth.checkPlayer, async (req, res) => {
    const { numbers } = req.body;

    // Подтягиваем конфиг лотереи
    const config = state.getConfig().lottery;

    // ВАЛИДАЦИЯ БИЛЕТА НА ОСНОВЕ КОНФИГА
    if (!numbers || !Array.isArray(numbers) || numbers.length !== config.neededChoices) {
        return res.status(400).json({ error: `You must select exactly ${config.neededChoices} numbers.` });
    }

    const numbersSet = new Set();
    for (let num of numbers) {
        // Проверяем диапазон чисел (от 1 до totalNumbers, то есть до 49)
        if (!Number.isInteger(num) || num < 1 || num > config.totalNumbers) {
            return res.status(400).json({ error: `Numbers must be integers between 1 and ${config.totalNumbers}.` });
        }
        numbersSet.add(num);
    }

    if (numbersSet.size !== config.neededChoices) {
        return res.status(400).json({ error: "Duplicate numbers are not allowed." });
    }

    // Списание стоимости билета на основе цены из конфига (ticketPrice)
    if (req.player.balance < config.ticketPrice) {
        return res.status(400).json({ error: "Insufficient funds." });
    }

    req.player.balance -= config.ticketPrice;

    // Сохраняем новый баланс в NeDB и добавляем 2 монеты в джекпот
    await state.updateBalance(req.username, req.player.balance);
    await state.savePlayerActionHistory(req.username, {
        game: "Lottery",
        details: `Bought ticket: [ ${numbers.join(', ')} ]`,
        change: `-${config.ticketPrice} 🪙`,
        win: false
    });

    state.addJackpot(2);

    req.player.tickets.push(numbers.sort((a,b) => a-b));

    res.json({ balance: req.player.balance, jackpot: state.getJackpot() });
});


// Эндпоинт получения глобальной истории лотерейных тиражей
router.get('/lottery/history', async (req, res) => {
    try {
        const history = await state.getLotteryHistory(20); // Запрашиваем последние 20 игр
        res.json({ history });
    } catch (err) {
        res.status(500).json({ error: "Failed to load history" });
    }
});

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

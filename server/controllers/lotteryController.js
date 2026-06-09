const crypto = require('crypto');
const state = require('../state');
const seamless = require('../services/seamlessService'); // Подключите ваш сервис

exports.getTop = async (req, res) => {
    try {
        const partnerId = req.partnerId;
        const type = req.query.type || 'balance';
        const leaderboard = await state.getLeaderboard(partnerId, type, 10);
        res.json({ success: true, leaderboard });
    } catch (err) {
        console.error(`[Partner Leaderboard Error]:`, err);
        res.status(500).json({ error: "Failed to load leaderboard database" });
    }
};

exports.buy = async (req, res) => {
    const { numbers } = req.body;
    const partnerId = req.partnerId;
    const username = req.username;
    const sessionId = req.sessionId || req.headers['x-session-id']; // Извлекаем сессию

    // Подтягиваем конфиг лотереи
    const config = state.getConfig().lottery;

    // ВАЛИДАЦИЯ БИЛЕТА НА ОСНОВЕ КОНФИГА
    if (!numbers || !Array.isArray(numbers) || numbers.length !== config.neededChoices) {
        return res.status(400).json({ error: `You must select exactly ${config.neededChoices} numbers.` });
    }

    const numbersSet = new Set();
    for (let num of numbers) {
        if (!Number.isInteger(num) || num < 1 || num > config.totalNumbers) {
            return res.status(400).json({ error: `Numbers must be integers between 1 and ${config.totalNumbers}.` });
        }
        numbersSet.add(num);
    }

    if (numbersSet.size !== config.neededChoices) {
        return res.status(400).json({ error: "Duplicate numbers are not allowed." });
    }

    // Генерируем уникальный ID раунда (транзакции покупки билета)
    const roundId = 'lot_' + crypto.randomBytes(8).toString('hex');
    const gameName = "Lottery";

    let debitResult;
    try {
        // Списываем стоимость билета через HTTP-запрос дебита к платформе вместо RAM
        debitResult = await seamless.debit(req.player, username, partnerId, sessionId, config.ticketPrice, gameName, roundId);
        if(debitResult.error) {
            return res.status(400).json(debitResult);
        }
    } catch (err) {
        return res.status(400).json({ error: err.message || "Insufficient funds or platform error" });
    }

    const currentBalance = debitResult.balance;

    // Сохраняем историю действий и добавляем 2 монеты в джекпот
    await state.savePlayerActionHistory(username, partnerId, {
        game: "Lottery",
        details: `Bought ticket: [ ${numbers.join(', ')} ]`,
        change: `-${config.ticketPrice} 🪙`,
        win: false
    });

    state.addJackpot(2);

    req.player.tickets.push(numbers.sort((a,b) => a-b));

    res.json({ balance: currentBalance, jackpot: state.getJackpot() });
};

exports.history = async (req, res) => {
    try {
        const history = await state.getLotteryHistory(20);
        res.json({ history });
    } catch (err) {
        res.status(500).json({ error: "Failed to load history" });
    }
};
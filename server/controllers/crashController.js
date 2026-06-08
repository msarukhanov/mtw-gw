const state = require('../state');
const crashService = require('../services/crashService');
const seamlessService = require('../services/seamlessService'); // Подключите ваш сервис

exports.placeBet = async (req, res) => {
    const { bet } = req.body;
    const partnerId = req.partnerId;
    const username = req.username;
    const sessionId = req.sessionId || req.headers['x-session-id']; // Извлекаем сессию

    if (crashService.getStatus() !== "betting") {
        return res.status(400).json({ error: "Bets are closed for this round. Wait for next flight." });
    }
    if (!Number.isInteger(bet) || bet <= 0) {
        return res.status(400).json({ error: "Invalid bet amount" });
    }

    // Проверяем ставки раунда конкретно для текущего партнера
    if (state.getCrashBets(partnerId)[username]) {
        return res.status(400).json({ error: "You already placed a bet for this round" });
    }

    // Получаем ID текущего раунда из вашего сервиса Крэша
    const roundId = crashService.getRoundId ? crashService.getRoundId() : 'crash_round';
    const gameName = "Crash";

    let debitResult;
    try {
        // Списание баланса через HTTP-запрос вместо RAM
        debitResult = await seamlessService.debit(username, partnerId, sessionId, bet, gameName, roundId);
    } catch (err) {
        return res.status(400).json({ error: err.message || "Insufficient funds or platform error" });
    }

    const currentBalance = debitResult.balance;

    // Заносим деньги в изолированный банк игры текущего партнера
    state.addCrashBank(partnerId, bet);
    state.addCrashBet(username, partnerId, bet);

    // Добавляем игрока в полет в рамках текущего бренда
    state.addPlayerToFlight(username, partnerId);

    res.json({ message: "Bet accepted", balance: currentBalance });
};

exports.cashout = async (req, res) => {
    const partnerId = req.partnerId;
    const username = req.username;
    const sessionId = req.sessionId || req.headers['x-session-id']; // Извлекаем сессию

    if (crashService.getStatus() !== "flying") {
        return res.status(400).json({ error: "Game is not in flight" });
    }

    // Проверяем игроков в полете конкретно для этого партнера
    const activeInFlight = state.getActiveInFlight(partnerId);
    if (!activeInFlight[username]) {
        return res.status(400).json({ error: "You are not in flight or already cashed out" });
    }

    // Забираем ставку из пула текущего партнера
    const currentBets = state.getCrashBets(partnerId);
    const playerBet = currentBets[username];
    const winMultiplier = crashService.getMultiplier();

    // Вычисляем сумму выигрыша
    const winAmount = Math.floor(playerBet * winMultiplier);

    const roundId = crashService.getRoundId ? crashService.getRoundId() : 'crash_round';
    const gameName = "Crash";

    // Начисляем на баланс через HTTP-запрос к платформе
    const creditResult = await seamlessService.credit(username, partnerId, sessionId, winAmount, gameName, roundId);
    const currentBalance = creditResult.balance;

    // Забираем из изолированного банка партнера
    state.reduceCrashBank(partnerId, winAmount);

    // Фиксируем кэшаут в графическом сервисе
    crashService.forceRegisterCashout(username, winMultiplier);

    // Удаляем игрока из полета в рамках текущего бренда
    state.removePlayerFromFlight(username, partnerId);

    // Запись в единую ленту истории действий с передачей partnerId
    await state.savePlayerActionHistory(username, partnerId, {
        game: "Crash",
        details: `Cashed out at ${winMultiplier}x`,
        change: `+${winAmount} 🪙`,
        win: true
    });

    res.json({ message: "Cashed out successfully", prize: winAmount, balance: currentBalance });
};


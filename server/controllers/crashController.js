const state = require('../state');
const crashService = require('../services/crashService');

// 1. СДЕЛАТЬ СТАВКУ
exports.placeBet = async (req, res) => {
    const { bet } = req.body;

    if (crashService.getStatus() !== "betting") {
        return res.status(400).json({ error: "Bets are closed for this round. Wait for next flight." });
    }
    if (!Number.isInteger(bet) || bet <= 0) {
        return res.status(400).json({ error: "Invalid bet amount" });
    }
    if (req.player.balance < bet) {
        return res.status(400).json({ error: "Insufficient funds" });
    }
    if (state.getCrashBets()[req.username]) {
        return res.status(400).json({ error: "You already placed a bet for this round" });
    }

    // Списание баланса
    req.player.balance -= bet;
    await state.updateBalance(req.username, req.player.balance);

    // Заносим деньги в банк игры (RTP-копилка)
    state.addCrashBank(bet);
    state.addCrashBet(req.username, bet);

    res.json({ message: "Bet accepted", balance: req.player.balance });
};

// 2. НАЖАТИЕ КНОПКИ КЭШАУТ (ЗАБРАТЬ В ПОЛЕТЕ)
exports.cashout = async (req, res) => {
    if (crashService.getStatus() !== "flying") {
        return res.status(400).json({ error: "Game is not in flight" });
    }

    const activeInFlight = state.getActiveInFlight();
    if (!activeInFlight[req.username]) {
        return res.status(400).json({ error: "You are not in flight or already cashed out" });
    }

    const currentBets = state.getCrashBets();
    const playerBet = currentBets[req.username];
    const winMultiplier = crashService.getMultiplier();

    // Вычисляем сумму выигрыша
    const winAmount = Math.floor(playerBet * winMultiplier);

    // Начисляем на баланс и забираем из банка RTP
    req.player.balance += winAmount;
    await state.updateBalance(req.username, req.player.balance);
    state.reduceCrashBank(winAmount);

    // Удаляем игрока из списка летящих
    state.removePlayerFromFlight(req.username);

    // Запись в единую ленту истории действий
    await state.savePlayerActionHistory(req.username, {
        game: "Crash",
        details: `Cashed out at ${winMultiplier}x`,
        change: `+${winAmount} 🪙`,
        win: true
    });

    res.json({ message: "Cashed out successfully", prize: winAmount, balance: req.player.balance });
};

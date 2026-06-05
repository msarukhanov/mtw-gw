const state = require('../state');
const crashService = require('../services/crashService');
// Если используется шлюз интеграции, раскомментируй строку ниже:
// const seamless = require('../services/seamlessService');

exports.placeBet = async (req, res) => {
    const { bet } = req.body;
    const partnerId = req.partnerId; // Извлекаем partnerId, добавленный мидлваром checkPlayer
    const username = req.username;

    if (crashService.getStatus() !== "betting") {
        return res.status(400).json({ error: "Bets are closed for this round. Wait for next flight." });
    }
    if (!Number.isInteger(bet) || bet <= 0) {
        return res.status(400).json({ error: "Invalid bet amount" });
    }
    if (req.player.balance < bet) {
        return res.status(400).json({ error: "Insufficient funds" });
    }

    // ИСПРАВЛЕНО: Проверяем ставки раунда конкретно для текущего партнера
    if (state.getCrashBets(partnerId)[username]) {
        return res.status(400).json({ error: "You already placed a bet for this round" });
    }

    // Списание баланса в локальном кэше B2B
    req.player.balance -= bet;
    await state.updateBalance(username, partnerId, req.player.balance);

    // ИСПРАВЛЕНО: Заносим деньги в изолированный банк игры текущего партнера
    state.addCrashBank(partnerId, bet);
    state.addCrashBet(username, partnerId, bet);

    // Добавляем игрока в полет в рамках текущего бренда
    state.addPlayerToFlight(username, partnerId);

    res.json({ message: "Bet accepted", balance: req.player.balance });
};

exports.cashout = async (req, res) => {
    const partnerId = req.partnerId;
    const username = req.username;

    if (crashService.getStatus() !== "flying") {
        return res.status(400).json({ error: "Game is not in flight" });
    }

    // ИСПРАВЛЕНО: Проверяем игроков в полете конкретно для этого партнера
    const activeInFlight = state.getActiveInFlight(partnerId);
    if (!activeInFlight[username]) {
        return res.status(400).json({ error: "You are not in flight or already cashed out" });
    }

    // ИСПРАВЛЕНО: Забираем ставку из пула текущего партнера
    const currentBets = state.getCrashBets(partnerId);
    const playerBet = currentBets[username];
    const winMultiplier = crashService.getMultiplier();

    // Вычисляем сумму выигрыша
    const winAmount = Math.floor(playerBet * winMultiplier);

    // Начисляем на баланс и забираем из изолированного банка партнера
    req.player.balance += winAmount;
    await state.updateBalance(username, partnerId, req.player.balance);
    state.reduceCrashBank(partnerId, winAmount);

    // Фиксируем кэшаут в графическом сервисе
    crashService.forceRegisterCashout(username, winMultiplier);

    // ИСПРАВЛЕНО: Удаляем игрока из полета в рамках текущего бренда
    state.removePlayerFromFlight(username, partnerId);

    // ИСПРАВЛЕНО: Запись в единую ленту истории действий с передачей partnerId
    await state.savePlayerActionHistory(username, partnerId, {
        game: "Crash",
        details: `Cashed out at ${winMultiplier}x`,
        change: `+${winAmount} 🪙`,
        win: true
    });

    res.json({ message: "Cashed out successfully", prize: winAmount, balance: req.player.balance });
};

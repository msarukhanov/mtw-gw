const crypto = require('crypto');
const state = require('../state');
const rouletteService = require('../services/rouletteService');
const seamless = require('../services/seamlessService'); // Подключите ваш сервис

exports.placeBet = async (req, res) => {
    const { betAmount, betType, betValue } = req.body;
    const partnerId = req.partnerId;
    const username = req.username;
    const sessionId = req.sessionId || req.headers['x-session-id']; // Извлекаем сессию

    // 1. Проверяем, открыт ли прием ставок в рулетке
    if (rouletteService.getStatus() !== "betting") {
        return res.status(400).json({ error: "Bets are closed for this round. Wheel is spinning." });
    }

    // 2. Валидация входных данных суммы
    if (!Number.isInteger(betAmount) || betAmount <= 0) {
        return res.status(400).json({ error: "Invalid bet amount" });
    }

    // 3. Валидация типов ставок
    if (!['color', 'parity'].includes(betType)) {
        return res.status(400).json({ error: "Invalid bet type" });
    }

    // 4. Валидация значений ставок
    if (betType === 'color' && !['red', 'black'].includes(betValue)) {
        return res.status(400).json({ error: "Invalid color value. Choose red or black." });
    }
    if (betType === 'parity' && !['even', 'odd'].includes(betValue)) {
        return res.status(400).json({ error: "Invalid parity value. Choose even or odd." });
    }

    // 6. Защита от повторной ставки
    const currentBets = rouletteService.getRouletteBets(partnerId) || {};
    if (currentBets[username]) {
        return res.status(400).json({ error: "You already placed a bet for this round" });
    }

    // Получаем ID текущего раунда рулетки
    const roundId = rouletteService.getRoundId ? rouletteService.getRoundId() : 'roulette_round';
    const gameName = "Roulette";

    let debitResult;
    try {
        // 7. Списание баланса через HTTP-запрос к платформе вместо RAM
        debitResult = await seamless.debit(username, partnerId, sessionId, betAmount, gameName, roundId);
        if(debitResult.error) {
            return res.status(400).json(debitResult);
        }
    } catch (err) {
        return res.status(400).json({ error: err.message || "Insufficient funds or platform error" });
    }

    const currentBalance = debitResult.balance;

    // 8. Фиксация ставки в изолированном банке оператора
    rouletteService.addRouletteBank(partnerId, betAmount);
    rouletteService.addRouletteBet(username, partnerId, {
        betType,
        betValue,
        betAmount
    });

    // Возвращаем успешный ответ и обновленный баланс из HTTP-ответа
    res.json({ message: "Bet accepted", balance: currentBalance });
};


const state = require('../state');
const rouletteService = require('../services/rouletteService');

exports.placeBet = async (req, res) => {
    // betType может быть 'color' или 'parity'
    // betValue соответственно: 'red'/'black' или 'even'/'odd'
    const { betAmount, betType, betValue } = req.body;
    const partnerId = req.partnerId; // Извлекаем partnerId, добавленный мидлваром checkPlayer
    const username = req.username;

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

    // 5. Проверка баланса игрока
    if (req.player.balance < betAmount) {
        return res.status(400).json({ error: "Insufficient funds" });
    }

    // 6. Защита от повторной ставки (если у вас по правилам одна ставка на раунд)
    const currentBets = rouletteService.getRouletteBets(partnerId) || {};
    if (currentBets[username]) {
        return res.status(400).json({ error: "You already placed a bet for this round" });
    }

    // 7. Списание баланса в локальном кэше B2B (как в Краше)
    req.player.balance -= betAmount;
    await state.updateBalance(username, partnerId, req.player.balance);

    // 8. Фиксация ставки в изолированном банке оператора
    rouletteService.addRouletteBank(partnerId, betAmount);
    rouletteService.addRouletteBet(username, partnerId, {
        betType,
        betValue,
        betAmount
    });

    // Возвращаем успешный ответ и обновленный баланс
    res.json({ message: "Bet accepted", balance: req.player.balance });
};

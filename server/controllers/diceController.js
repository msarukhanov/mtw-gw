const crypto = require('crypto');
const state = require('../state');
const seamlessService = require('../services/seamlessService'); // Подключите ваш сервис

exports.roll = async (req, res) => {
    const { target, condition, bet } = req.body;
    const partnerId = req.partnerId;
    const username = req.username;
    const sessionId = req.sessionId || req.headers['x-session-id']; // Извлекаем сессию

    // Достаем конфигурацию и комиссию (houseEdge) конкретного партнера
    const config = state.getConfig(partnerId).dice;

    // ВАЛИДАЦИЯ ВХОДЯЩИХ ДАННЫХ
    if (!Number.isInteger(bet) || bet <= 0) {
        return res.status(400).json({ error: "Invalid bet amount" });
    }
    if (!Number.isInteger(target) || target < 2 || target > 98) {
        return res.status(400).json({ error: "Target must be between 2 and 98" });
    }
    if (condition !== "over" && condition !== "under") {
        return res.status(400).json({ error: "Invalid condition mode" });
    }

    // РАСЧЕТ ШАНСА И КОЭФФИЦИЕНТА
    let winChance = condition === "over" ? (100 - target) : (target - 1);

    // Расчет множителя на основе houseEdge текущего партнера
    const multiplier = parseFloat(((100 / winChance) * (1 - config.houseEdge)).toFixed(4));
    const potentialPrize = Math.floor(bet * multiplier);

    // Генерируем ID раунда для HTTP-запросов
    const roundId = 'dice_' + crypto.randomBytes(8).toString('hex');
    const gameName = "Dice";

    let debitResult;
    try {
        // Списываем баланс через HTTP-запрос дебита к платформе
        debitResult = await seamlessService.debit(username, partnerId, sessionId, bet, gameName, roundId);
    } catch (err) {
        return res.status(400).json({ error: err.message || "Insufficient funds or platform error" });
    }

    let currentBalance = debitResult.balance;

    // Закидываем ставку в изолированную копилку конкретного партнера
    state.addDiceBank(partnerId, bet);

    // КРИПТО-РАНДОМ (Число от 1 до 100)
    let rollResult = state.getRandomInt(100) + 1;

    // --- ПРОВЕРКА RTP (КОНТРОЛЬ БАНКА ТЕНАНТА) ---
    const currentBank = state.getDiceBank(partnerId);
    let forceLose = false;

    if (potentialPrize > currentBank) {
        forceLose = true;
    }

    if (forceLose) {
        if (condition === "over") {
            rollResult = state.getRandomInt(target - 1) + 1;
        } else {
            rollResult = state.getRandomInt(100 - target) + target;
        }
    }

    // ПРОВЕРКА РЕЗУЛЬТАТА ИГРЫ
    let isWin = false;
    if (condition === "over" && rollResult > target) isWin = true;
    if (condition === "under" && rollResult < target) isWin = true;

    let prize = 0;
    if (isWin) {
        prize = potentialPrize;

        // Выплачиваем строго из банка этого партнера
        state.reduceDiceBank(partnerId, prize);

        // Начисляем выигрыш через HTTP-запрос кредита к платформе
        const creditResult = await seamlessService.credit(username, partnerId, sessionId, prize, gameName, roundId);
        currentBalance = creditResult.balance;
    }

    // Запись в единую историю активности с передачей partnerId
    await state.savePlayerActionHistory(username, partnerId, {
        game: "Dice",
        details: `Rolled ${rollResult} (${condition === "over" ? ">" : "<"} ${target}). Chance: ${winChance}%`,
        change: isWin ? `+${prize} 🪙` : `-${bet} 🪙`,
        win: isWin
    });

    // Возвращаем результат клиенту
    res.json({
        rollResult,
        isWin,
        prize,
        multiplier,
        balance: currentBalance
    });
};

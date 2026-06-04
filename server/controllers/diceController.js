const state = require('../state');

exports.roll = async (req, res) => {
    const { target, condition, bet } = req.body;
    const partnerId = req.partnerId; // Извлекаем partnerId, добавленный мидлваром checkPlayer
    const username = req.username;

    // ИСПРАВЛЕНО: Достаем конфигурацию и комиссию (houseEdge) конкретного партнера
    const config = state.getConfig(partnerId).dice;

    // ВАЛИДАЦИЯ ВХОДЯЩИХ ДАННЫХ
    if (!Number.isInteger(bet) || bet <= 0) {
        return res.status(400).json({ error: "Invalid bet amount" });
    }
    if (req.player.balance < bet) {
        return res.status(400).json({ error: "Insufficient funds" });
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

    // Списываем баланс в рамках B2B-сессии запроса
    req.player.balance -= bet;

    // ИСПРАВЛЕНО: Закидываем ставку в изолированную копилку конкретного партнера
    state.addDiceBank(partnerId, bet);

    // КРИПТО-РАНДОМ (Число от 1 до 100)
    let rollResult = state.getRandomInt(100) + 1;

    // --- ПРОВЕРКА RTP (КОНТРОЛЬ БАНКА ТЕНАНТА) ---
    // ИСПРАВЛЕНО: Проверяем банк строго текущего партнера
    const currentBank = state.getDiceBank(partnerId);
    let forceLose = false;

    // Если у конкретного партнера в банке нет денег — включаем защиту от ухода в минус
    if (potentialPrize > currentBank) {
        forceLose = true;
    }

    // Если сработал слив, подменяем результат
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
        req.player.balance += prize;
        // ИСПРАВЛЕНО: Выплачиваем строго из банка этого партнера
        state.reduceDiceBank(partnerId, prize);
    }

    // ИСПРАВЛЕНО: Сохраняем измененный баланс в NeDB с привязкой к паре Игрок + Партнер
    await state.updateBalance(username, partnerId, req.player.balance);

    // ИСПРАВЛЕНО: Запись в единую историю активности с передачей partnerId
    await state.savePlayerActionHistory(username, partnerId, {
        game: "Dice",
        details: `Rolled ${rollResult} (${condition === "over" ? ">" : "<"} ${target}). Chance: ${winChance}%`,
        change: isWin ? `+${prize} 🪙` : `-${bet} 🪙`,
        win: isWin
    });

    // Возвращаем изолированный результат клиенту
    res.json({
        rollResult,
        isWin,
        prize,
        multiplier,
        balance: req.player.balance
    });
};

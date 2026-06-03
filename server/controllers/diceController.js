const state = require('../state');

exports.roll = async (req, res) => {
    const { target, condition, bet } = req.body; // target (1-100), condition ("over" или "under"), bet (ставка)
    const config = state.getConfig().dice;

    const houseEdge = config.baseRtp/100;

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
    // Сколько выигрышных исходов возможно из 100
    let winChance = condition === "over" ? (100 - target) : (target - 1);

    // Формула чистого множителя: (100 / Шанс) * (1 - Комиссия)
    const multiplier = parseFloat(((100 / winChance) * (1 - houseEdge)).toFixed(4));
    const potentialPrize = Math.floor(bet * multiplier);

    // Списываем баланс и закидываем в копилку
    req.player.balance -= bet;
    state.addDiceBank(bet);

    // КРИПТО-РАНДОМ (Генерируем число от 1 до 100)
    let rollResult = state.getRandomInt(100) + 1;

    // --- ПРОВЕРКА RTP (КОНТРОЛЬ БАНКА) ---
    const currentBank = state.getDiceBank();
    let forceLose = false;

    // Если в банке игры нет денег на выплату приза, включаем подкрутку
    if (potentialPrize > currentBank) {
        forceLose = true;
    }

    // Если сработал слив по RTP, подменяем число на заведомо проигрышное
    if (forceLose) {
        if (condition === "over") {
            // Игроку нужно БОЛЬШЕ target, значит даем ему МЕНЬШЕ target
            rollResult = state.getRandomInt(target - 1) + 1;
        } else {
            // Игроку нужно МЕНЬШЕ target, значит даем ему БОЛЬШЕ target
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
        state.reduceDiceBank(prize); // выплачиваем из копилки
    }

    // Сохраняем измененный баланс в базу данных NeDB
    await state.updateBalance(req.username, req.player.balance);

    // Пишем в единую историю активности
    await state.savePlayerActionHistory(req.username, {
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
        balance: req.player.balance
    });
};

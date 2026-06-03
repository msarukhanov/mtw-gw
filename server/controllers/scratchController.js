const state = require('../state');

exports.buy = async (req, res) => {
    // 1. ИСПРАВЛЕНО: берем правильный конфиг скретч-карт
    const config = state.getConfig().scratch;
    const username = req.username;

    if (req.player.balance < config.cost) {
        return res.status(400).json({ error: "Insufficient funds" });
    }

    // Списываем стоимость билета
    req.player.balance -= config.cost;
    state.addJackpot(3);

    let cells = [];
    let prize = 0;
    let selectedSymbol = '';

    const winChance = state.getRandomInt(100);

    // ФОРМУЛА: рассчитываем границу выигрыша
    // При RTP = 75: выигрыш сработает, если winChance >= 25 (то есть в 75% случаев проигрыш)
    const loseBoundary = Math.max(50, Math.min(95, 100 - (config.rtp * 0.33)));

    if (winChance < 3) {
        // 3% шанс на Джекпот
        selectedSymbol = '👑';
        prize = state.getJackpot();
        state.resetJackpot();
    } else if (winChance < loseBoundary) {
        // ДИНАМИЧЕСКИЙ ПРОИГРЫШ (Ничего не выиграл)
        selectedSymbol = '';
        prize = 0;
    } else {
        // ОБЫЧНЫЙ ВЫИГРЫШ (Приз 40)
        selectedSymbol = config.symbols[state.getRandomInt(config.symbols.length)];
        prize = 40;
    }

    // Генерируем 9 ячеек для карточки
    for (let i = 0; i < 9; i++) {
        if (selectedSymbol && i < 3) {
            // Если игрок выиграл, гарантированно добавляем ровно 3 победных символа
            cells.push(selectedSymbol);
        } else {
            // Для остальных ячеек подбираем символы-пустышки
            let fakePool = config.symbols.filter(s => s !== selectedSymbol);
            let fake = fakePool[state.getRandomInt(fakePool.length)];
            cells.push(fake);
        }
    }

    // Дополнительная проверка безопасности:
    // Если игрок ПРОИГРАЛ, случайно мог сгенерироваться тройной символ пустышки.
    // Ограничим появление одинаковых символов до 2 штук, если это не запланированный выигрыш.
    if (!selectedSymbol) {
        cells = [];
        const s = config.symbols;
        // Просто заполняем карточку так, чтобы ни один символ не повторился 3 раза
        // Каждого символа из пула (5 штук) берем максимум по 2 штуки
        const safePool = [...s, ...s].sort(() => Math.random() - 0.5);
        cells = safePool.slice(0, 9);
    } else {
        // Если выигрыш легитимный, просто перемешиваем ячейки
        cells.sort(() => Math.random() - 0.5);
    }

    // Начисляем приз
    req.player.balance += prize;

    // Сохраняем данные в базу
    await state.updateBalance(username, req.player.balance);
    await state.savePlayerActionHistory(username, {
        game: "Scratch",
        details: `Card cleared`,
        change: prize > 0 ? `+${prize} 🪙` : `-${config.cost} 🪙`,
        win: prize > 0
    });

    res.json({
        cells,
        prize,
        balance: req.player.balance,
        jackpot: state.getJackpot()
    });
};


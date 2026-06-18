const state = require('../state');
const seamless = require('../services/seamlessService');

exports.spin = async (req, res) => {
    const config = state.getConfig().slots;
    const username = req.username;

    if (req.player.balance < config.cost) {
        return res.status(400).json({ error: "Insufficient funds" });
    }

    if(req.player.sessionId) {
        const debitResult = await seamless.debit(req.player, username, req.player.sessionId, config.cost, 'Slots', state.getRandomInt(10000000) + 1);
        if(debitResult.error) {
            return res.status(400).json(debitResult);
        }
    }

    // Списываем ставку сразу
    req.player.balance -= config.cost;

    // Генерируем случайное число от 0 до 99 для определения категории исхода
    const roll = state.getRandomInt(100);
    let results = [];

    // ФОРМУЛА: рассчитываем границу проигрыша на основе RTP
    // При RTP = 80: граница = 100 - (80 * 0.45) = 64 (64% проигрышей)
    // При RTP = 50: граница = 100 - (50 * 0.45) = 77.5 (77.5% проигрышей)
    const loseBoundary = Math.max(40, Math.min(95, 100 - (config.rtp * 0.45)));

    // МАТЕМАТИЧЕСКАЯ НАСТРОЙКА RTP (Всего 100%)
    if (roll < loseBoundary) {
        // 65% шанс: Абсолютный ПРОИГРЫШ (все 3 символа гарантированно разные)
        const s = config.symbols;
        const first = s[state.getRandomInt(s.length)];

        const s2 = s.filter(x => x !== first);
        const second = s2[state.getRandomInt(s2.length)];

        const s3 = s2.filter(x => x !== second);
        const third = s3[state.getRandomInt(s3.length)];

        results = [first, second, third];
    }
    else if (roll < 96) {
        // 31% шанс: Совпадение ДВУХ символов (Выигрыш 25)
        const s = config.symbols;
        const pairSymbol = s[state.getRandomInt(s.length)];

        const s2 = s.filter(x => x !== pairSymbol);
        const thirdSymbol = s2[state.getRandomInt(s2.length)];

        // Перемешиваем массив, чтобы дубликаты не всегда шли первыми двумя элементами
        results = [pairSymbol, pairSymbol, thirdSymbol].sort(() => Math.random() - 0.5);
    }
    else {
        // 4% шанс: Совпадение ТРЕХ символов (Выигрыш 150 или 500 за алмазы)
        const s = config.symbols;
        const winSymbol = s[state.getRandomInt(s.length)];
        results = [winSymbol, winSymbol, winSymbol];
    }

    // Точный расчет приза (исправлены ошибки сравнения индексов)
    let prize = 0;
    if (results[0] === results[1] && results[1] === results[2]) {
        prize = results[0] === '💎' ? 500 : 150;
    } else if (results[0] === results[1] || results[1] === results[2] || results[0] === results[2]) {
        prize = 25;
    }

    // Начисляем выигрыш
    req.player.balance += prize;

    // Сохраняем состояние в базу данных SQLite
    await state.updateBalance(username, req.player.balance);
    await state.savePlayerActionHistory(username, {
        game: "Slots",
        details: `Spin: [ ${results.join(' | ')} ]`,
        change: prize > 0 ? `+${prize} 🪙` : `-${config.cost} 🪙`,
        win: prize > 0
    });

    res.json({
        results,
        prize,
        balance: req.player.balance,
        jackpot: state.getJackpot()
        // Не забывай отправлять username на фронт, если это необходимо
    });
};
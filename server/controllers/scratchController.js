const state = require('../state');

exports.buy = async (req, res) => {
    const partnerId = req.partnerId; // Извлекаем partnerId, добавленный мидлваром checkPlayer
    const username = req.username;

    // ИСПРАВЛЕНО: Берем конфигурацию скретч-карт конкретного партнера
    const config = state.getConfig(partnerId).scratch;

    if (req.player.balance < config.cost) {
        return res.status(400).json({ error: "Insufficient funds" });
    }

    // Списываем стоимость билета в локальном кэше B2B
    req.player.balance -= config.cost;

    // ИСПРАВЛЕНО: Добавляем отчисления в джекпот конкретного партнера
    state.addJackpot(partnerId, 3);

    let cells = [];
    let prize = 0;
    let selectedSymbol = '';

    const winChance = state.getRandomInt(100);

    // ФОРМУЛА: рассчитываем границу выигрыша на основе RTP конкретного бренда
    const loseBoundary = Math.max(50, Math.min(95, 100 - (config.rtp * 0.33)));

    if (winChance < 3) {
        // 3% шанс на Джекпот (ИСПРАВЛЕНО: Списываем из джекпота текущего партнера)
        selectedSymbol = '👑';
        prize = state.getJackpot(partnerId);
        state.resetJackpot(partnerId);
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
            cells.push(selectedSymbol);
        } else {
            let fakePool = config.symbols.filter(s => s !== selectedSymbol);
            let fake = fakePool[state.getRandomInt(fakePool.length)];
            cells.push(fake);
        }
    }

    // Защита от случайного выпадения 3 одинаковых символов при проигрыше
    if (!selectedSymbol) {
        cells = [];
        const s = config.symbols;
        const safePool = [...s, ...s].sort(() => Math.random() - 0.5);
        cells = safePool.slice(0, 9);
    } else {
        cells.sort(() => Math.random() - 0.5);
    }

    // Начисляем выигрыш
    req.player.balance += prize;

    // ИСПРАВЛЕНО: Сохраняем измененный баланс и историю действий с привязкой к partnerId
    await state.updateBalance(username, partnerId, req.player.balance);
    await state.savePlayerActionHistory(username, partnerId, {
        game: "Scratch",
        details: `Card cleared`,
        change: prize > 0 ? `+${prize} 🪙` : `-${config.cost} 🪙`,
        win: prize > 0
    });

    res.json({
        cells,
        prize,
        balance: req.player.balance,
        // ИСПРАВЛЕНО: Возвращаем актуальное состояние джекпота текущего партнера
        jackpot: state.getJackpot(partnerId)
    });
};



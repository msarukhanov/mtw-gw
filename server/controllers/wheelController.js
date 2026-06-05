const state = require('../state');

exports.spin = async (req, res) => {
    const config = state.getConfig().wheel;
    const username = req.username;

    if (req.player.balance < config.cost) {
        return res.status(400).json({ error: "Insufficient funds" });
    }

    // Списываем стоимость кручения
    req.player.balance -= config.cost;
    state.addJackpot(2); // Добавляем в джекпот

    // Роллим шанс от 0 до 999 (для более точной настройки джекпота)
    const roll = state.getRandomInt(1000);
    let targetPrizeType;

    // ФОРМУЛА: распределяем пустые исходы в зависимости от RTP
    // При RTP = 70: шанс пустышки = 105
    // При RTP = 50: шанс пустышки = 105 + (70 - 50) * 8 = 265 (в два раза чаще)
    const emptyChance = 105 + Math.max(0, (70 - config.rtp) * 8);

    // МАТЕМАТИЧЕСКАЯ НАСТРОЙКА ИСХОДОВ (Сумма: 1000)
    if (roll < 5) {
        // 0.5% шанс на JACKPOT (1 раз из 200 вращений в среднем)
        targetPrizeType = 'JACKPOT';
    } else if (roll < 105) {
        // 10% шанс выиграть Double (40 монет)
        targetPrizeType = 40;
    } else if (roll < (105 + emptyChance)) {
        // 10% шанс на Empty (0 монет)
        targetPrizeType = 0;
    } else {
        // 79.5% шанс на обычный сектор (10 монет)
        targetPrizeType = 10;
    }

    // Ищем все сектора в конфиге, которые подходят под наш выигрыш
    const possibleSectors = config.sectors.map((sector, index) => ({ ...sector, index }))
        .filter(s => s.prize === targetPrizeType);

    // Выбираем случайный сектор из подходящих (чтобы стрелка падала на разные сектора с одинаковым призом)
    const selectedSector = possibleSectors[state.getRandomInt(possibleSectors.length)];
    const sectorIndex = selectedSector.index;
    const sector = config.sectors[sectorIndex];

    // Расчет финального приза
    let prize = sector.prize;
    if (prize === 'JACKPOT') {
        prize = state.getJackpot();
        state.resetJackpot();
    }

    // Начисляем баланс
    req.player.balance += prize;

    // Сохраняем в базу данных
    await state.updateBalance(username, req.player.balance);
    await state.savePlayerActionHistory(username, {
        game: "Wheel",
        details: `Sector: ${sector.label}`,
        change: prize > 0 ? `+${prize} 🪙` : `-${config.cost} 🪙`,
        win: prize > 0
    });

    // Возвращаем точный индекс для анимации на фронтенде
    res.json({
        sectorIndex,
        label: sector.label,
        prize,
        balance: req.player.balance,
        jackpot: state.getJackpot()
    });
};


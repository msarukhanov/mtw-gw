const crypto = require('crypto');
const state = require('../state');
const seamless = require('../services/seamlessService'); // Подключите ваш сервис

exports.spin = async (req, res) => {
    const partnerId = req.partnerId; // Извлекаем partnerId, добавленный мидлваром checkPlayer
    const username = req.username;
    const sessionId = req.sessionId || req.headers['x-session-id']; // Извлекаем сессию

    // Достаем конфигурацию конкретного партнера
    const config = state.getConfig(partnerId).wheel;

    // Генерируем уникальный ID раунда для HTTP-запросов
    const roundId = 'wheel_' + crypto.randomBytes(8).toString('hex');
    const gameName = "Wheel";

    let debitResult;
    try {
        // Списываем стоимость кручения через HTTP-запрос дебита к платформе вместо RAM
        debitResult = await seamless.debit(req.player, username, partnerId, sessionId, config.cost, gameName, roundId);
        if(debitResult.error) {
            return res.status(400).json(debitResult);
        }
    } catch (err) {
        return res.status(400).json({ error: err.message || "Insufficient funds or platform error" });
    }

    let currentBalance = debitResult.balance;

    // Роллим шанс от 0 до 999
    const roll = state.getRandomInt(1000);
    let targetPrizeType;

    const emptyChance = 105 + Math.max(0, (70 - config.rtp) * 8);

    // МАТЕМАТИЧЕСКАЯ НАСТРОЙКА ИСХОДОВ
    if (roll < 5) {
        targetPrizeType = 'JACKPOT';
    } else if (roll < 105) {
        targetPrizeType = 40;
    } else if (roll < (105 + emptyChance)) {
        targetPrizeType = 0;
    } else {
        targetPrizeType = 10;
    }

    const possibleSectors = config.sectors.map((sector, index) => ({ ...sector, index }))
        .filter(s => s.prize === targetPrizeType);

    const selectedSector = possibleSectors[state.getRandomInt(possibleSectors.length)];
    const sectorIndex = selectedSector.index;
    const sector = config.sectors[sectorIndex];

    // Расчет финального приза
    let prize = sector.prize;
    if (prize === 'JACKPOT') {
        prize = state.getJackpot(partnerId);
    }

    if (prize > 0) {
        // Начисляем выигрыш через HTTP-запрос кредита к платформе
        const creditResult = await seamless.credit(username, partnerId, sessionId, prize, gameName, roundId);
        currentBalance = creditResult.balance;
    }

    // Сохраняем в историю действий с привязкой к конкретному партнеру
    await state.savePlayerActionHistory(username, partnerId, {
        game: "Wheel",
        details: `Sector: ${sector.label}`,
        change: prize > 0 ? `+${prize} 🪙` : `-${config.cost} 🪙`,
        win: prize > 0
    });

    // Возвращаем точный индекс для анимации на фронтенде с актуальным балансом платформы
    res.json({
        sectorIndex,
        label: sector.label,
        prize,
        balance: currentBalance,
        jackpot: state.getJackpot(partnerId)
    });
};

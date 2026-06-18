const crypto = require('crypto');
const state = require('../state');
const seamless = require('../services/seamlessService');

exports.spin = async (req, res) => {
    const partnerId = req.partnerId;
    const username = req.username;
    const sessionId = req.sessionId || req.headers['x-session-id'] || (req.player && req.player.sessionId); // Надежно извлекаем сессию

    // Берем конфигурацию слотов конкретного партнера
    const config = state.getConfig(partnerId).slots3x3;

    // Генерируем уникальный ID раунда
    const roundId = `slots3x3_${crypto.randomBytes(8).toString('hex')}`;
    const gameName = 'Slots3x3';

    let debitResult;
    try {
        // Списываем баланс через HTTP-запрос к платформе вместо RAM с проверкой средств
        debitResult = await seamless.debit(req.player, username, partnerId, sessionId, config.cost, gameName, roundId);
        if(debitResult.error) {
            return res.status(400).json(debitResult);
        }
    } catch (err) {
        return res.status(400).json({ error: err.message || "Insufficient funds or platform error" });
    }

    // Получаем актуальный баланс из ответа сервера платформы
    let currentBalance = debitResult.balance;

    // Генерируем случайное число от 0 до 99 для определения категории исхода
    const roll = state.getRandomInt(100);
    let results = [];

    // ФОРМУЛА: рассчитываем границу выигрыша на основе RTP конкретного бренда
    const loseBoundary = Math.max(40, Math.min(95, 100 - (config.rtp * 0.45)));

    if (roll < loseBoundary) {
        // Абсолютный ПРОИГРЫШ
        const s = config.symbols;
        const first = s[state.getRandomInt(s.length)];

        const s2 = s.filter(x => x !== first);
        const second = s2[state.getRandomInt(s2.length)];

        const s3 = s2.filter(x => x !== second);
        const third = s3[state.getRandomInt(s3.length)];

        results = [first, second, third];
    }
    else if (roll < 96) {
        // Совпадение ДВУХ символов
        const s = config.symbols;
        const pairSymbol = s[state.getRandomInt(s.length)];

        const s2 = s.filter(x => x !== pairSymbol);
        const thirdSymbol = s2[state.getRandomInt(s2.length)];

        results = [pairSymbol, pairSymbol, thirdSymbol].sort(() => Math.random() - 0.5);
    }
    else {
        // Совпадение ТРЕХ символов
        const s = config.symbols;
        const winSymbol = s[state.getRandomInt(s.length)];
        results = [winSymbol, winSymbol, winSymbol];
    }

    // Точный расчет приза
    let prize = 0;
    if (results[0] === results[1] && results[1] === results[2]) {
        prize = results[0] === '💎' ? 500 : 150;
    } else if (results[0] === results[1] || results[1] === results[2] || results[0] === results[2]) {
        prize = 25;
    }

    // Если есть выигрыш, отправляем бесшовное начисление на шлюз этого оператора
    if (prize > 0) {
        try {
            const creditResult = await seamless.credit(username, partnerId, sessionId, prize, gameName, roundId);
            currentBalance = creditResult.balance; // Обновляем баланс из ответа
        } catch (err) {
            console.error(`[Partner: ${partnerId}] Failed to credit slot win for ${username}:`, err.message);
        }
    }
    else if (prize === 0) {
        // Исправлено: заменено bet на config.cost
        await state.trackAffiliatePayout(username, partnerId, config.cost, seamless.credit);
        // await state.trackAffiliatePayout(username, partnerId, config.cost, sessionId);
    }

    // Пишем историю с привязкой к partnerId
    await state.savePlayerActionHistory(username, partnerId, {
        game: "Slots3x3",
        details: `Spin: [ ${results.join(' | ')} ]`,
        change: prize > 0 ? `+${prize} 🪙` : `-${config.cost} 🪙`,
        win: prize > 0
    });

    res.json({
        results,
        prize,
        balance: currentBalance,
        jackpot: state.getJackpot(partnerId)
    });
};
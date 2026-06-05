const state = require('../state');
const seamless = require('../services/seamlessService');

exports.spin = async (req, res) => {
    const partnerId = req.partnerId; // Извлекаем partnerId, добавленный мидлваром checkPlayer
    const username = req.username;

    // ИСПРАВЛЕНО: Берем конфигурацию слотов конкретного партнера
    const config = state.getConfig(partnerId).slots3x3;

    if (req.player.balance < config.cost) {
        return res.status(400).json({ error: "Insufficient funds" });
    }

    const roundId = `slots3x3_round_${Date.now()}_${state.getRandomInt(100000) + 1}`;

    // ИСПРАВЛЕНО: Пробрасываем partnerId вторым аргументом в бесшовное списание
    if (req.player.sessionId) {
        await seamless.debit(username, partnerId, req.player.sessionId, config.cost, 'Slots3x3', roundId);
    }

    // Списываем ставку в локальном кэше B2B
    req.player.balance -= config.cost;

    // ИСПРАВЛЕНО: Начисляем отчисления в джекпот конкретного партнера
    state.addJackpot(partnerId, 1);

    // Генерируем случайное число от 0 до 99 для определения категории исхода
    const roll = state.getRandomInt(100);
    let results = [];

    // ФОРМУЛА: рассчитываем границу выигрыша на основе RTP конкретного бренда
    const loseBoundary = Math.max(40, Math.min(95, 100 - (config.rtp * 0.45)));

    // МАТЕМАТИЧЕСКАЯ НАСТРОЙКА RTP (Всего 100%)
    if (roll < loseBoundary) {
        // Абсолютный ПРОИГРЫШ (все 3 символа гарантированно разные)
        const s = config.symbols;
        const first = s[state.getRandomInt(s.length)];

        const s2 = s.filter(x => x !== first);
        const second = s2[state.getRandomInt(s2.length)];

        const s3 = s2.filter(x => x !== second);
        const third = s3[state.getRandomInt(s3.length)];

        results = [first, second, third];
    }
    else if (roll < 96) {
        // Совпадение ДВУХ символов (Выигрыш 25)
        const s = config.symbols;
        const pairSymbol = s[state.getRandomInt(s.length)];

        const s2 = s.filter(x => x !== pairSymbol);
        const thirdSymbol = s2[state.getRandomInt(s2.length)];

        results = [pairSymbol, pairSymbol, thirdSymbol].sort(() => Math.random() - 0.5);
    }
    else {
        // Совпадение ТРЕХ символов (Выигрыш 150 или 500 за алмазы)
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

    // Начисляем выигрыш в локальном кэше B2B
    req.player.balance += prize;

    // ИСПРАВЛЕНО: Если есть выигрыш, отправляем бесшовное начисление на шлюз этого оператора
    if (prize > 0 && req.player.sessionId) {
        try {
            await seamless.credit(username, partnerId, req.player.sessionId, prize, 'Slots3x3', roundId);
        } catch (err) {
            console.error(`[Partner: ${partnerId}] Failed to credit slot win for ${username}:`, err.message);
        }
    }
    else if(prize === 0) {
        await state.trackAffiliatePayout(username, partnerId, bet, req.player.sessionId);
    }

    // ИСПРАВЛЕНО: Сохраняем баланс и пишем историю с привязкой к partnerId
    await state.updateBalance(username, partnerId, req.player.balance);
    await state.savePlayerActionHistory(username, partnerId, {
        game: "Slots3x3",
        details: `Spin: [ ${results.join(' | ')} ]`,
        change: prize > 0 ? `+${prize} 🪙` : `-${config.cost} 🪙`,
        win: prize > 0
    });

    res.json({
        results,
        prize,
        balance: req.player.balance,
        // ИСПРАВЛЕНО: Возвращаем джекпот конкретного партнера
        jackpot: state.getJackpot(partnerId)
    });
};





// const AsyncLock = require('async-lock');
// const lock = new AsyncLock();
// const state = require('../state');
//
// exports.spin = async (req, res) => {
//     const username = req.username || req.player.username; // Приведи к одному стандарту
//     const config = state.getConfig().slots;
//
//     // Блокируем выполнение для конкретного пользователя по его имени
//     await lock.acquire(username, async () => {
//         // 1. Актуализируем данные игрока (лучше перечитать баланс из БД/state)
//         // const currentBalance = await state.getBalance(username);
//
//         if (req.player.balance < config.cost) {
//             return res.status(400).json({ error: "Insufficient funds" });
//         }
//
//         // 2. Списываем ставку
//         req.player.balance -= config.cost;
//         state.addJackpot(1);
//
//         // 3. Логика игры (остается прежней)
//         const results = [
//             config.symbols[state.getRandomInt(config.symbols.length)],
//             config.symbols[state.getRandomInt(config.symbols.length)],
//             config.symbols[state.getRandomInt(config.symbols.length)]
//         ];
//
//         let prize = 0;
//         if (results[0] === results[1] && results[1] === results[2]) {
//             prize = results[0] === '💎' ? 500 : 150;
//         } else if (results[0] === results[1] || results[1] === results[2] || results[0] === results[2]) {
//             prize = 25;
//         }
//
//         // 4. Начисляем выигрыш
//         req.player.balance += prize;
//
//         // 5. Сохраняем ВСЁ до завершения блокировки
//         await state.updateBalance(username, req.player.balance);
//         await state.savePlayerActionHistory(username, {
//             game: "Slots",
//             details: `Spin: [ ${results.join(' | ')} ]`,
//             change: prize > 0 ? `+${prize} 🪙` : `-${config.cost} 🪙`,
//             win: prize > 0
//         });
//
//         res.json({ results, prize, balance: req.player.balance, jackpot: state.getJackpot() });
//     }).catch(err => {
//         res.status(500).json({ error: "Server error during spin" });
//     });
// };

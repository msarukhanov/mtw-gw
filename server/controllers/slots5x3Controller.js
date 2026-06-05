const state = require('../state');
const seamless = require('../services/seamlessService');

exports.buyBonus = async (req, res) => {
    const partnerId = req.partnerId; // Извлекаем partnerId, добавленный мидлваром checkPlayer
    const username = req.username;
    const sessionId = req.body.sessionId || req.player.sessionId;

    // ИСПРАВЛЕНО: Берем конфигурацию слотов 5х3 конкретного партнера
    const config = state.getConfig(partnerId).slots5x3;

    // Стоимость бонуса в 10 раз выше обычной ставки
    const bonusCost = config.cost * 10;
    const roundId = `slots5x3_bonus_${Date.now()}_${username}`;

    try {
        // 1. ИСПРАВЛЕНО: Списываем повышенную ставку через Seamless с маршрутизацией по partnerId
        await seamless.debit(username, partnerId, sessionId, bonusCost, "Slots 5x3 Bonus Buy", roundId);

        // 2. ИСПРАВЛЕНО: 5% от покупки идет в изолированный джекпот конкретного партнера
        state.addJackpot(partnerId, Math.floor(bonusCost * 0.05));

        // 3. ГАРАНТИРОВАННЫЙ ВЫИГРЫШ: Генерируем победный символ из пула партнера
        const s = config.symbols;
        const winSymbol = s[state.getRandomInt(s.length)];

        // Для слотов 5х3 генерируем выигрышную линию (например, 5 одинаковых символов в ряд)
        const results = [winSymbol, winSymbol, winSymbol, winSymbol, winSymbol];

        // Расчет супер-приза
        const prize = winSymbol === '💎' ? 1000 : 300; // Для 5х3 призы могут быть выше обычных 3х3

        // 4. ИСПРАВЛЕНО: Начисляем супер-выигрыш через Seamless Credit с привязкой к бренду
        await seamless.credit(username, partnerId, sessionId, prize, "Slots 5x3 Bonus Buy", roundId);

        // Обновляем локальный баланс игрока в Express, если он закэширован
        if (req.player) req.player.balance = req.player.balance - bonusCost + prize;

        // Обновляем баланс в NeDB базы данных
        await state.updateBalance(username, partnerId, req.player.balance);

        // 5. ИСПРАВЛЕНО: Записываем в историю действий с передачей partnerId
        await state.savePlayerActionHistory(username, partnerId, {
            game: "Slots5x3",
            details: `Bonus Buy Super Spin: [ ${results.join(' | ')} ]`,
            change: `+${prize} 🪙 (Cost: -${bonusCost})`,
            win: true
        });

        res.json({ success: true, results, prize, balance: req.player.balance });
    } catch (err) {
        console.error(`[Partner: ${partnerId}] Bonus Buy error:`, err.message);
        res.status(500).json({ error: err.message || "Ошибка покупки бонусного раунда" });
    }
};


exports.spin = async (req, res) => {
    const partnerId = req.partnerId; // Извлекаем partnerId, добавленный мидлваром checkPlayer
    const username = req.username;

    // ИСПРАВЛЕНО: Подгружаем конфигурацию слотов конкретного партнера
    const config = state.getConfig(partnerId).slots5x3;

    // ИСПРАВЛЕНО: Проверяем фриспины с разделением по конкретному бренду
    let fsSession = state.getFreeSpins(username, partnerId);
    let isFreeSpin = fsSession && fsSession.remaining > 0;
    let currentBet = isFreeSpin ? fsSession.betUsed : config.cost;

    // Валидация баланса (только для обычного спина, фриспины бесплатны!)
    if (!isFreeSpin) {
        if (req.player.balance < currentBet) {
            return res.status(400).json({ error: "Insufficient funds" });
        }
        // Списываем ставку и пополняем RTP банк слотов
        req.player.balance -= currentBet;

        // ИСПРАВЛЕНО: Пополняем изолированный RTP-банк слотов этого партнера
        state.addSlots5x3Bank(partnerId, currentBet);
    } else {
        // Уменьшаем счетчик фриспинов
        fsSession.remaining--;
    }

    let matrix = [];
    let stopIndexes = [];
    let totalWin = 0;
    let hitLines = []; // информация о выигравших линиях для фронтенда
    let scatterCount = 0;
    let forceLose = false;

    // --- ПЕТЛЯ ГЕНЕРАЦИИ МАТРИЦЫ И ПРОВЕРКИ RTP ---
    let attempts = 0;
    while (attempts < 20) {
        // Создаем массив строго из 5 пустых колонок
        matrix = [[], [], [], [], []];
        stopIndexes = [];
        totalWin = 0;
        hitLines = [];
        scatterCount = 0;

        // Наполняем каждый из 5 барабанов (колонок)
        for (let col = 0; col < 5; col++) {
            const strip = config.strips[col];
            const stopIdx = state.getRandomInt(strip.length);
            stopIndexes.push(stopIdx);

            matrix[col].push(strip[stopIdx]);
            matrix[col].push(strip[(stopIdx + 1) % strip.length]);
            matrix[col].push(strip[(stopIdx + 2) % strip.length]);
        }

        // 1. Считаем Скаттеры (проверяем все 5 колонок и все 3 строки внутри них)
        for (let col = 0; col < 5; col++) {
            for (let row = 0; row < 3; row++) {
                if (matrix[col][row] === 'S') scatterCount++;
            }
        }

        // 2. Проверяем 20 выигрышных линий
        config.paylines.forEach((line, lineIdx) => {
            let lineSymbols = [
                matrix[0][line[0]], // Барабан 1
                matrix[1][line[1]], // Барабан 2
                matrix[2][line[2]], // Барабан 3
                matrix[3][line[3]], // Барабан 4
                matrix[4][line[4]]  // Барабан 5
            ];

            // Определяем первый базовый символ в линии (пропускаем Wild)
            let baseSymbol = lineSymbols[0];
            let wildOffset = 0;
            while (baseSymbol === 'W' && wildOffset < 4) {
                wildOffset++;
                baseSymbol = lineSymbols[wildOffset];
            }

            if (baseSymbol === 'W') baseSymbol = '💎';
            if (baseSymbol === 'S') return; // Скаттеры по линиям не играют

            // Считаем совпадения слева направо
            let matches = 0;
            for (let i = 0; i < 5; i++) {
                if (lineSymbols[i] === baseSymbol || lineSymbols[i] === 'W') {
                    matches++;
                } else {
                    break; // Линия прервалась
                }
            }

            // Если совпало 3, 4 или 5 символов подряд
            if (matches >= 3 && config.payouts[baseSymbol]) {
                const payoutMultiplier = config.payouts[baseSymbol][matches];
                const lineWin = currentBet * (payoutMultiplier / 10);
                totalWin += Math.floor(lineWin);
                hitLines.push({ lineIndex: lineIdx, symbol: baseSymbol, count: matches, win: Math.floor(lineWin) });
            }
        });

        // Проверка ограничений RTP банка
        // ИСПРАВЛЕНО: Проверяем ограничения банка строго для текущего партнера
        const currentBank = state.getSlots5x3Bank(partnerId);
        if (totalWin > currentBank) {
            attempts++;
            forceLose = true;
        } else {
            forceLose = false;
            break;
        }
    }

    // Если после 20 попыток сервер так и не смог найти проигрышную комбинацию на лентах (редко, но возможно),
    // принудительно очищаем выигрыш, чтобы защитить кассу
    if (forceLose) {
        totalWin = 0;
        hitLines = [];
        scatterCount = 0;
    }

    // --- ОБРАБОТКА РЕЗУЛЬТАТОВ БОНУСНОЙ ИГРЫ (SCATTERS / FREE SPINS) ---
    let triggeredFreeSpins = 0;
    let bonusMessage = "";

    if (scatterCount >= 3) {
        triggeredFreeSpins = 10; // Награда: 10 бесплатных вращений
        bonusMessage = `🎉 BONUS! ${scatterCount} Scatters triggered 10 Free Spins!`;

        if (!fsSession) {
            fsSession = { remaining: 10, totalWon: 0, betUsed: currentBet };
            // ИСПРАВЛЕНО: Сохраняем фриспины с привязкой к partnerId
            state.setFreeSpins(username, partnerId, fsSession);
        } else {
            fsSession.remaining += 10; // Докручиваем +10 респинов, если поймали внутри бонуски
        }
    }

    // Фиксируем финансовые итоги раунда
    if (totalWin > 0) {
        req.player.balance += totalWin;
        // ИСПРАВЛЕНО: Выплачиваем из изолированной RTP-копилки текущего партнёра
        state.reduceSlots5x3Bank(partnerId, totalWin);
        if (isFreeSpin) fsSession.totalWon += totalWin;
    }

    // Если фриспины закончились в этом спине
    let freeSpinsFinished = false;
    let freeSpinsTotalPrize = 0;
    if (isFreeSpin && fsSession.remaining === 0) {
        freeSpinsFinished = true;
        freeSpinsTotalPrize = fsSession.totalWon;
        // ИСПРАВЛЕНО: Закрываем сессию бонуски строго для этого партнёра
        state.deleteFreeSpins(username, partnerId);
    }

    // ИСПРАВЛЕНО: Сохраняем обновленный баланс игрока с привязкой к partnerId
    await state.updateBalance(username, partnerId, req.player.balance);

    // ИСПРАВЛЕНО: Запись в единую ленту истории действий с передачей partnerId
    await state.savePlayerActionHistory(username, partnerId, {
        game: isFreeSpin ? "Free Spin" : "Slots 5x3",
        details: isFreeSpin
            ? `FS Mode (${fsSession.remaining} left). Total won: ${fsSession.totalWon} 🪙`
            : `Regular Spin. Hit lines: ${hitLines.length}. Scatters: ${scatterCount}`,
        change: totalWin > 0 ? `+${totalWin} 🪙` : (isFreeSpin ? `0 🪙` : `-${currentBet} 🪙`),
        win: totalWin > 0
    });

    // Отдаем полный пакет данных для идеальной покадровой отрисовки на фронтенде
    res.json({
        matrix,          // Экран 5х3 с символами
        stopIndexes,     // Точки остановки барабанов для анимации
        hitLines,        // Массив выигравших линий с номерами
        totalWin,        // Выигрыш за этот конкретный спин
        balance: req.player.balance,
        // ИСПРАВЛЕНО: Возвращаем джекпот конкретного партнёра
        jackpot: state.getJackpot(partnerId),
        // Параметры фриспинов (ИСПРАВЛЕНО: все вызовы кэша фриспинов завязаны на partnerId)
        freeSpins: {
            isFreeSpinMode: state.getFreeSpins(username, partnerId) ? true : false,
            remaining: state.getFreeSpins(username, partnerId) ? state.getFreeSpins(username, partnerId).remaining : 0,
            totalWon: state.getFreeSpins(username, partnerId) ? state.getFreeSpins(username, partnerId).totalWon : 0,
            triggered: triggeredFreeSpins,
            finished: freeSpinsFinished,
            bonusTotalPrize: freeSpinsTotalPrize,
            message: bonusMessage
        }
    });
};






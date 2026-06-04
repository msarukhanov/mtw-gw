const state = require('../state');
const seamless = require('../services/seamlessService'); // твой модуль с дебитом/кредитом

exports.buyBonus = async (req, res) => {
    const config = state.getConfig().slots;
    const username = req.username;
    const sessionId = req.body.sessionId;

    // Стоимость бонуса в 10 раз выше обычной ставки
    const bonusCost = config.cost * 10;
    const roundId = `slots_bonus_${Date.now()}_${username}`;

    try {
        // 1. Списываем повышенную ставку через Seamless
        await seamless.debit(username, sessionId, bonusCost, "Slots Bonus Buy", roundId);
        state.addJackpot(Math.floor(bonusCost * 0.05)); // 5% от покупки идет в глобальный джекпот

        // 2. ГАРАНТИРОВАННЫЙ ВЫИГРЫШ: Игнорируем обычный ролл RTP
        // Генерируем 3 одинаковых символа
        const s = config.symbols;
        const winSymbol = s[state.getRandomInt(s.length)];
        const results = [winSymbol, winSymbol, winSymbol];

        // Точный расчет супер-приза
        const prize = winSymbol === '💎' ? 500 : 150;

        // 3. Начисляем супер-выигрыш через Seamless Credit
        await seamless.credit(username, sessionId, prize, "Slots Bonus Buy", roundId);

        // Записываем в историю действий
        await state.savePlayerActionHistory(username, {
            game: "Slots Bonus Buy",
            details: `Super Spin: [ ${results.join(' | ')} ]`,
            change: `+${prize} 🪙 (Cost: -${bonusCost})`,
            win: true
        });

        res.json({ success: true, results, prize });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message || "Ошибка покупки бонусного раунда" });
    }
};

exports.spin = async (req, res) => {
    const config = state.getConfig().slots5x3;
    const username = req.username;

    // Проверяем, есть ли у игрока активные бесплатные вращения (Free Spins)
    let fsSession = state.getFreeSpins(username);
    let isFreeSpin = fsSession && fsSession.remaining > 0;
    let currentBet = isFreeSpin ? fsSession.betUsed : config.cost;

    // Валидация баланса (только для обычного спина, фриспины бесплатны!)
    if (!isFreeSpin) {
        if (req.player.balance < currentBet) {
            return res.status(400).json({ error: "Insufficient funds" });
        }
        // Списываем ставку и пополняем RTP банк слотов
        req.player.balance -= currentBet;
        state.addSlots5x3Bank(currentBet);
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
    // --- ПЕТЛЯ ГЕНЕРАЦИИ МАТРИЦЫ И ПРОВЕРКИ RTP ---
    let attempts = 0;
    while (attempts < 20) {
        // ИСПРАВЛЕНИЕ: Создаем массив строго из 5 пустых колонок
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

            // КЛЮЧЕВОЕ ИСПРАВЛЕНИЕ: Пушим 3 символа внутрь текущей колонки [col]
            // Раньше код писал matrix[0], matrix[1], matrix[2] — из-за чего создавалось 3 строки вместо 5 колонок
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
            // Теперь извлечение matrix[номер_колонки][индекс_строки_из_шаблона] отработает идеально!
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
        const currentBank = state.getSlots5x3Bank();
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
            state.setFreeSpins(username, fsSession);
        } else {
            fsSession.remaining += 10; // Докручиваем +10 респинов, если поймали внутри бонуски
        }
    }

    // Фиксируем финансовые итоги раунда
    if (totalWin > 0) {
        req.player.balance += totalWin;
        state.reduceSlots5x3Bank(totalWin); // Выплачиваем из RTP-копилки
        if (isFreeSpin) fsSession.totalWon += totalWin;
    }

    // Если фриспины закончились в этом спине
    let freeSpinsFinished = false;
    let freeSpinsTotalPrize = 0;
    if (isFreeSpin && fsSession.remaining === 0) {
        freeSpinsFinished = true;
        freeSpinsTotalPrize = fsSession.totalWon;
        state.deleteFreeSpins(username); // Закрываем сессию бонуски
    }

    // Сохраняем обновленный баланс игрока в NeDB/SQLite
    await state.updateBalance(username, req.player.balance);

    // Запись в единую ленту истории действий
    await state.savePlayerActionHistory(username, {
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
        jackpot: state.getJackpot(),
        // Параметры фриспинов
        freeSpins: {
            isFreeSpinMode: state.getFreeSpins(username) ? true : false,
            remaining: state.getFreeSpins(username) ? state.getFreeSpins(username).remaining : 0,
            totalWon: state.getFreeSpins(username) ? state.getFreeSpins(username).totalWon : 0,
            triggered: triggeredFreeSpins,
            finished: freeSpinsFinished,
            bonusTotalPrize: freeSpinsTotalPrize,
            message: bonusMessage
        }
    });
};

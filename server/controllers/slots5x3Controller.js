const crypto = require('crypto');
const state = require('../state');
const seamless = require('../services/seamlessService');

const Methods = {
    // Внутренние методы банка оставляем как есть
    getSlots5x3Bank: (partnerId) => {
        if (!banks[partnerId]) jackpotMethods.getJackpot(partnerId);
        if (!banks[partnerId].slots5x3) banks[partnerId].slots5x3 = 10000;
        return banks[partnerId].slots5x3;
    },
    addSlots5x3Bank: (partnerId, amount) => {
        if (!banks[partnerId]) jackpotMethods.getJackpot(partnerId);
        if (!banks[partnerId].slots5x3) banks[partnerId].slots5x3 = 10000;
        banks[partnerId].slots5x3 += amount;
    },
    reduceSlots5x3Bank: (partnerId, amount) => {
        if (!banks[partnerId]) jackpotMethods.getJackpot(partnerId);
        if (!banks[partnerId].slots5x3) banks[partnerId].slots5x3 = 10000;
        banks[partnerId].slots5x3 -= amount;
    },
};

exports.buyBonus = async (req, res) => {
    const partnerId = req.partnerId;
    const username = req.username;
    // Надежно извлекаем sessionId (из body, req или заголовков)
    const sessionId = req.body.sessionId || req.sessionId || req.headers['x-session-id'] || (req.player && req.player.sessionId);

    // Берем конфигурацию слотов 5х3 конкретного партнера
    const config = state.getConfig(partnerId).slots5x3;

    // Стоимость бонуса в 10 раз выше обычной ставки
    const bonusCost = config.cost * 10;

    // Генерируем уникальный криптографический roundId вместо таймстампа во избежание коллизий
    const roundId = `slots5x3_bonus_${crypto.randomBytes(8).toString('hex')}`;
    const gameName = "Slots 5x3 Bonus Buy";

    try {
        // 1. Списываем повышенную ставку через Seamless с маршрутизацией по partnerId
        // Если на платформе нет денег или сеть упадет, выполнение сразу перейдет в блок catch
        const debitResult = await seamless.debit(username, partnerId, sessionId, bonusCost, gameName, roundId);
        if(debitResult.error) {
            return res.status(400).json(debitResult);
        }

        // 2. 5% от покупки идет в изолированный джекпот конкретного партнера
        state.addJackpot(partnerId, Math.floor(bonusCost * 0.05));

        // 3. ГАРАНТИРОВАННЫЙ ВЫИГРЫШ: Генерируем победный символ из пула партнера
        const s = config.symbols;
        const winSymbol = s[state.getRandomInt(s.length)];
        const results = [winSymbol, winSymbol, winSymbol, winSymbol, winSymbol];

        // Расчет супер-приза
        const prize = winSymbol === '💎' ? 1000 : 300;

        // 4. Начисляем супер-выигрыш через Seamless Credit с привязкой к бренду
        const creditResult = await seamless.credit(username, partnerId, sessionId, prize, gameName, roundId);

        // Берём финальный авторизованный баланс строго из ответа платформы
        const currentBalance = creditResult.balance;

        // 5. Записываем в историю действий с передачей partnerId
        await state.savePlayerActionHistory(username, partnerId, {
            game: "Slots5x3",
            details: `Bonus Buy Super Spin: [ ${results.join(' | ')} ]`,
            change: `+${prize} 🪙 (Cost: -${bonusCost})`,
            win: true
        });

        res.json({ success: true, results, prize, balance: currentBalance });
    } catch (err) {
        console.error(`[Partner: ${partnerId}] Bonus Buy error:`, err.message);
        res.status(400).json({ error: err.message || "Ошибка покупки бонусного раунда" });
    }
};

exports.spin = async (req, res) => {
    const partnerId = req.partnerId;
    const username = req.username;
    // Надежно вытаскиваем sessionId
    const sessionId = req.body.sessionId || req.sessionId || req.headers['x-session-id'] || (req.player && req.player.sessionId);

    // Подгружаем конфигурацию слотов конкретного партнера
    const config = state.getConfig(partnerId).slots5x3;

    // Проверяем фриспины с разделением по конкретному бренду
    let fsSession = state.getFreeSpins(username, partnerId);
    let isFreeSpin = fsSession && fsSession.remaining > 0;
    let currentBet = isFreeSpin ? fsSession.betUsed : config.cost;

    // Генерируем уникальный криптографический roundId для раунда
    let roundId = `slots5x3_${crypto.randomBytes(8).toString('hex')}`;
    const gameName = "Slots 5x3";

    let currentBalance;

    // Валидация баланса (только для обычного спина, фриспины бесплатны!)
    if (!isFreeSpin) {
        try {
            // Списываем ставку через Seamless дебит. Ошибки автоматически вызовут блок catch
            const debitResult = await seamless.debit(username, partnerId, sessionId, currentBet, gameName, roundId);

            // Если шлюз вернул ошибку в самом JSON-ответе (например { error: "..." })
            if (debitResult && debitResult.error) {
                return res.status(400).json({ error: debitResult });
            }

            currentBalance = debitResult.balance;

            // Пополняем изолированный RTP-банк слотов этого партнера
            Methods.addSlots5x3Bank(partnerId, currentBet);
        } catch (err) {
            // Если на платформе нет денег или упала сеть
            return res.status(400).json({ error: err.message || "Insufficient funds or platform error" });
        }
    } else {
        // Уменьшаем счетчик фриспинов
        fsSession.remaining--;

        // Для фриспинов нам всё равно нужен актуальный баланс для финального ответа.
        // Запрашиваем его у базы данных (или сохраняем старый, если передавали)
        const platformUser = await state.getOrCreatePlayer(username, partnerId);
        currentBalance = platformUser.balance;
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
        const currentBank = Methods.getSlots5x3Bank(partnerId);
        if (totalWin > currentBank) {
            attempts++;
            forceLose = true;
        } else {
            forceLose = false;
            break;
        }
    }


    // Если после 20 попыток сервер так и не смог найти проигрышную комбинацию на лентах,
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
            // Сохраняем фриспины с привязкой к partnerId
            state.setFreeSpins(username, partnerId, fsSession);
        } else {
            fsSession.remaining += 10; // Докручиваем +10 респинов, если поймали внутри бонуски
        }
    }

    // Фиксируем финансовые итоги раунда
    if (totalWin > 0) {
        // Начисляем выигрыш через HTTP-запрос кредита к платформе вместо RAM
        try {
            const creditResult = await seamless.credit(username, partnerId, sessionId, totalWin, gameName, roundId);
            currentBalance = creditResult.balance; // Обновляем баланс из ответа сервера
        } catch (err) {
            console.error(`[Partner: ${partnerId}] Failed to credit spin win for ${username}:`, err.message);
        }

        // Выплачиваем из изолированной RTP-копилки текущего партнёра
        Methods.reduceSlots5x3Bank(partnerId, totalWin);
        if (isFreeSpin) fsSession.totalWon += totalWin;
    }

    // Если фриспины закончились в этом спине
    let freeSpinsFinished = false;
    let freeSpinsTotalPrize = 0;
    if (isFreeSpin && fsSession.remaining === 0) {
        freeSpinsFinished = true;
        freeSpinsTotalPrize = fsSession.totalWon;
        // Закрываем сессию бонуски строго для этого партнёра
        state.deleteFreeSpins(username, partnerId);
    }

    // Запись в единую ленту истории действий с передачей partnerId
    await state.savePlayerActionHistory(username, partnerId, {
        game: isFreeSpin ? "Free Spin" : "Slots 5x3",
        details: isFreeSpin
            ? `FS Mode (${fsSession.remaining} left). Total won: ${fsSession.totalWon} 🪙`
            : `Regular Spin. Hit lines: ${hitLines.length}. Scatters: ${scatterCount}`,
        change: totalWin > 0 ? `+${totalWin} 🪙` : (isFreeSpin ? `0 🪙` : `-${currentBet} 🪙`),
        win: totalWin > 0,
        roundId
    });

    // Отдаем полный пакет данных для идеальной покадровой отрисовки на фронтенде
    res.json({
        matrix,          // Экран 5х3 с символами
        stopIndexes,     // Точки остановки барабанов для анимации
        hitLines,        // Массив выигравших линий с номерами
        totalWin,        // Выигрыш за этот конкретный спин
        balance: currentBalance, // Возвращаем актуальный баланс со шлюза платформы
        jackpot: state.getJackpot(partnerId),
        // Параметры фриспинов
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






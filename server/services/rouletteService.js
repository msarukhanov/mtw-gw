const state = require('../state');

let gameStatus = "betting"; // "betting", "spinning", "results"
let winningNumber = 0;
let winningColor = 'green';

// Массив фейковых имен для симуляции онлайна (ботов)
const VIRTUAL_NAMES = ['CryptoWhale', 'LuckyBoy', 'SlotMaster', 'Zeus_777', 'AlphaGambler', 'Phoenix', 'MobilePlayer', 'CasinoKing'];

// Карта цветов классической рулетки (0 - зеленое зеро)
const ROULETTE_COLORS = {
    0: 'green',
    1: 'red', 2: 'black', 3: 'red', 4: 'black', 5: 'red', 6: 'black',
    7: 'red', 8: 'black', 9: 'red', 10: 'black', 11: 'black', 12: 'red',
    13: 'black', 14: 'red', 15: 'black', 16: 'red', 17: 'black', 18: 'red',
    19: 'red', 20: 'black', 21: 'red', 22: 'black', 23: 'red', 24: 'black',
    25: 'red', 26: 'black', 27: 'red', 28: 'black', 29: 'black', 30: 'red',
    31: 'black', 32: 'red', 33: 'black', 34: 'red', 35: 'black', 36: 'red'
};

// Объект для хранения ставок рулетки в оперативной памяти бэкенда
// Структура: { partnerId_A: { username_1: { betType, betValue, betAmount } } }
let rouletteBets = {};
let rouletteBanks = {};

// 1. Очистка ставок перед новым раундом
clearRouletteBets = (partnerId) => {
    rouletteBets[partnerId] = {};
};

// 2. Добавление ставки (вызывается и для ботов, и для реальных игроков в контроллере)
addRouletteBet = (username, partnerId, betData) => {
    if (!rouletteBets[partnerId]) rouletteBets[partnerId] = {};
    rouletteBets[partnerId][username] = betData;
};

// 3. Получение всех ставок текущего бренда (для отправки через io.to(partnerId).emit)
getRouletteBets = (partnerId) => {
    return rouletteBets[partnerId] || {};
};

// 4. Управление изолированным банком рулетки для конкретного партнера
addRouletteBank = (partnerId, amount) => {
    if (!rouletteBanks[partnerId]) rouletteBanks[partnerId] = 0;
    rouletteBanks[partnerId] += amount;
};
getRouletteBank = (partnerId) => {
    return rouletteBanks[partnerId] || 0;
};
reduceRouletteBank = (partnerId, amount) => {
    if (!rouletteBanks[partnerId]) rouletteBanks[partnerId] = 0;
    rouletteBanks[partnerId] -= amount;
};



function initRouletteService(io) {
    runNextRoundLoop(io);
    console.log("Roulette Service On");
}

async function runNextRoundLoop(io) {
    if(!state.BGS.roulette) return;
    gameStatus = "betting";

    const partnerIds = Object.keys(state.getConfig() || {});
    // const config = state.getConfig(partnerId).roulette || { baseRtp: 95, betTime: 15000 };
    if (partnerIds.length === 0 || partnerIds.includes('roulette')) partnerIds.push('demo_skin_default');

    for (const partnerId of partnerIds) {
        if (['lottery', 'slots', 'wheel', 'scratch', 'gamification'].includes(partnerId)) continue;

        // Очищаем ставки рулетки прошлого раунда для конкретного бренда
        clearRouletteBets(partnerId);

        // --- БАС СИМУЛЯЦИЯ БОТОВ ДЛЯ РУЛЕТКИ ---
        const botCount = 2 + Math.floor(Math.random() * 3);
        const shuffledNames = [...VIRTUAL_NAMES].sort(() => Math.random() - 0.5);

        for (let i = 0; i < botCount; i++) {
            const botName = shuffledNames[i];
            const botBetAmount = (1 + Math.floor(Math.random() * 5)) * 10;
            const betOptions = ['red', 'black', 'even', 'odd'];
            const randomSelection = betOptions[Math.floor(Math.random() * betOptions.length)];

            // Сохраняем ставку бота (структура: { betType, betValue, betAmount })
            addRouletteBet(botName, partnerId, {
                betType: 'color_parity',
                betValue: randomSelection,
                betAmount: botBetAmount
            });
        }
    }

    // Время на прием ставок (например, 15 секунд)
    // let timer = config.betTime;
    let timer = 15000;

    const bettingInterval = setInterval(() => {
        timer -= 1000;

        // Рассылаем статус ставок персонально по комнатам партнеров
        for (const partnerId of partnerIds) {
            if (['lottery', 'slots', 'wheel', 'scratch', 'gamification'].includes(partnerId)) continue;

            io.to(partnerId+'_roulette').emit('roulette_state', {
                status: "betting",
                timeLeft: timer,
                bets: getRouletteBets(partnerId) // Все игроки видят чужие ставки на столе
            });
        }

        if (timer <= 0) {
            clearInterval(bettingInterval);
            if(state.BGS.crash) {
                startWheelSpin(io, partnerIds);
            }
        }
        if(!state.BGS.crash) {
            clearInterval(bettingInterval);
        }
    }, 1000);
}

async function startWheelSpin(io, partnerIds) {
    gameStatus = "spinning";

    // Объект для хранения финальных выигрышных чисел для каждого партнера индивидуально
    const finalWinningNumbers = {};

    for (const partnerId of partnerIds) {
        if (['lottery', 'slots', 'wheel', 'scratch', 'gamification'].includes(partnerId)) continue;

        const config = state.getConfig(partnerId).roulette || { baseRtp: 95 };
        const currentBets = getRouletteBets(partnerId) || {};

        // 1. Генерируем абсолютно случайное число (Честный ГСЧ)
        let targetNumber = Math.floor(Math.random() * 37);
        let targetColor = ROULETTE_COLORS[targetNumber];

        // 2. Считаем общую сумму всех ставок реальных игроков в этом раунде
        let totalRoundStakes = 0;
        Object.values(currentBets).forEach(bet => {
            // Ставки ботов не учитываем в реальной кассе
            if (!VIRTUAL_NAMES.includes(bet.username)) {
                totalRoundStakes += bet.betAmount;
            }
        });

        // 3. Считаем, сколько мы должны выплатить, если выпадет это случайное число
        let potentialPayout = 0;
        Object.entries(currentBets).forEach(([username, bet]) => {
            if (!VIRTUAL_NAMES.includes(username)) {
                if (bet.betValue === targetColor) potentialPayout += bet.betAmount * 2;
                else if (bet.betValue === 'even' && targetNumber !== 0 && targetNumber % 2 === 0) potentialPayout += bet.betAmount * 2;
                else if (bet.betValue === 'odd' && targetNumber !== 0 && targetNumber % 2 !== 0) potentialPayout += bet.betAmount * 2;
            }
        });

        // 4. Защита баланса оператора (как у вас в Краше!)
        const currentBank = getRouletteBank(partnerId);

        // Если выплата больше, чем есть в банке партнера, или мы не проходим по лимиту профита
        if (potentialPayout > currentBank && totalRoundStakes > 0) {
            // Ищем «безопасное» число. Перебираем все исходы и смотрим, где выплата минимальна.
            let bestNumber = 0; // По дефолту Зеро (казино забирает всё)
            let minPayout = Infinity;

            for (let testNum = 0; testNum <= 36; testNum++) {
                let testColor = ROULETTE_COLORS[testNum];
                let testPayout = 0;

                Object.values(currentBets).forEach(bet => {
                    if (!VIRTUAL_NAMES.includes(bet.username)) {
                        if (bet.betValue === testColor) testPayout += bet.betAmount * 2;
                        if (bet.betValue === 'even' && testNum !== 0 && testNum % 2 === 0) testPayout += bet.betAmount * 2;
                        if (bet.betValue === 'odd' && testNum !== 0 && testNum % 2 !== 0) testPayout += bet.betAmount * 2;
                    }
                });

                if (testPayout < minPayout) {
                    minPayout = testPayout;
                    bestNumber = testNum;
                }
            }
            // Принудительно подставляем число, выгодное для кассы партнера
            targetNumber = bestNumber;
            targetColor = ROULETTE_COLORS[targetNumber];
        }

        finalWinningNumbers[partnerId] = { number: targetNumber, color: targetColor };

        // Изолированно отправляем результат вращения в комнату конкретного партнера
        io.to(partnerId+'_roulette').emit('roulette_state', {
            status: "spinning",
            winningNumber: targetNumber,
            color: targetColor
        });
    }

    // Ждем 5 секунд анимации на фронте
    setTimeout(async () => {
        gameStatus = "results";

        for (const partnerId of partnerIds) {
            if (['lottery', 'slots', 'wheel', 'scratch', 'gamification'].includes(partnerId)) continue;

            const targetNumber = finalWinningNumbers[partnerId].number;
            const targetColor = finalWinningNumbers[partnerId].color;
            const currentBets = getRouletteBets(partnerId) || {};
            let roundWinners = [];

            for (const [username, betInfo] of Object.entries(currentBets)) {
                let isWin = false;
                let multiplier = 0;

                if (betInfo.betValue === targetColor) { isWin = true; multiplier = 2; }
                else if (betInfo.betValue === 'even' && targetNumber !== 0 && targetNumber % 2 === 0) { isWin = true; multiplier = 2; }
                else if (betInfo.betValue === 'odd' && targetNumber !== 0 && targetNumber % 2 !== 0) { isWin = true; multiplier = 2; }

                if (isWin) {
                    const winAmount = Math.floor(betInfo.betAmount * multiplier);

                    if (!VIRTUAL_NAMES.includes(username)) {
                        let player = state.getPlayer(username, partnerId);
                        if (player) {
                            player.balance += winAmount;
                            await state.updateBalance(username, partnerId, player.balance);
                        }
                        // Минусуем выигрыш из банка партнера
                        reduceRouletteBank(partnerId, winAmount);
                    }
                    roundWinners.push({ username, winAmount });
                }
            }

            io.to(partnerId+'_roulette').emit('roulette_state', {
                status: "results",
                winningNumber: targetNumber,
                color: targetColor,
                winners: roundWinners
            });
        }

        setTimeout(() => { runNextRoundLoop(io); }, 4000);
    }, 5000);
}


function getStatus() { return gameStatus; }

module.exports = { initRouletteService, getStatus, getRouletteBets, addRouletteBet, addRouletteBank };

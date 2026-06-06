const state = require('../state');

let gameStatus = "betting"; // "betting", "flying", "crashed"
let currentMultiplier = 1.00;
let crashPoint = 1.00;

// Массив фейковых имен для симуляции онлайна (ботов)
const VIRTUAL_NAMES = ['CryptoWhale', 'LuckyBoy', 'SlotMaster', 'Zeus_777', 'AlphaGambler', 'Phoenix', 'MobilePlayer', 'CasinoKing'];

// Храним историю кэшаутов с разделением по партнерам: { site_A: { username: mult }, site_B: {...} }
let cashedOutHistory = {};

function initCrashService(io) {
    runNextRoundLoop(io);
}

// ИСПРАВЛЕНО: Метод теперь принимает partnerId, чтобы записать кэшаут в правильную комнату
function forceRegisterCashout(username, partnerId, multiplier) {
    if (!cashedOutHistory[partnerId]) cashedOutHistory[partnerId] = {};
    cashedOutHistory[partnerId][username] = multiplier;
}

async function runNextRoundLoop(io) {
    gameStatus = "betting";
    currentMultiplier = 1.00;
    cashedOutHistory = {};

    // ИСПРАВЛЕНО: Сбрасываем ставки и полеты для ВСЕХ партнеров
    // Для этого берем список всех активных партнеров из памяти CURRENT_CONFIG в state
    const partnerIds = Object.keys(state.getConfig() || {});
    // Если список пуст (первый запуск), добавим хотя бы дефолтный скин для демо
    if (partnerIds.length === 0 || partnerIds.includes('lottery')) partnerIds.push('demo_skin_default');

    for (const partnerId of partnerIds) {
        if (partnerId === 'lottery' || partnerId === 'slots' || partnerId === 'wheel' || partnerId === 'scratch' || partnerId === 'gamification') continue;

        state.clearCrashBets(partnerId);
        state.clearFlightPlayers(partnerId);
        cashedOutHistory[partnerId] = {};

        // --- БАС СИМУЛЯЦИЯ ОНЛАЙНА ВНУТРИ КАЖДОГО БРЕНДА ---
        const botCount = 2 + Math.floor(Math.random() * 3);
        const shuffledNames = [...VIRTUAL_NAMES].sort(() => Math.random() - 0.5);

        for (let i = 0; i < botCount; i++) {
            const botName = shuffledNames[i];
            const botBet = (1 + Math.floor(Math.random() * 5)) * 10;
            state.addCrashBet(botName, partnerId, botBet);
            state.addPlayerToFlight(botName, partnerId); // Боты летят внутри своего бренда
        }
    }

    // Берем базовый конфиг (время ожидания у всех одинаковое, например 5000мс)
    const baseConfig = state.getConfig('demo_skin_default').crash || { betTime: 5000 };
    let timer = baseConfig.betTime;

    const bettingInterval = setInterval(() => {
        timer -= 1000;

        // ИСПРАВЛЕНО: Рассылаем состояние персонально в комнату каждого партнера
        for (const partnerId of partnerIds) {
            if (partnerId === 'lottery' || partnerId === 'slots' || partnerId === 'wheel' || partnerId === 'scratch' || partnerId === 'gamification') continue;

            io.to(partnerId+'_crash').emit('crash_state', {
                status: "betting",
                timeLeft: timer,
                bets: state.getCrashBets(partnerId) // Отдаем ставки только ЭТОГО партнера
            });
        }

        if (timer <= 0) {
            clearInterval(bettingInterval);
            startFlight(io, partnerIds);
        }
    }, 1000);
}

async function startFlight(io, partnerIds) {
    gameStatus = "flying";
    let startTime = Date.now();

    // ИСПРАВЛЕНО: Генерируем ИНДИВИДУАЛЬНУЮ точку краша для каждого партнера на основе его RTP-банка!
    const crashPoints = {};

    for (const partnerId of partnerIds) {
        if (partnerId === 'lottery' || partnerId === 'slots' || partnerId === 'wheel' || partnerId === 'scratch' || partnerId === 'gamification') continue;

        const config = state.getConfig(partnerId).crash || { maxMultiplier: 100, baseRtp: 96 };
        const currentBets = state.getCrashBets(partnerId);

        let totalRoundStakes = 0;
        Object.values(currentBets).forEach(amount => totalRoundStakes += amount);

        const rand = Math.random();
        let generatedPoint = parseFloat((0.95 / (1 - rand)).toFixed(2));
        if (generatedPoint < 1.00) generatedPoint = 1.00;
        if (generatedPoint > config.maxMultiplier) generatedPoint = config.maxMultiplier;

        // Защита кассы конкретного оператора
        const currentBank = state.getCrashBank(partnerId);
        const maxPossiblePayout = totalRoundStakes * generatedPoint;
        if (maxPossiblePayout > currentBank && totalRoundStakes > 0) {
            generatedPoint = parseFloat((1.01 + Math.random() * 0.34).toFixed(2));
        }

        crashPoints[partnerId] = generatedPoint;

        // Переводим реальных игроков этого бренда в статус полета
        Object.keys(currentBets).forEach(username => {
            state.addPlayerToFlight(username, partnerId);
        });
    }

    const flightInterval = setInterval(async () => {
        let elapsed = (Date.now() - startTime) / 1000;
        currentMultiplier = parseFloat(Math.pow(Math.E, 0.06 * elapsed).toFixed(2));

        let activePartnersFlying = 0;

        for (const partnerId of partnerIds) {
            if (partnerId === 'lottery' || partnerId === 'slots' || partnerId === 'wheel' || partnerId === 'scratch' || partnerId === 'gamification') continue;

            const targetCrashPoint = crashPoints[partnerId];
            const currentBets = state.getCrashBets(partnerId);

            // Если у этого конкретного партнера самолет ЕЩЕ НЕ КРАШНУЛСЯ
            if (currentMultiplier < targetCrashPoint) {
                activePartnersFlying++;

                // --- ДИНАМИКА БОТОВ ВНУТРИ БРЕНДА ---
                Object.keys(currentBets).forEach(username => {
                    const activeInFlight = state.getActiveInFlight(partnerId);
                    if (activeInFlight[username] && VIRTUAL_NAMES.includes(username)) {
                        if (Math.random() < 0.05) {
                            state.removePlayerFromFlight(username, partnerId);
                            if (!cashedOutHistory[partnerId]) cashedOutHistory[partnerId] = {};
                            cashedOutHistory[partnerId][username] = currentMultiplier;
                        }
                    }
                });

                // Отправляем тик полета в комнату этого партнера
                io.to(partnerId+'_crash').emit('crash_state', {
                    status: "flying",
                    multiplier: currentMultiplier,
                    cashedOut: cashedOutHistory[partnerId] || {}
                });
            }
            // Если у этого партнера настал КРАШ, а событие краша еще не отправлено
            else if (state.getCrashBets(partnerId) && Object.keys(state.getCrashBets(partnerId)).length > 0) {

                // Фиксируем краш для этой комнаты
                io.to(partnerId+'_crash').emit('crash_state', {
                    status: "crashed",
                    multiplier: targetCrashPoint,
                    cashedOut: cashedOutHistory[partnerId] || {}
                });

                // Списываем проигрыши реальных игроков в историю конкретного бренда
                const inFlightPlayers = Object.keys(state.getActiveInFlight(partnerId));
                for (let username of inFlightPlayers) {
                    if (!VIRTUAL_NAMES.includes(username)) {
                        const lostBet = currentBets[username];
                        // ИСПРАВЛЕНО: Передаем partnerId в метод сохранения истории
                        await state.savePlayerActionHistory(username, partnerId, {
                            game: "Crash",
                            details: `Flew away at ${targetCrashPoint}x. Lost bet.`,
                            change: `-${lostBet} 🪙`,
                            win: false
                        });
                    }
                }

                // Очищаем ставки этого партнера, чтобы код не заходил сюда на следующем тике
                state.clearCrashBets(partnerId);
            }
        }

        // Если у ВСЕХ партнеров самолеты взорвались — останавливаем интервал и запускаем таймер нового раунда
        if (activePartnersFlying === 0) {
            clearInterval(flightInterval);
            gameStatus = "crashed";

            setTimeout(() => {
                runNextRoundLoop(io);
            }, 4000);
        }

    }, 80);
}





module.exports = {
    initCrashService,
    getStatus: () => gameStatus,
    getMultiplier: () => currentMultiplier,
    forceRegisterCashout,
    getCashedOutList: () => cashedOutHistory
};




// async function runNextRoundLoop(io) {
//     // --- СТАДИЯ 1: ПРИЕМ СТАВОК ---
//     gameStatus = "betting";
//     currentMultiplier = 1.00;
//     state.clearCrashBets();
//     state.clearFlightPlayers();
//
//     const config = state.getConfig().crash;
//     let timer = config.betTime;
//
//     // Таймер обратного отсчета для приема ставок
//     const bettingInterval = setInterval(() => {
//         timer -= 1000;
//         io.emit('crash_state', { status: "betting", timeLeft: timer });
//
//         if (timer <= 0) {
//             clearInterval(bettingInterval);
//             startFlight(io);
//         }
//     }, 1000);
// }
//
// async function startFlight(io) {
//     gameStatus = "flying";
//
//     // --- МЕХАНИКА RTP: ГЕНЕРАЦИЯ ТОЧКИ ПАДЕНИЯ (CRASH POINT) ---
//     const config = state.getConfig().crash;
//     const currentBets = state.getCrashBets();
//
//     // Считаем общую сумму всех ставок в этом раунде
//     let totalRoundStakes = 0;
//     Object.values(currentBets).forEach(amount => totalRoundStakes += amount);
//
//     // Базовый математический расчет точки падения
//     const rand = Math.random();
//     // Формула дает честный логарифмический рост (много мелких иксов, мало крупных)
//     let generatedPoint = parseFloat((0.95 / (1 - rand)).toFixed(2));
//     if (generatedPoint < 1.00) generatedPoint = 1.00;
//     if (generatedPoint > config.maxMultiplier) generatedPoint = config.maxMultiplier;
//
//     // СВЕРКА С RTP: Проверяем, сколько мы можем выплатить из копилки
//     const currentBank = state.getCrashBank();
//
//     // Если сгенерированный икс слишком жирный и при худшем сценарии (если все нажмут кэшаут в конце)
//     // может увести баланс копилки ниже нуля, принудительно «подрезаем» раунд
//     const maxPossiblePayout = totalRoundStakes * generatedPoint;
//     if (maxPossiblePayout > currentBank && totalRoundStakes > 0) {
//         // Занижаем краш до безопасного уровня (от 1.01 до 1.35)
//         generatedPoint = parseFloat((1.01 + Math.random() * 0.34).toFixed(2));
//     }
//
//     crashPoint = generatedPoint;
//
//     // Переводим всех, кто сделал ставку, в статус "в полете"
//     Object.keys(currentBets).forEach(username => {
//         state.addPlayerToFlight(username);
//     });
//
//     // --- СТАДИЯ 2: ПОЛЕТ (Реалтайм цикл через сокеты) ---
//     let startTime = Date.now();
//
//     const flightInterval = setInterval(async () => {
//         let elapsed = (Date.now() - startTime) / 1000;
//
//         // Математическая кривая роста самолета во времени (растет медленно в начале, ускоряется в конце)
//         currentMultiplier = parseFloat(Math.pow(Math.E, 0.06 * elapsed).toFixed(2));
//
//         // ПРОВЕРКА НА КРАШ
//         if (currentMultiplier >= crashPoint) {
//             currentMultiplier = crashPoint;
//             clearInterval(flightInterval);
//
//             // Бум! Самолет улетел
//             gameStatus = "crashed";
//             io.emit('crash_state', { status: "crashed", multiplier: currentMultiplier });
//
//             // Записываем проигрыш для тех, кто не успел катапультироваться
//             const inFlightPlayers = Object.keys(state.getActiveInFlight());
//             for (let username of inFlightPlayers) {
//                 const lostBet = currentBets[username];
//                 await state.savePlayerActionHistory(username, {
//                     game: "Crash",
//                     details: `Flew away at ${crashPoint}x. Lost bet.`,
//                     change: `-${lostBet} 🪙`,
//                     win: false
//                 });
//             }
//
//             // Пауза 4 секунды на просмотр экрана краша и запуск нового раунда
//             setTimeout(() => {
//                 runNextRoundLoop(io);
//             }, 4000);
//             return;
//         }
//
//         // Транслируем текущий икс раунда всем подключенным игрокам
//         io.emit('crash_state', { status: "flying", multiplier: currentMultiplier });
//
//     }, 80); // Шаг обновления — 80 миллисекунд для идеальной плавности
// }
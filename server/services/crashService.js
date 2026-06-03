const state = require('../state');

let gameStatus = "betting"; // "betting", "flying", "crashed"
let currentMultiplier = 1.00;
let crashPoint = 1.00;

function initCrashService(io) {
    runNextRoundLoop(io);
}

async function runNextRoundLoop(io) {
    // --- СТАДИЯ 1: ПРИЕМ СТАВОК ---
    gameStatus = "betting";
    currentMultiplier = 1.00;
    state.clearCrashBets();
    state.clearFlightPlayers();

    const config = state.getConfig().crash;
    let timer = config.betTime;

    // Таймер обратного отсчета для приема ставок
    const bettingInterval = setInterval(() => {
        timer -= 1000;
        io.emit('crash_state', { status: "betting", timeLeft: timer });

        if (timer <= 0) {
            clearInterval(bettingInterval);
            startFlight(io);
        }
    }, 1000);
}

async function startFlight(io) {
    gameStatus = "flying";

    // --- МЕХАНИКА RTP: ГЕНЕРАЦИЯ ТОЧКИ ПАДЕНИЯ (CRASH POINT) ---
    const config = state.getConfig().crash;
    const currentBets = state.getCrashBets();

    // Считаем общую сумму всех ставок в этом раунде
    let totalRoundStakes = 0;
    Object.values(currentBets).forEach(amount => totalRoundStakes += amount);

    // Базовый математический расчет точки падения
    const rand = Math.random();
    // Формула дает честный логарифмический рост (много мелких иксов, мало крупных)
    let generatedPoint = parseFloat((0.95 / (1 - rand)).toFixed(2));
    if (generatedPoint < 1.00) generatedPoint = 1.00;
    if (generatedPoint > config.maxMultiplier) generatedPoint = config.maxMultiplier;

    // СВЕРКА С RTP: Проверяем, сколько мы можем выплатить из копилки
    const currentBank = state.getCrashBank();

    // Если сгенерированный икс слишком жирный и при худшем сценарии (если все нажмут кэшаут в конце)
    // может увести баланс копилки ниже нуля, принудительно «подрезаем» раунд
    const maxPossiblePayout = totalRoundStakes * generatedPoint;
    if (maxPossiblePayout > currentBank && totalRoundStakes > 0) {
        // Занижаем краш до безопасного уровня (от 1.01 до 1.35)
        generatedPoint = parseFloat((1.01 + Math.random() * 0.34).toFixed(2));
    }

    crashPoint = generatedPoint;

    // Переводим всех, кто сделал ставку, в статус "в полете"
    Object.keys(currentBets).forEach(username => {
        state.addPlayerToFlight(username);
    });

    // --- СТАДИЯ 2: ПОЛЕТ (Реалтайм цикл через сокеты) ---
    let startTime = Date.now();

    const flightInterval = setInterval(async () => {
        let elapsed = (Date.now() - startTime) / 1000;

        // Математическая кривая роста самолета во времени (растет медленно в начале, ускоряется в конце)
        currentMultiplier = parseFloat(Math.pow(Math.E, 0.06 * elapsed).toFixed(2));

        // ПРОВЕРКА НА КРАШ
        if (currentMultiplier >= crashPoint) {
            currentMultiplier = crashPoint;
            clearInterval(flightInterval);

            // Бум! Самолет улетел
            gameStatus = "crashed";
            io.emit('crash_state', { status: "crashed", multiplier: currentMultiplier });

            // Записываем проигрыш для тех, кто не успел катапультироваться
            const inFlightPlayers = Object.keys(state.getActiveInFlight());
            for (let username of inFlightPlayers) {
                const lostBet = currentBets[username];
                await state.savePlayerActionHistory(username, {
                    game: "Crash",
                    details: `Flew away at ${crashPoint}x. Lost bet.`,
                    change: `-${lostBet} 🪙`,
                    win: false
                });
            }

            // Пауза 4 секунды на просмотр экрана краша и запуск нового раунда
            setTimeout(() => {
                runNextRoundLoop(io);
            }, 4000);
            return;
        }

        // Транслируем текущий икс раунда всем подключенным игрокам
        io.emit('crash_state', { status: "flying", multiplier: currentMultiplier });

    }, 80); // Шаг обновления — 80 миллисекунд для идеальной плавности
}

module.exports = { initCrashService, getStatus: () => gameStatus, getMultiplier: () => currentMultiplier };

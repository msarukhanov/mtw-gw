const Datastore = require('nedb-promises');
const crypto = require('crypto');
const path = require('path');

// База данных игроков
const db = Datastore.create({
    filename: path.join(__dirname, 'game.db'),
    autoload: true
});

// Новая база данных для хранения истории лотерейных тиражей
const historyDb = Datastore.create({
    filename: path.join(__dirname, 'history.db'),
    autoload: true
});

const activeTickets = {};
let globalJackpot = 1000;

// ЦЕНТРАЛЬНЫЕ НАСТРОЙКИ ИГР (Теперь они живут только на сервере!)

const CONFIG = {
    lottery: { ticketPrice: 1, totalNumbers: 49, neededChoices: 6, rtp: 75 }, // 75% лимит выплат
    slots: { cost: 10, symbols: ['🦁', '🐯', '🐻', '💎', '🍒', '🍀'], rtp: 80 }, // 80% отдача
    wheel: {
        cost: 20,
        rtp: 70, // 70% отдача
        sectors: [
            { label: '1', prize: 10 }, { label: '💎 JACKPOT', prize: 'JACKPOT' },
            { label: '2', prize: 10 }, { label: 'Empty', prize: 0 },
            { label: '3', prize: 10 }, { label: '4', prize: 10 },
            { label: '5', prize: 10 }, { label: 'Double', prize: 40 },
            { label: '6', prize: 10 }, { label: '7', prize: 10 }
        ]
    },
    scratch: { cost: 15, symbols: ['🦁', '🐯', '🐻', '🍒', '🍀'], rtp: 75 }, // 75% отдача
    mines: {
        gridSize: 25,     // Сетка 5х5 (25 ячеек)
        minMines: 1,      // Минимальное количество бомб
        maxMines: 24,     // Максимальное количество бомб
        rtpPercent: 80    // Целевой процент отдачи (например, 95%)
    },
    crash: {
        betTime: 8000,     // Время на прием ставок (8 секунд)
        maxMultiplier: 1000, // Максимально возможный икс
        baseRtp: 80        // Базовый RTP игры в %
    }
};


function getRandomInt(max) {
    return crypto.randomBytes(4).readUInt32BE(0) % max;
}

let minesBankPool = 5000;
const activeMinesGames = {};

// 2. Хранилище для Авиатора в оперативной памяти бэкенда
let crashBankPool = 5000;         // Копилка (банк) игры Авиатор
let currentCrashBets = {};        // Ставки на текущий раунд: { username: betAmount }
let currentActivePlayers = {};    // Игроки, которые еще в полете: { username: true }

// 4. Математическая формула расчета множителя на основе теории вероятностей
function getMinesMultiplier(totalCells, totalMines, openedCells) {
    let multiplier = 1;
    for (let i = 0; i < openedCells; i++) {
        multiplier *= (totalCells - i) / (totalCells - totalMines - i);
    }
    // Слегка корректируем базовый множитель под заложенный RTP
    const rtpFactor = CONFIG.mines.rtpPercent / 100;
    return parseFloat((multiplier * rtpFactor).toFixed(2));
}

const playerMethods = {
    getOrCreatePlayer: async (username) => {
        let player = await db.findOne({ username: username });
        if (!player) {
            player = { username: username, balance: 200 };
            await db.insert(player);
        }
        if (!activeTickets[username]) activeTickets[username] = [];
        player.tickets = activeTickets[username];
        return player;
    },
    updateBalance: async (username, newBalance) => {
        await db.update({ username: username }, { $set: { balance: newBalance } });
    },
    getGamersWithTickets: async () => {
        const gamers = [];
        const usernames = Object.keys(activeTickets);
        for (const username of usernames) {
            if (activeTickets[username].length > 0) {
                let player = await db.findOne({ username: username });
                if (player) {
                    player.tickets = activeTickets[username];
                    gamers.push(player);
                }
            }
        }
        return gamers;
    },
    // --- Единый метод для записи любого действия в историю игрока ---
    savePlayerActionHistory: async (username, actionData) => {
        const player = await db.findOne({ username: username });
        if (player) {
            if (!player.history) player.history = [];

            // Добавляем время к записи
            const timeString = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

            // Вставляем новое действие в самый верх списка
            player.history.unshift({
                time: timeString,
                ...actionData
            });

            // Храним только последние 30 любых действий игрока
            if (player.history.length > 30) player.history.pop();

            await db.update({ username: username }, { $set: { history: player.history } });
        }
    },

    // Получить общую историю игрока
    getPlayerHistory: async (username) => {
        const player = await db.findOne({ username: username });
        return player && player.history ? player.history : [];
    },

    getAllPlayers: async () => {
        return await db.find({});
    },
};

const jackpotMethods = {
    getJackpot: () => globalJackpot,
    addJackpot: (amount) => { globalJackpot += amount; },
    resetJackpot: () => { globalJackpot = 1000; },
    setJackpot: (amount) => {
        globalJackpot = Number(amount);
    },
};

const minesMethods = {
    getMinesGame: (username) => activeMinesGames[username],
    setMinesGame: (username, gameData) => { activeMinesGames[username] = gameData; },
    deleteMinesGame: (username) => { delete activeMinesGames[username]; },
    getMinesMultiplier,

    // Методы управления банком игры для контроля RTP
    getMinesBank: () => minesBankPool,
    addMinesBank: (amount) => { minesBankPool += amount; },
    reduceMinesBank: (amount) => { minesBankPool -= amount; },

    // Позволяет админке динамически менять процент RTP
    setMinesRtp: (newRtp) => { CONFIG.mines.rtpPercent = newRtp; },

};

const crashMethods = {
    // Управление банком Авиатора
    getCrashBank: () => crashBankPool,
    addCrashBank: (amount) => { crashBankPool += amount; },
    reduceCrashBank: (amount) => { crashBankPool -= amount; },

    // Управление ставками раунда
    getCrashBets: () => currentCrashBets,
    addCrashBet: (username, amount) => { currentCrashBets[username] = amount; },
    clearCrashBets: () => { currentCrashBets = {}; },

    getActiveInFlight: () => currentActivePlayers,
    addPlayerToFlight: (username) => { currentActivePlayers[username] = true; },
    removePlayerFromFlight: (username) => { delete currentActivePlayers[username]; },
    clearFlightPlayers: () => { currentActivePlayers = {}; }
};

module.exports = {
    getRandomInt,

    ...playerMethods,
    ...jackpotMethods,
    ...minesMethods,
    ...crashMethods,

    getConfig: () => CONFIG, // Метод для отправки настроек клиенту
// --- НОВЫЕ МЕТОДЫ ДЛЯ АДМИНКИ ---
    updateConfigParam: (game, param, value) => {
        if (CONFIG[game] && CONFIG[game][param] !== undefined) {
            // Если параметр числовой, парсим его
            CONFIG[game][param] = typeof CONFIG[game][param] === 'number' ? Number(value) : value;
            return true;
        }
        return false;
    },




    clearPlayerTickets: (username) => {
        activeTickets[username] = [];
    },

    // --- Методы для работы с историей лотереи ---
    saveDrawToHistory: async (drawData) => {
        await historyDb.insert(drawData);
    },

    getLotteryHistory: async (limit = 20) => {
        // Достаем последние 20 тиражей, сортируем по id или времени (в NeDB делаем через массив)
        const history = await historyDb.find({});
        return history.slice(-limit); // Возвращаем последние N записей
    },

    // --- Методы для работы с личной историей игрока ---
};

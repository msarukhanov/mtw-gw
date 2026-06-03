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
    },
    dice: {
        minRoll: 1,
        maxRoll: 100,
        baseRtp: 96,
        houseEdge: 0.04 // 4% комиссия дома (RTP игры = 96%)
    },
    hilo: {
        baseRtp: 96,
        houseEdge: 0.04, // 4% маржа дома (RTP = 96%)
        // Массив карт от Двойки до Туза (номиналы от 2 до 14 для удобства математики)
        cards: [
            { suit: '♠', name: '2', value: 2 }, { suit: '♦', name: '3', value: 3 },
            { suit: '♣', name: '4', value: 4 }, { suit: '♥', name: '5', value: 5 },
            { suit: '♠', name: '6', value: 6 }, { suit: '♦', name: '7', value: 7 },
            { suit: '♣', name: '8', value: 8 }, { suit: '♥', name: '9', value: 9 },
            { suit: '♠', name: '10', value: 10 }, { suit: '♦', name: 'J', value: 11 },
            { suit: '♣', name: 'Q', value: 12 }, { suit: '♥', name: 'K', value: 13 },
            { suit: '♠', name: 'A', value: 14 }
        ]
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

let diceBankPool = 3000;

let hiloBankPool = 4000;
const activeHiloCards = {}; // Хранит текущую карту игрока: { username: currentCardObject }

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

function getHiloMultipliers(currentValue) {
    const config = CONFIG.hilo;
    const totalCards = config.cards.length;

    // Считаем сколько в колоде карт выше/равно и ниже/равно текущей
    const higherCount = config.cards.filter(c => c.value >= currentValue).length;
    const lowerCount = config.cards.filter(c => c.value <= currentValue).length;

    // Формула: (Всего карт / Карт, подходящих под условие) * (1 - Комиссия)
    const multHigher = parseFloat(((totalCards / higherCount) * (1 - config.houseEdge)).toFixed(2));
    const multLower = parseFloat(((totalCards / lowerCount) * (1 - config.houseEdge)).toFixed(2));

    return {
        higher: multHigher > 1 ? multHigher : 1.01,
        lower: multLower > 1 ? multLower : 1.01
    };
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

const diceMethods = {
    getDiceBank: () => diceBankPool,
    addDiceBank: (amount) => { diceBankPool += amount; },
    reduceDiceBank: (amount) => { diceBankPool -= amount; }
};

const hiloMethods = {
    getHiloBank: () => hiloBankPool,
    addHiloBank: (amount) => { hiloBankPool += amount; },
    reduceHiloBank: (amount) => { hiloBankPool -= amount; },

    getHiloCard: (username) => activeHiloCards[username],
    setHiloCard: (username, card) => { activeHiloCards[username] = card; },
    getHiloMultipliers
};

module.exports = {
    getRandomInt,

    ...playerMethods,
    ...jackpotMethods,
    ...minesMethods,
    ...crashMethods,
    ...diceMethods,
    ...hiloMethods,

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

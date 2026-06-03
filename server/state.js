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

let banks = {
    globalJackpot: 1000,
    mines: 5000,
    crash: 5000,
    dice: 3000,
    hilo: 4000
};

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
//     updateConfigParam: (game, param, value) => {
//         if (CONFIG[game] && CONFIG[game][param] !== undefined) {
//             // Если параметр числовой, парсим его
//             CONFIG[game][param] = typeof CONFIG[game][param] === 'number' ? Number(value) : value;
//
//             return true;
//         }
//         return false;
//
//
//     },

    updateConfigParam: async (game, param, value) => {
        let changed = false;

        // Если админ меняет БАНК (копилку) игры
        if (param === 'bank') {
            const numericValue = Number(value);
            if (!isNaN(numericValue)) {
                if (game === 'mines' || game === 'crash' || game === 'dice' || game === 'hilo') {
                    banks[game] = numericValue;
                    changed = true;
                }
            }
        }
        // Если админ меняет параметры внутри CONFIG
        else if (CONFIG[game] && CONFIG[game][param] !== undefined) {
            CONFIG[game][param] = typeof CONFIG[game][param] === 'number' ? Number(value) : value;
            changed = true;
        }

        // КЛЮЧЕВОЙ ШАГ: Если что-то изменилось, принудительно пишем файл на диск!
        if (changed) {
            await db.update({ _id: 'global_config' }, { $set: { CONFIG, banks } });
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

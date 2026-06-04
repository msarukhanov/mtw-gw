const Datastore = require('nedb-promises');
const crypto = require('crypto');
const path = require('path');

const seamless = require('./services/seamlessService');

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



let slots5x3BankPool = 10000;

const activeFreeSpins = {};

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
    // savePlayerActionHistory: async (username, actionData) => {
    //     const player = await db.findOne({ username: username });
    //     if (player) {
    //         if (!player.history) player.history = [];
    //
    //         // Добавляем время к записи
    //         const timeString = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    //
    //         // Вставляем новое действие в самый верх списка
    //         player.history.unshift({
    //             time: timeString,
    //             ...actionData
    //         });
    //
    //         // Храним только последние 30 любых действий игрока
    //         if (player.history.length > 30) player.history.pop();
    //
    //         await db.update({ username: username }, { $set: { history: player.history } });
    //     }
    // },

    savePlayerActionHistory: async (username, actionData) => {
        const player = await db.findOne({ username: username });
        if (player) {
            // 1. Запись истории действий (твоя стандартная логика)
            if (!player.history) player.history = [];
            const timeString = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            player.history.unshift({ time: timeString, ...actionData });
            if (player.history.length > 30) player.history.pop();

            // 2. Геймификация (берем настройки из админки)
            const gConfig = CURRENT_CONFIG.gamification;

            // --- Начисляем XP и Уровни ---
            if (!player.xp) player.xp = 0;
            if (!player.level) player.level = 1;
            player.xp += Number(gConfig.xpPerGame);

            const nextLevelXp = player.level * Number(gConfig.xpMultiplier);
            if (player.xp >= nextLevelXp) {
                player.level += 1;
                // ПРИМЕЧАНИЕ: Если за уровень положен бонус в монетах,
                // здесь вместо "player.balance += ..." нужно будет просто вызвать твой метод CREDIT на платформу
            }

            // --- Считаем прогресс Ежедневного Квеста ---
            if (!player.dailyQuests) player.dailyQuests = { gamesPlayed: 0, claimed: false };
            if (player.dailyQuests.gamesPlayed < Number(gConfig.questTargetGames)) {
                player.dailyQuests.gamesPlayed += 1;

                if (player.dailyQuests.gamesPlayed === Number(gConfig.questTargetGames) && !player.dailyQuests.claimed) {
                    player.dailyQuests.claimed = true;
                    // Здесь при выполнении квеста тоже шлем CREDIT на платформу для выплаты бонуса
                }

                // Внутри savePlayerActionHistory, в блоке квестов:
                if (player.dailyQuests.gamesPlayed === Number(gConfig.questTargetGames) && !player.dailyQuests.claimed) {
                    player.dailyQuests.claimed = true;
                    try {
                        const questRoundId = `quest_daily_${Date.now()}_${username}`;

                        player.balance += Number(gConfig.questReward);
                        // Мы используем тот же метод credit
                        await seamless.credit(
                            username,
                            actionData.sessionId || null, // Если игра передала сессию в actionData
                            Number(gConfig.questReward),
                            "🎁 Daily Quest Reward", // Название операции для платформы
                            questRoundId
                        );
                    } catch (err) {
                        console.error(`❌ Ошибка выплаты за квест игроку ${username}:`, err.message);
                        // Если выплата не прошла, можно откатить статус claimed = false, чтобы попробовать позже
                        player.dailyQuests.claimed = false;
                    }
                }
            }

            // --- Начисляем Очки Турнира (Лидерборд) ---
            if (Number(gConfig.tournamentActive) === 1) {
                if (!player.tournamentPoints) player.tournamentPoints = 0;
                // Начисляем очки за сам факт игры, либо больше очков за выигрыш
                player.tournamentPoints += actionData.win ? 5 : 1;
            }

            // 3. ИСПРАВЛЕНИЕ: Сохраняем ТОЛЬКО геймификацию и историю.
            // Поле balance здесь НЕ трогаем и НЕ сохраняем, так как баланс живет на внешней платформе!
            await db.update({ username: username }, {
                $set: {
                    history: player.history,
                    xp: player.xp,
                    level: player.level,
                    dailyQuests: player.dailyQuests,
                    tournamentPoints: player.tournamentPoints
                }
            });
        }
    },

    calculateAndPayCashback: async (seamlessCredit) => {
        const gConfig = CONFIG.gamification || { cashbackPercent: 10 };
        const pct = Number(gConfig.cashbackPercent) / 100;

        const allPlayers = await db.find({});
        const cashbackReport = [];

        for (const player of allPlayers) {
            if (!player.history || player.history.length === 0) continue;

            let totalDebits = 0;
            let totalCredits = 0;

            // Парсим историю последних действий игрока
            player.history.forEach(action => {
                const changeStr = action.change || "";
                const amount = parseInt(changeStr.replace(/[^0-9]/g, '')) || 0;

                if (changeStr.includes('-')) {
                    totalDebits += amount;
                } else if (changeStr.includes('+')) {
                    totalCredits += amount;
                }
            });

            // Чистый проигрыш = сколько потратил минус сколько вернул
            const netLoss = totalDebits - totalCredits;

            if (netLoss > 0) {
                const cashbackAmount = Math.floor(netLoss * pct);

                if (cashbackAmount > 0) {
                    try {
                        const cashbackRoundId = `cashback_${Date.now()}_${player.username}`;

                        // Выплачиваем кэшбэк на внешнюю платформу
                        await seamlessCredit(
                            player.username,
                            null,
                            cashbackAmount,
                            "💰 Weekly Cashback",
                            cashbackRoundId
                        );

                        player.balance += (cashbackAmount||0);

                        // Очищаем историю игрока или делаем отметку, чтобы не выдать кэшбэк повторно
                        player.history.unshift({
                            time: new Date().toLocaleTimeString(),
                            game: "💰 Cashback System",
                            details: `Получен еженедельный кэшбэк ${gConfig.cashbackPercent}%`,
                            change: `+${cashbackAmount} 🪙`,
                            win: true
                        });

                        await db.update({ username: player.username }, { $set: { history: player.history } });

                        cashbackReport.push({ username: player.username, loss: netLoss, paid: cashbackAmount });
                    } catch (e) {
                        console.error(`Ошибка выплаты кэшбэка для ${player.username}:`, e.message);
                    }
                }
            }
        }
        return cashbackReport;
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

const slots5x3Methods = {
    // ... ваши существующие методы
    getSlots5x3Bank: () => slots5x3BankPool,
    addSlots5x3Bank: (amount) => { slots5x3BankPool += amount; },
    reduceSlots5x3Bank: (amount) => { slots5x3BankPool -= amount; },
};

const freeSpinMethods = {
    // ... ваши существующие методы
    getFreeSpins: (username) => activeFreeSpins[username],
    setFreeSpins: (username, fsData) => { activeFreeSpins[username] = fsData; },
    deleteFreeSpins: (username) => { delete activeFreeSpins[username]; }
};

const gamificationMethods = {
    getLeaderboard: async (criterion = 'balance', limit = 10) => {
        // Поддерживаемые критерии: 'balance', 'xp', 'tournamentPoints'
        const validCriteria = ['balance', 'xp', 'tournamentPoints'];
        const sortField = validCriteria.includes(criterion) ? criterion : 'balance';

        // Находим всех игроков
        const allPlayers = await db.find({});

        // Сортируем по выбранному полю в порядке убывания и берем ТОП-10
        return allPlayers
            .sort((a, b) => {
                const valA = a[sortField] || 0;
                const valB = b[sortField] || 0;
                return valB - valA;
            })
            .slice(0, limit)
            .map((p, index) => ({
                rank: index + 1,
                username: p.username,
                level: p.level || 1,
                balance: p.balance,
                tournamentPoints: p.tournamentPoints || 0
            }));
    },

    endCurrentTournament: async () => {
        // 1. Получаем настройки призового фонда из конфига
        const gConfig = CONFIG.gamification || {tournamentPrize: 5000};
        const totalPrize = Number(gConfig.tournamentPrize);

        // Распределяем фонд: 1 место — 50%, 2 место — 30%, 3 место — 20%
        const prizes = [
            Math.floor(totalPrize * 0.50), // 1 место
            Math.floor(totalPrize * 0.30), // 2 место
            Math.floor(totalPrize * 0.20)  // 3 место
        ];

        // 2. Достаем всех игроков из базы
        const allPlayers = await db.find({});

        // Фильтруем тех, у кого есть очки, и сортируем по убыванию
        const participants = allPlayers
            .filter(p => p.tournamentPoints && p.tournamentPoints > 0)
            .sort((a, b) => b.tournamentPoints - a.tournamentPoints);

        const winnersInfo = [];

        // 3. Награждаем ТОП-3 победителей
        for (let i = 0; i < participants.length; i++) {
            const player = participants[i];
            let prizeWon = 0;

            if (i < 3) {
                prizeWon = prizes[i];
                player.balance += prizeWon;
                winnersInfo.push({
                    username: player.username,
                    place: i + 1,
                    points: player.tournamentPoints,
                    prize: prizeWon
                });

                try {
                    // Вызываем внешнюю операцию CREDIT для отправки денег на платформу
                    // Вместо roundId передаем уникальный ID турнира, чтобы транзакции не дублировались
                    const tournamentRoundId = `tournament_win_${Date.now()}_${player.username}`;

                    await seamless.credit(
                        player.username,
                        null,
                        prizeWon,
                        `🏆 Tournament Place ${i + 1}`, // Передаем понятное название "игры"
                        tournamentRoundId
                    );

                    winnersInfo.push({ username: player.username, place: i + 1, points: player.tournamentPoints, prize: prizeWon });
                } catch (err) {
                    console.error(`❌ Не удалось выплатить приз турнира для ${player.username}:`, err.message);
                }
            }

            // Добавляем запись в историю игрока о завершении турнира
            if (!player.history) player.history = [];
            const timeString = new Date().toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            });

            player.history.unshift({
                time: timeString,
                game: "🏆 Tournament End",
                details: `Турнир окончен. Очки: ${player.tournamentPoints}. Место: ${i + 1}`,
                change: prizeWon > 0 ? `+${prizeWon} 🪙` : `0 🪙`,
                win: prizeWon > 0
            });
            if (player.history.length > 30) player.history.pop();

            // Сбрасываем очки турнира для нового сезона
            player.tournamentPoints = 0;

            // Обновляем игрока в базе данных
            await db.update({username: player.username}, {
                $set: {
                    balance: player.balance,
                    tournamentPoints: player.tournamentPoints,
                    history: player.history
                }
            });
        }

        return winnersInfo; // Возвращаем отчет, чтобы админ видел, кто победил
    },

    resetDailyQuestsForAll: async () => {
        try {
            // Находим всех игроков, у которых уже есть объект квестов
            const players = await db.find({});

            for (const player of players) {
                if (player.dailyQuests) {
                    // Сбрасываем прогресс до начального состояния
                    player.dailyQuests = { gamesPlayed: 0, claimed: false };

                    // Обновляем запись в NeDB
                    await db.update({ username: player.username }, {
                        $set: { dailyQuests: player.dailyQuests }
                    });
                }
            }
            console.log("📅 [Cron] Ежедневные квесты успешно обнулены для всех игроков!");
            return true;
        } catch (err) {
            console.error("❌ Ошибка при автоматическом сбросе квестов:", err);
            return false;
        }
    }
};

const promoMethods = {
    // Создать новый промокод из админки
    addPromoCode: async (codeData) => {
        if (!CONFIG.promoCodes) CONFIG.promoCodes = [];
        CONFIG.promoCodes.push({
            code: codeData.code.toUpperCase().trim(),
            reward: Number(codeData.reward),
            maxUses: Number(codeData.maxUses || 1),
            active: 1
        });
        await configDb.update({ _id: "global_config" }, { $set: { promoCodes: CONFIG.promoCodes } });
    },

    // Логика активации кода игроком
    usePromoCode: async (username, code, seamlessCredit) => {
        const cleanCode = code.toUpperCase().trim();
        const promo = (CONFIG.promoCodes || []).find(p => p.code === cleanCode && p.active === 1);

        if (!promo) throw new Error("Invalid code");

        const player = await db.findOne({ username });
        if (!player) throw new Error("Player not found");

        if (!player.usedPromos) player.usedPromos = {};
        const timesUsed = player.usedPromos[cleanCode] || 0;

        if (timesUsed >= promo.maxUses) throw new Error("Вы уже активировали этот промокод max количество раз");

        // Если проверки прошли — начисляем бонус на платформу через Seamless Credit
        const promoRoundId = `promo_${cleanCode}_${Date.now()}_${username}`;
        await seamlessCredit(
            username,
            null,
            promo.reward,
            `🎁 Promo: ${cleanCode}`,
            promoRoundId
        );

        // Фиксируем использование кода локально
        player.usedPromos[cleanCode] = timesUsed + 1;
        await db.update({ username }, { $set: { usedPromos: player.usedPromos } });

        return promo.reward;
    }

};

module.exports = {
    getRandomInt,

    ...playerMethods,
    ...jackpotMethods,
    ...gamificationMethods,
    ...promoMethods,

    ...minesMethods,
    ...crashMethods,
    ...diceMethods,
    ...hiloMethods,

    ...slots5x3Methods,
    ...freeSpinMethods,

    getConfig: () => CONFIG, // Метод для отправки настроек клиенту

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

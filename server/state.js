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
    getOrCreatePlayer: async (username, partnerId) => {
        let player = await db.findOne({ username, partnerId  });
        if (!player) {
            player = {
                username,
                partnerId, // ВАЖНО: сохраняем partnerId в документ игрока
                balance: 200
            };
            await db.insert(player);
        }

        // Создаем составной ключ для оперативной памяти, чтобы избежать коллизий имен
        const memKey = `${partnerId}_${username}`;
        if (!activeTickets[memKey]) activeTickets[memKey] = [];
        player.tickets = activeTickets[memKey];

        return player;
    },
    updateBalance: async (username, partnerId, newBalance) => {
        await db.update({ username, partnerId }, { $set: { balance: newBalance } });

        const io = req.app.get('io');
        if (io) {
            io.to(`${partnerId}_${username}`).emit('wallet_update', { balance: newBalance });
        }
    },

    // ИСПРАВЛЕНО: Метод собирает билеты игроков, разделяя их по тенантам (партнерам)
    getGamersWithTickets: async () => {
        const gamers = [];
        const memKeys = Object.keys(activeTickets); // Ключи вида "siteA_john"

        for (const memKey of memKeys) {
            if (activeTickets[memKey].length > 0) {
                // Разделяем составной ключ обратно на partnerId и username
                const [partnerId, username] = memKey.split('_');

                let player = await db.findOne({ username: username, partnerId: partnerId });
                if (player) {
                    player.tickets = activeTickets[memKey];
                    gamers.push(player);
                }
            }
        }
        return gamers;
    },

    // ИСПРАВЛЕНО: Добавлен partnerId в аргументы для изоляции правок
    savePlayerActionHistory: async (username, partnerId, actionData) => {
        const player = await db.findOne({ username: username, partnerId: partnerId });
        if (player) {
            // 1. Запись истории действий (твоя стандартная логика)
            if (!player.history) player.history = [];
            const timeString = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            player.history.unshift({ time: timeString, ...actionData });
            if (player.history.length > 30) player.history.pop();

            // 2. БЕЗОПАСНАЯ B2B ГЕЙМИФИКАЦИЯ: Достаем конфиг конкретного партнера
            // Если у партнера нет своего конфига, берем дефолтный из CONFIG
            const partnerConfig = CONFIG[partnerId] || CONFIG;
            const gConfig = partnerConfig.gamification || { xpPerGame: 10, xpMultiplier: 1000, levelUpBonus: 100, questTargetGames: 30, questReward: 50, tournamentActive: 0 };

            // --- Начисляем XP и Уровни ---
            if (!player.xp) player.xp = 0;
            if (!player.level) player.level = 1;
            player.xp += Number(gConfig.xpPerGame);

            const nextLevelXp = player.level * Number(gConfig.xpMultiplier);
            if (player.xp >= nextLevelXp) {
                player.level += 1;
                // Начисление бонуса за уровень через Seamless Credit (по аналогии с квестом):
                try {
                    const lvlRoundId = `lvlup_${player.level}_${Date.now()}_${username}`;
                    await seamless.credit(
                        username,
                        partnerId, // Передаем partnerId, чтобы роут кошелька знал, куда слать запрос
                        actionData.sessionId || null,
                        Number(gConfig.levelUpBonus),
                        "🎁 VIP Level Up Reward",
                        lvlRoundId
                    );
                } catch (err) {
                    console.error(`❌ Ошибка выплаты за уровень игроку ${username}:`, err.message);
                }
            }

            // --- Считаем прогресс Ежедневного Квеста ---
            if (!player.dailyQuests) player.dailyQuests = { gamesPlayed: 0, claimed: false };
            if (player.dailyQuests.gamesPlayed < Number(gConfig.questTargetGames)) {
                player.dailyQuests.gamesPlayed += 1;

                if (player.dailyQuests.gamesPlayed === Number(gConfig.questTargetGames) && !player.dailyQuests.claimed) {
                    player.dailyQuests.claimed = true;
                    try {
                        const questRoundId = `quest_daily_${Date.now()}_${username}`;

                        // ИСПРАВЛЕНО: Добавлен partnerId в вызов credit, чтобы деньги улетали на правильный сайт
                        await seamless.credit(
                            username,
                            partnerId,
                            actionData.sessionId || null,
                            Number(gConfig.questReward),
                            "🎁 Daily Quest Reward",
                            questRoundId
                        );
                    } catch (err) {
                        console.error(`❌ Ошибка выплаты за квест игроку ${username}:`, err.message);
                        player.dailyQuests.claimed = false;
                    }
                }
            }

            // --- Начисляем Очки Турнира (Лидерборд) ---
            if (Number(gConfig.tournamentActive) === 1) {
                if (!player.tournamentPoints) player.tournamentPoints = 0;
                player.tournamentPoints += actionData.win ? 5 : 1;
            }

            // 3. Сохраняем обновленные данные в локальную NeDB
            await db.update({ username: username, partnerId: partnerId }, {
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

    // ИСПРАВЛЕНО: Теперь кэшбэк считается изолированно для конкретного партнера
    calculateAndPayCashback: async (partnerId, seamlessCredit) => {
        // Достаем настройки кэшбэка именно этого партнера
        const partnerConfig = CONFIG[partnerId] || CONFIG;
        const gConfig = partnerConfig.gamification || { cashbackPercent: 10 };
        const pct = Number(gConfig.cashbackPercent) / 100;

        // ИСПРАВЛЕНО: Находим игроков только этого конкретного партнера
        const allPlayers = await db.find({ partnerId: partnerId });
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

                        // ИСПРАВЛЕНО: Передаем partnerId в метод кредита, чтобы транзакция ушла на нужный сайт
                        await seamlessCredit(
                            player.username,
                            partnerId,
                            null,
                            cashbackAmount,
                            "💰 Weekly Cashback",
                            cashbackRoundId
                        );

                        // Очищаем историю игрока или делаем отметку, чтобы не выдать кэшбэк повторно
                        player.history.unshift({
                            time: new Date().toLocaleTimeString(),
                            game: "💰 Cashback System",
                            details: `Received weekly cashback ${gConfig.cashbackPercent}%`,
                            change: `+${cashbackAmount} 🪙`,
                            win: true
                        });

                        // ИСПРАВЛЕНО: Апдейтим игрока с учетом составного ключа
                        await db.update(
                            { username: player.username, partnerId: partnerId },
                            { $set: { history: player.history } }
                        );

                        cashbackReport.push({ username: player.username, loss: netLoss, paid: cashbackAmount });
                    } catch (e) {
                        console.error(`Ошибка выплаты кэшбэка для ${player.username}:`, e.message);
                    }
                }
            }
        }
        return cashbackReport;
    },

    // ИСПРАВЛЕНО: Аргумент partnerId передан в функцию для поиска нужной истории
    getPlayerHistory: async (username, partnerId) => {
        const player = await db.findOne({ username: username, partnerId: partnerId });
        return player && player.history ? player.history : [];
    },

    // ИСПРАВЛЕНО: Метод теперь принимает аргумент и отдает игроков только конкретного партнера
    getAllPlayers: async (partnerId) => {
        return await db.find({ partnerId: partnerId });
    },

};

const jackpotMethods = {
    // ИСПРАВЛЕНО: Теперь джекпот изолирован для каждого партнера
    getJackpot: (partnerId) => {
        if (!banks[partnerId]) banks[partnerId] = { globalJackpot: 1000, mines: 5000, crash: 5000, dice: 3000, hilo: 4000, slots5x3: 10000 };
        return banks[partnerId].globalJackpot;
    },
    addJackpot: (partnerId, amount) => {
        if (!banks[partnerId]) jackpotMethods.getJackpot(partnerId);
        banks[partnerId].globalJackpot += amount;
    },
    resetJackpot: (partnerId) => {
        if (banks[partnerId]) banks[partnerId].globalJackpot = 1000;
    },
    setJackpot: (partnerId, amount) => {
        if (!banks[partnerId]) jackpotMethods.getJackpot(partnerId);
        banks[partnerId].globalJackpot = Number(amount);
    },
};

const minesMethods = {
    // ИСПРАВЛЕНО: Сессии Mines теперь разделены по составному ключу "partnerId_username"
    getMinesGame: (username, partnerId) => activeMinesGames[`${partnerId}_${username}`],
    setMinesGame: (username, partnerId, gameData) => { activeMinesGames[`${partnerId}_${username}`] = gameData; },
    deleteMinesGame: (username, partnerId) => { delete activeMinesGames[`${partnerId}_${username}`]; },
    getMinesMultiplier,

    // ИСПРАВЛЕНО: Банк Mines теперь изолирован под каждого партнера отдельно
    getMinesBank: (partnerId) => {
        if (!banks[partnerId]) jackpotMethods.getJackpot(partnerId);
        return banks[partnerId].mines;
    },
    addMinesBank: (partnerId, amount) => {
        if (!banks[partnerId]) jackpotMethods.getJackpot(partnerId);
        banks[partnerId].mines += amount;
    },
    reduceMinesBank: (partnerId, amount) => {
        if (!banks[partnerId]) jackpotMethods.getJackpot(partnerId);
        banks[partnerId].mines -= amount;
    },

    // Позволяет админке конкретного партнера менять свой RTP
    setMinesRtp: (partnerId, newRtp) => {
        const pConfig = CONFIG[partnerId] || CONFIG;
        if (pConfig.mines) pConfig.mines.rtpPercent = newRtp;
    },
};

const crashMethods = {
    // ИСПРАВЛЕНО: Банк Crash изолирован по партнерам
    getCrashBank: (partnerId) => {
        if (!banks[partnerId]) jackpotMethods.getJackpot(partnerId);
        return banks[partnerId].crash;
    },
    addCrashBank: (partnerId, amount) => {
        if (!banks[partnerId]) jackpotMethods.getJackpot(partnerId);
        banks[partnerId].crash += amount;
    },
    reduceCrashBank: (partnerId, amount) => {
        if (!banks[partnerId]) jackpotMethods.getJackpot(partnerId);
        banks[partnerId].crash -= amount;
    },

    // ИСПРАВЛЕНО: Ставки текущего раунда Crash теперь разделены по партнерам
    getCrashBets: (partnerId) => {
        if (!currentCrashBets[partnerId]) currentCrashBets[partnerId] = {};
        return currentCrashBets[partnerId];
    },
    addCrashBet: (username, partnerId, amount) => {
        if (!currentCrashBets[partnerId]) currentCrashBets[partnerId] = {};
        currentCrashBets[partnerId][username] = amount;
    },
    clearCrashBets: (partnerId) => { currentCrashBets[partnerId] = {}; },

    // ИСПРАВЛЕНО: Активные игроки «в полете» разделены по партнерам
    getActiveInFlight: (partnerId) => {
        if (!currentActivePlayers[partnerId]) currentActivePlayers[partnerId] = {};
        return currentActivePlayers[partnerId];
    },
    addPlayerToFlight: (username, partnerId) => {
        if (!currentActivePlayers[partnerId]) currentActivePlayers[partnerId] = {};
        currentActivePlayers[partnerId][username] = true;
    },
    removePlayerFromFlight: (username, partnerId) => {
        if (currentActivePlayers[partnerId]) delete currentActivePlayers[partnerId][username];
    },
    clearFlightPlayers: (partnerId) => { currentActivePlayers[partnerId] = {}; }
};

const diceMethods = {
    // ИСПРАВЛЕНО: Банк Dice изолирован
    getDiceBank: (partnerId) => {
        if (!banks[partnerId]) jackpotMethods.getJackpot(partnerId);
        return banks[partnerId].dice;
    },
    addDiceBank: (partnerId, amount) => {
        if (!banks[partnerId]) jackpotMethods.getJackpot(partnerId);
        banks[partnerId].dice += amount;
    },
    reduceDiceBank: (partnerId, amount) => {
        if (!banks[partnerId]) jackpotMethods.getJackpot(partnerId);
        banks[partnerId].dice -= amount;
    }
};

const hiloMethods = {
    // ИСПРАВЛЕНО: Банк Hi-Lo изолирован
    getHiloBank: (partnerId) => {
        if (!banks[partnerId]) jackpotMethods.getJackpot(partnerId);
        return banks[partnerId].hilo;
    },
    addHiloBank: (partnerId, amount) => {
        if (!banks[partnerId]) jackpotMethods.getJackpot(partnerId);
        banks[partnerId].hilo += amount;
    },
    reduceHiloBank: (partnerId, amount) => {
        if (!banks[partnerId]) jackpotMethods.getJackpot(partnerId);
        banks[partnerId].hilo -= amount;
    },

    // ИСПРАВЛЕНО: Карты в Hi-Lo разделены по составному ключу "partnerId_username"
    getHiloCard: (username, partnerId) => activeHiloCards[`${partnerId}_${username}`],
    setHiloCard: (username, partnerId, card) => { activeHiloCards[`${partnerId}_${username}`] = card; },
    getHiloMultipliers
};

const slots5x3Methods = {
    // ИСПРАВЛЕНО: Банк Слотов 5х3 изолирован
    getSlots5x3Bank: (partnerId) => {
        if (!banks[partnerId]) jackpotMethods.getJackpot(partnerId);
        // Безопасный фолбэк, если поле slots5x3 еще не создано у этого партнера
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

const freeSpinMethods = {
    // ИСПРАВЛЕНО: Фриспины разделены по составному ключу "partnerId_username"
    getFreeSpins: (username, partnerId) => activeFreeSpins[`${partnerId}_${username}`],
    setFreeSpins: (username, partnerId, fsData) => { activeFreeSpins[`${partnerId}_${username}`] = fsData; },
    deleteFreeSpins: (username, partnerId) => { delete activeFreeSpins[`${partnerId}_${username}`]; }
};


const gamificationMethods = {
    // ИСПРАВЛЕНО: Теперь лидерборд строится строго внутри игроков конкретного партнера
    getLeaderboard: async (partnerId, criterion = 'balance', limit = 10) => {
        const validCriteria = ['balance', 'xp', 'tournamentPoints'];
        const sortField = validCriteria.includes(criterion) ? criterion : 'balance';

        // Находим игроков только текущего партнера
        const allPlayers = await db.find({ partnerId: partnerId });

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

    // ИСПРАВЛЕНО: Метод теперь принимает partnerId и завершает турнир изолированно
    endCurrentTournament: async (partnerId) => {
        // Достаем настройки турнира именно этого партнера
        const partnerConfig = CONFIG[partnerId] || CONFIG;
        const gConfig = partnerConfig.gamification || { tournamentPrize: 5000 };
        const totalPrize = Number(gConfig.tournamentPrize);

        const prizes = [
            Math.floor(totalPrize * 0.50), // 1 место
            Math.floor(totalPrize * 0.30), // 2 место
            Math.floor(totalPrize * 0.20)  // 3 место
        ];

        // Находим игроков только этого партнера
        const allPlayers = await db.find({ partnerId: partnerId });

        const participants = allPlayers
            .filter(p => p.tournamentPoints && p.tournamentPoints > 0)
            .sort((a, b) => b.tournamentPoints - a.tournamentPoints);

        const winnersInfo = [];

        for (let i = 0; i < participants.length; i++) {
            const player = participants[i];
            let prizeWon = 0;

            if (i < 3) {
                prizeWon = prizes[i];
                player.balance += prizeWon;

                try {
                    const tournamentRoundId = `tournament_win_${Date.now()}_${player.username}`;

                    // ИСПРАВЛЕНО: Добавлен partnerId в вызов для точной маршрутизации выплаты
                    await seamless.credit(
                        player.username,
                        partnerId,
                        null,
                        prizeWon,
                        `🏆 Tournament Place ${i + 1}`,
                        tournamentRoundId
                    );

                    winnersInfo.push({
                        username: player.username,
                        place: i + 1,
                        points: player.tournamentPoints,
                        prize: prizeWon
                    });
                } catch (err) {
                    console.error(`❌ Не удалось выплатить приз турнира для ${player.username}:`, err.message);
                }
            }

            if (!player.history) player.history = [];
            const timeString = new Date().toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            });

            player.history.unshift({
                time: timeString,
                game: "🏆 Tournament End",
                details: `Tournament finished. Points: ${player.tournamentPoints}. Place: ${i + 1}`,
                change: prizeWon > 0 ? `+${prizeWon} 🪙` : `0 🪙`,
                win: prizeWon > 0
            });
            if (player.history.length > 30) player.history.pop();

            player.tournamentPoints = 0;

            // ИСПРАВЛЕНО: Сохраняем игрока с использованием составного B2B-ключа
            await db.update(
                { username: player.username, partnerId: partnerId },
                {
                    $set: {
                        balance: player.balance,
                        tournamentPoints: player.tournamentPoints,
                        history: player.history
                    }
                }
            );
        }

        return winnersInfo;
    },

    // ИСПРАВЛЕНО: Метод теперь принимает аргумент, сбрасывая квесты только внутри конкретного бренда
    resetDailyQuestsForAll: async (partnerId) => {
        try {
            // Находим игроков только нужного партнера
            const players = await db.find({ partnerId: partnerId });

            for (const player of players) {
                if (player.dailyQuests) {
                    player.dailyQuests = { gamesPlayed: 0, claimed: false };

                    await db.update(
                        { username: player.username, partnerId: partnerId },
                        { $set: { dailyQuests: player.dailyQuests } }
                    );
                }
            }
            console.log(`📅 [Cron] Daily quests successfully reset for partner: ${partnerId}`);
            return true;
        } catch (err) {
            console.error(`❌ Error auto-resetting quests for partner ${partnerId}:`, err);
            return false;
        }
    }
};


const promoMethods = {
    // ИСПРАВЛЕНО: Создание промокода теперь намертво привязано к конкретному partnerId
    addPromoCode: async (partnerId, codeData) => {
        // Подгружаем или создаем узел партнера в CONFIG
        if (!CONFIG[partnerId]) CONFIG[partnerId] = {};
        if (!CONFIG[partnerId].promoCodes) CONFIG[partnerId].promoCodes = [];

        CONFIG[partnerId].promoCodes.push({
            code: codeData.code.toUpperCase().trim(),
            reward: Number(codeData.reward),
            maxUses: Number(codeData.maxUses || 1),
            active: 1
        });

        // Перезаписываем в config.db только ветку текущего партнера
        await configDb.update({ _id: "global_config" }, { $set: { [partnerId]: CONFIG[partnerId] } });
    },

    // ИСПРАВЛЕНО: Активация кода игроком теперь проверяет partnerId
    usePromoCode: async (username, partnerId, code, seamlessCredit) => {
        const cleanCode = code.toUpperCase().trim();

        // Ищем промокод внутри реестра конкретного партнера
        const partnerConfig = CONFIG[partnerId] || {};
        const promo = (partnerConfig.promoCodes || []).find(p => p.code === cleanCode && p.active === 1);

        if (!promo) throw new Error("Invalid code");

        // Поиск игрока по составному ключу B2B
        const player = await db.findOne({ username: username, partnerId: partnerId });
        if (!player) throw new Error("Player not found");

        if (!player.usedPromos) player.usedPromos = {};
        const timesUsed = player.usedPromos[cleanCode] || 0;

        if (timesUsed >= promo.maxUses) throw new Error("You have already used this promo code maximum times");

        // ИСПРАВЛЕНО: Пробрасываем partnerId в метод кредита для точной транзакции
        const promoRoundId = `promo_${cleanCode}_${Date.now()}_${username}`;
        await seamlessCredit(
            username,
            partnerId,
            null,
            `🎁 Promo: ${cleanCode}`,
            promoRoundId
        );

        // Фиксируем использование кода локально в рамках этого бренда
        player.usedPromos[cleanCode] = timesUsed + 1;
        await db.update({ username: username, partnerId: partnerId }, { $set: { usedPromos: player.usedPromos } });

        return promo.reward;
    }
};

const betsDb = Datastore.create({ filename: path.join(__dirname, 'bets.db'), autoload: true });

const sportsMethods = {
    getSportsLine: () => DEMO_MATCHES,

    // ИСПРАВЛЕНО: Добавлено поле partnerId в документ спортивного купона ставки
    createSportsBet: async (username, partnerId, betData) => {
        const bet = {
            username,
            partnerId, // ВАЖНО: Маркируем купон, какому бренду он принадлежит
            type: betData.items.length > 1 ? "MULTI" : "SINGLE",
            items: betData.items.map(item => ({
                matchId: item.matchId,
                teams: item.teams,
                market: item.market,
                selectedOutcome: item.outcome,
                odds: Number(item.odds),
                status: "PENDING"
            })),
            totalOdds: Number(betData.totalOdds),
            stake: Number(betData.stake),
            status: "PENDING",
            timestamp: Date.now()
        };
        return await betsDb.insert(bet);
    },

    // ИСПРАВЛЕНО: Админка теперь запрашивает нерассчитанные ставки только своего проекта
    getPendingBets: async (partnerId) => {
        return await betsDb.find({ status: "PENDING", partnerId: partnerId });
    },

    // ИСПРАВЛЕНО: Код расчета купона отправляет выплату на API правильного партнера
    settleBet: async (betId, finalStatus, seamlessCredit) => {
        const bet = await betsDb.findOne({ _id: betId });
        if (!bet || bet.status !== "PENDING") return null;

        let prize = 0;
        if (finalStatus === "WON") {
            prize = Math.floor(bet.stake * bet.totalOdds);

            const sportsRoundId = `sports_win_${bet._id}_${Date.now()}`;

            // ИСПРАВЛЕНО: Передаем bet.partnerId вторым аргументом в кошелек
            await seamlessCredit(
                bet.username,
                bet.partnerId,
                null,
                prize,
                `⚽ Sportsbook Win (${bet.type})`,
                sportsRoundId
            );
        }

        // Обновляем статус купона
        await betsDb.update({ _id: betId }, { $set: { status: finalStatus, prize: prize } });
        return { ...bet, status: finalStatus, prize };
    }
};

const DEMO_MATCHES = [
    // === ⚽ FOOTBALL / SOCCER ===
    {
        id: "fb_1", sport: "⚽ Football", league: "Champions League", teams: "Real Madrid - Manchester City", status: "LIVE (72 min, 2:2)",
        markets: {
            winner: { label: "Match Result (1X2)", odds: { p1: 2.85, x: 3.40, p2: 2.45 } },
            total: { label: "Total Goals (Over/Under 4.5)", odds: { over: 1.90, under: 1.80 } },
            handicap: { label: "Match Handicap (0)", odds: { h1: 2.10, h2: 1.75 } }
        }
    },
    {
        id: "fb_2", sport: "⚽ Football", league: "English Premier League", teams: "Arsenal - Chelsea", status: "LIVE (34 min, 1:0)",
        markets: {
            winner: { label: "Match Result (1X2)", odds: { p1: 1.55, x: 4.20, p2: 6.00 } },
            total: { label: "Total Goals (Over/Under 2.5)", odds: { over: 1.75, under: 2.05 } },
            handicap: { label: "Match Handicap (-1 / +1)", odds: { h1: 1.95, h2: 1.85 } }
        }
    },
    {
        id: "fb_3", sport: "⚽ Football", league: "La Liga", teams: "Barcelona - Atletico Madrid", status: "LIVE (12 min, 0:0)",
        markets: {
            winner: { label: "Match Result (1X2)", odds: { p1: 2.10, x: 3.30, p2: 3.70 } },
            total: { label: "Total Goals (Over/Under 2.5)", odds: { over: 1.95, under: 1.85 } },
            handicap: { label: "Match Handicap (0)", odds: { h1: 1.53, h2: 2.50 } }
        }
    },
    {
        id: "fb_4", sport: "⚽ Football", league: "Serie A", teams: "Juventus - Inter Milan", status: "LIVE (51 min, 0:1)",
        markets: {
            winner: { label: "Match Result (1X2)", odds: { p1: 4.50, x: 3.10, p2: 1.95 } },
            total: { label: "Total Goals (Over/Under 1.5)", odds: { over: 1.65, under: 2.20 } },
            handicap: { label: "Match Handicap (+1 / -1)", odds: { h1: 1.80, h2: 2.00 } }
        }
    },
    {
        id: "fb_5", sport: "⚽ Football", league: "Bundesliga", teams: "Bayern Munich - Borussia Dortmund", status: "LIVE (88 min, 3:1)",
        markets: {
            winner: { label: "Match Result (1X2)", odds: { p1: 1.05, x: 11.0, p2: 26.0 } },
            total: { label: "Total Goals (Over/Under 4.5)", odds: { over: 2.10, under: 1.65 } },
            handicap: { label: "Match Handicap (-2 / +2)", odds: { h1: 1.85, h2: 1.95 } }
        }
    },

    // === 🏀 BASKETBALL ===
    {
        id: "bk_1", sport: "🏀 Basketball", league: "NBA", teams: "LA Lakers - Boston Celtics", status: "LIVE (3rd Quarter, 78:82)",
        markets: {
            winner: { label: "Moneyline (Inc. OT)", odds: { p1: 2.20, p2: 1.67 } },
            total: { label: "Total Points (Over/Under 215.5)", odds: { over: 1.92, under: 1.88 } },
            handicap: { label: "Point Spread (+3.5 / -3.5)", odds: { h1: 1.85, h2: 1.95 } }
        }
    },
    {
        id: "bk_2", sport: "🏀 Basketball", league: "NBA", teams: "Golden State - Milwaukee Bucks", status: "LIVE (4th Quarter, 102:99)",
        markets: {
            winner: { label: "Moneyline (Inc. OT)", odds: { p1: 1.45, p2: 2.75 } },
            total: { label: "Total Points (Over/Under 228.5)", odds: { over: 2.10, under: 1.72 } },
            handicap: { label: "Point Spread (-5.5 / +5.5)", odds: { h1: 1.90, h2: 1.90 } }
        }
    },
    {
        id: "bk_3", sport: "🏀 Basketball", league: "EuroLeague", teams: "Real Madrid Basket - Monaco", status: "LIVE (2nd Quarter, 34:28)",
        markets: {
            winner: { label: "Moneyline (Inc. OT)", odds: { p1: 1.30, p2: 3.50 } },
            total: { label: "Total Points (Over/Under 162.5)", odds: { over: 1.85, under: 1.95 } },
            handicap: { label: "Point Spread (-7.5 / +7.5)", odds: { h1: 1.91, h2: 1.89 } }
        }
    },
    {
        id: "bk_4", sport: "🏀 Basketball", league: "EuroLeague", teams: "Olympiacos - Panathinaikos", status: "LIVE (1st Quarter, 12:15)",
        markets: {
            winner: { label: "Moneyline (Inc. OT)", odds: { p1: 1.80, p2: 2.00 } },
            total: { label: "Total Points (Over/Under 155.5)", odds: { over: 1.90, under: 1.90 } },
            handicap: { label: "Point Spread (-1.5 / +1.5)", odds: { h1: 1.95, h2: 1.85 } }
        }
    },
    {
        id: "bk_5", sport: "🏀 Basketball", league: "NBA", teams: "Miami Heat - New York Knicks", status: "LIVE (3rd Quarter, 60:65)",
        markets: {
            winner: { label: "Moneyline (Inc. OT)", odds: { p1: 2.40, p2: 1.57 } },
            total: { label: "Total Points (Over/Under 208.5)", odds: { over: 1.80, under: 2.00 } },
            handicap: { label: "Point Spread (+4.5 / -4.5)", odds: { h1: 1.87, h2: 1.93 } }
        }
    },

    // === 🎾 TENNIS ===
    {
        id: "tn_1", sport: "🎾 Tennis", league: "Wimbledon", teams: "Jannik Sinner - Carlos Alcaraz", status: "LIVE (Set 2, 1:1, Games 4:3)",
        markets: {
            winner: { label: "Match Winner", odds: { p1: 1.90, p2: 1.90 } },
            total: { label: "Total Games (Over/Under 38.5)", odds: { over: 1.85, under: 1.95 } },
            handicap: { label: "Handicap Games (0)", odds: { h1: 1.90, h2: 1.90 } }
        }
    },
    {
        id: "tn_2", sport: "🎾 Tennis", league: "Roland Garros", teams: "Novak Djokovic - Daniil Medvedev", status: "LIVE (Set 1, Games 5:2)",
        markets: {
            winner: { label: "Match Winner", odds: { p1: 1.22, p2: 4.30 } },
            total: { label: "Total Games (Over/Under 34.5)", odds: { over: 2.00, under: 1.72 } },
            handicap: { label: "Handicap Games (-4.5 / +4.5)", odds: { h1: 1.85, h2: 1.95 } }
        }
    },
    {
        id: "tn_3", sport: "🎾 Tennis", league: "US Open", teams: "Alexander Zverev - Taylor Fritz", status: "LIVE (Set 3, 2:0, Games 1:2)",
        markets: {
            winner: { label: "Match Winner", odds: { p1: 1.35, p2: 3.20 } },
            total: { label: "Total Games (Over/Under 36.5)", odds: { over: 1.90, under: 1.90 } },
            handicap: { label: "Handicap Games (-3.5 / +3.5)", odds: { h1: 1.80, h2: 2.00 } }
        }
    },
    {
        id: "tn_4", sport: "🎾 Tennis", league: "Australian Open", teams: "Stefanos Tsitsipas - Holger Rune", status: "LIVE (Set 1, Games 0:3)",
        markets: {
            winner: { label: "Match Winner", odds: { p1: 3.10, p2: 1.38 } },
            total: { label: "Total Games (Over/Under 39.5)", odds: { over: 1.75, under: 2.08 } },
            handicap: { label: "Handicap Games (+3.5 / -3.5)", odds: { h1: 1.95, h2: 1.85 } }
        }
    },
    {
        id: "tn_5", sport: "🎾 Tennis", league: "ATP Masters", teams: "Andrey Rublev - Casper Ruud", status: "LIVE (Set 2, 0:1, Games 5:5)",
        markets: {
            winner: { label: "Match Winner", odds: { p1: 1.75, p2: 2.08 } },
            total: { label: "Total Games (Over/Under 24.5)", odds: { over: 1.95, under: 1.85 } },
            handicap: { label: "Handicap Games (-1.5 / +1.5)", odds: { h1: 1.90, h2: 1.90 } }
        }
    }
];


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

    ...sportsMethods,

    // ИСПРАВЛЕНО: Теперь метод принимает partnerId и отдает индивидуальные настройки конкретного сайта
    getConfig: (partnerId) => {
        // Если у этого партнера еще нет настроек в памяти, инициализируем их дефолтными
        if (!CONFIG[partnerId]) {
            CONFIG[partnerId] = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
        }
        return CONFIG[partnerId];
    },

    getPartnerConfig: async (partnerId) => {
        return await configDb.findOne({ _id: partnerId });
    },

    // ИСПРАВЛЕНО: Полная B2B-изоляция сохранения настроек и балансов банков
    updateConfigParam: async (partnerId, game, param, value) => {
        let changed = false;

        // Инициализируем банки и конфиг партнера, если их еще нет в памяти
        if (!banks[partnerId]) {
            banks[partnerId] = { globalJackpot: 1000, mines: 5000, crash: 5000, dice: 3000, hilo: 4000, slots5x3: 10000 };
        }
        if (!CONFIG[partnerId]) {
            CONFIG[partnerId] = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
        }

        // 1. Если админ партнера меняет свой локальный БАНК (копилку) игры
        if (param === 'bank') {
            const numericValue = Number(value);
            if (!isNaN(numericValue)) {
                if (game === 'mines' || game === 'crash' || game === 'dice' || game === 'hilo' || game === 'slots5x3') {
                    banks[partnerId][game] = numericValue;
                    changed = true;
                }
            }
        }
        // 2. Если админ партнера меняет параметры внутри своего CONFIG (RTP, цены ставок)
        else if (CONFIG[partnerId][game] && CONFIG[partnerId][game][param] !== undefined) {
            CONFIG[partnerId][game][param] = typeof CONFIG[partnerId][game][param] === 'number' ? Number(value) : value;
            changed = true;
        }

        // КЛЮЧЕВОЙ ШАГ: Если что-то изменилось, пишем настройки ЭТОГО партнера в config.db
        if (changed) {
            // Обновляем ветку конкретного партнера, используя динамический ключ
            await configDb.update(
                { _id: 'global_config' },
                { $set: { [partnerId]: CONFIG[partnerId], [`banks_${partnerId}`]: banks[partnerId] } }
            );
            return true;
        }
        return false;
    },

    // ИСПРАВЛЕНО: Очищаем билеты лотереи с использованием составного B2B-ключа в памяти
    clearPlayerTickets: (username, partnerId) => {
        const memKey = `${partnerId}_${username}`;
        activeTickets[memKey] = [];
    },

    // --- Методы для работы с историей лотереи ---
    saveDrawToHistory: async (drawData) => {
        await historyDb.insert(drawData);
    },

    getLotteryHistory: async (limit = 20) => {
        const history = await historyDb.find({});
        return history.slice(-limit);
    }
};


const crypto = require('crypto');

const seamless = require('./services/seamlessService');

const { gameDb, historyDb, betsDb, accountingDb, matchesDb, configDb } = require('./DB');

function getRandomInt(max) {
    return crypto.randomBytes(4).readUInt32BE(0) % max;
}

const activeTickets = {};
const activeMinesGames = {};
let currentCrashBets = {};        // Ставки на текущий раунд: { username: betAmount }
let currentActivePlayers = {};    // Игроки, которые еще в полете: { username: true }
const activeHiloCards = {}; // Хранит текущую карту игрока: { username: currentCardObject }
const activeFreeSpins = {};


const playerMethods = {
    getOrCreatePlayer: async (username, partnerId, fetchPlatformBalance = null) => {
        let player = await gameDb.findOne({username, partnerId});

        if (!player) {
            let initialBalance = 0; // Больше не хардкодим 200 монет

            // Если передан колбэк для связи с платформой (например, seamlessService.validateSession)
            if (typeof fetchPlatformBalance === 'function') {
                try {
                    // Делаем проверочный запрос к платформе, чтобы узнать реальный баланс
                    const platformData = await fetchPlatformBalance(username, partnerId);
                    if (platformData && platformData.balance !== undefined) {
                        initialBalance = Number(platformData.balance);
                    }
                } catch (err) {
                    console.error(`[State B2B] Failed to fetch initial platform balance for ${username}:`, err.message);
                }
            }

            player = {
                username,
                partnerId,
                balance: initialBalance
            };
            await gameDb.insert(player);
        }

        // Создаем составной ключ для оперативной памяти, чтобы избежать коллизий имен
        const memKey = `${partnerId}_${username}`;
        if (!activeTickets[memKey]) activeTickets[memKey] = [];
        player.tickets = activeTickets[memKey];

        return player;
    },

    // Метод обновления локальной копии баланса
    updateBalance: async (username, partnerId, newBalance) => {
        // Просто синхронизируем локальную NeDB, чтобы игры могли читать актуальное состояние
        await gameDb.update({username, partnerId}, {$set: {balance: Number(newBalance)}});

        if (io) {
            io.to(`${partnerId}_${username}`).emit('wallet_update', {balance: newBalance});
        }
    },

    // getOrCreatePlayer: async (username, partnerId) => {
    //     let player = await gameDb.findOne({username, partnerId});
    //     if (!player) {
    //         player = {
    //             username,
    //             partnerId, // ВАЖНО: сохраняем partnerId в документ игрока
    //             balance: 200
    //         };
    //         await gameDb.insert(player);
    //     }
    //
    //     // Создаем составной ключ для оперативной памяти, чтобы избежать коллизий имен
    //     const memKey = `${partnerId}_${username}`;
    //     if (!activeTickets[memKey]) activeTickets[memKey] = [];
    //     player.tickets = activeTickets[memKey];
    //
    //     return player;
    // },
    // updateBalance: async (username, partnerId, newBalance) => {
    //     await gameDb.update({username, partnerId}, {$set: {balance: newBalance}});
    //
    //
    // },



    savePlayerActionHistory: async (username, partnerId, actionData) => {
        const player = await gameDb.findOne({username: username, partnerId: partnerId});
        if (player) {
            // 1. Запись истории действий
            if (!player.history) player.history = [];
            const timeString = new Date().toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            });
            player.history.unshift({time: timeString, ...actionData});
            if (player.history.length > 30) player.history.pop();

            // 2. БЕЗОПАСНАЯ B2B ГЕЙМИФИКАЦИЯ: Достаем конфиг конкретного партнера из глобального объекта
            const globalConfig = global.CONFIG || {};
            const partnerConfig = globalConfig[partnerId] || {};
            const gConfig = partnerConfig.gamification || {
                xpPerGame: 10,
                xpMultiplier: 1000,
                levelUpBonus: 100,
                questTargetGames: 30,
                questReward: 50,
                tournamentActive: 0
            };

            // Защита от циклического импорта: берем сервис безопасно
            const walletService = seamless || require('./services/seamlessService');

            // --- Начисляем XP и Уровни ---
            if (!player.xp) player.xp = 0;
            if (!player.level) player.level = 1;
            player.xp += Number(gConfig.xpPerGame);

            const nextLevelXp = player.level * Number(gConfig.xpMultiplier);
            if (player.xp >= nextLevelXp) {
                player.level += 1;

                try {
                    // ИСПРАВЛЕНО: Безопасный криптографический roundId вместо Date.now()
                    const lvlRoundId = `lvlup_${crypto.randomBytes(6).toString('hex')}`;

                    await walletService.credit(
                        username,
                        partnerId,
                        actionData.sessionId || null,
                        Number(gConfig.levelUpBonus),
                        "VIP Level Up Reward",
                        lvlRoundId
                    );
                } catch (err) {
                    console.error(`❌ Ошибка выплаты за уровень игроку ${username}:`, err.message);
                }
            }

            // --- Считаем прогресс Ежедневного Квеста ---
            if (!player.dailyQuests) player.dailyQuests = {gamesPlayed: 0, claimed: false};
            if (player.dailyQuests.gamesPlayed < Number(gConfig.questTargetGames)) {
                player.dailyQuests.gamesPlayed += 1;

                if (player.dailyQuests.gamesPlayed === Number(gConfig.questTargetGames) && !player.dailyQuests.claimed) {
                    player.dailyQuests.claimed = true;
                    try {
                        // ИСПРАВЛЕНО: Безопасный криптографический roundId вместо Date.now()
                        const questRoundId = `q_daily_${crypto.randomBytes(6).toString('hex')}`;

                        await walletService.credit(
                            username,
                            partnerId,
                            actionData.sessionId || null,
                            Number(gConfig.questReward),
                            "Daily Quest Reward",
                            questRoundId
                        );
                    } catch (err) {
                        console.error(`❌ Ошибка выплаты за квест игроку ${username}:`, err.message);
                        player.dailyQuests.claimed = false; // Откатываем статус квеста, чтобы игрок мог попробовать получить награду позже
                    }
                }
            }

            // --- Начисляем Очки Турнира (Лидерборд) ---
            if (Number(gConfig.tournamentActive) === 1) {
                if (!player.tournamentPoints) player.tournamentPoints = 0;
                player.tournamentPoints += actionData.win ? 5 : 1;
            }

            // 3. Сохраняем обновленные данные в локальную NeDB
            await gameDb.update({username: username, partnerId: partnerId}, {
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

    // ИСПРАВЛЕНО: Метод собирает билеты игроков, разделяя их по тенантам (партнерам)
    getGamersWithTickets: async () => {
        const gamers = [];
        const memKeys = Object.keys(activeTickets); // Ключи вида "siteA_john"

        for (const memKey of memKeys) {
            if (activeTickets[memKey].length > 0) {
                // Разделяем составной ключ обратно на partnerId и username
                const [partnerId, username] = memKey.split('_');

                let player = await gameDb.findOne({username: username, partnerId: partnerId});
                if (player) {
                    player.tickets = activeTickets[memKey];
                    gamers.push(player);
                }
            }
        }
        return gamers;
    },
    // ИСПРАВЛЕНО: Теперь кэшбэк считается изолированно для конкретного партнера
    calculateAndPayCashback: async (partnerId, seamlessCredit) => {
        // Достаем настройки кэшбэка именно этого партнера
        const partnerConfig = CONFIG[partnerId] || CONFIG;
        const gConfig = partnerConfig || {cashbackPercent: 10};
        const pct = Number(gConfig.cashbackPercent) / 100;

        // ИСПРАВЛЕНО: Находим игроков только этого конкретного партнера
        const allPlayers = await gameDb.find({partnerId: partnerId});
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
                        await gameDb.update(
                            {username: player.username, partnerId: partnerId},
                            {$set: {history: player.history}}
                        );

                        cashbackReport.push({username: player.username, loss: netLoss, paid: cashbackAmount});
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
        const player = await gameDb.findOne({username: username, partnerId: partnerId});
        return player && player.history ? player.history : [];
    },

    // ИСПРАВЛЕНО: Метод теперь принимает аргумент и отдает игроков только конкретного партнера
    getAllPlayers: async (partnerId) => {
        return await gameDb.find({partnerId: partnerId});
    },

};

const jackpotMethods = {
    // ИСПРАВЛЕНО: Безопасное чтение и инициализация изолированных банков из глобального контекста global.banks
    getJackpot: (partnerId) => {
        if (!global.banks) global.banks = {};
        if (!global.banks[partnerId]) {
            global.banks[partnerId] = {
                globalJackpot: 1000,
                mines: 5000,
                crash: 5000,
                dice: 3000,
                hilo: 4000,
                slots5x3: 10000
            };
        }
        return global.banks[partnerId].globalJackpot;
    },
    addJackpot: (partnerId, amount) => {
        if (!global.banks || !global.banks[partnerId]) jackpotMethods.getJackpot(partnerId);
        global.banks[partnerId].globalJackpot += amount;
    },
    resetJackpot: (partnerId) => {
        if (global.banks && global.banks[partnerId]) global.banks[partnerId].globalJackpot = 1000;
    },
    setJackpot: (partnerId, amount) => {
        if (!global.banks || !global.banks[partnerId]) jackpotMethods.getJackpot(partnerId);
        global.banks[partnerId].globalJackpot = Number(amount);
    },
};

const minesMethods = {
    // Сессии Mines теперь надежно разделены по составному ключу "partnerId_username" в локальной памяти state.js
    getMinesGame: (username, partnerId) => activeMinesGames[`${partnerId}_${username}`],
    setMinesGame: (username, partnerId, gameData) => {
        activeMinesGames[`${partnerId}_${username}`] = gameData;
    },
    deleteMinesGame: (username, partnerId) => {
        delete activeMinesGames[`${partnerId}_${username}`];
    },

    // ИСПРАВЛЕНО: Добавлен обязательный аргумент partnerId для точного расчета RTP конкретного бренда
    getMinesMultiplier: (totalCells, totalMines, openedCells, partnerId) => {
        let multiplier = 1;
        for (let i = 0; i < openedCells; i++) {
            multiplier *= (totalCells - i) / (totalCells - totalMines - i);
        }

        // Читаем RTP-коэффициент из изолированного глобального конфига партнера
        const globalConfig = global.CONFIG || {};
        const partnerConfig = globalConfig[partnerId] || {};
        const minesConfig = partnerConfig.mines || { rtpPercent: 80 }; // Безопасный дефолтный фолбэк

        const rtpFactor = (minesConfig.rtpPercent || 80) / 100;
        return parseFloat((multiplier * rtpFactor).toFixed(2));
    },

    // ИСПРАВЛЕНО: Управление изолированным банком Mines через глобальный объект global.banks
    getMinesBank: (partnerId) => {
        if (!global.banks || !global.banks[partnerId]) jackpotMethods.getJackpot(partnerId);
        return global.banks[partnerId].mines;
    },
    addMinesBank: (partnerId, amount) => {
        if (!global.banks || !global.banks[partnerId]) jackpotMethods.getJackpot(partnerId);
        global.banks[partnerId].mines += amount;
    },
    reduceMinesBank: (partnerId, amount) => {
        if (!global.banks || !global.banks[partnerId]) jackpotMethods.getJackpot(partnerId);
        global.banks[partnerId].mines -= amount;
    },

    // Позволяет админке конкретного партнера менять свой RTP
    setMinesRtp: (partnerId, newRtp) => {
        const globalConfig = global.CONFIG || {};
        if (globalConfig[partnerId] && globalConfig[partnerId].mines) {
            globalConfig[partnerId].mines.rtpPercent = Number(newRtp);
        }
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
    clearCrashBets: (partnerId) => {
        currentCrashBets[partnerId] = {};
    },

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
    clearFlightPlayers: (partnerId) => {
        currentActivePlayers[partnerId] = {};
    }
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
    setHiloCard: (username, partnerId, card) => {
        activeHiloCards[`${partnerId}_${username}`] = card;
    },
    getHiloMultipliers: (currentValue) => {
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
};

const freeSpinMethods = {
    // ИСПРАВЛЕНО: Фриспины надежно изолированы по составному ключу "partnerId_username"
    getFreeSpins: (username, partnerId) => {
        // Безопасный фолбэк, если объект еще не был объявлен в замыкании файла
        if (typeof activeFreeSpins === 'undefined') return null;
        return activeFreeSpins[`${partnerId}_${username}`];
    },
    setFreeSpins: (username, partnerId, fsData) => {
        if (typeof activeFreeSpins !== 'undefined') {
            activeFreeSpins[`${partnerId}_${username}`] = fsData;
        }
    },
    deleteFreeSpins: (username, partnerId) => {
        if (typeof activeFreeSpins !== 'undefined') {
            delete activeFreeSpins[`${partnerId}_${username}`];
        }
    }
};

const promoMethods = {
    // Создание промокода теперь намертво привязано к конкретному partnerId внутри global.CONFIG
    addPromoCode: async (partnerId, codeData) => {
        if (!global.CONFIG) global.CONFIG = {};
        if (!global.CONFIG[partnerId]) global.CONFIG[partnerId] = {};
        if (!global.CONFIG[partnerId].promoCodes) global.CONFIG[partnerId].promoCodes = [];

        global.CONFIG[partnerId].promoCodes.push({
            code: codeData.code.toUpperCase().trim(),
            reward: Number(codeData.reward),
            maxUses: Number(codeData.maxUses || 1),
            active: 1
        });

        // ИСПРАВЛЕНО: Перезаписываем в config.db ветку через правильный локальный инстанс базы данных configDb
        // Используем upsert: true для защиты от отсутствия документа
        await configDb.update(
            { _id: "global_config" },
            { $set: { [partnerId]: global.CONFIG[partnerId] } },
            { upsert: true }
        );
    },

    // Активация кода игроком теперь проверяет изолированный глобальный CONFIG
    usePromoCode: async (username, partnerId, code, seamlessCredit) => {
        const cleanCode = code.toUpperCase().trim();

        // Ищем промокод внутри реестра конкретного партнера в global.CONFIG
        const globalConfig = global.CONFIG || {};
        const partnerConfig = globalConfig[partnerId] || {};
        const promo = (partnerConfig.promoCodes || []).find(p => p.code === cleanCode && p.active === 1);

        if (!promo) throw new Error("Invalid code");

        // Поиск игрока по составному ключу B2B
        const player = await gameDb.findOne({ username: username, partnerId: partnerId });
        if (!player) throw new Error("Player not found");

        if (!player.usedPromos) player.usedPromos = {};
        const timesUsed = player.usedPromos[cleanCode] || 0;

        if (timesUsed >= promo.maxUses) throw new Error("You have already used this promo code maximum times");

        // Безопасный криптографический roundId вместо Date.now()
        const promoRoundId = `promo_${cleanCode.toLowerCase()}_${crypto.randomBytes(6).toString('hex')}`;

        // Берем sessionId игрока, если он сохранен в его локальной учетной записи
        const sessionId = player.sessionId || null;
        const gameName = "Promo Activation";

        // Строго соблюдаем порядок аргументов согласно сигнатуре seamlessService.js:
        // (username, partnerId, sessionId, amount, gameName, roundId)
        const creditResult = await seamlessCredit(
            username,
            partnerId,
            sessionId,
            Number(promo.reward),
            gameName,
            promoRoundId
        );

        // Получаем свежий баланс, который вернул шлюз платформы
        const newBalance = creditResult && creditResult.balance !== undefined ? creditResult.balance : player.balance + promo.reward;

        // Фиксируем использование кода локально в рамках этого бренда И обновляем баланс в локальной NeDB
        player.usedPromos[cleanCode] = timesUsed + 1;
        await gameDb.update(
            { username: username, partnerId: partnerId },
            { $set: {
                usedPromos: player.usedPromos,
                balance: newBalance
            }}
        );

        return promo.reward;
    }
};

const gamificationMethods = {
    // Лидерборд строится строго внутри игроков конкретного партнера
    getLeaderboard: async (partnerId, criterion = 'balance', limit = 10) => {
        const validCriteria = ['balance', 'xp', 'tournamentPoints'];
        const sortField = validCriteria.includes(criterion) ? criterion : 'balance';

        const allPlayers = await gameDb.find({ partnerId: partnerId });

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

    // Метод принимает partnerId и завершает турнир изолированно
    endCurrentTournament: async (partnerId) => {
        const globalConfig = global.CONFIG || {};
        const partnerConfig = globalConfig[partnerId] || {};
        const gConfig = partnerConfig.gamification || { tournamentPrize: 5000 };
        const totalPrize = Number(gConfig.tournamentPrize);

        const prizes = [
            Math.floor(totalPrize * 0.50), // 1 место
            Math.floor(totalPrize * 0.30), // 2 место
            Math.floor(totalPrize * 0.20)  // 3 место
        ];

        const allPlayers = await gameDb.find({ partnerId: partnerId });

        const participants = allPlayers
            .filter(p => p.tournamentPoints && p.tournamentPoints > 0)
            .sort((a, b) => b.tournamentPoints - a.tournamentPoints);

        const winnersInfo = [];
        const walletService = seamless || require('./services/seamlessService');

        for (let i = 0; i < participants.length; i++) {
            const player = participants[i];
            let prizeWon = 0;

            if (i < 3) {
                prizeWon = prizes[i];

                try {
                    // ИСПРАВЛЕНО: Безопасный криптографический roundId вместо Date.now() для предотвращения коллизий в цикле
                    const tournamentRoundId = `trn_win_${crypto.randomBytes(6).toString('hex')}`;

                    const creditResult = await walletService.credit(
                        player.username,
                        partnerId,
                        null,
                        prizeWon,
                        `Tournament Place ${i + 1}`,
                        tournamentRoundId
                    );

                    // Обновляем локальный баланс из ответа шлюза платформы
                    player.balance = creditResult && creditResult.balance !== undefined ? creditResult.balance : player.balance + prizeWon;

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

            await gameDb.update(
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

    // ИСПРАВЛЕНО: Глобальный метод автосброса. Умеет работать как с одним партнером, так и со всеми сразу в полночь!
    resetDailyQuestsForAll: async (partnerId = null) => {
        try {
            let partnersToReset = [];

            if (partnerId) {
                partnersToReset.push(partnerId);
            } else {
                // Если вызвано из server.js без аргументов — собираем ID всех активных B2B партнеров из конфига
                partnersToReset = Object.keys(global.CONFIG || {});
            }

            for (const pId of partnersToReset) {
                const players = await gameDb.find({ partnerId: pId });

                for (const player of players) {
                    if (player.dailyQuests) {
                        player.dailyQuests = { gamesPlayed: 0, claimed: false };

                        await gameDb.update(
                            { username: player.username, partnerId: pId },
                            { $set: { dailyQuests: player.dailyQuests } }
                        );
                    }
                }
                console.log(`📅 [Cron] Daily quests successfully reset for partner: ${pId}`);
            }
            return true;
        } catch (err) {
            console.error(`❌ Error auto-resetting quests:`, err.message);
            return false;
        }
    }
};

const affiliateMethods = {

    linkReferral: async (username, partnerId, refCode) => {
        const cleanRef = refCode.trim();
        // Ищем, кому принадлежит этот реф-код (код равен юзернейму пригласителя)
        const inviter = await gameDb.findOne({username: cleanRef, partnerId: partnerId});
        if (!inviter) return false;

        // Привязываем реферала
        await gameDb.update({username: username, partnerId: partnerId}, {$set: {invitedBy: inviter.username}});
        return true;
    },

    // ИСПРАВЛЕНО: Добавили четвертый аргумент seamlessCredit, чтобы избежать циклического require
    trackAffiliatePayout: async (username, partnerId, lostAmount, seamlessCredit) => {
        const player = await gameDb.findOne({username: username, partnerId: partnerId});
        // Если игрока никто не приглашал — ничего не делаем
        if (!player || !player.invitedBy) return;

        // ИСПРАВЛЕНО: Заменено CURRENT_CONFIG на CONFIG для соответствия остальным методам
        const partnerConfig = CONFIG[partnerId] || CONFIG;
        const refPercent = partnerConfig.affiliatePercent || 10;

        const commission = Math.floor(lostAmount * (refPercent / 100));

        if (commission > 0 && typeof seamlessCredit === 'function') {
            try {
                // ИСПРАВЛЕНО: Безопасный криптографический roundId вместо Date.now()
                const refRoundId = `aff_pay_${crypto.randomBytes(6).toString('hex')}`;
                const gameName = "Affiliate RevShare Commission";

                // Начисляем комиссию пригласителю через переданный Seamless Credit колбэк
                await seamlessCredit(
                    player.invitedBy,
                    partnerId,
                    null, // Сессия пригласителя в данном случае null, так как транзакция фоновая
                    commission,
                    gameName,
                    refRoundId
                );

                console.log(`💸 Affiliate Revenue Share: ${player.invitedBy} earned +${commission} 🪙 from ${username}'s loss`);
            } catch (err) {
                console.error(`❌ Affiliate payout failed for inviter ${player.invitedBy}:`, err.message);
            }
        }
    }
};

const financialMethods = {

    logFinancialTransaction: async (partnerId, username, type, amount, game) => {
        const record = {
            partnerId,
            username,
            type, // "DEBIT", "CREDIT", "AFFILIATE"
            amount: Number(amount),
            game: game || "Unknown Game", // Гарантируем, что поле всегда будет строкой
            timestamp: Date.now()
        };
        await accountingDb.insert(record);
    },

    getFinancialReport: async (partnerId) => {
        const txs = await accountingDb.find({ partnerId: partnerId });

        let totalBets = 0;
        let totalWins = 0;
        let totalAffiliate = 0;

        txs.forEach(tx => {
            if (tx.type === "DEBIT") totalBets += tx.amount;
            if (tx.type === "CREDIT") totalWins += tx.amount;
            if (tx.type === "AFFILIATE") totalAffiliate += tx.amount;
        });

        const ggr = totalBets - totalWins;
        const netProfit = ggr - totalAffiliate;

        // Сортируем от новых к старым
        const sortedTxs = txs.sort((a, b) => b.timestamp - a.timestamp);

        // 🎰 ЛОГ СТАВОК: Безопасная фильтрация с защитой от undefined/null в tx.game
        const latestBets = sortedTxs.filter(tx => {
            const gameName = tx.game || "";
            return (tx.type === "DEBIT" || tx.type === "CREDIT") &&
                !gameName.includes("Promo") &&
                !gameName.includes("Cashback") &&
                !gameName.includes("Quest") &&
                !gameName.includes("VIP");
        }).slice(0, 50);

        // 💳 ЛОГ КАССЫ: Безопасный сбор чистого Cashflow
        const latestTransactions = sortedTxs.filter(tx => {
            const gameName = tx.game || "";
            return tx.type === "AFFILIATE" ||
                gameName.includes("Promo") ||
                gameName.includes("Cashback") ||
                gameName.includes("Quest") ||
                gameName.includes("VIP") ||
                gameName.includes("Deposit") ||
                gameName.includes("Withdraw");
        }).slice(0, 50);

        return {
            totalBets,
            totalWins,
            totalAffiliate,
            ggr,
            netProfit,
            transactionsCount: txs.length,
            latestTransactions,
            latestBets
        };
    }
};

const sportsMethods = {
    // 1. Отдаем линию матчей из файла matches.db на ваш контроллер и фронтенд
    getSportsLine: async () => {
        // Запрашиваем из файла все матчи, которые еще не завершились (лайв и прематч)
        const activeMatches = await matchesDb.find({ status: { $ne: "FINISHED" } });

        // Гарантируем совместимость: если контроллер ожидает teams строкой,
        // но в базе это объект, мы принудительно приводим контракт к нужному виду
        return activeMatches.map(m => {
            return {
                id: m.id,
                sport: m.sport,
                league: m.league,
                // Если в базе лежит строка, оставляем её, если объект — склеиваем в строку для sportsController
                teams: typeof m.teams === 'string' ? m.teams : `${m.teams.home} - ${m.teams.away}`,
                status: m.status,
                markets: m.markets
            };
        });
    },

    // 2. Сохраняем купон в файл bets.db, вытаскивая текущие условия тоталов/гандикапов из файла матчей
    createSportsBet: async (username, partnerId, betData) => {
        const processedItems = [];

        for (let item of betData.items) {
            const dbMatch = await matchesDb.findOne({ id: item.matchId });
            let target = null;
            let handicapValue = null;

            if (dbMatch && dbMatch.markets[item.market]) {
                target = dbMatch.markets[item.market].target || null;
                handicapValue = dbMatch.markets[item.market].value || null;
            }

            processedItems.push({
                matchId: item.matchId,
                teams: item.teams,
                market: item.market,
                selectedOutcome: item.outcome,
                odds: Number(item.odds),
                status: "PENDING",
                target: target,
                handicapValue: handicapValue
            });
        }

        const bet = {
            username,
            partnerId,
            type: betData.items.length > 1 ? "MULTI" : "SINGLE",
            items: processedItems,
            totalOdds: Number(betData.totalOdds),
            stake: Number(betData.stake),
            status: "PENDING",
            timestamp: Date.now()
        };

        return await betsDb.insert(bet);
    },

    // 3. Запрос нерассчитанных ставок для админки партнера из вашего кода
    getPendingBets: async (partnerId) => {
        return await betsDb.find({ status: "PENDING", partnerId: partnerId });
    },

    // 4. Расчет купона и отправка денег партнеру из вашего кода
    settleBet: async (betId, finalStatus, seamlessCredit = null) => {
        const bet = await betsDb.findOne({ _id: betId });
        if (!bet || bet.status !== "PENDING") return null;

        let prize = 0;
        if (finalStatus === "WON") {
            prize = Math.floor(bet.stake * bet.totalOdds);

            // ИСПРАВЛЕНО: Безопасный криптографический roundId вместо Date.now() для предотвращения коллизий во внешнем кроне расчета матчей
            const sportsRoundId = `sp_win_${crypto.randomBytes(6).toString('hex')}`;
            const gameName = `Sportsbook Win (${bet.type})`;

            // Защита от отсутствия коллбэка: берем прямой сервис, если коллбэк не был передан
            const creditMethod = typeof seamlessCredit === 'function' ? seamlessCredit : (seamless?.credit);

            if (typeof creditMethod === 'function') {
                try {
                    await creditMethod(
                        bet.username,
                        bet.partnerId,
                        null, // Сессия null, так как расчет происходит в фоне по крону
                        prize,
                        gameName,
                        sportsRoundId
                    );
                } catch (err) {
                    console.error(`❌ Failed to credit sports win for ${bet.username} via seamless api:`, err.message);
                    // Не меняем статус купона на WON, чтобы крон мог попробовать рассчитать его повторно при восстановлении сети
                    return null;
                }
            } else {
                console.error("❌ Critical: Seamless credit service is not available for settleBet");
                return null;
            }
        }

        await betsDb.update({ _id: betId }, { $set: { status: finalStatus, prize: prize } });
        return { ...bet, status: finalStatus, prize };
    }
};


module.exports = {
    getRandomInt,

    ...playerMethods,
    ...jackpotMethods,
    ...gamificationMethods,
    ...promoMethods,
    ...affiliateMethods,
    ...financialMethods,

    ...minesMethods,
    ...crashMethods,
    ...diceMethods,
    ...hiloMethods,

    ...freeSpinMethods,
    ...sportsMethods,

    // ИСПРАВЛЕНО: Безопасное чтение глобального конфига из оперативной памяти бэкенда
    getConfig: (partnerId) => {
        const globalConfig = global.CONFIG || {};
        if (!globalConfig[partnerId]) {
            globalConfig[partnerId] = {};
        }
        return globalConfig[partnerId];
    },

    // ИСПРАВЛЕНО: Чтение конфигурации конкретного B2B-скина из таблицы b2b_configs в Postgres
    getPartnerConfig: async (partnerId) => {
        try {
            const res = await pool.query(
                "SELECT config_data FROM b2b_configs WHERE id = 'global_config' LIMIT 1"
            );
            if (res.rowCount === 0) return null;

            const configData = typeof res.rows[0].config_data === 'string'
                ? JSON.parse(res.rows[0].config_data)
                : res.rows[0].config_data;

            return configData[partnerId] || null;
        } catch (err) {
            console.error(`[Postgres B2B Config Error] Failed to get partner config:`, err.message);
            return null;
        }
    },

    // ИСПРАВЛЕНО: Полная B2B-изоляция сохранения настроек и балансов банков в Postgres (Neon)
    updateConfigParam: async (partnerId, game, param, value) => {
        let changed = false;

        // Привязываемся к глобальным хранилищам бэкенда Node.js
        if (!global.banks) global.banks = {};
        if (!global.CONFIG) global.CONFIG = {};

        if (!global.banks[partnerId]) {
            global.banks[partnerId] = { globalJackpot: 1000, mines: 5000, crash: 5000, dice: 3000, hilo: 4000, slots5x3: 10000 };
        }
        if (!global.CONFIG[partnerId]) {
            global.CONFIG[partnerId] = {};
        }

        // 1. Изменение локального баланса банка игры
        if (param === 'bank') {
            const numericValue = Number(value);
            if (!isNaN(numericValue)) {
                if (['mines', 'crash', 'dice', 'hilo', 'slots5x3'].includes(game)) {
                    global.banks[partnerId][game] = numericValue;
                    changed = true;
                }
            }
        }
        // 2. Изменение внутренних параметров игры (RTP, ставки и т.д.)
        else if (global.CONFIG[partnerId][game] && global.CONFIG[partnerId][game][param] !== undefined) {
            global.CONFIG[partnerId][game][param] = typeof global.CONFIG[partnerId][game][param] === 'number' ? Number(value) : value;
            changed = true;
        }

        // Если данные изменились, атомарно пишем ветку партнера в Postgres
        if (changed) {
            try {
                // Оператор слияния jsonb (||) защищает настройки остальных партнеров от затирания
                await pool.query(
                    `INSERT INTO b2b_configs (id, config_data) 
                     VALUES ($1, $2::jsonb)
                     ON CONFLICT (id) 
                     DO UPDATE SET config_data = b2b_configs.config_data || EXCLUDED.config_data`,
                    [
                        'global_config',
                        JSON.stringify({
                            [partnerId]: global.CONFIG[partnerId],
                            [`banks_${partnerId}`]: global.banks[partnerId]
                        })
                    ]
                );
                return true;
            } catch (err) {
                console.error(`[Postgres B2B Config Error] Failed to update config:`, err.message);
                return false;
            }
        }
        return false;
    },

    // Очищаем билеты лотереи с использованием составного B2B-ключа в памяти
    clearPlayerTickets: (username, partnerId) => {
        const memKey = `${partnerId}_${username}`;
        activeTickets[memKey] = [];
    },

    // --- ИСПРАВЛЕНО: Методы для работы с историей лотереи переведены на Postgres ---
    saveDrawToHistory: async (drawData) => {
        try {
            await pool.query(
                'INSERT INTO lottery_history (draw_data) VALUES ($1::jsonb)',
                [JSON.stringify(drawData)]
            );
        } catch (err) {
            console.error("[Postgres Lottery Error] Failed to save draw history:", err.message);
        }
    },

    getLotteryHistory: async (limit = 20) => {
        try {
            const res = await pool.query(
                'SELECT draw_data FROM lottery_history ORDER BY id DESC LIMIT $1',
                [limit]
            );
            return res.rows.map(r => {
                return typeof r.draw_data === 'string' ? JSON.parse(r.draw_data) : r.draw_data;
            });
        } catch (err) {
            console.error("Failed to fetch lottery history from postgres:", err.message);
            return [];
        }
    }
};



const DEMO_MATCHES = [
    // === ⚽ FOOTBALL / SOCCER ===
    {
        id: "fb_1",
        sport: "⚽ Football",
        league: "Champions League",
        teams: "Real Madrid - Manchester City",
        status: "LIVE (72 min, 2:2)",
        markets: {
            winner: {label: "Match Result (1X2)", odds: {p1: 2.85, x: 3.40, p2: 2.45}},
            total: {label: "Total Goals (Over/Under 4.5)", odds: {over: 1.90, under: 1.80}},
            handicap: {label: "Match Handicap (0)", odds: {h1: 2.10, h2: 1.75}}
        }
    },
    {
        id: "fb_2",
        sport: "⚽ Football",
        league: "English Premier League",
        teams: "Arsenal - Chelsea",
        status: "LIVE (34 min, 1:0)",
        markets: {
            winner: {label: "Match Result (1X2)", odds: {p1: 1.55, x: 4.20, p2: 6.00}},
            total: {label: "Total Goals (Over/Under 2.5)", odds: {over: 1.75, under: 2.05}},
            handicap: {label: "Match Handicap (-1 / +1)", odds: {h1: 1.95, h2: 1.85}}
        }
    },
    {
        id: "fb_3",
        sport: "⚽ Football",
        league: "La Liga",
        teams: "Barcelona - Atletico Madrid",
        status: "LIVE (12 min, 0:0)",
        markets: {
            winner: {label: "Match Result (1X2)", odds: {p1: 2.10, x: 3.30, p2: 3.70}},
            total: {label: "Total Goals (Over/Under 2.5)", odds: {over: 1.95, under: 1.85}},
            handicap: {label: "Match Handicap (0)", odds: {h1: 1.53, h2: 2.50}}
        }
    },
    {
        id: "fb_4",
        sport: "⚽ Football",
        league: "Serie A",
        teams: "Juventus - Inter Milan",
        status: "LIVE (51 min, 0:1)",
        markets: {
            winner: {label: "Match Result (1X2)", odds: {p1: 4.50, x: 3.10, p2: 1.95}},
            total: {label: "Total Goals (Over/Under 1.5)", odds: {over: 1.65, under: 2.20}},
            handicap: {label: "Match Handicap (+1 / -1)", odds: {h1: 1.80, h2: 2.00}}
        }
    },
    {
        id: "fb_5",
        sport: "⚽ Football",
        league: "Bundesliga",
        teams: "Bayern Munich - Borussia Dortmund",
        status: "LIVE (88 min, 3:1)",
        markets: {
            winner: {label: "Match Result (1X2)", odds: {p1: 1.05, x: 11.0, p2: 26.0}},
            total: {label: "Total Goals (Over/Under 4.5)", odds: {over: 2.10, under: 1.65}},
            handicap: {label: "Match Handicap (-2 / +2)", odds: {h1: 1.85, h2: 1.95}}
        }
    },

    // === 🏀 BASKETBALL ===
    {
        id: "bk_1",
        sport: "🏀 Basketball",
        league: "NBA",
        teams: "LA Lakers - Boston Celtics",
        status: "LIVE (3rd Quarter, 78:82)",
        markets: {
            winner: {label: "Moneyline (Inc. OT)", odds: {p1: 2.20, p2: 1.67}},
            total: {label: "Total Points (Over/Under 215.5)", odds: {over: 1.92, under: 1.88}},
            handicap: {label: "Point Spread (+3.5 / -3.5)", odds: {h1: 1.85, h2: 1.95}}
        }
    },
    {
        id: "bk_2",
        sport: "🏀 Basketball",
        league: "NBA",
        teams: "Golden State - Milwaukee Bucks",
        status: "LIVE (4th Quarter, 102:99)",
        markets: {
            winner: {label: "Moneyline (Inc. OT)", odds: {p1: 1.45, p2: 2.75}},
            total: {label: "Total Points (Over/Under 228.5)", odds: {over: 2.10, under: 1.72}},
            handicap: {label: "Point Spread (-5.5 / +5.5)", odds: {h1: 1.90, h2: 1.90}}
        }
    },
    {
        id: "bk_3",
        sport: "🏀 Basketball",
        league: "EuroLeague",
        teams: "Real Madrid Basket - Monaco",
        status: "LIVE (2nd Quarter, 34:28)",
        markets: {
            winner: {label: "Moneyline (Inc. OT)", odds: {p1: 1.30, p2: 3.50}},
            total: {label: "Total Points (Over/Under 162.5)", odds: {over: 1.85, under: 1.95}},
            handicap: {label: "Point Spread (-7.5 / +7.5)", odds: {h1: 1.91, h2: 1.89}}
        }
    },
    {
        id: "bk_4",
        sport: "🏀 Basketball",
        league: "EuroLeague",
        teams: "Olympiacos - Panathinaikos",
        status: "LIVE (1st Quarter, 12:15)",
        markets: {
            winner: {label: "Moneyline (Inc. OT)", odds: {p1: 1.80, p2: 2.00}},
            total: {label: "Total Points (Over/Under 155.5)", odds: {over: 1.90, under: 1.90}},
            handicap: {label: "Point Spread (-1.5 / +1.5)", odds: {h1: 1.95, h2: 1.85}}
        }
    },
    {
        id: "bk_5",
        sport: "🏀 Basketball",
        league: "NBA",
        teams: "Miami Heat - New York Knicks",
        status: "LIVE (3rd Quarter, 60:65)",
        markets: {
            winner: {label: "Moneyline (Inc. OT)", odds: {p1: 2.40, p2: 1.57}},
            total: {label: "Total Points (Over/Under 208.5)", odds: {over: 1.80, under: 2.00}},
            handicap: {label: "Point Spread (+4.5 / -4.5)", odds: {h1: 1.87, h2: 1.93}}
        }
    },

    // === 🎾 TENNIS ===
    {
        id: "tn_1",
        sport: "🎾 Tennis",
        league: "Wimbledon",
        teams: "Jannik Sinner - Carlos Alcaraz",
        status: "LIVE (Set 2, 1:1, Games 4:3)",
        markets: {
            winner: {label: "Match Winner", odds: {p1: 1.90, p2: 1.90}},
            total: {label: "Total Games (Over/Under 38.5)", odds: {over: 1.85, under: 1.95}},
            handicap: {label: "Handicap Games (0)", odds: {h1: 1.90, h2: 1.90}}
        }
    },
    {
        id: "tn_2",
        sport: "🎾 Tennis",
        league: "Roland Garros",
        teams: "Novak Djokovic - Daniil Medvedev",
        status: "LIVE (Set 1, Games 5:2)",
        markets: {
            winner: {label: "Match Winner", odds: {p1: 1.22, p2: 4.30}},
            total: {label: "Total Games (Over/Under 34.5)", odds: {over: 2.00, under: 1.72}},
            handicap: {label: "Handicap Games (-4.5 / +4.5)", odds: {h1: 1.85, h2: 1.95}}
        }
    },
    {
        id: "tn_3",
        sport: "🎾 Tennis",
        league: "US Open",
        teams: "Alexander Zverev - Taylor Fritz",
        status: "LIVE (Set 3, 2:0, Games 1:2)",
        markets: {
            winner: {label: "Match Winner", odds: {p1: 1.35, p2: 3.20}},
            total: {label: "Total Games (Over/Under 36.5)", odds: {over: 1.90, under: 1.90}},
            handicap: {label: "Handicap Games (-3.5 / +3.5)", odds: {h1: 1.80, h2: 2.00}}
        }
    },
    {
        id: "tn_4",
        sport: "🎾 Tennis",
        league: "Australian Open",
        teams: "Stefanos Tsitsipas - Holger Rune",
        status: "LIVE (Set 1, Games 0:3)",
        markets: {
            winner: {label: "Match Winner", odds: {p1: 3.10, p2: 1.38}},
            total: {label: "Total Games (Over/Under 39.5)", odds: {over: 1.75, under: 2.08}},
            handicap: {label: "Handicap Games (+3.5 / -3.5)", odds: {h1: 1.95, h2: 1.85}}
        }
    },
    {
        id: "tn_5",
        sport: "🎾 Tennis",
        league: "ATP Masters",
        teams: "Andrey Rublev - Casper Ruud",
        status: "LIVE (Set 2, 0:1, Games 5:5)",
        markets: {
            winner: {label: "Match Winner", odds: {p1: 1.75, p2: 2.08}},
            total: {label: "Total Games (Over/Under 24.5)", odds: {over: 1.95, under: 1.85}},
            handicap: {label: "Handicap Games (-1.5 / +1.5)", odds: {h1: 1.90, h2: 1.90}}
        }
    }
];


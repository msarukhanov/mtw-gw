const crypto = require('crypto');
const seamless = require('./services/seamlessService');

const pool = global.pool;

// Внутренние структуры для оперативной памяти сохраняем без изменений
const activeTickets = {};
const activeMinesGames = {};
const activeFreeSpins = {};
const activeHiloCards = {};
const crashBetsByPartner = {};
const crashPlayersInFlight = {};

function getRandomInt(max) {
    if (max <= 0) return 0;
    return crypto.randomBytes(4).readUInt32BE(0) % max;
}

// =========================================================================
// ПЕРЕПИСАННЫЕ МЕТОДЫ ЯДРА ПОД POSTGRESQL (Sequelize ORM)
// =========================================================================

const playerMethods = {
    // Проверьте, чтобы в вашем файле этот метод выглядел так:
    getOrCreatePlayer: async (username, partnerId, fetchPlatformBalance = null) => {
        let res = await global.pool.query('SELECT * FROM players WHERE username = $1 AND partner_id = $2 LIMIT 1', [username, partnerId]);
        let player = res.rowCount > 0 ? res.rows[0] : null;

        if (!player) {
            let initialBalance = 0;
            if (typeof fetchPlatformBalance === 'function') {
                try {
                    const platformData = await fetchPlatformBalance(username, partnerId);
                    if (platformData && platformData.balance !== undefined) {
                        initialBalance = Number(platformData.balance);
                    }
                } catch (err) {
                    console.error(`[Postgres B2B] Failed platform balance sync:`, err.message);
                }
            }

            const insertRes = await global.pool.query(
                `INSERT INTO players (username, partner_id, balance, daily_quests, used_promos, history, tournament_points) 
             VALUES ($1, $2, $3, '{"gamesPlayed": 0, "claimed": false}'::jsonb, '{}'::jsonb, '[]'::jsonb, 0) RETURNING *`,
                [username, partnerId, initialBalance]
            );
            player = insertRes.rows[0];
        }

        // Десериализация JSONB (если драйвер вернул их строками)
        player.dailyQuests = typeof player.daily_quests === 'string' ? JSON.parse(player.daily_quests) : player.daily_quests;
        player.history = typeof player.history === 'string' ? JSON.parse(player.history) : player.history;
        player.usedPromos = typeof player.used_promos === 'string' ? JSON.parse(player.used_promos) : player.used_promos;
        player.tournamentPoints = Number(player.tournament_points);

        const memKey = `${partnerId}_${username}`;
        if (!activeTickets[memKey]) activeTickets[memKey] = [];
        player.tickets = activeTickets[memKey];

        return player;
    },
    updateBalance: async (username, partnerId, newBalance) => {
        await global.pool.query(
            'UPDATE players SET balance = $1 WHERE username = $2 AND partner_id = $3',
            [Number(newBalance), username, partnerId]
        );
    },
    savePlayerActionHistory: async (username, partnerId, actionData) => {
        // 1. Извлекаем игрока из PostgreSQL
        const playerRes = await global.pool.query(
            'SELECT * FROM players WHERE username = $1 AND partner_id = $2 LIMIT 1',
            [username, partnerId]
        );

        if (playerRes.rowCount > 0) {
            const player = playerRes.rows[0];

            // Десериализуем JSONB поля для работы внутри JS
            let history = typeof player.history === 'string' ? JSON.parse(player.history) : (player.history || []);
            let dailyQuests = typeof player.daily_quests === 'string' ? JSON.parse(player.daily_quests) : (player.daily_quests || { gamesPlayed: 0, claimed: false });
            let xp = Number(player.xp || 0);
            let level = Number(player.level || 1);
            let tournamentPoints = Number(player.tournament_points || 0);
            let currentBalance = Number(player.balance || 0);

            // Запись истории действий
            const timeString = new Date().toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            });
            history.unshift({ time: timeString, ...actionData });
            if (history.length > 30) history.pop();

            // 2. БЕЗОПАСНАЯ B2B ГЕЙМИФИКАЦИЯ
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

            const walletService = seamless || require('./services/seamlessService');

            // --- Начисляем XP и Уровни ---
            xp += Number(gConfig.xpPerGame);
            const nextLevelXp = level * Number(gConfig.xpMultiplier);

            if (xp >= nextLevelXp) {
                level += 1;
                try {
                    const lvlRoundId = `lvlup_${crypto.randomBytes(6).toString('hex')}`;
                    const creditResult = await walletService.credit(
                        username,
                        partnerId,
                        actionData.sessionId || null,
                        Number(gConfig.levelUpBonus),
                        "VIP Level Up Reward",
                        lvlRoundId
                    );
                    // Синхронизируем баланс из ответа шлюза
                    if (creditResult && creditResult.balance !== undefined) {
                        currentBalance = Number(creditResult.balance);
                    }
                } catch (err) {
                    console.error(`❌ Ошибка выплаты за уровень игроку ${username}:`, err.message);
                }
            }

            // --- Считаем прогресс Ежедневного Квеста ---
            if (dailyQuests.gamesPlayed < Number(gConfig.questTargetGames)) {
                dailyQuests.gamesPlayed += 1;

                if (dailyQuests.gamesPlayed === Number(gConfig.questTargetGames) && !dailyQuests.claimed) {
                    dailyQuests.claimed = true;
                    try {
                        const questRoundId = `q_daily_${crypto.randomBytes(6).toString('hex')}`;
                        const creditResult = await walletService.credit(
                            username,
                            partnerId,
                            actionData.sessionId || null,
                            Number(gConfig.questReward),
                            "Daily Quest Reward",
                            questRoundId
                        );
                        // Синхронизируем баланс из ответа шлюза
                        if (creditResult && creditResult.balance !== undefined) {
                            currentBalance = Number(creditResult.balance);
                        }
                    } catch (err) {
                        console.error(`❌ Ошибка выплаты за квест игроку ${username}:`, err.message);
                        dailyQuests.claimed = false; // Откатываем статус при сбое сети
                    }
                }
            }

            // --- Начисляем Очки Турнира (Лидерборд) ---
            if (Number(gConfig.tournamentActive) === 1) {
                tournamentPoints += actionData.win ? 5 : 1;
            }

            // 3. Сохраняем все обновленные данные в PostgreSQL
            await global.pool.query(
                `UPDATE players 
                 SET history = $1::jsonb, 
                     xp = $2, 
                     level = $3, 
                     daily_quests = $4::jsonb, 
                     tournament_points = $5,
                     balance = $6
                 WHERE username = $7 AND partner_id = $8`,
                [
                    JSON.stringify(history),
                    xp,
                    level,
                    JSON.stringify(dailyQuests),
                    tournamentPoints,
                    currentBalance,
                    username,
                    partnerId
                ]
            );
        }
    },
    // ИСПРАВЛЕНО: Расчет и выплата кэшбэка переведены на Postgres и завязаны на global.CONFIG
    calculateAndPayCashback: async (partnerId, seamlessCredit) => {
        const globalConfig = global.CONFIG || {};
        const partnerConfig = globalConfig[partnerId] || {};
        // Корректно ищем процент кэшбэка в ветке gamification или берем дефолтные 10%
        const gConfig = partnerConfig.gamification || { cashbackPercent: 10 };
        const pct = Number(gConfig.cashbackPercent) / 100;

        // Находим игроков строго текущего партнера из Postgres
        const res = await global.pool.query('SELECT * FROM players WHERE partner_id = $1', [partnerId]);
        const allPlayers = res.rows;
        const cashbackReport = [];

        for (const player of allPlayers) {
            let history = typeof player.history === 'string' ? JSON.parse(player.history) : (player.history || []);
            if (history.length === 0) continue;

            let totalDebits = 0;
            let totalCredits = 0;

            // Парсим историю последних действий игрока
            history.forEach(action => {
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

                if (cashbackAmount > 0 && typeof seamlessCredit === 'function') {
                    try {
                        // ИСПРАВЛЕНО: Безопасный криптографический roundId вместо Date.now() для предотвращения коллизий в цикле
                        const cashbackRoundId = `cb_${crypto.randomBytes(6).toString('hex')}`;

                        // Отправляем начисление кэшбэка на шлюз платформы
                        const creditResult = await seamlessCredit(
                            player.username,
                            partnerId,
                            null, // Сессия null для фонового расчета
                            cashbackAmount,
                            "Weekly Cashback",
                            cashbackRoundId
                        );

                        // Получаем свежий баланс из ответа шлюза
                        const freshBalance = creditResult && creditResult.balance !== undefined
                            ? Number(creditResult.balance)
                            : Number(player.balance) + cashbackAmount;

                        // Добавляем запись о кэшбэке в начало лога истории
                        history.unshift({
                            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
                            game: "Cashback System",
                            details: `Received weekly cashback ${gConfig.cashbackPercent}%`,
                            change: `+${cashbackAmount} 🪙`,
                            win: true
                        });

                        // Апдейтим историю и баланс игрока в PostgreSQL
                        await global.pool.query(
                            'UPDATE players SET history = $1::jsonb, balance = $2 WHERE username = $3 AND partner_id = $4',
                            [JSON.stringify(history), freshBalance, player.username, partnerId]
                        );

                        cashbackReport.push({ username: player.username, loss: netLoss, paid: cashbackAmount });
                    } catch (e) {
                        console.error(`❌ Ошибка выплаты кэшбэка для ${player.username}:`, e.message);
                    }
                }
            }
        }
        return cashbackReport;
    },

    // ИСПРАВЛЕНО: Быстрое чтение истории игрока из JSONB колонки Postgres
    getPlayerHistory: async (username, partnerId) => {
        const res = await global.pool.query('SELECT history FROM players WHERE username = $1 AND partner_id = $2 LIMIT 1', [username, partnerId]);
        if (res.rowCount === 0) return [];

        const history = res.rows[0].history;
        return typeof history === 'string' ? JSON.parse(history) : (history || []);
    },

    // ИСПРАВЛЕНО: Получение списка всех игроков конкретного бренда из Postgres
    getAllPlayers: async (partnerId) => {
        try {
            const res = await global.pool.query('SELECT * FROM players WHERE partner_id = $1', [partnerId]);
            return res.rows.map(p => ({
                ...p,
                dailyQuests: typeof p.daily_quests === 'string' ? JSON.parse(p.daily_quests) : p.daily_quests,
                history: typeof p.history === 'string' ? JSON.parse(p.history) : p.history,
                usedPromos: typeof p.used_promos === 'string' ? JSON.parse(p.used_promos) : p.used_promos,
                balance: Number(p.balance),
                tournamentPoints: Number(p.tournament_points)
            }));
        }
        catch (e) {
            console.log('getAllPlayers', e);
            return {
                error: true,
            }
        }
    },

    getGamersWithTickets: async () => {
        const gamers = [];
        const memKeys = Object.keys(activeTickets); // Ключи вида "partnerId_username"

        for (const memKey of memKeys) {
            if (activeTickets[memKey] && activeTickets[memKey].length > 0) {
                // ИСПРАВЛЕНО: Безопасное разделение ключа на случай, если в username есть символы "_"
                const firstUnderscoreIndex = memKey.indexOf('_');
                if (firstUnderscoreIndex === -1) continue;

                const partnerId = memKey.substring(0, firstUnderscoreIndex);
                const username = memKey.substring(firstUnderscoreIndex + 1);

                try {
                    // Извлекаем игрока из Postgres
                    const res = await global.pool.query(
                        'SELECT * FROM players WHERE username = $1 AND partner_id = $2 LIMIT 1',
                        [username, partnerId]
                    );

                    if (res.rowCount > 0) {
                        const p = res.rows[0];

                        // Приводим структуру к объекту, который ожидают ваши лотерейные сервисы
                        const player = {
                            ...p,
                            dailyQuests: typeof p.daily_quests === 'string' ? JSON.parse(p.daily_quests) : p.daily_quests,
                            history: typeof p.history === 'string' ? JSON.parse(p.history) : p.history,
                            usedPromos: typeof p.used_promos === 'string' ? JSON.parse(p.used_promos) : p.used_promos,
                            balance: Number(p.balance),
                            tournamentPoints: Number(p.tournament_points || 0),
                            tickets: activeTickets[memKey] // Привязываем актуальные билеты из памяти
                        };

                        gamers.push(player);
                    }
                } catch (err) {
                    console.error(`[Postgres Lottery Error] Failed to fetch gamer ${username} for tickets sync:`, err.message);
                }
            }
        }
        return gamers;
    }
};

const jackpotMethods = {
    getJackpot: (partnerId) => {
        if (!global.banks) global.banks = {};
        if (!global.banks[partnerId]) {
            global.banks[partnerId] = { globalJackpot: 1000, mines: 5000, crash: 5000, dice: 3000, hilo: 4000, slots5x3: 10000 };
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
    }
};

const gamificationMethods = {
    // 1. Лидерборд строится строго внутри игроков конкретного партнера средствами СУБД (ультрабыстро)
    getLeaderboard: async (partnerId, criterion = 'balance', limit = 10) => {
        const validCriteria = ['balance', 'xp', 'tournament_points'];
        // Мапим входящие критерии на правильные змеиные (snake_case) имена колонок в Postgres
        let sortField = 'balance';
        if (criterion === 'xp') sortField = 'xp';
        if (criterion === 'tournamentPoints') sortField = 'tournament_points';

        try {
            // Сортировку и лимит доверяем самому Postgres — это не грузит RAM сервера
            const res = await global.pool.query(
                `SELECT username, level, balance, tournament_points 
                 FROM players 
                 WHERE partner_id = $1 
                 ORDER BY ${sortField} DESC 
                 LIMIT $2`,
                [partnerId, limit]
            );

            return res.rows.map((p, index) => ({
                rank: index + 1,
                username: p.username,
                level: Number(p.level || 1),
                balance: Number(p.balance),
                tournamentPoints: Number(p.tournament_points || 0)
            }));
        } catch (err) {
            console.error(`[Postgres Leaderboard Error] Failed to fetch top:`, err.message);
            return [];
        }
    },

    // 2. Завершение турнира на чистом SQL с защитой транзакций
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

        // Запрашиваем из Postgres только участников с очками > 0, отсортированных по убыванию
        const res = await global.pool.query(
            'SELECT * FROM players WHERE partner_id = $1 AND tournament_points > 0 ORDER BY tournament_points DESC',
            [partnerId]
        );
        const participants = res.rows;
        const winnersInfo = [];
        const walletService = seamless || require('./services/seamlessService');

        for (let i = 0; i < participants.length; i++) {
            const player = participants[i];
            let prizeWon = 0;

            if (i < 3) {
                prizeWon = prizes[i];

                try {
                    const tournamentRoundId = `trn_win_${crypto.randomBytes(6).toString('hex')}`;
                    const creditResult = await walletService.credit(
                        player.username,
                        partnerId,
                        null,
                        prizeWon,
                        `Tournament Place ${i + 1}`,
                        tournamentRoundId
                    );

                    // Обновляем баланс на основе ответа шлюза
                    player.balance = creditResult && creditResult.balance !== undefined
                        ? Number(creditResult.balance)
                        : Number(player.balance) + prizeWon;

                    winnersInfo.push({
                        username: player.username,
                        place: i + 1,
                        points: Number(player.tournament_points),
                        prize: prizeWon
                    });
                } catch (err) {
                    console.error(`❌ Tournament payout failed for ${player.username}:`, err.message);
                }
            }

            // Корректно парсим и обновляем историю действий внутри JSONB поля Postgres
            let currentHistory = typeof player.history === 'string' ? JSON.parse(player.history) : (player.history || []);
            const timeString = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

            currentHistory.unshift({
                time: timeString,
                game: "🏆 Tournament End",
                details: `Tournament finished. Points: ${player.tournament_points}. Place: ${i + 1}`,
                change: prizeWon > 0 ? `+${prizeWon} 🪙` : `0 🪙`,
                win: prizeWon > 0
            });
            if (currentHistory.length > 30) currentHistory.pop();

            // Сохраняем изменения напрямую через SQL-запрос UPDATE
            await global.pool.query(
                `UPDATE players 
                 SET history = $1::jsonb, tournament_points = 0, balance = $2 
                 WHERE username = $3 AND partner_id = $4`,
                [JSON.stringify(currentHistory), Number(player.balance), player.username, partnerId]
            );
        }

        return winnersInfo;
    },

    // 3. Массовый Крон-сброс квестов в Postgres одной строчкой (БЕЗ циклов, не нагружает базу данных)
    resetDailyQuestsForAll: async (partnerId = null) => {
        try {
            const globalConfig = global.CONFIG || {};
            const partnersToReset = partnerId ? [partnerId] : Object.keys(globalConfig);

            for (const pId of partnersToReset) {
                // Атомарный UPDATE одной командой на всю таблицу players для выбранного partner_id
                await global.pool.query(
                    `UPDATE players 
                     SET daily_quests = '{"gamesPlayed": 0, "claimed": false}'::jsonb 
                     WHERE partner_id = $1`,
                    [pId]
                );
                console.log(`📅 [Postgres Cron] Daily quests reset for partner: ${pId}`);
            }
            return true;
        } catch (err) {
            console.error(`❌ Error resetting quests via Postgres SQL:`, err.message);
            return false;
        }
    }
};

const promoMethods = {
    // 1. Создание промокода теперь намертво привязано к конкретному partnerId внутри global.CONFIG и Postgres
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

        try {
            // Атомарно сохраняем обновленный конфиг в таблицу b2b_configs.
            // Использование || (JSONB merge) защищает данные других партнеров от перезаписи.
            await global.pool.query(
                `INSERT INTO b2b_configs (id, config_data) 
                 VALUES ($1, $2::jsonb)
                 ON CONFLICT (id) 
                 DO UPDATE SET config_data = b2b_configs.config_data || EXCLUDED.config_data`,
                [
                    'global_config',
                    JSON.stringify({ [partnerId]: global.CONFIG[partnerId] })
                ]
            );
        } catch (err) {
            console.error(`[Postgres B2B Promo Error] Failed to add promo code for partner ${partnerId}:`, err.message);
        }
    },

    // 2. Активация кода игроком на чистом нативном SQL
    usePromoCode: async (username, partnerId, code, seamlessCredit) => {
        const cleanCode = code.toUpperCase().trim();
        const globalConfig = global.CONFIG || {};
        const partnerConfig = globalConfig[partnerId] || {};
        const promo = (partnerConfig.promoCodes || []).find(p => p.code === cleanCode && p.active === 1);

        if (!promo) throw new Error("Invalid code");

        // Поиск игрока по составному B2B ключу на чистом SQL
        const playerRes = await global.pool.query(
            'SELECT * FROM players WHERE username = $1 AND partner_id = $2 LIMIT 1',
            [username, partnerId]
        );
        if (playerRes.rowCount === 0) throw new Error("Player not found");
        const player = playerRes.rows[0];

        // Безопасно парсим вложенный JSONB-объект активированных промокодов
        const currentPromos = typeof player.used_promos === 'string'
            ? JSON.parse(player.used_promos)
            : (player.used_promos || {});

        const timesUsed = currentPromos[cleanCode] || 0;

        if (timesUsed >= promo.maxUses) throw new Error("You have already used this promo code maximum times");

        // Безопасный криптографический roundId вместо Date.now()
        const promoRoundId = `promo_${cleanCode.toLowerCase()}_${crypto.randomBytes(6).toString('hex')}`;

        // Передаем сессию null (так как активация промокода — это фоновая операция кэша)
        const creditResult = await seamlessCredit(
            username,
            partnerId,
            null,
            Number(promo.reward),
            "Promo Activation",
            promoRoundId
        );

        // Получаем свежий баланс, который вернул шлюз платформы витрины
        const newBalance = creditResult && creditResult.balance !== undefined
            ? Number(creditResult.balance)
            : Number(player.balance) + promo.reward;

        currentPromos[cleanCode] = timesUsed + 1;

        // Фиксируем использование кода и пишем свежий баланс напрямую в Postgres таблицу players
        await global.pool.query(
            'UPDATE players SET used_promos = $1::jsonb, balance = $2 WHERE username = $3 AND partner_id = $4',
            [JSON.stringify(currentPromos), newBalance, username, partnerId]
        );

        return promo.reward;
    }
};


const affiliateMethods = {

    linkReferral: async (username, partnerId, refCode) => {
        const cleanRef = refCode.trim();

        // Ищем, кому принадлежит этот реф-код (проверяем существование пригласителя)
        const inviterRes = await global.pool.query(
            'SELECT username FROM players WHERE username = $1 AND partner_id = $2 LIMIT 1',
            [cleanRef, partnerId]
        );

        if (inviterRes.rowCount === 0) return false;

        // Привязываем реферала к пригласителю
        await global.pool.query(
            'UPDATE players SET invited_by = $1 WHERE username = $2 AND partner_id = $3',
            [cleanRef, username, partnerId]
        );
        return true;
    },

    trackAffiliatePayout: async (username, partnerId, lostAmount, seamlessCredit) => {
        // Находим игрока и его пригласителя
        const playerRes = await global.pool.query(
            'SELECT invited_by FROM players WHERE username = $1 AND partner_id = $2 LIMIT 1',
            [username, partnerId]
        );

        if (playerRes.rowCount === 0 || !playerRes.rows[0].invited_by) return;
        const invitedBy = playerRes.rows[0].invited_by;

        // Достаем конфиг из глобального объекта памяти CONFIG
        const globalConfig = global.CONFIG || {};
        const partnerConfig = globalConfig[partnerId] || {};
        const refPercent = partnerConfig.gamification?.affiliatePercent || 10;

        const commission = Math.floor(lostAmount * (refPercent / 100));

        if (commission > 0 && typeof seamlessCredit === 'function') {
            try {
                const refRoundId = `aff_pay_${crypto.randomBytes(6).toString('hex')}`;
                const gameName = "Affiliate RevShare Commission";

                // Начисляем комиссию пригласителю через Seamless API шлюз платформы
                const creditResult = await seamlessCredit(
                    invitedBy,
                    partnerId,
                    null, // сессия null, так как транзакция фоновая
                    commission,
                    gameName,
                    refRoundId
                );

                // Запрашиваем текущие данные пригласителя, чтобы корректно обновить его баланс локально
                const inviterRes = await global.pool.query(
                    'SELECT balance FROM players WHERE username = $1 AND partner_id = $2 LIMIT 1',
                    [invitedBy, partnerId]
                );

                if (inviterRes.rowCount > 0) {
                    const freshBalance = creditResult && creditResult.balance !== undefined
                        ? creditResult.balance
                        : Number(inviterRes.rows[0].balance) + commission;

                    // Обновляем локальный баланс партнера в PostgreSQL
                    await global.pool.query(
                        'UPDATE players SET balance = $1 WHERE username = $2 AND partner_id = $3',
                        [freshBalance, invitedBy, partnerId]
                    );
                }

                console.log(`💸 Affiliate Revenue Share: ${invitedBy} earned +${commission} 🪙 from ${username}'s loss`);
            } catch (err) {
                console.error(`❌ Affiliate payout failed for inviter ${invitedBy}:`, err.message);
            }
        }
    }
};

const financialMethods = {

    logFinancialTransaction: async (partnerId, username, type, amount, game) => {
        // Записываем лог в таблицу бухгалтерского учета accounting_logs
        await global.pool.query(
            `INSERT INTO accounting_logs (partner_id, username, type, amount, game, timestamp) 
             VALUES ($1, $2, $3, $4, $5, NOW())`,
            [partnerId, username, type, Number(amount), game || "Unknown Game"]
        );
    },

    getFinancialReport: async (partnerId) => {
        // Вытаскиваем все логи транзакций партнера
        const res = await global.pool.query(
            'SELECT type, amount, game, EXTRACT(EPOCH FROM timestamp) * 1000 as ts FROM accounting_logs WHERE partner_id = $1 ORDER BY timestamp DESC',
            [partnerId]
        );
        const txs = res.rows;

        let totalBets = 0;
        let totalWins = 0;
        let totalAffiliate = 0;

        txs.forEach(tx => {
            const amt = Number(tx.amount);
            if (tx.type === "DEBIT") totalBets += amt;
            if (tx.type === "CREDIT") totalWins += amt;
            if (tx.type === "AFFILIATE") totalAffiliate += amt;
        });

        const ggr = totalBets - totalWins;
        const netProfit = ggr - totalAffiliate;

        // Форматируем под структуру объектов, которую ожидала админка из NeDB
        const formattedTxs = txs.map(tx => ({
            partnerId,
            username: tx.username,
            type: tx.type,
            amount: Number(tx.amount),
            game: tx.game,
            timestamp: Number(tx.ts)
        }));

        // 🎰 ЛОГ СТАВОК: Исключаем промокоды, кэшбэки и бонусы
        const latestBets = formattedTxs.filter(tx => {
            const gameName = tx.game || "";
            return (tx.type === "DEBIT" || tx.type === "CREDIT") &&
                !gameName.includes("Promo") &&
                !gameName.includes("Cashback") &&
                !gameName.includes("Quest") &&
                !gameName.includes("VIP");
        }).slice(0, 50);

        // 💳 ЛОГ КАССЫ: Чистый Cashflow
        const latestTransactions = formattedTxs.filter(tx => {
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

const minesMethods = {
    getMinesGame: (username, partnerId) => activeMinesGames[`${partnerId}_${username}`],
    setMinesGame: (username, partnerId, gameData) => {
        activeMinesGames[`${partnerId}_${username}`] = gameData;
    },
    deleteMinesGame: (username, partnerId) => {
        delete activeMinesGames[`${partnerId}_${username}`];
    },
    getMinesMultiplier: (totalCells, totalMines, openedCells, partnerId) => {
        let multiplier = 1;
        for (let i = 0; i < openedCells; i++) {
            multiplier *= (totalCells - i) / (totalCells - totalMines - i);
        }
        const globalConfig = global.CONFIG || {};
        const partnerConfig = globalConfig[partnerId] || {};
        const minesConfig = partnerConfig.mines || { rtpPercent: 80 };
        const rtpFactor = (minesConfig.rtpPercent || 80) / 100;
        return parseFloat((multiplier * rtpFactor).toFixed(2));
    },

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
    setMinesRtp: (partnerId, newRtp) => {
        const globalConfig = global.CONFIG || {};
        if (globalConfig[partnerId] && globalConfig[partnerId].mines) {
            globalConfig[partnerId].mines.rtpPercent = Number(newRtp);
        }
    }
};

const crashMethods = {
    getCrashBank: (partnerId) => {
        if (!global.banks || !global.banks[partnerId]) jackpotMethods.getJackpot(partnerId);
        return global.banks[partnerId].crash;
    },
    addCrashBank: (partnerId, amount) => {
        if (!global.banks || !global.banks[partnerId]) jackpotMethods.getJackpot(partnerId);
        global.banks[partnerId].crash += amount;
    },
    reduceCrashBank: (partnerId, amount) => {
        if (!global.banks || !global.banks[partnerId]) jackpotMethods.getJackpot(partnerId);
        global.banks[partnerId].crash -= amount;
    },
    getCrashBets: (partnerId) => {
        if (!crashBetsByPartner[partnerId]) crashBetsByPartner[partnerId] = {};
        return crashBetsByPartner[partnerId];
    },
    addCrashBet: (username, partnerId, amount) => {
        if (!crashBetsByPartner[partnerId]) crashBetsByPartner[partnerId] = {};
        crashBetsByPartner[partnerId][username] = amount;
    },
    clearCrashBets: (partnerId) => {
        crashBetsByPartner[partnerId] = {};
    },
    getActiveInFlight: (partnerId) => {
        if (!crashPlayersInFlight[partnerId]) crashPlayersInFlight[partnerId] = {};
        return crashPlayersInFlight[partnerId];
    },
    addPlayerToFlight: (username, partnerId) => {
        if (!crashPlayersInFlight[partnerId]) crashPlayersInFlight[partnerId] = {};
        crashPlayersInFlight[partnerId][username] = true;
    },
    removePlayerFromFlight: (username, partnerId) => {
        if (crashPlayersInFlight[partnerId]) delete crashPlayersInFlight[partnerId][username];
    },
    clearFlightPlayers: (partnerId) => {
        crashPlayersInFlight[partnerId] = {};
    }
};

const diceMethods = {
    // ИСПРАВЛЕНО: Банк Dice изолирован через глобальный объект global.banks в Postgres
    getDiceBank: (partnerId) => {
        if (!global.banks || !global.banks[partnerId]) jackpotMethods.getJackpot(partnerId);
        return global.banks[partnerId].dice;
    },
    addDiceBank: (partnerId, amount) => {
        if (!global.banks || !global.banks[partnerId]) jackpotMethods.getJackpot(partnerId);
        global.banks[partnerId].dice += amount;
    },
    reduceDiceBank: (partnerId, amount) => {
        if (!global.banks || !global.banks[partnerId]) jackpotMethods.getJackpot(partnerId);
        global.banks[partnerId].dice -= amount;
    }
};

const hiloMethods = {
    // ИСПРАВЛЕНО: Банк Hi-Lo изолирован через global.banks
    getHiloBank: (partnerId) => {
        if (!global.banks || !global.banks[partnerId]) jackpotMethods.getJackpot(partnerId);
        return global.banks[partnerId].hilo;
    },
    addHiloBank: (partnerId, amount) => {
        if (!global.banks || !global.banks[partnerId]) jackpotMethods.getJackpot(partnerId);
        global.banks[partnerId].hilo += amount;
    },
    reduceHiloBank: (partnerId, amount) => {
        if (!global.banks || !global.banks[partnerId]) jackpotMethods.getJackpot(partnerId);
        global.banks[partnerId].hilo -= amount;
    },

    // ИСПРАВЛЕНО: Карты в Hi-Lo разделены по составному ключу "partnerId_username"
    getHiloCard: (username, partnerId) => activeHiloCards[`${partnerId}_${username}`],
    setHiloCard: (username, partnerId, card) => {
        activeHiloCards[`${partnerId}_${username}`] = card;
    },

    // ИСПРАВЛЕНО: Считывание формулы множителей под конкретный бренд из global.CONFIG
    getHiloMultipliers: (currentValue, partnerId) => {
        const globalConfig = global.CONFIG || {};
        const partnerConfig = globalConfig[partnerId] || {};
        const config = partnerConfig.hilo || { houseEdge: 0.04, cards: [] };

        const totalCards = config.cards.length || 13; // Защита от деления на 0, если массив пуст

        // Считаем сколько в колоде карт выше/равно и ниже/равно текущей
        const higherCount = config.cards.filter(c => c.value >= currentValue).length || 1;
        const lowerCount = config.cards.filter(c => c.value <= currentValue).length || 1;

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
    // ИСПРАВЛЕНО: Фриспины изолированы по составному ключу в локальной оперативной памяти
    getFreeSpins: (username, partnerId) => {
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

const sportsMethods = {
    // 1. Отдаем линию матчей из таблицы matches в PostgreSQL
    getSportsLine: async () => {
        // Запрашиваем из Postgres все матчи, которые еще не завершились
        const res = await global.pool.query('SELECT * FROM matches WHERE status != $1', ['FINISHED']);

        return res.rows.map(m => {
            // Десериализуем JSONB поля, если драйвер отдал их в виде строк (зависит от настроек pg)
            const parsedTeams = typeof m.teams === 'string' ? JSON.parse(m.teams) : m.teams;
            const parsedMarkets = typeof m.markets === 'string' ? JSON.parse(m.markets) : m.markets;

            return {
                id: m.match_id,
                sport: m.sport,
                league: m.league,
                // Склеиваем команды в строку, как ожидает ваш sportsController
                teams: typeof parsedTeams === 'string' ? parsedTeams : `${parsedTeams.home} - ${parsedTeams.away}`,
                status: m.status,
                markets: parsedMarkets
            };
        });
    },

    // 2. Сохраняем купон в таблицу sports_bets, вытаскивая текущие условия тоталов/гандикапов
    createSportsBet: async (username, partnerId, betData) => {
        const processedItems = [];

        for (let item of betData.items) {
            // Ищем матч в Postgres
            const matchRes = await global.pool.query('SELECT markets FROM matches WHERE match_id = $1 LIMIT 1', [item.matchId]);
            let target = null;
            let handicapValue = null;

            if (matchRes.rowCount > 0) {
                const markets = typeof matchRes.rows[0].markets === 'string'
                    ? JSON.parse(matchRes.rows[0].markets)
                    : matchRes.rows[0].markets;

                if (markets[item.market]) {
                    target = markets[item.market].target || null;
                    handicapValue = markets[item.market].value || null;
                }
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

        const type = betData.items.length > 1 ? "MULTI" : "SINGLE";

        // INSERT купона ставки в таблицу sports_bets с сохранением массива в JSONB
        const betRes = await global.pool.query(
            `INSERT INTO sports_bets (username, partner_id, type, items, total_odds, stake, status, timestamp) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, NOW()) RETURNING id`,
            [username, partnerId, type, JSON.stringify(processedItems), Number(betData.totalOdds), Number(betData.stake), "PENDING"]
        );

        return { _id: betRes.rows[0].id };
    },

    // 3. Запрос нерассчитанных ставок для админки партнера из PostgreSQL
    getPendingBets: async (partnerId) => {
        const res = await global.pool.query('SELECT * FROM sports_bets WHERE status = $1 AND partner_id = $2', ['PENDING', partnerId]);

        return res.rows.map(b => ({
            _id: b.id,
            username: b.username,
            partnerId: b.partner_id,
            type: b.type,
            items: typeof b.items === 'string' ? JSON.parse(b.items) : b.items,
            totalOdds: Number(b.total_odds),
            stake: Number(b.stake),
            status: b.status
        }));
    },

    // 4. Расчет купона и отправка денег партнеру через Seamless Credit
    settleBet: async (betId, finalStatus, seamlessCredit = null) => {
        const res = await global.pool.query('SELECT * FROM sports_bets WHERE id = $1 AND status = $2 LIMIT 1', [betId, 'PENDING']);
        if (res.rowCount === 0) return null;
        const b = res.rows[0];

        let prize = 0;
        if (finalStatus === "WON") {
            prize = Math.floor(Number(b.stake) * Number(b.total_odds));
            const sportsRoundId = `sp_win_${crypto.randomBytes(6).toString('hex')}`;
            const gameName = `Sportsbook Win (${b.type})`;

            const creditMethod = typeof seamlessCredit === 'function' ? seamlessCredit : seamless?.credit;

            if (typeof creditMethod === 'function') {
                try {
                    // Отправляем транзакцию на шлюз платформы
                    await creditMethod(b.username, b.partner_id, null, prize, gameName, sportsRoundId);

                    // Синхронизируем локальный кэш баланса победителя в Postgres
                    await global.pool.query(
                        'UPDATE players SET balance = balance + $1 WHERE username = $2 AND partner_id = $3',
                        [prize, b.username, b.partner_id]
                    );
                } catch (err) {
                    console.error(`❌ Failed to credit sports win for ${b.username}:`, err.message);
                    return null;
                }
            } else {
                return null;
            }
        }

        // Обновляем статус купона в PostgreSQL
        await global.pool.query('UPDATE sports_bets SET status = $1, prize = $2 WHERE id = $3', [finalStatus, prize, betId]);
        return { _id: b.id, username: b.username, status: finalStatus, prize };
    }
};

const catalogMethods = {

    // 1. Получить каталог игр с учетом B2B-настроек конкретного партнера
    getPartnerGamesCatalog: async (partnerId, filters = {}) => {
        const { provider, theme, base, search, category } = filters;

        // Магия SQL JOIN: берем дефолтную игру, но джойним кастомные настройки партнера и статус агрегатора
        let queryText = `
            SELECT 
                g.id,
                COALESCE(pg.custom_name, g.name) as name,
                COALESCE(pg.custom_slug, g.slug) as slug,
                COALESCE(pg.custom_theme, g.theme) as theme,
                COALESCE(pg.custom_rtp, (g.rtp_settings->>'default_rtp')::numeric) as rtp,
                g.provider, g.aggregator, g.has_demo, g.is_multiplayer, g.description, 
                g.image, g.base, g.url, g.categories,
                COALESCE(pg.is_active, true) as is_game_active,
                COALESCE(pa.is_active, true) as is_aggregator_active
            FROM games g
            LEFT JOIN partner_games pg ON g.id = pg.game_id AND pg.partner_id = $1
            LEFT JOIN partner_aggregators pa ON g.aggregator = pa.aggregator AND pa.partner_id = $1
            WHERE g.is_active = true
        `;

        const queryParams = [partnerId];
        let paramIndex = 2;

        // Фильтрация на лету
        if (provider) {
            queryText += ` AND g.provider = $${paramIndex}`;
            queryParams.push(provider);
            paramIndex++;
        }
        if (theme) {
            queryText += ` AND COALESCE(pg.custom_theme, g.theme) = $${paramIndex}`;
            queryParams.push(theme);
            paramIndex++;
        }
        if (base) {
            queryText += ` AND g.base = $${paramIndex}`;
            queryParams.push(base);
            paramIndex++;
        }
        if (search) {
            queryText += ` AND (g.name ILIKE $${paramIndex} OR pg.custom_name ILIKE $${paramIndex})`;
            queryParams.push(`%${search}%`);
            paramIndex++;
        }
        if (category) {
            // Поиск внутри JSONB-массива категорий (например, проверка содержит ли ['slots'])
            queryText += ` AND g.categories @> $${paramIndex}::jsonb`;
            queryParams.push(JSON.stringify([category]));
            paramIndex++;
        }

        // Фильтруем, оставляя только то, что не выключено партнером или агрегатором
        queryText += ` HAVING COALESCE(pg.is_active, true) = true AND COALESCE(pa.is_active, true) = true`;
        queryText += ' ORDER BY g.id DESC';

        const result = await global.pool.query(queryText, queryParams);
        return result.rows.map(row => ({
            ...row,
            categories: typeof row.categories === 'string' ? JSON.parse(row.categories) : row.categories
        }));
    },

    // 2. Управление настройками агрегатора (Включить/Выключить Softswiss, Hacksaw и т.д.)
    updatePartnerAggregatorStatus: async (partnerId, aggregator, isActive) => {
        await global.pool.query(
            `INSERT INTO partner_aggregators (partner_id, aggregator, is_active, updated_at)
             VALUES ($1, $2, $3, NOW())
             ON CONFLICT (partner_id, aggregator)
             DO UPDATE SET is_active = EXCLUDED.is_active, updated_at = NOW()`,
            [partnerId, aggregator, isActive]
        );
        return true;
    },

    // 3. Сохранить или обновить кастомную настройку игры для партнера
    updatePartnerGameSettings: async (partnerId, gameId, settings = {}) => {
        const { isActive, customName, customSlug, customTheme, customRtp } = settings;
        await global.pool.query(
            `INSERT INTO partner_games (partner_id, game_id, is_active, custom_name, custom_slug, custom_theme, custom_rtp, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
             ON CONFLICT (partner_id, game_id)
             DO UPDATE SET 
                is_active = COALESCE(EXCLUDED.is_active, partner_games.is_active),
                custom_name = COALESCE(EXCLUDED.custom_name, partner_games.custom_name),
                custom_slug = COALESCE(EXCLUDED.custom_slug, partner_games.custom_slug),
                custom_theme = COALESCE(EXCLUDED.custom_theme, partner_games.custom_theme),
                custom_rtp = COALESCE(EXCLUDED.custom_rtp, partner_games.custom_rtp),
                updated_at = NOW()`,
            [partnerId, gameId, isActive, customName, customSlug, customTheme, customRtp]
        );
        return true;
    },

    // =========================================================================
    // МЕТОДЫ УПРАВЛЕНИЯ КОЛЛЕКЦИЯМИ ИГР (Add, Edit, Delete)
    // =========================================================================

    // Удалить коллекцию
    deletePartnerCollection: async (partnerId, collectionSlug) => {
        const res = await global.pool.query(
            'DELETE FROM partner_collections WHERE partner_id = $1 AND slug = $2',
            [partnerId, collectionSlug]
        );
        return res.rowCount > 0;
    },

    // Создать новую коллекцию игр для партнера (Передаем массив чисел напрямую в Postgres INT[])
    createPartnerCollection: async (partnerId, name, slug, gameIds = []) => {
        const res = await global.pool.query(
            `INSERT INTO partner_collections (partner_id, name, slug, game_ids)
             VALUES ($1, $2, $3, $4::int[]) RETURNING id`, // Кастуем к целочисленному массиву
            [partnerId, name, slug.toLowerCase().trim(), gameIds] // gameIds передается как обычный массив JS [1,2,3]
        );
        return res.rows[0].id;
    },

    // Отредактировать существующую коллекцию
    updatePartnerCollection: async (partnerId, collectionSlug, updatedData = {}) => {
        const { name, gameIds } = updatedData;
        await global.pool.query(
            `UPDATE partner_collections 
             SET name = COALESCE($1, name), 
                 game_ids = COALESCE($2::int[], game_ids), -- Исправлено под тип INT[]
                 updated_at = NOW()
             WHERE partner_id = $3 AND slug = $4`,
            [name, gameIds || null, partnerId, collectionSlug]
        );
        return true;
    },

    // Получить все коллекции партнера вместе с развернутыми объектами игр внутри них
    getPartnerCollections: async (partnerId) => {
        const res = await global.pool.query(
            'SELECT * FROM partner_collections WHERE partner_id = $1 ORDER BY id ASC',
            [partnerId]
        );

        const formattedCollections = [];
        for (const col of res.rows) {
            // ИСПРАВЛЕНО: Так как это INT[], поле col.game_ids из pg прилетает сразу как готовый массив JS [1, 2, 3]!
            const gameIds = col.game_ids || [];

            let gamesInCollection = [];
            if (gameIds.length > 0) {
                // Теперь оператор ANY($1::int[]) отработает мгновенно без синтаксических ошибок
                const gamesRes = await global.pool.query(
                    `SELECT id, name, slug, image, provider FROM games WHERE id = ANY($1::int[]) AND is_active = true`,
                    [gameIds]
                );
                gamesInCollection = gamesRes.rows;
            }

            formattedCollections.push({
                id: col.id,
                name: col.name,
                slug: col.slug,
                games: gamesInCollection
            });
        }
        return formattedCollections;
    },

};

const sessionMethods = {
    // 1. Создать игровую сессию и сгенерировать токен запуска
    createGameSession: async (partnerId, gameSlug, data = {}) => {
        const { username, isDemo, theme } = data;

        // Генерируем уникальный криптографический токен запуска
        const token = 'gl_' + crypto.randomBytes(24).toString('hex');

        // Сессия автоматически сгорает через 24 часа
        const expiredAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

        await global.pool.query(
            `INSERT INTO game_sessions (token, partner_id, username, game_slug, is_demo, theme, expired_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [token, partnerId, isDemo ? null : username, gameSlug, !!isDemo, theme || 'default', expiredAt]
        );

        return token;
    },

    // 2. Валидация сессии при загрузке самого iFrame игры
    validateGameSession: async (token) => {
        const res = await global.pool.query(
            `SELECT * FROM game_sessions 
             WHERE token = $1 AND is_active = true AND expired_at > NOW() 
             LIMIT 1`,
            [token]
        );

        if (res.rowCount === 0) return null;
        return res.rows[0];
    }
};

module.exports = {

    BGS: {
        sport: false,
        crash: false,
        lottery: false,
        roulette: false,
    },
    setBGS: (service, state, partnerId='') => {
        this.BGS[service] = state;
    },

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
    ...catalogMethods,
    ...sessionMethods,

    getConfig: (partnerId) => {
        const globalConfig = global.CONFIG || {};
        if (!globalConfig[partnerId]) {
            globalConfig[partnerId] = {};
        }
        return globalConfig[partnerId];
    },

    getPartnerConfig: async (partnerId) => {
        // Читаем древо конфигурации конкретного партнера из таблицы b2b_configs
        const res = await global.pool.query('SELECT config_data FROM b2b_configs WHERE id = $1 LIMIT 1', ['global_config']);
        if (res.rowCount === 0) return null;

        const configData = typeof res.rows[0].config_data === 'string'
            ? JSON.parse(res.rows[0].config_data)
            : res.rows[0].config_data;

        return configData[partnerId] || null;
    },

    updateConfigParam: async (partnerId, game, param, value) => {
        let changed = false;

        // Инициализируем глобальные контексты памяти Node.js, если они отсутствуют
        if (!global.banks) global.banks = {};
        if (!global.CONFIG) global.CONFIG = {};

        // Задаем безопасные дефолтные значения банков и конфига текущего бренда
        if (!global.banks[partnerId]) {
            global.banks[partnerId] = { globalJackpot: 1000, mines: 5000, crash: 5000, dice: 3000, hilo: 4000, slots5x3: 10000 };
        }
        if (!global.CONFIG[partnerId]) {
            global.CONFIG[partnerId] = {};
        }

        // 1. Изменение локального баланса (копилки) конкретной игры партнера
        if (param === 'bank') {
            const numericValue = Number(value);
            if (!isNaN(numericValue)) {
                if (['mines', 'crash', 'dice', 'hilo', 'slots5x3'].includes(game)) {
                    global.banks[partnerId][game] = numericValue;
                    changed = true;
                }
            }
        }
        // 2. Изменение внутренних параметров игры (RTP, минимальные/максимальные ставки и т.д.)
        else if (global.CONFIG[partnerId][game] && global.CONFIG[partnerId][game][param] !== undefined) {
            global.CONFIG[partnerId][game][param] = typeof global.CONFIG[partnerId][game][param] === 'number' ? Number(value) : value;
            changed = true;
        }

        // КЛЮЧЕВОЙ ШАГ: Если параметры изменились, атомарно пишем их в таблицу b2b_configs
        if (changed) {
            try {
                // Используем оператор слияния || (JSONB), чтобы обновить только ветку текущего партнера,
                // не затирая при этом конфигурации и банки всех остальных брендов в базе данных
                await global.pool.query(
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
                console.error(`[Postgres B2B Config Error] Failed to update param for partner ${partnerId}:`, err.message);
                return false;
            }
        }
        return false;
    },

    // Очищаем билеты лотереи с использованием составного B2B-ключа в оперативной памяти бэкенда
    clearPlayerTickets: (username, partnerId) => {
        const memKey = `${partnerId}_${username}`;
        activeTickets[memKey] = [];
    },

    // --- Методы для работы с историей лотереи ---
    saveDrawToHistory: async (drawData) => {
        try {
            // Сериализуем и записываем данные тиража лотереи в таблицу lottery_history
            await global.pool.query(
                'INSERT INTO lottery_history (draw_data) VALUES ($1::jsonb)',
                [JSON.stringify(drawData)]
            );
        } catch (err) {
            console.error("[Postgres Lottery Error] Failed to save draw history:", err.message);
        }
    },

    getLotteryHistory: async (limit = 20) => {
        try {
            // Запрашиваем последние N тиражей из таблицы PostgreSQL, сортируя по id по убыванию
            const res = await global.pool.query(
                'SELECT draw_data FROM lottery_history ORDER BY id DESC LIMIT $1',
                [limit]
            );

            return res.rows.map(r => {
                // Если драйвер возвращает jsonb сразу как объект, отдаем его, иначе парсим строку
                return typeof r.draw_data === 'string' ? JSON.parse(r.draw_data) : r.draw_data;
            });
        } catch (err) {
            console.error("[Postgres Lottery Error] Failed to fetch lottery history:", err.message);
            return [];
        }
    }
};



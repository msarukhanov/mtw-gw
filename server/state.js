const crypto = require('crypto');
const seamless = require('./services/seamlessService');

const pool = global.pool;

global.activePlayerSessions = {};

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

const getTimeString = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

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
                    if (platformData && platformData.balance !== undefined) initialBalance = Number(platformData.balance);
                } catch (err) {
                    console.error(`[Postgres B2B] Failed platform balance sync:`, err.message);
                }
            }

            // Больше не вставляем пустой массив в поле history, оно нам не нужно
            const insertRes = await global.pool.query(
                `INSERT INTO players (username, partner_id, balance, daily_quests, used_promos, tournament_points) 
                 VALUES ($1, $2, $3, '{"gamesPlayed": 0, "claimed": false}'::jsonb, '{}'::jsonb, 0) RETURNING *`,
                [username, partnerId, initialBalance]
            );
            player = insertRes.rows[0];
        }

        player.dailyQuests = typeof player.daily_quests === 'string' ? JSON.parse(player.daily_quests) : player.daily_quests;
        player.usedPromos = typeof player.used_promos === 'string' ? JSON.parse(player.used_promos) : player.used_promos;
        player.tournamentPoints = Number(player.tournament_points);

        // Заглушка для совместимости: если где-то на фронте жестко ожидается player.history
        player.history = [];

        const memKey = `${partnerId}_${username}`;
        if (!activeTickets[memKey]) activeTickets[memKey] = [];
        player.tickets = activeTickets[memKey];

        return player;
    },

    updateBalance: async (username, partnerId, newBalance) => {
        if (global.io) {
            global.io.to(`${partnerId}_${username}`).emit('wallet_update', { balance: newBalance });
        }
        return await global.pool.query(
            'UPDATE players SET balance = $1 WHERE username = $2 AND partner_id = $3',
            [Number(newBalance), username, partnerId]
        );
    },

    // Вспомогательный метод для форматирования времени (как было у тебя, если нужно для описания)
    savePlayerActionHistory: async (username, partnerId, actionData) => {
        // 1. Извлекаем игрока (убрали из выборки обработку истории внутри JS)
        const playerRes = await global.pool.query(
            'SELECT * FROM players WHERE username = $1 AND partner_id = $2 LIMIT 1',
            [username, partnerId]
        );
        if (playerRes.rowCount === 0) return;

        const player = playerRes.rows[0];
        let dailyQuests = typeof player.daily_quests === 'string' ? JSON.parse(player.daily_quests) : (player.daily_quests || { gamesPlayed: 0, claimed: false });
        let xp = Number(player.xp || 0);
        let level = Number(player.level || 1);
        let tournamentPoints = Number(player.tournament_points || 0);
        let currentBalance = Number(player.balance || 0);

        // --- ПАРСИНГ И ЗАПИСЬ СТАВКИ ---
        const category = actionData.category || 'casino'; // 'casino' или 'sport'
        let referenceId = null;
        let amountChange = 0;
        let description = actionData.details || `Game action in ${actionData.game || 'Casino'}`;

        if (category === 'sport') {
            // Если ставка спортивная — данные уже должны быть в sports_bets, берем её ID или создаем запись здесь, если это логгер ставок
            // Для примера: если actionData передает готовую ставку, регистрируем в sports_bets
            if (actionData.isNewBet) {
                const sbRes = await global.pool.query(
                    `INSERT INTO sports_bets (username, partner_id, type, items, total_odds, stake, status, prize)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
                    [username, partnerId, actionData.type || 'single', JSON.stringify(actionData.items || []), actionData.total_odds || 1.0, actionData.stake || 0, actionData.status || 'PENDING', actionData.prize || 0]
                );
                referenceId = sbRes.rows[0].id;
                amountChange = actionData.win ? Number(actionData.prize) : -Number(actionData.stake);
            }
        } else {
            // Дефолтная логика — Казино ставка
            const stake = Number(actionData.stake || 0);
            const prize = Number(actionData.prize || 0);
            const status = actionData.win ? 'WIN' : 'LOSE';
            amountChange = actionData.win ? prize : -stake;
            description = `Ставка в игре ${actionData.game || 'Казино'}. Изменение: ${amountChange} 🪙`;

            const cbRes = await global.pool.query(
                `INSERT INTO casino_bets (username, partner_id, game_id, provider, session_id, stake, prize, status)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
                [username, partnerId, actionData.game || 'unknown', actionData.provider || 'unknown', actionData.sessionId || null, stake, prize, status]
            );
            referenceId = cbRes.rows[0].id;
        }

        // Записываем это действие в единую ленту истории player_history
        await global.pool.query(
            `INSERT INTO player_history (username, partner_id, category, action_type, description, amount_change, reference_id)
             VALUES ($1, $2, $3, 'bet', $4, $5, $6)`,
            [username, partnerId, category, description, amountChange, referenceId]
        );


        // 2. БЕЗОПАСНАЯ B2B ГЕЙМИФИКАЦИЯ (Твоя логика без изменений)
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
                const creditResult = await walletService.credit(username, partnerId, actionData.sessionId || null, Number(gConfig.levelUpBonus), "VIP Level Up Reward", lvlRoundId);
                if (creditResult && creditResult.balance !== undefined) currentBalance = Number(creditResult.balance);

                // Системный лог уровня в историю
                await global.pool.query(
                    `INSERT INTO player_history (username, partner_id, category, action_type, description, amount_change)
                     VALUES ($1, $2, 'system', 'level_up', $3, $4)`,
                    [username, partnerId, `Получен новый уровень: ${level}! 🎉`, Number(gConfig.levelUpBonus)]
                );
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
                    const creditResult = await walletService.credit(username, partnerId, actionData.sessionId || null, Number(gConfig.questReward), "Daily Quest Reward", questRoundId);
                    if (creditResult && creditResult.balance !== undefined) currentBalance = Number(creditResult.balance);

                    // Системный лог квеста в историю
                    await global.pool.query(
                        `INSERT INTO player_history (username, partner_id, category, action_type, description, amount_change)
                         VALUES ($1, $2, 'system', 'quest', $3, $4)`,
                        [username, partnerId, `Выполнен ежедневный квест! 📅`, Number(gConfig.questReward)]
                    );
                } catch (err) {
                    console.error(`❌ Ошибка выплаты за квест игроку ${username}:`, err.message);
                    dailyQuests.claimed = false;
                }
            }
        }

        // --- Начисляем Очки Турнира ---
        if (Number(gConfig.tournamentActive) === 1) {
            tournamentPoints += actionData.win ? 5 : 1;
        }

        // 3. Сохраняем обновленные данные игрока (без поля history!)
        await global.pool.query(
            `UPDATE players 
             SET xp = $1, 
                 level = $2, 
                 daily_quests = $3::jsonb, 
                 tournament_points = $4,
                 balance = $5
             WHERE username = $6 AND partner_id = $7`,
            [xp, level, JSON.stringify(dailyQuests), tournamentPoints, currentBalance, username, partnerId]
        );
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
            Math.floor(totalPrize * 0.20),  // 3 место
        ];

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
                    const creditResult = await walletService.credit(player.username, partnerId, null, prizeWon, `Tournament Place ${i + 1}`, tournamentRoundId);

                    player.balance = creditResult && creditResult.balance !== undefined
                        ? Number(creditResult.balance)
                        : Number(player.balance) + prizeWon;

                    winnersInfo.push({ username: player.username, place: i + 1, points: Number(player.tournament_points), prize: prizeWon });
                } catch (err) {
                    console.error(`❌ Tournament payout failed for ${player.username}:`, err.message);
                }
            }

            const description = `Турнир завершен. Очки: ${player.tournament_points}. Место: ${i + 1}. Награда: ${prizeWon > 0 ? `+${prizeWon} 🪙` : '0 🪙'}`;

            // Пишем системное событие окончания турнира в новую таблицу истории
            await global.pool.query(
                `INSERT INTO player_history (username, partner_id, category, action_type, description, amount_change)
                 VALUES ($1, $2, 'system', 'tournament_end', $3, $4)`,
                [player.username, partnerId, description, prizeWon]
            );

            // Сбрасываем очки турнира игроку
            await global.pool.query(
                `UPDATE players SET tournament_points = 0, balance = $1 WHERE username = $2 AND partner_id = $3`,
                [Number(player.balance), player.username, partnerId]
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

const backOfficeMethods = {
    getBetHistory: async (filters = {}) => {
        const { username, partnerId, category, status, fromDate, toDate, limit = 20, page = 1 } = filters;
        const offset = (page - 1) * limit;

        const tableName = category === 'sport' ? 'sports_bets' : 'casino_bets';

        let queryText = `SELECT *, '${category}' as category FROM ${tableName} WHERE 1=1`;
        let countQuery = `SELECT COUNT(*)::int as count, SUM(stake)::numeric as total_stake, SUM(prize)::numeric as total_prize FROM ${tableName} WHERE 1=1`;

        let queryParams = [];
        let paramIndex = 1;

        // --- ДИНАМИЧЕСКИЕ ФИЛЬТРЫ (Подходят для обоих запросов) ---
        let filterConditions = '';

        if (username) {
            filterConditions += ` AND username = $${paramIndex}`;
            queryParams.push(username);
            paramIndex++;
        }
        if (partnerId) {
            filterConditions += ` AND partner_id = $${paramIndex}`;
            queryParams.push(partnerId);
            paramIndex++;
        }
        if (status) {
            filterConditions += ` AND status = $${paramIndex}`;
            queryParams.push(status);
            paramIndex++;
        }
        if (fromDate) {
            filterConditions += ` AND timestamp >= $${paramIndex}`;
            queryParams.push(fromDate);
            paramIndex++;
        }
        if (toDate) {
            filterConditions += ` AND timestamp <= $${paramIndex}`;
            queryParams.push(toDate);
            paramIndex++;
        }

        // 1. Сначала считаем общие финансовые метрики по фильтрам (до лимитов пагинации)
        const metricsRes = await global.pool.query(countQuery + filterConditions, queryParams);
        const metricsRow = metricsRes.rows[0] || {};

        const totalItems = parseInt(metricsRow.count || 0, 10);
        const totalStake = Number(metricsRow.total_stake || 0);
        const totalPrize = Number(metricsRow.total_prize || 0);
        const ggr = totalStake - totalPrize;

        // 2. Добавляем сортировку и лимиты к основному запросу получения строк
        queryText += filterConditions + ` ORDER BY timestamp DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        queryParams.push(limit, offset);

        const res = await global.pool.query(queryText, queryParams);

        return {
            items: res.rows,
            metrics: {
                totalStake,
                totalPrize,
                ggr,
                marginPercentage: totalStake > 0 ? ((ggr / totalStake) * 100).toFixed(2) + '%' : '0%'
            },
            pagination: {
                page,
                limit,
                totalItems,
                totalPages: Math.ceil(totalItems / limit)
            }
        };
    },


    getPlayerUnifiedHistory: async (filters = {}) => {
        const { username, partnerId, category, type, fromDate, toDate, limit = 15, page = 1 } = filters;
        const offset = (page - 1) * limit;

        let queryText = `SELECT id, category, action_type, description, amount_change, timestamp 
                         FROM player_history 
                         WHERE username = $1 AND partner_id = $2`;

        let countQuery = `SELECT COUNT(*)::int as count FROM player_history WHERE username = $1 AND partner_id = $2`;

        let queryParams = [username, partnerId];
        let paramIndex = 3;

        // --- ДОПОЛНИТЕЛЬНЫЕ ФИЛЬТРЫ ---

        // 1. Фильтр по категории ('casino', 'sport', 'system')
        if (category) {
            const cond = ` AND category = $${paramIndex}`;
            queryText += cond; countQuery += cond;
            queryParams.push(category);
            paramIndex++;
        }

        // 2. Фильтр по типу исхода ('win' - только плюсовые, 'lose' - только минусовые)
        if (type) {
            let cond = '';
            if (type === 'win') {
                cond = ` AND amount_change > 0`;
            } else if (type === 'lose') {
                cond = ` AND amount_change < 0`;
            }
            queryText += cond;
            countQuery += cond;
        }

        // 3. Фильтр по начальной дате
        if (fromDate) {
            const cond = ` AND timestamp >= $${paramIndex}`;
            queryText += cond; countQuery += cond;
            queryParams.push(fromDate);
            paramIndex++;
        }

        // 4. Фильтр по конечной дате
        if (toDate) {
            const cond = ` AND timestamp <= $${paramIndex}`;
            queryText += cond; countQuery += cond;
            queryParams.push(toDate);
            paramIndex++;
        }

        // Сначала считаем общее количество с учетом ВСЕХ фильтров
        const countRes = await global.pool.query(countQuery, queryParams);
        const totalItems = countRes.rows[0]?.count || 0;

        // Добавляем сортировку и пагинацию к основному запросу
        queryText += ` ORDER BY timestamp DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        queryParams.push(limit, offset);

        const res = await global.pool.query(queryText, queryParams);

        return {
            items: res.rows,
            pagination: {
                page,
                limit,
                totalItems,
                totalPages: Math.ceil(totalItems / limit)
            }
        };
    },

    getFinanceDashboardMetrics: async (partnerId, filters = {}) => {
        let { fromDate, toDate } = filters;
        let queryConditions = ` WHERE partner_id = $1`;
        let queryParams = [partnerId];
        let paramIndex = 2;

        if (fromDate) {
            queryConditions += ` AND timestamp >= $${paramIndex}`;
            queryParams.push(fromDate);
            paramIndex++;
        }
        if (toDate) {
            queryConditions += ` AND timestamp <= $${paramIndex}`;
            queryParams.push(toDate);
            paramIndex++;
        }

        const metricsQuery = `
        SELECT 
            COUNT(*)::int as tx_count,
            COALESCE(SUM(CASE WHEN type = 'DEBIT' AND game NOT SIMILAR TO '%(Deposit|Withdraw|Promo|Cashback|Quest|VIP)%' THEN amount ELSE 0 END), 0)::numeric as total_bets,
            COALESCE(SUM(CASE WHEN type = 'CREDIT' AND game NOT SIMILAR TO '%(Deposit|Withdraw|Promo|Cashback|Quest|VIP)%' THEN amount ELSE 0 END), 0)::numeric as total_wins,
            COALESCE(SUM(CASE WHEN type = 'AFFILIATE' THEN amount ELSE 0 END), 0)::numeric as total_affiliate,
            COALESCE(SUM(CASE WHEN game LIKE '%Deposit%' THEN amount ELSE 0 END), 0)::numeric as total_deposits,
            COALESCE(SUM(CASE WHEN game LIKE '%Withdraw%' THEN amount ELSE 0 END), 0)::numeric as total_withdraws
        FROM accounting_logs
        ${queryConditions}
    `;

        const metricsRes = await global.pool.query(metricsQuery, queryParams);
        const metrics = metricsRes.rows[0] || {};

        const totalBets = Number(metrics.total_bets || 0);
        const totalWins = Number(metrics.total_wins || 0);
        const totalAffiliate = Number(metrics.total_affiliate || 0);
        const totalDeposits = Number(metrics.total_deposits || 0);
        const totalWithdraws = Number(metrics.total_withdraws || 0);

        const ggr = totalBets - totalWins;

        return {
            totalBets,
            totalWins,
            totalAffiliate,
            totalDeposits,
            totalWithdraws,
            ggr,
            netProfit: ggr - totalAffiliate,
            transactionsCount: metrics.tx_count || 0
        };
    },

    getFinancialReport: async (partnerId, filters = {}) => {
        let { fromDate, toDate, txType, limit = 20, page = 1 } = filters;
        const offset = (page - 1) * limit;

        let queryConditions = ` WHERE partner_id = $1`;
        let queryParams = [partnerId];
        let paramIndex = 2;

        if (fromDate) { queryConditions += ` AND timestamp >= $${paramIndex}`; queryParams.push(fromDate); paramIndex++; }
        if (toDate) { queryConditions += ` AND timestamp <= $${paramIndex}`; queryParams.push(toDate); paramIndex++; }

        let txTypeCondition = '';
        const systemKeywords = 'Promo|Cashback|Quest|VIP|Deposit|Withdraw';
        if (txType === 'affiliate') txTypeCondition = ` AND type = 'AFFILIATE'`;
        else if (txType === 'deposits') txTypeCondition = ` AND (game SIMILAR TO '%(Deposit|Withdraw)%')`;
        else if (txType === 'bonuses') txTypeCondition = ` AND (game SIMILAR TO '%(Promo|Cashback|Quest|VIP)%')`;
        else txTypeCondition = ` AND (type = 'AFFILIATE' OR game SIMILAR TO '%(${systemKeywords})%')`;

        // Запрос количества страниц
        const countQuery = `SELECT COUNT(*)::int as count FROM accounting_logs ${queryConditions} ${txTypeCondition}`;
        const countRes = await global.pool.query(countQuery, queryParams);
        const totalItems = countRes.rows[0]?.count || 0;

        // Основной запрос строк таблицы
        const txsQuery = `
            SELECT username, type, amount::numeric, game, EXTRACT(EPOCH FROM timestamp) * 1000 as ts
            FROM accounting_logs
            ${queryConditions} ${txTypeCondition}
            ORDER BY timestamp DESC
            LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
        `;
        queryParams.push(limit, offset);
        const txsRes = await global.pool.query(txsQuery, queryParams);

        return {
            items: txsRes.rows,
            pagination: { page, limit, totalItems, totalPages: Math.ceil(totalItems / limit) }
        };
    },

    getFinancialReport222: async (partnerId, filters = {}) => {
        let { fromDate, toDate } = filters;

        // Базовые условия для фильтрации по партнеру
        let queryConditions = ` WHERE partner_id = $1`;
        let queryParams = [partnerId];
        let paramIndex = 2;

        // Добавляем фильтр по датам, если они переданы
        if (fromDate) {
            if (!fromDate.includes('T')) fromDate += ' 00:00:00';
            queryConditions += ` AND timestamp >= $${paramIndex}`;
            queryParams.push(fromDate);
            paramIndex++;
        }
        if (toDate) {
            if (!toDate.includes('T')) toDate += ' 23:59:59';
            queryConditions += ` AND timestamp <= $${paramIndex}`;
            queryParams.push(toDate);
            paramIndex++;
        }

        // 1. 📊 ПОДСЧЕТ МЕТРИК НА СТОРОНЕ PostgreSQL (Отработает мгновенно)
        // 1. 📊 ПОДСЧЕТ ВСЕХ МЕТРИК НА СТОРОНЕ PostgreSQL (Добавлен Cashflow)
        const metricsQuery = `
            SELECT 
                COUNT(*)::int as tx_count,
                COALESCE(SUM(CASE WHEN type = 'DEBIT' AND game NOT SIMILAR TO '%(Deposit|Withdraw|Promo|Cashback|Quest|VIP)%' THEN amount ELSE 0 END), 0)::numeric as total_bets,
                COALESCE(SUM(CASE WHEN type = 'CREDIT' AND game NOT SIMILAR TO '%(Deposit|Withdraw|Promo|Cashback|Quest|VIP)%' THEN amount ELSE 0 END), 0)::numeric as total_wins,
                COALESCE(SUM(CASE WHEN type = 'AFFILIATE' THEN amount ELSE 0 END), 0)::numeric as total_affiliate,
                COALESCE(SUM(CASE WHEN game LIKE '%Deposit%' THEN amount ELSE 0 END), 0)::numeric as total_deposits,
                COALESCE(SUM(CASE WHEN game LIKE '%Withdraw%' THEN amount ELSE 0 END), 0)::numeric as total_withdraws
            FROM accounting_logs
            ${queryConditions}
        `;

        const metricsRes = await global.pool.query(metricsQuery, queryParams);
        const metrics = metricsRes.rows[0] || {}; // Берем первую строку результата

        const totalBets = Number(metrics.total_bets || 0);
        const totalWins = Number(metrics.total_wins || 0);
        const totalAffiliate = Number(metrics.total_affiliate || 0);
        const totalDeposits = Number(metrics.total_deposits || 0);
        const totalWithdraws = Number(metrics.total_withdraws || 0);

        const ggr = totalBets - totalWins;
        const netProfit = ggr - totalAffiliate;

        // Добавь 'totalDeposits' и 'totalWithdraws' в итоговый возвращаемый объект:



        // Список исключений для ставок (используем POSIX регулярное выражение в Postgres вместо JS .includes)
        const systemKeywords = 'Promo|Cashback|Quest|VIP|Deposit|Withdraw';

        // 2. 🎰 ЛОГ СТАВОК (Берем строго последние 50 штук из БД)
        const betsQuery = `
            SELECT username, type, amount::numeric, game, EXTRACT(EPOCH FROM timestamp) * 1000 as ts
            FROM accounting_logs
            ${queryConditions} 
              AND type IN ('DEBIT', 'CREDIT')
              AND (game IS NULL OR game NOT SIMILAR TO '%(${systemKeywords})%')
            ORDER BY timestamp DESC
            LIMIT 50
        `;
        const betsRes = await global.pool.query(betsQuery, queryParams);
        const latestBets = betsRes.rows.map(tx => ({
            partnerId,
            username: tx.username,
            type: tx.type,
            amount: Number(tx.amount),
            game: tx.game,
            timestamp: Number(tx.ts)
        }));

        // 3. 💳 ЛОГ КАССЫ / СИСТЕМНЫХ ТРАНЗАКЦИЙ (Берем строго последние 50 штук)
        const txType = filters.txType || 'all'; // 'all', 'affiliate', 'deposits', 'bonuses'
        let txTypeCondition = '';

        if (txType === 'affiliate') {
            txTypeCondition = ` AND type = 'AFFILIATE'`;
        } else if (txType === 'deposits') {
            txTypeCondition = ` AND (game SIMILAR TO '%(Deposit|Withdraw)%')`;
        } else if (txType === 'bonuses') {
            txTypeCondition = ` AND (game SIMILAR TO '%(Promo|Cashback|Quest|VIP)%')`;
        } else {
            // 'all' — старая дефолтная логика (все системные и кассовые транзакции)
            txTypeCondition = ` AND (type = 'AFFILIATE' OR game SIMILAR TO '%(${systemKeywords})%')`;
        }

        const txsQuery = `
            SELECT username, type, amount::numeric, game, EXTRACT(EPOCH FROM timestamp) * 1000 as ts
            FROM accounting_logs
            ${queryConditions}
            ${txTypeCondition}
            ORDER BY timestamp DESC
            LIMIT 50
        `;

        // Передаем queryParams как и раньше
        const txsRes = await global.pool.query(txsQuery, queryParams);
        const latestTransactions = txsRes.rows.map(tx => ({
            partnerId,
            username: tx.username,
            type: tx.type,
            amount: Number(tx.amount),
            game: tx.game,
            timestamp: Number(tx.ts)
        }));

        // [ДОБАВИТЬ В getFinancialReport] 📈 Запрос для графиков: группировка GGR и Net Profit по дням
        const chartQuery = `
            SELECT 
                TO_CHAR(timestamp, 'YYYY-MM-DD') as date_label,
                COALESCE(SUM(CASE WHEN type = 'DEBIT' THEN amount ELSE 0 END), 0)::numeric as day_bets,
                COALESCE(SUM(CASE WHEN type = 'CREDIT' THEN amount ELSE 0 END), 0)::numeric as day_wins,
                COALESCE(SUM(CASE WHEN type = 'AFFILIATE' THEN amount ELSE 0 END), 0)::numeric as day_affiliate
            FROM accounting_logs
            ${queryConditions}
            GROUP BY DATE(timestamp), TO_CHAR(timestamp, 'YYYY-MM-DD')
            ORDER BY DATE(timestamp) ASC
        `;
        const chartRes = await global.pool.query(chartQuery, queryParams);

        return {
            totalBets,
            totalWins,
            totalAffiliate,
            totalDeposits,
            totalWithdraws,
            ggr,
            netProfit,
            transactionsCount: metrics.tx_count || 0,
            latestTransactions,
            latestBets
        };
        // return {
        //     totalBets,
        //     totalWins,
        //     totalAffiliate,
        //     ggr,
        //     netProfit,
        //     transactionsCount: metrics.tx_count,
        //     latestTransactions,
        //     latestBets
        // };
    },

    getChartAnalytics: async (partnerId) => {
        const chartQuery = `
            SELECT 
                TO_CHAR(series_date, 'YYYY-MM-DD') as date_label,
                COALESCE(SUM(CASE WHEN al.type = 'DEBIT' AND al.game NOT SIMILAR TO '%(Deposit|Withdraw|Promo|Cashback|Quest|VIP)%' THEN al.amount ELSE 0 END), 0)::numeric as day_bets,
                COALESCE(SUM(CASE WHEN al.type = 'CREDIT' AND al.game NOT SIMILAR TO '%(Deposit|Withdraw|Promo|Cashback|Quest|VIP)%' THEN al.amount ELSE 0 END), 0)::numeric as day_wins,
                COALESCE(SUM(CASE WHEN al.type = 'AFFILIATE' THEN al.amount ELSE 0 END), 0)::numeric as day_affiliate,
                COALESCE(SUM(CASE WHEN al.game LIKE '%Deposit%' THEN al.amount ELSE 0 END), 0)::numeric as day_deposits,
                COALESCE(SUM(CASE WHEN al.game LIKE '%Withdraw%' THEN al.amount ELSE 0 END), 0)::numeric as day_withdraws,
                COUNT(CASE WHEN al.type IN ('DEBIT', 'CREDIT') AND al.game NOT SIMILAR TO '%(Deposit|Withdraw|Promo|Cashback|Quest|VIP)%' THEN al.id END)::int as bets_count
            FROM GENERATE_SERIES(CURRENT_DATE - INTERVAL '6 days', CURRENT_DATE, '1 day'::interval) as series_date
            LEFT JOIN accounting_logs al ON al.partner_id = $1 AND DATE(al.timestamp) = DATE(series_date)
            GROUP BY series_date
            ORDER BY series_date ASC
        `;

        const res = await global.pool.query(chartQuery, [partnerId]);

        return res.rows.map(row => {
            const ggr = Number(row.day_bets) - Number(row.day_wins);
            return {
                date: row.date_label,
                ggr: ggr,
                netProfit: ggr - Number(row.day_affiliate),
                deposits: Number(row.day_deposits),
                withdraws: Number(row.day_withdraws),
                betsCount: row.bets_count
            };
        });
    },

    getAdminPlayersList: async (partnerId, filters = {}) => {
        const { search = '', limit = 15, page = 1 } = filters;
        const offset = (page - 1) * limit;

        let queryText = `SELECT id, username, balance, xp, level, tournament_points, is_banned, 
                            casino_min_limit, casino_max_limit, sport_min_limit, sport_max_limit 
                     FROM players WHERE partner_id = $1`;
        let countQuery = `SELECT COUNT(*)::int as count FROM players WHERE partner_id = $1`;
        let queryParams = [partnerId];

        if (search) {
            queryText += ` AND username ILIKE $2`;
            countQuery += ` AND username ILIKE $2`;
            queryParams.push(`%${search}%`);
        }

        const countRes = await global.pool.query(countQuery, queryParams);
        const totalItems = countRes.rows[0]?.count || 0;

        queryText += ` ORDER BY id DESC LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}`;
        queryParams.push(limit, offset);

        const res = await global.pool.query(queryText, queryParams);

        return {
            items: res.rows,
            pagination: { page, limit, totalItems, totalPages: Math.ceil(totalItems / limit) }
        };
    },


    // Метод переключения бана и обновления лимитов
    updatePlayerStatus: async (partnerId, username, data = {}) => {
        const { isBanned, casinoMin, casinoMax, sportMin, sportMax, balance } = data;

        await global.pool.query(
            `UPDATE players 
         SET is_banned = COALESCE($1, is_banned),
             casino_min_limit = CASE WHEN $2 = -1 THEN NULL ELSE COALESCE($2, casino_min_limit) END,
             casino_max_limit = CASE WHEN $3 = -1 THEN NULL ELSE COALESCE($3, casino_max_limit) END,
             sport_min_limit = CASE WHEN $4 = -1 THEN NULL ELSE COALESCE($4, sport_min_limit) END,
             sport_max_limit = CASE WHEN $5 = -1 THEN NULL ELSE COALESCE($5, sport_max_limit) END,
             balance = COALESCE($6, balance)
         WHERE partner_id = $7 AND username = $8`,
            [isBanned, casinoMin, casinoMax, sportMin, sportMax, balance, partnerId, username]
        );
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
        try {
            const { username, isDemo, theme } = data;

            // Генерируем уникальный криптографический токен запуска
            const token = 'gl_' + crypto.randomBytes(24).toString('hex');

            // Сессия автоматически сгорает через 24 часа
            const expiredAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

            const add = await global.pool.query(
                `INSERT INTO game_sessions (token, partner_id, username, game_slug, is_demo, theme, expired_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [token, partnerId, isDemo ? null : username, gameSlug, !!isDemo, theme || 'default', expiredAt]
            );

            return token;
        } catch (e) {}
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
    ...backOfficeMethods,

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



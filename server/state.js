const crypto = require('crypto');
const { URL } = require('url');

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

    getOrCreatePlayer: async (username, partnerId, fetchPlatformBalance = null, domainName = 'localhost') => {
        const client = await global.pool.connect();
        try {
            await client.query('BEGIN');

            // 1. Вытягиваем настройки валют сайта по домену
            const siteRes = await client.query(
                'SELECT id, currency_settings FROM b2b_websites WHERE partner_id = $1 AND domain_name = $2 AND is_active = 1 LIMIT 1',
                [partnerId, domainName.toLowerCase()]
            );

            let curCfg = { supported_currencies: ["USD"], default_currency: "USD" };
            if (siteRes.rowCount > 0 && siteRes.rows[0].currency_settings) {
                curCfg = typeof siteRes.rows[0].currency_settings === 'string'
                    ? JSON.parse(siteRes.rows[0].currency_settings)
                    : siteRes.rows[0].currency_settings;
            }
            const supportedCurrencies = curCfg.supported_currencies || ["USD"];
            const defaultCurrency = curCfg.default_currency || "USD";

            // 2. Ищем игрока в players
            let res = await client.query('SELECT * FROM players WHERE username = $1 AND partner_id = $2 LIMIT 1', [username, partnerId]);
            let player = res.rowCount > 0 ? res.rows[0] : null;

            if (!player) {
                let initialBalance = 0;
                if (typeof fetchPlatformBalance === 'function') {
                    try {
                        const platformData = await fetchPlatformBalance(username, partnerId);
                        if (platformData && platformData.balance !== undefined) initialBalance = Number(platformData.balance);
                    } catch (err) { console.error(`[Postgres B2B] Failed platform balance sync:`, err.message); }
                }

                // Инсертим нового игрока со стартовой валютой по умолчанию для этого домена
                const insertRes = await client.query(
                    `INSERT INTO players (username, partner_id, balance, bonus_balance, wager_total, wager_left, current_currency, daily_quests, used_promos, tournament_points) 
                     VALUES ($1, $2, $3, 0.00, 0.00, 0.00, $4, '{"gamesPlayed": 0, "claimed": false}'::jsonb, '{}'::jsonb, 0) RETURNING *`,
                    [username, partnerId, initialBalance, defaultCurrency]
                );
                player = insertRes.rows[0];
            }

            // 3. 🎯 КРИТИЧЕСКИЙ АВТО-ИНЖЕКТ ПУНКТА 5: Проверяем наличие кошельков из конфига сайта в архиве
            for (const currency of supportedCurrencies) {
                // Пытаемся создать кошелек, если его еще нет (благодаря ON CONFLICT DO NOTHING база не выдаст ошибку)
                const isDefault = (currency === player.current_currency);
                const startBal = isDefault ? Number(player.balance) : 0.00;
                const startBonus = isDefault ? Number(player.bonus_balance) : 0.00;
                const startWager = isDefault ? Number(player.wager_left) : 0.00;

                await client.query(`
                    INSERT INTO player_wallets (partner_id, username, currency, balance, bonus_balance, wager_left)
                    VALUES ($1, $2, $3, $4, $5, $6)
                    ON CONFLICT (partner_id, username, currency) DO NOTHING
                `, [partnerId, username, currency, startBal, startBonus, startWager]);
            }

            await client.query('COMMIT');

            // Парсим стандартные JSONB блоки (остается без изменений)
            player.dailyQuests = typeof player.daily_quests === 'string' ? JSON.parse(player.daily_quests) : player.daily_quests;
            player.usedPromos = typeof player.used_promos === 'string' ? JSON.parse(player.used_promos) : player.used_promos;
            player.tournamentPoints = Number(player.tournament_points);

            player.realBalance = Number(player.balance);
            player.bonusBalance = Number(player.bonus_balance || 0);
            player.wagerLeft = Number(player.wager_left || 0);

            // 💎 ГЛАВНОЕ: Вычисляем суммарный доступный баланс для игры
            player.balance = Number(player.realBalance + player.bonusBalance);

            const unreadCountRes = await client.query(
                `SELECT COUNT(id)::int as count FROM player_notifications WHERE partner_id = $1 AND username = $2 AND is_read = false`,
                [partnerId, player.username]
            );

            const unreadNotifyCount = unreadCountRes.rows ? (unreadCountRes.rows[0]?.count || 0) : 0;
            player.unreadNotifications = unreadNotifyCount;

            const memKey = `${partnerId}_${username}`;
            if (!activeTickets[memKey]) activeTickets[memKey] = [];
            player.tickets = activeTickets[memKey];

            return player;
        } catch (err) {
            await client.query('ROLLBACK');
            console.error("❌ Critical error in multi-wallet getOrCreatePlayer:", err.message);
            throw err;
        } finally { client.release(); }
    },

    logPlayerLoginSuccess: async(partnerId, username, loginType, req) => {
        try {
            // 🔒 ЖЕСТКАЯ ВАЛИДАЦИЯ IP: Извлекаем реальный IP игрока (с учетом Cloudflare/Render прокси) [INDEX]
            const ipAddress = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress || '0.0.0.0';
            const userAgent = req.headers['user-agent'] || 'Unknown Agent';

            // 🔒 ЖЕСТКАЯ ВАЛИДАЦИЯ ДОМЕНА: Извлекаем домен из неизменяемых заголовков браузера [INDEX]
            const originHeader = req.headers.origin || req.headers.referer || '';
            let detectedDomain = 'localhost';

            if (originHeader && originHeader.startsWith('http')) {
                try {
                    const parsedUrl = new URL(originHeader);
                    detectedDomain = parsedUrl.hostname.toLowerCase();
                } catch (e) { /* Игнорируем некорректный URL */ }
            }

            await global.pool.query(
                `INSERT INTO player_auth_logs (partner_id, username, login_type, ip_address, user_agent, domain_name) 
                 VALUES ($1, $2, $3, $4, $5, $6)`,
                [partnerId, username, loginType, ipAddress, userAgent, detectedDomain]
            );
            console.log(`🔒 [Auth Audit] ${username} connected from IP: ${ipAddress} | Domain: ${detectedDomain}`);
        } catch (err) {
            console.error("❌ Failed to write secure auth log node:", err.message);
        }
    },

    // Проверьте, чтобы в вашем файле этот метод выглядел так:
    getOrCreatePlayer222: async (username, partnerId, fetchPlatformBalance = null, domainName = 'localhost') => {
        let res = await global.pool.query('SELECT * FROM players WHERE username = $1 AND partner_id = $2 LIMIT 1', [username, partnerId]);

        let player = res.rowCount > 0 ? res.rows[0] : null;

        const siteRes = await client.query(
            'SELECT id, currency_settings FROM b2b_websites WHERE partner_id = $1 AND domain_name = $2 AND is_active = 1 LIMIT 1',
            [partnerId, domainName.toLowerCase()]
        );

        let curCfg = { supported_currencies: ["USD"], default_currency: "USD" };
        if (siteRes.rowCount > 0 && siteRes.rows[0].currency_settings) {
            curCfg = typeof siteRes.rows[0].currency_settings === 'string'
                ? JSON.parse(siteRes.rows[0].currency_settings)
                : siteRes.rows[0].currency_settings;
        }
        const supportedCurrencies = curCfg.supported_currencies || ["USD"];
        const defaultCurrency = curCfg.default_currency || "USD";

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

            const insertRes = await global.pool.query(
                `INSERT INTO players (username, partner_id, balance, daily_quests, used_promos, tournament_points, bonus_balance, wager_total, wager_left) 
                 VALUES ($1, $2, $3, '{"gamesPlayed": 0, "claimed": false}'::jsonb, '{}'::jsonb, 0, 0.00, 0.00, 0.00) RETURNING *`,
                [username, partnerId, initialBalance]
            );
            player = insertRes.rows[0];
        }

        for (const currency of supportedCurrencies) {
            // Пытаемся создать кошелек, если его еще нет (благодаря ON CONFLICT DO NOTHING база не выдаст ошибку)
            const isDefault = (currency === player.current_currency);
            const startBal = isDefault ? Number(player.balance) : 0.00;
            const startBonus = isDefault ? Number(player.bonus_balance) : 0.00;
            const startWager = isDefault ? Number(player.wager_left) : 0.00;

            await global.pool.query(`
                    INSERT INTO player_wallets (partner_id, username, currency, balance, bonus_balance, wager_left)
                    VALUES ($1, $2, $3, $4, $5, $6)
                    ON CONFLICT (partner_id, username, currency) DO NOTHING
                `, [partnerId, username, currency, startBal, startBonus, startWager]);
        }

        player.dailyQuests = typeof player.daily_quests === 'string' ? JSON.parse(player.daily_quests) : player.daily_quests;
        player.usedPromos = typeof player.used_promos === 'string' ? JSON.parse(player.used_promos) : player.used_promos;
        player.tournamentPoints = Number(player.tournament_points);

        // Читаем новые бонусные поля
        player.realBalance = Number(player.balance);
        player.bonusBalance = Number(player.bonus_balance || 0);
        player.wagerLeft = Number(player.wager_left || 0);

        // 💎 ГЛАВНОЕ: Вычисляем суммарный доступный баланс для игры
        player.balance = Number(player.realBalance + player.bonusBalance);

        player.history = [];

        const unreadCountRes = await global.pool.query(
            `SELECT COUNT(id)::int as count FROM player_notifications WHERE partner_id = $1 AND username = $2 AND is_read = false`,
            [partnerId, player.username]
        );
        const unreadNotifyCount = unreadCountRes.rows[0]?.count || 0;

        const memKey = `${partnerId}_${username}`;
        if (!activeTickets[memKey]) activeTickets[memKey] = [];
        player.tickets = activeTickets[memKey];

        player.unreadNotifications = unreadNotifyCount;

        return player;
    },

    updateBalance: async (username, partnerId, delta = 0) => {
        const client = await global.pool.connect();
        try {
            await client.query('BEGIN');

            if(delta) {
                delta = Number(delta);
            }

            // 1. Блокируем строку игрока и считываем текущее состояние кошельков
            const pRes = await client.query(
                'SELECT balance, bonus_balance, wager_left, current_currency FROM players WHERE username = $1 AND partner_id = $2 FOR UPDATE',
                [username, partnerId]
            );

            if (pRes.rowCount === 0) {
                await client.query('ROLLBACK');
                return null;
            }

            const player = pRes.rows[0];
            const oldReal = Number(player.balance);
            let bonusBalance = Number(player.bonus_balance || 0);
            let wagerLeft = Number(player.wager_left || 0);

            let finalReal = Number(newBalance);

            // Вычисляем дельту изменения: если > 0, это выигрыш/депозит (Credit), если < 0, это ставка (Debit)
            // const delta = finalReal - oldReal;

            if (delta < 0) {
                // --- СЦЕНАРИЙ А: Списание (Debit / Ставка) ---
                const betAmount = Math.abs(delta);

                // Если вейджер активен — уменьшаем его на сумму ставки
                if (wagerLeft > 0) {
                    wagerLeft = Math.max(0, wagerLeft - betAmount);

                    // ТРИГГЕР: Если вейджер откручен в 0 — переносим бонусы в реальный баланс!
                    if (wagerLeft === 0 && bonusBalance > 0) {
                        finalReal += bonusBalance;

                        // Записываем лог разблокировки в player_history
                        await client.query(
                            `INSERT INTO player_history (username, partner_id, category, action_type, description, amount_change)
                             VALUES ($1, $2, 'system', 'wager_unlock', '🎉 Welcome bonus successfully wagered! Funds converted to real balance.', $3)`,
                            [username, partnerId, bonusBalance]
                        );

                        bonusBalance = 0;
                    }
                }

                // [ВСТАВИТЬ В КОНЕЦ МЕТОДА updateBalance ПЕРЕД ТРАНЗАКЦИОННЫМ COMMIT]


                // [ВСТАВИТЬ ВНУТРЬ updateBalance ИМЕННО ВНУТРЬ БЛОКА if (delta < 0) ПОСЛЕ ОБСЛУЖИВАНИЯ ВЕЙДЖЕРА]
                try {
                    const betAmount = Math.abs(delta);

                    // 1. Проверяем, состоит ли игрок в каком-либо клане
                    const memberCheck = await client.query(
                        'SELECT clan_id FROM b2b_clan_members WHERE username = $1 AND partner_id = $2 LIMIT 1',
                        [username, partnerId]
                    );

                    if (memberCheck.rowCount > 0) {
                        const clanId = memberCheck.rows[0].clan_id;

                        // 2. Ищем активный командный квест, у которого не истек срок действия
                        const activeClanQuestRes = await client.query(
                            `SELECT id, target_turnover, reward_pool FROM b2b_clan_quests 
             WHERE partner_id = $1 AND is_active = 1 AND expires_at > NOW() LIMIT 1`,
                            [partnerId]
                        );

                        if (activeClanQuestRes.rowCount > 0) {
                            const clanQuest = activeClanQuestRes.rows[0];

                            // 3. Атомарно обновляем оборот клана в таблице прогресса (Upsert)
                            await client.query(`
                                INSERT INTO b2b_clan_quest_progress (clan_id, quest_id, current_turnover)
                                VALUES ($1, $2, $3)
                                ON CONFLICT (clan_id, quest_id)
                                DO UPDATE SET 
                                    current_turnover = CASE 
                                        WHEN b2b_clan_quest_progress.is_completed = false THEN b2b_clan_quest_progress.current_turnover + EXCLUDED.current_turnover
                                        ELSE b2b_clan_quest_progress.current_turnover
                                    END
                            `, [clanId, clanQuest.id, betAmount]);

                            // 4. ТРИГГЕР: Проверяем, выполнил ли клан цель по обороту прямо сейчас?
                            const checkClanProgress = await client.query(
                                'SELECT current_turnover, is_completed FROM b2b_clan_quest_progress WHERE clan_id = $1 AND quest_id = $2 FOR UPDATE',
                                [clanId, clanQuest.id]
                            );

                            const progress = checkClanProgress.rows[0];
                            if (Number(progress.current_turnover) >= Number(clanQuest.target_turnover) && !progress.is_completed) {

                                // Помечаем квест клана как выполненный
                                await client.query(
                                    'UPDATE b2b_clan_quest_progress SET is_completed = true WHERE clan_id = $1 AND quest_id = $2',
                                    [clanId, clanQuest.id]
                                );

                                // Начисляем Клан-XP за успешное выполнение ретеншн-цели
                                await client.query('UPDATE b2b_clans SET clan_xp = clan_xp + 500 WHERE id = $1', [clanId]);

                                // 💰РАСПРЕДЕЛЕНИЕ ПРИЗОВОГО ФОНДА (МЕТОД МГНОВЕННОЙ ВЫПЛАТЫ ВСЕМ ЧЛЕНАМ КЛАНА)
                                // Вытягиваем всех участников этого клана
                                const membersRes = await client.query('SELECT username FROM b2b_clan_members WHERE clan_id = $1', [clanId]);
                                const membersCount = membersRes.rowCount;

                                if (membersCount > 0) {
                                    // Делим общий призовой фонд поровну между всеми участниками гильдии
                                    const shareReward = Math.floor(Number(clanQuest.reward_pool) / membersCount);
                                    const walletService = seamless || require('./services/seamlessService');

                                    for (const member of membersRes.rows) {
                                        try {
                                            const clanRoundId = `cln_rw_${crypto.randomBytes(6).toString('hex')}`;
                                            // Начисляем коины на внешнюю витрину партнера через seamless шлюз credit
                                            await walletService.credit(member.username, partnerId, null, shareReward, `Guild Quest Victory: ${clanQuest.title}`, clanRoundId);

                                            // Пишем лог в личную историю активности игрока player_history
                                            await client.query(
                                                `INSERT INTO player_history (username, partner_id, category, action_type, description, amount_change)
                                 VALUES ($1, $2, 'system', 'clan_reward', $3, $4)`,
                                                [member.username, partnerId, `🏆 Your Guild completed the quest "${clanQuest.title}"! Your split reward share.`, shareReward]
                                            );
                                        } catch (payoutErr) {
                                            console.error(`❌ Не удалось начислить долю кланового приза игроку ${member.username}:`, payoutErr.message);
                                        }
                                    }
                                }
                            }
                        }
                    }
                } catch (clnErr) {
                    console.error("❌ Guild turnover increment sequence crashed:", clnErr.message);
                }

                try {
                    const betAmount = Math.abs(delta);

                    // 1. Вытягиваем все активные уровни джекпота партнера с жесткой блокировкой строки FOR UPDATE
                    const jackpotsRes = await client.query(
                        'SELECT id, level_name, current_amount::numeric, trigger_amount::numeric, start_amount::numeric, fee_percent::numeric FROM b2b_jackpots WHERE partner_id = $1 AND is_active = 1 FOR UPDATE',
                        [partnerId]
                    );

                    // 🧠 УМНЫЙ B2B ХАК: Если партнер отключил все джекпоты, rows придет пустым!
                    // Мы просто молча выходим из блока, сохраняя 100% ставки в профит казино [INDEX].
                    if (jackpotsRes.rowCount > 0) {
                        for (const jk of jackpotsRes.rows) {
                            // Вычисляем, сколько коинов от этой ставки улетает в данный уровень джекпота
                            const contribution = (betAmount * Number(jk.fee_percent)) / 100;
                            const nextAmount = Number(jk.current_amount) + contribution;

                            // 2. Проверяем: Перешагнула ли накопленная сумма скрытый триггер взрыва?
                            if (nextAmount >= Number(jk.trigger_amount)) {
                                console.log(`👑 [JACKPOT EXPLOSION] Игрок ${username} сорвал ${jk.level_name} ДЖЕКПОТ! Сумма: ${nextAmount.toFixed(2)} коинов!`);

                                // А. Зачисляем всю сумму джекпота на РЕАЛЬНЫЙ БАЛАНС игрока прямо внутри текущей транзакции!
                                finalReal += nextAmount;

                                // Б. Генерируем новый случайный скрытый порог взрыва для следующего круга джекпота
                                let nextTrigger = Number(jk.start_amount) * 4; // Базовое смещение
                                if (jk.level_name === 'MINI') nextTrigger = Math.floor(Math.random() * (500 - 300 + 1)) + 300;
                                else if (jk.level_name === 'MAJOR') nextTrigger = Math.floor(Math.random() * (5000 - 3500 + 1)) + 3500;
                                else if (jk.level_name === 'MEGA') nextTrigger = Math.floor(Math.random() * (50000 - 38000 + 1)) + 38000;

                                // В. Сбрасываем джекпот в базе данных на начальную сумму (Seed) и прописываем новый триггер
                                await client.query(
                                    `UPDATE b2b_jackpots 
                 SET current_amount = start_amount, trigger_amount = $1 
                 WHERE id = $2`,
                                    [nextTrigger, jk.id]
                                );

                                // Г. Записываем триумф в player_history и отправляем личное системное уведомление игроку
                                await client.query(
                                    `INSERT INTO player_history (username, partner_id, category, action_type, description, amount_change)
                 VALUES ($1, $2, 'system', 'jackpot_win', $3, $4)`,
                                    [username, partnerId, `🏆 EPIC WIN! You have triggered the global ${jk.level_name} JACKPOT bank!`, nextAmount]
                                );

                                const state = this || require('./state'); // Вызов нашего хаба уведомлений
                                if (typeof state.sendNotification === 'function') {
                                    await state.sendNotification(partnerId, username, 'TOURNAMENT', `👑 EPIC COIN DROP! You just won the global ${jk.level_name} Jackpot of ${nextAmount.toFixed(2)} 🪙!`);
                                }

                                // Д. Выстреливаем глобальное Socket.io событие на ВЕСЬ ДОМЕН, чтобы у ВСЕХ онлайн-игроков на экране взорвался салют!
                                if (global.io) {
                                    const safeDomainString = player.current_currency; // Используем доменную комнату
                                    global.io.emit('global_jackpot_win', {
                                        username: username,
                                        level: jk.level_name,
                                        amount: nextAmount
                                    });
                                }

                            } else {
                                // Если взрыва не произошло — просто атомарно увеличиваем сумму джекпота в базе данных
                                await client.query(
                                    'UPDATE b2b_jackpots SET current_amount = current_amount + $1 WHERE id = $2',
                                    [contribution, jk.id]
                                );
                            }
                        }
                    }
                } catch (jkErr) {
                    console.error("❌ Progressive Jackpot increment loop crashed:", jkErr.message);
                }
            }
            else if (delta > 0 && wagerLeft > 0) {
                // --- СЦЕНАРИЙ Б: Начисление при активном вейджере (Credit / Выигрыш) ---
                // Так как вейджер еще не откручен, выигрыш не должен идти в реал!
                // Отменяем изменение реального баланса и перенаправляем весь выигрыш в бонусы
                finalReal = oldReal;
                bonusBalance += delta;
            }

            // 2. Делаем ОДИН единственный и финальный UPDATE в базу данных
            // 1. Сначала обновляем "горячий кэш" в таблице игроков (остается твой запрос)
            const updateRes = await client.query(
                `UPDATE players 
                 SET balance = $1, bonus_balance = $2, wager_left = $3 
                 WHERE username = $4 AND partner_id = $5 
                 RETURNING *`,
                [finalReal, bonusBalance, wagerLeft, username, partnerId]
            );

            // 2. 🎯 ВАЖНЕЙШЕЕ ИСПРАВЛЕНИЕ: Синхронизируем измененные балансы с реляционным архивом!
            // Записываем новые значения реала, бонуса и вейджера строго для текущей активной валюты игрока [INDEX].
            // Благодаря ON CONFLICT, если кошелька вдруг не было, база его создаст, исключая любые баги [INDEX].
            await client.query(`
                INSERT INTO player_wallets (partner_id, username, currency, balance, bonus_balance, wager_left)
                VALUES ($1, $2, $3, $4, $5, $6)
                ON CONFLICT (partner_id, username, currency) 
                DO UPDATE SET 
                    balance = EXCLUDED.balance, 
                    bonus_balance = EXCLUDED.bonus_balance, 
                    wager_left = EXCLUDED.wager_left
            `, [partnerId, username, player.current_currency, finalReal, bonusBalance, wagerLeft]);

            if(delta !== 0) {
                try {
                    const actionStake = Math.abs(delta); // Сумма ставки (если delta < 0)
                    const actionWin = delta > 0 ? delta : 0; // Сумма выигрыша (если delta > 0)

                    // Вычисляем коэффициент выигрыша (multiplier), если это был credit
                    let winMultiplier = 0;
                    if (actionWin > 0 && actionStake > 0) {
                        winMultiplier = actionWin / actionStake;
                    }

                    // Извлекаем все активные шаблоны ачивок партнера
                    const activeAchRes = await client.query(
                        'SELECT * FROM b2b_achievements WHERE partner_id = $1 AND is_active = 1',
                        [partnerId]
                    );

                    for (const ach of activeAchRes.rows) {
                        let increment = 0;
                        let isDirectSet = false;
                        let newValue = 0;

                        // Определяем математику прогресса в зависимости от типа достижения
                        if (ach.condition_type === 'TOTAL_GAMES' && delta < 0) {
                            increment = 1; // +1 сыгранная игра при дебите
                        }
                        else if (ach.condition_type === 'TOTAL_TURNOVER' && delta < 0) {
                            increment = actionStake; // +сумма ставки в общий оборот
                        }
                        else if (ach.condition_type === 'BIG_WIN_SINGLE' && actionWin > 0) {
                            // Для рекордов проверяем: побит ли текущий максимум сингл-выигрыша
                            isDirectSet = true;
                            newValue = actionWin;
                        }
                        else if (ach.condition_type === 'MAX_WIN_MULTIPLIER' && winMultiplier > 0) {
                            // Для рекордов проверяем: побит ли максимальный икс
                            isDirectSet = true;
                            newValue = winMultiplier;
                        }

                        if (increment > 0 || isDirectSet) {
                            if (isDirectSet) {
                                // Логика обновления рекордов (обновляем только если новый икс/вин больше старого)
                                await client.query(`
                    INSERT INTO player_achievements (partner_id, username, achievement_id, current_value)
                    VALUES ($1, $2, $3, $4)
                    ON CONFLICT (partner_id, username, achievement_id)
                    DO UPDATE SET 
                        current_value = CASE 
                            WHEN player_achievements.is_unlocked = false AND EXCLUDED.current_value > player_achievements.current_value THEN EXCLUDED.current_value
                            ELSE player_achievements.current_value
                        END
                `, [partnerId, username, ach.id, newValue]);
                            } else {
                                // Логика накопительного прогресса (плюсуем игры и оборот)
                                await client.query(`
                    INSERT INTO player_achievements (partner_id, username, achievement_id, current_value)
                    VALUES ($1, $2, $3, $4)
                    ON CONFLICT (partner_id, username, achievement_id)
                    DO UPDATE SET 
                        current_value = CASE 
                            WHEN player_achievements.is_unlocked = false THEN player_achievements.current_value + EXCLUDED.current_value
                            ELSE player_achievements.current_value
                        END
                `, [partnerId, username, ach.id, increment]);
                            }

                            // --- ТРИГГЕР ДЕБЛОКИРОВКИ ДОСТИЖЕНИЯ И ВЫДАЧИ ЗНАЧКА ---
                            const checkAchProgress = await client.query(
                                'SELECT current_value, is_unlocked FROM player_achievements WHERE partner_id = $1 AND username = $2 AND achievement_id = $3 FOR UPDATE',
                                [partnerId, username, ach.id]
                            );

                            const progress = checkAchProgress.rows[0];
                            if (Number(progress.current_value) >= Number(ach.target_value) && !progress.is_unlocked) {

                                // 1. Намертво блокируем ачивку в статус разблокированной (is_unlocked = true)
                                await client.query(
                                    `UPDATE player_achievements 
                     SET is_unlocked = true, unlocked_at = NOW(), current_value = $1
                     WHERE partner_id = $2 AND username = $3 AND achievement_id = $4`,
                                    [ach.target_value, partnerId, username, ach.id]
                                );

                                // 2. Начисляем денежный приз на реальный баланс (finalReal) прямо внутри текущей транзакции!
                                finalReal += Number(ach.reward_amount);

                                // 3. Записываем системный лог триумфа в player_history (игрок увидит значок!)
                                await client.query(
                                    `INSERT INTO player_history (username, partner_id, category, action_type, description, amount_change)
                     VALUES ($1, $2, 'system', 'achievement', $3, $4)`,
                                    [username, partnerId, `Unlocked Badge ${ach.badge_icon} "${ach.title}"! Reward credited to balance.`, Number(ach.reward_amount)]
                                );
                            }
                        }
                    }
                } catch (achErr) {
                    console.error("❌ Achievements tracking module failure:", achErr.message);
                }
            }
            // Только теперь фиксируем транзакцию ACID в PostgreSQL [INDEX]
            await client.query('COMMIT');

            // 3. Отправляем в сокеты суммарный playable-баланс для UI платформы и игр
            const totalPlayable = finalReal + bonusBalance;
            if (global.io) {
                global.io.to(`${partnerId}_${username}`).emit('wallet_update', {
                    balance: totalPlayable,
                    realBalance: finalReal,
                    bonusBalance: bonusBalance,
                    currency: player.current_currency // Передаем строковый код активной валюты игрока [INDEX]
                });
            }

            return updateRes;

        } catch (err) {
            await client.query('ROLLBACK');
            console.error("❌ Умный апдейт баланса дал сбой:", err.message);
            return null;
        } finally {
            client.release();
        }
    },

    sendNotification: async (partnerId, username, type, text) => {
        try {
            // 1. Записываем уведомление в СУБД (для хранения истории)
            const result = await global.pool.query(
                `INSERT INTO player_notifications (partner_id, username, type, text) 
                 VALUES ($1, $2, $3, $4) RETURNING id, type, text, timestamp`,
                [partnerId, username, type, text.trim()]
            );

            const notifyNode = result.rows[0];

            // 2. Мгновенно отправляем по сокетам в комнату юзера
            if (global.io) {
                global.io.to(`${partnerId}_${username}`).emit('new_notification', {
                    id: notifyNode.id,
                    type: notifyNode.type,
                    text: notifyNode.text,
                    date: notifyNode.timestamp
                });
            }
            return true;
        } catch (err) {
            console.error("❌ Failed to broadcast notification node:", err.message);
            return false;
        }
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
            description = `Bet in game ${actionData.game || 'Casino'}. Change: ${amountChange} 🪙`;

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

        // // --- Считаем прогресс Ежедневного Квеста ---
        // if (dailyQuests.gamesPlayed < Number(gConfig.questTargetGames)) {
        //     dailyQuests.gamesPlayed += 1;
        //
        //     if (dailyQuests.gamesPlayed === Number(gConfig.questTargetGames) && !dailyQuests.claimed) {
        //         dailyQuests.claimed = true;
        //         try {
        //             const questRoundId = `q_daily_${crypto.randomBytes(6).toString('hex')}`;
        //             const creditResult = await walletService.credit(username, partnerId, actionData.sessionId || null, Number(gConfig.questReward), "Daily Quest Reward", questRoundId);
        //             if (creditResult && creditResult.balance !== undefined) currentBalance = Number(creditResult.balance);
        //
        //             // Системный лог квеста в историю
        //             await global.pool.query(
        //                 `INSERT INTO player_history (username, partner_id, category, action_type, description, amount_change)
        //                  VALUES ($1, $2, 'system', 'quest', $3, $4)`,
        //                 [username, partnerId, `Выполнен ежедневный квест! 📅`, Number(gConfig.questReward)]
        //             );
        //         } catch (err) {
        //             console.error(`❌ Ошибка выплаты за квест игроку ${username}:`, err.message);
        //             dailyQuests.claimed = false;
        //         }
        //     }
        // }
        //
        // // --- Считаем прогресс Ежедневных Квестов на основе их ТИПОВ ---
        // const activeQuestsRes = await global.pool.query(
        //     'SELECT * FROM b2b_quests WHERE partner_id = $1 AND is_active = 1',
        //     [partnerId]
        // );

        const activeQuestsRes = await global.pool.query(
            'SELECT * FROM b2b_quests WHERE partner_id = $1 AND is_active = 1',
            [partnerId]
        );
        // Если у партнера есть настроенные квесты в Postgres
        for (const quest of activeQuestsRes.rows) {
            let incrementValue = 0;

            // Проверяем тип квеста и вычисляем, на сколько увеличить прогресс
            if (quest.quest_type === 'GAMES_COUNT') {
                incrementValue = 1; // +1 сыгранная игра
            }
            else if (quest.quest_type === 'TURNOVER_BET') {
                incrementValue = Number(actionData.stake || 0); // +сумма ставки в оборот
            }
            else if (quest.quest_type === 'WIN_COUNT') {
                incrementValue = actionData.win ? 1 : 0; // +1 только если выиграл
            }

            if (incrementValue > 0) {
                // Атомарно обновляем прогресс игрока в базе данных
                await global.pool.query(`
                        INSERT INTO player_quest_progress (partner_id, username, quest_id, current_value)
                        VALUES ($1, $2, $3, $4)
                        ON CONFLICT (partner_id, username, quest_id)
                        DO UPDATE SET 
                            current_value = CASE 
                                WHEN player_quest_progress.is_claimed = false THEN player_quest_progress.current_value + EXCLUDED.current_value
                                ELSE player_quest_progress.current_value
                            END,
                            updated_at = NOW()
                    `, [partnerId, username, quest.id, incrementValue]);

                // --- Автовыплата при достижении цели (как было в твоем коде) ---
                // Проверяем, выполнился ли квест прямо сейчас
                const checkProgress = await global.pool.query(
                    'SELECT * FROM player_quest_progress WHERE partner_id = $1 AND username = $2 AND quest_id = $3 FOR UPDATE',
                    [partnerId, username, quest.id]
                );

                const progress = checkProgress.rows[0];
                if (Number(progress.current_value) >= Number(quest.target_value) && !progress.is_claimed) {
                    // Помечаем как выплаченный в СУБД, защищая от повторных начислений (Race Conditions)
                    await global.pool.query(
                        'UPDATE player_quest_progress SET is_claimed = true WHERE partner_id = $1 AND username = $2 AND quest_id = $3',
                        [partnerId, username, quest.id]
                    );

                    try {
                        const questRoundId = `q_auto_${crypto.randomBytes(6).toString('hex')}`;
                        const creditResult = await walletService.credit(
                            username, partnerId, actionData.sessionId || null,
                            Number(quest.reward_amount), `Daily Quest Completed: ${quest.quest_type}`, questRoundId
                        );
                        if (creditResult && creditResult.balance !== undefined) {
                            currentBalance = Number(creditResult.balance);
                        }

                        // Записываем системный лог в общую историю
                        await global.pool.query(
                            `INSERT INTO player_history (username, partner_id, category, action_type, description, amount_change)
                                 VALUES ($1, $2, 'system', 'quest', $3, $4)`,
                            [username, partnerId, `Completed quest [${quest.quest_type}]! 📅`, Number(quest.reward_amount)]
                        );
                    } catch (err) {
                        console.error(`❌ Ошибка автовыплаты за квест:`, err.message);
                        // В случае падения сети шлюза откатываем статус claimed, чтобы игрок мог забрать награду вручную через кнопку
                        await global.pool.query(
                            'UPDATE player_quest_progress SET is_claimed = false WHERE partner_id = $1 AND username = $2 AND quest_id = $3',
                            [partnerId, username, quest.id]
                        );
                    }
                }
            }
        }


        const activeTournamentRes = await global.pool.query(
            `SELECT id, min_bet_to_earn FROM b2b_tournaments 
                 WHERE partner_id = $1 AND is_active = 1 AND NOW() BETWEEN start_at AND end_at LIMIT 1`,
            [partnerId]
        );

        if (activeTournamentRes.rowCount > 0) {
            const tournament = activeTournamentRes.rows[0];

            // Проверяем, проходит ли ставка игрока по минимальному лимиту турнира
            if (currentBetAmount >= Number(tournament.min_bet_to_earn)) {
                // Рассчитываем очки: например, 5 за победу, 1 за проигрыш
                const pointsToEarn = actionData.win ? 5 : 1;

                // Атомарно добавляем очки в таблицу лидерборда текущего турнира
                await global.pool.query(`
                        INSERT INTO tournament_leaderboard (tournament_id, partner_id, username, points)
                        VALUES ($1, $2, $3, $4)
                        ON CONFLICT (tournament_id, username)
                        DO UPDATE SET points = tournament_leaderboard.points + EXCLUDED.points, updated_at = NOW()
                    `, [tournament.id, partnerId, username, pointsToEarn]);
            }
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
    // calculateAndPayCashback: async (partnerId, seamlessCredit) => {
    //     const globalConfig = global.CONFIG || {};
    //     const partnerConfig = globalConfig[partnerId] || {};
    //     // Корректно ищем процент кэшбэка в ветке gamification или берем дефолтные 10%
    //     const gConfig = partnerConfig.gamification || { cashbackPercent: 10 };
    //     const pct = Number(gConfig.cashbackPercent) / 100;
    //
    //     // Находим игроков строго текущего партнера из Postgres
    //     const res = await global.pool.query('SELECT * FROM players WHERE partner_id = $1', [partnerId]);
    //     const allPlayers = res.rows;
    //     const cashbackReport = [];
    //
    //     for (const player of allPlayers) {
    //         let history = typeof player.history === 'string' ? JSON.parse(player.history) : (player.history || []);
    //         if (history.length === 0) continue;
    //
    //         let totalDebits = 0;
    //         let totalCredits = 0;
    //
    //         // Парсим историю последних действий игрока
    //         history.forEach(action => {
    //             const changeStr = action.change || "";
    //             const amount = parseInt(changeStr.replace(/[^0-9]/g, '')) || 0;
    //
    //             if (changeStr.includes('-')) {
    //                 totalDebits += amount;
    //             } else if (changeStr.includes('+')) {
    //                 totalCredits += amount;
    //             }
    //         });
    //
    //         // Чистый проигрыш = сколько потратил минус сколько вернул
    //         const netLoss = totalDebits - totalCredits;
    //
    //         if (netLoss > 0) {
    //             const cashbackAmount = Math.floor(netLoss * pct);
    //
    //             if (cashbackAmount > 0 && typeof seamlessCredit === 'function') {
    //                 try {
    //                     // ИСПРАВЛЕНО: Безопасный криптографический roundId вместо Date.now() для предотвращения коллизий в цикле
    //                     const cashbackRoundId = `cb_${crypto.randomBytes(6).toString('hex')}`;
    //
    //                     // Отправляем начисление кэшбэка на шлюз платформы
    //                     const creditResult = await seamlessCredit(
    //                         player.username,
    //                         partnerId,
    //                         null, // Сессия null для фонового расчета
    //                         cashbackAmount,
    //                         "Weekly Cashback",
    //                         cashbackRoundId
    //                     );
    //
    //                     // Получаем свежий баланс из ответа шлюза
    //                     const freshBalance = creditResult && creditResult.balance !== undefined
    //                         ? Number(creditResult.balance)
    //                         : Number(player.balance) + cashbackAmount;
    //
    //                     // Добавляем запись о кэшбэке в начало лога истории
    //                     history.unshift({
    //                         time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    //                         game: "Cashback System",
    //                         details: `Received weekly cashback ${gConfig.cashbackPercent}%`,
    //                         change: `+${cashbackAmount} 🪙`,
    //                         win: true
    //                     });
    //
    //                     // Апдейтим историю и баланс игрока в PostgreSQL
    //                     await global.pool.query(
    //                         'UPDATE players SET history = $1::jsonb, balance = $2 WHERE username = $3 AND partner_id = $4',
    //                         [JSON.stringify(history), freshBalance, player.username, partnerId]
    //                     );
    //
    //                     cashbackReport.push({ username: player.username, loss: netLoss, paid: cashbackAmount });
    //                 } catch (e) {
    //                     console.error(`❌ Ошибка выплаты кэшбэка для ${player.username}:`, e.message);
    //                 }
    //             }
    //         }
    //     }
    //     return cashbackReport;
    // },

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
        const walletService = seamless || require('./services/seamlessService');
        const crypto = require('crypto');

        // 1. Ищем текущий активный турнир партнера
        const tRes = await global.pool.query(
            "SELECT id, title, prize_pool FROM b2b_tournaments WHERE partner_id = $1 AND is_active = 1 LIMIT 1",
            [partnerId]
        );
        if (tRes.rowCount === 0) return [];

        const tournament = tRes.rows[0];
        const totalPrize = Number(tournament.prize_pool);
        const prizes = [
            Math.floor(totalPrize * 0.50), // 1 место
            Math.floor(totalPrize * 0.30), // 2 место
            Math.floor(totalPrize * 0.20)  // 3 место
        ];

        // 2. Вытягиваем лидеров этого конкретного турнира из таблицы лидерборда
        const leadersRes = await global.pool.query(
            "SELECT username, points FROM tournament_leaderboard WHERE tournament_id = $1 AND points > 0 ORDER BY points DESC",
            [tournament.id]
        );
        const participants = leadersRes.rows;
        const winnersInfo = [];

        for (let i = 0; i < participants.length; i++) {
            const player = participants[i];
            let prizeWon = 0;

            // Топ-3 получают выплаты на внешнюю витрину
            if (i < 3) {
                prizeWon = prizes[i];
                try {
                    const trnRoundId = `trn_win_${crypto.randomBytes(6).toString('hex')}`;
                    await walletService.credit(player.username, partnerId, null, prizeWon, `Tournament [${tournament.title}] Place ${i + 1}`, trnRoundId);

                    // Пишем лог в общую историю активности игрока
                    await global.pool.query(
                        `INSERT INTO player_history (username, partner_id, category, action_type, description, amount_change)
                         VALUES ($1, $2, 'system', 'tournament_win', $3, $4)`,
                        [player.username, partnerId, `🏆 Took ${i + 1} place in tournament "${tournament.title}"!`, prizeWon]
                    );
                } catch (err) {
                    console.error(`❌ Payout failed for ${player.username}:`, err.message);
                }
            }

            // 3. Записываем результат каждого участника в глобальный исторический архив
            await global.pool.query(
                `INSERT INTO tournament_history (tournament_id, partner_id, title, winner_username, place, points_earned, prize_paid)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [tournament.id, partnerId, tournament.title, player.username, i + 1, player.points, prizeWon]
            );

            if (i < 3) {
                winnersInfo.push({ username: player.username, place: i + 1, points: player.points, prize: prizeWon });
            }
        }

        // 4. Деактивируем турнир (ставим is_active = 0)
        await global.pool.query("UPDATE b2b_tournaments SET is_active = 0 WHERE id = $1", [tournament.id]);

        return winnersInfo;
    },

    // resetDailyQuestsForAll: async () => {
    //     // Очищаем прогресс игр, claimed ставим в false
    //     await global.pool.query(
    //         `UPDATE players
    //          SET daily_quests = '{"gamesPlayed": 0, "claimed": false}'::jsonb`
    //     );
    //     console.log("✅ Ежедневные квесты успешно сброшены в СУБД для всех игроков.");
    // },

    resetDailyQuestsForAll: async () => {
        // Вместо апдейта тяжелого JSONB, мы просто очищаем таблицу текущего прогресса на новый день
        await global.pool.query('DELETE FROM player_quest_progress');
        console.log("==> [CRON] Таблица прогресса ежедневных квестов успешно очищена в PostgreSQL.");
    },

    getPlayerGamificationStatus: async (username, partnerId) => {
        // Запрашиваем данные игрока
        const pRes = await global.pool.query(
            'SELECT daily_quests, tournament_points, level, xp FROM players WHERE username = $1 AND partner_id = $2 LIMIT 1',
            [username, partnerId]
        );
        if (pRes.rowCount === 0) return null;
        const player = pRes.rows[0];

        const dailyQuests = typeof player.daily_quests === 'string' ? JSON.parse(player.daily_quests) : (player.daily_quests || { gamesPlayed: 0, claimed: false });

        // Извлекаем конфигурацию геймификации партнера
        const partnerConfig = global.CONFIG?.[partnerId]?.gamification || { questTargetGames: 30, questReward: 50 };
        const targetGames = Number(partnerConfig.questTargetGames);

        // Получаем ТОП-10 лидеров текущего турнира для вывода таблицы на фронтенд игрока
        const leaderboardRes = await global.pool.query(
            'SELECT username, tournament_points as points, level FROM players WHERE partner_id = $1 AND tournament_points > 0 ORDER BY tournament_points DESC LIMIT 10',
            [partnerId]
        );

        return {
            quest: {
                gamesPlayed: dailyQuests.gamesPlayed,
                targetGames: targetGames,
                claimed: dailyQuests.claimed,
                progressPercentage: Math.min(Math.floor((dailyQuests.gamesPlayed / targetGames) * 100), 100)
            },
            tournament: {
                playerPoints: player.tournament_points,
                leaderboard: leaderboardRes.rows
            },
            profile: {
                level: player.level,
                xp: player.xp,
                nextLevelXp: player.level * (partnerConfig.xpMultiplier || 1000)
            }
        };
    },

    // 2. МЕТОД ЗАБРАТЬ НАГРАДУ ЗА ЕЖЕДНЕВНЫЙ КВЕСТ (CLAIM REWARD)
    claimDailyQuestReward: async (username, partnerId, sessionId) => {
        const client = await global.pool.connect();
        const walletService = seamless || require('./services/seamlessService');

        try {
            await client.query('BEGIN');

            // Запрашиваем состояние игрока под блокировкой FOR UPDATE
            const pRes = await client.query(
                'SELECT daily_quests, balance FROM players WHERE username = $1 AND partner_id = $2 FOR UPDATE',
                [username, partnerId]
            );
            if (pRes.rowCount === 0) { await client.query('ROLLBACK'); return { success: false, error: "PLAYER_NOT_FOUND" }; }
            const player = pRes.rows[0];

            let dailyQuests = typeof player.daily_quests === 'string' ? JSON.parse(player.daily_quests) : (player.daily_quests || { gamesPlayed: 0, claimed: false });

            const partnerConfig = global.CONFIG?.[partnerId]?.gamification || { questTargetGames: 30, questReward: 50 };
            const targetGames = Number(partnerConfig.questTargetGames);
            const rewardAmount = Number(partnerConfig.questReward);

            // ВАЛИДАЦИЯ: Выполнен ли квест?
            if (dailyQuests.gamesPlayed < targetGames) {
                await client.query('ROLLBACK');
                return { success: false, error: "QUEST_NOT_COMPLETED", message: `You need to play ${targetGames - dailyQuests.gamesPlayed} more games.` };
            }

            // ВАЛИДАЦИЯ: Не забирал ли награду ранее?
            if (dailyQuests.claimed) {
                await client.query('ROLLBACK');
                return { success: false, error: "REWARD_ALREADY_CLAIMED", message: "You have already claimed today's reward." };
            }

            // Ставим флаг, что награда получена
            dailyQuests.claimed = true;

            // Выплачиваем деньги через бесшовный шлюз на внешнюю витрину
            const questRoundId = `q_claim_${crypto.randomBytes(6).toString('hex')}`;
            const creditResult = await walletService.credit(
                username, partnerId, sessionId, rewardAmount, "Daily Quest Completed Reward", questRoundId
            );

            const finalBalance = creditResult && creditResult.balance !== undefined
                ? Number(creditResult.balance)
                : Number(player.balance) + rewardAmount;

            // Обновляем данные в Postgres
            await client.query(
                'UPDATE players SET daily_quests = $1::jsonb, balance = $2 WHERE username = $3 AND partner_id = $4',
                [JSON.stringify(dailyQuests), finalBalance, username, partnerId]
            );

            // Пишем событие в ленту активности player_history
            await client.query(
                `INSERT INTO player_history (username, partner_id, category, action_type, description, amount_change)
                 VALUES ($1, $2, 'system', 'quest_claim', $3, $4)`,
                [username, partnerId, `Claimed daily retention quest reward! 📅`, rewardAmount]
            );

            await client.query('COMMIT');
            return { success: true, reward: rewardAmount, balance: finalBalance };

        } catch (err) {
            await client.query('ROLLBACK');
            console.error("Quest claim transaction failure:", err.message);
            return { success: false, error: "TRANSACTION_ERROR", message: "Failed to claim reward due to system error" };
        } finally {
            client.release();
        }
    },

    // 3. Массовый Крон-сброс квестов в Postgres одной строчкой (БЕЗ циклов, не нагружает базу данных)
    resetDailyQuestsForAll222: async (partnerId = null) => {
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
    // 1. Создание промокода напрямую в реляционную таблицу promo_codes
    addPromoCode: async (partnerId, codeData) => {
        try {
            const cleanCode = codeData.code.toUpperCase().trim();
            const reward = Number(codeData.reward);
            const maxUses = Number(codeData.maxUses || 1);
            // Если дата передана — сохраняем её, если нет — оставляем NULL (бессрочный)
            const expiresAt = codeData.expiresAt ? codeData.expiresAt : null;

            await global.pool.query(
                `INSERT INTO promo_codes (partner_id, code, reward, max_uses, expires_at) 
                 VALUES ($1, $2, $3, $4, $5)
                 ON CONFLICT (partner_id, code) 
                 DO UPDATE SET reward = EXCLUDED.reward, max_uses = EXCLUDED.max_uses, expires_at = EXCLUDED.expires_at, is_active = 1`,
                [partnerId, cleanCode, reward, maxUses, expiresAt]
            );
            return { success: true };
        } catch (err) {
            console.error(`[Postgres Promo Error] Failed to add promo code:`, err.message);
            return { success: false, error: "DB_ERROR" };
        }
    },

    // 2. Метод быстрого переключения статуса (включить/выключить)
    togglePromoStatus: async (partnerId, code, currentStatus) => {
        const nextStatus = currentStatus === 1 ? 0 : 1;
        await global.pool.query(
            'UPDATE promo_codes SET is_active = $1 WHERE partner_id = $2 AND code = $3',
            [nextStatus, partnerId, code.toUpperCase().trim()]
        );
        return { success: true };
    },

    // 3. Активация кода игроком (с жесткой валидацией даты истечения срока)
    usePromoCode: async (username, partnerId, code, seamlessCredit) => {
        const cleanCode = code.toUpperCase().trim();
        const client = await global.pool.connect();

        try {
            await client.query('BEGIN');

            // Выбираем промокод
            const promoRes = await client.query(
                'SELECT * FROM promo_codes WHERE partner_id = $1 AND code = $2 FOR UPDATE',
                [partnerId, cleanCode]
            );

            if (promoRes.rowCount === 0) {
                await client.query('ROLLBACK');
                return { success: false, error: "PROMO_INVALID", message: "Invalid promo code" };
            }
            const promo = promoRes.rows[0];

            const playerRes = await global.pool.query(
                'SELECT * FROM players WHERE username = $1 AND partner_id = $2 LIMIT 1',
                [username, partnerId]
            );
            if (playerRes.rowCount === 0) {
                await client.query('ROLLBACK');
                return { success: false, error: "PLAYER_INVALID", message: "Player not found" }
            }
            const player = playerRes.rows[0];

            // ВАЛИДАЦИЯ 1: Ручная деактивация админом
            if (promo.is_active !== 1) {
                await client.query('ROLLBACK');
                return { success: false, error: "PROMO_DISABLED", message: "This promo code is currently inactive" };
            }

            // ВАЛИДАЦИЯ 2: Проверка срока действия по времени сервера
            if (promo.expires_at && new Date() > new Date(promo.expires_at)) {
                await client.query('ROLLBACK');
                return { success: false, error: "PROMO_EXPIRED", message: "This promo code has expired" };
            }

            // ВАЛИДАЦИЯ 3: Глобальный лимит использований
            if (promo.current_uses >= promo.max_uses) {
                await client.query('ROLLBACK');
                return { success: false, error: "PROMO_EXHAUSTED", message: "This promo code limit has been reached" };
            }

            const currentPromos = typeof player.used_promos === 'string'
                ? JSON.parse(player.used_promos)
                : (player.used_promos || {});

            const timesUsed = currentPromos[cleanCode] || 0;

            if (timesUsed >= promo.maxUses) {
                await client.query('ROLLBACK');
                return { success: false, error: "PROMO_LIMIT", message: "You have already used this promo code maximum times" };
            }

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

            await state.sendNotification(partnerId, username, 'BONUS', '💰 Promo code activated successfully! '  + promo.reward + ' coins added to your balance.');

            return promo.reward;

        } catch (err) {
            await client.query('ROLLBACK');
            return { success: false, error: "TRANSACTION_ERROR" };
        } finally {
            client.release();
        }
    },

    getPromoCodesList: async (partnerId) => {
        const res = await global.pool.query(
            `SELECT code, reward::numeric, max_uses, current_uses, is_active, expires_at 
             FROM promo_codes 
             WHERE partner_id = $1 
             ORDER BY id DESC`,
            [partnerId]
        );
        return res.rows;
    },

    // 💰 МАССОВЫЙ РАСЧЕТ И ВЫПЛАТА КЭШБЭКА НА СУБД (АБСОЛЮТНО НОВАЯ СИСТЕМА)
    // Кэшбэк считается классически: (Сумма ставок - Сумма выигрышей) * Процент
    runGlobalCashback: async (partnerId, percent) => {
        const pct = Number(percent) / 100;
        const walletService = seamless || require('./services/seamlessService');
        const crypto = require('crypto');

        // Ищем игроков партнера, у которых за все время сумма ставок превышает выигрыши
        const playersRes = await global.pool.query(`
            SELECT 
                p.username,
                p.balance,
                COALESCE(SUM(cb.stake), 0)::numeric as c_stake,
                COALESCE(SUM(cb.prize), 0)::numeric as c_prize,
                COALESCE(SUM(sb.stake), 0)::numeric as s_stake,
                COALESCE(SUM(sb.prize), 0)::numeric as s_prize
            FROM players p
            LEFT JOIN casino_bets cb ON cb.username = p.username AND cb.partner_id = p.partner_id
            LEFT JOIN sports_bets sb ON sb.username = p.username AND sb.partner_id = p.partner_id
            WHERE p.partner_id = $1
            GROUP BY p.username, p.balance
        `, [partnerId]);

        let payoutsCount = 0;

        for (const row of playersRes.rows) {
            const totalStake = Number(row.c_stake) + Number(row.s_stake);
            const totalPrize = Number(row.c_prize) + Number(row.s_prize);

            // Если игрок в минусе — начисляем процент возврата от проигрыша
            if (totalStake > totalPrize) {
                const loss = totalStake - totalPrize;
                const cashbackAmount = Math.floor(loss * pct);

                if (cashbackAmount > 0) {
                    try {
                        const cbRoundId = `cb_${crypto.randomBytes(6).toString('hex')}`;
                        const creditResult = await walletService.credit(
                            row.username, partnerId, null, cashbackAmount,
                            `Cashback Drop ${percent}%`, cbRoundId
                        );

                        const finalBalance = creditResult && creditResult.balance !== undefined
                            ? Number(creditResult.balance)
                            : Number(row.balance) + cashbackAmount;

                        // Обновляем баланс в БД
                        await global.pool.query(
                            'UPDATE players SET balance = $1 WHERE username = $2 AND partner_id = $3',
                            [finalBalance, row.username, partnerId]
                        );

                        // Пишем запись в ленту истории игрока
                        await global.pool.query(
                            `INSERT INTO player_history (username, partner_id, category, action_type, description, amount_change)
                             VALUES ($1, $2, 'system', 'cashback', $3, $4)`,
                            [row.username, partnerId, `Received ${percent}% loyalty cashback drop!`, cashbackAmount]
                        );

                        payoutsCount++;
                    } catch (err) {
                        console.error(`❌ Ошибка выплаты кэшбэка игроку ${row.username}:`, err.message);
                    }
                }
            }
        }
        return payoutsCount;
    },

    runCronCashback: async (targetMode) => {
        const crypto = require('crypto');
        const walletService = seamless || require('./services/seamlessService');

        console.log(`📡 [Cron] Запуск автоматического расчета кэшбэка для режима: ${targetMode}...`);

        // Ищем всех партнеров, у которых в конфиге активирован нужный режим кэшбэка
        const configsRes = await global.pool.query("SELECT id, config_data FROM b2b_configs WHERE id = 'global_config'");
        if (configsRes.rowCount === 0) return;

        const globalConfig = configsRes.rows[0].config_data;

        // Перебираем всех партнеров в системе
        for (const partnerId in globalConfig) {
            const partnerConfig = globalConfig[partnerId] || {};
            const cbConfig = partnerConfig.gamification?.cashback || { mode: 'manual', percent: 10 };

            // Если режим совпадает (например, 'daily') и процент > 0 — запускаем начисления
            if (cbConfig.mode === targetMode && Number(cbConfig.percent) > 0) {
                console.log(`💰 Начисление ${cbConfig.percent}% [${targetMode}] кэшбэка для партнера: ${partnerId}`);

                // Используем наш готовый метод массовой выплаты кэшбэка, который мы написали для админки!
                // Он сам посчитает (ставки - выигрыши) в Postgres и начислит коины через seamless шлюз
                await module.exports.runGlobalCashback(partnerId, cbConfig.percent);
            }
        }
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

    getChartAnalytics222: async (partnerId) => {
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

    getChartAnalytics: async (partnerId, domain = '', daysInterval = 7) => {
        const safeDays = Math.min(Math.max(parseInt(daysInterval, 10) || 7, 2), 90);

        let logDomainFilter = '';
        let snapshotDomainFilter = '';
        let playersDomainFilter = '';
        const queryParams = [partnerId, `${safeDays - 1} days`];

        if (domain) {
            queryParams.push(domain.toLowerCase().trim()); // Это будет $3
            logDomainFilter = ` AND al.currency = (SELECT (currency_settings->>'default_currency') FROM b2b_websites WHERE partner_id = $1 AND domain_name = $3 LIMIT 1)`;
            snapshotDomainFilter = ` AND domain_name = $3`;

            // Фильтр игроков по домену через наличие кошелька (для сквозных аккаунтов)
            playersDomainFilter = ` AND EXISTS (SELECT 1 FROM player_wallets w WHERE w.username = p.username AND w.partner_id = p.partner_id AND w.currency = (SELECT (currency_settings->>'default_currency') FROM b2b_websites WHERE partner_id = $1 AND domain_name = $3 LIMIT 1))`;
        }

        // --- ЗАПРОС 1: ТАЙМЛАЙН ГРАФИКОВ (Финансы, Онлайн, Регистрации, FTD) ---
        const timelineQuery = `
            SELECT 
                TO_CHAR(series_date, 'YYYY-MM-DD') as date_label,
                COALESCE(SUM(CASE WHEN al.type = 'DEBIT' AND al.game NOT SIMILAR TO '%(Deposit|Withdraw|Promo|Cashback|Quest|VIP)%' THEN al.amount ELSE 0 END), 0)::numeric as day_bets,
                COALESCE(SUM(CASE WHEN al.type = 'CREDIT' AND al.game NOT SIMILAR TO '%(Deposit|Withdraw|Promo|Cashback|Quest|VIP)%' THEN al.amount ELSE 0 END), 0)::numeric as day_wins,
                COALESCE(SUM(CASE WHEN al.type = 'AFFILIATE' THEN al.amount ELSE 0 END), 0)::numeric as day_affiliate,
                COALESCE(SUM(CASE WHEN al.game LIKE '%Deposit%' THEN al.amount ELSE 0 END), 0)::numeric as day_deposits,
                COALESCE(SUM(CASE WHEN al.game LIKE '%Withdraw%' THEN al.amount ELSE 0 END), 0)::numeric as day_withdraws,
                COUNT(CASE WHEN al.type IN ('DEBIT', 'CREDIT') AND al.game NOT SIMILAR TO '%(Deposit|Withdraw|Promo|Cashback|Quest|VIP)%' THEN al.id END)::int as bets_count,
                
                -- Метрики онлайна [INDEX]
                COALESCE((SELECT MAX(online_count) FROM b2b_online_snapshots WHERE partner_id = $1 ${snapshotDomainFilter} AND DATE(timestamp) = DATE(series_date)), 0)::int as peak_online,
                COALESCE((SELECT AVG(online_count) FROM b2b_online_snapshots WHERE partner_id = $1 ${snapshotDomainFilter} AND DATE(timestamp) = DATE(series_date)), 0)::int as avg_online,
                
                -- 👥 Новые Регистрации (Sign-ups) [INDEX]
                COALESCE((SELECT COUNT(id) FROM players p WHERE p.partner_id = $1 ${playersDomainFilter} AND DATE(p.created_at) = DATE(series_date)), 0)::int as day_signups,
                
                -- 💳 Уникальные первые депозиты за эти сутки (FTDs) [INDEX]
                COALESCE((
                    SELECT COUNT(DISTINCT al_ftd.username) FROM accounting_logs al_ftd
                    WHERE al_ftd.partner_id = $1 ${logDomainFilter.replace(/al\./g, 'al_ftd.')} AND al_ftd.game LIKE '%Deposit%' AND DATE(al_ftd.timestamp) = DATE(series_date)
                    AND al_ftd.username NOT IN (
                        SELECT al_old.username FROM accounting_logs al_old 
                        WHERE al_old.partner_id = $1 ${logDomainFilter.replace(/al\./g, 'al_old.')} AND al_old.game LIKE '%Deposit%' AND DATE(al_old.timestamp) < DATE(series_date)
                    )
                ), 0)::int as day_ftds
                
            FROM GENERATE_SERIES(CURRENT_DATE - CAST($2 AS INTERVAL), CURRENT_DATE, '1 day'::interval) as series_date
            LEFT JOIN accounting_logs al ON al.partner_id = $1 ${logDomainFilter} AND DATE(al.timestamp) = DATE(series_date)
            GROUP BY series_date
            ORDER BY series_date ASC
        `;

        // --- ЗАПРОС 2: КРУГОВАЯ ДИАГРАММА (Доли ставок по категориям) ---
        // Извлекаем общие суммы оборота (Turnover) в разрезе игр за выбранный интервал времени [INDEX]
        const categoryQuery = `
            SELECT 
                CASE 
                    WHEN al.game SIMILAR TO '%(football|vfoot|match)%' THEN 'Virtual Football'
                    WHEN al.game SIMILAR TO '%(sport|book|bet_match)%' THEN 'Sportsbook'
                    ELSE 'Casino Slots'
                END as game_category,
                SUM(al.amount)::numeric as category_turnover
            FROM accounting_logs al
            WHERE al.partner_id = $1 
              AND al.type = 'DEBIT' 
              AND al.game NOT SIMILAR TO '%(Deposit|Withdraw|Promo|Cashback|Quest|VIP)%'
              AND al.timestamp >= NOW() - CAST($2 AS INTERVAL)
              ${logDomainFilter}
            GROUP BY game_category
            ORDER BY category_turnover DESC
        `;

        const timelineRes = await global.pool.query(timelineQuery, queryParams);
        const categoryRes = await global.pool.query(categoryQuery, queryParams);

        // Маппим основной таймлайн
        const timelineData = timelineRes.rows.map(row => {
            const ggr = Number(row.day_bets) - Number(row.day_wins);
            return {
                date: row.date_label,
                ggr: ggr,
                netProfit: ggr - Number(row.day_affiliate),
                deposits: Number(row.day_deposits),
                withdraws: Number(row.day_withdraws),
                betsCount: row.bets_count,
                peakOnline: row.peak_online,
                avgOnline: row.avg_online,
                // Прокидываем новые маркетинговые метрики [INDEX]
                signups: row.day_signups,
                ftds: row.day_ftds
            };
        });

        // Возвращаем комбинированный JSON-пакет аналитики
        return {
            timeline: timelineData,
            shares: categoryRes.rows // [{ game_category: 'Casino Slots', category_turnover: 25000 }, ...]
        };
    },

    getAdminPlayersList: async (partnerId, filters = {}) => {
        const { search = '', limit = 15, page = 1 } = filters;
        const offset = (page - 1) * limit;

        // Базовые тексты запросов с агрегацией кошельков через подзапрос
        let queryText = `
            SELECT p.id, p.username, p.current_currency, p.balance, p.bonus_balance, p.xp, p.level, 
                   p.tournament_points, p.is_banned, p.casino_min_limit, p.casino_max_limit, 
                   p.sport_min_limit, p.sport_max_limit,
                   (
                       SELECT json_agg(json_build_object('currency', w.currency, 'balance', w.balance::numeric)) 
                       FROM player_wallets w 
                       WHERE w.username = p.username AND w.partner_id = p.partner_id
                   ) as all_wallets
            FROM players p 
            WHERE p.partner_id = $1`;

        let countQuery = `SELECT COUNT(*)::int as count FROM players WHERE partner_id = $1`;
        let queryParams = [partnerId];

        if (search) {
            queryText += ` AND p.username ILIKE $2`;
            countQuery += ` AND username ILIKE $2`;
            queryParams.push(`%${search}%`);
        }

        const countRes = await global.pool.query(countQuery, queryParams);
        const totalItems = countRes.rows[0]?.count || 0;

        // Позиционные параметры для лимита и смещения динамически рассчитываются
        const limitParamIndex = queryParams.length + 1;
        const offsetParamIndex = queryParams.length + 2;

        queryText += ` ORDER BY p.id DESC LIMIT $${limitParamIndex} OFFSET $${offsetParamIndex}`;
        queryParams.push(Number(limit), Number(offset));

        const res = await global.pool.query(queryText, queryParams);

        return {
            items: res.rows,
            pagination: { page: Number(page), limit: Number(limit), totalItems, totalPages: Math.ceil(totalItems / limit) }
        };
    },

    getAdminPlayersList: async (partnerId, filters = {}) => {
        const { search = '', domain = '', isOnline = '', limit = 15, page = 1 } = filters;
        const offset = (page - 1) * limit;

        // Базовые тексты запросов с агрегацией кошельков
        let queryText = `
            SELECT p.id, p.username, p.current_currency, p.balance, p.bonus_balance, p.xp, p.level, 
                   p.tournament_points, p.is_banned, p.casino_min_limit, p.casino_max_limit, 
                   p.sport_min_limit, p.sport_max_limit,
                   (
                       SELECT json_agg(json_build_object('currency', w.currency, 'balance', w.balance::numeric)) 
                       FROM player_wallets w 
                       WHERE w.username = p.username AND w.partner_id = p.partner_id
                   ) as all_wallets
            FROM players p`;

        let countQuery = `SELECT COUNT(*)::int as count FROM players p`;

        // Массив условий WHERE
        let whereClauses = [`p.partner_id = $1`];
        let queryParams = [partnerId];

        // 1. Фильтр динамического текстового поиска по Username
        if (search) {
            queryParams.push(`%${search}%`);
            whereClauses.push(`p.username ILIKE $${queryParams.length}`);
        }

        if (domain) {
            try {
                // 1. Быстрым подзапросом узнаем валюту по умолчанию для выбранного админом домена
                const domainCurrencyRes = await global.pool.query(
                    "SELECT (currency_settings->>'default_currency') as def_cur FROM b2b_websites WHERE partner_id = $1 AND domain_name = $2 LIMIT 1",
                    [partnerId, domain.toLowerCase().trim()]
                );

                const domainCurrency = domainCurrencyRes.rows?.[0]?.def_cur;

                if (domainCurrency) {
                    // 2. Добавляем в параметры запроса СУБД целевую валюту сайта
                    queryParams.push(domainCurrency);

                    // 3. Фильтруем таблицу игроков: оставляем только тех, у кого инициализирован кошелек этой валюты в player_wallets
                    // Это железобетонно покажет игроков, которые имеют отношение к этому бренду
                    whereClauses.push(`EXISTS (
                        SELECT 1 FROM player_wallets w 
                        WHERE w.username = p.username AND w.partner_id = p.partner_id AND w.currency = $${queryParams.length}
                    )`);

                    console.log(`🔍 [Admin Query] Фильтр по домену "${domain}" активирован через валютный маркер: ${domainCurrency}`);
                } else {
                    console.warn(`⚠️ [Admin Query] Валюта для домена "${domain}" не настроена в b2b_websites. Фильтр пропущен.`);
                }
            } catch (curErr) {
                console.error("❌ Ошибка сборки фильтра домена в SQL:", curErr.message);
            }
        }

        // 3. 🟢 ИНЖЕКТ ФИЛЬТРА ПО ОНЛАЙНУ: Работаем с оперативной памятью Socket.io
        if (isOnline === 'true' || isOnline === true) {
            // Собираем из нашего глобального сокет-объекта имена всех, кто в сети
            const onlineKeys = Object.keys(global.onlinePlayers || {}); // ["demo_mtwtech_Марк", ...]

            // Фильтруем никнеймы строго текущего партнера
            const onlineUsernames = onlineKeys
                .filter(key => key.startsWith(`${partnerId}_`))
                .map(key => key.replace(`${partnerId}_`, ""));

            if (onlineUsernames.length === 0) {
                // Если в сети вообще никого нет — принудительно возвращаем пустой массив, чтобы не мучить базу
                return { items: [], pagination: { page: Number(page), limit: Number(limit), totalItems: 0, totalPages: 0 } };
            }

            queryParams.push(onlineUsernames); // Передаем массив ников в параметры Postgres
            whereClauses.push(`p.username = ANY($$${queryParams.length})`);
        }

        // Собираем блок WHERE в единый SQL-текст
        if (whereClauses.length > 0) {
            const whereSql = ' WHERE ' + whereClauses.join(' AND ');
            queryText += whereSql;
            countQuery += whereSql;
        }

        // Считаем общее количество элементов для пагинации
        const countRes = await global.pool.query(countQuery, queryParams);
        const totalItems = countRes.rows[0]?.count || 0;

        // Рассчитываем динамические индексы для LIMIT и OFFSET
        const limitParamIndex = queryParams.length + 1;
        const offsetParamIndex = queryParams.length + 2;

        queryText += ` ORDER BY p.id DESC LIMIT $${limitParamIndex} OFFSET $${offsetParamIndex}`;
        queryParams.push(Number(limit), Number(offset));

        const res = await global.pool.query(queryText, queryParams);

        // Расставляем виртуальный флаг IsOnline для строк таблицы, чтобы админ видел зеленую точку прямо в списке
        const itemsWithOnlineStatus = res.rows.map(player => {
            const roomKey = `${partnerId}_${player.username}`;
            return {
                ...player,
                is_online: !!(global.onlinePlayers && global.onlinePlayers[roomKey]) // true/false на основе сокетов
            };
        });

        return {
            items: itemsWithOnlineStatus,
            pagination: { page: Number(page), limit: Number(limit), totalItems, totalPages: Math.ceil(totalItems / limit) }
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

const antifraudMethods = {
    // 1. Автоматическая фиксация инцидента безопасности
    logAntifraudAlert: async (partnerId, username, alertType, riskScore, description) => {
        try {
            await global.pool.query(
                `INSERT INTO antifraud_alerts (partner_id, username, alert_type, risk_score, description, status) 
                 VALUES ($1, $2, $3, $4, $5, 'NEW')`,
                [partnerId, username, alertType, Number(riskScore), description.trim()]
            );
            console.log(`⚠️ [Antifraud Triggered] Player: ${username}, Type: ${alertType}, Score: ${riskScore}`);
            return true;
        } catch (err) {
            console.error("❌ Failed to log antifraud alert in DB:", err.message);
            return false;
        }
    },

    // 2. Получение списка всех новых алертов для админ-панели
    getNewAntifraudAlerts: async (partnerId) => {
        const res = await global.pool.query(
            `SELECT id, username, alert_type, risk_score, description, timestamp 
             FROM antifraud_alerts 
             WHERE partner_id = $1 AND status = 'NEW' 
             ORDER BY id DESC`,
            [partnerId]
        );
        return res.rows;
    },

    // 3. Закрытие инцидента (перевод в архив)
    dismissAntifraudAlertStatus: async (partnerId, alertId) => {
        const res = await global.pool.query(
            `UPDATE antifraud_alerts 
             SET status = 'REVIEWED' 
             WHERE id = $1 AND partner_id = $2`,
            [Number(alertId), partnerId]
        );
        return res.rowCount > 0;
    }
};

const bonusBalanceMethods  = {
    // Получить текущие настройки Welcome-бонуса для конкретного сайта
    getAdminWelcomeBonusConfig: async (partnerId, websiteId) => {
        const res = await global.pool.query(
            `SELECT id, bonus_percent, wager_multiplier, min_deposit_amount::numeric, max_bonus_amount::numeric, is_active 
             FROM b2b_welcome_bonuses 
             WHERE partner_id = $1 AND website_id = $2 LIMIT 1`,
            [partnerId, Number(websiteId)]
        );
        // Если настроек еще нет — возвращаем стандартные дефолты платформы
        return res.rows[0] || { bonus_percent: 100, wager_multiplier: 30, min_deposit_amount: 100, max_bonus_amount: 5000, is_active: 0 };
    },

    // Сохранить или обновить параметры Welcome-бонуса (Upsert)
    saveAdminWelcomeBonusConfig: async (partnerId, data) => {
        const { websiteId, bonusPercent, wagerMultiplier, minDeposit, maxBonus, isActive } = data;

        await global.pool.query(
            `INSERT INTO b2b_welcome_bonuses (partner_id, website_id, bonus_percent, wager_multiplier, min_deposit_amount, max_bonus_amount, is_active)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             ON CONFLICT (website_id) 
             DO UPDATE SET 
                bonus_percent = EXCLUDED.bonus_percent,
                wager_multiplier = EXCLUDED.wager_multiplier,
                min_deposit_amount = EXCLUDED.min_deposit_amount,
                max_bonus_amount = EXCLUDED.max_bonus_amount,
                is_active = EXCLUDED.is_active`,
            [partnerId, Number(websiteId), Number(bonusPercent), Number(wagerMultiplier), Number(minDeposit), Number(maxBonus), Number(isActive)]
        );
        return true;
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
    ...antifraudMethods,

    ...minesMethods,
    ...crashMethods,
    ...diceMethods,
    ...hiloMethods,

    ...freeSpinMethods,
    ...sportsMethods,
    ...catalogMethods,
    ...sessionMethods,
    ...bonusBalanceMethods,

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



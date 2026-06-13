const state = require('../state');
const seamless = require('../services/seamlessService');
const payment = require('../services/paymentService');

// 1. Отдаем все данные одним пакетом для фронтенда админки (Строго для текущего partnerId)
exports.getAdminData = async (req, res) => {
    try {
        // ИСПРАВЛЕНО: Безопасный сбор partnerId из мидлвара, тела или query-строки запроса админки
        const partnerId = req.partnerId || req.query.partnerId || "demo_mtwtech";

        const config = state.getConfig(partnerId);
        const jackpot = state.getJackpot(partnerId);
        const players = await state.getAllPlayers(partnerId);
        const BGS = state.BGS;

        res.json({ config, jackpot, players, BGS });
    } catch (err) {
        console.error("❌ [Postgres Admin Core API] Data aggregation crashed:", err.message);
        res.status(500).json({ error: "Core data aggregation failure" });
    }
};


// 2. Обработчик изменения конфига (RTP и Стоимость) с привязкой к партнеру
exports.updateConfig = async (req, res) => {
    try {
        const partnerId = req.partnerId;

        for (const key of Object.keys(req.body)) {
            const [game, param] = key.split('_');
            if (game && param) {
                // Асинхронно сохраняем параметры напрямую в Postgres таблицу b2b_configs
                await state.updateConfigParam(partnerId, game, param, req.body[key]);
            }
        }
        res.json({ success: true });
    } catch (err) {
        console.error("❌ [Admin API] Configuration save failure:", err.message);
        res.status(500).json({ error: "Configuration save failure" });
    }
};

// 3. Обработчик изменения джекпота конкретного партнера
// ИСПРАВЛЕНО: Метод переведен в async, чтобы атомарно коммитить изменения в Postgres
exports.updateJackpot = async (req, res) => {
    try {
        const partnerId = req.partnerId;

        if (req.body.jackpot !== undefined) {
            // Дожидаемся записи обновленного джекпота в Postgres
            await state.setJackpot(partnerId, req.body.jackpot);

            // Принудительно вызываем сохранение в базу данных b2b_configs, если метод асинхронный
            if (state.updateConfigParam) {
                await state.updateConfigParam(partnerId, 'global', 'jackpot_sync', req.body.jackpot);
            }

            res.json({ success: true });
        } else {
            res.status(400).json({ error: "Invalid pool parameters" });
        }
    } catch (err) {
        console.error("❌ [Admin API] Jackpot update failure:", err.message);
        res.status(500).json({ error: "Jackpot update failure" });
    }
};

// 4. Обработчик изменения локального баланса игрока
// ВАЖНО: В бесшовной архитектуре ручной баланс в Postgres стирается при следующем запросе к шлюзу витрины!
exports.updateBalance = async (req, res) => {
    try {
        const partnerId = req.partnerId;
        const { username, balance } = req.body;

        if (username && balance !== undefined) {
            // Внимание: Обновляется только локальный кэш Postgres.
            // Для реального изменения требуется интеграция с кошельком вашей витрины!
            await state.updateBalance(username, partnerId, Number(balance));

            console.warn(`⚠️ [Admin API] Локальный кэш баланса игрока ${username} изменен на ${balance}. Помните, что бесшовный кошелек может перезаписать это значение при следующем игровом раунде.`);
            res.json({ success: true, warning: "Local cache updated. Seamless wallet may overwrite this value on next spin." });
        } else {
            res.status(400).json({ error: "Missing player credentials or balance value" });
        }
    } catch (err) {
        console.error("❌ [Admin API] Balance cache update failure:", err.message);
        res.status(500).json({ error: "Internal server error" });
    }
};

// 5. Обработчик завершения турнира и распределения призов внутри бренда
exports.endTournament = async (req, res) => {
    try {
        const partnerId = req.partnerId;

        // Завершаем турнир изолированно для этого оператора с выплатами через Postgres SQL
        const winners = await state.endCurrentTournament(partnerId);
        res.json({ success: true, winners });
    } catch (err) {
        console.error("❌ [Admin API] Tournament finalization loop crash:", err.message);
        res.status(500).json({ error: "Tournament finalization loop crash" });
    }
};

// 6. Создание промокода в реестре конкретного партнера
exports.addPromoCode = async (req, res) => {
    try {
        const partnerId = req.partnerId;
        const { code, reward, maxUses } = req.body;

        if (!code || !reward) {
            return res.status(400).json({ error: "Voucher code and reward sum are required" });
        }

        // Сохраняем промокод в Postgres ветку настроек этого партнера
        await state.addPromoCode(partnerId, { code, reward, maxUses });
        res.json({ success: true });
    } catch (err) {
        console.error("❌ [Admin API] Add promo code error:", err.message);
        res.status(400).json({ error: err.message });
    }
};

// 7. Расчет и выплата еженедельного кэшбэка для игроков текущего партнера
exports.runCashback = async (req, res) => {
    try {
        const partnerId = req.partnerId;

        // Расчет и отправка транзакций кэшбэка на удаленный шлюз платформы витрины с фиксацией в Postgres логах
        const report = await state.calculateAndPayCashback(partnerId, seamless.credit);
        res.json({ success: true, report });
    } catch (err) {
        console.error("❌ [Admin API] Cashback distribution process failed:", err.message);
        res.status(500).json({ error: "Cashback distribution process failed" });
    }
};

// 8. Сбор финансового отчета по GGR и NetProfit из таблицы accounting_logs в Postgres
exports.getFinanceReport = async (req, res) => {
    try {
        const partnerId = req.partnerId || "demo_mtwtech";
        const page = parseInt(req.query.page, 10) || 1;
        const limit = parseInt(req.query.limit, 10) || 20;
        const txType = req.query.txType || 'all';
        let fromDate = req.query.fromDate || null;
        let toDate = req.query.toDate || null;

        const ledger = await state.getFinanceDashboardMetrics(partnerId, { fromDate, toDate, txType, limit, page });
        res.json({ success: true, ledger });
    } catch (err) {
        res.status(500).json({ error: "Failed to load ledger table" });
    }
};

exports.getFinanceDashboard = async (req, res) => {
    try {
        const partnerId = req.partnerId || "demo_mtwtech";
        let fromDate = req.query.fromDate || null;
        let toDate = req.query.toDate || null;
        const period = req.query.period;

        if (period) {
            const now = new Date();
            if (period === 'day') fromDate = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
            else if (period === 'week') fromDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
            toDate = now.toISOString();
        }

        const metrics = await state.getFinanceDashboardMetrics(partnerId, { fromDate, toDate });
        res.json({ success: true, metrics });
    } catch (err) {
        res.status(500).json({ error: "Failed to load dashboard metrics" });
    }
};


exports.getBetReport = async (req, res) => {
    try {
        const partnerId = req.partnerId || "demo_mtwtech";

        const page = parseInt(req.query.page, 10) || 1;
        const limit = parseInt(req.query.limit, 10) || 20;
        const category = req.query.category || 'casino';
        const username = req.query.username || null;
        const status = req.query.status || null;

        // Переменные под даты
        let fromDate = req.query.fromDate || null; // Ожидается формат YYYY-MM-DD
        let toDate = req.query.toDate || null;

        // --- ОБРАБОТКА БЫСТРЫХ ПРЕСЕТОВ ДАТ ---
        const period = req.query.period; // 'day', 'week'
        if (period) {
            const now = new Date();
            if (period === 'day') {
                // Последние 24 часа
                fromDate = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
                toDate = now.toISOString();
            } else if (period === 'week') {
                // Последние 7 дней
                fromDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
                toDate = now.toISOString();
            }
        }

        // Если даты переданы строкой (например, "2026-06-01"), для точности СУБД
        // лучше добавить время начала дня для fromDate и конца дня для toDate
        if (fromDate && !fromDate.includes('T')) fromDate += ' 00:00:00';
        if (toDate && !toDate.includes('T')) toDate += ' 23:59:59';

        // Получаем данные из модели
        const reportData = await state.getBetHistory({
            partnerId,
            category,
            username,
            status,
            fromDate,
            toDate,
            limit,
            page
        });

        // Возвращаем отчет, метрики и пагинацию
        res.json({
            success: true,
            category,
            metrics: reportData.metrics, // Финансовые показатели за выбранный период
            report: reportData.items,     // Список ставок с пагинацией
            pagination: reportData.pagination
        });

    } catch (err) {
        console.error("❌ [Admin API] Failed to compile financial metrics:", err.message);
        res.status(500).json({ error: "Failed to compile financial metrics" });
    }
};

exports.getAdminChart = async (req, res) => {
    try {
        const partnerId = req.query.partnerId || "demo_mtwtech";
        const domain = req.query.domain || "";
        const days = req.query.days || 7; // Считываем количество дней

        const analyticsPack = await state.getChartAnalytics(partnerId, domain, days);
        res.json({
            success: true,
            timeline: analyticsPack.timeline,
            shares: analyticsPack.shares
        });
    } catch (err) {
        res.status(500).json({ error: "Failed to compile chart matrix" });
    }
};

exports.getPlayers = async (req, res) => {
    try {
        const partnerId = req.query.partnerId || "demo_mtwtech";
        const page = parseInt(req.query.page, 10) || 1;
        const limit = parseInt(req.query.limit, 10) || 15;
        const search = req.query.search || '';

        const isOnline = req.query.isOnline || '';
        const domain = req.query.domain || '';

        const data = await state.getAdminPlayersList(partnerId, { search, domain, isOnline, page, limit });
        res.json({ success: true, players: data.items, pagination: data.pagination });
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch players" });
    }
};

exports.getPlayersOnline = (req, res) => {
    const partnerId = req.query.partnerId || "demo_mtwtech";

    // Берем все ключи онлайна и фильтруем по текущему B2B партнеру
    const keys = Object.keys(global.onlinePlayers || {});
    const filteredUsers = keys
        .filter(key => key.startsWith(`${partnerId}_`))
        .map(key => key.replace(`${partnerId}_`, "")); // возвращаем только чистые никнеймы

    res.json({
        success: true,
        count: filteredUsers.length,
        users: filteredUsers // Массив игроков, которые прямо сейчас крутят слоты
    });
};

exports.getPlayersOnlineDomain = (req, res) => {
    // Возвращаем объект, где ключи — домены, а значения — массивы игроков онлайн
    res.json({
        success: true,
        matrix: global.onlineByDomains || {}
    });
};

exports.getPlayersAuthLogs = async (req, res) => {
    try {
        const partnerId = req.query.partnerId || "demo_mtwtech";
        const username = req.query.username ? req.query.username.trim() : "";
        const page = parseInt(req.query.page, 10) || 1;
        const limit = parseInt(req.query.limit, 10) || 15;

        const offset = (page - 1) * limit;

        let countQuery = `SELECT COUNT(*)::int as count FROM player_auth_logs WHERE partner_id = $1`;
        let logsQuery = `SELECT id, username, login_type, ip_address, user_agent, domain_name, timestamp 
                         FROM player_auth_logs WHERE partner_id = $1`;

        const queryParams = [partnerId];

        // Если админ указал имя игрока в инпуте — добавляем жесткую фильтрацию
        if (username) {
            queryParams.push(`%${username}%`); // Используем ILIKE для мягкого поиска по буквам
            countQuery += ` AND username ILIKE $2`;
            logsQuery += ` AND username ILIKE $2`;
        }

        // Считаем тотал для пагинации
        const countRes = await global.pool.query(countQuery, queryParams);
        const totalItems = countRes.rows[0]?.count || 0;

        // Добавляем сортировку и пагинацию
        const limitIndex = queryParams.length + 1;
        const offsetIndex = queryParams.length + 2;
        logsQuery += ` ORDER BY timestamp DESC LIMIT $${limitIndex} OFFSET $${offsetIndex}`;
        queryParams.push(limit, offset);

        const logsRes = await global.pool.query(logsQuery, queryParams);

        res.json({
            success: true,
            logs: logsRes.rows,
            pagination: { page, limit, totalItems, totalPages: Math.ceil(totalItems / limit) }
        });
    } catch (err) {
        console.error("❌ Security audit logs fetch crash:", err.message);
        res.status(500).json({ error: "Security pipeline offline" });
    }
};

exports.updatePlayer = async (req, res) => {
    try {
        const partnerId = req.body.partnerId || "demo_mtwtech";
        const { username, isBanned, casinoMin, casinoMax, sportMin, sportMax, balance } = req.body;

        await state.updatePlayerStatus(partnerId, username, { isBanned, casinoMin, casinoMax, sportMin, sportMax, balance });
        res.json({ success: true, message: "Player settings updated successfully" });
    } catch (err) {
        res.status(500).json({ error: "Failed to update player settings" });
    }
};

exports.getPromoCodes = async (req, res) => {
    try {
        const partnerId = req.query.partnerId || "demo_mtwtech";
        const list = await state.getPromoCodesList(partnerId);
        res.json({ success: true, promoCodes: list });
    } catch (err) {
        res.status(500).json({ error: "Failed to load promos" });
    }
};

exports.createPromoCode = async (req, res) => {
    try {
        const { partnerId, code, reward, maxUses } = req.body;
        await state.addPromoCode(partnerId, { code, reward, maxUses });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: "Failed to create promo" });
    }
};

exports.togglePromo = async (req, res) => {
    try {
        const { partnerId, code, currentStatus } = req.body;
        const result = await state.togglePromoStatus(partnerId, code, Number(currentStatus));
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: "Failed to toggle promo state" });
    }
};


exports.triggerCashback = async (req, res) => {
    try {
        const { partnerId, percent } = req.body;
        const totalPaid = await state.runGlobalCashback(partnerId, percent);
        res.json({ success: true, message: `Cashback paid successfully to ${totalPaid} players.` });
    } catch (err) {
        res.status(500).json({ error: "Cashback calculation failure" });
    }
};

exports.getCashbackConfig = async (req, res) => {
    try {
        const partnerId = req.query.partnerId || "demo_mtwtech";
        const partnerConfig = global.CONFIG?.[partnerId] || {};

        // Возвращаем объект настроек по умолчанию, если в базе еще пусто
        const config = partnerConfig.gamification?.cashback || { mode: 'manual', percent: 10 };
        res.json({ success: true, config });
    } catch (err) { res.status(500).json({ error: "Config error" }); }
};

exports.saveCashbackConfig = async (req, res) => {
    try {
        const { partnerId, percent, mode } = req.body;

        if (!global.CONFIG) global.CONFIG = {};
        if (!global.CONFIG[partnerId]) global.CONFIG[partnerId] = {};
        if (!global.CONFIG[partnerId].gamification) global.CONFIG[partnerId].gamification = {};

        // Перезаписываем объект структуры кэшбэка
        global.CONFIG[partnerId].gamification.cashback = {
            mode: mode || 'manual',
            percent: Number(percent || 10)
        };

        await global.pool.query(
            `INSERT INTO b2b_configs (id, config_data) VALUES ('global_config', $1::jsonb)
             ON CONFLICT (id) DO UPDATE SET config_data = b2b_configs.config_data || EXCLUDED.config_data`,
            [JSON.stringify({ [partnerId]: global.CONFIG[partnerId] })]
        );

        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: "Save error" }); }
};


exports.getGamificationConfig = async (req, res) => {
    try {
        const partnerId = req.query.partnerId || "demo_mtwtech";
        const partnerConfig = global.CONFIG?.[partnerId] || {};

        // Отдаем сохраненные настройки или дефолты, если в базе пусто
        const config = partnerConfig.gamification || {
            xpPerGame: 10,
            xpMultiplier: 1000,
            levelUpBonus: 100,
            questTargetGames: 30,
            questReward: 50,
            tournamentActive: 0,
            tournamentPrize: 5000,
            affiliatePercent: 10
        };

        res.json({ success: true, config });
    } catch (err) {
        res.status(500).json({ error: "Failed to load gamification config" });
    }
};

exports.saveGamificationConfig = async (req, res) => {
    try {
        const {
            partnerId, xpPerGame, xpMultiplier, levelUpBonus,
            questTargetGames, questReward, tournamentActive, tournamentPrize, affiliatePercent
        } = req.body;

        if (!global.CONFIG) global.CONFIG = {};
        if (!global.CONFIG[partnerId]) global.CONFIG[partnerId] = {};

        // Сохраняем структуру, не затирая блок cashback, созданный ранее
        const currentCashback = global.CONFIG[partnerId].gamification?.cashback || { mode: 'manual', percent: 10 };

        global.CONFIG[partnerId].gamification = {
            cashback: currentCashback,
            xpPerGame: Number(xpPerGame),
            xpMultiplier: Number(xpMultiplier),
            levelUpBonus: Number(levelUpBonus),
            questTargetGames: Number(questTargetGames),
            questReward: Number(questReward),
            tournamentActive: Number(tournamentActive),
            tournamentPrize: Number(tournamentPrize),
            affiliatePercent: Number(affiliatePercent || 0)
        };

        // Пишем атомарно в Postgres b2b_configs
        await global.pool.query(
            `INSERT INTO b2b_configs (id, config_data) VALUES ('global_config', $1::jsonb)
             ON CONFLICT (id) DO UPDATE SET config_data = b2b_configs.config_data || EXCLUDED.config_data`,
            [JSON.stringify({ [partnerId]: global.CONFIG[partnerId] })]
        );

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: "Failed to save gamification config" });
    }
};

exports.triggerEndTournament = async (req, res) => {
    try {
        const partnerId = req.body.partnerId || "demo_mtwtech";
        // Вызываем переписанный метод из самого первого шага (он начислит призы топ-3 и обнулит очки в Postgres)
        const winners = await state.endCurrentTournament(partnerId);
        res.json({ success: true, winners });
    } catch (err) {
        res.status(500).json({ error: "Tournament finalization failed" });
    }
};

exports.getAdminQuests = async (req, res) => {
    try {
        const partnerId = req.query.partnerId || "demo_mtwtech";
        const result = await global.pool.query(
            `SELECT id, quest_type, target_value::numeric, reward_amount::numeric, description, is_active 
             FROM b2b_quests WHERE partner_id = $1 ORDER BY id DESC`,
            [partnerId]
        );
        res.json({ success: true, quests: result.rows });
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch quests list" });
    }
};

// 1. ТОЛЬКО СОЗДАНИЕ КВЕСТА
exports.createAdminQuest = async (req, res) => {
    try {
        const { partnerId, questType, targetValue, rewardAmount, description } = req.body;

        await global.pool.query(
            `INSERT INTO b2b_quests (partner_id, quest_type, target_value, reward_amount, description)
             VALUES ($1, $2, $3, $4, $5)`,
            [partnerId, questType, Number(targetValue), Number(rewardAmount), description.trim()]
        );
        res.json({ success: true });
    } catch (err) {
        if (err.code === '23505') return res.status(400).json({ error: "Quest type already configured for this partner" });
        res.status(500).json({ error: "Failed to create quest" });
    }
};

// 2. ТОЛЬКО ОБНОВЛЕНИЕ КВЕСТА (По ID)
exports.updateAdminQuest = async (req, res) => {
    try {
        const { id, partnerId, questType, targetValue, rewardAmount, description } = req.body;

        const result = await global.pool.query(
            `UPDATE b2b_quests 
             SET quest_type = $1, target_value = $2, reward_amount = $3, description = $4
             WHERE id = $5 AND partner_id = $6`,
            [questType, Number(targetValue), Number(rewardAmount), description.trim(), Number(id), partnerId]
        );

        if (result.rowCount === 0) return res.status(404).json({ error: "Quest not found" });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: "Failed to update quest template" });
    }
};

exports.deleteAdminQuest = async (req, res) => {
    try {
        const { partnerId, questId } = req.body;
        await global.pool.query(
            'DELETE FROM b2b_quests WHERE partner_id = $1 AND id = $2',
            [partnerId, Number(questId)]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: "Failed to delete quest" });
    }
};

exports.getAdminTournamentsOverview = async (req, res) => {
    try {
        const partnerId = req.query.partnerId || "demo_mtwtech";

        // Получаем текущий активный турнир
        const activeRes = await global.pool.query(
            "SELECT id, title, prize_pool::numeric, min_bet_to_earn::numeric, start_at, end_at FROM b2b_tournaments WHERE partner_id = $1 AND is_active = 1 LIMIT 1",
            [partnerId]
        );

        // Получаем архив последних 10 завершенных турниров
        const archiveRes = await global.pool.query(
            `SELECT title, winner_username, place, points_earned, prize_paid::numeric, ended_at 
             FROM tournament_history WHERE partner_id = $1 ORDER BY id DESC LIMIT 20`,
            [partnerId]
        );

        res.json({
            success: true,
            activeTournament: activeRes.rows[0] || null,
            archive: archiveRes.rows
        });
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch tournament matrix" });
    }
};

exports.createAdminTournament = async (req, res) => {
    try {
        const { partnerId, title, prizePool, minBet, startAt, endAt } = req.body;

        // Принудительно гасим предыдущий активный турнир, если он был, перед созданием нового
        await global.pool.query("UPDATE b2b_tournaments SET is_active = 0 WHERE partner_id = $1 AND is_active = 1", [partnerId]);

        await global.pool.query(
            `INSERT INTO b2b_tournaments (partner_id, title, prize_pool, min_bet_to_earn, start_at, end_at)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [partnerId, title, Number(prizePool), Number(minBet || 0), startAt, endAt]
        );

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: "Failed to deploy tournament template" });
    }
};


// --- КОНТРОЛЛЕРЫ РАЗДЕЛА WEBSITES ---
exports.getWebsites = async (req, res) => {
    try {
        const partnerId = req.query.partnerId || "demo_mtwtech";
        const result = await global.pool.query(
            `SELECT id, domain_name, title, is_active, settings, meta, styles, currency_settings, lang_settings 
             FROM b2b_websites 
             WHERE partner_id = $1 
             ORDER BY id DESC`,
            [partnerId]
        );
        res.json({ success: true, websites: result.rows });
    } catch (err) { res.status(500).json({ error: "Failed to load websites" }); }
};

// 1. ТОЛЬКО СОЗДАНИЕ (Принимает уникальный домен)
exports.createWebsite = async (req, res) => {
    try {
        const { partnerId, domain, title, settings, meta, styles } = req.body;

        await global.pool.query(
            `INSERT INTO b2b_websites (partner_id, domain_name, title, settings, meta, styles) 
             VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb)`,
            [
                partnerId,
                domain.trim().toLowerCase(),
                title.trim(),
                JSON.stringify(settings || {}),
                JSON.stringify(meta || {}),
                JSON.stringify(styles || {})
            ]
        );
        res.json({ success: true });
    } catch (err) {
        if (err.code === '23505') { // Код ошибки уникальности в PostgreSQL
            return res.status(400).json({ error: "Domain already exists for this partner" });
        }
        console.error("❌ Website create error:", err.message);
        res.status(500).json({ error: "Failed to create website" });
    }
};

// 2. ТОЛЬКО ОБНОВЛЕНИЕ (Привязывается строго к id строки)
exports.updateWebsite = async (req, res) => {
    try {
        const { id, partnerId, domain, title, settings, meta, styles } = req.body;

        if (!id) return res.status(400).json({ error: "Missing website ID for update sequence" });

        const result = await global.pool.query(
            `UPDATE b2b_websites 
             SET domain_name = $1, 
                 title = $2, 
                 settings = $3::jsonb, 
                 meta = $4::jsonb, 
                 styles = $5::jsonb
             WHERE id = $6 AND partner_id = $7`,
            [
                domain.trim().toLowerCase(),
                title.trim(),
                JSON.stringify(settings || {}),
                JSON.stringify(meta || {}),
                JSON.stringify(styles || {}),
                Number(id),
                partnerId
            ]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ error: "Website not found or partner access denied" });
        }

        res.json({ success: true });
    } catch (err) {
        if (err.code === '23505') {
            return res.status(400).json({ error: "This domain name is already taken by another brand" });
        }
        console.error("❌ Website update error:", err.message);
        res.status(500).json({ error: "Failed to update website configurations" });
    }
};


exports.deleteWebsite = async (req, res) => {
    try {
        const { partnerId, websiteId } = req.body;
        await global.pool.query(
            'DELETE FROM b2b_websites WHERE partner_id = $1 AND id = $2',
            [partnerId, Number(websiteId)]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: "Failed to delete website" });
    }
};


// --- КОНТРОЛЛЕРЫ РАЗДЕЛА BANNERS ---
exports.getBanners = async (req, res) => {
    try {
        const partnerId = req.query.partnerId || "demo_mtwtech";
        const websiteId = req.query.websiteId || null;

        let query = `SELECT b.*, w.title as website_title 
                     FROM b2b_banners b 
                     JOIN b2b_websites w ON b.website_id = w.id 
                     WHERE b.partner_id = $1`;
        let params = [partnerId];

        if (websiteId) {
            query += ` AND b.website_id = $2`;
            params.push(Number(websiteId));
        }
        query += ` ORDER BY b.website_id, b.banner_type, b.sort_order ASC`;

        const result = await global.pool.query(query, params);
        res.json({ success: true, banners: result.rows });
    } catch (err) { res.status(500).json({ error: "Failed to load banners" }); }
};

// 1. ТОЛЬКО СОЗДАНИЕ БАННЕРА
exports.createBanner = async (req, res) => {
    try {
        const { partnerId, websiteId, bannerType, imageUrl, clickUrl, sortOrder } = req.body;
        await global.pool.query(
            `INSERT INTO b2b_banners (partner_id, website_id, banner_type, image_url, click_url, sort_order) 
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [partnerId, Number(websiteId), bannerType, imageUrl.trim(), clickUrl.trim(), Number(sortOrder || 0)]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: "Failed to create banner" });
    }
};

// 2. ТОЛЬКО ОБНОВЛЕНИЕ БАННЕРА (По первичному ключу ID)
exports.updateBanner = async (req, res) => {
    try {
        const { id, partnerId, websiteId, bannerType, imageUrl, clickUrl, sortOrder } = req.body;

        if (!id) return res.status(400).json({ error: "Missing banner ID" });

        const result = await global.pool.query(
            `UPDATE b2b_banners 
             SET website_id = $1, 
                 banner_type = $2, 
                 image_url = $3, 
                 click_url = $4, 
                 sort_order = $5
             WHERE id = $6 AND partner_id = $7`,
            [Number(websiteId), bannerType, imageUrl.trim(), clickUrl.trim(), Number(sortOrder || 0), Number(id), partnerId]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ error: "Banner not found" });
        }

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: "Failed to update banner" });
    }
};

exports.deleteBanner = async (req, res) => {
    try {
        const { partnerId, bannerId } = req.body;
        await global.pool.query('DELETE FROM b2b_banners WHERE partner_id = $1 AND id = $2', [partnerId, Number(bannerId)]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: "Failed to delete banner" }); }
};


// АДМИНКА: Получить список заявок
exports.getAdminWithdrawalsList = async (req, res) => {
    try {
        const partnerId = req.query.partnerId || "demo_mtwtech";
        const status = req.query.status || 'PENDING';
        const list = await payment.getAdminWithdrawals(partnerId, status);
        res.json({ success: true, requests: list });
    } catch (err) { res.status(500).json({ error: "Failed to load requests" }); }
};

// АДМИНКА: Клик по кнопкам Одобрить / Отклонить
exports.processAdminWithdrawalAction = async (req, res) => {
    try {
        const partnerId = req.body.partnerId || "demo_mtwtech";
        const { requestId, action } = req.body; // action: 'APPROVE' или 'REJECT'

        const result = await payment.processAdminWithdrawal(partnerId, requestId, action);
        if (!result.success) return res.status(400).json(result);

        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: "Failed to process withdrawal node" }); }
};

// Контроллер получения списка инцидентов безопасности
exports.getAdminAlerts = async (req, res) => {
    try {
        const partnerId = req.query.partnerId || "demo_mtwtech";
        const alerts = await state.getNewAntifraudAlerts(partnerId);
        res.json({ success: true, alerts });
    } catch (err) {
        console.error("❌ Error fetching antifraud alerts:", err.message);
        res.status(500).json({ error: "Failed to load risk shield anomalies logs" });
    }
};

// Контроллер закрытия/архивации алерта
exports.dismissAlert = async (req, res) => {
    try {
        const partnerId = req.body.partnerId || "demo_mtwtech";
        const { alertId } = req.body;

        if (!alertId) {
            return res.status(400).json({ error: "Missing alert identifier (alertId)" });
        }

        const success = await state.dismissAntifraudAlertStatus(partnerId, alertId);
        if (!success) {
            return res.status(404).json({ error: "Alert item not found or token mismatched" });
        }

        res.json({ success: true });
    } catch (err) {
        console.error("❌ Error dismissing alert:", err.message);
        res.status(500).json({ error: "Failed to archive security alert node" });
    }
};

exports.getWelcomeBonus = async (req, res) => {
    try {
        const partnerId = req.query.partnerId || "demo_mtwtech";
        const websiteId = req.query.websiteId;

        if (!websiteId) return res.status(400).json({ error: "Missing websiteId parameter" });

        const config = await state.getAdminWelcomeBonusConfig(partnerId, websiteId);
        res.json({ success: true, config });
    } catch (err) {
        res.status(500).json({ error: "Failed to load welcome bonus structure" });
    }
};

exports.saveWelcomeBonus = async (req, res) => {
    try {
        const partnerId = req.body.partnerId || "demo_mtwtech";
        const { websiteId, bonusPercent, wagerMultiplier, minDeposit, maxBonus, isActive } = req.body;

        if (!websiteId) return res.status(400).json({ error: "Missing required websiteId identifier" });

        await state.saveAdminWelcomeBonusConfig(partnerId, {
            websiteId, bonusPercent, wagerMultiplier, minDeposit, maxBonus, isActive
        });

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: "Failed to write welcome bonus payload to Postgres" });
    }
};

// controllers/clanController.js
exports.getAdminClanQuests = async (req, res) => {
    try {
        const partnerId = req.query.partnerId || "demo_mtwtech";

        // Список созданных квестов
        const quests = await global.pool.query(
            `SELECT id, title, target_turnover::numeric, reward_pool::numeric, expires_at, is_active 
             FROM b2b_clan_quests WHERE partner_id = $1 ORDER BY id DESC`,
            [partnerId]
        );

        // Статистика по созданным кланам в системе
        const clans = await global.pool.query(
            `SELECT c.id, c.clan_name, c.owner_username, c.clan_level, c.clan_xp, COUNT(m.id)::int as members_count 
             FROM b2b_clans c
             LEFT JOIN b2b_clan_members m ON c.id = m.clan_id
             WHERE c.partner_id = $1
             GROUP BY c.id ORDER BY c.clan_level DESC, c.clan_xp DESC`,
            [partnerId]
        );

        res.json({ success: true, quests: quests.rows, clans: clans.rows });
    } catch (err) {
        res.status(500).json({ error: "Failed to load guild engine matrices" });
    }
};

exports.createAdminClanQuest = async (req, res) => {
    try {
        const { partnerId, title, targetTurnover, rewardPool, expiresAt } = req.body;

        // Принудительно деактивируем прошлые клановые квесты, чтобы активным был только один
        await global.pool.query("UPDATE b2b_clan_quests SET is_active = 0 WHERE partner_id = $1 AND is_active = 1", [partnerId]);

        await global.pool.query(
            `INSERT INTO b2b_clan_quests (partner_id, title, target_turnover, reward_pool, expires_at) 
             VALUES ($1, $2, $3, $4, $5)`,
            [partnerId, title.trim(), Number(targetTurnover), Number(rewardPool), expiresAt]
        );

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: "Failed to deploy guild quest node" });
    }
};

exports.getAdminAchievements = async (req, res) => {
    try {
        const partnerId = req.query.partnerId || "demo_mtwtech";
        const result = await global.pool.query(
            'SELECT id, title, description, badge_icon, condition_type, target_value::numeric, reward_amount::numeric FROM b2b_achievements WHERE partner_id = $1 ORDER BY id DESC',
            [partnerId]
        );
        res.json({ success: true, achievements: result.rows });
    } catch (err) { res.status(500).json({ error: "Failed to load achievements dictionary" }); }
};

// 1. ТОЛЬКО СОЗДАНИЕ АЧИВКИ
exports.createAdminAchievement = async (req, res) => {
    try {
        const { partnerId, title, description, badgeIcon, conditionType, targetValue, rewardAmount } = req.body;

        await global.pool.query(
            `INSERT INTO b2b_achievements (partner_id, title, description, badge_icon, condition_type, target_value, reward_amount)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [partnerId, title.trim(), description.trim(), badgeIcon.trim(), conditionType, Number(targetValue), Number(rewardAmount)]
        );
        res.json({ success: true });
    } catch (err) {
        if (err.code === '23505') return res.status(400).json({ error: "Achievement title already exists" });
        res.status(500).json({ error: "Failed to create achievement template" });
    }
};

// 2. ТОЛЬКО ОБНОВЛЕНИЕ АЧИВКИ (По ID)
exports.updateAdminAchievement = async (req, res) => {
    try {
        const { id, partnerId, title, description, badgeIcon, conditionType, targetValue, rewardAmount } = req.body;

        const result = await global.pool.query(
            `UPDATE b2b_achievements 
             SET title = $1, description = $2, badge_icon = $3, condition_type = $4, target_value = $5, reward_amount = $6
             WHERE id = $7 AND partner_id = $8`,
            [title.trim(), description.trim(), badgeIcon.trim(), conditionType, Number(targetValue), Number(rewardAmount), Number(id), partnerId]
        );

        if (result.rowCount === 0) return res.status(404).json({ error: "Achievement template not found" });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: "Failed to update achievement template" });
    }
};


exports.deleteAdminAchievement = async (req, res) => {
    try {
        const { partnerId, achievementId } = req.body;
        await global.pool.query(
            'DELETE FROM b2b_achievements WHERE partner_id = $1 AND id = $2',
            [partnerId, Number(achievementId)]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: "Failed to delete achievement badge" });
    }
};


// 1. Получить настройки языков и сам JSON-пакет конкретного перевода
exports.getWebsiteTranslationConfig = async (req, res) => {
    try {
        const partnerId = req.query.partnerId || "demo_mtwtech";
        const websiteId = Number(req.query.websiteId);
        const langCode = req.query.langCode || "en";

        if (!websiteId) return res.status(400).json({ error: "Missing websiteId" });

        // Тянем настройки языков из таблицы сайтов
        const webRes = await global.pool.query(
            'SELECT lang_settings FROM b2b_websites WHERE id = $1 AND partner_id = $2',
            [websiteId, partnerId]
        );
        const langSettings = typeof webRes.rows[0]?.lang_settings === 'string'
            ? JSON.parse(webRes.rows[0].lang_settings)
            : (webRes.rows[0]?.lang_settings || { supported_langs: ["en"], default_lang: "en" });

        // Тянем конкретный языковой JSON-пакет
        const transRes = await global.pool.query(
            'SELECT payload FROM b2b_website_translations WHERE website_id = $1 AND lang_code = $2',
            [websiteId, langCode]
        );

        // Если перевода в базе еще нет — отдаем пустую заготовку структуры
        const payload = transRes.rowCount > 0
            ? (typeof transRes.rows[0].payload === 'string' ? JSON.parse(transRes.rows[0].payload) : transRes.rows[0].payload)
            : { header: { links: {}, buttons: {}, balance: {} }, auth: {} };

        res.json({ success: true, langSettings, payload });
    } catch (err) {
        res.status(500).json({ error: "Failed to load translations config" });
    }
};

// 2. Сохранить настройки языков сайта и JSON-пакет (Upsert)
exports.saveWebsiteTranslationConfig = async (req, res) => {
    try {
        const partnerId = req.body.partnerId || "demo_mtwtech";
        const { websiteId, langCode, langSettings, payload } = req.body;

        if (!websiteId || !langCode) return res.status(400).json({ error: "Missing required parameters" });

        // 1. Обновляем массив поддерживаемых языков в b2b_websites
        await global.pool.query(
            'UPDATE b2b_websites SET lang_settings = $1::jsonb WHERE id = $2 AND partner_id = $3',
            [JSON.stringify(langSettings), Number(websiteId), partnerId]
        );

        // 2. Записываем или обновляем сам языковой JSON-пакет
        await global.pool.query(
            `INSERT INTO b2b_website_translations (partner_id, website_id, lang_code, payload)
             VALUES ($1, $2, $3, $4::jsonb)
             ON CONFLICT (website_id, lang_code) 
             DO UPDATE SET payload = EXCLUDED.payload`,
            [partnerId, Number(websiteId), langCode, JSON.stringify(payload)]
        );

        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to write translations to database" });
    }
};


exports.getAdminOnlineAnalytics = async (req, res) => {
    try {
        const partnerId = req.query.partnerId || "demo_mtwtech";
        const { domain, period = 'hours' } = req.query; // period может быть 'hours' (за последние 24ч) или 'days' (за месяц)

        if (!domain) return res.status(400).json({ error: "domain parameter is required" });

        let selectTimeFormat = "date_trunc('hour', timestamp)"; // Группировка по часам по дефолту
        let timeInterval = "INTERVAL '24 hours'";

        if (period === 'days') {
            selectTimeFormat = "date_trunc('day', timestamp)"; // Группировка по дням
            timeInterval = "INTERVAL '30 days'";
        }

        // Берем среднее и максимальное значение онлайна за каждый отрезок времени
        const result = await global.pool.query(`
            SELECT 
                ${selectTimeFormat} as timeframe,
                MAX(online_count)::int as max_online,
                AVG(online_count)::int as avg_online
            FROM b2b_online_snapshots
            WHERE partner_id = $1 AND domain_name = $2 AND timestamp >= NOW() - ${timeInterval}
            GROUP BY timeframe
            ORDER BY timeframe ASC
        `, [partnerId, domain.toLowerCase().trim()]);

        res.json({ success: true, period, analytics: result.rows });
    } catch (err) {
        console.error("❌ Analytics fetch error:", err.message);
        res.status(500).json({ error: "Failed to compile time-series metrics" });
    }
};


exports.getAdminJackpots = async (req, res) => {
    try {
        const partnerId = req.query.partnerId || "demo_mtwtech";
        const result = await global.pool.query(
            `SELECT id, level_name, current_amount::numeric, start_amount::numeric, 
                    trigger_amount::numeric, fee_percent::numeric, is_active 
             FROM b2b_jackpots 
             WHERE partner_id = $1 
             ORDER BY id ASC`,
            [partnerId]
        );
        res.json({ success: true, jackpots: result.rows });
    } catch (err) {
        res.status(500).json({ error: "Failed to load jackpot matrix" });
    }
};

// 2. Сохранить измененные параметры конкретного уровня джекпота (Update по ID)
exports.saveAdminJackpotRow = async (req, res) => {
    try {
        const { id, partnerId, currentAmount, startAmount, triggerAmount, feePercent, isActive } = req.body;

        const result = await global.pool.query(
            `UPDATE b2b_jackpots 
             SET current_amount = $1, start_amount = $2, trigger_amount = $3, fee_percent = $4, is_active = $5
             WHERE id = $6 AND partner_id = $7`,
            [Number(currentAmount), Number(startAmount), Number(triggerAmount), Number(feePercent), Number(isActive), Number(id), partnerId]
        );

        if (result.rowCount === 0) return res.status(404).json({ error: "Jackpot pool node not found" });

        // Если джекпот обновили, сразу шлем свежий пульс по сокетам, чтобы на витрине цифры изменились мгновенно
        if (global.io) {
            const freshRes = await global.pool.query('SELECT level_name, current_amount::numeric FROM b2b_jackpots WHERE partner_id = $1 AND is_active = 1', [partnerId]);
            const syncPack = {};
            freshRes.rows.forEach(r => syncPack[r.level_name.toLowerCase()] = Number(r.current_amount));
            global.io.emit(`jackpot_pulse_${partnerId}`, syncPack);
        }

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: "Failed to update progressive jackpot configuration" });
    }
};
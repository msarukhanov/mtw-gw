const state = require('../state');
const seamless = require('../services/seamlessService');

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

        // Получаем параметры дат из query-запроса
        let fromDate = req.query.fromDate || null; // Ожидается "YYYY-MM-DD"
        let toDate = req.query.toDate || null;
        const period = req.query.period;           // Пресеты: 'day' или 'week'

        // --- АВТОМАТИЧЕСКИЕ ПРЕСЕТЫ ВРЕМЕНИ ---
        if (period) {
            const now = new Date();
            if (period === 'day') {
                fromDate = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
                toDate = now.toISOString();
            } else if (period === 'week') {
                fromDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
                toDate = now.toISOString();
            }
        }

        const txType = req.query.txType || 'all';
        const report = await state.getFinancialReport(partnerId, { fromDate, toDate, txType });

        res.json({ success: true, report });
    } catch (err) {
        console.error("❌ [Admin API] Failed to compile financial metrics:", err.message);
        res.status(500).json({ error: "Failed to compile financial metrics" });
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
        const partnerId = req.partnerId || "demo_mtwtech";
        const timeline = await state.getChartAnalytics(partnerId);
        res.json({ success: true, timeline });
    } catch (err) {
        console.error("❌ [Admin API] Chart compilation failed:", err.message);
        res.status(500).json({ error: "Failed to compile chart data" });
    }
};




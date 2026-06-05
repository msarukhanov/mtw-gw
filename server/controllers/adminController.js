const state = require('../state');
const seamless = require('../services/seamlessService');

// 1. Отдаем все данные одним пакетом для фронтенда админки (Строго для текущего partnerId)
exports.getAdminData = async (req, res) => {
    try {
        // Забираем partnerId, который прописал твой мидлвар авторизации админа из его токена
        const partnerId = req.partnerId;

        const config = state.getConfig(partnerId);
        const jackpot = state.getJackpot(partnerId);
        const players = await state.getAllPlayers(partnerId);

        res.json({ config, jackpot, players });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Core data aggregation failure" });
    }
};

// 2. Обработчик изменения конфига (RTP и Стоимость) с привязкой к партнеру
// ИСПРАВЛЕНО: Добавлен async и цикл for...of для поддержки работы с диском
exports.updateConfig = async (req, res) => {
    try {
        const partnerId = req.partnerId;

        for (const key of Object.keys(req.body)) {
            const [game, param] = key.split('_');
            if (game && param) {
                // Вызываем асинхронный метод обновления конфига конкретного партнера
                await state.updateConfigParam(partnerId, game, param, req.body[key]);
            }
        }
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Configuration save failure" });
    }
};

// 3. Обработчик изменения джекпота конкретного партнера
exports.updateJackpot = (req, res) => {
    const partnerId = req.partnerId;

    if (req.body.jackpot !== undefined) {
        state.setJackpot(partnerId, req.body.jackpot);
        res.json({ success: true });
    } else {
        res.status(400).json({ error: "Invalid pool parameters" });
    }
};

// 4. Обработчик изменения локального баланса игрока
exports.updateBalance = async (req, res) => {
    const partnerId = req.partnerId;
    const { username, balance } = req.body;

    if (username && balance !== undefined) {
        // Обновляем баланс конкретного игрока конкретного партнера
        await state.updateBalance(username, partnerId, Number(balance));
        res.json({ success: true });
    } else {
        res.status(400).json({ error: "Missing player credentials or balance value" });
    }
};

// 5. Обработчик завершения турнира и распределения призов внутри бренда
exports.endTournament = async (req, res) => {
    try {
        const partnerId = req.partnerId;

        // Завершаем турнир изолированно для этого оператора
        const winners = await state.endCurrentTournament(partnerId);
        res.json({ success: true, winners });
    } catch (err) {
        console.error(err);
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

        // Сохраняем промокод в ветку настроек этого партнера
        await state.addPromoCode(partnerId, { code, reward, maxUses });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// 7. Расчет и выплата еженедельного кэшбэка для игроков текущего партнера
exports.runCashback = async (req, res) => {
    try {
        const partnerId = req.partnerId;

        // Передаем partnerId и метод кредита для отправки транзакций на правильный шлюз
        const report = await state.calculateAndPayCashback(partnerId, seamless.credit);
        res.json({ success: true, report });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Cashback distribution process failed" });
    }
};

exports.getFinanceReport = async (req, res) => {
    try {
        const partnerId = req.partnerId || "demo_skin_default";
        const report = await state.getFinancialReport(partnerId);
        res.json({ success: true, report });
    } catch (err) {
        res.status(500).json({ error: "Failed to compile financial metrics" });
    }
};
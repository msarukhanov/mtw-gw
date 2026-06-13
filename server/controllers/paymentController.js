const crypto = require('crypto');
const paymentService = require('../services/paymentService');

// 1. Создание инвойса (Вызывается из кассы игрока)
exports.initiateDeposit = async (req, res) => {
    const client = await global.pool.connect();
    try {
        const { username, partnerId } = req; // из checkPlayer middleware
        const { amount, gateway } = req.body; // gateway: 'cryptomus' или 'aaio'

        if (!amount || Number(amount) <= 0) return res.status(400).json({ error: "Invalid amount" });

        const originHeader = req.headers.origin || req.headers.referer || '';
        let detectedDomain = 'localhost';
        if (originHeader && originHeader.startsWith('http')) {
            const parsedUrl = new URL(originHeader);
            detectedDomain = parsedUrl.hostname.toLowerCase();
        }

        // 🔒 УРОВЕНЬ 2: Вытягиваем конфигурацию валют и шлюзов этого домена из Postgres
        const siteRes = await global.pool.query(
            'SELECT id, currency_settings, settings FROM b2b_websites WHERE partner_id = $1 AND domain_name = $2 AND is_active = 1 LIMIT 1',
            [partnerId, detectedDomain]
        );

        if (siteRes.rowCount === 0) {
            return res.status(400).json({ success: false, error: "BRAND_MISMATCH", message: "This brand domain configuration not found" });
        }

        const siteRow = siteRes.rows[0];
        const siteSettings = typeof siteRow.settings === 'string' ? JSON.parse(siteRow.settings) : (siteRow.settings || {});
        const curCfg = typeof siteRow.currency_settings === 'string' ? JSON.parse(siteRow.currency_settings) : (siteRow.currency_settings || {});

        // 🔒 УРОВЕНЬ 3: Проверяем, включен ли этот шлюз в глобальных чекбоксах сайта (TAB 10)
        const allowedGateways = siteSettings.gateways || {};
        if (allowedGateways[gateway] === false) {
            return res.status(400).json({ success: false, error: "GATEWAY_DISABLED", message: `The gateway ${gateway.toUpperCase()} is disabled for this website brand.` });
        }

        // 2. Считываем активную валюту игрока из "горячего кэша" [INDEX]
        const playerRes = await global.pool.query('SELECT current_currency FROM players WHERE username = $1 AND partner_id = $2', [username, partnerId]);
        const activeCurrency = playerRes.rows[0]?.current_currency || 'USD';

        // 3. 🎯 КРИТИЧЕСКАЯ ПРОВЕРКА ЛИМИТОВ ИЗ ТВОЕЙ ДИНАМИЧЕСКОЙ МАТРИЦЫ [INDEX]
        // Проверяем глобальный тумблер активности шлюза

        // 🔒 УРОВЕНЬ 4: Находим лимиты выплаты для пары ШЛЮЗ + ВАЛЮТА

        const gatewayConfig = curCfg.gateways?.[gateway] || { is_active: true, limits: {} };

// 🔒 ЖЕСТКИЙ РУБИЛЬНИК: Если админ снял галочку в модалке, блокируем трансляцию шлюза намертво! [INDEX]
        if (gatewayConfig.is_active === false) {
            return res.status(400).json({
                success: false,
                error: "GATEWAY_DISABLED",
                message: `The payment channel ${gateway.toUpperCase()} is completely disabled by the brand administrator.`
            });
        }

// Вытаскиваем лимиты из вложенного объекта limits [INDEX]
        const gatewayLimits = gatewayConfig.limits?.[activeCurrency] || { min_dep: 10, max_dep: 5000 };

        const inputAmount = Number(amount);

        if (inputAmount < Number(gatewayLimits.min_dep)) {
            return res.status(400).json({ success: false, error: "LIMIT_ERROR", message: `Minimum deposit for ${gateway.toUpperCase()} via ${activeCurrency} is ${gatewayLimits.min_dep}` });
        }
        if (inputAmount > Number(gatewayLimits.max_dep)) {
            return res.status(400).json({ success: false, error: "LIMIT_ERROR", message: `Maximum deposit for ${gateway.toUpperCase()} via ${activeCurrency} is ${gatewayLimits.max_dep}` });
        }

        // Генерируем уникальный UUID для транзакции платежки
        const orderUuid = `dep_${crypto.randomBytes(8).toString('hex')}`;

        // Пишем транзакцию со статусом PENDING в СУБД
        await global.pool.query(
            `INSERT INTO deposit_orders (partner_id, username, order_uuid, gateway, amount) VALUES ($1, $2, $3, $4, $5)`,
            [partnerId, username, orderUuid, gateway, Number(amount)]
        );

        let paymentUrl = null;

        if (gateway === 'cryptomus') {
            paymentUrl = await paymentService.createCryptomusInvoice(orderUuid, amount);
        } else if (gateway === 'aaio') {
            paymentUrl = await paymentService.createAaioInvoice(orderUuid, amount);
        } else if (gateway === 'pix') {
            paymentUrl = await paymentService.createPixInvoice(orderUuid, amount); // <-- ЛАТАМ (PIX)
        } else if (gateway === 'payeer') {
            paymentUrl = await paymentService.createPayeerInvoice(orderUuid, amount); // <-- PAYEER
        } else if (gateway === 'flutterwave') {
            // Вызов нового метода для Африки
            paymentUrl = await paymentService.createFlutterwaveInvoice(orderUuid, amount, username);
        } else if (gateway === 'vodafone') {
            // Вызов нового метода для MENA
            paymentUrl = await paymentService.createVodafoneInvoice(orderUuid, amount);
        }


        if (!paymentUrl) return res.status(500).json({ error: "Failed to generate payment url" });

        res.json({ success: true, paymentUrl });

    } catch (err) {
        console.error("Deposit init failed:", err.message);
        res.status(500).json({ error: "Payment gateway connection timeout" });
    }
};

// ИГРОК: Создать запрос на вывод
exports.initiateWithdraw2222 = async (req, res) => {
    try {
        const { username, partnerId, sessionId } = req; // из checkPlayer
        const { amount, gateway, walletDetails } = req.body;

        if (!amount || Number(amount) <= 0 || !walletDetails) {
            return res.status(400).json({ error: "Missing required payout fields" });
        }

        const result = await state.createWithdrawRequest(username, partnerId, sessionId, amount, gateway, walletDetails);
        if (!result.success) return res.status(400).json(result);

        res.json(result);
    } catch (err) { res.status(500).json({ error: "Withdraw sequence timeout" }); }
};

exports.initiateWithdraw = async (req, res) => {
    const client = await global.pool.connect();
    try {
        // [АНТИФРОД ФИЛЬТР ВНУТРЬ ИНИЦИАЛИЗАЦИИ ВЫВОДА playerWithdrawInit]
        // [ИНТЕГРАЦИЯ СУБД МЕТОДА ВНУТРЬ ПРОВЕРКИ playerWithdrawInit]
        try {
            const depositCheck = await global.pool.query(
                `SELECT 
                    (SELECT COALESCE(SUM(amount), 0) FROM deposit_orders WHERE username = $1 AND partner_id = $2 AND status = 'SUCCESS') as total_deps,
                    (SELECT COALESCE(SUM(amount), 0) FROM accounting_logs WHERE username = $1 AND partner_id = $2 AND type = 'DEBIT') as total_bets,
                    (SELECT timestamp FROM deposit_orders WHERE username = $1 AND partner_id = $2 AND status = 'SUCCESS' ORDER BY timestamp DESC LIMIT 1) as last_dep_time`,
                [username, partnerId]
            );

            const fraudData = depositCheck.rows[0] || {};
            const totalDeps = Number(fraudData.total_deps || 0);
            const totalBets = Number(fraudData.total_bets || 0);
            const lastDepTime = fraudData.last_dep_time ? new Date(fraudData.last_dep_time) : null;

            // Проверяем Критерий 1: Нулевой оборот (Вывод без игры)
            if (totalDeps > 0 && totalBets < totalDeps) {
                const desc = `User attempts layout drain. Turnover: ${totalBets} 🪙. Total Deposits: ${totalDeps} 🪙. High liquidity laundering risk factor.`;
                // Вызываем наш новый боевой метод модели Postgres!
                await state.logAntifraudAlert(partnerId, username, 'ZERO_TURNOVER', 75, desc);
            }

            // Проверяем Критерий 2: Мгновенный скоростной вывод
            if (lastDepTime && (new Date() - lastDepTime) < 15 * 60 * 1000) {
                const desc = `Immediate velocity withdrawal cashout request triggered less than 15 minutes after successful checkout deposit transaction node.`;
                await state.logAntifraudAlert(partnerId, username, 'SPEED_WITHDRAW', 60, desc);
            }

        } catch (frErr) {
            console.error("❌ Security shield analysis runtime failure:", frErr.message);
        }


        const { username, partnerId, sessionId } = req; // Из middleware checkPlayer
        const { amount, gateway, walletDetails } = req.body;

        const originHeader = req.headers.origin || req.headers.referer || '';
        let detectedDomain = 'localhost';
        if (originHeader && originHeader.startsWith('http')) {
            const parsedUrl = new URL(originHeader);
            detectedDomain = parsedUrl.hostname.toLowerCase();
        }

        // 🔒 УРОВЕНЬ 2: Вытягиваем конфигурацию валют и шлюзов этого домена из Postgres
        const siteRes = await global.pool.query(
            'SELECT id, currency_settings, settings FROM b2b_websites WHERE partner_id = $1 AND domain_name = $2 AND is_active = 1 LIMIT 1',
            [partnerId, detectedDomain]
        );

        if (siteRes.rowCount === 0) {
            return res.status(400).json({ success: false, error: "BRAND_MISMATCH", message: "This brand domain configuration not found" });
        }

        const siteRow = siteRes.rows[0];
        const siteSettings = typeof siteRow.settings === 'string' ? JSON.parse(siteRow.settings) : (siteRow.settings || {});
        const curCfg = typeof siteRow.currency_settings === 'string' ? JSON.parse(siteRow.currency_settings) : (siteRow.currency_settings || {});

        // 🔒 УРОВЕНЬ 3: Проверяем, включен ли этот шлюз в глобальных чекбоксах сайта (TAB 10)
        const allowedGateways = siteSettings.gateways || {};
        if (allowedGateways[gateway] === false) {
            return res.status(400).json({ success: false, error: "GATEWAY_DISABLED", message: `The gateway ${gateway.toUpperCase()} is disabled for this website brand.` });
        }

        await client.query('BEGIN');

        // 1. Блокируем игрока и берем его баланс и валюту из горячего кэша [INDEX]
        const pRes = await client.query('SELECT balance, current_currency, is_banned FROM players WHERE username = $1 AND partner_id = $2 FOR UPDATE', [username, partnerId]);
        const player = pRes.rows[0];

        if (pRes.rowCount === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: "Player not found" });
        }

        if (player.is_banned) {
            await client.query('ROLLBACK');
            return res.status(403).json({ error: "ACCOUNT_BANNED" });
        }

        const currentBalance = Number(player.balance);
        const activeCurrency = player.current_currency;

        const gatewayConfig = curCfg.gateways?.[gateway] || { is_active: true, limits: {} };

// 🔒 ЖЕСТКИЙ РУБИЛЬНИК: Если админ снял галочку в модалке, блокируем трансляцию шлюза намертво! [INDEX]
        if (gatewayConfig.is_active === false) {
            return res.status(400).json({
                success: false,
                error: "GATEWAY_DISABLED",
                message: `The payment channel ${gateway.toUpperCase()} is completely disabled by the brand administrator.`
            });
        }

        // 🔒 УРОВЕНЬ 4: Находим лимиты выплаты для пары ШЛЮЗ + ВАЛЮТА
        const gatewayLimits = gatewayConfig.limits?.[activeCurrency] || { min_out: 20, max_out: 2000 };
        const withdrawAmount = Number(amount);

        if (withdrawAmount < Number(gatewayLimits.min_out)) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: "LIMIT_ERROR", message: `Minimum withdrawal for ${gateway.toUpperCase()} via ${activeCurrency} is ${gatewayLimits.min_out}` });
        }
        if (withdrawAmount > Number(gatewayLimits.max_out)) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: "LIMIT_ERROR", message: `Maximum withdrawal for ${gateway.toUpperCase()} via ${activeCurrency} is ${gatewayLimits.max_out}` });
        }

        // Вытаскиваем IP для логирования инвойса
        const ipAddress = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress || '0.0.0.0';

        if (Number(player.balance) < withdrawAmount) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: "INSUFFICIENT_FUNDS" });
        }

        if (!withdrawAmount || withdrawAmount <= 0 || !walletDetails) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: "Missing required payout fields" });
        }

        // 2. Списываем баланс в локальной БД
        const newBalance = currentBalance - withdrawAmount;
        await client.query(
            'UPDATE players SET balance = $1 WHERE username = $2 AND partner_id = $3',
            [newBalance, username, partnerId]
        );

        // 3. Создаем одну атомарную запись в withdraw_requests
        await client.query(
            `INSERT INTO withdraw_requests (partner_id, username, amount, gateway, wallet_details, status) 
             VALUES ($1, $2, $3, $4, $5, 'PENDING')`,
            [partnerId, username, withdrawAmount, gateway, walletDetails.trim()]
        );

        // 4. Логируем в историю игрока
        await client.query(
            `INSERT INTO player_history (username, partner_id, category, action_type, description, amount_change)
             VALUES ($1, $2, 'system', 'withdraw_req', $3, $4)`,
            [username, partnerId, `Withdraw request via ${gateway.toUpperCase()}`, -withdrawAmount]
        );

        await client.query('COMMIT');
        res.json({ success: true, balance: newBalance, message: "Withdrawal request created successfully." });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error("❌ Withdraw error:", err.message);
        res.status(500).json({ error: "Failed to create withdraw transaction" });
    } finally {
        client.release();
    }
};




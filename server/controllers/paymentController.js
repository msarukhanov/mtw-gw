const crypto = require('crypto');
const paymentService = require('../services/paymentService');

// 1. Создание инвойса (Вызывается из кассы игрока)
exports.initiateDeposit = async (req, res) => {
    try {
        const { username, partnerId } = req; // из checkPlayer middleware
        const { amount, gateway } = req.body; // gateway: 'cryptomus' или 'aaio'

        if (!amount || Number(amount) <= 0) return res.status(400).json({ error: "Invalid amount" });

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

        const withdrawAmount = Number(amount);
        if (!withdrawAmount || withdrawAmount <= 0 || !walletDetails) {
            return res.status(400).json({ error: "Missing required payout fields" });
        }

        await client.query('BEGIN');

        // 1. Проверяем баланс игрока под блокировкой FOR UPDATE
        const pRes = await client.query(
            'SELECT balance FROM players WHERE username = $1 AND partner_id = $2 FOR UPDATE',
            [username, partnerId]
        );
        if (pRes.rowCount === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: "Player not found" });
        }

        const currentBalance = Number(pRes.rows[0].balance);
        if (currentBalance < withdrawAmount) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: "INSUFFICIENT_FUNDS", message: "You don't have enough coins." });
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




const crypto = require('crypto');
const axios = require('axios');

// Замени на свои боевые ключи в .env файле
const CRYPTOMUS_MERCHANT_ID = process.env.CRYPTOMUS_MERCHANT_ID || 'your_cryptomus_merchant_id';
const CRYPTOMUS_API_KEY = process.env.CRYPTOMUS_API_KEY || 'your_cryptomus_api_key';

const AAIO_MERCHANT_ID = process.env.AAIO_MERCHANT_ID || 'your_aaio_merchant_id';
const AAIO_SECRET_1 = process.env.AAIO_SECRET_1 || 'your_aaio_secret_1';
const AAIO_API_KEY = process.env.AAIO_API_KEY || 'your_aaio_api_key';

// Добавь эти переменные в свой файл services/paymentService.js
const PAYEER_SHOP_ID = process.env.PAYEER_SHOP_ID || 'your_payeer_shop_id';
const PAYEER_SECRET_KEY = process.env.PAYEER_SECRET_KEY || 'your_payeer_secret_key';

const PIX_MERCHANT_ID = process.env.PIX_MERCHANT_ID || 'your_pix_merchant_id';
const PIX_SECRET_KEY = process.env.PIX_SECRET_KEY || 'your_pix_secret_key';

const FLUTTERWAVE_SECRET_KEY = process.env.FLUTTERWAVE_SECRET_KEY || 'FLWSECK_your_test_key';

const VODAFONE_MERCHANT_ID = process.env.VODAFONE_MERCHANT_ID || 'your_vodafone_id';
const VODAFONE_SECRET_KEY = process.env.VODAFONE_SECRET_KEY || 'your_vodafone_secret';

module.exports = {
    // 🪙 ИНТЕГРАЦИЯ CRYPTOMUS (Крипта)
    createCryptomusInvoice: async (orderId, amount, currency = 'USD') => {
        const payload = {
            amount: Number(amount).toFixed(2),
            currency: currency,
            order_id: orderId, // Передаем наш внутренний UUID заказа
            url_callback: `${process.env.SERVER_URL}/api/callback/cryptomus` // Сюда прилетит вебхук
        };

        // Хэширование подписи Cryptomus: md5(base64_encode(json_payload) + api_key)
        const signData = Buffer.from(JSON.stringify(payload)).toString('base64') + CRYPTOMUS_API_KEY;
        const sign = crypto.createHash('md5').update(signData).digest('hex');

        const res = await axios.post('https://cryptomus.com', payload, {
            headers: {
                'merchant': CRYPTOMUS_MERCHANT_ID,
                'sign': sign,
                'Content-Type': 'application/json'
            }
        });

        // Возвращает объект с url для оплаты: { result: { url: '...' } }
        return res.data?.result?.url || null;
    },

    // 💳 ИНТЕГРАЦИЯ AAIO (Карты и СБП)
    createAaioInvoice: async (orderId, amount, currency = 'RUB') => {
        const orderAmount = Number(amount).toFixed(2);

        // Хэширование подписи Aaio: SHA256(merchant_id + amount + currency + secret_1 + order_id)
        const signData = `${AAIO_MERCHANT_ID}:${orderAmount}:${currency}:${AAIO_SECRET_1}:${orderId}`;
        const sign = crypto.createHash('sha256').update(signData).digest('hex');

        const params = new URLSearchParams({
            merchant_id: AAIO_MERCHANT_ID,
            amount: orderAmount,
            currency: currency,
            order_id: orderId,
            sign: sign,
            desc: `Deposit balance for user order`,
            lang: 'en'
        });

        // Aaio генерирует ссылку методом конкатенации строки параметров
        return `https://aaio.so{params.toString()}`;
    },

    createPixInvoice: async (orderId, amount, currency = 'BRL') => {
        // На Латаме валюта — бразильский реал (BRL)
        const orderAmount = Number(amount).toFixed(2);

        const payload = {
            merchant_id: PIX_MERCHANT_ID,
            order_id: orderId,
            amount: orderAmount,
            currency: currency,
            payment_method: 'PIX',
            callback_url: `${process.env.SERVER_URL}/api/callback/pix`
        };

        // Подпись: SHA256(merchant_id + order_id + amount + secret_key)
        const signData = `${PIX_MERCHANT_ID}:${orderId}:${orderAmount}:${PIX_SECRET_KEY}`;
        const sign = crypto.createHash('sha256').update(signData).digest('hex');

        // Отправляем запрос на шлюз для получения QR-кода PIX
        const res = await axios.post('https://latampay-gateway.com', { ...payload, sign });

        // Возвращает ссылку на платежную страницу с QR-кодом PIX
        return res.data?.payment_url || null;
    },

    // 🌍 ИНТЕГРАЦИЯ PAYEER (Универсальный кошелек для LATAM/ASIA)
    createPayeerInvoice: async (orderId, amount, currency = 'USD') => {
        const orderAmount = Number(amount).toFixed(2);

        // Формируем описание платежа в base64
        const desc = Buffer.from(`Deposit order ${orderId}`).toString('base64');

        // Подпись Payeer: SHA256(shop_id + order_id + amount + currency + desc + secret_key)
        const signData = `${PAYEER_SHOP_ID}:${orderId}:${orderAmount}:${currency}:${desc}:${PAYEER_SECRET_KEY}`;
        const sign = crypto.createHash('sha256').update(signData).digest('hex').toUpperCase();

        const params = new URLSearchParams({
            m_shop: PAYEER_SHOP_ID,
            m_orderid: orderId,
            m_amount: orderAmount,
            m_curr: currency,
            m_desc: desc,
            m_sign: sign,
            lang: 'en'
        });

        return `https://payeer.com{params.toString()}`;
    },

    createFlutterwaveInvoice: async (orderId, amount, username, currency = 'NGN') => {
        // В Нигерии основная валюта — Найра (NGN). Сумму округляем до целых
        const orderAmount = Math.floor(amount);

        const payload = {
            tx_ref: orderId, // Наш внутренний UUID заказа из Postgres
            amount: orderAmount,
            currency: currency,
            redirect_url: `${process.env.SERVER_URL}/api/callback/flutterwave`, // Сюда прилетит хук
            customer: {
                email: `${username.toLowerCase()}@mtwtech-user.com`, // Фейковый email для шлюза
                name: username
            },
            customizations: {
                title: "MTW Tech Platform Deposit",
                description: "Ecosystem wallet top-up"
            }
        };

        // Запрос к официальному API Flutterwave V3
        const res = await axios.post('https://flutterwave.com', payload, {
            headers: {
                'Authorization': `Bearer ${FLUTTERWAVE_SECRET_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        // Возвращает ссылку на оплату внутри Африки: res.data.data.link
        return res.data?.data?.link || null;
    },

    // 🕌 ИНТЕГРАЦИЯ VODAFONE CASH / MENA (Египет)
    createVodafoneInvoice: async (orderId, amount, currency = 'EGP') => {
        // В Египте валюта — Египетский фунт (EGP)
        const orderAmount = Number(amount).toFixed(2);

        const payload = {
            merchant_id: VODAFONE_MERCHANT_ID,
            order_id: orderId,
            amount: orderAmount,
            currency: currency,
            callback_url: `${process.env.SERVER_URL}/api/callback/vodafone`
        };

        // Подпись безопасности: SHA256(merchant_id + order_id + amount + secret_key)
        const signData = `${VODAFONE_MERCHANT_ID}:${orderId}:${orderAmount}:${VODAFONE_SECRET_KEY}`;
        const sign = crypto.createHash('sha256').update(signData).digest('hex');

        const res = await axios.post('https://mena-payments.com', { ...payload, sign });

        // Возвращает ссылку на форму ввода номера телефона для списания Mobile Money
        return res.data?.payment_url || null;
    },


    sendCryptomusPayout: async (orderUuid, amount, wallet, currency = 'USDT', network = 'TRON') => {
        const payload = {
            amount: Number(amount).toFixed(2),
            currency: currency,
            network: network, // Например, USDT в сети TRC-20
            address: wallet,
            order_id: orderUuid
        };

        // Подпись для выплат Cryptomus: md5(base64(json) + payout_key)
        const signData = Buffer.from(JSON.stringify(payload)).toString('base64') + CRYPTOMUS_PAYOUT_KEY;
        const sign = crypto.createHash('md5').update(signData).digest('hex');

        const res = await axios.post('https://cryptomus.com', payload, {
            headers: { 'merchant': CRYPTOMUS_MERCHANT_ID, 'sign': sign, 'Content-Type': 'application/json' }
        });

        return res.data?.result?.status === 'process' || res.data?.result?.status === 'paid';
    },

    // 🌍 АВТО-ВЫПЛАТА PAYEER
    sendPayeerPayout: async (orderUuid, amount, wallet, currency = 'USD') => {
        const payload = {
            account: PAYEER_ACCOUNT,
            apiId: PAYEER_API_ID,
            apiKey: PAYEER_API_KEY,
            action: 'transfer',
            to: wallet,
            amount: Number(amount).toFixed(2),
            currency: currency,
            referenceId: orderUuid
        };

        // Запрос к API выплат Payeer
        const res = await axios.post('https://payeer.com', new URLSearchParams(payload));
        return res.data?.success === true;
    },

    sendAaioPayout: async (orderUuid, amount, wallet) => {
        const payload = {
            my_id: orderUuid,
            method: wallet.length === 16 ? 'card_ru' : 'sbp', // Авто-определение: карта или СБП
            amount: Number(amount).toFixed(2),
            wallet: wallet.replace(/\s/g, '') // убираем пробелы
        };

        const res = await axios.post('https://aaio.so', payload, {
            headers: { 'Authorization': `Bearer ${AAIO_API_KEY}` }
        });

        return res.data?.status === 'success' || res.data?.status === 'in_progress';
    },

    // 🇧🇷 АВТО-ВЫПЛАТА PIX (Бразилия / LATAM)
    sendPixPayout: async (orderUuid, amount, wallet) => {
        const payload = {
            merchant_id: process.env.PIX_MERCHANT_ID,
            order_id: orderUuid,
            amount: Number(amount).toFixed(2),
            currency: 'BRL',
            pix_key: wallet // Ключ PIX игрока (телефон, email or CPF)
        };

        const res = await axios.post('https://latampay-gateway.com', payload, {
            headers: { 'Authorization': `Bearer ${process.env.PIX_SECRET_KEY}` }
        });

        return res.data?.status === 'SUCCESS' || res.data?.status === 'PROCESSING';
    },

    // 🌍 АВТО-ВЫПЛАТА FLUTTERWAVE (Африка Mobile Money / Банки)
    sendFlutterwavePayout: async (orderUuid, amount, wallet) => {
        // Парсим строку реквизитов, которую ввел игрок (например, "MTN MoMo: +23480...")
        const cleanWallet = wallet.replace(/[^\d]/g, '');

        const payload = {
            account_bank: "MPS", // Стандартный код для Mobile Money в Африке
            account_number: cleanWallet,
            amount: Number(amount),
            currency: "NGN",
            narration: "Platform payout withdrawal",
            reference: orderUuid
        };

        const res = await axios.post('https://flutterwave.com', payload, {
            headers: { 'Authorization': `Bearer ${FLUTTERWAVE_SECRET_KEY}` }
        });

        return res.data?.status === 'success' && res.data?.data?.status !== 'FAILED';
    },

    // 🕌 АВТО-ВЫПЛАТА VODAFONE CASH (Египет / MENA)
    sendVodafonePayout: async (orderUuid, amount, wallet) => {
        const cleanPhone = wallet.replace(/[^\d]/g, '');

        const payload = {
            merchant_id: process.env.VODAFONE_MERCHANT_ID,
            order_id: orderUuid,
            amount: Number(amount).toFixed(2),
            currency: 'EGP',
            phone_number: cleanPhone
        };

        const res = await axios.post('https://mena-payments.com', payload, {
            headers: { 'Authorization': `Bearer ${VODAFONE_SECRET_KEY}` }
        });

        return res.data?.status === 'SUCCESS' || res.data?.status === 'PENDING_GATEWAY';
    },


    createWithdrawRequest: async (username, partnerId, sessionId, amount, gateway, walletDetails) => {
        const withdrawAmount = Number(amount);
        const client = await global.pool.connect();
        const walletService = seamless || require('./services/seamlessService');

        try {
            await client.query('BEGIN');

            // Блокируем игрока для проверки баланса
            const pRes = await client.query('SELECT balance FROM players WHERE username = $1 AND partner_id = $2 FOR UPDATE', [username, partnerId]);
            if (pRes.rowCount === 0) { await client.query('ROLLBACK'); return { success: false, error: "USER_NOT_FOUND" }; }

            const currentBalance = Number(pRes.rows[0].balance);
            if (currentBalance < withdrawAmount) {
                await client.query('ROLLBACK');
                return { success: false, error: "INSUFFICIENT_FUNDS", message: "You don't have enough coins to withdraw this amount." };
            }

            // Генерируем ID раунда для бесшовного шлюза
            const crypto = require('crypto');
            const wdRoundId = `wd_req_${crypto.randomBytes(6).toString('hex')}`;

            // Списываем (замораживаем) средства на внешней витрине партнера через DEBIT
            const debitResult = await walletService.debit(
                { casino_min_limit: null, casino_max_limit: null, sport_min_limit: null, sport_max_limit: null }, // обходим лимиты ставок
                username, partnerId, sessionId, withdrawAmount, `Withdraw Request: ${gateway.toUpperCase()}`, wdRoundId
            );

            // Если витрина успешно списала деньги — фиксируем новый баланс в нашей БД
            const finalBalance = debitResult && debitResult.balance !== undefined ? Number(debitResult.balance) : currentBalance - withdrawAmount;
            await client.query('UPDATE players SET balance = $1 WHERE username = $2 AND partner_id = $3', [finalBalance, username, partnerId]);

            // Создаем запись заявки со статусом PENDING
            await client.query(
                `INSERT INTO withdraw_requests (partner_id, username, amount, gateway, wallet_details) VALUES ($1, $2, $3, $4, $5)`,
                [partnerId, username, withdrawAmount, gateway, walletDetails.trim()]
            );

            // Пишем в ленту активности игрока
            await client.query(
                `INSERT INTO player_history (username, partner_id, category, action_type, description, amount_change)
                 VALUES ($1, $2, 'system', 'withdraw_req', $3, $4)`,
                [username, partnerId, `Requested withdrawal via ${gateway.toUpperCase()} (Pending review)`, -withdrawAmount]
            );

            await client.query('COMMIT');
            return { success: true, balance: finalBalance, message: "Withdrawal request submitted successfully. Staff will review it shortly." };

        } catch (err) {
            await client.query('ROLLBACK');
            console.error(err);
            return { success: false, error: "WITHDRAW_FAILED", message: "Failed to process withdrawal transaction" };
        } finally {
            client.release();
        }
    },

    // 2. АДМИНКА: Получить список всех заявок
    getAdminWithdrawals: async (partnerId, status = 'PENDING') => {
        const res = await global.pool.query(
            `SELECT id, username, amount::numeric, gateway, wallet_details, status, timestamp 
             FROM withdraw_requests WHERE partner_id = $1 AND status = $2 ORDER BY id DESC`,
            [partnerId, status]
        );
        return res.rows;
    },

    // 3. АДМИНКА: Одобрение или Отклонение заявки
    processAdminWithdrawal: async (partnerId, requestId, action) => { // action: 'APPROVE' или 'REJECT'
        const client = await global.pool.connect();
        const walletService = seamless || require('./services/seamlessService');

        try {
            await client.query('BEGIN');

            // Блокируем строку заявки
            const reqRes = await client.query('SELECT * FROM withdraw_requests WHERE id = $1 AND partner_id = $2 FOR UPDATE', [requestId, partnerId]);
            if (reqRes.rowCount === 0) { await client.query('ROLLBACK'); return { success: false, error: "REQUEST_NOT_FOUND" }; }

            const request = reqRes.rows[0];
            if (request.status !== 'PENDING') { await client.query('ROLLBACK'); return { success: false, error: "ALREADY_PROCESSED" }; }

            // Внутри метода processAdminWithdrawal найди блок: if (action === 'APPROVE') {
            if (action === 'APPROVE') {
                let payoutSuccess = false;
                // Генерируем уникальный UUID для внешней платежки (если не создали при запросе)
                const orderUuid = request.order_uuid || `pout_${crypto.randomBytes(6).toString('hex')}`;

                try {
                    // 🚀 ПОЛУАВТОМАТИЧЕСКИЙ СЕЛЕКТОР ВЫПЛАТ ДЛЯ ВСЕХ МЕТОДОВ
                    if (request.gateway === 'cryptomus') {
                        payoutSuccess = await module.exports.sendCryptomusPayout(orderUuid, request.amount, request.wallet_details);
                    }
                    else if (request.gateway === 'payeer') {
                        payoutSuccess = await module.exports.sendPayeerPayout(orderUuid, request.amount, request.wallet_details);
                    }
                    else if (request.gateway === 'aaio') {
                        payoutSuccess = await module.exports.sendAaioPayout(orderUuid, request.amount, request.wallet_details);
                    }
                    else if (request.gateway === 'pix') {
                        payoutSuccess = await module.exports.sendPixPayout(orderUuid, request.amount, request.wallet_details);
                    }
                    else if (request.gateway === 'flutterwave') {
                        payoutSuccess = await module.exports.sendFlutterwavePayout(orderUuid, request.amount, request.wallet_details);
                    }
                    else if (request.gateway === 'vodafone') {
                        payoutSuccess = await module.exports.sendVodafonePayout(orderUuid, request.amount, request.wallet_details);
                    }

                } catch (payoutErr) {
                    console.error(`❌ [Payout API Error] Gateway ${request.gateway.toUpperCase()} crashed:`, payoutErr.message);
                    payoutSuccess = false;
                }

                // Если внешняя платежка отказала — прерываем операцию, не меняя балансы в Postgres
                if (!payoutSuccess) {
                    await client.query('ROLLBACK');
                    return {
                        success: false,
                        error: "PAYOUT_GATEWAY_REJECTED",
                        message: `External API Provider [${request.gateway.toUpperCase()}] rejected this automated transfer. Check merchant pool balance or player wallet formatting.`
                    };
                }

                // --- ЕСЛИ ШЛЮЗ ПРИНЯЛ ТРАНЗАКЦИЮ — ЗАКРЫВАЕМ ЗАПИСЬ В POSTGRES ---
                await client.query("UPDATE withdraw_requests SET status = 'APPROVED' WHERE id = $1", [requestId]);

                // Фиксируем чистый расход в главный финансовый архив
                await client.query(
                    `INSERT INTO accounting_logs (partner_id, username, type, amount, game) VALUES ($1, $2, 'WITHDRAW', $3, $4)`,
                    [partnerId, request.username, Number(request.amount), `${request.gateway.toUpperCase()} Withdraw`]
                );
            }
            else if (action === 'REJECT') {
                // ОТКЛОНЯЕМ И ВОЗВРАЩАЕМ ДЕНЬГИ ИГРОКУ
                await client.query("UPDATE withdraw_requests SET status = 'REJECTED' WHERE id = $1", [requestId]);

                // Возвращаем коины на внешнюю витрину через CREDIT
                const crypto = require('crypto');
                const refundRoundId = `wd_ref_${crypto.randomBytes(6).toString('hex')}`;
                const creditResult = await walletService.credit(
                    request.username, partnerId, null, Number(request.amount), `Withdraw Rejected Refund: ${request.gateway.toUpperCase()}`, refundRoundId
                );

                // Синхронизируем баланс в локальной БД игроков
                const pRes = await client.query('SELECT balance FROM players WHERE username = $1 AND partner_id = $2', [request.username, partnerId]);
                const currentBal = pRes.rowCount > 0 ? Number(pRes.rows[0].balance) : 0;
                const finalBal = creditResult && creditResult.balance !== undefined ? Number(creditResult.balance) : currentBal + Number(request.amount);

                await client.query('UPDATE players SET balance = $1 WHERE username = $2 AND partner_id = $3', [finalBal, request.username, partnerId]);

                // Пишем в историю игрока лог возврата средств
                await client.query(
                    `INSERT INTO player_history (username, partner_id, category, action_type, description, amount_change)
                     VALUES ($1, $2, 'system', 'withdraw_refund', $3, $4)`,
                    [request.username, partnerId, `Withdraw request rejected. Coins refunded to balance.`, Number(request.amount)]
                );
            }

            await client.query('COMMIT');
            return { success: true };
        } catch (err) {
            await client.query('ROLLBACK');
            console.error(err);
            return { success: false, error: "PROCESS_FAILED" };
        } finally {
            client.release();
        }
    }
};
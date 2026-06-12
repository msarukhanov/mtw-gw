const crypto = require('crypto');
const state = require('../state');
const paymentService = require('../services/paymentService');

// Ключи верификации вебхуков (те же, что и выше)
const CRYPTOMUS_API_KEY = process.env.CRYPTOMUS_API_KEY || 'your_cryptomus_api_key';
const AAIO_SECRET_2 = process.env.AAIO_SECRET_2 || 'your_aaio_secret_2'; // Secret #2 используется для вебхуков

// Вспомогательная функция успешного начисления денег в Postgres (вызывается из вебхуков)
async function processSuccessfulDeposit(orderUuid) {
    const client = await global.pool.connect();
    const walletService = seamless || require('./services/seamlessService');

    try {
        await client.query('BEGIN');

        // Ищем заказ и блокируем строку FOR UPDATE, защищая от повторных вызовов (двойных начислений)
        const orderRes = await client.query('SELECT * FROM deposit_orders WHERE order_uuid = $1 FOR UPDATE', [orderUuid]);
        if (orderRes.rowCount === 0) { await client.query('ROLLBACK'); return false; }

        const order = orderRes.rows[0];
        if (order.status !== 'PENDING') { await client.query('ROLLBACK'); return true; } // Уже обработан ранее

        // Обновляем статус заказа
        await client.query('UPDATE deposit_orders SET status = \'SUCCESS\' WHERE id = $1', [order.id]);

        // Начисляем баланс на внешнюю витрину партнера через наш бесшовный шлюз credit
        const creditResult = await walletService.credit(
            order.username, order.partner_id, null, Number(order.amount), `Deposit standard: ${order.gateway.toUpperCase()}`, orderUuid
        );

        // Обновляем баланс в локальной таблице игроков
        const pRes = await client.query('SELECT balance FROM players WHERE username = $1 AND partner_id = $2', [order.username, order.partner_id]);
        const currentBal = pRes.rowCount > 0 ? Number(pRes.rows[0].balance) : 0;
        const finalBal = creditResult && creditResult.balance !== undefined ? Number(creditResult.balance) : currentBal + Number(order.amount);

        await client.query('UPDATE players SET balance = $1 WHERE username = $2 AND partner_id = $3', [finalBal, order.username, order.partner_id]);

        // Записываем лог в общую историю активности player_history
        await client.query(
            `INSERT INTO player_history (username, partner_id, category, action_type, description, amount_change)
             VALUES ($1, $2, 'system', 'deposit', $3, $4)`,
            [order.username, order.partner_id, `Successful account deposit via ${order.gateway.toUpperCase()}`, Number(order.amount)]
        );

        // Записываем лог в твой главный финансовый архив accounting_logs
        await client.query(
            `INSERT INTO accounting_logs (partner_id, username, type, amount, game) VALUES ($1, $2, 'CREDIT', $3, $4)`,
            [order.partner_id, order.username, Number(order.amount), `${order.gateway.toUpperCase()} Deposit`]
        );

        // [ВСТАВИТЬ ВНУТРЬ processSuccessfulDeposit ПОСЛЕ ОБНОВЛЕНИЯ СТАТУСА ЗАКАЗА НА 'SUCCESS']
        const depositAmount = Number(order.amount);

// 1. Проверяем, сколько суммарно депонировал игрок ранее
        const checkFirstDep = await client.query(
            'SELECT total_deposited_amount FROM players WHERE username = $1 AND partner_id = $2 FOR UPDATE',
            [order.username, order.partner_id]
        );
        const totalDepBefore = Number(checkFirstDep.rows[0]?.total_deposited_amount || 0);

// Инкрементируем общую сумму депозитов игрока в СУБД
        await client.query(
            'UPDATE players SET total_deposited_amount = total_deposited_amount + $1 WHERE username = $2 AND partner_id = $3',
            [depositAmount, order.username, order.partner_id]
        );

// 2. Если это ПЕРВЫЙ ДЕПОЗИТ в истории игрока, проверяем наличие Welcome-бонуса для этого домена
        if (totalDepBefore === 0) {
            // Находим сайт, с которого пришел заказ (связываем через deposit_orders если у тебя там есть website_id, либо ищем первый активный)
            const bonusConfigRes = await client.query(
                `SELECT b.* FROM b2b_welcome_bonuses b
         JOIN b2b_websites w ON b.website_id = w.id
         WHERE b.partner_id = $1 AND b.is_active = 1 LIMIT 1`,
                [order.partner_id]
            );

            if (bonusConfigRes.rowCount > 0) {
                const bonusCfg = bonusConfigRes.rows[0];

                // Проверяем, проходит ли депозит по минимальной планке
                if (depositAmount >= Number(bonusCfg.min_deposit_amount)) {
                    // Рассчитываем сумму бонуса
                    let rawBonus = depositAmount * (Number(bonusCfg.bonus_percent) / 100);
                    // Ограничиваем максимальным лимитом (например, не больше 5000 коинов)
                    const finalBonusAmount = Math.min(rawBonus, Number(bonusCfg.max_bonus_amount));

                    // Рассчитываем вейджер: сумма бонуса * вейджер-мультипликатор (например, x30)
                    const targetWager = finalBonusAmount * Number(bonusCfg.wager_multiplier);

                    // Начисляем бонус на бонусный кошелек и выставляем вейджер в Postgres
                    await client.query(
                        `UPDATE players 
                 SET bonus_balance = bonus_balance + $1,
                     wager_total = wager_total + $2,
                     wager_left = wager_left + $3
                 WHERE username = $4 AND partner_id = $5`,
                        [finalBonusAmount, targetWager, targetWager, order.username, order.partner_id]
                    );

                    // Логируем активацию бонуса в историю игрока
                    await client.query(
                        `INSERT INTO player_history (username, partner_id, category, action_type, description, amount_change)
                 VALUES ($1, $2, 'system', 'welcome_bonus', $3, $4)`,
                        [order.username, order.partner_id, `Activated Welcome Bonus +${bonusCfg.bonus_percent}%! Wager x${bonusCfg.wager_multiplier} initialized.`, finalBonusAmount]
                    );
                }
            }
        }

        await state.sendNotification(order.partner_id, order.username, 'FINANCE', '🟢 Deposit Approved! Amount is ' + depositAmount);

        await client.query('COMMIT');
        return true;
    } catch (e) {
        await client.query('ROLLBACK');
        console.error("Critical webhook database commit failed:", e.message);
        return false;
    } finally {
        client.release();
    }
}

// 2. ВЕБХУК: ОБРАБОТЧИК CRYPTOMUS
exports.cryptomusCallback = async (req, res) => {
    try {
        const { sign, uuid, order_id, status } = req.body;

        // Проверка подписи Cryptomus: md5(base64_encode(json_without_sign) + api_key)
        const data = { ...req.body };
        delete data.sign; // Удаляем саму подпись из объекта верификации

        const validSignData = Buffer.from(JSON.stringify(data)).toString('base64') + CRYPTOMUS_API_KEY;
        const checkSign = crypto.createHash('md5').update(validSignData).digest('hex');

        if (sign !== checkSign) return res.status(400).send('Invalid signature verification matrix');

        // Если статус платежа успешный (paid или paid_over) — начисляем деньги
        if (status === 'paid' || status === 'paid_over') {
            await processSuccessfulDeposit(order_id);
        }

        res.send('OK'); // Платежка ожидает ответ 'OK'
    } catch (err) { res.status(500).send('Error'); }
};

// 3. ВЕБХУК: ОБРАБОТЧИК AAIO
exports.aaioCallback = async (req, res) => {
    try {
        const { merchant_id, amount, currency, order_id, sign } = req.body;

        // Проверка подписи Aaio: SHA256(merchant_id + amount + currency + secret_2 + order_id)
        const validSignData = `${merchant_id}:${amount}:${currency}:${AAIO_SECRET_2}:${order_id}`;
        const checkSign = crypto.createHash('sha256').update(validSignData).digest('hex');

        if (sign !== checkSign) return res.status(400).send('Invalid webhook verification token');

        // Начисляем баланс в Postgres
        await processSuccessfulDeposit(order_id);

        res.send('OK');
    } catch (err) { res.status(500).send('Error'); }
};

// 🇧🇷 ВЕБХУК: ОБРАБОТЧИК PIX (LATAM)
exports.pixCallback = async (req, res) => {
    try {
        const { merchant_id, order_id, amount, status, sign } = req.body;

        // Проверяем подпись
        const validSignData = `${merchant_id}:${order_id}:${amount}:${PIX_SECRET_KEY}`;
        const checkSign = crypto.createHash('sha256').update(validSignData).digest('hex');

        if (sign !== checkSign) return res.status(400).send('Signature error');

        if (status === 'SUCCESS' || status === 'PAID') {
            // Наша готовая транзакционная функция начисления баланса в Postgres
            await processSuccessfulDeposit(order_id);
        }
        res.send('SUCCESS');
    } catch (err) { res.status(500).send('Error'); }
};

// 🌍 ВЕБХУК: ОБРАБОТЧИК PAYEER
exports.payeerCallback = async (req, res) => {
    try {
        // Payeer шлет параметры в req.body. Собираем подпись для проверки
        const { m_operation_id, m_operation_ps, m_operation_date, m_operation_pay_date, m_shop, m_orderid, m_amount, m_curr, m_desc, m_status, m_sign } = req.body;

        // Для проверки вебхука Payeer подпись собирается из всех пришедших параметров + ключ
        const signData = `${m_operation_id}:${m_operation_ps}:${m_operation_date}:${m_operation_pay_date}:${m_shop}:${m_orderid}:${m_amount}:${m_curr}:${m_desc}:${m_status}:${PAYEER_SECRET_KEY}`;
        const checkSign = crypto.createHash('sha256').update(signData).digest('hex').toUpperCase();

        if (m_sign !== checkSign) return res.status(400).send('Signature error');

        if (m_status === 'success') {
            await processSuccessfulDeposit(m_orderid);
        }
        res.send(`${m_orderid}|success`); // Payeer ожидает ответ в таком формате
    } catch (err) { res.status(500).send('Error'); }
};

// 🌍 ВЕБХУК: ОБРАБОТЧИК FLUTTERWAVE (АФРИКА)
exports.flutterwaveCallback = async (req, res) => {
    try {
        // Flutterwave присылает данные о транзакции в query-параметрах при редиректе или POST хуком
        const { status, tx_ref } = req.body;

        // Если платеж успешный — вызываем нашу готовую функцию зачисления денег в Postgres
        if (status === 'successful' || status === 'completed') {
            await processSuccessfulDeposit(tx_ref); // tx_ref это наш orderUuid
        }

        res.status(200).json({ status: "success" });
    } catch (err) { res.status(500).send('Error'); }
};

// 🕌 ВЕБХУК: ОБРАБОТЧИК VODAFONE CASH (MENA)
exports.vodafoneCallback = async (req, res) => {
    try {
        const { merchant_id, order_id, amount, status, sign } = req.body;

        // Проверяем подпись
        const validSignData = `${merchant_id}:${order_id}:${amount}:${VODAFONE_SECRET_KEY}`;
        const checkSign = crypto.createHash('sha256').update(validSignData).digest('hex');

        if (sign !== checkSign) return res.status(400).send('Signature failure');

        if (status === 'PAID' || status === 'SUCCESS') {
            await processSuccessfulDeposit(order_id);
        }
        res.send('ACK');
    } catch (err) { res.status(500).send('Error'); }
};

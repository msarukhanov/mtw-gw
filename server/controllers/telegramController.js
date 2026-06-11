const crypto = require('crypto');
const state = require('../state'); // Твоя модель getOrCreatePlayer

const TG_BOT_TOKEN = process.env.TG_BOT_TOKEN || 'your_telegram_bot_token';

// 🔐 Функция валидации строки от Telegram WebApp (Стандарт безопасности TG) [INDEX]
function verifyTelegramInitData(initData) {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    params.delete('hash');

    // Сортируем параметры по алфавиту, как требует Telegram [INDEX]
    const sortedParams = Array.from(params.entries())
        .map(([key, value]) => `${key}=${value}`)
        .sort()
        .join('\n');

    // Генерируем секретный ключ на основе токена бота [INDEX]
    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(TG_BOT_TOKEN).digest();
    // Считаем проверочный хэш [INDEX]
    const calculatedHash = crypto.createHmac('sha256', secretKey).update(sortedParams).digest('hex');

    return hash === calculatedHash;
}

// Контроллер авторизации игрока из Telegram WebApp
exports.authTelegramWebApp = async (req, res) => {
    try {
        const { initData, partnerId } = req.body;

        // 1. Валидируем подпись [INDEX]
        if (!verifyTelegramInitData(initData)) {
            return res.status(401).json({ error: "TELEGRAM_AUTH_FAILED", message: "Security signature mismatch" });
        }

        // 2. Распаковываем данные пользователя из строки
        const params = new URLSearchParams(initData);
        const userObj = JSON.parse(params.get('user')); // { id: 1234567, username: 'mark_dev' }

        const tgId = userObj.id;
        // Если у юзера нет юзернейма в ТГ, используем его ID в качестве никнейма платформы
        const tgUsername = userObj.username || `tg_${tgId}`;

        const client = await global.pool.connect();
        try {
            await client.query('BEGIN');

            // 3. Ищем игрока по telegram_id
            let pRes = await client.query('SELECT username FROM players WHERE partner_id = $1 AND telegram_id = $2 LIMIT 1', [partnerId, tgId]);
            let finalUsername = pRes.rows?.[0]?.username;

            if (pRes.rowCount === 0) {
                // Если игрока еще нет, проверяем, вдруг никнейм занят обычным пользователем
                const nickCheck = await client.query('SELECT username FROM players WHERE partner_id = $1 AND username = $2', [partnerId, tgUsername]);
                finalUsername = nickCheck.rowCount > 0 ? `tg_${tgUsername}_${crypto.randomBytes(3).toString('hex')}` : tgUsername;

                // Создаем игрока в Postgres и намертво привязываем его telegram_id
                await client.query(
                    `INSERT INTO players (username, partner_id, balance, telegram_id) 
                     VALUES ($1, $2, 0.00, $3)`,
                    [finalUsername, partnerId, tgId]
                );

                // Пишем лог регистрации
                await client.query(
                    `INSERT INTO player_history (username, partner_id, category, action_type, description, amount_change)
                     VALUES ($1, $2, 'system', 'register', 'Successfully registered via Telegram WebApp Bot 🤖', 0)`,
                    [finalUsername, partnerId]
                );
            }

            await client.query('COMMIT');

            // 4. Генерируем игровую сессию (токен), как при обычном логине
            const token = `tg_sess_${crypto.randomBytes(16).toString('hex')}`;
            global.activePlayerSessions[token] = finalUsername; // Пишем в глобальный реестр сессий бэкенда

            const player = await state.getOrCreatePlayer(finalUsername, partnerId);

            player.sessionId = sessionId;

            // Принудительно синхронизируем баланс NeDB с тем, что прислал шлюз
            const freshBalance = externalUser.balance !== undefined ? Number(externalUser.balance) : player.balance;
            await state.updateBalance(player.username, partnerId, freshBalance);

            res.json({
                username: player.username,
                partnerId: partnerId,
                balance: freshBalance,
                sessionId: token,
                jackpot: state.getJackpot(partnerId),
                config: state.getConfig(partnerId)
            });

        } catch (dbErr) {
            await client.query('ROLLBACK');
            throw dbErr;
        } finally { client.release(); }

    } catch (err) {
        console.error("❌ Telegram WebApp Login Crash:", err.message);
        res.status(500).json({ error: "FAILED_TO_AUTH_TG_USER" });
    }
};

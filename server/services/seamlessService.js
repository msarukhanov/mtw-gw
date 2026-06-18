const axios = require('axios');
const crypto = require('crypto');

const state = require('../state');

const isDemo = process.env.env === 'demo';
// Исправлены опечатки в протоколе https:// и хосте localhost
const demoUrl = (isDemo ? 'https://mtw-gw.onrender.com' : 'http://localhost:3000') + '/api/seamless/';

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

module.exports = {
    validateSession: async (sessionId, partnerId) => {
        try {
            const partnerConfig = global.CONFIG[partnerId];
            // const integration = partnerConfig.integration || {
            //     url: demoUrl,
            //     secret: 'your_secret_key_here'
            // };
            const integration = {
                url: demoUrl,
                secret: 'demo_showcase_secure_token'
            };
            integration.url += 'validate';

            const response = await axios.post(`${integration.url}`, {
                token: sessionId,
                secret: integration.secret
            });

            return response.data; // { username: "Player_1", balance: 5000 }
        } catch (err) {
            console.error(`[Partner: ${partnerId}] Seamless validate error:`, err.message);
            return null;
        }
    },

    debit: async (player, username, partnerId, sessionId, amount, gameName, roundId) => {

        const betAmount = Number(amount);
        const isSport = gameName === "Sportsbook";

        // 1. 🛑 ВАЛИДАЦИЯ ПЕРСОНАЛЬНЫХ ЛИМИТОВ ИГРОКА
        if (isSport) {
            const sMin = player.sport_min_limit !== null ? Number(player.sport_min_limit) : null;
            const sMax = player.sport_max_limit !== null ? Number(player.sport_max_limit) : null;

            if (sMin !== null && betAmount < sMin) {
                return { success: false, error: "LIMIT_MIN_BREACHED", message: `Bet is below the minimum sportsbook limit of ${sMin} 🪙` };
            }
            if (sMax !== null && betAmount > sMax) {
                return { success: false, error: "LIMIT_MAX_BREACHED", message: `Bet exceeds the maximum sportsbook limit of ${sMax} 🪙` };
            }
        } else {
            const cMin = player.casino_min_limit !== null ? Number(player.casino_min_limit) : null;
            const cMax = player.casino_max_limit !== null ? Number(player.casino_max_limit) : null;

            if (cMin !== null && betAmount < cMin) {
                return { success: false, error: "LIMIT_MIN_BREACHED", message: `Bet is below the minimum casino limit of ${cMin} 🪙` };
            }
            if (cMax !== null && betAmount > cMax) {
                return { success: false, error: "LIMIT_MAX_BREACHED", message: `Bet exceeds the maximum casino limit of ${cMax} 🪙` };
            }
        }

        try {
            const partnerConfig = global.CONFIG[partnerId];
            // const integration = partnerConfig.integration || {
            //     url: demoUrl,
            //     secret: 'your_secret_key_here'
            // };
            const integration = {
                url: demoUrl,
                secret: 'demo_showcase_secure_token'
            };
            integration.url += 'debit';

            const response = await axios.post(`${integration.url}`, {
                username,
                token: sessionId,
                amount: Number(amount),
                game: gameName,
                roundId,
                secret: integration.secret
            });
            await financialMethods.logFinancialTransaction(partnerId, username, "DEBIT", amount, gameName);

            let finalBalance = Number(response.data.balance);

            const client = await global.pool.connect();

            try {
                // Все запросы внутри транзакции делаем через client, а не через global.pool
                await client.query('BEGIN');

                // Запрашиваем текущий вейджер и бонусный кошелек игрока с блокировкой строки
                const pQuery = await client.query(
                    'SELECT bonus_balance, wager_left, balance FROM players WHERE username = $1 AND partner_id = $2 FOR UPDATE',
                    [username, partnerId]
                );

                if (pQuery.rowCount > 0) {
                    const pData = pQuery.rows[0];
                    let currentBonus = Number(pData.bonus_balance);
                    let currentWagerLeft = Number(pData.wager_left);

                    // 1. Если у игрока есть активный вейджер — уменьшаем его на сумму сделанной ставки
                    if (currentWagerLeft > 0) {
                        currentWagerLeft = Math.max(0, currentWagerLeft - betAmount);

                        // 2. ТРИГГЕР: Проверяем, откручен ли вейджер в 0 прямо сейчас?
                        if (currentWagerLeft === 0 && currentBonus > 0) {
                            const wagerCompleteRoundId = `wg_comp_${crypto.randomBytes(6).toString('hex')}`;

                            // Внешний API запрос (делается параллельно, пока строка в БД заблокирована)
                            const creditResult = await module.exports.credit(
                                username, partnerId, sessionId, currentBonus,
                                `Welcome Bonus Wager Completed - Funds Unlocked!`, wagerCompleteRoundId
                            );

                            if (creditResult && creditResult.balance !== undefined) {
                                finalBalance = Number(creditResult.balance);
                            }

                            // Логируем триумф в историю активности
                            await client.query(
                                `INSERT INTO player_history (username, partner_id, category, action_type, description, amount_change)
                     VALUES ($1, $2, 'system', 'wager_unlock', $3, $4)`,
                                [username, partnerId, `🎉 Congratulations! Welcome bonus fully wagered. Funds converted to real balance!`, currentBonus]
                            );

                            currentBonus = 0; // Бонус успешно обнулен, так как улетел в реал
                        }

                        // Записываем обновленные балансы и остаток вейджера в PostgreSQL
                        await client.query(
                            `UPDATE players 
                 SET bonus_balance = $1, 
                     wager_left = $2, 
                     balance = $3 
                 WHERE username = $4 AND partner_id = $5`,
                            [currentBonus, currentWagerLeft, finalBalance, username, partnerId]
                        );
                    }
                }

                await client.query('COMMIT');
            } catch (dbErr) {
                // В случае ошибки откатываем транзакцию назад
                try {
                    await client.query('ROLLBACK');
                } catch (rollbackErr) {
                    console.error("❌ Не удалось сделать ROLLBACK:", rollbackErr.message);
                }
                console.error("❌ Ошибка процессинга вейджера в дебите:", dbErr.message);
            } finally {
                // 2. Обязательно освобождаем клиента и возвращаем его в пул
                client.release();
            }


            return response.data; // { balance: NewBalance }
        } catch (err) {
            console.error(`[Partner: ${partnerId}] Seamless debit error:`, err.message);
            throw new Error(`Platform debit failed for partner ${partnerId}`);
        }
    },

    credit: async (username, partnerId, sessionId, amount, gameName, roundId) => {
        try {
            const partnerConfig = global.CONFIG[partnerId];
            // const integration = partnerConfig.integration || {
            //     url: demoUrl,
            //     secret: 'your_secret_key_here'
            // };
            const integration = {
                url: demoUrl,
                secret: 'demo_showcase_secure_token'
            };
            integration.url += 'credit';

            const response = await axios.post(`${integration.url}`, {
                username,
                token: sessionId,
                amount: Number(amount),
                game: gameName,
                roundId,
                secret: integration.secret
            });

            let txType = "CREDIT";
            if (gameName && gameName.includes("Affiliate")) txType = "AFFILIATE";
            else if (gameName && (gameName.includes("Promo") || gameName.includes("Cashback") || gameName.includes("Quest") || gameName.includes("VIP"))) {
                txType = "BONUS_CASH";
            }
            await financialMethods.logFinancialTransaction(partnerId, username, txType, amount, gameName);

            return response.data; // { balance: NewBalance }
        } catch (err) {
            console.error(`[Partner: ${partnerId}] Seamless credit error:`, err.message);
            throw new Error(`Platform credit failed for partner ${partnerId}`);
        }
    }
};
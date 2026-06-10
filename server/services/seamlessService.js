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

            // 3. 🎰 ИНТЕГРАЦИЯ INSTANT AUTO-CASHBACK (Строго после успешного дебита!)
            // const cbConfig = partnerConfig.gamification?.cashback || { mode: 'manual', percent: 10 };
            //
            // if (cbConfig.mode === 'auto' && Number(cbConfig.percent) > 0) {
            //     const cashbackAmount = Math.floor(betAmount * (Number(cbConfig.percent) / 100));
            //
            //     if (cashbackAmount > 0) {
            //         try {
            //             const crypto = require('crypto');
            //             const cbRoundId = `autocb_${crypto.randomBytes(6).toString('hex')}`;
            //
            //             // Вызываем метод CREDIT, чтобы зачислить кэшбэк на внешнюю платформу
            //             // Передаем баланс игрока, чтобы обновить сессию
            //             const creditResult = await module.exports.credit(
            //                 username,
            //                 partnerId,
            //                 sessionId,
            //                 cashbackAmount,
            //                 `Instant Auto-Cashback ${cbConfig.percent}%`,
            //                 cbRoundId
            //             );
            //
            //             // Если платформа успешно приняла кэшбэк, обновляем итоговый баланс для игры
            //             if (creditResult && creditResult.balance !== undefined) {
            //                 finalBalance = Number(creditResult.balance);
            //             }
            //
            //             // Пишем лог авто-кэшбэка в нашу реляционную историю player_history в Postgres
            //             await global.pool.query(
            //                 `INSERT INTO player_history (username, partner_id, category, action_type, description, amount_change)
            //              VALUES ($1, $2, 'system', 'cashback', $3, $4)`,
            //                 [username, partnerId, `Instant ${cbConfig.percent}% auto-cashback for bet in ${gameName}`, cashbackAmount]
            //             );
            //
            //         } catch (cbErr) {
            //             console.error(`❌ [Auto-Cashback Payout Failed] for ${username}:`, cbErr.message);
            //         }
            //     }
            // }

            // [ВСТАВИТЬ ВНУТРЬ СЕРВИСА seamless.debit СТРОГО ПОСЛЕ УСПЕШНОГО ОТВЕТА AXIOS ПЛАТФОРМЫ ПАРТНЕРА]
// finalBalance — это баланс, который вернула витрина после списания ставки

            try {
                await global.pool.query('BEGIN');

                // Запрашиваем текущий вейджер и бонусный кошелек игрока
                const pQuery = await global.pool.query(
                    'SELECT bonus_balance, wager_left, balance FROM players WHERE username = $1 AND partner_id = $2 FOR UPDATE',
                    [username, partnerId]
                );

                if (pQuery.rowCount > 0) {
                    const pData = pQuery.rows[0];
                    let currentBonus = Number(pData.bonus_balance);
                    let currentWagerLeft = Number(pData.wager_left);

                    // 1. Если у игрока есть активный вейджер — уменьшаем его на сумму сделанной ставки!
                    if (currentWagerLeft > 0) {
                        currentWagerLeft = Math.max(0, currentWagerLeft - betAmount);

                        // 2. ТРИГГЕР: Проверяем, откручен ли вейджер в 0 прямо сейчас?
                        if (currentWagerLeft === 0 && currentBonus > 0) {
                            // Вейджер полностью отыгран! Переносим бонусные деньги в реальный баланс
                            // Для этого мы делаем фоновый CREDIT на внешнюю витрину партнера через seamless шлюз

                            const wagerCompleteRoundId = `wg_comp_${crypto.randomBytes(6).toString('hex')}`;

                            const creditResult = await module.exports.credit(
                                username, partnerId, sessionId, currentBonus,
                                `Welcome Bonus Wager Completed - Funds Unlocked!`, wagerCompleteRoundId
                            );

                            if (creditResult && creditResult.balance !== undefined) {
                                finalBalance = Number(creditResult.balance);
                            }

                            // Логируем триумф в историю активности
                            await global.pool.query(
                                `INSERT INTO player_history (username, partner_id, category, action_type, description, amount_change)
                     VALUES ($1, $2, 'system', 'wager_unlock', $3, $4)`,
                                [username, partnerId, `🎉 Congratulations! Welcome bonus fully wagered. Funds converted to real balance!`, currentBonus]
                            );

                            currentBonus = 0; // Бонус успешно обнулен, так как улетел в реал
                        }

                        // Записываем обновленные балансы и остаток вейджера в PostgreSQL
                        await global.pool.query(
                            `UPDATE players 
                 SET bonus_balance = $1, 
                     wager_left = $2, 
                     balance = $3 
                 WHERE username = $4 AND partner_id = $5`,
                            [currentBonus, currentWagerLeft, finalBalance, username, partnerId]
                        );
                    }
                }

                await global.pool.query('COMMIT');
            } catch (dbErr) {
                await global.pool.query('ROLLBACK');
                console.error("❌ Ошибка процессинга вейджера в дебите:", dbErr.message);
            } finally {
                global.pool.release();
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
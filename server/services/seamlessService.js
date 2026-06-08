const axios = require('axios');
const state = require('../state');

const isDemo = process.env.env === 'demo';
// Исправлены опечатки в протоколе https:// и хосте localhost
const demoUrl = (isDemo ? 'https://mtw-gw.onrender.com' : 'http://localhost:3000') + '/api/seamless/';

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

    debit: async (username, partnerId, sessionId, amount, gameName, roundId) => {
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
            await state.logFinancialTransaction(partnerId, username, "DEBIT", amount, gameName);

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
            await state.logFinancialTransaction(partnerId, username, txType, amount, gameName);

            return response.data; // { balance: NewBalance }
        } catch (err) {
            console.error(`[Partner: ${partnerId}] Seamless credit error:`, err.message);
            throw new Error(`Platform credit failed for partner ${partnerId}`);
        }
    }
};
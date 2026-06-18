// backend/db/playersDB.js
const axios = require('axios');

const isDemo = process.env.env === 'demo';
const demoUrl = (isDemo ? 'https://mtw-gw.onrender.com' : 'http://localhost:3000') + '/api/game/';

const playersDB = {};

// backend/db/playersDB.js

async function getGameUrl(sessionId, password, gameId, deviceId) {

    try {
        if (!playersDB[gameId][deviceId]) {

            const integration = {
                url: demoUrl,
                secret: 'demo_showcase_secure_token',
                body: {
                    sessionId,
                    username,
                    password,
                    partnerId: 'demo_mtwtech',
                }
            };
            integration.url += gameId + 'launch';

            const response = await axios.post(`${integration.url}`, integration.body);

            if (!response.data || !response.data.sessionId) {
                return {err: true}
            }

            return response.data;
        }
        return playersDB[gameId][deviceId];
    }
    catch (e) {
        console.error(e);
        return {
            error: true,
            e
        }
    }

}

module.exports = {
    getOrCreatePlayer,
    logInServer,
    buyShopItem,
    equipItem,
    playersDB // Экспортируем ссылку на инстанс памяти
};

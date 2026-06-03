const axios = require('axios'); // Установите через npm install axios, если еще нет

const PLATFORM_API_URL = 'https://casino-platform.com';
const OPERATOR_SECRET = 'your_secret_key_here'; // Ключ для подписи/безопасности

module.exports = {
    // 3.1 Проверка сессии и автологин
    validateSession: async (sessionId) => {
        try {
            const response = await axios.post(`${PLATFORM_API_URL}/validate`, {
                token: sessionId,
                secret: OPERATOR_SECRET
            });
            // Ожидаем ответ: { username: "Player_1", balance: 5000 }
            return response.data;
        } catch (err) {
            console.error("Seamless validate error:", err.message);
            return null;
        }
    },

    // 3.2 Запрос при ставке (Debit)
    debit: async (username, sessionId, amount, gameName, roundId) => {
        try {
            const response = await axios.post(`${PLATFORM_API_URL}/debit`, {
                username,
                token: sessionId,
                amount,
                game: gameName,
                roundId,
                secret: OPERATOR_SECRET
            });
            // Ожидаем ответ: { balance: NewBalance }
            return response.data;
        } catch (err) {
            console.error("Seamless debit error:", err.message);
            throw new Error("Platform debit failed");
        }
    },

    // 3.3 Запрос при результате (Credit)
    credit: async (username, sessionId, amount, gameName, roundId) => {
        try {
            const response = await axios.post(`${PLATFORM_API_URL}/credit`, {
                username,
                token: sessionId,
                amount,
                game: gameName,
                roundId,
                secret: OPERATOR_SECRET
            });
            // Ожидаем ответ: { balance: NewBalance }
            return response.data;
        } catch (err) {
            console.error("Seamless credit error:", err.message);
            throw new Error("Platform credit failed");
        }
    }
};

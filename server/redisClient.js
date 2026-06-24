const { createClient } = require('redis');

// URL берем из переменных окружения OnRender, для локальных тестов — дефолтный localhost
const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

const redisClient = createClient({
    url: REDIS_URL,
    socket: {
        reconnectStrategy: (retries) => {
            // Стратегия переподключения: пробуем каждые 3 секунды, максимум 10 раз
            if (retries > 10) {
                console.error('[Redis] Критическая ошибка: Превышено число попыток переподключения.');
                return new Error('Redis connection lost');
            }
            console.warn(`[Redis] Потеря соединения. Попытка переподключения #${retries}...`);
            return 3000;
        }
    }
});

redisClient.on('error', (err) => console.error('[Redis] Ошибка клиента:', err));
redisClient.on('connect', () => console.log('[Redis] Успешное соединение установлено.'));
redisClient.on('ready', () => console.log('[Redis] Клиент готов к работе (Ready).'));

// Асинхронная функция запуска при старте app.js
async function connectRedis(callback) {
    try {
        if (!redisClient.isOpen) {
            await redisClient.connect();
            if(typeof callback === 'function') {
                callback();
            }
        }
    } catch (err) {
        console.error('[Redis] Не удалось подключиться при старте:', err);
    }
}

module.exports = {
    redisClient,
    connectRedis
};

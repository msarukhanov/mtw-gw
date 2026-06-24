const { redisClient } = require('../../redisClient');

async function markPlayerDirty(userId, serverId) {
    if (redisClient.isOpen && redisClient.isReady) {
        const key = `p:${serverId}:${userId}`;
        await redisClient.sAdd('dirty_players', key);
    }
}

async function syncDirtyPlayersToPostgres() {
    if (!redisClient.isOpen || !redisClient.isReady) return;

    try {
        const keys = await redisClient.sMembers('dirty_players');
        if (keys.length === 0) return;

        await redisClient.del('dirty_players');
        let successCount = 0;

        for (const key of keys) {
            const cachedData = await redisClient.get(key);
            if (!cachedData) continue;

            const playerProfile = JSON.parse(cachedData);

            // Список системных полей, которые хранятся в отдельных колонках таблицы
            const rootFields = ['id', 'user_id', 'server_id', 'nickname', 'level', 'combat_power', 'resources', 'idle_timestamps'];

            let resources = playerProfile.resources || {};
            let idleTimestamps = playerProfile.idle_timestamps || {};
            let gameData = {};

            // Упаковываем обратно в game_data всё, что не является корневой колонкой
            Object.entries(playerProfile).forEach(([fieldKey, value]) => {
                if (!rootFields.includes(fieldKey) && fieldKey !== 'gameId' && fieldKey !== 'deviceId' && fieldKey !== 'sessionId' && fieldKey !== 'partnerId' && fieldKey !== 'username') {
                    gameData[fieldKey] = value;
                }
            });

            try {
                await global.pool.query(
                    `UPDATE player_server_profiles 
                     SET nickname = $3, level = $4, combat_power = $5, resources = $6, idle_timestamps = $7, game_data = $8, updated_at = CURRENT_TIMESTAMP 
                     WHERE id = $1 AND server_id = $2;`,
                    [
                        playerProfile.id,
                        playerProfile.server_id,
                        playerProfile.nickname || 'Hero',
                        parseInt(playerProfile.level) || 1,
                        parseInt(playerProfile.combat_power) || 0,
                        JSON.stringify(resources),
                        JSON.stringify(idleTimestamps),
                        JSON.stringify(gameData)
                    ]
                );
                successCount++;
            } catch (dbErr) {
                console.error(`[LazyWrite] Ошибка записи в БД для игрока ${playerProfile.id}:`, dbErr);
                await redisClient.sAdd('dirty_players', key); // Возврат в очередь при сбое
            }
        }

        if (successCount > 0) {
            console.log(`[LazyWrite] Успешно сохранено измененных профилей в PostgreSQL: ${successCount}`);
        }
    } catch (err) {
        console.error('[LazyWrite] Ошибка цикла записи:', err);
    }
}

async function syncDirtyBosses() {
    // =========================================================================
    // ДОБАВЛЕНО: СИНХРОНИЗАЦИЯ МИРОВЫХ И ГИЛЬДЕЙСКИХ БОССОВ
    // =========================================================================
    const bossKeys = await redisClient.sMembers('dirty_global_bosses');
    if (bossKeys.length > 0) {
        await redisClient.del('dirty_global_bosses');
        let bossSuccessCount = 0;

        for (const globalBossKey of bossKeys) {
            // Извлекаем хэш босса из Редиса
            const bHp = await redisClient.hGet(globalBossKey, 'current_hp');
            const bPool = await redisClient.hGet(globalBossKey, 'total_damage_pool');

            if (bHp === null || bPool === null) continue;

            // Парсим ключ обратно на составляющие: b:state:gameId:serverId:bossKey
            const parts = globalBossKey.split(':');
            const gameId = parts[2];
            const serverId = parts[3];
            const bossKey = parts[4];

            try {
                await global.pool.query(
                    `UPDATE global_boss_states 
                         SET current_hp = $1, total_damage_pool = $2, updated_at = CURRENT_TIMESTAMP
                         WHERE game_id = $3 AND server_id = $4 AND boss_key = $5;`,
                    [Number(bHp), bPool, gameId, serverId, bossKey]
                );
                bossSuccessCount++;
            } catch (bossDbErr) {
                console.error(`[LazyWrite] Ошибка записи босса ${bossKey} в БД:`, bossDbErr);
                await redisClient.sAdd('dirty_global_bosses', globalBossKey); // Возврат в очередь
            }
        }

        if (bossSuccessCount > 0) {
            console.log(`[LazyWrite] Успешно сохранено состояний мировых боссов в Postgres: ${bossSuccessCount}`);
        }
    }

}

function initLazyWriteTimer() {
    setInterval(()=>{
        syncDirtyPlayersToPostgres();
        syncDirtyBosses();
    }, 60000); // Раз в минуту
    console.log('[LazyWrite] Таймер синхронизации кэша запущен.');
}

module.exports = { markPlayerDirty, initLazyWriteTimer };

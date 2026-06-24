const { redisClient } = require('../../redisClient');
const { markPlayerDirty } = require('./lazyWrite');

const PLAYER_TTL_SECONDS = 1200; // 20 минут

// function getPlayerKey(userId, serverId) {
//     return `p:${serverId}:${userId}`;
// }

function getPlayerKey(username, serverId) {
    return `p:${serverId}:${username}`;
}

/**
 * Чтение игрока: Кэш -> БД Fallback (с разворачиванием game_data наружу)
 */
async function getPlayer(userIdOrName, serverId) {

    let username = userIdOrName;

    if (String(userIdOrName).includes('-') || !isNaN(userIdOrName)) {
        if (redisClient.isOpen && redisClient.isReady) {
            const pattern = `p:${serverId}:*`;
            const keys = await redisClient.keys(pattern);
            for (const key of keys) {
                const cached = await redisClient.get(key);
                if (cached) {
                    const parsed = JSON.parse(cached);
                    if (String(parsed.id) === String(userIdOrName)) {
                        username = parsed.username;
                        break;
                    }
                }
            }
        }
    }

    const key = getPlayerKey(username, serverId);

    if (redisClient.isOpen && redisClient.isReady) {
        try {
            const cachedData = await redisClient.get(key);
            if (cachedData) {
                await redisClient.expire(key, PLAYER_TTL_SECONDS);
                return JSON.parse(cachedData);
            }
        } catch (err) {
            console.error('[CacheManager:Get] Ошибка Redis, иду в БД:', err);
        }
    }

    const isUuid = String(userIdOrName).includes('-');
    const sqlCondition = isUuid ? `id = $1` : `nickname = $1`;

    const { rows } = await global.pool.query(
        `SELECT id, user_id, server_id, nickname, level, combat_power, resources, idle_timestamps, game_data 
         FROM player_server_profiles 
         WHERE ${sqlCondition} AND server_id = $2;`,
        [userIdOrName, serverId]
    );

    if (rows.length === 0) return null;
    const row = rows[0];

    const playerProfile = {
        id: row.id,
        user_id: row.user_id,
        server_id: row.server_id,
        nickname: row.nickname,
        level: row.level,
        combat_power: row.combat_power,
        resources: row.resources || {},
        idle_timestamps: row.idle_timestamps || {},
        username: row.nickname, // привязываем имя
        ...row.game_data
    };

    // Пишем в Редис по нашему новому единому ключу
    const finalKey = getPlayerKey(playerProfile.username, serverId);
    if (redisClient.isOpen && redisClient.isReady) {
        await redisClient.setEx(finalKey, PLAYER_TTL_SECONDS, JSON.stringify(playerProfile));
    }

    return playerProfile;
}

/**
 * Запись измененного плоского игрока в Редис + пометка dirty
 */
async function setPlayer(userIdOrName, serverId, playerProfile) {
    // Гарантируем, что имя пользователя всегда на месте
    const username = playerProfile.username || playerProfile.nickname;
    const key = getPlayerKey(username, serverId);

    if (redisClient.isOpen && redisClient.isReady) {
        try {
            await redisClient.setEx(key, PLAYER_TTL_SECONDS, JSON.stringify(playerProfile));
            // Передаем UUID строки для демона lazyWrite
            await markPlayerDirty(playerProfile.id, serverId);
            return true;
        } catch (err) {
            console.error('[CacheManager:Set] Ошибка записи в Redis:', err);
        }
    }
    return false;
}
//
// async function setPlayer(userId, serverId, playerProfile) {
//     const key = `p:${serverId}:${userId}`;
//
//     if (redisClient.isOpen && redisClient.isReady) {
//         try {
//             await redisClient.setEx(key, 1200, JSON.stringify(playerProfile));
//             await markPlayerDirty(userId, serverId);
//
//             // ДОБАВЛЕНО: Автоматически пушим актуальный рейтинг Арены в ZSET
//             const currentRating = playerProfile.resources?.arena_rating || 1000;
//             await updateLeaderboardScore(serverId, userId, currentRating);
//
//             return true;
//         } catch (err) {
//             console.error('[CacheManager:Set] Ошибка записи в Redis:', err);
//         }
//     }
//     return false;
// }


/**
 * 3. ПРИНУДИТЕЛЬНОЕ УДАЛЕНИЕ ИЗ КЭША
 */
async function invalidatePlayer(userId, serverId) {
    const key = getPlayerKey(userId, serverId);
    if (redisClient.isOpen && redisClient.isReady) {
        try {
            await redisClient.del(key);
        } catch (err) {
            console.error('[CacheManager:Del] Ошибка удаления из Redis:', err);
        }
    }
}

async function updateLeaderboardScore(serverId, userId, score) {
    if (redisClient.isOpen && redisClient.isReady) {
        try {
            const leaderboardKey = `lb:${serverId}:arena`;
            // ZADD принимает имя ключа, сам скор (рейтинг) и ID игрока (UUID)
            await redisClient.zAdd(leaderboardKey, {
                score: parseInt(score) || 1000,
                value: String(userId)
            });
        } catch (err) {
            console.error('[CacheManager:Leaderboard] Ошибка обновления скора:', err);
        }
    }
}

module.exports = {
    getPlayer,
    setPlayer,
    invalidatePlayer,
    updateLeaderboardScore
};

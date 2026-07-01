// battleStateManager.js
const { redisClient } = require('../../redisClient');

const BATTLE_KEY_PREFIX = 'battle:session:';
const BATTLE_TTL = 1800; // 30 минут жизни на один бой

/**
 * Сохраняет или обновляет стейт боя в Redis
 */
async function saveBattleState(battleId, userId, stateData, status = "ongoing", currentTurn, currentTeam, currentCharacterId, currentCharacterInstance, roundsLog, options, currObj) {
    const key = `${BATTLE_KEY_PREFIX}${battleId}`;
    const payload = {
        battle_id: battleId,
        user_id: userId,
        status: status,
        state: stateData, // Тут лежат pTeam и eTeam с их текущими hp, energy, gauge, effects
        currentTurn,
        currentTeam,
        currentCharacterId,
        currentCharacterInstance,
        roundsLog,
        options,
        currObj,
        updated_at: Date.now()
    };

    // Записываем строку и выставляем TTL
    await redisClient.set(key, JSON.stringify(payload), {
        EX: BATTLE_TTL
    });
    return payload;
}

/**
 * Получает текущий стейт боя из Redis
 */
async function getBattleState(battleId) {
    const key = `${BATTLE_KEY_PREFIX}${battleId}`;
    const data = await redisClient.get(key);
    if (!data) return null;
    return JSON.parse(data);
}

/**
 * Удаляет бой из Redis (когда бой завершен)
 */
async function deleteBattleState(battleId) {
    const key = `${BATTLE_KEY_PREFIX}${battleId}`;
    await redisClient.del(key);
}

module.exports = {
    saveBattleState,
    getBattleState,
    deleteBattleState
};

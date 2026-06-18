// backend/db/gachaDB.js

const { playersDB } = require('./playersDB');

// Изолированная база данных Гачи (Счетчики гаранта и суточные лимиты)
// Структура: gachaCountersDB[game_id][server_id][device_id][banner_id] = { pity: 0, daily_pulls: 0, last_pull_date: "" }
const gachaCountersDB = {};

function getOrCreateGachaCounters(gameId, serverId, deviceId, bannerId) {
    if (!gachaCountersDB[gameId]) gachaCountersDB[gameId] = {};
    if (!gachaCountersDB[gameId][serverId]) gachaCountersDB[gameId][serverId] = {};
    if (!gachaCountersDB[gameId][serverId][deviceId]) gachaCountersDB[gameId][serverId][deviceId] = {};

    if (!gachaCountersDB[gameId][serverId][deviceId][bannerId]) {
        gachaCountersDB[gameId][serverId][deviceId][bannerId] = {
            pity: 0,
            daily_pulls: 0,
            last_pull_date: new Date().toDateString()
        };
    }

    const counter = gachaCountersDB[gameId][serverId][deviceId][bannerId];
    const today = new Date().toDateString();

    // Сброс суточного лимита круток, если наступил новый день (LiveOps фича под твой лимит!)
    if (counter.last_pull_date !== today) {
        counter.daily_pulls = 0;
        counter.last_pull_date = today;
    }

    return counter;
}

// Инфраструктурный метод списания средств под твои новые пулы (валюта или айтемы)
function consumeGachaPayment(gameId, serverId, deviceId, currencyType, costPerOne, countMode) {
    const player = playersDB[gameId]?.[serverId]?.[deviceId];
    if (!player) return false;

    const totalCost = costPerOne * countMode;

    // Вариант 1: Списание системного ресурса из твоей новой mechanics.resources (diamond, friendship, gold)
    if (player.resources[currencyType] !== undefined) {
        if (player.resources[currencyType] < totalCost) return false;
        player.resources[currencyType] -= totalCost;
        return true;
    }

    // Вариант 2: Списание физических билетов/свитков из рюкзака предметов (scroll_epic)
    if (player.inventory[currencyType] !== undefined) {
        if (player.inventory[currencyType] < totalCost) return false;
        player.inventory[currencyType] -= totalCost;
        if (player.inventory[currencyType] <= 0) delete player.inventory[currencyType];
        return true;
    }

    return false;
}

// Инфраструктурный метод добавления награды по правилу gacha.rules.convert_duplicates_to_shards
function addHeroOrShard(gameConfig, gameId, serverId, deviceId, finalHeroId) {
    const player = playersDB[gameId]?.[serverId]?.[deviceId];
    if (!player) return null;

    // Считываем правило дубликатов строго из твоего нового gacha.rules
    const ruleConvert = gameConfig.gacha?.rules?.convert_duplicates_to_shards ?? false;
    const hasAlready = player.heroes.some(h => h.hero_id === finalHeroId);

    let isDuplicateConverted = false;
    let shardItemId = `shard_${finalHeroId.replace('hero_', '')}`;

    if (ruleConvert && hasAlready) {
        isDuplicateConverted = true;
        // Начисляем 10 осколков в рюкзак предметов за дубликат
        player.inventory[shardItemId] = (player.inventory[shardItemId] || 0) + 10;
    } else {
        // Создаем независимую копию персонажа со своим instance_id (Raid-Style)
        const newHeroInstance = {
            instance_id: "h_inst_" + Math.random().toString(36).substr(2, 5),
            hero_id: finalHeroId,
            level: 1,
            stars: 1,
            exp: 0,
            equipped: { weapon: null }
        };
        player.heroes.push(newHeroInstance);
    }

    return { isDuplicateConverted, player_state: player };
}

module.exports = {
    getOrCreateGachaCounters,
    consumeGachaPayment,
    addHeroOrShard,
    gachaCountersDB
};

// backend/db/gachaDB.js
const {recalculateAndSaveCombatPower} = require('./_shared');
const { playersDB } = require('./playersDB');
const { redisClient } = require('../../redisClient');
const { gamesConfigDB } = require('./configDB');
const Cache = require('./cacheManager');

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




/**
 * Универсальный и умный призыв Гачи, управляемый из админки (Data-Driven)
 * @param {number} userId - ID игрока в Postgres
 * @param {string} serverId - ID текущего сервера
 * @param {string} gameId - ID игры для подтягивания конфигов
 * @param {string} bannerId - ID баннера (например, 'banner_standard')
 * @param {number} count - Количество круток (из разрешенных в pool.modes)
 * @param {Array<string>} playerWishlist - Массив hero_id от игрока для вишлиста
 */
// async function summonGacha(userId, serverId, gameId, bannerId, count = 1, playerWishlist = []) {
//     const GameConfig = gamesConfigDB[gameId];
//     const gachaConfig = GameConfig?.gacha;
//
//     // Ищем баннер в массиве по его id
//     const banner = gachaConfig?.banners?.find(b => b.id === bannerId);
//     if (!banner) return { error: true, message: `Banner "${bannerId}" not found` };
//
//     // Ищем пул для этого баннера
//     const pool = gachaConfig?.pools?.[banner.poolId];
//     if (!pool) return { error: true, message: `Pool "${banner.poolId}" not found` };
//
//     // 1. ВАЛИДАЦИЯ РЕЖИМА КРУТКИ (modes)
//     if (!pool.modes?.includes(count)) {
//         return { error: true, message: `Invalid roll count. Allowed modes: ${pool.modes?.join(', ')}` };
//     }
//
//     const client = await global.pool.connect();
//     try {
//         await client.query('BEGIN');
//
//         // Достаем профиль игрока с блокировкой строки
//         const { rows } = await client.query(
//             `SELECT game_data, resources FROM player_server_profiles WHERE user_id = $1 AND server_id = $2 FOR UPDATE;`,
//             [userId, serverId]
//         );
//         if (rows.length === 0) throw new Error("Профиль игрока не найден");
//
//         let gameData = rows[0].game_data || {};
//         let resources = rows[0].resources || {};
//         let inventory = gameData.inventory || {};
//         let heroes = gameData.heroes || [];
//
//         // Инициализируем системные счетчики гачи в JSONB
//         if (!gameData.gacha_stats) gameData.gacha_stats = { total_rolls: {}, daily_rolls: {}, last_reset_at: Date.now() };
//         if (!gameData.gacha_pity) gameData.gacha_pity = {};
//
//         let gachaStats = gameData.gacha_stats;
//         let gachaPity = gameData.gacha_pity;
//
//         if (!gachaStats.total_rolls[bannerId]) gachaStats.total_rolls[bannerId] = 0;
//         if (!gachaStats.daily_rolls[bannerId]) gachaStats.daily_rolls[bannerId] = 0;
//         if (!gachaPity[bannerId]) gachaPity[bannerId] = { main: 0, every: {} };
//
//         // --- ЛЕЗИ-СБРОС ЕЖЕДНЕВНЫХ ЛИМИТОВ (Lazy Reset) ---
//         const now = Date.now();
//         const lastReset = new Date(gachaStats.last_reset_at);
//         const today = new Date(now);
//         if (lastReset.toDateString() !== today.toDateString()) {
//             gachaStats.daily_rolls = {}; // Сбрасываем все лимиты круток за сегодня
//             gachaStats.last_reset_at = now;
//         }
//
//         // 2. ОПРЕДЕЛЕНИЕ СТОИМОСТИ И ВАЛЮТЫ (Свитки или Альтернатива из пула)
//         let costCurrency = banner.cost_item_id;
//         let costAmount = (banner.cost_amount || 1) * count;
//         let isUsingAlternative = false;
//
//         // Если свитков/билетов на баннер нет в инвентаре — переключаемся на цену пула (например, алмазы)
//         if (!inventory[costCurrency] || inventory[costCurrency] < costAmount) {
//             costCurrency = pool.currency; // например, 'diamond'
//             costAmount = (pool.cost || 2000) * (count === 10 ? 9 : count); // Скидка х10, если заложена логикой пула
//             isUsingAlternative = true;
//         }
//
//         // --- ПРОВЕРКА ЕЖЕДНЕВНЫХ ЛИМИТОВ ИЗ АДМИНКИ ---
//         if (isUsingAlternative) {
//             const limitKey = `${costCurrency}_limits`; // динамический ключ 'diamond_limits'
//             const bannerLimit = gachaConfig?.rules?.[limitKey]?.[bannerId];
//
//             if (bannerLimit !== undefined) {
//                 const currentDaily = gachaStats.daily_rolls[bannerId] || 0;
//                 if (currentDaily + count > bannerLimit) {
//                     throw new Error(`Достигнут ежедневный лимит круток для этого баннера (${bannerLimit})`);
//                 }
//                 // Инкрементируем ежедневный счетчик
//                 gachaStats.daily_rolls[bannerId] = currentDaily + count;
//             }
//         }
//
//         // Списание валюты
//         if (isUsingAlternative) {
//             // Списываем как ресурс (gold, diamond, friendship)
//             if ((parseInt(resources[costCurrency]) || 0) < costAmount) throw new Error(`Недостаточно ресурса: ${costCurrency}`);
//             resources[costCurrency] = (parseInt(resources[costCurrency]) || 0) - costAmount;
//         } else {
//             // Списываем как предмет из инвентаря (свитки)
//             inventory[costCurrency] -= costAmount;
//             if (inventory[costCurrency] <= 0) delete inventory[costCurrency];
//         }
//
//         // 3. ЦИКЛ ГЕНЕРАЦИИ ДРОПА (х1 или х10)
//         const rolledRewards = [];
//         const rates = pool.rates; // {"SSR": 5, "SR": 25, "R": 70}
//
//         // Сортируем редкости по убыванию силы, чтобы понимать иерархию для гарантов
//         const rarityHierarchy = Object.keys(rates);
//
//         for (let r = 0; r < count; r++) {
//             gachaStats.total_rolls[bannerId] += 1;
//             gachaPity[bannerId].main += 1;
//
//             const currentTotalRolls = gachaStats.total_rolls[bannerId];
//             const currentMainPity = gachaPity[bannerId].main;
//
//             // Наращиваем все промежуточные счетчики циклических гарантов 'every'
//             if (banner.guarantees?.every) {
//                 Object.keys(banner.guarantees.every).forEach(rar => {
//                     if (!gachaPity[bannerId].every[rar]) gachaPity[bannerId].every[rar] = 0;
//                     gachaPity[bannerId].every[rar] += 1;
//                 });
//             }
//
//             let finalRarity = null;
//
//             // --- АЛГОРИТМ ГАРАНТОВ ИЗ АДМИНКИ ---
//
//             // А. Проверка жесткого Pity порога баннера (pity_threshold) на высшую редкость
//             if (banner.pity_threshold > 0 && currentMainPity >= banner.pity_threshold) {
//                 finalRarity = rarityHierarchy[0]; // Принудительно выставляем самый высший тир (например, SSR)
//             }
//             // Б. Проверка гарантов новичка (first: { 'SSR': 10 })
//             else if (banner.guarantees?.first) {
//                 for (const [rar, targetRoll] of Object.entries(banner.guarantees.first)) {
//                     if (currentTotalRolls === targetRoll) {
//                         finalRarity = rar;
//                         break;
//                     }
//                 }
//             }
//
//             // В. Проверка циклического гаранта (every: { 'SR': 10 })
//             if (!finalRarity && banner.guarantees?.every) {
//                 for (const [rar, targetEveryRoll] of Object.entries(banner.guarantees.every)) {
//                     if (gachaPity[bannerId].every[rar] >= targetEveryRoll) {
//                         finalRarity = rar;
//                         break;
//                     }
//                 }
//             }
//
//             // Г. Обычный математический ролл, если ни один гарант не сработал (Рандом от 1 до 100)
//             if (!finalRarity) {
//                 let rng = Math.floor(Math.random() * 100) + 1;
//                 for (const [rarity, percent] of Object.entries(rates)) {
//                     rng -= percent;
//                     if (rng <= 0) {
//                         finalRarity = rarity;
//                         break;
//                     }
//                 }
//             }
//
//             // --- ОБНУЛЕНИЕ СЧЕТЧИКОВ ГАРАНТОВ ПРИ УСПЕШНОМ ВЫПАДЕНИИ ---
//             // Если выпал высший тир (или выше) — обнуляем главный pity_threshold
//             if (finalRarity === rarityHierarchy[0]) {
//                 gachaPity[bannerId].main = 0;
//             }
//             // Обнуляем счетчики 'every' для выпавшей редкости и всех редкостей ниже нее
//             if (banner.guarantees?.every) {
//                 Object.keys(banner.guarantees.every).forEach(rar => {
//                     if (finalRarity === rar || rarityHierarchy.indexOf(finalRarity) < rarityHierarchy.indexOf(rar)) {
//                         gachaPity[bannerId].every[rar] = 0;
//                     }
//                 });
//             }
//
//             // --- ВЫБОР ГЕРОЯ ИЗ ПУЛА С УЧЕТОМ ПРЕЙ-АПА (RATE-UP) ---
//             const poolHeroes = pool.heroes?.[finalRarity] || [];
//             let chosenHeroId = null;
//
//             if (poolHeroes.length > 0) {
//                 // Если админка настроила веса для конкретных героев (Rate-Up пула)
//                 if (pool.rate_up && pool.rate_up[finalRarity]) {
//                     const rateUpWeights = pool.rate_up[finalRarity];
//                     let totalWeight = Object.values(rateUpWeights).reduce((a, b) => a + b, 0);
//                     let heroRng = Math.floor(Math.random() * totalWeight);
//
//                     for (const [hId, weight] of Object.entries(rateUpWeights)) {
//                         heroRng -= weight;
//                         if (heroRng < 0) {
//                             chosenHeroId = hId;
//                             break;
//                         }
//                     }
//                 }
//                 // Иначе проверяем Wishlist игрока (если он включен на баннере)
//                 else if (banner.wishlist_enabled && playerWishlist.length > 0) {
//                     const matchingWishlist = playerWishlist.filter(id => poolHeroes.includes(id));
//                     if (matchingWishlist.length > 0 && Math.random() < 0.30) { // 30% шанс на триггер вишлиста
//                         chosenHeroId = matchingWishlist[Math.floor(Math.random() * matchingWishlist.length)];
//                     }
//                 }
//
//                 // Если прей-ап не сработал или пуст — берем просто случайного с равными шансами
//                 if (!chosenHeroId) {
//                     chosenHeroId = poolHeroes[Math.floor(Math.random() * poolHeroes.length)];
//                 }
//             }
//
//             if (!chosenHeroId) throw new Error(`Пул персонажей для редкости ${finalRarity} пуст!`);
//
//             // --- ОБРАБОТКА ДУБЛИКАТОВ И НАЧИСЛЕНИЕ ---
//             const convertDuplicates = gachaConfig?.rules?.convert_duplicates_to_shards || false;
//             const hasDuplicate = heroes.some(h => h.hero_id === chosenHeroId);
//
//             if (hasDuplicate && convertDuplicates) {
//                 // Конвертация в осколки по правилу из админки (shards)
//                 const shardItemId = `shard_${chosenHeroId}`;
//                 // Количество осколков динамически зависит от выбитой редкости
//                 const shardCount = finalRarity === "SSR" ? 50 : finalRarity === "SR" ? 15 : 5;
//                 inventory[shardItemId] = (inventory[shardItemId] || 0) + shardCount;
//
//                 rolledRewards.push({
//                     type: "duplicate_shard",
//                     id: chosenHeroId,
//                     rarity: finalRarity,
//                     count: shardCount
//                 });
//             }
//             else {
//                 // Выдача нового инстанса персонажа 1-го уровня (если дубликаты разрешены или это новый герой)
//                 const heroProto = GameConfig?.catalog?.heroes?.[chosenHeroId];
//                 const newHero = {
//                         instance_id: "h_inst_" + Math.random().toString(36).substr(2, 5),
//                         hero_id: chosenHeroId,
//                         level: 1,
//                         stars: heroProto?.base_stars || 1,
//                         exp: 0,
//                         combat_power: 0, // Пересчитается ниже
//                         equipped: {},
//                         personal_item_level: 0,
//                         active_skin: `${chosenHeroId}_skin_default`,
//                         pet: null
//                 };
//                 heroes.push(newHero);
//                 rolledRewards.push({
//                     type: "hero_new",
//                     id: chosenHeroId,
//                     rarity: finalRarity,
//                     instance_id: newHero.instance_id
//                 });
//             }
//         }
//
//         // 4. ФИКСИРУЕМ ОБНОВЛЕННОЕ СОСТОЯНИЕ В ОБЪЕКТАХ
//         gameData.inventory = inventory;
//         gameData.heroes = heroes;
//         gameData.gacha_stats = gachaStats;
//         gameData.gacha_pity = gachaPity;
//
//         // Сохраняем промежуточные данные в БД для фиксации транзакции
//         const updateQuery = `
//             UPDATE player_server_profiles
//             SET game_data = $3, resources = $4, updated_at = CURRENT_TIMESTAMP
//             WHERE user_id = $1 AND server_id = $2;
//         `;
//         await client.query(updateQuery, [userId, serverId, JSON.stringify(gameData), JSON.stringify(resources)]);
//         await client.query('COMMIT');
//
//         // 5. ПЕРЕСЧИТЫВАЕМ БОЕВУЮ СИЛУ ВСЕГО АККАУНТА И КАЖДОГО ГЕРОЯ
//         // (Метод сам откроет свою транзакцию, посчитает БР и запишет в базу)
//         await recalculateAndSaveCombatPower(userId, serverId, gameId);
//
//         // 6. ПОЛУЧАЕМ СВЕЖИЙ ЧИСТЫЙ ПРОФИЛЬ ДЛЯ ОТПРАВКИ НА КЛИЕНТ
//         const finalQuery = `SELECT game_data, resources FROM player_server_profiles WHERE user_id = $1 AND server_id = $2;`;
//         const { rows: finalRows } = await global.pool.query(finalQuery, [userId, serverId]);
//
//         return {
//             success: true,
//             rewards: rolledRewards, // Передаем массив дропа для анимации на фронте
//             resources: finalRows[0].resources || {},
//             game_data: finalRows[0].game_data || {}
//         };
//
//     } catch (e) {
//         await client.query('ROLLBACK');
//         console.error("Ошибка при призыве Гачи:", e);
//         return { error: true, message: e.message };
//     } finally {
//         client.release(); // Возвращаем клиента в пул соединений
//     }
// }


async function summonGacha(userId, serverId, gameId, bannerId, count = 1, playerWishlist = []) {
    const GameConfig = gamesConfigDB[gameId];
    const gachaConfig = GameConfig?.gacha;

    const banner = gachaConfig?.banners?.find(b => b.id === bannerId);
    if (!banner) return { error: true, message: `Banner "${bannerId}" not found` };
    const pool = gachaConfig?.pools?.[banner.poolId];
    if (!pool) return { error: true, message: `Pool "${banner.poolId}" not found` };

    if (!pool.modes?.includes(count)) {
        return { error: true, message: `Invalid roll count. Allowed modes: ${pool.modes?.join(', ')}` };
    }

    // ------------------------------------------------------------------------
    // ЭШЕЛОН 1: РАБОТА В ОПЕРАТИВНОЙ ПАМЯТИ REDIS (СВЕРХБЫСТРЫЙ ПУТЬ)
    // ------------------------------------------------------------------------
    if (redisClient.isOpen && redisClient.isReady) {
        try {
            let player = await Cache.getPlayer(userId, serverId);
            if (!player) throw new Error("Профиль игрока не найден в кэше Redis");

            let resources = player.resources || {};
            let inventory = player.inventory || {};
            let heroes = player.heroes || [];

            if (!player.gacha_stats) player.gacha_stats = { total_rolls: {}, daily_rolls: {}, last_reset_at: Date.now() };
            if (!player.gacha_pity) player.gacha_pity = {};

            let gachaStats = player.gacha_stats;
            let gachaPity = player.gacha_pity;

            if (!gachaStats.total_rolls[bannerId]) gachaStats.total_rolls[bannerId] = 0;
            if (!gachaStats.daily_rolls[bannerId]) gachaStats.daily_rolls[bannerId] = 0;
            if (!gachaPity[bannerId]) gachaPity[bannerId] = { main: 0, every: {} };

            // ЛЕЗИ-СБРОС ЕЖЕДНЕВНЫХ ЛИМИТОВ В RAM
            const now = Date.now();
            const lastReset = new Date(gachaStats.last_reset_at);
            const today = new Date(now);
            if (lastReset.toDateString() !== today.toDateString()) {
                gachaStats.daily_rolls = {};
                gachaStats.last_reset_at = now;
            }

            let costCurrency = banner.cost_item_id;
            let costAmount = (banner.cost_amount || 1) * count;
            let isUsingAlternative = false;

            if (!inventory[costCurrency] || inventory[costCurrency] < costAmount) {
                costCurrency = pool.currency;
                costAmount = (pool.cost || 2000) * (count === 10 ? 9 : count);
                isUsingAlternative = true;
            }

            if (isUsingAlternative) {
                const limitKey = `${costCurrency}_limits`;
                const bannerLimit = gachaConfig?.rules?.[limitKey]?.[bannerId];

                if (bannerLimit !== undefined) {
                    const currentDaily = gachaStats.daily_rolls[bannerId] || 0;
                    if (currentDaily + count > bannerLimit) {
                        return { error: true, message: `Достигнут ежедневный лимит круток для этого баннера (${bannerLimit})` };
                    }
                    gachaStats.daily_rolls[bannerId] = currentDaily + count;
                }
            }

            if (isUsingAlternative) {
                if ((parseInt(resources[costCurrency]) || 0) < costAmount) return { error: true, message: `Недостаточно ресурса: ${costCurrency}` };
                resources[costCurrency] = (parseInt(resources[costCurrency]) || 0) - costAmount;
            } else {
                inventory[costCurrency] -= costAmount;
                if (inventory[costCurrency] <= 0) delete inventory[costCurrency];
            }

            // Передаем управление во Вторую Часть (Алгоритм Гарантов и Выдача персонажей в RAM)
            return await runGachaLogicInRAM(userId, serverId, gameId, GameConfig, banner, pool, count, playerWishlist, player, resources, inventory, heroes, gachaStats, gachaPity);

        } catch (cacheErr) {
            console.warn('[GachaDB:Summon] Сбой Redis, проваливаюсь в Postgres Fallback:', cacheErr);
        }
    }

    // ------------------------------------------------------------------------
    // НАЧАЛО ЭШЕЛОНА 2: ТВОЙ СТАРЫЙ SQL FALLBACK (ПЕРВАЯ ЧАСТЬ)
    // ------------------------------------------------------------------------
    const client = await global.pool.connect();
    try {
        await client.query('BEGIN');
        const { rows } = await client.query(
            `SELECT game_data, resources FROM player_server_profiles WHERE id = $1 AND server_id = $2 FOR UPDATE;`,
            [userId, serverId]
        );
        if (rows.length === 0) throw new Error("Профиль игрока не найден");

        let gameData = rows[0].game_data || {};
        let resources = rows[0].resources || {};
        let inventory = gameData.inventory || {};
        let heroes = gameData.heroes || [];

        if (!gameData.gacha_stats) gameData.gacha_stats = { total_rolls: {}, daily_rolls: {}, last_reset_at: Date.now() };
        if (!gameData.gacha_pity) gameData.gacha_pity = {};

        let gachaStats = gameData.gacha_stats;
        let gachaPity = gameData.gacha_pity;

        if (!gachaStats.total_rolls[bannerId]) gachaStats.total_rolls[bannerId] = 0;
        if (!gachaStats.daily_rolls[bannerId]) gachaStats.daily_rolls[bannerId] = 0;
        if (!gachaPity[bannerId]) gachaPity[bannerId] = { main: 0, every: {} };

        const now = Date.now();
        const lastReset = new Date(gachaStats.last_reset_at);
        const today = new Date(now);
        if (lastReset.toDateString() !== today.toDateString()) {
            gachaStats.daily_rolls = {};
            gachaStats.last_reset_at = now;
        }

        let costCurrency = banner.cost_item_id;
        let costAmount = (banner.cost_amount || 1) * count;
        let isUsingAlternative = false;

        if (!inventory[costCurrency] || inventory[costCurrency] < costAmount) {
            costCurrency = pool.currency;
            costAmount = (pool.cost || 2000) * (count === 10 ? 9 : count);
            isUsingAlternative = true;
        }

        if (isUsingAlternative) {
            const limitKey = `${costCurrency}_limits`;
            const bannerLimit = gachaConfig?.rules?.[limitKey]?.[bannerId];

            if (bannerLimit !== undefined) {
                const currentDaily = gachaStats.daily_rolls[bannerId] || 0;
                if (currentDaily + count > bannerLimit) throw new Error(`Достигнут ежедневный лимит круток для этого баннера (${bannerLimit})`);
                gachaStats.daily_rolls[bannerId] = currentDaily + count;
            }
        }

        if (isUsingAlternative) {
            if ((parseInt(resources[costCurrency]) || 0) < costAmount) throw new Error(`Недостаточно ресурса: ${costCurrency}`);
            resources[costCurrency] = (parseInt(resources[costCurrency]) || 0) - costAmount;
        } else {
            inventory[costCurrency] -= costAmount;
            if (inventory[costCurrency] <= 0) delete inventory[costCurrency];
        }

        // Вызов логики генерации на уровне SQL Fallback (Часть 2 в режиме БД)
        return await runGachaLogicInSQL(client, userId, serverId, gameId, GameConfig, banner, pool, count, playerWishlist, gameData, resources, inventory, heroes, gachaStats, gachaPity, bannerId);

    } catch (e) {
        await client.query('ROLLBACK');
        console.error("Ошибка при призыве Гачи в SQL:", e);
        return { error: true, message: e.message };
    } finally {
        client.release();
    }
}

/**
 * КЭШ-ЛОГИКА (REDIS RAM): Полный цикл генерации х1/х10 призывов в оперативной памяти
 */
async function runGachaLogicInRAM(userId, serverId, gameId, GameConfig, banner, pool, count, playerWishlist, player, resources, inventory, heroes, gachaStats, gachaPity) {
    const bannerId = banner.id;
    const rolledRewards = [];
    const rates = pool.rates;
    const rarityHierarchy = Object.keys(rates);

    for (let r = 0; r < count; r++) {
        gachaStats.total_rolls[bannerId] += 1;
        gachaPity[bannerId].main += 1;

        const currentTotalRolls = gachaStats.total_rolls[bannerId];
        const currentMainPity = gachaPity[bannerId].main;

        if (banner.guarantees?.every) {
            Object.keys(banner.guarantees.every).forEach(rar => {
                if (!gachaPity[bannerId].every[rar]) gachaPity[bannerId].every[rar] = 0;
                gachaPity[bannerId].every[rar] += 1;
            });
        }

        let finalRarity = null;

        // А. Жесткий Pity порог баннера
        if (banner.pity_threshold > 0 && currentMainPity >= banner.pity_threshold) {
            finalRarity = rarityHierarchy[0];
        }
        // Б. Гаранты новичка
        else if (banner.guarantees?.first) {
            for (const [rar, targetRoll] of Object.entries(banner.guarantees.first)) {
                if (currentTotalRolls === targetRoll) {
                    finalRarity = rar;
                    break;
                }
            }
        }

        // В. Циклический гарант
        if (!finalRarity && banner.guarantees?.every) {
            for (const [rar, targetEveryRoll] of Object.entries(banner.guarantees.every)) {
                if (gachaPity[bannerId].every[rar] >= targetEveryRoll) {
                    finalRarity = rar;
                    break;
                }
            }
        }

        // Г. Обычный ролл по весам
        if (!finalRarity) {
            let rng = Math.floor(Math.random() * 100) + 1;
            for (const [rarity, percent] of Object.entries(rates)) {
                rng -= percent;
                if (rng <= 0) {
                    finalRarity = rarity;
                    break;
                }
            }
        }

        // Сброс счетчиков
        if (finalRarity === rarityHierarchy[0]) {
            gachaPity[bannerId].main = 0;
        }
        if (banner.guarantees?.every) {
            Object.keys(banner.guarantees.every).forEach(rar => {
                if (finalRarity === rar || rarityHierarchy.indexOf(finalRarity) < rarityHierarchy.indexOf(rar)) {
                    gachaPity[bannerId].every[rar] = 0;
                }
            });
        }

        // Выбор конкретного героя по весам / вишлисту
        const chosenHeroId = rollSpecificHeroFromPool(pool, banner, finalRarity, playerWishlist);
        if (!chosenHeroId) return { error: true, message: `Пул персонажей для редкости ${finalRarity} пуст!` };

        // Начисление дропа в RAM (передаем управление Части 3 для RAM)
        processGachaRewardInRAM(GameConfig, finalRarity, chosenHeroId, heroes, inventory, rolledRewards);
    }

    // Сохранение и финализация (будет описано в Части 3 для RAM)
    return await finalizeGachaInRAM(userId, serverId, gameId, player, resources, inventory, heroes, gachaStats, gachaPity, rolledRewards);
}

/**
 * БАЗОВАЯ ЛОГИКА (POSTGRESQL): Цикл х1/х10 призывов для SQL Fallback режима
 */
async function runGachaLogicInSQL(client, userId, serverId, gameId, GameConfig, banner, pool, count, playerWishlist, gameData, resources, inventory, heroes, gachaStats, gachaPity, bannerId) {
    const rolledRewards = [];
    const rates = pool.rates;
    const rarityHierarchy = Object.keys(rates);

    for (let r = 0; r < count; r++) {
        gachaStats.total_rolls[bannerId] += 1;
        gachaPity[bannerId].main += 1;

        const currentTotalRolls = gachaStats.total_rolls[bannerId];
        const currentMainPity = gachaPity[bannerId].main;

        if (banner.guarantees?.every) {
            Object.keys(banner.guarantees.every).forEach(rar => {
                if (!gachaPity[bannerId].every[rar]) gachaPity[bannerId].every[rar] = 0;
                gachaPity[bannerId].every[rar] += 1;
            });
        }

        let finalRarity = null;

        if (banner.pity_threshold > 0 && currentMainPity >= banner.pity_threshold) {
            finalRarity = rarityHierarchy[0];
        }
        else if (banner.guarantees?.first) {
            for (const [rar, targetRoll] of Object.entries(banner.guarantees.first)) {
                if (currentTotalRolls === targetRoll) {
                    finalRarity = rar;
                    break;
                }
            }
        }

        if (!finalRarity && banner.guarantees?.every) {
            for (const [rar, targetEveryRoll] of Object.entries(banner.guarantees.every)) {
                if (gachaPity[bannerId].every[rar] >= targetEveryRoll) {
                    finalRarity = rar;
                    break;
                }
            }
        }

        if (!finalRarity) {
            let rng = Math.floor(Math.random() * 100) + 1;
            for (const [rarity, percent] of Object.entries(rates)) {
                rng -= percent;
                if (rng <= 0) {
                    finalRarity = rarity;
                    break;
                }
            }
        }

        if (finalRarity === rarityHierarchy[0]) {
            gachaPity[bannerId].main = 0;
        }
        if (banner.guarantees?.every) {
            Object.keys(banner.guarantees.every).forEach(rar => {
                if (finalRarity === rar || rarityHierarchy.indexOf(finalRarity) < rarityHierarchy.indexOf(rar)) {
                    gachaPity[bannerId].every[rar] = 0;
                }
            });
        }

        const chosenHeroId = rollSpecificHeroFromPool(pool, banner, finalRarity, playerWishlist);
        if (!chosenHeroId) throw new Error(`Пул персонажей для редкости ${finalRarity} пуст!`);

        // Начисление дропа в SQL (передаем управление Части 3 для SQL)
        processGachaRewardInSQL(GameConfig, finalRarity, chosenHeroId, heroes, inventory, rolledRewards);
    }

    // Коммит и финализация в Postgres (будет описано в Части 3 для SQL)
    return await finalizeGachaInSQL(client, userId, serverId, gameId, gameData, resources, inventory, heroes, gachaStats, gachaPity, rolledRewards);
}

/**
 * ЧИСТАЯ ВСПОМОГАТЕЛЬНАЯ ФУНКЦИЯ: Математический выбор героя по весам, прей-апам или вишлисту
 */
function rollSpecificHeroFromPool(pool, banner, finalRarity, playerWishlist) {
    const poolHeroes = pool.heroes?.[finalRarity] || [];
    let chosenHeroId = null;

    if (poolHeroes.length > 0) {
        if (pool.rate_up && pool.rate_up[finalRarity]) {
            const rateUpWeights = pool.rate_up[finalRarity];
            let totalWeight = Object.values(rateUpWeights).reduce((a, b) => a + b, 0);
            let heroRng = Math.floor(Math.random() * totalWeight);

            for (const [hId, weight] of Object.entries(rateUpWeights)) {
                heroRng -= weight;
                if (heroRng < 0) {
                    chosenHeroId = hId;
                    break;
                }
            }
        }
        else if (banner.wishlist_enabled && playerWishlist.length > 0) {
            const matchingWishlist = playerWishlist.filter(id => poolHeroes.includes(id));
            if (matchingWishlist.length > 0 && Math.random() < 0.30) {
                chosenHeroId = matchingWishlist[Math.floor(Math.random() * matchingWishlist.length)];
            }
        }

        if (!chosenHeroId) {
            chosenHeroId = poolHeroes[Math.floor(Math.random() * poolHeroes.length)];
        }
    }
    return chosenHeroId;
}

/**
 * НАЧИСЛЕНИЕ НАГРАДЫ (REDIS RAM): Логика дубликатов в памяти
 */
function processGachaRewardInRAM(GameConfig, finalRarity, chosenHeroId, heroes, inventory, rolledRewards) {
    const convertDuplicates = GameConfig?.gacha?.rules?.convert_duplicates_to_shards || false;
    const hasDuplicate = heroes.some(h => h.hero_id === chosenHeroId);

    if (hasDuplicate && convertDuplicates) {
        const shardItemId = `shard_${chosenHeroId}`;
        const shardCount = finalRarity === "SSR" ? 50 : finalRarity === "SR" ? 15 : 5;
        inventory[shardItemId] = (parseInt(inventory[shardItemId]) || 0) + shardCount;

        rolledRewards.push({
            type: "duplicate_shard",
            id: chosenHeroId,
            rarity: finalRarity,
            count: shardCount
        });
    } else {
        const heroProto = GameConfig?.catalog?.heroes?.[chosenHeroId];
        const newHero = {
                instance_id: "h_inst_" + Math.random().toString(36).substr(2, 5),
                hero_id: chosenHeroId,
                level: 1,
                stars: heroProto?.base_stars || 1,
            exp: 0,
            combat_power: 0,
            equipped: {},
            personal_item_level: 0,
            active_skin: `${chosenHeroId}_skin_default`,
            pet: null
    };
        heroes.push(newHero);
        rolledRewards.push({
            type: "hero_new",
            id: chosenHeroId,
            rarity: finalRarity,
            instance_id: newHero.instance_id
        });
    }
}

/**
 * ФИНАЛИЗАЦИЯ ИЗМЕНЕНИЙ В RAM КЭШЕ REDIS
 */
async function finalizeGachaInRAM(userId, serverId, gameId, player, resources, inventory, heroes, gachaStats, gachaPity, rolledRewards) {
    // Возвращаем все структуры обратно в плоский объект
    player.inventory = inventory;
    player.heroes = heroes;
    player.gacha_stats = gachaStats;
    player.gacha_pity = gachaPity;
    player.resources = resources;

    // Сохраняем в Редис и помечаем dirty
    await Cache.setPlayer(player);

    // Пересчитываем силу
    const newPower = await recalculateAndSaveCombatPower(userId, serverId, gameId);

    // Синхронизируем Лидерборд силы и обновляем локальный кэш
    player.combat_power = newPower;
    await redisClient.setEx(`p:${serverId}:${userId}`, 1200, JSON.stringify(player));
    await redisClient.zAdd(`lb:${serverId}:combat_power`, { score: parseInt(newPower), value: String(userId) });

    // Собираем game_data для фронтенда
    const rootFields = ['id', 'user_id', 'server_id', 'nickname', 'level', 'combat_power', 'resources', 'idle_timestamps'];
    const returnedGameData = {};
    Object.entries(player).forEach(([key, val]) => {
        if (!rootFields.includes(key) && !['gameId', 'deviceId', 'sessionId', 'partnerId', 'username'].includes(key)) {
            returnedGameData[key] = val;
        }
    });

    return {
        success: true,
        rewards: rolledRewards,
        gacha_list: rolledRewards,
        resources: player.resources,
        inventory: player.inventory,
        heroes: returnedGameData.heroes
    };
}

/**
 * НАЧИСЛЕНИЕ НАГРАДЫ (SQL FALLBACK): Логика дубликатов для БД
 */
function processGachaRewardInSQL(GameConfig, finalRarity, chosenHeroId, heroes, inventory, rolledRewards) {
    const convertDuplicates = GameConfig?.gacha?.rules?.convert_duplicates_to_shards || false;
    const hasDuplicate = heroes.some(h => h.hero_id === chosenHeroId);

    if (hasDuplicate && convertDuplicates) {
        const shardItemId = `shard_${chosenHeroId}`;
        const shardCount = finalRarity === "SSR" ? 50 : finalRarity === "SR" ? 15 : 5;
        inventory[shardItemId] = (inventory[shardItemId] || 0) + shardCount;

        rolledRewards.push({
            type: "duplicate_shard",
            id: chosenHeroId,
            rarity: finalRarity,
            count: shardCount
        });
    } else {
        const heroProto = GameConfig?.catalog?.heroes?.[chosenHeroId];
        const newHero = {
                instance_id: "h_inst_" + Math.random().toString(36).substr(2, 5),
                hero_id: chosenHeroId,
                level: 1,
                stars: heroProto?.base_stars || 1,
            exp: 0,
            combat_power: 0,
            equipped: {},
            personal_item_level: 0,
            active_skin: `${chosenHeroId}_skin_default`,
            pet: null
    };
        heroes.push(newHero);
        rolledRewards.push({
            type: "hero_new",
            id: chosenHeroId,
            rarity: finalRarity,
            instance_id: newHero.instance_id
        });
    }
}

/**
 * ФИНАЛИЗАЦИЯ ИЗМЕНЕНИЙ В POSTGRESQL (FALLBACK)
 */
async function finalizeGachaInSQL(client, userId, serverId, gameId, gameData, resources, inventory, heroes, gachaStats, gachaPity, rolledRewards) {
    gameData.inventory = inventory;
    gameData.heroes = heroes;
    gameData.gacha_stats = gachaStats;
    gameData.gacha_pity = gachaPity;

    const updateQuery = `
        UPDATE player_server_profiles 
        SET game_data = $3, resources = $4, updated_at = CURRENT_TIMESTAMP 
        WHERE id = $1 AND server_id = $2;
    `;
    await client.query(updateQuery, [userId, serverId, JSON.stringify(gameData), JSON.stringify(resources)]);
    await client.query('COMMIT');

    // Пересчитываем силу в СУБД
    await recalculateAndSaveCombatPower(userId, serverId, gameId);

    const finalQuery = `SELECT game_data, resources FROM player_server_profiles WHERE id = $1 AND server_id = $2;`;
    const { rows: finalRows } = await global.pool.query(finalQuery, [userId, serverId]);

    return {
        success: true,
        rewards: rolledRewards,
        gacha_list: rolledRewards,
        resources: player.resources,
        inventory: player.inventory,
        heroes: returnedGameData.heroes
    };
}

module.exports = {
    getOrCreateGachaCounters,
    consumeGachaPayment,
    addHeroOrShard,
    gachaCountersDB,
    summonGacha
};


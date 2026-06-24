const {getHeroRating, getItemRating, recalculateAndSaveCombatPower} = require('./_shared');
const {gamesConfigDB} = require('./configDB');
const { redisClient } = require('../../redisClient');
const Cache = require('./cacheManager');

/**
 * Добавление нового героя на аккаунт (например, из Гачи)
 */
async function addHero(userId, serverId, gameId, heroId) {
    const GameConfig = gamesConfigDB[gameId];
    const heroProto = GameConfig?.catalog?.heroes?.[heroId];
    if (!heroProto) return { error: true, message: "Прототип героя не найден в конфиге" };

    const client = await global.pool.connect();
    try {
        await client.query('BEGIN');

        const selectQuery = `SELECT game_data FROM player_server_profiles WHERE user_id = $1 AND server_id = $2 FOR UPDATE;`;
        const { rows } = await client.query(selectQuery, [userId, serverId]);
        if (rows.length === 0) throw new Error("Профиль не найден");

        let gameData = rows[0].game_data;
        let heroes = gameData.heroes || [];

        // Создаем новый инстанс героя
        const newHero = {
            instance_id: "h_inst_" + Math.random().toString(36).substr(2, 5),
            hero_id: heroId,
            level: 1,
            stars: heroProto.base_stars || 1, // берем базовые звезды из конфига или 1
            exp: 0,
            combat_power: 0, // пересчитается ниже
            equipped: {},
            personal_item_level: 0,
            active_skin: `${heroId}_skin_default`,
            pet: null
        };

        heroes.push(newHero);
        gameData.heroes = heroes;

        const updateQuery = `UPDATE player_server_profiles SET game_data = $3 WHERE user_id = $1 AND server_id = $2;`;
        await client.query(updateQuery, [userId, serverId, JSON.stringify(gameData)]);
        await client.query('COMMIT');

        // Пересчитываем БР, чтобы зафиксировать силу нового героя
        const newPower = await recalculateAndSaveCombatPower(userId, serverId, gameId);

        // Возвращаем обновленные данные
        const finalQuery = `SELECT game_data FROM player_server_profiles WHERE user_id = $1 AND server_id = $2;`;
        const { rows: finalRows } = await global.pool.query(finalQuery, [userId, serverId]);

        return { success: true, combat_power: newPower, heroes: finalRows[0].game_data.heroes, new_hero: newHero };
    } catch (e) {
        await client.query('ROLLBACK');
        console.error("Ошибка при добавлении героя:", e);
        return { error: true, message: e.message };
    } finally {
        client.release();
    }
}

/**
 * Повышение уровня героя
 * @param {string} heroInstId - уникальный ID инстанса героя
 * @param {number} levelsToUp - на сколько уровней поднять (например, 1 или 10)
 */
// async function levelUpHero(userId, serverId, gameId, heroInstId, levelsToUp = 1) {
//     if (levelsToUp <= 0) return { error: true, message: "Неверное количество уровней" };
//
//     const GameConfig = gamesConfigDB[gameId];
//     // Предполагаем структуру в конфиге: GameConfig.mechanics.level_costs = { "1": { gold: 100, exp: 50 }, "2": { gold: 150, exp: 75 } }
//     const levelCosts = GameConfig?.mechanics?.level_costs;
//     const heroesCatalog = GameConfig?.catalog?.heroes;
//
//     if (!levelCosts) return { error: true, message: "Конфиг стоимости уровней не найден" };
//
//     const client = await global.pool.connect();
//     try {
//         await client.query('BEGIN');
//
//         const { rows } = await client.query(
//             `SELECT game_data, resources FROM player_server_profiles WHERE user_id = $1 AND server_id = $2 FOR UPDATE;`,
//             [userId, serverId]
//         );
//         if (rows.length === 0) throw new Error("Профиль не найден");
//
//         let gameData = rows[0].game_data;
//         let resources = rows[0].resources;
//         let heroes = gameData.heroes || [];
//
//         const hero = heroes.find(h => h.instance_id === heroInstId);
//         if (!hero) throw new Error("Герой не найден");
//
//         const proto = heroesCatalog[hero.hero_id];
//         const maxLevelLimit = proto?.max_level || 200;
//
//         if (hero.level + levelsToUp > maxLevelLimit) {
//             throw new Error(`Достигнут максимальный уровень для этого героя (${maxLevelLimit})`);
//         }
//
//         // --- УМНЫЙ ПОДДСЧЁТ СТОИМОСТИ ЛЕВЕЛАПА С ИНТЕРПОЛЯЦИЕЙ ---
//         let totalGoldCost = 0;
//         let totalExpCost = 0;
//
//         // Превращаем ключи конфига в массив чисел и сортируем по возрастанию: [1, 2, 3, 10, 100, 119]
//         const definedLevels = Object.keys(levelCosts).map(Number).sort((a, b) => a - b);
//
//         for (let i = 0; i < levelsToUp; i++) {
//             const currentCheckLevel = hero.level + i;
//
//             let cost = levelCosts[currentCheckLevel];
//
//             // Если точной цены для этого уровня нет в админке, ищем ближайший снизу уровень-ориентир
//             if (!cost) {
//                 // Находим самый большой уровень в конфиге, который меньше или равен currentCheckLevel
//                 const closestLowerLevel = definedLevels.reduce((prev, curr) => {
//                     return (curr <= currentCheckLevel) ? curr : prev;
//                 }, definedLevels[0]);
//
//                 const baseCost = levelCosts[closestLowerLevel];
//
//                 if (baseCost) {
//                     // Коэффициент инфляции: цена растет, например, на 5% за каждый уровень выше ориентира
//                     const levelDiff = currentCheckLevel - closestLowerLevel;
//                     const inflationMultiplier = 1 + (levelDiff * 0.05);
//
//                     cost = {
//                         gold: Math.floor((baseCost.gold || 0) * inflationMultiplier),
//                         exp: Math.floor((baseCost.exp || 0) * inflationMultiplier)
//                     };
//                 }
//             }
//
//             // Если стоимость определена (или сгенерирована формулой), плюсуем в общий чек
//             if (cost) {
//                 totalGoldCost += cost.gold || 0;
//                 totalExpCost += cost.exp || 0;
//             } else {
//                 // Дефолтная заглушка на крайний случай, если вообще никакой конфиг не подтянулся
//                 totalGoldCost += currentCheckLevel * 100;
//                 totalExpCost += currentCheckLevel * 50;
//             }
//         }
//
//
//         // Проверяем баланс игрока
//         if ((parseInt(resources.gold) || 0) < totalGoldCost) throw new Error("Недостаточно золота");
//         if ((parseInt(resources.hero_exp || resources.exp) || 0) < totalExpCost) throw new Error("Недостаточно опыта героев");
//
//         // Списываем ресурсы (учитываем динамическое имя ключа опыта, у тебя в коде было и exp, и hero_exp)
//         resources.gold = (parseInt(resources.gold) || 0) - totalGoldCost;
//         const expKey = resources.hero_exp !== undefined ? 'hero_exp' : 'exp';
//         resources[expKey] = (parseInt(resources[expKey]) || 0) - totalExpCost;
//
//         // Повышаем уровень героя
//         hero.level += levelsToUp;
//
//         gameData.heroes = heroes;
//
//         const updateQuery = `UPDATE player_server_profiles SET game_data = $3, resources = $4 WHERE user_id = $1 AND server_id = $2;`;
//         await client.query(updateQuery, [userId, serverId, JSON.stringify(gameData), JSON.stringify(resources)]);
//         await client.query('COMMIT');
//
//         // Важно! Уровень изменился -> БР героя и аккаунта выросли. Пересчитываем!
//         const newPower = await recalculateAndSaveCombatPower(userId, serverId, gameId);
//
//         const finalQuery = `SELECT game_data, resources FROM player_server_profiles WHERE user_id = $1 AND server_id = $2;`;
//         const { rows: finalRows } = await global.pool.query(finalQuery, [userId, serverId]);
//
//         return { success: true, combat_power: newPower, resources: finalRows[0].resources, game_data: finalRows[0].game_data };
//     } catch (e) {
//         await client.query('ROLLBACK');
//         console.error("Ошибка при прокачке уровня героя:", e);
//         return { error: true, message: e.message };
//     } finally {
//         client.release();
//     }
// }

/**
 * 1. ПОВЫШЕНИЕ УРОВНЯ ГЕРОЯ (Гибридный метод: Redis RAM + Postgres Fallback)
 */
async function levelUpHero(userId, serverId, gameId, heroInstId, levelsToUp = 1) {
    if (levelsToUp <= 0) return { error: true, message: "Неверное количество уровней" };

    const GameConfig = gamesConfigDB[gameId];
    const levelCosts = GameConfig?.mechanics?.level_costs;
    const heroesCatalog = GameConfig?.catalog?.heroes;

    if (!levelCosts) return { error: true, message: "Конфиг стоимости уровней не найден" };

    // ------------------------------------------------------------------------
    // ЭШЕЛОН 1: ОПЕРАЦИЯ В СВЕРХБЫСТРОМ REDIS КЭШЕ (0 МИЛЛИСЕКУНД)
    // ------------------------------------------------------------------------
    if (redisClient.isOpen && redisClient.isReady) {
        try {
            // Извлекаем плоский объект игрока из Редиса
            let player = await Cache.getPlayer(userId, serverId);
            if (!player) throw new Error("Профиль игрока не найден в кэше Redis");

            let resources = player.resources || {};
            // В Редисе массив heroes развернут прямо в корень плоского объекта
            let heroes = player.heroes || [];

            const hero = heroes.find(h => h.instance_id === heroInstId);
            if (!hero) return { error: true, message: "Герой не найден" };

            const proto = heroesCatalog[hero.hero_id];
            const maxLevelLimit = proto?.max_level || 200;

            if (hero.level + levelsToUp > maxLevelLimit) {
                return { error: true, message: `Достигнут максимальный уровень для этого героя (${maxLevelLimit})` };
            }

            // Изолированный расчет суммарной стоимости левелапа (Бизнес-логика)
            const { totalGoldCost, totalExpCost } = calculateLevelUpCost(hero.level, levelsToUp, levelCosts);

            // Проверяем баланс игрока в памяти
            const expKey = resources.hero_exp !== undefined ? 'hero_exp' : 'exp';
            if ((parseInt(resources.gold) || 0) < totalGoldCost) return { error: true, message: "Недостаточно золота" };
            if ((parseInt(resources[expKey]) || 0) < totalExpCost) return { error: true, message: "Недостаточно опыта героев" };

            // Списываем ресурсы локально в RAM
            resources.gold = (parseInt(resources.gold) || 0) - totalGoldCost;
            resources[expKey] = (parseInt(resources[expKey]) || 0) - totalExpCost;

            // Повышаем уровень героя и фиксируем изменения в массиве
            hero.level += levelsToUp;
            player.heroes = heroes;
            player.resources = resources;

            // Сначала сохраняем стейт в Редис, чтобы калькулятор боевой силы мог прочитать новый уровень
            await Cache.setPlayer(userId, serverId, player);

            // Пересчитываем боевую силу. Метод recalculate должен уметь работать по гибридной схеме!
            const newPower = await recalculateAndSaveCombatPower(userId, serverId, gameId);

            // Синхронизируем новую силу в кэше и обновляем ZSET Лидерборд силы Арены
            player.combat_power = newPower;
            await redisClient.setEx(`p:${serverId}:${userId}`, 1200, JSON.stringify(player));
            await redisClient.zAdd(`lb:${serverId}:combat_power`, { score: parseInt(newPower), value: String(userId) });

            // Собираем game_data структуру обратно, чтобы твой готовый фронтенд получил то, что ждет
            const rootFields = ['id', 'user_id', 'server_id', 'nickname', 'level', 'combat_power', 'resources', 'idle_timestamps'];
            const returnedGameData = {};
            Object.entries(player).forEach(([key, val]) => {
                if (!rootFields.includes(key) && !['gameId', 'deviceId', 'sessionId', 'partnerId', 'username'].includes(key)) {
                    returnedGameData[key] = val;
                }
            });

            return {
                success: true,
                combat_power: newPower,
                resources: player.resources,
                heroes: returnedGameData.heroes
            };

        } catch (cacheErr) {
            console.warn('[HeroDB:LevelUp] Сбой Redis, проваливаюсь в Postgres Fallback:', cacheErr);
        }
    }

    // ------------------------------------------------------------------------
    // ЭШЕЛОН 2: ТВОЙ СТАРЫЙ ОРИГИНАЛЬНЫЙ SQL FALLBACK С ТРАНЗАКЦИЕЙ И СУБД
    // ------------------------------------------------------------------------
    const client = await global.pool.connect();
    try {
        await client.query('BEGIN');

        const { rows } = await client.query(
            `SELECT game_data, resources FROM player_server_profiles WHERE user_id = $1 AND server_id = $2 FOR UPDATE;`,
            [userId, serverId]
        );
        if (rows.length === 0) throw new Error("Профиль не найден");

        let gameData = rows[0].game_data;
        let resources = rows[0].resources;
        let heroes = gameData.heroes || [];

        const hero = heroes.find(h => h.instance_id === heroInstId);
        if (!hero) throw new Error("Герой не найден");

        const proto = heroesCatalog[hero.hero_id];
        const maxLevelLimit = proto?.max_level || 200;

        if (hero.level + levelsToUp > maxLevelLimit) {
            throw new Error(`Достигнут максимальный уровень для этого героя (${maxLevelLimit})`);
        }

        // Вызываем ту же самую чистую бизнес-логику расчета цен
        const { totalGoldCost, totalExpCost } = calculateLevelUpCost(hero.level, levelsToUp, levelCosts);

        if ((parseInt(resources.gold) || 0) < totalGoldCost) throw new Error("Недостаточно золота");
        if ((parseInt(resources.hero_exp || resources.exp) || 0) < totalExpCost) throw new Error("Недостаточно опыта героев");

        resources.gold = (parseInt(resources.gold) || 0) - totalGoldCost;
        const expKey = resources.hero_exp !== undefined ? 'hero_exp' : 'exp';
        resources[expKey] = (parseInt(resources[expKey]) || 0) - totalExpCost;

        hero.level += levelsToUp;
        gameData.heroes = heroes;

        const updateQuery = `UPDATE player_server_profiles SET game_data = $3, resources = $4 WHERE user_id = $1 AND server_id = $2;`;
        await client.query(updateQuery, [userId, serverId, JSON.stringify(gameData), JSON.stringify(resources)]);
        await client.query('COMMIT');

        const newPower = await recalculateAndSaveCombatPower(userId, serverId, gameId);

        const finalQuery = `SELECT game_data, resources FROM player_server_profiles WHERE user_id = $1 AND server_id = $2;`;
        const { rows: finalRows } = await global.pool.query(finalQuery, [userId, serverId]);

        return { success: true, combat_power: newPower, resources: finalRows[0].resources, heroes: finalRows[0].game_data.heroes };
    } catch (e) {
        await client.query('ROLLBACK');
        console.error("Ошибка при прокачке уровня героя в SQL:", e);
        return { error: true, message: e.message };
    } finally {
        client.release();
    }
}

/**
 * ЧИСТАЯ МАТЕМАТИЧЕСКАЯ ФУНКЦИЯ: Твой алгоритм интерполяции и инфляции цен уровней
 */
function calculateLevelUpCost(currentLevel, levelsToUp, levelCosts) {
    let totalGoldCost = 0;
    let totalExpCost = 0;
    const definedLevels = Object.keys(levelCosts).map(Number).sort((a, b) => a - b);

    for (let i = 0; i < levelsToUp; i++) {
        const currentCheckLevel = currentLevel + i;
        let cost = levelCosts[currentCheckLevel];

        if (!cost) {
            const closestLowerLevel = definedLevels.reduce((prev, curr) => {
                return (curr <= currentCheckLevel) ? curr : prev;
            }, definedLevels[0]);

            const baseCost = levelCosts[closestLowerLevel];
            if (baseCost) {
                const levelDiff = currentCheckLevel - closestLowerLevel;
                const inflationMultiplier = 1 + (levelDiff * 0.05);
                cost = {
                    gold: Math.floor((baseCost.gold || 0) * inflationMultiplier),
                    exp: Math.floor((baseCost.exp || 0) * inflationMultiplier)
                };
            }
        }

        if (cost) {
            totalGoldCost += cost.gold || 0;
            totalExpCost += cost.exp || 0;
        } else {
            totalGoldCost += currentCheckLevel * 100;
            totalExpCost += currentCheckLevel * 50;
        }
    }
    return { totalGoldCost, totalExpCost };
}


/**
 * Скармливание или удаление героя (например, для утилизации или как материал для звезд)
 */
// async function consumeHero(userId, serverId, gameId, heroInstId, recycleResources = true) {
//     const GameConfig = gamesConfigDB[gameId];
//     const levelCosts = GameConfig?.mechanics?.level_costs;
//
//     const client = await global.pool.connect();
//     try {
//         await client.query('BEGIN');
//
//         const { rows } = await client.query(
//             `SELECT game_data, resources FROM player_server_profiles WHERE user_id = $1 AND server_id = $2 FOR UPDATE;`,
//             [userId, serverId]
//         );
//         if (rows.length === 0) throw new Error("Профиль не найден");
//
//         let gameData = rows[0].game_data;
//         let resources = rows[0].resources;
//         let heroes = gameData.heroes || [];
//         let inventory = gameData.inventory || {};
//
//         const heroIdx = heroes.findIndex(h => h.instance_id === heroInstId);
//         if (heroIdx === -1) throw new Error("Герой для удаления не найден");
//         const hero = heroes[heroIdx];
//
//         // Проверяем, не надет ли на него шмот. Если надет — возвращаем вещи в инвентарь!
//         if (hero.equipped) {
//             Object.entries(hero.equipped).forEach(([slotId, itemId]) => {
//                 if (itemId) {
//                     inventory[itemId] = (inventory[itemId] || 0) + 1;
//                 }
//             });
//         }
//
//         // Если нужно вернуть ресурсы за уровни
//         if (recycleResources && levelCosts) {
//             let goldRefund = 0;
//             let expRefund = 0;
//
//             // Считаем всё золото и опыт, влитые с 1 по текущий уровень героя
//             for (let l = 1; l < hero.level; l++) {
//                 const cost = levelCosts[l];
//                 if (cost) {
//                     goldRefund += cost.gold || 0;
//                     expRefund += cost.exp || 0;
//                 }
//             }
//
//             resources.gold = (parseInt(resources.gold) || 0) + goldRefund;
//             const expKey = resources.hero_exp !== undefined ? 'hero_exp' : 'exp';
//             resources[expKey] = (parseInt(resources[expKey]) || 0) + expRefund;
//         }
//
//         // Удаляем героя из массива
//         heroes.splice(heroIdx, 1);
//
//         gameData.heroes = heroes;
//         gameData.inventory = inventory;
//
//         // Если этот герой стоял на главном экране (активный хоум-герой), сбрасываем его
//         if (gameData.active_home_hero === heroInstId) {
//             gameData.active_home_hero = heroes[0]?.instance_id || null;
//         }
//
//         const updateQuery = `UPDATE player_server_profiles SET game_data = $3, resources = $4 WHERE user_id = $1 AND server_id = $2;`;
//         await client.query(updateQuery, [userId, serverId, JSON.stringify(gameData), JSON.stringify(resources)]);
//         await client.query('COMMIT');
//
//         // Пересчитываем общую силу (она уменьшится, так как героя больше нет)
//         const newPower = await recalculateAndSaveCombatPower(userId, serverId, gameId);
//
//         const finalQuery = `SELECT game_data, resources FROM player_server_profiles WHERE user_id = $1 AND server_id = $2;`;
//         const { rows: finalRows } = await global.pool.query(finalQuery, [userId, serverId]);
//
//         return { success: true, combat_power: newPower, resources: finalRows[0].resources, game_data: finalRows[0].game_data };
//
//     } catch (e) {
//         await client.query('ROLLBACK');
//         console.error("Ошибка при удалении героя:", e);
//         return { error: true, message: e.message };
//     } finally {
//         client.release();
//     }
// }

/**
 * 2. УДАЛЕНИЕ / СКАРМЛИВАНИЕ ГЕРОЯ С ВОЗВРАТОМ РЕСУРСОВ И ШМОТА (Гибридный метод)
 */
async function consumeHero(userId, serverId, gameId, heroInstId, recycleResources = true) {
    const GameConfig = gamesConfigDB[gameId];
    const levelCosts = GameConfig?.mechanics?.level_costs;

    // ------------------------------------------------------------------------
    // ЭШЕЛОН 1: РАБОТА В ОПЕРАТИВНОЙ ПАМЯТИ REDIS (СВЕРХБЫСТРЫЙ ПУТЬ)
    // ------------------------------------------------------------------------
    if (redisClient.isOpen && redisClient.isReady) {
        try {
            // Извлекаем плоский профиль из Редиса
            let player = await Cache.getPlayer(userId, serverId);
            if (!player) throw new Error("Профиль игрока не найден в кэше Redis");

            let resources = player.resources || {};
            let heroes = player.heroes || [];
            let inventory = player.inventory || {};

            const heroIdx = heroes.findIndex(h => h.instance_id === heroInstId);
            if (heroIdx === -1) return { error: true, message: "Герой для удаления не найден" };
            const hero = heroes[heroIdx];

            // 1. Возвращаем шмот в инвентарь в RAM
            if (hero.equipped) {
                Object.entries(hero.equipped).forEach(([slotId, itemId]) => {
                    if (itemId) {
                        inventory[itemId] = (parseInt(inventory[itemId]) || 0) + 1;
                    }
                });
            }

            // 2. Считаем и возвращаем золото и опыт за уровни в RAM
            if (recycleResources && levelCosts) {
                const { goldRefund, expRefund } = calculateRecycleRefund(hero.level, levelCosts);

                resources.gold = (parseInt(resources.gold) || 0) + goldRefund;
                const expKey = resources.hero_exp !== undefined ? 'hero_exp' : 'exp';
                resources[expKey] = (parseInt(resources[expKey]) || 0) + expRefund;
            }

            // 3. Удаляем героя из RAM-массива
            heroes.splice(heroIdx, 1);

            player.heroes = heroes;
            player.inventory = inventory;
            player.resources = resources;

            // 4. Проверяем хоум-героя
            if (player.active_home_hero === heroInstId) {
                player.active_home_hero = heroes[0]?.instance_id || null;
            }

            // Сохраняем промежуточное состояние, чтобы калькулятор силы прочитал актуальный ростер
            await Cache.setPlayer(userId, serverId, player);

            // Пересчитываем БР в памяти
            const newPower = await recalculateAndSaveCombatPower(userId, serverId, gameId);

            // Синхронизируем новую силу в кэше и обновляем ZSET Лидерборд силы
            player.combat_power = newPower;
            await redisClient.setEx(`p:${serverId}:${userId}`, 1200, JSON.stringify(player));
            await redisClient.zAdd(`lb:${serverId}:combat_power`, { score: parseInt(newPower), value: String(userId) });

            // Собираем game_data структуру обратно под ожидания твоего фронтенда
            const rootFields = ['id', 'user_id', 'server_id', 'nickname', 'level', 'combat_power', 'resources', 'idle_timestamps'];
            const returnedGameData = {};
            Object.entries(player).forEach(([key, val]) => {
                if (!rootFields.includes(key) && !['gameId', 'deviceId', 'sessionId', 'partnerId', 'username'].includes(key)) {
                    returnedGameData[key] = val;
                }
            });

            return {
                success: true,
                combat_power: newPower,
                resources: player.resources,
                heroes: returnedGameData.heroes
            };

        } catch (cacheErr) {
            console.warn('[HeroDB:Consume] Сбой Redis, проваливаюсь в Postgres Fallback:', cacheErr);
        }
    }

    // ------------------------------------------------------------------------
    // ЭШЕЛОН 2: ТВОЙ СТАРЫЙ ОРИГИНАЛЬНЫЙ SQL FALLBACK (БЕЗОПАСНАЯ СУБД ТРАНЗАКЦИЯ)
    // ------------------------------------------------------------------------
    const client = await global.pool.connect();
    try {
        await client.query('BEGIN');

        const { rows } = await client.query(
            `SELECT game_data, resources FROM player_server_profiles WHERE id = $1 AND server_id = $2 FOR UPDATE;`, // Ищем по UUID таблицы
            [userId, serverId]
        );
        if (rows.length === 0) throw new Error("Профиль не найден");

        let gameData = rows[0].game_data;
        let resources = rows[0].resources;
        let heroes = gameData.heroes || [];
        let inventory = gameData.inventory || {};

        const heroIdx = heroes.findIndex(h => h.instance_id === heroInstId);
        if (heroIdx === -1) throw new Error("Герой для удаления не найден");
        const hero = heroes[heroIdx];

        if (hero.equipped) {
            Object.entries(hero.equipped).forEach(([slotId, itemId]) => {
                if (itemId) {
                    inventory[itemId] = (inventory[itemId] || 0) + 1;
                }
            });
        }

        if (recycleResources && levelCosts) {
            const { goldRefund, expRefund } = calculateRecycleRefund(hero.level, levelCosts);
            resources.gold = (parseInt(resources.gold) || 0) + goldRefund;
            const expKey = resources.hero_exp !== undefined ? 'hero_exp' : 'exp';
            resources[expKey] = (parseInt(resources[expKey]) || 0) + expRefund;
        }

        heroes.splice(heroIdx, 1);
        gameData.heroes = heroes;
        gameData.inventory = inventory;

        if (gameData.active_home_hero === heroInstId) {
            gameData.active_home_hero = heroes[0]?.instance_id || null;
        }

        const updateQuery = `UPDATE player_server_profiles SET game_data = $3, resources = $4 WHERE id = $1 AND server_id = $2;`;
        await client.query(updateQuery, [userId, serverId, JSON.stringify(gameData), JSON.stringify(resources)]);
        await client.query('COMMIT');

        const newPower = await recalculateAndSaveCombatPower(userId, serverId, gameId);

        const finalQuery = `SELECT game_data, resources FROM player_server_profiles WHERE id = $1 AND server_id = $2;`;
        const { rows: finalRows } = await global.pool.query(finalQuery, [userId, serverId]);

        return { success: true, combat_power: newPower, resources: finalRows[0].resources, heroes: finalRows[0].game_data.heroes };

    } catch (e) {
        await client.query('ROLLBACK');
        console.error("Ошибка при удалении героя в SQL:", e);
        return { error: true, message: e.message };
    } finally {
        client.release();
    }
}

/**
 * ЧИСТАЯ МАТЕМАТИЧЕСКАЯ ФУНКЦИЯ: Подсчет возвращаемых ресурсов
 */
function calculateRecycleRefund(heroLevel, levelCosts) {
    let goldRefund = 0;
    let expRefund = 0;
    for (let l = 1; l < heroLevel; l++) {
        const cost = levelCosts[l];
        if (cost) {
            goldRefund += cost.gold || 0;
            expRefund += cost.exp || 0;
        }
    }
    return { goldRefund, expRefund };
}


/**
 * Повышение звёзд (эволюция) героя
 * @param {string} heroInstId - ID прокачиваемого героя
 * @param {Array<string>} fodderInstIds - Массив instance_id героев, которых игрок выбрал в качестве корма
 */
// async function upgradeHeroStars(userId, serverId, gameId, heroInstId, fodderInstIds = []) {
//     const GameConfig = gamesConfigDB[gameId];
//     const client = await global.pool.connect();
//
//     try {
//         await client.query('BEGIN');
//
//         const { rows } = await client.query(
//             `SELECT game_data, resources FROM player_server_profiles WHERE user_id = $1 AND server_id = $2 FOR UPDATE;`,
//             [userId, serverId]
//         );
//         if (rows.length === 0) throw new Error("Профиль не найден");
//
//         let gameData = rows[0].game_data;
//         let resources = rows[0].resources;
//         let heroes = gameData.heroes || [];
//         let inventory = gameData.inventory || {};
//
//         // Ищем целевого героя
//         const hero = heroes.find(h => h.instance_id === heroInstId);
//         if (!hero) throw new Error("Герой не найден");
//
//         const heroProto = GameConfig?.catalog?.heroes?.[hero.hero_id];
//         // Ищем рецепт для перехода на СЛЕДУЮЩУЮ звезду (например, текущие звезды + 1)
//         const nextStarIdx = hero.stars + 1;
//         const recipe = heroProto?.star_recipes?.[nextStarIdx] || GameConfig?.mechanics?.general_star_recipes?.[nextStarIdx];
//
//         if (!recipe) throw new Error("Достигнут максимальный предел звёзд или рецепт отсутствует");
//
//         // 1. ПРОВЕРКА И СПИСАНИЕ РЕСУРСОВ
//         if (recipe.resources) {
//             Object.entries(recipe.resources).forEach(([resKey, amount]) => {
//                 if ((parseInt(resources[resKey]) || 0) < amount) {
//                     throw new Error(`Недостаточно ресурса: ${resKey}`);
//                 }
//                 resources[resKey] = (parseInt(resources[resKey]) || 0) - amount;
//             });
//         }
//
//         // 2. ПРОВЕРКА И СПИСАНИЕ ОСКОЛКОВ / ИТЕМОВ
//         if (recipe.shards) {
//             Object.entries(recipe.shards).forEach(([shardItemId, amount]) => {
//                 if ((inventory[shardItemId] || 0) < amount) {
//                     throw new Error(`Недостаточно осколков/предметов: ${shardItemId}`);
//                 }
//                 inventory[shardItemId] -= amount;
//                 if (inventory[shardItemId] <= 0) delete inventory[shardItemId];
//             });
//         }
//
//         // 3. ПРОВЕРКА И УДАЛЕНИЕ ГЕРОЕВ-КОРМА
//         if (recipe.fodder_count && recipe.fodder_count > 0) {
//             if (fodderInstIds.length !== recipe.fodder_count) {
//                 throw new Error(`Неверное количество корма. Нужно: ${recipe.fodder_count}`);
//             }
//
//             fodderInstIds.forEach(fId => {
//                 if (fId === heroInstId) throw new Error("Герой не может сожрать сам себя");
//
//                 const fIdx = heroes.findIndex(h => h.instance_id === fId);
//                 if (fIdx === -1) throw new Error(`Герой-корм ${fId} не найден на аккаунте`);
//
//                 const fodderHero = heroes[fIdx];
//
//                 // Валидация корма по условиям конфига (например, должен быть той же фракции)
//                 if (recipe.fodder_requirements) {
//                     const fodderProto = GameConfig?.catalog?.heroes?.[fodderHero.hero_id];
//                     if (recipe.fodder_requirements.same_hero && fodderHero.hero_id !== hero.hero_id) {
//                         throw new Error("В качестве корма требуется точная копия этого героя");
//                     }
//                     if (recipe.fodder_requirements.faction && fodderProto?.faction_id !== heroProto?.faction_id) {
//                         throw new Error("Герой-корм должен принадлежать той же фракции");
//                     }
//                 }
//
//                 // Если на корме был надет шмот — автоматически возвращаем его в инвентарь перед удалением корма
//                 if (fodderHero.equipped) {
//                     Object.values(fodderHero.equipped).forEach(itemId => {
//                         if (itemId) inventory[itemId] = (inventory[itemId] || 0) + 1;
//                     });
//                 }
//
//                 // Удаляем корм из массива аккаунта
//                 heroes.splice(fIdx, 1);
//             });
//         }
//
//         // Успешная эволюция! Повышаем звезду
//         hero.stars = nextStarIdx;
//
//         gameData.heroes = heroes;
//         gameData.inventory = inventory;
//
//         const updateQuery = `UPDATE player_server_profiles SET game_data = $3, resources = $4 WHERE user_id = $1 AND server_id = $2;`;
//         await client.query(updateQuery, [userId, serverId, JSON.stringify(gameData), JSON.stringify(resources)]);
//         await client.query('COMMIT');
//
//         // Звёзды выросли -> БР изменился. Пересчитываем!
//         const newPower = await recalculateAndSaveCombatPower(userId, serverId, gameId);
//
//         const finalQuery = `SELECT game_data, resources FROM player_server_profiles WHERE user_id = $1 AND server_id = $2;`;
//         const { rows: finalRows } = await global.pool.query(finalQuery, [userId, serverId]);
//
//         return { success: true, combat_power: newPower, resources: finalRows[0].resources, game_data: finalRows[0].game_data };
//
//     } catch (e) {
//         await client.query('ROLLBACK');
//         console.error("Ошибка при эволюции звёзд героя:", e);
//         return { error: true, message: e.message };
//     } finally {
//         client.release();
//     }
// }
/**
 * 3. ЭВОЛЮЦИЯ ЗВЕЗД ГЕРОЯ (Гибридный метод: Redis RAM + Postgres Fallback)
 */
async function upgradeHeroStars(userId, serverId, gameId, heroInstId, fodderInstIds = []) {
    const GameConfig = gamesConfigDB[gameId];

    // ------------------------------------------------------------------------
    // ЭШЕЛОН 1: РАБОТА В ОПЕРАТИВНОЙ ПАМЯТИ REDIS (СВЕРХБЫСТРЫЙ ПУТЬ)
    // ------------------------------------------------------------------------
    if (redisClient.isOpen && redisClient.isReady) {
        try {
            // Извлекаем плоский профиль из Редиса
            let player = await Cache.getPlayer(userId, serverId);
            if (!player) throw new Error("Профиль игрока не найден в кэше Redis");

            let resources = player.resources || {};
            let heroes = player.heroes || [];
            let inventory = player.inventory || {};

            // Ищем целевого героя в памяти
            const hero = heroes.find(h => h.instance_id === heroInstId);
            if (!hero) return { error: true, message: "Герой не найден" };

            const heroProto = GameConfig?.catalog?.heroes?.[hero.hero_id];
            const nextStarIdx = hero.stars + 1;
            const recipe = heroProto?.star_recipes?.[nextStarIdx] || GameConfig?.mechanics?.general_star_recipes?.[nextStarIdx];

            if (!recipe) return { error: true, message: "Достигнут максимальный предел звёзд или рецепт отсутствует" };

            // 1. ПРОВЕРКА И СПИСАНИЕ РЕСУРСОВ В RAM
            if (recipe.resources) {
                for (const [resKey, amount] of Object.entries(recipe.resources)) {
                    if ((parseInt(resources[resKey]) || 0) < amount) {
                        return { error: true, message: `Недостаточно ресурса: ${resKey}` };
                    }
                }
                Object.entries(recipe.resources).forEach(([resKey, amount]) => {
                    resources[resKey] = (parseInt(resources[resKey]) || 0) - amount;
                });
            }

            // 2. ПРОВЕРКА И СПИСАНИЕ ОСКОЛКОВ / ИТЕМОВ В RAM
            if (recipe.shards) {
                for (const [shardItemId, amount] of Object.entries(recipe.shards)) {
                    if ((inventory[shardItemId] || 0) < amount) {
                        return { error: true, message: `Недостаточно осколков/предметов: ${shardItemId}` };
                    }
                }
                Object.entries(recipe.shards).forEach(([shardItemId, amount]) => {
                    inventory[shardItemId] -= amount;
                    if (inventory[shardItemId] <= 0) delete inventory[shardItemId];
                });
            }

            // 3. ПРОВЕРКА И УДАЛЕНИЕ ГЕРОЕВ-КОРМА В RAM
            if (recipe.fodder_count && recipe.fodder_count > 0) {
                if (fodderInstIds.length !== recipe.fodder_count) {
                    return { error: true, message: `Неверное количество корма. Нужно: ${recipe.fodder_count}` };
                }

                // Локальная копия для безопасной валидации перед удалением
                for (const fId of fodderInstIds) {
                    if (fId === heroInstId) return { error: true, message: "Герой не может сожрать сам себя" };

                    const fIdx = heroes.findIndex(h => h.instance_id === fId);
                    if (fIdx === -1) return { error: true, message: `Герой-корм ${fId} не найден на аккаунте` };

                    const fodderHero = heroes[fIdx];

                    if (recipe.fodder_requirements) {
                        const fodderProto = GameConfig?.catalog?.heroes?.[fodderHero.hero_id];
                        if (recipe.fodder_requirements.same_hero && fodderHero.hero_id !== hero.hero_id) {
                            return { error: true, message: "В качестве корма требуется точная копия этого героя" };
                        }
                        if (recipe.fodder_requirements.faction && fodderProto?.faction_id !== heroProto?.faction_id) {
                            return { error: true, message: "Герой-корм должен принадлежать той же фракции" };
                        }
                    }
                }

                // Списание корма и возврат шмота
                fodderInstIds.forEach(fId => {
                    const fIdx = heroes.findIndex(h => h.instance_id === fId);
                    const fodderHero = heroes[fIdx];

                    if (fodderHero.equipped) {
                        Object.values(fodderHero.equipped).forEach(itemId => {
                            if (itemId) inventory[itemId] = (parseInt(inventory[itemId]) || 0) + 1;
                        });
                    }
                    heroes.splice(fIdx, 1);
                });
            }

            // Успешная эволюция
            hero.stars = nextStarIdx;

            player.heroes = heroes;
            player.inventory = inventory;
            player.resources = resources;

            // Сохраняем стейт в Редис для пересчета силы
            await Cache.setPlayer(userId, serverId, player);

            // Пересчитываем БР
            const newPower = await recalculateAndSaveCombatPower(userId, serverId, gameId);

            // Синхронизируем новую силу в кэше и обновляем ZSET Лидерборд силы
            player.combat_power = newPower;
            await redisClient.setEx(`p:${serverId}:${userId}`, 1200, JSON.stringify(player));
            await redisClient.zAdd(`lb:${serverId}:combat_power`, { score: parseInt(newPower), value: String(userId) });

            // Собираем game_data структуру обратно под ожидания твоего фронтенда
            const rootFields = ['id', 'user_id', 'server_id', 'nickname', 'level', 'combat_power', 'resources', 'idle_timestamps'];
            const returnedGameData = {};
            Object.entries(player).forEach(([key, val]) => {
                if (!rootFields.includes(key) && !['gameId', 'deviceId', 'sessionId', 'partnerId', 'username'].includes(key)) {
                    returnedGameData[key] = val;
                }
            });

            return {
                success: true,
                combat_power: newPower,
                resources: player.resources,
                heroes: returnedGameData.heroes
            };

        } catch (cacheErr) {
            console.warn('[HeroDB:UpgradeStars] Сбой Redis, проваливаюсь в Postgres Fallback:', cacheErr);
        }
    }

    // ------------------------------------------------------------------------
    // ЭШЕЛОН 2: ТВОЙ СТАРЫЙ ОРИГИНАЛЬНЫЙ SQL FALLBACK (БЕЗОПАСНАЯ ТРАНЗАКЦИЯ СУБД)
    // ------------------------------------------------------------------------
    const client = await global.pool.connect();
    try {
        await client.query('BEGIN');

        const { rows } = await client.query(
            `SELECT game_data, resources FROM player_server_profiles WHERE id = $1 AND server_id = $2 FOR UPDATE;`, // Ищем по UUID таблицы
            [userId, serverId]
        );
        if (rows.length === 0) throw new Error("Профиль не найден");

        let gameData = rows[0].game_data;
        let resources = rows[0].resources;
        let heroes = gameData.heroes || [];
        let inventory = gameData.inventory || {};

        const hero = heroes.find(h => h.instance_id === heroInstId);
        if (!hero) throw new Error("Герой не найден");

        const heroProto = GameConfig?.catalog?.heroes?.[hero.hero_id];
        const nextStarIdx = hero.stars + 1;
        const recipe = heroProto?.star_recipes?.[nextStarIdx] || GameConfig?.mechanics?.general_star_recipes?.[nextStarIdx];

        if (!recipe) throw new Error("Достигнут максимальный предел звёзд или рецепт отсутствует");

        if (recipe.resources) {
            Object.entries(recipe.resources).forEach(([resKey, amount]) => {
                if ((parseInt(resources[resKey]) || 0) < amount) throw new Error(`Недостаточно ресурса: ${resKey}`);
                resources[resKey] = (parseInt(resources[resKey]) || 0) - amount;
            });
        }

        if (recipe.shards) {
            Object.entries(recipe.shards).forEach(([shardItemId, amount]) => {
                if ((inventory[shardItemId] || 0) < amount) throw new Error(`Недостаточно осколков/предметов: ${shardItemId}`);
                inventory[shardItemId] -= amount;
                if (inventory[shardItemId] <= 0) delete inventory[shardItemId];
            });
        }

        if (recipe.fodder_count && recipe.fodder_count > 0) {
            if (fodderInstIds.length !== recipe.fodder_count) throw new Error(`Неверное количество корма. Нужно: ${recipe.fodder_count}`);

            fodderInstIds.forEach(fId => {
                if (fId === heroInstId) throw new Error("Герой не может сожрать сам себя");

                const fIdx = heroes.findIndex(h => h.instance_id === fId);
                if (fIdx === -1) throw new Error(`Герой-корм ${fId} не найден на аккаунте`);

                const fodderHero = heroes[fIdx];

                if (recipe.fodder_requirements) {
                    const fodderProto = GameConfig?.catalog?.heroes?.[fodderHero.hero_id];
                    if (recipe.fodder_requirements.same_hero && fodderHero.hero_id !== hero.hero_id) throw new Error("В качестве корма требуется точная копия этого героя");
                    if (recipe.fodder_requirements.faction && fodderProto?.faction_id !== heroProto?.faction_id) throw new Error("Герой-корм должен принадлежать той же фракции");
                }

                if (fodderHero.equipped) {
                    Object.values(fodderHero.equipped).forEach(itemId => {
                        if (itemId) inventory[itemId] = (inventory[itemId] || 0) + 1;
                    });
                }
                heroes.splice(fIdx, 1);
            });
        }

        hero.stars = nextStarIdx;
        gameData.heroes = heroes;
        gameData.inventory = inventory;

        const updateQuery = `UPDATE player_server_profiles SET game_data = $3, resources = $4 WHERE id = $1 AND server_id = $2;`;
        await client.query(updateQuery, [userId, serverId, JSON.stringify(gameData), JSON.stringify(resources)]);
        await client.query('COMMIT');

        // Звёзды выросли -> БР изменился. Пересчитываем!
        const newPower = await recalculateAndSaveCombatPower(userId, serverId, gameId);

        const finalQuery = `SELECT game_data, resources FROM player_server_profiles WHERE id = $1 AND server_id = $2;`;
        const { rows: finalRows } = await global.pool.query(finalQuery, [userId, serverId]);

        return { success: true, combat_power: newPower, resources: finalRows[0].resources, heroes: finalRows[0].game_data.heroes };

    } catch (e) {
        await client.query('ROLLBACK');
        console.error("Ошибка при эволюции звёзд героя в SQL:", e);
        return { error: true, message: e.message };
    } finally {
        client.release();
    }
}

/**
 * Разблокировка или повышение уровня персонального (уникального) предмета героя
 */
// async function upgradePersonalItem(userId, serverId, gameId, heroInstId) {
//     const GameConfig = gamesConfigDB[gameId];
//     const client = await global.pool.connect();
//
//     try {
//         await client.query('BEGIN');
//
//         const { rows } = await client.query(
//             `SELECT game_data FROM player_server_profiles WHERE user_id = $1 AND server_id = $2 FOR UPDATE;`,
//             [userId, serverId]
//         );
//         if (rows.length === 0) throw new Error("Профиль не найден");
//
//         let gameData = rows[0].game_data;
//         let heroes = gameData.heroes || [];
//         let inventory = gameData.inventory || {};
//
//         const hero = heroes.find(h => h.instance_id === heroInstId);
//         if (!hero) throw new Error("Герой не найден");
//
//         const heroProto = GameConfig?.catalog?.heroes?.[hero.hero_id];
//         if (!heroProto?.personal_item_id) throw new Error("У этого героя нет уникального предмета");
//
//         const nextItemLevel = (hero.personal_item_level || 0) + 1;
//
//         // Берем стоимость прокачки предмета из механик
//         const pItemCosts = GameConfig?.mechanics?.personal_item_costs?.[nextItemLevel];
//         if (!pItemCosts) throw new Error("Достигнут максимальный уровень уникального предмета");
//
//         // Если это первый уровень (разблокировка) — проверяем минимальный уровень самого героя
//         if (nextItemLevel === 1 && hero.level < (GameConfig?.mechanics?.personal_item_unlock_level || 100)) {
//             throw new Error(`Для открытия уникального предмета нужен ${GameConfig?.mechanics?.personal_item_unlock_level || 100} уровень героя`);
//         }
//
//         // Проверяем и списываем ресурсы крафта уникального шмота
//         if (pItemCosts.materials) {
//             Object.entries(pItemCosts.materials).forEach(([matId, neededAmount]) => {
//                 if ((inventory[matId] || 0) < neededAmount) {
//                     throw new Error(`Недостаточно материалов для улучшения уникального шмота: ${matId}`);
//                 }
//                 inventory[matId] -= neededAmount;
//                 if (inventory[matId] <= 0) delete inventory[matId];
//             });
//         }
//
//         // Записываем новый уровень уникального предмета и прописываем его в слот экипировки
//         hero.personal_item_level = nextItemLevel;
//         if (!hero.equipped) hero.equipped = {};
//         hero.equipped.personal = heroProto.personal_item_id;
//
//         gameData.heroes = heroes;
//         gameData.inventory = inventory;
//
//         const updateQuery = `UPDATE player_server_profiles SET game_data = $3 WHERE user_id = $1 AND server_id = $2;`;
//         await client.query(updateQuery, [userId, serverId, JSON.stringify(gameData)]);
//         await client.query('COMMIT');
//
//         // Сила изменилась -> пересчитываем БР
//         const newPower = await recalculateAndSaveCombatPower(userId, serverId, gameId);
//
//         const finalQuery = `SELECT game_data FROM player_server_profiles WHERE user_id = $1 AND server_id = $2;`;
//         const { rows: finalRows } = await global.pool.query(finalQuery, [userId, serverId]);
//
//         return { success: true, combat_power: newPower, game_data: finalRows[0].game_data };
//
//     } catch (e) {
//         await client.query('ROLLBACK');
//         console.error("Ошибка при прокачке уникального предмета:", e);
//         return { error: true, message: e.message };
//     } finally {
//         client.release();
//     }
// }

/**
 * 4. ПРОКАЧКА УНИКАЛЬНОГО ПРЕДМЕТА ГЕРОЯ (Гибридный метод: Redis RAM + Postgres Fallback)
 */
async function upgradePersonalItem(userId, serverId, gameId, heroInstId) {
    const GameConfig = gamesConfigDB[gameId];

    // ------------------------------------------------------------------------
    // ЭШЕЛОН 1: РАБОТА В ОПЕРАТИВНОЙ ПАМЯТИ REDIS (СВЕРХБЫСТРЫЙ ПУТЬ)
    // ------------------------------------------------------------------------
    if (redisClient.isOpen && redisClient.isReady) {
        try {
            // Извлекаем плоский профиль из Редиса
            let player = await Cache.getPlayer(userId, serverId);
            if (!player) throw new Error("Профиль игрока не найден в кэше Redis");

            let heroes = player.heroes || [];
            let inventory = player.inventory || {};

            const hero = heroes.find(h => h.instance_id === heroInstId);
            if (!hero) return { error: true, message: "Герой не найден" };

            const heroProto = GameConfig?.catalog?.heroes?.[hero.hero_id];
            if (!heroProto?.personal_item_id) return { error: true, message: "У этого героя нет уникального предмета" };

            const nextItemLevel = (hero.personal_item_level || 0) + 1;

            const pItemCosts = GameConfig?.mechanics?.personal_item_costs?.[nextItemLevel];
            if (!pItemCosts) return { error: true, message: "Достигнут максимальный уровень уникального предмета" };

            if (nextItemLevel === 1 && hero.level < (GameConfig?.mechanics?.personal_item_unlock_level || 100)) {
                return { error: true, message: `Для открытия уникального предмета нужен ${GameConfig?.mechanics?.personal_item_unlock_level || 100} уровень героя` };
            }

            // Проверяем и списываем ресурсы крафта уникального шмота в RAM
            if (pItemCosts.materials) {
                for (const [matId, neededAmount] of Object.entries(pItemCosts.materials)) {
                    if ((inventory[matId] || 0) < neededAmount) {
                        return { error: true, message: `Недостаточно материалов для улучшения уникального шмота: ${matId}` };
                    }
                }
                Object.entries(pItemCosts.materials).forEach(([matId, neededAmount]) => {
                    inventory[matId] -= neededAmount;
                    if (inventory[matId] <= 0) delete inventory[matId];
                });
            }

            // Записываем новый уровень уникального предмета и прописываем его в слот экипировки
            hero.personal_item_level = nextItemLevel;
            if (!hero.equipped) hero.equipped = {};
            hero.equipped.personal = heroProto.personal_item_id;

            player.heroes = heroes;
            player.inventory = inventory;

            // Сохраняем стейт в Редис для пересчета силы
            await Cache.setPlayer(userId, serverId, player);

            // Пересчитываем БР
            const newPower = await recalculateAndSaveCombatPower(userId, serverId, gameId);

            // Синхронизируем новую силу в кэше и обновляем ZSET Лидерборд силы
            player.combat_power = newPower;
            await redisClient.setEx(`p:${serverId}:${userId}`, 1200, JSON.stringify(player));
            await redisClient.zAdd(`lb:${serverId}:combat_power`, { score: parseInt(newPower), value: String(userId) });

            // Собираем game_data структуру обратно под ожидания твоего фронтенда
            const rootFields = ['id', 'user_id', 'server_id', 'nickname', 'level', 'combat_power', 'resources', 'idle_timestamps'];
            const returnedGameData = {};
            Object.entries(player).forEach(([key, val]) => {
                if (!rootFields.includes(key) && !['gameId', 'deviceId', 'sessionId', 'partnerId', 'username'].includes(key)) {
                    returnedGameData[key] = val;
                }
            });

            return { success: true, combat_power: newPower, heroes: returnedGameData.heroes };

        } catch (cacheErr) {
            console.warn('[HeroDB:UpgradePersonal] Сбой Redis, проваливаюсь в Postgres Fallback:', cacheErr);
        }
    }

    // ------------------------------------------------------------------------
    // ЭШЕЛОН 2: ТВОЙ СТАРЫЙ ОРИГИНАЛЬНЫЙ SQL FALLBACK (БЕЗОПАСНАЯ ТРАНЗАКЦИЯ СУБД)
    // ------------------------------------------------------------------------
    const client = await global.pool.connect();
    try {
        await client.query('BEGIN');

        const { rows } = await client.query(
            `SELECT game_data FROM player_server_profiles WHERE id = $1 AND server_id = $2 FOR UPDATE;`, // Ищем по UUID таблицы
            [userId, serverId]
        );
        if (rows.length === 0) throw new Error("Профиль не найден");

        let gameData = rows.game_data;
        let heroes = gameData.heroes || [];
        let inventory = gameData.inventory || {};

        const hero = heroes.find(h => h.instance_id === heroInstId);
        if (!hero) throw new Error("Герой не найден");

        const heroProto = GameConfig?.catalog?.heroes?.[hero.hero_id];
        if (!heroProto?.personal_item_id) throw new Error("У этого героя нет уникального предмета");

        const nextItemLevel = (hero.personal_item_level || 0) + 1;

        const pItemCosts = GameConfig?.mechanics?.personal_item_costs?.[nextItemLevel];
        if (!pItemCosts) throw new Error("Достигнут maximalный уровень уникального предмета");

        if (nextItemLevel === 1 && hero.level < (GameConfig?.mechanics?.personal_item_unlock_level || 100)) {
            throw new Error(`Для открытия уникального предмета нужен ${GameConfig?.mechanics?.personal_item_unlock_level || 100} уровень героя`);
        }

        if (pItemCosts.materials) {
            Object.entries(pItemCosts.materials).forEach(([matId, neededAmount]) => {
                if ((inventory[matId] || 0) < neededAmount) {
                    throw new Error(`Недостаточно материалов для улучшения уникального шмота: ${matId}`);
                }
                inventory[matId] -= neededAmount;
                if (inventory[matId] <= 0) delete inventory[matId];
            });
        }

        hero.personal_item_level = nextItemLevel;
        if (!hero.equipped) hero.equipped = {};
        hero.equipped.personal = heroProto.personal_item_id;

        gameData.heroes = heroes;
        gameData.inventory = inventory;

        const updateQuery = `UPDATE player_server_profiles SET game_data = $3 WHERE id = $1 AND server_id = $2;`;
        await client.query(updateQuery, [userId, serverId, JSON.stringify(gameData)]);
        await client.query('COMMIT');

        const newPower = await recalculateAndSaveCombatPower(userId, serverId, gameId);

        const finalQuery = `SELECT game_data FROM player_server_profiles WHERE id = $1 AND server_id = $2;`;
        const { rows: finalRows } = await global.pool.query(finalQuery, [userId, serverId]);

        return { success: true, combat_power: newPower, heroes: finalRows.game_data.heroes };

    } catch (e) {
        await client.query('ROLLBACK');
        console.error("Ошибка при прокачке уникального предмета в SQL:", e);
        return { error: true, message: e.message };
    } finally {
        client.release();
    }
}


/**
 * Смена текущего скина героя
 * @param {string} skinId - ID скина из каталога (например, 'eleniel_skin_beach')
 */
// async function changeHeroSkin(userId, serverId, heroInstId, skinId) {
//     const client = await global.pool.connect();
//     try {
//         const { rows } = await client.query(
//             `SELECT game_data FROM player_server_profiles WHERE user_id = $1 AND server_id = $2;`,
//             [userId, serverId]
//         );
//         if (rows.length === 0) return { error: true, message: "Профиль не найден" };
//
//         let gameData = rows[0].game_data;
//         let heroes = gameData.heroes || [];
//         const hero = heroes.find(h => h.instance_id === heroInstId);
//         if (!hero) return { error: true, message: "Герой не найден" };
//
//         // В полноценной игре тут была бы еще проверка, куплен/разблокирован ли этот скин у игрока в массиве game_data.unlocked_skins.
//         // Сейчас просто переключаем на выбранный скин
//         hero.active_skin = skinId;
//         gameData.heroes = heroes;
//
//         await global.pool.query(
//             `UPDATE player_server_profiles SET game_data = $3 WHERE user_id = $1 AND server_id = $2;`,
//             [userId, serverId, JSON.stringify(gameData)]
//         );
//
//         return { success: true, game_data: gameData };
//     } catch (e) {
//         console.error("Ошибка при смене скина:", e);
//         return { error: true, message: e.message };
//     }
// }

/**
 * Привязка питомца к герою или его прокачка
 * @param {string} petId - ID питомца (если привязываем нового, иначе null для прокачки текущего)
 * @param {boolean} isLevelUpAction - true если мы хотим прокачать питомца, false если просто надеть
 */
// async function manageHeroPet(userId, serverId, gameId, heroInstId, petId = null, isLevelUpAction = false) {
//     const GameConfig = gamesConfigDB[gameId];
//     const client = await global.pool.connect();
//
//     try {
//         await client.query('BEGIN');
//
//         const { rows } = await client.query(
//             `SELECT game_data FROM player_server_profiles WHERE user_id = $1 AND server_id = $2 FOR UPDATE;`,
//             [userId, serverId]
//         );
//         if (rows.length === 0) throw new Error("Профиль не найден");
//
//         let gameData = rows[0].game_data;
//         let heroes = gameData.heroes || [];
//         let inventory = gameData.inventory || {};
//
//         const hero = heroes.find(h => h.instance_id === heroInstId);
//         if (!hero) throw new Error("Герой не найден");
//
//         if (!isLevelUpAction && petId) {
//             // --- ЛОГИКА НАДЕВАНИЯ ПИТОМЦА ---
//             if ((inventory[petId] || 0) <= 0) throw new Error("У вас нет этого питомца в инвентаре");
//
//             // Если у героя уже был питомец — возвращаем его обратно в инвентарь
//             if (hero.pet) {
//                 inventory[hero.pet.pet_id] = (inventory[hero.pet.pet_id] || 0) + 1;
//             }
//
//             // Инициализируем питомца 1 уровня на герое и списываем его карту из сумки
//             hero.pet = { pet_id: petId, level: 1 };
//             inventory[petId] -= 1;
//             if (inventory[petId] <= 0) delete inventory[petId];
//
//         } else if (isLevelUpAction) {
//             // --- ЛОГИКА ПРОКАЧКИ ПИТОМЦА ---
//             if (!hero.pet) throw new Error("У героя нет активного питомца для прокачки");
//
//             const nextPetLevel = hero.pet.level + 1;
//             const cost = GameConfig?.mechanics?.pet_level_costs?.[nextPetLevel];
//             if (!cost) throw new Error("Достигнут макс. уровень питомца");
//
//             if ((inventory["pet_food"] || 0) < cost.food) {
//                 throw new Error("Недостаточно корма для питомца (pet_food)");
//             }
//
//             inventory["pet_food"] -= cost.food;
//             if (inventory["pet_food"] <= 0) delete inventory["pet_food"];
//
//             hero.pet.level = nextPetLevel;
//         }
//
//         gameData.heroes = heroes;
//         gameData.inventory = inventory;
//
//         await client.query(
//             `UPDATE player_server_profiles SET game_data = $3 WHERE user_id = $1 AND server_id = $2;`,
//             [userId, serverId, JSON.stringify(gameData)]
//         );
//         await client.query('COMMIT');
//
//         // Питомцы меняют статы -> пересчитываем БР
//         const newPower = await recalculateAndSaveCombatPower(userId, serverId, gameId);
//
//         const finalQuery = `SELECT game_data FROM player_server_profiles WHERE user_id = $1 AND server_id = $2;`;
//         const { rows: finalRows } = await global.pool.query(finalQuery, [userId, serverId]);
//
//         return { success: true, combat_power: newPower, game_data: finalRows[0].game_data };
//
//     } catch (e) {
//         await client.query('ROLLBACK');
//         console.error("Ошибка при работе с питомцем:", e);
//         return { error: true, message: e.message };
//     } finally {
//         client.release();
//     }
// }

/**
 * 5. СМЕНА ОБЛИКА ГЕРОЯ (Гибридный метод: Redis RAM + Postgres Fallback)
 */
async function changeHeroSkin(userId, serverId, heroInstId, skinId) {
    // ------------------------------------------------------------------------
    // ЭШЕЛОН 1: РАБОТА В ОПЕРАТИВНОЙ ПАМЯТИ REDIS
    // ------------------------------------------------------------------------
    if (redisClient.isOpen && redisClient.isReady) {
        try {
            let player = await Cache.getPlayer(userId, serverId);
            if (!player) throw new Error("Профиль игрока не найден в кэше Redis");

            let heroes = player.heroes || [];
            const hero = heroes.find(h => h.instance_id === heroInstId);
            if (!hero) return { error: true, message: "Герой не найден" };

            // Применяем скин в памяти
            hero.active_skin = skinId;
            player.heroes = heroes;

            // Сохраняем в Редис. Фоновую силу тут пересчитывать не нужно (скины косметические)
            await Cache.setPlayer(userId, serverId, player);

            const rootFields = ['id', 'user_id', 'server_id', 'nickname', 'level', 'combat_power', 'resources', 'idle_timestamps'];
            const returnedGameData = {};
            Object.entries(player).forEach(([key, val]) => {
                if (!rootFields.includes(key) && !['gameId', 'deviceId', 'sessionId', 'partnerId', 'username'].includes(key)) {
                    returnedGameData[key] = val;
                }
            });

            return { success: true, heroes: returnedGameData.heroes };
        } catch (cacheErr) {
            console.warn('[HeroDB:ChangeSkin] Сбой Redis, проваливаюсь в Postgres Fallback:', cacheErr);
        }
    }

    // ------------------------------------------------------------------------
    // ЭШЕЛОН 2: ОРИГИНАЛЬНЫЙ SQL FALLBACK С АТОМАРНЫМ ОБНОВЛЕНИЕМ СУБД
    // ------------------------------------------------------------------------
    const client = await global.pool.connect();
    try {
        await client.query('BEGIN');
        const { rows } = await client.query(
            `SELECT game_data FROM player_server_profiles WHERE id = $1 AND server_id = $2 FOR UPDATE;`,
            [userId, serverId]
        );
        if (rows.length === 0) {
            await client.query('ROLLBACK');
            return { error: true, message: "Профиль не найден" };
        }

        let gameData = rows[0].game_data;
        let heroes = gameData.heroes || [];
        const hero = heroes.find(h => h.instance_id === heroInstId);
        if (!hero) {
            await client.query('ROLLBACK');
            return { error: true, message: "Герой не найден" };
        }

        hero.active_skin = skinId;
        gameData.heroes = heroes;

        await client.query(
            `UPDATE player_server_profiles SET game_data = $3 WHERE id = $1 AND server_id = $2;`,
            [userId, serverId, JSON.stringify(gameData)]
        );
        await client.query('COMMIT');

        return { success: true, heroes: gameData.heroes };
    } catch (e) {
        await client.query('ROLLBACK');
        console.error("Ошибка при смене скина в SQL:", e);
        return { error: true, message: e.message };
    } finally {
        client.release();
    }
}

/**
 * 6. СИСТЕМА ПИТОМЦЕВ ГЕРОЯ (Гибридный метод: Redis RAM + Postgres Fallback)
 */
async function manageHeroPet(userId, serverId, gameId, heroInstId, petId = null, isLevelUpAction = false) {
    const GameConfig = gamesConfigDB[gameId];

    // ------------------------------------------------------------------------
    // ЭШЕЛОН 1: РАБОТА В ОПЕРАТИВНОЙ ПАМЯТИ REDIS
    // ------------------------------------------------------------------------
    if (redisClient.isOpen && redisClient.isReady) {
        try {
            let player = await Cache.getPlayer(userId, serverId);
            if (!player) throw new Error("Профиль игрока не найден в кэше Redis");

            let heroes = player.heroes || [];
            let inventory = player.inventory || {};

            const hero = heroes.find(h => h.instance_id === heroInstId);
            if (!hero) return { error: true, message: "Герой не найден" };

            if (!isLevelUpAction && petId) {
                // Экипировка питомца в RAM
                if ((inventory[petId] || 0) <= 0) return { error: true, message: "У вас нет этого питомца в инвентаре" };

                if (hero.pet) {
                    // Обработка camelCase для вложенного объекта pet_id под правила проекта
                    const oldPetId = hero.pet.petId || hero.pet.pet_id;
                    inventory[oldPetId] = (parseInt(inventory[oldPetId]) || 0) + 1;
                }

                hero.pet = { petId: petId, level: 1 };
                inventory[petId] -= 1;
                if (inventory[petId] <= 0) delete inventory[petId];

            } else if (isLevelUpAction) {
                // Прокачка кормом в RAM
                if (!hero.pet) return { error: true, message: "У героя нет activeного питомца для прокачки" };

                const currentPetLevel = hero.pet.level || 1;
                const nextPetLevel = currentPetLevel + 1;
                const cost = GameConfig?.mechanics?.pet_level_costs?.[nextPetLevel];
                if (!cost) return { error: true, message: "Достигнут макс. уровень питомца" };

                if ((inventory["pet_food"] || 0) < cost.food) {
                    return { error: true, message: "Недостаточно корма для питомца (pet_food)" };
                }

                inventory["pet_food"] -= cost.food;
                if (inventory["pet_food"] <= 0) delete inventory["pet_food"];

                hero.pet.level = nextPetLevel;
            }

            player.heroes = heroes;
            player.inventory = inventory;

            // Синхронизируем стейт перед пересчетом силы
            await Cache.setPlayer(userId, serverId, player);

            // Пересчитываем силу в RAM
            const newPower = await recalculateAndSaveCombatPower(userId, serverId, gameId);

            player.combat_power = newPower;
            await redisClient.setEx(`p:${serverId}:${userId}`, 1200, JSON.stringify(player));
            await redisClient.zAdd(`lb:${serverId}:combat_power`, { score: parseInt(newPower), value: String(userId) });

            const rootFields = ['id', 'user_id', 'server_id', 'nickname', 'level', 'combat_power', 'resources', 'idle_timestamps'];
            const returnedGameData = {};
            Object.entries(player).forEach(([key, val]) => {
                if (!rootFields.includes(key) && !['gameId', 'deviceId', 'sessionId', 'partnerId', 'username'].includes(key)) {
                    returnedGameData[key] = val;
                }
            });

            return { success: true, combat_power: newPower, heroes: returnedGameData.heroes };

        } catch (cacheErr) {
            console.warn('[HeroDB:ManagePet] Сбой Redis, проваливаюсь в Postgres Fallback:', cacheErr);
        }
    }

    // ------------------------------------------------------------------------
    // ЭШЕЛОН 2: ТВОЙ СТАРЫЙ ОРИГИНАЛЬНЫЙ SQL FALLBACK С ТРАНЗАКЦИЕЙ СУБД
    // ------------------------------------------------------------------------
    const client = await global.pool.connect();
    try {
        await client.query('BEGIN');
        const { rows } = await client.query(
            `SELECT game_data FROM player_server_profiles WHERE id = $1 AND server_id = $2 FOR UPDATE;`,
            [userId, serverId]
        );
        if (rows.length === 0) throw new Error("Профиль не найден");

        let gameData = rows[0].game_data;
        let heroes = gameData.heroes || [];
        let inventory = gameData.inventory || {};

        const hero = heroes.find(h => h.instance_id === heroInstId);
        if (!hero) throw new Error("Герой не найден");

        if (!isLevelUpAction && petId) {
            if ((inventory[petId] || 0) <= 0) throw new Error("У вас нет этого питомца в инвентаре");
            if (hero.pet) {
                const oldPetId = hero.pet.pet_id || hero.pet.petId;
                inventory[oldPetId] = (inventory[oldPetId] || 0) + 1;
            }
            hero.pet = { pet_id: petId, level: 1 };
            inventory[petId] -= 1;
            if (inventory[petId] <= 0) delete inventory[petId];
        } else if (isLevelUpAction) {
            if (!hero.pet) throw new Error("У героя нет активного питомца для прокачки");
            const nextPetLevel = hero.pet.level + 1;
            const cost = GameConfig?.mechanics?.pet_level_costs?.[nextPetLevel];
            if (!cost) throw new Error("Достигнут макс. уровень питомца");

            if ((inventory["pet_food"] || 0) < cost.food) throw new Error("Недостаточно корма для питомца (pet_food)");
            inventory["pet_food"] -= cost.food;
            if (inventory["pet_food"] <= 0) delete inventory["pet_food"];
            hero.pet.level = nextPetLevel;
        }

        gameData.heroes = heroes;
        gameData.inventory = inventory;

        await client.query(
            `UPDATE player_server_profiles SET game_data = $3 WHERE id = $1 AND server_id = $2;`,
            [userId, serverId, JSON.stringify(gameData)]
        );
        await client.query('COMMIT');

        const newPower = await recalculateAndSaveCombatPower(userId, serverId, gameId);
        const { rows: finalRows } = await global.pool.query(
            `SELECT game_data FROM player_server_profiles WHERE id = $1 AND server_id = $2;`,
            [userId, serverId]
        );

        return { success: true, combat_power: newPower, heroes: finalRows[0].game_data.heroes };
    } catch (e) {
        await client.query('ROLLBACK');
        console.error("Ошибка при работе с питомцем в SQL:", e);
        return { error: true, message: e.message };
    } finally {
        client.release();
    }
}


/**
 * Сохранение отряда героев в базе данных с расчетом фракционных бонусов
 * @param {Array<string>} heroInstIds - Массив уникальных инстансов героев
 */
// async function savePlayerTeam(userId, serverId, gameId, teamKey, heroInstIds = []) {
//     const GameConfig = gamesConfigDB[gameId];
//     const teamLimit = GameConfig?.mechanics?.prototypes?.team?.size || 5;
//     const factionBonuses = GameConfig?.mechanics?.prototypes?.team?.bonuses?.faction || {};
//
//     if (heroInstIds.length > teamLimit) {
//         return { error: true, message: `Превышен лимит отряда! Максимум: ${teamLimit}` };
//     }
//
//     const client = await pool.connect();
//     try {
//
//         await client.query('BEGIN');
//
//         // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Достаем ВСЮ строку (включая ресурсы и таймстамы), чтобы сохранить целостность
//         const { rows } = await client.query(
//             `SELECT * FROM player_server_profiles WHERE user_id = $1 AND server_id = $2 FOR UPDATE;`,
//             [userId, serverId]
//         );
//         if (rows.length === 0) throw new Error("Профиль игрока не найден");
//
//         const playerProfile = rows[0];
//         let gameData = playerProfile.game_data || {};
//         let heroes = gameData.heroes || [];
//
//         // Валидация героев
//         for (const instId of heroInstIds) {
//             const exists = heroes.some(h => h.instance_id === instId);
//             if (!exists) throw new Error(`Герой с ID ${instId} не найден на вашем аккаунте`);
//         }
//
//         // Инициализируем и записываем отряд
//         if (!gameData.teams) gameData.teams = {};
//         gameData.teams[teamKey] = heroInstIds;
//
//         // Расчет фракционных бонусов
//         const factionCounts = {};
//         heroInstIds.forEach(instId => {
//             const hero = heroes.find(h => h.instance_id === instId);
//             const proto = GameConfig?.catalog?.heroes?.[hero?.hero_id];
//             if (proto?.faction_id) {
//                 factionCounts[proto.faction_id] = (factionCounts[proto.faction_id] || 0) + 1;
//             }
//         });
//
//         let maxSameFactionCount = 0;
//         Object.values(factionCounts).forEach(count => {
//             if (count > maxSameFactionCount) maxSameFactionCount = count;
//         });
//
//         let activeFactionBonus = { hp: "0%", atk: "0%" };
//         for (let milestone = maxSameFactionCount; milestone >= 3; milestone--) {
//             if (factionBonuses[milestone]) {
//                 activeFactionBonus = factionBonuses[milestone];
//                 break;
//             }
//         }
//
//         if (!gameData.team_bonuses) gameData.team_bonuses = {};
//         gameData.team_bonuses[teamKey] = activeFactionBonus;
//
//         // Делаем чистый UPDATE только колонки game_data, вообще не трогая остальные колонки в SQL
//         const updateQuery = `UPDATE player_server_profiles SET game_data = $3 WHERE user_id = $1 AND server_id = $2 RETURNING *;`;
//         const { rows: updateRows } = await client.query(updateQuery, [userId, serverId, JSON.stringify(gameData)]);
//         await client.query('COMMIT');
//
//         const updatedProfile = updateRows[0];
//
//         // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Формируем ответ ОДИН В ОДИН как в твоем logInServer,
//         // чтобы фронтенд мог полностью и безопасно обновить объект Game.player без десинхронизации структуры!
//         return {
//             id: updatedProfile.id,
//             user_id: updatedProfile.user_id,
//             server_id: updatedProfile.server_id,
//             nickname: updatedProfile.nickname,
//             level: updatedProfile.level,
//             combat_power: updatedProfile.combat_power,
//             resources: updatedProfile.resources, // Сохраняем ресурсы на месте
//             idle_timestamps: updatedProfile.idle_timestamps, // Сохраняем таймстамы на месте
//
//             ...updatedProfile.game_data // Разворачиваем тяжелый JSONB наружу, как при логине
//         };
//
//     } catch (e) {
//         await client.query('ROLLBACK');
//         console.error("Ошибка сохранения отряда:", e);
//         return { error: true, message: e.message };
//     } finally {
//         client.release();
//     }
// }

/**
 * 6. СОХРАНЕНИЕ ОТРЯДА И РАСЧЕТ ФРАКЦИОННЫХ БОНУСОВ (Гибридный метод: Redis RAM + Postgres Fallback)
 */
async function savePlayerTeam(userId, serverId, gameId, teamKey, heroInstIds = []) {
    const GameConfig = gamesConfigDB[gameId];
    const teamLimit = GameConfig?.mechanics?.prototypes?.team?.size || 5;
    const factionBonuses = GameConfig?.mechanics?.prototypes?.team?.bonuses?.faction || {};

    if (heroInstIds.length > teamLimit) {
        return { error: true, message: `Превышен лимит отряда! Максимум: ${teamLimit}` };
    }

    // ------------------------------------------------------------------------
    // ЭШЕЛОН 1: ОПЕРАЦИЯ В СВЕРХБЫСТРОМ REDIS КЭШЕ (0 МИЛЛИСЕКУНД)
    // ------------------------------------------------------------------------
    if (redisClient.isOpen && redisClient.isReady) {
        try {
            // Извлекаем плоский профиль из Редиса
            let player = await Cache.getPlayer(userId, serverId);
            if (!player) throw new Error("Профиль игрока не найден в кэше Redis");

            let heroes = player.heroes || [];

            // Валидация наличия героев в памяти
            for (const instId of heroInstIds) {
                const exists = heroes.some(h => h.instance_id === instId);
                if (!exists) return { error: true, message: `Герой с ID ${instId} не найден на вашем аккаунте` };
            }

            // Инициализируем структуру команд в памяти
            if (!player.teams) player.teams = {};
            player.teams[teamKey] = heroInstIds;

            // Расчет фракционных бонусов в RAM
            const factionCounts = {};
            heroInstIds.forEach(instId => {
                const hero = heroes.find(h => h.instance_id === instId);
                const proto = GameConfig?.catalog?.heroes?.[hero?.hero_id];
                if (proto?.faction_id) {
                    factionCounts[proto.faction_id] = (factionCounts[proto.faction_id] || 0) + 1;
                }
            });

            let maxSameFactionCount = 0;
            Object.values(factionCounts).forEach(count => {
                if (count > maxSameFactionCount) maxSameFactionCount = count;
            });

            let activeFactionBonus = { hp: "0%", atk: "0%" };
            for (let milestone = maxSameFactionCount; milestone >= 3; milestone--) {
                if (factionBonuses[milestone]) {
                    activeFactionBonus = factionBonuses[milestone];
                    break;
                }
            }

            if (!player.team_bonuses) player.team_bonuses = {};
            player.team_bonuses[teamKey] = activeFactionBonus;

            // Записываем обновленный плоский профиль обратно в Редис. Lazy Write сам скинет изменения в Postgres
            await Cache.setPlayer(userId, serverId, player);

            // Возвращаем плоскую структуру один в один с форматом logInServer под ожидания твоего фронтенда
            return {
                id: player.id,
                user_id: player.user_id,
                server_id: player.server_id,
                nickname: player.nickname,
                level: player.level,
                combat_power: player.combat_power,
                resources: player.resources,
                idle_timestamps: player.idle_timestamps,
                ...player // Разворачиваем все динамические поля наружу
            };

        } catch (cacheErr) {
            console.warn('[HeroDB:SaveTeam] Сбой Redis, проваливаюсь в Postgres Fallback:', cacheErr);
        }
    }

    // ------------------------------------------------------------------------
    // ЭШЕЛОН 2: ТВОЙ СТАРЫЙ ОРИГИНАЛЬНЫЙ SQL FALLBACK (БЕЗОПАСНАЯ ТРАНЗАКЦИЯ СУБД)
    // ------------------------------------------------------------------------
    const client = await global.pool.connect();
    try {
        await client.query('BEGIN');

        // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Достаем ВСЮ строку (включая ресурсы и таймстамы)
        const { rows } = await client.query(
            `SELECT * FROM player_server_profiles WHERE id = $1 AND server_id = $2 FOR UPDATE;`, // Ищем по UUID таблицы (id)
            [userId, serverId]
        );
        if (rows.length === 0) throw new Error("Профиль игрока не найден");

        const playerProfile = rows[0];
        let gameData = playerProfile.game_data || {};
        let heroes = gameData.heroes || [];

        for (const instId of heroInstIds) {
            const exists = heroes.some(h => h.instance_id === instId);
            if (!exists) throw new Error(`Герой с ID ${instId} не найден на вашем аккаунте`);
        }

        if (!gameData.teams) gameData.teams = {};
        gameData.teams[teamKey] = heroInstIds;

        const factionCounts = {};
        heroInstIds.forEach(instId => {
            const hero = heroes.find(h => h.instance_id === instId);
            const proto = GameConfig?.catalog?.heroes?.[hero?.hero_id];
            if (proto?.faction_id) {
                factionCounts[proto.faction_id] = (factionCounts[proto.faction_id] || 0) + 1;
            }
        });

        let maxSameFactionCount = 0;
        Object.values(factionCounts).forEach(count => {
            if (count > maxSameFactionCount) maxSameFactionCount = count;
        });

        let activeFactionBonus = { hp: "0%", atk: "0%" };
        for (let milestone = maxSameFactionCount; milestone >= 3; milestone--) {
            if (factionBonuses[milestone]) {
                activeFactionBonus = factionBonuses[milestone];
                break;
            }
        }

        if (!gameData.team_bonuses) gameData.team_bonuses = {};
        gameData.team_bonuses[teamKey] = activeFactionBonus;

        const updateQuery = `UPDATE player_server_profiles SET game_data = $3 WHERE id = $1 AND server_id = $2 RETURNING *;`;
        const { rows: updateRows } = await client.query(updateQuery, [userId, serverId, JSON.stringify(gameData)]);
        await client.query('COMMIT');

        const updatedProfile = updateRows[0];

        return {
            id: updatedProfile.id,
            user_id: updatedProfile.user_id,
            server_id: updatedProfile.server_id,
            nickname: updatedProfile.nickname,
            level: updatedProfile.level,
            combat_power: updatedProfile.combat_power,
            resources: updatedProfile.resources,
            idle_timestamps: updatedProfile.idle_timestamps,
            ...updatedProfile.game_data
        };

    } catch (e) {
        await client.query('ROLLBACK');
        console.error("Ошибка сохранения отряда в SQL:", e);
        return { error: true, message: e.message };
    } finally {
        client.release();
    }
}

// Финальный полный экспорт сервисного файла управления героями
module.exports = {
    levelUpHero,
    consumeHero,
    upgradeHeroStars,
    upgradePersonalItem,
    changeHeroSkin,
    manageHeroPet,
    savePlayerTeam // ДОБАВЛЕНО
};


module.exports = {
    addHero,
    levelUpHero,
    consumeHero,
    upgradeHeroStars,
    upgradePersonalItem,
    changeHeroSkin,
    manageHeroPet,
    savePlayerTeam
};

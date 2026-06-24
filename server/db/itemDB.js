const {getHeroRating, getItemRating, recalculateAndSaveCombatPower} = require('./_shared');
const { redisClient } = require('../../redisClient');
const Cache = require('./cacheManager');
const {gamesConfigDB} = require('./configDB');

/**
 * 1. ОДИНОЧНЫЙ ЭКВИП ШМОТКИ НА ГЕРОЯ (Гибридный метод: Redis RAM + Postgres Fallback)
 */
async function equipItem(userId, serverId, gameId, heroInstId, itemId, slotId) {
    const GameConfig = gamesConfigDB[gameId];
    const itemsCatalog = GameConfig?.catalog?.items;

    if (!itemsCatalog?.[itemId]) return { error: true, message: "Предмет не найден в каталоге" };

    // Проверяем, соответствует ли слот типу шмотки (например, оружие в слот weapon)
    const itemMeta = itemsCatalog[itemId];
    if (itemMeta.slot_type !== slotId && itemMeta.slotType !== slotId) {
        return { error: true, message: `Этот предмет нельзя надеть в слот ${slotId}` };
    }

    // ------------------------------------------------------------------------
    // ЭШЕЛОН 1: ОПЕРАЦИЯ В ОПЕРАТИВНОЙ ПАМЯТИ REDIS (БЫСТРЫЙ ПУТЬ)
    // ------------------------------------------------------------------------
    if (redisClient.isOpen && redisClient.isReady) {
        try {
            let player = await Cache.getPlayer(userId, serverId);
            if (!player) throw new Error("Профиль игрока не найден в кэше Redis");

            let heroes = player.heroes || [];
            let inventory = player.inventory || {};

            const hero = heroes.find(h => h.instance_id === heroInstId);
            if (!hero) return { error: true, message: "Герой не найден" };

            // Проверяем наличие шмотки в рюкзаке
            if ((inventory[itemId] || 0) <= 0) return { error: true, message: "У вас нет этого предмета в рюкзаке" };

            if (!hero.equipped) hero.equipped = {};

            // Если на герое уже что-то надето в этом слоте — возвращаем старую вещь в рюкзак
            const oldEquippedItemId = hero.equipped[slotId];
            if (oldEquippedItemId) {
                inventory[oldEquippedItemId] = (parseInt(inventory[oldEquippedItemId]) || 0) + 1;
            }

            // Надеваем новую вещь и списываем 1 шт из инвентаря
            hero.equipped[slotId] = itemId;
            inventory[itemId] -= 1;
            if (inventory[itemId] <= 0) delete inventory[itemId];

            player.heroes = heroes;
            player.inventory = inventory;

            // Сохраняем промежуточный стейт в Редис, чтобы калькулятор силы прочитал обновленный шмот
            await Cache.setPlayer(userId, serverId, player);

            // ИСПРАВЛЕНО: Принудительный автопересчет боевой силы аккаунта после экипировки
            const { recalculateAndSaveCombatPower } = require('./heroDB');
            const newPower = await recalculateAndSaveCombatPower(userId, serverId, gameId);

            // Синхронизируем новую силу в кэше и обновляем ZSET Лидерборд силы Арены
            player.combat_power = newPower;
            await redisClient.setEx(`p:${serverId}:${userId}`, 1200, JSON.stringify(player));
            await redisClient.zAdd(`lb:${serverId}:combat_power`, { score: parseInt(newPower), value: String(userId) });

            // Собираем структуру game_data обратно под ожидания фронтенда
            const rootFields = ['id', 'user_id', 'server_id', 'nickname', 'level', 'combat_power', 'resources', 'idle_timestamps'];
            const returnedGameData = {};
            Object.entries(player).forEach(([key, val]) => {
                if (!rootFields.includes(key) && !['gameId', 'deviceId', 'sessionId', 'partnerId', 'username'].includes(key)) {
                    returnedGameData[key] = val;
                }
            });

            return { success: true, combat_power: newPower, game_data: returnedGameData, resources: player.resources };

        } catch (cacheErr) {
            console.warn('[ItemDB:Equip] Сбой Redis, проваливаюсь в Postgres Fallback:', cacheErr);
        }
    }

    // ------------------------------------------------------------------------
    // НАЧАЛО ЭШЕЛОНА 2: ТВОЙ СТАРЫЙ SQL FALLBACK (ПРЯМАЯ ТРАНЗАКЦИЯ В СУБД)
    // ------------------------------------------------------------------------
    const client = await global.pool.connect();
    try {
        await client.query('BEGIN');

        const { rows } = await client.query(
            `SELECT game_data, resources FROM player_server_profiles WHERE id = $1 AND server_id = $2 FOR UPDATE;`,
            [userId, serverId]
        );
        if (rows.length === 0) throw new Error("Профиль не найден");

        let gameData = rows[0].game_data || {};
        let resources = rows[0].resources || {};
        let heroes = gameData.heroes || [];
        let inventory = gameData.inventory || {};

        const hero = heroes.find(h => h.instance_id === heroInstId);
        if (!hero) throw new Error("Герой не найден");

        if ((inventory[itemId] || 0) <= 0) throw new Error("У вас нет этого предмета в рюкзаке");

        if (!hero.equipped) hero.equipped = {};
        const oldEquippedItemId = hero.equipped[slotId];
        if (oldEquippedItemId) {
            inventory[oldEquippedItemId] = (inventory[oldEquippedItemId] || 0) + 1;
        }

        hero.equipped[slotId] = itemId;
        inventory[itemId] -= 1;
        if (inventory[itemId] <= 0) delete inventory[itemId];

        gameData.heroes = heroes;
        gameData.inventory = inventory;

        const updateQuery = `UPDATE player_server_profiles SET game_data = $3 WHERE id = $1 AND server_id = $2;`;
        await client.query(updateQuery, [userId, serverId, JSON.stringify(gameData)]);
        await client.query('COMMIT');

        const { recalculateAndSaveCombatPower } = require('./heroDB');
        const newPower = await recalculateAndSaveCombatPower(userId, serverId, gameId);

        const finalQuery = `SELECT game_data, resources FROM player_server_profiles WHERE id = $1 AND server_id = $2;`;
        const { rows: finalRows } = await global.pool.query(finalQuery, [userId, serverId]);

        return { success: true, combat_power: newPower, game_data: finalRows[0].game_data, resources: finalRows[0].resources };
    } catch (e) {
        await client.query('ROLLBACK');
        console.error("Ошибка при экипировке предмета в SQL:", e);
        return { error: true, message: e.message };
    } finally {
        client.release();
    }
}

/**
 * 2. АВТОЭКВИП ГЕРОЯ ЛУЧШИМ СНАРЯЖЕНИЕМ ИЗ РЮКЗАКА (Гибридный метод)
 */
async function autoEquipHero(userId, serverId, gameId, heroInstId) {
    const GameConfig = gamesConfigDB[gameId];
    const itemsCatalog = GameConfig?.catalog?.items || {};
    const slots = GameConfig?.mechanics?.inventory_slots || ["weapon", "armor", "boots", "ring"];
    const rarityPriority = ["R", "SR", "SSR", "UR"];

    // Внутренний хелпер для оценки "крутости" вещи (по редкости и силе характеристик)
    const getItemWeight = (itemId) => {
        const meta = itemsCatalog[itemId];
        if (!meta) return -1;
        const rarityScore = rarityPriority.indexOf(meta.rarity || "R") * 1000;
        const statsScore = Object.values(meta.stats || {}).reduce((a, b) => a + b, 0);
        return rarityScore + statsScore;
    };

    // ------------------------------------------------------------------------
    // ЭШЕЛОН 1: РАБОТА В ОПЕРАТИВНОЙ ПАМЯТИ REDIS (БЫСТРЫЙ ПУТЬ)
    // ------------------------------------------------------------------------
    if (redisClient.isOpen && redisClient.isReady) {
        try {
            let player = await Cache.getPlayer(userId, serverId);
            if (!player) throw new Error("Профиль игрока не найден в кэше Redis");

            let heroes = player.heroes || [];
            let inventory = player.inventory || {};

            const hero = heroes.find(h => h.instance_id === heroInstId);
            if (!hero) return { error: true, message: "Герой не найден" };

            if (!hero.equipped) hero.equipped = {};
            let isAnyThingChanged = false;

            slots.forEach(slotId => {
                let bestItemId = null;
                let bestWeight = hero.equipped[slotId] ? getItemWeight(hero.equipped[slotId]) : -1;

                // Ищем в рюкзаке замену получше
                Object.entries(inventory).forEach(([itemId, count]) => {
                    if (count <= 0) return;
                    const meta = itemsCatalog[itemId];
                    const itemSlot = meta?.slot_type || meta?.slotType;
                    if (itemSlot !== slotId) return;

                    const weight = getItemWeight(itemId);
                    if (weight > bestWeight) {
                        bestWeight = weight;
                        bestItemId = itemId;
                    }
                });

                // Если нашли шмотку лучше текущей
                if (bestItemId) {
                    isAnyThingChanged = true;
                    const oldItem = hero.equipped[slotId];

                    // Возвращаем старую вещь в инвентарь RAM
                    if (oldItem) {
                        inventory[oldItem] = (parseInt(inventory[oldItem]) || 0) + 1;
                    }

                    // Списываем и надеваем новую шмотку
                    hero.equipped[slotId] = bestItemId;
                    inventory[bestItemId] -= 1;
                    if (inventory[bestItemId] <= 0) delete inventory[bestItemId];
                }
            });

            if (isAnyThingChanged) {
                player.heroes = heroes;
                player.inventory = inventory;

                await Cache.setPlayer(userId, serverId, player);

                const { recalculateAndSaveCombatPower } = require('./heroDB');
                const newPower = await recalculateAndSaveCombatPower(userId, serverId, gameId);

                player.combat_power = newPower;
                await redisClient.setEx(`p:${serverId}:${userId}`, 1200, JSON.stringify(player));
                await redisClient.zAdd(`lb:${serverId}:combat_power`, { score: parseInt(newPower), value: String(userId) });

                // Сборка game_data под фронтенд
                const rootFields = ['id', 'user_id', 'server_id', 'nickname', 'level', 'combat_power', 'resources', 'idle_timestamps'];
                const returnedGameData = {};
                Object.entries(player).forEach(([key, val]) => {
                    if (!rootFields.includes(key) && !['gameId', 'deviceId', 'sessionId', 'partnerId', 'username'].includes(key)) {
                        returnedGameData[key] = val;
                    }
                });

                return { success: true, combat_power: newPower, game_data: returnedGameData, resources: player.resources };
            }

            return { success: true, combat_power: player.combat_power, game_data: player, resources: player.resources, msg: "Уже надето лучшее снаряжение" };

        } catch (cacheErr) {
            console.warn('[ItemDB:AutoEquip] Сбой Redis, проваливаюсь в Postgres Fallback:', cacheErr);
        }
    }

    // ------------------------------------------------------------------------
    // НАЧАЛО ЭШЕЛОНА 2: ТВОЙ СТАРЫЙ SQL FALLBACK АВТОЭКВИПА (В РЕЖИМЕ БД)
    // ------------------------------------------------------------------------
    const client = await global.pool.connect();
    try {
        await client.query('BEGIN');
        const { rows } = await client.query(
            `SELECT game_data, resources FROM player_server_profiles WHERE id = $1 AND server_id = $2 FOR UPDATE;`,
            [userId, serverId]
        );
        if (rows.length === 0) throw new Error("Профиль не найден");

        let gameData = rows[0].game_data || {};
        let resources = rows[0].resources || {};
        let heroes = gameData.heroes || [];
        let inventory = gameData.inventory || {};

        const hero = heroes.find(h => h.instance_id === heroInstId);
        if (!hero) throw new Error("Герой не найден");

        if (!hero.equipped) hero.equipped = {};
        let isAnyThingChanged = false;

        slots.forEach(slotId => {
            let bestItemId = null;
            let bestWeight = hero.equipped[slotId] ? getItemWeight(hero.equipped[slotId]) : -1;

            Object.entries(inventory).forEach(([itemId, count]) => {
                if (count <= 0) return;
                const meta = itemsCatalog[itemId];
                const itemSlot = meta?.slot_type || meta?.slotType;
                if (itemSlot !== slotId) return;

                const weight = getItemWeight(itemId);
                if (weight > bestWeight) {
                    bestWeight = weight;
                    bestItemId = itemId;
                }
            });

            if (bestItemId) {
                isAnyThingChanged = true;
                const oldItem = hero.equipped[slotId];
                if (oldItem) inventory[oldItem] = (inventory[oldItem] || 0) + 1;

                hero.equipped[slotId] = bestItemId;
                inventory[bestItemId] -= 1;
                if (inventory[bestItemId] <= 0) delete inventory[bestItemId];
            }
        });

        if (isAnyThingChanged) {
            gameData.heroes = heroes;
            gameData.inventory = inventory;

            const updateQuery = `UPDATE player_server_profiles SET game_data = $3 WHERE id = $1 AND server_id = $2;`;
            await client.query(updateQuery, [userId, serverId, JSON.stringify(gameData)]);
        }
        await client.query('COMMIT');

        const { recalculateAndSaveCombatPower } = require('./heroDB');
        const newPower = await recalculateAndSaveCombatPower(userId, serverId, gameId);

        const finalQuery = `SELECT game_data, resources FROM player_server_profiles WHERE id = $1 AND server_id = $2;`;
        const { rows: finalRows } = await global.pool.query(finalQuery, [userId, serverId]);

        return { success: true, combat_power: newPower, game_data: finalRows[0].game_data, resources: finalRows[0].resources };

    } catch (e) {
        await client.query('ROLLBACK');
        console.error("Ошибка при автоэкипировке в SQL:", e);
        return { error: true, message: e.message };
    } finally {
        client.release();
    }
}

/**
 * 3. ОБЫЧНЫЙ ЛИНЕЙНЫЙ КРАФТ ПРЕДМЕТА (Гибридный метод: Redis RAM + Postgres Fallback)
 */
async function craftItem(userId, serverId, recipeId, count = 1, recipesCatalog) {
    if (count <= 0) return { error: true, message: "Неверное количество для крафта" };

    const recipe = recipesCatalog[recipeId];
    if (!recipe) return { error: true, message: "Рецепт не найден" };

    // ------------------------------------------------------------------------
    // ЭШЕЛОН 1: ОПЕРАЦИЯ КРАФТА В ОПЕРАТИВНОЙ ПАМЯТИ REDIS
    // ------------------------------------------------------------------------
    if (redisClient.isOpen && redisClient.isReady) {
        try {
            let player = await Cache.getPlayer(userId, serverId);
            if (!player) throw new Error("Профиль игрока не найден в кэше Redis");

            let resources = player.resources || {};
            if (!player.inventory) player.inventory = {};

            const totalGoldCost = (recipe.gold_cost || 0) * count;
            if ((parseInt(resources.gold) || 0) < totalGoldCost) return { error: true, message: `Недостаточно золота. Нужно: ${totalGoldCost}` };

            if (recipe.ingredients) {
                for (const [matId, neededAmount] of Object.entries(recipe.ingredients)) {
                    const totalNeeded = neededAmount * count;
                    if ((player.inventory[matId] || 0) < totalNeeded) {
                        return { error: true, message: `Недостаточно материала: ${matId}. Нужно: ${totalNeeded}` };
                    }
                }
                Object.entries(recipe.ingredients).forEach(([matId, neededAmount]) => {
                    player.inventory[matId] -= neededAmount * count;
                    if (player.inventory[matId] <= 0) delete player.inventory[matId];
                });
            }

            resources.gold = (parseInt(resources.gold) || 0) - totalGoldCost;
            const resultItemId = recipe.result.itemId;
            player.inventory[resultItemId] = (player.inventory[resultItemId] || 0) + count;

            player.resources = resources;
            await Cache.setPlayer(userId, serverId, player);

            return { success: true, crafted_item: resultItemId, crafted_count: count, resources, game_data: player };

        } catch (cacheErr) {
            console.warn('[ItemDB:Craft] Сбой Redis, проваливаюсь в Postgres Fallback:', cacheErr);
        }
    }

    // ------------------------------------------------------------------------
    // ЭШЕЛОН 2: ТВОЙ СТАРЫЙ SQL FALLBACK ОБЫЧНОГО КРАФТА В СУБД
    // ------------------------------------------------------------------------
    const client = await global.pool.connect();
    try {
        await client.query('BEGIN');
        const { rows } = await client.query(
            `SELECT game_data, resources FROM player_server_profiles WHERE id = $1 AND server_id = $2 FOR UPDATE;`,
            [userId, serverId]
        );
        if (rows.length === 0) throw new Error("Профиль не найден");

        let gameData = rows[0].game_data || {};
        let resources = rows[0].resources || {};
        let inventory = gameData.inventory || {};

        const totalGoldCost = (recipe.gold_cost || 0) * count;
        if ((parseInt(resources.gold) || 0) < totalGoldCost) throw new Error(`Недостаточно золота. Нужно: ${totalGoldCost}`);
        resources.gold = (parseInt(resources.gold) || 0) - totalGoldCost;

        if (recipe.ingredients) {
            Object.entries(recipe.ingredients).forEach(([matId, neededAmount]) => {
                const totalNeeded = neededAmount * count;
                if ((inventory[matId] || 0) < totalNeeded) throw new Error(`Недостаточно материала: ${matId}. Нужно: ${totalNeeded}`);
                inventory[matId] -= totalNeeded;
                if (inventory[matId] <= 0) delete inventory[matId];
            });
        }

        const resultItemId = recipe.result.itemId;
        inventory[resultItemId] = (inventory[resultItemId] || 0) + count;
        gameData.inventory = inventory;

        const updateQuery = `UPDATE player_server_profiles SET game_data = $3, resources = $4 WHERE id = $1 AND server_id = $2;`;
        await client.query(updateQuery, [userId, serverId, JSON.stringify(gameData), JSON.stringify(resources)]);
        await client.query('COMMIT');

        return { success: true, crafted_item: resultItemId, crafted_count: count, resources, game_data: gameData };
    } catch (e) {
        await client.query('ROLLBACK');
        console.error("Ошибка при крафте предмета в SQL:", e);
        return { error: true, message: e.message };
    } finally {
        client.release();
    }
}

/**
 * 4. ПРОДАЖА ПРЕДМЕТОВ ИЗ ИНВЕНТАРЯ ЗА ЗОЛОТО (Гибридный метод: Redis RAM + Postgres Fallback)
 */
async function sellItem(userId, serverId, itemId, count = 1, itemsCatalog) {
    if (count <= 0) return { error: true, message: "Неверное количество для продажи" };

    const itemProto = itemsCatalog?.[itemId];
    const sellPrice = itemProto?.sell_price || 10;

    // ------------------------------------------------------------------------
    // ЭШЕЛОН 1: ОПЕРАЦИЯ ПРОДАЖИ В ОПЕРАТИВНОЙ ПАМЯТИ REDIS
    // ------------------------------------------------------------------------
    if (redisClient.isOpen && redisClient.isReady) {
        try {
            let player = await Cache.getPlayer(userId, serverId);
            if (!player) throw new Error("Профиль игрока не найден в кэше Redis");

            if (!player.inventory || (player.inventory[itemId] || 0) < count) {
                return { error: true, message: "Недостаточно предметов для продажи в инвентаре" };
            }

            let resources = player.resources || {};
            player.inventory[itemId] -= count;
            if (player.inventory[itemId] <= 0) delete player.inventory[itemId];

            const goldGained = sellPrice * count;
            resources.gold = (parseInt(resources.gold) || 0) + goldGained;

            player.resources = resources;
            await Cache.setPlayer(userId, serverId, player);

            return { success: true, resources, game_data: player };

        } catch (cacheErr) {
            console.warn('[ItemDB:Sell] Сбой Redis, проваливаюсь в Postgres Fallback:', cacheErr);
        }
    }

    // ------------------------------------------------------------------------
    // ЭШЕЛОН 2: ТВОЙ СТАРЫЙ SQL FALLBACK ПРОДАЖИ ПРЕДМЕТОВ В СУБД
    // ------------------------------------------------------------------------
    const client = await global.pool.connect();
    try {
        await client.query('BEGIN');
        const { rows } = await client.query(
            `SELECT game_data, resources FROM player_server_profiles WHERE id = $1 AND server_id = $2 FOR UPDATE;`,
            [userId, serverId]
        );
        if (rows.length === 0) throw new Error("Профиль не найден");

        let gameData = rows[0].game_data || {};
        let resources = rows[0].resources || {};
        let inventory = gameData.inventory || {};

        if ((inventory[itemId] || 0) < count) throw new Error("Недостаточно предметов для продажи");

        inventory[itemId] -= count;
        if (inventory[itemId] <= 0) delete inventory[itemId];

        const goldGained = sellPrice * count;
        resources.gold = (parseInt(resources.gold) || 0) + goldGained;

        gameData.inventory = inventory;

        const updateQuery = `UPDATE player_server_profiles SET game_data = $3, resources = $4 WHERE id = $1 AND server_id = $2;`;
        await client.query(updateQuery, [userId, serverId, JSON.stringify(gameData), JSON.stringify(resources)]);
        await client.query('COMMIT');

        return { success: true, resources, game_data: gameData };
    } catch (e) {
        await client.query('ROLLBACK');
        console.error("Ошибка при продаже предмета в SQL:", e);
        return { error: true, message: e.message };
    } finally {
        client.release();
    }
}

/**
 * 5. ГЛУБОКИЙ РЕКУРСИВНЫЙ АВТОКРАФТ ПРЕДМЕТОВ СНИЗУ ВВЕРХ (Гибридный метод)
 */
async function autoCraftItem(userId, serverId, recipeId, count = 1, recipesCatalog) {
    if (count <= 0) return { error: true, message: "Неверное количество для крафта" };

    const startRecipe = recipesCatalog[recipeId];
    if (!startRecipe) return { error: true, message: "Рецепт не найден" };

    // ------------------------------------------------------------------------
    // ЭШЕЛОН 1: РЕКУРСИВНЫЙ РАСЧЕТ И СПИСАНИЕ В ОПЕРАТИВНОЙ ПАМЯТИ REDIS
    // ------------------------------------------------------------------------
    if (redisClient.isOpen && redisClient.isReady) {
        try {
            let player = await Cache.getPlayer(userId, serverId);
            if (!player) throw new Error("Профиль игрока не найден в кэше Redis");

            let resources = player.resources || {};
            if (!player.inventory) player.inventory = {};

            let totalGoldCost = 0;

            // Строим карту: какой itemId создается каким рецептом
            const itemToRecipeMap = {};
            Object.entries(recipesCatalog).forEach(([rId, rData]) => {
                if (rData.result?.itemId) itemToRecipeMap[rData.result.itemId] = rData;
            });

            // Внутренний рекурсивный движок списания по объекту в RAM
            function resolveCraft(targetItemId, neededAmount) {
                const availableInStock = player.inventory[targetItemId] || 0;

                if (availableInStock >= neededAmount) {
                    player.inventory[targetItemId] -= neededAmount;
                    if (player.inventory[targetItemId] <= 0) delete player.inventory[targetItemId];
                    return;
                }

                let remainingToCraft = neededAmount - availableInStock;
                delete player.inventory[targetItemId];

                const subRecipe = itemToRecipeMap[targetItemId];
                if (!subRecipe) {
                    throw new Error(`Недостаточно базового материала: ${targetItemId}. Нужно еще: ${remainingToCraft}`);
                }

                totalGoldCost += (subRecipe.gold_cost || 0) * remainingToCraft;

                if (subRecipe.ingredients) {
                    Object.entries(subRecipe.ingredients).forEach(([ingredientMatId, amountForOne]) => {
                        resolveCraft(ingredientMatId, amountForOne * remainingToCraft);
                    });
                }
            }

            const finalItemId = startRecipe.result.itemId;
            const finalAmountToCreate = (startRecipe.result.amount || 1) * count;

            // Запуск рекурсии прямо по живому объекту в памяти
            resolveCraft(finalItemId, finalAmountToCreate);

            // Проверяем суммированное золото
            const playerGold = parseInt(resources.gold) || 0;
            if (playerGold < totalGoldCost) {
                throw new Error(`Недостаточно золота для автокрафта. Суммарно нужно: ${totalGoldCost}`);
            }

            // Применяем изменения
            resources.gold = playerGold - totalGoldCost;
            player.inventory[finalItemId] = (player.inventory[finalItemId] || 0) + finalAmountToCreate;
            player.resources = resources;

            // Сохраняем стейт в Редис
            await Cache.setPlayer(userId, serverId, player);

            return {
                success: true,
                crafted_item: finalItemId,
                crafted_count: finalAmountToCreate,
                resources,
                game_data: player
            };

        } catch (cacheErr) {
            console.warn('[ItemDB:AutoCraft] Сбой Redis, проваливаюсь в Postgres Fallback:', cacheErr);
        }
    }

    // ------------------------------------------------------------------------
    // ЭШЕЛОН 2: ТВОЙ СТАРЫЙ ОРИГИНАЛЬНЫЙ РЕКУРСИВНЫЙ SQL FALLBACK ДЛЯ СУБД
    // ------------------------------------------------------------------------
    const client = await global.pool.connect();
    try {
        await client.query('BEGIN');

        const { rows } = await client.query(
            `SELECT game_data, resources FROM player_server_profiles WHERE id = $1 AND server_id = $2 FOR UPDATE;`,
            [userId, serverId]
        );
        if (rows.length === 0) throw new Error("Профиль не найден");

        let gameData = rows.game_data || {};
        let resources = rows.resources || {};
        let workingInventory = JSON.parse(JSON.stringify(gameData.inventory || {}));
        let totalGoldCost = 0;

        const itemToRecipeMap = {};
        Object.entries(recipesCatalog).forEach(([rId, rData]) => {
            if (rData.result?.itemId) itemToRecipeMap[rData.result.itemId] = rData;
        });

        function resolveCraftSQL(targetItemId, neededAmount) {
            const availableInStock = workingInventory[targetItemId] || 0;

            if (availableInStock >= neededAmount) {
                workingInventory[targetItemId] -= neededAmount;
                if (workingInventory[targetItemId] <= 0) delete workingInventory[targetItemId];
                return;
            }

            let remainingToCraft = neededAmount - availableInStock;
            delete workingInventory[targetItemId];

            const subRecipe = itemToRecipeMap[targetItemId];
            if (!subRecipe) throw new Error(`Недостаточно базового материала: ${targetItemId}. Требуется еще: ${remainingToCraft}`);

            totalGoldCost += (subRecipe.gold_cost || 0) * remainingToCraft;

            if (subRecipe.ingredients) {
                Object.entries(subRecipe.ingredients).forEach(([ingredientMatId, amountForOne]) => {
                    resolveCraftSQL(ingredientMatId, amountForOne * remainingToCraft);
                });
            }
        }

        const finalItemId = startRecipe.result.itemId;
        const finalAmountToCreate = (startRecipe.result.amount || 1) * count;

        resolveCraftSQL(finalItemId, finalAmountToCreate);

        const playerGold = parseInt(resources.gold) || 0;
        if (playerGold < totalGoldCost) throw new Error(`Недостаточно золота для автокрафта. Суммарно нужно: ${totalGoldCost}`);

        resources.gold = playerGold - totalGoldCost;
        workingInventory[finalItemId] = (workingInventory[finalItemId] || 0) + finalAmountToCreate;
        gameData.inventory = workingInventory;

        const updateQuery = `UPDATE player_server_profiles SET game_data = $3, resources = $4 WHERE id = $1 AND server_id = $2;`;
        await client.query(updateQuery, [userId, serverId, JSON.stringify(gameData), JSON.stringify(resources)]);
        await client.query('COMMIT');

        return { success: true, crafted_item: finalItemId, crafted_count: finalAmountToCreate, resources, game_data: gameData };

    } catch (e) {
        await client.query('ROLLBACK');
        console.error("Критическая ошибка автокрафта предметов в SQL:", e);
        return { error: true, message: e.message };
    } finally {
        client.release();
    }
}

/**
 * 6. ОТКРЫТИЕ СУНДУКОВ С НАЧИСЛЕНИЕМ НАГРАД (Гибридный метод)
 */
async function useItemChest(userId, serverId, itemId, count = 1, chestCatalog) {
    if (count <= 0) return { error: true, message: "Неверное количество" };

    const chestProto = chestCatalog[itemId];
    if (!chestProto) return { error: true, message: "Конфиг сундука не найден" };

    // ------------------------------------------------------------------------
    // ЭШЕЛОН 1: ОПЕРАЦИЯ ОТКРЫТИЯ В ОПЕРАТИВНОЙ ПАМЯТИ REDIS
    // ------------------------------------------------------------------------
    if (redisClient.isOpen && redisClient.isReady) {
        try {
            let player = await Cache.getPlayer(userId, serverId);
            if (!player) throw new Error("Профиль игрока не найден в кэше Redis");

            let resources = player.resources || {};
            if (!player.inventory || !player.inventory[itemId] || player.inventory[itemId] < count) {
                return { error: true, message: `Недостаточно предметов. У вас: ${player.inventory?.[itemId] || 0}, требуется: ${count}` };
            }

            // Списываем сундуки в RAM
            player.inventory[itemId] -= count;
            if (player.inventory[itemId] <= 0) delete player.inventory[itemId];

            // Начисляем умноженные награды в RAM
            let rewardsGained = {};
            if (chestProto.rewards) {
                Object.entries(chestProto.rewards).forEach(([resKey, amount]) => {
                    const totalAmount = amount * count;
                    resources[resKey] = (parseInt(resources[resKey]) || 0) + totalAmount;
                    rewardsGained[resKey] = totalAmount;
                });
            }

            player.resources = resources;
            await Cache.setPlayer(userId, serverId, player);

            return { success: true, rewardsGained, resources, game_data: player };

        } catch (cacheErr) {
            console.warn('[ItemDB:UseChest] Сбой Redis, проваливаюсь в Postgres Fallback:', cacheErr);
        }
    }

    // ------------------------------------------------------------------------
    // ЭШЕЛОН 2: ТВОЙ СТАРЫЙ ОРИГИНАЛЬНЫЙ SQL FALLBACK ТРАНЗАКЦИИ СУНДУКА
    // ------------------------------------------------------------------------
    const client = await global.pool.connect();
    try {
        await client.query('BEGIN');

        const { rows } = await client.query(
            `SELECT game_data, resources FROM player_server_profiles WHERE id = $1 AND server_id = $2 FOR UPDATE;`,
            [userId, serverId]
        );
        if (rows.length === 0) throw new Error("Профиль не найден");

        let gameData = rows.game_data;
        let resources = rows.resources;
        let inventory = gameData.inventory || {};

        if (!inventory[itemId] || inventory[itemId] < count) {
            throw new Error(`Недостаточно предметов. У вас: ${inventory[itemId] || 0}, требуется: ${count}`);
        }

        // Списываем сундуки из инвентаря СУБД
        inventory[itemId] -= count;
        if (inventory[itemId] <= 0) delete inventory[itemId];
        gameData.inventory = inventory;

        // Начисляем награды, умноженные на количество открываемых сундуков, в resources СУБД
        let rewardsGained = {};
        if (chestProto.rewards) {
            Object.entries(chestProto.rewards).forEach(([resKey, amount]) => {
                const totalAmount = amount * count;
                resources[resKey] = (parseInt(resources[resKey]) || 0) + totalAmount;
                rewardsGained[resKey] = totalAmount;
            });
        }

        const updateQuery = `
            UPDATE player_server_profiles 
            SET game_data = $3, resources = $4, updated_at = CURRENT_TIMESTAMP 
            WHERE id = $1 AND server_id = $2;
        `;
        await client.query(updateQuery, [userId, serverId, JSON.stringify(gameData), JSON.stringify(resources)]);
        await client.query('COMMIT');

        return { success: true, rewardsGained, resources, game_data: gameData };
    } catch (e) {
        await client.query('ROLLBACK');
        console.error("Ошибка при открытии сундука в SQL Fallback:", e);
        return { error: true, message: e.message };
    } finally {
        client.release();
    }
}

module.exports = {
    equipItem,
    autoEquipHero,
    craftItem,
    sellItem,
    autoCraftItem,
    useItemChest
};



// async function purchaseItem(userId, serverId, itemId, costResource, costAmount, count = 1) {
//     if (count <= 0) return { error: true, message: "Неверное количество для покупки" };
//
//     const totalCost = costAmount * count;
//     const client = await global.pool.connect();
//
//     try {
//         await client.query('BEGIN');
//
//         // 1. Проверяем баланс игрока и атомарно списываем ОБЩУЮ стоимость (costAmount * count)
//         const checkAndSpendQuery = `
//             UPDATE player_server_profiles
//             SET resources = resources || jsonb_build_object($3, (resources->>$3)::bigint - $4)
//             WHERE user_id = $1 AND server_id = $2 AND (resources->>$3)::bigint >= $4
//             RETURNING resources;
//         `;
//
//         const spendRes = await client.query(checkAndSpendQuery, [userId, serverId, costResource, totalCost]);
//
//         if (spendRes.rows.length === 0) {
//             await client.query('ROLLBACK');
//             return { error: true, message: "Недостаточно ресурсов для покупки" };
//         }
//
//         // 2. Добавляем предмет в плоский объект inventory прямо внутри game_data
//         // Запрос прибавит переданное количество (count) к текущему стаку предмета itemId
//         const updateDataQuery = `
//             UPDATE player_server_profiles
//             SET game_data = jsonb_set(
//                 game_data,
//                 '{inventory}',
//                 COALESCE(game_data->'inventory', '{}'::jsonb) ||
//                 jsonb_build_object($3, COALESCE((game_data->'inventory'->>$3)::int, 0) + $4)
//             )
//             WHERE user_id = $1 AND server_id = $2
//             RETURNING game_data;
//         `;
//
//         const dataRes = await client.query(updateDataQuery, [userId, serverId, itemId, count]);
//         await client.query('COMMIT');
//
//         return {
//             success: true,
//             current_resources: spendRes.rows[0].resources,
//             current_game_data: dataRes.rows[0].game_data
//         };
//
//     } catch (e) {
//         await client.query('ROLLBACK');
//         console.error("Критическая ошибка при покупке предмета:", e);
//         return { error: true, message: "Transaction failed" };
//     } finally {
//         client.release(); // Возвращаем клиента в пул соединений
//     }
// }
//
// async function equipItem(userId, serverId, gameId, heroInstId, itemId, slotId) {
//     const client = await global.pool.connect();
//     try {
//         await client.query('BEGIN');
//
//         // 1. Получаем текущую game_data с блокировкой строки
//         const selectQuery = `SELECT game_data FROM player_server_profiles WHERE user_id = $1 AND server_id = $2 FOR UPDATE;`;
//         const { rows } = await client.query(selectQuery, [userId, serverId]);
//         if (rows.length === 0) throw new Error("Профиль не найден");
//
//         let gameData = rows[0].game_data; // Исправлено получение первой строки
//         let inventory = gameData.inventory || {};
//         let heroes = gameData.heroes || [];
//
//         // Ищем героя по его уникальному инстанс-айди
//         const hero = heroes.find(h => h.instance_id === heroInstId);
//         if (!hero) throw new Error("Герой не найден");
//         if (!hero.equipped) hero.equipped = {};
//
//         // Запоминаем, что СЕЙЧАС надето на герое в этом слоте
//         const oldEquippedItemId = hero.equipped[slotId];
//
//         if (itemId) {
//             // --- ЛОГИКА НАДЕВАНИЯ НОВОЙ ВЕЩИ ---
//             if (oldEquippedItemId === itemId) {
//                 await client.query('ROLLBACK');
//                 return { success: true, message: "Этот предмет уже надет", game_data: gameData };
//             }
//
//             // Проверяем наличие в сумке
//             const currentStock = inventory[itemId] || 0;
//             if (currentStock <= 0) {
//                 throw new Error(`Предмета ${itemId} нет в инвентаре`);
//             }
//
//             // Если на герое уже была шмотка — возвращаем её в сумку (+1)
//             if (oldEquippedItemId) {
//                 inventory[oldEquippedItemId] = (inventory[oldEquippedItemId] || 0) + 1;
//             }
//
//             // Забираем новую шмотку из сумки (-1)
//             inventory[itemId] = currentStock - 1;
//             if (inventory[itemId] <= 0) delete inventory[itemId];
//
//             // Прописываем вещь герою для getHeroRating
//             hero.equipped[slotId] = itemId;
//
//         } else {
//             // --- ЛОГИКА СНЯТИЯ ТЕКУЩЕЙ ВЕЩИ ---
//             if (!oldEquippedItemId) {
//                 throw new Error("В этом слоте у героя ничего не надето");
//             }
//
//             // Возвращаем снятую вещь в инвентарь (+1)
//             inventory[oldEquippedItemId] = (inventory[oldEquippedItemId] || 0) + 1;
//
//             // Освобождаем слот у героя
//             hero.equipped[slotId] = null;
//         }
//
//         gameData.inventory = inventory;
//         gameData.heroes = heroes;
//
//         // 2. Сохраняем промежуточную game_data перед пересчетом БР
//         const updateQuery = `
//             UPDATE player_server_profiles
//             SET game_data = $3, updated_at = CURRENT_TIMESTAMP
//             WHERE user_id = $1 AND server_id = $2;
//         `;
//         await client.query(updateQuery, [userId, serverId, JSON.stringify(gameData)]);
//         await client.query('COMMIT');
//
//         // 3. Запускаем полный пересчет БР (обновит БР героя внутри JSONB и БР аккаунта в базе)
//         const newPower = await recalculateAndSaveCombatPower(userId, serverId, gameId);
//
//         // Получаем финальные обновленные данные для отправки клиенту
//         const finalQuery = `SELECT game_data FROM player_server_profiles WHERE user_id = $1 AND server_id = $2;`;
//         const { rows: finalRows } = await global.pool.query(finalQuery, [userId, serverId]);
//
//         return { success: true, combat_power: newPower, game_data: finalRows[0].game_data };
//
//     } catch (e) {
//         await client.query('ROLLBACK');
//         console.error("Ошибка при экипировке предмета:", e);
//         return { error: true, message: e.message };
//     } finally {
//         client.release(); // Возвращаем клиента в пул соединений
//     }
// }
//
// async function autoEquipHero(userId, serverId, gameId, heroInstId) {
//     const GameConfig = gamesConfigDB[gameId];
//     if (!GameConfig) return { error: true, message: "Конфиг игры не найден" };
//     const GameContext = { config: GameConfig };
//
//     const client = await global.pool.connect();
//     try {
//         await client.query('BEGIN');
//
//         // 1. Получаем текущую game_data с блокировкой строки
//         const selectQuery = `SELECT game_data FROM player_server_profiles WHERE user_id = $1 AND server_id = $2 FOR UPDATE;`;
//         const { rows } = await client.query(selectQuery, [userId, serverId]);
//         if (rows.length === 0) throw new Error("Профиль не найден");
//
//         let gameData = rows[0].game_data; // Исправлено получение первой строки
//         let inventory = gameData.inventory || {};
//         let heroes = gameData.heroes || [];
//
//         // Ищем героя
//         const hero = heroes.find(h => h.instance_id === heroInstId);
//         if (!hero) throw new Error("Герой не найден");
//         if (!hero.equipped) hero.equipped = {};
//
//         // Получаем прототип героя для сбора доступных слотов
//         const heroPrototype = GameConfig.catalog?.heroes?.[hero.hero_id];
//         if (!heroPrototype) throw new Error("Прототип героя не найден в конфиге");
//
//         const baseSlots = heroPrototype.inventory_slots || [];
//         const extraSlots = heroPrototype.extra_inventory_slots || [];
//         const allHeroSlots = [...baseSlots, ...extraSlots];
//
//         // Делаем виртуальный слепок сумки, чтобы шмотки не «клонировались» во все слоты сразу
//         let virtualInventory = { ...inventory };
//         let wasAnyItemChanged = false;
//
//         // Перебираем слоты
//         for (const slotId of allHeroSlots) {
//             const oldEquippedItemId = hero.equipped[slotId];
//
//             // Фильтруем вещи в инвентаре, подходящие под текущий тип слота
//             const candidateItemIds = Object.keys(virtualInventory).filter(itemId => {
//                 const itemProto = GameConfig.catalog?.items?.[itemId];
//                 return itemProto && itemProto.slotId === slotId;
//             });
//
//             if (candidateItemIds.length === 0) continue;
//
//             // Сортируем подходящие вещи по их БР (от лучшего к худшему)
//             candidateItemIds.sort((a, b) => getItemRating(b, GameContext) - getItemRating(a, GameContext));
//             const bestItemId = candidateItemIds[0];
//
//             const bestItemPower = getItemRating(bestItemId, GameContext);
//             const currentItemPower = oldEquippedItemId ? getItemRating(oldEquippedItemId, GameContext) : -1;
//
//             // Если вещь из сумки эффективнее надетой — производим замену
//             if (bestItemPower > currentItemPower) {
//                 wasAnyItemChanged = true;
//
//                 // Возвращаем старую вещь игроку
//                 if (oldEquippedItemId) {
//                     virtualInventory[oldEquippedItemId] = (virtualInventory[oldEquippedItemId] || 0) + 1;
//                 }
//
//                 // Списываем новую вещь
//                 virtualInventory[bestItemId] -= 1;
//                 if (virtualInventory[bestItemId] <= 0) delete virtualInventory[bestItemId];
//
//                 // Фиксируем шмотку на герое
//                 hero.equipped[slotId] = bestItemId;
//             }
//         }
//
//         // Если улучшений не найдено, закрываем транзакцию без перезаписи
//         if (!wasAnyItemChanged) {
//             await client.query('ROLLBACK');
//             return { success: true, message: "На герое уже надето лучшее снаряжение", game_data: gameData };
//         }
//
//         gameData.inventory = virtualInventory;
//         gameData.heroes = heroes;
//
//         // 2. Записываем обновленные массивы в базу
//         const updateQuery = `
//             UPDATE player_server_profiles
//             SET game_data = $3, updated_at = CURRENT_TIMESTAMP
//             WHERE user_id = $1 AND server_id = $2;
//         `;
//         await client.query(updateQuery, [userId, serverId, JSON.stringify(gameData)]);
//         await client.query('COMMIT');
//
//         // 3. Вызываем полный пересчет БР (синхронизирует статы героя и общую силу игрока)
//         const newPower = await recalculateAndSaveCombatPower(userId, serverId, gameId);
//
//         // Получаем чистый финальный объект данных
//         const finalQuery = `SELECT game_data FROM player_server_profiles WHERE user_id = $1 AND server_id = $2;`;
//         const { rows: finalRows } = await global.pool.query(finalQuery, [userId, serverId]);
//
//         return { success: true, combat_power: newPower, game_data: finalRows[0].game_data };
//
//     } catch (e) {
//         await client.query('ROLLBACK');
//         console.error("Ошибка при автоэкипировке героя:", e);
//         return { error: true, message: e.message };
//     } finally {
//         client.release(); // Возвращаем клиента в пул соединений
//     }
// }
//
// async function sellItem(userId, serverId, itemId, count = 1, itemCatalog) {
//     if (count <= 0) return { error: true, message: "Неверное количество для продажи" };
//
//     const client = await global.pool.connect();
//     try {
//         await client.query('BEGIN');
//
//         // Блокируем строку игрока для безопасного обновления
//         const { rows } = await client.query(
//             `SELECT game_data, resources FROM player_server_profiles WHERE user_id = $1 AND server_id = $2 FOR UPDATE;`,
//             [userId, serverId]
//         );
//         if (rows.length === 0) throw new Error("Профиль не найден");
//
//         let gameData = rows[0].game_data;
//         let resources = rows[0].resources;
//         let inventory = gameData.inventory || {};
//
//         // Проверяем, есть ли у игрока столько предметов
//         const currentCount = inventory[itemId] || 0;
//         if (currentCount < count) {
//             throw new Error(`Недостаточно предметов. У вас: ${currentCount}, требуется: ${count}`);
//         }
//
//         // Считаем золото за продажу всей пачки
//         const proto = itemCatalog[itemId];
//         const goldGained = (proto?.sell_price || 10) * count;
//
//         // Минусуем из инвентаря
//         inventory[itemId] = currentCount - count;
//         if (inventory[itemId] <= 0) delete inventory[itemId]; // Если 0 — удаляем ключ полностью
//
//         // Начисляем золото на баланс
//         gameData.inventory = inventory;
//         resources.gold = (parseInt(resources.gold) || 0) + goldGained;
//
//         // Записываем всё обратно в БД
//         const updateQuery = `
//             UPDATE player_server_profiles
//             SET game_data = $3, resources = $4, updated_at = CURRENT_TIMESTAMP
//             WHERE user_id = $1 AND server_id = $2;
//         `;
//         await client.query(updateQuery, [userId, serverId, JSON.stringify(gameData), JSON.stringify(resources)]);
//         await client.query('COMMIT');
//
//         return { success: true, goldGained, resources, game_data: gameData };
//     } catch (e) {
//         await client.query('ROLLBACK');
//         console.error("Ошибка при продаже предмета:", e);
//         return { error: true, message: e.message };
//     } finally {
//         client.release();
//     }
// }
//
// async function useItemChest(userId, serverId, itemId, count = 1, chestCatalog) {
//     if (count <= 0) return { error: true, message: "Неверное количество" };
//
//     const chestProto = chestCatalog[itemId];
//     if (!chestProto) return { error: true, message: "Конфиг сундука не найден" };
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
//         let inventory = gameData.inventory || {};
//
//         if (!inventory[itemId] || inventory[itemId] < count) {
//             throw new Error(`Недостаточно предметов. У вас: ${inventory[itemId] || 0}, требуется: ${count}`);
//         }
//
//         // Списываем сундуки
//         inventory[itemId] -= count;
//         if (inventory[itemId] <= 0) delete inventory[itemId];
//         gameData.inventory = inventory;
//
//         // Начисляем награды, умноженные на количество открываемых сундуков
//         let rewardsGained = {};
//         if (chestProto.rewards) {
//             Object.entries(chestProto.rewards).forEach(([resKey, amount]) => {
//                 const totalAmount = amount * count;
//                 resources[resKey] = (parseInt(resources[resKey]) || 0) + totalAmount;
//                 rewardsGained[resKey] = totalAmount;
//             });
//         }
//
//         const updateQuery = `
//             UPDATE player_server_profiles
//             SET game_data = $3, resources = $4, updated_at = CURRENT_TIMESTAMP
//             WHERE user_id = $1 AND server_id = $2;
//         `;
//         await client.query(updateQuery, [userId, serverId, JSON.stringify(gameData), JSON.stringify(resources)]);
//         await client.query('COMMIT');
//
//         return { success: true, rewardsGained, resources, game_data: gameData };
//     } catch (e) {
//         await client.query('ROLLBACK');
//         console.error("Ошибка при открытии сундука:", e);
//         return { error: true, message: e.message };
//     } finally {
//         client.release();
//     }
// }
//
// async function craftItem(userId, serverId, recipeId, count = 1, recipesCatalog) {
//     if (count <= 0) return { error: true, message: "Неверное количество для крафта" };
//
//     const recipe = recipesCatalog[recipeId];
//     if (!recipe) return { error: true, message: "Рецепт не найден" };
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
//         // Защита: инициализируем пустой объект, если game_data в БД равен null
//         let gameData = rows[0].game_data || {};
//         let resources = rows[0].resources || {};
//         let inventory = gameData.inventory || {};
//
//         // 1. Проверяем и списываем золото с учетом количества крафтов
//         const totalGoldCost = (recipe.gold_cost || 0) * count;
//         if ((parseInt(resources.gold) || 0) < totalGoldCost) {
//             throw new Error(`Недостаточно золота. Нужно: ${totalGoldCost}`);
//         }
//         resources.gold = (parseInt(resources.gold) || 0) - totalGoldCost;
//
//         // 2. Проверяем и списываем все ингредиенты с учетом количества
//         if (recipe.ingredients) {
//             Object.entries(recipe.ingredients).forEach(([matId, neededAmount]) => {
//                 const totalNeeded = neededAmount * count;
//                 const currentAmount = inventory[matId] || 0;
//                 if (currentAmount < totalNeeded) {
//                     throw new Error(`Недостаточно материала: ${matId}. Нужно: ${totalNeeded}`);
//                 }
//                 inventory[matId] -= totalNeeded;
//                 if (inventory[matId] <= 0) delete inventory[matId];
//             });
//         }
//
//         // 3. ИСПРАВЛЕНО: Зафиксирован camelCase для itemId результирующего предмета в каталоге
//         const resultItemId = recipe.result.itemId;
//         inventory[resultItemId] = (inventory[resultItemId] || 0) + count;
//
//         gameData.inventory = inventory;
//
//         const updateQuery = `
//             UPDATE player_server_profiles
//             SET game_data = $3, resources = $4, updated_at = CURRENT_TIMESTAMP
//             WHERE user_id = $1 AND server_id = $2;
//         `;
//         await client.query(updateQuery, [userId, serverId, JSON.stringify(gameData), JSON.stringify(resources)]);
//         await client.query('COMMIT');
//
//         return {
//             success: true,
//             crafted_item: resultItemId,
//             crafted_count: count,
//             resources,
//             game_data: gameData
//         };
//     } catch (e) {
//         await client.query('ROLLBACK');
//         console.error("Ошибка при крафте предмета:", e);
//         return { error: true, message: e.message };
//     } finally {
//         client.release();
//     }
// }
//
// async function autoCraftItem(userId, serverId, recipeId, count = 1, recipesCatalog) {
//     if (count <= 0) return { error: true, message: "Неверное количество для крафта" };
//
//     const startRecipe = recipesCatalog[recipeId];
//     if (!startRecipe) return { error: true, message: "Рецепт не найден" };
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
//         let gameData = rows[0].game_data || {};
//         let resources = rows[0].resources || {};
//
//         // Клонируем инвентарь для проведения рекурсивных расчетов и списаний
//         let workingInventory = JSON.parse(JSON.stringify(gameData.inventory || {}));
//         let totalGoldCost = 0;
//
//         // Создаем карту соответствия: какой itemId создается каким рецептом
//         const itemToRecipeMap = {};
//         Object.entries(recipesCatalog).forEach(([rId, rData]) => {
//             if (rData.result?.itemId) {
//                 itemToRecipeMap[rData.result.itemId] = rData;
//             }
//         });
//
//         /**
//          * Внутренняя рекурсивная функция сборки дерева предметов
//          */
//         function resolveCraft(targetItemId, neededAmount) {
//             const availableInStock = workingInventory[targetItemId] || 0;
//
//             // Если в рюкзаке уже лежит достаточно готовых вещей (даже промежуточных)
//             if (availableInStock >= neededAmount) {
//                 workingInventory[targetItemId] -= neededAmount;
//                 if (workingInventory[targetItemId] <= 0) delete workingInventory[targetItemId];
//                 return; // Потребность полностью покрыта, выходим из этой ветки рекурсии
//             }
//
//             // Если есть часть готовых, забираем их все, уменьшая остаток для крафта
//             let remainingToCraft = neededAmount;
//             if (availableInStock > 0) {
//                 remainingToCraft -= availableInStock;
//                 delete workingInventory[targetItemId];
//             }
//
//             // Ищем рецепт крафта для этого промежуточного или финального предмета
//             const subRecipe = itemToRecipeMap[targetItemId];
//
//             // Если рецепта нет, а базовых материалов не хватило — сборка невозможна
//             if (!subRecipe) {
//                 throw new Error(`Недостаточно базового материала: ${targetItemId}. Нужно еще: ${remainingToCraft}`);
//             }
//
//             // Суммируем золото за производство текущего шага цепочки сборки
//             totalGoldCost += (subRecipe.gold_cost || 0) * remainingToCraft;
//
//             // Если у рецепта есть ингредиенты, рекурсивно спускаемся к ним на уровень ниже
//             if (subRecipe.ingredients) {
//                 Object.entries(subRecipe.ingredients).forEach(([ingredientMatId, amountForOne]) => {
//                     const totalRequiredForSubCraft = amountForOne * remainingToCraft;
//                     resolveCraft(ingredientMatId, totalRequiredForSubCraft);
//                 });
//             }
//         }
//
//         // Запуск рекурсивного обхода снизу вверх для финального предмета
//         const finalItemId = startRecipe.result.itemId;
//         const finalAmountToCreate = (startRecipe.result.amount || 1) * count;
//
//         resolveCraft(finalItemId, finalAmountToCreate);
//
//         // Проверяем итоговый баланс золота за всю суммированную цепочку ковки
//         const playerGold = parseInt(resources.gold) || 0;
//         if (playerGold < totalGoldCost) {
//             throw new Error(`Недостаточно золота для автокрафта. Суммарно нужно: ${totalGoldCost}`);
//         }
//
//         // Фиксируем списание ресурсов и начисление финального скрафченного предмета
//         resources.gold = playerGold - totalGoldCost;
//         workingInventory[finalItemId] = (workingInventory[finalItemId] || 0) + finalAmountToCreate;
//         gameData.inventory = workingInventory;
//
//         const updateQuery = `
//             UPDATE player_server_profiles
//             SET game_data = $3, resources = $4, updated_at = CURRENT_TIMESTAMP
//             WHERE user_id = $1 AND server_id = $2;
//         `;
//         await client.query(updateQuery, [userId, serverId, JSON.stringify(gameData), JSON.stringify(resources)]);
//         await client.query('COMMIT');
//
//         return {
//             success: true,
//             crafted_item: finalItemId,
//             crafted_count: finalAmountToCreate,
//             resources,
//             game_data: gameData
//         };
//
//     } catch (e) {
//         await client.query('ROLLBACK');
//         console.error("Ошибка при автокрафте предмета:", e);
//         return { error: true, message: e.message };
//     } finally {
//         client.release();
//     }
// }

//
// module.exports = {
//     // purchaseItem,
//     equipItem,
//     autoEquipHero,
//     sellItem,
//     useItemChest,
//     craftItem,
//     autoCraftItem
// };

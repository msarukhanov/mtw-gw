const {getHeroRating, getItemRating, recalculateAndSaveCombatPower} = require('./_shared');
const {gamesConfigDB} = require('./configDB');
const { redisClient } = require('../../redisClient');
const Cache = require('./cacheManager');

function rollWeightedItem(pool) {
    if (!pool || pool.length === 0) return null;
    const totalWeight = pool.reduce((sum, item) => sum + (item.weight || 0), 0);
    let randomNum = Math.random() * totalWeight;

    for (const item of pool) {
        if (randomNum < item.weight) {
            return JSON.parse(JSON.stringify(item)); // Глубокая копия элемента пула
        }
        randomNum -= item.weight;
    }
    return JSON.parse(JSON.stringify(pool[0]));
}

/**
 * Вспомогательная функция: Генерация витрины на основе конфига слотов
 */
function generateShowcase(shopConfig, shopPools) {
    const showcase = [];

    shopConfig.slots.forEach(slot => {
        if (slot.is_random) {
            const pool = shopPools[slot.poolId];
            const rolled = rollWeightedItem(pool);
            if (rolled) {
                showcase.push({
                    slotId: slot.slotId,
                    item_type: rolled.item_type,
                    itemId: rolled.itemId,
                    amount: rolled.amount,
                    cost: rolled.cost,
                    buy_limit: slot.buy_limit,
                    bought_count: 0
                });
            }
        } else {
            showcase.push({
                slotId: slot.slotId,
                item_type: slot.item_type,
                itemId: slot.itemId,
                amount: slot.amount,
                cost: slot.cost,
                old_cost: slot.old_cost || null,
                buy_limit: slot.buy_limit,
                bought_count: 0
            });
        }
    });

    return {
        last_auto_refresh: Date.now(),
        showcase: showcase
    };
}

/**
 * Вспомогательная функция: Начисление купленного товара игроку в зависимости от типа
 */
function awardItem(gameData, resources, itemType, itemId, amount) {
    if (itemType === 'resource') {
        // Начисляем напрямую в плоский объект ресурсов игрока
        const currentRes = parseInt(resources[itemId]) || 0;
        resources[itemId] = currentRes + amount;
    } else {
        // По умолчанию 'item', 'equipment', 'consumable' — кладем в плоский inventory внутри game_data
        if (!gameData.inventory) gameData.inventory = {};
        const currentInv = parseInt(gameData.inventory[itemId]) || 0;
        gameData.inventory[itemId] = currentInv + amount;
    }
}

/**
 * Вспомогательная функция: Запись лога покупки в массив истории игрока
 */
function logShopTransaction(gameData, partnerId, shopId, slotId, slotItem, costResource, costAmount) {
    if (!gameData.shop_history) {
        gameData.shop_history = [];
    }

    // Формируем плоский лог транзакции под требования демо-версии
    gameData.shop_history.push({
        timestamp: Date.now(),
        partnerId: partnerId || "unknown",
        shopId: shopId,
        slotId: slotId,
        itemId: slotItem.itemId,
        item_type: slotItem.item_type,
        amount: slotItem.amount,
        cost_resource: costResource,
        cost_amount: costAmount
    });
}

// --- СЕРВИСНЫЕ МЕТОДЫ ДЛЯ КОНТРОЛЛЕРА ---

// /**
//  * 1. Получить или лениво сгенерировать витрину магазина (с проверкой авто-рефреша по таймеру)
//  */
// async function getOrGenerateShopState(userId, serverId, shopId, shopConfig, shopPools) {
//     const client = await global.pool.connect();
//     try {
//         await client.query('BEGIN');
//
//         // Вытаскиваем уровни игрока и jsonb-поле game_data атомарно с блокировкой
//         const { rows } = await client.query(
//             `SELECT level, game_data FROM player_server_profiles WHERE user_id = $1 AND server_id = $2 FOR UPDATE;`,
//             [userId, serverId]
//         );
//         if (rows.length === 0) {
//             await client.query('ROLLBACK');
//             return { error: true, message: "Профиль игрока не найден" };
//         }
//
//         const player = rows[0];
//         let gameData = player.game_data || {};
//
//         // Проверка уровней доступа (Пункт 7)
//         const reqs = shopConfig.requirements;
//         if (player.level < reqs.player_level || gameData.vip_level < reqs.vip_level) {
//             await client.query('ROLLBACK');
//             return { error: true, is_locked: true, message: `Необходим Ур. ${reqs.player_level} и VIP ${reqs.vip_level}` };
//         }
//
//         if (!gameData.shops_state) gameData.shops_state = {};
//
//         let currentShopState = gameData.shops_state[shopId];
//         const now = Date.now();
//         const autoInterval = shopConfig.refresh_settings?.auto_refresh_interval_ms || 0;
//
//         let needToRoll = false;
//         if (!currentShopState) {
//             needToRoll = true; // Ленивая инициализация при первом заходе
//         } else if (autoInterval > 0 && (now - currentShopState.last_auto_refresh >= autoInterval)) {
//             needToRoll = true; // Истек таймер авто-обновления витрины
//         }
//
//         if (needToRoll) {
//             currentShopState = generateShowcase(shopConfig, shopPools);
//             gameData.shops_state[shopId] = currentShopState;
//
//             // Записываем обновленный game_data обратно в БД
//             await client.query(
//                 `UPDATE player_server_profiles SET game_data = $3, updated_at = CURRENT_TIMESTAMP WHERE user_id = $1 AND server_id = $2;`,
//                 [userId, serverId, JSON.stringify(gameData)]
//             );
//         }
//
//         await client.query('COMMIT');
//         return { success: true, state: currentShopState };
//
//     }
//     catch (e) {
//         await client.query('ROLLBACK');
//         console.error("Ошибка в getOrGenerateShopState:", e);
//         return { error: true, message: e.message };
//     } finally {
//         client.release();
//     }
// }
//
// /**
//  * 2. Принудительный ручной сброс витрины за валюту (алмазы)
//  */
// async function refreshShopManual(userId, serverId, shopId, shopConfig, shopPools) {
//     const costSetting = shopConfig.refresh_settings?.manual_refresh_cost;
//     if (!costSetting) return { error: true, message: "Этот магазин нельзя обновлять вручную" };
//
//     const client = await global.pool.connect();
//     try {
//         await client.query('BEGIN');
//
//         const { rows } = await client.query(
//             `SELECT resources, game_data FROM player_server_profiles WHERE user_id = $1 AND server_id = $2 FOR UPDATE;`,
//             [userId, serverId]
//         );
//         if (rows.length === 0) {
//             await client.query('ROLLBACK');
//             return { error: true, message: "Профиль не найден" };
//         }
//
//         let resources = rows[0].resources || {};
//         let gameData = rows[0].game_data || {};
//
//         const currentBalance = parseInt(resources[costSetting.resource]) || 0;
//         if (currentBalance < costSetting.amount) {
//             await client.query('ROLLBACK');
//             return { error: true, message: `Недостаточно ресурсов ${costSetting.resource}` };
//         }
//
//         // Списываем плату за ручной рефреш
//         resources[costSetting.resource] = currentBalance - costSetting.amount;
//
//         // Генерируем новую витрину и обновляем таймер (сбрасываем его на текущее время)
//         if (!gameData.shops_state) gameData.shops_state = {};
//         const newShowcase = generateShowcase(shopConfig, shopPools);
//         gameData.shops_state[shopId] = newShowcase;
//
//         await client.query(
//             `UPDATE player_server_profiles SET resources = $3, game_data = $4, updated_at = CURRENT_TIMESTAMP WHERE user_id = $1 AND server_id = $2;`,
//             [userId, serverId, JSON.stringify(resources), JSON.stringify(gameData)]
//         );
//
//         await client.query('COMMIT');
//         return { success: true, resources, state: newShowcase };
//
//     } catch (e) {
//         await client.query('ROLLBACK');
//         console.error("Ошибка в refreshShopManual:", e);
//         return { error: true, message: e.message };
//     } finally {
//         client.release();
//     }
// }
//
// /**
//  * 3. Покупка товара за внутриигровую виртуальную валюту (золото, алмазы и др.)
//  */
// async function purchaseItemVirtual(userId, serverId, shopId, slotId, partnerId, shopConfig) {
//     const client = await global.pool.connect();
//     try {
//         await client.query('BEGIN');
//
//         // Блокируем строку профиля для предотвращения Race Conditions
//         const { rows } = await client.query(
//             `SELECT resources, game_data FROM player_server_profiles WHERE user_id = $1 AND server_id = $2 FOR UPDATE;`,
//             [userId, serverId]
//         );
//         if (rows.length === 0) {
//             await client.query('ROLLBACK');
//             return { error: true, message: "Профиль игрока не найден" };
//         }
//
//         let resources = rows[0].resources || {};
//         let gameData = rows[0].game_data || {};
//
//         // 1. Проверяем, сгенерирован ли магазин у игрока
//         const shopState = gameData.shops_state?.[shopId];
//         if (!shopState || !shopState.showcase) {
//             await client.query('ROLLBACK');
//             return { error: true, message: "Витрина магазина не инициализирована. Обновите страницу" };
//         }
//
//         // 2. Находим нужный слот на витрине игрока
//         const slotItem = shopState.showcase.find(s => s.slotId === slotId);
//         if (!slotItem) {
//             await client.query('ROLLBACK');
//             return { error: true, message: "Товар не найден на текущей витрине" };
//         }
//
//         // 3. Проверяем лимиты покупки (Sold Out)
//         if (slotItem.bought_count >= slotItem.buy_limit) {
//             await client.query('ROLLBACK');
//             return { error: true, message: "Товар полностью распродан (Sold Out)" };
//         }
//
//         // 4. Проверяем валюту (защита: метод только для виртуальной валюты)
//         const costResource = slotItem.cost.resource;
//         const costAmount = slotItem.cost.amount;
//         if (costResource === 'usd') {
//             await client.query('ROLLBACK');
//             return { error: true, message: "Этот товар покупается только за реальные деньги" };
//         }
//
//         // 5. Проверяем баланс игрока и списываем ресурсы
//         const playerBalance = parseInt(resources[costResource]) || 0;
//         if (playerBalance < costAmount) {
//             await client.query('ROLLBACK');
//             return { error: true, message: `Недостаточно ресурсов: ${costResource}` };
//         }
//         resources[costResource] = playerBalance - costAmount;
//
//         // 6. Увеличиваем счетчик покупок на витрине игрока
//         slotItem.bought_count += 1;
//
//         // 7. Выдаем награду игроку
//         awardItem(gameData, resources, slotItem.item_type, slotItem.itemId, slotItem.amount);
//
//         // 8. Пишем лог покупки в массив игрока
//         logShopTransaction(gameData, partnerId, shopId, slotId, slotItem, costResource, costAmount);
//
//         // Сохраняем все изменения в базу данных
//         await client.query(
//             `UPDATE player_server_profiles SET resources = $3, game_data = $4, updated_at = CURRENT_TIMESTAMP WHERE user_id = $1 AND server_id = $2;`,
//             [userId, serverId, JSON.stringify(resources), JSON.stringify(gameData)]
//         );
//
//         await client.query('COMMIT');
//
//         return {
//             success: true,
//             resources,
//             state: shopState // Возвращаем обновленное состояние магазина (где bought_count изменился)
//         };
//
//     } catch (e) {
//         await client.query('ROLLBACK');
//         console.error("Критическая ошибка при покупке товара:", e);
//         return { error: true, message: e.message };
//     } finally {
//         client.release();
//     }
// }
//
// /**
//  * 4. Заглушка покупки за реальные деньги ($)
//  */
// async function purchaseItemCashFake(userId, serverId, shopId, slotId, partnerId, shopConfig) {
//     const client = await global.pool.connect();
//     try {
//         await client.query('BEGIN');
//
//         const { rows } = await client.query(
//             `SELECT resources, game_data FROM player_server_profiles WHERE user_id = $1 AND server_id = $2 FOR UPDATE;`,
//             [userId, serverId]
//         );
//         if (rows.length === 0) {
//             await client.query('ROLLBACK');
//             return { error: true, message: "Профиль игрока не найден" };
//         }
//
//         let resources = rows[0].resources || {};
//         let gameData = rows[0].game_data || {};
//
//         const shopState = gameData.shops_state?.[shopId];
//         if (!shopState || !shopState.showcase) {
//             await client.query('ROLLBACK');
//             return { error: true, message: "Витрина магазина не найдена" };
//         }
//
//         const slotItem = shopState.showcase.find(s => s.slotId === slotId);
//         if (!slotItem) {
//             await client.query('ROLLBACK');
//             return { error: true, message: "Товар не найден" };
//         }
//
//         if (slotItem.bought_count >= slotItem.buy_limit) {
//             await client.query('ROLLBACK');
//             return { error: true, message: "Товар полностью распродан (Sold Out)" };
//         }
//
//         // Проверяем, что товар действительно за реальные деньги
//         const costResource = slotItem.cost.resource;
//         const costAmount = slotItem.cost.amount;
//         if (costResource !== 'usd') {
//             await client.query('ROLLBACK');
//             return { error: true, message: "Этот товар покупается за внутриигровую валюту" };
//         }
//
//         // --- ИМИТАЦИЯ УСПЕШНОЙ ОПЛАТЫ ---
//         // Пропускаем списание баланса ресурсов, так как оплата "прошла" во внешней системе
//         slotItem.bought_count += 1;
//
//         // Выдаем награду
//         awardItem(gameData, resources, slotItem.item_type, slotItem.itemId, slotItem.amount);
//
//         // Пишем лог транзакции (включая валюту 'usd' и partnerId)
//         logShopTransaction(gameData, partnerId, shopId, slotId, slotItem, costResource, costAmount);
//
//         await client.query(
//             `UPDATE player_server_profiles SET resources = $3, game_data = $4, updated_at = CURRENT_TIMESTAMP WHERE user_id = $1 AND server_id = $2;`,
//             [userId, serverId, JSON.stringify(resources), JSON.stringify(gameData)]
//         );
//
//         await client.query('COMMIT');
//
//         return {
//             success: true,
//             resources,
//             state: shopState
//         };
//
//     } catch (e) {
//         await client.query('ROLLBACK');
//         console.error("Ошибка в функции-заглушке покупки за реал:", e);
//         return { error: true, message: e.message };
//     } finally {
//         client.release();
//     }
// }




/**
 * 1. ИНИЦИАЛИЗАЦИЯ И ПОЛУЧЕНИЕ ВИТРИНЫ (Гибридный метод)
 */
async function getOrGenerateShopState(userId, serverId, shopId, shopConfig, shopPools) {
    const now = Date.now();
    const autoInterval = shopConfig.refresh_settings?.auto_refresh_interval_ms || 0;

    // ------------------------------------------------------------------------
    // ЭШЕЛОН 1: РАБОТА В ОПЕРАТИВНОЙ ПАМЯТИ REDIS (БЫСТРЫЙ ПУТЬ)
    // ------------------------------------------------------------------------
    if (redisClient.isOpen && redisClient.isReady) {
        try {
            let player = await Cache.getPlayer(userId, serverId);
            if (!player) throw new Error("Профиль игрока не найден в кэше Redis");

            // Проверка требований по уровню и VIP-статусу прямо в RAM
            const reqs = shopConfig.requirements;
            if (player.level < reqs.player_level || player.vip_level < reqs.vip_level) {
                return { is_locked: true, message: `Необходим Ур. ${reqs.player_level} и VIP ${reqs.vip_level}` };
            }

            if (!player.shopsState) player.shopsState = player.shops_state || {};

            let currentShopState = player.shopsState[shopId];
            let needToRoll = false;

            if (!currentShopState) {
                needToRoll = true;
            } else if (autoInterval > 0 && (now - currentShopState.last_auto_refresh >= autoInterval)) {
                needToRoll = true;
            }

            if (needToRoll) {
                currentShopState = generateShowcase(shopConfig, shopPools);
                player.shopsState[shopId] = currentShopState;
                player.shops_state = player.shopsState; // Синхронизируем оба написания key

                // Пишем в Редис и взводим dirty-флаг для lazyWrite
                await Cache.setPlayer(player);
            }

            return { success: true, state: currentShopState };

        } catch (cacheErr) {
            console.warn('[ShopDB:GetState] Сбой Redis, проваливаюсь в Postgres Fallback:', cacheErr);
        }
    }

    // ------------------------------------------------------------------------
    // ЭШЕЛОН 2: ТВОЙ СТАРЫЙ SQL FALLBACK С ТРАНЗАКЦИЕЙ И БЛОКИРОВКОЙ СУБД
    // ------------------------------------------------------------------------
    const client = await global.pool.connect();
    try {
        await client.query('BEGIN');

        const { rows } = await client.query(
            `SELECT level, game_data FROM player_server_profiles WHERE id = $1 AND server_id = $2 FOR UPDATE;`,
            [userId, serverId]
        );
        if (rows.length === 0) {
            await client.query('ROLLBACK');
            return { error: true, message: "Профиль игрока не найден" };
        }

        const playerRow = rows[0];
        let gameData = playerRow.game_data || {};

        const reqs = shopConfig.requirements;
        if (playerRow.level < reqs.player_level || gameData.vip_level < reqs.vip_level) {
            await client.query('ROLLBACK');
            return { is_locked: true, message: `Необходим Ур. ${reqs.player_level} и VIP ${reqs.vip_level}` };
        }

        if (!gameData.shops_state) gameData.shops_state = {};

        let currentShopState = gameData.shops_state[shopId];
        let needToRoll = false;

        if (!currentShopState) {
            needToRoll = true;
        } else if (autoInterval > 0 && (now - currentShopState.last_auto_refresh >= autoInterval)) {
            needToRoll = true;
        }

        if (needToRoll) {
            currentShopState = generateShowcase(shopConfig, shopPools);
            gameData.shops_state[shopId] = currentShopState;

            await client.query(
                `UPDATE player_server_profiles SET game_data = $3, updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND server_id = $2;`,
                [userId, serverId, JSON.stringify(gameData)]
            );
        }

        await client.query('COMMIT');
        return { success: true, state: currentShopState };

    } catch (e) {
        await client.query('ROLLBACK');
        console.error("Ошибка в SQL getOrGenerateShopState:", e);
        return { error: true, message: e.message };
    } finally {
        client.release();
    }
}

/**
 * 2. ПЛАТНОЕ РУЧНОЕ ОБНОВЛЕНИЕ ВИТРИНЫ ЗА АЛМАЗЫ (Гибридный метод)
 */
async function refreshShopManual(userId, serverId, shopId, shopConfig, shopPools) {
    const refreshCost = shopConfig.refresh_settings?.manual_refresh_cost;
    if (!refreshCost) return { error: true, message: "Ручное обновление недоступно для этого магазина" };

    // ------------------------------------------------------------------------
    // ЭШЕЛОН 1: РУЧНОЙ СБРОС В ОПЕРАТИВНОЙ ПАМЯТИ REDIS
    // ------------------------------------------------------------------------
    if (redisClient.isOpen && redisClient.isReady) {
        try {
            let player = await Cache.getPlayer(userId, serverId);
            if (!player) throw new Error("Профиль игрока не найден в кэше Redis");

            let resources = player.resources || {};
            const costCurrency = refreshCost.resource; // 'diamond'
            const costAmount = refreshCost.amount;

            if ((parseInt(resources[costCurrency]) || 0) < costAmount) {
                return { error: true, message: `Недостаточно ресурса: ${costCurrency}` };
            }

            // Списываем алмазы и генерируем новую Showcase витрину в RAM
            resources[costCurrency] = (parseInt(resources[costCurrency]) || 0) - costAmount;

            if (!player.shopsState) player.shopsState = player.shops_state || {};
            const newShowcase = generateShowcase(shopConfig, shopPools);
            player.shopsState[shopId] = newShowcase;
            player.shops_state = player.shopsState;
            player.resources = resources;

            await Cache.setPlayer(player);

            return { success: true, resources: player.resources, state: newShowcase };

        } catch (cacheErr) {
            console.warn('[ShopDB:ManualRefresh] Сбой Redis, проваливаюсь в Postgres Fallback:', cacheErr);
        }
    }

    // ------------------------------------------------------------------------
    // ЭШЕЛОН 2: ТВОЙ СТАРЫЙ SQL FALLBACK ПЛАТНОГО РЕФРЕША СУБД
    // ------------------------------------------------------------------------
    const client = await global.pool.connect();
    try {
        await client.query('BEGIN');

        const { rows } = await client.query(
            `SELECT resources, game_data FROM player_server_profiles WHERE id = $1 AND server_id = $2 FOR UPDATE;`,
            [userId, serverId]
        );
        if (rows.length === 0) {
            await client.query('ROLLBACK');
            return { error: true, message: "Профиль не найден" };
        }

        let resources = rows[0].resources || {};
        let gameData = rows[0].game_data || {};

        const costCurrency = refreshCost.resource;
        const costAmount = refreshCost.amount;

        if ((parseInt(resources[costCurrency]) || 0) < costAmount) {
            await client.query('ROLLBACK');
            return { error: true, message: `Недостаточно ресурса: ${costCurrency}` };
        }

        resources[costCurrency] = (parseInt(resources[costCurrency]) || 0) - costAmount;

        if (!gameData.shops_state) gameData.shops_state = {};
        const newShowcase = generateShowcase(shopConfig, shopPools);
        gameData.shops_state[shopId] = newShowcase;

        await client.query(
            `UPDATE player_server_profiles SET resources = $3, game_data = $4, updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND server_id = $2;`,
            [userId, serverId, JSON.stringify(resources), JSON.stringify(gameData)]
        );
        await client.query('COMMIT');

        return { success: true, resources, state: newShowcase };

    } catch (e) {
        await client.query('ROLLBACK');
        console.error("Ошибка при ручном рефреше в SQL:", e);
        return { error: true, message: e.message };
    } finally {
        client.release();
    }
}

/**
 * 3. ПОКУПКА ТОВАРА ЗА ВИРТУАЛЬНУЮ ВАЛЮТУ (Гибридный метод)
 */
async function purchaseItemVirtual(userId, serverId, shopId, slotId, partnerId, shopConfig) {
    // ------------------------------------------------------------------------
    // ЭШЕЛОН 1: ОПЕРАЦИЯ В СВЕРХБЫСТРОМ REDIS КЭШЕ (0 МИЛЛИСЕКУНД)
    // ------------------------------------------------------------------------
    if (redisClient.isOpen && redisClient.isReady) {
        try {
            let player = await Cache.getPlayer(userId, serverId);
            if (!player) throw new Error("Профиль игрока не найден в кэше Redis");

            let resources = player.resources || {};
            if (!player.shopsState) player.shopsState = player.shops_state || {};

            if (!player.shopsState[shopId]) {
                return { error: true, message: "Витрина магазина не инициализирована. Обновите страницу" };
            }

            const shopState = player.shopsState[shopId];
            const slotItem = shopState.showcase.find(s => s.slotId === slotId);
            if (!slotItem) return { error: true, message: "Товар не найден на текущей витрине" };

            if (slotItem.bought_count >= slotItem.buy_limit) {
                return { error: true, message: "Товар полностью распродан (Sold Out)" };
            }

            const costResource = slotItem.cost.resource;
            const costAmount = slotItem.cost.amount;
            const playerBalance = parseInt(resources[costResource]) || 0;

            if (playerBalance < costAmount) {
                return { error: true, message: `Недостаточно ресурсов: ${costResource}` };
            }
            resources[costResource] = playerBalance - costAmount;

            slotItem.bought_count += 1;

            if (slotItem.item_type === 'resource') {
                resources[slotItem.itemId] = (parseInt(resources[slotItem.itemId]) || 0) + slotItem.amount;
            } else {
                if (!player.inventory) player.inventory = {};
                player.inventory[slotItem.itemId] = (parseInt(player.inventory[slotItem.itemId]) || 0) + slotItem.amount;
            }

            if (!player.shop_history) player.shop_history = [];
            player.shop_history.push({
                timestamp: Date.now(),
                partnerId: partnerId || "unknown",
                shopId,
                slotId,
                itemId: slotItem.itemId,
                amount: slotItem.amount,
                cost_resource: costResource,
                cost_amount: costAmount
            });

            player.shops_state = player.shopsState;
            player.resources = resources;

            await Cache.setPlayer(player);

            const rewardReport = {
                resources: slotItem.item_type === 'resource' ? { [slotItem.itemId]: slotItem.amount } : {},
                items: slotItem.item_type !== 'resource' ? { [slotItem.itemId]: slotItem.amount } : {}
            };
            return { success: true, resources, state: shopState, rewards: rewardReport };

        } catch (cacheErr) {
            console.warn('[ShopDB:PurchaseVirtual] Сбой Redis, проваливаюсь в Postgres Fallback:', cacheErr);
        }
    }

    // ------------------------------------------------------------------------
    // ЭШЕЛОН 2: ТВОЙ СТАРЫЙ SQL FALLBACK (ПРЯМАЯ ТРАНЗАКЦИЯ В СУБД)
    // ------------------------------------------------------------------------
    const client = await global.pool.connect();
    try {
        await client.query('BEGIN');

        const { rows } = await client.query(
            `SELECT resources, game_data FROM player_server_profiles WHERE id = $1 AND server_id = $2 FOR UPDATE;`,
            [userId, serverId]
        );
        if (rows.length === 0) {
            await client.query('ROLLBACK');
            return { error: true, message: "Профиль игрока не найден" };
        }

        let resources = rows.resources || {};
        let gameData = rows.game_data || {};
        if (!gameData.shops_state) gameData.shops_state = {};

        const shopState = gameData.shops_state[shopId];
        if (!shopState) { await client.query('ROLLBACK'); return { error: true, message: "Витрина не найдена" }; }

        const slotItem = shopState.showcase.find(s => s.slotId === slotId);
        if (!slotItem) { await client.query('ROLLBACK'); return { error: true, message: "Товар не найден" }; }

        if (slotItem.bought_count >= slotItem.buy_limit) {
            await client.query('ROLLBACK');
            return { error: true, message: "Товар распродан" };
        }

        const costResource = slotItem.cost.resource;
        const costAmount = slotItem.cost.amount;
        const playerBalance = parseInt(resources[costResource]) || 0;

        if (playerBalance < costAmount) {
            await client.query('ROLLBACK');
            return { error: true, message: `Недостаточно ресурсов: ${costResource}` };
        }
        resources[costResource] = playerBalance - costAmount;

        slotItem.bought_count += 1;

        if (slotItem.item_type === 'resource') {
            resources[slotItem.itemId] = (parseInt(resources[slotItem.itemId]) || 0) + slotItem.amount;
        } else {
            if (!gameData.inventory) gameData.inventory = {};
            gameData.inventory[slotItem.itemId] = (parseInt(gameData.inventory[slotItem.itemId]) || 0) + slotItem.amount;
        }

        if (!gameData.shop_history) gameData.shop_history = [];
        gameData.shop_history.push({
            timestamp: Date.now(),
            partnerId: partnerId || "unknown",
            shopId,
            slotId,
            itemId: slotItem.itemId,
            amount: slotItem.amount,
            cost_resource: costResource,
            cost_amount: costAmount
        });

        const updateQuery = `UPDATE player_server_profiles SET resources = $3, game_data = $4, updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND server_id = $2;`;
        await client.query(updateQuery, [userId, serverId, JSON.stringify(resources), JSON.stringify(gameData)]);
        await client.query('COMMIT');

        const rewardReport = {
            resources: slotItem.item_type === 'resource' ? { [slotItem.itemId]: slotItem.amount } : {},
            items: slotItem.item_type !== 'resource' ? { [slotItem.itemId]: slotItem.amount } : {}
        };
        return { success: true, resources, state: shopState, rewards: rewardReport };

    } catch (e) {
        await client.query('ROLLBACK');
        console.error("Ошибка при покупке в SQL:", e);
        return { error: true, message: e.message };
    } finally {
        client.release();
    }
}

/**
 * 4. ФЕЙК-ПОКУПКА ТОВАРА ЗА РЕАЛЬНЫЕ ДЕНЬГИ USD (Гибридный метод)
 */
async function purchaseItemCashFake(userId, serverId, shopId, slotId, partnerId, shopConfig) {
    // ------------------------------------------------------------------------
    // ЭШЕЛОН 1: ПОКУПКА ЗА КЭШ В ОПЕРАТИВНОЙ ПАМЯТИ REDIS
    // ------------------------------------------------------------------------
    if (redisClient.isOpen && redisClient.isReady) {
        try {
            let player = await Cache.getPlayer(userId, serverId);
            if (!player) throw new Error("Профиль игрока не найден в кэше Redis");

            let resources = player.resources || {};
            if (!player.shopsState) player.shopsState = player.shops_state || {};

            if (!player.shopsState[shopId]) return { error: true, message: "Витрина не найдена" };

            const shopState = player.shopsState[shopId];
            const slotItem = shopState.showcase.find(s => s.slotId === slotId);
            if (!slotItem) return { error: true, message: "Товар не найден" };

            if (slotItem.bought_count >= slotItem.buy_limit) return { error: true, message: "Товар распродан" };

            slotItem.bought_count += 1;

            if (slotItem.item_type === 'resource') {
                resources[slotItem.itemId] = (parseInt(resources[slotItem.itemId]) || 0) + slotItem.amount;
            } else {
                if (!player.inventory) player.inventory = {};
                player.inventory[slotItem.itemId] = (parseInt(player.inventory[slotItem.itemId]) || 0) + slotItem.amount;
            }

            // Дополнительная логика: начисление VIP опыта в корень профиля игрока за донат
            const usdSpent = slotItem.cost.amount;
            const vipExpGained = Math.floor(usdSpent * 100);
            player.vip_exp = (parseInt(player.vip_exp) || 0) + vipExpGained;

            // Расчет повышения VIP-уровня (пример: 1000 опыта на уровень)
            const nextVipLevel = Math.floor(player.vip_exp / 1000);
            if (nextVipLevel > (player.vip_level || 0)) {
                player.vip_level = nextVipLevel;
                // Синхронизируем также в ZSET Лидерборд по уровням, если необходимо
                await redisClient.zAdd(`lb:${serverId}:vip_level`, { score: parseInt(player.level || 1), value: String(userId) });
            }

            if (!player.shop_history) player.shop_history = [];
            player.shop_history.push({
                timestamp: Date.now(),
                partnerId: partnerId || "unknown",
                shopId,
                slotId,
                itemId: slotItem.itemId,
                amount: slotItem.amount,
                cost_resource: "usd",
                cost_amount: usdSpent
            });

            player.shops_state = player.shopsState;
            player.resources = resources;

            await Cache.setPlayer(player);

            // ДОБАВЛЕНО: Явный отчет о дельте для сокетного роутера и донатного поп-апа!
            const rewardReport = {
                resources: { vip_exp: vipExpGained },
                items: { [slotItem.itemId]: slotItem.amount }
            };

            return {
                success: true,
                resources,
                state: shopState,
                rewards: rewardReport // Передаем дельту наружу
            };


        } catch (cacheErr) {
            console.warn('[ShopDB:PurchaseCash] Сбой Redis, проваливаюсь в Postgres Fallback:', cacheErr);
        }
    }

    // ------------------------------------------------------------------------
    // ЭШЕЛОН 2: ТВОЙ СТАРЫЙ SQL FALLBACK ПОКУПКИ ЗА КЭШ В СУБД
    // ------------------------------------------------------------------------
    const client = await global.pool.connect();
    try {
        await client.query('BEGIN');

        // Выбираем также vip_level и vip_exp напрямую из корня таблицы!
        const { rows } = await client.query(
            `SELECT resources, game_data, level FROM player_server_profiles WHERE id = $1 AND server_id = $2 FOR UPDATE;`,
            [userId, serverId]
        );
        if (rows.length === 0) {
            await client.query('ROLLBACK');
            return { error: true, message: "Профиль не найден" };
        }

        const playerRow = rows[0];
        let resources = playerRow.resources || {};
        let gameData = playerRow.game_data || {};
        if (!gameData.shops_state) gameData.shops_state = {};

        const shopState = gameData.shops_state[shopId];
        const slotItem = shopState?.showcase.find(s => s.slotId === slotId);

        if (!slotItem || slotItem.bought_count >= slotItem.buy_limit) {
            await client.query('ROLLBACK');
            return { error: true, message: "Ошибка слота или товар распродан" };
        }

        slotItem.bought_count += 1;

        if (slotItem.item_type === 'resource') {
            resources[slotItem.itemId] = (parseInt(resources[slotItem.itemId]) || 0) + slotItem.amount;
        } else {
            if (!gameData.inventory) gameData.inventory = {};
            gameData.inventory[slotItem.itemId] = (parseInt(gameData.inventory[slotItem.itemId]) || 0) + slotItem.amount;
        }

        const usdSpent = slotItem.cost.amount;
        const newVipExp = (parseInt(gameData.vip_exp) || 0) + Math.floor(usdSpent * 100);
        let newVipLevel = gameData.vip_level || 0;

        // Каждые 1000 опыта повышают VIP-уровень
        if (Math.floor(newVipExp / 1000) > newVipLevel) {
            newVipLevel = Math.floor(newVipExp / 1000);
        }

        if (!gameData.shop_history) gameData.shop_history = [];
        gameData.shop_history.push({
            timestamp: Date.now(),
            partnerId: partnerId || "unknown",
            shopId,
            slotId,
            itemId: slotItem.itemId,
            amount: slotItem.amount,
            cost_resource: "usd",
            cost_amount: usdSpent
        });

        const vipExpGained = Number(Number(newVipLevel) - Number(gameData.vip_level));
        gameData.vip_level = newVipLevel;
        gameData.vip_exp = newVipExp;

        await client.query(
            `UPDATE player_server_profiles 
             SET resources = $3, game_data = $4, updated_at = CURRENT_TIMESTAMP 
             WHERE id = $1 AND server_id = $2;`,
            [userId, serverId, JSON.stringify(resources), JSON.stringify(gameData)]
        );
        await client.query('COMMIT');

        player.resources = resources;

        // ДОБАВЛЕНО: Явный отчет о дельте для сокетного роутера и донатного поп-апа!
        const rewardReport = {
            resources: { vip_exp: vipExpGained },
            items: { [slotItem.itemId]: slotItem.amount }
        };

        return {
            success: true,
            resources,
            state: shopState,
            rewards: rewardReport // Передаем дельту наружу
        };

    } catch (e) {
        await client.query('ROLLBACK');
        console.error("Ошибка при покупке за кэш в SQL:", e);
        return { error: true, message: e.message };
    } finally {
        client.release();
    }
}

module.exports = {
    getOrGenerateShopState,
    refreshShopManual,
    purchaseItemVirtual,
    purchaseItemCashFake
};



//
// // Экспортируем ВСЕ функции модуля базы данных
// module.exports = {
//     getOrGenerateShopState,
//     refreshShopManual,
//     purchaseItemVirtual,
//     purchaseItemCashFake
// };

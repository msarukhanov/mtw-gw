const {gamesConfigDB} = require('./configDB');
const { redisClient } = require('../../redisClient');
const Cache = require('./cacheManager');

function buildReturnedGameData(player) {
    const rootFields = ['id', 'user_id', 'server_id', 'nickname', 'level', 'combat_power', 'resources', 'idle_timestamps'];
    const returnedGameData = {};
    Object.entries(player).forEach(([key, val]) => {
        if (!rootFields.includes(key) && !['gameId', 'deviceId', 'sessionId', 'partnerId', 'username'].includes(key)) {
            returnedGameData[key] = val;
        }
    });
    return returnedGameData;
}

// --- 1. ТРИГГЕР ВСПЛЫВАЮЩЕЙ АКЦИИ (НАПРИМЕР, ПОСЛЕ ПОРАЖЕНИЯ ОТ БОССА) ---
exports.triggerLiveOpsOffer = async function(userId, serverId, gameId, eventHook, currentLevel) {
    const GameConfig = gamesConfigDB[gameId];
    const offersConfig = GameConfig?.limited_offers;
    if (!offersConfig || !offersConfig.offers_pool) return { error: true, message: "Конфиг акций не найден" };

    if (redisClient.isOpen && redisClient.isReady) {
        try {
            let player = await Cache.getPlayer(userId, serverId);
            if (!player) throw new Error("Профиль не найден в Redis");

            if (!player.active_offers) player.active_offers = [];

            // Ищем подходящую акцию в конфиге админки по триггер-хуку
            const offerId = Object.keys(offersConfig.offers_pool).find(oKey => {
                const o = offersConfig.offers_pool[oKey];
                if (o.offer_type !== 'triggered' || o.trigger_event !== eventHook) return false;
                // Если это ап уровня, проверяем порог
                if (eventHook === 'player_level_up' && o.trigger_value_threshold !== currentLevel) return false;
                return true;
            });

            if (!offerId) return { success: false, message: "Нет подходящих акций под триггер" };
            const offerMeta = offersConfig.offers_pool[offerId];

            // Проверяем, не висит ли уже эта акция у игрока в активных
            const isAlreadyActive = player.active_offers.some(o => o.offer_id === offerId);
            if (isAlreadyActive) return { success: false, message: "Акция уже активна" };

            // Проверяем глобальный лимит одновременных поп-апов из настроек
            const maxSimultaneous = offersConfig.settings?.max_simultaneous_triggered_offers || 2;
            if (player.active_offers.length >= maxSimultaneous) {
                return { error: true, message: "Достигнут лимит одновременных акций" };
            }

            // Добавляем акцию в JS-объект игрока с жестким временем сгорания
            const durationMs = offerMeta.available_duration_ms || 7200000; // 2 часа дефолт
            player.active_offers.push({
                offer_id: offerId,
                expires_at: Date.now() + durationMs
            });

            await Cache.setPlayer(player);

            return { success: true, active_offers: player.active_offers };
        } catch (cacheErr) { console.warn(cacheErr); }
    }
    return { error: true, message: "Redis subsystem offline" };
};

// --- 2. ПОЛУЧЕНИЕ СПИСКА АКТИВНЫХ АКЦИЙ (С АВТО-ФИЛЬТРАЦИЕЙ ПРОТУХШИХ) ---
exports.getActiveOffersList = async function(userId, serverId, gameId) {
    const GameConfig = gamesConfigDB[gameId];
    const poolConfig = GameConfig?.limited_offers?.offers_pool || {};
    const now = Date.now();

    // 1. Ищем в конфиге админки все живые календарные акции (по времени)
    const activeScheduledOffers = [];
    Object.entries(poolConfig).forEach(([offerId, meta]) => {
        if (meta.offer_type === 'scheduled') {
            const startMs = (meta.start_epoch || 0) * 1000;
            const endMs = (meta.end_epoch || 0) * 1000;
            // Если акция идет прямо сейчас — добавляем её в список для фронта
            if (now >= startMs && now <= endMs) {
                activeScheduledOffers.push({
                    offer_id: offerId,
                    expires_at: endMs // Для глобальных акций время сгорания — это конец ивента
                });
            }
        }
    });

    // 2. Достаем личные триггерные акции игрока из Redis/Postgres
    if (redisClient.isOpen && redisClient.isReady) {
        try {
            let player = await Cache.getPlayer(userId, serverId);
            if (!player) throw new Error("Профиль не найден в Redis");

            if (!player.active_offers) player.active_offers = [];

            // Фильтруем протухшие личные триггеры
            const originalLength = player.active_offers.length;
            player.active_offers = player.active_offers.filter(o => o.expires_at > now);

            if (player.active_offers.length !== originalLength) {
                await Cache.setPlayer(player);
            }

            // СКЛЕИВАЕМ личные триггеры и глобальный календарь
            const totalOffers = [...player.active_offers, ...activeScheduledOffers];
            return { active_offers: totalOffers, resources: player.resources };
        } catch (cacheErr) {
            console.warn('[Offers:GetList] Сбой Redis, ухожу в Postgres:', cacheErr);
        }
    }

    // ЭШЕЛОН 2: POSTGRESQL (Если Redis упал, логика склейки та же)
    const client = await global.pool.connect();
    try {
        const { rows } = await client.query(`SELECT game_data FROM player_server_profiles WHERE id = $1 AND server_id = $2;`, [userId, serverId]);
        if (rows.length === 0) return { error: true, message: "Профиль не найден" };

        let gameData = rows[0].game_data || {};
        if (!gameData.active_offers) gameData.active_offers = [];

        const filteredPersonal = gameData.active_offers.filter(o => o.expires_at > now);
        const totalOffers = [...filteredPersonal, ...activeScheduledOffers];

        return { active_offers: totalOffers, resources: gameData.resources };
    } catch (e) { return { error: true, message: e.message }; } finally { client.release(); }
};

// --- 3. ПОКУПКА ЛИМИТИРОВАННОГО ПАКА (ДВА ЭШЕЛОНА) ---
exports.buyLimitedOfferBundle = async function(userId, serverId, gameId, offerId, count) {
    const GameConfig = gamesConfigDB[gameId];
    const offerMeta = GameConfig?.limited_offers?.offers_pool?.[offerId];
    if (!offerMeta) return { error: true, message: "Акционный товар не найден" };

    const activeCount = count || 1;
    const costResource = offerMeta.cost?.resource || "diamond";
    const totalCost = (offerMeta.cost?.amount || 0) * activeCount;
    const now = Date.now();

    // Вспомогательная функция валидации (общая для кэша и базы)
    const validateOfferAvailability = (activeOffers, shopsState) => {
        // 1. Проверка времени для календарных акций
        if (offerMeta.offer_type === 'scheduled') {
            const startMs = (offerMeta.start_epoch || 0) * 1000;
            const endMs = (offerMeta.end_epoch || 0) * 1000;
            if (now < startMs || now > endMs) {
                return { error: true, message: "Время действия глобальной акции не наступило или истекло" };
            }
        }
        // 2. Проверка времени для триггерных акций
        if (offerMeta.offer_type === 'triggered') {
            const runtimeOffer = activeOffers?.find(o => o.offer_id === offerId);
            if (!runtimeOffer || now > runtimeOffer.expires_at) {
                return { error: true, message: "Время действия триггерной акции истекло" };
            }
        }
        // 3. Проверка лимита покупок
        const purchaseKey = `offer_${offerId}`;
        const currentPurchased = shopsState?.[purchaseKey] || 0;
        if (currentPurchased + activeCount > (offerMeta.buy_limit || 1)) {
            return { error: true, message: "Достигнут лимит покупок этой акции" };
        }
        return { valid: true, currentPurchased, purchaseKey };
    };



    // ------------------------------------------------------------------------
    // ЭШЕЛОН 1: ОПЕРАЦИЯ В ОПЕРАТИВНОЙ ПАМЯТИ REDIS
    // ------------------------------------------------------------------------
    if (redisClient.isOpen && redisClient.isReady) {
        try {
            let player = await Cache.getPlayer(userId, serverId);
            if (!player) throw new Error("Профиль не найден в Redis");

            if (!player.active_offers) player.active_offers = [];
            if (!player.shopsState) player.shopsState = {};

            const validation = validateOfferAvailability(player.active_offers, player.shopsState);
            if (validation.error) return validation;

            // player.resources[costResource] = 2350;

            // Списание ресурсов (заглушка для USD)
            if (costResource !== 'usd') {
                if ((parseInt(player.resources?.[costResource]) || 0) < totalCost) {
                    return { error: true, message: "Недостаточно ресурсов" };
                }
                player.resources[costResource] -= totalCost;
            }

            // Начисление наград (ресурсы)
            if (offerMeta.rewards?.resources) {
                Object.entries(offerMeta.rewards.resources).forEach(([resKey, resVal]) => {
                    player.resources[resKey] = (parseInt(player.resources[resKey]) || 0) + (resVal * activeCount);
                });
            }
            // Начисление наград (предметы)
            if (offerMeta.rewards?.items) {
                if (!player.inventory) player.inventory = {};
                offerMeta.rewards.items.forEach(item => {
                    player.inventory[item.itemId] = (parseInt(player.inventory[item.itemId]) || 0) + (item.amount * activeCount);
                });
            }
            // Начисление наград (скины)
            if (offerMeta.rewards?.skins) {
                if (!player.heroesState) player.heroesState = {};
                if (!player.heroesState.unlocked_skins) player.heroesState.unlocked_skins = [];
                offerMeta.rewards.skins.forEach(s => {
                    if (!player.heroesState.unlocked_skins.includes(s.skin_id)) {
                        player.heroesState.unlocked_skins.push(s.skin_id);
                    }
                });
            }

            // Обновляем счетчик покупок
            player.shopsState[validation.purchaseKey] = validation.currentPurchased + activeCount;

            // Если лимит исчерпан — убираем триггер из поп-апов
            if (offerMeta.offer_type === 'triggered' && player.shopsState[validation.purchaseKey] >= (offerMeta.buy_limit || 1)) {
                player.active_offers = player.active_offers.filter(o => o.offer_id !== offerId);
            }

            await Cache.setPlayer(player);
            // return { success: true, active_offers: player.active_offers, game_data: buildReturnedGameData(player) };
            return exports.getActiveOffersList(userId, serverId, gameId);
        } catch (cacheErr) {
            console.warn('[Offers:Buy] Сбой Redis, ухожу в Postgres:', cacheErr);
        }
    }

    // ------------------------------------------------------------------------
    // ЭШЕЛОН 2: POSTGRESQL FALLBACK
    // ------------------------------------------------------------------------
    const client = await global.pool.connect();
    try {
        await client.query('BEGIN');
        const { rows } = await client.query(`SELECT game_data FROM player_server_profiles WHERE id = $1 AND server_id = $2 FOR UPDATE;`, [userId, serverId]);
        if (rows.length === 0) throw new Error("Профиль не найден");

        let gameData = rows[0].game_data || {};
        if (!gameData.active_offers) gameData.active_offers = [];
        if (!gameData.shopsState) gameData.shopsState = {};

        const validation = validateOfferAvailability(gameData.active_offers, gameData.shopsState);
        if (validation.error) {
            await client.query('ROLLBACK');
            return validation;
        }

        if (costResource !== 'usd') {
            if ((parseInt(gameData.resources?.[costResource]) || 0) < totalCost) {
                await client.query('ROLLBACK');
                return { error: true, message: "Недостаточно ресурсов" };
            }
            gameData.resources[costResource] -= totalCost;
        }

        if (offerMeta.rewards?.resources) {
            Object.entries(offerMeta.rewards.resources).forEach(([resKey, resVal]) => {
                gameData.resources[resKey] = (parseInt(gameData.resources[resKey]) || 0) + (resVal * activeCount);
            });
        }
        if (offerMeta.rewards?.items) {
            if (!gameData.inventory) gameData.inventory = {};
            offerMeta.rewards.items.forEach(item => {
                gameData.inventory[item.itemId] = (parseInt(gameData.inventory[item.itemId]) || 0) + (item.amount * activeCount);
            });
        }
        if (offerMeta.rewards?.skins) {
            if (!gameData.heroesState) gameData.heroesState = {};
            if (!gameData.heroesState.unlocked_skins) gameData.heroesState.unlocked_skins = [];
            offerMeta.rewards.skins.forEach(s => {
                if (!gameData.heroesState.unlocked_skins.includes(s.skin_id)) {
                    gameData.heroesState.unlocked_skins.push(s.skin_id);
                }
            });
        }

        gameData.shopsState[validation.purchaseKey] = validation.currentPurchased + activeCount;

        if (offerMeta.offer_type === 'triggered' && gameData.shopsState[validation.purchaseKey] >= (offerMeta.buy_limit || 1)) {
            gameData.active_offers = gameData.active_offers.filter(o => o.offer_id !== offerId);
        }

        await client.query(`UPDATE player_server_profiles SET game_data = $3 WHERE id = $1 AND server_id = $2;`, [userId, serverId, JSON.stringify(gameData)]);
        await client.query('COMMIT');

        // return { success: true, active_offers: gameData.active_offers, game_data: buildReturnedGameData(gameData) };
        return exports.getActiveOffersList(userId, serverId, gameId);
    } catch (e) { await client.query('ROLLBACK'); return { error: true, message: e.message }; } finally { client.release(); }
};

// --- ДЕБАГ: ПРИНУДИТЕЛЬНОЕ ДОБАВЛЕНИЕ ЛЮБОГО ОФФЕРА НА Х МИНУТ ---
exports.debugAddExpiredOffer = async function(userId, serverId, gameId, offerId, durationMinutes) {
    const GameConfig = gamesConfigDB[gameId];
    const offerMeta = GameConfig?.limited_offers?.offers_pool?.[offerId];
    if (!offerMeta) return { error: true, message: "Такой оффер не существует в конфиге pool" };

    const durationMs = (parseInt(durationMinutes) || 10) * 60 * 1000; // По дефолту даем 10 минут на тест
    const expiresAt = Date.now() + durationMs;

    if (redisClient.isOpen && redisClient.isReady) {
        try {
            let player = await Cache.getPlayer(userId, serverId);
            if (!player) throw new Error("Профиль не найден в Redis");

            if (!player.active_offers) player.active_offers = [];

            // Удаляем старый тест этого же оффера, если он был, чтобы обновить таймер
            player.active_offers = player.active_offers.filter(o => o.offer_id !== offerId);

            // Заталкиваем фейковый таймер сгорания
            player.active_offers.push({
                offer_id: offerId,
                expires_at: expiresAt
            });

            await Cache.setPlayer(player);
            // return { success: true, active_offers: player.active_offers };
            return exports.getActiveOffersList(userId, serverId, gameId);
        } catch (cacheErr) {
            console.warn('[Offers:Debug] Сбой Redis, пишу напрямую в PG fallback:', cacheErr);
        }
    }

    // ЭШЕЛОН 2: POSTGRESQL FALLBACK ДЛЯ ТЕСТОВ
    const client = await global.pool.connect();
    try {
        await client.query('BEGIN');
        const { rows } = await client.query(`SELECT game_data FROM player_server_profiles WHERE id = $1 AND server_id = $2 FOR UPDATE;`, [userId, serverId]);
        if (rows.length === 0) throw new Error("Профиль не найден");

        let gameData = rows[0].game_data || {};
        if (!gameData.active_offers) gameData.active_offers = [];

        gameData.active_offers = gameData.active_offers.filter(o => o.offer_id !== offerId);
        gameData.active_offers.push({ offer_id: offerId, expires_at: expiresAt });

        await client.query(`UPDATE player_server_profiles SET game_data = $3 WHERE id = $1 AND server_id = $2;`, [userId, serverId, JSON.stringify(gameData)]);
        await client.query('COMMIT');

        // return { success: true, active_offers: gameData.active_offers };
        return exports.getActiveOffersList(userId, serverId, gameId);
    } catch (e) { await client.query('ROLLBACK'); return { error: true, message: e.message }; } finally { client.release(); }
};


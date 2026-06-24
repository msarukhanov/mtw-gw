const { gamesConfigDB } = require('../db/configDB');
const itemDB = require('../db/itemDB');

// --- ПОКУПКА ПРЕДМЕТА ---
exports.buyItem = async function (req, res) {
    try {
        // Данные авторизации забираем из миддлвейра
        const { id: userId, serverId, gameId } = req.player;
        // Из тела запроса берем только параметры магазина
        const { shopItemId, shopType, count } = req.body;

        const gameConfig = gamesConfigDB[gameId];
        const activeShopType = shopType || 'basic';
        const activeCount = count || 1;

        const shopItem = gameConfig?.shops?.[activeShopType]?.[shopItemId];
        if (!shopItem) return res.status(400).json({ error: "Товар не найден в магазине" });

        // Передаем чистый userId и параметры в БД
        const result = await itemDB.purchaseItem(
            userId, serverId, shopItem.itemId, shopItem.cost_resource, shopItem.cost_amount, activeCount
        );

        if (result.error) return res.status(400).json({ error: result.message });
        return res.json(result);
    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: e.message, msg: '[Items:Buy] error' });
    }
};

// --- УНИВЕРСАЛЬНАЯ ПРОДАЖА ПРЕДМЕТОВ ---
exports.sellItem = async function (req, res) {
    try {
        const { id: userId, serverId, gameId } = req.player;
        const { itemId, count } = req.body;

        const gameConfig = gamesConfigDB[gameId];
        const activeCount = count || 1;

        const result = await itemDB.sellItem(
            userId, serverId, itemId, activeCount, gameConfig.catalog.items
        );

        if (result.error) return res.status(400).json({ error: result.message });
        return res.json(result);
    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: e.message, msg: '[Items:Sell] error' });
    }
};

// --- МАССОВОЕ ОТКРЫТИЕ СУНДУКОВ ---
exports.openChest = async function (req, res) {
    try {
        const { id: userId, serverId, gameId } = req.player;
        const { itemId, count } = req.body;

        const gameConfig = gamesConfigDB[gameId];
        const activeCount = count || 1;

        const result = await itemDB.useItemChest(
            userId, serverId, itemId, activeCount, gameConfig.catalog.chests
        );

        if (result.error) return res.status(400).json({ error: result.message });
        return res.json(result);
    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: e.message, msg: '[Items:OpenChest] error' });
    }
};

// --- КРАФТ ПРЕДМЕТОВ ---
exports.craftItem = async function (req, res) {
    try {
        const { id: userId, serverId, gameId } = req.player;
        const { recipeId, count } = req.body;

        const gameConfig = gamesConfigDB[gameId];
        const activeCount = count || 1;

        const result = await itemDB.craftItem(
            userId, serverId, recipeId, activeCount, gameConfig.catalog.recipes
        );

        if (result.error) return res.status(400).json({ error: result.message });
        return res.json(result);
    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: e.message, msg: '[Items:Craft] error' });
    }
};

// --- ГЛУБОКИЙ РЕКУРСИВНЫЙ АВТОКРАФТ ПРЕДМЕТОВ ---
exports.autoCraftItem = async function (req, res) {
    try {
        const { id: userId, serverId, gameId } = req.player;
        const { recipeId, count } = req.body;

        const gameConfig = gamesConfigDB[gameId];
        const activeCount = count || 1;

        // Вызываем новый рекурсивный метод из сервиса базы данных
        const result = await itemDB.autoCraftItem(
            userId, serverId, recipeId, activeCount, gameConfig.catalog.recipes
        );

        if (result.error) return res.status(400).json({ error: result.message });
        return res.json(result);
    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: e.message, msg: '[Items:AutoCraft] error' });
    }
};

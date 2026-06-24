const { gamesConfigDB } = require('../db/configDB');
const shopDB = require('../db/shopDB');

// --- ПОЛУЧЕНИЕ СОСТОЯНИЯ МАГАЗИНА / АВТО-РЕФРЕШ ---
exports.getShopState = async function (req, res) {
    try {
        const { id: userId, serverId, gameId } = req.player;
        const { shopId } = req.body;

        if (!shopId) return res.status(400).json({ error: "Не указан shopId" });

        const gameConfig = gamesConfigDB[gameId];
        const shopConfig = gameConfig?.catalog?.shops?.[shopId];

        if (!shopConfig) return res.status(400).json({ error: "Конфиг магазина не найден" });

        // Передаем управление в DB-сервис, отдавая конфиг самого магазина и пулы
        const result = await shopDB.getOrGenerateShopState(
            userId, serverId, shopId, shopConfig, gameConfig.catalog.shop_pools
        );

        if (result.error) return res.status(400).json({ error: result.message });
        return res.json(result);
    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: e.message, msg: '[Shop:GetState] error' });
    }
};

// --- РУЧНОЙ ПЛАТНЫЙ РЕФРЕШ ВИТРИНЫ ---
exports.refreshShopManual = async function (req, res) {
    try {
        const { id: userId, serverId, gameId } = req.player;
        const { shopId } = req.body;

        const gameConfig = gamesConfigDB[gameId];
        const shopConfig = gameConfig?.catalog?.shops?.[shopId];
        if (!shopConfig) return res.status(400).json({ error: "Конфиг магазина не найден" });

        const result = await shopDB.refreshShopManual(
            userId, serverId, shopId, shopConfig, gameConfig.catalog.shop_pools
        );

        if (result.error) return res.status(400).json({ error: result.message });
        return res.json(result);
    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: e.message, msg: '[Shop:RefreshManual] error' });
    }
};

// --- ПОКУПКА ЗА ВИРТУАЛЬНУЮ ВАЛЮТУ ---
exports.buyItemVirtual = async function (req, res) {
    try {
        const { id: userId, serverId, gameId, partnerId } = req.player;
        const { shopId, slotId } = req.body;

        const gameConfig = gamesConfigDB[gameId];
        const shopConfig = gameConfig?.catalog?.shops?.[shopId];
        if (!shopConfig) return res.status(400).json({ error: "Конфиг магазина не найден" });

        const result = await shopDB.purchaseItemVirtual(
            userId, serverId, shopId, slotId, partnerId, shopConfig
        );

        if (result.error) return res.status(400).json({ error: result.message });
        return res.json(result);
    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: e.message, msg: '[Shop:BuyVirtual] error' });
    }
};

// --- ПОКУПКА ЗА РЕАЛЬНЫЕ ДЕНЬГИ (ЗАГЛУШКА) ---
exports.buyItemCashFake = async function (req, res) {
    try {
        const { id: userId, serverId, gameId, partnerId } = req.player;
        const { shopId, slotId } = req.body;

        const gameConfig = gamesConfigDB[gameId];
        const shopConfig = gameConfig?.catalog?.shops?.[shopId];
        if (!shopConfig) return res.status(400).json({ error: "Конфиг магазина не найден" });

        const result = await shopDB.purchaseItemCashFake(
            userId, serverId, shopId, slotId, partnerId, shopConfig
        );

        if (result.error) return res.status(400).json({ error: result.message });
        return res.json(result);
    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: e.message, msg: '[Shop:BuyCashFake] error' });
    }
};

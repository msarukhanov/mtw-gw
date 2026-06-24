const { gamesConfigDB } = require('../db/configDB');
// Импортируем метод получения инвентаря из твоей playersDB
const { getPlayerInventory } = require('../db/playersDB');

exports.getInventory = async function (req, res) {
    try {
        // Забираем чистые проверенные данные из миддлвейра auth
        const { id: userId, serverId, gameId } = req.player;

        if (!serverId) {
            return res.status(400).json({ error: "x-server-id header or serverId in body is missing" });
        }

        // 1. Вытягиваем из базы плоские ресурсы и инвентарь (JSONB)
        const dbResult = await getPlayerInventory(userId, serverId);

        if (!dbResult || dbResult.error) {
            return res.status(400).json({ error: dbResult?.message || "Failed to fetch inventory" });
        }

        const gameConfig = gamesConfigDB[gameId];
        const itemCatalog = gameConfig?.catalog?.items || {};

        // 2. Обогащаем плоский инвентарь метаданными из конфига для фронтенда
        const enrichedInventory = [];

        if (dbResult.inventory) {
            Object.entries(dbResult.inventory).forEach(([itemId, count]) => {
                const itemMeta = itemCatalog[itemId] || {};
                enrichedInventory.push({
                    itemId: itemId,
                    count: count,
                    // Прокидываем полезные статы и локализацию из твоего конфига
                    title_loc: itemMeta.title_loc || { en: itemId },
                    icon: itemMeta.icon || '',
                    rarity: itemMeta.rarity || 'Common',
                    slotId: itemMeta.slotId || null, // Фронтенд сразу увидит, в какой слот можно надеть вещь
                    stats: itemMeta.stats || {}
                });
            });
        }

        // Отдаем клиенту и баланс валют, и красивый массив предметов
        return res.json({
            success: true,
            resources: dbResult.resources || {},
            inventory: enrichedInventory
        });

    } catch (e) {
        console.error(e);
        return res.status(400).json({ error: e.message, msg: '[Inventory:Get] error' });
    }
};


const { gamesConfigDB } = require('../db/configDB');
const playerDB = require('../db/playersDB');


// --- ПОКУПКА / ИЗМЕНЕНИЕ РЕСУРСОВ СИСТЕМОЙ ---
exports.changeResources = async function (req, res) {
    try {
        const { id: userId, serverId } = req.player;
        const { resource_changes } = req.body;

        if (!resource_changes || Object.keys(resource_changes).length === 0) {
            return res.status(400).json({ error: "Объект изменений resource_changes пуст" });
        }

        const updatedResources = await playerDB.updatePlayerResources(
            userId, serverId, resource_changes
        );

        if (updatedResources && updatedResources.error) {
            return res.status(400).json({ error: updatedResources.message });
        }

        return res.json({ success: true, resources: updatedResources });
    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: e.message, msg: '[Game:ChangeResources] error' });
    }
};

// --- ПОЛУЧЕНИЕ ТОП-ЛИСТА СЕРВЕРА ---
exports.getLeaderboard = async function (req, res) {
    try {
        const { id: userId, serverId } = req.player;
        const { sortBy, limit } = req.query;

        const activeLimit = limit ? parseInt(limit) : 100;
        const activeSort = sortBy || 'combat_power';

        const result = await playerDB.getServerLeaderboard(serverId, userId, activeSort, activeLimit);

        if (result.error) return res.status(400).json({ error: result.message });
        return res.json(result);
    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: e.message, msg: '[Game:Leaderboard] error' });
    }
};

// --- ВИЗУАЛЬНЫЙ ПРОСМОТР НАБЕЖАВШИХ АЙДЛ-РЕСУРСОВ ---
exports.getPendingIdle = async function (req, res) {
    try {
        const { id: userId, serverId, gameId } = req.player;
        const { idleKey } = req.query;

        const result = await playerDB.getPendingIdleRewards(userId, serverId, gameId, idleKey);

        if (result.error) return res.status(400).json({ error: result.message });
        return res.json(result);
    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: e.message, msg: '[Game:PendingIdle] error' });
    }
};

// --- ФАКТИЧЕСКИЙ СБОР АЙДЛ-НАГРАД В БАЗУ ---
exports.claimIdle = async function (req, res) {
    try {
        const { username, serverId, gameId, deviceId } = req.player;
        const { idleKey } = req.body;

        // Метод claimIdleRewards ожидает auth-строки для повторной верификации внутри транзакции
        const result = await playerDB.claimIdleRewards(username, serverId, gameId, deviceId, idleKey);

        if (result.error) return res.status(400).json({ error: result.message });
        return res.json(result);
    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: e.message, msg: '[Game:ClaimIdle] error' });
    }
};

// --- СОХРАНЕНИЕ ПРОСМОТРЕННОГО ДИАЛОГА ---
exports.saveDialog = async function (req, res) {
    try {
        const { id: userId, serverId } = req.player; // забираем проверенные данные из миддлвейра auth
        const { dialogId } = req.body;

        if (!dialogId) {
            return res.status(400).json({ error: "Параметр dialogId обязателен" });
        }

        const result = await playerDB.saveViewedDialog(userId, serverId, dialogId);
        if (result.error) return res.status(400).json({ error: result.message });

        return res.json(result);
    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: e.message, msg: '[Game:SaveDialog] error' });
    }
};

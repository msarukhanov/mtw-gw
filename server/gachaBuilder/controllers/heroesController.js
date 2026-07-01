const { gamesConfigDB } = require('../db/configDB');
const itemDB = require('../db/itemDB');
const heroDB = require('../db/heroDB');

// --- ОДИНОЧНЫЙ ЭКВИП ШМОТКИ ---
exports.equipItem = async function (req, res) {
    try {
        // Данные авторизации забираем из миддлвейра auth
        const { id: userId, serverId, gameId } = req.player;
        // Из тела запроса берем только параметры самого действия
        const { heroInstanceId, itemId, slotId } = req.body;

        const result = await itemDB.equipItem(
            userId, serverId, gameId, heroInstanceId, itemId, slotId
        );

        if (result.error) return res.status(400).json({ error: result.message });
        return res.json(result);
    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: e.message, msg: '[Heroes:Equip] error' });
    }
};

// --- АВТОЭКВИП ГЕРОЯ ---
exports.autoEquip = async function (req, res) {
    try {
        const { id: userId, serverId, gameId } = req.player;
        const { heroInstanceId } = req.body;

        const result = await itemDB.autoEquipHero(
            userId, serverId, gameId, heroInstanceId
        );

        if (result.error) return res.status(400).json({ error: result.message });
        return res.json(result);
    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: e.message, msg: '[Heroes:AutoEquip] error' });
    }
};

// --- ПОВЫШЕНИЕ УРОВНЯ ГЕРОЯ ---
exports.levelUp = async function (req, res) {
    try {
        const { id: userId, serverId, gameId } = req.player;
        const { heroInstanceId, levels_to_up } = req.body;
        const activeLevels = levels_to_up || 1;

        const result = await heroDB.levelUpHero(
            userId, serverId, gameId, heroInstanceId, activeLevels
        );

        if (result.error) return res.status(400).json({ error: result.message });
        return res.json(result);
    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: e.message, msg: '[Heroes:LevelUp] error' });
    }
};

exports.giveGift = async function (req, res) {
    try {
        const { id: userId, serverId, gameId } = req.player;
        // Извлекаем инстанс героя и мапу предметов-подарков из req.body
        const { heroInstanceId, giftPack } = req.body;

        const result = await affinityDB.giveGiftToHero(
            userId, serverId, gameId, heroInstanceId, giftPack
        );

        if (result.error) return res.status(400).json({ error: result.message });
        return res.json(result);
    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: e.message, msg: '[Heroes:GiveGift] error' });
    }
};

// --- ЭВОЛЮЦИЯ ЗВЕЗД ГЕРОЯ ---
exports.upgradeStars = async function (req, res) {
    try {
        const { id: userId, serverId, gameId } = req.player;
        const { heroInstanceId, fodder_inst_ids } = req.body;

        const result = await heroDB.upgradeHeroStars(
            userId, serverId, gameId, heroInstanceId, fodder_inst_ids || []
        );

        if (result.error) return res.status(400).json({ error: result.message });
        return res.json(result);
    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: e.message, msg: '[Heroes:UpgradeStars] error' });
    }
};

// --- ЭВОЛЮЦИЯ ЗВЕЗД ГЕРОЯ ---
exports.upgradePersonalItem = async function (req, res) {
    try {
        const { id: userId, serverId, gameId } = req.player;
        const { heroInstanceId, fodder_inst_ids } = req.body;

        const result = await heroDB.upgradePersonalItem(
            userId, serverId, gameId, heroInstanceId
        );

        if (result.error) return res.status(400).json({ error: result.message });
        return res.json(result);
    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: e.message, msg: '[Heroes:UpgradeStars] error' });
    }
};

exports.changeHeroSkin = async function (req, res) {
    try {
        const { id: userId, serverId, gameId } = req.player;
        const { heroInstanceId, skinId } = req.body;

        const result = await heroDB.changeHeroSkin(
            userId, serverId, heroInstanceId, skinId
        );

        if (result.error) return res.status(400).json({ error: result.message });
        return res.json(result);
    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: e.message, msg: '[Heroes:UpgradeStars] error' });
    }
};

// --- ЭВОЛЮЦИЯ ЗВЕЗД ГЕРОЯ ---
exports.managePet = async function (req, res) {
    try {
        const { id: userId, serverId, gameId } = req.player;
        const { heroInstanceId, petId, isLevelUpAction } = req.body;

        const result = await heroDB.manageHeroPet(
            userId, serverId, gameId, heroInstanceId, petId, isLevelUpAction || null
        );

        if (result.error) return res.status(400).json({ error: result.message });
        return res.json(result);
    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: e.message, msg: '[Heroes:UpgradeStars] error' });
    }
};

exports.saveTeam = async function (req, res) {
    try {
        const { id: userId, serverId, gameId } = req.player;
        const { teamKey, heroInstIds } = req.body;

        const result = await heroDB.savePlayerTeam(
            userId, serverId, gameId, teamKey || 'pve_main', heroInstIds || []
        );
        if (result.error) return res.status(400).json({ error: result.message });
        return res.json(result);
    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: e.message, msg: '[Heroes:SaveTeam] error' });
    }
};

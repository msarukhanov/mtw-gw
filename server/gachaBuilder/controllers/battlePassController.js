const battlePassDB = require('../db/battlePassDB');

exports.addExp = async function (req, res) {
    try {
        const { id: userId, serverId, gameId } = req.player;
        const { bpId, amount } = req.body;

        const result = await battlePassDB.addBattlePassExp(userId, serverId, gameId, bpId, amount);
        if (result.error) return res.status(400).json({ error: result.message });
        return res.json(result);
    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: e.message, msg: '[BP:AddExp] error' });
    }
};

exports.unlockPremium = async function (req, res) {
    try {
        const { id: userId, serverId, gameId } = req.player;
        const { bpId } = req.body;

        const result = await battlePassDB.unlockPremiumTrack(userId, serverId, gameId, bpId);
        if (result.error) return res.status(400).json({ error: result.message });
        return res.json(result);
    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: e.message, msg: '[BP:UnlockPremium] error' });
    }
};

exports.claimReward = async function (req, res) {
    try {
        const { id: userId, serverId, gameId } = req.player;
        const { bpId, targetLevel, trackType } = req.body;

        const result = await battlePassDB.claimBattlePassReward(userId, serverId, gameId, bpId, targetLevel, trackType);
        if (result.error) return res.status(400).json({ error: result.message });
        return res.json(result);
    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: e.message, msg: '[BP:ClaimReward] error' });
    }
};

exports.claimAllRewards = async function (req, res) {
    try {
        const { id: userId, serverId, gameId } = req.player;
        const { bpId, targetLevel, trackType } = req.body;

        const result = await battlePassDB.claimAllBattlePassRewards(userId, serverId, gameId, bpId);
        if (result.error) return res.status(400).json({ error: result.message });
        return res.json(result);
    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: e.message, msg: '[BP:ClaimReward] error' });
    }
};

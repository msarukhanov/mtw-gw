const bountyDB = require('../db/bountyDB');

exports.refreshBoard = async function (req, res) {
    try {
        const { id: userId, serverId, gameId } = req.player;
        const { isPaidReroll } = req.body;

        const result = await bountyDB.refreshBountyBoard(userId, serverId, gameId, !!isPaidReroll);
        if (result.error) return res.status(400).json({ error: result.message });
        return res.json(result);
    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: e.message, msg: '[Bounty:Refresh] error' });
    }
};

exports.dispatchHeroes = async function (req, res) {
    try {
        const { id: userId, serverId, gameId } = req.player;
        const { instanceId, heroIdsArray } = req.body;

        const result = await bountyDB.dispatchHeroesToExpedition(userId, serverId, gameId, instanceId, heroIdsArray);
        if (result.error) return res.status(400).json({ error: result.message });
        return res.json(result);
    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: e.message, msg: '[Bounty:Dispatch] error' });
    }
};

exports.claimReward = async function (req, res) {
    try {
        const { id: userId, serverId, gameId } = req.player;
        const { instanceId } = req.body;

        const result = await bountyDB.claimBountyReward(userId, serverId, gameId, instanceId);
        if (result.error) return res.status(400).json({ error: result.message });
        return res.json(result);
    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: e.message, msg: '[Bounty:Claim] error' });
    }
};

exports.speedUpMission = async function (req, res) {
    try {
        const { id: userId, serverId, gameId } = req.player;
        const { instanceId } = req.body;

        const result = await bountyDB.speedUpBountyMission(userId, serverId, gameId, instanceId);
        if (result.error) return res.status(400).json({ error: result.message });
        return res.json(result);
    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: e.message, msg: '[Bounty:SpeedUp] error' });
    }
};
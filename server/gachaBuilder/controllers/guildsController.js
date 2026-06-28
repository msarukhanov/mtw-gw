const guildsDB = require('../db/guildsDB');

exports.createGuild = async function (req, res) {
    try {
        const { id: userId, serverId, gameId } = req.player;
        const { guildName } = req.body;

        const result = await guildsDB.createGuild(userId, serverId, gameId, guildName);
        if (result.error) return res.status(400).json({ error: result.message });
        return res.json(result);
    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: e.message, msg: '[Guilds:Create] error' });
    }
};

exports.searchGuilds = async function (req, res) {
    try {
        const { id: userId, serverId } = req.player;

        const result = await guildsDB.searchGuilds(userId, serverId);
        if (result.error) return res.status(400).json({ error: result.message });
        return res.json(result);
    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: e.message, msg: '[Guilds:Search] error' });
    }
};

exports.applyToGuild = async function (req, res) {
    try {
        const { id: userId, serverId, gameId } = req.player;
        const { targetGuildId } = req.body;

        const result = await guildsDB.applyToGuild(userId, serverId, gameId, targetGuildId);
        if (result.error) return res.status(400).json({ error: result.message });
        return res.json(result);
    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: e.message, msg: '[Guilds:Apply] error' });
    }
};

exports.getGuildRequests = async function (req, res) {
    try {
        const { id: userId, serverId } = req.player;

        const result = await guildsDB.getGuildRequestsList(userId, serverId);
        if (result.error) return res.status(400).json({ error: result.message });
        return res.json(result);
    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: e.message, msg: '[Guilds:GetRequests] error' });
    }
};

exports.handleRequest = async function (req, res) {
    try {
        const { id: userId, serverId, gameId } = req.player;
        const { candidateId, action } = req.body;

        const result = await guildsDB.handleGuildRequest(userId, serverId, gameId, candidateId, action);
        if (result.error) return res.status(400).json({ error: result.message });
        return res.json(result);
    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: e.message, msg: '[Guilds:HandleRequest] error' });
    }
};

exports.changeRank = async function (req, res) {
    try {
        const { id: userId, serverId, gameId } = req.player;
        const { targetMemberId, newRank } = req.body;

        const result = await guildsDB.changeMemberRank(userId, serverId, gameId, targetMemberId, newRank);
        if (result.error) return res.status(400).json({ error: result.message });
        return res.json(result);
    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: e.message, msg: '[Guilds:ChangeRank] error' });
    }
};

exports.submitTribute = async function (req, res) {
    try {
        const { id: userId, serverId, gameId } = req.player;
        const { tributeId } = req.body;

        const result = await guildsDB.submitGuildTribute(userId, serverId, gameId, tributeId);
        if (result.error) return res.status(400).json({ error: result.message });
        return res.json(result);
    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: e.message, msg: '[Guilds:SubmitTribute] error' });
    }
};

exports.leaveGuild = async function (req, res) {
    try {
        const { id: userId, serverId } = req.player;

        const result = await guildsDB.leaveGuild(userId, serverId);
        if (result.error) return res.status(400).json({ error: result.message });
        return res.json(result);
    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: e.message, msg: '[Guilds:Leave] error' });
    }
};

exports.kickMember = async function (req, res) {
    try {
        const { id: userId, serverId } = req.player;
        const { targetMemberId } = req.body;

        const result = await guildsDB.kickFromGuild(userId, serverId, targetMemberId);
        if (result.error) return res.status(400).json({ error: result.message });
        return res.json(result);
    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: e.message, msg: '[Guilds:Kick] error' });
    }
};

exports.disbandGuild = async function (req, res) {
    try {
        const { id: userId, serverId } = req.player;

        const result = await guildsDB.disbandGuild(userId, serverId);
        if (result.error) return res.status(400).json({ error: result.message });
        return res.json(result);
    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: e.message, msg: '[Guilds:Disband] error' });
    }
};

exports.getGuildMainData = async function (req, res) {
    try {
        const { id: userId, serverId } = req.player;

        const result = await guildsDB.getGuildMainData(userId, serverId);
        if (result.error) return res.status(400).json({ error: result.message });
        return res.json(result);
    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: e.message, msg: '[Guilds:Disband] error' });
    }
};

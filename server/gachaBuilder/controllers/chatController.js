const chatDB = require('../db/chatDB');

exports.getInitialState = async function (req, res) {
    try {
        const { id: userId, serverId, gameId } = req.player;

        const result = await chatDB.getInitialChatState(userId, serverId, gameId);
        if (result.error) return res.status(400).json({ error: result.message });
        return res.json(result);
    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: e.message, msg: '[Chat:GetInitialState] error' });
    }
};

exports.sendMessage = async function (req, res) {
    try {
        const { id: userId, serverId, gameId } = req.player;
        const packet = req.body;

        const result = await chatDB.saveChatMessage(userId, serverId, gameId, packet);
        if (result.error) return res.status(400).json({ error: result.message });
        return res.json(result);
    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: e.message, msg: '[Chat:SendMessage] error' });
    }
};

exports.markAsRead = async function (req, res) {
    try {
        const { id: userId, serverId, gameId } = req.player;
        const packet = req.body;

        const result = await chatDB.saveMarkAsRead(userId, serverId, gameId, packet);
        if (result.error) return res.status(400).json({ error: result.message });
        return res.json(result);
    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: e.message, msg: '[Chat:MarkAsRead] error' });
    }
};

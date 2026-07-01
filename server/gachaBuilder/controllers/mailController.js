const mailDB = require('../db/mailDB');

/**
 * МЕТОД 1: Получение списка всех писем при входе
 */
exports.getInitialState = async function (req, res) {
    try {
        const { id: userId, serverId, gameId } = req.player;

        const result = await mailDB.getInitialMailState(userId, serverId, gameId);
        if (result.error) return res.status(400).json({ error: result.message });
        return res.json(result);
    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: e.message, msg: '[Mail:GetInitialState] error' });
    }
};

/**
 * МЕТОД 2: Отметить письмо как прочитанное
 */
exports.markAsRead = async function (req, res) {
    try {
        const { id: userId, serverId, gameId } = req.player;
        const { mailId } = req.body;

        const result = await mailDB.markMailAsRead(userId, serverId, gameId, mailId);
        if (result.error) return res.status(400).json({ error: result.message });
        return res.json(result);
    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: e.message, msg: '[Mail:MarkAsRead] error' });
    }
};

/**
 * МЕТОД 3: Забрать награду из письма
 */
exports.claimReward = async function (req, res) {
    try {
        const { id: userId, serverId, gameId } = req.player;
        const { mailId } = req.body;

        const result = await mailDB.claimMailReward(userId, serverId, gameId, mailId);
        if (result.error) return res.status(400).json({ error: result.message });
        return res.json(result);
    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: e.message, msg: '[Mail:ClaimReward] error' });
    }
};

/**
 * МЕТОД 4: Удалить одно письмо
 */
exports.deleteMail = async function (req, res) {
    try {
        const { id: userId, serverId, gameId } = req.player;
        const { mailId } = req.body;

        const result = await mailDB.deleteSingleMail(userId, serverId, gameId, mailId);
        if (result.error) return res.status(400).json({ error: result.message });
        return res.json(result);
    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: e.message, msg: '[Mail:DeleteMail] error' });
    }
};

/**
 * МЕТОД 5: Очистить всю прочитанную пустую почту
 */
exports.clearTrashMail = async function (req, res) {
    try {
        const { id: userId, serverId, gameId } = req.player;

        const result = await mailDB.clearReadAndClaimedMail(userId, serverId, gameId);
        if (result.error) return res.status(400).json({ error: result.message });
        return res.json(result);
    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: e.message, msg: '[Mail:ClearTrash] error' });
    }
};

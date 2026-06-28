const questsDB = require('../db/questsDB');

exports.getQuestsState = async function (req, res) {
    try {
        const { id: userId, serverId, gameId } = req.player;
        const result = await questsDB.getPlayerQuestsState(userId, serverId, gameId);
        if (result.error) return res.status(400).json({ error: result.message });
        return res.json(result);
    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: e.message, msg: '[Quests:GetState] error' });
    }
};

exports.claimMilestone = async function (req, res) {
    try {
        const { id: userId, serverId, gameId } = req.player;
        const { boardType, milestoneIdx } = req.body;
        const result = await questsDB.claimQuestMilestone(userId, serverId, gameId, boardType, milestoneIdx);
        if (result.error) return res.status(400).json({ error: result.message });
        return res.json(result);
    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: e.message, msg: '[Quests:ClaimMilestone] error' });
    }
};

// НОВЫЙ МЕТОД ДЛЯ ЗАБОРА ЕЖЕДНЕВНОЙ НАГРАДЫ ЗА ВХОД
exports.claimDailyLogin = async function (req, res) {
    try {
        const { id: userId, serverId, gameId } = req.player;
        const { calendarId } = req.body; // передаем например "standard_monthly"
        const result = await questsDB.claimDailyLoginReward(userId, serverId, gameId, calendarId);
        if (result.error) return res.status(400).json({ error: result.message });
        return res.json(result);
    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: e.message, msg: '[Quests:ClaimDailyLogin] error' });
    }
};

exports.incrementQuestTask = async function (req, res) {
    try {
        const { id: userId, serverId, gameId } = req.player;
        const { triggerType, amount } = req.body; // передаем например "standard_monthly"
        const result = await questsDB.incrementQuestTask(userId, serverId, gameId, triggerType, amount);
        if (result.error) return res.status(400).json({ error: result.message });
        return res.json(result);
    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: e.message, msg: '[Quests:ClaimDailyLogin] error' });
    }
};

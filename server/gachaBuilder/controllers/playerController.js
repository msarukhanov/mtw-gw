const { gamesConfigDB } = require('../db/configDB');
const {getPlayerHistory} = require('../db/playersDB'); // Твой модуль работы с PostgreSQL

exports.playerHistory = async function (req, res) {
    try {
        const { username, sessionId, type } = req.body;
        const playerState = await getPlayerHistory(username, sessionId, type);
        if(playerState.err) {
            return res.status(400).json({ error: e.message, msg: '[Auth:Login] error' });
        }
        res.json({ ...playerState, server_time: Date.now() });
    } catch (e) {
        return res.status(400).json({ error: e.message, msg: '[Auth:Login] error' });
    }
};


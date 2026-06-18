// backend/controllers/authController.js
const { gamesConfigDB } = require('../db/configDB');
const { getOrCreatePlayer, logInServer } = require('../db/playersDB');

exports.initGame = async function (req, res) {
    try {
        const gameId = req.query.game_id;
        const config = gamesConfigDB[gameId];
        if (!config) return res.status(404).json({ error: "Game not found" });
        return res.json(config);
    } catch(e) {
        return res.status(400).json({ error: e.message, msg: '[Auth:InitGame] error' });
    }
};

exports.login = async function (req, res) {
    try {
        const { username, password, game_id, server_id, device_id } = req.body;
        const playerState = await getOrCreatePlayer(username, password, game_id, device_id);
        if(playerState.err) {
            return res.status(400).json({ error: e.message, msg: '[Auth:Login] error' });
        }
        res.json({ ...playerState, server_time: Date.now() });
    } catch (e) {
        return res.status(400).json({ error: e.message, msg: '[Auth:Login] error' });
    }
};

exports.enter = async function (req, res) {
    try {
        const { username, game_id, server_id, device_id } = req.body;
        const playerState = await logInServer(username, game_id, server_id, device_id);
        if(playerState.err) {
            return res.status(400).json({ error: e.message, msg: '[Auth:Login] error' });
        }
        res.json({ ...playerState, server_time: Date.now() });
    } catch (e) {
        return res.status(400).json({ error: e.message, msg: '[Auth:Login] error' });
    }
};

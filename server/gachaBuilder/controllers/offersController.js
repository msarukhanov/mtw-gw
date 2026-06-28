const offersDB = require('../db/offersDB');

exports.getActiveOffers = async function (req, res) {
    try {
        const { id: userId, serverId, gameId } = req.player;

        const result = await offersDB.getActiveOffersList(userId, serverId, gameId);
        if (result.error) return res.status(400).json({ error: result.message });
        return res.json(result);
    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: e.message, msg: '[Offers:GetActive] error' });
    }
};

exports.buyOfferBundle = async function (req, res) {
    try {
        const { id: userId, serverId, gameId } = req.player;
        const { offerId, count } = req.body;

        const result = await offersDB.buyLimitedOfferBundle(userId, serverId, gameId, offerId, count);
        if (result.error) return res.status(400).json({ error: result.message });
        return res.json(result);
    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: e.message, msg: '[Offers:BuyBundle] error' });
    }
};

exports.simulateOffer = async function (req, res) {
    try {
        const { id: userId, serverId, gameId } = req.player;
        const { offerId, minutes } = req.body; // передаешь например {"offerId": "trigger_boss_defeat_pack", "minutes": 5}

        const result = await offersDB.debugAddExpiredOffer(userId, serverId, gameId, offerId, minutes);
        if (result.error) return res.status(400).json({ error: result.message });

        return res.json(result);
    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: e.message });
    }
};
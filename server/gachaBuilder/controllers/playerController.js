const { gamesConfigDB } = require('../db/configDB');
const {getPlayerHistory} = require('../db/playersDB'); // Твой модуль работы с PostgreSQL

const friendsDB = require('../db/friendsDB');
const guildsDB = require('../db/guildsDB');
const questsDB = require('../db/questsDB');
const offersDB = require('../db/offersDB');
const battlePassDB = require('../db/battlePassDB');

exports.getFullDataPack = async function (req, res) {
    try {
        const { id: userId, serverId, gameId, bounty_missions } = req.player;

        // Параллельно вызываем все методы, чтобы не плодить await по очереди
        const [
            detailedFriendList,
            inboundFriendReqs,
            recommendationsFriend,
            blockedFriendList,

            guildMainData,
            playerQuestsState,
            activeOffersList,


        ] = await Promise.all([
            friendsDB.getFriendsDetailedList(userId, serverId, gameId),
            friendsDB.getInboundRequests(userId, serverId),
            friendsDB.getAddRecommendations(userId, serverId, gameId),
            friendsDB.getBlockedUsersList(userId, serverId),

            guildsDB.getGuildMainData(userId, serverId),
            questsDB.getPlayerQuestsState(userId, serverId, gameId),
            offersDB.getActiveOffersList(userId, serverId, gameId),
        ]);

        // Маппим ключи под точные названия, которые ждет твой сокет на фронтенде
        return res.json({
            friends: detailedFriendList.friends || [],
            friend_requests: inboundFriendReqs.friend_requests || [],
            friend_recommendations: recommendationsFriend.friend_recommendations || [],
            blacklist: blockedFriendList.blacklist || [],

            active_guild: guildMainData.active_guild || null,
            quests: playerQuestsState.quests,
            daily_login: playerQuestsState.daily_login,
            active_offers: activeOffersList.active_offers,
            bounty_missions: bounty_missions,

        });

    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: e.message, msg: '[Social:GetFullPack] error' });
    }
};

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


const friendsDB = require('../db/friendsDB');

exports.getFullFriendsDataPack = async function (req, res) {
    try {
        const { id: userId, serverId, gameId } = req.player;

        // Параллельно вызываем все методы, чтобы не плодить await по очереди
        const [detailedList, inboundReqs, recommendations, blockedList] = await Promise.all([
            friendsDB.getFriendsDetailedList(userId, serverId, gameId),
            friendsDB.getInboundRequests(userId, serverId),
            friendsDB.getAddRecommendations(userId, serverId, gameId),
            friendsDB.getBlockedUsersList(userId, serverId)
        ]);

        // Маппим ключи под точные названия, которые ждет твой сокет на фронтенде
        return res.json({
            friends: detailedList.friends || [],
            friend_requests: inboundReqs.friend_requests || [],             // Переименовали requests -> friend_requests
            friend_recommendations: recommendations.friend_recommendations || [],     // Переименовали list -> friend_recommendations
            blacklist: blockedList.blacklist || []
        });

    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: e.message, msg: '[Social:GetFullPack] error' });
    }
};


exports.getFriendsList = async function (req, res) {
    try {
        const { id: userId, serverId, gameId } = req.player;
        const result = await friendsDB.getFriendsDetailedList(userId, serverId, gameId);
        if (result.error) return res.status(400).json({ error: result.message });
        return res.json(result);
    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: e.message, msg: '[Social:FriendsList] error' });
    }
};

exports.getInboundRequests = async function (req, res) {
    try {
        const { id: userId, serverId } = req.player;
        const result = await friendsDB.getInboundRequests(userId, serverId);
        if (result.error) return res.status(400).json({ error: result.message });
        return res.json(result);
    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: e.message, msg: '[Social:InboundRequests] error' });
    }
};

exports.sendFriendRequest = async function (req, res) {
    try {
        const { id: userId, serverId, gameId } = req.player;
        const { targetFriendId } = req.body;
        const result = await friendsDB.sendFriendRequest(userId, serverId, gameId, targetFriendId);
        if (result.error) return res.status(400).json({ error: result.message });
        return res.json(result);
    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: e.message, msg: '[Social:SendRequest] error' });
    }
};

exports.acceptRequest = async function (req, res) {
    try {
        const { id: userId, serverId, gameId } = req.player;
        const { friendId } = req.body;
        const result = await friendsDB.acceptFriendRequest(userId, serverId, gameId, friendId);
        if (result.error) return res.status(400).json({ error: result.message });
        return res.json(result);
    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: e.message, msg: '[Social:AcceptRequest] error' });
    }
};

exports.declineRequest = async function (req, res) {
    try {
        const { id: userId, serverId, gameId } = req.player;
        const { targetFriendId } = req.body;
        const result = await friendsDB.declineFriendRequest(userId, serverId, gameId, targetFriendId);
        if (result.error) return res.status(400).json({ error: result.message });
        return res.json(result);
    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: e.message, msg: '[Social:SendRequest] error' });
    }
};

exports.sendHeart = async function (req, res) {
    try {
        const { id: userId, serverId, gameId } = req.player;
        const { friendId } = req.body;
        const result = await friendsDB.sendFriendHeart(userId, serverId, gameId, friendId);
        if (result.error) return res.status(400).json({ error: result.message });
        return res.json(result);
    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: e.message, msg: '[Social:SendHeart] error' });
    }
};

exports.removeFriend = async function (req, res) {
    try {
        const { id: userId, serverId, gameId } = req.player;
        const { friendId } = req.body;
        const result = await friendsDB.removeFriend(userId, serverId, gameId, friendId);
        if (result.error) return res.status(400).json({ error: result.message });
        return res.json(result);
    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: e.message, msg: '[Social:RemoveFriend] error' });
    }
};

exports.blockUser = async function (req, res) {
    try {
        const { id: userId, serverId, gameId } = req.player;
        const { targetId } = req.body;
        const result = await friendsDB.blockUser(userId, serverId, gameId, targetId);
        if (result.error) return res.status(400).json({ error: result.message });
        return res.json(result);
    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: e.message, msg: '[Social:BlockUser] error' });
    }
};

exports.getRecommendations = async function (req, res) {
    try {
        const { id: userId, serverId, gameId } = req.player;
        const result = await friendsDB.getAddRecommendations(userId, serverId, gameId);
        if (result.error) return res.status(400).json({ error: result.message });
        return res.json(result);
    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: e.message, msg: '[Social:Recommendations] error' });
    }
};

exports.getBlockedList = async function (req, res) {
    try {
        const { id: userId, serverId } = req.player;
        const result = await friendsDB.getBlockedUsersList(userId, serverId);
        if (result.error) return res.status(400).json({ error: result.message });
        return res.json(result);
    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: e.message, msg: '[Social:BlockedList] error' });
    }
};

exports.unblockRequest = async function (req, res) {
    try {
        const { id: userId, serverId } = req.player;
        const { targetId } = req.body; // Получаем ID удаляемого из ЧС пользователя

        const result = await friendsDB.unblockUser(userId, serverId, targetId);
        if (result.error) return res.status(400).json({ error: result.message });

        return res.json(result);
    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: e.message, msg: '[Social:UnblockUser] error' });
    }
};

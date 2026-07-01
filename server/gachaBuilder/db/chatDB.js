const crypto = require('crypto');

const { gamesConfigDB } = require('./configDB');
const guildDB = require('./guildsDB');
const { redisClient } = require('../../redisClient');
const { getCurrentIdleRate } = require('./_shared');
const Cache = require('./cacheManager');

function createMessageObject(userId, text, extra = {}) {
    return {
        id: crypto.randomBytes(8).toString('hex'),
        userId: String(userId),
        text: text.slice(0, 200),
        time: Date.now(),
        extra: extra
    };
}

async function pushTrimAndMarkRead(key, messageObj, maxLimit, userId, readTrackKey) {
    const rawData = JSON.stringify(messageObj);
    const multi = redisClient.multi();
    multi.rPush(key, rawData);
    multi.lTrim(key, -maxLimit, -1);
    multi.set(readTrackKey, messageObj.id);
    await multi.exec();
}

function applyUnreadFlags(messages, lastReadId) {
    if (messages.length === 0) return [];
    if (!lastReadId) return messages.map(m => ({ ...m, isUnread: true }));

    let foundLastRead = false;
    return messages.reverse().map(msg => {
        if (msg.id === lastReadId) foundLastRead = true;
        return { ...msg, isUnread: !foundLastRead };
    }).reverse();
}

async function getInitialChatState(userId, serverId, gameId) {
    try {
        const GameConfig = gamesConfigDB[gameId];
        const chatLimits = GameConfig?.mechanics?.chat_settings?.limits || {
            world: 50, server: 30, guild: 50, announcement: 30, pm: 30
        };

        const [worldRaw, serverRaw, annRaw] = await Promise.all([
            redisClient.lRange(`chat:world:${gameId}`, 0, -1),
            redisClient.lRange(`chat:server:${serverId}`, 0, -1),
            redisClient.lRange(`chat:announcements:${serverId}`, 0, -1)
        ]);

        const [lastReadWorld, lastReadServer, lastReadAnn] = await Promise.all([
            redisClient.get(`chat:read:${userId}:world:${gameId}`),
            redisClient.get(`chat:read:${userId}:server:${serverId}`),
            redisClient.get(`chat:read:${userId}:ann:${serverId}`)
        ]);

        const responseData = {
            chats: {
                world: applyUnreadFlags(worldRaw.map(m => JSON.parse(m)), lastReadWorld),
                server: applyUnreadFlags(serverRaw.map(m => JSON.parse(m)), lastReadServer),
                announcements: applyUnreadFlags(annRaw.map(m => JSON.parse(m)), lastReadAnn),
                guild: null,
                pm: {}
            }
        };

        const guildData = await guildDB.getGuildMainData(userId, serverId);
        if (guildData && !guildData.error && guildData.id) {
            const guildRaw = await redisClient.lRange(`chat:guild:${guildData.id}`, 0, -1);
            const lastReadGuild = await redisClient.get(`chat:read:${userId}:guild:${guildData.id}`);
            responseData.chats.guild = applyUnreadFlags(guildRaw.map(m => JSON.parse(m)), lastReadGuild);
        }

        // 4. Честный и быстрый сбор ВСЕХ личных сообщений (ПМ) игрока
        const pmPartners = await redisClient.sMembers(`chat:pm_partners:${userId}`);

        if (pmPartners && pmPartners.length > 0) {
            const pmDataPromises = pmPartners.map(async (partnerId) => {
                // ИСПРАВЛЕНО: Правильная склейка ключа через двоеточие, без запятых!
                const sortedIds = [String(userId), String(partnerId)].sort();
                const pmChatKey = `chat:pm:${sortedIds[0]}:${sortedIds[1]}`;

                // Забираем историю (до 30 сообщений)
                const messagesRaw = await redisClient.lRange(pmChatKey, 0, -1);
                if (messagesRaw.length === 0) return null;

                const messages = messagesRaw.map(m => JSON.parse(m));

                // Проверяем указатель прочтения конкретно для этой переписки
                const lastReadPm = await redisClient.get(`chat:read:${userId}:pm:${pmChatKey}`);
                const markedMessages = applyUnreadFlags(messages, lastReadPm);

                return { partnerId, messages: markedMessages };
            });

            const loadedPms = await Promise.all(pmDataPromises);

            loadedPms.forEach(item => {
                if (item) {
                    responseData.chats.pm[item.partnerId] = item.messages;
                }
            });
        }


        return responseData;
    } catch (err) {
        console.error('[chatDB:getInitialChatState] Error:', err);
        return { error: true, message: err.message };
    }
}

async function saveChatMessage(userId, serverId, gameId, packet) {
    try {
        // 1. ИСПРАВЛЕНО: Теперь packet есть в аргументах и корректно деструктуризируется
        const { channel, text, targetUserId } = packet;
        if (!text || text.trim() === "") return { error: true, message: "Текст пуст" };

        if (redisClient.isOpen && redisClient.isReady) {
            try {
                // Извлекаем объект игрока из твоего кэш-менеджера
                const player = await Cache.getPlayer(userId, serverId);
                if (!player) return { error: true, message: "Профиль игрока не найден в кэше" };

                const GameConfig = gamesConfigDB[gameId];
                const chatLimits = GameConfig?.mechanics?.chat_settings?.limits || {
                    world: 50, server: 30, guild: 50, announcement: 30, pm: 30
                };

                // ИСПРАВЛЕНО: Намертво зашиваем аватар и никнейм из кэша в extra сообщения
                const extraData = {
                    nickname: player.nickname || "Player",
                    avatar_icon: player.avatar_icon || "default_avatar.png"
                };

                const messageObj = createMessageObject(userId, text, extraData);
                const currentLimit = chatLimits[channel] || 30;

                let chatKey = '';
                let readTrackKey = '';

                if (channel === 'world') {
                    chatKey = `chat:world:${gameId}`;
                    readTrackKey = `chat:read:${userId}:world:${gameId}`;
                    await pushTrimAndMarkRead(chatKey, messageObj, currentLimit, userId, readTrackKey);

                    global.io.to(`game:${gameId}:world`).emit('player_update', {
                        type: 'chat',
                        data: { message: messageObj, channel: 'world' }
                    });
                }
                else if (channel === 'server') {
                    chatKey = `chat:server:${serverId}`;
                    readTrackKey = `chat:read:${userId}:server:${serverId}`;
                    await pushTrimAndMarkRead(chatKey, messageObj, currentLimit, userId, readTrackKey);

                    global.io.to(`server:${serverId}:zone`).emit('player_update', {
                        type: 'chat',
                        data: { message: messageObj, channel: 'server' }
                    });
                }
                else if (channel === 'announcement') {
                    chatKey = `chat:announcements:${serverId}`;
                    readTrackKey = `chat:read:${userId}:ann:${serverId}`;
                    messageObj.extra.isSystem = true;
                    await pushTrimAndMarkRead(chatKey, messageObj, currentLimit, userId, readTrackKey);

                    global.io.to(`server:${serverId}:zone`).emit('player_update', {
                        type: 'chat',
                        data: { message: messageObj, channel: 'announcement' }
                    });
                }
                else if (channel === 'guild') {
                    const guildData = await guildDB.getGuildMainData(userId, serverId);
                    if (!guildData || guildData.error || !guildData.id) return { error: true, message: "Нет гильдии" };

                    chatKey = `chat:guild:${guildData.id}`;
                    readTrackKey = `chat:read:${userId}:guild:${guildData.id}`;
                    if (guildData.leader_id === userId) messageObj.extra.isLeader = true;

                    await pushTrimAndMarkRead(chatKey, messageObj, currentLimit, userId, readTrackKey);

                    global.io.to(`guild:${guildData.id}`).emit('player_update', {
                        type: 'chat',
                        data: { message: messageObj, channel: 'guild' }
                    });
                }
                else if (channel === 'pm') {
                    if (!targetUserId) return { error: true, message: "Не указан получатель" };

                    // ИСПРАВЛЕНО: Правильная склейка ключа через двоеточие, без запятых!
                    const sortedIds = [String(userId), String(targetUserId)].sort();
                    chatKey = `chat:pm:${sortedIds[0]}:${sortedIds[1]}`;
                    readTrackKey = `chat:read:${userId}:pm:${chatKey}`;

                    // Сохраняем месседж и фиксируем связь партнеров в Redis Set
                    await Promise.all([
                        pushTrimAndMarkRead(chatKey, messageObj, currentLimit, userId, readTrackKey),
                        redisClient.sAdd(`chat:pm_partners:${userId}`, String(targetUserId)),
                        redisClient.sAdd(`chat:pm_partners:${targetUserId}`, String(userId))
                    ]);

                    // Рассылаем real-time пакеты обоим участникам (канал строго 'pm')
                    global.io.to(`p:${serverId}:${userId}`).emit('player_update', {
                        type: 'chat',
                        data: {
                            message: messageObj,
                            channel: 'pm',
                            chatPartnerId: targetUserId,
                            isUnread: false
                        }
                    });

                    global.io.to(`p:${serverId}:${targetUserId}`).emit('player_update', {
                        type: 'chat',
                        data: {
                            message: messageObj,
                            channel: 'pm',
                            chatPartnerId: userId,
                            isUnread: true
                        }
                    });
                }


                return { success: true };
            } catch (err) {
                console.error('[chatDB:saveChatMessage] Internal Error:', err);
                return { error: true, message: err.message };
            }
        } else {
            return { error: true, message: "Redis не готов" };
        }
    } catch (globalErr) {
        console.error('[chatDB:saveChatMessage] Global Error:', globalErr);
        return { error: true, message: globalErr.message };
    }
}


async function saveMarkAsRead(userId, serverId, gameId, packet) {
    try {
        const { channel, lastMessageId, targetUserId } = packet;
        if (!lastMessageId) return { error: true, message: "Нет ID сообщения" };

        let readTrackKey = '';
        if (channel === 'world') readTrackKey = `chat:read:${userId}:world:${gameId}`;
        else if (channel === 'server') readTrackKey = `chat:read:${userId}:server:${serverId}`;
        else if (channel === 'announcement') readTrackKey = `chat:read:${userId}:ann:${serverId}`;
        else if (channel === 'guild') {
            const guildData = await guildDB.getGuildMainData(userId, serverId);
            if (guildData?.id) readTrackKey = `chat:read:${userId}:guild:${guildData.id}`;
        }
        else if (channel === 'pm') {
            if (!targetUserId) return { error: true, message: "Нет собеседника" };
            const pair = [String(userId), String(targetUserId)].sort();
            readTrackKey = `chat:read:${userId}:pm:chat:pm:${pair}:${pair}`;
        }

        if (readTrackKey) await redisClient.set(readTrackKey, String(lastMessageId));

        return { action: 'marked_read_success', channel, lastMessageId, chatPartnerId: targetUserId };
    } catch (err) {
        console.error('[chatDB:saveMarkAsRead] Error:', err);
        return { error: true, message: err.message };
    }
}

module.exports = { getInitialChatState, saveChatMessage, saveMarkAsRead };

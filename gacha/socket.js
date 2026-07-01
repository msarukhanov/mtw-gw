import { SOCKET_URL } from './shared.js';
import { Game, updateState} from './stateManager.js';
import { showRewardsPopup } from './scripts/inventory/inventoryPopup.js';
import {renderGameUI} from "./render.js";

import {initCombatArenaScreen} from "./scripts/battle/combatArena.js";
import {initPvpArenaScreen} from "./scripts/battle/pvpArena.js";
import {initLeaderboardScreen} from "./leaderboard.js";

import {initFriendsScreen} from "./scripts/social/friends.js";
import {initGuildsScreen} from "./scripts/social/guilds.js";
import {initOffersScreen} from "./scripts/offers/offersScreen.js";
import {initBattlePassScreen} from "./scripts/game/battlePass.js";
import {initBountyScreen} from "./scripts/game/bountyScreen.js";
import {initQuestsScreen} from "./scripts/game/questsScreen.js";

import {initChatScreen} from "./scripts/social/chat.js";
import {initMailScreen} from "./scripts/social/mail.js";

window.socket = null;

const connectStates = {
    friend: false,
    guild: false,
    bounty: false,
    battlePass: false,
    quests: false,
    offers: false,
};

export function connect(userId, username, serverId, gameId, partnerId) {
    const socket = io(SOCKET_URL);
    socket.on('connect', () => {
        window.io = socket;
        setTimeout(() => {
            console.log('🚀 Sending handshake now...');
            socket.emit('platform_join', {
                userId,
                gameId,
                username,
                serverId,
                partnerId
            });
        }, 1000);
    });

    socket.on('platform_join', (upd)=>{
        console.log(upd);
        sendSocket('player', 'getFullDataPack', {});
        // updateState('MAIN_MENU');
    });

    socket.on('player_update', (upd)=>{
        console.log(upd);
        if(!upd || !upd.type || !upd.data || (upd.username !== Game.player.username && upd.type!=='chat')) return;

        const {type, data} = upd;

        if(data.resources) {
            updateResources(data.resources);
        }
        if(data.inventory) {
            Game.player.inventory = data.inventory;
            if(Game.gameState === 'INVENTORY') {
                renderGameUI();
            }
        }

        switch (type) {
            case 'award':
                if(data.add_resources || data.add_items) {
                    //show popup with new resources and items
                }
                break;
            case 'hero':
                if(data.heroes) {
                    Game.player.heroes = data.heroes;
                    if(Game.gameState === 'HEROES') {
                        renderGameUI();
                    }
                    if(Game.gameState === 'HERO_VIEW') {
                        renderGameUI();
                    }
                }
                break;
            case 'gacha':
                if(data.gacha_list) {
                    Game.gacha_list = data.gacha_list;

                    const gachaRewards = data.gacha_list;
                    const gachaGains = {};
                    if (Array.isArray(gachaRewards)) {
                        gachaRewards.forEach(reward => {
                            if (reward.type === 'duplicate_shard') {
                                const shardKey = `shard_${reward.id}`;
                                gachaGains[shardKey] = (gachaGains[shardKey] || 0) + reward.count;
                            } else if (reward.type === 'hero_new') {
                                // Поп-ап прочитает профайл героя из каталога по его ID
                                gachaGains[reward.id] = (gachaGains[reward.id] || 0) + 1;
                            }
                        });
                    }

                    // Вызываем вчерашний поп-ап для демонстрации улова из врат призыва!
                    if (Object.keys(gachaGains).length > 0) {
                        showRewardsPopup(gachaGains, () => {
                            if(Game.gameState === 'GACHA') {
                                renderGameUI();
                            }
                        });
                    }
                }
                break;
            case 'arena':
                if(data.arena_rating) {
                    Game.player.resources.arena_rating = data.arena_rating;
                    if(Game.gameState === 'PVP_ARENA') {
                        initPvpArenaScreen(Game.uiContainer, renderGameUI);
                    }
                }
                if(data.pvp_opponents) {
                    Game.pvp_opponents = data.pvp_opponents;
                    if(Game.gameState === 'PVP_ARENA') {
                        initPvpArenaScreen(Game.uiContainer, renderGameUI);
                    }
                }
                break;
            case 'battle':
                if (data.replay) {
                    if(data.pve_progress) {
                        Game.player.pve_progress = data.pve_progress;
                    }
                    Game.battleResult = data;
                    initCombatArenaScreen(renderGameUI);
                }
                break;
            case 'boss':
                if(data.boss_list) {
                    Game.boss_list = data.boss_list;
                    if(Game.gameState === 'PVE_BOSS') {
                        renderGameUI();
                    }
                }
                break;
            case 'shop':
                if(data) {
                    Game.shop = data;
                    if(Game.gameState === 'SHOP') {
                        renderGameUI();
                    }
                }
                break;
            case 'game':
                if(data) {
                    Game.shop = data;
                    if(Game.gameState === 'SHOP') {
                        renderGameUI();
                    }
                }
                break;
            case 'leaderboard':
                if (data) {
                    Game.leaderboard = data.leaderboard || [];
                    Game.my_rank = data.my_rank || null;

                    if (Game.gameState === 'LEADERBOARD') {
                        initLeaderboardScreen(Game.uiContainer, renderGameUI);
                    }
                }
                break;

            case 'friends':
                if (data) {
                    if(data.friends) {
                        Game.friends = data.friends || [];
                    }
                    if(data.friend_requests) {
                        Game.friend_requests = data.friend_requests || [];
                    }
                    if(data.friend_recommendations) {
                        Game.friend_recommendations = data.friend_recommendations || [];
                    }
                    if(data.blacklist) {
                        Game.blacklist = data.blacklist || [];
                    }

                    if (Game.gameState === 'FRIENDS') {
                        initFriendsScreen(Game.uiContainer, renderGameUI);
                    }
                }
                break;
            case 'guilds':
                if (data) {
                    Game.active_guild = data.active_guild || null;
                    Game.guilds_search_list = data.guilds_search_list || [];
                    Game.guild_incoming_requests = data.guild_incoming_requests || [];

                    if (Game.active_guild && Game.player) {
                        Game.player.guild_id = Game.active_guild.id;
                    } else if (!Game.active_guild && Game.player) {
                        Game.player.guild_id = null;
                    }

                    if (Game.gameState === 'GUILD') {
                        initGuildsScreen(Game.uiContainer, renderGameUI);
                    }
                }
                break;

            case 'chat':
                if (data) {
                    console.log('chat data ==== ', data);
                    // 1. ПЕРВИЧНАЯ ЗАГРУЗКА (getInitialState)
                    if (data.chats) {
                        Game.chats = data.chats;
                    }
                    // 2. РЕАЛ-ТАЙМ ОБНОВЛЕНИЕ СООБЩЕНИЯ (saveChatMessage)
                    else if (data.message && data.channel) {
                        console.log(data.channel, data.message);
                        let channel = data.channel;
                        if (channel === 'announcement') channel = 'announcements';

                        // Если по какой-то причине объекта еще нет в памяти, создаем его
                        if (!Game.chats) {
                            Game.chats = { world: [], server: [], announcements: [], guild: null, pm: {} };
                        }

                        if (channel === 'pm') {
                            const partnerId = data.chatPartnerId; // Забираем ИД собеседника из прилетевшего data
                            if (!Game.chats.pm[partnerId]) Game.chats.pm[partnerId] = [];

                            Game.chats.pm[partnerId] = [
                                ...Game.chats.pm[partnerId],
                                {
                                    ...data.message,
                                    isUnread: data.isUnread !== undefined ? data.isUnread : true
                                }
                            ];
                            if (Game.chats.pm[partnerId].length > 30) Game.chats.pm[partnerId].shift();
                        }
                        else {
                            if (!Game.chats[channel]) Game.chats[channel] = [];

                            Game.chats[channel].push(data.message);
                            console.log(Game.chats[channel]);

                            // Ограничиваем длину истории локально
                            if (Game.chats[channel].length > 50) {
                                Game.chats[channel] = Game.chats[channel].slice(-50);
                            }
                        }
                    }

                    // 3. ПОДТВЕРЖДЕНИЕ ПРОЧТЕНИЯ (markAsRead)
                    else if (data.lastMessageId) {
                        let channel = data.channel === 'announcement' ? 'announcements' : data.channel;

                        if (Game.chats && Game.chats[channel]) {
                            if (channel === 'pm' && data.chatPartnerId) {
                                const partnerId = data.chatPartnerId;
                                if (Game.chats.pm[partnerId]) {
                                    // Пересоздаем массив с измененными флагами прочтения для триггера UI
                                    Game.chats.pm[partnerId] = Game.chats.pm[partnerId].map(m => ({ ...m, isUnread: false }));
                                }
                            } else {
                                Game.chats[channel] = Game.chats[channel].map(m => ({ ...m, isUnread: false }));
                            }
                        }
                    }
                    console.log(Game.gameState);
                    // Если игрок сейчас на экране чата — перерисовываем UI
                    if (Game.gameState === 'CHAT') {
                        initChatScreen(Game.uiContainer, renderGameUI);
                    }
                }
                break;

            case 'mail':
                if (data) {
                    // А) Стартовая загрузка списка писем при входе/открытии ящика (от getInitialState)
                    if (data.mail_list) {
                        // Чтобы запустить реактивность по твоей схеме, пересоздаем массив через спред
                        Game.player_mail = [...data.mail_list];
                    }

                    // Б) Уведомление о новом письме в реальном времени (от LiveOps/рассылок)
                    else if (data.action === 'new_mail_notification') {
                        // Просто взводим флаг непрочитанной почты для отрисовки красной точки на иконке меню
                        Game.has_unread_mail = true;
                    }

                    // В) Письмо успешно прочитано на сервере (от markAsRead)
                    else if (data.action === 'marked_read_success' && data.mailId) {
                        if (Game.player_mail) {
                            Game.player_mail = Game.player_mail.map(m =>
                                String(m.id) === String(data.mailId) ? { ...m, is_read: true } : m
                            );
                        }
                    }

                    // Г) Награды успешно забраны из письма (от claimReward)
                    else if (data.action === 'claim_success' && data.mailId) {
                        if (Game.player_mail) {
                            Game.player_mail = Game.player_mail.map(m =>
                                String(m.id) === String(data.mailId) ? { ...m, is_read: true, is_claimed: true } : m
                            );
                        }
                        // Твой роутер на бэке уже положил свежие resources и inventory в корень ответа,
                        // поэтому они автоматически обновятся в Game через твой базовый слой!
                    }

                    // Д) Письмо успешно удалено одиночно (от deleteMail)
                    else if (data.action === 'delete_success' && data.mailId) {
                        if (Game.player_mail) {
                            Game.player_mail = Game.player_mail.filter(m => String(m.id) !== String(data.mailId));
                        }
                    }

                    // Е) Произошла массовая очистка ящика от мусора (от clearTrashMail)
                    else if (data.action === 'clear_comb_success') {
                        // Самый безопасный вариант, чтобы не считать фильтры на фронте —
                        // запрашиваем у бэкенда чистый свежий список ящика
                        sendSocket('mail', 'getInitialState', {});
                    }

                    // Если игрок сейчас физически находится на экране почты — реактивно перерисовываем UI
                    if (Game.gameState === 'MAIL') {
                        initMailScreen(Game.uiContainer, renderGameUI);
                    }
                }
                break;
            case 'offers':
                if (data) {
                    Game.active_offers = data.active_offers || [];

                    // Если у игрока открыт стейт акций или промо-ивента — мгновенно перерисовываем
                    if (Game.gameState === 'LIMITED_OFFERS') {
                        initOffersScreen(Game.uiContainer, renderGameUI);
                    }
                }
                break;
            case 'battlePass':
                if (data) {
                    Game.battle_passes = data.battle_passes || {};

                    if (Game.gameState === 'BATTLE_PASS') {
                        initBattlePassScreen(Game.uiContainer, renderGameUI);
                    }
                }
                break;
            case 'bounty':
                if (data) {
                    Game.bounty_missions = data.bounty_missions || [];

                    if (Game.gameState === 'BOUNTY') {
                        initBountyScreen(Game.uiContainer, renderGameUI);
                    }
                }
                break;
            case 'quests':
                if (data) {
                    Game.quests = data.quests || {};
                    // БАГ: Сюда забыли дописать сохранение данных календаря!
                    Game.daily_login = data.daily_login || {};

                    if (Game.gameState === 'QUESTS') {
                        initQuestsScreen(Game.uiContainer, renderGameUI);
                    }
                }
                break;

            case 'player':
                if (data) {
                    Game.active_guild = data.active_guild || null;
                    Game.guilds_search_list = data.guilds_search_list || [];
                    Game.guild_incoming_requests = data.guild_incoming_requests || [];

                    if (Game.active_guild && Game.player) {
                        Game.player.guild_id = Game.active_guild.id;
                    } else if (!Game.active_guild && Game.player) {
                        Game.player.guild_id = null;
                    }
                    Game.active_guild = data.active_guild || null;

                    if (Game.active_guild && Game.player) {
                        Game.player.guild_id = Game.active_guild.id;
                    } else if (!Game.active_guild && Game.player) {
                        Game.player.guild_id = null;
                    }

                    Game.active_offers = data.active_offers || [];
                    Game.battle_passes = data.battle_passes || {};
                    Game.bounty_missions = data.bounty_missions || [];
                    Game.quests = data.quests || {};
                    Game.daily_login = data.daily_login || {};

                    updateState('MAIN_MENU');
                    window.loaderControl.end();
                }
                break;
        }



        const gains = {};
        if (data.add_resources) {
            Object.entries(data.add_resources).forEach(([k, v]) => {
                // Для поп-апа нужны только положительные награды (минусовую цену списания не показываем)
                if (v > 0) gains[k] = v;
            });
        }
        if (data.add_items) {
            Object.entries(data.add_items).forEach(([k, v]) => {
                if (v > 0) gains[k] = v;
            });
        }

        // Взрываем вчерашний красивый поп-ап наград, если игроку что-то начислили!
        if (Object.keys(gains).length > 0) {
            showRewardsPopup(gains, () => {
                // Этот коллбэк сработает, когда юзер нажмет "ОК" в модалке
                if(Game.gameState === 'INVENTORY') {
                    renderGameUI();
                }
            });
        }
    })
}

export function sendSocket(type, method, data) {
    window.io.emit('player_request', {
        type, //грубо говоря контроллер
        method, // грубо говоря метод контроллера
        data,
        userId: Game.userId,
        username: Game.player.username,
        deviceId: Game.deviceId,
        serverId: Game.serverId,
        gameId: Game.gameId,
        partnerId: Game.partnerId
    });
}

function updateResources(resources) {
    if (resources) Game.player.resources = resources;
    if (resources.gold) {
        const walletDisplay = document.getElementById('gold-display');
        const formattedBal = '💰: ' + resources.gold;

        if (walletDisplay) walletDisplay.innerText = formattedBal;
    }
    if (resources.diamond) {
        const walletDisplay = document.getElementById('diamond-display');
        const formattedBal = '💎: ' + resources.diamond;

        if (walletDisplay) walletDisplay.innerText = formattedBal;
    }
}

function updateWallet(data) {
    // это для другого
    const walletDisplay = document.getElementById('gold-display');
    const bonusDisplay = document.getElementById('diamond-display');
    if (data.balance !== undefined) {
        const formattedBal = data.currency  + ': ' + data.realBalance;
        const formattedBonus = '💎: ' + data.bonusBalance;

        if (walletDisplay) walletDisplay.innerText = formattedBal;
        if (bonusDisplay) bonusDisplay.innerText = formattedBonus;
    }
}
import { SOCKET_URL } from './shared.js';
import { Game, updateState} from './stateManager.js';
import { showRewardsPopup } from './scripts/inventory/inventoryPopup.js';
import {renderGameUI} from "./render.js";

import {initCombatArenaScreen} from "./scripts/battle/combatArena.js";
import {initPvpArenaScreen} from "./scripts/battle/pvpArena.js";
import {initLeaderboardScreen} from "./leaderboard.js";

window.socket = null;

export function connect(username, serverId, partnerId) {
    const socket = io(SOCKET_URL);
    socket.on('connect', () => {
        window.io = socket;
        setTimeout(() => {
            console.log('🚀 Sending handshake now...');
            socket.emit('platform_join', {
                username,
                serverId,
                partnerId
            });
        }, 1000);
    });

    socket.on('platform_join', (upd)=>{
        console.log(upd);
        updateState('MAIN_MENU');
    });

    socket.on('player_update', (upd)=>{
        console.log(upd);
        if(!upd || !upd.type || !upd.data || upd.username !== Game.player.username) return;

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
                    Game.player.pve_progress = data.pve_progress;
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
                    // Записываем прилетевший топ-100 и ранг игрока в глобальный стейт Game
                    Game.leaderboard = data.leaderboard || [];
                    Game.my_rank = data.my_rank || null;

                    // Если игрок сейчас физически находится на экране Лидерборда — мгновенно перерисовываем UI!
                    if (Game.gameState === 'LEADERBOARD') {
                        // renderGameUI();
                        initLeaderboardScreen(Game.uiContainer, renderGameUI);
                    }
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
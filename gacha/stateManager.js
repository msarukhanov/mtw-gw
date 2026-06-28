import { renderGameUI } from './render.js';
import { initServerSelectScreen } from './serverSelect.js';

import { initHeroListScreen } from './scripts/hero/heroList.js';
import {initHeroViewScreen} from "./scripts/hero/heroView.js";

import {initGameListScreen} from "./scripts/game/gameList.js";
import { initGachaScreen } from './scripts/gacha/gacha.js';

import {initPlayerProfileScreen} from "./playerProfile.js";
import {initLeaderboardScreen} from "./leaderboard.js";

import { initShopScreen } from './scripts/shop/shopView.js';

import { initInventoryScreen } from './scripts/inventory/inventory.js';
import {initCraftScreen} from "./scripts/inventory/craft.js";

import {initArenaScreen} from './scripts/battle/arenaScreen.js';
import {initPreBattleScreen} from "./scripts/battle/preBattle.js";
import {initPveCampaignScreen} from "./scripts/battle/pveCampaign.js";
import {initPveTowerScreen} from "./scripts/battle/pveTower.js";
import {initPvpArenaScreen} from "./scripts/battle/pvpArena.js";
import {initBossListScreen} from "./scripts/battle/pveBossList.js"
import {initArenaBettingScreen} from "./scripts/battle/arenaBetting.js";

import {initFriendsScreen} from "./scripts/social/friends.js";
import {initGuildsScreen} from "./scripts/social/guilds.js";
import {initOffersScreen, destroyOffersScreen} from "./scripts/offers/offersScreen.js";
import {initBattlePassScreen} from "./scripts/game/battlePass.js";
import {initBountyScreen, destroyBountyScreen} from "./scripts/game/bountyScreen.js";
import {initQuestsScreen} from "./scripts/game/questsScreen.js";

export const Game = {
    config: null,
    player: null,
    gameState: 'LOADING',
    gameId: '', serverId: '', deviceId: '',
    locale: 'en',
    uiContainer: null,
    activeShopType: 'basic',
    activeHeroTab: 'stats'
};

const menuActions = {
    open_login: 'GAME_LOGIN',
    open_server_select: 'SERVER_SELECT',
    open_shop: 'SHOP',
    open_inventory: 'INVENTORY',
    open_heroes: 'HEROES',
    open_hero_view: 'HERO_VIEW',
    open_gacha: 'GACHA',
    open_games: 'GAMES',
    open_arena: 'ARENA',
    open_pve_campaign: 'PVE_CAMPAIGN',
    open_pve_tower: 'PVE_TOWER',
    open_pve_boss_list: 'PVE_BOSS_LIST',
    open_pvp_arena: 'PVP_ARENA',
    open_bets: 'BETS',
    open_profile: 'PROFILE',
    open_craft: 'CRAFT',
    open_leaderboard: 'LEADERBOARD',

    open_friends: 'FRIENDS',
    open_guild: 'GUILD',
    open_limited_offers: 'LIMITED_OFFERS',
    open_battle_pass: 'BATTLE_PASS',
    open_bounty: 'BOUNTY',
    open_quests: 'QUESTS',
};

const stateScreens = {
    GAME_LOGIN: 'screen_server_select',
    SERVER_SELECT: 'screen_server_select',
    MAIN_MENU: 'screen_main_menu',
    SHOP: 'screen_shop',
    GACHA: 'screen_gacha',
    INVENTORY: 'screen_inventory',
    HEROES: 'screen_heroes',
    HERO_VIEW: 'screen_hero',
    GAMES: 'screen_games',
    ARENA: 'screen_arena',
    PVP_ARENA: 'screen_pvp_arena',
    BETS: 'screen_bets',
    PVE_CAMPAIGN: 'screen_pve_campaign',
    PVE_TOWER: 'screen_pve_tower',
    PVE_BOSS_LIST: 'screen_pve_boss',
    PROFILE: 'screen_profile',
    CRAFT: 'screen_craft',
    LEADERBOARD: 'screen_leaderboard',

    FRIENDS: 'screen_friends',
    GUILD: 'screen_guild',
    LIMITED_OFFERS: 'screen_limited_offers',
    BATTLE_PASS: 'screen_battle_pass',
    BOUNTY: 'screen_bounty',
    QUESTS: 'screen_quests',
};

export const stateActions = {
    'GAME_LOGIN': initServerSelectScreen,
    'SERVER_SELECT': initServerSelectScreen,
    'SHOP': initShopScreen,
    'INVENTORY': initInventoryScreen,
    'HEROES': initHeroListScreen,
    'HERO_VIEW': initHeroViewScreen,
    'GACHA': initGachaScreen,
    'GAMES': initGameListScreen,
    'ARENA': initArenaScreen,
    'PROFILE': initPlayerProfileScreen,
    'CRAFT': initCraftScreen,
    'LEADERBOARD': initLeaderboardScreen,

    'PVE_CAMPAIGN': (container, cb) => initPveCampaignScreen(container, cb),
    'PVE_TOWER': (container, cb) => initPveTowerScreen(container, 'main_tower', cb),
    'PVP_ARENA': initPvpArenaScreen,
    'BETS': initArenaBettingScreen,
    'PVE_BOSS_LIST': initBossListScreen,

    'FRIENDS': initFriendsScreen,
    'GUILD': initGuildsScreen,
    'LIMITED_OFFERS': initOffersScreen,
    'BATTLE_PASS': initBattlePassScreen,
    'BOUNTY': initBountyScreen,
    'QUESTS': initQuestsScreen,
};

export function updateState(newState) {
    Game.gameState = newState;

    // Обновляем фон (наша умная нативная прокрутка)
    updateBackground(newState);

    // Передаем в рендер наш СТАБИЛЬНЫЙ объект действий AppActions
    renderGameUI(Game.uiContainer);
}

export function handleMenuAction(action) {
    if(menuActions[action]) {
        updateState(menuActions[action])
    }
}

export function screenOfState(state) {
    return stateScreens[state];
}

export function updateBackground(state) {
    const wrapper = document.getElementById('wrapper');
    const bgElement = document.getElementById('game-bg');
    const bgImg = document.getElementById('image-bg');
    if (!wrapper || !bgElement || !bgImg || !Game.config || !Game.config.ui) return;

    const orientation = Game.config.orientation || 'landscape';
    const widgets = Game.config.ui[orientation] || [];

    const orientationType = screen.orientation.type;   // e.g., "portrait-primary"
    const orientationAngle = screen.orientation.angle; // e.g., 0, 90, 180, 270
    const isLandscape =  orientationType.includes('landscape');
    const isPortrait =  orientationType.includes('portrait');
    console.log(`Type: ${orientationType}, Angle: ${orientationAngle}`, isLandscape, isPortrait);

    let screenWidgetId = stateScreens[state] ||'screen_main_menu';

    const screenMeta = widgets.find(w => w.id === screenWidgetId);

    const hasImage = !!(screenMeta && screenMeta.backgroundImage);
    bgImg.style.display = hasImage ? 'block' : 'none';

    // Функция сброса в стандартный фиксированный фолбэк (Строго 1 экран, нативный скролл ОТКЛЮЧЕН)
    const resetToFullscreen = () => {
        if (isLandscape) {
            bgImg.style.width = '100dvw';
            bgImg.style.height = '100dvh';
            bgImg.style.objectFit = 'cover'; // Картинка покроет экран без черных полос
            bgElement.style.width = '100dvw';
            bgElement.style.height = '100dvh';
        }
        else {
            bgImg.style.width = '100dvh';
            bgImg.style.height = '100dvw';
            bgImg.style.objectFit = 'cover'; // Картинка покроет экран без черных полос
            bgElement.style.width = '100dvh';
            bgElement.style.height = '100dvw';
        }

        wrapper.style.overflow = 'hidden';
    };

    if (hasImage) {
        bgImg.onload = () => {
            if (bgImg.getAttribute('src') !== screenMeta.backgroundImage) return;

            const imgWidth = bgImg.naturalWidth;
            const imgHeight = bgImg.naturalHeight;

            if (!imgWidth || !imgHeight) {
                resetToFullscreen();
                return;
            }

            const imgAspectRatio = imgWidth / imgHeight;

            const isScrollable = screenMeta.scrollable === true;

            if (state === 'MAIN_MENU' && isScrollable) {
                // Разрешаем нативный скролл браузера для прокрутки панорамы хаба
                wrapper.style.overflow = 'auto';

                // if (orientation === 'landscape') {
                if (isLandscape) {
                    // --- ЛАНДШАФТ ПАНOРАМА ---
                    const calculatedWidthPx = window.innerHeight * imgAspectRatio;
                    const targetVw = (calculatedWidthPx / window.innerWidth) * 100;
                    const targetWidthStr = `${targetVw}dvw`;

                    bgImg.style.width = targetWidthStr;
                    bgImg.style.height = '100dvh';
                    bgElement.style.width = targetWidthStr;
                    bgElement.style.height = '100dvh';

                    requestAnimationFrame(() => {
                        wrapper.scrollTo({
                            left: (wrapper.scrollWidth - window.innerWidth) / 2,
                            top: 0,
                            behavior: 'instant'
                        });
                    });
                } else {
                    // --- ПОРТРЕТ ПАНOРАМА ---
                    const calculatedHeightPx = window.innerWidth / imgAspectRatio;
                    const targetVh = (calculatedHeightPx / window.innerHeight) * 100;
                    const targetHeightStr = `${targetVh}dvh`;

                    bgImg.style.width = targetHeightStr;
                    bgImg.style.height = '100dvw';
                    bgElement.style.width = targetHeightStr;
                    bgElement.style.height = '100dvw';

                    requestAnimationFrame(() => {
                        wrapper.scrollTo({
                            left: 0,
                            top: (wrapper.scrollHeight - wrapper.clientHeight) / 2,
                            behavior: 'instant'
                        });
                    });
                }
            } else {
                // Если это любое другое окно или в главном меню выключен скролл (scrollable: false)
                resetToFullscreen();
            }
        };

        bgImg.src = screenMeta.backgroundImage;
    }
    else {
        bgImg.src = '';
        resetToFullscreen();
    }
}


window.updateState = updateState;
window.Game = Game;
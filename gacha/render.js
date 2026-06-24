// frontend/render.js

import { initServerSelectScreen } from './serverSelect.js';

import { initHeroListScreen } from './scripts/hero/heroList.js';
import {initHeroViewScreen} from "./scripts/hero/heroView.js";

import {initGameListScreen} from "./scripts/game/gameList.js";
import { initGachaScreen } from './scripts/gacha/gacha.js';

import {initPlayerProfileScreen} from "./playerProfile.js";
import {initLeaderboardScreen} from "./leaderboard.js";

// import { initShopScreen } from './scripts/inventory/shop.js';
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

import { DialogManager } from './dialogManager.js';

import {t, applyLayout, getFormattedTime} from './shared.js'
import {handleMenuAction, screenOfState, updateState, Game} from "./stateManager.js";



function getPlayerBarHTML() {
    // if (Game.gameState === 'LOADING' || Game.gameState === 'SERVER_SELECT') return '';
    if (Game.gameState !== 'MAIN_MENU') return '';

    const orientation = Game.config.orientation || 'landscape';
    const playerBar = Game.config.ui[orientation]?.find(w => w.id === 'player_bar');
    if (!playerBar) return '';

    const style = applyLayout(playerBar.layout);
    const expPercent = Math.min(100, ((Game.player.exp || 0) / (Game.player.max_exp || 1000)) * 100);

    return `
        <div class="ui-element" style="${style} display: flex; align-items: center; padding: 5px 10px; border-radius: 8px; box-sizing: border-box; overflow: hidden; border: 1px solid rgba(255,255,255,0.1);">
            
            <div data-ui-action="open_profile" style="height: 100%; aspect-ratio: 1/1; background: #333; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 24px; border: 2px solid #ffcc00; position: relative; box-sizing: border-box;overflow:hidden;">
                ${Game.player.avatar_icon ? `<img style="width:100%;" src="${Game.player.avatar_icon}">` :  '👤'}
                <div style="position: absolute; bottom: -2px; right: -2px; background: #e91e63; color: #fff; font-size: 9px; font-weight: bold; padding: 1px 4px; border-radius: 8px; border: 1px solid #fff;">
                    V${Game.player.vip_level}
                </div>
            </div>
            
            <div style="flex: 1; display: flex; flex-direction: column; justify-content: center; margin-left: 10px; min-width: 0;">
                
                <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                    <b style="font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 70%;">${Game.player.nickname}</b>
                    <span style="color: #4caf50; font-size: 11px; font-weight: bold;">Lvl ${Game.player.level}</span>
                </div>
                
                <div style="width: 100%; height: 5px; background: #444; border-radius: 3px; margin: 4px 0; overflow: hidden;">
                    <div style="width: ${expPercent}%; height: 100%; background: linear-gradient(90deg, #4caf50, #8bc34a);"></div>
                </div>

                <!-- НАСТОЯЩЕЕ СЕРВЕРНОЕ ВРЕМЯ (ПОЛНОСТЬЮ АДАПТИВНОЕ) -->
                <div style="display: flex; justify-content: space-between; font-size: 10px; color: #aaa; width: 100%;">
                    <span>${t('profile_server')}: <b style="color:#2196f3;">${Game.player.server_id.toUpperCase()}</b></span>
                    <span>${t('profile_server_time')}: <b style="color:#ffcc00;">${getFormattedTime(Game.serverTimeOffset)}</b></span>
                </div>

            </div>
        </div>
    `;
}

function getResourcesBarHTML() {
    // if (Game.gameState === 'LOADING' || Game.gameState === 'SERVER_SELECT') return '';
    if (['LOADING', 'GAME_LOGIN', 'SERVER_SELECT'].includes(Game.gameState)) return '';

    const orientation = Game.config.orientation || 'landscape';
    const resourceBar = Game.config.ui[orientation]?.find(w => w.id === 'resource_bar');
    if (!resourceBar) return '';

    const style = applyLayout(resourceBar.layout);
    const playerResources = Game.player?.resources || {};
    const configResources = Game.config?.mechanics?.resources || {};

    return `
        <div class="ui-element header-panel" style="${style}">
            <span id="gold-display" style="color: #ffcc00">${Game.player.currency||'💰'}: ${Game.player.resources.gold}</span>
            <span id="diamond-display" style="color: #00ffff">💎: ${Game.player.resources.diamond}</span>
        </div>
    `;
}

export function renderGameUI() {
    const container = Game.uiContainer;
    const townBgContainer = document.getElementById('game-bg');

    let staticHtml = '';
    let scrollableHtml = '';

    staticHtml += getPlayerBarHTML();
    staticHtml += getResourcesBarHTML();

    const orientation = Game.config.orientation || 'landscape';
    const widgets = Game.config.ui[orientation] || [];

    const screenSettings = Game.config.ui[orientation].find(w => w.id === screenOfState(Game.gameState)) || {};
    const screenWidgets = screenSettings.widgets || null;

    widgets.forEach(w => {
        if (w.type === 'button') {
            // ИСПРАВЛЕНО: Починен синтаксический краш (убрана лишняя скобка)
            if (w.onlyInWindows && ['LOADING', 'MAIN_MENU', 'GAME_LOGIN', 'SERVER_SELECT'].includes(Game.gameState)) return;
            if (!w.onlyInWindows && w.action.startsWith('open_') && Game.gameState !== 'MAIN_MENU') return;

            const label = Game.config?.localization?.ui?.[Game.locale]?.[w.label_loc_key] || w.label || '';

            const pos = w.layout?.textPosition || 'center';
            const size = w.layout?.textSize || '16px';
            const color = w.layout?.textColor || '#fff';

            // ИСПРАВЛЕНО: Умные стили вывески теперь действительно выталкивают текст ЗА рамки здания (через transform)
            let labelStyle = `font-size: ${size}; color: ${color}; font-weight: bold; white-space: normal; word-break: break-word; pointer-events: none; z-index: 5;`;
            let additionalStyle = '';

            if (pos === 'top') {
                labelStyle += 'top: 0;'; // Вывеска НАД крышей здания
            } else if (pos === 'bottom') {
                labelStyle += 'bottom: 0;'; // Вывеска ПОД фундаментом здания
            } else {
                labelStyle += 'top: 50%;'; // По центру строения
            }
            if (w.id === 'btn_back') {
                additionalStyle += 'z-index: 100;';
            }

            const buttonHtml = `
                <button class="btn ${w.id} ui-element ${w.layout?.animation || ''}" 
                        style="${applyLayout(w.layout)} ${additionalStyle}" 
                        data-ui-action="${w.action}">
                    <span style="${labelStyle}">${label}</span>
                </button>
            `;

            if (w.id === 'btn_back') {
                staticHtml += buttonHtml;
            } else {
                if (Game.gameState === 'MAIN_MENU') {
                    scrollableHtml += buttonHtml;
                }
            }
        }
    });

    // if(screenWidgets) {
    //     screenWidgets.forEach(w => {
    //         if (w.type === 'button') {
    //             const label = Game.config?.localization?.ui?.[Game.locale]?.[w.label_loc_key] || w.label || '';
    //
    //             const pos = w.layout?.textPosition || 'center';
    //             const size = w.layout?.textSize || '16px';
    //             const color = w.layout?.textColor || '#fff';
    //
    //             // ИСПРАВЛЕНО: Умные стили вывески теперь действительно выталкивают текст ЗА рамки здания (через transform)
    //             let labelStyle = `font-size: ${size}; color: ${color}; font-weight: bold; white-space: normal; word-break: break-word; pointer-events: none; z-index: 5;`;
    //             let additionalStyle = '';
    //
    //             if (pos === 'top') {
    //                 labelStyle += 'top: 0;'; // Вывеска НАД крышей здания
    //             } else if (pos === 'bottom') {
    //                 labelStyle += 'bottom: 0;'; // Вывеска ПОД фундаментом здания
    //             } else {
    //                 labelStyle += 'top: 50%;'; // По центру строения
    //             }
    //             if (w.id === 'btn_back') {
    //                 additionalStyle += 'z-index: 100;';
    //             }
    //
    //             const buttonHtml = `
    //                 <button class="btn ${w.id} ui-element ${w.layout?.animation || ''}"
    //                         style="${applyLayout(w.layout)} ${additionalStyle}"
    //                         data-ui-action="${w.action}">
    //                     <span style="${labelStyle}">${label}</span>
    //                 </button>
    //             `;
    //
    //             if (w.id === 'btn_back') {
    //                 staticHtml += buttonHtml;
    //             } else {
    //                 scrollableHtml += buttonHtml;
    //             }
    //         }
    //     });
    // }

    container.innerHTML = staticHtml;

    if(Game.gameState === 'MAIN_MENU') {
        DialogManager.trigger('FIRST_LOGIN', ()=>{
            DialogManager.trigger('FIRST_MENU');
        });

        const screenMeta = widgets.find(w => w.id === 'screen_main_menu') || {};
        const hl = screenMeta.home_hero_layout;

        if (hl) {
            const homeHeroInstance = Game.player.heroes?.find(h => h.instance_id === Game.player.active_home_hero);
            if (homeHeroInstance) {
                const prototype = Game.config.catalog?.heroes?.[homeHeroInstance.hero_id];
                if (prototype) {
                    let heroImageSrc = prototype.image || '';
                    if (homeHeroInstance.active_skin && prototype.skins) {
                        const currentSkin = prototype.skins.find(s => s.skin_id === homeHeroInstance.active_skin);
                        if (currentSkin && currentSkin.image) heroImageSrc = currentSkin.image;
                    }

                    // Строим Data-Driven стили для позиционирования персонажа на панораме
                    const formatValue = (val) => (typeof val === 'number' ? `${val}%` : val);
                    const heroStyle = `
                        position: absolute;
                        top: ${formatValue(hl.top || '40%')};
                        left: ${formatValue(hl.left || '50%')};
                        height: ${formatValue(hl.height || '50%')};
                        aspect-ratio: ${prototype.aspect_ratio || '9 / 16'};
                        background-image: url('${heroImageSrc}');
                        background-size: contain;
                        background-repeat: no-repeat;
                        background-position: center bottom;
                        z-index: ${hl.zIndex || 3};
                        pointer-events: auto;
                        cursor: pointer;
                    `.replace(/\s+/g, ' ');

                    scrollableHtml += `
                        <div class="home-companion-character ${hl.animation || ''}" 
                             style="${heroStyle}" 
                             data-ui-action="open_profile"> <!-- Клик по нему может вести в профиль или вызывать фразу -->
                        </div>
                    `;
                }
            }
        }
    }

    if (townBgContainer) {
        townBgContainer.innerHTML = scrollableHtml;
    }

    // --- РОУТИНГ МОДУЛЬНЫХ ОКОН ---
    const updateUiCallback = () => renderGameUI(container);

    // Безопасный Data-Driven маппинг стейтов на функции инициализации экранов
    const screensMap = {
        'GAME_LOGIN': initServerSelectScreen,
        'SERVER_SELECT': initServerSelectScreen,
        // 'SHOP': initShopScreen,
        'SHOP': initShopScreen,
        'INVENTORY': initInventoryScreen,
        'HEROES': initHeroListScreen, // Вызывает наш новый heroList с сетками и фильтрами
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
        'PVE_BOSS_LIST': initBossListScreen
    };

    const initScreenFn = screensMap[Game.gameState];
    if (initScreenFn) {
        const oldScreen = container.querySelector('.screen-content');
        if (oldScreen) oldScreen.remove();

        initScreenFn(container, updateUiCallback);
    }

    // --- УНИВЕРСАЛЬНАЯ ДЕЛЕГАЦИЯ КЛИКОВ НА ОБА СЛОЯ ---
    const bindActions = (targetElement) => {
        if (!targetElement) return;
        targetElement.querySelectorAll('[data-ui-action]').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                const action = btn.dataset.uiAction;
                if (action === 'go_back') {
                    const ctx = Game.pveContext || {};

                    // Сценарий 1: Мы находимся на экране боя -> возвращаем на предбатл этого же этапа
                    if (Game.gameState === 'COMBAT_ARENA') {
                        // Очищаем старый экран боя из DOM
                        const oldScreen = container.querySelector('.screen-content');
                        if (oldScreen) oldScreen.remove();

                        // Меняем стейт через твой нативный метод
                        updateState('PRE_BATTLE');

                        initPreBattleScreen(container, ctx.stageId, ctx.type, ctx.towerKey, updateUiCallback);
                    }

                    // Сценарий 2: Мы находимся на подготовке (PRE_BATTLE) -> возвращаем на карту или в башню
                    else if (Game.gameState === 'PRE_BATTLE') {
                        const oldScreen = container.querySelector('.screen-content');
                        if (oldScreen) oldScreen.remove();

                        // Возвращаем строго в тот стейт, из которого зашли (PVE_CAMPAIGN или PVE_TOWER)
                        const targetState = ctx.previousState || 'MAIN_MENU';
                        updateState(targetState);

                        if (targetState === 'PVE_CAMPAIGN') {
                            initPveCampaignScreen(container, updateUiCallback);
                        } else if (targetState === 'PVE_TOWER') {
                            initPveTowerScreen(container, ctx.towerKey, updateUiCallback);
                        } else if (targetState === 'PVP_ARENA') {
                            initPvpArenaScreen(container, updateUiCallback);
                        } else if (targetState === 'PVP_BOSS_LIST') {
                            initBossListScreen(container, ctx.towerKey, updateUiCallback);
                        }
                    }
                    // Сценарий 3: Базовый откат в главное лобби для остальных стандартных окон
                    else {
                        updateState('MAIN_MENU');
                    }
                }
                else handleMenuAction(action);
            };
        });
    };

    bindActions(container);
    bindActions(townBgContainer);
}


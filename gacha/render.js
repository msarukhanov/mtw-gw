

import { DialogManager } from './dialogManager.js';

import {t, applyLayout, getFormattedTime} from './shared.js'
import {handleMenuAction, screenOfState, updateState, stateActions, Game} from "./stateManager.js";


import {destroyOffersScreen} from "./scripts/offers/offersScreen.js";
import {destroyBountyScreen} from "./scripts/game/bountyScreen.js";

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
    if (['LOADING', 'GAME_LOGIN', 'SERVER_SELECT'].includes(Game.gameState)) return '';

    const orientation = Game.config.orientation || 'landscape';
    const resourceBar = Game.config.ui[orientation]?.find(w => w.id === 'resource_bar');
    if (!resourceBar) return '';

    const style = applyLayout(resourceBar.layout);

    // Безопасное чтение ресурсов во избежание краша UI
    const playerResources = Game.player?.resources || { gold: 0, diamond: 0 };

    let gold = parseInt(playerResources.gold) || 0;
    if (gold >= 1000000) {
        // Если делится без остатка (например, ровно 2M), убираем .0 с помощью parseFloat
        gold = parseFloat((gold / 1000000).toFixed(1)) + 'M';
    } else if (gold >= 10000) {
        gold = parseFloat((gold / 1000).toFixed(1)) + 'K';
    }

    let diamond = parseInt(playerResources.diamond) || 0;
    if (diamond >= 1000000) {
        diamond = parseFloat((diamond / 1000000).toFixed(1)) + 'M';
    } else if (diamond >= 10000) {
        diamond = parseFloat((diamond / 1000).toFixed(1)) + 'K';
    }

    return `
        <div class="ui-element header-panel" style="${style}">
            <span id="gold-display" style="color: #ffcc00">${Game.player?.currency || '💰'}: ${gold}</span>
            <span id="diamond-display" style="color: #00ffff">💎: ${diamond}</span>
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

    console.log(Game.gameState, screenSettings);

    widgets.forEach(w => {
        if (w.type === 'button' && w.id === 'btn_back') {
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

    if(screenWidgets) {
        screenWidgets.forEach(w => {
            if (w.type === 'button') {
                const label = Game.config?.localization?.ui?.[Game.locale]?.[w.label_loc_key] || w.label || '';

                const pos = w.layout?.textPosition || 'center';
                const size = w.layout?.textSize || '16px';
                const color = w.layout?.textColor || '#fff';
                const textTop = w.layout?.textTop;
                const textBG = w.layout?.textBG ;

                // ИСПРАВЛЕНО: Умные стили вывески теперь действительно выталкивают текст ЗА рамки здания (через transform) word-break: break-word;
                let labelStyle = `font-size: ${size}; color: ${color}; font-weight: bold; white-space: normal;  pointer-events: none; z-index: 5;   position: absolute;  width: 100%; left: 0;`;
                let additionalStyle = '';

                if(textTop) {
                    labelStyle += `top: 100% - ${textTop};`
                }
                else if (pos === 'top') {
                    labelStyle += `top: ${size};`; // Вывеска НАД крышей здания
                } else if (pos === 'bottom') {
                    labelStyle += `top: calc(100% - ${size});`; // Вывеска ПОД фундаментом здания
                } else {
                    labelStyle += 'top: 50%;'; // По центру строения
                }

                if (w.id === 'btn_back') {
                    additionalStyle += 'z-index: 100;';
                }

                if(w.layout?.shape === 'circle') {
                    additionalStyle += 'border-radius: 50%;  border: 1px solid;';
                }

                if(textBG) {
                    labelStyle += `background: ${textBG};  border-radius: 4px;`;
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
                    scrollableHtml += buttonHtml;
                }
            }
        });
    }

    container.innerHTML = staticHtml;

    if (Game.gameState === 'OFFERS') {
        destroyOffersScreen();
    }
    if (Game.gameState === 'BOUNTY') {
        destroyBountyScreen();
    }

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

    const initScreenFn = stateActions[Game.gameState];
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



// Эту функцию ты вызываешь внутри генератора HTML Главного Меню (в зоне иконок-виджетов)
export function getMainMenuOffersBadgesHTML() {
    const activeOffers = Game.active_offers || [];
    const poolConfig = Game.config?.limited_offers?.offers_pool || {};
    const now = Date.now();

    // Фильтруем только живые акции
    const liveOffers = activeOffers.filter(o => o.expires_at > now);

    return liveOffers.map(o => {
        const meta = poolConfig[o.offer_id];
        if (!meta) return '';

        // Вычисляем процент скидки для баджа (например, 70% OFF)
        const discountBadge = meta.old_cost?.amount ? t('off_badge_discount') : 'HOT!';

        return `
            <div class="hud-offer-badge" data-oid="${o.offer_id}" style="width: 50px; height: 50px; background: #1a1a1a; border: 2px solid #e94560; border-radius: 8px; display: flex; flex-direction: column; align-items: center; justify-content: center; position: relative; cursor: pointer; pointer-events: auto; box-shadow: 0 0 8px rgba(233,69,96,0.4); animation: pulse 2s infinite;">
                <!-- Маленькая плашка скидки, цвет берем из настроек конфига -->
                <div style="position: absolute; top: -6px; right: -6px; background: ${Game.config?.limited_offers?.settings?.global_discount_badge_color || '#ffeb3b'}; color: #000; font-size: 8px; font-weight: bold; padding: 1px 4px; border-radius: 3px; border: 1px solid #000; scale: 0.9;">
                    ${discountBadge}
                </div>
                <!-- Иконка (можно завязать на ui_mode или тип) -->
                <span style="font-size: 16px;">${meta.cost?.resource === 'usd' ? '💎' : '🎁'}</span>
                <!-- Крошечный FOMO таймер -->
                <span class="hud-fomo-timer" data-expire="${o.expires_at}" style="font-size: 8px; font-family: monospace; color: #fff; margin-top: 2px; background: #000; padding: 0 2px; border-radius: 2px;">
                    00:00
                </span>
            </div>
        `;
    }).join('');
}

// https://cdnjs.cloudflare.com/ajax/libs/model-viewer/4.3.1/model-viewer.min.js

// <model-viewer
// src="имя_вашего_файла.glb"
// autoplay
// camera-controls
// shadow-intensity="1"
// auto-rotate
// style="width: 100%; height: 600px; background-color: transparent;">
//     </model-viewer>

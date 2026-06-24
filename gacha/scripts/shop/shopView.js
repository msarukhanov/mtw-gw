import { Game } from '../../stateManager.js';
import {API_URL, headers, t, locObj, getWindowContentStyle} from "../../shared.js";
import { openBuyModal } from './shopModal.js'; // Модалку вынесем в отдельный файл на следующем шаге
import {sendSocket} from "../../socket.js";

// Глобальный стейт текущего экрана магазина (по аналогии с вашим ListFilters)
const ShopFilters = {
    currentShopId: 'random_market', // ID активного магазина
    shopsData: {} // Здесь будем кэшировать данные, пришедшие от бэкенда { random_market: { state, refresh_settings } }
};

/**
 * Главная функция генерации HTML-разметки магазина
 */
export function getShopHTML() {
    const orientation = Game.config.orientation || 'landscape';
    const screenSettings = Game.config?.ui?.[orientation]?.find(w => w.id === 'screen_shop') || {};
    const listSettings = screenSettings.list_settings || {};

    const gridColumns = listSettings.grid_columns || 4;
    const rowHeight = listSettings.grid_row_height || "155px";
    const gap = listSettings.gap || "2%";
    const padding = listSettings.padding || "12px";

    const activeShopId = ShopFilters.currentShopId;
    const activeShopConfig = Game.config.catalog.shops[activeShopId];
    const serverState = ShopFilters.shopsData[activeShopId]?.state;

    // --- 1. ЛЕВОЕ МЕНЮ (САЙДБАР НА ВСЮ ВЫСОТУ) ---
    const sortedShops = Object.entries(Game.config.catalog.shops)
        .sort((a, b) => (a.order || 0) - (b.order || 0));

    const sidebarHTML = `
        <div class="sidebar-filters" style="display: flex; flex-direction: column; align-items: center; border-right: 1px solid #333; padding: 5px; box-sizing: border-box; height: 100%; width: 110px; flex-shrink: 0; background: #222222;">
            <div style="display: flex; flex-direction: column; width: 100%; gap: 6px; pointer-events: auto; overflow-y: auto; flex: 1;">
                ${sortedShops.map(([id, s]) => {
        const isActive = activeShopId === id;
        const isTabLocked = (Game.player.level < s.requirements.player_level) || (Game.player.vip_level < s.requirements.vip_level);

        return `
                        <button class="btn-shop-tab" data-shop-id="${id}" style="width: 100%; min-height: 45px; background: ${isActive ? '#ffcc00' : '#111'}; color: ${isActive ? '#000' : '#fff'}; border: 2px solid ${isActive ? '#ffcc00' : '#444'}; border-radius: 6px; padding: 4px; cursor: pointer; font-size: 11px; font-weight: bold; flex-shrink: 0;">
                            ${isTabLocked ? '🔒 ' : ''}${locObj(s.title_loc)}
                        </button>
                    `;
    }).join('')}
            </div>
        </div>
    `;

// Читаем новые настройки хедера из конфига UI с фолбэками
    const headerHeight = listSettings.header_height || "40px";
    const headerBg = listSettings.header_background || "#1a1a1a";

    const rightContentHeaderHTML = `
    <div class="shop-header" style="width: 100%; height: ${headerHeight}; display: flex; align-items: center; justify-content: space-between; padding: 0 15px; box-sizing: border-box; border-bottom: 1px solid #333; background: ${headerBg}; flex-shrink: 0; pointer-events: auto;">
        <!-- Тайтл активного магазина слева -->
        <div style="font-size: 14px; color: #ffcc00; font-weight: bold;">
            🛒 <span>${activeShopConfig ? locObj(activeShopConfig.title_loc) : ''}</span>
        </div>

        <!-- Правый блок: Таймер авто-обновления + Кнопка ручного обновления -->
        <div style="display: flex; align-items: center; gap: 15px;">
            <!-- Текстовый таймер обратного отсчета (если у магазина включен авто-рефреш) -->
            ${activeShopConfig?.refresh_settings?.auto_refresh_interval_ms > 0 ? `
                <div style="font-size: 11px; color: #aaa; font-family: monospace;">
                    <span>${t('next_refresh') || 'Сброс через'}:</span>
                    <span id="shop-auto-refresh-timer" style="color: #fff; font-weight: bold;">--:--:--</span>
                </div>
            ` : ''}

            <!-- Кнопка обновления -->
            ${activeShopConfig?.refresh_settings?.manual_refresh_cost ? `
                <button id="btn-shop-manual-refresh" style="height: 26px; padding: 0 10px; background: #222; color: #fff; border: 1px solid #444; border-radius: 4px; font-size: 11px; font-weight: bold; cursor: pointer; display: flex; align-items: center; gap: 6px;">
                    <span>${t('refresh_btn') || 'Обновить'}</span>
                    <span style="color: #ffcc00;">${activeShopConfig.refresh_settings.manual_refresh_cost.amount} 🔮</span>
                </button>
            ` : ''}
        </div>
    </div>
`;


    // --- 3. СЕТКА ТОВАРОВ ---
    let gridContentHTML = '';
    if (ShopFilters.shopsData[activeShopId]?.is_locked) {
        const reqs = activeShopConfig.requirements;
        gridContentHTML = `
            <div style="color:#ff4444; padding:40px; width:100%; text-align:center; font-size:14px; font-weight:bold;">
                🔒 ${t('shop_locked_msg')} (Требуется: Ур. ${reqs.player_level}, VIP ${reqs.vip_level})
            </div>
        `;
    } else if (!serverState || !serverState.showcase || serverState.showcase.length === 0) {
        gridContentHTML = `<div style="color:#aaa; padding:20px; width:100%; text-align:center; font-size:12px;">${t('loading')}...</div>`;
    } else {
        gridContentHTML = serverState.showcase.map(slot => {
            const itemProto = Game.config.catalog.items[slot.itemId];
            const isSoldOut = slot.bought_count >= slot.buy_limit;
            const isCash = slot.cost.resource === 'usd';
            const displayPrice = isCash ? `$${slot.cost.amount.toFixed(2)}` : slot.cost.amount;
            const currencyIcon = isCash ? '💵' : (Game.config.mechanics?.resources?.[slot.cost.resource]?.icon || '🔮');

            let cardStyle = `background: ${listSettings.card_layout?.backgroundColor || '#1e1e1e'}; border: 1px solid #444; border-radius: ${listSettings.card_layout?.borderRadius || '8px'}; padding: 10px; display: flex; flex-direction: column; align-items: center; justify-content: space-between; position: relative; box-sizing: border-box; text-align: center; height: 100%;`;
            if (isSoldOut) cardStyle += 'opacity: 0.5;';

            return `
                <div class="shop-card ${isSoldOut ? '' : 'shop-card-clickable'}" data-slot-id="${slot.slotId}" style="${cardStyle}">
                    <div style="position: absolute; top: 5px; right: 8px; font-size: 10px; color: #888;">
                        ${slot.bought_count}/${slot.buy_limit}
                    </div>

                    <div style="font-size: 36px; margin-top: 10px; position: relative;">
                        ${itemProto?.icon || '📦'}
                        <span style="position: absolute; bottom: -5px; right: -10px; background: rgba(0,0,0,0.8); color: #fff; font-size: 10px; padding: 1px 5px; border-radius: 10px; font-weight: bold;">
                            x${slot.amount}
                        </span>
                    </div>

                    <div style="font-size: ${listSettings.card_layout?.title_font_size || '12px'}; color: #fff; margin: 10px 0 5px 0; font-weight: bold; min-height: 32px; display: flex; align-items: center; justify-content: center;">
                        ${itemProto ? locObj(itemProto.title_loc) : slot.itemId}
                    </div>

                    <div style="min-height: 14px; font-size: 10px; color: #666; text-decoration: line-through;">
                        ${slot.old_cost ? `${isCash ? `$${slot.old_cost.amount.toFixed(2)}` : slot.old_cost.amount}` : ''}
                    </div>

                    ${isSoldOut ? `
                        <div style="width: 100%; height: 26px; background: ${listSettings.card_layout?.sold_out_bg || '#333'}; color: ${listSettings.card_layout?.sold_out_color || '#ff3333'}; font-weight: bold; border-radius: 4px; display: flex; align-items: center; justify-content: center; font-size: 11px;">
                            SOLD OUT
                        </div>
                    ` : `
                        <button style="width: 100%; height: 26px; background: ${listSettings.card_layout?.accent_color || '#ffcc00'}; color: #000; border: none; border-radius: 4px; font-weight: bold; font-size: ${listSettings.card_layout?.price_font_size || '12px'}; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 4px;">
                            <span>${displayPrice}</span><span>${currencyIcon}</span>
                        </button>
                    `}
                </div>
            `;
        }).join('');
    }

    const gridStyle = `display: grid; grid-template-columns: repeat(${gridColumns}, 1fr); grid-auto-rows: ${rowHeight}; gap: ${gap}; width: 100%; height: 100%; overflow-y: auto; box-sizing: border-box; padding: ${padding}; pointer-events: auto;`;

    // ФИНАЛЬНАЯ СБОРКА: Сайдбар слева на 100% высоты, а справа - flex-column блок с хедером и сеткой
    return `
        <div class="screen-content ui-element" style="${getWindowContentStyle()} display: flex; flex-direction: row; box-sizing: border-box; top: 45px; height: calc(100% - 45px); overflow: hidden;">
            ${sidebarHTML}
            <div class="shop-right-content-area" style="display: flex; flex-direction: column; flex: 1; height: 100%; overflow: hidden;">
                ${rightContentHeaderHTML}
                <div class="shop-grid-container" style="${gridStyle}">
                    ${gridContentHTML}
                </div>
            </div>
        </div>
    `;
}


const fetchShopData = () => {
    sendSocket('shop','getShopState', { shopId: ShopFilters.currentShopId });
};

/**
 * Инициализация экрана магазина (обработчики событий, AJAX-запросы)
 */
export function initShopScreen(container, updateUiCallback) {
    const activeShopId = ShopFilters.currentShopId;
    const activeShopConfig = Game.config.catalog.shops[activeShopId];

    const refreshUI = () => {
        const oldScreen = container.querySelector('.screen-content');
        if (oldScreen) oldScreen.remove();
        initShopScreen(container, updateUiCallback);
    };

    // Вспомогательная функция для отправки POST-запросов на ваш бэкенд

    const bindEvents = () => {
        // Переключение вкладок магазинов слева
        container.querySelectorAll('.btn-shop-tab').forEach(btn => {
            btn.onclick = () => {
                ShopFilters.currentShopId = btn.dataset.shopId;
                fetchShopData();
                // При переключении вкладок делаем ленивый запрос к бэку
                // initShopScreen(container, updateUiCallback);
            };
        });

        // Кнопка ручного обновления витрины за алмазы
        const btnRefresh = container.querySelector('#btn-shop-manual-refresh');
        if (btnRefresh) {
            btnRefresh.onclick = async () => {
                try {
                    sendSocket('shop','refreshShopManual', { shopId: ShopFilters.currentShopId });
                    // const res = await fetch(API_URL+'/shop/refresh-manual', {
                    //     method: 'POST',
                    //     headers,
                    //     body: JSON.stringify({ userId: Game.player.user_id, serverId: Game.player.server_id, shopId: activeShopId })
                    // });
                    // const data = await res.json();
                    // if (data.success) {
                    //     ShopFilters.shopsData[activeShopId].state = data.state;
                    //     // Обновляем ресурсы игрока на фронте, чтобы сразу изменился баланс на верхней панели
                    //     Game.player.resources = data.resources;
                    //     updateUiCallback(); // Триггерим ваш глобальный коллбэк обновления хедера валют
                    //     refreshUI();
                    // } else {
                    //     alert(data.message || data.error);
                    // }
                } catch (e) {
                    alert("Ошибка при обновлении магазина");
                }
            };
        }

        // Клик по доступной карточке товара (открытие модального окна покупки нескольких штук)
        container.querySelectorAll('.shop-card-clickable').forEach(card => {
            card.onclick = () => {
                const slotId = card.dataset.slotId;
                const serverState = ShopFilters.shopsData[activeShopId].state;
                const slotItem = serverState.showcase.find(s => s.slotId === slotId);

                // Вызываем функцию модального окна (напишем её в Части 2)
                openBuyModal(activeShopId, slotItem, (newResources, newState) => {
                    // Коллбэк при успешной покупке: обновляем данные в кэше фронтенда
                    ShopFilters.shopsData[activeShopId].state = newState;
                    Game.player.resources = newResources;

                    updateUiCallback(); // Обновляем хедер валют
                    refreshUI();        // Перерисовываем витрину магазина
                });
            };
        });
    };

    if (window.shopTimerInterval) {
        clearInterval(window.shopTimerInterval);
        window.shopTimerInterval = null;
    }

    const startTimer = () => {
        if (window.shopTimerInterval) {
            clearInterval(window.shopTimerInterval);
            window.shopTimerInterval = null;
        }

        const timerElement = container.querySelector('#shop-auto-refresh-timer');
        const shopState = ShopFilters.shopsData[activeShopId]?.state;
        const intervalMs = activeShopConfig?.refresh_settings?.auto_refresh_interval_ms || 0;

        if (timerElement && shopState?.last_auto_refresh && intervalMs > 0) {
            const nextRefreshTime = shopState.last_auto_refresh + intervalMs;

            const updateTimerTicker = () => {
                const now = Date.now();
                const diff = nextRefreshTime - now;

                if (diff <= 0) {
                    clearInterval(window.shopTimerInterval);
                    fetchShopData();
                    return;
                }

                const seconds = Math.floor((diff / 1000) % 60);
                const minutes = Math.floor((diff / (1000 * 60)) % 60);
                const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);

                const pad = (num) => String(num).padStart(2, '0');
                timerElement.innerText = `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
            };

            updateTimerTicker();
            window.shopTimerInterval = setInterval(updateTimerTicker, 1000);
        }
    };

    if(Game.shop) {
        if(Game.shop.error) {
            alert(`Error: ${Game.shop.error}`);
        }
        else if (!Game.shop.is_locked) {
            ShopFilters.shopsData[activeShopId] = { state: Game.shop.state, refresh_settings: Game.shop.refresh_settings, id: activeShopId };
        } else {
            ShopFilters.shopsData[activeShopId] = { is_locked: true, id: activeShopId };
        }
        // Перерисовываем экран после получения свежих данных от бэкенда
        const oldScreen = container.querySelector('.screen-content');
        if (oldScreen) oldScreen.remove();
        container.insertAdjacentHTML('beforeend', getShopHTML());

        bindEvents();
        startTimer();
    }

    if (!ShopFilters.shopsData[activeShopId]) {
        container.insertAdjacentHTML('beforeend', getShopHTML());
        // bindEvents();
        fetchShopData();
        return;
    }
    // const fetchShopData = async () => {
    //     try {
    //         const res = await fetch(API_URL+'/shop/state', {
    //             method: 'POST',
    //             headers,
    //             body: JSON.stringify({ userId: Game.player.user_id, serverId: Game.player.server_id, shopId: activeShopId })
    //         });
    //         const data = await res.json();
    //
    //         if (data.success) {
    //             ShopFilters.shopsData[activeShopId] = { state: data.state, refresh_settings: data.refresh_settings };
    //         } else if (data.is_locked) {
    //             ShopFilters.shopsData[activeShopId] = { is_locked: true };
    //         } else {
    //             alert(`Ошибка: ${data.error}`);
    //         }
    //         // Перерисовываем экран после получения свежих данных от бэкенда
    //         const oldScreen = container.querySelector('.screen-content');
    //         if (oldScreen) oldScreen.remove();
    //         container.insertAdjacentHTML('beforeend', getShopHTML());
    //         bindEvents();
    //     } catch (e) {
    //         console.error(e);
    //         alert("Ошибка загрузки данных магазина");
    //     }
    // };


    // else {
    //     container.insertAdjacentHTML('beforeend', getShopHTML());
    //     bindEvents();
    //     startTimer(); // ИСПРАВЛЕНО: Если данные уже в кэше, запускаем таймер сразу
    // }
}


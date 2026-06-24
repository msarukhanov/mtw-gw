import { Game } from '../../stateManager.js';
import { API_URL, t, locObj, headers } from "../../shared.js";
import { InventoryState } from './inventory.js';
import { showRewardsPopup } from './inventoryPopup.js';
import {sendSocket} from "../../socket.js";

// Храним локальное количество для массовых операций выбранного в данный момент предмета
let currentActionCount = 1;

/**
 * 1. РЕНДЕРИНГ ТРЕТЬЕЙ КОЛОНКИ (ПАНЕЛЬ ИНФО И ДЕЙСТВИЙ)
 */
export function renderDetailsPanel(itemId, playerInventory, rarityColors, panelWidth) {
    if (!itemId || !playerInventory[itemId]) {
        return `
            <div class="inventory-details-panel" style="width: ${panelWidth}; height: 100%; background: #1a1a1a; border-left: 1px solid #333; display: flex; align-items: center; justify-content: center; color: #666; font-size: 12px; padding: 15px; box-sizing: border-box;">
                ${t('inv_no_selection') || 'Select an item'}
            </div>
        `;
    }

    const meta = Game.config?.catalog?.items?.[itemId];
    const count = playerInventory[itemId];

    // ВАЛИДАЦИЯ: Безопасное определение цвета рамки и текстов
    const borderColor = meta?.rarity ? (rarityColors[meta.rarity] || '#444') : '#444';
    const itemTitle = meta?.title_loc ? locObj(meta.title_loc) : itemId;
    const itemDesc = meta?.desc_loc ? locObj(meta.desc_loc) : (t('inv_no_desc') || 'No description available.');
    const itemIcon = meta?.icon || '📦';

    if (currentActionCount > count) currentActionCount = count;
    if (currentActionCount <= 0 && count > 0) currentActionCount = 1;

    // Сбор характеристик (stats)
    let statsHTML = '';
    if (meta?.stats && Object.keys(meta.stats).length > 0) {
        statsHTML = `
            <div style="width: 100%; background: #0a0a0a; border: 1px solid #222; border-radius: 6px; padding: 6px; box-sizing: border-box; margin-top: 5px;">
                <div style="font-size: 10px; color: #666; font-weight: bold; text-transform: uppercase; margin-bottom: 4px;">${t('inv_stats') || 'Attributes'}</div>
                ${Object.entries(meta.stats).map(([statId, val]) => `
                    <div style="display: flex; justify-content: space-between; font-size: 11px; font-family: monospace; color: #00ff66;">
                        <span style="color: #aaa;">${statId.toUpperCase()}:</span>
                        <span>+${val}</span>
                    </div>
                `).join('')}
            </div>
        `;
    }

    const sellPrice = meta?.sell_price || 10;
    const totalGoldGain = sellPrice * currentActionCount;

    return `
        <div class="inventory-details-panel" style="width: ${panelWidth}; height: 100%; background: #1a1a1a; border-left: 1px solid #333; display: flex; flex-direction: column; justify-content: space-between; padding: 12px; box-sizing: border-box; flex-shrink: 0; pointer-events: auto; overflow-y: auto;">
            <div style="display: flex; flex-direction: column; gap: 8px;">
                <div style="display: flex; align-items: center; gap: 10px; border-bottom: 1px solid #222; padding-bottom: 8px;">
                    <div style="font-size: 36px; background: #262626; width: 50px; height: 50px; display: flex; align-items: center; justify-content: center; border-radius: 8px; border: 1px solid ${borderColor};">
                        ${itemIcon}
                    </div>
                    <div style="flex: 1; min-width: 0;">
                        <div style="font-size: 13px; font-weight: bold; color: ${borderColor}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${itemTitle}</div>
                        <div style="font-size: 11px; color: #fff; margin-top: 2px;">${t('inv_qty') || 'In Stock'}: <span style="font-weight: bold; color: #ffcc00;">${count}</span></div>
                    </div>
                </div>

                <div style="font-size: 11px; color: #bbb; line-height: 1.4; background: #111; padding: 6px; border-radius: 4px; min-height: 40px; box-sizing: border-box;">
                    ${itemDesc}
                </div>

                ${statsHTML}
            </div>

            <div style="display: flex; flex-direction: column; gap: 8px; border-top: 1px solid #222; padding-top: 8px;">
                <div style="display: flex; align-items: center; justify-content: space-between; gap: 4px; background: #0a0a0a; border: 1px solid #222; padding: 4px; border-radius: 6px;">
                    <button id="inv-details-minus" style="width: 28px; height: 26px; background: #222; color: #fff; border: 1px solid #444; border-radius: 4px; font-size: 14px; font-weight: bold; cursor: pointer;">-</button>
                    <div style="font-size: 13px; color: #fff; font-weight: bold; font-family: monospace;">${currentActionCount}</div>
                    <button id="inv-details-plus" style="width: 28px; height: 26px; background: #222; color: #fff; border: 1px solid #444; border-radius: 4px; font-size: 14px; font-weight: bold; cursor: pointer;">+</button>
                    <button id="inv-details-max" data-max-val="${count}" style="height: 26px; padding: 0 6px; background: #222; color: #ffcc00; border: 1px solid #444; border-radius: 4px; font-size: 10px; font-weight: bold; cursor: pointer;">MAX</button>
                </div>

                <div style="font-size: 10px; color: #888; text-align: center; margin-bottom: -2px;">
                    💵 ${t('inv_sell_earn') || 'Earn'}: <span style="color: #ffcc00; font-weight: bold;">${totalGoldGain}</span> ${t('gold') || 'Gold'}
                </div>

                <div style="display: flex; gap: 6px; width: 100%;">
                    <button id="inv-btn-sell" style="flex: 1; height: 30px; background: #b91c1c; color: #fff; border: none; border-radius: 5px; font-size: 11px; font-weight: bold; cursor: pointer;">
                        ${t('sell') || 'Sell'}
                    </button>
                    <button id="inv-btn-use" ${meta?.is_usable ? '' : 'disabled style="opacity: 0.3; background: #333; cursor: not-allowed;"'} style="flex: 1; height: 30px; background: #0284c7; color: #fff; border: none; border-radius: 5px; font-size: 11px; font-weight: bold; cursor: pointer;">
                        ${t('use') || 'Use'}
                    </button>
                </div>
            </div>
        </div>
    `;
}


/**
 * 2. НАВЕШИВАНИЕ ОБРАБОТЧИКОВ КЛИКОВ И ОТПРАВКА СЕТЕВЫХ ЗАПРОСОВ
 */
export function bindDetailsEvents(container, updateUiCallback, refreshUI) {
    const itemId = InventoryState.selectedItemId;
    if (!itemId) return;

    const btnMinus = container.querySelector('#inv-details-minus');
    const btnPlus = container.querySelector('#inv-details-plus');
    const btnMax = container.querySelector('#inv-details-max');
    const btnSell = container.querySelector('#inv-btn-sell');
    const btnUse = container.querySelector('#inv-btn-use');

    const maxCount = btnMax ? parseInt(btnMax.dataset.maxVal || 1) : 1;

    if (btnMinus) {
        btnMinus.onclick = () => {
            if (currentActionCount > 1) {
                currentActionCount--;
                refreshUI();
            }
        };
    }

    if (btnPlus) {
        btnPlus.onclick = () => {
            if (currentActionCount < maxCount) {
                currentActionCount++;
                refreshUI();
            }
        };
    }

    if (btnMax) {
        btnMax.onclick = () => {
            currentActionCount = maxCount;
            refreshUI();
        };
    }

    // ДЕЙСТВИЕ: ПРОДАЖА ПРЕДМЕТА
    if (btnSell) {
        btnSell.onclick = async () => {
            sendSocket('item', 'sellItem', {
                itemId: itemId,
                count: currentActionCount
            });
            // try {
            //     const res = await fetch(API_URL + '/items/sell', {
            //         method: 'POST',
            //         headers,
            //         body: JSON.stringify({
            //             userId: Game.player.user_id,
            //             serverId: Game.player.server_id,
            //             itemId: itemId,
            //             count: currentActionCount
            //         })
            //     });
            //     const data = await res.json();
            //
            //     if (data.success) {
            //         // Обновляем данные игрока в глобальном стейте фронтенда
            //         Game.player.inventory = data.game_data.inventory;
            //         Game.player.resources = data.resources;
            //
            //         updateUiCallback(); // Обновляем топ-хедер валют
            //         refreshUI();        // Перерисовываем рюкзак
            //     } else {
            //         alert(data.error || "Sell failed");
            //     }
            // } catch (e) {
            //     console.error(e);
            //     alert("Network error on sell");
            // }
        };
    }

    // ДЕЙСТВИЕ: ИСПОЛЬЗОВАНИЕ РАСХОДНИКА / СУНДУКА
    if (btnUse && !btnUse.hasAttribute('disabled')) {
        btnUse.onclick = async () => {
            const meta = Game.config?.catalog?.items?.[itemId];
            // Выбираем эндпоинт на основе категории (сундук или обычный расходник)
            const isChest = itemId.startsWith('chest_');
            // const endpoint = isChest ? '/items/open-chest' : '/items/use'; // Приведено к вашим роутам
            const method = isChest ? 'openChest' : 'useItem';

            sendSocket('item', method, {
                itemId: itemId,
                count: currentActionCount
            });

            // try {
            //     const res = await fetch(API_URL + endpoint, {
            //         method: 'POST',
            //         headers,
            //         body: JSON.stringify({
            //             // Передаем параметры под структуру вашего бэкенд-контроллера
            //             item_id: itemId,
            //             count: currentActionCount
            //         })
            //     });
            //     const data = await res.json();
            //
            //     if (data.success) {
            //         // Обновляем состояние на фронтенде из ответа бэкенда
            //         Game.player.inventory = data.game_data.inventory;
            //         Game.player.resources = data.resources;
            //
            //         showRewardsPopup(rewards, () => {
            //             // Этот код выполнится строго ПОСЛЕ того, как игрок нажмет кнопку "ОК" в поп-апе
            //             Game.player.inventory = data.game_data.inventory;
            //             Game.player.resources = data.resources;
            //
            //             updateUiCallback(); // Синхронизируем валютный хедер
            //             refreshUI();        // Обновляем рюкзак
            //         });
            //
            //         updateUiCallback(); // Обновляем топ-бар валют
            //         refreshUI();        // Перерисовываем сетку и 3-ю колонку
            //     } else {
            //         alert(data.error || "Use failed");
            //     }
            // } catch (e) {
            //     console.error(e);
            //     alert("Network error on use");
            // }
        };
    }
}


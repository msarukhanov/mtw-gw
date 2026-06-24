import { t, locObj, API_URL, headers } from '../../shared.js';
import { Game } from '../../stateManager.js';
import {sendSocket} from "../../socket.js";

/**
 * 1. СЕТЕВОЙ МЕТОД: Покупка предмета
 */
async function buyShopItem(shopItemId, updateUiCallback, count = 1) {
    sendSocket('shop', 'buyItem', {
        shopItemId,
        shopType: Game.activeShopType || 'basic',
        count: count
    });
    // try {
    //     updateState('LOADING');
    //
    //     const res = await fetch(`${API_URL}/items/buy`, {
    //         method: 'POST',
    //         // ИСПРАВЛЕНО: Данные авторизации летят в Headers для миддлвейра auth
    //         headers,
    //         // ИСПРАВЛЕНО: В body шлем только параметры самого магазина и количество
    //         body: JSON.stringify({
    //             shop_item_id: shopItemId,
    //             shop_type: Game.activeShopType || 'basic',
    //             count: count
    //         })
    //     });
    //
    //     const data = await res.json();
    //     if (!res.ok || data.error) throw new Error(data.error || 'Transaction error');
    //
    //     // ИСПРАВЛЕНО: Синхронизируем стейт по новым объектам бэкенда
    //     Game.player = {...Game.player,...data.game_data};
    //     if (data.resources) Game.player.resources = data.resources;
    //     if (data.combat_power) Game.player.combat_power = data.combat_power;
    //
    //     updateUiCallback(); // Локальный триггер перерисовки
    //     alert(t('alert_buy_success') || 'Покупка успешно совершена!');
    // } catch (err) {
    //     alert(t(err.message) || err.message);
    // } finally {
    //     updateState('MAIN_MENU');
    // }
}

/**
 * 2. ГЕНЕРАЦИЯ HTML МАГАЗИНА
 */
function getShopHTML() {
    const shopCategories = Object.keys(Game.config.shops || {}).sort((a, b) => {
        return (Game.config.shops[a].order || 0) - (Game.config.shops[b].order || 0);
    });

    // Задаем дефолтный таб магазина, если он еще не выбран
    if (!Game.activeShopType && shopCategories.length > 0) {
        Game.activeShopType = shopCategories[0];
    }

    let html = `
        <div class="screen-content ui-element" style="top:140px; padding-bottom: 60px; overflow-y:auto; height:calc(100% - 150px); width:100%; box-sizing:border-box;">
            <h2 style="width:100%; margin:0 0 10px 0; font-size:24px; color:#fff;">${t('shop_title')}</h2>
            <div style="width:100%; display:flex; gap:10px; margin-bottom:15px;">
                ${shopCategories.map(shopType => {
        const shopMeta = Game.config.shops[shopType];
        const isActive = Game.activeShopType === shopType;
        return `
                        <button class="btn" style="background:${isActive ? '#673ab7' : '#333'}; color:#fff; border:none; border-radius:6px; padding:10px 20px; font-size:12px; height:auto; width:auto; font-weight:bold; cursor:pointer;" data-shop-tab-type="${shopType}">
                            ${locObj(shopMeta.title_loc)}
                        </button>
                    `;
    }).join('')}
            </div>
    `;

    // ИСПРАВЛЕНО: Безопасное извлечение каталога товаров
    const activeShopCatalog = Game.config.shops[Game.activeShopType]?.catalog || Object.values(Game.config.shops[Game.activeShopType] || {});

    // Если структура магазина — объект, а не массив catalog
    const finalItemsArray = Array.isArray(activeShopCatalog) ? activeShopCatalog : Object.values(activeShopCatalog);

    if (finalItemsArray.length === 0) {
        html += `<div style="color:#aaa; padding:20px; text-align:center; width:100%;">Магазин пуст...</div>`;
    } else {
        html += finalItemsArray.map(item => {
            if (!item || typeof item !== 'object') return '';
            const itemMeta = Game.config.catalog?.items?.[item.itemId];

            // Получаем иконку валюты (например 💎)
            const costCurrency = item.cost_resource || 'diamond';
            const resourceMeta = Game.config?.mechanics?.resources?.[costCurrency];
            const currencyIcon = resourceMeta?.icon || '💎';

            return `
                <div class="list-card" style="background:#1e1e1e; padding:12px; border-radius:8px; margin-bottom:10px; display:flex; justify-content:space-between; align-items:center; border:1px solid #333; box-sizing:border-box;">
                    <div style="display:flex; align-items:center; gap:15px;">
                        <div style="font-size:32px; background:#2c3e50; width:50px; height:50px; display:flex; align-items:center; justify-content:center; border-radius:8px; border:1px solid #444;">
                            ${itemMeta?.icon || '📦'}
                        </div>
                        <div>
                            <div style="font-size:15px; font-weight:bold; color:#fff;">${locObj(item.title_loc || itemMeta?.title_loc)}</div>
                            <div style="color:#00ffff; font-size:12px; margin-top:4px; font-family:monospace; font-weight:bold;">
                                ${currencyIcon} Цена: ${item.cost_amount || item.cost_gems || 0}
                            </div>
                        </div>
                    </div>
                    <button class="btn" style="background:#2e7d32; color:#fff; border:none; border-radius:6px; height:36px; padding:0 16px; font-size:12px; width:auto; cursor:pointer; font-weight:bold;" data-buy-id="${item.id || item.itemId}">
                        ${t('shop_buy_btn') || 'Купить'}
                    </button>
                </div>
            `;
        }).join('');
    }

    html += `</div>`;
    return html;
}

/**
 * 3. ТОЧКА ВХОДА МОДУЛЯ МАГАЗИНА
 */
export function initShopScreen(container, updateUiCallback) {
    const oldContent = container.querySelector('.screen-content');
    if (oldContent) oldContent.remove();

    container.innerHTML += getShopHTML();

    // Вкладки категорий магазина
    container.querySelectorAll('[data-shop-tab-type]').forEach(b => {
        b.onclick = (e) => {
            e.stopPropagation();
            Game.activeShopType = b.dataset.shopTabType;
            updateUiCallback();
        };
    });

    // Кнопки покупки товара
    container.querySelectorAll('[data-buy-id]').forEach(b => {
        b.onclick = (e) => {
            e.stopPropagation();
            const shopItemId = b.dataset.buyId;

            // Добавляем быстрый prompt для покупки пачки предметов (например, купить 5 свитков за раз)
            const userInput = prompt("Сколько штук хотите приобрести?", "1");
            if (userInput === null) return;
            const buyCount = parseInt(userInput) || 1;
            if (buyCount <= 0) return alert("Неверное количество!");

            buyShopItem(shopItemId, updateUiCallback, buyCount);
        };
    });
}

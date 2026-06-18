import { t, locObj, API_URL } from './shared.js';

// СЕТЕВОЙ МЕТОД: Покупка товара переехала внутрь модуля
async function buyShopItem(shopItemId, Game, updateUiCallback) {
    try {
        const res = await fetch(`${API_URL}/items/buy`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                game_id: Game.gameId,
                server_id: Game.serverId,
                device_id: Game.deviceId,
                shop_type: Game.activeShopType,
                shop_item_id: shopItemId
            })
        });
        const data = await res.json();
        if (!res.ok || data.error) throw new Error(data.error || 'Transaction error');

        Game.player = data.player_state;
        updateUiCallback(); // Локальный триггер перерисовки
        alert(t('alert_buy_success', Game));
    } catch (err) {
        alert(t(err.message, Game));
    }
}

function getShopHTML(Game) {
    const shopCategories = Object.keys(Game.config.shops || {}).sort((a, b) => {
        return (Game.config.shops[a].order || 0) - (Game.config.shops[b].order || 0);
    });

    let html = `
        <div class="screen-content ui-element" style="top:140px; padding-bottom: 60px;">
            <h2 style="width:100%; margin:0;">${t('shop_title', Game)}</h2>
            <div style="width:100%; display:flex; gap:15px; margin-bottom:10px;">
                ${shopCategories.map(shopType => {
        const shopMeta = Game.config.shops[shopType];
        const isActive = Game.activeShopType === shopType;
        return `
                        <button class="btn" style="background:${isActive ? '#673ab7' : '#333'}; padding:10px 20px; font-size:14px; height:auto; width:auto;" data-shop-tab-type="${shopType}">
                            ${locObj(shopMeta.title_loc, Game)}
                        </button>
                    `;
    }).join('')}
            </div>
    `;

    const activeShopCatalog = Game.config.shops[Game.activeShopType]?.catalog || [];

    if (activeShopCatalog.length === 0) {
        html += `<div style="color:#aaa; padding:20px;">Магазин пуст...</div>`;
    } else {
        html += activeShopCatalog.map(item => {
            const itemMeta = Game.config.catalog?.items?.[item.item_id];
            return `
                <div class="list-card">
                    <div style="display:flex; align-items:center; gap:15px;">
                        <div style="font-size:32px; background:#2c3e50; width:55px; height:55px; display:flex; align-items:center; justify-content:center; border-radius:8px;">
                            ${itemMeta?.icon || '📦'}
                        </div>
                        <div>
                            <div style="font-size:18px; font-weight:bold;">${locObj(item.title_loc, Game)}</div>
                            <div style="color:#00ffff; font-size:14px; margin-top:4px;">💎 Цена: ${item.cost_gems}</div>
                        </div>
                    </div>
                    <button class="btn" style="background:#2e7d32; height:45px; padding:0 20px; font-size:14px; width:auto;" data-buy-id="${item.id}">
                        ${t('shop_buy_btn', Game)}
                    </button>
                </div>
            `;
        }).join('');
    }

    html += `</div>`;
    return html;
}

// ТОЧКА ВХОДА МОДУЛЯ МАГАЗИНА
export function initShopScreen(container, Game, updateUiCallback) {
    container.innerHTML += getShopHTML(Game);

    // Вешаем локальные клики на переключение табов (basic / vip)
    container.querySelectorAll('[data-shop-tab-type]').forEach(b => {
        b.onclick = () => {
            Game.activeShopType = b.dataset.shopTabType;
            updateUiCallback();
        };
    });

    // Вешаем локальные клики на кнопки покупки товара
    container.querySelectorAll('[data-buy-id]').forEach(b => {
        b.onclick = () => buyShopItem(b.dataset.buyId, Game, updateUiCallback);
    });
}

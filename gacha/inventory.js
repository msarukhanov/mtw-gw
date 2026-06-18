// frontend/inventory.js

import { t, locObj, API_URL } from './shared.js';

export function getInventoryHTML(Game) {
    const lang = Game.locale || 'ru';

    // Безопасно извлекаем предметы рюкзака игрока
    const items = Object.entries(Game.player?.inventory || {}).filter(([_, count]) => count > 0);

    // Цветовая палитра на основе твоего массива mechanics.rarities.items
    const rarityColors = {
        "UR": "#e63946",  // Ультра-редкий
        "SSR": "#ff9800", // Легендарный
        "SR": "#9c27b0",  // Эпический
        "R": "#2196f3"    // Обычный
    };

    let html = `
        <div class="screen-content ui-element" style="top:140px; padding-bottom: 60px;">
            <h2 style="width:100%; margin:0; font-size:24px;">${t('inventory_title', Game)}</h2>
    `;

    if (items.length === 0) {
        html += `<div style="padding:20px; color:#aaa; font-size:18px;">${t('inventory_empty', Game)}</div>`;
    } else {
        html += items.map(([id, count]) => {
            // Идем по твоему новому пути: Game.config.catalog.items.[id]
            const meta = Game.config?.catalog?.items?.[id];
            if (!meta) return '';

            const borderColor = rarityColors[meta.rarity] || '#333';
            const title = locObj(meta.title_loc, Game);
            const description = locObj(meta.desc_loc, Game);

            const hasExpiration = meta.expiration !== null;
            const expText = hasExpiration ? `<div style="color:#ff8a80; font-size:12px; margin-top:5px;">⏳ ${lang === 'ru' ? 'Временный предмет' : 'Limited time item'}</div>` : '';

            return `
                <div class="list-card" style="border-left: 5px solid ${borderColor}; gap:15px; background:#1e1e1e; margin-bottom:10px;">
                    <div style="display:flex; align-items:center; gap:20px;">
                        <div style="font-size:38px; background:#262626; width:65px; height:65px; display:flex; align-items:center; justify-content:center; border-radius:10px;">
                            ${meta.icon || '📦'}
                        </div>
                        <div>
                            <b style="font-size:20px; color:${borderColor}">${title} <span style="color:#fff; font-size:16px;">x${count}</span></b>
                            <div style="color:#bbb; font-size:14px; margin-top:6px; max-width:450px;">${description}</div>
                            ${expText}
                        </div>
                    </div>
                    
                    ${meta.is_usable ? `
                        <button class="btn" style="background:#0284c7; height:45px; padding:0 20px; font-size:14px; width:auto;" data-use-item-id="${id}">
                            ${lang === 'ru' ? 'Использовать' : 'Use'}
                        </button>
                    ` : `
                        <span style="color:#666; font-size:13px; font-style:italic; padding-right:15px;">
                            ${t('inventory_type_meta', Game)}
                        </span>
                    `}
                </div>
            `;
        }).join('');
    }

    html += `</div>`;
    return html;
}

export function initInventoryScreen(container, Game, updateUiCallback) {
    container.innerHTML += initInventoryScreen(Game);

    // Вешаем локальные клики на переключение табов (basic / vip)
    container.querySelectorAll('[data-shop-tab-type]').forEach(b => {
        b.onclick = () => {
            Game.activeShopType = b.dataset.shopTabType;
            updateUiCallback();
        };
    });
}
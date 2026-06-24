import { Game } from '../../stateManager.js';
import { t, locObj } from "../../shared.js";

export function showRewardsPopup(rewardsGained, onCloseCallback) {
    if (!rewardsGained || Object.keys(rewardsGained).length === 0) return;

    // Создаем подложку модалки
    const overlay = document.createElement('div');
    overlay.className = 'rewards-popup-overlay';
    overlay.style = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(0, 0, 0, 0.85); z-index: 9999;
        display: flex; align-items: center; justify-content: center;
        opacity: 0; transition: opacity 0.3s ease; pointer-events: auto;
    `;

    // Цветовая разметка редкостей для красивых градиентных рамок героев и предметов
    const rarityColors = {
        'UR': '#ff3300',
        'SSR': '#ffcc00',
        'SR': '#9c27b0',
        'R': '#2196f3'
    };

    // Генерируем сетку наград
    const itemsHTML = Object.entries(rewardsGained).map(([itemId, count]) => {
        const catalogItems = Game.config?.catalog?.items || {};
        const catalogHeroes = Game.config?.catalog?.heroes || {};

        let name = itemId;
        let iconHtml = '📦';
        let borderColor = '#444';
        let isHero = false;

        // 1. Проверяем, не золото ли это или другой базовый ресурс
        if (itemId === 'gold' || itemId === 'diamond' || itemId === 'exp' || itemId === 'hero_exp') {
            name = t(itemId) || itemId;
            iconHtml = itemId === 'gold' ? '💰' : (itemId === 'diamond' ? '💎' : '✨');
            borderColor = '#ffcc00';
        }
        // 2. Проверяем в каталоге предметов (снаряжение, свитки, осколки)
        else if (catalogItems[itemId]) {
            const itemMeta = catalogItems[itemId];
            name = locObj(itemMeta.title_loc) || itemId;
            iconHtml = itemMeta.icon || '📦';
            borderColor = rarityColors[itemMeta.rarity] || '#444';
        }
        // 3. НОВАЯ ЛОГИКА: Проверяем в каталоге героев (портреты вместо коробок!)
        else if (catalogHeroes[itemId]) {
            const heroMeta = catalogHeroes[itemId];
            name = locObj(heroMeta.title_loc) || itemId;
            isHero = true;
            borderColor = rarityColors[heroMeta.rarity || 'SSR'] || '#ffcc00';

            // Берем путь к файлу портрета (поддерживаем и avatar_icon, и icon)
            const imgUrl = heroMeta.icon || './gacha/assets/images/heroes/heroAvatars/eleniel.webp';
            iconHtml = `
                <img src="${imgUrl}" alt="${name}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 4px;" onerror="this.style.display='none'; this.parentElement.innerHTML='⚔️'">
            `;
        }

        // Рендерим красивую карточку награды
        return `
            <div style="width: 76px; display: flex; flex-direction: column; align-items: center; gap: 4px;">
                <div style="width: 56px; height: 56px; background: #222; border: 2px solid ${borderColor}; border-radius: 6px; display: flex; align-items: center; justify-content: center; font-size: ${isHero ? '12px' : '26px'}; position: relative; box-shadow: 0 0 10px rgba(0,0,0,0.5); overflow: hidden; width: 56px; height: 56px;">
                    ${iconHtml}
                    <div style="position: absolute; bottom: 2px; right: 4px; font-size: 10px; font-family: monospace; color: #fff; font-weight: bold; background: rgba(0,0,0,0.6); padding: 0 3px; border-radius: 3px;">
                        x${count}
                    </div>
                </div>
                <div style="font-size: 9px; color: #bbb; text-align: center; width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-weight: 500;">
                    ${name}
                </div>
            </div>
        `;
    }).join('');

    // Собираем тело модалки
    overlay.innerHTML = `
        <div style="background: #111; border: 2px solid #333; border-radius: 12px; width: 420px; padding: 15px; box-sizing: border-box; display: flex; flex-direction: column; align-items: center; gap: 15px; box-shadow: 0 0 30px rgba(0,0,0,0.7); animation: popupScale 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275);">
            <div style="font-size: 16px; font-weight: bold; color: #ffcc00; text-transform: uppercase; letter-spacing: 1px;">
                🎉 ${t('popup_rewards_title') || 'Rewards Obtained!'}
            </div>
            
            <div style="display: flex; flex-wrap: wrap; justify-content: center; gap: 12px; max-height: 180px; overflow-y: auto; width: 100%; padding: 5px;">
                ${itemsHTML}
            </div>
            
            <button id="rewards-popup-close-btn" style="width: 120px; height: 32px; background: linear-gradient(130deg, #ffcc00, #ff9800); border: none; border-radius: 6px; color: #000; font-size: 12px; font-weight: bold; cursor: pointer; transition: transform 0.1s;">
                ${t('ok') || 'OK'}
            </button>
        </div>
    `;

    document.body.appendChild(overlay);

    // Плавное появление
    setTimeout(() => overlay.style.opacity = '1', 50);

    const closeBtn = overlay.querySelector('#rewards-popup-close-btn');
    closeBtn.onclick = () => {
        overlay.style.opacity = '0';
        setTimeout(() => {
            overlay.remove();
            if (typeof onCloseCallback === 'function') onCloseCallback();
        }, 300);
    };
}


export function showRewardsPopup222(rewardsGained, onCloseCallback) {
    if (!rewardsGained || Object.keys(rewardsGained).length === 0) {
        if (onCloseCallback) onCloseCallback();
        return;
    }

    // Генерируем HTML для каждого полученного ресурса или предмета
    const rewardsListHTML = Object.entries(rewardsGained).map(([id, amount]) => {
        // Проверяем, это предмет из каталога или чистый ресурс из механик
        const itemProto = Game.config?.catalog?.items?.[id];
        const resourceProto = Game.config?.mechanics?.resources?.[id];

        const icon = itemProto?.icon || resourceProto?.icon || '📦';
        const title = itemProto ? locObj(itemProto.title_loc) : (resourceProto ? locObj(resourceProto.title_loc) : id);

        return `
            <div style="background: #1a1a1a; border: 1px solid #333; border-radius: 6px; padding: 8px 12px; display: flex; align-items: center; justify-content: space-between; width: 100%; box-sizing: border-box;">
                <div style="display: flex; align-items: center; gap: 10px;">
                    <span style="font-size: 28px;">${icon}</span>
                    <span style="font-size: 13px; color: #fff; font-weight: bold;">${title}</span>
                </div>
                <span style="font-size: 14px; color: #ffcc00; font-weight: bold; font-family: monospace;">+${amount}</span>
            </div>
        `;
    }).join('');

    const popupHTML = `
        <div id="inventory-rewards-popup-overlay" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.85); z-index: 10000; display: flex; align-items: center; justify-content: center; pointer-events: auto; opacity: 0; transition: opacity 0.2s ease-out;">
            <div style="background: #111; border: 2px solid #ffcc00; border-radius: 8px; width: 300px; padding: 15px; box-sizing: border-box; display: flex; flex-direction: column; align-items: center; gap: 12px; transform: scale(0.8); transition: transform 0.2s ease-out;">
                
                <!-- Анимированные лучи или звезда сверху -->
                <div style="font-size: 40px; margin-bottom: -5px; animation: popup-pulse 1.5s infinite alternate;">🎉</div>
                
                <h2 style="margin: 0; font-size: 18px; color: #ffcc00; text-align: center; font-weight: bold; text-transform: uppercase; letter-spacing: 1px;">
                    ${t('popup_rewards_title') || 'Congratulations!'}
                </h2>
                
                <!-- Контейнер со списком наград -->
                <div style="display: flex; flex-direction: column; gap: 6px; width: 100%; max-height: 160px; overflow-y: auto; padding-right: 2px;">
                    ${rewardsListHTML}
                </div>

                <!-- Кнопка закрытия -->
                <button id="inventory-popup-close-btn" style="width: 100%; height: 34px; background: #ffcc00; color: #000; border: none; border-radius: 6px; font-size: 13px; font-weight: bold; cursor: pointer; margin-top: 5px; box-shadow: 0 0 10px rgba(255,204,0,0.3);">
                    ${t('ok') || 'OK'}
                </button>
            </div>
        </div>

        <!-- Легкие инлайн-стили для базовой анимации появления -->
        <style>
            @keyframes popup-pulse {
                0% { transform: scale(1); }
                100% { transform: scale(1.15); }
            }
        </style>
    `;

    document.body.insertAdjacentHTML('beforeend', popupHTML);

    const overlay = document.getElementById('inventory-rewards-popup-overlay');
    const modalContainer = overlay.querySelector('div');
    const closeBtn = document.getElementById('inventory-popup-close-btn');

    // Плавное появление (Fade-in + Scale)
    setTimeout(() => {
        if (overlay) {
            overlay.style.opacity = '1';
            modalContainer.style.transform = 'scale(1)';
        }
    }, 10);

    closeBtn.onclick = () => {
        // Плавное исчезновение перед удалением из DOM
        overlay.style.opacity = '0';
        modalContainer.style.transform = 'scale(0.8)';

        setTimeout(() => {
            if (overlay) overlay.remove();
            if (onCloseCallback) onCloseCallback();
        }, 200);
    };
}

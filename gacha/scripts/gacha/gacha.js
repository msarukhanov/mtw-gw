import { Game } from '../../stateManager.js';
import { t, locObj, getWindowContentStyle } from "../../shared.js";
import { renderGachaDetailsPanel, bindGachaEvents } from './gachaDetails.js';

export const GachaState = {
    selectedBannerId: null // ID активного баннера
};

export function getGachaHTML() {
    const orientation = Game.config.orientation || 'landscape';
    const screenSettings = Game.config?.ui?.[orientation]?.find(w => w.id === 'screen_gacha') || {};
    const listSettings = screenSettings.list_settings || {};

    const sidebarWidth = listSettings.sidebar_width || "240px";
    const detailsWidth = listSettings.details_panel_width || "280px";
    const headerHeight = listSettings.header_height || "40px";
    const headerBg = listSettings.header_background || "#121212";

    const gachaConfig = Game.config?.gacha || {};
    const banners = gachaConfig.banners || [];

    // Авто-выбор первого баннера при загрузке экрана
    if (banners.length > 0 && (!GachaState.selectedBannerId || !banners.some(b => b.id === GachaState.selectedBannerId))) {
        GachaState.selectedBannerId = banners[0].id;
    }

    const activeBanner = banners.find(b => b.id === GachaState.selectedBannerId);

    // --- 1. ЛЕВАЯ КОЛОНКА: СПИСОК ДОСТУПНЫХ БАННЕРОВ ---
    const sidebarHTML = `
        <div class="gacha-sidebar" style="display: flex; flex-direction: column; border-right: 1px solid #333; padding: ${listSettings.padding}; box-sizing: border-box; height: 100%; width: ${sidebarWidth}; flex-shrink: 0; background: #1a1a1a; overflow-y: auto; gap: ${listSettings.gap}; pointer-events: auto;">
            <div style="font-size: 11px; color: #666; font-weight: bold; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 4px;">${t('gacha_banners_title') || 'Available Banners'}</div>
            ${banners.map(banner => {
        const isSelected = GachaState.selectedBannerId === banner.id;
        return `
                    <div class="gacha-banner-tab" data-banner-id="${banner.id}" style="width: 100%; min-height: 54px; background: ${isSelected ? 'linear-gradient(135deg, #2c1a4d, #111)' : '#111'}; border: 2px solid ${isSelected ? '#ffcc00' : '#444'}; border-radius: 8px; padding: 8px; box-sizing: border-box; cursor: pointer; display: flex; align-items: center; gap: 10px; transition: all 0.2s;">
                        <div style="font-size: 24px; background: rgba(0,0,0,0.3); width: 38px; height: 38px; display: flex; align-items: center; justify-content: center; border-radius: 6px; border: 1px solid ${isSelected ? '#ffcc00' : '#333'}; flex-shrink: 0;">
                            ${banner.icon || '🔮'}
                        </div>
                        <div style="display: flex; flex-direction: column; min-width: 0; flex: 1;">
                            <b style="font-size: 12px; color: ${isSelected ? '#ffcc00' : '#fff'}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${locObj(banner.title_loc)}</b>
                            <span style="font-size: 10px; color: #888; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${locObj(banner.desc_loc)}</span>
                        </div>
                    </div>
                `;
    }).join('')}
        </div>
    `;

    // --- 2. ЦЕНТРАЛЬНАЯ КОЛОНКА: АРТ АЛТАРЯ / ВРАТ ПРИЗЫВА ---
    const centerAreaHTML = `
        <div class="gacha-center-altar" style="display: flex; flex-direction: column; flex: 1; height: 100%; position: relative; overflow: hidden; background: radial-gradient(circle, #1c103a 0%, #070412 100%);">
            <!-- Верхний информационный хедер -->
            <div style="width: 100%; height: ${headerHeight}; display: flex; align-items: center; padding: 0 15px; box-sizing: border-box; border-bottom: 1px solid #222; background: ${headerBg}; flex-shrink: 0; pointer-events: auto;">
                <div style="font-size: 13px; color: #ffcc00; font-weight: bold;">🔮 <span>${t('gacha_screen_title') || 'Summon Altar'}</span></div>
            </div>
            
            <!-- Визуальный центр: Врата или магический круг призыва -->
            <div style="flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 20px; box-sizing: border-box; position: relative;">
                <div class="gacha-gate-effect" style="width: 200px; height: 200px; border-radius: 50%; border: 4px dashed rgba(156, 39, 176, 0.4); display: flex; align-items: center; justify-content: center; position: relative; box-shadow: 0 0 40px rgba(103, 58, 183, 0.2);">
                    <div style="font-size: 80px; filter: drop-shadow(0 0 20px #673ab7); animation: floatEffect 4s ease-in-out infinite;">✨</div>
                </div>
                
                ${activeBanner?.wishlist_enabled ? `
                    <div style="margin-top: 20px; background: rgba(0,0,0,0.6); padding: 6px 16px; border-radius: 20px; border: 1px solid #ffcc00; font-size: 11px; color: #ffcc00; font-weight: bold; cursor: pointer; pointer-events: auto;" id="gacha-btn-open-wishlist">
                        💖 ${t('gacha_wishlist_btn') || 'Configure Wishlist'}
                    </div>
                ` : ''}
            </div>
        </div>
    `;

    // --- 3. ПРАВАЯ КОЛОНКА: ПАНЕЛЬ КРУТОК И ГАРАНТОВ ---
    const detailsPanelHTML = renderGachaDetailsPanel(activeBanner, gachaConfig, detailsWidth);

    return `
        <div class="screen-content ui-element" style="${getWindowContentStyle()} display: flex; flex-direction: row; box-sizing: border-box; top: 45px; height: calc(100% - 45px); overflow: hidden;">
            ${sidebarHTML}
            ${centerAreaHTML}
            ${detailsPanelHTML}
        </div>
    `;
}

export function initGachaScreen(container, updateUiCallback) {
    const refreshGachaUI = () => {
        const oldScreen = container.querySelector('.screen-content');
        if (oldScreen) oldScreen.remove();
        initGachaScreen(container, updateUiCallback);
    };

    container.insertAdjacentHTML('beforeend', getGachaHTML());

    // Переключение баннеров в левом сайдбаре
    container.querySelectorAll('.gacha-banner-tab').forEach(tab => {
        tab.onclick = () => {
            GachaState.selectedBannerId = tab.dataset.bannerId;
            refreshGachaUI();
        };
    });

    // Привязываем клики по кнопкам призыва х1 / х10
    bindGachaEvents(container, updateUiCallback, refreshGachaUI);
}

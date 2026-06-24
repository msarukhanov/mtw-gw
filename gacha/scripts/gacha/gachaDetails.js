import { Game } from '../../stateManager.js';
import { t, locObj } from "../../shared.js";
import {sendSocket} from "../../socket.js";

/**
 * РЕНДЕРИНГ ПРАВОЙ ПАНЕЛИ ГАЧИ
 */
export function renderGachaDetailsPanel(banner, gachaConfig, panelWidth) {
    if (!banner) {
        return `
            <div class="gacha-details-panel" style="width: ${panelWidth}; height: 100%; background: #1a1a1a; border-left: 1px solid #333; display: flex; align-items: center; justify-content: center; color: #666; font-size: 12px; padding: 15px; box-sizing: border-box;">
                ${t('gacha_no_banner') || 'Select a banner'}
            </div>
        `;
    }

    const playerInv = Game.player?.inventory || {};
    const playerRes = Game.player?.resources || {};
    const gachaPity = Game.player?.gacha_pity?.[banner.id] || { main: 0, every: {} };

    const pool = gachaConfig.pools?.[banner.poolId] || {};

    // Расчет стоимости для одиночного призыва (x1)
    let costCurrencyX1 = banner.cost_item_id;
    let costAmountX1 = banner.cost_amount || 1;
    let isAltX1 = false;

    if (!playerInv[costCurrencyX1] || playerInv[costCurrencyX1] < costAmountX1) {
        costCurrencyX1 = pool.currency || 'diamond';
        costAmountX1 = pool.cost || 2000;
        isAltX1 = true;
    }
    const hasEnoughX1 = isAltX1 ? (parseInt(playerRes[costCurrencyX1]) || 0) >= costAmountX1 : (playerInv[costCurrencyX1] || 0) >= costAmountX1;

    // Расчет стоимости для мультипризыва (x10) с учетом заложенной скидки
    let costCurrencyX10 = banner.cost_item_id;
    let costAmountX10 = (banner.cost_amount || 1) * 10;
    let isAltX10 = false;

    if (!playerInv[costCurrencyX10] || playerInv[costCurrencyX10] < costAmountX10) {
        costCurrencyX10 = pool.currency || 'diamond';
        costAmountX10 = (pool.cost || 2000) * 9; // Скидка х10 (платим за 9 круток)
        isAltX10 = true;
    }
    const hasEnoughX10 = isAltX10 ? (parseInt(playerRes[costCurrencyX10]) || 0) >= costAmountX10 : (playerInv[costCurrencyX10] || 0) >= costAmountX10;

    // Вычисляем остаток до жесткого Гаранта (Pity порог)
    const pityThreshold = banner.pity_threshold || 80;
    const rollsUntilPity = Math.max(0, pityThreshold - gachaPity.main);

    // Сборка инфо об альтернативной стоимости для отображения на кнопках
    const iconX1 = isAltX1 ? (costCurrencyX1 === 'diamond' ? '💎' : '💰') : '🎫';
    const iconX10 = isAltX10 ? (costCurrencyX10 === 'diamond' ? '💎' : '💰') : '🎫';

    return `
        <div class="gacha-details-panel" style="width: ${panelWidth}; height: 100%; background: #141414; border-left: 1px solid #252525; display: flex; flex-direction: column; justify-content: space-between; padding: 12px; box-sizing: border-box; flex-shrink: 0; pointer-events: auto;">
            
            <!-- Секция Pity-счетчиков и прогресс-баров -->
            <div style="display: flex; flex-direction: column; gap: 12px; overflow-y: auto; flex: 1;">
                <div style="background: rgba(0,0,0,0.3); border: 1px solid #222; padding: 10px; border-radius: 6px;">
                    <div style="font-size: 11px; color: #aaa; font-weight: bold; display: flex; justify-content: space-between; align-items: center;">
                        <span>⭐ ${t('gacha_pity_title') || 'Guaranteed SSR Counter'}</span>
                        <span style="font-family: monospace; color: #ffcc00; font-size: 13px;">${gachaPity.main}/${pityThreshold}</span>
                    </div>
                    <div style="width: 100%; height: 6px; background: #222; border-radius: 3px; margin-top: 6px; overflow: hidden; border: 1px solid #333;">
                        <div style="width: ${(gachaPity.main / pityThreshold) * 100}%; height: 100%; background: linear-gradient(90deg, #9c27b0, #ffcc00); border-radius: 3px;"></div>
                    </div>
                    <div style="font-size: 9px; color: #666; margin-top: 4px; text-align: right;">
                        ${t('gacha_pity_remain') || 'Remaining until safe pull'}: <b style="color: #ffcc00; font-family: monospace;">${rollsUntilPity}</b>
                    </div>
                </div>

                <!-- Наличие валюты в инвентаре игрока -->
                <div style="display: flex; flex-direction: column; gap: 5px;">
                    <div style="font-size: 10px; color: #555; font-weight: bold; text-transform: uppercase;">${t('gacha_your_currency') || 'Your Resources'}</div>
                    <div style="display: flex; justify-content: space-between; font-size: 11px; background: #0c0c0c; padding: 6px 10px; border-radius: 4px; border: 1px solid #1a1a1a;">
                        <span style="color: #aaa;">🎫 Свитки призыва:</span>
                        <b style="font-family: monospace; color: #fff;">${playerInv[banner.cost_item_id] || 0}</b>
                    </div>
                    <div style="display: flex; justify-content: space-between; font-size: 11px; background: #0c0c0c; padding: 6px 10px; border-radius: 4px; border: 1px solid #1a1a1a;">
                        <span style="color: #aaa;">💎 Алмазы аккаунта:</span>
                        <b style="font-family: monospace; color: #ffcc00;">${playerRes.diamond || 0}</b>
                    </div>
                </div>
            </div>

            <!-- Секция кнопок запуска сокет-запросов -->
            <div style="display: flex; flex-direction: column; gap: 8px; border-top: 1px solid #222; padding-top: 10px;">
                <div style="display: flex; gap: 8px; width: 100%;">
                    
                    <!-- Кнопка призвать х1 -->
                    <button id="gacha-btn-summon-x1" style="flex: 1; height: 44px; background: #2196f3; color: #fff; border: none; border-radius: 6px; display: flex; flex-direction: column; align-items: center; justify-content: center; cursor: pointer; opacity: ${hasEnoughX1 ? 1 : 0.4};">
                        <b style="font-size: 11px;">Summon x1</b>
                        <span style="font-size: 10px; font-family: monospace; opacity: 0.9; margin-top: 1px;">${iconX1} ${costAmountX1}</span>
                    </button>

                    <!-- Кнопка призвать х10 -->
                    <button id="gacha-btn-summon-x10" style="flex: 1; height: 44px; background: #673ab7; color: #fff; border: none; border-radius: 6px; display: flex; flex-direction: column; align-items: center; justify-content: center; cursor: pointer; opacity: ${hasEnoughX10 ? 1 : 0.4}; border: 1px solid #9c27b0; box-shadow: 0 0 10px rgba(156,39,176,0.2);">
                        <b style="font-size: 11px; color: #ffcc00;">Summon x10</b>
                        <span style="font-size: 10px; font-family: monospace; color: #fff; margin-top: 1px;">${iconX10} ${costAmountX10}</span>
                    </button>

                </div>
            </div>
        </div>
    `;
}

/**
 * СВЯЗЫВАНИЕ СОКЕТНЫХ ВЫСТРЕЛОВ КНОПОК ПРИЗЫВА
 */
export function bindGachaEvents(container, updateUiCallback, refreshGachaUI) {
    const bannerId = container.querySelector('.gacha-banner-tab')?.dataset.bannerId;
    if (!bannerId) return;

    const btnX1 = container.querySelector('#gacha-btn-summon-x1');
    const btnX10 = container.querySelector('#gacha-btn-summon-x10');
    const btnWishlist = container.querySelector('#gacha-btn-open-wishlist');

    if (btnX1) {
        btnX1.onclick = () => {
            // Отправляем чистый сокет-выстрел по нашей новой State-Driven схеме
            sendSocket('gacha', 'summon', {
                bannerId,
                count: 1,
                wishlist: Game.player?.gacha_wishlists?.[bannerId] || []
        });
        };
    }

    if (btnX10) {
        btnX10.onclick = () => {
            sendSocket('gacha', 'summon', {
                bannerId,
                count: 10,
                wishlist: Game.player?.gacha_wishlists?.[bannerId] || []
        });
        };
    }

    if (btnWishlist) {
        btnWishlist.onclick = () => {
            // Логика модалки конфигурации вишлиста (если понадобится собрать позже)
            console.log('Open wishlist setup modal for banner:', bannerId);
        };
    }
}

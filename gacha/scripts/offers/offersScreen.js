import { Game } from '../../stateManager.js';
import {t, getWindowContentStyle} from "../../shared.js";
import {sendSocket} from "../../socket.js";

let offersIntervalTimer = null;

export function getOffersHTML() {
    const orientation = Game.config.orientation || 'landscape';
    const screenSettings = Game.config?.ui?.[orientation]?.find(w => w.id === 'screen_promo_selena') || {};
    const listSettings = screenSettings.list_settings || {};

    const headerHeight = listSettings.header_height || "40px";
    const headerBg = listSettings.header_background || "#121212";

    const activeOffers = Game.active_offers || [];
    const poolConfig = Game.config?.limited_offers?.offers_pool || {};

    const offersCardsHTML = activeOffers.length === 0 ? `
        <div style="margin: auto; color: #444; font-size: 12px; font-style: italic;">
            ${t('off_no_active')}
        </div>
    ` : activeOffers.map(activeNode => {
        const meta = poolConfig[activeNode.offer_id];
        if (!meta) return '';

        const msLeft = Math.max(0, activeNode.expires_at - Date.now());
        const hours = Math.floor(msLeft / 3600000);
        const minutes = Math.floor((msLeft % 3600000) / 60000);
        const seconds = Math.floor((msLeft % 60000) / 1000);
        const timerText = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

        let rewardsPreview = [];
        if (meta.rewards?.resources) {
            Object.entries(meta.rewards.resources).forEach(([k, v]) => {
                rewardsPreview.push(`<span style="color:#ffcc00; font-weight:bold;">🔮 ${v} ${t(`res_${k}`, k)}</span>`);
            });
        }
        if (meta.rewards?.items) {
            meta.rewards.items.forEach(i => {
                rewardsPreview.push(`<span style="color:#64dfdf;">📦 ${i.amount}x ${t(`item_${i.itemId}`, i.itemId)}</span>`);
            });
        }

        const isUsd = meta.cost?.resource === 'usd';
        const resourceName = isUsd ? 'USD' : t(`res_${meta.cost?.resource}`, meta.cost?.resource);
        const priceText = isUsd ? `$${meta.cost?.amount}` : `${meta.cost?.amount} ${resourceName}`;

        return `
            <div style="width: 100%; min-height: 80px; background: linear-gradient(135deg, #161616, #0c0c0c); border: 1px solid #222; border-radius: 8px; padding: 12px; box-sizing: border-box; display: flex; flex-direction: row; justify-content: space-between; align-items: center; gap: 15px; pointer-events: auto;">
                <div style="display: flex; flex-direction: column; gap: 4px; text-align: left; flex: 1; min-width: 0;">
                    <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
                        <b style="font-size: 13px; color: #fff;">${meta.title_loc?.[Game.config.default_lang || 'en'] || 'Flash Sale Pack'}</b>
                        <span class="fomo-timer" data-expire="${activeNode.expires_at}" style="font-family: monospace; font-size: 11px; color: #e94560; background: rgba(233,69,96,0.1); padding: 2px 6px; border-radius: 4px; border: 1px solid rgba(233,69,96,0.2);">
                            ⏳ ${timerText}
                        </span>
                    </div>
                    <p style="margin: 0; font-size: 11px; color: #666; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                        ${meta.desc_loc?.[Game.config.default_lang || 'en'] || ''}
                    </p>
                    <div style="display: flex; gap: 8px; font-size: 10px; margin-top: 4px; flex-wrap: wrap;">
                        ${rewardsPreview.join(' <span style="color:#333;">|</span> ')}
                    </div>
                </div>

                <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 4px; flex-shrink: 0;">
                    ${meta.old_cost?.amount ? `<span style="font-size: 10px; color: #555; text-decoration: line-through;">$${meta.old_cost.amount}</span>` : ''}
                    <button class="off-buy-btn" data-oid="${activeNode.offer_id}" style="background: linear-gradient(135deg, #e94560, #951c30); border: none; color: #fff; padding: 8px 16px; font-size: 11px; font-weight: bold; border-radius: 4px; cursor: pointer; transition: transform 0.1s;">
                        ${priceText}
                    </button>
                </div>
            </div>
        `;
    }).join('');

    return `
        <div class="screen-content ui-element" style="${getWindowContentStyle()} display: flex; flex-direction: column; box-sizing: border-box; top: 45px; height: calc(100% - 45px); overflow: hidden;">
            <div style="width: 100%; height: ${headerHeight}; display: flex; align-items: center; padding: 0 15px; box-sizing: border-box; border-bottom: 1px solid #1f1f1f; background: ${headerBg}; flex-shrink: 0; pointer-events: auto;">
                <div style="font-size: 12px; color: #e94560; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px;">
                    ⚡ ${t('off_live_deals')}
                </div>
            </div>
            <div style="flex: 1; overflow-y: auto; padding: 15px; box-sizing: border-box; display: flex; flex-direction: column; gap: 10px; pointer-events: auto;">
                ${offersCardsHTML}
            </div>
        </div>
    `;
}

export function initOffersScreen(container, updateUiCallback) {
    const isReload = !!container.querySelector('.screen-content');
    if (!isReload) {
        sendSocket('offers', 'getActiveOffers', {});
    }

    if (offersIntervalTimer) {
        clearInterval(offersIntervalTimer);
        offersIntervalTimer = null;
    }

    const oldScreen = container.querySelector('.screen-content');
    if (oldScreen) oldScreen.remove();

    container.insertAdjacentHTML('beforeend', getOffersHTML());

    // Обработчик покупки (убрали лишний моментальный initOffersScreen)
    container.querySelectorAll('.off-buy-btn').forEach(btn => {
        btn.onclick = () => {
            const offerId = btn.dataset.oid;
            btn.disabled = true; // Полная блокировка кнопки до ответа сервера
            sendSocket('offers', 'buyOfferBundle', { offerId, count: 1 });
        };
    });

    // Живой FOMO таймер
    const timerNodes = container.querySelectorAll('.fomo-timer');
    if (timerNodes.length > 0) {
        offersIntervalTimer = setInterval(() => {
            let activeTimersCount = 0;
            const now = Date.now();

            timerNodes.forEach(node => {
                const expireTimestamp = Number(node.dataset.expire) || 0;
                const msLeft = expireTimestamp - now;

                if (msLeft <= 0) {
                    node.innerText = "⏳ 00:00:00";
                    node.style.color = "#555";
                    node.style.background = "rgba(0,0,0,0.2)";
                } else {
                    activeTimersCount++;
                    const hours = Math.floor(msLeft / 3600000);
                    const minutes = Math.floor((msLeft % 3600000) / 60000);
                    const seconds = Math.floor((msLeft % 60000) / 1000);
                    node.innerText = `⏳ ${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
                }
            });

            if (activeTimersCount === 0) {
                clearInterval(offersIntervalTimer);
                sendSocket('offers', 'getActiveOffers', {});
            }
        }, 1000);
    }
}

// Экспортируем метод очистки для твоего деструктора/менеджера экранов
export function destroyOffersScreen() {
    if (offersIntervalTimer) {
        clearInterval(offersIntervalTimer);
        offersIntervalTimer = null;
    }
}

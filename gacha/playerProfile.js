// playerProfile.js

import { t, locObj, headers, API_URL, getWindowContentStyle } from './shared.js';
import {Game} from "./stateManager.js";

// 1. СЕТЕВОЙ МЕТОД (Исправлены заголовки и безопасное извлечение истории)
export async function getPlayerHistory(type) {
    try {
        const res = await fetch(`${API_URL}/auth/history`, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    partnerId: Game.player?.partnerId || 'demo_mtwtech',
                    sessionId: Game.player?.sessionId || localStorage.getItem('gacha_builder_account_token'),
                    username: Game.player?.username,
                    type
                })
        });

        const data = await res.json();
        if (!res.ok || data.error) throw new Error(data.error || 'History error');

        // Наш бэкенд возвращает историю, забираем массив (например, data.transactions или сам data)
        return Array.isArray(data) ? data : (data.history || []);
    } catch (err) {
        console.error(err);
        return { error: true, message: err.message };
    }
}

// 2. СИНХРОННАЯ ФУНКЦИЯ ГЕНЕРАЦИИ СКЕЛЕТА (ИСПРАВЛЕНО: убран await)
function getTransactionsTabHTML() {
    const orientation = Game.config.orientation || 'landscape';
    const screenSettings = Game.config?.ui?.[orientation]?.find(w => w.id === 'screen_profile') || {};
    const profileLayout = screenSettings.profile_layout || {};
    const fields = profileLayout.transaction_fields || [];

    // Генерируем шапку таблицы из твоего конфига админки
    let thHTML = fields.map(f => `
        <th style="padding: 10px; text-align: left; font-size: 11px; color: #aaa; text-transform: uppercase; border-bottom: 2px solid #333; font-weight: bold;">
            ${t(f.label_loc_key)}
        </th>
    `).join('');

    return `
        <div class="profile-tab-transactions" style="width: 100%; height: 100%; display: flex; flex-direction: column;">
            <div style="flex: 1; overflow-y: auto; border: 1px solid #333; border-radius: 6px; background: rgba(0,0,0,0.2);">
                <table style="width: 100%; border-collapse: collapse; font-family: sans-serif;">
                    <thead>
                        <tr style="background: #111;">${thHTML}</tr>
                    </thead>
                    <!-- Сюда временно ставим лоадер с colspan на всю ширину колонок -->
                    <tbody class="transactions-tbody-container">
                        <tr>
                            <td colspan="${fields.length}" style="padding: 30px; text-align: center; color: #aaa; font-size: 13px;">
                                ⏳ ${Game.locale === 'ru' ? 'Загрузка истории транзакций...' : 'Loading transactions history...'}
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

// 3. АСИНХРОННАЯ ФУНКЦИЯ ЗАПОЛНЕНИЯ ДАННЫХ (Твой динамический цикл обработки типов полей)
async function loadAndRenderTransactions(tbodyContainer) {
    const orientation = Game.config.orientation || 'landscape';
    const screenSettings = Game.config?.ui?.[orientation]?.find(w => w.id === 'screen_profile') || {};
    const profileLayout = screenSettings.profile_layout || {};
    const fields = profileLayout.transaction_fields || [];

    // Запускаем сетевой запрос к истории
    const txHistory = await getPlayerHistory('cashier');

    if (txHistory.error || !Array.isArray(txHistory) || txHistory.length === 0) {
        tbodyContainer.innerHTML = `<tr><td colspan="${fields.length}" style="padding: 20px; text-align: center; color: #666; font-size: 12px;">Нет записей о транзакциях</td></tr>`;
        return;
    }

    let rowsHTML = '';

    txHistory.forEach(tx => {
        rowsHTML += `<tr style="border-bottom: 1px solid #222; background: rgba(255,255,255,0.01);">`;

        fields.forEach(f => {
            let value = tx[f.id];
            let cellStyle = `padding: 10px; font-size: 12px; color: #fff; white-space: nowrap;`;

            if (f.type === 'date') {
                const date = new Date(value);
                value = date.toLocaleDateString(Game.locale || 'ru') + ' ' + date.toLocaleTimeString(Game.locale || 'ru', {hour: '2-digit', minute:'2-digit'});
                cellStyle += `font-family: monospace; color: #888;`;
            }
            else if (f.type === 'loc_string') {
                let packMeta = null;
                Object.values(Game.config?.catalog?.items || {}).forEach(item => {
                    if (item.id === value) packMeta = item;
                });
                if (!packMeta) {
                    const allShops = Object.values(Game.config?.shops || {});
                    for (let shop of allShops) {
                        const found = shop.catalog?.find(item => item.id === value || item.itemId === value);
                        if (found) { packMeta = found; break; }
                    }
                }
                value = packMeta ? locObj(packMeta.title_loc) : value;
            }
            else if (f.type === 'number') {
                value = `<span style="color: #ffcc00; font-weight: bold; font-family: monospace;">💎 ${value}</span>`;
            }
            else if (f.type === 'string' && f.id === 'status') {
                const isSuccess = value === 'success';
                cellStyle += `font-weight: bold;`;
                value = `<span style="color: ${isSuccess ? '#4ade80' : '#ef4444'}; background: ${isSuccess ? 'rgba(74,222,128,0.1)' : 'rgba(239,68,68,0.1)'}; padding: 2px 6px; border-radius: 4px; font-size: 10px;">${value.toUpperCase()}</span>`;
            }

            rowsHTML += `<td style="${cellStyle}">${value}</td>`;
        });

        rowsHTML += `</tr>`;
    });

    // Точечно заменяем лоадер на готовую пачку строк
    tbodyContainer.innerHTML = rowsHTML;
}


let CurrentProfileTab = 'main';
// Добавляем локальную функцию генерации контента для таба "main"
function getMainProfileHTML() {
    const p = Game.player;

    // Расчет процента опыта для прогресс-бара
    const expPercent = Math.min(100, Math.floor(((p.exp || 0) / (p.max_exp || 1000)) * 100));

    // Считываем текущую рамку из стейта игрока (если поля нет, ставим дефолт)
    const currentFrameId = p.active_frame || 'frame_default';
    const frameMeta = Game.config.catalog?.frames?.[currentFrameId];
    const frameColor = frameMeta?.color || '#444';

    const companionOptionsHTML = (p.heroes || []).map(hero => {
        const proto = Game.config.catalog?.heroes?.[hero.hero_id];
        if (!proto) return '';
        const isCurrent = p.active_home_hero === hero.instance_id;
        return `<option value="${hero.instance_id}" ${isCurrent ? 'selected' : ''}>${locObj(proto.title_loc)}</option>`;
    }).join('');

    return `
        <div class="profile-tab-main" style="display: flex; flex-direction: column; gap: 15px; width: 100%; color: #fff; font-family: sans-serif;">
            
            <!-- Блок Аватара и Рамки -->
            <div style="display: flex; align-items: center; gap: 20px; background: rgba(255,255,255,0.02); padding: 15px; border-radius: 6px; border: 1px solid #333;">
                <div class="profile-avatar-wrapper" style="position: relative; width: 70px; height: 70px; display: flex; align-items: center; justify-content: center; background: #111; border-radius: 50%; border: 3px solid ${frameColor}; box-shadow: 0 0 10px rgba(0,0,0,0.5);">
                    <span style="font-size: 36px; user-select: none;">${p.avatar_icon ? `<img style="width:100%;" src="${p.avatar_icon}">` :  '👤'}</span>
                    <div style="position: absolute; bottom: -5px; right: -5px; background: #ffcc00; color: #000; font-size: 9px; font-weight: bold; padding: 2px 5px; border-radius: 10px; border: 1px solid #000;">
                        VIP ${p.vip_level || 0}
                    </div>
                </div>
                
                <!-- Кнопки быстрой кастомизации -->
                <div style="display: flex; flex-direction: column; gap: 5px;">
                    <button id="btn-change-avatar" style="padding: 4px 8px; background: #222; color: #ffcc00; border: 1px solid #ffcc00; border-radius: 4px; font-size: 11px; cursor: pointer;">
                        ⚙️ ${t('profile_change_avatar')}
                    </button>
                    <button id="btn-change-frame" style="padding: 4px 8px; background: #222; color: #ffcc00; border: 1px solid #ffcc00; border-radius: 4px; font-size: 11px; cursor: pointer;">
                        🖼️ ${t('profile_change_frame')}
                    </button>
                </div>
                
                <div style="display: flex; flex-direction: column; gap: 4px; margin-top: 5px;">
                    <label style="font-size: 11px; color: #aaa;">${t('btn_set_home_hero') || 'Компаньон на главном экране'}</label>
                    <select id="profile-companion-select" style="background: #111; color: #fff; border: 1px solid #444; padding: 6px 10px; border-radius: 4px; font-size: 12px; font-weight: bold; width: 100%; pointer-events: auto; cursor: pointer;">
                        ${companionOptionsHTML || `<option disabled>${t('inventory_empty')}</option>`}
                    </select>
                </div>
            </div>

            <!-- Информационный блок (Никнейм и Уровень) -->
            <div style="display: flex; flex-direction: column; gap: 10px; background: rgba(255,255,255,0.02); padding: 15px; border-radius: 6px; border: 1px solid #333;">
                <div style="display: flex; flex-direction: column; gap: 4px;">
                    <label style="font-size: 11px; color: #aaa;">${t('profile_nickname_label')}</label>
                    <div style="display: flex; gap: 10px; align-items: center;">
                        <input type="text" id="profile-nickname-input" value="${p.nickname || ''}" style="background: #111; color: #fff; border: 1px solid #444; padding: 6px 10px; border-radius: 4px; font-size: 13px; font-weight: bold; width: 60%;">
                        <button id="btn-save-profile" style="padding: 6px 12px; background: #ffcc00; color: #000; border: none; font-weight: bold; border-radius: 4px; font-size: 12px; cursor: pointer;">
                            ${t('profile_save_btn')}
                        </button>
                    </div>
                </div>

                <!-- Прогресс Уровня -->
                <div style="display: flex; flex-direction: column; gap: 4px; margin-top: 5px;">
                    <div style="display: flex; justify-content: space-between; font-size: 12px; font-weight: bold;">
                        <span style="color: #ffcc00;">${t('heroes_lvl')} ${p.level || 1}</span>
                        <span style="color: #aaa; font-family: monospace;">${p.exp || 0} / ${p.max_exp || 1000}</span>
                    </div>
                    <!-- Нативный HTML5 прогресс-бар -->
                    <div style="width: 100%; height: 8px; background: #111; border-radius: 4px; overflow: hidden; border: 1px solid #333;">
                        <div style="width: ${expPercent}%; height: 100%; background: linear-gradient(90deg, #ff9900, #ffcc00); transition: width 0.3s ease;"></div>
                    </div>
                </div>
            </div>

        </div>
    `;
}

// Вызывается, когда CurrentProfileTab === 'achievements'
function getAchievementsTabHTML() {
    const playerAchievements = Game.player?.achievements || [];
    const metaList = Game.config?.catalog?.achievements_meta || {};

    let listHtml = '';

    playerAchievements.forEach(ach => {
        const meta = metaList[ach.id];
        if (!meta) return;

        const isComplete = ach.progress >= ach.max;
        const isClaimed = ach.is_claimed;

        // Расчет прогресс-бара ачивки
        const percent = Math.min(100, Math.floor((ach.progress / ach.max) * 100));

        // Вычисляем визуал кнопки в зависимости от стейта (Забрать / В процессе / Получено)
        let actionBtnHTML = '';
        if (isClaimed) {
            actionBtnHTML = `<button style="padding:6px 12px; background:#333; color:#666; border:none; border-radius:4px; font-size:11px; cursor:not-allowed;" disabled>✔</button>`;
        } else if (isComplete) {
            actionBtnHTML = `<button class="btn-claim-achievement" data-ach-id="${ach.id}" style="padding:6px 12px; background:#ffcc00; color:#000; border:none; font-weight:bold; border-radius:4px; font-size:11px; cursor:pointer; pointer-events:auto;">Claim</button>`;
        } else {
            actionBtnHTML = `<button style="padding:6px 12px; background:#222; color:#aaa; border:1px solid #444; border-radius:4px; font-size:11px; cursor:not-allowed;" disabled>${ach.progress}/${ach.max}</button>`;
        }

        listHtml += `
            <div style="display:flex; align-items:center; justify-content:between; background:rgba(255,255,255,0.02); padding:10px 15px; border-radius:6px; border:1px solid #333; box-sizing:border-box; gap:15px; margin-bottom:8px;">
                <span style="font-size:24px; user-select:none;">${meta.icon || '🏅'}</span>
                
                <div style="flex:1; display:flex; flex-direction:column; gap:3px; min-width:0;">
                    <b style="font-size:13px; color:#fff; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${locObj(meta.title_loc)}</b>
                    <span style="font-size:11px; color:#aaa; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${locObj(meta.desc_loc)}</span>
                    
                    <!-- Мини прогресс-бар -->
                    <div style="width:100%; height:4px; background:#111; border-radius:2px; overflow:hidden; margin-top:3px;">
                        <div style="width:${percent}%; height:100%; background:${isComplete ? '#ffcc00' : '#3b82f6'};"></div>
                    </div>
                </div>

                <!-- Блок Награды и Кнопки -->
                <div style="display:flex; align-items:center; gap:12px; flex-shrink:0;">
                    <div style="font-size:11px; color:#ffcc00; display:flex; align-items:center; gap:3px;">
                        <span>🎁</span><b>x${meta.reward?.count || 1}</b>
                    </div>
                    ${actionBtnHTML}
                </div>
            </div>
        `;
    });

    return `
        <div class="profile-tab-achievements" style="display:flex; flex-direction:column; width:100%; height:100%;">
            <div style="flex:1; overflow-y:auto; padding-right:5px; box-sizing:border-box;">
                ${listHtml || `<div style="color:#aaa; text-align:center; padding:20px;">Нет доступных достижений</div>`}
            </div>
        </div>
    `;
}

// Вызывается, когда CurrentProfileTab === 'match_history'
function getMatchHistoryTabHTML() {
    const orientation = Game.config.orientation || 'landscape';
    const screenSettings = Game.config?.ui?.[orientation]?.find(w => w.id === 'screen_profile') || {};
    const profileLayout = screenSettings.profile_layout || {};
    const fields = profileLayout.match_history_fields || [];

    // Шапка таблицы
    let thHTML = fields.map(f => `
        <th style="padding: 10px; text-align: left; font-size: 11px; color: #aaa; text-transform: uppercase; border-bottom: 2px solid #333; font-weight: bold;">
            ${t(f.label_loc_key)}
        </th>
    `).join('');

    return `
        <div class="profile-tab-match-history" style="width: 100%; height: 100%; display: flex; flex-direction: column;">
            <div style="flex: 1; overflow-y: auto; border: 1px solid #333; border-radius: 6px; background: rgba(0,0,0,0.2);">
                <table style="width: 100%; border-collapse: collapse; font-family: sans-serif;">
                    <thead>
                        <tr style="background: #111;">${thHTML}</tr>
                    </thead>
                    <tbody class="match-history-tbody-container">
                        <!-- Сюда мгновенно встает заглушка, которая за секунду подменится на реальные данные -->
                    </tbody>
                </table>
            </div>
        </div>
    `;
}
async function loadAndRenderMatchHistory(tbodyContainer) {
    const orientation = Game.config.orientation || 'landscape';
    const screenSettings = Game.config?.ui?.[orientation]?.find(w => w.id === 'screen_profile') || {};
    const profileLayout = screenSettings.profile_layout || {};
    const fields = profileLayout.match_history_fields || [];

    // ИСПРАВЛЕНО: Безопасное чтение истории матчей из вложенного объекта game_data
    // const matches = Game.player?.game_data?.match_history || Game.player?.match_history || [];

    const matches = await getPlayerHistory('bets');

    if (!matches || matches.error || !Array.isArray(matches) || matches.length === 0) {
        tbodyContainer.innerHTML = `<tr><td colspan="${fields.length}" style="padding: 20px; text-align: center; color: #666; font-size: 12px;">История игр пуста</td></tr>`;
        return;
    }

    let rowsHTML = '';

    matches.forEach(m => {
        rowsHTML += `<tr style="border-bottom: 1px solid #222; background: rgba(255,255,255,0.01);">`;

        fields.forEach(f => {
            let value = m[f.id];
            let cellStyle = `padding: 10px; font-size: 12px; color: #fff; white-space: nowrap;`;

            if (f.type === 'date') {
                const date = new Date(value);
                value = date.toLocaleDateString(Game.locale || 'ru') + ' ' + date.toLocaleTimeString(Game.locale || 'ru', {hour: '2-digit', minute:'2-digit'});
                cellStyle += `font-family: monospace; color: #888;`;
            }
            else if (f.type === 'loc_string') {
                const gameMeta = Game.config?.catalog?.games?.[value];
                value = gameMeta ? locObj(gameMeta.title_loc) : value;
            }
            else if (f.type === 'badge') {
                const isWin = value === 'win';
                const badgeColor = isWin ? '#4ade80' : '#ef4444';
                const badgeBg = isWin ? 'rgba(74,222,128,0.1)' : 'rgba(239,68,68,0.1)';
                value = `<span style="color: ${badgeColor}; background: ${badgeBg}; padding: 2px 6px; border-radius: 4px; font-weight: bold; font-size: 10px;">${value.toUpperCase()}</span>`;
            }
            else if (f.type === 'resource') {
                const rewardData = m[f.id] || {};
                const resMeta = Game.config?.mechanics?.resources?.[rewardData.resource];
                const resIcon = resMeta ? resMeta.icon : '🔮';

                value = `
                        <div style="display: flex; align-items: center; gap: 4px; font-family: monospace; color: #ffcc00; font-weight: bold;">
                            <span>${resIcon}</span> <span>+${rewardData.count || 0}</span>
                        </div>
                    `;
            }

            rowsHTML += `<td style="${cellStyle}">${value}</td>`;
        });

        rowsHTML += `</tr>`;
    });

    tbodyContainer.innerHTML = rowsHTML;
}


// Вызывается, когда CurrentProfileTab === 'promo'
function getPromoTabHTML() {
    const p = Game.player;

    return `
        <div class="profile-tab-promo" style="display: flex; flex-direction: column; gap: 20px; width: 100%; color: #fff; font-family: sans-serif;">
            <h4 style="margin: 0; font-size: 14px; color: #ffcc00; text-transform: uppercase;">${t('promo_title')}</h4>
            
            <!-- БЛОК А: Промокод (Свитки/Гемы) -->
            <div style="display: flex; flex-direction: column; gap: 6px; background: rgba(255,255,255,0.02); padding: 15px; border-radius: 6px; border: 1px solid #333;">
                <div style="display: flex; gap: 10px; align-items: center; pointer-events: auto;">
                    <input type="text" id="input-promo-code" placeholder="${t('promo_input_placeholder')}" 
                        style="background: #111; color: #fff; border: 1px solid #444; padding: 8px 12px; border-radius: 4px; font-size: 12px; flex: 1;">
                    <button id="btn-submit-promo" style="padding: 8px 16px; background: #ffcc00; color: #000; border: none; font-weight: bold; border-radius: 4px; font-size: 12px; cursor: pointer;">
                        ${t('promo_btn_activate')}
                    </button>
                </div>
            </div>

            <!-- БЛОК Б: Инвайт-код (Реферальная привязка) -->
            <div style="display: flex; flex-direction: column; gap: 6px; background: rgba(255,255,255,0.02); padding: 15px; border-radius: 6px; border: 1px solid #333;">
                <div style="display: flex; gap: 10px; align-items: center; pointer-events: auto;">
                    <!-- Если инвайт уже применен ранее, блокируем поле для повторного ввода -->
                    <input type="text" id="input-invite-code" placeholder="${t('invite_input_placeholder')}" 
                        value="${p.linked_invite_id || ''}" 
                        ${p.linked_invite_id ? 'disabled' : ''} 
                        style="background: #111; color: #fff; border: 1px solid #444; padding: 8px 12px; border-radius: 4px; font-size: 12px; flex: 1; ${p.linked_invite_id ? 'color: #666; border-color: #222;' : ''}">
                    
                    <button id="btn-submit-invite" ${p.linked_invite_id ? 'disabled' : ''} 
                        style="padding: 8px 16px; background: ${p.linked_invite_id ? '#333' : '#ffcc00'}; color: ${p.linked_invite_id ? '#666' : '#000'}; border: none; font-weight: bold; border-radius: 4px; font-size: 12px; cursor: ${p.linked_invite_id ? 'not-allowed' : 'pointer'};">
                        ${p.linked_invite_id ? '✔' : t('invite_btn_link')}
                    </button>
                </div>
            </div>
        </div>
    `;
}

// Вызывается, когда CurrentProfileTab === 'social_bind'
function getSocialBindTabHTML() {
    const orientation = Game.config.orientation || 'landscape';
    const screenSettings = Game.config?.ui?.[orientation]?.find(w => w.id === 'screen_profile') || {};
    const profileLayout = screenSettings.profile_layout || {};

    // Считываем список поддерживаемых платформ из конфига
    const supportedBinds = profileLayout.supported_social_binds || ["email", "discord"];
    // Текущие привязки игрока из твоего стейта getOrCreatePlayer
    const playerBinds = Game.player?.social_binds || {};

    let listHtml = '';

    supportedBinds.forEach(platformId => {
        const linkedValue = playerBinds[platformId]; // Вернет строку (email/ник) или null
        const isLinked = !!linkedValue;

        // Иконки-заглушки для платформ
        const icons = { email: "📧", discord: "💬", telegram: "✈" };
        const icon = icons[platformId] || "🔗";

        let statusText = '';
        let btnHTML = '';

        if (isLinked) {
            statusText = t('social_status_linked').replace('{value}', linkedValue);
            btnHTML = `<button style="padding: 6px 12px; background: #333; color: #666; border: none; border-radius: 4px; font-size: 11px; cursor: not-allowed;" disabled>✔</button>`;
        } else {
            statusText = `<span style="color: #666;">${t('social_status_empty')}</span>`;
            btnHTML = `
                <button class="btn-bind-platform" data-platform="${platformId}" style="padding: 6px 12px; background: #ffcc00; color: #000; border: none; font-weight: bold; border-radius: 4px; font-size: 11px; cursor: pointer; pointer-events: auto;">
                    ${t('social_btn_bind')}
                </button>
            `;
        }

        listHtml += `
            <div style="display: flex; align-items: center; justify-content: space-between; background: rgba(255,255,255,0.02); padding: 10px 15px; border-radius: 6px; border: 1px solid #333; box-sizing: border-box; margin-bottom: 8px;">
                <div style="display: flex; align-items: center; gap: 12px;">
                    <span style="font-size: 20px; user-select: none;">${icon}</span>
                    <div style="display: flex; flex-direction: column;">
                        <b style="font-size: 13px; color: #fff; text-transform: capitalize;">${platformId}</b>
                        <span style="font-size: 11px; line-height: 1.3;">${statusText}</span>
                    </div>
                </div>
                ${btnHTML}
            </div>
        `;
    });

    return `
        <div class="profile-tab-social" style="display: flex; flex-direction: column; width: 100%; height: 100%;">
            <h4 style="margin: 0 0 4px 0; font-size: 14px; color: #ffcc00; text-transform: uppercase;">${t('social_title')}</h4>
            <p style="margin: 0 0 15px 0; font-size: 11px; color: #aaa; line-height: 1.4;">${t('social_desc')}</p>
            <div style="flex: 1; overflow-y: auto;">
                ${listHtml}
            </div>
        </div>
    `;
}


// Модифицируем внутренний метод отрисовки табов в playerProfile.js
export function initPlayerProfileScreen(container, updateUiCallback) {
    let contentWrapper = container.querySelector('.screen-content-profile');

    if (!contentWrapper) {
        contentWrapper = document.createElement('div');
        contentWrapper.className = 'screen-content screen-content-profile ui-element';
        import('./shared.js').then(m => {
            contentWrapper.style.cssText = m.getWindowContentStyle() + " display: flex; flex-direction: row; box-sizing: border-box; top: 45px; height: calc(100% - 45px);";
        });
        container.appendChild(contentWrapper);
    }

    const refreshActiveTabContent = () => {
        const rightContainer = contentWrapper.querySelector('.profile-content-container');
        if (!rightContainer) return;

        console.log(CurrentProfileTab);

        if (CurrentProfileTab === 'main') {
            rightContainer.innerHTML = getMainProfileHTML();
            attachMainTabEvents();
        }
        else if (CurrentProfileTab === 'achievements') {
            rightContainer.innerHTML = getAchievementsTabHTML();
            attachAchievementsEvents();
        }
        else if (CurrentProfileTab === 'transactions') {
            rightContainer.innerHTML = getTransactionsTabHTML();
            const tbodyContainer = rightContainer.querySelector('.transactions-tbody-container');
            if (tbodyContainer) {
                loadAndRenderTransactions(tbodyContainer);
            }
        }
        else if (CurrentProfileTab === 'match_history') { // или как называется вкладка истории
            rightContainer.innerHTML = getMatchHistoryTabHTML();

            const tbodyContainer = rightContainer.querySelector('.match-history-tbody-container');
            if (tbodyContainer) {
                loadAndRenderMatchHistory(tbodyContainer);
            }
        }
        else if (CurrentProfileTab === 'promo') {
            rightContainer.innerHTML = getPromoTabHTML();
            attachPromoTabEvents();
        }
// ДОБАВЛЕНО: Рендер привязок соцсетей (Шаг 6)
        else if (CurrentProfileTab === 'social_bind') {
            rightContainer.innerHTML = getSocialBindTabHTML();
            attachSocialBindEvents();
        }
        else {
            // Оставляем временные текстовые заглушки для остальных табов (будем наполнять дальше)
            rightContainer.innerHTML = `
                <h3 style="margin: 0 0 15px 0; font-size: 20px;">${t(`tab_profile_${CurrentProfileTab}`)}</h3>
                <p style="color: #aaa; font-size: 13px;">Контент вкладки "${CurrentProfileTab}" готовится к отрисовке...</p>
            `;
        }
    };

    const attachAchievementsEvents = () => {
        contentWrapper.querySelectorAll('.btn-claim-achievement').forEach(btn => {
            btn.onclick = async (e) => {
                e.stopPropagation();
                const achId = btn.dataset.achId;

                // Временный клайм на клиенте (пока нет роута /api/profile/claim-achievement)
                const targetAch = Game.player.achievements?.find(a => a.id === achId);
                if (targetAch) {
                    targetAch.is_claimed = true;

                    // Начисляем награду в стейт игрока на лету для теста
                    const meta = Game.config?.catalog?.achievements_meta?.[achId];
                    if (meta && meta.reward?.type === 'resource') {
                        Game.player.resources[meta.reward.id] = (Game.player.resources[meta.reward.id] || 0) + meta.reward.count;
                    }

                    updateUiCallback(); // Обновляем бары ресурсов на главном экране
                    refreshActiveTabContent(); // Перерисовываем список ачивок (кнопка сменится на галочку)
                }
            };
        });
    };


    // Слушатели событий изменения имени, аватара и рамок
    const attachMainTabEvents = () => {
        // Кнопка сохранения никнейма
        const saveBtn = contentWrapper.querySelector('#btn-save-profile');
        if (saveBtn) {
            saveBtn.onclick = async (e) => {
                e.stopPropagation();
                const newName = contentWrapper.querySelector('#profile-nickname-input').value;
                if (!newName.trim()) return;

                // Временное изменение стейта на клиенте (пока не прикрутим роут на NodeJS)
                Game.player.nickname = newName;
                updateUiCallback(); // Обновляем бары общего интерфейса, где пишется имя
                alert(t('alert_equip_success'));
            };
        }

        // Заготовки под клики смены аватаров/рамок (в будущем развернем выбор из catalog.avatars)
        const avatarBtn = contentWrapper.querySelector('#btn-change-avatar');
        if (avatarBtn) {
            avatarBtn.onclick = (e) => { e.stopPropagation(); alert("Выбор аватаров откроется в следующем шаге."); };
        }

        const frameBtn = contentWrapper.querySelector('#btn-change-frame');
        if (frameBtn) {
            frameBtn.onclick = (e) => { e.stopPropagation(); alert("Выбор рамок откроется в следующем шаге."); };
        }
    };

    const attachPromoTabEvents = () => {
        // 1. Обработка клика активации Промокода
        const promoBtn = contentWrapper.querySelector('#btn-submit-promo');
        if (promoBtn) {
            promoBtn.onclick = (e) => {
                e.stopPropagation();
                const codeInput = contentWrapper.querySelector('#input-promo-code').value.trim().toUpperCase();
                if (!codeInput) return;

                // Временная заглушка логики на клиенте для проверки начисления ассетов
                if (codeInput === 'GIFT777') {
                    // Начисляем 500 алмазов прямо в твой стейт resources.diamond
                    Game.player.resources.diamond = (Game.player.resources.diamond || 0) + 500;
                    updateUiCallback(); // Синхронно обновляем верхний бар ресурсов на экране
                    alert(t('alert_promo_success'));
                    contentWrapper.querySelector('#input-promo-code').value = '';
                } else {
                    alert(t('alert_login_error') || "Invalid Code!");
                }
            };
        }

        // 2. Обработка клика отправки Инвайт-кода
        const inviteBtn = contentWrapper.querySelector('#btn-submit-invite');
        if (inviteBtn) {
            inviteBtn.onclick = (e) => {
                e.stopPropagation();
                const inviteInput = contentWrapper.querySelector('#input-invite-code').value.trim();
                if (!inviteInput) return;

                // Записываем привязку в твой динамический профиль игрока, чтобы заблокировать повторный ввод
                Game.player.linked_invite_id = inviteInput;

                // Перерисовываем таб контента (поле задизейблится, кнопка сменится на галочку)
                refreshActiveTabContent();
                alert(t('alert_invite_success'));
            };
        }
    };


    const attachSocialBindEvents = () => {
        contentWrapper.querySelectorAll('.btn-bind-platform').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                const platform = btn.dataset.platform;

                // Заглушка интерактивного ввода. В продакшене тут будет вызов внешнего OAuth API
                const userInput = prompt(`Введите данные для привязки к ${platform}:`);
                if (!userInput || !userInput.trim()) return;

                // На лету сохраняем в твой динамический стейт игрока social_binds
                if (!Game.player.social_binds) Game.player.social_binds = {};
                Game.player.social_binds[platform] = userInput.trim();

                refreshActiveTabContent(); // Перерисовываем контент таба, кнопка сменится на галочку
            };
        });
    };


    const orientation = Game.config.orientation || 'landscape';
    const screenSettings = Game.config?.ui?.[orientation]?.find(w => w.id === 'screen_profile') || {};
    const configuredTabs = screenSettings.profile_layout?.tabs_order || ["main", "achievements", "transactions", "match_history", "promo", "social_bind"];

    // Генерируем HTML кнопок левого меню табов
    const sidebarHTML = `
        <div class="profile-sidebar-tabs" style="display: flex; flex-direction: column; gap: 8px; width: 110px; border-right: 1px solid #333; padding-right: 8px; box-sizing: border-box; height: 100%; flex-shrink: 0; background: #222222; overflow-y: auto; pointer-events: auto;">
            ${configuredTabs.map(tabKey => {
        const isActive = CurrentProfileTab === tabKey;
        return `
                    <button class="btn-profile-tab" data-tab-id="${tabKey}" 
                        style="width: 100%; height: 32px; background: ${isActive ? '#ffcc00' : '#111'}; color: ${isActive ? '#000' : '#fff'}; border: 1px solid ${isActive ? '#ffcc00' : '#444'}; border-radius: 4px; font-weight: bold; font-size: 11px; text-align: center; cursor: pointer; padding: 0;"
                        title="${t(`tab_profile_${tabKey}`)}">
                        ${t(`tab_profile_${tabKey}`)}
                    </button>
                `;
    }).join('')}
        </div>
    `;

    // Заливаем разметку: сайдбар + правый пустой контейнер под табы
    contentWrapper.innerHTML = `
        ${sidebarHTML}
        <div class="profile-content-container" style="flex: 1; height: 100%; overflow-y: auto; box-sizing: border-box; padding-left: 15px; pointer-events: auto;"></div>
    `;

    // Вешаем слушатели кликов на табы левого меню (сайдбар)
    contentWrapper.querySelectorAll('.btn-profile-tab').forEach(btn => {
        btn.onclick = (e) => {
            e.stopPropagation();
            contentWrapper.querySelectorAll('.btn-profile-tab').forEach(b => {
                b.style.background = '#111'; b.style.color = '#fff'; b.style.borderColor = '#444';
            });
            btn.style.background = '#ffcc00'; btn.style.color = '#000'; btn.style.borderColor = '#ffcc00';

            CurrentProfileTab = btn.dataset.tabId;
            refreshActiveTabContent();
        };
    });

    // Стартовый запуск отрисовки текущей активной вкладки
    refreshActiveTabContent();
}

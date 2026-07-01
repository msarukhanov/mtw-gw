import { t, getWindowContentStyle } from '../../shared.js';
import { Game } from "../../stateManager.js";
import { sendSocket } from "../../socket.js";

export const MailState = {
    activeMailId: null // ID письма, которое сейчас открыто для чтения
};

/**
 * Вспомогательная функция генерации HTML для левого списка писем
 */
function getMailListHTML(mailList, activeId) {
    if (!mailList || mailList.length === 0) {
        return `
            <div style="margin: auto; color: #444; font-size: 12px; font-style: italic; padding: 20px 0;">
                ${t('ml_empty_box') || 'Your mailbox is empty...'}
            </div>
        `;
    }

    return mailList.map(m => {
        const isSelected = String(m.id) === String(activeId);

        // Статусы иконки: 🎁 — есть незабранная награда, ✉️ — новое письмо, 📖 — прочитанное пустое
        let icon = '📖';
        const hasRewards = Array.isArray(m.rewards) && m.rewards.length > 0;
        if (hasRewards && !m.is_claimed) icon = '🎁';
        else if (!m.is_read) icon = '✉️';

        const dateStr = new Date(m.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' });

        return `
            <div class="ml-item-row" data-mid="${m.id}" style="width: 100%; height: 50px; background: ${isSelected ? '#1b263b' : '#141414'}; border: 1px solid ${isSelected ? '#2196f3' : '#1f1f1f'}; border-radius: 6px; display: flex; align-items: center; padding: 0 10px; box-sizing: border-box; justify-content: space-between; gap: 10px; cursor: pointer; transition: all 0.2s; flex-shrink: 0; pointer-events: auto;">
                <div style="display: flex; align-items: center; gap: 10px; min-width: 0; text-align: left;">
                    <span style="font-size: 16px; flex-shrink: 0;">${icon}</span>
                    <div style="display: flex; flex-direction: column; min-width: 0;">
                        <b style="font-size: 12px; color: ${m.is_read ? '#aaa' : '#fff'}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${m.title}</b>
                        <span style="font-size: 10px; color: #444;">${dateStr}</span>
                    </div>
                </div>
                ${!m.is_read ? `<div style="width: 6px; height: 6px; background: #ff4081; border-radius: 50%; flex-shrink: 0; box-shadow: 0 0 4px #ff4081;"></div>` : ''}
            </div>
        `;
    }).join('');
}

/**
 * Вспомогательная функция генерации HTML для правого окна чтения письма
 */
function getMailReaderHTML(activeMail) {
    if (!activeMail) {
        return `
            <div style="margin: auto; color: #444; font-size: 12px; font-style: italic; text-align: center;">
                ${t('ml_select_prompt') || 'Select a transmission link to read content...'}
            </div>
        `;
    }

    // Парсим массив наград из твоего JSONB поля
    const rewards = activeMail.rewards || [];
    let rewardsHTML = '';

    if (rewards.length > 0) {
        const itemsHTML = rewards.map(r => {
            // Мапим красивые иконки по типам ресурсов из конфига
            let icon = '📦';
            if (r.id === 'gold') icon = '🪙';
            else if (r.id === 'diamonds' || r.id === 'gems') icon = '💎';
            else if (r.id === 'hero_exp' || r.id === 'exp') icon = '🧪';

            return `
                <div style="background: #111; border: 1px solid #222; border-radius: 6px; padding: 6px 10px; display: flex; align-items: center; gap: 8px; font-size: 11px; min-width: 80px;">
                    <span style="font-size: 16px;">${icon}</span>
                    <div style="display: flex; flex-direction: column; text-align: left;">
                        <span style="color: #888; font-size: 9px; text-transform: uppercase;">${r.id}</span>
                        <b style="color: #fff;">x${r.count}</b>
                    </div>
                </div>
            `;
        }).join('');

        rewardsHTML = `
            <div style="margin-top: auto; border-top: 1px solid #1f1f1f; padding-top: 12px; display: flex; flex-direction: column; gap: 8px; align-items: flex-start; flex-shrink: 0;">
                <span style="font-size: 10px; color: #2196f3; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px;">
                    🎁 ${t('ml_attachments') || 'Attached Payload'}
                </span>
                <div style="display: flex; gap: 8px; flex-wrap: wrap; pointer-events: auto;">
                    ${itemsHTML}
                </div>
            </div>
        `;
    }

    // Логика блокировки кнопки забора наград
    const isClaimBtnDisabled = activeMail.is_claimed || rewards.length === 0;
    const claimBtnBg = isClaimBtnDisabled
        ? '#1a1a1a'
        : 'linear-gradient(135deg, #4ecca3, #2b9371)';
    const claimBtnBorder = isClaimBtnDisabled ? '1px solid #333' : 'none';
    const claimBtnTextColor = isClaimBtnDisabled ? '#555' : '#12122c';

    return `
        <div style="display: flex; flex-direction: column; flex: 1; height: 100%; padding: 15px; box-sizing: border-box; justify-content: space-between; gap: 15px;">
            <div style="display: flex; flex-direction: column; gap: 10px; flex: 1; overflow-y: auto; text-align: left;">
                <b style="font-size: 15px; color: #fff; border-bottom: 1px solid #1f1f1f; padding-bottom: 8px; flex-shrink: 0;">
                    ${activeMail.title}
                </b>
                <div style="font-size: 12px; color: #dfdfdf; word-break: break-word; line-height: 1.5; white-space: pre-line; flex: 1;">
                    ${activeMail.body}
                </div>
            </div>
            
            ${rewardsHTML}

            <div style="display: flex; gap: 10px; justify-content: flex-end; border-top: 1px solid #1f1f1f; padding-top: 12px; flex-shrink: 0; pointer-events: auto;">
                <button class="ml-action-btn" data-action="delete" data-mid="${activeMail.id}" style="height: 32px; background: #222; border: 1px solid #e94560; color: #e94560; padding: 0 16px; border-radius: 4px; font-size: 11px; font-weight: bold; cursor: pointer;">
                    ${t('ml_btn_delete') || 'Delete'}
                </button>
                <button class="ml-action-btn" data-action="claim" data-mid="${activeMail.id}" ${isClaimBtnDisabled ? 'disabled' : ''} style="height: 32px; background: ${claimBtnBg}; border: ${claimBtnBorder}; color: ${claimBtnTextColor}; padding: 0 20px; border-radius: 4px; font-size: 11px; font-weight: bold; cursor: ${isClaimBtnDisabled ? 'default' : 'pointer'};">
                    ${activeMail.is_claimed ? (t('ml_btn_claimed') || 'Claimed ✓') : (t('ml_btn_claim') || 'Claim Loot')}
                </button>
            </div>
        </div>
    `;
}

export function getMailHTML() {
    const orientation = Game.config.orientation || 'landscape';
    const screenSettings = Game.config?.ui?.[orientation]?.find(w => w.id === 'screen_mail') || {};
    const listSettings = screenSettings.list_settings || {};

    const sidebarWidth = listSettings.sidebar_width || "240px";
    const headerHeight = listSettings.header_height || "40px";
    const headerBg = listSettings.header_background || "#121212";

    const mailList = Game.player_mail || [];
    const activeMail = mailList.find(m => String(m.id) === String(MailState.activeMailId));

    const leftSidebarHTML = `
        <div style="display: flex; flex-direction: column; border-right: 1px solid #252525; box-sizing: border-box; height: 100%; width: ${sidebarWidth}; flex-shrink: 0; background: #141414; overflow: hidden;">
            <div style="width: 100%; height: ${headerHeight}; display: flex; align-items: center; justify-content: space-between; padding: 0 10px; box-sizing: border-box; border-bottom: 1px solid #1f1f1f; background: ${headerBg}; flex-shrink: 0; pointer-events: auto;">
                <div style="font-size: 11px; color: #aaa; font-weight: bold; text-transform: uppercase;">
                    📬 ${t('ml_inbox_header') || 'Inbox Matrix'}
                </div>
                <button id="ml_clear_all_btn" style="background: #222; border: 1px solid #444; color: #aaa; font-size: 10px; padding: 2px 6px; border-radius: 3px; cursor: pointer; font-weight: bold;">
                    ${t('ml_btn_clear_trash') || 'Clear Clean'}
                </button>
            </div>
            <div style="flex: 1; overflow-y: auto; padding: 10px; box-sizing: border-box; display: flex; flex-direction: column; gap: ${listSettings.gap || '8px'};">
                ${getMailListHTML(mailList, MailState.activeMailId)}
            </div>
        </div>
    `;

    const rightContentAreaHTML = `
        <div style="display: flex; flex-direction: column; flex: 1; height: 100%; background: #0a0a0a; overflow: hidden;">
            ${getMailReaderHTML(activeMail)}
        </div>
    `;

    return `
        <div class="screen-content ui-element" style="${getWindowContentStyle()} display: flex; flex-direction: row; box-sizing: border-box; top: 45px; height: calc(100% - 45px); overflow: hidden;">
            ${leftSidebarHTML}
            ${rightContentAreaHTML}
        </div>
    `;
}

export function initMailScreen(container, updateUiCallback) {
    // 1. При самом первом открытии экрана — запрашиваем список писем у бэкенда для прогрева
    const isReload = !!container.querySelector('.screen-content');
    if (!isReload) {
        sendSocket('mail', 'getInitialState', {});
    }

    const oldScreen = container.querySelector('.screen-content');
    if (oldScreen) oldScreen.remove();
    container.insertAdjacentHTML('beforeend', getMailHTML());

    const mailList = Game.player_mail || [];

    // --- А) КЛИКИ ПО СТРОКАМ ПИСЕМ (ВЫБОР И ЧТЕНИЕ) ---
    container.querySelectorAll('.ml-item-row').forEach(row => {
        row.onclick = () => {
            const mailId = row.dataset.mid;
            if (String(MailState.activeMailId) === String(mailId)) return;

            MailState.activeMailId = mailId;

            // Находим выбранное письмо в глобальном стейте
            const currentMail = mailList.find(m => String(m.id) === String(mailId));

            // ИСПРАВЛЕНИЕ: Шлем запрос 'markAsRead' строго на роут 'mail'
            // и только если письмо действительно еще не прочитано на сервере!
            if (currentMail && !currentMail.is_read) {
                sendSocket('mail', 'markAsRead', { mailId: mailId });

                // Локально тушим флаг непрочитанности, чтобы не кликать повторно
                currentMail.is_read = true;
            }

            // Перерисовываем интерфейс ящика
            initMailScreen(container, updateUiCallback);
        };
    });

    // --- Б) КНОПКИ ДЕЙСТВИЙ (ЗАБРАТЬ ЛУТ / УДАЛИТЬ ПИСЬМО) ---
    container.querySelectorAll('.ml-action-btn').forEach(btn => {
        btn.onclick = () => {
            const action = btn.dataset.action;
            const mailId = btn.dataset.mid;

            if (action === 'claim') {
                // Шлем намерение забрать награду на бэкенд
                sendSocket('mail', 'claimReward', { mailId: mailId });
            }
            else if (action === 'delete') {
                // Шлем намерение удалить конкретное письмо
                sendSocket('mail', 'deleteMail', { mailId: mailId });

                // Если удалили то письмо, которое сейчас открыто — сбрасываем фокус чтения
                if (String(MailState.activeMailId) === String(mailId)) {
                    MailState.activeMailId = null;
                }
            }
        };
    });

    // --- В) КНОПКА МАССОВОЙ ОЧИСТКИ ЯЩИКА ОТ МУСОРА ---
    const clearTrashBtn = container.querySelector('#ml_clear_all_btn');
    if (clearTrashBtn) {
        clearTrashBtn.onclick = () => {
            // Шлем намерение удалить все прочитанные пустые письма
            sendSocket('mail', 'clearTrashMail', {});
        };
    }
}

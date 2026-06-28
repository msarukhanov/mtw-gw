import { Game } from '../../stateManager.js';
import {t, getWindowContentStyle} from "../../shared.js";
import {sendSocket} from "../../socket.js";

export const QuestsState = {
    activeBoard: 'daily' // 'daily' | 'weekly' | 'daily_login'
};

// Функция генерации сетки календаря наград за вход
function getDailyLoginCalendarHTML() {
    const calendarId = "standard_monthly";
    const configCalendar = Game.config?.quests?.daily_login_calendars?.[calendarId] || { rewards: [] };
    const pLogin = Game.daily_login || { current_day_idx: 0, is_today_claimed: false };

    const rewardsNodes = configCalendar.rewards.map((node, index) => {
        const isClaimed = index < pLogin.current_day_idx || (index === pLogin.current_day_idx && pLogin.is_today_claimed);
        const isCurrent = index === pLogin.current_day_idx && !pLogin.is_today_claimed;

        let rewardText = "";
        if (node.resources) {
            Object.entries(node.resources).forEach(([k, v]) => rewardText += `${v} ${t(`res_${k}`, k)}`);
        } else if (node.items) {
            node.items.forEach(i => rewardText += `${i.amount}x ${t(`item_${i.itemId}`, i.itemId)}`);
        }

        let bg = "#141414";
        let border = "1px solid #222";
        if (isCurrent) { bg = "linear-gradient(135deg, #1b263b, #0d1117)"; border = "1px solid #2196f3"; }
        else if (isClaimed) { bg = "#080808"; opacity: "0.5"; }

        return `
            <div style="background: ${bg}; border: ${border}; border-radius: 6px; padding: 8px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; min-height: 65px; opacity: ${isClaimed ? '0.5' : '1'};">
                <span style="font-size: 9px; color: ${isCurrent ? '#2196f3' : '#555'}; font-weight: bold; font-family: monospace;">${t('q_calendar_day')} ${index + 1}</span>
                <span style="font-size: 16px;">${isClaimed ? '✅' : '🎁'}</span>
                <span style="font-size: 9px; color: #aaa; text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; width: 100%;">
                    ${rewardText}
                </span>
            </div>
        `;
    }).join('');

    return `
        <div style="display: flex; flex-direction: column; gap: 12px; height: 100%;">
            <div style="display: flex; justify-content: space-between; align-items: center; background: #111; border: 1px solid #1f1f1f; border-radius: 8px; padding: 12px; box-sizing: border-box;">
                <div style="text-align: left;">
                    <b style="font-size: 13px; color: #fff; display: block;">${t('q_calendar_title')}</b>
                    <span style="font-size: 10px; color: #555;">${t('q_calendar_desc')}</span>
                </div>
                <button id="q-btn-claim-daily" ${pLogin.is_today_claimed ? 'disabled style="background:#1a1a1a; border:1px solid #333; color:#555; padding:8px 16px; font-size:11px; font-weight:bold; border-radius:4px;"' : 'style="background:linear-gradient(135deg, #4ecca3, #218c65); border:none; color:#fff; padding:8px 16px; font-size:11px; font-weight:bold; border-radius:4px; cursor:pointer;"'}>
                    ${pLogin.is_today_claimed ? t('q_calendar_claimed') : t('q_calendar_btn_claim')}
                </button>
            </div>
            <div style="flex: 1; overflow-y: auto; display: grid; grid-template-columns: repeat(auto-fill, minmax(85px, 1fr)); gap: 8px; background: #070707; border: 1px solid #1f1f1f; border-radius: 6px; padding: 10px; box-sizing: border-box; pointer-events: auto;">
                ${rewardsNodes}
            </div>
        </div>
    `;
}

export function getQuestsHTML() {
    const orientation = Game.config.orientation || 'landscape';
    const screenSettings = Game.config?.ui?.[orientation]?.find(w => w.id === 'screen_bounty_board') || {};
    const listSettings = screenSettings.list_settings || {};

    const sidebarWidth = listSettings.sidebar_width || "220px";
    const headerHeight = listSettings.header_height || "40px";
    const headerBg = listSettings.header_background || "#121212";

    const currentBoard = QuestsState.activeBoard;
    const isDaily = currentBoard === 'daily';
    const isWeekly = currentBoard === 'weekly';
    const isCalendar = currentBoard === 'daily_login';

    // 1. ОБНОВЛЕННЫЙ САЙДБАР С ТРЕМЯ ВКЛАДКАМИ
    const sidebarHTML = `
        <div class="q-sidebar" style="display: flex; flex-direction: column; border-right: 1px solid #252525; padding: 10px; box-sizing: border-box; height: 100%; width: ${sidebarWidth}; flex-shrink: 0; background: #141414; gap: 10px; pointer-events: auto;">
            <div style="font-size: 11px; color: #555; font-weight: bold; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 4px;">
                ${t('q_boards_hub')}
            </div>
            
            <div class="q-tab-btn" data-board="daily" style="width: 100%; height: 44px; background: ${isDaily ? 'linear-gradient(135deg, #1b263b, #111)' : '#0c0c0c'}; border: 1px solid ${isDaily ? '#2196f3' : '#222'}; border-radius: 6px; padding: 0 12px; box-sizing: border-box; cursor: pointer; display: flex; align-items: center; gap: 10px; transition: all 0.2s;">
                <span style="font-size: 18px;">☀️</span>
                <b style="font-size: 12px; color: ${isDaily ? '#2196f3' : '#aaa'};">${t('q_daily_board')}</b>
            </div>

            <div class="q-tab-btn" data-board="weekly" style="width: 100%; height: 44px; background: ${isWeekly ? 'linear-gradient(135deg, #2a1b08, #111)' : '#0c0c0c'}; border: 1px solid ${isWeekly ? '#ffcc00' : '#222'}; border-radius: 6px; padding: 0 12px; box-sizing: border-box; cursor: pointer; display: flex; align-items: center; gap: 10px; transition: all 0.2s;">
                <span style="font-size: 18px;">🌙</span>
                <b style="font-size: 12px; color: ${isWeekly ? '#ffcc00' : '#aaa'};">${t('q_weekly_board')}</b>
            </div>

            <div class="q-tab-btn" data-board="daily_login" style="width: 100%; height: 44px; background: ${isCalendar ? 'linear-gradient(135deg, #132a13, #111)' : '#0c0c0c'}; border: 1px solid ${isCalendar ? '#4ecca3' : '#222'}; border-radius: 6px; padding: 0 12px; box-sizing: border-box; cursor: pointer; display: flex; align-items: center; gap: 10px; transition: all 0.2s;">
                <span style="font-size: 18px;">📅</span>
                <b style="font-size: 12px; color: ${isCalendar ? '#4ecca3' : '#aaa'};">${t('q_calendar_tab')}</b>
            </div>
        </div>
    `;
    // Если выбрана вкладка Календаря входа, отдаем его контент и прекращаем расчет досок
    if (isCalendar) {
        return `
            <div class="screen-content ui-element" style="${getWindowContentStyle()} display: flex; flex-direction: row; box-sizing: border-box; top: 45px; height: calc(100% - 45px); overflow: hidden;">
                ${sidebarHTML}
                <div class="q-center-area" style="display: flex; flex-direction: column; flex: 1; height: 100%; background: #0a0a0a; overflow: hidden; padding: 15px; box-sizing: border-box;">
                    ${getDailyLoginCalendarHTML()}
                </div>
            </div>
        `;
    }

    const boardConfig = Game.config?.quests?.[currentBoard] || { milestones: [], task_pool: {} };
    const playerBoardState = Game.quests?.[currentBoard] || { points: 0, tasks: {}, claimed_milestones: [] };

    // --- 2. ВЕРХНЯЯ ШКАЛА ПРОГРЕССА АКТИВНОСТИ И СУНДУКИ (MILESTONES) ---
    const milestones = boardConfig.milestones || [];
    const maxNeededPoints = milestones.length > 0 ? Math.max(...milestones.map(m => m.points_required || 100)) : 100;
    const barProgressPercent = Math.min(100, (playerBoardState.points / maxNeededPoints) * 100);

    const milestonesChestsHTML = milestones.map((m, idx) => {
        const reqPoints = m.points_required || 0;
        const isReached = playerBoardState.points >= reqPoints;
        const isClaimed = playerBoardState.claimed_milestones?.includes(idx);

        // Математически точный расчет позиции сундука на шкале
        const leftPercent = (reqPoints / maxNeededPoints) * 100;

        let chestIcon = '🔒';
        let chestStatusColor = '#555';
        if (isClaimed) { chestIcon = '🎁'; chestStatusColor = '#4ecca3'; }
        else if (isReached) { chestIcon = '⭐'; chestStatusColor = '#ffcc00'; }

        // ИСПРАВЛЕНО: Стили формируются в строгих косых кавычках, позиция left отработает идеально
        const nodeStyle = `position: absolute; left: ${leftPercent}%; transform: translateX(-50%); top: -14px; display: flex; flex-direction: column; align-items: center; ${isReached && !isClaimed ? 'cursor: pointer;' : ''}`;

        return `
            <div class="q-chest-node" data-idx="${idx}" data-board="${currentBoard}" style="${nodeStyle}">
                <span style="font-size: 18px; filter: drop-shadow(0 0 5px ${chestStatusColor});">${chestIcon}</span>
                <span style="font-size: 8px; font-family: monospace; color: ${isReached ? '#fff' : '#444'}; font-weight: bold; margin-top: 1px;">${reqPoints}</span>
            </div>
        `;
    }).join('');

    const activityBarHTML = `
        <div style="width: 100%; background: #111; border: 1px solid #1f1f1f; border-radius: 8px; padding: 15px 20px 10px 20px; box-sizing: border-box; display: flex; flex-direction: column; gap: 14px; margin-bottom: 12px; min-height: 60px;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <span style="font-size: 11px; color: #aaa; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px;">${t('q_tracker_title')}</span>
                <b style="font-size: 12px; font-family: monospace; color: #ffcc00; background: rgba(0,0,0,0.4); padding: 2px 8px; border: 1px solid #222; border-radius: 4px;">${playerBoardState.points} PTS</b>
            </div>
            <div style="width: 100%; height: 8px; background: #050505; border: 1px solid #1f1f1f; border-radius: 4px; position: relative; margin-top: 10px;">
                <div style="width: ${barProgressPercent}%; height: 100%; background: linear-gradient(90deg, #ffcc00, #ff763b); border-radius: 4px;"></div>
                ${milestonesChestsHTML}
            </div>
        </div>
    `;

    // --- 3. ЦЕНТРАЛЬНЫЙ СПИСОК ЗАДАНИЙ (TASK POOL) ---
    const taskPool = boardConfig.task_pool || {};
    const taskListHTML = Object.keys(taskPool).length === 0 ? `
        <div style="margin: auto; color: #444; font-size: 12px; font-style: italic;">${t('q_no_missions')}</div>
    ` : Object.keys(taskPool).map(tKey => {
        const task = taskPool[tKey];
        const progress = playerBoardState.tasks?.[tKey] || 0;
        const target = task.target_count || 1;
        const isDone = progress >= target;

        return `
            <div style="width: 100%; height: 50px; background: #141414; border: 1px solid #1f1f1f; border-radius: 6px; display: flex; align-items: center; padding: 0 12px; box-sizing: border-box; justify-content: space-between; gap: 12px; opacity: ${isDone ? '0.6' : '1'};">
                <div style="text-align: left; min-width: 0; flex: 1;">
                    <b style="font-size: 12px; color: #fff; display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                        ${task.title_loc?.[Game.config.default_lang || 'en'] || tKey}
                    </b>
                    <span style="font-size: 10px; color: #555; font-family: monospace;">${t('q_task_payout')}: <span style="color:#ffcc00;">+${task.points_reward || 10} ${t('q_pts_short')}</span></span>
                </div>
                
                <div style="display: flex; align-items: center; gap: 15px; flex-shrink: 0;">
                    <b style="font-family: monospace; font-size: 12px; color: ${isDone ? '#4ecca3' : '#64dfdf'}; background: rgba(0,0,0,0.3); padding: 4px 10px; border-radius: 4px; border: 1px solid #1a1a1a;">
                        ${progress} / ${target}
                    </b>
                    <span style="font-size: 16px; width: 20px; text-align: center;">${isDone ? '✅' : '⏳'}</span>
                </div>
            </div>
        `;
    }).join('');

    const centerAreaHTML = `
        <div class="q-center-area" style="display: flex; flex-direction: column; flex: 1; height: 100%; background: #0a0a0a; overflow: hidden; padding: 15px; box-sizing: border-box;">
            ${activityBarHTML}
            <div style="width: 100%; height: ${headerHeight}; display: flex; align-items: center; padding: 0 12px; box-sizing: border-box; border-bottom: 1px solid #1f1f1f; background: ${headerBg}; border-radius: 6px 6px 0 0; flex-shrink: 0; pointer-events: auto;">
                <div style="font-size: 11px; color: #2196f3; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px; text-align: left;">
                    📋 ${t('q_registry_title')}
                </div>
            </div>
            <div style="flex: 1; overflow-y: auto; background: #070707; border: 1px solid #1f1f1f; border-top: none; border-radius: 0 0 6px 6px; padding: 10px; box-sizing: border-box; display: flex; flex-direction: column; gap: 8px; pointer-events: auto;">
                ${taskListHTML}
            </div>
        </div>
    `;

    return `
        <div class="screen-content ui-element" style="${getWindowContentStyle()} display: flex; flex-direction: row; box-sizing: border-box; top: 45px; height: calc(100% - 45px); overflow: hidden;">
            ${sidebarHTML}
            ${centerAreaHTML}
        </div>
    `;
}


    export function initQuestsScreen(container, updateUiCallback) {
    const isReload = !!container.querySelector('.screen-content');
    if (!isReload) {
        sendSocket('quests', 'getQuestsState', {});
    }

    const oldScreen = container.querySelector('.screen-content');
    if (oldScreen) oldScreen.remove();

    container.insertAdjacentHTML('beforeend', getQuestsHTML());

    // А) ОБРАБОТКА ПЕРЕКЛЮЧЕНИЯ ДОСОК В САЙДБАРЕ (Без лишнего локального initQuestsScreen)
    container.querySelectorAll('.q-tab-btn').forEach(btn => {
        btn.onclick = () => {
            const boardType = btn.dataset.board;
            if (QuestsState.activeBoard === boardType) return;

            QuestsState.activeBoard = boardType;
            sendSocket('quests', 'getQuestsState', {});
        };
    });

    // Б) ОБРАБОТКА КЛИКОВ ПО СУНДУКАМ ВЕХ НА ШКАЛЕ АКТИВНОСТИ
    container.querySelectorAll('.q-chest-node').forEach(node => {
        node.onclick = () => {
            const boardType = node.dataset.board;
            const milestoneIdx = node.dataset.idx;

            sendSocket('quests', 'claimMilestone', { boardType, milestoneIdx });
        };
    });

    // В) ОБРАБОТКА КНОПКИ ЗАБОРА ЕЖЕДНЕВНОЙ НАГРАДЫ ЗА ВХОД
    const dailyLoginBtn = container.querySelector('#q-btn-claim-daily');
    if (dailyLoginBtn) {
        dailyLoginBtn.onclick = () => {
            dailyLoginBtn.disabled = true; // Блокировка от спам-кликов
            sendSocket('quests', 'claimDailyLogin', { calendarId: 'standard_monthly' });
        };
    }
}





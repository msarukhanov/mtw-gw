// import { t, API_URL, headers } from './shared.js';
// import {Game} from "./stateManager.js";
//
// let CurrentSortBy = 'combat_power'; // 'combat_power' | 'level'
//
// async function fetchLeaderboardData(listWrapper) {
//     if (!listWrapper) return;
//
//     listWrapper.innerHTML = `
//         <div style="color:#b39ddb; text-align:center; padding:50px; font-size:14px; font-family:sans-serif; width:100%;">
//             ⏳ ${Game.locale === 'ru' ? 'Пробуждение древних рейтингов...' : 'Loading Hall of Fame...'}
//         </div>
//     `;
//
//     try {
//         const queryParams = new URLSearchParams({
//             server_id: Game.serverId,
//             user_id: Game.player?.id || '',
//             sortBy: CurrentSortBy,
//             limit: 50
//         }).toString();
//
//         const res = await fetch(`${API_URL}/game/leaderboard?${queryParams}`, {
//             method: 'GET',
//             headers
//         });
//
//         const data = await res.json();
//         if (!res.ok || data.error) throw new Error(data.error || 'Leaderboard fetch error');
//
//         listWrapper.innerHTML = getLeaderboardContentHTML(data);
//
//     } catch (err) {
//         console.error(err);
//         listWrapper.innerHTML = `
//             <div style="color:#ef4444; padding:30px; text-align:center; font-size:14px; font-weight:bold; width:100%;">
//                 ❌ ${t('leaderboard_error') || 'Не удалось связаться с Залом Славы'}
//             </div>
//         `;
//     }
// }
//
// function getLeaderboardContentHTML(data) {
//     const list = data.leaderboard || [];
//     const myRank = data.myRank;
//     const isLvlSort = CurrentSortBy === 'level';
//
//     // РЕСПЕКТИРУЕМ ТВОИ НАСТРОЙКИ UI ИЗ КОНФИГА ИГРЫ
//     const orientation = Game.config.orientation || 'landscape';
//     const screenSettings = Game.config?.ui?.[orientation]?.find(w => w.id === 'screen_leaderboard') || {};
//     const boardLayout = screenSettings.board_layout || {};
//
//     // Разделяем массив на Топ-3 (Пьедестал) и Остальных (Таблица)
//     const top3Limit = boardLayout.podium_limit || 3;
//     const top3 = list.slice(0, top3Limit);
//     const remainder = list.slice(top3Limit);
//
//     // --- СБОРКА ПЬЕДЕСТАЛА ПОБЕДИТЕЛЕЙ (ТОП-3) ---
//     const podiumOrder = [
//         top3.find(p => p.rank === 2),
//         top3.find(p => p.rank === 1),
//         top3.find(p => p.rank === 3)
//     ];
//
//     const podiumHTML = `
//         <div class="podium-container" style="display:flex; justify-content:center; align-items:flex-end; gap:12px; padding:15px; background:${boardLayout.podium_bg || 'rgba(15,8,32,0.6)'}; border-radius:12px; border:1px solid #3d216b; margin-bottom:15px; box-sizing:border-box; min-height:180px;">
//             ${podiumOrder.map((player, idx) => {
//         if (!player) return `<div style="flex:1; max-width:110px;"></div>`;
//
//         const isFirst = player.rank === 1;
//         const isSecond = player.rank === 2;
//
//         const crownColor = isFirst ? '#ffd700' : (isSecond ? '#c0c0c0' : '#cd7f32');
//         const boxBg = isFirst ? 'rgba(255,215,0,0.04)' : 'rgba(255,255,255,0.01)';
//
//         return `
//                     <div style="flex:1; max-width:120px; background:${boxBg}; border:1px solid ${crownColor}; border-radius:8px; padding:10px 6px; display:flex; flex-direction:column; align-items:center; box-sizing:border-box; position:relative; box-shadow:0 4px 15px rgba(0,0,0,0.5), inset 0 0 10px ${crownColor}22; transform:${isFirst ? 'scale(1.05)' : 'scale(0.95)'}; z-index:${isFirst ? '2' : '1'};">
//                         <span style="font-size:20px; position:absolute; top:-14px; filter:drop-shadow(0 2px 4px rgba(0,0,0,0.8));">
//                             ${player.rank === 1 ? '👑' : (player.rank === 2 ? '🥈' : '🥉')}
//                         </span>
//
//                         <div style="width:40px; height:40px; background:#221042; border-radius:50%; border:2px solid ${crownColor}; display:flex; align-items:center; justify-content:center; font-size:18px; margin-bottom:6px; color:#fff; font-weight:bold; box-shadow:0 2px 5px rgba(0,0,0,0.5);">
//
//                             <!--    ${player.nickname.charAt(0).toUpperCase()} -->
//                             <div style="width:40px; height:40px; background: #221042 url('${player.avatar_icon || './gacha/assets/images/heroes/heroAvatars/eleniel.webp'}') center center / cover no-repeat; border-radius:50%; border:2px solid ${crownColor}; margin-bottom:6px; box-shadow:0 2px 5px rgba(0,0,0,0.5); flex-shrink:0;">
//                             </div>
//
//                         </div>
//
//                         <b style="color:#fff; font-size:12px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; width:100%; text-align:center;" title="${player.nickname}">${player.nickname}</b>
//                         <span style="font-size:10px; color:${isLvlSort ? '#ffcc00' : '#aaa'}; margin-top:2px;">Lvl ${player.level}</span>
//                         <span style="font-size:11px; font-family:monospace; color:${isLvlSort ? '#aaa' : '#ffcc00'}; font-weight:bold; margin-top:4px;">⚔️${player.combatPower}</span>
//                     </div>
//                 `;
//     }).join('')}
//         </div>
//     `;
//
//     // --- СБОРКА ТАБЛИЦЫ ОСТАЛЬНЫХ ЛИДЕРОВ (ТОП 4+) ---
//     let rowsHTML = '';
//     if (remainder.length === 0 && top3.length === 0) {
//         rowsHTML = `<div style="color:#aaa; padding:20px; text-align:center; font-size:13px;">Рейтинг пуст...</div>`;
//     } else {
//         rowsHTML = remainder.map(player => {
//             const isMe = player.userId === Game.player?.id;
//
//             return `
//                 <div style="display:flex; justify-content:space-between; align-items:center; background:${isMe ? 'rgba(255,204,0,0.06)' : '#1a112c'}; border:1px solid ${isMe ? '#ffcc00' : '#2b1947'}; padding:6px 12px; border-radius:6px; margin-bottom:5px; font-size:12px; box-sizing:border-box;">
//                     <div style="display:flex; align-items:center; gap:12px;">
//                         <span style="font-weight:bold; width:24px; text-align:center; color:#8b75b5; font-family:monospace;">#${player.rank}</span>
//                         <b style="color:#fff; font-size:13px;">${player.nickname}</b>
//                         <span style="color:${isLvlSort ? '#ffcc00' : '#aaa'}; font-size:10px; font-weight:${isLvlSort ? 'bold' : 'normal'};">Lvl ${player.level}</span>
//                     </div>
//                     <b style="color:${isLvlSort ? '#aaa' : '#ffcc00'}; font-family:monospace; font-size:13px;">⚔️ ${player.combatPower}</b>
//                 </div>
//             `;
//         }).join('');
//     }
//
//     const myRankText = myRank ? `Ваш текущий ранг на сервере: <b style="color:#ffcc00;">#${myRank}</b>` : 'Вы еще не вошли в Зал Славы';
//
//     return `
//         <div style="display:flex; flex-direction:row; gap:15px; width:100%; flex:1; overflow:hidden; box-sizing:border-box;">
//             <!-- ЛЕВАЯ КОЛОНКА: Пьедестал лидеров -->
//             <div style="width:${boardLayout.left_column_width || '45%'}; display:flex; flex-direction:column; justify-content:flex-start; box-sizing:border-box;">
//                 <span style="font-size:11px; color:#b39ddb; font-weight:bold; text-transform:uppercase; margin-bottom:6px; letter-spacing:1px; display:block;">🏆 ${t(boardLayout.podium_label_key) || 'Champions:'}</span>
//                 ${podiumHTML}
//
//                 <div style="background:#11052c; border:2px solid #ffcc00; padding:12px; border-radius:10px; text-align:center; font-size:12px; color:#fff; box-shadow:0 4px 10px rgba(0,0,0,0.4); margin-top:auto; box-sizing:border-box;">
//                     👤 ${myRankText}
//                 </div>
//             </div>
//
//             <!-- ПРАВАЯ КОЛОНКА: Скролл-список остальных участников -->
//             <div style="flex:1; display:flex; flex-direction:column; overflow:hidden; box-sizing:border-box;">
//                 <span style="font-size:11px; color:#b39ddb; font-weight:bold; text-transform:uppercase; margin-bottom:6px; letter-spacing:1px; display:block;">📜 ${t(boardLayout.list_label_key) || 'Pretenders:'}</span>
//                 <div style="flex:1; overflow-y:auto; padding-right:4px; box-sizing:border-box; background:rgba(0,0,0,0.2); border-radius:8px; border:1px solid #23143d; padding:8px;">
//                     ${rowsHTML || `<div style="color:#555; text-align:center; padding:20px; font-size:12px; font-style:italic;">No pretenders...</div>`}
//                 </div>
//             </div>
//         </div>
//     `;
// }
//
// export function initLeaderboardScreen(container, updateUiCallback) {
//     const oldContent = container.querySelector('.screen-content');
//     if (oldContent) oldContent.remove();
//
//     // СЧИТЫВАЕМ НАСТРОЙКИ СЕТКИ UI ИЗ КОНФИГА ИГРЫ ИЗ ТВОЕГО ТЗ
//     const orientation = Game.config.orientation || 'landscape';
//     const screenSettings = Game.config?.ui?.[orientation]?.find(w => w.id === 'screen_leaderboard') || {};
//     const winTop = screenSettings.top || '60px';
//     const winPaddingBottom = screenSettings.padding_bottom || '5px';
//
//     const baseHTML = `
//         <div class="screen-content ui-element" style="top:${winTop}; padding:15px; padding-bottom:${winPaddingBottom}; display:flex; flex-direction:column; height:calc(100% - 150px); width:100%; box-sizing:border-box; font-family:sans-serif;">
//
//             <!-- ВЕРХНЯЯ ПАНЕЛЬ: Заголовок и переключатели -->
//             <div style="display:flex; justify-content:space-between; align-items:center; width:100%; margin-bottom:15px; border-bottom:1px solid #3d216b; padding-bottom:10px; flex-shrink:0; box-sizing:border-box;">
//                 <h2 style="margin:0; font-size:22px; color:#fff; text-shadow:0 2px 4px rgba(0,0,0,0.5); font-weight:bold; letter-spacing:0.5px;">🏛️ ${t('leaderboard_title') || 'Honor hall'}</h2>
//
//                 <!-- Игровые переключатели вкладок (Фиолетовые неоновые бадмы) -->
//                 <div style="display:flex; gap:8px; background:#11052c; padding:4px; border-radius:8px; border:1px solid #3d216b; box-sizing:border-box;">
//                     <button class="btn btn-rank-tab" data-sort="combat_power" style="background:${CurrentSortBy === 'combat_power' ? '#673ab7' : 'transparent'}; color:${CurrentSortBy === 'combat_power' ? '#fff' : '#b39ddb'}; border:none; padding:6px 14px; border-radius:6px; font-weight:bold; cursor:pointer; font-size:11px; transition:all 0.2s;">
//                         ⚔️ Battle Rating
//                     </button>
//                     <button class="btn btn-rank-tab" data-sort="level" style="background:${CurrentSortBy === 'level' ? '#673ab7' : 'transparent'}; color:${CurrentSortBy === 'level' ? '#fff' : '#b39ddb'}; border:none; padding:6px 14px; border-radius:6px; font-weight:bold; cursor:pointer; font-size:11px; transition:all 0.2s;">
//                         👑 Level
//                     </button>
//                 </div>
//             </div>
//
//             <!-- Контейнер для двухколоночного асинхронного контента -->
//             <div class="leaderboard-two-column-wrapper" style="flex:1; display:flex; overflow:hidden; box-sizing:border-box; width:100%;">
//             </div>
//         </div>
//     `;
//
//     container.innerHTML += baseHTML;
//
//     const listWrapper = container.querySelector('.leaderboard-two-column-wrapper');
//
//     // Локальное переключение вкладок без сноса оверлеев и без деструктивного updateUiCallback()
//     container.querySelectorAll('.btn-rank-tab').forEach(btn => {
//         btn.onclick = (e) => {
//             e.stopPropagation();
//
//             const selectedSort = btn.dataset.sort;
//             if (CurrentSortBy === selectedSort) return;
//
//             CurrentSortBy = selectedSort;
//
//             // Мгновенная локальная подсветка активной кнопки прямо в DOM
//             container.querySelectorAll('.btn-rank-tab').forEach(b => {
//                 const isCurrent = b.dataset.sort === CurrentSortBy;
//                 b.style.background = isCurrent ? '#673ab7' : 'transparent';
//                 b.style.color = isCurrent ? '#fff' : '#b39ddb';
//             });
//
//             fetchLeaderboardData(listWrapper);
//         };
//     });
//
//     // Первичный триггер загрузки при открытии экрана
//     fetchLeaderboardData(listWrapper);
// }
//

import { t, getWindowContentStyle } from './shared.js';
import {Game} from "./stateManager.js";
import {sendSocket} from "./socket.js";

export const LeaderboardState = {
    currentSort: 'combat_power' // По дефолту сортируем по силе: 'combat_power' | 'level'
};

export function getLeaderboardHTML() {
    const orientation = Game.config.orientation || 'landscape';
    const screenSettings = Game.config?.ui?.[orientation]?.find(w => w.id === 'screen_leaderboard') || {};
    const listSettings = screenSettings.list_settings || {};

    const sidebarWidth = listSettings.sidebar_width || "220px";
    const detailsWidth = listSettings.details_panel_width || "260px";
    const headerHeight = listSettings.header_height || "40px";
    const headerBg = listSettings.header_background || "#121212";

    const topList = Game.leaderboard || [];
    const myRankDisplay = Game.my_rank ? `#${Game.my_rank}` : (t('lb_unranked') || 'Unranked');

    // --- 1. ЛЕВАЯ КОЛОНКА: ВКЛАДКИ ПЕРЕКЛЮЧЕНИЯ СОРТИРОВКИ ---
    const isPower = LeaderboardState.currentSort === 'combat_power';
    const isLevel = LeaderboardState.currentSort === 'level';

    const sidebarHTML = `
        <div class="lb-sidebar" style="display: flex; flex-direction: column; border-right: 1px solid #252525; padding: ${listSettings.padding}; box-sizing: border-box; height: 100%; width: ${sidebarWidth}; flex-shrink: 0; background: #141414; gap: 10px; pointer-events: auto;">
            <div style="font-size: 11px; color: #555; font-weight: bold; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 4px;">
                ${t('lb_categories') || 'Rankings'}
            </div>
            
            <!-- Вкладка: Боевая сила -->
            <div class="lb-tab-btn" data-sort="combat_power" style="width: 100%; height: 44px; background: ${isPower ? 'linear-gradient(135deg, #2a1b08, #111)' : '#0c0c0c'}; border: 1px solid ${isPower ? '#ffcc00' : '#222'}; border-radius: 6px; padding: 0 12px; box-sizing: border-box; cursor: pointer; display: flex; align-items: center; gap: 10px; transition: all 0.2s;">
                <span style="font-size: 18px;">⚔️</span>
                <b style="font-size: 12px; color: ${isPower ? '#ffcc00' : '#aaa'};">${t('combat_power') || 'Combat Power'}</b>
            </div>

            <!-- Вкладка: Уровень аккаунта -->
            <div class="lb-tab-btn" data-sort="level" style="width: 100%; height: 44px; background: ${isLevel ? 'linear-gradient(135deg, #1b263b, #111)' : '#0c0c0c'}; border: 1px solid ${isLevel ? '#2196f3' : '#222'}; border-radius: 6px; padding: 0 12px; box-sizing: border-box; cursor: pointer; display: flex; align-items: center; gap: 10px; transition: all 0.2s;">
                <span style="font-size: 18px;">✨</span>
                <b style="font-size: 12px; color: ${isLevel ? '#2196f3' : '#aaa'};">${t('level') || 'Account Level'}</b>
            </div>
        </div>
    `;

    // --- 2. ЦЕНТРАЛЬНАЯ КОЛОНКА: СКРОЛЛ-ТАБЛИЦА ТОП-100 ИГРОКОВ ---
    const centerAreaHTML = `
        <div class="lb-center-area" style="display: flex; flex-direction: column; flex: 1; height: 100%; background: #0a0a0a; overflow: hidden;">
            <!-- Информационный хедер таблицы -->
            <div style="width: 100%; height: ${headerHeight}; display: flex; align-items: center; justify-content: space-between; padding: 0 15px; box-sizing: border-box; border-bottom: 1px solid #1f1f1f; background: ${headerBg}; flex-shrink: 0; pointer-events: auto;">
                <div style="font-size: 12px; color: #ffcc00; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px;">
                    🏆 ${t('lb_hall_of_fame') || 'Hall of Fame'} (${isPower ? 'Power' : 'Level'})
                </div>
                <div style="font-size: 10px; color: #555; font-family: monospace;">TOP ${topList.length}</div>
            </div>
            
            <!-- Сама скролл-зона со строками игроков -->
            <div style="flex: 1; overflow-y: auto; padding: 10px; box-sizing: border-box; display: flex; flex-direction: column; gap: ${listSettings.gap}; pointer-events: auto;">
                ${topList.length === 0 ? `
                    <div style="margin: auto; color: #444; font-size: 12px; font-style: italic;">${t('lb_empty') || 'No ranked players found...'}</div>
                ` : topList.map(row => {
        // Подсвечиваем тройку лидеров красивым градиентным цветом
        let rankBg = '#141414';
        let rankColor = '#aaa';
        if (row.rank === 1) { rankBg = 'linear-gradient(90deg, #3a3007, #141414)'; rankColor = '#ffcc00'; }
        else if (row.rank === 2) { rankBg = 'linear-gradient(90deg, #22252a, #141414)'; rankColor = '#ffffff'; }
        else if (row.rank === 3) { rankBg = 'linear-gradient(90deg, #2d1910, #141414)'; rankColor = '#ff763b'; }

        const scoreDisplay = isPower ? `⚔️ ${row.combatPower}` : `Lv.${row.level}`;

        return `
                        <div style="width: 100%; height: 48px; background: ${rankBg}; border: 1px solid #1f1f1f; border-radius: 6px; display: flex; align-items: center; padding: 0 12px; box-sizing: border-box; justify-content: space-between; gap: 12px;">
                            <div style="display: flex; align-items: center; gap: 12px; min-width: 0;">
                                <!-- Цифра места -->
                                <span style="font-family: 'Courier New', monospace; font-size: 14px; font-weight: bold; color: ${rankColor}; width: 28px; flex-shrink: 0; text-align: center;">
                                    ${row.rank <= 3 ? (row.rank === 1 ? '🥇' : (row.rank === 2 ? '🥈' : '🥉')) : row.rank}
                                </span>
                                
                                <!-- Круглая аватарка из JSONB метаданных -->
                                <img src="${row.avatar_icon}" style="width: 32px; height: 32px; border-radius: 50%; border: 1px solid #333; background: #222; object-fit: cover; flex-shrink: 0;" onerror="this.src='./gacha/assets/images/heroes/heroAvatars/eleniel.webp'">
                                
                                <!-- Никнейм -->
                                <b style="font-size: 12px; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${row.nickname}</b>
                            </div>
                            
                            <!-- Значение скора (Сила или Лвл) -->
                            <div style="font-size: 11px; font-family: monospace; font-weight: bold; color: ${row.rank <= 3 ? rankColor : '#64dfdf'}; background: rgba(0,0,0,0.4); padding: 4px 10px; border-radius: 4px; border: 1px solid #1a1a1a; flex-shrink: 0;">
                                ${scoreDisplay}
                            </div>
                        </div>
                    `;
    }).join('')}
            </div>
        </div>
    `;

    // --- 3. ПРАВАЯ КОЛОНКА: СТАТИСТИКА РАНГА ТЕКУЩЕГО ИГРОКА ---
    const myProfile = Game.player || {};
    const myScore = isPower ? `⚔️ ${myProfile.combat_power || 0}` : `Lv.${myProfile.level || 1}`;
    const myAvatar = myProfile.avatar_icon || './assets/images/heroes/heroAvatars/eleniel.webp';

    const detailsPanelHTML = `
        <div class="lb-details-panel" style="width: ${detailsWidth}; height: 100%; background: #111111; border-left: 1px solid #222; display: flex; flex-direction: column; align-items: center; justify-content: space-between; padding: 15px; box-sizing: border-box; flex-shrink: 0; pointer-events: auto;">
            
            <div style="display: flex; flex-direction: column; align-items: center; gap: 12px; width: 100%; margin-top: 10px;">
                <div style="font-size: 10px; color: #555; font-weight: bold; text-transform: uppercase; letter-spacing: 1px; width: 100%; text-align: center;">
                    ${t('lb_your_rank') || 'Your Standing'}
                </div>
                
                <!-- Большая круглая рамка аватара игрока -->
                <div style="width: 72px; height: 72px; border-radius: 50%; border: 2px solid #ffcc00; box-shadow: 0 0 15px rgba(255,204,0,0.2); position: relative; overflow: hidden; background: #222; width: 72px; height: 72px;">
                    <img src="${myAvatar}" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.src='./assets/images/heroes/heroAvatars/eleniel.webp'">
                </div>
                
                <b style="font-size: 14px; color: #fff; width: 100%; text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                    ${myProfile.nickname || 'Unknown'}
                </b>
                
                <!-- Точное место в топе -->
                <div style="font-size: 26px; font-family: 'Impact', sans-serif; color: #ffcc00; letter-spacing: 0.5px; filter: drop-shadow(0 0 10px rgba(255,204,0,0.1));">
                    ${myRankDisplay}
                </div>
            </div>

            <!-- Нижняя плашка со счетом игрока -->
            <div style="width: 100%; background: #090909; border: 1px solid #1f1f1f; border-radius: 6px; padding: 8px; box-sizing: border-box; display: flex; justify-content: space-between; align-items: center; font-size: 11px;">
                <span style="color: #666;">${t('lb_your_score') || 'Your Value'}:</span>
                <b style="font-family: monospace; color: #fff; background: #161616; padding: 2px 8px; border-radius: 4px; border: 1px solid #222;">${myScore}</b>
            </div>
        </div>
    `;

    return `
        <div class="screen-content ui-element" style="${getWindowContentStyle()} display: flex; flex-direction: row; box-sizing: border-box; top: 45px; height: calc(100% - 45px); overflow: hidden;">
            ${sidebarHTML}
            ${centerAreaHTML}
            ${detailsPanelHTML}
        </div>
    `;
}

export function initLeaderboardScreen(container, updateUiCallback) {
    const isReload = !!container.querySelector('.screen-content');
    if(!isReload) {
        sendSocket('game', 'getLeaderboard', {
            sortBy: LeaderboardState.currentSort,
            limit: 100
        });
    }
    // 1. Находим и полностью вычищаем старый контент экрана, чтобы избежать дублирования DOM-элементов
    const oldScreen = container.querySelector('.screen-content');
    if (oldScreen) {
        oldScreen.remove();
    }

    // 2. Вставляем свежий HTML на основе текущего стейта Game
    container.insertAdjacentHTML('beforeend', getLeaderboardHTML());

    // 3. Заново находим свежесозданные кнопки переключения вкладок
    const tabButtons = container.querySelectorAll('.lb-tab-btn');

    tabButtons.forEach(btn => {
        btn.onclick = () => {
            const selectedSort = btn.dataset.sort;

            if (LeaderboardState.currentSort === selectedSort) return;

            LeaderboardState.currentSort = selectedSort;

            sendSocket('game', 'getLeaderboard', {
                sortBy: selectedSort,
                limit: 100
            });
            //
            // initLeaderboardScreen(container, updateUiCallback);
        };
    });
}
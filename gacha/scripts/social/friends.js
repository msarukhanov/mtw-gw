import { t, getWindowContentStyle } from '../../shared.js';
import { Game } from "../../stateManager.js";
import { sendSocket } from "../../socket.js";

export const FriendsState = {
    currentTab: 'active_friends' // Вкладки: 'active_friends' | 'add_recommendations' | 'blacklist'
};

export function getFriendsHTML() {
    const orientation = Game.config.orientation || 'landscape';
    const screenSettings = Game.config?.ui?.[orientation]?.find(w => w.id === 'screen_friends') || {};
    const listSettings = screenSettings.list_settings || {};

    const sidebarWidth = listSettings.sidebar_width || "220px";
    const headerHeight = listSettings.header_height || "40px";
    const headerBg = listSettings.header_background || "#121212";

    const isFriends = FriendsState.currentTab === 'active_friends';
    const isRequests = FriendsState.currentTab === 'inbound_requests';
    const isAdd = FriendsState.currentTab === 'add_recommendations';
    const isBlacklist = FriendsState.currentTab === 'blacklist';

    // --- 1. ЛЕВАЯ КОЛОНКА: ЧЕТЫРЕ ВКЛАДКИ НАВИГАЦИИ (САЙДБАР) ---
    const sidebarHTML = `
        <div class="fr-sidebar" style="display: flex; flex-direction: column; border-right: 1px solid #252525; padding: 10px; box-sizing: border-box; height: 100%; width: ${sidebarWidth}; flex-shrink: 0; background: #141414; gap: 10px; pointer-events: auto;">
            <div style="font-size: 11px; color: #555; font-weight: bold; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 4px;">
                ${t('fr_social_hub') || 'Social Hub'}
            </div>
            
            <div class="fr-tab-btn" data-tab="active_friends" style="width: 100%; height: 44px; background: ${isFriends ? 'linear-gradient(135deg, #1b263b, #111)' : '#0c0c0c'}; border: 1px solid ${isFriends ? '#2196f3' : '#222'}; border-radius: 6px; padding: 0 12px; box-sizing: border-box; cursor: pointer; display: flex; align-items: center; gap: 10px; transition: all 0.2s;">
                <span style="font-size: 18px;">🤝</span>
                <b style="font-size: 12px; color: ${isFriends ? '#2196f3' : '#aaa'};">${t('fr_my_friends') || 'My Friends'}</b>
            </div>

            <div class="fr-tab-btn" data-tab="inbound_requests" style="width: 100%; height: 44px; background: ${isRequests ? 'linear-gradient(135deg, #0f3026, #111)' : '#0c0c0c'}; border: 1px solid ${isRequests ? '#4ecca3' : '#222'}; border-radius: 6px; padding: 0 12px; box-sizing: border-box; cursor: pointer; display: flex; align-items: center; gap: 10px; transition: all 0.2s;">
                <span style="font-size: 18px;">📥</span>
                <b style="font-size: 12px; color: ${isRequests ? '#4ecca3' : '#aaa'};">${t('fr_requests') || 'Requests'}</b>
            </div>

            <div class="fr-tab-btn" data-tab="add_recommendations" style="width: 100%; height: 44px; background: ${isAdd ? 'linear-gradient(135deg, #2a1b08, #111)' : '#0c0c0c'}; border: 1px solid ${isAdd ? '#ffcc00' : '#222'}; border-radius: 6px; padding: 0 12px; box-sizing: border-box; cursor: pointer; display: flex; align-items: center; gap: 10px; transition: all 0.2s;">
                <span style="font-size: 18px;">🔍</span>
                <b style="font-size: 12px; color: ${isAdd ? '#ffcc00' : '#aaa'};">${t('fr_find_players') || 'Find Players'}</b>
            </div>

            <div class="fr-tab-btn" data-tab="blacklist" style="width: 100%; height: 44px; background: ${isBlacklist ? 'linear-gradient(135deg, #3a1111, #111)' : '#0c0c0c'}; border: 1px solid ${isBlacklist ? '#e94560' : '#222'}; border-radius: 6px; padding: 0 12px; box-sizing: border-box; cursor: pointer; display: flex; align-items: center; gap: 10px; transition: all 0.2s;">
                <span style="font-size: 18px;">⛔</span>
                <b style="font-size: 12px; color: ${isBlacklist ? '#e94560' : '#aaa'};">${t('fr_blacklist') || 'Blacklist'}</b>
            </div>
        </div>
    `;

    // --- 2. ЦЕНТРАЛЬНАЯ СКРОЛЛ-ЗОНА КОНТЕНТА ---
    let listContentHTML = '';

    if (isFriends) {
        const friendsList = Game.friends || [];
        listContentHTML = friendsList.length === 0 ? `
            <div style="margin: auto; color: #444; font-size: 12px; font-style: italic;">${t('fr_no_friends') || 'Your friends list is empty...'}</div>
        ` : friendsList.map(f => {
            const timeStatus = f.isOnline ? `<span style="color:#4caf50;">● ${t('fr_status_online') || 'Online'}</span>` : `<span style="color:#555; font-size:10px;">${t('fr_status_offline') || 'Offline'}</span>`;

            // ИСПРАВЛЕНИЕ: Никаких сложных проверок, смотрим напрямую в флаг от сервера!
            return `
                <div style="width: 100%; height: 54px; background: #141414; border: 1px solid #1f1f1f; border-radius: 6px; display: flex; align-items: center; padding: 0 12px; box-sizing: border-box; justify-content: space-between; gap: 12px;">
                    <div style="display: flex; align-items: center; gap: 12px; min-width: 0;">
                        <img src="${f.avatar_icon}" style="width: 36px; height: 36px; border-radius: 50%; border: 1px solid #333; object-fit: cover;">
                        <div style="display:flex; flex-direction:column; text-align:left;">
                            <b style="font-size: 12px; color: #fff;">${f.nickname} <span style="font-size:10px; color:#555; font-weight:normal;">${t('fr_level_short') || 'Lv.'}${f.level}</span></b>
                            ${timeStatus}
                        </div>
                    </div>
                    <div style="display:flex; gap:8px;">
                        <button class="fr-action-btn" data-action="heart" data-uid="${f.id}" ${f.isHeartSent ? 'disabled style="background:#1a1a1a; border:1px solid #333; color:#555; padding:4px 10px; font-size:11px; border-radius:4px;"' : 'style="background:#222; border:1px solid #ff4081; color:#ff4081; padding:4px 10px; font-size:11px; font-weight:bold; border-radius:4px; cursor:pointer;"'}>
                            ${f.isHeartSent ? (t('fr_btn_heart_sent') || 'Sent ✓') : (t('fr_btn_heart_gift') || '❤️ Gift')}
                        </button>
                        <button class="fr-action-btn" data-action="remove" data-uid="${f.id}" style="background:#222; border:1px solid #444; color:#aaa; padding:4px 10px; font-size:11px; border-radius:4px; cursor:pointer;">${t('fr_btn_remove') || 'Remove'}</button>
                    </div>
                </div>
            `;
        }).join('');
    }
    else if (isRequests) {
        const reqList = Game.friend_requests || [];
        listContentHTML = reqList.length === 0 ? `
            <div style="margin: auto; color: #444; font-size: 12px; font-style: italic;">${t('fr_no_requests') || 'No inbound friend requests...'}</div>
        ` : reqList.map(r => `
            <div style="width: 100%; height: 54px; background: #141414; border: 1px solid #1f1f1f; border-radius: 6px; display: flex; align-items: center; padding: 0 12px; box-sizing: border-box; justify-content: space-between; gap: 12px;">
                <div style="display: flex; align-items: center; gap: 12px;">
                    <img src="${r.avatar_icon}" style="width: 36px; height: 36px; border-radius: 50%; border: 1px solid #333; object-fit: cover;">
                    <b style="font-size: 12px; color: #fff; text-align:left;">${r.nickname} <span style="font-size:10px; color:#555; font-weight:normal;">${t('fr_level_short') || 'Lv.'}${r.level}</span></b>
                </div>
               <div style="display:flex; gap:8px;">
                    <button class="fr-action-btn" data-action="accept" data-uid="${r.id}" style="background:linear-gradient(135deg, #4ecca3, #2b9371); border:none; color:#12122c; padding:5px 12px; font-size:11px; font-weight:bold; border-radius:4px; cursor:pointer;">${t('fr_btn_accept') || 'Accept'}</button>
                    
                    <!-- ДОБАВЛЕНА КНОПКА ОТКЛОНЕНИЯ -->
                    <button class="fr-action-btn" data-action="decline" data-uid="${r.id}" style="background:#222; border:1px solid #e94560; color:#e94560; padding:5px 12px; font-size:11px; border-radius:4px; cursor:pointer;">${t('fr_btn_decline') || 'Decline'}</button>
                </div>
            </div>
        `).join('');
    }
    else if (isAdd) {
        const recList = Game.friend_recommendations || [];
        listContentHTML = recList.length === 0 ? `
            <div style="margin: auto; color: #444; font-size: 12px; font-style: italic;">${t('fr_no_recommendations') || 'No recommendations found...'}</div>
        ` : recList.map(r => `
            <div style="width: 100%; height: 54px; background: #141414; border: 1px solid #1f1f1f; border-radius: 6px; display: flex; align-items: center; padding: 0 12px; box-sizing: border-box; justify-content: space-between; gap: 12px;">
                <div style="display: flex; align-items: center; gap: 12px;">
                    <img src="${r.avatar_icon}" style="width: 36px; height: 36px; border-radius: 50%; border: 1px solid #333; object-fit: cover;">
                    <div style="display:flex; flex-direction:column; text-align:left;">
                        <b style="font-size: 12px; color: #fff;">${r.nickname} <span style="font-size:10px; color:#555; font-weight:normal;">${t('fr_level_short') || 'Lv.'}${r.level}</span></b>
                        <span style="font-size:10px; color:#555;">⚔️ ${t('fr_combat_power') || 'Power'}: ${r.combat_power}</span>
                    </div>
                </div>
                <div style="display:flex; gap:8px;">
                    <button class="fr-action-btn" data-action="request" data-uid="${r.id}" style="background:linear-gradient(135deg, #ffcc00, #b38f00); border:none; color:#12122c; padding:5px 12px; font-size:11px; font-weight:bold; border-radius:4px; cursor:pointer;">${t('fr_btn_send_request') || 'Send Request'}</button>
                    <button class="fr-action-btn" data-action="block" data-uid="${r.id}" style="background:#222; border:1px solid #e94560; color:#e94560; padding:5px 12px; font-size:11px; border-radius:4px; cursor:pointer;">${t('fr_btn_block') || 'Block'}</button>
                </div>
            </div>
        `).join('');
    }
    else if (isBlacklist) {
        const blacklist = Game.blacklist || [];
        listContentHTML = blacklist.length === 0 ? `
            <div style="margin: auto; color: #444; font-size: 12px; font-style: italic;">${t('fr_blacklist_empty') || 'Blacklist clear.'}</div>
        ` : blacklist.map(b => `
            <div style="width: 100%; height: 54px; background: #141414; border: 1px solid #1f1f1f; border-radius: 6px; display: flex; align-items: center; padding: 0 12px; box-sizing: border-box; justify-content: space-between; gap: 12px;">
                <b style="font-size: 12px; color: #fff; text-align:left;">${b.nickname || (t('fr_blocked_user_fallback') || 'Blocked User')}</b>
                <button class="fr-action-btn" data-action="unblock" data-uid="${b.id}" style="background:#222; border:1px solid #444; color:#aaa; padding:5px 12px; font-size:11px; border-radius:4px; cursor:pointer;">${t('fr_btn_unblock') || 'Unblock'}</button>
            </div>
        `).join('');
    }

    const centerAreaHTML = `
        <div class="fr-center-area" style="display: flex; flex-direction: column; flex: 1; height: 100%; background: #0a0a0a; overflow: hidden;">
            <div style="width: 100%; height: ${headerHeight}; display: flex; align-items: center; padding: 0 15px; box-sizing: border-box; border-bottom: 1px solid #1f1f1f; background: ${headerBg}; flex-shrink: 0; pointer-events: auto;">
                <div style="font-size: 12px; color: #2196f3; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px;">
                    👥 ${t('fr_social_registry') || 'Social Registry Matrix'}
                </div>
            </div>
            <div style="flex: 1; overflow-y: auto; padding: 10px; box-sizing: border-box; display: flex; flex-direction: column; gap: ${listSettings.gap || '8px'}; pointer-events: auto;">
                ${listContentHTML}
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



export function initFriendsScreen(container, updateUiCallback) {
    const isReload = !!container.querySelector('.screen-content');
    if (!isReload) {
        sendSocket('friends', 'getFullFriendsDataPack', {});
    }

    const oldScreen = container.querySelector('.screen-content');
    if (oldScreen) oldScreen.remove();
    container.insertAdjacentHTML('beforeend', getFriendsHTML());

    // А) ОБРАБОТКА КЛИКОВ ПО ВКЛАДКАМ САЙДБАРA
    container.querySelectorAll('.fr-tab-btn').forEach(btn => {
        btn.onclick = () => {
            const selectedTab = btn.dataset.tab;
            if (FriendsState.currentTab === selectedTab) return;

            FriendsState.currentTab = selectedTab;
            //
            // sendSocket('friends', 'getFullFriendsDataPack', {});

            if (selectedTab === 'add_recommendations') {
                sendSocket('friends', 'getRecommendations', {});
            } else if (selectedTab === 'inbound_requests') {
                sendSocket('friends', 'getInboundRequests', {});
            }
            else {
                initFriendsScreen(container, updateUiCallback);
            }
            //
        };
    });

    // Б) ОБРАБОТКА ДЕЙСТВИЙ ВНУТРИ СТРОК
    container.querySelectorAll('.fr-action-btn').forEach(btn => {
        btn.onclick = () => {
            const action = btn.dataset.action;
            const friendId = btn.dataset.uid;

            // Только отправляем намерения на сервер, локально экран вслепую не рендерим
            if (action === 'heart') sendSocket('friends', 'sendHeart', { friendId });
            else if (action === 'request') sendSocket('friends', 'sendFriendRequest', { targetFriendId: friendId });
            else if (action === 'accept') sendSocket('friends', 'acceptRequest', { friendId });
            else if (action === 'decline') sendSocket('friends', 'declineRequest', { friendId });
            else if (action === 'remove') sendSocket('friends', 'removeFriend', { friendId });
            else if (action === 'block') sendSocket('friends', 'blockUser', { targetId: friendId });
            else if (action === 'unblock') sendSocket('friends', 'unblockUser', { targetId: friendId });
        };
    });
}





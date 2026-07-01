import { t, getWindowContentStyle } from '../../shared.js';
import { Game } from "../../stateManager.js";
import { sendSocket } from "../../socket.js";

export const ChatState = {
    currentTab: 'world',
    activePmPartnerId: null
};

export function getChatHTML() {
    const orientation = Game.config.orientation || 'landscape';
    const screenSettings = Game.config?.ui?.[orientation]?.find(w => w.id === 'screen_chat') || {};
    const listSettings = screenSettings.list_settings || {};

    const sidebarWidth = listSettings.sidebar_width || "220px";
    const headerHeight = listSettings.header_height || "40px";
    const headerBg = listSettings.header_background || "#121212";

    const isWorld = ChatState.currentTab === 'world';
    const isServer = ChatState.currentTab === 'server';
    const isGuild = ChatState.currentTab === 'guild';
    const isAnn = ChatState.currentTab === 'announcements';
    const isPm = ChatState.currentTab === 'pm';

    const chatData = Game.chats || { world: [], server: [], announcements: [], guild: null, pm: {} };

    const hasUnread = (channel) => {
        if (channel === 'pm') {
            return Object.values(chatData.pm || {}).some(messages => messages.some(m => m.isUnread === true));
        }
        return (chatData[channel] || []).some(m => m.isUnread === true);
    };

    const redDotStyle = `position: absolute; right: 12px; width: 8px; height: 8px; background: #ff4081; border-radius: 50%; box-shadow: 0 0 6px #ff4081;`;

    const sidebarHTML = `
        <div class="ch-sidebar" style="display: flex; flex-direction: column; border-right: 1px solid #252525; padding: 10px; box-sizing: border-box; height: 100%; width: ${sidebarWidth}; flex-shrink: 0; background: #141414; gap: 10px; pointer-events: auto;">
            <div style="font-size: 11px; color: #555; font-weight: bold; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 4px;">${t('ch_comm_center') || 'Communication'}</div>
            <div class="ch-tab-btn" data-tab="world" style="position: relative; width: 100%; height: 44px; background: ${isWorld ? 'linear-gradient(135deg, #1b263b, #111)' : '#0c0c0c'}; border: 1px solid ${isWorld ? '#2196f3' : '#222'}; border-radius: 6px; padding: 0 12px; box-sizing: border-box; cursor: pointer; display: flex; align-items: center; gap: 10px; transition: all 0.2s;">
                <span>🌐</span><b style="font-size: 12px; color: ${isWorld ? '#2196f3' : '#aaa'};">${t('ch_tab_world') || 'World'}</b>${hasUnread('world') ? `<div style="${redDotStyle}"></div>` : ''}
            </div>
            <div class="ch-tab-btn" data-tab="server" style="position: relative; width: 100%; height: 44px; background: ${isServer ? 'linear-gradient(135deg, #2a1b08, #111)' : '#0c0c0c'}; border: 1px solid ${isServer ? '#ffcc00' : '#222'}; border-radius: 6px; padding: 0 12px; box-sizing: border-box; cursor: pointer; display: flex; align-items: center; gap: 10px; transition: all 0.2s;">
                <span>🖥️</span><b style="font-size: 12px; color: ${isServer ? '#ffcc00' : '#aaa'};">${t('ch_tab_server') || 'Server'}</b>${hasUnread('server') ? `<div style="${redDotStyle}"></div>` : ''}
            </div>
            <div class="ch-tab-btn" data-tab="guild" style="position: relative; width: 100%; height: 44px; background: ${isGuild ? 'linear-gradient(135deg, #0f3026, #111)' : '#0c0c0c'}; border: 1px solid ${isGuild ? '#4ecca3' : '#222'}; border-radius: 6px; padding: 0 12px; box-sizing: border-box; cursor: pointer; display: flex; align-items: center; gap: 10px; transition: all 0.2s;">
                <span>🛡️</span><b style="font-size: 12px; color: ${isGuild ? '#4ecca3' : '#aaa'};">${t('ch_tab_guild') || 'Guild'}</b>${hasUnread('guild') ? `<div style="${redDotStyle}"></div>` : ''}
            </div>
            <div class="ch-tab-btn" data-tab="announcements" style="position: relative; width: 100%; height: 44px; background: ${isAnn ? 'linear-gradient(135deg, #3a1111, #111)' : '#0c0c0c'}; border: 1px solid ${isAnn ? '#e94560' : '#222'}; border-radius: 6px; padding: 0 12px; box-sizing: border-box; cursor: pointer; display: flex; align-items: center; gap: 10px; transition: all 0.2s;">
                <span>📢</span><b style="font-size: 12px; color: ${isAnn ? '#e94560' : '#aaa'};">${t('ch_tab_ann') || 'Alerts'}</b>${hasUnread('announcements') ? `<div style="${redDotStyle}"></div>` : ''}
            </div>
            <div class="ch-tab-btn" data-tab="pm" style="position: relative; width: 100%; height: 44px; background: ${isPm ? 'linear-gradient(135deg, #2b123a, #111)' : '#0c0c0c'}; border: 1px solid ${isPm ? '#bb86fc' : '#222'}; border-radius: 6px; padding: 0 12px; box-sizing: border-box; cursor: pointer; display: flex; align-items: center; gap: 10px; transition: all 0.2s;">
                <span>✉️</span><b style="font-size: 12px; color: ${isPm ? '#bb86fc' : '#aaa'};">${t('ch_tab_pm') || 'Whisper'}</b>${hasUnread('pm') ? `<div style="${redDotStyle}"></div>` : ''}
            </div>
        </div>
    `;

    let listContentHTML = '';
    let isInputVisible = true;

    // --- ВНУТРИ ФУНКЦИИ getChatHTML В chat.js ---
    // --- ВНУТРИ ТВОЕЙ ФУНКЦИИ getChatHTML ---
    if (isWorld || isServer || isGuild || isAnn) {
        let activeChannelKey = ChatState.currentTab;
        if (isAnn) activeChannelKey = 'announcements';

        const currentMessages = chatData && chatData[activeChannelKey] ? chatData[activeChannelKey] : [];

        if (activeChannelKey === 'guild' && chatData.guild === null) {
            listContentHTML = `<div style="margin: auto; color: #555; font-size: 12px; font-style: italic;">${t('ch_no_guild') || 'Join a Guild to unlock this channel.'}</div>`;
            isInputVisible = false;
        } else if (currentMessages.length === 0) {
            listContentHTML = `<div style="margin: auto; color: #444; font-size: 12px; font-style: italic;">${t('ch_empty_channel') || 'No messages in this frequency...'}</div>`;
        } else {
            listContentHTML = currentMessages.map(m => {
                if (!m) return '';

                // ИСПРАВЛЕНО: Проверяем, моё ли это сообщение (сверяем с ID текущего игрока)
                const isMe = String(m.userId) === String(Game.player?.id || Game.userId);

                let nameColor = isMe ? '#81c784' : '#ffcc00'; // Свои ники подсвечиваем зеленым, чужие — золотым
                let tag = '';

                if (m.extra?.isSystem) {
                    nameColor = '#e94560';
                    tag = `<span style="font-size:9px; background:#e94560; color:#fff; padding:1px 4px; border-radius:3px; margin-right:4px;">SYS</span>`;
                } else if (m.extra?.isLeader) {
                    nameColor = '#4ecca3';
                    tag = `<span style="font-size:9px; background:#0f3026; border:1px solid #4ecca3; color:#4ecca3; padding:1px 4px; border-radius:3px; margin-right:4px;">GM</span>`;
                }

                const msgTime = m.time ? new Date(m.time) : new Date();
                const timeStr = msgTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

                // ИСПРАВЛЕНО: Берем никнейм из extra, аватарку оттуда же
                const displayName = m.extra?.nickname || `ID: ${String(m.userId).slice(0, 8)}`;
                const avatarUrl = m.extra?.avatar_icon || 'default_avatar.png';

                // ИСПРАВЛЕНО: Разный стиль контейнера для себя и для чужих (выравнивание, фоны, границы)
                const rowStyle = isMe
                    ? `max-width: 85%; align-self: flex-end; background: #1b1b1b; border: 1px solid ${m.isUnread ? '#444' : '#2d2d2d'}; border-radius: 8px 6px 0px 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.2);`
                    : `max-width: 85%; align-self: flex-start; background: #111111; border: 1px solid ${m.isUnread ? '#333' : '#1a1a1a'}; border-radius: 6px 8px 8px 0px;`;

                // Строим HTML с аватаркой (для Системных сообщений аватарку можно скрыть или заменить на иконку шестеренки)
                const avatarHTML = m.extra?.isSystem
                    ? `<div style="width: 32px; height: 32px; background: #222; border: 1px solid #e94560; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 14px; flex-shrink: 0;">📢</div>`
                    : `<img src="${avatarUrl}" style="width: 32px; height: 32px; border-radius: 50%; border: 1px solid ${isMe ? '#4caf50' : '#333'}; object-fit: cover; flex-shrink: 0;">`;

                return `
                    <div class="ch-message-row" data-mid="${m.id || ''}" style="${rowStyle} padding: 8px 12px; box-sizing: border-box; display: flex; gap: 10px;">
                        ${isMe ? '' : avatarHTML} <!-- Чужой аватар рисуем слева -->
                        
                        <div style="display: flex; flex-direction: column; gap: 4px; flex: 1;">
                            <div style="width: 100%; display: flex; justify-content: space-between; align-items: center; gap: 20px;">
                                <div style="display: flex; align-items: center;">
                                    ${tag}<b style="font-size: 11px; color: ${nameColor};">${displayName}</b>
                                </div>
                                <span style="font-size: 9px; color: #444;">${timeStr}</span>
                            </div>
                            <div style="font-size: 12px; color: #dfdfdf; word-break: break-word; line-height: 1.4; text-align: left;">${m.text || ''}</div>
                        </div>

                        ${isMe ? avatarHTML : ''} <!-- Твой собственный аватар рисуем справа -->
                    </div>
                `;
            }).join('');
        }
    }
    // --- ВНУТРИ ТВОЕЙ ФУНКЦИИ getChatHTML В ФАЙЛЕ chat.js ---
    else if (isPm) {
        const pmDialogs = chatData.pm || {};
        const partnerIds = Object.keys(pmDialogs);

        if (partnerIds.length === 0) {
            listContentHTML = `<div style="margin: auto; color: #444; font-size: 12px; font-style: italic;">${t('ch_no_pms') || 'No active transmissions.'}</div>`;
            isInputVisible = false;
        } else {
            if (!ChatState.activePmPartnerId && partnerIds.length > 0) {
                ChatState.activePmPartnerId = partnerIds[0];
            }

            const currentActivePartner = ChatState.activePmPartnerId;
            const messages = pmDialogs[currentActivePartner] || [];

            // 1. ИСПРАВЛЕНО: Рендер верхних табов диалогов С АВАТАРКАМИ
            // 1. ИСПРАВЛЕНО: Ультра-защищенный рендер табов, работающий при 0 сообщений в чате!
            const partnerTabsHTML = `
                <div style="display: flex; gap: 6px; overflow-x: auto; width: 100%; padding-bottom: 8px; border-bottom: 1px solid #1a1a1a; flex-shrink:0; pointer-events:auto;">
                    ${partnerIds.map(pId => {
                const isSelected = pId === currentActivePartner;
                const dialogMessages = pmDialogs[pId] || [];

                // Попытка 1: Ищем сообщение от самого друга в истории
                const msgFromPartner = dialogMessages.find(m => String(m.userId) === String(pId));

                // Попытка 2: Ищем последнее сообщение вообще (может быть наше)
                const lastMsg = dialogMessages[dialogMessages.length - 1] || {};

                // Определяем никнейм и аватар по цепочке приоритетов:
                // 1. Из сохраненного _meta (если чат открыт из списка друзей)
                // 2. Из сообщения от самого партнера
                // 3. Из последнего сообщения (если оно чужое)
                // 4. Фолбэк на ID, если данных нет вообще

                const savedMeta = dialogMessages._meta || {};

                const partnerName = savedMeta.nickname
                    || (msgFromPartner && msgFromPartner.extra?.nickname)
            || (String(lastMsg.userId) === String(pId) && lastMsg.extra?.nickname)
            || `User ID: ${pId.slice(0, 8)}`;

                const partnerAvatar = savedMeta.avatar_icon
                    || (msgFromPartner && msgFromPartner.extra?.avatar_icon)
            || (String(lastMsg.userId) === String(pId) && lastMsg.extra?.avatar_icon)
            || 'default_avatar.png';

                const hasDialogUnread = dialogMessages.some(m => m.isUnread === true);

                return `
                            <div class="ch-pm-partner-tab" data-pid="${pId}" style="position:relative; background: ${isSelected ? '#1b122c' : '#0f0f14'}; border: 1px solid ${isSelected ? '#bb86fc' : '#222'}; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 11px; white-space: nowrap; color: ${isSelected ? '#bb86fc' : '#aaa'}; display:flex; align-items:center; gap:8px; transition: all 0.2s;">
                                <img src="${partnerAvatar}" style="width: 18px; height: 18px; border-radius: 50%; object-fit: cover; border: 1px solid ${isSelected ? '#bb86fc' : '#444'};">
                                <b>${partnerName}</b>
                                ${hasDialogUnread ? `<div style="width: 6px; height: 6px; background: #ff4081; border-radius: 50%; position: absolute; top: -2px; right: -2px; box-shadow: 0 0 4px #ff4081;"></div>` : ''}
                            </div>
                        `;
            }).join('')}
                </div>
            `;


            // 2. ИСПРАВЛЕНО: Рендер цепочки сообщений С АВАТАРКАМИ (Разделение на СЕБЯ и СОБЕСЕДНИКА)
            const messagesHTML = messages.length === 0 ? `
                <div style="margin: auto; color: #333; font-size: 11px;">Empty history.</div>
            ` : messages.map(m => {
                if (!m) return '';

                const timeStr = new Date(m.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                const isMe = String(m.userId) === String(Game.player?.id || Game.userId);

                const displayName = m.extra?.nickname || `ID: ${String(m.userId).slice(0, 8)}`;
                const avatarUrl = m.extra?.avatar_icon || 'default_avatar.png';

                // Стили контейнеров для ЛС
                const rowStyle = isMe
                    ? `max-width: 80%; align-self: flex-end; background: #1b1b1b; border: 1px solid ${m.isUnread ? '#444' : '#2d2d2d'}; border-radius: 8px 6px 0px 8px;`
                    : `max-width: 80%; align-self: flex-start; background: #111111; border: 1px solid ${m.isUnread ? '#333' : '#1a1a1a'}; border-radius: 6px 8px 8px 0px;`;

                const avatarHTML = `<img src="${avatarUrl}" style="width: 26px; height: 32px; border-radius: 50%; object-fit: cover; border: 1px solid ${isMe ? '#81c784' : '#bb86fc'}; flex-shrink:0;">`;

                return `
                    <div class="ch-message-row" data-mid="${m.id || ''}" style="${rowStyle} padding: 8px 12px; box-sizing: border-box; display: flex; gap: 10px;">
                        ${isMe ? '' : avatarHTML} <!-- Аватар собеседника слева -->
                        
                        <div style="display: flex; flex-direction: column; gap: 2px; flex: 1;">
                            <div style="display: flex; justify-content: space-between; align-items: center; gap: 20px; width: 100%;">
                                <b style="font-size: 11px; color: ${isMe ? '#888' : '#bb86fc'};">${displayName}</b>
                                <span style="font-size: 9px; color: #444;">${timeStr}</span>
                            </div>
                            <div style="font-size: 12px; color: #dfdfdf; word-break: break-word; line-height: 1.4; text-align: left;">${m.text || ''}</div>
                        </div>

                        ${isMe ? avatarHTML : ''} <!-- Твой аватар справа -->
                    </div>
                `;
            }).join('');

            listContentHTML = `
                ${partnerTabsHTML}
                <div class="ch-messages-scroll-area" style="flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; padding-top: 8px;">
                    ${messagesHTML}
                </div>
            `;
        }
    }


    // --- 3. ИНПУТ ТЕКСТА ---
    const inputAreaHTML = isInputVisible ? `
        <div style="width: 100%; height: 50px; border-top: 1px solid #1f1f1f; background: #0c0c0c; display: flex; align-items: center; padding: 0 10px; box-sizing: border-box; gap: 8px; flex-shrink: 0; pointer-events: auto;">
            <input id="ch_text_input" type="text" maxlength="200" placeholder="${t('ch_input_placeholder') || 'Enter text...'}" style="flex: 1; height: 32px; background: #141414; border: 1px solid #333; border-radius: 4px; color: #fff; padding: 0 10px; font-size: 12px; box-sizing: border-box; outline: none;">
            <button id="ch_send_btn" style="height: 32px; background: linear-gradient(135deg, #2196f3, #1565c0); border: none; color: #fff; padding: 0 16px; border-radius: 4px; font-size: 12px; font-weight: bold; cursor: pointer;">
                ${t('ch_btn_send') || 'Send'}
            </button>
        </div>
    ` : '';

    const centerAreaHTML = `
        <div class="fr-center-area" style="display: flex; flex-direction: column; flex: 1; height: 100%; background: #0a0a0a; overflow: hidden;">
            <div style="width: 100%; height: ${headerHeight}; display: flex; align-items: center; padding: 0 15px; box-sizing: border-box; border-bottom: 1px solid #1f1f1f; background: ${headerBg}; flex-shrink: 0; pointer-events: auto;">
                <div style="font-size: 12px; color: #2196f3; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px;">
                    📡 ${t('ch_comms_subspace') || 'Subspace Comms'}
                </div>
            </div>
          
            <div class="ch-main-viewport" style="flex: 1; overflow-y: auto; padding: 10px; box-sizing: border-box; display: flex; flex-direction: column; gap: ${listSettings.gap || '8px'}; pointer-events: auto;">
                ${listContentHTML}
            </div>
            ${inputAreaHTML}
        </div>
    `;

    return `
        <div class="screen-content ui-element" style="${getWindowContentStyle()} display: flex; flex-direction: row; box-sizing: border-box; top: 45px; height: calc(100% - 45px); overflow: hidden;">
            ${sidebarHTML}
            ${centerAreaHTML}
        </div>
    `;
}


export function initChatScreen(container, updateUiCallback) {
    const isReload = !!container.querySelector('.screen-content');
    if (!isReload) {
        sendSocket('chat', 'getInitialState', {});
    }

    const oldScreen = container.querySelector('.screen-content');
    if (oldScreen) oldScreen.remove();
    container.insertAdjacentHTML('beforeend', getChatHTML());

    // Автоматический скролл вниз
    const scrollArea = container.querySelector('.ch-messages-scroll-area') || container.querySelector('.ch-main-viewport');
    if (scrollArea) scrollArea.scrollTop = scrollArea.scrollHeight;

    // --- ИСПРАВЛЕННАЯ ЛОГИКА ТРЕКИНГА ПРОЧИТАННОГО ---
    const chatData = Game.chats || { world: [], server: [], announcements: [], guild: null, pm: {} };
    let currentChannelMessages = [];

    // Определяем, какой массив сообщений сейчас перед глазами игрока
    if (ChatState.currentTab === 'pm') {
        currentChannelMessages = chatData.pm[ChatState.activePmPartnerId] || [];
    } else {
        const key = ChatState.currentTab === 'announcements' ? 'announcements' : ChatState.currentTab;
        currentChannelMessages = chatData[key] || [];
    }

    // ИСПРАВЛЕНИЕ: Шлем markAsRead ТОЛЬКО если в текущем чате есть хотя бы одно НЕПРОЧИТАННОЕ сообщение!
    const hasUnreadInViewport = currentChannelMessages.some(m => m.isUnread === true);

    if (hasUnreadInViewport && currentChannelMessages.length > 0) {
        const lastMessage = currentChannelMessages[currentChannelMessages.length - 1];

        // Отправляем запрос на бэк ровно один раз для гашения красной точки
        sendSocket('chat', 'markAsRead', {
            channel: ChatState.currentTab,
            lastMessageId: lastMessage.id,
            ...(ChatState.currentTab === 'pm' && { targetUserId: ChatState.activePmPartnerId })
        });

        // Локально гасим флаги непрочитанности прямо сейчас, чтобы предотвратить повторный вызов!
        currentChannelMessages.forEach(m => m.isUnread = false);
    }

    // --- ОБРАБОТКА КЛИКОВ ПО ВКЛАДКАМ САЙДБАРA ---
    container.querySelectorAll('.ch-tab-btn').forEach(btn => {
        btn.onclick = () => {
            const selectedTab = btn.dataset.tab;
            if (ChatState.currentTab === selectedTab) return;

            ChatState.currentTab = selectedTab;
            initChatScreen(container, updateUiCallback);
        };
    });

    // --- ОБРАБОТКА КЛИКОВ ПО ДИАЛОГАМ ПМ ---
    container.querySelectorAll('.ch-pm-partner-tab').forEach(tab => {
        tab.onclick = () => {
            const partnerId = tab.dataset.pid;
            if (ChatState.activePmPartnerId === partnerId) return;

            ChatState.activePmPartnerId = partnerId;
            initChatScreen(container, updateUiCallback);
        };
    });

    // --- ЛОГИКА ОТПРАВКИ СООБЩЕНИЯ ---
    const inputElement = container.querySelector('#ch_text_input');
    const sendButton = container.querySelector('#ch_send_btn');

    const triggerSendAction = () => {
        if (!inputElement) return;
        const text = inputElement.value.trim();
        if (!text) return;

        sendSocket('chat', 'sendMessage', {
            channel: ChatState.currentTab,
            text: text,
            ...(ChatState.currentTab === 'pm' && { targetUserId: ChatState.activePmPartnerId })
        });

        inputElement.value = '';
    };

    if (sendButton) sendButton.onclick = triggerSendAction;
    if (inputElement) {
        inputElement.onkeydown = (e) => {
            if (e.key === 'Enter') triggerSendAction();
        };
    }
}


export function initChatScreen222(container, updateUiCallback) {
    const isReload = !!container.querySelector('.screen-content');
    if (!isReload) {
        sendSocket('chat', 'getInitialState', {});
    }

    const oldScreen = container.querySelector('.screen-content');
    if (oldScreen) oldScreen.remove();
    container.insertAdjacentHTML('beforeend', getChatHTML());

    const scrollArea = container.querySelector('.ch-messages-scroll-area') || container.querySelector('.ch-main-viewport');
    if (scrollArea) scrollArea.scrollTop = scrollArea.scrollHeight;

    // --- ЛОГИКА ТРЕКИНГА ПРОЧИТАННОГО ---
    const visibleMessageRows = container.querySelectorAll('.ch-message-row');
    if (visibleMessageRows.length > 0) {
        const lastRow = visibleMessageRows[visibleMessageRows.length - 1];
        const lastMsgId = lastRow.dataset.mid;

        sendSocket('chat', 'markAsRead', {
            channel: ChatState.currentTab,
            lastMessageId: lastMsgId,
            ...(ChatState.currentTab === 'pm' && { targetUserId: ChatState.activePmPartnerId })
        });
    }

    // --- ОБРАБОТКА КЛИКОВ ПО ВКЛАДКАМ САЙДБАРA ---
    container.querySelectorAll('.ch-tab-btn').forEach(btn => {
        btn.onclick = () => {
            const selectedTab = btn.dataset.tab;
            if (ChatState.currentTab === selectedTab) return;

            ChatState.currentTab = selectedTab;
            initChatScreen(container, updateUiCallback);
        };
    });

    // --- ОБРАБОТКА КЛИКОВ ПО ДИАЛОГАМ ПМ ---
    container.querySelectorAll('.ch-pm-partner-tab').forEach(tab => {
        tab.onclick = () => {
            const partnerId = tab.dataset.pid;
            if (ChatState.activePmPartnerId === partnerId) return;

            ChatState.activePmPartnerId = partnerId;
            initChatScreen(container, updateUiCallback);
        };
    });

    // --- ЛОГИКА ОТПРАВКИ СООБЩЕНИЯ ---
    const inputElement = container.querySelector('#ch_text_input');
    const sendButton = container.querySelector('#ch_send_btn');

    const triggerSendAction = () => {
        if (!inputElement) return;
        const text = inputElement.value.trim();
        if (!text) return;

        sendSocket('chat', 'sendMessage', {
            channel: ChatState.currentTab,
            text: text,
            ...(ChatState.currentTab === 'pm' && { targetUserId: ChatState.activePmPartnerId })
        });

        inputElement.value = '';
    };

    if (sendButton) sendButton.onclick = triggerSendAction;
    if (inputElement) {
        inputElement.onkeydown = (e) => {
            if (e.key === 'Enter') triggerSendAction();
        };
    }
}


export function openPrivateChatWithPlayer(partnerId, partnerNickname, partnerAvatar = 'default_avatar.png') {

    // 2. Выставляем вкладку "Личные сообщения" и фиксируем активного собеседника
    ChatState.currentTab = 'pm';
    ChatState.activePmPartnerId = String(partnerId);

    // 3. Защита: если с этим человеком еще ни разу не было переписки (в Game.chats.pm нет такого ключа),
    // создаем пустой массив, чтобы у игрока сразу открылось красивое окно чата с именем друга сверху.
    if (!Game.chats) {
        Game.chats = { world: [], server: [], announcements: [], guild: null, pm: {} };
    }
    if (!Game.chats.pm) {
        Game.chats.pm = {};
    }
    if (!Game.chats.pm[partnerId]) {
        // Пушим фейковое системное сообщение или просто инициализируем пустой массив
        Game.chats.pm[partnerId] = [];
    }

    Game.chats.pm[partnerId]._meta = {
        nickname: partnerNickname || "Player",
        avatar_icon: partnerAvatar || "default_avatar.png"
    };

    initChatScreen(Game.uiContainer, ()=>{})
}

window.openPrivateChatWithPlayer = openPrivateChatWithPlayer;
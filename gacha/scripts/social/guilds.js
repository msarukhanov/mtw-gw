import { Game } from '../../stateManager.js';
import {t, getWindowContentStyle} from "../../shared.js";
import {sendSocket} from "../../socket.js";

export const GuildsState = {
    // Вкладки без клана: 'search_guilds' | 'create_guild'
    // Вкладки в клане: 'guild_roster' | 'guild_tributes' | 'guild_shop' | 'guild_requests'
    currentTab: 'search_guilds'
};

export function getGuildsHTML() {
    const orientation = Game.config.orientation || 'landscape';
    const screenSettings = Game.config?.ui?.[orientation]?.find(w => w.id === 'screen_guild_hub') || {};
    const listSettings = screenSettings.list_settings || {};

    const sidebarWidth = listSettings.sidebar_width || "220px";
    const headerHeight = listSettings.header_height || "40px";
    const headerBg = listSettings.header_background || "#121212";

    const myProfile = Game.player || {};
    const myGuildId = myProfile.guild_id || null;

    if (myGuildId && (GuildsState.currentTab === 'search_guilds' || GuildsState.currentTab === 'create_guild')) {
        GuildsState.currentTab = 'guild_roster';
    }

    // --- 1. САЙДБАР ---
    let tabsHTML = '';
    if (!myGuildId) {
        tabsHTML = `
            <div class="g-tab-btn" data-tab="search_guilds" style="width: 100%; height: 44px; background: ${GuildsState.currentTab === 'search_guilds' ? 'linear-gradient(135deg, #1b263b, #111)' : '#0c0c0c'}; border: 1px solid ${GuildsState.currentTab === 'search_guilds' ? '#2196f3' : '#222'}; border-radius: 6px; padding: 0 12px; box-sizing: border-box; cursor: pointer; display: flex; align-items: center; gap: 10px; transition: all 0.2s;">
                <span style="font-size: 18px;">🔍</span>
                <b style="font-size: 12px; color: ${GuildsState.currentTab === 'search_guilds' ? '#2196f3' : '#aaa'};">${t('g_search') || 'Search Guilds'}</b>
            </div>
            <div class="g-tab-btn" data-tab="create_guild" style="width: 100%; height: 44px; background: ${GuildsState.currentTab === 'create_guild' ? 'linear-gradient(135deg, #2a1b08, #111)' : '#0c0c0c'}; border: 1px solid ${GuildsState.currentTab === 'create_guild' ? '#ffcc00' : '#222'}; border-radius: 6px; padding: 0 12px; box-sizing: border-box; cursor: pointer; display: flex; align-items: center; gap: 10px; transition: all 0.2s;">
                <span style="font-size: 18px;">🛡️</span>
                <b style="font-size: 12px; color: ${GuildsState.currentTab === 'create_guild' ? '#ffcc00' : '#aaa'};">${t('g_create') || 'Found Guild'}</b>
            </div>
        `;
    } else {
        const currentGuild = Game.active_guild || { members: [] };
        const myMemberNode = currentGuild.members.find(m => m.id === myProfile.id) || {};
        const isManager = myMemberNode.rank === 'leader' || myMemberNode.rank === 'officer';

        tabsHTML = `
            <div class="g-tab-btn" data-tab="guild_roster" style="width: 100%; height: 44px; background: ${GuildsState.currentTab === 'guild_roster' ? 'linear-gradient(135deg, #1b263b, #111)' : '#0c0c0c'}; border: 1px solid ${GuildsState.currentTab === 'guild_roster' ? '#2196f3' : '#222'}; border-radius: 6px; padding: 0 12px; box-sizing: border-box; cursor: pointer; display: flex; align-items: center; gap: 10px; transition: all 0.2s;">
                <span style="font-size: 18px;">📊</span>
                <b style="font-size: 12px; color: ${GuildsState.currentTab === 'guild_roster' ? '#2196f3' : '#aaa'};">${t('g_roster') || 'Guild Roster'}</b>
            </div>
            <div class="g-tab-btn" data-tab="guild_tributes" style="width: 100%; height: 44px; background: ${GuildsState.currentTab === 'guild_tributes' ? 'linear-gradient(135deg, #2a1b08, #111)' : '#0c0c0c'}; border: 1px solid ${GuildsState.currentTab === 'guild_tributes' ? '#ffcc00' : '#222'}; border-radius: 6px; padding: 0 12px; box-sizing: border-box; cursor: pointer; display: flex; align-items: center; gap: 10px; transition: all 0.2s;">
                <span style="font-size: 18px;">💰</span>
                <b style="font-size: 12px; color: ${GuildsState.currentTab === 'guild_tributes' ? '#ffcc00' : '#aaa'};">${t('g_tributes') || 'Tributes'}</b>
            </div>
            <div class="g-tab-btn" data-tab="guild_shop" style="width: 100%; height: 44px; background: ${GuildsState.currentTab === 'guild_shop' ? 'linear-gradient(135deg, #3a1130, #111)' : '#0c0c0c'}; border: 1px solid ${GuildsState.currentTab === 'guild_shop' ? 'var(--accent-pink)' : '#222'}; border-radius: 6px; padding: 0 12px; box-sizing: border-box; cursor: pointer; display: flex; align-items: center; gap: 10px; transition: all 0.2s;">
                <span style="font-size: 18px;">🛍️</span>
                <b style="font-size: 12px; color: ${GuildsState.currentTab === 'guild_shop' ? 'var(--accent-pink)' : '#aaa'};">${t('g_treasury') || 'Treasury'}</b>
            </div>
            ${isManager ? `
                <div class="g-tab-btn" data-tab="guild_requests" style="width: 100%; height: 44px; background: ${GuildsState.currentTab === 'guild_requests' ? 'linear-gradient(135deg, #0f3026, #111)' : '#0c0c0c'}; border: 1px solid ${GuildsState.currentTab === 'guild_requests' ? '#4ecca3' : '#222'}; border-radius: 6px; padding: 0 12px; box-sizing: border-box; cursor: pointer; display: flex; align-items: center; gap: 10px; transition: all 0.2s;">
                    <span style="font-size: 18px;">📥</span>
                    <b style="font-size: 12px; color: ${GuildsState.currentTab === 'guild_requests' ? '#4ecca3' : '#aaa'};">${t('g_requests') || 'Applications'}</b>
                </div>
            ` : ''}
        `;
    }

    const sidebarHTML = `
        <div class="g-sidebar" style="display: flex; flex-direction: column; border-right: 1px solid #252525; padding: 10px; box-sizing: border-box; height: 100%; width: ${sidebarWidth}; flex-shrink: 0; background: #141414; gap: 10px; pointer-events: auto;">
            <div style="font-size: 11px; color: #555; font-weight: bold; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 4px;">
                ${myGuildId ? (t('g_alliance_hub') || 'Alliance Hub') : (t('g_recruitment') || 'Faction Recruitment')}
            </div>
            ${tabsHTML}
        </div>
    `;

    // --- 2. ЦЕНТРАЛЬНАЯ СКРОЛЛ-ЗОНА ---
    let listContentHTML = '';

    if (!myGuildId) {
        if (GuildsState.currentTab === 'search_guilds') {
            const list = Game.guilds_search_list || [];
            listContentHTML = list.length === 0 ? `
                <div style="margin: auto; color: #444; font-size: 12px; font-style: italic;">${t('g_no_guilds') || 'No active guilds found on this server...'}</div>
            ` : list.map(g => `
                <div style="width: 100%; height: 54px; background: #141414; border: 1px solid #1f1f1f; border-radius: 6px; display: flex; align-items: center; padding: 0 12px; box-sizing: border-box; justify-content: space-between; gap: 12px;">
                    <div style="display: flex; align-items: center; gap: 12px; text-align: left;">
                        <span style="font-size:24px;">🛡️</span>
                        <div>
                            <b style="font-size: 13px; color: #fff;">${g.name} <span style="font-size:10px; color:#ffcc00;">Lvl.${g.level}</span></b>
                            <div style="font-size:10px; color:#555;">${t('g_members') || 'Members'}: ${g.membersCount} | ${t('g_req') || 'Req'}: Lv.${g.conditions?.min_level || 1}+</div>
                        </div>
                    </div>
                    <button class="g-action-btn" data-action="apply" data-gid="${g.id}" style="background:linear-gradient(135deg, #2196f3, #1565c0); border:none; color:#fff; padding:6px 14px; font-size:11px; font-weight:bold; border-radius:4px; cursor:pointer;">${t('g_btn_join') || 'Join Clan'}</button>
                </div>
            `).join('');
        }
        else if (GuildsState.currentTab === 'create_guild') {
            listContentHTML = `
                <div style="margin: auto; width: 100%; max-width: 320px; background: #111; border: 1px solid #222; padding: 20px; border-radius: 8px; display: flex; flex-direction: column; gap: 12px; box-sizing: border-box;">
                    <b style="font-size: 14px; color: #ffcc00; text-align: center;">${t('g_create_title') || 'Establish New Guild Node'}</b>
                    <div style="display:flex; flex-direction:column; gap:4px; text-align:left;">
                        <span style="font-size:11px; color:#666;">${t('g_input_signature') || 'Guild Name Signature'}</span>
                        <input type="text" id="g-input-name" placeholder="${t('g_placeholder') || 'Enter guild name...'}" style="width:100%; height:36px; background:#050505; border:1px solid #333; border-radius:4px; padding:0 10px; color:#fff; box-sizing:border-box; font-size:12px;">
                    </div>
                    <button id="g-btn-submit-create" style="width:100%; height:38px; background:linear-gradient(135deg, #ffcc00, #b38f00); border:none; color:#12122c; font-weight:bold; font-size:12px; border-radius:4px; cursor:pointer; margin-top:5px;">
                        ${t('g_btn_create_cost') || 'Create Clan (500 Diamonds)'}
                    </button>
                </div>
            `;
        }
    }
    else {
        // ФАЗА Б: ИГРОК В КЛАНЕ
        const currentGuild = Game.active_guild || { members: [] };
        const myNode = currentGuild.members.find(m => String(m.id) === String(myProfile.id)) || {};

        // --- ПОД-ЭКРАН 1: РОСТЕР УЧАСТНИКОВ КЛАНА ---
        if (GuildsState.currentTab === 'guild_roster') {
            listContentHTML = currentGuild.members.map(m => {
                const isMe = String(m.id) === String(myProfile.id);
                const scoreDisplay = `⚔️ ${m.combat_power || 0}`;
                const rankLabels = {
                    'leader': t('g_rank_leader') || '👑 Leader',
                    'officer': t('g_rank_officer') || '⚔️ Officer',
                    'member': t('g_rank_member') || '🛡️ Member'
                };

                let rankActionHtml = `<span style="font-size:11px; color:#ffcc00; font-family:monospace;">${rankLabels[m.rank] || rankLabels['member']}</span>`;

                // Если текущий игрок — Лидер, выводим ему селектор должностей для управления другими игроками
                if (myNode.rank === 'leader' && !isMe) {
                    rankActionHtml = `
                        <div style="display:flex; align-items:center; gap:8px;">
                            <select class="g-rank-select" data-uid="${m.id}" style="background:#161616; border:1px solid #333; color:#fff; font-size:11px; padding:3px; border-radius:4px; pointer-events:auto;">
                                <option value="member" ${m.rank === 'member' ? 'selected' : ''}>${t('g_rank_member') || 'Member'}</option>
                                <option value="officer" ${m.rank === 'officer' ? 'selected' : ''}>${t('g_rank_officer') || 'Officer'}</option>
                            </select>
                            <button class="g-action-btn" data-action="kick_member" data-uid="${m.id}" style="background:#222; border:1px solid #e94560; color:#e94560; padding:3px 8px; font-size:10px; border-radius:4px; cursor:pointer;">${t('g_btn_kick') || 'Kick'}</button>
                        </div>
                    `;
                } else if (myNode.rank === 'officer' && m.rank === 'member' && !isMe) {
                    // Офицер видит только кнопку "Кик" напротив обычных мемберов, менять ранги не может
                    rankActionHtml = `
                        <button class="g-action-btn" data-action="kick_member" data-uid="${m.id}" style="background:#222; border:1px solid #e94560; color:#e94560; padding:3px 8px; font-size:10px; border-radius:4px; cursor:pointer;">${t('g_btn_kick') || 'Kick'}</button>
                    `;
                }

                return `
                    <div style="width: 100%; height: 50px; background: ${isMe ? 'linear-gradient(90deg, #1b263b, #141414)' : '#141414'}; border: 1px solid #1f1f1f; border-radius: 6px; display: flex; align-items: center; padding: 0 12px; box-sizing: border-box; justify-content: space-between; gap: 12px;">
                        <div style="display: flex; align-items: center; gap: 12px; text-align: left;">
                            <span style="font-size: 11px; font-family: monospace; color:#666;">[${t('g_level_short') || 'Lv.'}${m.level || 1}]</span>
                            <b style="font-size: 12px; color: #fff;">${m.nickname}</b>
                            <span style="font-size:10px; color:#555; font-family:monospace;">${scoreDisplay}</span>
                        </div>
                        <div>${rankActionHtml}</div>
                    </div>
                `;
            }).join('');

            // В самый низ ростера для Лидера и Обычных игроков добавляем кнопки управления самим кланом
            const panelControlBtn = myNode.rank === 'leader'
                ? `<button class="g-action-btn" data-action="disband_guild" style="margin-top:10px; width:100%; height:34px; background:#222; border:1px solid #e94560; color:#e94560; font-size:11px; font-weight:bold; border-radius:4px; cursor:pointer;">⚠️ ${t('g_btn_disband') || 'Disband Guild'}</button>`
                : `<button class="g-action-btn" data-action="leave_guild" style="margin-top:10px; width:100%; height:34px; background:#222; border:1px solid #aaa; color:#aaa; font-size:11px; font-weight:bold; border-radius:4px; cursor:pointer;">${t('g_btn_leave') || 'Leave Guild'}</button>`;

            listContentHTML += panelControlBtn;
        }

        // --- ПОД-ЭКРАН 2: ЕЖЕДНЕВНЫЕ ВНОСЫ (TRIBUTES) ---
        else if (GuildsState.currentTab === 'guild_tributes') {
            const donationModes = Game.config?.social?.guild_system?.donation_modes || {};
            listContentHTML = Object.keys(donationModes).length === 0 ? `
                <div style="margin: auto; color: #444; font-size: 12px; font-style: italic;">${t('g_no_tributes') || 'No donation tributes configured...'}</div>
            ` : Object.keys(donationModes).map(tKey => {
                const d = donationModes[tKey];
                return `
                    <div style="width: 100%; height: 58px; background: #141414; border: 1px solid #1f1f1f; border-radius: 6px; display: flex; align-items: center; padding: 0 12px; box-sizing: border-box; justify-content: space-between; gap: 12px;">
                        <div style="text-align: left;">
                            <b style="font-size: 12px; color: #fff; text-transform:uppercase; font-family:monospace;">${tKey.replace('_', ' ')}</b>
                            <div style="font-size:10px; color:#666; margin-top:2px;">Gives: <span style="color:#4ecca3;">+${d.rewards?.guild_exp || 0} Exp</span> | <span style="color:var(--accent-pink);">+${d.rewards?.guild_coin || 0} Coins</span></div>
                        </div>
                        <button class="g-action-btn" data-action="tribute" data-tid="${tKey}" style="background:linear-gradient(135deg, #ffcc00, #b38f00); border:none; color:#12122c; padding:6px 14px; font-size:11px; font-weight:bold; border-radius:4px; cursor:pointer;">
                            ${t('g_btn_cost') || 'Cost:'} ${d.cost?.amount} ${d.cost?.resource}
                        </button>
                    </div>
                `;
            }).join('');
        }

        // --- ПОД-ЭКРАН 3: СОКРОВИЩНИЦА КЛАНА (МАГАЗИН) ---
        else if (GuildsState.currentTab === 'guild_shop') {
            const shopSlots = Game.config?.social?.guild_system?.shop?.slots || [];
            const shopsState = myProfile.shopsState || {};
            listContentHTML = shopSlots.length === 0 ? `
                <div style="margin: auto; color: #444; font-size: 12px; font-style: italic;">${t('g_no_treasury') || 'Guild Treasury is currently empty...'}</div>
            ` : shopSlots.map(s => {
                const buyCount = shopsState[`guild_${s.slotId}`] || 0;
                const isLimit = buyCount >= (s.buy_limit || 1);
                return `
                    <div style="width: 100%; height: 58px; background: #141414; border: 1px solid #1f1f1f; border-radius: 6px; display: flex; align-items: center; padding: 0 12px; box-sizing: border-box; justify-content: space-between; gap: 12px;">
                        <div style="text-align: left;">
                            <b style="font-size: 12px; color: #fff;">📦 Item: ${s.itemId} <span style="font-size:10px; color:#666;">(x${s.amount})</span></b>
                            <div style="font-size:10px; color:#555; margin-top:2px;">Limit: ${buyCount}/${s.buy_limit || 1}</div>
                        </div>
                        <button class="g-action-btn" data-action="buy_treasury" data-sid="${s.slotId}" ${isLimit ? 'disabled style="background:#1a1a1a; border:1px solid #333; color:#555; padding:6px 14px; font-size:11px; border-radius:4px;"' : 'style="background:linear-gradient(135deg, var(--accent-pink), #951c30); border:none; color:#fff; padding:6px 14px; font-size:11px; font-weight:bold; border-radius:4px; cursor:pointer;"'}>
                            ${isLimit ? (t('g_btn_sold_out') || 'Sold Out') : `${t('g_btn_cost') || 'Cost:'} ${s.cost} Coins`}
                        </button>
                    </div>
                `;
            }).join('');
        }

        else if (GuildsState.currentTab === 'guild_requests') {
            const reqList = Game.guild_incoming_requests || [];
            listContentHTML = reqList.length === 0 ? `
                <div style="margin: auto; color: #444; font-size: 12px; font-style: italic;">${t('g_no_requests') || 'No pending application requests...'}</div>
            ` : reqList.map(r => `
                <div style="width: 100%; height: 54px; background: #141414; border: 1px solid #1f1f1f; border-radius: 6px; display: flex; align-items: center; padding: 0 12px; box-sizing: border-box; justify-content: space-between; gap: 12px;">
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <img src="${r.avatar_icon || ''}" style="width: 36px; height: 36px; border-radius: 50%; border: 1px solid #333; object-fit: cover;">
                        <b style="font-size: 12px; color: #fff; text-align:left;">${r.nickname} <span style="font-size:10px; color:#555;">${t('g_level_short') || 'Lv.'}${r.level} [⚔️${r.combat_power}]</span></b>
                    </div>
                    <div style="display:flex; gap:8px;">
                        <button class="g-action-btn" data-action="accept_req" data-uid="${r.id}" style="background:linear-gradient(135deg, #4ecca3, #2b9371); border:none; color:#12122c; padding:5px 12px; font-size:11px; font-weight:bold; border-radius:4px; cursor:pointer;">${t('g_btn_accept') || 'Accept'}</button>
                        <button class="g-action-btn" data-action="decline_req" data-uid="${r.id}" style="background:#222; border:1px solid #e94560; color:#e94560; padding:5px 12px; font-size:11px; border-radius:4px; cursor:pointer;">${t('g_btn_decline') || 'Decline'}</button>
                    </div>
                </div>
            `).join('');
        }
    }

    const centerAreaHTML = `
        <div class="g-center-area" style="display: flex; flex-direction: column; flex: 1; height: 100%; background: #0a0a0a; overflow: hidden;">
            <div style="width: 100%; height: ${headerHeight}; display: flex; align-items: center; padding: 0 15px; box-sizing: border-box; border-bottom: 1px solid #1f1f1f; background: ${headerBg}; flex-shrink: 0; pointer-events: auto;">
                <div style="font-size: 12px; color: #ffcc00; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px;">
                    🛡️ ${t('g_alliance_panel') || 'Guild Operations Command'}
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



export function initGuildsScreen(container, updateUiCallback) {
    const isReload = !!container.querySelector('.screen-content');
    const myGuildId = Game.player?.guild_id || null;

    // Первичный запрос данных, если зашли с главного меню
    if (!isReload) {
        if (!myGuildId) {
            sendSocket('guilds', 'searchGuilds', {});
        } else {
            // Если игрок в клане, запрашиваем ростер при входе
            sendSocket('guilds', 'getGuildMainData', {});
        }
    }

    const oldScreen = container.querySelector('.screen-content');
    if (oldScreen) oldScreen.remove();

    container.insertAdjacentHTML('beforeend', getGuildsHTML());

    // А) КЛИКИ ПО ВКЛАДКАМ САЙДБАРА
    container.querySelectorAll('.g-tab-btn').forEach(btn => {
        btn.onclick = () => {
            const selectedTab = btn.dataset.tab;
            if (GuildsState.currentTab === selectedTab) return;

            GuildsState.currentTab = selectedTab;

            // Запрашиваем динамические пакеты строго при клике на вкладки
            if (selectedTab === 'search_guilds') sendSocket('guilds', 'searchGuilds', {});
            else if (selectedTab === 'guild_requests') sendSocket('guilds', 'getGuildRequests', {});

            // Локально перерисовываем только вкладки
            initGuildsScreen(container, updateUiCallback);
        };
    });

    // Б) ДЕЙСТВИЯ КНОПОК ВНУТРИ СПИСКОВ (ЭКШЕНЫ)
    container.querySelectorAll('.g-action-btn').forEach(btn => {
        btn.onclick = () => {
            const action = btn.dataset.action;

            if (action === 'apply') sendSocket('guilds', 'applyToGuild', { targetGuildId: btn.dataset.gid });
            else if (action === 'tribute') sendSocket('guilds', 'submitTribute', { tributeId: btn.dataset.tid });
            else if (action === 'buy_treasury') sendSocket('guilds', 'buyTreasuryItem', { slotId: btn.dataset.sid, count: 1 });
            else if (action === 'accept_req') sendSocket('guilds', 'handleRequest', { candidateId: btn.dataset.uid, action: 'accept' });
            else if (action === 'decline_req') sendSocket('guilds', 'handleRequest', { candidateId: btn.dataset.uid, action: 'decline' });
            // Обработчики новых кнопок жизненного цикла, которые мы добавили на бэке
            else if (action === 'leave_guild') sendSocket('guilds', 'leaveGuild', {});
            else if (action === 'kick_member') sendSocket('guilds', 'kickMember', { targetMemberId: btn.dataset.uid });
            else if (action === 'disband_guild') sendSocket('guilds', 'disbandGuild', {});
        };
    });

    // В) ДЕЙСТВИЕ СОЗДАНИЯ КЛАНА
    const createBtn = container.querySelector('#g-btn-submit-create');
    if (createBtn) {
        createBtn.onclick = () => {
            const nameInput = container.querySelector('#g-input-name');
            const guildName = nameInput ? nameInput.value.trim() : "";
            if (!guildName) return alert(t('g_err_empty_name') || "Введите название клана");

            sendSocket('guilds', 'createGuild', { guildName });
        };
    }

    // Г) ИЗМЕНЕНИЕ ИЕРАРХИЧЕСКОГО РАНГА СЕЛЕКТОРОМ
    container.querySelectorAll('.g-rank-select').forEach(sel => {
        sel.onchange = () => {
            const targetMemberId = sel.dataset.uid;
            const newRank = sel.value;
            sendSocket('guilds', 'changeRank', { targetMemberId, newRank });
        };
    });
}

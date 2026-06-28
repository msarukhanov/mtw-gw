// scripts/admin/social.js — ЧАСТЬ 1 ИЗ 2
let currentSocialSection = 'friends';
let stateSocialGuildKey = 'guild_system';
let currentGuildDonationKey = null;
let currentGuildSlotIdx = null;

function switchSocialTab(sectionId, evt) {
    currentSocialSection = sectionId;
    currentGuildDonationKey = null;
    currentGuildSlotIdx = null;

    if (evt && evt.target && evt.target.parentElement) {
        evt.target.parentElement.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        evt.target.classList.add('active');
    }

    const titleElem = document.getElementById('social-sidebar-title');
    if (titleElem) {
        titleElem.innerText = sectionId === 'friends' ? 'Friend System' : 'Guild & Clan Hierarchy';
    }

    const ed = document.getElementById('social-editor');
    if (ed) ed.innerHTML = '';

    renderSocialSidebarList();
}

function renderSocialSidebarList() {
    const list = document.getElementById('social-list');
    if (!list) return;

    if (!target.social) {
        target.social = {
            friend_system: { max_friends_limit: 50, max_pending_requests: 20, daily_gift_resource_id: "currency_friendship_points", daily_gift_amount: 10, max_daily_received_gifts: 30 },
            guild_system: { creation_cost: { resource: "diamond", amount: 500 }, max_guild_level: 10, level_caps: {}, donation_modes: {}, shop: { title_loc: { en: "Guild Treasury", ru: "" }, currency_resource_id: "guild_coin", slots: [] } }
        };
    }

    const sidebarHeaderBtn = document.querySelector('#view-social .crud-sidebar-header button');
    if (sidebarHeaderBtn) sidebarHeaderBtn.style.display = 'none';

    if (currentSocialSection === 'friends') {
        list.innerHTML = `
            <li class="crud-list-item active" onclick="selectSocialNode('friends')">
                <div style="display:flex; align-items:center; gap:8px;">
                    <span>🤝</span>
                    <span>Friendship & Heart Gifting</span>
                </div>
            </li>
        `;
        renderFriendSystemForm(); // Прямой вызов без зацикливания сайдбара
    } else {
        list.innerHTML = `
            <li class="crud-list-item active" onclick="selectSocialNode('guilds')">
                <div style="display:flex; align-items:center; gap:8px;">
                    <span>🛡️</span>
                    <span>Guild Infrastructure Core</span>
                </div>
            </li>
        `;
        renderGuildSystemForm(); // Прямой вызов без зацикливания сайдбара
    }
}

function selectSocialNode(section) {
    currentGuildDonationKey = null;
    currentGuildSlotIdx = null;

    if (section === 'friends') {
        renderFriendSystemForm();
    } else {
        renderGuildSystemForm();
    }
}

function renderFriendSystemForm() {
    const ed = document.getElementById('social-editor');
    if (!ed) return;

    const fs = target.social.friend_system;
    const resourceOptions = Object.keys(target.mechanics?.resources || {}).map(rKey =>
        `<option value="${rKey}" ${fs.daily_gift_resource_id === rKey ? 'selected' : ''}>🔮 ${rKey}</option>`
    ).join('');

    ed.innerHTML = `
        <div class="card-header-flex">
            <span class="card-title">Configure Social Friend System Limits</span>
        </div>
        
        <div class="form-grid">
            <div class="form-group">
                <label>Maximum Active Friends Limit</label>
                <input type="number" value="${fs.max_friends_limit || 50}" oninput="target.social.friend_system.max_friends_limit = parseInt(this.value) || 50;">
            </div>
            <div class="form-group">
                <label>Maximum Pending Inbound Requests</label>
                <input type="number" value="${fs.max_pending_requests || 20}" oninput="target.social.friend_system.max_pending_requests = parseInt(this.value) || 20;">
            </div>
            <div class="form-group">
                <label>Daily Heart Gift Resource ID Key</label>
                <select onchange="target.social.friend_system.daily_gift_resource_id = this.value;">
                    <option value="">-- Select Resource --</option>
                    ${resourceOptions}
                </select>
            </div>
            <div class="form-group">
                <label>Friendship Points Payout Value</label>
                <input type="number" value="${fs.daily_gift_amount || 10}" oninput="target.social.friend_system.daily_gift_amount = parseInt(this.value) || 10;">
            </div>
            <div class="form-group full-width">
                <label>Max Daily Claimable Gifts Limit (Forces Friend Rotation)</label>
                <input type="number" value="${fs.max_daily_received_gifts || 30}" oninput="target.social.friend_system.max_daily_received_gifts = parseInt(this.value) || 30;">
            </div>
        </div>
    `;
}

function renderGuildSystemForm() {
    const ed = document.getElementById('social-editor');
    if (!ed) return;

    const gs = target.social.guild_system;
    if (!gs.creation_cost) gs.creation_cost = { resource: "diamond", amount: 500 };
    if (!gs.level_caps) gs.level_caps = {};
    if (!gs.donation_modes) gs.donation_modes = {};
    if (!gs.shop) gs.shop = { title_loc: { en: "Guild Treasury", ru: "" }, currency_resource_id: "guild_coin", slots: [] };
    if (!gs.shop.slots) gs.shop.slots = [];

    // А) Рендеринг матрицы вместимости уровней гильдии (level_caps)
    let levelCapsHtml = Object.keys(gs.level_caps).map(lvl => `
        <div style="display:grid; grid-template-columns: 1fr 2fr 2fr auto; gap:8px; margin-bottom:6px; align-items:center; background:rgba(255,255,255,0.01); padding:5px; border-radius:4px;">
            <span class="badge" style="font-family:monospace;">Lvl ${lvl}</span>
            <div class="form-group" style="margin:0;"><input type="number" value="${gs.level_caps[lvl].max_members || 20}" oninput="target.social.guild_system.level_caps['${lvl}'].max_members = parseInt(this.value)||20;" placeholder="Max Members"></div>
            <div class="form-group" style="margin:0;"><input type="number" value="${gs.level_caps[lvl].max_officers || 2}" oninput="target.social.guild_system.level_caps['${lvl}'].max_officers = parseInt(this.value)||2;" placeholder="Max Officers"></div>
            <button class="danger" style="padding:4px 8px;" onclick="delete target.social.guild_system.level_caps['${lvl}']; renderGuildSystemForm();">X</button>
        </div>
    `).join('');

    // Б) Рендеринг аккордеона ежедневных вносов (donation_modes)
    let donationsHtml = Object.keys(gs.donation_modes).map(dKey => {
        const d = gs.donation_modes[dKey];
        const isEditing = currentGuildDonationKey === dKey;
        let dEditorHtml = '';

        if (isEditing) {
            dEditorHtml = `
                <div class="sub-section" style="border-left: 2px solid var(--accent-blue); padding:10px; background:rgba(0,0,0,0.1); margin-top:8px;" onclick="event.stopPropagation();">
                    <div class="form-grid" style="gap:6px;">
                        <div class="form-group"><label>Cost Resource Type</label>
                            <select onchange="target.social.guild_system.donation_modes['${dKey}'].cost.resource = this.value;">
                                ${Object.keys(target.mechanics?.resources || {}).map(r => `<option value="${r}" ${d.cost?.resource === r ? 'selected' : ''}>${r}</option>`).join('')}
                            </select>
                        </div>
                        <div class="form-group"><label>Cost Price Value</label><input type="number" value="${d.cost?.amount || 0}" oninput="target.social.guild_system.donation_modes['${dKey}'].cost.amount = parseInt(this.value)||0;"></div>
                        <div class="form-group"><label>Guild Exp Reward</label><input type="number" value="${d.rewards?.guild_exp || 0}" oninput="target.social.guild_system.donation_modes['${dKey}'].rewards.guild_exp = parseInt(this.value)||0;"></div>
                        <div class="form-group"><label>Guild Coins Reward</label><input type="number" value="${d.rewards?.guild_coin || 0}" oninput="target.social.guild_system.donation_modes['${dKey}'].rewards.guild_coin = parseInt(this.value)||0;"></div>
                    </div>
                </div>
            `;
        }

        return `
            <div style="margin-bottom:6px; background:rgba(255,255,255,0.01); padding:8px; border:1px solid ${isEditing ? 'var(--accent-blue)' : 'var(--border-color)'}; border-radius:6px;">
                <div class="element-row" style="margin:0; border:none; padding:0; background:transparent;">
                    <div class="element-info" style="cursor:pointer; display:flex; align-items:center; gap:8px; width:100%;" onclick="currentGuildDonationKey = (currentGuildDonationKey === '${dKey}' ? null : '${dKey}'); renderGuildSystemForm();">
                        <span class="badge" style="background:${isEditing ? 'var(--accent-blue)' : 'var(--bg-main)'}; font-family:monospace;">${isEditing ? '🔽' : '▶️'} ${dKey}</span>
                        <span style="font-size:11px; color:var(--text-muted);">price: <b>${d.cost?.amount || 0} ${d.cost?.resource || ''}</b></span>
                    </div>
                    <button class="btn-sm btn-danger" onclick="event.stopPropagation(); delete target.social.guild_system.donation_modes['${dKey}']; currentGuildDonationKey=null; renderGuildSystemForm();">Delete</button>
                </div>
                ${dEditorHtml}
            </div>
        `;
    }).join('');

    // В) Рендеринг аккордеона слотов сокровищницы Guild Shop (slots)
    let shopSlotsHtml = gs.shop.slots.map((slot, sIdx) => {
        const isEditing = currentGuildSlotIdx === sIdx;
        let slotEditorHtml = '';

        if (isEditing) {
            slotEditorHtml = `
                <div class="sub-section" style="border-left: 2px solid var(--accent-pink); padding:10px; background:rgba(0,0,0,0.1); margin-top:8px;" onclick="event.stopPropagation();">
                    <div class="form-grid" style="gap:6px;">
                        <div class="form-group"><label>Slot unique ID</label><input type="text" value="${slot.slotId || ''}" oninput="target.social.guild_system.shop.slots[${sIdx}].slotId = this.value;"></div>
                        <div class="form-group"><label>Reward Item Link</label>
                            <select onchange="target.social.guild_system.shop.slots[${sIdx}].itemId = this.value;">
                                <option value="">-- Select Item --</option>
                                ${Object.keys(target.catalog?.items || {}).map(i => `<option value="${i}" ${slot.itemId === i ? 'selected' : ''}>📦 ${i}</option>`).join('')}
                            </select>
                        </div>
                        <div class="form-group"><label>Stack Count (amount)</label><input type="number" value="${slot.amount || 1}" oninput="target.social.guild_system.shop.slots[${sIdx}].amount = parseInt(this.value)||1;"></div>
                        <div class="form-group"><label>Guild Token Cost</label><input type="number" value="${slot.cost || 0}" oninput="target.social.guild_system.shop.slots[${sIdx}].cost = parseInt(this.value)||0;"></div>
                        <div class="form-group full-width"><label>Account Buy Limit</label><input type="number" value="${slot.buy_limit || 1}" oninput="target.social.guild_system.shop.slots[${sIdx}].buy_limit = parseInt(this.value)||1;"></div>
                    </div>
                </div>
            `;
        }

        return {html: shopSlotsHtmlAnchor, isEditing: isEditing, sIdx: sIdx, slot: slot, slotEditorHtml: slotEditorHtml};
    });
    // scripts/admin/social.js — ЧАСТЬ 2.2 ИЗ 2 (ФИНАЛ МОДУЛЯ)
    let renderedShopSlotsText = shopSlotsHtml.map(obj => `
        <div style="margin-bottom:6px; background:rgba(255,255,255,0.01); padding:8px; border:1px solid ${obj.isEditing ? 'var(--accent-pink)' : 'var(--border-color)'}; border-radius:6px;">
            <div class="element-row" style="margin:0; border:none; padding:0; background:transparent;">
                <div class="element-info" style="cursor:pointer; display:flex; align-items:center; gap:8px; width:100%;" onclick="currentGuildSlotIdx = (currentGuildSlotIdx === ${obj.sIdx} ? null : ${obj.sIdx}); renderGuildSystemForm();">
                    <span class="badge" style="background:${obj.isEditing ? 'var(--accent-pink)' : 'var(--bg-main)'}; font-family:monospace;">${obj.isEditing ? '🔽' : '▶️'} ${obj.slot.slotId || 'unnamed_slot'}</span>
                    <span style="font-size:11px; color:var(--text-muted);">item: <b>${obj.slot.itemId || 'none'}</b></span>
                </div>
                <button class="btn-sm btn-danger" onclick="event.stopPropagation(); target.social.guild_system.shop.slots.splice(${obj.sIdx},1); currentGuildSlotIdx=null; renderGuildSystemForm();">Delete</button>
            </div>
            ${obj.slotEditorHtml}
        </div>
    `).join('');

    ed.innerHTML = `
        <div class="card-header-flex"><span class="card-title">Guild Infrastructure Core Settings</span></div>
        <div class="form-grid">
            <div class="form-group"><label>Guild Creation Cost Currency</label>
                <select onchange="target.social.guild_system.creation_cost.resource = this.value;">
                    ${Object.keys(target.mechanics?.resources || {}).map(r => `<option value="${r}" ${gs.creation_cost.resource === r ? 'selected' : ''}>${r}</option>`).join('')}
                </select>
            </div>
            <div class="form-group"><label>Guild Creation Cost Price</label><input type="number" value="${gs.creation_cost.amount || 500}" oninput="target.social.guild_system.creation_cost.amount = parseInt(this.value)||0;"></div>
            <div class="form-group full-width"><label>Maximum Guild Progression Level Cap</label><input type="number" value="${gs.max_guild_level || 10}" oninput="target.social.guild_system.max_guild_level = parseInt(this.value)||10;"></div>
        </div>

        <div class="sub-section" style="border-color:var(--border-color); margin-top:15px;">
            <div class="card-header-flex" style="border:none; padding:0; margin-bottom:8px;">
                <span class="sub-section-title" style="margin:0;">📊 Guild Level Caps Matrix</span>
                <button class="primary" style="padding:2px 6px; font-size:11px;" onclick="const nLvl=Object.keys(target.social.guild_system.level_caps).length+1; target.social.guild_system.level_caps[nLvl]={max_members:20,max_officers:2}; renderGuildSystemForm();">+ Add Level</button>
            </div>
            <div>${levelCapsHtml || '<p style="font-size:11px; color:var(--text-muted); margin:0;">No tiers generated</p>'}</div>
        </div>

        <div class="sub-section" style="border-color:var(--accent-blue); margin-top:15px;">
            <div class="card-header-flex" style="border:none; padding:0; margin-bottom:8px;">
                <span class="sub-section-title" style="margin:0; color:var(--accent-blue);">💰 Daily Tribute / Donation Modes</span>
                <button class="primary" style="padding:2px 6px; font-size:11px;" onclick="const nKey='tribute_'+Date.now().toString().slice(-3); target.social.guild_system.donation_modes[nKey]={cost:{resource:'gold',amount:1000},rewards:{guild_exp:100,guild_coin:50}}; renderGuildSystemForm();">+ Add Tribute</button>
            </div>
            <div>${donationsHtml || '<p style="font-size:11px; color:var(--text-muted); margin:0;">No tributes mapped</p>'}</div>
        </div>

        <div class="sub-section" style="border-color:var(--accent-pink); margin-top:15px;">
            <div class="form-grid" style="margin-bottom:8px;">
                <div class="form-group"><label>Treasury Shop Title (EN)</label><input type="text" value="${gs.shop.title_loc?.en || ''}" oninput="target.social.guild_system.shop.title_loc.en = this.value;"></div>
                <div class="form-group"><label>Treasury Shop Title (RU)</label><input type="text" value="${gs.shop.title_loc?.ru || ''}" oninput="target.social.guild_system.shop.title_loc.ru = this.value;"></div>
                <div class="form-group full-width"><label>Guild Treasury Currency (resourceId)</label><input type="text" value="${gs.shop.currency_resource_id || ''}" oninput="target.social.guild_system.shop.currency_resource_id = this.value;"></div>
            </div>
            <div class="card-header-flex" style="border:none; padding:0; margin-bottom:8px;">
                <span class="sub-section-title" style="margin:0; color:var(--accent-pink);">🛍️ Guild Treasury Shop Frontcase Slots</span>
                <button class="primary" style="padding:2px 8px; font-size:11px;" onclick="target.social.guild_system.shop.slots.push({slotId:'guild_slot_'+Date.now().toString().slice(-3), itemId:'', amount:1, cost:100, buy_limit:1}); renderGuildSystemForm();">+ Add Item Node</button>
            </div>
            <div>${renderedShopSlotsText || '<p style="font-size:11px; color:var(--text-muted); margin:0;">Treasury shop is empty</p>'}</div>
        </div>
    `;
}


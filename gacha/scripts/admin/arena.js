let currentArenaSection = 'rules'; // 'rules', 'tiers', 'shop_buffs'
let stateArenaTierKey = null;      // ID выбранной лиги (например, 'bronze')
let currentArenaSlotIdx = null;    // Индекс открытого слота магазина гладиаторов

function switchArenaTab(sectionId, evt) {
    currentArenaSection = sectionId;
    stateArenaTierKey = null;
    currentArenaSlotIdx = null;

    if (evt && evt.target && evt.target.parentElement) {
        evt.target.parentElement.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        evt.target.classList.add('active');
    }

    const titleElem = document.getElementById('arena-sidebar-title');
    if (titleElem) {
        const titleMap = {
            'rules': 'Matchmaking & Core Rules',
            'tiers': 'League Ranking Ladder',
            'shop_buffs': 'Season Market & Buffs'
        };
        titleElem.innerText = titleMap[sectionId];
    }

    const ed = document.getElementById('arena-editor');
    if (ed) ed.innerHTML = '';

    renderArenaSidebarList();
}

function renderArenaSidebarList() {
    const list = document.getElementById('arena-list');
    if (!list) return;

    // Инициализируем структуру PVP Арены на корневом уровне, если её нет в глобальной базе
    if (!target.pvp_arena) {
        target.pvp_arena = {
            rules: { min_player_level: 15, daily_free_tickets: 5, ticket_cost_item_id: "arena_pass", ticket_diamond_cost: 50, season_duration_ms: 604800000, defense_team_mandatory: true },
            matchmaking_settings: { score_base_gain: 20, score_min_gain: 5, score_base_loss: 15, bot_matching_threshold_seconds: 15, opponent_pool_size: 3 },
            tiers: {},
            season_buffs: { active_season_id: "season_1", affected_classes: {}, banned_heroes: [] },
            shop: { title_loc: { en: "Gladiator Market", ru: "" }, currency_resource_id: "arena_coin", slots: [] }
        };
    }

    const sidebarHeader = document.querySelector('#view-arena .crud-sidebar-header button');

    if (currentArenaSection === 'rules') {
        if (sidebarHeader) sidebarHeader.style.display = 'none'; // Правила и ММ — синглтоны
        list.innerHTML = `
            <li class="crud-list-item active" onclick="selectArenaNode('rules')">
                <div style="display:flex; align-items:center; gap:8px;">
                    <span>🧮</span>
                    <span>PVP Engine & Matchmaking</span>
                </div>
            </li>
        `;
        selectArenaNode('rules');
    }
    else if (currentArenaSection === 'tiers') {
        if (sidebarHeader) sidebarHeader.style.display = 'block'; // Разрешаем добавлять новые лиги
        list.innerHTML = Object.keys(target.pvp_arena.tiers || {}).map(key => {
            const tier = target.pvp_arena.tiers[key];
            return `
                <li class="crud-list-item ${stateArenaTierKey === key ? 'active' : ''}" onclick="stateArenaTierKey='${key}'; selectArenaNode('tiers');">
                    <div style="display:flex; align-items:center; gap:8px;">
                        <span>🏆</span>
                        <span style="font-family:monospace; font-size:13px;">${key}</span>
                    </div>
                    <span class="badge" style="font-size:9px;">>${tier.min_score || 0} pts</span>
                </li>
            `;
        }).join('');
    }
    else if (currentArenaSection === 'shop_buffs') {
        if (sidebarHeader) sidebarHeader.style.display = 'none'; // Магазин и мета-баффы — фиксированная секция
        list.innerHTML = `
            <li class="crud-list-item active" onclick="selectArenaNode('shop_buffs')">
                <div style="display:flex; align-items:center; gap:8px;">
                    <span>🛒</span>
                    <span>Season Store & Meta Meta</span>
                </div>
            </li>
        `;
        selectArenaNode('shop_buffs');
    }
}

function selectArenaNode(section) {
    if (section === 'rules') renderArenaRulesForm();
    else if (section === 'tiers') renderArenaTierForm(stateArenaTierKey);
    else if (section === 'shop_buffs') renderArenaShopAndBuffsForm();
}

function createNewArenaTier() {
    if (currentArenaSection !== 'tiers') return;
    if (!target.pvp_arena.tiers) target.pvp_arena.tiers = {};

    const count = Object.keys(target.pvp_arena.tiers).length;
    const newKey = `tier_league_${count + 1}`;

    target.pvp_arena.tiers[newKey] = {
        min_score: count * 1000,
        title_loc: { en: "New Challenger League", ru: "" },
        icon: "",
        daily_payout: { resources: {} },
        season_payout: { resources: {} }
    };

    stateArenaTierKey = newKey;
    renderArenaSidebarList();
    selectArenaNode('tiers');
}

function renderArenaRulesForm() {
    const ed = document.getElementById('arena-editor');
    if (!ed) return;

    const rules = target.pvp_arena.rules || {};
    const mm = target.pvp_arena.matchmaking_settings || {};

    const itemOptions = Object.keys(target.catalog?.items || {}).map(iKey =>
        `<option value="${iKey}" ${rules.ticket_cost_item_id === iKey ? 'selected' : ''}>📦 ${iKey}</option>`
    ).join('');

    ed.innerHTML = `
        <div class="card-header-flex">
            <span class="card-title">PVP Arena Core Engine & Matchmaking Formula Setup</span>
        </div>
        
        <!-- 1. Системные правила входа и билетов -->
        <div class="sub-section" style="border-color: var(--accent-blue);">
            <div class="sub-section-title" style="color:var(--accent-blue);">⚙️ Core Entry Rules</div>
            <div class="form-grid">
                <div class="form-group"><label>Min Player Level Unlocked</label><input type="number" value="${rules.min_player_level || 15}" oninput="target.pvp_arena.rules.min_player_level = parseInt(this.value) || 15;"></div>
                <div class="form-group"><label>Daily Replenished Free Tickets</label><input type="number" value="${rules.daily_free_tickets || 5}" oninput="target.pvp_arena.rules.daily_free_tickets = parseInt(this.value) || 5;"></div>
                <div class="form-group">
                    <label>Ticket Item Cost Identifier (itemId)</label>
                    <select onchange="target.pvp_arena.rules.ticket_cost_item_id = this.value;">
                        <option value="">-- Select Inventory Ticket --</option>
                        ${itemOptions}
                    </select>
                </div>
                <div class="form-group"><label>Ticket Fallback Diamond Buy Cost</label><input type="number" value="${rules.ticket_diamond_cost || 50}" oninput="target.pvp_arena.rules.ticket_diamond_cost = parseInt(this.value) || 50;"></div>
                <div class="form-group"><label>Global Season Cycle Duration (ms)</label><input type="number" value="${rules.season_duration_ms || 604800000}" oninput="target.pvp_arena.rules.season_duration_ms = parseInt(this.value) || 604800000;"></div>
                <div class="form-group">
                    <label>Defense Squad Required</label>
                    <select onchange="target.pvp_arena.rules.defense_team_mandatory = (this.value === 'true');">
                        <option value="true" ${rules.defense_team_mandatory !== false ? 'selected' : ''}>True (Mandatory)</option>
                        <option value="false" ${rules.defense_team_mandatory === false ? 'selected' : ''}>False (Optional)</option>
                    </select>
                </div>
            </div>
        </div>

        <!-- 2. Формулы Эло и ММ -->
        <div class="sub-section" style="border-color: var(--accent-pink); margin-top: 20px;">
            <div class="sub-section-title" style="color:var(--accent-pink);">🧮 Matchmaking Engine Scaling Factors</div>
            <div class="form-grid">
                <div class="form-group"><label>Score Base Gain (Equal Match Win)</label><input type="number" value="${mm.score_base_gain || 20}" oninput="target.pvp_arena.matchmaking_settings.score_base_gain = parseInt(this.value) || 20;"></div>
                <div class="form-group"><label>Score Minimum Gain Floor (Low-Rank Win)</label><input type="number" value="${mm.score_min_gain || 5}" oninput="target.pvp_arena.matchmaking_settings.score_min_gain = parseInt(this.value) || 5;"></div>
                <div class="form-group"><label>Score Base Loss (Equal Match Loss)</label><input type="number" value="${mm.score_base_loss || 15}" oninput="target.pvp_arena.matchmaking_settings.score_base_loss = parseInt(this.value) || 15;"></div>
                <div class="form-group"><label>AI Bot Injection Search Threshold (Seconds)</label><input type="number" value="${mm.bot_matching_threshold_seconds || 15}" oninput="target.pvp_arena.matchmaking_settings.bot_matching_threshold_seconds = parseInt(this.value) || 15;"></div>
                <div class="form-group"><label>Opponent Roster Selection List Size</label><input type="number" value="${mm.opponent_pool_size || 3}" oninput="target.pvp_arena.matchmaking_settings.opponent_pool_size = parseInt(this.value) || 3;"></div>
            </div>
        </div>
    `;
}

function renderArenaTierForm(tierKey) {
    renderArenaSidebarList();
    const ed = document.getElementById('arena-editor');
    if (!ed || !tierKey) return;

    const tier = target.pvp_arena.tiers[tierKey];
    if (!tier.title_loc) tier.title_loc = { en: "", ru: "" };
    if (!tier.daily_payout) tier.daily_payout = { resources: {} };
    if (!tier.season_payout) tier.season_payout = { resources: {} };

    ed.innerHTML = `
        <div class="card-header-flex">
            <span class="card-title">Edit Ladder Rank Tier Specification: ${tierKey}</span>
            <button class="danger" onclick="delete target.pvp_arena.tiers['${tierKey}']; stateArenaTierKey = null; document.getElementById('arena-editor').innerHTML = ''; renderArenaSidebarList();">Delete Tier</button>
        </div>
        
        <div class="form-grid">
            <div class="form-group"><label>Ladder Rank ID Key</label><input type="text" value="${tierKey}" onchange="renameArenaTierKey('${tierKey}', this.value)" style="font-family:monospace;"></div>
            <div class="form-group"><label>Minimum Score Entry Point (min_score)</label><input type="number" value="${tier.min_score || 0}" oninput="target.pvp_arena.tiers['${tierKey}'].min_score = parseInt(this.value) || 0; renderArenaSidebarList();"></div>
            <div class="form-group full-width"><label>Rank Asset Badge Texture Path</label><input type="text" value="${tier.icon || ''}" oninput="target.pvp_arena.tiers['${tierKey}'].icon = this.value;"></div>
        </div>

        <div class="form-grid" style="margin-top:12px;">
            <div class="form-group"><label>Rank Title (Localization EN)</label><input type="text" value="${tier.title_loc.en || ''}" oninput="target.pvp_arena.tiers['${tierKey}'].title_loc.en = this.value;"></div>
            <div class="form-group"><label>Rank Title (Localization RU)</label><input type="text" value="${tier.title_loc.ru || ''}" oninput="target.pvp_arena.tiers['${tierKey}'].title_loc.ru = this.value;"></div>
        </div>

        <!-- КАРТЫ НАГРАД ЧЕРЕЗ JSON-ТЕМПЛЕЙТЫ -->
        <div class="sub-section" style="border-color: var(--accent-blue); margin-top:15px;">
            <span class="sub-section-title" style="color:var(--accent-blue);">⏰ Daily Standings Settlement Payout Map</span>
            <textarea style="width:100%; height:90px; font-family:monospace; font-size:11px; margin-top:8px;" oninput="try{target.pvp_arena.tiers['${tierKey}'].daily_payout = JSON.parse(this.value); this.style.borderColor='var(--border-color)';}catch(e){this.style.borderColor='var(--accent-red)';}">${JSON.stringify(tier.daily_payout, null, 4)}</textarea>
            <p style="font-size:10px; color:var(--text-muted); margin-top:3px;">💡 Example format: {"resources": {"gold": 1000, "arena_coin": 50}, "items": []}</p>
        </div>

        <div class="sub-section" style="border-color: var(--accent-pink); margin-top:15px;">
            <span class="sub-section-title" style="color:var(--accent-pink);">🏁 End of Season Settlement Gross Payout Map</span>
            <textarea style="width:100%; height:110px; font-family:monospace; font-size:11px; margin-top:8px;" oninput="try{target.pvp_arena.tiers['${tierKey}'].season_payout = JSON.parse(this.value); this.style.borderColor='var(--border-color)';}catch(e){this.style.borderColor='var(--accent-red)';}">${JSON.stringify(tier.season_payout, null, 4)}</textarea>
            <p style="font-size:10px; color:var(--text-muted); margin-top:3px;">💡 Example format: {"resources": {"diamond": 500}, "items": [{"itemId": "scroll_epic", "amount": 3}]}</p>
        </div>
    `;
}

function renameArenaTierKey(oldKey, newKey) {
    if (!newKey || oldKey === newKey || target.pvp_arena.tiers[newKey]) {
        renderArenaSidebarList();
        renderArenaTierForm(oldKey);
        return;
    }
    target.pvp_arena.tiers[newKey] = target.pvp_arena.tiers[oldKey];
    delete target.pvp_arena.tiers[oldKey];
    stateArenaTierKey = newKey;
    renderArenaSidebarList();
    renderArenaTierForm(newKey);
}

function renderArenaShopAndBuffsForm() {
    renderArenaSidebarList();
    const ed = document.getElementById('arena-editor');
    if (!ed) return;

    const shop = target.pvp_arena.shop || { slots: [] };
    const buffs = target.pvp_arena.season_buffs || { affected_classes: {}, banned_heroes: [] };
    if (!shop.slots) shop.slots = [];
    if (!buffs.affected_classes) buffs.affected_classes = {};
    if (!buffs.banned_heroes) buffs.banned_heroes = [];

    // 1. Сборка аккордеона торговых слотов Arena Shop
    let slotsListHtml = shop.slots.map((slot, sIdx) => {
        const isEditing = currentArenaSlotIdx === sIdx;
        let slotEditorHtml = '';

        if (isEditing) {
            const itemOptions = Object.keys(target.catalog?.items || {}).map(iKey =>
                `<option value="${iKey}" ${slot.itemId === iKey ? 'selected' : ''}>📦 Item: ${iKey}</option>`
            ).join('');

            slotEditorHtml = `
                <div class="sub-section" style="border-left: 2px solid var(--accent-pink); padding:12px; background: rgba(0,0,0,0.2); margin-top:10px; cursor:default;" onclick="event.stopPropagation();">
                    <div class="form-grid" style="gap: 8px;">
                        <div class="form-group">
                            <label>Slot Unique ID</label>
                            <input type="text" value="${slot.slotId || ''}" oninput="target.pvp_arena.shop.slots[${sIdx}].slotId = this.value;">
                        </div>
                        <div class="form-group">
                            <label>Target Catalog Item</label>
                            <select onchange="target.pvp_arena.shop.slots[${sIdx}].itemId = this.value;">
                                <option value="">-- Select Item --</option>
                                ${itemOptions}
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Output Stack Count (amount)</label>
                            <input type="number" value="${slot.amount || 1}" oninput="target.pvp_arena.shop.slots[${sIdx}].amount = parseInt(this.value) || 1;">
                        </div>
                        <div class="form-group">
                            <label>Purchase Price Token Value</label>
                            <input type="number" value="${slot.cost || 0}" oninput="target.pvp_arena.shop.slots[${sIdx}].cost = parseInt(this.value) || 0;">
                        </div>
                        <div class="form-group">
                            <label>Buy Dynamic Account Limit</label>
                            <input type="number" value="${slot.buy_limit || 1}" oninput="target.pvp_arena.shop.slots[${sIdx}].buy_limit = parseInt(this.value) || 1;">
                        </div>
                    </div>
                </div>
            `;
        }

        return `
            <div style="margin-bottom: 8px; background: ${isEditing ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.01)'}; padding: 10px; border-radius: 6px; border: 1px solid ${isEditing ? 'var(--accent-pink)' : 'var(--border-color)'};">
                <div class="element-row" style="margin:0; border:none; padding:0; background:transparent;">
                    <div class="element-info" style="cursor:pointer; width: 100%; display: flex; align-items: center; gap: 10px;" onclick="currentArenaSlotIdx = (currentArenaSlotIdx === ${sIdx} ? null : ${sIdx}); renderArenaShopAndBuffsForm();">
                        <span class="badge" style="background:${isEditing ? 'var(--accent-pink)' : 'var(--bg-main)'}; font-family:monospace; min-width: 80px; text-align: center;">
                            ${isEditing ? '🔽 ' : '▶️ '} ${slot.slotId || 'unnamed_slot'}
                        </span>
                        <span style="font-size:11px; color:var(--text-muted);">item: <b>${slot.itemId || 'none'}</b></span>
                        <span style="font-size:11px; color:var(--text-muted);">cost: <b>${slot.cost || 0} tokens</b></span>
                    </div>
                    <div class="element-actions">
                        <button class="btn-sm btn-danger" onclick="event.stopPropagation(); target.pvp_arena.shop.slots.splice(${sIdx}, 1); currentArenaSlotIdx = null; renderArenaShopAndBuffsForm();">Delete</button>
                    </div>
                </div>
                ${slotEditorHtml}
            </div>
        `;
    }).join('');

    // 2. Сборка полей для мета-модификаторов классов (affected_classes)
    const allowedClasses = Object.keys(target.catalog?.classes || {});
    let classModifiersHtml = allowedClasses.map(cKey => {
        if (!buffs.affected_classes[cKey]) {
            buffs.affected_classes[cKey] = { hp_scalar: 1.0, defense_scalar: 1.0, atk_scalar: 1.0 };
        }
        const bc = buffs.affected_classes[cKey];
        return `
            <div style="background:rgba(255,255,255,0.01); padding:10px; border:1px solid rgba(255,255,255,0.05); border-radius:6px; margin-bottom:8px;">
                <div style="font-size:11px; font-weight:600; color:var(--accent-blue); margin-bottom:6px; text-transform:uppercase;">Class: ${cKey}</div>
                <div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap:8px;">
                    <div class="form-group" style="margin:0;"><label style="font-size:10px;">HP Scalar</label><input type="number" step="0.01" value="${bc.hp_scalar !== undefined ? bc.hp_scalar : 1.0}" oninput="target.pvp_arena.season_buffs.affected_classes['${cKey}'].hp_scalar = parseFloat(this.value) || 1.0;"></div>
                    <div class="form-group" style="margin:0;"><label style="font-size:10px;">DEF Scalar</label><input type="number" step="0.01" value="${bc.defense_scalar !== undefined ? bc.defense_scalar : 1.0}" oninput="target.pvp_arena.season_buffs.affected_classes['${cKey}'].defense_scalar = parseFloat(this.value) || 1.0;"></div>
                    <div class="form-group" style="margin:0;"><label style="font-size:10px;">ATK Scalar</label><input type="number" step="0.01" value="${bc.atk_scalar !== undefined ? bc.atk_scalar : 1.0}" oninput="target.pvp_arena.season_buffs.affected_classes['${cKey}'].atk_scalar = parseFloat(this.value) || 1.0;"></div>
                </div>
            </div>
        `;
    }).join('');

    // 3. Управление заблокированными героями (banned_heroes) через интерактивные баджи
    const bannedTagsHtml = buffs.banned_heroes.map((hKey, bIdx) => `
        <span class="badge" style="display:inline-flex; align-items:center; gap:5px; margin:2px; padding:4px 8px; background:#ff3333; font-family:monospace; font-size:11px;">
            ⛔ ${hKey}
            <b style="cursor:pointer; color:#fff;" onclick="target.pvp_arena.season_buffs.banned_heroes.splice(${bIdx}, 1); renderArenaShopAndBuffsForm();">×</b>
        </span>
    `).join('');

    ed.innerHTML = `
        <div class="card-header-flex">
            <span class="card-title">Season Gladiator Market & Meta Balance Buffs</span>
        </div>

        <!-- МЕТА-БАФФЫ КЛАССОВ И БАНЫ -->
        <div class="sub-section" style="border-color: var(--accent-blue);">
            <div class="sub-section-title" style="color:var(--accent-blue);">🔥 Active Season Meta Buff Scalars</div>
            <div class="form-grid" style="margin-bottom:12px;">
                <div class="form-group full-width"><label>Active Season Unique ID String</label><input type="text" value="${buffs.active_season_id || ''}" oninput="target.pvp_arena.season_buffs.active_season_id = this.value;"></div>
            </div>
            <div>${classModifiersHtml}</div>

            <div style="font-size:11px; font-weight:600; color:var(--text-muted); margin-top:15px; margin-bottom:6px; text-transform:uppercase;">Season Banned Characters Roster</div>
            <div style="display:flex; flex-wrap:wrap; margin-bottom:8px;">${bannedTagsHtml || '<span style="font-size:11px; color:var(--text-muted); padding:2px;">No heroes banned in this season</span>'}</div>
            <div style="display:flex; gap:6px;">
                <select id="add-arena-ban-hero" style="font-size:12px; padding:4px;">
                    <option value="">-- Ban Character from Arena --</option>
                    ${Object.keys(target.catalog?.heroes || {}).filter(hk => !buffs.banned_heroes.includes(hk)).map(hk => `<option value="${hk}">${hk}</option>`).join('')}
                </select>
                <button class="primary" style="padding:4px 10px; font-size:11px;" onclick="const val=document.getElementById('add-arena-ban-hero').value; if(val){ target.pvp_arena.season_buffs.banned_heroes.push(val); renderArenaShopAndBuffsForm(); }">+ Add Ban</button>
            </div>
        </div>

    
        <div class="sub-section" style="border-color: var(--accent-pink); margin-top:20px;">
            <div class="form-grid" style="margin-bottom:12px;">
                <div class="form-group"><label>Market Title (Localization EN)</label><input type="text" value="${shop.title_loc?.en || ''}" oninput="target.pvp_arena.shop.title_loc.en = this.value;"></div>
                <div class="form-group"><label>Market Title (Localization RU)</label><input type="text" value="${shop.title_loc?.ru || ''}" oninput="target.pvp_arena.shop.title_loc.ru = this.value;"></div>
                <div class="form-group full-width"><label>Gladiator Currency Payout Resource (resourceId)</label><input type="text" value="${shop.currency_resource_id || ''}" oninput="target.pvp_arena.shop.currency_resource_id = this.value;"></div>
            </div>
            <div class="card-header-flex" style="border:none; padding:0; margin-bottom:12px;">
                <span class="sub-section-title" style="margin:0; color:var(--accent-pink);">🛍️ Gladiator Shop Frontcase Item Slots</span>
                <button class="primary" style="padding: 2px 8px; font-size: 11px;" onclick="target.pvp_arena.shop.slots.push({slotId:'arena_slot_'+Date.now().toString().slice(-4), itemId:'', amount:1, cost:100, buy_limit:1}); renderArenaShopAndBuffsForm();">+ Add Item Node</button>
            </div>
            <div style="margin-top: 10px;">${slotsListHtml || '<p style="font-size:11px; color:var(--text-muted); padding:5px; margin:0;">Arena store has no sellable display slots</p>'}</div>
        </div>
    `;
}


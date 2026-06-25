// scripts/admin/bounty_board.js — ЧАСТЬ 1 ИЗ 2
let currentBountyMissionKey = null; // ID открытого аккордеона шаблона миссии

function renderBountyBoardSidebar() {
    const list = document.getElementById('bounty-list');
    if (!list) return;

    // Инициализируем корневую структуру доски, если её нет в JSON
    if (!target.bounty_board) {
        target.bounty_board = {
            max_daily_dispatched_missions: 8,
            refresh_cost: { resource: "diamond", amount: 10 },
            mission_generation_rates: { "R": 60, "SR": 30, "SSR": 9, "UR": 1 },
            mission_pool: {}
        };
    }

    // Доска — синглтон, кнопка "+ Add" в сайдбаре скрывается, добавляем таски внутри формы
    const sidebarHeaderBtn = document.querySelector('#view-bounty .crud-sidebar-header button');
    if (sidebarHeaderBtn) sidebarHeaderBtn.style.display = 'none';

    list.innerHTML = `
        <li class="crud-list-item active" onclick="renderBountyBoardForm()">
            <div style="display:flex; align-items:center; gap:8px;">
                <span>🦅</span>
                <span>Bounty Board Control</span>
            </div>
        </li>
    `;
    renderBountyBoardForm();
}

function renderBountyBoardForm() {
    const ed = document.getElementById('bounty-editor');
    if (!ed) return;

    const bb = target.bounty_board;
    if (!bb.refresh_cost) bb.refresh_cost = { resource: "diamond", amount: 10 };
    if (!bb.mission_generation_rates) bb.mission_generation_rates = { "R": 60, "SR": 30, "SSR": 9, "UR": 1 };
    if (!bb.mission_pool) bb.mission_pool = {};

    // Выпадающий селектор валют для стоимости платного рефреша списка экспедиций
    const resourceOptions = Object.keys(target.mechanics?.resources || {}).map(rKey =>
        `<option value="${rKey}" ${bb.refresh_cost.resource === rKey ? 'selected' : ''}>🔮 ${rKey}</option>`
    ).join('');

    // Генерируем HTML для процентной матрицы шансов редкостей миссий
    const rarities = ["R", "SR", "SSR", "UR"];
    let ratesHtml = rarities.map(r => {
        const val = bb.mission_generation_rates[r] !== undefined ? bb.mission_generation_rates[r] : 0;
        return `
            <div class="form-group" style="background:rgba(255,255,255,0.01); padding:6px; border:1px solid rgba(255,255,255,0.05); border-radius:4px; margin:0;">
                <label style="color:var(--accent-blue); font-weight:600; font-size:12px;">Tier ${r} Drop Rate (%)</label>
                <input type="number" value="${val}" oninput="target.bounty_board.mission_generation_rates['${r}'] = parseInt(this.value) || 0;">
            </div>
        `;
    }).join('');

    ed.innerHTML = `
        <div class="card-header-flex">
            <span class="card-title">Edit Passive Bounty Expeditions Core Framework</span>
        </div>
        
        <div class="form-grid">
            <div class="form-group">
                <label>Max Daily Dispatched Missions Count</label>
                <input type="number" value="${bb.max_daily_dispatched_missions || 8}" oninput="target.bounty_board.max_daily_dispatched_missions = parseInt(this.value) || 8;">
            </div>
            <div class="form-group">
                <label>List Reroll Cost Currency</label>
                <select onchange="target.bounty_board.refresh_cost.resource = this.value;">
                    <option value="">-- Select Currency --</option>
                    ${resourceOptions}
                </select>
            </div>
            <div class="form-group full-width">
                <label>List Reroll Price Value</label>
                <input type="number" value="${bb.refresh_cost.amount || 10}" oninput="target.bounty_board.refresh_cost.amount = parseInt(this.value) || 10;">
            </div>
        </div>

        <div style="font-size:11px; font-weight:600; color:var(--text-muted); margin-top:20px; text-transform:uppercase; letter-spacing:0.5px;">🎲 Mission Rarity Generation Probability Weights (Sum = 100%)</div>
        <div class="form-grid" style="margin-top:8px; gap:8px;">
            ${ratesHtml}
        </div>

        <!-- АНКОР ДЛЯ ПУЛА ШАБЛОНОВ МИССИЙ (МЫ ИНЖЕКТИРУЕМ ЕГО ИЗ ЧАСТИ 2) -->
        <div id="bounty-mission-pool-anchor"></div>
    `;

    if (typeof renderBountyMissionsPool === 'function') {
        renderBountyMissionsPool(bb);
    }
}

// scripts/admin/bounty_board.js — ЧАСТЬ 2 ИЗ 2 (ФИНАЛ МОДУЛЯ)
function renderBountyMissionsPool(bb) {
    const anchor = document.getElementById('bounty-mission-pool-anchor');
    if (!anchor) return;

    const pool = bb.mission_pool || {};

    // Выпадающие списки классов и элементов из механик для условий отправки отряда
    const classOptionsRaw = Object.keys(target.mechanics?.item_types || target.catalog?.classes || {}).map(c => `<option value="${c}">${c.toUpperCase()}</option>`).join('');
    const elementOptionsRaw = Object.keys(target.catalog?.hero_elements || {}).map(e => `<option value="${e}">${e.toUpperCase()}</option>`).join('');

    let missionsHtml = Object.keys(pool).map(mKey => {
        const mission = pool[mKey];
        const isEditing = currentBountyMissionKey === mKey;
        let missionEditorHtml = '';

        if (isEditing) {
            if (!mission.requirements) mission.requirements = { min_hero_level: 1, required_class_id: "", required_element_id: "", slots_count: 1 };
            if (!mission.rewards) mission.rewards = { resources: {}, items: [] };

            missionEditorHtml = `
                <div class="sub-section" style="border-left: 2px solid var(--accent-pink); padding:12px; background: rgba(0,0,0,0.2); margin-top:10px; cursor:default;" onclick="event.stopPropagation();">
                    <div class="form-grid" style="gap: 8px;">
                        <div class="form-group">
                            <label>Mission ID Key (Unique)</label>
                            <input type="text" value="${mKey}" onchange="renameBountyMissionKey('${mKey}', this.value);">
                        </div>
                        <div class="form-group">
                            <label>Mission Quality Grade Tier</label>
                            <select onchange="target.bounty_board.mission_pool['${mKey}'].rarity = this.value; renderBountyBoardForm();">
                                <option value="R" ${mission.rarity === 'R' ? 'selected' : ''}>R (Rare)</option>
                                <option value="SR" ${mission.rarity === 'SR' ? 'selected' : ''}>SR (Epic)</option>
                                <option value="SSR" ${mission.rarity === 'SSR' ? 'selected' : ''}>SSR (Legendary)</option>
                                <option value="UR" ${mission.rarity === 'UR' ? 'selected' : ''}>UR (Mythic)</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Duration Interval (milliseconds)</label>
                            <input type="number" value="${mission.duration_ms || 14400000}" oninput="target.bounty_board.mission_pool['${mKey}'].duration_ms = parseInt(this.value) || 14400000;">
                        </div>
                        <div class="form-group">
                            <label>Required Hero Minimum Level</label>
                            <input type="number" value="${mission.requirements.min_hero_level || 1}" oninput="target.bounty_board.mission_pool['${mKey}'].requirements.min_hero_level = parseInt(this.value) || 1;">
                        </div>
                        <div class="form-group">
                            <label>Required Dispatch Hero Class</label>
                            <select onchange="target.bounty_board.mission_pool['${mKey}'].requirements.required_class_id = this.value;">
                                <option value="">-- No Class Constraint --</option>
                                ${Object.keys(target.catalog?.classes || {}).map(c => `<option value="${c}" ${mission.requirements.required_class_id === c ? 'selected' : ''}>${c.toUpperCase()}</option>`).join('')}
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Required Dispatch Hero Element</label>
                            <select onchange="target.bounty_board.mission_pool['${mKey}'].requirements.required_element_id = this.value;">
                                <option value="">-- No Element Constraint --</option>
                                ${Object.keys(target.catalog?.hero_elements || {}).map(e => `<option value="${e}" ${mission.requirements.required_element_id === e ? 'selected' : ''}>${e.toUpperCase()}</option>`).join('')}
                            </select>
                        </div>
                        <div class="form-group full-width">
                            <label>Total Dispatch Squad Slots Count (slots_count)</label>
                            <input type="number" value="${mission.requirements.slots_count || 1}" oninput="target.bounty_board.mission_pool['${mKey}'].requirements.slots_count = parseInt(this.value) || 1;">
                        </div>
                        <div class="form-group full-width">
                            <label>Mission Clear Loot Reward Payout Map (Direct JSON Editor)</label>
                            <textarea style="width:100%; height:75px; font-family:monospace; font-size:11px; margin-top:4px;" oninput="try{target.bounty_board.mission_pool['${mKey}'].rewards = JSON.parse(this.value); this.style.borderColor='var(--border-color)';}catch(e){this.style.borderColor='var(--accent-red)';}">${JSON.stringify(mission.rewards, null, 4)}</textarea>
                            <p style="font-size:10px; color:var(--text-muted); margin-top:2px;">💡 Schema: {"resources": {"diamond": 50}, "items": [{"itemId": "scroll_epic", "amount": 1}]}</p>
                        </div>
                    </div>
                </div>
            `;
        }

        const rarityColors = { "R": "#4caf50", "SR": "var(--accent-blue)", "SSR": "var(--accent-pink)", "UR": "#ffeb3b" };
        const badgeColor = rarityColors[mission.rarity || "R"];

        return `
            <div style="margin-bottom: 8px; background: ${isEditing ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.01)'}; padding: 10px; border-radius: 6px; border: 1px solid ${isEditing ? 'var(--accent-pink)' : 'var(--border-color)'};">
                <div class="element-row" style="margin:0; border:none; padding:0; background:transparent;">
                    <div class="element-info" style="cursor:pointer; width: 100%; display: flex; align-items: center; gap: 10px;" onclick="currentBountyMissionKey = (currentBountyMissionKey === '${mKey}' ? null : '${mKey}'); renderBountyBoardForm();">
                        <span class="badge" style="background:${badgeColor}; color:${mission.rarity==='UR'?'#000':'#fff'}; font-family:monospace; min-width: 60px; text-align: center;">
                            ${mission.rarity || 'R'}
                        </span>
                        <span style="font-family:monospace; font-size:13px;">${mKey}</span>
                        <span style="font-size:11px; color:var(--text-muted);">time: <b>${((mission.duration_ms || 14400000)/3600000).toFixed(0)}h</b></span>
                    </div>
                    <div class="element-actions">
                        <button class="btn-sm btn-danger" onclick="event.stopPropagation(); delete target.bounty_board.mission_pool['${mKey}']; currentBountyMissionKey = null; renderBountyBoardForm();">Delete</button>
                    </div>
                </div>
                ${missionEditorHtml}
            </div>
        `;
    }).join('');

    anchor.outerHTML = `
        <div class="sub-section" style="border-color: var(--accent-pink); margin-top:20px;">
            <div class="card-header-flex" style="border:none; padding:0; margin-bottom:12px;">
                <span class="sub-section-title" style="margin:0; color:var(--accent-pink);">📋 Expedition Dispatch Blueprint Missions Pool</span>
                <button class="primary" style="padding: 2px 8px; font-size: 11px;" onclick="const nKey='bounty_mission_'+Date.now().toString().slice(-3); target.bounty_board.mission_pool[nKey]={rarity:'R',duration_ms:14400000,requirements:{min_hero_level:1,slots_count:1},rewards:{resources:{gold:1000},items:[]}}; currentBountyMissionKey=nKey; renderBountyBoardForm();">+ Add Contract Template</button>
            </div>
            <div style="margin-top: 10px;">${missionsHtml || '<p style="font-size:11px; color:var(--text-muted); padding:5px; margin:0;">Mission template pool is empty.</p>'}</div>
        </div>
    `;
}

function renameBountyMissionKey(oldKey, newKey) {
    if (!newKey || oldKey === newKey || target.bounty_board.mission_pool[newKey]) {
        renderBountyBoardForm();
        return;
    }
    target.bounty_board.mission_pool[newKey] = target.bounty_board.mission_pool[oldKey];
    delete target.bounty_board.mission_pool[oldKey];
    currentBountyMissionKey = newKey;
    renderBountyBoardForm();
}

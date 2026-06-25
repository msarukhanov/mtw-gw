let currentMechSection = 'team';
let stateMechKey = null;

function switchMechTab(sectionId, evt) {
    currentMechSection = sectionId;
    stateMechKey = null;

    if (evt && evt.target && evt.target.parentElement) {
        evt.target.parentElement.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        evt.target.classList.add('active');
    }

    const titleMap = {
        'team': 'Team Prototype Layout',
        'level_costs': 'Hero Level Costs Table',
        'personal_item_costs': 'Signature Weapon Costs',
        'star_recipes': 'Star Ascension Recipes',
        'idle_rules': 'AFK Economy Rules',
        'combat_formulas': 'Combat Math Engine'
    };

    document.getElementById('mech-sidebar-title').innerText = titleMap[sectionId];
    document.getElementById('mech-editor').innerHTML = '';

    // Так как на экране механик теперь ВСЕ разделы — это фиксированные синглтоны баланса,
    // мы находим кнопку "+ Add" в сайдбаре механик и скрываем её, чтобы она не смущала админа.
    const addBtn = document.querySelector('#view-mechanics .crud-sidebar-header button');
    if (addBtn) {
        addBtn.style.display = 'none';
    }

    renderMechList();
}

function getMechDataTarget() {
    if (currentMechSection === 'team') return target.mechanics.prototypes.team;
    if (currentMechSection === 'level_costs') return target.mechanics.level_costs;
    if (currentMechSection === 'personal_item_costs') return target.mechanics.personal_item_costs;
    if (currentMechSection === 'star_recipes') return target.mechanics.general_star_recipes;
    if (currentMechSection === 'idle_rules') return target.mechanics.idle;
    if (currentMechSection === 'combat_formulas') return target.mechanics.combat_formulas;
    return null;
}

function renderMechList() {
    const list = document.getElementById('mech-list');
    if (!list) return;

    const titleMap = {
        'team': '👥 Team Global Configuration',
        'level_costs': '📈 Hero Level Costs Table',
        'personal_item_costs': '🔮 Personal Item Upgrade Costs',
        'star_recipes': '⭐ Star Recipes (Ascension)',
        'idle_rules': '⏳ Idle Loot Generation Rates',
        'combat_formulas': '🧮 Combat Mathematical Formulas'
    };

    list.innerHTML = `
        <li class="crud-list-item active" onclick="selectMechItem('global_${currentMechSection}')">
            <span>${titleMap[currentMechSection]}</span>
        </li>
    `;
    selectMechItem(`global_${currentMechSection}`);
}

function renderTeamForm() {
    const teamData = target.mechanics.prototypes.team;
    let factionBonusesHtml = Object.keys(teamData.bonuses?.faction || {}).map(countKey => {
        const bonus = teamData.bonuses.faction[countKey];
        return `
            <div style="display:grid; grid-template-columns: 80px 1fr 1fr; gap:10px; margin-bottom:6px; align-items:center;">
                <span class="badge">${countKey} Heroes</span>
                <input type="text" value="${bonus.hp || ''}" oninput="target.mechanics.prototypes.team.bonuses.faction['${countKey}'].hp = this.value" placeholder="HP %">
                <input type="text" value="${bonus.atk || ''}" oninput="target.mechanics.prototypes.team.bonuses.faction['${countKey}'].atk = this.value" placeholder="ATK %">
            </div>
        `;
    }).join('');

    return `
        <div class="form-grid" style="margin-top:15px;">
            <div class="form-group"><label>Maximum Battle Field Size</label><input type="number" value="${teamData.size || 5}" oninput="target.mechanics.prototypes.team.size = parseInt(this.value)"></div>
            <div class="form-group"><label>Additional Guardian Beasts Count</label><input type="number" value="${teamData.additional?.beasts || 0}" oninput="target.mechanics.prototypes.team.additional.beasts = parseInt(this.value)"></div>
            <div class="form-group full-width"><label>Formation Grid Configuration</label><input type="text" value="${JSON.stringify(teamData.position || [])}" oninput="try{target.mechanics.prototypes.team.position = JSON.parse(this.value)}catch(e){}"></div>
        </div>
        <div class="sub-section">
            <span class="sub-section-title">Synergy Faction Alliance Buffs</span>
            <div style="margin-top:10px;">${factionBonusesHtml}</div>
        </div>
    `;
}

function renderCombatForm() {
    const formulas = target.mechanics.combat_formulas;
    return `
        <div class="form-grid" style="margin-top:15px;">
            <div class="form-group full-width"><label>Damage Calculation Engine Formula (Variables: ATK, ARMOR)</label><input type="text" value="${formulas.damage_formula || ''}" oninput="target.mechanics.combat_formulas.damage_formula = this.value" style="font-family:monospace;"></div>
            <div class="form-group full-width"><label>Critical Hit Chance Formula</label><input type="text" value="${formulas.crit_chance_formula || ''}" oninput="target.mechanics.combat_formulas.crit_chance_formula = this.value" style="font-family:monospace;"></div>
            <div class="form-group"><label>Critical Damage Scalar Multiplier</label><input type="text" value="${formulas.crit_multiplier || '2.0'}" oninput="target.mechanics.combat_formulas.crit_multiplier = this.value"></div>
        </div>
    `;
}

function renderIdleForm() {
    const idle = target.mechanics.idle.main_loot_claim_at;
    return `
        <div class="form-grid" style="margin-top:15px;">
            <div class="form-group"><label>Gold / Hour Rate</label><input type="number" value="${idle.rate?.gold || 0}" oninput="target.mechanics.idle.main_loot_claim_at.rate.gold = parseInt(this.value)"></div>
            <div class="form-group"><label>Exp / Hour Rate</label><input type="number" value="${idle.rate?.exp || 0}" oninput="target.mechanics.idle.main_loot_claim_at.rate.exp = parseInt(this.value)"></div>
            <div class="form-group"><label>Max Idle Accumulation Capacity (Hours)</label><input type="number" value="${idle.maxHours || 12}" oninput="target.mechanics.idle.main_loot_claim_at.maxHours = parseInt(this.value)"></div>
        </div>
    `;
}

function renderJSONTableForm(nodePath, labelKey) {
    const data = target.mechanics[nodePath];
    return `
        <div class="sub-section" style="margin-top:15px;">
            <span class="sub-section-title">${labelKey} (Direct Object Map Inspector)</span>
            <textarea style="width:100%; height:250px; font-family:monospace; margin-top:10px;" oninput="try{target.mechanics['${nodePath}'] = JSON.parse(this.value); this.style.borderColor='var(--border-color)';}catch(e){this.style.borderColor='var(--accent-red)';}">${JSON.stringify(data, null, 4)}</textarea>
            <p style="font-size:11px; color:var(--text-muted); margin-top:5px;">💡 Edit values as strict JSON. Red border means invalid syntax.</p>
        </div>
    `;
}

function selectMechItem(key) {
    stateMechKey = key;
    const ed = document.getElementById('mech-editor');
    if (!ed) return;

    const type = key.replace('global_', '');
    ed.innerHTML = `
        <div class="card-header-flex">
            <span class="card-title">System Mechanics Config Sandbox</span>
        </div>
    `;

    if (type === 'team') ed.innerHTML += renderTeamForm();
    else if (type === 'combat_formulas') ed.innerHTML += renderCombatForm();
    else if (type === 'idle_rules') ed.innerHTML += renderIdleForm();
    else if (type === 'level_costs') ed.innerHTML += renderJSONTableForm('level_costs', 'Hero Level Up Cost Scales Map');
    else if (type === 'personal_item_costs') ed.innerHTML += renderJSONTableForm('personal_item_costs', 'Signature Weapon Materials Matrix');
    else if (type === 'star_recipes') ed.innerHTML += renderJSONTableForm('general_star_recipes', 'Gacha Ascension Star Recipes Matrix');
}

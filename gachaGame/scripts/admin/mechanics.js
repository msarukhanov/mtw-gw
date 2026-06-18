let currentMechSection = 'resources';
let stateMechKey = null;

function renderMechList() {
    const list = document.getElementById('mech-list');
    const data = getMechDataTarget();
    if (!data) return;

    if (currentMechSection === 'team') {
        list.innerHTML = `
            <li class="crud-list-item active" onclick="selectMechItem('global_team_setup')">
                <span>👥 Team Global Configuration</span>
            </li>
        `;
        selectMechItem('global_team_setup');
        return;
    }

    list.innerHTML = Object.keys(data).map(key => {
        const item = data[key];
        const icon = (item && typeof item === 'object' && item.icon) ? item.icon : '⚙️';
        return `
            <li class="crud-list-item ${stateMechKey === key ? 'active' : ''}" onclick="selectMechItem('${key}')">
                <span>${icon} ${key}</span>
            </li>
        `;
    }).join('');
}

function switchMechTab(sectionId, evt) {
    currentMechSection = sectionId;
    stateMechKey = null;

    if (evt && evt.target && evt.target.parentElement) {
        const parent = evt.target.parentElement;
        parent.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        evt.target.classList.add('active');
    }

    const titleMap = {
        'resources': 'Resources', 'factions': 'Factions', 'classes': 'Classes',
        'skills': 'Skills', 'elements': 'Hero Elements', 'effects': 'Combat Effects',
        'stats': 'Character Stats', 'rarities': 'Rarity Systems', 'team': 'Team Prototype Layout'
    };
    document.getElementById('mech-sidebar-title').innerText = titleMap[sectionId];
    document.getElementById('mech-editor').innerHTML = '';
    renderMechList();
}

function getMechDataTarget() {
    if (currentMechSection === 'resources') return target.mechanics.resources;
    if (currentMechSection === 'factions') return target.catalog.factions;
    if (currentMechSection === 'classes') return target.catalog.classes;
    if (currentMechSection === 'skills') return target.catalog.skills;
    if (currentMechSection === 'elements') return target.catalog.hero_elements;
    if (currentMechSection === 'effects') return target.mechanics.effects;
    if (currentMechSection === 'stats') return target.mechanics.stats;
    if (currentMechSection === 'rarities') return target.mechanics.rarities;
    if (currentMechSection === 'team') return target.mechanics.prototypes.team;
    return null;
}

function createNewMechItem() {
    const data = getMechDataTarget();
    if (!data) return;

    if (currentMechSection === 'team') {
        alert("Team Setup is a global singleton config. Modification should happen inside the editor view.");
        return;
    }

    const basePrefix = `new_${currentMechSection}_`;
    let count = Object.keys(data).length;
    let newKey = `${basePrefix}${count}`;

    while (data[newKey]) {
        count++;
        newKey = `${basePrefix}${count}`;
    }

    if (currentMechSection === 'resources' || currentMechSection === 'factions' || currentMechSection === 'classes' || currentMechSection === 'skills') {
        data[newKey] = { icon: "⚙️", title_loc: JSON.parse(JSON.stringify(BASE_LANGUAGES)), desc_loc: JSON.parse(JSON.stringify(BASE_LANGUAGES)) };
    } else if (currentMechSection === 'elements') {
        data[newKey] = { title_loc: JSON.parse(JSON.stringify(BASE_LANGUAGES)), icon: "❄️", color: "#ffffff" };
    } else if (currentMechSection === 'effects') {
        data[newKey] = { period: 0, periodMax: 0, is_dispelable: true, icon: "🧪", stats: {}, action: {}, polarity: "buff", type: "stat_mod", desc_loc_key: "" };
    } else if (currentMechSection === 'stats') {
        data[newKey] = { name_loc_key: newKey, value: 1, order: count + 1, icon: "📊", display: "int", rating_weight: 1.0 };
    } else if (currentMechSection === 'rarities') {
        data[newKey] = ["R", "SR", "SSR"];
    }

    stateMechKey = newKey;
    renderMechList();
    selectMechItem(newKey);
}

function deleteMechItem(key) {
    const data = getMechDataTarget();
    if (!data) return;
    if (!confirm(`Are you sure you want to delete this item: ${key}?`)) return;

    let cascadeType = currentMechSection;
    if (currentMechSection === 'factions') cascadeType = 'faction';
    if (currentMechSection === 'classes') cascadeType = 'class';
    if (currentMechSection === 'skills') cascadeType = 'skill';
    if (currentMechSection === 'elements') cascadeType = 'element';
    if (currentMechSection === 'effects') cascadeType = 'effect';

    cascadeDeleteKey(cascadeType, key);

    delete data[key];
    stateMechKey = null;
    document.getElementById('mech-editor').innerHTML = '';
    renderMechList();
}

function renameMechKey(oldKey, newKey) {
    const data = getMechDataTarget();
    if (!data || !newKey || oldKey === newKey) return;

    if (data[newKey]) {
        alert(`Error: The key "${newKey}" already exists in this section!`);
        renderMechList();
        selectMechItem(oldKey);
        return;
    }

    let cascadeType = currentMechSection;
    if (currentMechSection === 'factions') cascadeType = 'faction';
    if (currentMechSection === 'classes') cascadeType = 'class';
    if (currentMechSection === 'skills') cascadeType = 'skill';
    if (currentMechSection === 'elements') cascadeType = 'element';
    if (currentMechSection === 'effects') cascadeType = 'effect';

    cascadeRenameKey(cascadeType, oldKey, newKey);

    data[newKey] = data[oldKey];
    delete data[oldKey];

    stateMechKey = newKey;
    renderMechList();
    selectMechItem(newKey);
}

function selectMechItem(key) {
    stateMechKey = key;

    const data = getMechDataTarget();
    if (!data) return;
    const item = data[key];
    const ed = document.getElementById('mech-editor');

    let specificFieldsHtml = '';

    if (currentMechSection === 'resources' || currentMechSection === 'factions' || currentMechSection === 'classes' || currentMechSection === 'skills') {
        if (!item.title_loc) item.title_loc = JSON.parse(JSON.stringify(BASE_LANGUAGES));
        if (!item.desc_loc) item.desc_loc = JSON.parse(JSON.stringify(BASE_LANGUAGES));

        specificFieldsHtml = `
            <div class="form-grid" style="margin-top:15px;">
                <div class="form-group">
                    <label>Icon / Emoji</label>
                    <input type="text" value="${item.icon || ''}" oninput="getMechDataTarget()['${key}'].icon = this.value; renderMechList();">
                </div>
            </div>
            <div class="form-grid" style="margin-top:15px;">
                <div class="form-group">
                    <label>Title (Localization)</label>
                    <div class="sub-section" style="margin-top:5px; padding:10px;">
                        ${generateLocInputs(item.title_loc, `getMechDataTarget()['${key}'].title_loc`)}
                    </div>
                </div>
                <div class="form-group">
                    <label>Description (Localization)</label>
                    <div class="sub-section" style="margin-top:5px; padding:10px;">
                        ${generateLocInputs(item.desc_loc, `getMechDataTarget()['${key}'].desc_loc`)}
                    </div>
                </div>
            </div>
        `;
    } else if (currentMechSection === 'elements') {
        if (!item.title_loc) item.title_loc = JSON.parse(JSON.stringify(BASE_LANGUAGES));

        specificFieldsHtml = `
            <div class="form-grid" style="margin-top:15px;">
                <div class="form-group">
                    <label>Icon / Emoji</label>
                    <input type="text" value="${item.icon || ''}" oninput="getMechDataTarget()['${key}'].icon = this.value; renderMechList();">
                </div>
                <div class="form-group">
                    <label>Hex Color</label>
                    <div style="display:flex; gap:8px;">
                        <input type="color" value="${item.color || '#ffffff'}" oninput="getMechDataTarget()['${key}'].color = this.value; document.getElementById('elem-hex-${key}').value = this.value;" style="width:45px; padding:0; cursor:pointer; height:36px;">
                        <input type="text" id="elem-hex-${key}" value="${item.color || '#ffffff'}" oninput="getMechDataTarget()['${key}'].color = this.value;">
                    </div>
                </div>
            </div>
            <div class="form-grid" style="margin-top:15px;">
                <div class="form-group full-width">
                    <label>Element Name (Localization)</label>
                    <div class="sub-section" style="margin-top:5px; padding:10px;">
                        ${generateLocInputs(item.title_loc, `getMechDataTarget()['${key}'].title_loc`)}
                    </div>
                </div>
            </div>
        `;
    } else if (currentMechSection === 'effects') {
        specificFieldsHtml = `
            <div class="form-grid" style="margin-top:15px;">
                <div class="form-group">
                    <label>Icon / Emoji</label>
                    <input type="text" value="${item.icon || ''}" oninput="getMechDataTarget()['${key}'].icon = this.value; renderMechList();">
                </div>
                <div class="form-group">
                    <label>Polarity</label>
                    <select onchange="getMechDataTarget()['${key}'].polarity = this.value">
                        <option value="buff" ${item.polarity === 'buff' ? 'selected' : ''}>Buff (Positive)</option>
                        <option value="debuff" ${item.polarity === 'debuff' ? 'selected' : ''}>Debuff (Negative)</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Mechanic Type</label>
                    <select onchange="getMechDataTarget()['${key}'].type = this.value">
                        <option value="stat_mod" ${item.type === 'stat_mod' ? 'selected' : ''}>Stat Modifier</option>
                        <option value="trigger" ${item.type === 'trigger' ? 'selected' : ''}>Trigger Condition</option>
                        <option value="dot" ${item.type === 'dot' ? 'selected' : ''}>Damage Over Time</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Is Dispelable</label>
                    <select onchange="getMechDataTarget()['${key}'].is_dispelable = (this.value === 'true')">
                        <option value="true" ${item.is_dispelable === true ? 'selected' : ''}>True</option>
                        <option value="false" ${item.is_dispelable === false ? 'selected' : ''}>False</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Period (Ticks)</label>
                    <input type="number" value="${item.period || 0}" oninput="getMechDataTarget()['${key}'].period = parseInt(this.value)">
                </div>
                <div class="form-group">
                    <label>Max Period duration</label>
                    <input type="number" value="${item.periodMax || 0}" oninput="getMechDataTarget()['${key}'].periodMax = parseInt(this.value)">
                </div>
                <div class="form-group"><label>Localization Key String</label><input type="text" value="${item.desc_loc_key || ''}" oninput="getMechDataTarget()['${key}'].desc_loc_key = this.value"></div>
            </div>
        `;
    } else if (currentMechSection === 'stats') {
        specificFieldsHtml = `
            <div class="form-grid" style="margin-top:15px;">
                <div class="form-group"><label>Icon / Emoji</label><input type="text" value="${item.icon || ''}" oninput="getMechDataTarget()['${key}'].icon = this.value; renderMechList();"></div>
                <div class="form-group"><label>Order weight</label><input type="number" value="${item.order || 0}" oninput="getMechDataTarget()['${key}'].order = parseInt(this.value)"></div>
                <div class="form-group"><label>Rating weight factor</label><input type="number" step="0.1" value="${item.rating_weight || 0}" oninput="getMechDataTarget()['${key}'].rating_weight = parseFloat(this.value)"></div>
                <div class="form-group">
                    <label>Display Layout</label>
                    <select onchange="getMechDataTarget()['${key}'].display = this.value">
                        <option value="int" ${item.display === 'int' ? 'selected' : ''}>Integer (Value)</option>
                        <option value="percent" ${item.display === 'percent' ? 'selected' : ''}>Percent (%)</option>
                    </select>
                </div>
                <div class="form-group full-width"><label>Localization reference string key</label><input type="text" value="${item.name_loc_key || ''}" oninput="getMechDataTarget()['${key}'].name_loc_key = this.value"></div>
            </div>
        `;
    } else if (currentMechSection === 'rarities') {
        let listItems = item.map((r, rIdx) => `
            <div style="display:flex; gap:10px; margin-bottom:6px; align-items:center;">
                <span class="badge" style="width:40px; text-align:center;">#${rIdx+1}</span>
                <input type="text" value="${r}" oninput="getMechDataTarget()['${key}'][${rIdx}] = this.value">
                <button class="danger" style="padding:4px 8px;" onclick="getMechDataTarget()['${key}'].splice(${rIdx},1); selectMechItem('${key}');">X</button>
            </div>
        `).join('');

        specificFieldsHtml = `
            <div class="sub-section">
                <div class="card-header-flex" style="border:none; padding:0; margin-bottom:10px;">
                    <span class="sub-section-title">Tier Grades List Sequence</span>
                    <button class="primary" style="padding:2px 6px; font-size:11px;" onclick="getMechDataTarget()['${key}'].push('NEW_TIER'); selectMechItem('${key}');">+ Add Tier</button>
                </div>
                <div>${listItems}</div>
            </div>
        `;
    }     else if (currentMechSection === 'team') {
        specificFieldsHtml = renderTeamForm();
    }

    if (currentMechSection === 'team') {
        ed.innerHTML = `
            <div class="card-header-flex">
                <span class="card-title">Edit Team Prototype Setup</span>
            </div>
            ${specificFieldsHtml}
        `;
    } else {
        ed.innerHTML = `
            <div class="card-header-flex">
                <span class="card-title">Edit Component: ${key}</span>
                <button class="danger" onclick="deleteMechItem('${key}')">Delete Component</button>
            </div>
            <div class="form-grid">
                <div class="form-group full-width">
                    <label>Unique Configuration ID Key</label>
                    <input type="text" value="${key}" onchange="renameMechKey('${key}', this.value)">
                </div>
            </div>
            ${specificFieldsHtml}
        `;
    }
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
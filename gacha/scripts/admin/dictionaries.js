let currentDictSection = 'resources';
let stateDictKey = null;

function switchDictTab(sectionId, evt) {
    currentDictSection = sectionId;
    stateDictKey = null;

    if (evt && evt.target && evt.target.parentElement) {
        evt.target.parentElement.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        evt.target.classList.add('active');
    }

    const titleMap = {
        'resources': 'Resources', 'item_types': 'Item Categories', 'factions': 'Factions',
        'classes': 'Classes', 'skills': 'Skills', 'elements': 'Hero Elements',
        'effects': 'Combat Effects', 'stats': 'Character Stats', 'rarities': 'Rarity Systems'
    };

    document.getElementById('dict-sidebar-title').innerText = titleMap[sectionId];
    document.getElementById('dict-editor').innerHTML = '';
    renderDictList();
}

function getDictDataTarget() {
    if (currentDictSection === 'resources') return target.mechanics.resources;
    if (currentDictSection === 'item_types') return target.mechanics.item_types;
    if (currentDictSection === 'factions') return target.catalog.factions;
    if (currentDictSection === 'classes') return target.catalog.classes;
    if (currentDictSection === 'skills') return target.catalog.skills;
    if (currentDictSection === 'elements') return target.catalog.hero_elements;
    if (currentDictSection === 'effects') return target.mechanics.effects;
    if (currentDictSection === 'stats') return target.mechanics.stats;
    if (currentDictSection === 'rarities') return target.mechanics.rarities;
    return null;
}

function renderDictList() {
    const list = document.getElementById('dict-list');
    if (!list) return;

    const data = getDictDataTarget();
    if (!data) return;

    list.innerHTML = Object.keys(data).map(key => {
        const item = data[key];
        const icon = (item && typeof item === 'object' && item.icon) ? item.icon : '⚙️';
        return `
            <li class="crud-list-item ${stateDictKey === key ? 'active' : ''}" onclick="selectDictItem('${key}')">
                <span>${icon} ${key}</span>
            </li>
        `;
    }).join('');
}

function selectDictItem(key) {
    stateDictKey = key;
    renderDictList();

    const data = getDictDataTarget();
    const ed = document.getElementById('dict-editor');
    if (!data || !ed) return;

    const item = data[key];
    let specificFieldsHtml = '';

    if (['resources', 'item_types', 'factions', 'classes', 'skills'].includes(currentDictSection)) {
        if (!item.title_loc) item.title_loc = JSON.parse(JSON.stringify(BASE_LANGUAGES));
        if (!item.desc_loc) item.desc_loc = JSON.parse(JSON.stringify(BASE_LANGUAGES));

        specificFieldsHtml = `
            <div class="form-grid" style="margin-top:15px;">
                <div class="form-group"><label>Icon / Emoji</label><input type="text" value="${item.icon || ''}" oninput="getDictDataTarget()['${key}'].icon = this.value; renderDictList();"></div>
            </div>
            <div class="form-grid" style="margin-top:15px;">
                <div class="form-group"><label>Title</label><div class="sub-section" style="padding:10px;">${generateLocInputs(item.title_loc, `getDictDataTarget()['${key}'].title_loc`)}</div></div>
                <div class="form-group"><label>Description</label><div class="sub-section" style="padding:10px;">${generateLocInputs(item.desc_loc, `getDictDataTarget()['${key}'].desc_loc`)}</div></div>
            </div>
        `;
    }
    else if (currentDictSection === 'elements') {
        if (!item.title_loc) item.title_loc = JSON.parse(JSON.stringify(BASE_LANGUAGES));
        specificFieldsHtml = `
            <div class="form-grid" style="margin-top:15px;">
                <div class="form-group"><label>Icon / Emoji</label><input type="text" value="${item.icon || ''}" oninput="getDictDataTarget()['${key}'].icon = this.value; renderDictList();"></div>
                <div class="form-group">
                    <label>Hex Color</label>
                    <div style="display:flex; gap:8px;">
                        <input type="color" value="${item.color || '#ffffff'}" oninput="getDictDataTarget()['${key}'].color = this.value; document.getElementById('dict-hex-${key}').value = this.value;" style="width:45px; padding:0; cursor:pointer; height:36px;">
                        <input type="text" id="dict-hex-${key}" value="${item.color || '#ffffff'}" oninput="getDictDataTarget()['${key}'].color = this.value;">
                    </div>
                </div>
            </div>
            <div class="form-grid" style="margin-top:15px;">
                <div class="form-group full-width"><label>Element Name</label><div class="sub-section" style="padding:10px;">${generateLocInputs(item.title_loc, `getDictDataTarget()['${key}'].title_loc`)}</div></div>
            </div>
        `;
    }
    else if (currentDictSection === 'effects') {
        specificFieldsHtml = `
            <div class="form-grid" style="margin-top:15px;">
                <div class="form-group"><label>Icon / Emoji</label><input type="text" value="${item.icon || ''}" oninput="getDictDataTarget()['${key}'].icon = this.value; renderDictList();"></div>
                <div class="form-group">
                    <label>Polarity</label>
                    <select onchange="getDictDataTarget()['${key}'].polarity = this.value">
                        <option value="buff" ${item.polarity === 'buff' ? 'selected' : ''}>Buff</option>
                        <option value="debuff" ${item.polarity === 'debuff' ? 'selected' : ''}>Debuff</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Type</label>
                    <select onchange="getDictDataTarget()['${key}'].type = this.value">
                        <option value="stat_mod" ${item.type === 'stat_mod' ? 'selected' : ''}>Stat Modifier</option>
                        <option value="trigger" ${item.type === 'trigger' ? 'selected' : ''}>Trigger Condition</option>
                        <option value="dot" ${item.type === 'dot' ? 'selected' : ''}>Damage Over Time</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Is Dispelable</label>
                    <select onchange="getDictDataTarget()['${key}'].is_dispelable = (this.value === 'true')">
                        <option value="true" ${item.is_dispelable === true ? 'selected' : ''}>True</option>
                        <option value="false" ${item.is_dispelable === false ? 'selected' : ''}>False</option>
                    </select>
                </div>
                <div class="form-group"><label>Period (Ticks)</label><input type="number" value="${item.period || 0}" oninput="getDictDataTarget()['${key}'].period = parseInt(this.value)"></div>
                <div class="form-group"><label>Max Period</label><input type="number" value="${item.periodMax || 0}" oninput="getDictDataTarget()['${key}'].periodMax = parseInt(this.value)"></div>
                <div class="form-group"><label>Loc Key String</label><input type="text" value="${item.desc_loc_key || ''}" oninput="getDictDataTarget()['${key}'].desc_loc_key = this.value"></div>
            </div>
        `;
    }
    else if (currentDictSection === 'stats') {
        specificFieldsHtml = `
            <div class="form-grid" style="margin-top:15px;">
                <div class="form-group"><label>Icon</label><input type="text" value="${item.icon || ''}" oninput="getDictDataTarget()['${key}'].icon = this.value; renderDictList();"></div>
                <div class="form-group"><label>Order</label><input type="number" value="${item.order || 0}" oninput="getDictDataTarget()['${key}'].order = parseInt(this.value)"></div>
                <div class="form-group"><label>Rating Weight</label><input type="number" step="0.1" value="${item.rating_weight || 0}" oninput="getDictDataTarget()['${key}'].rating_weight = parseFloat(this.value)"></div>
                <div class="form-group">
                    <label>Display</label>
                    <select onchange="getDictDataTarget()['${key}'].display = this.value">
                        <option value="int" ${item.display === 'int' ? 'selected' : ''}>Integer</option>
                        <option value="percent" ${item.display === 'percent' ? 'selected' : ''}>Percent (%)</option>
                    </select>
                </div>
                <div class="form-group full-width"><label>Loc Key</label><input type="text" value="${item.name_loc_key || ''}" oninput="getDictDataTarget()['${key}'].name_loc_key = this.value"></div>
            </div>
        `;
    }
    else if (currentDictSection === 'rarities') {
        let listItems = item.map((r, rIdx) => `
            <div style="display:flex; gap:10px; margin-bottom:6px; align-items:center;">
                <span class="badge" style="width:40px; text-align:center;">#${rIdx+1}</span>
                <input type="text" value="${r}" oninput="getDictDataTarget()['${key}'][${rIdx}] = this.value">
                <button class="danger" style="padding:4px 8px;" onclick="getDictDataTarget()['${key}'].splice(${rIdx},1); selectDictItem('${key}');">X</button>
            </div>
        `).join('');

        specificFieldsHtml = `
            <div class="sub-section">
                <div class="card-header-flex" style="border:none; padding:0; margin-bottom:10px;">
                    <span class="sub-section-title">Tier Grades Sequence</span>
                    <button class="primary" style="padding:2px 6px; font-size:11px;" onclick="getDictDataTarget()['${key}'].push('NEW_TIER'); selectDictItem('${key}');">+ Add Tier</button>
                </div>
                <div>${listItems}</div>
            </div>
        `;
    }

    ed.innerHTML = `
        <div class="card-header-flex">
            <span class="card-title">Edit Dictionary Item: ${key}</span>
            <button class="danger" onclick="deleteDictItem('${key}')">Delete Item</button>
        </div>
        <div class="form-grid">
            <div class="form-group full-width">
                <label>Unique ID Key</label>
                <input type="text" value="${key}" onchange="renameDictKey('${key}', this.value)">
            </div>
        </div>
        ${specificFieldsHtml}
    `;
}

function createNewDictItem() {
    const data = getDictDataTarget();
    if (!data) return;

    const basePrefix = `new_${currentDictSection}_`;
    let count = Object.keys(data).length;
    let newKey = `${basePrefix}${count}`;

    while (data[newKey]) {
        count++;
        newKey = `${basePrefix}${count}`;
    }

    if (['resources', 'item_types', 'factions', 'classes', 'skills'].includes(currentDictSection)) {
        data[newKey] = { icon: "⚙️", title_loc: JSON.parse(JSON.stringify(BASE_LANGUAGES)), desc_loc: JSON.parse(JSON.stringify(BASE_LANGUAGES)) };
    } else if (currentDictSection === 'elements') {
        data[newKey] = { title_loc: JSON.parse(JSON.stringify(BASE_LANGUAGES)), icon: "❄️", color: "#ffffff" };
    } else if (currentDictSection === 'effects') {
        data[newKey] = { period: 0, periodMax: 0, is_dispelable: true, icon: "🧪", stats: {}, action: {}, polarity: "buff", type: "stat_mod", desc_loc_key: "" };
    } else if (currentDictSection === 'stats') {
        data[newKey] = { name_loc_key: newKey, value: 1, order: count + 1, icon: "📊", display: "int", rating_weight: 1.0 };
    } else if (currentDictSection === 'rarities') {
        data[newKey] = ["R", "SR", "SSR"];
    }

    stateDictKey = newKey;
    renderDictList();
    selectDictItem(newKey);
}

function deleteDictItem(key) {
    const data = getDictDataTarget();
    if (!data) return;
    if (!confirm(`Delete ${key}?`)) return;

    let cascadeType = currentDictSection;
    if (currentDictSection === 'factions') cascadeType = 'faction';
    if (currentDictSection === 'classes') cascadeType = 'class';
    if (currentDictSection === 'skills') cascadeType = 'skill';
    if (currentDictSection === 'elements') cascadeType = 'element';
    if (currentDictSection === 'effects') cascadeType = 'effect';

    cascadeDeleteKey(cascadeType, key);
    delete data[key];

    stateDictKey = null;
    document.getElementById('dict-editor').innerHTML = '';
    renderDictList();
}

function renameDictKey(oldKey, newKey) {
    const data = getDictDataTarget();
    if (!data || !newKey || oldKey === newKey) return;

    if (data[newKey]) {
        alert(`Key "${newKey}" already exists!`);
        renderDictList();
        selectDictItem(oldKey);
        return;
    }

    let cascadeType = currentDictSection;
    if (currentDictSection === 'factions') cascadeType = 'faction';
    if (currentDictSection === 'classes') cascadeType = 'class';
    if (currentDictSection === 'skills') cascadeType = 'skill';
    if (currentDictSection === 'elements') cascadeType = 'element';
    if (currentDictSection === 'effects') cascadeType = 'effect';

    cascadeRenameKey(cascadeType, oldKey, newKey);

    data[newKey] = data[oldKey];
    delete data[oldKey];

    stateDictKey = newKey;
    renderDictList();
    selectDictItem(newKey);
}


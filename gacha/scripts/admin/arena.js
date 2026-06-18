let currentArenaSection = 'types';
let stateArenaKey = null;

function switchArenaSubTab(sectionId, evt) {
    currentArenaSection = sectionId;
    stateArenaKey = null;

    if (evt && evt.target && evt.target.parentElement) {
        const parent = evt.target.parentElement;
        parent.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        evt.target.classList.add('active');
    }

    document.getElementById('arena-sidebar-title').innerText = sectionId === 'types' ? 'Access Rules' : 'Screen Widgets';
    document.getElementById('arena-editor').innerHTML = '';
    renderArenaList();
}

function renderArenaList() {
    const list = document.getElementById('arena-list');
    if (!list) return;

    if (currentArenaSection === 'types') {
        list.innerHTML = Object.keys(target.catalog.arena_types || {}).map(key => `
            <li class="crud-list-item ${stateArenaKey === key ? 'active' : ''}" onclick="selectArenaItem('${key}')">
                <span>⚔️ ${key}</span>
            </li>
        `).join('');
    } else {
        const arenaScreen = target.ui.landscape.find(s => s.id === 'screen_arena');
        const widgets = arenaScreen?.arena_widgets || [];
        list.innerHTML = widgets.map((w, idx) => `
            <li class="crud-list-item ${stateArenaKey === idx ? 'active' : ''}" onclick="selectArenaItem(${idx})">
                <span>📱 ${w.id || 'unnamed'}</span>
            </li>
        `).join('');
    }
}

function selectArenaItem(key) {
    stateArenaKey = key;
    renderArenaList();
    const ed = document.getElementById('arena-editor');

    if (currentArenaSection === 'types') {
        const type = target.catalog.arena_types[key];
        ed.innerHTML = `
            <div class="card-header-flex">
                <span class="card-title">Edit Access Rule: ${key}</span>
                <button class="danger" onclick="deleteArenaType('${key}')">Delete Rule</button>
            </div>
            <div class="form-grid">
                <div class="form-group"><label>Mode Key ID</label><input type="text" value="${key}" onchange="renameArenaType('${key}', this.value)"></div>
                <div class="form-group"><label>Minimum Account Level</label><input type="number" value="${type.min_level || 1}" oninput="target.catalog.arena_types['${key}'].min_level = parseInt(this.value)"></div>
                <div class="form-group"><label>Minimum VIP Status</label><input type="number" value="${type.min_vip || 0}" oninput="target.catalog.arena_types['${key}'].min_vip = parseInt(this.value)"></div>
                <div class="form-group full-width"><label>Embed Game Build Frame URL</label><input type="text" value="${type.embed_url || ''}" oninput="target.catalog.arena_types['${key}'].embed_url = this.value"></div>
            </div>
        `;
    } else {
        const arenaScreen = target.ui.landscape.find(s => s.id === 'screen_arena');
        const w = arenaScreen.arena_widgets[key];

        const typeOptions = Object.keys(target.catalog.arena_types || {}).map(tKey =>
            `<option value="${tKey}" ${w.arena_type_id === tKey ? 'selected' : ''}>Rule Link: ${tKey}</option>`
        ).join('');

        const locOptions = Object.keys(target.localization?.ui?.en || {}).map(locKey =>
            `<option value="${locKey}" ${w.label_loc_key === locKey ? 'selected' : ''}>${locKey}</option>`
        ).join('');

        ed.innerHTML = `
            <div class="card-header-flex">
                <span class="card-title">Edit Screen Widget: ${w.id}</span>
                <button class="danger" onclick="deleteArenaWidget(${key})">Delete Widget</button>
            </div>
            <div class="form-grid">
                <div class="form-group"><label>Widget Element ID</label><input type="text" value="${w.id || ''}" oninput="const arenaScreen = target.ui.landscape.find(s => s.id === 'screen_arena'); arenaScreen.arena_widgets[${key}].id = this.value; renderArenaList();"></div>
                <div class="form-group">
                    <label>Linked Access Rule</label>
                    <select onchange="const arenaScreen = target.ui.landscape.find(s => s.id === 'screen_arena'); arenaScreen.arena_widgets[${key}].arena_type_id = this.value">
                        <option value="">-- Select Arena Type Rule --</option>
                        ${typeOptions}
                    </select>
                </div>
                <div class="form-group">
                    <label>Header Translation Title</label>
                    <select onchange="const arenaScreen = target.ui.landscape.find(s => s.id === 'screen_arena'); arenaScreen.arena_widgets[${key}].label_loc_key = this.value">
                        <option value="">-- Select Loc Key --</option>
                        ${locOptions}
                    </select>
                </div>
                <div class="form-group full-width"><label>Background Widget Button texture</label><input type="text" value="${w.layout?.backgroundImage || ''}" oninput="const arenaScreen = target.ui.landscape.find(s => s.id === 'screen_arena'); arenaScreen.arena_widgets[${key}].layout.backgroundImage = this.value"></div>
            </div>
        `;
    }
}

function createNewArenaItem() {
    if (currentArenaSection === 'types') {
        if (!target.catalog.arena_types) target.catalog.arena_types = {};
        const newKey = `NEW_MODE_${Object.keys(target.catalog.arena_types).length}`;
        target.catalog.arena_types[newKey] = { embed_url: "", min_level: 1, min_vip: 0 };
        selectArenaItem(newKey);
    } else {
        const arenaScreen = target.ui.landscape.find(s => s.id === 'screen_arena');
        if (!arenaScreen.arena_widgets) arenaScreen.arena_widgets = [];
        arenaScreen.arena_widgets.push({ id: `widget_${Date.now()}`, label_loc_key: "", arena_type_id: "", layout: { top: "50%", left: "50%", width: "30%", height: "30%" } });
        selectArenaItem(arenaScreen.arena_widgets.length - 1);
    }
}

function renameArenaType(oldKey, newKey) {
    if (!newKey || oldKey === newKey || target.catalog.arena_types[newKey]) return;
    target.catalog.arena_types[newKey] = target.catalog.arena_types[oldKey];
    delete target.catalog.arena_types[oldKey];

    target.ui.landscape.forEach(s => {
        if (s.id === 'screen_arena' && s.arena_widgets) {
            s.arena_widgets.forEach(w => { if (w.arena_type_id === oldKey) w.arena_type_id = newKey; });
        }
    });
    selectArenaItem(newKey);
}

function deleteArenaType(key) {
    if (!confirm('Delete access rule?')) return;
    delete target.catalog.arena_types[key];
    target.ui.landscape.forEach(s => {
        if (s.id === 'screen_arena' && s.arena_widgets) {
            s.arena_widgets.forEach(w => { if (w.arena_type_id === key) w.arena_type_id = ""; });
        }
    });
    document.getElementById('arena-editor').innerHTML = '';
    renderArenaList();
}

function deleteArenaWidget(idx) {
    if (!confirm('Delete widget?')) return;
    const arenaScreen = target.ui.landscape.find(s => s.id === 'screen_arena');
    arenaScreen.arena_widgets.splice(idx, 1);
    document.getElementById('arena-editor').innerHTML = '';
    renderArenaList();
}

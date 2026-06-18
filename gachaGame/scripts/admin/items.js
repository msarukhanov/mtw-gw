function renderItems() {
    const list = document.getElementById('item-list');
    list.innerHTML = Object.keys(target.catalog.items).map(key => {
        const it = target.catalog.items[key];
        const isUrl = it.icon && (it.icon.startsWith('./') || it.icon.startsWith('http'));
        const iconHtml = isUrl ?
            `<img src="${it.icon}" style="width:20px; height:20px; border-radius:4px; object-fit:cover; border:1px solid var(--border-color);" onerror="this.outerHTML='<span>📦</span>'">` :
            `<span style="font-size:14px; width:20px; text-align:center; display:inline-block;">${it.icon || '📦'}</span>`;

        return `
            <li class="crud-list-item ${state.item === key ? 'active' : ''}" onclick="selectItem('${key}')">
                <div style="display:flex; align-items:center; gap:8px;">
                    ${iconHtml}
                    <span style="font-family:monospace; font-size:13px;">${key}</span>
                </div>
                <span class="badge">${it.rarity || 'R'}</span>
            </li>
        `;
    }).join('');
}

function selectItem(key) {
    state.item = key;
    renderItems();
    const it = target.catalog.items[key];
    const ed = document.getElementById('item-editor');

    if (!it.title_loc) it.title_loc = JSON.parse(JSON.stringify(BASE_LANGUAGES));
    if (!it.desc_loc) it.desc_loc = JSON.parse(JSON.stringify(BASE_LANGUAGES));
    if (!it.stats) it.stats = {};
    if (!it.effects) it.effects = [];

    const allowedStats = Object.keys(target.mechanics?.stats || {});
    let itemStatsHtml = allowedStats.map(statKey => {
        const statMeta = target.mechanics.stats[statKey];
        const val = it.stats[statKey] || 0;
        return `
            <div class="form-group">
                <label>${statMeta.icon || ''} Add ${statKey.toUpperCase()}</label>
                <input type="number" value="${val}" oninput="if(parseInt(this.value)==0){delete target.catalog.items['${key}'].stats['${statKey}'];}else{target.catalog.items['${key}'].stats['${statKey}']=parseInt(this.value).">
            </div>
        `;
    }).join('');

    const slotOptions = BASE_INVENTORY_SLOTS.map(slot =>
        `<option value="${slot}" ${it.slot === slot ? 'selected' : ''}>${slot.toUpperCase()}</option>`
    ).join('');

    let itemEffectsHtml = it.effects.map((eff, eIdx) => {
        const currentEffectOptions = Object.keys(target.mechanics?.effects || {}).map(effKey =>
            `<option value="${effKey}" ${eff.effect_id === effKey ? 'selected' : ''}>${effKey}</option>`
        ).join('');

        const targetStatOptions = allowedStats.map(statKey =>
            `<option value="${statKey}" ${eff.target_stat_id === statKey ? 'selected' : ''}>${statKey.toUpperCase()}</option>`
        ).join('');

        return `
            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr auto; gap: 10px; margin-bottom: 8px; align-items: center;">
                <select onchange="target.catalog.items['${key}'].effects[${eIdx}].effect_id = this.value">
                    <option value="">-- Select Trigger/Mod --</option>
                    ${currentEffectOptions}
                </select>
                <input type="number" value="${eff.value || 0}" oninput="target.catalog.items['${key}'].effects[${eIdx}].value = parseInt(this.value)" placeholder="Value">
                <select onchange="target.catalog.items['${key}'].effects[${eIdx}].target_stat_id = this.value">
                    <option value="">-- Stat Target (Optional) --</option>
                    ${targetStatOptions}
                </select>
                <button class="danger" style="padding: 4px;" onclick="removeItemEffect('${key}', eIdx)">X</button>
            </div>
        `;
    }).join('');

    const isUrl = it.icon && (it.icon.startsWith('./') || it.icon.startsWith('http'));
    const livePreviewHtml = isUrl ?
        `<img id="item-live-prev" src="${it.icon}" style="max-height:60px; border-radius:4px; border:1px solid var(--border-color); object-fit:contain;" onerror="this.style.display='none'">` :
        `<span id="item-live-emoji" style="font-size:32px; display:inline-block; padding:5px; background:var(--bg-main); border-radius:6px; border:1px solid var(--border-color);">${it.icon || '📦'}</span>`;

    ed.innerHTML = `
        <div class="card-header-flex">
            <span class="card-title">Edit Item Configuration: ${key}</span>
            <button class="danger" onclick="deleteItem('${key}')">Delete Item</button>
        </div>
        <div class="form-grid">
            <div class="form-group"><label>Item DB Key</label><input type="text" value="${key}" onchange="renameItemKey('${key}', this.value)"></div>
            <div class="form-group">
                <label>Category Type</label>
                <select onchange="target.catalog.items['${key}'].category = this.value">
                    <option value="equipment" ${it.category === 'equipment' ? 'selected' : ''}>Equipment</option>
                    <option value="currency" ${it.category === 'currency' ? 'selected' : ''}>Currency</option>
                    <option value="consumable" ${it.category === 'consumable' ? 'selected' : ''}>Consumable</option>
                </select>
            </div>
            <div class="form-group">
                <label>Item Rarity Tier</label>
                <select onchange="target.catalog.items['${key}'].rarity = this.value; renderItems();">
                    <option value="">-- Select Rarity --</option>
                    ${(target.mechanics?.rarities?.items || ["R", "SR", "SSR"]).map(r => `
                        <option value="${r}" ${it.rarity === r ? 'selected' : ''}>${r}</option>
                    `).join('')}
                </select>
            </div>
            <div class="form-group">
                <label>Gear Inventory Slot</label>
                <select onchange="target.catalog.items['${key}'].slot = this.value">
                    <option value="">-- Non-Equipable Resource --</option>
                    ${slotOptions}
                </select>
            </div>
            
            <div class="form-group">
                <label>Icon Asset / Emoji</label>
                <input type="text" value="${it.icon || ''}" oninput="target.catalog.items['${key}'].icon = this.value; renderItems(); const p=document.getElementById('item-live-prev'); const e=document.getElementById('item-live-emoji'); if(this.value.startsWith('.')||this.value.startsWith('http')){if(e)e.style.display='none'; if(p){p.src=this.value; p.style.display='block';}}else{if(p)p.style.display='none'; if(e){e.innerText=this.value||'📦'; e.style.display='inline-block';}}">
                <div style="margin-top:8px;">${livePreviewHtml}</div>
            </div>

            <div class="form-group"><label>Is Direct Usable</label>
                <select onchange="target.catalog.items['${key}'].is_usable = (this.value === 'true')">
                    <option value="false" ${!it.is_usable ? 'selected' : ''}>False</option>
                    <option value="true" ${it.is_usable ? 'selected' : ''}>True</option>
                </select>
            </div>
            <div class="form-group full-width"><label>Expiration Epoch Timestamp (0 = Infinite)</label><input type="number" value="${it.expiration || 0}" oninput="target.catalog.items['${key}'].expiration = parseInt(this.value) || null"></div>
        </div>

        <div class="form-grid" style="margin-top:15px;">
            <div class="form-group">
                <label>Item Title (Localization)</label>
                <div class="sub-section" style="margin-top:5px; padding:10px;">
                    ${generateLocInputs(it.title_loc, `target.catalog.items['${key}'].title_loc`)}
                </div>
            </div>
            <div class="form-group">
                <label>Item Description (Localization)</label>
                <div class="sub-section" style="margin-top:5px; padding:10px;">
                    ${generateLocInputs(it.desc_loc, `target.catalog.items['${key}'].desc_loc`)}
                </div>
            </div>
        </div>

        <div class="sub-section">
            <div class="sub-section-title">Static Gear Attributes Modifiers</div>
            <div class="form-grid">${itemStatsHtml}</div>
        </div>

        <div class="sub-section">
            <div class="card-header-flex" style="border:none; padding:0; margin-bottom:10px;">
                <div class="sub-section-title" style="margin:0;">Item Special Operational Effects</div>
                <button class="primary" style="padding: 2px 6px; font-size: 11px;" onclick="addItemEffect('${key}')">+ Effect</button>
            </div>
            <div>${itemEffectsHtml || '<p style="font-size:12px; color:var(--text-muted);">No triggered combat effects assigned</p>'}</div>
        </div>
    `;
}

function createNewItem() {
    const newKey = `new_item_${Object.keys(target.catalog.items).length}`;
    target.catalog.items[newKey] = { category: "equipment", rarity: "R", is_usable: false, icon: "⚔️", title_loc: { en: "New Item", ru: "" }, effects: [] };
    selectItem(newKey);
}

function addItemEffect(key) {
    if(!target.catalog.items[key].effects) target.catalog.items[key].effects = [];
    target.catalog.items[key].effects.push({ effect_id: "", value: 0, target_stat_id: "" });
    selectItem(key);
}

function removeItemEffect(key, idx) {
    target.catalog.items[key].effects.splice(idx, 1);
    selectItem(key);
}

function deleteItem(key) {
    if (!confirm('Are you sure you want to delete this item?')) return;

    cascadeDeleteKey('item', key);

    delete target.catalog.items[key];
    state.item = null;
    document.getElementById('item-editor').innerHTML = '';
    renderItems();
}

function renameItemKey(oldKey, newKey) {
    if (!newKey || oldKey === newKey) return;

    if (isKeyDuplicate('item', newKey, oldKey)) {
        alert(`Error: Item key "${newKey}" already exists!`);
        renderItems();
        selectItem(oldKey);
        return;
    }

    cascadeRenameKey('item', oldKey, newKey);
    target.catalog.items[newKey] = target.catalog.items[oldKey];
    delete target.catalog.items[oldKey];

    if (state.item === oldKey) state.item = newKey;
    renderItems();
    selectItem(newKey);
}
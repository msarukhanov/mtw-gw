let currentItemSection = 'items'; // 'items' или 'recipes'
let stateItemKey = null;

function switchItemSubTab(sectionId, evt) {
    currentItemSection = sectionId;
    stateItemKey = null;

    if (evt && evt.target && evt.target.parentElement) {
        evt.target.parentElement.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        evt.target.classList.add('active');
    }

    const titleElem = document.getElementById('item-sidebar-title');
    if (titleElem) {
        titleElem.innerText = sectionId === 'items' ? 'Items Database' : 'Crafting Recipes';
    }

    const ed = document.getElementById('item-editor');
    if (ed) ed.innerHTML = '';

    renderItems();
}

function renderItems() {
    const list = document.getElementById('item-list');
    if (!list) return;

    if (currentItemSection === 'items') {
        list.innerHTML = Object.keys(target.catalog.items || {}).map(key => {
            const it = target.catalog.items[key];
            const isUrl = it.icon && (it.icon.startsWith('./') || it.icon.startsWith('http'));
            const iconHtml = isUrl ?
                `<img src="${it.icon}" style="width:20px; height:20px; border-radius:4px; object-fit:cover; border:1px solid var(--border-color);" onerror="this.outerHTML='<span>📦</span>'">` :
                `<span style="font-size:14px; width:20px; text-align:center; display:inline-block;">${it.icon || '📦'}</span>`;

            return `
                <li class="crud-list-item ${state.item === key ? 'active' : ''}" onclick="selectItemItem('${key}')">
                    <div style="display:flex; align-items:center; gap:8px;">
                        ${iconHtml}
                        <span style="font-family:monospace; font-size:13px;">${key}</span>
                    </div>
                    <span class="badge">${it.rarity || 'R'}</span>
                </li>
            `;
        }).join('');
    } else {
        list.innerHTML = Object.keys(target.catalog.recipes || {}).map(key => `
            <li class="crud-list-item ${stateItemKey === key ? 'active' : ''}" onclick="selectItemItem('${key}')">
                <div style="display:flex; align-items:center; gap:8px;">
                    <span>🛠️</span>
                    <span style="font-family:monospace; font-size:13px;">${key}</span>
                </div>
            </li>
        `).join('');
    }
}

function selectItemItem(key) {
    stateItemKey = key;
    if (currentItemSection === 'items') {
        state.item = key;
        selectItem(key);
    } else {
        selectRecipe(key);
    }
}

function createNewItemOrRecipe() {
    if (currentItemSection === 'items') {
        if (!target.catalog.items) target.catalog.items = {};
        const newKey = `new_item_${Object.keys(target.catalog.items).length}`;
        target.catalog.items[newKey] = { category: "equipment", rarity: "R", is_usable: false, icon: "⚔️", title_loc: { en: "New Item", ru: "" }, effects: [], drop_table: [] };
        state.item = newKey;
        selectItem(newKey);
    } else {
        if (!target.catalog.recipes) target.catalog.recipes = {};
        const newKey = `recipe_new_item_${Object.keys(target.catalog.recipes).length}`;
        target.catalog.recipes[newKey] = { gold_cost: 1000, ingredients: {}, result: { itemId: "", amount: 1 } };
        stateItemKey = newKey;
        selectRecipe(newKey);
    }
}

function selectItem(key) {
    state.item = key;
    renderItems();
    const it = target.catalog.items[key];
    const ed = document.getElementById('item-editor');
    if (!ed) return;

    if (!it.title_loc) it.title_loc = JSON.parse(JSON.stringify(BASE_LANGUAGES));
    if (!it.desc_loc) it.desc_loc = JSON.parse(JSON.stringify(BASE_LANGUAGES));
    if (!it.stats) it.stats = {};
    if (!it.effects) it.effects = [];
    if (!it.drop_table) it.drop_table = [];

    const allowedStats = Object.keys(target.mechanics?.stats || {});
    let itemStatsHtml = allowedStats.map(statKey => {
        const statMeta = target.mechanics.stats[statKey];
        const val = it.stats[statKey] || 0;
        return `
            <div class="form-group">
                <label>${statMeta.icon || ''} Add ${statKey.toUpperCase()}</label>
                <input type="number" value="${val}" oninput="if(parseInt(this.value)==0){delete target.catalog.items['${key}'].stats['${statKey}'];}else{target.catalog.items['${key}'].stats['${statKey}']=parseInt(this.value).}">
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
                <button class="danger" style="padding: 4px;" onclick="removeItemEffect('${key}', ${eIdx})">X</button>
            </div>
        `;
    }).join('');

    let dropTableHtml = '';
    if (it.is_usable && it.category === 'consumable') {
        let dropRows = it.drop_table.map((drop, dIdx) => {
            const currentSelection = drop.type && drop.id ? `${drop.type}:${drop.id}` : '';
            return `
                <div style="display: grid; grid-template-columns: 2fr 1fr 1fr 1fr auto; gap: 8px; margin-bottom: 8px; align-items: center; background: rgba(255,255,255,0.01); padding: 5px; border-radius: 4px;">
                    <select onchange="const parts=this.value.split(':'); target.catalog.items['${key}'].drop_table[${dIdx}].type=parts[0]; target.catalog.items['${key}'].drop_table[${dIdx}].id=parts[1];">
                        <option value="">-- Select Reward Asset --</option>
                        ${Object.keys(target.mechanics?.resources || {}).map(r => `<option value="resource:${r}" ${currentSelection === `resource:${r}` ? 'selected' : ''}>🔮 Resource: ${r}</option>`).join('')}
                        ${Object.keys(target.catalog?.items || {}).filter(iKey => iKey !== key).map(i => `<option value="item:${i}" ${currentSelection === `item:${i}` ? 'selected' : ''}>📦 Item: ${i}</option>`).join('')}
                    </select>
                    <input type="number" value="${drop.min_amount || 1}" oninput="target.catalog.items['${key}'].drop_table[${dIdx}].min_amount = parseInt(this.value) || 1" placeholder="Min">
                    <input type="number" value="${drop.max_amount || 1}" oninput="target.catalog.items['${key}'].drop_table[${dIdx}].max_amount = parseInt(this.value) || 1" placeholder="Max">
                    <input type="number" value="${drop.weight || 100}" oninput="target.catalog.items['${key}'].drop_table[${dIdx}].weight = parseInt(this.value) || 100" placeholder="Weight">
                    <button class="danger" style="padding: 4px 8px;" onclick="target.catalog.items['${key}'].drop_table.splice(${dIdx}, 1); selectItem('${key}');">X</button>
                </div>
            `;
        }).join('');

        dropTableHtml = `
            <div class="sub-section" style="border-color: var(--accent-blue); margin-top:15px;">
                <div class="card-header-flex" style="border:none; padding:0; margin-bottom:10px;">
                    <span class="sub-section-title" style="margin:0; color:var(--accent-blue);">🎁 Chest Drop Loot Table (Rates & Bounds)</span>
                    <button class="primary" style="padding: 2px 6px; font-size: 11px;" onclick="target.catalog.items['${key}'].drop_table.push({type:'resource', id:'', min_amount:1, max_amount:1, weight:100}); selectItem('${key}');">+ Add Loot Item</button>
                </div>
                <div>${dropRows || '<p style="font-size:11px; color:var(--text-muted); padding:5px; margin:0;">Loot table is empty.</p>'}</div>
            </div>
        `;
    }

    const itemTypeOptions = Object.keys(target.mechanics?.item_types || {}).map(typeKey => {
        const typeMeta = target.mechanics.item_types[typeKey];
        return `<option value="${typeKey}" ${it.category === typeKey ? 'selected' : ''}>${typeMeta.icon || '📦'} ${typeMeta.title_loc?.en || typeKey}</option>`;
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
                <select onchange="target.catalog.items['${key}'].category = this.value; selectItem('${key}');">
                    <option value="">-- Select Category --</option>
                    ${itemTypeOptions}
                </select>
            </div>
            <div class="form-group">
                <label>Item Rarity Tier</label>
                <select onchange="target.catalog.items['${key}'].rarity = this.value; renderItems();">
                    <option value="">-- Select Rarity --</option>
                    ${(target.mechanics?.rarities?.items || ["R", "SR", "SSR"]).map(r => `<option value="${r}" ${it.rarity === r ? 'selected' : ''}>${r}</option>`).join('')}
                </select>
            </div>
            <div class="form-group">
                <label>Gear Inventory Slot</label>
                <select onchange="target.catalog.items['${key}'].slot = this.value">
                    <option value="">-- Non-Equipable Resource --</option>
                    ${slotOptions}
                </select>
            </div>
            <div id="item-icon-group-anchor"></div>
        </div>
    `;

    // Продолжение сборки формы инспектора предметов из Части 2
    const iconGroup = document.getElementById('item-icon-group-anchor');
    if (iconGroup) {
        iconGroup.outerHTML = `
            <div class="form-group">
                <label>Icon Asset / Emoji</label>
                <input type="text" value="${it.icon || ''}" oninput="target.catalog.items['${key}'].icon = this.value; renderItems(); const p=document.getElementById('item-live-prev'); const e=document.getElementById('item-live-emoji'); if(this.value.startsWith('.')||this.value.startsWith('http')){if(e)e.style.display='none'; if(p){p.src=this.value; p.style.display='block';}}else{if(p)p.style.display='none'; if(e){e.innerText=this.value||'📦'; e.style.display='inline-block';}}">
                <div style="margin-top:8px;">${livePreviewHtml}</div>
            </div>
            <div class="form-group"><label>Is Direct Usable</label>
                <select onchange="target.catalog.items['${key}'].is_usable = (this.value === 'true'); selectItem('${key}');">
                    <option value="false" ${!it.is_usable ? 'selected' : ''}>False</option>
                    <option value="true" ${it.is_usable ? 'selected' : ''}>True</option>
                </select>
            </div>
            <div class="form-group full-width"><label>Expiration Epoch Timestamp (0 = Infinite)</label><input type="number" value="${it.expiration || 0}" oninput="target.catalog.items['${key}'].expiration = parseInt(this.value) || null"></div>
        `;
    }

    ed.innerHTML += `
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

        ${dropTableHtml}

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

function selectRecipe(key) {
    renderItems();
    const ed = document.getElementById('item-editor');
    if (!ed) return;

    const recipe = target.catalog.recipes[key];
    if (!recipe.ingredients) recipe.ingredients = {};
    if (!recipe.result) recipe.result = { itemId: "", amount: 1 };

    // Рендеринг строк ингредиентов рецепта крафта
    let ingredientsRowsHtml = Object.keys(recipe.ingredients).map(ingKey => `
        <div style="display: grid; grid-template-columns: 2fr 1fr auto; gap: 10px; margin-bottom: 6px; align-items: center; background: rgba(255,255,255,0.01); padding: 5px; border-radius: 4px;">
            <select onchange="renameRecipeIngredient('${key}', '${ingKey}', this.value)">
                ${Object.keys(target.catalog?.items || {}).map(iKey => `
                    <option value="${iKey}" ${ingKey === iKey ? 'selected' : ''}>📦 ${iKey}</option>
                `).join('')}
            </select>
            <input type="number" value="${recipe.ingredients[ingKey] || 1}" oninput="target.catalog.recipes['${key}'].ingredients['${ingKey}'] = parseInt(this.value) || 1" placeholder="Amount">
            <button class="danger" style="padding: 4px 8px;" onclick="delete target.catalog.recipes['${key}'].ingredients['${ingKey}']; selectRecipe('${key}');">X</button>
        </div>
    `).join('');

    ed.innerHTML = `
        <div class="card-header-flex">
            <span class="card-title">Edit Crafting Recipe: ${key}</span>
            <button class="danger" onclick="deleteRecipe('${key}')">Delete Recipe</button>
        </div>
        
        <div class="form-grid">
            <div class="form-group">
                <label>Recipe Unique ID Key</label>
                <input type="text" value="${key}" onchange="renameRecipeKey('${key}', this.value)" style="font-family:monospace;">
            </div>
            <div class="form-group">
                <label>Gold Fabrication Cost</label>
                <input type="number" value="${recipe.gold_cost || 0}" oninput="target.catalog.recipes['${key}'].gold_cost = parseInt(this.value) || 0">
            </div>
        </div>

        <div class="sub-section" style="border-color: var(--accent-blue); margin-top:15px;">
            <div class="sub-section-title" style="color:var(--accent-blue);">🎁 Craft Result Target Item</div>
            <div class="form-grid" style="gap: 10px; margin-top: 10px;">
                <div class="form-group">
                    <label>Output Reward Item (itemId)</label>
                    <select onchange="target.catalog.recipes['${key}'].result.itemId = this.value">
                        <option value="">-- Select Output Item --</option>
                        ${Object.keys(target.catalog?.items || {}).map(iKey => `
                            <option value="${iKey}" ${recipe.result.itemId === iKey ? 'selected' : ''}>📦 ${iKey}</option>
                        `).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label>Output Stack Count (amount)</label>
                    <input type="number" value="${recipe.result.amount || 1}" oninput="target.catalog.recipes['${key}'].result.amount = parseInt(this.value) || 1">
                </div>
            </div>
        </div>

        <div class="sub-section" style="border-color: var(--accent-pink); margin-top:15px;">
            <div class="card-header-flex" style="border:none; padding:0; margin-bottom:10px;">
                <span class="sub-section-title" style="margin:0; color:var(--accent-pink);">📋 Required Material Ingredients</span>
                <button class="primary" style="padding: 2px 6px; font-size: 11px;" onclick="addNewRecipeIngredient('${key}');">+ Add Ingredient</button>
            </div>
            <div>${ingredientsRowsHtml || '<p style="font-size:11px; color:var(--text-muted); padding:5px; margin:0;">No materials assigned. Free craft.</p>'}</div>
        </div>
    `;
}

function addNewRecipeIngredient(recipeKey) {
    const availableItems = Object.keys(target.catalog?.items || {});
    const firstItem = availableItems.length > 0 ? availableItems[0] : "empty_item";
    if (!target.catalog.recipes[recipeKey].ingredients[firstItem]) {
        target.catalog.recipes[recipeKey].ingredients[firstItem] = 1;
    }
    selectRecipe(recipeKey);
}

function renameRecipeIngredient(recipeKey, oldIngKey, newIngKey) {
    if (!newIngKey || oldKey === newIngKey) return;
    target.catalog.recipes[recipeKey].ingredients[newIngKey] = target.catalog.recipes[recipeKey].ingredients[oldIngKey];
    delete target.catalog.recipes[recipeKey].ingredients[oldIngKey];
    selectRecipe(recipeKey);
}

function renameRecipeKey(oldKey, newKey) {
    if (!newKey || oldKey === newKey || target.catalog.recipes[newKey]) {
        renderItems();
        selectRecipe(oldKey);
        return;
    }
    target.catalog.recipes[newKey] = target.catalog.recipes[oldKey];
    delete target.catalog.recipes[oldKey];
    stateItemKey = newKey;
    selectRecipe(newKey);
}

function deleteRecipe(key) {
    if (!confirm(`Delete recipe: ${key}?`)) return;
    delete target.catalog.recipes[key];
    stateItemKey = null;
    document.getElementById('item-editor').innerHTML = '';
    renderItems();
}



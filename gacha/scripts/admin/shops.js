let currentShopSection = 'shops'; // 'shops' или 'pools'
let stateShopKey = null;
let currentShopSlotIdx = null; // Индекс открытого слота внутри витрины
let currentPoolItemIdx = null; // Индекс открытого элемента внутри пула

function switchShopSubTab(sectionId, evt) {
    currentShopSection = sectionId;
    stateShopKey = null;
    currentShopSlotIdx = null;
    currentPoolItemIdx = null;

    if (evt && evt.target && evt.target.parentElement) {
        evt.target.parentElement.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        evt.target.classList.add('active');
    }

    const titleElem = document.getElementById('shop-sidebar-title');
    if (titleElem) {
        titleElem.innerText = sectionId === 'shops' ? 'Shops Market' : 'Loot Pools Roster';
    }

    const ed = document.getElementById('shop-editor');
    if (ed) ed.innerHTML = '';

    renderShopsList();
}

function renderShopsList() {
    const list = document.getElementById('shop-list');
    if (!list) return;

    if (currentShopSection === 'shops') {
        if (!target.catalog.shops) target.catalog.shops = {};
        list.innerHTML = Object.keys(target.catalog.shops).map(key => {
            const shop = target.catalog.shops[key];
            return `
                <li class="crud-list-item ${stateShopKey === key ? 'active' : ''}" onclick="selectShopNode('${key}')">
                    <div style="display:flex; align-items:center; gap:8px;">
                        <span>🏪</span>
                        <span style="font-family:monospace; font-size:13px;">${key}</span>
                    </div>
                    <span class="badge" style="font-size:9px;">order: ${shop.order || 1}</span>
                </li>
            `;
        }).join('');
    } else {
        if (!target.catalog.shop_pools) target.catalog.shop_pools = {};
        list.innerHTML = Object.keys(target.catalog.shop_pools).map(key => `
            <li class="crud-list-item ${stateShopKey === key ? 'active' : ''}" onclick="selectShopNode('${key}')">
                <div style="display:flex; align-items:center; gap:8px;">
                    <span>🎲</span>
                    <span style="font-family:monospace; font-size:13px;">${key}</span>
                </div>
                <span class="badge" style="font-size:9px; background:var(--accent-blue);">${target.catalog.shop_pools[key].length} items</span>
            </li>
        `).join('');
    }
}

function selectShopNode(key) {
    stateShopKey = key;
    currentShopSlotIdx = null;
    currentPoolItemIdx = null;

    if (currentShopSection === 'shops') {
        selectShopMarket(key);
    } else {
        selectLootPool(key);
    }
}

function createNewShopOrPool() {
    if (currentShopSection === 'shops') {
        if (!target.catalog.shops) target.catalog.shops = {};
        const newKey = `new_shop_market_${Object.keys(target.catalog.shops).length}`;
        target.catalog.shops[newKey] = {
            title_loc: { en: "New Store Market", ru: "" },
            order: Object.keys(target.catalog.shops).length + 1,
            requirements: { player_level: 1, vip_level: 0 },
            refresh_settings: { auto_refresh_interval_ms: 0 },
            slots: []
        };
        selectShopNode(newKey);
    } else {
        if (!target.catalog.shop_pools) target.catalog.shop_pools = {};
        const newKey = `pool_new_goods_${Object.keys(target.catalog.shop_pools).length}`;
        target.catalog.shop_pools[newKey] = [];
        selectShopNode(newKey);
    }
}


function selectShopMarket(key) {
    renderShopsList();
    const ed = document.getElementById('shop-editor');
    if (!ed) return;

    const shop = target.catalog.shops[key];
    if (!shop.requirements) shop.requirements = { player_level: 1, vip_level: 0 };
    if (!shop.refresh_settings) shop.refresh_settings = { auto_refresh_interval_ms: 0 };
    if (!shop.slots) shop.slots = [];

    // Генерируем HTML для аккордеона слотов магазина
    let slotsListHtml = shop.slots.map((slot, sIdx) => {
        const isEditing = currentShopSlotIdx === sIdx;

        let slotEditorHtml = '';
        if (isEditing) {
            // Опции для привязки к пулам лута (если слот рандомный)
            const poolOptions = Object.keys(target.catalog?.shop_pools || {}).map(pKey =>
                `<option value="${pKey}" ${slot.poolId === pKey ? 'selected' : ''}>🎲 Pool: ${pKey}</option>`
            ).join('');

            // Опции для привязки к конкретному предмету (если слот статичный)
            const itemOptions = Object.keys(target.catalog?.items || {}).map(iKey =>
                `<option value="${iKey}" ${slot.itemId === iKey ? 'selected' : ''}>📦 Item: ${iKey}</option>`
            ).join('');

            slotEditorHtml = `
                <div class="sub-section" style="border-left: 2px solid var(--accent-pink); padding:12px; background: rgba(0,0,0,0.2); margin-top:10px; cursor:default;" onclick="event.stopPropagation();">
                    <div class="form-grid" style="gap: 8px;">
                        <div class="form-group">
                            <label>Slot Unique ID</label>
                            <input type="text" value="${slot.slotId || ''}" onchange="target.catalog.shops['${key}'].slots[${sIdx}].slotId = this.value; selectShopMarket('${key}');">
                        </div>
                        <div class="form-group">
                            <label>Generation Mode</label>
                            <select onchange="target.catalog.shops['${key}'].slots[${sIdx}].is_random = (this.value === 'true'); selectShopMarket('${key}');">
                                <option value="true" ${slot.is_random === true ? 'selected' : ''}>Random Item from Pool</option>
                                <option value="false" ${slot.is_random === false ? 'selected' : ''}>Static Item Definition</option>
                            </select>
                        </div>
            `;

            if (slot.is_random) {
                slotEditorHtml += `
                        <div class="form-group full-width">
                            <label>Linked Loot Pool ID</label>
                            <select onchange="target.catalog.shops['${key}'].slots[${sIdx}].poolId = this.value;">
                                <option value="">-- Select Drop Pool --</option>
                                ${poolOptions}
                            </select>
                        </div>
                `;
            } else {
                if (!slot.cost) slot.cost = { resource: "diamond", amount: 0 };
                if (!slot.old_cost) slot.old_cost = { resource: "diamond", amount: 0 };

                slotEditorHtml += `
                        <div class="form-group">
                            <label>Item Type Core Class</label>
                            <input type="text" value="${slot.item_type || 'item'}" oninput="target.catalog.shops['${key}'].slots[${sIdx}].item_type = this.value;">
                        </div>
                        <div class="form-group">
                            <label>Target Catalog Item</label>
                            <select onchange="target.catalog.shops['${key}'].slots[${sIdx}].itemId = this.value;">
                                <option value="">-- Select Item --</option>
                                ${itemOptions}
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Output Stack Amount</label>
                            <input type="number" value="${slot.amount || 1}" oninput="target.catalog.shops['${key}'].slots[${sIdx}].amount = parseInt(this.value) || 1;">
                        </div>
                        <div class="form-group">
                            <label>Cost Currency (Resource ID / usd)</label>
                            <input type="text" value="${slot.cost.resource || ''}" oninput="target.catalog.shops['${key}'].slots[${sIdx}].cost.resource = this.value;">
                        </div>
                        <div class="form-group">
                            <label>Active Sale Price Value</label>
                            <input type="number" step="any" value="${slot.cost.amount || 0}" oninput="target.catalog.shops['${key}'].slots[${sIdx}].cost.amount = parseFloat(this.value) || 0;">
                        </div>
                        <div class="form-group">
                            <label>Old Price Visual Value (Discount)</label>
                            <input type="number" step="any" value="${slot.old_cost?.amount || 0}" oninput="if(!target.catalog.shops['${key}'].slots[${sIdx}].old_cost) target.catalog.shops['${key}'].slots[${sIdx}].old_cost = {resource: slot.cost.resource, amount: 0}; target.catalog.shops['${key}'].slots[${sIdx}].old_cost.amount = parseFloat(this.value) || 0;">
                        </div>
                `;
            }

            slotEditorHtml += `
                        <div class="form-group">
                            <label>Buy Dynamic Account Limit</label>
                            <input type="number" value="${slot.buy_limit || 1}" oninput="target.catalog.shops['${key}'].slots[${sIdx}].buy_limit = parseInt(this.value) || 1;">
                        </div>
                    </div>
                </div>
            `;
        }

        return `
            <div style="margin-bottom: 8px; background: ${isEditing ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.01)'}; padding: 10px; border-radius: 6px; border: 1px solid ${isEditing ? 'var(--accent-pink)' : 'var(--border-color)'};">
                <div class="element-row" style="margin:0; border:none; padding:0; background:transparent;">
                    <div class="element-info" style="cursor:pointer; width: 100%; display: flex; align-items: center; gap: 10px;" onclick="currentShopSlotIdx = (currentShopSlotIdx === ${sIdx} ? null : ${sIdx}); selectShopMarket('${key}');">
                        <span class="badge" style="background:${isEditing ? 'var(--accent-pink)' : 'var(--bg-main)'}; font-family:monospace; min-width: 80px; text-align: center;">
                            ${isEditing ? '🔽 ' : '▶️ '} ${slot.slotId || 'unnamed_slot'}
                        </span>
                        <span style="font-size:11px; color:var(--text-muted);">mode: <b>${slot.is_random ? 'Random Pool' : 'Static Result'}</b></span>
                        ${slot.poolId ? `<span style="font-size:11px; color:var(--text-muted);">pool: <b>${slot.poolId}</b></span>` : ''}
                        ${slot.itemId ? `<span style="font-size:11px; color:var(--text-muted);">item: <b>${slot.itemId}</b></span>` : ''}
                    </div>
                    <div class="element-actions">
                        <button class="btn-sm btn-danger" onclick="event.stopPropagation(); target.catalog.shops['${key}'].slots.splice(${sIdx}, 1); currentShopSlotIdx = null; selectShopMarket('${key}');">Delete</button>
                    </div>
                </div>
                ${slotEditorHtml}
            </div>
        `;
    }).join('');

    ed.innerHTML = `
        <div class="card-header-flex">
            <span class="card-title">Edit Store Market View: ${key}</span>
            <button class="danger" onclick="delete target.catalog.shops['${key}']; stateShopKey = null; document.getElementById('shop-editor').innerHTML = ''; renderShopsList();">Delete Store</button>
        </div>
        
                <div class="form-grid">
            <div class="form-group"><label>Store Dictionary ID Key</label><input type="text" value="${key}" onchange="renameStoreKey('${key}', this.value)"></div>
            <div class="form-group"><label>Display Grid Order Position</label><input type="number" value="${shop.order || 1}" oninput="target.catalog.shops['${key}'].order = parseInt(this.value) || 1; renderShopsList();"></div>
            <div class="form-group"><label>Required Account Player Level</label><input type="number" value="${shop.requirements.player_level || 1}" oninput="target.catalog.shops['${key}'].requirements.player_level = parseInt(this.value) || 1"></div>
            <div class="form-group"><label>Required Minimum VIP Tier Status</label><input type="number" value="${shop.requirements.vip_level || 0}" oninput="target.catalog.shops['${key}'].requirements.vip_level = parseInt(this.value) || 0"></div>
            <div class="form-group"><label>Auto Refresh Interval Loop (ms, 0=Static)</label><input type="number" value="${shop.refresh_settings.auto_refresh_interval_ms || 0}" oninput="target.catalog.shops['${key}'].refresh_settings.auto_refresh_interval_ms = parseInt(this.value) || 0"></div>
            <div class="form-group"><label>Manual Forced Reset Currency (Resource ID)</label><input type="text" value="${shop.refresh_settings.manual_refresh_cost?.resource || ''}" oninput="if(!target.catalog.shops['${key}'].refresh_settings.manual_refresh_cost) target.catalog.shops['${key}'].refresh_settings.manual_refresh_cost={resource:'',amount:0}; target.catalog.shops['${key}'].refresh_settings.manual_refresh_cost.resource = this.value;"></div>
            <div class="form-group"><label>Manual Forced Reset Price Token Value</label><input type="number" value="${shop.refresh_settings.manual_refresh_cost?.amount || 0}" oninput="if(!target.catalog.shops['${key}'].refresh_settings.manual_refresh_cost) target.catalog.shops['${key}'].refresh_settings.manual_refresh_cost={resource:'',amount:0}; target.catalog.shops['${key}'].refresh_settings.manual_refresh_cost.amount = parseInt(this.value) || 0;"></div>
        </div>

        <div class="form-grid" style="margin-top:12px;">
            <div class="form-group"><label>Store Title (Localization EN)</label><input type="text" value="${shop.title_loc?.en || ''}" oninput="target.catalog.shops['${key}'].title_loc.en = this.value;"></div>
            <div class="form-group"><label>Store Title (Localization RU)</label><input type="text" value="${shop.title_loc?.ru || ''}" oninput="target.catalog.shops['${key}'].title_loc.ru = this.value;"></div>
        </div>

        <div class="sub-section" style="border-color: var(--accent-pink); margin-top:20px;">
            <div class="card-header-flex" style="border:none; padding:0; margin-bottom:12px;">
                <span class="sub-section-title" style="margin:0; color:var(--accent-pink);">📋 Store Frontcase Items Grid Slots</span>
                <button class="primary" style="padding: 2px 8px; font-size: 11px;" onclick="target.catalog.shops['${key}'].slots.push({slotId:'slot_'+Date.now().toString().slice(-4), is_random:true, poolId:'', buy_limit:1}); selectShopMarket('${key}');">+ Add Slot Node</button>
            </div>
            <div style="margin-top: 10px;">${slotsListHtml || '<p style="font-size:11px; color:var(--text-muted); padding:5px; margin:0;">Store contains no sellable display slots</p>'}</div>
        </div>
    `;
}

function renameStoreKey(oldKey, newKey) {
    if (!newKey || oldKey === newKey || target.catalog.shops[newKey]) {
        renderShopsList();
        selectShopMarket(oldKey);
        return;
    }
    target.catalog.shops[newKey] = target.catalog.shops[oldKey];
    delete target.catalog.shops[oldKey];
    stateShopKey = newKey;
    selectShopMarket(newKey);
}

function selectLootPool(key) {
    renderShopsList();
    const ed = document.getElementById('shop-editor');
    if (!ed) return;

    const pool = target.catalog.shop_pools[key] || [];

    let poolItemsHtml = pool.map((item, pIdx) => {
        const isEditing = currentPoolItemIdx === pIdx;
        let itemEditorHtml = '';

        if (isEditing) {
            if (!item.cost) item.cost = { resource: "gold", amount: 0 };
            const itemOptions = Object.keys(target.catalog?.items || {}).map(iKey =>
                `<option value="${iKey}" ${item.itemId === iKey ? 'selected' : ''}>📦 Item: ${iKey}</option>`
            ).join('');

            itemEditorHtml = `
                <div class="sub-section" style="border-left: 2px solid var(--accent-blue); padding:12px; background: rgba(0,0,0,0.2); margin-top:10px; cursor:default;" onclick="event.stopPropagation();">
                    <div class="form-grid" style="gap: 8px;">
                        <div class="form-group">
                            <label>Core Asset Type</label>
                            <input type="text" value="${item.item_type || 'item'}" oninput="target.catalog.shop_pools['${key}'][${pIdx}].item_type = this.value;">
                        </div>
                        <div class="form-group">
                            <label>Catalog Item Link</label>
                            <select onchange="target.catalog.shop_pools['${key}'][${pIdx}].itemId = this.value;">
                                <option value="">-- Select Item --</option>
                                ${itemOptions}
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Stack Drop Amount</label>
                            <input type="number" value="${item.amount || 1}" oninput="target.catalog.shop_pools['${key}'][${pIdx}].amount = parseInt(this.value) || 1;">
                        </div>
                        <div class="form-group">
                            <label>Drop Weight / Probability</label>
                            <input type="number" value="${item.weight || 100}" oninput="target.catalog.shop_pools['${key}'][${pIdx}].weight = parseInt(this.value) || 100;">
                        </div>
                        <div class="form-group">
                            <label>Purchase Currency (Resource Key)</label>
                            <input type="text" value="${item.cost.resource || ''}" oninput="target.catalog.shop_pools['${key}'][${pIdx}].cost.resource = this.value;">
                        </div>
                        <div class="form-group">
                            <label>Price Value</label>
                            <input type="number" value="${item.cost.amount || 0}" oninput="target.catalog.shop_pools['${key}'][${pIdx}].cost.amount = parseInt(this.value) || 0;">
                        </div>
                    </div>
                </div>
            `;
        }

        return `
            <div style="margin-bottom: 8px; background: ${isEditing ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.01)'}; padding: 10px; border-radius: 6px; border: 1px solid ${isEditing ? 'var(--accent-blue)' : 'var(--border-color)'};">
                <div class="element-row" style="margin:0; border:none; padding:0; background:transparent;">
                    <div class="element-info" style="cursor:pointer; width: 100%; display: flex; align-items: center; gap: 10px;" onclick="currentPoolItemIdx = (currentPoolItemIdx === ${pIdx} ? null : ${pIdx}); selectLootPool('${key}');">
                        <span class="badge" style="background:${isEditing ? 'var(--accent-blue)' : 'var(--bg-main)'}; font-family:monospace; min-width: 80px; text-align: center;">
                            ${isEditing ? '🔽 ' : '▶️ '} ${item.itemId || 'unnamed_item'}
                        </span>
                        <span style="font-size:11px; color:var(--text-muted);">weight: <b>${item.weight || 100}</b></span>
                        <span style="font-size:11px; color:var(--text-muted);">price: <b>${item.cost?.amount || 0} ${item.cost?.resource || ''}</b></span>
                    </div>
                    <div class="element-actions">
                        <button class="btn-sm btn-danger" onclick="event.stopPropagation(); target.catalog.shop_pools['${key}'].splice(${pIdx}, 1); currentPoolItemIdx = null; selectLootPool('${key}');">Delete</button>
                    </div>
                </div>
                ${itemEditorHtml}
            </div>
        `;
    }).join('');

    ed.innerHTML = `
        <div class="card-header-flex">
            <span class="card-title">Edit Random Generation Pool: ${key}</span>
            <button class="danger" onclick="delete target.catalog.shop_pools['${key}']; stateShopKey = null; document.getElementById('shop-editor').innerHTML = ''; renderShopsList();">Delete Pool</button>
        </div>
        <div class="form-grid">
            <div class="form-group full-width">
                <label>Pool Unique ID Key String</label>
                <input type="text" value="${key}" onchange="renamePoolKey('${key}', this.value)" style="font-family:monospace;">
            </div>
        </div>

        <div class="sub-section" style="border-color: var(--accent-blue); margin-top:20px;">
            <div class="card-header-flex" style="border:none; padding:0; margin-bottom:12px;">
                <span class="sub-section-title" style="margin:0; color:var(--accent-blue);">🎁 Pool Item Content Drop Options</span>
                <button class="primary" style="padding: 2px 8px; font-size: 11px;" onclick="target.catalog.shop_pools['${key}'].push({item_type:'item', itemId:'', amount:1, weight:100, cost:{resource:'gold',amount:1000}}); selectLootPool('${key}');">+ Add Pool Item</button>
            </div>
            <div style="margin-top: 10px;">${poolItemsHtml || '<p style="font-size:11px; color:var(--text-muted); padding:5px; margin:0;">Pool is empty</p>'}</div>
        </div>
    `;
}

function renamePoolKey(oldKey, newKey) {
    if (!newKey || oldKey === newKey || target.catalog.shop_pools[newKey]) {
        renderShopsList();
        selectLootPool(oldKey);
        return;
    }
    target.catalog.shop_pools[newKey] = target.catalog.shop_pools[oldKey];
    delete target.catalog.shop_pools[oldKey];
    stateShopKey = newKey;
    selectLootPool(newKey);
}


// scripts/admin/battle_passes.js — ЧАСТЬ 1 ИЗ 2
let stateBpKey = null;         // ID выбранного баттл-пасса (например, 'bp_standard_season_1')
let currentBpLevelIdx = null;  // Индекс открытого аккордеона уровня внутри матрицы БП

function renderBattlePassesList() {
    const list = document.getElementById('bp-list');
    if (!list) return;

    // Инициализируем корневой узел каталога БП, если его нет в JSON-конфиге
    if (!target.battle_passes) {
        target.battle_passes = {};
    }

    list.innerHTML = Object.keys(target.battle_passes).map(key => {
        const bp = target.battle_passes[key];
        const maxLvl = bp.max_levels || 50;
        return `
            <li class="crud-list-item ${stateBpKey === key ? 'active' : ''}" onclick="selectBpNode('${key}')">
                <div style="display:flex; align-items:center; gap:8px;">
                    <span>🎟️</span>
                    <span style="font-family:monospace; font-size:13px;">${key}</span>
                </div>
                <span class="badge" style="font-size:9px;">Cap: ${maxLvl} Lvl</span>
            </li>
        `;
    }).join('');
}

function selectBpNode(key) {
    stateBpKey = key;
    currentBpLevelIdx = null; // Сбрасываем выбранный уровень при смене пасса
    renderBpForm(key);
}

function createNewBattlePass() {
    if (!target.battle_passes) target.battle_passes = {};
    const count = Object.keys(target.battle_passes).length;
    const newKey = `bp_custom_season_${count + 1}`;

    target.battle_passes[newKey] = {
        title_loc: { en: "New Battle Pass Season", ru: "" },
        points_item_id: "scroll_epic", // Дефолтная привязка к билетам/валюте
        points_per_level: 100,
        max_levels: 50,
        premium_unlock_cost: { resource: "usd", amount: 9.99 },
        levels_matrix: []
    };

    stateBpKey = newKey;
    renderBattlePassesList();
    selectBpNode(newKey);
}

function renderBpForm(key) {
    renderBattlePassesList();
    const ed = document.getElementById('bp-editor');
    if (!ed || !key) return;

    const bp = target.battle_passes[key];
    if (!bp.title_loc) bp.title_loc = { en: "", ru: "" };
    if (!bp.premium_unlock_cost) bp.premium_unlock_cost = { resource: "usd", amount: 9.99 };
    if (!bp.levels_matrix) bp.levels_matrix = [];

    // Выпадающий список предметов каталога для честной привязки валюты опыта БП
    const itemOptions = Object.keys(target.catalog?.items || {}).map(iKey =>
        `<option value="${iKey}" ${bp.points_item_id === iKey ? 'selected' : ''}>📦 Item: ${iKey}</option>`
    ).join('');

    // Выпадающий список валют/ресурсов для оплаты премиум-версии (usd или алмазы)
    const currencyOptions = [
        `<option value="usd" ${bp.premium_unlock_cost.resource === 'usd' ? 'selected' : ''}>💵 Real Currency (USD)</option>`,
        ...Object.keys(target.mechanics?.resources || {}).map(rKey =>
        `<option value="${rKey}" ${bp.premium_unlock_cost.resource === rKey ? 'selected' : ''}>🔮 Resource: ${rKey}</option>`
    )
].join('');

    ed.innerHTML = `
        <div class="card-header-flex">
            <span class="card-title">Edit Battle Pass Framework: ${key}</span>
            <button class="danger" onclick="delete target.battle_passes['${key}']; stateBpKey = null; document.getElementById('bp-editor').innerHTML = ''; renderBattlePassesList();">Delete Entire Pass</button>
        </div>
        
        <div class="form-grid">
            <div class="form-group">
                <label>Battle Pass Unique ID Key</label>
                <input type="text" value="${key}" onchange="renameBpKey('${key}', this.value)" style="font-family:monospace;">
            </div>
            <div class="form-group">
                <label>Experience Token Currency (points_item_id)</label>
                <select onchange="target.battle_passes['${key}'].points_item_id = this.value;">
                    <option value="">-- Select Item Token --</option>
                    ${itemOptions}
                </select>
            </div>
            <div class="form-group">
                <label>Required Points Per Level Up</label>
                <input type="number" value="${bp.points_per_level || 100}" oninput="target.battle_passes['${key}'].points_per_level = parseInt(this.value) || 100;">
            </div>
            <div class="form-group">
                <label>Maximum Milestone Levels Cap</label>
                <input type="number" value="${bp.max_levels || 50}" oninput="target.battle_passes['${key}'].max_levels = parseInt(this.value) || 50; renderBattlePassesList();">
            </div>
            <div class="form-group">
                <label>Premium Track Activation Currency</label>
                <select onchange="target.battle_passes['${key}'].premium_unlock_cost.resource = this.value;">
                    ${currencyOptions}
                </select>
            </div>
            <div class="form-group">
                <label>Premium Track Price Value</label>
                <input type="number" step="any" value="${bp.premium_unlock_cost.amount || 0}" oninput="target.battle_passes['${key}'].premium_unlock_cost.amount = parseFloat(this.value) || 0;">
            </div>
        </div>

        <div class="form-grid" style="margin-top:12px;">
            <div class="form-group"><label>Season Title (Localization EN)</label><input type="text" value="${bp.title_loc.en || ''}" oninput="target.battle_passes['${key}'].title_loc.en = this.value;"></div>
            <div class="form-group"><label>Season Title (Localization RU)</label><input type="text" value="${bp.title_loc.ru || ''}" oninput="target.battle_passes['${key}'].title_loc.ru = this.value;"></div>
        </div>

        <!-- АНКОР ДЛЯ МАТРИЦЫ УРОВНЕЙ БП (МЫ ИНЖЕКТИРУЕМ ЕГО ИЗ ЧАСТИ 2) -->
        <div id="bp-levels-matrix-anchor"></div>
    `;

    if (typeof renderBpLevelsMatrix === 'function') {
        renderBpLevelsMatrix(key, bp);
    }
}

function renameBpKey(oldKey, newKey) {
    if (!newKey || oldKey === newKey || target.battle_passes[newKey]) {
        renderBattlePassesList();
        renderBpForm(oldKey);
        return;
    }
    target.battle_passes[newKey] = target.battle_passes[oldKey];
    delete target.battle_passes[oldKey];
    stateBpKey = newKey;
    renderBattlePassesList();
    renderBpForm(newKey);
}


// scripts/admin/battle_passes.js — ЧАСТЬ 2 ИЗ 2 (ФИНАЛ МОДУЛЯ)
function renderBpLevelsMatrix(key, bp) {
    const anchor = document.getElementById('bp-levels-matrix-anchor');
    if (!anchor) return;

    // Сортируем матрицу уровней по возрастанию, чтобы админу было удобно
    bp.levels_matrix.sort((a, b) => (a.level || 0) - (b.level || 0));

    let levelsHtml = bp.levels_matrix.map((row, lIdx) => {
        const isEditing = currentBpLevelIdx === lIdx;
        let levelEditorHtml = '';

        if (isEditing) {
            levelEditorHtml = `
                <div class="sub-section" style="border-left: 2px solid var(--accent-pink); padding:12px; background: rgba(0,0,0,0.2); margin-top:10px; cursor:default;" onclick="event.stopPropagation();">
                    <div class="form-grid" style="gap: 8px;">
                        <div class="form-group full-width">
                            <label>Target Unlock Milestone Level</label>
                            <input type="number" value="${row.level || 1}" oninput="target.battle_passes['${key}'].levels_matrix[${lIdx}].level = parseInt(this.value) || 1;">
                        </div>
                        <div class="form-group">
                            <label>🆓 Free Track Rewards (Direct JSON Editor)</label>
                            <textarea style="width:100%; height:85px; font-family:monospace; font-size:11px; margin-top:4px;" oninput="try{target.battle_passes['${key}'].levels_matrix[${lIdx}].free_rewards = JSON.parse(this.value); this.style.borderColor='var(--border-color)';}catch(e){this.style.borderColor='var(--accent-red)';}">${JSON.stringify(row.free_rewards || {resources:{},items:[]}, null, 4)}</textarea>
                        </div>
                        <div class="form-group">
                            <label>👑 Premium Track Rewards (Direct JSON Editor)</label>
                            <textarea style="width:100%; height:85px; font-family:monospace; font-size:11px; margin-top:4px;" oninput="try{target.battle_passes['${key}'].levels_matrix[${lIdx}].premium_rewards = JSON.parse(this.value); this.style.borderColor='var(--border-color)';}catch(e){this.style.borderColor='var(--accent-red)';}">${JSON.stringify(row.premium_rewards || {resources:{},items:[],skins:[]}, null, 4)}</textarea>
                        </div>
                    </div>
                    <p style="font-size:10px; color:var(--text-muted); margin-top:5px; margin-bottom:0;">💡 Format structure: {"resources": {"diamond": 100}, "items": [{"itemId": "scroll_epic", "amount": 1}], "skins": [{"hero_id": "eleniel", "skin_id": "eleniel_skin_beach"}]}</p>
                </div>
            `;
        }

        return `
            <div style="margin-bottom: 8px; background: ${isEditing ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.01)'}; padding: 10px; border-radius: 6px; border: 1px solid ${isEditing ? 'var(--accent-pink)' : 'var(--border-color)'};">
                <div class="element-row" style="margin:0; border:none; padding:0; background:transparent;">
                    <div class="element-info" style="cursor:pointer; width: 100%; display: flex; align-items: center; gap: 10px;" onclick="currentBpLevelIdx = (currentBpLevelIdx === ${lIdx} ? null : ${lIdx}); renderBpForm('${key}');">
                        <span class="badge" style="background:${isEditing ? 'var(--accent-pink)' : 'var(--bg-main)'}; font-family:monospace; min-width: 80px; text-align: center;">
                            ${isEditing ? '🔽 ' : '▶️ '} Level ${row.level || 1}
                        </span>
                        <span style="font-size:11px; color:var(--text-muted);">Free payloads: <b>${Object.keys(row.free_rewards?.resources || {}).length + (row.free_rewards?.items?.length || 0)} nodes</b></span>
                        <span style="font-size:11px; color:var(--text-muted);">Premium payloads: <b>${Object.keys(row.premium_rewards?.resources || {}).length + (row.premium_rewards?.items?.length || 0) + (row.premium_rewards?.skins?.length || 0)} nodes</b></span>
                    </div>
                    <div class="element-actions">
                        <button class="btn-sm btn-danger" onclick="event.stopPropagation(); target.battle_passes['${key}'].levels_matrix.splice(${lIdx}, 1); currentBpLevelIdx = null; renderBpForm('${key}');">Delete</button>
                    </div>
                </div>
                ${levelEditorHtml}
            </div>
        `;
    }).join('');

    anchor.outerHTML = `
        <div class="sub-section" style="border-color: var(--accent-pink); margin-top:20px;">
            <div class="card-header-flex" style="border:none; padding:0; margin-bottom:12px;">
                <span class="sub-section-title" style="margin:0; color:var(--accent-pink);">📋 Seasonal Levels & Track Payout Milestones</span>
                <button class="primary" style="padding: 2px 8px; font-size: 11px;" onclick="const nLvl=target.battle_passes['${key}'].levels_matrix.length+1; target.battle_passes['${key}'].levels_matrix.push({level: nLvl, free_rewards: {resources:{gold:1000}}, premium_rewards: {resources:{diamond:50}}}); currentBpLevelIdx=target.battle_passes['${key}'].levels_matrix.length-1; renderBpForm('${key}');">+ Add Level Milestone</button>
            </div>
            <div style="margin-top: 10px;">${levelsHtml || '<p style="font-size:11px; color:var(--text-muted); padding:5px; margin:0;">No level milestones assigned. Players will get no leveling track prizes.</p>'}</div>
        </div>
    `;
}

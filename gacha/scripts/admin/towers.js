let currentTowerSection = 'towers'; // 'towers' или 'floors'
let stateTowerKey = null; // ID выбранной башни (например, 'main_tower')
let stateFloorKey = null; // ID выбранного этажа (например, 'floor_1')
let currentTowerEnemyIdx = null; // Индекс открытого врага в аккордеоне
let currentTowerRewardItemIdx = null; // Индекс открытого предмета в наградах

function switchTowerSubTab(sectionId, evt) {
    currentTowerSection = sectionId;
    stateFloorKey = null;
    currentTowerEnemyIdx = null;
    currentTowerRewardItemIdx = null;

    if (evt && evt.target && evt.target.parentElement) {
        evt.target.parentElement.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        evt.target.classList.add('active');
    }

    const titleElem = document.getElementById('tower-sidebar-title');
    if (titleElem) {
        titleElem.innerText = sectionId === 'towers' ? 'Towers Catalog' : 'Tower Floors List';
    }

    const ed = document.getElementById('tower-editor');
    if (ed) ed.innerHTML = '';

    renderTowersList();
}

function renderTowersList() {
    const list = document.getElementById('tower-list');
    if (!list) return;

    if (!target.pve_towers) target.pve_towers = {};
    const sidebarHeader = document.querySelector('#view-towers .crud-sidebar-header button');

    if (currentTowerSection === 'towers') {
        if (sidebarHeader) sidebarHeader.style.display = 'block';
        list.innerHTML = Object.keys(target.pve_towers).map(key => {
            const tower = target.pve_towers[key];
            const floorCount = Object.keys(tower.floors || {}).length;
            return `
                <li class="crud-list-item ${stateTowerKey === key ? 'active' : ''}" onclick="stateTowerKey='${key}'; selectTowerNode('towers');">
                    <div style="display:flex; align-items:center; gap:8px;">
                        <span> Olympus Tower 🏰</span>
                        <span style="font-family:monospace; font-size:13px;">${key}</span>
                    </div>
                    <span class="badge" style="font-size:9px;">${floorCount} floors</span>
                </li>
            `;
        }).join('');
    } else {
        // ОТОБРАЖЕНИЕ СПИСКА ЭТАЖЕЙ В САЙДБАРЕ
        if (sidebarHeader) sidebarHeader.style.display = 'block';
        if (!stateTowerKey) {
            list.innerHTML = '<p style="font-size:11px; color:var(--text-muted); padding:10px;">Select a tower from catalog first</p>';
            if (sidebarHeader) sidebarHeader.style.display = 'none';
            return;
        }
        const floors = target.pve_towers[stateTowerKey]?.floors || {};
        list.innerHTML = Object.keys(floors).map(key => `
            <li class="crud-list-item ${stateFloorKey === key ? 'active' : ''}" onclick="stateFloorKey='${key}'; selectTowerNode('floors');">
                <div style="display:flex; align-items:center; gap:8px;">
                    <span> Floor 🪜</span>
                    <span style="font-family:monospace; font-size:13px;">${key}</span>
                </div>
            </li>
        `).join('');
    }
}

function selectTowerNode(section) {
    currentTowerEnemyIdx = null;
    currentTowerRewardItemIdx = null;

    if (section === 'towers') {
        renderTowerCatalogForm(stateTowerKey);
    } else {
        renderTowerFloorForm(stateTowerKey, stateFloorKey);
    }
}

function createNewTowerOrFloor() {
    if (currentTowerSection === 'towers') {
        const newKey = `new_tower_${Object.keys(target.pve_towers).length + 1}`;
        target.pve_towers[newKey] = {
            title_loc: { en: "New Tower Trial", ru: "" },
            floors: {}
        };
        stateTowerKey = newKey;
        switchTowerSubTab('towers');
    } else {
        if (!stateTowerKey) return;
        if (!target.pve_towers[stateTowerKey].floors) target.pve_towers[stateTowerKey].floors = {};
        const floors = target.pve_towers[stateTowerKey].floors;
        const newKey = `floor_${Object.keys(floors).length + 1}`;
        floors[newKey] = {
            enemies: [],
            rewards: { resources: { gold: 0, diamond: 0 }, items: [] }
        };
        stateFloorKey = newKey;
        switchTowerSubTab('floors');
    }
}

function renderTowerCatalogForm(towerKey) {
    renderTowersList();
    const ed = document.getElementById('tower-editor');
    if (!ed || !towerKey) return;

    const tower = target.pve_towers[towerKey];
    if (!tower.title_loc) tower.title_loc = JSON.parse(JSON.stringify(BASE_LANGUAGES));

    ed.innerHTML = `
        <div class="card-header-flex">
            <span class="card-title">Edit Tower Meta: ${towerKey}</span>
            <button class="danger" onclick="delete target.pve_towers['${towerKey}']; stateTowerKey = null; document.getElementById('tower-editor').innerHTML = ''; renderTowersList();">Delete Entire Tower</button>
        </div>
        <div class="form-grid" style="margin-top:15px;">
            <div class="form-group full-width"><label>Tower Unique ID Key</label><input type="text" value="${towerKey}" onchange="renameTowerKey('${towerKey}', this.value)"></div>
            <div class="form-group"><label>Tower Title (Localization EN)</label><input type="text" value="${tower.title_loc.en || ''}" oninput="target.pve_towers['${towerKey}'].title_loc.en = this.value;"></div>
            <div class="form-group"><label>Tower Title (Localization RU)</label><input type="text" value="${tower.title_loc.ru || ''}" oninput="target.pve_towers['${towerKey}'].title_loc.ru = this.value;"></div>
        </div>
    `;
}

function renameTowerKey(oldKey, newKey) {
    if (!newKey || oldKey === newKey || target.pve_towers[newKey]) {
        renderTowersList();
        renderTowerCatalogForm(oldKey);
        return;
    }
    target.pve_towers[newKey] = target.pve_towers[oldKey];
    delete target.pve_towers[oldKey];
    stateTowerKey = newKey;
    renderTowersList();
    renderTowerCatalogForm(newKey);
}

// ПОЛНОЦЕННЫЙ ИНСПЕКТОР ЭТАЖЕЙ БАШНИ: ВРАГИ И НАГРАДЫ
function renderTowerFloorForm(towerKey, floorKey) {
    renderTowersList();
    const ed = document.getElementById('tower-editor');
    if (!ed || !towerKey || !floorKey) return;

    const floor = target.pve_towers[towerKey].floors[floorKey];
    if (!floor.enemies) floor.enemies = [];
    if (!floor.rewards) floor.rewards = { resources: { gold: 0, diamond: 0 }, items: [] };
    if (!floor.rewards.items) floor.rewards.items = [];
    if (!floor.rewards.resources) floor.rewards.resources = { gold: 0, diamond: 0 };

    // 1. Сборка аккордеона врагов (enemies) для конкретного этажа
    let enemiesListHtml = floor.enemies.map((enemy, eIdx) => {
        const isEditing = currentTowerEnemyIdx === eIdx;
        let enemyEditorHtml = '';

        if (isEditing) {
            enemyEditorHtml = `
                <div class="sub-section" style="border-left: 2px solid var(--accent-blue); padding:12px; background: rgba(0,0,0,0.2); margin-top:10px; cursor:default;" onclick="event.stopPropagation();">
                    <div class="form-grid" style="gap: 8px;">
                        <div class="form-group">
                            <label>Target Hero Unit ID</label>
                            <select onchange="target.pve_towers['${towerKey}'].floors['${floorKey}'].enemies[${eIdx}].hero_id = this.value; renderTowerFloorForm('${towerKey}', '${floorKey}');">
                                <option value="">-- Select Enemy Unit --</option>
                                ${Object.keys(target.catalog?.heroes || {}).map(hk => `
                                    <option value="${hk}" ${enemy.hero_id === hk ? 'selected' : ''}>🦸 ${hk}</option>
                                `).join('')}
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Combat Unit Level</label>
                            <input type="number" value="${enemy.level || 1}" oninput="target.pve_towers['${towerKey}'].floors['${floorKey}'].enemies[${eIdx}].level = parseInt(this.value) || 1;">
                        </div>
                        <div class="form-group">
                            <label>Star Tier Promotion</label>
                            <input type="number" value="${enemy.stars || 1}" oninput="target.pve_towers['${towerKey}'].floors['${floorKey}'].enemies[${eIdx}].stars = parseInt(this.value) || 1;">
                        </div>
                        <div class="form-group">
                            <label>Grid Formation Slot (position)</label>
                            <input type="number" value="${enemy.position !== undefined ? enemy.position : 0}" oninput="target.pve_towers['${towerKey}'].floors['${floorKey}'].enemies[${eIdx}].position = parseInt(this.value) || 0;">
                        </div>
                    </div>
                </div>
            `;
        }

        return `
            <div style="margin-bottom: 8px; background: ${isEditing ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.01)'}; padding: 10px; border-radius: 6px; border: 1px solid ${isEditing ? 'var(--accent-blue)' : 'var(--border-color)'};">
                <div class="element-row" style="margin:0; border:none; padding:0; background:transparent;">
                    <div class="element-info" style="cursor:pointer; width: 100%; display: flex; align-items: center; gap: 10px;" onclick="currentTowerEnemyIdx = (currentTowerEnemyIdx === ${eIdx} ? null : ${eIdx}); renderTowerFloorForm('${towerKey}', '${floorKey}');">
                        <span class="badge" style="background:${isEditing ? 'var(--accent-blue)' : 'var(--bg-main)'}; font-family:monospace; min-width: 80px; text-align: center;">
                            ${isEditing ? '🔽 ' : '▶️ '} Slot: ${enemy.position !== undefined ? enemy.position : 0}
                        </span>
                        <span style="font-size:11px; color:var(--text-muted);">unit: <b>${enemy.hero_id || 'empty'}</b></span>
                        <span style="font-size:11px; color:var(--text-muted);">Lvl: <b>${enemy.level || 1}</b></span>
                        <span style="font-size:11px; color:var(--text-muted);">Stars: <b>${enemy.stars || 1}</b></span>
                    </div>
                    <div class="element-actions">
                        <button class="btn-sm btn-danger" onclick="event.stopPropagation(); target.pve_towers['${towerKey}'].floors['${floorKey}'].enemies.splice(${eIdx}, 1); currentTowerEnemyIdx = null; renderTowerFloorForm('${towerKey}', '${floorKey}');">Delete</button>
                    </div>
                </div>
                ${enemyEditorHtml}
            </div>
        `;
    }).join('');

    // 2. Сборка аккордеона предметов в наградах (rewards.items)
    let rewardItemsHtml = floor.rewards.items.map((rew, rIdx) => {
        const isEditing = currentTowerRewardItemIdx === rIdx;
        let rewEditorHtml = '';

        if (isEditing) {
            rewEditorHtml = `
                <div class="sub-section" style="border-left: 2px solid var(--accent-pink); padding:12px; background: rgba(0,0,0,0.2); margin-top:10px; cursor:default;" onclick="event.stopPropagation();">
                    <div class="form-grid" style="gap: 8px;">
                        <div class="form-group">
                            <label>Reward Item Link (itemId)</label>
                            <select onchange="target.pve_towers['${towerKey}'].floors['${floorKey}'].rewards.items[${rIdx}].itemId = this.value;">
                                <option value="">-- Select Item --</option>
                                ${Object.keys(target.catalog?.items || {}).map(iKey => `
                                    <option value="${iKey}" ${rew.itemId === iKey ? 'selected' : ''}>📦 ${iKey}</option>
                                `).join('')}
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Stack Count (amount)</label>
                            <input type="number" value="${rew.amount || 1}" oninput="target.pve_towers['${towerKey}'].floors['${floorKey}'].rewards.items[${rIdx}].amount = parseInt(this.value) || 1;">
                        </div>
                        <div class="form-group">
                            <label>Drop Probability (chance 0.0 - 1.0)</label>
                            <input type="number" step="0.01" min="0" max="1" value="${rew.chance !== undefined ? rew.chance : 1.0}" oninput="target.pve_towers['${towerKey}'].floors['${floorKey}'].rewards.items[${rIdx}].chance = parseFloat(this.value) || 0.0;">
                        </div>
                    </div>
                </div>
            `;
        }

        return `
            <div style="margin-bottom: 8px; background: ${isEditing ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.01)'}; padding: 10px; border-radius: 6px; border: 1px solid ${isEditing ? 'var(--accent-pink)' : 'var(--border-color)'};">
                <div class="element-row" style="margin:0; border:none; padding:0; background:transparent;">
                    <div class="element-info" style="cursor:pointer; width: 100%; display: flex; align-items: center; gap: 10px;" onclick="currentTowerRewardItemIdx = (currentTowerRewardItemIdx === ${rIdx} ? null : ${rIdx}); renderTowerFloorForm('${towerKey}', '${floorKey}');">
                        <span class="badge" style="background:${isEditing ? 'var(--accent-pink)' : 'var(--bg-main)'}; font-family:monospace; min-width: 80px; text-align: center;">
                            ${isEditing ? '🔽 ' : '▶️ '} Item Link
                        </span>
                        <span style="font-size:11px; color:var(--text-muted);">itemId: <b>${rew.itemId || 'empty'}</b></span>
                        <span style="font-size:11px; color:var(--text-muted);">count: <b>${rew.amount || 1}</b></span>
                        <span style="font-size:11px; color:var(--text-muted);">chance: <b>${((rew.chance || 0) * 100).toFixed(0)}%</b></span>
                    </div>
                    <div class="element-actions">
                        <button class="btn-sm btn-danger" onclick="event.stopPropagation(); target.pve_towers['${towerKey}'].floors['${floorKey}'].rewards.items.splice(${rIdx}, 1); currentTowerRewardItemIdx = null; renderTowerFloorForm('${towerKey}', '${floorKey}');">Delete</button>
                    </div>
                </div>
                ${rewEditorHtml}
            </div>
        `;
    }).join('');

    ed.innerHTML = `
        <div class="card-header-flex">
            <span class="card-title">Edit Tower Floor Node: ${floorKey}</span>
            <button class="danger" onclick="delete target.pve_towers['${towerKey}'].floors['${floorKey}']; stateFloorKey = null; document.getElementById('tower-editor').innerHTML = ''; renderTowersList();">Delete Floor</button>
        </div>
        
        <div class="form-grid">
            <div class="form-group full-width">
                <label>Floor Dictionary ID Key</label>
                <input type="text" value="${floorKey}" onchange="renameTowerFloorKey('${towerKey}', '${floorKey}', this.value)">
            </div>
        </div>

        <!-- СПИСОК ВРАГОВ ЭТАЖА С АККОРДЕОНОМ -->
        <div class="sub-section" style="border-color: var(--accent-blue); margin-top:20px;">
            <div class="card-header-flex" style="border:none; padding:0; margin-bottom:12px;">
                <span class="sub-section-title" style="margin:0; color:var(--accent-blue);">⚔️ Tower Floor Enemy Battle Squad</span>
                <button class="primary" style="padding: 2px 8px; font-size: 11px;" onclick="target.pve_towers['${towerKey}'].floors['${floorKey}'].enemies.push({hero_id:'', level:1, stars:1, position:0}); renderTowerFloorForm('${towerKey}', '${floorKey}');">+ Add Enemy Unit</button>
            </div>
            <div style="margin-top: 10px;">${enemiesListHtml || '<p style="font-size:11px; color:var(--text-muted); padding:5px; margin:0;">No enemies configured for this stage floor</p>'}</div>
        </div>

        <!-- ФИКСИРОВАННЫЕ РЕСУРСЫ НАГРАДЫ ЭТАЖА -->
        <div class="sub-section" style="border-color: var(--accent-blue); margin-top:20px;">
            <div class="sub-section-title" style="color:var(--accent-blue);">💎 Floor Milestone Resource Rewards</div>
            <div class="form-grid">
                <div class="form-group"><label>Gold Bounty</label><input type="number" value="${floor.rewards.resources.gold || 0}" oninput="target.pve_towers['${towerKey}'].floors['${floorKey}'].rewards.resources.gold = parseInt(this.value) || 0;"></div>
                <div class="form-group"><label>Diamond Bounty</label><input type="number" value="${floor.rewards.resources.diamond || 0}" oninput="target.pve_towers['${towerKey}'].floors['${floorKey}'].rewards.resources.diamond = parseInt(this.value) || 0;"></div>
            </div>
        </div>

        <!-- ВЕРОЯТНОСТНЫЕ ПРЕДМЕТЫ НАГРАДЫ ЭТАЖА С АККОРДЕОНОМ -->
        <div class="sub-section" style="border-color: var(--accent-pink); margin-top:20px;">
            <div class="card-header-flex" style="border:none; padding:0; margin-bottom:12px;">
                <span class="sub-section-title" style="margin:0; color:var(--accent-pink);">🎁 Floor Probabilistic Equipment / Loot Items Table</span>
                <button class="primary" style="padding: 2px 8px; font-size: 11px;" onclick="target.pve_towers['${towerKey}'].floors['${floorKey}'].rewards.items.push({itemId:'', amount:1, chance:1.0}); renderTowerFloorForm('${towerKey}', '${floorKey}');">+ Add Drop Item</button>
            </div>
            <div style="margin-top: 10px;">${rewardItemsHtml || '<p style="font-size:11px; color:var(--text-muted); padding:5px; margin:0;">No items drop configured for this floor clearance</p>'}</div>
        </div>
    `;
}

function renameTowerFloorKey(towerKey, oldFloorKey, newFloorKey) {
    if (!newFloorKey || oldFloorKey === newFloorKey || target.pve_towers[towerKey].floors[newFloorKey]) {
        renderTowersList();
        renderTowerFloorForm(towerKey, oldFloorKey);
        return;
    }
    target.pve_towers[towerKey].floors[newFloorKey] = target.pve_towers[towerKey].floors[oldFloorKey];
    delete target.pve_towers[towerKey].floors[oldFloorKey];
    stateFloorKey = newFloorKey;
    renderTowersList();
    renderTowerFloorForm(towerKey, newFloorKey);
}


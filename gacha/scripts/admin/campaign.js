let currentCampaignSection = 'stages';
let stateCampaignStageKey = null;
let currentEnemyIdx = null; // Индекс редактируемого врага в аккордеоне
let currentRewardItemIdx = null; // Индекс редактируемого предмета награды в аккордеоне

function switchCampaignTab(sectionId, evt) {
    currentCampaignSection = sectionId;
    stateCampaignStageKey = null;
    currentEnemyIdx = null;
    currentRewardItemIdx = null;

    if (evt && evt.target && evt.target.parentElement) {
        evt.target.parentElement.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        evt.target.classList.add('active');
    }

    const ed = document.getElementById('campaign-editor');
    if (ed) ed.innerHTML = '';

    renderCampaignList();
}

function renderCampaignList() {
    const list = document.getElementById('campaign-list');
    if (!list) return;

    // Инициализируем корневой объект pve_campaign, если его нет в конфиге
    if (!target.pve_campaign) {
        target.pve_campaign = { base_idle_rate: { gold: 0, exp: 0 }, stages: {} };
    }

    const sidebarHeader = document.querySelector('#view-campaign .crud-sidebar-header button');

    if (currentCampaignSection === 'base_rate') {
        if (sidebarHeader) sidebarHeader.style.display = 'none'; // Скрываем кнопку добавления для синглтона
        list.innerHTML = `
            <li class="crud-list-item active" onclick="selectCampaignNode('base_rate');">
                <div style="display:flex; align-items:center; gap:8px;">
                    <span>⏳</span>
                    <span>Base Idle Generation</span>
                </div>
            </li>
        `;
        selectCampaignNode('base_rate');
    }
    else if (currentCampaignSection === 'stages') {
        if (sidebarHeader) sidebarHeader.style.display = 'block'; // Показываем кнопку для добавления этапов
        list.innerHTML = Object.keys(target.pve_campaign.stages || {}).map(key => `
            <li class="crud-list-item ${stateCampaignStageKey === key ? 'active' : ''}" onclick="stateCampaignStageKey='${key}'; selectCampaignNode('stages');">
                <div style="display:flex; align-items:center; gap:8px;">
                    <span>🚩</span>
                    <span style="font-family:monospace; font-size:13px;">${key}</span>
                </div>
            </li>
        `).join('');
    }
}

function selectCampaignNode(section) {
    currentEnemyIdx = null;
    currentRewardItemIdx = null;

    if (section === 'base_rate') {
        renderBaseIdleRateForm();
    } else {
        renderCampaignStageForm(stateCampaignStageKey);
    }
}

function renderBaseIdleRateForm() {
    const ed = document.getElementById('campaign-editor');
    if (!ed) return;
    const rate = target.pve_campaign.base_idle_rate || { gold: 0, exp: 0 };

    ed.innerHTML = `
        <div class="card-header-flex">
            <span class="card-title">Base Passive Generation Metrics (Stage 0 Progress)</span>
        </div>
        <div class="form-grid" style="margin-top:15px;">
            <div class="form-group">
                <label>Base Gold Generation / Hour</label>
                <input type="number" value="${rate.gold || 0}" oninput="target.pve_campaign.base_idle_rate.gold = parseInt(this.value) || 0;">
            </div>
            <div class="form-group">
                <label>Base Exp Generation / Hour</label>
                <input type="number" value="${rate.exp || 0}" oninput="target.pve_campaign.base_idle_rate.exp = parseInt(this.value) || 0;">
            </div>
        </div>
    `;
}

function createNewCampaignStage() {
    if (!target.pve_campaign.stages) target.pve_campaign.stages = {};
    const count = Object.keys(target.pve_campaign.stages).length;
    const newKey = `stage_1_${count + 1}`;

    target.pve_campaign.stages[newKey] = {
        title_loc: { en: "New Campaign Stage", ru: "" },
        ui_position: { x: "100px", y: "100px" },
        enemies: [],
        rewards: { resources: { gold: 0, exp: 0, diamond: 0 }, items: [] },
        idle_bonus_per_hour: { gold: 0, exp: 0 }
    };

    stateCampaignStageKey = newKey;
    renderCampaignList();
    selectCampaignNode('stages');
}

function renderCampaignStageForm(stageKey) {
    renderCampaignList();
    const ed = document.getElementById('campaign-editor');
    if (!ed || !stageKey) return;

    const stage = target.pve_campaign.stages[stageKey];
    if (!stage.ui_position) stage.ui_position = { x: "0px", y: "0px" };
    if (!stage.enemies) stage.enemies = [];
    if (!stage.rewards) stage.rewards = { resources: { gold: 0, exp: 0, diamond: 0 }, items: [] };
    if (!stage.idle_bonus_per_hour) stage.idle_bonus_per_hour = { gold: 0, exp: 0 };

    // Подтягиваем доступных героев для селектора врагов
    const heroOptions = Object.keys(target.catalog?.heroes || {}).map(hk =>
        `<option value="${hk}">${hk}</option>`
    ).join('');

    // Генерируем HTML для аккордеона врагов (enemies)
    let enemiesListHtml = stage.enemies.map((enemy, eIdx) => {
        const isEditing = currentEnemyIdx === eIdx;
        let enemyEditorHtml = '';

        if (isEditing) {
            enemyEditorHtml = `
                <div class="sub-section" style="border-left: 2px solid var(--accent-blue); padding:12px; background: rgba(0,0,0,0.2); margin-top:10px; cursor:default;" onclick="event.stopPropagation();">
                    <div class="form-grid" style="gap: 8px;">
                        <div class="form-group">
                            <label>Target Hero Roster ID</label>
                            <select onchange="target.pve_campaign.stages['${stageKey}'].enemies[${eIdx}].hero_id = this.value; renderCampaignStageForm('${stageKey}');">
                                <option value="">-- Select Enemy Unit --</option>
                                ${Object.keys(target.catalog?.heroes || {}).map(hk => `
                                    <option value="${hk}" ${enemy.hero_id === hk ? 'selected' : ''}>🦸 ${hk}</option>
                                `).join('')}
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Combat Unit Level</label>
                            <input type="number" value="${enemy.level || 1}" oninput="target.pve_campaign.stages['${stageKey}'].enemies[${eIdx}].level = parseInt(this.value) || 1;">
                        </div>
                        <div class="form-group">
                            <label>Star Tier Promotion</label>
                            <input type="number" value="${enemy.stars || 1}" oninput="target.pve_campaign.stages['${stageKey}'].enemies[${eIdx}].stars = parseInt(this.value) || 1;">
                        </div>
                        <div class="form-group">
                            <label>Grid Formation Slot (position)</label>
                            <input type="number" value="${enemy.position || 1}" oninput="target.pve_campaign.stages['${stageKey}'].enemies[${eIdx}].position = parseInt(this.value) || 1;">
                        </div>
                    </div>
                </div>
            `;
        }

        return `
            <div style="margin-bottom: 8px; background: ${isEditing ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.01)'}; padding: 10px; border-radius: 6px; border: 1px solid ${isEditing ? 'var(--accent-blue)' : 'var(--border-color)'};">
                <div class="element-row" style="margin:0; border:none; padding:0; background:transparent;">
                    <div class="element-info" style="cursor:pointer; width: 100%; display: flex; align-items: center; gap: 10px;" onclick="currentEnemyIdx = (currentEnemyIdx === ${eIdx} ? null : ${eIdx}); renderCampaignStageForm('${stageKey}');">
                        <span class="badge" style="background:${isEditing ? 'var(--accent-blue)' : 'var(--bg-main)'}; font-family:monospace; min-width: 80px; text-align: center;">
                            ${isEditing ? '🔽 ' : '▶️ '} Slot: ${enemy.position || 1}
                        </span>
                        <span style="font-size:11px; color:var(--text-muted);">unit: <b>${enemy.hero_id || 'empty'}</b></span>
                        <span style="font-size:11px; color:var(--text-muted);">Lvl: <b>${enemy.level || 1}</b></span>
                        <span style="font-size:11px; color:var(--text-muted);">Stars: <b>${enemy.stars || 1}</b></span>
                    </div>
                    <div class="element-actions">
                        <button class="btn-sm btn-danger" onclick="event.stopPropagation(); target.pve_campaign.stages['${stageKey}'].enemies.splice(${eIdx}, 1); currentEnemyIdx = null; renderCampaignStageForm('${stageKey}');">Delete</button>
                    </div>
                </div>
                ${enemyEditorHtml}
            </div>
        `;
    }).join('');

    ed.innerHTML = `
        <div class="card-header-flex">
            <span class="card-title">Edit Campaign Stage Node: ${stageKey}</span>
            <button class="danger" onclick="delete target.pve_campaign.stages['${stageKey}']; stateCampaignStageKey = null; document.getElementById('campaign-editor').innerHTML = ''; renderCampaignList();">Delete Stage</button>
        </div>
        
        <div class="form-grid">
            <div class="form-group"><label>Stage Dictionary ID Key</label><input type="text" value="${stageKey}" onchange="renameCampaignStageKey('${stageKey}', this.value)"></div>
            <div class="form-group"><label>Map Node Placement X</label><input type="text" value="${stage.ui_position.x || '0px'}" oninput="target.pve_campaign.stages['${stageKey}'].ui_position.x = this.value;"></div>
            <div class="form-group"><label>Map Node Placement Y</label><input type="text" value="${stage.ui_position.y || '0px'}" oninput="target.pve_campaign.stages['${stageKey}'].ui_position.y = this.value;"></div>
            <div class="form-group"><label>Idle Gold / Hour Bonus</label><input type="number" value="${stage.idle_bonus_per_hour.gold || 0}" oninput="target.pve_campaign.stages['${stageKey}'].idle_bonus_per_hour.gold = parseInt(this.value) || 0;"></div>
            <div class="form-group"><label>Idle Exp / Hour Bonus</label><input type="number" value="${stage.idle_bonus_per_hour.exp || 0}" oninput="target.pve_campaign.stages['${stageKey}'].idle_bonus_per_hour.exp = parseInt(this.value) || 0;"></div>
        </div>

        <div class="form-grid" style="margin-top:12px;">
            <div class="form-group"><label>Stage Title (Localization EN)</label><input type="text" value="${stage.title_loc?.en || ''}" oninput="target.pve_campaign.stages['${stageKey}'].title_loc.en = this.value;"></div>
            <div class="form-grid-anchor" id="campaign-stage-rewards-anchor"></div>
        </div>

        <div class="sub-section" style="border-color: var(--accent-blue); margin-top:20px;">
            <div class="card-header-flex" style="border:none; padding:0; margin-bottom:12px;">
                <span class="sub-section-title" style="margin:0; color:var(--accent-blue);">⚔️ Wave Enemy Battle Squad</span>
                <button class="primary" style="padding: 2px 8px; font-size: 11px;" onclick="target.pve_campaign.stages['${stageKey}'].enemies.push({hero_id:'', level:1, stars:1, position:1}); renderCampaignStageForm('${stageKey}');">+ Add Enemy Unit</button>
            </div>
            <div style="margin-top: 10px;">${enemiesListHtml || '<p style="font-size:11px; color:var(--text-muted); padding:5px; margin:0;">No enemies configured for this stage</p>'}</div>
        </div>
        
        <div id="campaign-rewards-list-container"></div>
    `;
    // Продолжение логики редактора наград и методов изменения ключей пойдет в следующей части
    // Продолжение сборки формы из Части 2 внутри функции renderCampaignStageForm
    const rewardsAnchor = document.getElementById('campaign-stage-rewards-anchor');
    if (rewardsAnchor) {
        rewardsAnchor.outerHTML = `
            <div class="form-group"><label>Stage Title (Localization RU)</label><input type="text" value="${stage.title_loc?.ru || ''}" oninput="target.pve_campaign.stages['${stageKey}'].title_loc.ru = this.value;"></div>
        `;
    }

    const rewardsContainer = document.getElementById('campaign-rewards-list-container');
    if (rewardsContainer) {
        // Рендеринг аккордеона предметов в наградах (rewards.items)
        let rewardItemsHtml = stage.rewards.items.map((rew, rIdx) => {
            const isEditing = currentRewardItemIdx === rIdx;
            let rewEditorHtml = '';

            if (isEditing) {
                rewEditorHtml = `
                    <div class="sub-section" style="border-left: 2px solid var(--accent-pink); padding:12px; background: rgba(0,0,0,0.2); margin-top:10px; cursor:default;" onclick="event.stopPropagation();">
                        <div class="form-grid" style="gap: 8px;">
                            <div class="form-group">
                                <label>Reward Item Link (itemId)</label>
                                <select onchange="target.pve_campaign.stages['${stageKey}'].rewards.items[${rIdx}].itemId = this.value;">
                                    <option value="">-- Select Item --</option>
                                    ${Object.keys(target.catalog?.items || {}).map(iKey => `
                                        <option value="${iKey}" ${rew.itemId === iKey ? 'selected' : ''}>📦 ${iKey}</option>
                                    `).join('')}
                                </select>
                            </div>
                            <div class="form-group">
                                <label>Stack Count (amount)</label>
                                <input type="number" value="${rew.amount || 1}" oninput="target.pve_campaign.stages['${stageKey}'].rewards.items[${rIdx}].amount = parseInt(this.value) || 1;">
                            </div>
                            <div class="form-group">
                                <label>Drop Probability Weight (chance 0.0 - 1.0)</label>
                                <input type="number" step="0.01" min="0" max="1" value="${rew.chance !== undefined ? rew.chance : 1.0}" oninput="target.pve_campaign.stages['${stageKey}'].rewards.items[${rIdx}].chance = parseFloat(this.value) || 0.0;">
                            </div>
                        </div>
                    </div>
                `;
            }

            return `
                <div style="margin-bottom: 8px; background: ${isEditing ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.01)'}; padding: 10px; border-radius: 6px; border: 1px solid ${isEditing ? 'var(--accent-pink)' : 'var(--border-color)'};">
                    <div class="element-row" style="margin:0; border:none; padding:0; background:transparent;">
                        <div class="element-info" style="cursor:pointer; width: 100%; display: flex; align-items: center; gap: 10px;" onclick="currentRewardItemIdx = (currentRewardItemIdx === ${rIdx} ? null : ${rIdx}); renderCampaignStageForm('${stageKey}');">
                            <span class="badge" style="background:${isEditing ? 'var(--accent-pink)' : 'var(--bg-main)'}; font-family:monospace; min-width: 80px; text-align: center;">
                                ${isEditing ? '🔽 ' : '▶️ '} Item Loop
                            </span>
                            <span style="font-size:11px; color:var(--text-muted);">itemId: <b>${rew.itemId || 'empty'}</b></span>
                            <span style="font-size:11px; color:var(--text-muted);">count: <b>${rew.amount || 1}</b></span>
                            <span style="font-size:11px; color:var(--text-muted);">chance: <b>${(rew.chance * 100).toFixed(0)}%</b></span>
                        </div>
                        <div class="element-actions">
                            <button class="btn-sm btn-danger" onclick="event.stopPropagation(); target.pve_campaign.stages['${stageKey}'].rewards.items.splice(${rIdx}, 1); currentRewardItemIdx = null; renderCampaignStageForm('${stageKey}');">Delete</button>
                        </div>
                    </div>
                    ${rewEditorHtml}
                </div>
            `;
        }).join('');

        rewardsContainer.outerHTML = `
            <!-- ФИКСИРОВАННЫЕ РЕСУРСЫ НАГРАДЫ -->
            <div class="sub-section" style="border-color: var(--accent-blue); margin-top:20px;">
                <div class="sub-section-title" style="color:var(--accent-blue);">💎 First Clear Fixed Resource Milestone Rewards</div>
                <div class="form-grid">
                    <div class="form-group"><label>Gold Bounty</label><input type="number" value="${stage.rewards.resources.gold || 0}" oninput="target.pve_campaign.stages['${stageKey}'].rewards.resources.gold = parseInt(this.value) || 0;"></div>
                    <div class="form-group"><label>Exp Bounty</label><input type="number" value="${stage.rewards.resources.exp || 0}" oninput="target.pve_campaign.stages['${stageKey}'].rewards.resources.exp = parseInt(this.value) || 0;"></div>
                    <div class="form-group"><label>Diamond Bounty</label><input type="number" value="${stage.rewards.resources.diamond || 0}" oninput="target.pve_campaign.stages['${stageKey}'].rewards.resources.diamond = parseInt(this.value) || 0;"></div>
                </div>
            </div>

            <!-- ВЕРОЯТНОСТНЫЕ ПРЕДМЕТЫ НАГРАДЫ -->
            <div class="sub-section" style="border-color: var(--accent-pink); margin-top:20px;">
                <div class="card-header-flex" style="border:none; padding:0; margin-bottom:12px;">
                    <span class="sub-section-title" style="margin:0; color:var(--accent-pink);">🎁 First Clear Probabilistic Equipment / Ticket Loot Table</span>
                    <button class="primary" style="padding: 2px 8px; font-size: 11px;" onclick="target.pve_campaign.stages['${stageKey}'].rewards.items.push({itemId:'', amount:1, chance:1.0}); renderCampaignStageForm('${stageKey}');">+ Add Drop Item</button>
                </div>
                <div style="margin-top: 10px;">${rewardItemsHtml || '<p style="font-size:11px; color:var(--text-muted); padding:5px; margin:0;">No items drop from this stage milestone</p>'}</div>
            </div>
        `;
    }
}

function renameCampaignStageKey(oldKey, newKey) {
    if (!newKey || oldKey === newKey || target.pve_campaign.stages[newKey]) {
        renderCampaignList();
        renderCampaignStageForm(oldKey);
        return;
    }
    target.pve_campaign.stages[newKey] = target.pve_campaign.stages[oldKey];
    delete target.pve_campaign.stages[oldKey];
    stateCampaignStageKey = newKey;
    renderCampaignList();
    renderCampaignStageForm(newKey);
}



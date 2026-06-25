let stateBossKey = null;
let currentBossTierIdx = null; // Индекс открытого тира наград внутри босса

function renderBossesList() {
    const list = document.getElementById('boss-list');
    if (!list) return;

    if (!target.pve_bosses) target.pve_bosses = {};

    list.innerHTML = Object.keys(target.pve_bosses).map(key => {
        const boss = target.pve_bosses[key];
        const typeBadge = {
            'solo': '<span class="badge" style="font-size:9px; background:#4caf50;">SOLO</span>',
            'guild': '<span class="badge" style="font-size:9px; background:var(--accent-blue);">GUILD</span>',
            'server': '<span class="badge" style="font-size:9px; background:var(--accent-pink);">WORLD</span>'
        }[boss.boss_type || 'solo'];

        return `
            <li class="crud-list-item ${stateBossKey === key ? 'active' : ''}" onclick="selectBossNode('${key}')">
                <div style="display:flex; align-items:center; gap:8px;">
                    <span>👹</span>
                    <span style="font-family:monospace; font-size:13px;">${key}</span>
                </div>
                ${typeBadge}
            </li>
        `;
    }).join('');
}

function selectBossNode(key) {
    stateBossKey = key;
    currentBossTierIdx = null; // Сбрасываем выбранный тир при смене босса
    renderBossForm(key);
}

function createNewBoss() {
    if (!target.pve_bosses) target.pve_bosses = {};
    const newKey = `boss_raid_${Object.keys(target.pve_bosses).length + 1}`;

    target.pve_bosses[newKey] = {
        boss_id: newKey,
        hero_id: "",
        level: 100,
        max_hp: 1000000,
        boss_type: "solo",
        reset_cron: "0 0 * * *",
        rewards_by_tier: []
    };

    stateBossKey = newKey;
    renderBossesList();
    selectBossNode(newKey);
}

function renderBossForm(key) {
    renderBossesList();
    const ed = document.getElementById('boss-editor');
    if (!ed || !key) return;

    const boss = target.pve_bosses[key];
    if (!boss.rewards_by_tier) boss.rewards_by_tier = [];

    // Выпадающий список доступных героев для привязки визуала и базовых статов
    const heroOptions = Object.keys(target.catalog?.heroes || {}).map(hk =>
        `<option value="${hk}" ${boss.hero_id === hk ? 'selected' : ''}>🦸 ${hk}</option>`
    ).join('');

    // Генерируем HTML для аккордеона тиров наград за нанесенный урон (rewards_by_tier)
    let tiersListHtml = boss.rewards_by_tier.map((tier, tIdx) => {
        const isEditing = currentBossTierIdx === tIdx;
        let tierEditorHtml = '';

        if (isEditing) {
            if (!tier.resources) tier.resources = {};
            tierEditorHtml = `
                <div class="sub-section" style="border-left: 2px solid var(--accent-pink); padding:12px; background: rgba(0,0,0,0.2); margin-top:10px; cursor:default;" onclick="event.stopPropagation();">
                    <div class="form-grid" style="gap: 8px;">
                        <div class="form-group full-width">
                            <label>Minimum Required Damage (min_dmg)</label>
                            <input type="number" value="${tier.min_dmg || 0}" oninput="target.pve_bosses['${key}'].rewards_by_tier[${tIdx}].min_dmg = parseInt(this.value) || 0;">
                        </div>
                        <div class="form-group full-width">
                            <label>Tier Resources Map (Direct Object Editor)</label>
                            <textarea style="width:100%; height:90px; font-family:monospace; font-size:11px; margin-top:5px;" oninput="try{target.pve_bosses['${key}'].rewards_by_tier[${tIdx}].resources = JSON.parse(this.value); this.style.borderColor='var(--border-color)';}catch(e){this.style.borderColor='var(--accent-red)';}">${JSON.stringify(tier.resources, null, 4)}</textarea>
                            <p style="font-size:10px; color:var(--text-muted); margin-top:3px;">💡 Valid format: {"gold": 5000, "exp": 2000, "diamond": 10}</p>
                        </div>
                    </div>
                </div>
            `;
        }

        return `
            <div style="margin-bottom: 8px; background: ${isEditing ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.01)'}; padding: 10px; border-radius: 6px; border: 1px solid ${isEditing ? 'var(--accent-pink)' : 'var(--border-color)'};">
                <div class="element-row" style="margin:0; border:none; padding:0; background:transparent;">
                    <div class="element-info" style="cursor:pointer; width: 100%; display: flex; align-items: center; gap: 10px;" onclick="currentBossTierIdx = (currentBossTierIdx === ${tIdx} ? null : ${tIdx}); renderBossForm('${key}');">
                        <span class="badge" style="background:${isEditing ? 'var(--accent-pink)' : 'var(--bg-main)'}; font-family:monospace; min-width: 90px; text-align: center;">
                            ${isEditing ? '🔽 ' : '▶️ '} Tier #${tIdx + 1}
                        </span>
                        <span style="font-size:11px; color:var(--text-muted);">Min Dmg: <b>${(tier.min_dmg || 0).toLocaleString()}</b></span>
                        <span style="font-size:11px; color:var(--text-muted);">Payout: <b>${Object.keys(tier.resources || {}).length} nodes</b></span>
                    </div>
                    <div class="element-actions">
                        <button class="btn-sm btn-danger" onclick="event.stopPropagation(); target.pve_bosses['${key}'].rewards_by_tier.splice(${tIdx}, 1); currentBossTierIdx = null; renderBossForm('${key}');">Delete</button>
                    </div>
                </div>
                ${tierEditorHtml}
            </div>
        `;
    }).join('');

    ed.innerHTML = `
        <div class="card-header-flex">
            <span class="card-title">Edit Raid Boss Configuration: ${key}</span>
            <button class="danger" onclick="delete target.pve_bosses['${key}']; stateBossKey = null; document.getElementById('boss-editor').innerHTML = ''; renderBossesList();">Delete Boss</button>
        </div>
        
        <div class="form-grid">
            <div class="form-group"><label>Boss Unique Key ID</label><input type="text" value="${key}" onchange="renameBossKey('${key}', this.value)"></div>
            <div class="form-group">
                <label>Visual & Stats Hero Link</label>
                <select onchange="target.pve_bosses['${key}'].hero_id = this.value; target.pve_bosses['${key}'].boss_id = '${key}';">
                    <option value="">-- Select Template Hero --</option>
                    ${heroOptions}
                </select>
            </div>
            <div class="form-group"><label>Combat Boss Level</label><input type="number" value="${boss.level || 1}" oninput="target.pve_bosses['${key}'].level = parseInt(this.value) || 1"></div>
            <div class="form-group"><label>Maximum Pool Healthpoints (max_hp)</label><input type="number" value="${boss.max_hp || 1000000}" oninput="target.pve_bosses['${key}'].max_hp = parseInt(this.value) || 1000000"></div>
            <div class="form-group">
                <label>Operational Boss Type Class</label>
                <select onchange="target.pve_bosses['${key}'].boss_type = this.value; renderBossesList();">
                    <option value="solo" ${boss.boss_type === 'solo' ? 'selected' : ''}>Solo Challenge (Local)</option>
                    <option value="guild" ${boss.boss_type === 'guild' ? 'selected' : ''}>Guild Raid (Clan)</option>
                    <option value="server" ${boss.boss_type === 'server' ? 'selected' : ''}>World Server Boss (Global)</option>
                </select>
            </div>
            <div class="form-group"><label>Reset Cron Schedule Format String</label><input type="text" value="${boss.reset_cron || '0 0 * * *'}" oninput="target.pve_bosses['${key}'].reset_cron = this.value" style="font-family:monospace;"></div>
        </div>

        <div class="sub-section" style="border-color: var(--accent-pink); margin-top:20px;">
            <div class="card-header-flex" style="border:none; padding:0; margin-bottom:12px;">
                <span class="sub-section-title" style="margin:0; color:var(--accent-pink);">📋 Scaled Damage Tier Milestone Rewards</span>
                <button class="primary" style="padding: 2px 8px; font-size: 11px;" onclick="target.pve_bosses['${key}'].rewards_by_tier.push({min_dmg: 100000, resources: {gold: 1000}}); renderBossForm('${key}');">+ Add Damage Tier</button>
            </div>
            <div style="margin-top: 10px;">${tiersListHtml || '<p style="font-size:11px; color:var(--text-muted); padding:5px; margin:0;">No damage milestones or rewards configured</p>'}</div>
        </div>
    `;
}

function renameBossKey(oldKey, newKey) {
    if (!newKey || oldKey === newKey || target.pve_bosses[newKey]) {
        renderBossesList();
        renderBossForm(oldKey);
        return;
    }
    target.pve_bosses[newKey] = target.pve_bosses[oldKey];
    target.pve_bosses[newKey].boss_id = newKey; // синхронизируем внутренний ID
    delete target.pve_bosses[oldKey];
    stateBossKey = newKey;
    renderBossesList();
    renderBossForm(newKey);
}

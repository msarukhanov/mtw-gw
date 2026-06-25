let currentGachaSection = 'banners'; // 'banners' или 'pools' или 'guarantees'
let stateGachaKey = null;
let currentGachaBannerIdx = null; // Индекс открытого баннера в аккордеоне

function switchGachaSubTab(sectionId, evt) {
    currentGachaSection = sectionId;
    stateGachaKey = null;
    currentGachaBannerIdx = null;

    if (evt && evt.target && evt.target.parentElement) {
        evt.target.parentElement.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        evt.target.classList.add('active');
    }

    const titleElem = document.getElementById('gacha-sidebar-title');
    if (titleElem) {
        const titleMap = {
            'banners': 'Summon Banners',
            'pools': 'Drop Probability Pools',
            'guarantees': 'Pity Guarantees'
        };
        titleElem.innerText = titleMap[sectionId];
    }

    const ed = document.getElementById('gacha-editor');
    if (ed) ed.innerHTML = '';

    renderGachaList();
}

function renderGachaList() {
    const list = document.getElementById('gacha-list');
    if (!list) return;

    // Инициализируем корневой объект gacha, если его нет в конфиге
    if (!target.gacha) {
        target.gacha = { rules: {}, diamond_limits: {}, banners: [], pools: {} };
    }

    const sidebarHeader = document.querySelector('#view-gacha .crud-sidebar-header button');

    if (currentGachaSection === 'banners') {
        if (sidebarHeader) sidebarHeader.style.display = 'block'; // Можно добавлять баннеры
        list.innerHTML = (target.gacha.banners || []).map((b, idx) => `
            <li class="crud-list-item ${currentGachaBannerIdx === idx ? 'active' : ''}" onclick="currentGachaBannerIdx = (currentGachaBannerIdx === ${idx} ? null : ${idx}); selectGachaNode('banners');">
                <div style="display:flex; align-items:center; gap:8px;">
                    <span>🔮</span>
                    <span style="font-family:monospace; font-size:12px;">${b.id || 'unnamed'}</span>
                </div>
                <span class="badge" style="font-size:9px;">${b.banner_type || 'std'}</span>
            </li>
        `).join('');
    }
    else if (currentGachaSection === 'pools') {
        if (sidebarHeader) sidebarHeader.style.display = 'block'; // Можно добавлять пулы
        list.innerHTML = Object.keys(target.gacha.pools || {}).map(key => `
            <li class="crud-list-item ${stateGachaKey === key ? 'active' : ''}" onclick="stateGachaKey='${key}'; selectGachaNode('pools');">
                <div style="display:flex; align-items:center; gap:8px;">
                    <span>🎯</span>
                    <span style="font-family:monospace; font-size:13px;">${key}</span>
                </div>
            </li>
        `).join('');
    }
    else if (currentGachaSection === 'guarantees') {
        if (sidebarHeader) sidebarHeader.style.display = 'none'; // Синглтоны гарантов привязаны к пулам
        list.innerHTML = Object.keys(target.gacha.pools || {}).filter(k => target.gacha.pools[k].guarantees).map(key => `
            <li class="crud-list-item ${stateGachaKey === key ? 'active' : ''}" onclick="stateGachaKey='${key}'; selectGachaNode('guarantees');">
                <div style="display:flex; align-items:center; gap:8px;">
                    <span>🛡️</span>
                    <span style="font-family:monospace; font-size:13px;">Pity: ${key}</span>
                </div>
            </li>
        `).join('');
    }
}

function selectGachaNode(section) {
    if (section === 'banners') renderGachaBannersManager();
    else if (section === 'pools') renderGachaPoolsManager(stateGachaKey);
    else if (section === 'guarantees') renderGachaGuaranteesManager(stateGachaKey);
}

function createNewGachaElement() {
    if (currentGachaSection === 'banners') {
        const newId = `banner_custom_${target.gacha.banners.length}`;
        target.gacha.banners.push({
            id: newId, banner_type: "standard", poolId: "standard",
            cost_item_id: "scroll_epic", cost_amount: 1, pity_threshold: 10,
            title_loc: { en: "Custom Summon Gate", ru: "" }
        });
        target.gacha.diamond_limits[newId] = 20; // Инициализируем лимит алмазов для баннера
        currentGachaBannerIdx = target.gacha.banners.length - 1;
        switchGachaSubTab('banners');
    } else if (currentGachaSection === 'pools') {
        const newKey = `pool_custom_${Object.keys(target.gacha.pools || {}).length}`;
        target.gacha.pools[newKey] = {
            cost: 1, currency: "scroll_epic", modes:[1, 10],
            rates: { "UR": 0, "SSR": 5, "SR": 25, "R": 70 },
            heroes: { "UR": [], "SSR": [], "SR": [], "R": [] },
            rate_up: {}
        };
        stateGachaKey = newKey;
        switchGachaSubTab('pools');
    }
}

function renderGachaBannersManager() {
    const ed = document.getElementById('gacha-editor');
    if (!ed) return;

    const rules = target.gacha.rules || {};
    const limits = target.gacha.diamond_limits || {};
    const banners = target.gacha.banners || [];

    // Генерируем HTML-форму для выбранного баннера (если открыт аккордеон)
    let selectedBannerFormHtml = '';
    if (currentGachaBannerIdx !== null && banners[currentGachaBannerIdx]) {
        const bIdx = currentGachaBannerIdx;
        const b = banners[bIdx];

        // Опции для привязки баннера к пулу дропа
        const poolOptions = Object.keys(target.gacha.pools || {}).map(pKey =>
            `<option value="${pKey}" ${b.poolId === pKey ? 'selected' : ''}>🎯 Pool: ${pKey}</option>`
        ).join('');

        // Опции для выбора предмета валюты призыва из каталога
        const itemOptions = Object.keys(target.catalog?.items || {}).map(iKey =>
            `<option value="${iKey}" ${b.cost_item_id === iKey ? 'selected' : ''}>📦 ${iKey}</option>`
        ).join('');

        selectedBannerFormHtml = `
            <div class="sub-section" style="border-left: 3px solid var(--accent-pink); padding:15px; background: rgba(0,0,0,0.2); margin-top:15px;">
                <div class="sub-section-title" style="color:var(--accent-pink); font-family:monospace;">BANNER EDITOR: ${b.id}</div>
                <div class="form-grid">
                    <div class="form-group">
                        <label>Banner ID Key</label>
                        <input type="text" value="${b.id || ''}" onchange="renameGachaBannerKey(${bIdx}, this.value);">
                    </div>
                    <div class="form-group">
                        <label>Banner Type Class</label>
                        <select onchange="target.gacha.banners[${bIdx}].banner_type = this.value; renderGachaList();">
                            <option value="standard" ${b.banner_type === 'standard' ? 'selected' : ''}>Standard</option>
                            <option value="event" ${b.banner_type === 'event' ? 'selected' : ''}>Event Rate-Up</option>
                            <option value="friendship" ${b.banner_type === 'friendship' ? 'selected' : ''}>Friendship Points</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Linked Drop Probability Pool</label>
                        <select onchange="target.gacha.banners[${bIdx}].poolId = this.value;">
                            <option value="">-- Select Drop Pool --</option>
                            ${poolOptions}
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Cost Ticket Item Key (itemId)</label>
                        <select onchange="target.gacha.banners[${bIdx}].cost_item_id = this.value;">
                            <option value="">-- Custom / Currency Key --</option>
                            ${itemOptions}
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Cost Value Per Single Pull</label>
                        <input type="number" value="${b.cost_amount || 1}" oninput="target.gacha.banners[${bIdx}].cost_amount = parseInt(this.value) || 1;">
                    </div>
                    <div class="form-group">
                        <label>Hard Pity Threshold (0 = None)</label>
                        <input type="number" value="${b.pity_threshold || 0}" oninput="target.gacha.banners[${bIdx}].pity_threshold = parseInt(this.value) || 0;">
                    </div>
                    <div class="form-group">
                        <label>Diamond Pull Daily Limit</label>
                        <input type="number" value="${limits[b.id] !== undefined ? limits[b.id] : 0}" oninput="target.gacha.diamond_limits['${b.id}'] = parseInt(this.value) || 0; renderGachaBannersManager();">
                    </div>
                </div>
                <div class="form-grid" style="margin-top:12px;">
                    <div class="form-group"><label>Banner Title (Localization EN)</label><input type="text" value="${b.title_loc?.en || ''}" oninput="target.gacha.banners[${bIdx}].title_loc.en = this.value;"></div>
                    <div class="form-group"><label>Banner Title (Localization RU)</label><input type="text" value="${b.title_loc?.ru || ''}" oninput="target.gacha.banners[${bIdx}].title_loc.ru = this.value;"></div>
                </div>
                <div style="margin-top:12px; text-align:right;">
                    <button class="danger btn-sm" onclick="target.gacha.banners.splice(${bIdx},1); delete target.gacha.diamond_limits['${b.id}']; currentGachaBannerIdx=null; switchGachaSubTab('banners');">Delete Entire Banner</button>
                </div>
            </div>
        `;
    }

    ed.innerHTML = `
        <div class="card-header-flex">
            <span class="card-title">Gacha Core Rules & Active Gates</span>
        </div>
        
        <!-- 1. Глобальные правила Гросс-Лимитов -->
        <div class="sub-section" style="border-color: var(--accent-blue);">
            <div class="sub-section-title" style="color:var(--accent-blue);">⚙️ Global Gacha Engine Rules</div>
            <div class="form-grid">
                <div class="form-group">
                    <label>Max Standard Diamond Daily Draws</label>
                    <input type="number" value="${rules.max_standard_diamond_daily || 0}" oninput="target.gacha.rules.max_standard_diamond_daily = parseInt(this.value) || 0;">
                </div>
                <div class="form-group">
                    <label>Convert Duplicates Directly to Shards</label>
                    <select onchange="target.gacha.rules.convert_duplicates_to_shards = (this.value === 'true');">
                        <option value="false" ${rules.convert_duplicates_to_shards === false ? 'selected' : ''}>False (Fodder System)</option>
                        <option value="true" ${rules.convert_duplicates_to_shards === true ? 'selected' : ''}>True (Shard Convert System)</option>
                    </select>
                </div>
            </div>
        </div>

        <!-- Сюда вставляется аккордеон-редактор выбранного баннера -->
        ${selectedBannerFormHtml || '<p style="font-size:12px; color:var(--text-muted); margin-top:20px; padding:10px; background:rgba(255,255,255,0.01); border-radius:4px;">💡 Click any banner on the left sidebar list to inspect its settings, currencies, and limits.</p>'}
    `;
}

function renameGachaBannerKey(idx, newId) {
    if (!newId) return;
    const oldId = target.gacha.banners[idx].id;
    if (oldId === newId) return;

    if (target.gacha.banners.some((b, i) => b.id === newId && i !== idx)) {
        alert(`Banner key "${newId}" already exists!`);
        switchGachaSubTab('banners');
        return;
    }

    // Переносим лимит алмазов на новый ID ключа
    if (target.gacha.diamond_limits[oldId] !== undefined) {
        target.gacha.diamond_limits[newId] = target.gacha.diamond_limits[oldId];
        delete target.gacha.diamond_limits[oldId];
    }

    target.gacha.banners[idx].id = newId;
    switchGachaSubTab('banners');
}

function renderGachaPoolsManager(poolKey) {
    const ed = document.getElementById('gacha-editor');
    if (!ed || !poolKey) return;

    const pool = target.gacha.pools[poolKey];
    if (!pool.rates) pool.rates = {};
    if (!pool.heroes) pool.heroes = {};
    if (!pool.rate_up) pool.rate_up = {};

    // 1. Отрисовка весов редкостей (rates)
    let ratesHtml = Object.keys(pool.rates).map(rarity => `
        <div class="form-group" style="background:rgba(255,255,255,0.01); padding:6px; border:1px solid rgba(255,255,255,0.05); border-radius:4px;">
            <label style="color:var(--accent-pink); font-weight:600;">Drop Rate: ${rarity} (%)</label>
            <input type="number" step="any" value="${pool.rates[rarity]}" oninput="target.gacha.pools['${poolKey}'].rates['${rarity}'] = parseFloat(this.value) || 0;">
        </div>
    `).join('');

    // 2. Отрисовка списков персонажей по грейдам (heroes) с интерактивным CRUD-удалением тегов
    let heroesGridHtml = Object.keys(pool.heroes).map(rarity => {
        const heroKeysInTier = pool.heroes[rarity] || [];
        const tagsHtml = heroKeysInTier.map((hKey, hIdx) => `
            <span class="badge" style="display:inline-flex; align-items:center; gap:5px; margin:2px; padding:4px 8px; background:var(--accent-blue); font-family:monospace; font-size:11px;">
                ${hKey}
                <b style="cursor:pointer; color:#ff3333;" onclick="target.gacha.pools['${poolKey}'].heroes['${rarity}'].splice(${hIdx}, 1); renderGachaPoolsManager('${poolKey}');">×</b>
            </span>
        `).join('');

        return `
            <div class="sub-section" style="margin-top:10px; padding:12px; border-color:var(--border-color);">
                <div style="font-size:11px; font-weight:bold; color:var(--text-muted); margin-bottom:6px; text-transform:uppercase;">Roster Pool Tier: ${rarity}</div>
                <div style="display:flex; flex-wrap:wrap; margin-bottom:8px;">${tagsHtml || '<span style="font-size:11px; color:var(--text-muted); padding:2px;">No heroes added to this tier</span>'}</div>
                <div style="display:flex; gap:6px;">
                    <select id="add-pool-hero-${rarity}" style="font-size:12px; padding:4px;">
                        <option value="">-- Inject Hero to Tier --</option>
                        ${Object.keys(target.catalog?.heroes || {}).filter(hk => !heroKeysInTier.includes(hk)).map(hk => `<option value="${hk}">${hk}</option>`).join('')}
                    </select>
                    <button class="primary" style="padding:4px 10px; font-size:11px;" onclick="const val=document.getElementById('add-pool-hero-${rarity}').value; if(val){ if(!target.gacha.pools['${poolKey}'].heroes['${rarity}']) target.gacha.pools['${poolKey}'].heroes['${rarity}']=[]; target.gacha.pools['${poolKey}'].heroes['${rarity}'].push(val); renderGachaPoolsManager('${poolKey}'); }">+ Add</button>
                </div>
            </div>
        `;
    }).join('');

    // 3. Распределение повышенного шанса (Rate Up Matrix)
    let rateUpRowsHtml = Object.keys(pool.rate_up).map(hKey => `
        <div style="display:grid; grid-template-columns: 2fr 1fr auto; gap:10px; margin-bottom:6px; align-items:center;">
            <span class="badge" style="background:var(--bg-main); font-family:monospace; font-size:12px; height:32px; display:flex; align-items:center; padding:0 10px;">🔥 ${hKey}</span>
            <input type="number" value="${pool.rate_up[hKey]}" oninput="target.gacha.pools['${poolKey}'].rate_up['${hKey}'] = parseInt(this.value) || 0;" placeholder="Share %">
            <button class="danger" style="padding:6px 10px;" onclick="delete target.gacha.pools['${poolKey}'].rate_up['${hKey}']; renderGachaPoolsManager('${poolKey}');">X</button>
        </div>
    `).join('');

    ed.innerHTML = `
        <div class="card-header-flex">
            <span class="card-title">Edit Probability Pool Sandbox: ${poolKey}</span>
            <button class="danger" onclick="delete target.gacha.pools['${poolKey}']; stateGachaKey=null; document.getElementById('gacha-editor').innerHTML=''; renderGachaList();">Delete Pool</button>
        </div>
        
        <div class="form-grid">
            <div class="form-group"><label>Pool Dictionary ID Key</label><input type="text" value="${poolKey}" onchange="renameGachaPoolKey('${poolKey}', this.value);"></div>
            <div class="form-group"><label>Display Base Pull Price Value</label><input type="number" value="${pool.cost || 1}" oninput="target.gacha.pools['${poolKey}'].cost = parseInt(this.value) || 1;"></div>
            <div class="form-group"><label>Display Price Currency Code</label><input type="text" value="${pool.currency || ''}" oninput="target.gacha.pools['${poolKey}'].currency = this.value;"></div>
            <div class="form-group"><label>Supported Draw Modes Array (e.g. [1, 10])</label>
                <input type="text" value="${JSON.stringify(pool.modes || [])}" onchange="try{target.gacha.pools['${poolKey}'].modes = JSON.parse(this.value);}catch(e){}" style="font-family:monospace;">
            </div>
        </div>

        <div style="font-size:11px; font-weight:600; color:var(--text-muted); margin-top:20px; text-transform:uppercase; letter-spacing:0.5px;">Rarity Grades Probability Distribution Weights</div>
        <div class="form-grid" style="margin-top:8px; gap:8px;">
            ${ratesHtml || '<p style="font-size:11px; color:var(--text-muted);">No rarity tiers mapped in rates</p>'}
        </div>

        <div style="font-size:11px; font-weight:600; color:var(--text-muted); margin-top:20px; text-transform:uppercase; letter-spacing:0.5px;">Rate Up Character Target Share Distribution Matrix</div>
        <div class="sub-section" style="margin-top:8px; border-color:var(--accent-pink);">
            <div style="margin-bottom:10px;">${rateUpRowsHtml || '<p style="font-size:11px; color:var(--text-muted); margin:0; padding:5px;">No active character rate-up rules assigned</p>'}</div>
            <div style="display:flex; gap:6px;">
                <select id="add-rate-up-hero-${poolKey}" style="font-size:12px; padding:4px;">
                    <option value="">-- Inject Rate Up Target Hero --</option>
                    ${Object.keys(target.catalog?.heroes || {}).filter(hk => !Object.keys(pool.rate_up).includes(hk)).map(hk => `<option value="${hk}">${hk}</option>`).join('')}
                </select>
                <button class="primary" style="padding:4px 10px; font-size:12px;" onclick="const val=document.getElementById('add-rate-up-hero-${poolKey}').value; if(val){ target.gacha.pools['${poolKey}'].rate_up[val]=50; renderGachaPoolsManager('${poolKey}'); }">+ Inject</button>
            </div>
        </div>

        <div style="font-size:11px; font-weight:600; color:var(--text-muted); margin-top:20px; text-transform:uppercase; letter-spacing:0.5px;">Gacha Character Roster Tier Assignment Arrays</div>
        <div style="margin-top:8px;">
            ${heroesGridHtml}
        </div>
    `;
}

function renameGachaPoolKey(oldKey, newKey) {
    if (!newKey || oldKey === newKey || target.gacha.pools[newKey]) {
        switchGachaSubTab('pools');
        return;
    }
    target.gacha.pools[newKey] = target.gacha.pools[oldKey];
    delete target.gacha.pools[oldKey];

    // Каскадно обновляем ссылки в баннерах, если они использовали старый ID пула
    target.gacha.banners.forEach(b => { if (b.poolId === oldKey) b.poolId = newKey; });

    stateGachaKey = newKey;
    switchGachaSubTab('pools');
}

function renderGachaGuaranteesManager(poolKey) {
    const ed = document.getElementById('gacha-editor');
    if (!ed || !poolKey) return;

    const pool = target.gacha.pools[poolKey];
    if (!pool.guarantees) {
        pool.guarantees = { first: {}, every: {} };
    }
    const g = pool.guarantees;
    if (!g.first) g.first = {};
    if (!g.every) g.every = {};

    const rarities = target.mechanics?.rarities?.hero || ["R", "SR", "SSR", "UR"];

    // 1. Сборка полей для разовых гарантов (first)
    let firstRowsHtml = rarities.map(rarity => {
        const val = g.first[rarity] !== undefined ? g.first[rarity] : '';
        return `
            <div class="form-group">
                <label>First Draw ${rarity} Pity (Draws Count)</label>
                <input type="number" value="${val}" placeholder="Disabled (0)" oninput="if(!this.value || parseInt(this.value)===0){delete target.gacha.pools['${poolKey}'].guarantees.first['${rarity}'];}else{target.gacha.pools['${poolKey}'].guarantees.first['${rarity}'] = parseInt(this.value);}">
            </div>
        `;
    }).join('');

    // 2. Сборка полей для цикличных гарантов (every)
    let everyRowsHtml = rarities.map(rarity => {
        const val = g.every[rarity] !== undefined ? g.every[rarity] : '';
        return `
            <div class="form-group">
                <label>Every ${rarity} Pity Loop Interval</label>
                <input type="number" value="${val}" placeholder="Disabled (0)" oninput="if(!this.value || parseInt(this.value)===0){delete target.gacha.pools['${poolKey}'].guarantees.every['${rarity}'];}else{target.gacha.pools['${poolKey}'].guarantees.every['${rarity}'] = parseInt(this.value);}">
            </div>
        `;
    }).join('');

    ed.innerHTML = `
        <div class="card-header-flex">
            <span class="card-title">🛡️ Advanced Pity & Guarantees Sandbox: ${poolKey}</span>
            <button class="danger" onclick="delete target.gacha.pools['${poolKey}'].guarantees; switchGachaSubTab('guarantees');">Reset All Guarantees</button>
        </div>
        
        <div class="sub-section" style="border-color: var(--accent-blue); margin-top: 15px;">
            <div class="sub-section-title" style="color:var(--accent-blue);">🚀 First Pull Milestone Guarantees (Newbie Pity)</div>
            <p style="font-size:11px; color:var(--text-muted); margin-bottom:12px;">Triggered once per account life cycle when a user reaches exact hard threshold of total rolls inside this pool.</p>
            <div class="form-grid">
                ${firstRowsHtml}
            </div>
        </div>

        <div class="sub-section" style="border-color: var(--accent-pink); margin-top: 20px;">
            <div class="sub-section-title" style="color:var(--accent-pink);">⏳ Intermittent Loop Pity Counter (Cyclic Guarantees)</div>
            <p style="font-size:11px; color:var(--text-muted); margin-bottom:12px;">Standard repetitive loops engine. Guarantees character reward drop inside specified multi-pull window interval.</p>
            <div class="form-grid">
                ${everyRowsHtml}
            </div>
        </div>
    `;
}

// scripts/admin/offers.js — ЧАСТЬ 1 ИЗ 2
let stateOfferKey = null;         // ID выбранной акции (например, 'offer_selena_release')
let currentOfferRewardIdx = null; // Внутренний стейт для управления аккордеоном (если понадобится)

function renderOffersList() {
    const list = document.getElementById('offers-list');
    if (!list) return;

    // Инициализируем корневую структуру временных акций, если её нет в JSON
    if (!target.limited_offers) {
        target.limited_offers = {
            settings: { max_simultaneous_triggered_offers: 2, global_discount_badge_color: "#ffeb3b" },
            offers_pool: {}
        };
    }
    if (!target.limited_offers.offers_pool) target.limited_offers.offers_pool = {};

    list.innerHTML = Object.keys(target.limited_offers.offers_pool).map(key => {
        const offer = target.limited_offers.offers_pool[key];
        const typeBadge = {
            'scheduled': '<span class="badge" style="font-size:9px; background:var(--accent-blue);">CALENDAR</span>',
            'triggered': '<span class="badge" style="font-size:9px; background:var(--accent-pink);">TRIGGER</span>'
        }[offer.offer_type || 'scheduled'];

        return `
            <li class="crud-list-item ${stateOfferKey === key ? 'active' : ''}" onclick="selectOfferNode('${key}')">
                <div style="display:flex; align-items:center; gap:8px;">
                    <span>⚡</span>
                    <span style="font-family:monospace; font-size:13px;">${key}</span>
                </div>
                ${typeBadge}
            </li>
        `;
    }).join('');
}

function selectOfferNode(key) {
    stateOfferKey = key;
    renderOfferForm(key);
}

function createNewLimitedOffer() {
    if (!target.limited_offers.offers_pool) target.limited_offers.offers_pool = {};
    const count = Object.keys(target.limited_offers.offers_pool).length;
    const newKey = `offer_flash_sale_${count + 1}`;

    target.limited_offers.offers_pool[newKey] = {
        title_loc: { en: "New Limited Time Sale", ru: "" },
        desc_loc: { en: "Exclusive bundle available for a short window!", ru: "" },
        offer_type: "scheduled",
        start_epoch: Math.floor(Date.now() / 1000),
        end_epoch: Math.floor(Date.now() / 1000) + 604800, // +7 дней
        ui_mode: "popup_window",
        linked_ui_screen_id: "",
        cost: { resource: "usd", amount: 4.99 },
        buy_limit: 1,
        rewards: { resources: {}, items: [] }
    };

    stateOfferKey = newKey;
    renderOffersList();
    selectOfferNode(newKey);
}

function renderOfferForm(key) {
    renderOffersList();
    const ed = document.getElementById('offers-editor');
    if (!ed) return;

    const bb = target.limited_offers;
    const offer = bb.offers_pool[key];
    if (!offer) return;

    if (!offer.title_loc) offer.title_loc = { en: "", ru: "" };
    if (!offer.desc_loc) offer.desc_loc = { en: "", ru: "" };
    if (!offer.cost) offer.cost = { resource: "usd", amount: 0 };
    if (!offer.rewards) offer.rewards = { resources: {}, items: [] };

    // Селектор валют стоимости (включая USD и ресурсы из механик)
    const costCurrencyOptions = [
        `<option value="usd" ${offer.cost.resource === 'usd' ? 'selected' : ''}>💵 Real Cash (USD)</option>`,
        ...Object.keys(target.mechanics?.resources || {}).map(r =>
        `<option value="${r}" ${offer.cost.resource === r ? 'selected' : ''}>🔮 Resource: ${r}</option>`
    )
].join('');

    // Селектор кастомного экрана UI, если акция имеет тип ui_mode: "custom_screen"
    const uiScreenOptions = (target.ui?.landscape || []).map(scr =>
        `<option value="${scr.id}" ${offer.linked_ui_screen_id === scr.id ? 'selected' : ''}>🖥️ Screen: ${scr.id}</option>`
    ).join('');

    ed.innerHTML = `
        <!-- ГЛОБАЛЬНЫЕ НАСТРОЙКИ СИСТЕМЫ АКЦИЙ -->
        <div class="sub-section" style="border-color: var(--accent-blue); margin-bottom: 20px;">
            <div class="sub-section-title" style="color:var(--accent-blue);">⚙️ Global Flash Sales Operations Control</div>
            <div class="form-grid">
                <div class="form-group">
                    <label>Max Simultaneous Triggered Popups</label>
                    <input type="number" value="${bb.settings?.max_simultaneous_triggered_offers || 2}" oninput="if(!target.limited_offers.settings)target.limited_offers.settings={}; target.limited_offers.settings.max_simultaneous_triggered_offers = parseInt(this.value) || 2;">
                </div>
                <div class="form-group">
                    <label>UI Discount Badge Highlight Color (Hex)</label>
                    <input type="color" value="${bb.settings?.global_discount_badge_color || '#ffeb3b'}" oninput="if(!target.limited_offers.settings)target.limited_offers.settings={}; target.limited_offers.settings.global_discount_badge_color = this.value;">
                </div>
            </div>
        </div>

        <div class="card-header-flex">
            <span class="card-title">Configure Active Offer Bundle: ${key}</span>
            <button class="danger" onclick="delete target.limited_offers.offers_pool['${key}']; stateOfferKey = null; document.getElementById('offers-editor').innerHTML = ''; renderOffersList();">Delete Offer Node</button>
        </div>
        
        <div class="form-grid">
            <div class="form-group"><label>Offer Unique DB Identifier</label><input type="text" value="${key}" onchange="renameOfferKey('${key}', this.value)" style="font-family:monospace;"></div>
            <div class="form-group">
                <label>Operational Trigger/Campaign Class</label>
                <select onchange="target.limited_offers.offers_pool['${key}'].offer_type = this.value; renderOfferForm('${key}');">
                    <option value="scheduled" ${offer.offer_type === 'scheduled' ? 'selected' : ''}>Scheduled Calendar Event</option>
                    <option value="triggered" ${offer.offer_type === 'triggered' ? 'selected' : ''}>Triggered Real-Time Pop-up</option>
                </select>
            </div>
        </div>
        <div id="offers-conditional-fields-anchor"></div>
    `;

    if (typeof renderOfferConditionalAndRewards === 'function') {
        renderOfferConditionalAndRewards(key, offer, costCurrencyOptions, uiScreenOptions);
    }
}

// scripts/admin/offers.js — ЧАСТЬ 2 ИЗ 2 (ФИНАЛ МОДУЛЯ)
function renderOfferConditionalAndRewards(key, offer, costCurrencyOptions, uiScreenOptions) {
    const anchor = document.getElementById('offers-conditional-fields-anchor');
    if (!anchor) return;

    // Жесткий список системных серверных триггеров для выпадающего меню
    const systemTriggers = [
        { id: "pve_boss_defeat", label: "🆘 Defeat in PVE Boss Battle" },
        { id: "player_level_up", label: "🎉 Account Player Level Up" },
        { id: "gacha_pity_reached", label: "🎰 Hard Gacha Pity Milestone" },
        { id: "arena_league_rank_up", label: "🏆 Advancement in Arena League" }
    ];

    let conditionalFieldsHtml = '';

    // Если акция по расписанию — выводим поля эпох-таймстампов
    if (offer.offer_type === 'scheduled') {
        conditionalFieldsHtml = `
            <div class="form-group">
                <label>Start Cycle Epoch Timestamp</label>
                <input type="number" value="${offer.start_epoch || 0}" oninput="target.limited_offers.offers_pool['${key}'].start_epoch = parseInt(this.value) || 0;">
            </div>
            <div class="form-group">
                <label>End Cycle Epoch Timestamp</label>
                <input type="number" value="${offer.end_epoch || 0}" oninput="target.limited_offers.offers_pool['${key}'].end_epoch = parseInt(this.value) || 0;">
            </div>
        `;
    }
    // Если акция триггерная — выводим жесткий селектор событий и таймер дефицита
    else {
        if (!offer.trigger_event) offer.trigger_event = "pve_boss_defeat";
        const triggerOptions = systemTriggers.map(t =>
            `<option value="${t.id}" ${offer.trigger_event === t.id ? 'selected' : ''}>${t.label}</option>`
        ).join('');

        conditionalFieldsHtml = `
            <div class="form-group">
                <label>Server-Side Trigger Event Hook</label>
                <select onchange="target.limited_offers.offers_pool['${key}'].trigger_event = this.value; renderOfferForm('${key}');">
                    ${triggerOptions}
                </select>
            </div>
            <div class="form-group">
                <label>FOMO Countdown Window Timer (milliseconds)</label>
                <input type="number" value="${offer.available_duration_ms || 7200000}" oninput="target.limited_offers.offers_pool['${key}'].available_duration_ms = parseInt(this.value) || 7200000;">
            </div>
        `;

        // Если выбран триггер на повышение уровня, докидываем поле порога (например, 50 уровень)
        if (offer.trigger_event === 'player_level_up') {
            conditionalFieldsHtml += `
                <div class="form-group full-width">
                    <label>Required Level Threshold Target Value (trigger_value_threshold)</label>
                    <input type="number" value="${offer.trigger_value_threshold || 50}" oninput="target.limited_offers.offers_pool['${key}'].trigger_value_threshold = parseInt(this.value) || 50;">
                </div>
            `;
        }
    }

    // Собираем вторую половину формы (UI режимы, стоимости и JSON наград)
    anchor.outerHTML = `
        <div class="form-grid" style="margin-top: 12px;">
            ${conditionalFieldsHtml}
            
            <div class="form-group">
                <label>Render Interface Mode Layout</label>
                <select onchange="target.limited_offers.offers_pool['${key}'].ui_mode = this.value; renderOfferForm('${key}');">
                    <option value="popup_window" ${offer.ui_mode === 'popup_window' ? 'selected' : ''}>Standard Popup Overlay Window</option>
                    <option value="custom_screen" ${offer.ui_mode === 'custom_screen' ? 'selected' : ''}>Dedicated Fullscreen Promo Tab</option>
                </select>
            </div>

            <div class="form-group">
                <label>Linked Custom UI Template Screen Link</label>
                <select onchange="target.limited_offers.offers_pool['${key}'].linked_ui_screen_id = this.value;" ${offer.ui_mode !== 'custom_screen' ? 'disabled' : ''}>
                    <option value="">-- No Fullscreen Asset Assigned --</option>
                    ${uiScreenOptions}
                </select>
            </div>

            <div class="form-group">
                <label>Active Sale Price Token Class</label>
                <select onchange="target.limited_offers.offers_pool['${key}'].cost.resource = this.value;">
                    ${costCurrencyOptions}
                </select>
            </div>
            <div class="form-group">
                <label>Active Sale Price Numeric Value</label>
                <input type="number" step="any" value="${offer.cost.amount || 0}" oninput="target.limited_offers.offers_pool['${key}'].cost.amount = parseFloat(this.value) || 0;">
            </div>
            <div class="form-group">
                <label>Old Reference Visual Value (Discount Crossout)</label>
                <input type="number" step="any" value="${offer.old_cost?.amount || 0}" oninput="if(!target.limited_offers.offers_pool['${key}'].old_cost) target.limited_offers.offers_pool['${key}'].old_cost={resource:offer.cost.resource,amount:0}; target.limited_offers.offers_pool['${key}'].old_cost.amount = parseFloat(this.value) || 0;">
            </div>
            <div class="form-group">
                <label>Dynamic Account Purchase Lifespan Limit</label>
                <input type="number" value="${offer.buy_limit || 1}" oninput="target.limited_offers.offers_pool['${key}'].buy_limit = parseInt(this.value) || 1;">
            </div>
        </div>

        <div class="form-grid" style="margin-top: 12px;">
            <div class="form-group"><label>Offer Header Title (Localization EN)</label><input type="text" value="${offer.title_loc.en || ''}" oninput="target.limited_offers.offers_pool['${key}'].title_loc.en = this.value;"></div>
            <div class="form-group"><label>Offer Header Title (Localization RU)</label><input type="text" value="${offer.title_loc.ru || ''}" oninput="target.limited_offers.offers_pool['${key}'].title_loc.ru = this.value;"></div>
            <div class="form-group"><label>Offer Subtext Description (Localization EN)</label><input type="text" value="${offer.desc_loc.en || ''}" oninput="target.limited_offers.offers_pool['${key}'].desc_loc.en = this.value;"></div>
            <div class="form-group"><label>Offer Subtext Description (Localization RU)</label><input type="text" value="${offer.desc_loc.ru || ''}" oninput="target.limited_offers.offers_pool['${key}'].desc_loc.ru = this.value;"></div>
        </div>

        <!-- КАРТА НАГРАД ПАКА ЧЕРЕЗ JSON ИНСПЕКТОР -->
        <div class="sub-section" style="border-color: var(--accent-pink); margin-top: 20px;">
            <div class="sub-section-title" style="color:var(--accent-pink);">🎁 Contained Payload Items & Resources (Presents Cargo)</div>
            <textarea style="width:100%; height:95px; font-family:monospace; font-size:11px; margin-top:8px;" oninput="try{target.limited_offers.offers_pool['${key}'].rewards = JSON.parse(this.value); this.style.borderColor='var(--border-color)';}catch(e){this.style.borderColor='var(--accent-red)';}">${JSON.stringify(offer.rewards, null, 4)}</textarea>
            <p style="font-size:10px; color:var(--text-muted); margin-top:3px;">💡 Valid format: {"resources": {"diamond": 1000}, "items": [{"itemId": "scroll_epic", "amount": 5}]}</p>
        </div>
    `;
}

function renameOfferKey(oldKey, newKey) {
    if (!newKey || oldKey === newKey || target.limited_offers.offers_pool[newKey]) {
        renderOffersList();
        renderOfferForm(oldKey);
        return;
    }
    target.limited_offers.offers_pool[newKey] = target.limited_offers.offers_pool[oldKey];
    delete target.limited_offers.offers_pool[oldKey];
    stateOfferKey = newKey;
    renderOffersList();
    renderOfferForm(newKey);
}

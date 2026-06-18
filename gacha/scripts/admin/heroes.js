function renderHeroes() {
    const list = document.getElementById('hero-list');
    list.innerHTML = Object.keys(target.catalog.heroes).map(key => {
        const h = target.catalog.heroes[key];
        const avatarUrl = h.icon ? h.icon : '';
        const imgHtml = avatarUrl ?
            `<img src="${avatarUrl}" style="width:20px; height:20px; border-radius:50%; object-fit:cover; border:1px solid var(--border-color);" onerror="this.style.display='none'">` :
            `<span style="font-size:14px;">🦸</span>`;

        return `
            <li class="crud-list-item ${state.hero === key ? 'active' : ''}" onclick="selectHero('${key}')">
                <div style="display:flex; align-items:center; gap:8px;">
                    ${imgHtml}
                    <span>${key}</span>
                </div>
                <span class="badge">${h.rarity || 'UR'}</span>
            </li>
        `;
    }).join('');
}

function selectHero(key) {
    state.hero = key;
    renderHeroes();
    const h = target.catalog.heroes[key];
    const ed = document.getElementById('hero-editor');

    // Гарантируем наличие базовых объектов из прототипа, если их нет
    if (!h.title_loc) h.title_loc = JSON.parse(JSON.stringify(BASE_LANGUAGES));
    if (!h.bio_loc) h.bio_loc = JSON.parse(JSON.stringify(BASE_LANGUAGES));
    if (!h.base_stats) h.base_stats = {};
    if (!h.stats_growth) h.stats_growth = {};
    if (!h.bonds) h.bonds = [];
    if (!h.skins) h.skins = [];

    // Динамически рендерим только те 5 статов, которые реально заведены в механиках игры
    const allowedStats = Object.keys(target.mechanics?.stats || {});
    let baseStatsHtml = allowedStats.map(statKey => {
        const statMeta = target.mechanics.stats[statKey];
        if (h.base_stats[statKey] === undefined) h.base_stats[statKey] = 0;
        return `
            <div class="form-group">
                <label>${statMeta.icon || ''} ${statKey.toUpperCase()} (Base)</label>
                <input type="number" value="${h.base_stats[statKey]}" oninput="target.catalog.heroes['${key}'].base_stats['${statKey}'] = parseInt(this.value)">
            </div>
        `;
    }).join('');

    let growthStatsHtml = allowedStats.map(statKey => {
        const statMeta = target.mechanics.stats[statKey];
        if (h.stats_growth[statKey] === undefined) h.stats_growth[statKey] = 0;
        return `
            <div class="form-group">
                <label>${statMeta.icon || ''} ${statKey.toUpperCase()} (Growth)</label>
                <input type="number" value="${h.stats_growth[statKey]}" oninput="target.catalog.heroes['${key}'].stats_growth['${statKey}'] = parseInt(this.value)">
            </div>
        `;
    }).join('');

    // Выпадающий список доступных предметов для привязки персонального артефакта
    const personalItemOptions = Object.keys(target.catalog?.items || {}).map(iKey =>
        `<option value="${iKey}" ${h.personal_item_id === iKey ? 'selected' : ''}>${target.catalog.items[iKey].icon || '📦'} ${target.catalog.items[iKey].title_loc?.en || iKey}</option>`
    ).join('');

    // Опции для связей (выбор другого героя в качестве таргета)
    const targetHeroOptions = Object.keys(target.catalog?.heroes || {}).filter(hk => hk !== key).map(hk =>
        `<option value="${hk}">${target.catalog.heroes[hk].title_loc?.en || hk}</option>`
    ).join('');

    // Сетка статов для выбора бонуса связи
    const bondStatOptions = allowedStats.map(statKey =>
        `<option value="${statKey}">${statKey.toUpperCase()}</option>`
    ).join('');

    // Рендеринг CRUD-списка связей героя (Bonds)
    let bondsHtml = h.bonds.map((bond, bIdx) => {
        const currentHeroOptions = Object.keys(target.catalog?.heroes || {}).filter(hk => hk !== key).map(hk =>
            `<option value="${hk}" ${bond.target_hero_id === hk ? 'selected' : ''}>${target.catalog.heroes[hk].title_loc?.en || hk}</option>`
        ).join('');

        const currentStatOptions = allowedStats.map(statKey =>
            `<option value="${statKey}" ${bond.bonus_stat_id === statKey ? 'selected' : ''}>${statKey.toUpperCase()}</option>`
        ).join('');

        return `
            <div class="sub-section" style="margin-top:10px; padding:12px; border-color:var(--accent-blue);">
                <div class="card-header-flex" style="border:none; padding:0; margin-bottom:8px;">
                    <span style="font-size:11px; font-weight:600; color:var(--accent-blue);">BOND LINK #${bIdx + 1}</span>
                    <button class="danger" style="padding: 2px 6px; font-size:11px;" onclick="target.catalog.heroes['${key}'].bonds.splice(${bIdx}, 1); selectHero('${key}');">Remove Bond</button>
                </div>
                <div class="form-grid">
                    <div class="form-group">
                        <label>Target Companion Hero</label>
                        <select onchange="target.catalog.heroes['${key}'].bonds[${bIdx}].target_hero_id = this.value">
                            <option value="">-- Select Target Hero --</option>
                            ${currentHeroOptions}
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Bonus Attribute</label>
                        <select onchange="target.catalog.heroes['${key}'].bonds[${bIdx}].bonus_stat_id = this.value">
                            <option value="">-- Select Attribute --</option>
                            ${currentStatOptions}
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Bonus Value (%)</label>
                        <input type="number" value="${bond.bonus_value || 0}" oninput="target.catalog.heroes['${key}'].bonds[${bIdx}].bonus_value = parseInt(this.value)">
                    </div>
                    <div class="form-group">
                        <label>Bond Custom Name (EN)</label>
                        <input type="text" value="${bond.desc_loc?.en || ''}" oninput="target.catalog.heroes['${key}'].bonds[${bIdx}].desc_loc.en = this.value">
                    </div>
                </div>
            </div>
        `;
    }).join('');

    // Рендеринг скинов с поддержкой мультиязычных названий
    let skinsHtml = h.skins.map((skin, sIdx) => `
            <div class="sub-section" style="margin-top:10px; padding:10px;">
                <div class="card-header-flex" style="border:none; padding:0; margin-bottom:5px;">
                    <span style="font-size:11px; color:var(--text-muted);">Skin ID: ${skin.skin_id}</span>
                    <button class="danger" style="padding: 2px 6px; font-size: 11px;" onclick="target.catalog.heroes['${key}'].skins.splice(${sIdx}, 1); selectHero('${key}');">Delete Skin</button>
                </div>
                <div class="form-grid">
                    <div class="form-group"><label>Skin Name (EN)</label><input type="text" value="${skin.name_loc?.en || ''}" oninput="target.catalog.heroes['${key}'].skins[${sIdx}].name_loc.en = this.value"></div>
                    <div class="form-group"><label>Skin Name (RU)</label><input type="text" value="${skin.name_loc?.ru || ''}" oninput="target.catalog.heroes['${key}'].skins[${sIdx}].name_loc.ru = this.value"></div>
                    <div class="form-group">
                        <label>Skin Artwork Asset Path</label>
                        <input type="text" value="${skin.image || ''}" oninput="target.catalog.heroes['${key}'].skins[${sIdx}].image = this.value; document.getElementById('skin-prev-${sIdx}').src = this.value; document.getElementById('skin-prev-box-${sIdx}').style.display='block';">
                        <div id="skin-prev-box-${sIdx}" style="margin-top:8px; display:${skin.image ? 'block' : 'none'};">
                            <img id="skin-prev-${sIdx}" src="${skin.image || ''}" style="max-height:80px; border-radius:4px; border:1px solid var(--border-color);" onerror="this.parentElement.style.display='none'">
                        </div>
                    </div>
                </div>
            </div>
        `).join('');


    const factionOptions = Object.keys(target.catalog.factions || {}).map(fKey =>
        `<option value="${fKey}" ${h.faction_id === fKey ? 'selected' : ''}>${target.catalog.factions[fKey].icon || ''} ${target.catalog.factions[fKey].title_loc?.en || fKey}</option>`
    ).join('');

    const classOptions = Object.keys(target.catalog.classes || {}).map(cKey =>
        `<option value="${cKey}" ${h.class_id === cKey ? 'selected' : ''}>${target.catalog.classes[cKey].icon || ''} ${target.catalog.classes[cKey].title_loc?.en || cKey}</option>`
    ).join('');

    const skillOptions = Object.keys(target.catalog.skills || {}).map(sKey =>
        `<option value="${sKey}" ${h.skills?.includes(sKey) ? 'selected' : ''}>${target.catalog.skills[sKey].icon || ''} ${target.catalog.skills[sKey].title_loc?.en || sKey}</option>`
    ).join('');

    const elementOptions = Object.keys(target.catalog.hero_elements || {}).map(sKey =>
        `<option value="${sKey}" ${h.element_id === sKey ? 'selected' : ''}>${target.catalog.hero_elements[sKey].icon || ''} ${target.catalog.hero_elements[sKey].title_loc?.en || sKey}</option>`
    ).join('');

    const avatarAndImage = `
            <div class="form-group">
                <label>Avatar Asset Icon</label>
                <input type="text" value="${h.icon || ''}" oninput="target.catalog.heroes['${key}'].icon = this.value; renderHeroes(); document.getElementById('main-avatar-prev').src = this.value; document.getElementById('main-avatar-box').style.display='block';">
                <div id="main-avatar-box" style="margin-top:8px; display:${h.icon ? 'block' : 'none'};">
                    <img id="main-avatar-prev" src="${h.icon || ''}" style="width:50px; height:50px; border-radius:50%; object-fit:cover; border:1px solid var(--border-color);" onerror="this.parentElement.style.display='none'">
                </div>
            </div>

            <div class="form-group">
                <label>Fullheight Body Texture</label>
                <input type="text" value="${h.image || ''}" oninput="target.catalog.heroes['${key}'].image = this.value; document.getElementById('main-image-prev').src = this.value; document.getElementById('main-image-box').style.display='block';">
                <div id="main-image-box" style="margin-top:8px; display:${h.image ? 'block' : 'none'};">
                    <img id="main-image-prev" src="${h.image || ''}" style="max-height:150px; border-radius:4px; border:1px solid var(--border-color); object-fit:contain;" onerror="this.parentElement.style.display='none'">
                </div>
            </div>
    `;

    ed.innerHTML = `
        <div class="card-header-flex">
            <span class="card-title">Edit Hero Metadata: ${key}</span>
            <button class="danger" onclick="deleteHero('${key}')">Delete Hero Instance</button>
        </div>
        <div class="form-grid">
        
            <div class="form-group"><label>Hero DB Key</label><input type="text" value="${key}" onchange="renameHeroKey('${key}', this.value)"></div>
                  
                    <div class="form-group">
                        <label>Hero Name (Localization)</label>
                        <div class="sub-section" style="margin-top:5px; padding:10px;">
                            ${generateLocInputs(h.title_loc, `target.catalog.heroes['${key}'].title_loc`)}
                        </div>
                    </div>
                    <div class="form-group">
                        <label>Hero Biography (Localization)</label>
                        <div class="sub-section" style="margin-top:5px; padding:10px;">
                            ${generateLocInputs(h.bio_loc, `target.catalog.heroes['${key}'].bio_loc`)}
                        </div>
                    </div>
        </div>
      `;

    ed.innerHTML += `
         <div class="form-grid" style="margin-top: 15px">
             ${avatarAndImage}
       
            <div class="form-group">
                <label>Rarity Tier</label>
                <select onchange="target.catalog.heroes['${key}'].rarity = this.value; renderHeroes();">
                    <option value="">-- Select Rarity --</option>
                    ${(target.mechanics?.rarities?.hero || ["R", "SR", "SSR", "UR"]).map(r => `<option value="${r}" ${h.rarity === r ? 'selected' : ''}>${r}</option>`).join('')}
                </select>
            </div>
            <div class="form-group"><label>Max Level Cap</label><input type="number" value="${h.max_level || 100}" oninput="target.catalog.heroes['${key}'].max_level = parseInt(this.value)"></div>

            <div class="form-group">
                <label>Faction Alliance</label>
                <select onchange="target.catalog.heroes['${key}'].faction_id = this.value">
                    <option value="">-- Select Faction --</option>
                    ${factionOptions}
                </select>
            </div>

            <div class="form-group">
                <label>Combat Class</label>
                <select onchange="target.catalog.heroes['${key}'].class_id = this.value">
                    <option value="">-- Select Class --</option>
                    ${classOptions}
                </select>
            </div>

            <div class="form-group">
                <label>Active Skill</label>
                <select onchange="target.catalog.heroes['${key}'].skills = [this.value]">
                    <option value="">-- Select Skill --</option>
                    ${skillOptions}
                </select>
            </div>
            
             <div class="form-group">
                <label>Element</label>
                <select onchange="target.catalog.hero_elements['${key}'].element_id = this.value">
                    <option value="">-- Select Element --</option>
                    ${elementOptions}
                </select>
            </div>

            <div class="form-group">
                <label>Personal Exclusive Item</label>
                <select onchange="target.catalog.heroes['${key}'].personal_item_id = this.value">
                    <option value="">-- No Signature Item --</option>
                    ${personalItemOptions}
                </select>
            </div>
           
        </div>

        <div class="sub-section">
            <div class="sub-section-title">Base Character Attributes (Live Metrics)</div>
            <div class="form-grid">${baseStatsHtml}</div>
        </div>

        <div class="sub-section">
            <div class="sub-section-title">Growth Factors (Scalar Weights)</div>
            <div class="form-grid">${growthStatsHtml}</div>
        </div>

        <div class="sub-section">
            <div class="card-header-flex" style="border:none; padding:0; margin-bottom:5px;">
                <div class="sub-section-title" style="margin:0;">Synergy Bonds Matrix</div>
                <button class="primary" style="padding: 2px 6px; font-size: 11px;" onclick="target.catalog.heroes['${key}'].bonds.push({target_hero_id:'', bonus_stat_id:'', bonus_value:0, desc_loc:{en:'',ru:''}}); selectHero('${key}');">+ Add Link</button>
            </div>
            <div>${bondsHtml || '<p style="font-size:12px; color:var(--text-muted);">No combat bonds configured</p>'}</div>
        </div>
          <div class="sub-section">
                    <div class="card-header-flex" style="border:none; padding:0; margin-bottom:5px;">
                        <div class="sub-section-title" style="margin:0;">Alternative Custom Skins</div>
                        <button class="primary" style="padding: 2px 6px; font-size: 11px;" onclick="target.catalog.heroes['${key}'].skins.push({skin_id:'skin_'+Date.now(), name_loc:{en:'',ru:''}, image:''}); selectHero('${key}');">+ Add Skin</button>
                    </div>
                    <div>${skinsHtml || '<p style="font-size:12px; color:var(--text-muted);">No alternative skins added</p>'}</div>
                </div>
            `;
}


function createNewHero() {
    const newKey = `new_deity_${Object.keys(target.catalog.heroes).length}`;
    target.catalog.heroes[newKey] = JSON.parse(JSON.stringify(HERO_PROTOTYPE));
    target.catalog.heroes[newKey].title_loc = { en: "New Hero Instance", ru: "" };
    target.catalog.heroes[newKey].base_stats = { hp: 100, atk: 10, speed: 10 };
    target.catalog.heroes[newKey].stats_growth = { hp: 10, atk: 2, speed: 1 };
    selectHero(newKey);
}

function addHeroSkin(key) {
    if(!target.catalog.heroes[key].skins) target.catalog.heroes[key].skins = [];
    target.catalog.heroes[key].skins.push({ skin_id: `skin_${Date.now()}`, name_loc: { en: "New Alternative Texture", ru: "" }, image: "" });
    selectHero(key);
}

function removeHeroSkin(key, idx) {
    target.catalog.heroes[key].skins.splice(idx, 1);
    selectHero(key);
}

function deleteHero(key) {
    if (!confirm('Are you sure you want to delete this hero?')) return;

    cascadeDeleteKey('hero', key);

    delete target.catalog.heroes[key];
    state.hero = null;
    document.getElementById('hero-editor').innerHTML = '';
    renderHeroes();
}


function renameHeroKey(oldKey, newKey) {
    if (!newKey || oldKey === newKey) return;

    if (isKeyDuplicate('hero', newKey, oldKey)) {
        alert(`Error: Hero key "${newKey}" already exists!`);
        renderHeroes();
        selectHero(oldKey);
        return;
    }

    cascadeRenameKey('hero', oldKey, newKey);
    target.catalog.heroes[newKey] = target.catalog.heroes[oldKey];
    delete target.catalog.heroes[oldKey];

    if (state.hero === oldKey) state.hero = newKey;
    renderHeroes();
    selectHero(newKey);
}
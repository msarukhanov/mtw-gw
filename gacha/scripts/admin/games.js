function renderGames() {
    const list = document.getElementById('game-list');
    if (!list) return;
    list.innerHTML = Object.keys(target.catalog.games || {}).map(key => {
        const g = target.catalog.games[key];
        const bannerUrl = g.icon || g.banner || '';
        const imgHtml = bannerUrl ?
            `<img src="${bannerUrl}" style="width:30px; height:20px; border-radius:4px; object-fit:cover; border:1px solid var(--border-color);" onerror="this.outerHTML='<span>🎮</span>'">` :
            `<span style="font-size:14px;">🎮</span>`;

        return `
            <li class="crud-list-item ${state.game === key ? 'active' : ''}" onclick="selectGame('${key}')">
                <div style="display:flex; align-items:center; gap:8px;">
                    ${imgHtml}
                    <span style="font-family:monospace; font-size:13px;">${key}</span>
                </div>
                <span class="badge">${g.rarity || 'SSR'}</span>
            </li>
        `;
    }).join('');
}

function selectGame(key) {
    state.game = key;
    renderGames();
    const g = target.catalog.games[key];
    const ed = document.getElementById('game-editor');
    if (!ed) return;

    if (!g.title_loc) g.title_loc = JSON.parse(JSON.stringify(BASE_LANGUAGES));

    const genreOptions = Object.keys(target.catalog.game_genres || {}).map(genreKey =>
        `<option value="${genreKey}" ${g.genre_id === genreKey ? 'selected' : ''}>${target.catalog.game_genres[genreKey].icon || ''} ${target.catalog.game_genres[genreKey].title_loc?.en || genreKey}</option>`
    ).join('');

    const platformOptions = Object.keys(target.catalog.game_platforms || {}).map(platKey =>
        `<option value="${platKey}" ${g.platform_id === platKey ? 'selected' : ''}>${target.catalog.game_platforms[platKey].icon || ''} ${target.catalog.game_platforms[platKey].title_loc?.en || platKey}</option>`
    ).join('');

    const hasBanner = g.banner && (g.banner.startsWith('.') || g.banner.startsWith('http'));
    const liveBannerHtml = hasBanner ?
        `<img id="game-live-banner" src="${g.banner}" style="max-width:200px; max-height:100px; border-radius:6px; border:1px solid var(--border-color); object-fit:cover;" onerror="this.style.display='none'">` :
        `<div style="width:120px; height:80px; background:var(--bg-main); border-radius:6px; border:1px solid var(--border-color); display:flex; align-items:center; justify-content:center; color:var(--text-muted); font-size:12px;">No Banner Art</div>`;

    ed.innerHTML = `
       <div class="card-header-flex">
            <span class="card-title">Edit Game Configuration: ${key}</span>
            <button class="danger" onclick="deleteGameInstance('${key}')">Delete Game</button>
        </div>
        <div class="form-grid">
            <div class="form-group">
                <label>Game Unique Key</label>
                <input type="text" value="${key}" onchange="renameGameKey('${key}', this.value)" style="font-family:monospace;">
            </div>
            <div class="form-group">
                <label>Game Quality Rarity</label>
                <select onchange="target.catalog.games['${key}'].rarity = this.value; renderGames();">
                    <option value="">-- Select Rarity --</option>
                    ${(target.mechanics?.rarities?.game || ["R", "SR", "SSR", "UR"]).map(r => `<option value="${r}" ${g.rarity === r ? 'selected' : ''}>${r}</option>`).join('')}
                </select>
            </div>
            <div class="form-group"><label>Maximum Account Level Required</label><input type="number" value="${g.max_level || 100}" oninput="target.catalog.games['${key}'].max_level = parseInt(this.value)"></div>
            <div class="form-group">
                <label>Operational Live Status</label>
                <select onchange="target.catalog.games['${key}'].status = this.value">
                    <option value="hot" ${g.status === 'hot' ? 'selected' : ''}>HOT 🔥</option>
                    <option value="new" ${g.status === 'new' ? 'selected' : ''}>NEW 🆕</option>
                    <option value="stable" ${g.status === 'stable' ? 'selected' : ''}>STABLE ✅</option>
                </select>
            </div>
            <div class="form-group">
                <label>Core Game Genre</label>
                <select onchange="target.catalog.games['${key}'].genre_id = this.value">
                    <option value="">-- Select Genre --</option>
                    ${genreOptions}
                </select>
            </div>
            
            <div class="form-group full-width">
                <label>Embed Game Build Frame URL</label>
                <input type="text" value="${g.embed_url || ''}" oninput="target.catalog.games['${key}'].embed_url = this.value" placeholder="https://...">
            </div>
            <div class="form-group">
                <label>Target Distribution Platform</label>
                <select onchange="target.catalog.games['${key}'].platform_id = this.value">
                    <option value="">-- Select Platform --</option>
                    ${platformOptions}
                </select>
            </div>
            <div class="form-group full-width"><label>Square Icon Icon Path</label><input type="text" value="${g.icon || ''}" oninput="target.catalog.games['${key}'].icon = this.value; renderGames();"></div>
            <div class="form-group full-width">
                <label>Horizontal Promo Banner Artwork</label>
                <input type="text" value="${g.banner || ''}" oninput="target.catalog.games['${key}'].banner = this.value; const img=document.getElementById('game-live-banner'); if(img){img.src=this.value; img.style.display='block';}">
                <div style="margin-top:10px;">${liveBannerHtml}</div>
            </div>
        </div>
        <div class="form-grid" style="margin-top:15px;">
            <div class="form-group full-width">
                <label>Game Title (Localization)</label>
                <div class="sub-section" style="margin-top:5px; padding:10px;">
                    ${generateLocInputs(g.title_loc, `target.catalog.games['${key}'].title_loc`)}
                </div>
            </div>
        </div>
    `;
}

function createNewGameInstance() {
    if (!target.catalog.games) target.catalog.games = {};
    const newKey = `new_game_${Object.keys(target.catalog.games).length}`;

    target.catalog.games[newKey] = {
        title_loc: JSON.parse(JSON.stringify(BASE_LANGUAGES)),
        rarity: "SSR",
        max_level: 100,
        genre_id: "",
        platform_id: "",
        status: "new",
        icon: "",
        banner: "",
        embed_url: "" // Добавляем дефолтное поле для iframe
    };

    state.game = newKey;
    renderGames();
    selectGame(newKey);
}


function renameGameKey(oldKey, newKey) {
    if (!newKey || oldKey === newKey) return;

    if (target.catalog.games[newKey]) {
        alert(`Error: The game key "${newKey}" already exists!`);
        renderGames();
        selectGame(oldKey);
        return;
    }

    cascadeRenameKey('game', oldKey, newKey);

    target.catalog.games[newKey] = target.catalog.games[oldKey];
    delete target.catalog.games[oldKey];

    if (state.game === oldKey) state.game = newKey;
    renderGames();
    selectGame(newKey);
}

function deleteGameInstance(key) {
    if (!confirm(`Are you sure you want to permanently delete the game: ${key}?`)) return;

    cascadeDeleteKey('game', key);

    delete target.catalog.games[key];
    state.game = null;

    const ed = document.getElementById('game-editor');
    if (ed) ed.innerHTML = '';

    renderGames();
}

function renderServers() {
    const list = document.getElementById('server-list');
    list.innerHTML = target.servers.map((s, idx) => `
        <li class="crud-list-item ${state.server === idx ? 'active' : ''}" onclick="selectServer(${idx})">
            <span>${s.id || 'New Server'}</span>
            <span class="badge">${s.status || 'none'}</span>
        </li>
    `).join('');
}

function selectServer(idx) {
    state.server = idx;
    renderServers();
    const s = target.servers[idx];
    const ed = document.getElementById('server-editor');
    ed.innerHTML = `
        <div class="card-header-flex">
            <span class="card-title">Edit Server: ${s.id}</span>
            <button class="danger" onclick="deleteServer(${idx})">Delete Server</button>
        </div>
        <div class="form-grid">
            <div class="form-group">
                <label>Server ID</label>
                <input type="text" value="${s.id || ''}" oninput="target.servers[${idx}].id = this.value; renderServers();">
            </div>
            <div class="form-group">
                <label>Status</label>
                <select onchange="target.servers[${idx}].status = this.value; renderServers();">
                    <option value="hot" ${s.status === 'hot' ? 'selected' : ''}>Hot</option>
                    <option value="stable" ${s.status === 'stable' ? 'selected' : ''}>Stable</option>
                    <option value="maintenance" ${s.status === 'maintenance' ? 'selected' : ''}>Maintenance</option>
                </select>
            </div>
            <div class="form-group">
                <label>Name (EN)</label>
                <input type="text" value="${s.name?.en || ''}" oninput="target.servers[${idx}].name.en = this.value">
            </div>
            <div class="form-group">
                <label>Name (RU)</label>
                <input type="text" value="${s.name?.ru || ''}" oninput="target.servers[${idx}].name.ru = this.value">
            </div>
            <div class="form-group full-width">
                <label>Recommendation Text (EN)</label>
                <input type="text" value="${s.text?.en || ''}" oninput="target.servers[${idx}].text.en = this.value">
            </div>
        </div>
    `;
}

function createNewServer() {
    target.servers.push({ id: `world_0${target.servers.length + 1}`, name: { en: "New Server", ru: "" }, status: "stable", text: { en: "", ru: "" } });
    selectServer(target.servers.length - 1);
}

function renameServerKey(oldKey, newKey) {
    if (!newKey || oldKey === newKey) return;
    target.servers[newKey] = target.servers[oldKey];
    delete target.servers[oldKey];
    if (state.server === oldKey) state.server = newKey;
    renderServers();
    selectServer(newKey);
}

function deleteServer(idx) {
    target.servers.splice(idx, 1);
    state.server = null;
    document.getElementById('server-editor').innerHTML = '';
    renderServers();
}
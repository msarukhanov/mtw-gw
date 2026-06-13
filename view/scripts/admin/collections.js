async function loadAdminCollections() {
    const container = document.getElementById('adminCollectionsList');
    if (!container) return;
    const currentPartnerId = localStorage.getItem('partnerId') || 'demo_mtwtech';
    showLoader();
    try {
        const res = await fetch(`${SERVER_URL}/api/catalog/collections?partnerId=${currentPartnerId}`);
        const data = await res.json();

        if (!data.success || data.collections.length === 0) {
            container.innerHTML = '<p style="color:var(--text-muted); padding:10px;">No collections</p>';
            return;
        }

        container.innerHTML = data.collections.map(col => `
            <div class="game-block" style="text-align: left; margin: 0; padding:15px; border:1px solid var(--border-color); border-radius:8px;">
                <h4 style="color:#ffb703; font-size:15px; margin-bottom:5px;">📦 ${col.name}</h4>
                <small style="color:var(--text-muted); display:block;">Slug: <b>${col.slug}</b></small>
                <small style="color:var(--neon-green); display:block; margin-bottom:10px;">Games: <b>${col.games.length}</b></small>
                <div style="display:flex; gap:6px;">
                    <button class="btn-primary" style="padding:4px 8px; font-size:12px; width:auto; background:var(--bg-panel);" onclick="openCollectionModal('${col.slug}', '${col.name}', ${JSON.stringify(col.games.map(g => g.id))})">✏️ Change</button>
                    <button class="btn-danger" style="padding:4px 8px; font-size:12px; width:auto; margin:0;" onclick="deleteCollectionRequest('${col.slug}')">🗑️ Delete</button>
                </div>
            </div>
        `).join('');
    }
    catch (e) { console.error(e); }
    finally {
        hideLoader();
    }
}

// Открытие конструктора коллекций
function openCollectionModal(slug = '', name = '', attachedGameIds = []) {
    editCollectionMode = !!slug;
    currentEditingSlug = slug;

    document.getElementById('modalCollName').value = name;
    document.getElementById('modalCollSlug').value = slug;
    document.getElementById('modalCollSlug').disabled = editCollectionMode;
    document.getElementById('modalTitle').innerText = editCollectionMode ? '✏️ Изменить состав коллекции' : '📦 Создать новую коллекцию';

    // Собираем уникальный список всех 13 игр, которые бэкенд отдал в loadData
    if (allSystemGames.length === 0) {
        // Если массив еще пуст, лениво собираем его из инпутов твоей формы configForm
        const gamesList = ['slots3x3', 'slots5x3', 'wheel', 'scratch', 'lottery', 'mines', 'crash', 'dice', 'hilo', 'roulette', 'blackjack', 'holdem', 'scratch-cards'];
        allSystemGames = gamesList.map((g, idx) => ({ id: idx + 1, name: g.toUpperCase(), provider: 'MTWTech' }));
    }

    const select = document.getElementById('modalCollGamesSelect');
    select.innerHTML = allSystemGames.map(g => `
        <option value="${g.id}" ${attachedGameIds.includes(g.id) ? 'selected' : ''}>${g.name}</option>
    `).join('');

    document.getElementById('collectionModal').style.display = 'flex';
}

function closeCollectionModal() {
    document.getElementById('collectionModal').style.display = 'none';
}

// Запись коллекции в Postgres (Запросы 5, 6)
async function saveCollectionData() {
    const name = document.getElementById('modalCollName').value.trim();
    const slug = document.getElementById('modalCollSlug').value.trim().toLowerCase();
    const select = document.getElementById('modalCollGamesSelect');
    const gameIds = Array.from(select.selectedOptions).map(opt => parseInt(opt.value));

    if (!name || !slug) return alert("Заполните все поля!");
    const currentPartnerId = localStorage.getItem('partnerId') || 'demo_mtwtech';

    const url = editCollectionMode ? `${SERVER_URL}/api/admin/catalog/collection/${slug}` : `${SERVER_URL}/api/admin/catalog/collection`;
    const method = editCollectionMode ? 'PUT' : 'POST';

    const res = await fetch(url, {
        method: method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, slug, gameIds, partnerId: currentPartnerId })
    });
    if (!res.error) { closeCollectionModal(); loadAdminCollections(); }
}

// Удаление коллекции (Запрос 7)
async function deleteCollectionRequest(slug) {
    if (!confirm('Удалить эту подборку из лобби?')) return;
    const currentPartnerId = localStorage.getItem('partnerId') || 'demo_mtwtech';

    const res = await fetch(`${SERVER_URL}/api/admin/catalog/collection/${slug}`, { method: 'DELETE', body: JSON.stringify({ partnerId: currentPartnerId }) });
    if (!res.error) loadAdminCollections();
}
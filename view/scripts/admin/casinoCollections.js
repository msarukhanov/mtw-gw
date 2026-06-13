// Таблица кастомного тюнинга RTP и Игр (Запрос 9)
async function loadAdminGamesConfig() {
    const tbody = document.getElementById('adminGamesTableBody');
    if (!tbody) return;
    const currentPartnerId = localStorage.getItem('partnerId') || 'demo_mtwtech';
    showLoader();
    try {
        // ИСПРАВЛЕНО: Строго CamelCase параметр 'partnerId' в строке запроса
        const res = await fetch(`${SERVER_URL}/api/catalog/collections?partnerId=${currentPartnerId}`);
        const data = await res.json();

        const gameMap = new Map();
        data.collections.forEach(c => c.games.forEach(g => gameMap.set(g.id, g)));
        allSystemGames = Array.from(gameMap.values()); // Синхронизируем точный реестр 13 игр

        tbody.innerHTML = investorsGamesFix(allSystemGames).map(g => `
            <tr>
                <td>#${g.id}</td>
                <td><b style="color:var(--neon-green);">${g.provider}</b></td>
                <td><b>${g.name}</b></td>
                <td><input type="text" id="cust-name-${g.id}" value="${g.name}" style="width:130px; margin:0; padding:4px;"></td>
                <td><input type="number" id="cust-rtp-${g.id}" value="${g.rtp || 95}" style="width:65px; margin:0; padding:4px;"></td>
                <td>
                    <select id="cust-active-${g.id}" style="background:#2a2f3a; color:#fff; border:1px solid #3a4150; padding:4px; border-radius:4px; outline:none;">
                        <option value="true" ${g.is_game_active !== false ? 'selected' : ''}>On</option>
                        <option value="false" ${g.is_game_active === false ? 'selected' : ''}>Off</option>
                    </select>
                </td>
                <td style="text-align: right; padding-right:15px;">
                    <button class="btn-primary" style="width:auto; padding:4px 10px; font-size:12px;" onclick="saveSingleGameSettings(${g.id})">Save</button>
                </td>
            </tr>
        `).join('');
    }
    catch (e) { console.error(e); }
    finally {
        hideLoader();
    }
}

function investorsGamesFix(arr) {
    // Вспомогательный фильтр, гарантирующий уникальность вывода строк в админ-таблицу
    const seen = new Set();
    return arr.filter(el => { const duplicate = seen.has(el.id); seen.add(el.id); return !duplicate; });
}

async function saveSingleGameSettings(gameId) {
    const customName = document.getElementById(`cust-name-${gameId}`).value.trim();
    const customRtp = parseFloat(document.getElementById(`cust-rtp-${gameId}`).value);
    const isActive = document.getElementById(`cust-active-${gameId}`).value === 'true';

    const res = await fetch(`${SERVER_URL}/api/admin/catalog/game-setup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId, isActive, customName, customRtp })
    });
    if (!res.error) { alert('Параметры игры сохранены в Postgres!'); loadAdminGamesConfig(); }
}

// Сетка провайдеров / агрегаторов (Запрос 8)
function loadAdminProvidersConfig() {
    const grid = document.getElementById('adminProvidersGrid');
    if (!grid) return;
    const aggregators = Array.from(new Set(allSystemGames.map(g => g.aggregator || 'INTERNAL')));

    grid.innerHTML = aggregators.map(agg => `
        <div class="game-block" style="text-align: left; margin: 0; padding:15px; border:1px solid var(--border-color); border-radius:8px;">
            <h4>🔌 Provider: ${agg}</h4>
            <div style="display:flex; gap:6px; margin-top:10px;">
                <button class="btn-primary" style="font-size:12px; padding:6px; background:var(--accent-green);" onclick="setAggregatorStatus('${agg}', true)">Enable</button>
                <button class="btn-danger" style="font-size:12px; padding:6px;" onclick="setAggregatorStatus('${agg}', false)">Disable</button>
            </div>
        </div>
    `).join('');
}

async function setAggregatorStatus(aggregator, isActive) {
    const res = await fetch(`${SERVER_URL}/api/admin/catalog/aggregator`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aggregator, isActive })
    });
    if (!res.error) alert(`Статус шлюза провайдера '${aggregator}' успешно изменен!`);
}
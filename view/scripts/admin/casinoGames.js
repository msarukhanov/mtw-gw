// Таблица кастомного тюнинга RTP и Игр (Запрос 9)
async function loadGamesConfig() {
    const currentPartnerId = localStorage.getItem('partnerId') || 'demo_mtwtech';

    try {
        const res = await fetch(`${SERVER_URL}/api/admin/data?partnerId=${currentPartnerId}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                // Если у тебя используется токен админа, пробрасываем его сюда:
                'Authorization': `Bearer ${localStorage.getItem('adminToken') || ''}`
            }
        });

        if (res.status === 401) return alert('No access');
        const data = await res.json();

        // Mapped games inputs verification
        if (data.config.slots3x3) {
            document.getElementById('slots3x3_cost').value = data.config.slots3x3.cost;
            document.getElementById('slots3x3_rtp').value = data.config.slots3x3.rtp;
        }
        if (data.config.slots5x3) {
            document.getElementById('slots5x3_cost').value = data.config.slots5x3.cost;
            document.getElementById('slots5x3_rtp').value = data.config.slots5x3.rtp;
        }
        document.getElementById('wheel_cost').value = data.config.wheel.cost;
        document.getElementById('wheel_rtp').value = data.config.wheel.rtp;
        document.getElementById('scratch_cost').value = data.config.scratch.cost;
        document.getElementById('scratch_rtp').value = data.config.scratch.rtp;
        document.getElementById('lottery_ticketPrice').value = data.config.lottery.ticketPrice;
        document.getElementById('lottery_rtp').value = data.config.lottery.rtp;

        document.getElementById('mines_rtpPercent').value = data.config.mines.rtpPercent;
        document.getElementById('crash_betTime').value = data.config.crash.betTime;
        document.getElementById('crash_baseRtp').value = data.config.crash.baseRtp;
        document.getElementById('dice_houseEdge').value = data.config.dice.houseEdge;
        document.getElementById('hilo_houseEdge').value = data.config.hilo.houseEdge;

        // Optional structural mapping for operational banks
        if (data.banks) {
            if (data.banks.mines && document.getElementById('mines_bank')) document.getElementById('mines_bank').value = data.banks.mines;
            if (data.banks.crash && document.getElementById('crash_bank')) document.getElementById('crash_bank').value = data.banks.crash;
            if (data.banks.dice && document.getElementById('dice_bank')) document.getElementById('dice_bank').value = data.banks.dice;
            if (data.banks.hilo && document.getElementById('hilo_bank')) document.getElementById('hilo_bank').value = data.banks.hilo;
        }

        document.getElementById('g_affiliatePercent').value = data.config.gamification.affiliatePercent || 10;
    }
    catch(e) {

    }
}

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

document.getElementById('configForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const configData = {
        slots3x3_cost: Number(document.getElementById('slots3x3_cost').value),
        slots3x3_rtp: Number(document.getElementById('slots3x3_rtp').value),
        slots5x3_cost: Number(document.getElementById('slots5x3_cost').value),
        slots5x3_rtp: Number(document.getElementById('slots5x3_rtp').value),
        wheel_cost: Number(document.getElementById('wheel_cost').value),
        wheel_rtp: Number(document.getElementById('wheel_rtp').value),
        scratch_cost: Number(document.getElementById('scratch_cost').value),
        scratch_rtp: Number(document.getElementById('scratch_rtp').value),
        lottery_ticketPrice: Number(document.getElementById('lottery_ticketPrice').value),
        lottery_rtp: Number(document.getElementById('lottery_rtp').value),
        mines_rtpPercent: Number(document.getElementById('mines_rtpPercent').value),
        crash_betTime: Number(document.getElementById('crash_betTime').value),
        crash_baseRtp: Number(document.getElementById('crash_baseRtp').value),
        dice_houseEdge: Number(document.getElementById('dice_houseEdge').value),
        hilo_houseEdge: Number(document.getElementById('hilo_houseEdge').value)
    };

    const res = await fetch(`${SERVER_URL}/api/admin/update-config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(configData)
    });
    if (!res.error) { alert('Config changed successfully!'); loadData(); }
});
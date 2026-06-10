// URL CONFIGURATION (Detects local machine or active Render proxy link)
const baseUrl = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
    ? 'http://localhost:3000'
    : 'https://mtw-gw.onrender.com';
const baseUrlApi = baseUrl + '/api';
const SERVER_URL = baseUrl;

let currentBetsPeriod = '';
let currentBetsPage = 1;

let currentFinancePeriod = '';
let currentTxPage = 1;

let allSystemGames = [];
let editCollectionMode = false;
let currentEditingSlug = null;

let mtwChartInstance = null; // Хранилище объекта графика
let mtwActivityChartInstance = null; // Инстанс для второго графика
let mtwCashflowChartInstance = null;

let currentPlayersPage = 1;

function showLoader() {
    document.getElementById('global-mtw-loader').style.display = 'flex';
}

function hideLoader() {
    document.getElementById('global-mtw-loader').style.display = 'none';
}

// 🔐 LOGIC: DEMO LOGIN SYSTEM
function checkDemoAuth() {
    if (sessionStorage.getItem('demoAdminAuthenticated') === 'true') {
        document.getElementById('login-screen').style.display = 'none';
        document.getElementById('admin-layout').style.display = 'flex';
        loadData();
    }
}

document.getElementById('loginForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const user = document.getElementById('login_user').value;
    const pass = document.getElementById('login_pass').value;

    // Simplified authentication flow for investor presentation
    if (user === 'demo_mtwtech' && pass === 'qwerty') {
        sessionStorage.setItem('demoAdminAuthenticated', 'true');
        localStorage.setItem('partnerId', user);
        document.getElementById('login-screen').style.display = 'none';
        document.getElementById('admin-layout').style.display = 'flex';
        loadData();
    } else {
        const errBox = document.getElementById('login-error');
        errBox.innerText = 'Invalid credentials. Hint: admin / admin';
        errBox.style.display = 'block';
    }
});

function logoutDemo() {
    sessionStorage.removeItem('demoAdminAuthenticated');
    localStorage.removeItem('partnerId');
    location.reload();
}

// 🗂 LOGIC: VERTICAL SIDEBAR TAB SYSTEM
function switchTab(tabId, element) {
    // Hide all inactive segments
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
    // Clear buttons selection state
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    // Expose target content block & button state
    document.getElementById(tabId).classList.add('active');
    element.classList.add('active');
}

// 🏟 LOGIC: SPORTSBOOK TICKETS MANAGEMENT
async function loadPendingSportsBets() {
    showLoader();
    try {
        const res = await fetch(`${baseUrlApi}/admin/sports/pending`);
        const data = await res.json();

        const tbody = document.getElementById('sportsBetsTableBody');
        if (data.bets && data.bets.length > 0) {
            tbody.innerHTML = data.bets.map(b => {
                const matchesList = b.items.map(item => `
                        <div class="bet-item-row">
                            • <b>${item.teams}</b><br>
                            <small style="color: var(--text-muted);">${item.market.toUpperCase()} ➔ <b style="color:#fff;">${item.selectedOutcome.toUpperCase()}</b> (${item.odds})</small>
                        </div>
                    `).join('');

                return `
                        <tr>
                            <td><b>${b.username}</b></td>
                            <td>${matchesList}</td>
                            <td><span class="badge">${b.type}</span></td>
                            <td><b style="color:var(--neon-green);">${b.stake} 🪙</b><br><small style="color:var(--text-muted);">Total Odds: ${b.totalOdds}</small></td>
                            <td>
                                <button onclick="settleBet('${b._id}', 'WON')" style="background:var(--accent-green); margin-right:4px;">WIN</button>
                                <button onclick="settleBet('${b._id}', 'LOST')" style="background:var(--accent-red);">LOSE</button>
                            </td>
                        </tr>
                    `;
            }).join('');
        } else {
            tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--text-muted); padding:25px;">No active pending slips in queue</td></tr>`;
        }
    }
    catch (err) { console.error('Error loading sports bets:', err); }
    finally {
        hideLoader();
    }
}

async function settleBet(betId, status) {
    if (!confirm(`Are you sure you want to settle this bet as a ${status === 'WON' ? 'WIN' : 'LOSS'}?`)) {
        return;
    }
    showLoader();
    try {
        const res = await fetch(`${baseUrlApi}/admin/sports/settle`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ betId, status })
        });
        const data = await res.json();
        if (data.success) {
            alert('Bet settled successfully. Player balances synchronized!');
            loadData();
        } else {
            alert('Settlement failed: ' + (data.error || 'Unknown error'));
        }
    }
    catch (err) { alert('Network error while sending settlement request'); }
    finally {
        hideLoader();
    }
}

// 🔄 CORE RE-FETCH THREAD
async function loadData() {
    showLoader();
    try {
        // ИСПРАВЛЕНО ДЛЯ POSTGRES: Вытаскиваем partnerId из хранилища админки
        const currentPartnerId = localStorage.getItem('partnerId') || 'demo_mtwtech';

        // Передаем partnerId в query-параметрах, чтобы бэкенд знал, чьи конфиги, джекпоты и игроков тянуть из Neon
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

        // Jackpot Update
        document.getElementById('jackpotDisplay').innerText = data.jackpot + ' 🪙';
        document.getElementById('jackpotInput').value = data.jackpot;


        // Retention Modules Parameters Sync
        // document.getElementById('g_xpPerGame').value = data.config.gamification.xpPerGame;
        // document.getElementById('g_xpMultiplier').value = data.config.gamification.xpMultiplier;
        // document.getElementById('g_levelUpBonus').value = data.config.gamification.levelUpBonus;
        // document.getElementById('g_questTargetGames').value = data.config.gamification.questTargetGames;
        // document.getElementById('g_questReward').value = data.config.gamification.questReward;
        // document.getElementById('g_tournamentActive').value = data.config.gamification.tournamentActive;
        // document.getElementById('g_tournamentPrize').value = data.config.gamification.tournamentPrize;

        document.getElementById('g_affiliatePercent').value = data.config.gamification.affiliatePercent || 10;


        // 🔄 ОБНОВЛЕННАЯ СИНХРОНИЗАЦИЯ ФИНАНСОВ И ДВУХ НОВЫХ ВКЛАДОК ЖУРНАЛОВ
        loadAdminFinanceDashboard();

        loadAdminFinanceChart();

        // Запуск рендеринга спортивных купонов
        loadPendingSportsBets();

        loadAdminCollections();
        loadAdminGamesConfig();
        loadAdminProvidersConfig();

        loadAdminFinanceReport();
        loadAdminBetsRegistry();

        loadPlayers();

        loadAdminPromos();
        loadAdminCashbackConfig();


        loadAdminGamificationConfig();
        loadAdminQuestsMatrix();
        loadAdminTournamentsMatrix();

        loadAdminWebsites();

        loadAdminPendingWithdrawals();
        loadAdminAntifraudAlerts();

        loadAdminWelcomeBonusMatrix();

        const wbSelect = document.getElementById('wb_target_site');
        if (wbSelect && typeof cachedWebsites !== 'undefined' && cachedWebsites.length > 0) {
            wbSelect.innerHTML = cachedWebsites.map(w => `<option value="${w.id}">${w.title} (${w.domain_name})</option>`).join('');
        }
    }
    catch (err) {
        console.error(err);
        alert('Server core data synchronization error.');
    }
    finally {
        hideLoader();
    }

    loadAdminBackgroundServices();
}

// 📬 AJAX FORMS INTERCEPTORS & API REQUESTS
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
    if (res.ok) { alert('Config changed successfully!'); loadData(); }
});

document.getElementById('jackpotForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const val = document.getElementById('jackpotInput').value;
    const res = await fetch(`${SERVER_URL}/api/admin/update-jackpot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jackpot: val })
    });
    if (res.ok) { alert('Jackpot changed!'); loadData(); }
});





// Хелпер переключения табов (чтобы работал наряду с твоей текущей системой вкладок)
function openAdminCatalogTab(tabId, element) {
    document.querySelectorAll('.tab-content').forEach(el => el.style.display = 'none');
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));

    document.getElementById(`tab-${tabId}`).style.display = 'block';
    element.classList.add('active');
}

// Загрузка списков коллекций для админки (Запросы 1, 5, 6, 7)
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
    if (res.ok) { closeCollectionModal(); loadAdminCollections(); }
}

// Удаление коллекции (Запрос 7)
async function deleteCollectionRequest(slug) {
    if (!confirm('Удалить эту подборку из лобби?')) return;
    const currentPartnerId = localStorage.getItem('partnerId') || 'demo_mtwtech';

    const res = await fetch(`${SERVER_URL}/api/admin/catalog/collection/${slug}`, { method: 'DELETE', body: JSON.stringify({ partnerId: currentPartnerId }) });
    if (res.ok) loadAdminCollections();
}

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
    if (res.ok) { alert('Параметры игры сохранены в Postgres!'); loadAdminGamesConfig(); }
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
    if (res.ok) alert(`Статус шлюза провайдера '${aggregator}' успешно изменен!`);
}

// Загрузить текущий статус фоновых сервисов с бэкенда при загрузке страницы
async function loadAdminBackgroundServices() {
    const grid = document.getElementById('adminBackgroundServicesGrid');
    if (!grid) return;
    showLoader();
    try {
        const res = await fetch(`${SERVER_URL}/api/admin/bgs`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('adminToken') || ''}` }
        });
        const data = await res.json();

        if (data.success && data.BGS) {
            const services = [
                { key: 'sport', name: '🎰 Sport Live Engine', desc: 'Sport live engine' },
                { key: 'lottery', name: '🎰 5-Min Lottery Engine', desc: 'Lottery 6/49' },
                { key: 'crash', name: '🚀 Crash Aviator Engine', desc: 'Crash' },
                { key: 'roulette', name: '🎡 Casino Roulette Engine', desc: 'Roulette LIVE' }
            ];

            grid.innerHTML = services.map(srv => {
                const isActive = data.BGS[srv.key];
                // Меняем цвет индикатора и текста в зависимости от статуса базы
                const badgeColor = isActive ? 'var(--accent-green)' : 'var(--accent-red)';
                const badgeText = isActive ? 'RUNNING' : 'PAUSED';

                return `
                    <div class="game-block" style="text-align: left; margin: 0; padding:15px; border:1px solid var(--border-color); border-radius:8px; display:flex; flex-direction:column; justify-content:space-between;">
                        <div>
                            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                                <h4 style="font-size:14px; color:#fff;">${srv.name}</h4>
                                <span style="font-size:10px; font-weight:bold; color:${badgeColor}; border:1px solid ${badgeColor}; padding:2px 6px; border-radius:4px;">${badgeText}</span>
                            </div>
                            <p style="font-size:12px; color:var(--text-muted); margin-bottom:15px; line-height:1.3;">${srv.desc}</p>
                        </div>
                        <div style="display:flex; gap:6px;">

                             ${isActive ? `
                                <button class="btn-danger" style="font-size:13px; padding:8px 12px; margin:0; width:100%; font-weight:bold; letter-spacing:0.5px;" onclick="toggleServiceRequest('${srv.key}', false)">🛑 Stop</button>
                            ` : `
                                <button class="btn-primary" style="font-size:13px; padding:8px 12px; margin:0; background:var(--accent-green); border-color:var(--accent-green); color:#1a1d24; width:100%; font-weight:bold; letter-spacing:0.5px;" onclick="toggleServiceRequest('${srv.key}', true)">▶️ Start</button>
                            `}
                        </div>
                    </div>
                `;
            }).join('');
        }
    }
    catch (err) {
        console.error("Failed to sync background services panel:", err);
    }
    finally {
        hideLoader();
    }
}

// Отправить POST запрос на переключение статуса крона (Лотерея/Краш/Рулетка)
async function toggleServiceRequest(engineName, statusValue) {
    try {
        const res = await fetch(`${SERVER_URL}/api/admin/bgs`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('adminToken') || ''}`
            },
            body: JSON.stringify({ service: engineName, status: statusValue })
        });

        const result = await res.json();
        if (result.success) {
            // Перерисовываем виджеты, чтобы кнопка обновила свое состояние On/Off
            loadAdminBackgroundServices();
        } else {
            alert("Server error");
        }
    } catch (err) {
        alert("Server error");
    }
}

function toggleSidebar() {
    const sidebar = document.getElementById('adminSidebar');
    if (!sidebar) return;

    // Переключаем класс сворачивания
    sidebar.classList.toggle('collapsed');

    // Запоминаем состояние, чтобы оно сохранялось при перезагрузке страниц
    const isCollapsed = sidebar.classList.contains('collapsed');
    localStorage.setItem('adminSidebarCollapsed', isCollapsed ? 'true' : 'false');
}

// Автоматически восстанавливаем состояние сайдбара при загрузке админки
window.addEventListener('DOMContentLoaded', () => {
    const sidebar = document.getElementById('adminSidebar');
    const savedState = localStorage.getItem('adminSidebarCollapsed');

    if (sidebar && savedState === 'true') {
        sidebar.classList.add('collapsed');
    }
});

function toggleMenuSection(sectionId, titleElement) {
    // Если весь сайдбар сейчас полностью свернут до 68px (твой прошлый режим),
    // клики по заголовкам игнорируем, чтобы не ломать мини-интерфейс
    const sidebar = document.getElementById('adminSidebar');
    if (sidebar && sidebar.classList.contains('collapsed')) return;

    const section = document.getElementById(sectionId);
    if (!section) return;

    // Переключаем класс сворачивания контента
    section.classList.toggle('collapsed-content');

    // Переключаем класс стрелочки у заголовка
    if (titleElement) {
        titleElement.classList.toggle('section-closed');
    }

    // Сохраняем состояние раскрытия раздела в localStorage
    const isClosed = section.classList.contains('collapsed-content');
    localStorage.setItem(`adv_sec_${sectionId}`, isClosed ? 'closed' : 'opened');
}

// Автоматическое восстановление состояния раздвижного меню при загрузке страницы
window.addEventListener('DOMContentLoaded', () => {
    const sections = ['sec-financial', 'sec-players', 'sec-sportsbook', 'sec-casino', 'sec-builder'];

    sections.forEach(secId => {
        const section = document.getElementById(secId);
        // Ищем предыдущий заголовок (элемент перед контейнером контента)
        const titleEl = section ? section.previousElementSibling : null;
        const savedState = localStorage.getItem(`adv_sec_${secId}`);

        // Хелпер: если это твой первый вход и в базе пусто — по умолчанию
        // открываем Financial и Casino, а остальные аккуратно поджимаем
        if (savedState === 'closed' || (!savedState && ['sec-players', 'sec-sportsbook', 'sec-builder','sec-casino'].includes(secId))) {
            if (section) section.classList.add('collapsed-content');
            if (titleEl) titleEl.classList.add('section-closed');
        }
    });
});


async function loadAdminBetsRegistry() {
    showLoader();
    try {
        const category = document.getElementById('bets_filter_category').value;
        const username = document.getElementById('bets_filter_username').value;
        const fromDateVal = document.getElementById('bets_filter_from').value;
        const toDateVal = document.getElementById('bets_filter_to').value;
        const limitVal = document.getElementById('bets_filter_limit').value;

        let queryParams = new URLSearchParams();
        queryParams.append('category', category);
        queryParams.append('page', currentBetsPage);
        queryParams.append('limit', limitVal);

        if (username) queryParams.append('username', username);
        if (currentBetsPeriod) {
            queryParams.append('period', currentBetsPeriod);
        } else {
            if (fromDateVal) queryParams.append('fromDate', fromDateVal);
            if (toDateVal) queryParams.append('toDate', toDateVal);
        }

        const bRes = await fetch(`${baseUrlApi}/admin/bets/report?${queryParams.toString()}`);
        const bData = await bRes.json();
        const betsRegistryTbody = document.getElementById('bets_registry_tbody');

        if (bData.success && bData.report && bData.report.length > 0) {
            betsRegistryTbody.innerHTML = bData.report.map(b => {
                const gameName = b.game_id || b.game || (category === 'sport' ? 'Sports Match' : 'Casino Game');
                const isWin = b.status === 'WIN' || b.status === 'SUCCESS' || b.win === true;
                const displayAmount = isWin ? Number(b.prize || 0) : Number(b.stake || 0);

                return `
                    <tr>
                        <td><small style="color: var(--text-muted);">${new Date(b.timestamp).toLocaleString()}</small></td>
                        <td><b>${b.username}</b></td>
                        <td><span class="badge" style="background: var(--bg-main); border: 1px solid var(--border-color); color: #fff; padding: 4px 8px;">${gameName}</span></td>
                        <td><b style="color: ${!isWin ? 'var(--text-muted)' : 'var(--neon-green)'}">${!isWin ? '🔴 STAKE / OUT' : '🟢 WIN / IN'}</b></td>
                        <td><span style="color: ${!isWin ? '#fff' : 'var(--neon-green)'}; font-size: 15px;"><b>${displayAmount.toFixed(2)} 🪙</b></span></td>
                    </tr>
                `;
            }).join('');

            document.getElementById('lbl_bets_page').innerText = `Page ${bData.pagination.page} of ${bData.pagination.totalPages || 1}`;
            document.getElementById('btn_bets_prev').disabled = bData.pagination.page <= 1;
            document.getElementById('btn_bets_next').disabled = bData.pagination.page >= bData.pagination.totalPages;
        } else {
            betsRegistryTbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--text-muted); padding:30px;">No bets registered in engine for selected filters</td></tr>`;
            document.getElementById('lbl_bets_page').innerText = 'Page 1 of 1';
            document.getElementById('btn_bets_prev').disabled = true;
            document.getElementById('btn_bets_next').disabled = true;
        }
    } catch (bErr) {
        console.error('Bets registry sync failure:', bErr);
    } finally {
        hideLoader();
    }
}

function setBetsPeriod(period) {
    currentBetsPeriod = period;
    currentBetsPage = 1;
    document.getElementById('bets_filter_from').value = '';
    document.getElementById('bets_filter_to').value = '';
    document.querySelectorAll('.btn-bets-period').forEach(btn => btn.classList.remove('active'));
    if (period === 'day') document.getElementById('btn_bets_day').classList.add('active');
    else if (period === 'week') document.getElementById('btn_bets_week').classList.add('active');
    else document.getElementById('btn_bets_all').classList.add('active');
    loadAdminBetsRegistry();
}

function triggerBetsDateChange() {
    currentBetsPeriod = '';
    currentBetsPage = 1;
    document.querySelectorAll('.btn-bets-period').forEach(btn => btn.classList.remove('active'));
    loadAdminBetsRegistry();
}

function changeBetsPage(direction) {
    currentBetsPage += direction;
    loadAdminBetsRegistry();
}

async function loadAdminFinanceDashboard() {
    showLoader();
    try {
        let queryParams = new URLSearchParams();
        if (currentFinancePeriod) queryParams.append('period', currentFinancePeriod);

        const res = await fetch(`${baseUrlApi}/admin/finance/dashboard?${queryParams.toString()}`);
        const data = await res.json();

        if (data.success && data.metrics) {
            const m = data.metrics;
            document.getElementById('fin_bets').innerText = m.totalBets.toFixed(2) + ' 🪙';
            document.getElementById('fin_wins').innerText = m.totalWins.toFixed(2) + ' 🪙';
            document.getElementById('fin_ggr').innerText = m.ggr.toFixed(2) + ' 🪙';
            document.getElementById('fin_net').innerText = m.netProfit.toFixed(2) + ' 🪙';
            if(document.getElementById('fin_deposits')) document.getElementById('fin_deposits').innerText = m.totalDeposits.toFixed(2) + ' 🪙';
            if(document.getElementById('fin_withdraws')) document.getElementById('fin_withdraws').innerText = m.totalWithdraws.toFixed(2) + ' 🪙';
            document.getElementById('fin_logs').innerText = m.transactionsCount;
        }
    } catch (err) {
        console.error(err);
    } finally {
        hideLoader();
    }
}

async function loadAdminFinanceReport() {
    showLoader();
    try {
        let queryParams = new URLSearchParams();
        const fromDateVal = document.getElementById('fin_filter_from').value;
        const toDateVal = document.getElementById('fin_filter_to').value;
        const txTypeVal = document.getElementById('fin_filter_type').value;
        const limitVal = document.getElementById('fin_filter_limit').value;

        queryParams.append('txType', txTypeVal);
        queryParams.append('page', currentTxPage);
        queryParams.append('limit', limitVal);
        if (fromDateVal) queryParams.append('fromDate', fromDateVal);
        if (toDateVal) queryParams.append('toDate', toDateVal);

        const res = await fetch(`${baseUrlApi}/admin/finance/report?${queryParams.toString()}`);
        const data = await res.json();
        const txLedgerTbody = document.getElementById('tx_ledger_tbody');

        if (data.success && data.ledger) {
            if (data.ledger.items && data.ledger.items.length > 0) {
                txLedgerTbody.innerHTML = data.ledger.items.map(t => {
                    let badgeStyle = 'background: var(--accent-blue);';
                    let badgeText = 'BALANCE INJECT';
                    let flowText = `<b style="color: var(--neon-green);">+${t.amount} 🪙</b>`;

                    if (t.type === 'AFFILIATE') {
                        badgeStyle = 'background: #381b2c; border: 1px solid var(--accent-pink);';
                        badgeText = 'AFFILIATE SHARE';
                        flowText = `<b style="color: var(--accent-pink);">+${t.amount} 🪙</b>`;
                    } else if (t.game?.includes('Deposit')) {
                        badgeStyle = 'background: #1b3238; border: 1px solid var(--accent-blue);';
                        badgeText = 'DEPOSIT';
                    } else if (t.game?.includes('Withdraw')) {
                        badgeStyle = 'background: #381b1b; border: 1px solid #ff4d4d;';
                        badgeText = 'WITHDRAW';
                        flowText = `<b style="color: #ff4d4d;">-${t.amount} 🪙</b>`;
                    } else if (t.game?.includes('Promo') || t.game?.includes('Quest') || t.game?.includes('VIP')) {
                        badgeStyle = 'background: #1b382c; border: 1px solid var(--neon-green);';
                        badgeText = 'BONUS / QUEST';
                    }

                    return `
                        <tr>
                            <td><small style="color: var(--text-muted);">${new Date(t.ts).toLocaleString()}</small></td>
                            <td><b>${t.username}</b></td>
                            <td><small style="color: #fff; font-weight: 600;">${t.game || 'System'}</small></td>
                            <td><span class="badge" style="${badgeStyle} color: #fff; padding: 4px 10px; font-size: 11px; border-radius:4px;">${badgeText}</span></td>
                            <td style="font-size: 15px;">${flowText}</td>
                        </tr>
                    `;
                }).join('');

                const pag = data.ledger.pagination;
                document.getElementById('lbl_tx_page').innerText = `Страница ${pag.page} из ${pag.totalPages || 1}`;
                document.getElementById('btn_tx_prev').disabled = pag.page <= 1;
                document.getElementById('btn_tx_next').disabled = pag.page >= pag.totalPages;
            } else {
                txLedgerTbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--text-muted); padding:30px;">No transactions found</td></tr>`;
                document.getElementById('lbl_tx_page').innerText = 'Страница 1 из 1';
                document.getElementById('btn_tx_prev').disabled = true;
                document.getElementById('btn_tx_next').disabled = true;
            }
        }
    } catch (fErr) {
        console.error(fErr);
    } finally {
        hideLoader();
    }
}


function setFinancePeriod(period) {
    currentFinancePeriod = period;
    currentTxPage = 1;
    document.getElementById('fin_filter_from').value = '';
    document.getElementById('fin_filter_to').value = '';
    document.querySelectorAll('.btn-fin-period').forEach(btn => btn.classList.remove('active'));
    if (period === 'day') document.getElementById('btn_fin_day').classList.add('active');
    else if (period === 'week') document.getElementById('btn_fin_week').classList.add('active');
    else document.getElementById('btn_fin_all').classList.add('active');
    loadAdminFinanceReport();
}

function triggerFinDateChange() {
    currentFinancePeriod = '';
    currentTxPage = 1;
    document.querySelectorAll('.btn-fin-period').forEach(btn => btn.classList.remove('active'));
    loadAdminFinanceReport();
}

function changeTxPage(direction) {
    currentTxPage += direction;
    loadAdminFinanceReport();
}


async function loadAdminFinanceChart() {
    try {
        const res = await fetch(`${baseUrlApi}/admin/finance/chart`);
        const data = await res.json();

        if (data.success && data.timeline) {
            renderNeonChart(data.timeline);
            renderActivityChart(data.timeline);
            renderCashflowChart(data.timeline); // <-- Запуск нового графика
        }
    } catch (err) {
        console.error('Failed to load chart analytics:', err);
    }
}

// Функция для второго графика (Количество ставок - Bar Chart)
function renderActivityChart(timelineData) {
    const ctx = document.getElementById('mtwActivityChart').getContext('2d');

    if (mtwActivityChartInstance) {
        mtwActivityChartInstance.destroy();
    }

    const labels = timelineData.map(d => {
        const dateObj = new Date(d.date);
        return dateObj.toLocaleDateString([], { month: 'short', day: 'numeric' });
    });

    const countData = timelineData.map(d => parseInt(d.betsCount || 0, 10));

    // Для количества ставок идеально подойдет гистограмма (Bar Chart) со светящимся неоновым цветом
    mtwActivityChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Bet count',
                data: countData,
                backgroundColor: 'rgba(0, 168, 255, 0.2)', // Твой неоновый синий с прозрачностью
                borderColor: '#00a8ff',
                borderWidth: 2,
                borderRadius: 4, // Скругление углов у столбиков
                hoverBackgroundColor: '#00a8ff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'top',
                    labels: {
                        color: '#8a99ad',
                        font: { family: 'Segoe UI', size: 12, weight: '600' }
                    }
                }
            },
            scales: {
                x: {
                    grid: { color: '#1a1e26', drawBorder: false },
                    ticks: { color: '#65758c', font: { size: 11 } }
                },
                y: {
                    grid: { color: '#1a1e26', drawBorder: false },
                    ticks: {
                        color: '#65758c',
                        font: { size: 11 },
                        precision: 0 // Только целые числа на вертикальной оси
                    }
                }
            }
        }
    });
}


function renderNeonChart(timelineData) {
    const ctx = document.getElementById('mtwFinanceChart').getContext('2d');

    if (mtwChartInstance) {
        mtwChartInstance.destroy();
    }

    const labels = timelineData.map(d => {
        const dateObj = new Date(d.date);
        return dateObj.toLocaleDateString([], { month: 'short', day: 'numeric' });
    });

    const ggrData = timelineData.map(d => Number(d.ggr || 0));
    const netData = timelineData.map(d => Number(d.netProfit || 0));

    // ТЕСТОВЫЙ ПРОВЕРОЧНЫЙ ХАК: Если данные полностью совпадают,
    // искусственно сдвинем Net Profit на 5%, чтобы ты увидел вторую линию
    const isIdentical = ggrData.every((val, index) => val === netData[index]);
    const finalNetData = isIdentical ? netData.map(v => v * 0.95) : netData;

    mtwChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Gross Revenue (GGR)',
                    data: ggrData,
                    borderColor: '#e94560',
                    backgroundColor: 'rgba(233, 69, 96, 0.02)',
                    borderWidth: 3,
                    pointBackgroundColor: '#e94560',
                    pointBorderColor: '#0b0d13',
                    pointBorderWidth: 2,
                    pointRadius: 4,
                    pointHoverRadius: 6,
                    tension: 0.3,
                    fill: true
                },
                {
                    label: isIdentical ? 'Net Profit (NGR) - Test -5%' : 'Net Profit (NGR)',
                    data: finalNetData,
                    borderColor: '#4ecca3',
                    backgroundColor: 'rgba(78, 204, 163, 0.02)',
                    borderWidth: 3,
                    pointBackgroundColor: '#4ecca3',
                    pointBorderColor: '#0b0d13',
                    pointBorderWidth: 2,
                    pointRadius: 4,
                    pointHoverRadius: 6,
                    tension: 0.3,
                    fill: true
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'top',
                    labels: {
                        color: '#8a99ad',
                        font: { family: 'Segoe UI', size: 12, weight: '600' }
                    }
                }
            },
            scales: {
                x: {
                    grid: { color: '#1a1e26', drawBorder: false },
                    ticks: { color: '#65758c', font: { size: 11 } }
                },
                y: {
                    grid: { color: '#1a1e26', drawBorder: false },
                    ticks: { color: '#65758c', font: { size: 11 } }
                }
            }
        }
    });
}
 // Инстанс для нового графика кассы

// Расширяем главную функцию загрузки графиков


// Функция инициализации графика Депозитов и Выводов
function renderCashflowChart(timelineData) {
    const ctx = document.getElementById('mtwCashflowChart').getContext('2d');

    if (mtwCashflowChartInstance) {
        mtwCashflowChartInstance.destroy();
    }

    const labels = timelineData.map(d => {
        const dateObj = new Date(d.date);
        return dateObj.toLocaleDateString([], { month: 'short', day: 'numeric' });
    });

    const depositData = timelineData.map(d => d.deposits);
    const withdrawData = timelineData.map(d => d.withdraws);

    mtwCashflowChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Deposit',
                    data: depositData,
                    borderColor: '#8c7ae6', // Фиолетовый неон под цвет карточки
                    backgroundColor: 'rgba(140, 122, 230, 0.02)',
                    borderWidth: 3,
                    pointBackgroundColor: '#8c7ae6',
                    pointHoverRadius: 6,
                    tension: 0.3
                },
                {
                    label: 'Withdraw',
                    data: withdrawData,
                    borderColor: '#e1b12c', // Оранжевый золото под цвет карточки
                    backgroundColor: 'rgba(225, 177, 44, 0.02)',
                    borderWidth: 3,
                    pointBackgroundColor: '#e1b12c',
                    pointHoverRadius: 6,
                    tension: 0.3
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'top', labels: { color: '#8a99ad', font: { weight: '600' } } }
            },
            scales: {
                x: { grid: { color: '#1a1e26', drawBorder: false }, ticks: { color: '#65758c' } },
                y: { grid: { color: '#1a1e26', drawBorder: false }, ticks: { color: '#65758c' } }
            }
        }
    });
}

// 📥 ФУНКЦИЯ ЭКСПОРТА ТАБЛИЦЫ КАССЫ В CSV ФАЙЛ
async function exportLedgerToCSV() {
    showLoader();
    try {
        const fromDateVal = document.getElementById('fin_filter_from').value;
        const toDateVal = document.getElementById('fin_filter_to').value;
        const txTypeVal = document.getElementById('fin_filter_type').value;

        let queryParams = new URLSearchParams();
        queryParams.append('txType', txTypeVal);
        queryParams.append('page', 1);
        queryParams.append('limit', 5000); // Выгружаем максимум строк за выбранный период
        if (fromDateVal) queryParams.append('fromDate', fromDateVal);
        if (toDateVal) queryParams.append('toDate', toDateVal);

        const res = await fetch(`${baseUrlApi}/admin/finance/ledger?${queryParams.toString()}`);
        const data = await res.json();

        if (!data.success || !data.ledger.items || data.ledger.items.length === 0) {
            alert('Нет данных для выгрузки за выбранный период');
            return;
        }

        // Строим заголовки столбцов CSV
        let csvContent = "\uFEFF"; // BOM для корректного чтения кириллицы (например, имени "Марк") Excel-ем
        csvContent += "Дата;Пользователь;Описание/Игра;Тип;Сумма\n";

        // Заполняем строками
        data.ledger.items.forEach(t => {
            const date = new Date(t.ts).toLocaleString();
            const username = t.username;
            const game = t.game || 'System';
            const type = t.type;
            const amount = t.game?.includes('Withdraw') ? `-${t.amount}` : `${t.amount}`;

            csvContent += `"${date}";"${username}";"${game}";"${type}";"${amount}"\n`;
        });

        // Создаем виртуальную ссылку для скачивания файла на стороне браузера
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `financial_report_${txTypeVal}_${new Date().toISOString().slice(0,10)}.csv`);
        document.body.appendChild(link);

        link.click(); // Инициируем скачивание
        document.body.removeChild(link);
    } catch (err) {
        console.error('Ошибка экспорта CSV:', err);
    } finally {
        hideLoader();
    }
}



async function loadPlayers() {
    showLoader();
    try {
        const currentPartnerId = localStorage.getItem('partnerId') || 'demo_mtwtech';
        const searchVal = document.getElementById('player_search_input').value;
        const limitVal = document.getElementById('player_filter_limit').value;

        let queryParams = new URLSearchParams();
        queryParams.append('partnerId', currentPartnerId);
        queryParams.append('page', currentPlayersPage);
        queryParams.append('limit', limitVal);
        if (searchVal) queryParams.append('search', searchVal);

        const res = await fetch(`${SERVER_URL}/api/admin/players?${queryParams.toString()}`, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${localStorage.getItem('adminToken') || ''}` }
        });

        if (res.status === 401) return alert('No access');
        const data = await res.json();
        const tbody = document.getElementById('playersTableBody');

        if (tbody && data.success && data.players) {
            tbody.innerHTML = data.players.map(p => {
                // Подготавливаем значения лимитов (если NULL, оставляем инпут пустым)
                const cMin = p.casino_min_limit !== null ? p.casino_min_limit : '';
                const cMax = p.casino_max_limit !== null ? p.casino_max_limit : '';
                const sMin = p.sport_min_limit !== null ? p.sport_min_limit : '';
                const sMax = p.sport_max_limit !== null ? p.sport_max_limit : '';

                return `
                    <tr>
                        <td>
                            <b>${p.username}</b><br>
                            <small style="color:var(--text-muted);">Level: ${p.level || 1} (${p.xp || 0} XP)</small>
                        </td>
                        <td>
                            <b style="color:var(--neon-green);">💵 Balance: ${Number(p.balance).toFixed(2)} 🪙</b><br>
                            <small style="color:var(--text-muted);">🏆 Tournament points: ${p.tournament_points || 0}</small>
                        </td>
                        <!-- КОЛОНКА 1: КАЗИНО ЛИМИТЫ -->
                        <td>
                            <div style="display: flex; gap: 4px;">
                                <input type="number" id="c_min_${p.username}" value="${cMin}" placeholder="Min" style="width:65px; padding:4px; margin:0; font-size:11px; background: #0c0f14; border-color:#222a36;">
                                <input type="number" id="c_max_${p.username}" value="${cMax}" placeholder="Max" style="width:65px; padding:4px; margin:0; font-size:11px; background: #0c0f14; border-color:#222a36;">
                            </div>
                        </td>
                        <!-- КОЛОНКА 2: СПОРТ ЛИМИТЫ -->
                        <td>
                            <div style="display: flex; gap: 4px;">
                                <input type="number" id="s_min_${p.username}" value="${sMin}" placeholder="Min" style="width:65px; padding:4px; margin:0; font-size:11px; background: #0c0f14; border-color:#222a36;">
                                <input type="number" id="s_max_${p.username}" value="${sMax}" placeholder="Max" style="width:65px; padding:4px; margin:0; font-size:11px; background: #0c0f14; border-color:#222a36;">
                            </div>
                        </td>
                        <td style="text-align: center;">
                            <button onclick="togglePlayerBan('${p.username}', ${p.is_banned})" class="btn-bets-period" style="background: ${p.is_banned ? '#e94560' : 'transparent'}; border-color: ${p.is_banned ? '#e94560' : '#262c3a'}; color: ${p.is_banned ? '#fff' : '#8a99ad'}; padding: 4px 10px; font-size: 11px;">
                                ${p.is_banned ? '🛑 BANNED' : '🟢 ACTIVE'}
                            </button>
                        </td>
                        <td style="text-align: right;">
                            <div style="display: inline-flex; gap: 5px; align-items: center;">
                                <input type="number" id="bal_${p.username}" value="${Number(p.balance).toFixed(2)}" style="width:80px; padding:4px; margin:0;">
                                <button onclick="savePlayerSettings('${p.username}')" style="background:var(--accent-blue); color:#fff; padding:5px 12px; border:none; border-radius:4px; font-weight:600; cursor:pointer;">Save</button>
                            </div>
                        </td>
                    </tr>
                `;
            }).join('');

            const pag = data.pagination;
            document.getElementById('lbl_players_page').innerText = `Page ${pag.page} of ${pag.totalPages || 1}`;
            document.getElementById('btn_players_prev').disabled = pag.page <= 1;
            document.getElementById('btn_players_next').disabled = pag.page >= pag.totalPages;
        }
    } catch (e) { console.error(e); }
    finally { hideLoader(); }
}

// Кнопка быстрого бана/разбана
async function togglePlayerBan(username, currentStatus) {
    const currentPartnerId = localStorage.getItem('partnerId') || 'demo_mtwtech';
    const res = await fetch(`${SERVER_URL}/api/admin/players/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ partnerId: currentPartnerId, username, isBanned: !currentStatus })
    });
    if (res.ok) loadPlayers();
}

// Общая кнопка сохранения лимитов и баланса
async function savePlayerSettings(username) {
    const currentPartnerId = localStorage.getItem('partnerId') || 'demo_mtwtech';
    const balance = document.getElementById('bal_' + username).value;

    // Считываем инпуты. Если пусто — отправляем -1 для сброса в NULL
    const cMinRaw = document.getElementById('c_min_' + username).value;
    const cMaxRaw = document.getElementById('c_max_' + username).value;
    const sMinRaw = document.getElementById('s_min_' + username).value;
    const sMaxRaw = document.getElementById('s_max_' + username).value;

    const casinoMin = cMinRaw === '' ? -1 : cMinRaw;
    const casinoMax = cMaxRaw === '' ? -1 : cMaxRaw;
    const sportMin = sMinRaw === '' ? -1 : sMinRaw;
    const sportMax = sMaxRaw === '' ? -1 : sMaxRaw;

    const res = await fetch(`${SERVER_URL}/api/admin/players/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            partnerId: currentPartnerId,
            username,
            balance,
            casinoMin,
            casinoMax,
            sportMin,
            sportMax
        })
    });

    if (res.ok) {
        alert(`Параметры игрока ${username} успешно обновлены!`);
        loadPlayers();
    }
}

function changePlayersPage(direction) {
    currentPlayersPage += direction;
    loadPlayers();
}

// 1. Загрузка списка промокодов с кнопками деактивации и выводом дат
async function loadAdminPromos() {
    try {
        const currentPartnerId = localStorage.getItem('partnerId') || 'demo_mtwtech';
        const res = await fetch(`${SERVER_URL}/api/admin/promos?partnerId=${currentPartnerId}`);
        const data = await res.json();

        const tbody = document.getElementById('promoCodesTableBody');
        if (tbody && data.success && data.promoCodes) {
            tbody.innerHTML = data.promoCodes.map(p => {
                // Красиво форматируем дату окончания, если она есть
                const expDate = p.expires_at
                    ? new Date(p.expires_at).toLocaleDateString() + ' ' + new Date(p.expires_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})
                    : '♾️ Forever';

                const isActive = p.is_active === 1;

                return `
                    <tr>
                        <td><b style="color: var(--accent-pink);">${p.code}</b></td>
                        <td><b>${Number(p.reward).toFixed(2)} 🪙</b></td>
                        <td><small style="color: var(--text-muted); font-weight:600;">${p.current_uses} / ${p.max_uses}</small></td>
                        <td><small style="color: #8a99ad; font-family: monospace;">${expDate}</small></td>
                        <td style="text-align: right;">
                            <button onclick="togglePromoCodeState('${p.code}', ${p.is_active})" class="btn-bets-period" style="background: ${isActive ? 'transparent' : '#381b1b'}; border-color: ${isActive ? '#262c3a' : '#ff4d4d'}; color: ${isActive ? '#4ecca3' : '#ff4d4d'}; padding: 4px 10px; font-size: 11px;">
                                ${isActive ? '🟢 ACTIVE' : '🛑 OFF'}
                            </button>
                        </td>
                    </tr>
                `;
            }).join('');
        }
    } catch (err) {
        console.error('Failed to load voucher list:', err);
    }
}

// 2. Создание нового промокода с учетом таймлайна жизни купона
document.getElementById('promoForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    showLoader();

    const currentPartnerId = localStorage.getItem('partnerId') || 'demo_mtwtech';
    const code = document.getElementById('p_code').value;
    const reward = document.getElementById('p_reward').value;
    const maxUses = document.getElementById('p_maxUses').value;
    const expiresAt = document.getElementById('p_expiresAt').value; // Забираем дату

    try {
        const res = await fetch(`${SERVER_URL}/api/admin/promos/create`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ partnerId: currentPartnerId, code, reward, maxUses, expiresAt })
        });

        if (res.ok) {
            alert('Promo voucher registered!');
            document.getElementById('promoForm').reset();
            document.getElementById('p_maxUses').value = '1';
            loadAdminPromos();
        }
    } catch (err) {
        console.error(err);
    } finally {
        hideLoader();
    }
});

// 3. Функция переключения активности купона кликом по кнопке в таблице [INDEX]
async function togglePromoCodeState(code, currentStatus) {
    const currentPartnerId = localStorage.getItem('partnerId') || 'demo_mtwtech';
    showLoader();
    try {
        const res = await fetch(`${SERVER_URL}/api/admin/promos/toggle`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ partnerId: currentPartnerId, code, currentStatus })
        });
        if (res.ok) loadAdminPromos();
    } catch (err) {
        console.error(err);
    } finally {
        hideLoader();
    }
}


// 1. Функция автоматической загрузки процента кэшбэка при открытии вкладки
// 1. Загрузка конфигурации кэшбэка из PostgreSQL при открытии таба
async function loadAdminCashbackConfig() {
    try {
        const currentPartnerId = localStorage.getItem('partnerId') || 'demo_mtwtech';
        const res = await fetch(`${SERVER_URL}/api/admin/cashback/config?partnerId=${currentPartnerId}`);
        const data = await res.json();

        if (data.success && data.config) {
            document.getElementById('g_cashbackPercent').value = data.config.percent;
            document.getElementById('g_cashbackMode').value = data.config.mode;

            // Если выбран авторежим или крон, кнопку ручной выплаты визуально делаем тусклой
            const manualBtn = document.getElementById('runCashbackBtn');
            if (data.config.mode !== 'manual') {
                manualBtn.style.opacity = '0.4';
                manualBtn.innerText = '💰 Manual payout disabled (Running in Auto/Cron mode)';
            } else {
                manualBtn.style.opacity = '1';
                manualBtn.innerText = '💰 Calculate and pay manual cashback everyone';
            }
        }
    } catch (err) {
        console.error('Failed to load cashback config:', err);
    }
}

// 2. Сохранение режима и процента в базу данных
document.getElementById('cashbackConfigForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    showLoader();

    const currentPartnerId = localStorage.getItem('partnerId') || 'demo_mtwtech';
    const percent = document.getElementById('g_cashbackPercent').value;
    const mode = document.getElementById('g_cashbackMode').value;

    try {
        const res = await fetch(`${SERVER_URL}/api/admin/cashback/config/save`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ partnerId: currentPartnerId, percent, mode })
        });

        if (res.ok) {
            alert(`Cashback rule updated successfully to [${mode.toUpperCase()}] at ${percent}%!`);
            loadAdminCashbackConfig(); // Перечитываем и обновляем состояние кнопки
        }
    } catch (err) {
        console.error(err);
    } finally {
        hideLoader();
    }
});



document.getElementById('runCashbackBtn').addEventListener('click', async () => {
    const percent = document.getElementById('g_cashbackPercent').value || 10;
    if (!confirm(`Confirm calculation and batch credit payout of ${percent}% cashback for all active players?`)) return;

    showLoader();
    const currentPartnerId = localStorage.getItem('partnerId') || 'demo_mtwtech';

    try {
        const res = await fetch(`${SERVER_URL}/api/admin/cashback/run`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ partnerId: currentPartnerId, percent })
        });
        const data = await res.json();
        if (data.success) {
            alert(data.message);
        }
    } catch (err) {
        console.error(err);
        alert('Cashback payout batch failure');
    } finally {
        hideLoader();
    }
});


// 1. Загрузка параметров геймификации из PostgreSQL при открытии вкладки
async function loadAdminGamificationConfig() {
    try {
        const currentPartnerId = localStorage.getItem('partnerId') || 'demo_mtwtech';
        const res = await fetch(`${SERVER_URL}/api/admin/gamification/config?partnerId=${currentPartnerId}`);
        const data = await res.json();

        if (data.success && data.config) {
            const cfg = data.config;
            document.getElementById('g_xpPerGame').value = cfg.xpPerGame;
            document.getElementById('g_xpMultiplier').value = cfg.xpMultiplier;
            document.getElementById('g_levelUpBonus').value = cfg.levelUpBonus;
            document.getElementById('g_questTargetGames').value = cfg.questTargetGames;
            document.getElementById('g_questReward').value = cfg.questReward;
            document.getElementById('g_tournamentActive').value = cfg.tournamentActive;
            document.getElementById('g_tournamentPrize').value = cfg.tournamentPrize;
            // Выводим процент партнерской комиссии (RevShare)
            document.getElementById('g_affiliatePercent').value = cfg.affiliatePercent || 0;
        }
    } catch (err) {
        console.error('Failed to load gamification config:', err);
    }
}

// 2. Обработчик отправки формы (Сохранение в базу данных)
document.getElementById('gamificationForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    showLoader();

    const currentPartnerId = localStorage.getItem('partnerId') || 'demo_mtwtech';
    const payload = {
        partnerId: currentPartnerId,
        xpPerGame: document.getElementById('g_xpPerGame').value,
        xpMultiplier: document.getElementById('g_xpMultiplier').value,
        levelUpBonus: document.getElementById('g_levelUpBonus').value,
        tournamentActive: document.getElementById('g_tournamentActive').value,
        tournamentPrize: document.getElementById('g_tournamentPrize').value,
        affiliatePercent: document.getElementById('g_affiliatePercent').value
    };

    try {
        const res = await fetch(`${SERVER_URL}/api/admin/gamification/config/save`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (res.ok) {
            alert('Gamification and retention parameters successfully saved to PostgreSQL!');
            loadAdminGamificationConfig();
        }
    } catch (err) {
        console.error(err);
    } finally {
        hideLoader();
    }
});

// 3. Обработчик завершения турнира и выплаты призов игрокам в Postgres
document.getElementById('endTournamentBtn').addEventListener('click', async () => {
    if (!confirm('Are you sure you want to end the current network tournament? This will calculate top-3 leaders, execute balance payouts via seamless gateway and reset leaderboard points to 0.')) return;

    showLoader();
    const currentPartnerId = localStorage.getItem('partnerId') || 'demo_mtwtech';

    try {
        const res = await fetch(`${SERVER_URL}/api/admin/tournament/end`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ partnerId: currentPartnerId })
        });
        const data = await res.json();

        if (data.success) {
            if (data.winners && data.winners.length > 0) {
                const winnersList = data.winners.map(w => `Place ${w.place}: ${w.username} (${w.points} pts) -> +${w.prize} 🪙`).join('\n');
                alert(`🏆 Tournament finalized successfully!\n\nWinners Payout Log:\n${winnersList}`);
            } else {
                alert('Tournament finished. No active participants with points > 0 found.');
            }
            loadAdminGamificationConfig();
        }
    } catch (err) {
        console.error(err);
        alert('Failed to finalize current tournament sequence');
    } finally {
        hideLoader();
    }
});

// 1. Загрузка списка квестов партнера в таблицу
async function loadAdminQuestsMatrix() {
    try {
        const currentPartnerId = localStorage.getItem('partnerId') || 'demo_mtwtech';
        const res = await fetch(`${SERVER_URL}/api/admin/quests?partnerId=${currentPartnerId}`);
        const data = await res.json();

        const tbody = document.getElementById('adminQuestsTableBody');
        if (tbody && data.success && data.quests) {
            if (data.quests.length === 0) {
                tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:15px; color:var(--text-muted);">No active quest types configured</td></tr>`;
                return;
            }

            tbody.innerHTML = data.quests.map(q => `
                <tr style="border-bottom: 1px solid #141822;">
                    <td style="padding: 8px 0;"><b style="color: var(--neon-green);">${q.quest_type}</b></td>
                    <td><b>${Number(q.target_value)}</b></td>
                    <td><b style="color: #fff;">${Number(q.reward_amount)} 🪙</b></td>
                    <td><span style="color: var(--text-muted); font-size:11px;">${q.description}</span></td>
                    <td style="text-align: right;">
                        <button type="button" onclick="deleteAdminQuestNode(${q.id})" style="background: transparent; border: 1px solid #ff4d4d; color: #ff4d4d; padding: 2px 8px; border-radius: 4px; cursor: pointer; font-size: 11px;">
                            Delete
                        </button>
                    </td>
                </tr>
            `).join('');
        }
    } catch (err) {
        console.error('Failed to load quest matrix:', err);
    }
}

// 2. Добавление или обновление типа квеста
async function createAdminQuestNode() {
    const target = document.getElementById('q_target').value;
    const reward = document.getElementById('q_reward').value;
    const desc = document.getElementById('q_desc').value;

    if (!target || !reward || !desc) return alert('Please fill all quest configuration fields');

    showLoader();
    const currentPartnerId = localStorage.getItem('partnerId') || 'demo_mtwtech';
    const payload = {
        partnerId: currentPartnerId,
        questType: document.getElementById('q_type').value,
        targetValue: target,
        rewardAmount: reward,
        description: desc
    };

    try {
        const res = await fetch(`${SERVER_URL}/api/admin/quests/create`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (res.ok) {
            document.getElementById('q_target').value = '';
            document.getElementById('q_reward').value = '';
            document.getElementById('q_desc').value = '';
            loadAdminQuestsMatrix(); // Перерисовываем таблицу матриц квестов
        }
    } catch (err) {
        console.error(err);
    } finally {
        hideLoader();
    }
}

// 3. Удаление типа квеста
async function deleteAdminQuestNode(questId) {
    if (!confirm('Delete this quest type? Progress for all players on this quest will be lost.')) return;

    showLoader();
    const currentPartnerId = localStorage.getItem('partnerId') || 'demo_mtwtech';

    try {
        const res = await fetch(`${SERVER_URL}/api/admin/quests/delete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ partnerId: currentPartnerId, questId })
        });
        if (res.ok) loadAdminQuestsMatrix();
    } catch (err) {
        console.error(err);
    } finally {
        hideLoader();
    }
}


// 1. Загрузка параметров активного турнира и архива из СУБД
async function loadAdminTournamentsMatrix() {
    try {
        const currentPartnerId = localStorage.getItem('partnerId') || 'demo_mtwtech';
        const res = await fetch(`${SERVER_URL}/api/admin/tournaments?partnerId=${currentPartnerId}`);
        const data = await res.json();

        // Рендерим плашку текущего статуса
        const statusBlock = document.getElementById('active_tournament_card_details');
        const endBtn = document.getElementById('endTournamentBtn');

        if (data.success && data.activeTournament) {
            const t = data.activeTournament;
            statusBlock.innerHTML = `
                📌 <b>Title:</b> <span style="color:var(--accent-pink); font-weight:700;">${t.title}</span><br>
                💰 <b>Prize Pool:</b> ${Number(t.prize_pool).toFixed(2)} 🪙<br>
                ⚡ <b>Min Bet Qualification:</b> ${Number(t.min_bet_to_earn)} 🪙<br>
                📅 <b>Timeline:</b> <span style="font-family:monospace; font-size:11px;">${new Date(t.start_at).toLocaleDateString()} - ${new Date(t.end_at).toLocaleDateString()}</span>
            `;
            endBtn.disabled = false;
            endBtn.style.opacity = '1';
        } else {
            statusBlock.innerHTML = `<span style="color:var(--text-muted);">No active championships deployed at the moment. Use creation wizard to deploy nodes.</span>`;
            endBtn.disabled = true;
            endBtn.style.opacity = '0.3';
        }

        // Рендерим таблицу архива
        const tbody = document.getElementById('adminTournamentHistoryTbody');
        if (tbody && data.success && data.archive) {
            if (data.archive.length === 0) {
                tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:15px; color:var(--text-muted);">History logs archive is completely clean</td></tr>`;
                return;
            }
            tbody.innerHTML = data.archive.map(h => `
                <tr style="border-bottom: 1px solid #141822;">
                    <td style="padding: 8px 0; color:#fff;">${h.title}</td>
                    <td><b>${h.winner_username}</b></td>
                    <td><span class="badge" style="padding:2px 6px; font-size:11px; background:${h.place === 1 ? '#e1b12c' : h.place === 2 ? '#95a5a6' : '#d35400'}; color:#000; font-weight:bold;">Top ${h.place}</span></td>
                    <td><small style="font-family:monospace;">${h.points_earned} pts</small></td>
                    <td style="text-align: right; color:var(--neon-green); font-weight:bold;">+${Number(h.prize_paid).toFixed(2)} 🪙</td>
                </tr>
            `).join('');
        }
    } catch (err) {
        console.error('Failed to load tournament grid:', err);
    }
}

// 2. Деплой (создание) нового турнирного ивента
async function createAdminTournamentNode() {
    const title = document.getElementById('t_title').value;
    const prize = document.getElementById('t_prize').value;
    const minbet = document.getElementById('t_minbet').value;
    const start = document.getElementById('t_start').value;
    const end = document.getElementById('t_end').value;

    if (!title || !prize || !start || !end) return alert('Please input title, prize pool and calendar matrix timeline data');

    showLoader();
    const currentPartnerId = localStorage.getItem('partnerId') || 'demo_mtwtech';

    try {
        const res = await fetch(`${SERVER_URL}/api/admin/tournaments/create`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ partnerId: currentPartnerId, title, prizePool: prize, minBet: minbet, startAt: start, endAt: end })
        });

        if (res.ok) {
            alert('Championship node deployed successfully!');
            document.getElementById('t_title').value = '';
            document.getElementById('t_prize').value = '';
            document.getElementById('t_minbet').value = '';
            document.getElementById('t_start').value = '';
            document.getElementById('t_end').value = '';
            loadAdminTournamentsMatrix();
        }
    } catch (err) {
        console.error(err);
    } finally {
        hideLoader();
    }
}



// 1. Загрузка списка сайтов
let editingWebsiteId = null; // Хранит ID редактируемого сайта (null = создание)
let cachedWebsites = [];     // Локальный кэш сайтов для быстрой подстановки при клике

// 1. Загрузка сайтов с поддержкой клика на строку и кнопки удаления
async function loadAdminWebsites() {
    try {
        const currentPartnerId = localStorage.getItem('partnerId') || 'demo_mtwtech';
        const res = await fetch(`${SERVER_URL}/api/admin/websites?partnerId=${currentPartnerId}`);
        const data = await res.json();

        const tbody = document.getElementById('adminWebsitesTableBody');
        const bTargetSelect = document.getElementById('b_target_site');
        const bFilterSelect = document.getElementById('b_filter_site');

        if (data.success && data.websites) {
            cachedWebsites = data.websites; // Сохраняем в кэш

            if (tbody) {
                if (data.websites.length === 0) {
                    tbody.innerHTML = `<tr><td colspan="3" style="text-align:center; padding:15px; color:var(--text-muted);">No websites registered</td></tr>`;
                } else {
                    tbody.innerHTML = data.websites.map(w => {
                        const set = typeof w.settings === 'string' ? JSON.parse(w.settings) : (w.settings || {});
                        const stl = typeof w.styles === 'string' ? JSON.parse(w.styles) : (w.styles || {});
                        const isMaint = set.maintenance ? '🛠️ ТЕХ' : '🟢 ON';
                        const badgeColor = set.maintenance ? '#381b1b' : '#1b382c';
                        const accentColor = stl.primaryColor || '#00a8ff';

                        // Подсвечиваем строку, если она выбрана для редактирования
                        const isSelectedRow = editingWebsiteId === w.id ? 'background: rgba(0, 168, 255, 0.08); border-left: 2px solid var(--accent-blue);' : '';

                        return `
                            <tr style="border-bottom: 1px solid #141822; cursor:pointer; ${isSelectedRow}" onclick="editWebsiteNode(${w.id})">
                                <td style="padding:10px 0;">
                                    <b>${w.title}</b><br>
                                    <small style="color:var(--text-muted); font-size:11px;">${stl.bgTheme === 'dark' ? '🌌 Dark' : '☀️ Light'}</small>
                                </td>
                                <td style="font-family:monospace; vertical-align: middle;">
                                    <span style="color:${accentColor};">●</span> ${w.domain_name}
                                </td>
                                <td style="text-align:right; vertical-align: middle; display:flex; gap:8px; justify-content:flex-end; padding-top:14px;" onclick="event.stopPropagation();">
                                    <span class="badge" style="background:${badgeColor}; color: #fff; font-size:10px; padding:3px 6px; border-radius:4px; font-weight:600; height:fit-content;">
                                        ${isMaint}
                                    </span>
                                    <button type="button" onclick="deleteWebsiteNode(${w.id})" style="background:transparent; border:none; color:#ff4d4d; cursor:pointer; font-size:14px; padding:0 5px;" title="Удалить сайт">×</button>
                                </td>
                            </tr>
                        `;
                    }).join('');
                }
            }

            const optionsHtml = data.websites.map(w => `<option value="${w.id}">${w.title} (${w.domain_name})</option>`).join('');
            if (bTargetSelect) bTargetSelect.innerHTML = optionsHtml;
            if (bFilterSelect) bFilterSelect.innerHTML = `<option value="">🌍 Все подключенные сайты</option>` + optionsHtml;
        }
    } catch (err) { console.error(err); }
}

// 2. Клик по строке таблицы: перенос данных в форму
function editWebsiteNode2222(websiteId) {
    const site = cachedWebsites.find(w => w.id === websiteId);
    if (!site) return;

    editingWebsiteId = websiteId;

    // Распаковываем JSONB параметры
    const set = typeof site.settings === 'string' ? JSON.parse(site.settings) : (site.settings || {});
    const meta = typeof site.meta === 'string' ? JSON.parse(site.meta) : (site.meta || {});
    const stl = typeof site.styles === 'string' ? JSON.parse(site.styles) : (site.styles || {});

    // Заполняем форму данными выбранного сайта
    document.getElementById('w_domain').value = site.domain_name;
    document.getElementById('w_title').value = site.title;
    document.getElementById('w_reg_open').checked = set.registrationOpen !== false;
    document.getElementById('w_maintenance').checked = !!set.maintenance;
    document.getElementById('w_meta_title').value = meta.title || '';
    document.getElementById('w_meta_desc').value = meta.description || '';
    document.getElementById('w_theme_mode').value = stl.bgTheme || 'dark';
    document.getElementById('w_color_hex').value = stl.primaryColor || '#e94560';
    document.getElementById('w_color_picker').value = stl.primaryColor || '#e94560';

    // Меняем внешний вид кнопок управления формы
    document.getElementById('w_submit_btn').innerText = '🔄 Update Brand Configurations';
    document.getElementById('w_submit_btn').style.background = 'var(--accent-pink)';
    document.getElementById('w_cancel_btn').style.display = 'inline-block';

    // Перерисовываем таблицу, чтобы подсветить активную строку
    loadAdminWebsites();
}

function editWebsiteNode(websiteId) {
    const site = cachedWebsites.find(w => w.id === websiteId);
    if (!site) return;

    editingWebsiteId = websiteId;

    const set = typeof site.settings === 'string' ? JSON.parse(site.settings) : (site.settings || {});
    const meta = typeof site.meta === 'string' ? JSON.parse(site.meta) : (site.meta || {});
    const stl = typeof site.styles === 'string' ? JSON.parse(site.styles) : (site.styles || {});
    const gtw = set.gateways || { cryptomus: true, aaio: true, pix: true, payeer: true }; // Дефолты, если старая запись

    // Заполняем форму
    document.getElementById('w_domain').value = site.domain_name;
    document.getElementById('w_title').value = site.title;
    document.getElementById('w_reg_open').checked = set.registrationOpen !== false;
    document.getElementById('w_maintenance').checked = !!set.maintenance;

    // ВОССТАНАВЛИВАЕМ ГАЛОЧКИ ТУМБЛЕРОВ ПЛАТЕЖЕК
    document.getElementById('w_pay_cryptomus').checked = gtw.cryptomus !== false;
    document.getElementById('w_pay_aaio').checked = gtw.aaio !== false;
    document.getElementById('w_pay_pix').checked = gtw.pix !== false;
    document.getElementById('w_pay_payeer').checked = gtw.payeer !== false;
    document.getElementById('w_pay_flutterwave').checked = gtw.flutterwave !== false;
    document.getElementById('w_pay_vodafone').checked = gtw.vodafone !== false;

    document.getElementById('w_meta_title').value = meta.title || '';
    document.getElementById('w_meta_desc').value = meta.description || '';
    document.getElementById('w_theme_mode').value = stl.bgTheme || 'dark';
    document.getElementById('w_color_hex').value = stl.primaryColor || '#e94560';
    document.getElementById('w_color_picker').value = stl.primaryColor || '#e94560';

    document.getElementById('w_submit_btn').innerText = '🔄 Update Brand Configurations';
    document.getElementById('w_submit_btn').style.background = 'var(--accent-pink)';
    document.getElementById('w_cancel_btn').style.display = 'inline-block';

    loadAdminWebsites();
}


// 3. Сброс формы в режим создания нового сайта
function resetWebsiteForm() {
    editingWebsiteId = null;
    document.getElementById('websiteForm').reset();

    // Возвращаем дефолты чекбоксов и пикеров
    document.getElementById('w_reg_open').checked = true;
    document.getElementById('w_maintenance').checked = false;
    document.getElementById('w_color_picker').value = '#e94560';
    document.getElementById('w_color_hex').value = '#e94560';

    document.getElementById('w_submit_btn').innerText = '💾 Save Brand Domain & Layout';
    document.getElementById('w_submit_btn').style.background = 'var(--accent-blue)';
    document.getElementById('w_cancel_btn').style.display = 'none';

    document.getElementById('w_pay_cryptomus').checked = true;
    document.getElementById('w_pay_aaio').checked = true;
    document.getElementById('w_pay_pix').checked = true;
    document.getElementById('w_pay_payeer').checked = true;
    document.getElementById('w_pay_flutterwave').checked = true;
    document.getElementById('w_pay_vodafone').checked = true;

    loadAdminWebsites();
}

// 4. Обработчик формы: создание или апдейт в зависимости от переменной editingWebsiteId
document.getElementById('websiteForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    let domainInput = document.getElementById('w_domain').value.trim();
    const domain = domainInput
        .replace(/^(https?:\/\/)?(www\.)?/, '') // убирает протоколы и www
        .split('/')[0]                          // отсекает пути (всё, что после /)
        .split(':')[0];                         // отсекает порты (всё, что после :)

    const title = document.getElementById('w_title').value.trim();
    if (!domain || !title) return alert('Domain Name and Brand Title are required.');

    const currentPartnerId = localStorage.getItem('partnerId') || 'demo_mtwtech';

    // Упаковываем основные сеттинги и включенные шлюзы в один объект settings

    // Дальше переменные metaObj, stylesObj и отправка fetch (остаются как были)

    // Собираем чистый объект конфигурации
    const payload = {
        partnerId: currentPartnerId,
        domain: domain,
        title: title,
        settings: {
            registrationOpen: document.getElementById('w_reg_open').checked,
            maintenance: document.getElementById('w_maintenance').checked,
            gateways: {
                cryptomus: document.getElementById('w_pay_cryptomus').checked,
                aaio: document.getElementById('w_pay_aaio').checked,
                pix: document.getElementById('w_pay_pix').checked,
                payeer: document.getElementById('w_pay_payeer').checked,
                flutterwave: document.getElementById('w_pay_flutterwave').checked,
                vodafone: document.getElementById('w_pay_vodafone').checked
            }
        },
        meta: {
            title: document.getElementById('w_meta_title').value.trim() || title,
            description: document.getElementById('w_meta_desc').value.trim()
        },
        styles: {
            bgTheme: document.getElementById('w_theme_mode').value,
            primaryColor: document.getElementById('w_color_hex').value
        }
    };

    // ОПРЕДЕЛЯЕМ ЭНДПОИНТ: Если редактируем — переключаем роут и добавляем id в payload
    let targetUrl = `${SERVER_URL}/api/admin/websites/create`;

    if (editingWebsiteId) {
        targetUrl = `${SERVER_URL}/api/admin/websites/update`;
        payload.id = editingWebsiteId; // Добавляем ID строки для WHERE запроса в SQL
    }

    showLoader();
    try {
        const res = await fetch(targetUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await res.json();

        if (res.ok && data.success) {
            alert(editingWebsiteId ? 'Website configurations updated successfully!' : 'New website brand registered!');
            resetWebsiteForm(); // Сбрасывает форму и очищает переменную editingWebsiteId
            loadAdminBannersMatrix();
        } else {
            alert(`Error: ${data.error || 'Failed to execute database command'}`);
        }
    } catch (err) {
        console.error(err);
        alert('Network connection error during layout deployment');
    } finally {
        hideLoader();
    }
});


// 5. Функция удаления сайта
async function deleteWebsiteNode(websiteId) {
    if (!confirm('ВНИМАНИЕ! Удаление сайта полностью удалит его домен, настройки, метатеги и ВСЕ привязанные к нему баннеры слайдеров. Продолжить?')) return;

    showLoader();
    const currentPartnerId = localStorage.getItem('partnerId') || 'demo_mtwtech';
    try {
        const res = await fetch(`${SERVER_URL}/api/admin/websites/delete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ partnerId: currentPartnerId, websiteId })
        });
        if (res.ok) {
            if (editingWebsiteId === websiteId) resetWebsiteForm();
            await loadAdminWebsites();
            loadAdminBannersMatrix();
        }
    } catch (err) { console.error(err); }
    finally { hideLoader(); }
}




let editingBannerId = null; // null = создание, число = редактирование
let cachedBanners = [];     // Кэш для подстановки данных в форму

// 1. Загрузка баннеров с подсветкой активной строки при редактировании
async function loadAdminBannersMatrix() {
    try {
        const currentPartnerId = localStorage.getItem('partnerId') || 'demo_mtwtech';
        const filterSiteId = document.getElementById('b_filter_site').value;

        let url = `${SERVER_URL}/api/admin/banners?partnerId=${currentPartnerId}`;
        if (filterSiteId) url += `&websiteId=${filterSiteId}`;

        const res = await fetch(url);
        const data = await res.json();
        const tbody = document.getElementById('adminBannersTableBody');

        if (tbody && data.success && data.banners) {
            cachedBanners = data.banners; // Сохраняем в кэш

            if (data.banners.length === 0) {
                tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:15px; color:var(--text-muted);">No active banners found</td></tr>`;
                return;
            }
            tbody.innerHTML = data.banners.map(b => {
                const isSelectedRow = editingBannerId === b.id ? 'background: rgba(233, 69, 96, 0.08); border-left: 2px solid var(--accent-pink);' : '';

                return `
                    <tr style="border-bottom: 1px solid #141822; cursor:pointer; ${isSelectedRow}" onclick="editBannerNode(${b.id})">
                        <td style="padding:8px 0;"><b>${b.website_title}</b></td>
                        <td><span class="badge" style="background:#161920; border:1px solid var(--border-color); padding:2px 6px; border-radius:4px;">${b.banner_type.toUpperCase()}</span></td>
                        <td onclick="event.stopPropagation();">
                            <a href="${b.image_url}" target="_blank">
                                <img src="${b.image_url}" style="width:80px; height:40px; object-fit:cover; border-radius:4px; border:1px solid #262c3a; background:#000;" onerror="this.src='https://placehold.co'">
                            </a>
                        </td>
                        <td style="font-family:monospace; color:var(--text-muted);">${b.click_url || '—'}</td>
                        <td style="text-align:right; vertical-align: middle;" onclick="event.stopPropagation();">
                            <button type="button" onclick="deleteAdminBannerNode(${b.id})" style="background:transparent; border:none; color:#ff4d4d; cursor:pointer; font-size:16px; padding:0 10px;">×</button>
                        </td>
                    </tr>
                `;
            }).join('');
        }
    } catch (err) { console.error(err); }
}

// 2. Клик на строку таблицы: перенос данных баннера в инпуты
function editBannerNode(bannerId) {
    const banner = cachedBanners.find(b => b.id === bannerId);
    if (!banner) return;

    editingBannerId = bannerId;

    // Заполняем форму
    document.getElementById('b_target_site').value = banner.website_id;
    document.getElementById('b_type').value = banner.banner_type;
    document.getElementById('b_img').value = banner.image_url;
    document.getElementById('b_click').value = banner.click_url;
    document.getElementById('b_order').value = banner.sort_order;

    // Меняем кнопки
    document.getElementById('b_submit_btn').innerText = '🔄 UPDATE SLIDER BANNER';
    document.getElementById('b_cancel_btn').style.display = 'inline-block';

    loadAdminBannersMatrix(); // Обновляем подсветку строк
}

// 3. Сброс формы баннеров
function resetBannerForm() {
    editingBannerId = null;
    document.getElementById('b_img').value = '';
    document.getElementById('b_click').value = '';
    document.getElementById('b_order').value = '0';

    document.getElementById('b_submit_btn').innerText = '🖼️ INJECT SLIDER BANNER';
    document.getElementById('b_cancel_btn').style.display = 'none';

    loadAdminBannersMatrix();
}

// 4. Объединенная функция Создания / Обновления баннера
async function createAdminBannerNode() {
    const websiteId = document.getElementById('b_target_site').value;
    const bannerType = document.getElementById('b_type').value;
    const imageUrl = document.getElementById('b_img').value.trim();
    const clickUrl = document.getElementById('b_click').value.trim();
    const sortOrder = document.getElementById('b_order').value;

    if (!websiteId || !imageUrl) return alert('Target website and Image URL are required fields');

    let targetUrl = `${SERVER_URL}/api/admin/banners/create`;
    const currentPartnerId = localStorage.getItem('partnerId') || 'demo_mtwtech';

    const payload = {
        partnerId: currentPartnerId,
        websiteId,
        bannerType,
        imageUrl,
        clickUrl,
        sortOrder
    };

    // Если редактируем — переключаем роут на update и добавляем id
    if (editingBannerId) {
        targetUrl = `${SERVER_URL}/api/admin/banners/update`;
        payload.id = editingBannerId;
    }

    showLoader();
    try {
        const res = await fetch(targetUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (res.ok) {
            alert(editingBannerId ? 'Banner campaign updated!' : 'New banner campaign node injected!');
            resetBannerForm(); // Очистит форму и сбросит ID
        }
    } catch (err) { console.error(err); }
    finally { hideLoader(); }
}

// 5. Удаление баннера
async function deleteAdminBannerNode(bannerId) {
    if (!confirm('Are you sure you want to delete this banner campaign node?')) return;
    showLoader();
    const currentPartnerId = localStorage.getItem('partnerId') || 'demo_mtwtech';
    try {
        const res = await fetch(`${SERVER_URL}/api/admin/banners/delete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ partnerId: currentPartnerId, bannerId })
        });
        if (res.ok) loadAdminBannersMatrix();
    } catch (err) { console.error(err); }
    finally { hideLoader(); }
}

document.getElementById('w_color_picker').addEventListener('input', (e) => {
    document.getElementById('w_color_hex').value = e.target.value;
});
document.getElementById('w_color_hex').addEventListener('input', (e) => {
    if (e.target.value.startsWith('#') && e.target.value.length === 7) {
        document.getElementById('w_color_picker').value = e.target.value;
    }
});




// 1. Загрузка списка ожидающих заявок в админку
async function loadAdminPendingWithdrawals() {
    try {
        const currentPartnerId = localStorage.getItem('partnerId') || 'demo_mtwtech';
        const res = await fetch(`${SERVER_URL}/api/admin/withdrawals?partnerId=${currentPartnerId}&status=PENDING`);
        const data = await res.json();
        const tbody = document.getElementById('adminWithdrawalsTableBody');

        if (tbody && data.success && data.requests) {
            if (data.requests.length === 0) {
                tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:20px; color:var(--text-muted);">No pending withdrawal requests in queue. Good job!</td></tr>`;
                return;
            }
            tbody.innerHTML = data.requests.map(r => `
                <tr style="border-bottom: 1px solid #141822;">
                    <td style="padding: 10px 0;"><small style="color:var(--text-muted);">${new Date(r.timestamp).toLocaleString()}</small></td>
                    <td><b>${r.username}</b></td>
                    <td><b style="color:#ff4d4d;">-${Number(r.amount).toFixed(2)} 🪙</b></td>
                    <td><span class="badge" style="background:#161920; border:1px solid #262c3a; padding:2px 6px; border-radius:4px;">${r.gateway.toUpperCase()}</span></td>
                    <td><small style="font-family:monospace; color:#fff;">${r.wallet_details}</small></td>
                    <td style="text-align: right;">
                        <div style="display:inline-flex; gap:8px;">
                            <button onclick="processWithdrawalNode(${r.id}, 'APPROVE')" style="background:#1b382c; border:1px solid var(--neon-green); color:var(--neon-green); padding:4px 10px; border-radius:4px; cursor:pointer; font-weight:bold; font-size:11px;">🟢 APPROVE</button>
                            <button onclick="processWithdrawalNode(${r.id}, 'REJECT')" style="background:#381b1b; border:1px solid #ff4d4d; color:#ff4d4d; padding:4px 10px; border-radius:4px; cursor:pointer; font-weight:bold; font-size:11px;">🔴 REJECT</button>
                        </div>
                    </td>
                </tr>
            `).join('');
        }
    } catch (err) { console.error(err); }
}

// 2. Обработка клика админа Одобрить/Отклонить [INDEX]
async function processWithdrawalNode(requestId, action) {
    const confirmMsg = action === 'APPROVE'
        ? 'Confirm payout approval? Make sure you have checked player betting logs for security clearance.'
        : 'Reject this request and refund full amount back to player balance?';

    if (!confirm(confirmMsg)) return;

    showLoader();
    const currentPartnerId = localStorage.getItem('partnerId') || 'demo_mtwtech';

    try {
        const res = await fetch(`${SERVER_URL}/api/admin/withdrawals/process`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ partnerId: currentPartnerId, requestId, action })
        });
        if (res.ok) {
            await loadAdminPendingWithdrawals(); // обновляем список заявок
            if (typeof loadAdminFinanceReport === 'function') loadAdminFinanceReport(); // обновляем общий финансовый лог кассы
        }
    } catch (err) { console.error(err); }
    finally { hideLoader(); }
}

// 1. Загрузка инцидентов безопасности в таблицу
async function loadAdminAntifraudAlerts() {
    try {
        const currentPartnerId = localStorage.getItem('partnerId') || 'demo_mtwtech';
        const res = await fetch(`${SERVER_URL}/api/admin/antifraud?partnerId=${currentPartnerId}`);
        const data = await res.json();
        const tbody = document.getElementById('adminAntifraudTableBody');

        if (tbody && data.success && data.alerts) {
            if (data.alerts.length === 0) {
                tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:15px; color:var(--text-muted);">Ecosystem is secure. No fraud risk anomalies detected.</td></tr>`;
                return;
            }
            tbody.innerHTML = data.alerts.map(a => `
                <tr style="border-bottom: 1px solid #141822; background: rgba(255, 77, 77, 0.02);">
                    <td style="padding: 8px 0;"><small style="color:var(--text-muted);">${new Date(a.timestamp).toLocaleTimeString()}</small></td>
                    <td><b style="color:#fff;">${a.username}</b></td>
                    <td><span class="badge" style="background:#381b1b; color:#ff4d4d; border:1px solid #ff4d4d; padding:2px 6px; border-radius:4px; font-weight:bold;">${a.alert_type}</span></td>
                    <td><b style="color: ${a.risk_score >= 70 ? '#ff4d4d' : '#ffb703'};">${a.risk_score} / 100</b></td>
                    <td style="color: var(--text-muted); font-size:11px;">${a.description}</td>
                    <td style="text-align: right;">
                        <button onclick="dismissAntifraudAlert(${a.id})" class="btn-bets-period" style="padding: 2px 8px; font-size: 11px; border-color:#262c3a; color:#8a99ad;">Dismiss</button>
                    </td>
                </tr>
            `).join('');
        }
    } catch (err) { console.error(err); }
}

// 2. Кнопка сброса/архивации алерта админом
async function dismissAntifraudAlert(alertId) {
    const currentPartnerId = localStorage.getItem('partnerId') || 'demo_mtwtech';
    const res = await fetch(`${SERVER_URL}/api/admin/antifraud/dismiss`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ partnerId: currentPartnerId, alertId })
    });
    if (res.ok) loadAdminAntifraudAlerts();
}


// 1. Загрузка параметров Welcome-бонуса из СУБД для выбранного сайта
async function loadAdminWelcomeBonusMatrix() {
    const websiteId = document.getElementById('wb_target_site').value;
    if (!websiteId) return;

    try {
        const currentPartnerId = localStorage.getItem('partnerId') || 'demo_mtwtech';
        const res = await fetch(`${SERVER_URL}/api/admin/bonus/welcome?partnerId=${currentPartnerId}&websiteId=${websiteId}`);
        const data = await res.json();

        if (data.success && data.config) {
            const cfg = data.config;
            document.getElementById('wb_percent').value = cfg.bonus_percent;
            document.getElementById('wb_wager').value = cfg.wager_multiplier;
            document.getElementById('wb_min_dep').value = parseInt(cfg.min_deposit_amount);
            document.getElementById('wb_max_bonus').value = parseInt(cfg.max_bonus_amount);
            document.getElementById('wb_active').value = cfg.is_active;
        }
    } catch (err) {
        console.error('Failed to query welcome bonus matrix state:', err);
    }
}

// 2. Сохранение/Обновление параметров бонуса в Postgres
async function saveAdminWelcomeBonusNode() {
    const websiteId = document.getElementById('wb_target_site').value;
    if (!websiteId) return alert('No active brand website selected.');

    showLoader();
    const currentPartnerId = localStorage.getItem('partnerId') || 'demo_mtwtech';

    const payload = {
        partnerId: currentPartnerId,
        websiteId: websiteId,
        bonusPercent: document.getElementById('wb_percent').value,
        wagerMultiplier: document.getElementById('wb_wager').value,
        minDeposit: document.getElementById('wb_min_dep').value,
        maxBonus: document.getElementById('wb_max_bonus').value,
        isActive: document.getElementById('wb_active').value
    };

    try {
        const res = await fetch(`${SERVER_URL}/api/admin/bonus/welcome/save`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (res.ok) {
            alert('First deposit promo campaign rules successfully updated in PostgreSQL database!');
            loadAdminWelcomeBonusMatrix();
        }
    } catch (err) {
        console.error(err);
    } finally {
        hideLoader();
    }
}



// Run auth validation sequence on page boot
checkDemoAuth();
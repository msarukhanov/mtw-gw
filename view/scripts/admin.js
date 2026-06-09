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

        // Users Table Render Loop
        const tbody = document.getElementById('playersTableBody');
        if (tbody) {
            tbody.innerHTML = data.players.map(p => `
                    <tr>
                        <td><b>${p.username}</b><br><small style="color:var(--text-muted);">Level: ${p.level || 1} (${p.xp || 0} XP)</small></td>
                        <td>
                            <b style="color:var(--neon-green);">💵 Balance: ${p.balance} 🪙</b><br>
                            <small style="color:var(--text-muted);">🏆 Tournament points: ${p.tournamentPoints || 0}</small>
                        </td>
                        <td>
                            <div class="flex-row">
                                <input type="number" id="bal_${p.username}" value="${p.balance}" style="width:90px; margin:0;">
                                <button onclick="updateBalance('${p.username}')" style="background:var(--accent-green); padding:6px 12px;">Update</button>
                            </div>
                        </td>
                    </tr>
                `).join('');
        }

        // Retention Modules Parameters Sync
        document.getElementById('g_xpPerGame').value = data.config.gamification.xpPerGame;
        document.getElementById('g_xpMultiplier').value = data.config.gamification.xpMultiplier;
        document.getElementById('g_levelUpBonus').value = data.config.gamification.levelUpBonus;
        document.getElementById('g_questTargetGames').value = data.config.gamification.questTargetGames;
        document.getElementById('g_questReward').value = data.config.gamification.questReward;
        document.getElementById('g_tournamentActive').value = data.config.gamification.tournamentActive;
        document.getElementById('g_tournamentPrize').value = data.config.gamification.tournamentPrize;

        document.getElementById('g_affiliatePercent').value = data.config.gamification.affiliatePercent || 10;

        document.getElementById('g_cashbackPercent').value = data.config.gamification.cashbackPercent || 10;

        // Active Promocodes Render Loop
        const promoTbody = document.getElementById('promoCodesTableBody');
        if (data.config.promoCodes && data.config.promoCodes.length > 0) {
            promoTbody.innerHTML = data.config.promoCodes.map(p => `
                    <tr>
                        <td><b>${p.code}</b></td>
                        <td><b style="color:var(--neon-green);">${p.reward} 🪙</b></td>
                        <td>${p.maxUses} times</td>
                        <td><span style="color: ${p.active === 1 ? 'var(--accent-green)' : 'var(--accent-red)'}"><b>${p.active === 1 ? 'ACTIVE' : 'DISABLED'}</b></span></td>
                    </tr>
                `).join('');
        } else {
            promoTbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:var(--text-muted); padding:10px;">Registry empty</td></tr>`;
        }


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

async function updateBalance(username) {
    const bal = document.getElementById('bal_' + username).value;
    const res = await fetch(`${SERVER_URL}/api/admin/update-balance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, balance: bal })
    });
    if (res.ok) { alert(`Player ${username} balance changed!`); loadData(); }
}

document.getElementById('gamificationForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const gData = {
        gamification_xpPerGame: document.getElementById('g_xpPerGame').value,
        gamification_xpMultiplier: document.getElementById('g_xpMultiplier').value,
        gamification_levelUpBonus: document.getElementById('g_levelUpBonus').value,
        gamification_questTargetGames: document.getElementById('g_questTargetGames').value,
        gamification_questReward: document.getElementById('g_questReward').value,
        gamification_tournamentActive: document.getElementById('g_tournamentActive').value,
        gamification_tournamentPrize: document.getElementById('g_tournamentPrize').value,
        gamification_affiliatePercent: document.getElementById('g_affiliatePercent').value
    };

    const res = await fetch(`${SERVER_URL}/api/admin/update-config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(gData)
    });
    if (res.ok) { alert('Gamification params updated!'); loadData(); }
});

document.getElementById('endTournamentBtn').addEventListener('click', async () => {
    if (!confirm('Are you sure you want to end the current tournament?')) return;

    try {
        const res = await fetch(`${SERVER_URL}/api/admin/end-tournament`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        const data = await res.json();

        if (data.success) {
            if (data.winners.length === 0) {
                alert('Tournament is over! No active players.');
            } else {
                let report = '🏆 Tournament is over! Winners:\n\n';
                data.winners.forEach(w => {
                    report += `${w.place} place: ${w.username} (${w.points} points) — Winning: +${w.prize} 🪙\n`;
                });
                alert(report);
            }
            loadData();
        } else { alert('Tournament end error.'); }
    } catch (err) { alert('Server communication error.'); }
});

document.getElementById('promoForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const promoData = {
        code: document.getElementById('p_code').value,
        reward: document.getElementById('p_reward').value,
        maxUses: document.getElementById('p_maxUses').value
    };

    const res = await fetch(`${SERVER_URL}/api/admin/add-promocode`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(promoData)
    });

    if (res.ok) {
        alert('Promo voucher created and verified!');
        document.getElementById('p_code').value = '';
        document.getElementById('p_reward').value = '';
        loadData();
    } else {
        const err = await res.json();
        alert('Error: ' + err.error);
    }
});

document.getElementById('runCashbackBtn').addEventListener('click', async () => {
    if (!confirm('Are you sure you want to calculate and drop cashback balances for everyone?')) return;

    try {
        const res = await fetch(`${SERVER_URL}/api/admin/run-cashback`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        const data = await res.json();

        if (data.success) {
            if (data.report.length === 0) {
                alert('Calculation completed. No players with net loss discovered.');
            } else {
                let report = '💰 CASHBACK DISTRIBUTED SUCCESSFULLY:\n\n';
                data.report.forEach(r => {
                    report += `Player: ${r.username} | Net Loss: ${r.loss} 🪙 | Paid: +${r.paid} 🪙\n`;
                });
                alert(report);
            }
            loadData();
        }
    } catch (err) { alert('Operation execution failure on server.'); }
});

document.getElementById('cashbackConfigForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const cashbackData = {
        gamification_cashbackPercent: document.getElementById('g_cashbackPercent').value
    };

    const res = await fetch(`${SERVER_URL}/api/admin/update-config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cashbackData)
    });

    if (res.ok) { alert('Cashback percentage successfully updated!'); loadData(); }
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




// Run auth validation sequence on page boot
checkDemoAuth();
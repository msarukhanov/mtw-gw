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
let mtwTrafficChartInstance = null;
let mtwMarketingChartInstance = null;
let mtwSharesChartInstance = null;

let currentPlayersPage = 1;


let editingJackpotId = null;
let cachedJackpots = [];


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

    switch(tabId) {
        case 'tab-dashboard':
            loadAdminDashboard();
            loadAdminFinanceChart();
            break;
        case 'tab-bets':
            loadAdminBets();
            break;
        case 'tab-finance':
            loadAdminFinance();
            break;
        case 'tab-widthrawal':
            loadAdminPendingWithdrawals();
            break;


        case 'tab-players':
            loadAdminPlayers();
            break;
        case 'tab-players-auth-logs':
            loadGlobalSecurityAuditTrail();
            break;
        case 'tab-antifraud':
            loadAdminAntifraudAlerts();
            break;

        case 'tab-welcome':
            loadAdminWelcomeBonusMatrix();
            break;
        case 'tab-jackpot':
            loadAdminJackpotsMatrix();
            break;
        case 'tab-gamification':
            loadAdminGamificationConfig();
            loadAdminQuestsMatrix();
            loadAdminTournamentsMatrix();
            loadAdminAchievementsInventory();
            loadAdminClansEcosystem();
            break;
        case 'tab-tournaments':
            loadAdminTournamentsMatrix();
            break;
        case 'tab-cashback':
            loadAdminPromos();
            loadAdminCashbackConfig();
            break;

        case 'tab-sportsbook':
            loadPendingSportsBets();
            break;

        case 'tab-websites':

            break;
        case 'tab-websites-banners':
            loadAdminBannersMatrix();
            break;
        case 'tab-websites-translations':
            loadAdminTranslationMatrix();
            break;


        case 'tab-config':
            loadGamesConfig();
            break;
        case 'tab-collections':
            loadAdminCollections();
            break;
        case 'tab-providers':
            loadAdminProvidersConfig();
            break;
        case 'tab-games':
            loadAdminGamesConfig();
            break;

    }


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
        loadAdminDashboard();
        loadAdminFinanceChart();

        loadAdminBets();
        loadAdminFinance();
        loadAdminPendingWithdrawals();

        loadAdminPlayers();
        loadGlobalSecurityAuditTrail();
        loadAdminAntifraudAlerts();

        loadAdminWelcomeBonusMatrix();
        loadAdminJackpotsMatrix();
        loadAdminGamificationConfig();
        loadAdminQuestsMatrix();
        loadAdminAchievementsInventory();
        loadAdminClansEcosystem();
        loadAdminTournamentsMatrix();
        loadAdminPromos();
        loadAdminCashbackConfig();

        loadPendingSportsBets();

        loadAdminWebsites();
        loadAdminBannersMatrix();
        loadAdminTranslationMatrix();

        loadGamesConfig();
        loadAdminCollections();
        loadAdminGamesConfig();
        loadAdminProvidersConfig();

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


// Хелпер переключения табов (чтобы работал наряду с твоей текущей системой вкладок)
function openAdminCatalogTab(tabId, element) {
    document.querySelectorAll('.tab-content').forEach(el => el.style.display = 'none');
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));

    document.getElementById(`tab-${tabId}`).style.display = 'block';
    element.classList.add('active');
}

// Загрузка списков коллекций для админки (Запросы 1, 5, 6, 7)




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















// 1. Функция автоматической загрузки процента кэшбэка при открытии вкладки
// 1. Загрузка конфигурации кэшбэка из PostgreSQL при открытии таба


// 1. Загрузка параметров геймификации из PostgreSQL при открытии вкладки


let editingQuestId = null;
let cachedQuests = [];

let editingWebsiteId = null; // Хранит ID редактируемого сайта (null = создание)
let cachedWebsites = [];     // Локальный кэш сайтов для быстрой подстановки при клике

// 1. Загрузка сайтов с поддержкой клика на строку и кнопки удаления

let editingAchievementId = null;
let cachedAchievements = [];

let editingBannerId = null; // null = создание, число = редактирование
let cachedBanners = [];     // Кэш для подстановки данных в форму

// 1. Загрузка баннеров с подсветкой активной строки при редактировании


document.getElementById('w_color_picker').addEventListener('input', (e) => {
    document.getElementById('w_color_hex').value = e.target.value;
});
document.getElementById('w_color_hex').addEventListener('input', (e) => {
    if (e.target.value.startsWith('#') && e.target.value.length === 7) {
        document.getElementById('w_color_picker').value = e.target.value;
    }
});




// 1. Загрузка списка ожидающих заявок в админку


// 1. Загрузка инцидентов безопасности в таблицу



// 1. Автоматическая загрузка параметров Welcome-бонуса из СУБД для выбранного бренда
async function loadAdminWelcomeBonusMatrix() {
    const websiteSelect = document.getElementById('wb_target_site');
    if (!websiteSelect) return;

    const websiteId = websiteSelect.value;
    if (!websiteId) return;

    try {
        const currentPartnerId = localStorage.getItem('partnerId') || 'demo_mtwtech';
        const res = await fetch(`${SERVER_URL}/api/admin/bonus/welcome?partnerId=${currentPartnerId}&websiteId=${websiteId}`);
        const data = await res.json();

        if (data.success && data.config) {
            const cfg = data.config;
            // Наполняем инпуты красивой формы данными из Postgres
            document.getElementById('wb_percent').value = cfg.bonus_percent || 100;
            document.getElementById('wb_wager').value = cfg.wager_multiplier || 30;
            document.getElementById('wb_min_dep').value = parseInt(cfg.min_deposit_amount || 100);
            document.getElementById('wb_max_bonus').value = parseInt(cfg.max_bonus_amount || 5000);
            document.getElementById('wb_active').value = cfg.is_active !== undefined ? cfg.is_active : 1;
        }
    } catch (err) {
        console.error('Failed to query welcome bonus matrix state:', err);
    }
}

// 2. Сохранение/Обновление параметров бонуса (Upsert в b2b_welcome_bonuses)
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

        if (!res.error) {
            alert('First deposit promo campaign rules successfully updated in PostgreSQL database!');
            loadAdminWelcomeBonusMatrix(); // Перечитываем актуальное состояние
        } else {
            alert('Failed to save bonus layout structure');
        }
    } catch (err) {
        console.error(err);
        alert('Ecosystem connection timeout during bonus routing');
    } finally {
        hideLoader();
    }
}











// Run auth validation sequence on page boot
checkDemoAuth();
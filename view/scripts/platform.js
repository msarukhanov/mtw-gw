const CORE_SERVER = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
    ? 'http://localhost:3000'
    : 'https://mtw-gw.onrender.com';

let currentUsername = "";
let currentSessionId = ""; // Храним защищенный токен сессии
let socket = null;

async function startShowcase() {
    const usernameInput = document.getElementById('playerInput').value.trim();
    if (!usernameInput) return alert('Please enter a valid player username');

    try {
        // 1. ОТПРАВЛЯЕМ ЗАПРОС НА ЛОГИН ДЛЯ ГЕНЕРАЦИИ ТОКЕНА СЕССИИ
        const response = await fetch(`${CORE_SERVER}/api/player/login`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({username: usernameInput})
        });
        const data = await response.json();

        if (!response.ok || !data.success) {
            return alert(data.error || 'Login session initialization failed');
        }

        // Сохраняем полученные данные
        currentUsername = data.username;
        currentSessionId = data.sessionId; // Наш сгенерированный безопасный токен!

        document.getElementById('setup-screen').style.display = 'none';
        document.getElementById('platform-screen').style.display = 'block';
        document.getElementById('drop-username').innerText = currentUsername;
        document.getElementById('wallet-display').innerText = data.balance + ' 🪙';
        document.getElementById('side-username').innerText = currentUsername;

        // 2. ИНИЦИАЛИЗАЦИЯ ВЕБ-СОКЕТА ДЛЯ ОБНОВЛЕНИЙ
        console.log(CORE_SERVER);
        socket = io(CORE_SERVER);

        socket.on('connect', () => {
            console.log('WS Connect', {
                username: currentUsername,
                partnerId: 'demo_mtwtech'
            });

            setTimeout(() => {
                console.log('🚀 Sending handshake now...');
                socket.emit('platform_join', {
                    username: currentUsername,
                    partnerId: 'demo_mtwtech'
                });
            }, 100);
        });

        socket.on('connect_error', (err) => {
            console.error('❌ Ошибка подключения сокета в лайве:', err.message);
        });

        updateWallet();

        socket.on('wallet_update', (data) => {
            console.log('⚡ Live WS Wallet Update:', data.balance);
            document.getElementById('wallet-display').innerText = data.balance + ' 🪙';
        });


        // Допиши в самый конец функции startShowcase()

// 1. Генерируем и показываем личную реф-ссылку игрока (код равен его юзернейму)
        const currentUrlWithoutParams = window.location.href.split('?')[0];
        const personalRefLink = `${currentUrlWithoutParams}?ref=${currentUsername}`;
        const refBox = document.getElementById('refLinkDisplay');
        if (refBox) refBox.innerText = personalRefLink;

// 2. АВТО-ПРИВЯЗКА: Проверяем, перешел ли этот игрок по чужой реф-ссылке
        const urlParams = new URLSearchParams(window.location.search);
        const incomingRefCode = urlParams.get('ref');

        if (incomingRefCode && incomingRefCode !== currentUsername) {
            console.log(`🔗 Found incoming referral code: ${incomingRefCode}. Registering...`);
            fetch(`${CORE_SERVER}/api/auth/link-ref`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    username: currentUsername,
                    partnerId: 'demo_mtwtech',
                    refCode: incomingRefCode
                })
            })
                .then(res => res.json())
                .then(data => {
                    if (data.success) console.log(`✅ Successfully linked as a referral of ${incomingRefCode}`);
                });
        }


        toggleView('home');

    } catch (err) {
        alert('Connection error during platform initialization');
    }
}

async function updateWallet() {
    if (!currentSessionId) return;
    try {
        const res = await fetch(`${CORE_SERVER}/api/player/info?sessionId=${currentSessionId}`);
        const data = await res.json();
        document.getElementById('wallet-display').innerText = data.balance + ' 🪙';
    } catch (e) {
        console.error('Wallet backup sync broken.');
    }
}

function toggleProfileDropdown(e) {
    e.stopPropagation();
    const dropdown = document.getElementById('profileDropdown');
    dropdown.style.display = dropdown.style.display === 'block' ? 'none' : 'block';
}

function launchGame(gameKey) {
    const wrapper = document.getElementById('frameWrapper');
    const iframe = document.getElementById('gameIframe');

    // Generate seamless iframe packet routing link with B2B session configurations
    const iframeUrl = `https://mtwtech.onrender.com/casino?sessionId=${currentSessionId}&partnerId=demo_mtwtech`;

    iframe.src = iframeUrl;
    wrapper.style.display = 'block';
    window.scrollTo({
        top: 0,
        behavior: 'smooth'
    });
}

function launchSport(gameKey) {
    const wrapper = document.getElementById('frameWrapper');
    const iframe = document.getElementById('gameIframe');

    // Generate seamless iframe packet routing link with B2B session configurations
    const iframeUrl = `https://mtwtech.onrender.com/sport?sessionId=${currentSessionId}&partnerId=demo_mtwtech`;

    iframe.src = iframeUrl;
    wrapper.style.display = 'block';
    window.scrollTo({
        top: 0,
        behavior: 'smooth'
    });
}

function toggleView(viewType) {
    document.querySelectorAll('.nav-link-item').forEach(link => link.classList.remove('active'));
    document.querySelectorAll('.mobile-nav-item').forEach(btn => btn.classList.remove('active'));
    document.getElementById('gameIframe').src = "";
    document.getElementById('mobileRightMenu').style.display = 'none';

    if (viewType === 'home') {
        document.getElementById('frameWrapper').style.display = 'none';
        document.getElementById('section-home').classList.add('active');
        if (document.getElementById('m-btn-home')) document.getElementById('m-btn-home').classList.add('active');
    } else if (viewType === 'casino') {
        document.getElementById('section-home').classList.remove('active');
        document.getElementById('link-casino').classList.add('active');
        if (document.getElementById('m-btn-casino')) document.getElementById('m-btn-casino').classList.add('active');
        launchGame('');
    } else {
        document.getElementById('section-home').classList.remove('active');
        document.getElementById('link-sports').classList.add('active');
        if (document.getElementById('m-btn-sports')) document.getElementById('m-btn-sports').classList.add('active');
        launchSport('');
    }
}

let currentSlideIdx = 0;

function moveSlide(idx) {
    currentSlideIdx = idx;
    const container = document.getElementById('sliderContainer');
    // Смещаем контейнер на нужный процент влево
    container.style.transform = `translateX(-${idx * 33.333}%)`;

    // Переключаем активную точку навигации
    const dots = document.querySelectorAll('.slider-dot');
    dots.forEach(dot => dot.classList.remove('active'));
    if (dots[idx]) dots[idx].classList.add('active');
}

// Автоматическая прокрутка баннеров каждые 5 секунд для живой презентации
setInterval(() => {
    if (document.getElementById('section-home').classList.contains('active')) {
        let nextIdx = (currentSlideIdx + 1) % 3;
        moveSlide(nextIdx);
    }
}, 5000);

// --- FIX: SAFE AUTHENTICATION INTERACTIVE LOGIC ---
function openAuthModal(mode = 'login') {
    const modal = document.getElementById('authModal');
    if (modal) {
        modal.style.display = 'flex';
        switchAuthMode(mode);
    }
}

function closeAuthModal() {
    const modal = document.getElementById('authModal');
    if (modal) modal.style.display = 'none';
}

function switchAuthMode(mode) {
    const btnLogin = document.getElementById('tab-btn-login');
    const btnSignup = document.getElementById('tab-btn-signup');
    const formLogin = document.getElementById('form-login');
    const formSignup = document.getElementById('form-signup');
    const modalTitle = document.getElementById('auth-modal-title');

    // Проверяем наличие элементов перед изменением стилей, чтобы избежать Uncaught TypeError
    if (mode === 'signup') {
        if (btnLogin) btnLogin.classList.remove('active');
        if (btnSignup) btnSignup.classList.add('active');
        if (formLogin) formLogin.classList.remove('active');
        if (formSignup) formSignup.classList.add('active');
        if (modalTitle) modalTitle.innerText = 'Account Sign Up';

        const urlParams = new URLSearchParams(window.location.search);
        const signupRef = document.getElementById('signupRef');
        if (urlParams.get('ref') && signupRef) {
            signupRef.value = urlParams.get('ref');
        }
    } else {
        if (btnSignup) btnSignup.classList.remove('active');
        if (btnLogin) btnLogin.classList.add('active');
        if (formSignup) formSignup.classList.remove('active');
        if (formLogin) formLogin.classList.add('active');
        if (modalTitle) modalTitle.innerText = 'Account Sign In';
    }
}


// Перехват клика по кнопке "Profile" на мобилках
function handleMobileProfileClick() {
    if (currentSessionId) {
        openUserMenu(); // Если авторизован, открываем ЛК
    } else {
        openAuthModal('login'); // Если гость, отправляем логиниться
    }
}

// Сетевой запрос: Вход (Адаптирован под твой бэкенд роут /auth)
async function handleLogin() {
    const user = document.getElementById('loginUser').value.trim();
    // Пароль в бэкенде пока не проверяется, берем только username
    if (!user) return alert('Please enter a valid username');

    try {
        const response = await fetch(`${CORE_SERVER}/api/auth`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: user,
                partnerId: 'demo_mtwtech' // Передаем обязательный partnerId
            })
        });
        const data = await response.json();

        if (!response.ok || data.error) {
            return alert(data.error || 'Authentication failed');
        }

        // Твой бэкенд не генерирует sessionId на /auth, создаем временный демо-токен для фронтенда
//            data.sessionId = 'demo_session_' + Math.random().toString(36).substr(2, 9);

        // Успешный вход — инициализируем сессию игрока
        closeAuthModal();
        initSession(data);
    } catch (err) {
        alert('Server communication error during Sign In');
    }
}

// Сетевой запрос: Регистрация (Адаптирован под твой бэкенд)
async function handleSignup() {
    const user = document.getElementById('signupUser').value.trim();
    const refCode = document.getElementById('signupRef').value.trim();

    if (!user) return alert('Username field is required');

    try {
        // Так как в демо-бэкенде нет отдельного /signup, мы создаем пользователя через /auth
        const response = await fetch(`${CORE_SERVER}/api/auth`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: user,
                partnerId: 'demo_mtwtech'
            })
        });
        const data = await response.json();

        if (!response.ok || data.error) {
            return alert(data.error || 'Registration rejected');
        }

        // Если введен реферальный код — сразу связываем его через твой роут /auth/link-ref
        if (refCode) {
            try {
                await fetch(`${CORE_SERVER}/api/auth/link-ref`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        username: user,
                        partnerId: 'demo_mtwtech',
                        refCode: refCode
                    })
                });
                console.log('Referral link processed successfully');
            } catch(refErr) {
                console.error('Failed to link referral code on backend');
            }
        }

        alert('Account successfully created! Please sign in using your username.');
        switchAuthMode('login');

        // Подставляем созданное имя в поле логина для удобства
        if(document.getElementById('loginUser')) {
            document.getElementById('loginUser').value = user;
        }
    } catch (err) {
        alert('Server communication error during Sign Up');
    }
}


function initSession(data) {
    currentUsername = data.username;
    currentSessionId = data.sessionId;

    // Safely toggle desktop and mobile navigation wrappers based on login status
    const guestTools = document.getElementById('guest-tools');
    const userTools = document.getElementById('user-tools');

    if (guestTools) guestTools.style.setProperty('display', 'none', 'important');
    if (userTools) userTools.style.setProperty('display', 'flex', 'important');

    // Fill in player details across components
    const userDisplay = document.getElementById('user-display');
    const walletDisplay = document.getElementById('wallet-display');

    if (userDisplay) userDisplay.innerText = currentUsername;
    if (walletDisplay) walletDisplay.innerText = data.balance + ' 🪙';

    // Build unique multi-device personal referral links
    const currentUrlWithoutParams = window.location.href.split('?')[0];
    const refBox = document.getElementById('refLinkDisplay');
    if (refBox) refBox.innerText = `${currentUrlWithoutParams}?ref=${currentUsername}`;

    // Establish persistent real-time socket listeners
    if (typeof io !== 'undefined') {
        socket = io(CORE_SERVER);

        socket.on('connect', () => {
            console.log('WS Connect', {
                username: currentUsername,
                partnerId: 'demo_mtwtech'
            });
            setTimeout(() => {
                console.log('🚀 Sending handshake now...');
                socket.emit('platform_join', {
                    username: currentUsername,
                    partnerId: 'demo_mtwtech'
                });
            }, 500);

            setTimeout(() => {
                console.log('🚀 Sending handshake now...2');
                socket.emit('platform_join', {
                    username: currentUsername,
                    partnerId: 'demo_mtwtech'
                });
            }, 1000);
        });
        socket.on('wallet_update', (wsData) => {
            console.log('⚡ Live WS Wallet Update:', data.balance);
            const liveWallet = document.getElementById('wallet-display');
            const liveProfile = document.getElementById('profile-balance');
            if (liveWallet) liveWallet.innerText = wsData.balance + ' 🪙';
            if (liveProfile) liveProfile.innerText = wsData.balance + ' 🪙';
        });
    }


    toggleView('home');
}


// --- 👤 USER DASHBOARD LOGIC (ADAPTED FOR ROUTER.CHECKPLAYER) ---

// Open Dashboard Modal and Sync Live Data from Server via POST
let currentPlayerHistoryType = 'all'; // Глобальное состояние фильтра истории игрока

async function openUserMenu() {
    const modal = document.getElementById('userMenuModal');
    const profileUser = document.getElementById('profile-username');
    const refBox = document.getElementById('refLinkDisplay');

    if (!modal) return;

    // Показываем модалку
    modal.style.display = 'flex';
    if (profileUser) profileUser.innerText = currentUsername;

    // Генерируем реферальную ссылку
    if (refBox) {
        refBox.innerText = `${window.location.origin}?ref=${currentUsername}`;
    }

    // Сбрасываем фильтр истории на 'all' и подсвечиваем нужную кнопку внутри истории
    currentPlayerHistoryType = 'all';
    document.querySelectorAll('[id^="btn_history_"]').forEach(btn => btn.classList.remove('active'));
    const historyAllBtn = document.getElementById('btn_history_all');
    if (historyAllBtn) historyAllBtn.classList.add('active');

    // Безопасно переключаем интерфейс на вкладку профиля (она сама подсветит кнопку PROFILE)
    switchLkTab('lk-profile');

    if (!currentUsername) return;

    await apiGetPlayer();

    // ФЕТЧ 1: Запрашиваем ТОЛЬКО данные профиля и баланса (Отработает мгновенно)

}

// ФЕТЧ 2: Отдельная независимая функция загрузки истории игрока
async function loadPlayerHistory() {
    const historyList = document.getElementById('history-list');
    if (!historyList || !currentUsername) return;

    historyList.innerHTML = `<div style="text-align:center; color:var(--text-muted); padding:30px 0; font-size:13px;">Loading activity history...</div>`;

    try {
        // Передаем фильтр типа ('all', 'bets', 'cashier') в query-строке URL
        const res = await fetch(`${CORE_SERVER}/api/player/history?type=${currentPlayerHistoryType}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: currentUsername, partnerId: 'demo_mtwtech', token: currentSessionId })
        });
        const data = await res.json();

        if (data.success && data.history) {
            if (data.history.length > 0) {
                historyList.innerHTML = data.history.map(item => {
                    const isPositive = item.amount >= 0;
                    const colorStyle = isPositive ? 'var(--neon-green)' : 'var(--accent-red)';
                    const sign = isPositive ? '+' : '';

                    return `
                        <div class="history-item" style="display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.01); padding:10px; border-radius:6px; border:1px solid var(--border-color);">
                            <div>
                                <b style="color:#fff; font-size:13px;">${item.description}</b><br>
                                <span style="color:var(--text-muted); font-size:11px; font-family:monospace;">${item.date} [${item.type}]</span>
                            </div>
                            <div style="font-weight:bold; font-size:14px; color:${colorStyle}">
                                ${sign}${item.amount.toFixed(2)} 🪙
                            </div>
                        </div>
                    `;
                }).join('');
            } else {
                historyList.innerHTML = `
                    <div style="text-align:center; color:var(--text-muted); font-size:13px; padding:4px 0;">
                        No records found for this category
                    </div>`;
            }
        }
    } catch (err) {
        console.error('History fetch error:', err);
        historyList.innerHTML = `<div style="text-align:center; color:var(--accent-red); padding:30px 0; font-size:13px;">Failed to load history items</div>`;
    }
}

// Функция клика по фильтрам истории («Все», «Ставки», «Касса»)
function setPlayerHistoryType(type) {
    currentPlayerHistoryType = type;

    // Переключаем активные классы на кнопках-фильтрах
    document.querySelectorAll('[id^="btn_history_"]').forEach(btn => btn.classList.remove('active'));
    if (type === 'bets') document.getElementById('btn_history_bets').classList.add('active');
    else if (type === 'cashier') document.getElementById('btn_history_cash').classList.add('active');
    // else document.getElementById('btn_history_all').classList.add('active');

    // Перезагружаем ленту активности
    loadPlayerHistory();
}


function closeUserMenu() {
    const modal = document.getElementById('userMenuModal');
    if (modal) modal.style.display = 'none';
}

function switchLkTab(tabId) {
    // 1. Скрываем все панели и убираем подсветку со ВСЕХ кнопок меню
    document.querySelectorAll('#userMenuModal .lk-pane').forEach(pane => pane.classList.remove('active'));
    document.querySelectorAll('#userMenuModal .lk-tab-btn').forEach(btn => btn.classList.remove('active'));

    // 2. Показываем нужную панель
    const targetPane = document.getElementById(tabId);
    if (targetPane) targetPane.classList.add('active');

    // 3. Вычисляем ID кнопки на основе ID панели (например: lk-profile -> lk-tab-btn-profile)
    const btnSuffix = tabId.replace('lk-', '');
    const targetBtn = document.getElementById(`lk-tab-btn-${btnSuffix}`);

    // Подсвечиваем кнопку
    if (targetBtn) {
        targetBtn.classList.add('active');
    }

    // 4. Если открыли вкладку истории — подгружаем логи из Postgres
    if (tabId === 'lk-history') {
        loadPlayerHistory();
        document.getElementById('btn_history_bets').classList.add('active');
    }
}



function copyRefLink() {
    const refBox = document.getElementById('refLinkDisplay');
    if (!refBox) return;
    navigator.clipboard.writeText(refBox.innerText).then(() => {
        alert('Referral affiliate link copied to clipboard successfully!');
    });
}

async function apiGetPlayer() {
    const modal = document.getElementById('userMenuModal');
    const profileUser = document.getElementById('profile-username');
    const refBox = document.getElementById('refLinkDisplay');

    if (!currentUsername) return;
    try {
        const res = await fetch(`${CORE_SERVER}/api/player/info`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: currentUsername, partnerId: 'demo_mtwtech', token: currentSessionId })
        });
        const data = await res.json();

        const profileBalance = document.getElementById('profile-balance');
        const walletDisplay = document.getElementById('wallet-display');

        if (data.success && data.balance !== undefined) {
            const formattedBal = data.balance + ' 🪙';
            if (profileBalance) profileBalance.innerText = formattedBal;
            if (walletDisplay) walletDisplay.innerText = formattedBal;
        }
    } catch(e) {
        console.error('Profile sync failure:', e);
    }
}

async function apiChangePassword() {
    const passInput = document.getElementById('changePasswordInput');
    if (!passInput) return;

    const newPass = passInput.value.trim();
    if (!newPass || newPass.length < 6) return alert('Password must be at least 6 characters long.');

    try {
        const res = await fetch(`${CORE_SERVER}/api/player/change-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: currentUsername,
                partnerId: 'demo_mtwtech',
                token: currentSessionId,
                newPassword: newPass
            })
        });
        const data = await res.json();

        if (data.success) {
            alert('Security configuration password updated successfully.');
            passInput.value = '';
        } else {
            alert(data.error || 'Failed to update credentials.');
        }
    } catch(e) {
        alert('Connection error during credential routing.');
    }
}


async function apiApplyPromo() {
    const promoInput = document.getElementById('promoCodeInput');
    if (!promoInput) return;

    const code = promoInput.value.trim();
    if (!code) return alert('Please input an active promotional code');

    try {
        const res = await fetch(`${CORE_SERVER}/api/player/apply-promo`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: currentUsername,
                partnerId: 'demo_mtwtech',
                promoCode: code
            })
        });
        const data = await res.json();

        if (data.success) {
            alert(`Promo activation approved! Loaded: +${data.bonus} 🪙`);
            promoInput.value = '';
            openUserMenu(); // Refresh data
        } else { alert(data.error || 'Invalid or expired promo code.'); }
    } catch(e) { alert('Server validation timeout error.'); }
}

async function apiDeposit() {
    const amountInput = document.getElementById('depositAmount');
    if (!amountInput) return;

    const amount = parseFloat(amountInput.value);
    if (!amount || amount <= 0) return alert('Please specify a positive numeric deposit value');

    try {
        const res = await fetch(`${CORE_SERVER}/api/player/deposit`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: currentUsername,
                partnerId: 'demo_mtwtech',
                amount: amount
            })
        });
        const data = await res.json();

        if (data.success) {
            alert(`Simulation successful! Credit addition of ${amount} 🪙 approved.`);
            openUserMenu(); // Update balance views
        } else { alert(data.error || 'Deposit routing failed.'); }
    } catch(e) { alert('Gateway timeout error during transaction.'); }
}

async function apiWithdraw() {
    const withdrawInput = document.getElementById('withdrawAmount');
    if (!withdrawInput) return;

    const amount = parseFloat(withdrawInput.value);
    if (!amount || amount <= 0) return alert('Please specify a valid withdrawal amount');

    try {
        const res = await fetch(`${CORE_SERVER}/api/player/withdraw`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: currentUsername,
                partnerId: 'demo_mtwtech',
                amount: amount
            })
        });
        const data = await res.json();

        if (data.success) {
            alert(`Cashout pipeline order requested! Debited amount: -${amount} 🪙.`);
            withdrawInput.value = '';
            openUserMenu(); // Update balance views
        } else { alert(data.error || 'Insufficient funds.'); }
    } catch(e) { alert('Server validation error during withdraw.'); }
}




function logoutSession() {
    location.reload();
}



// Переменные для управления текущим состоянием слайдера
let currentSlideIndex = 0;
let sliderTimerInterval = null;

async function bootWhiteLabelPlatform() {
    try {
        const currentHostname = window.location.hostname;
        const defaultPartnerId = 'demo_mtwtech';

        const baseUrl = (location.hostname === 'localhost') ? 'http://localhost:3000' : 'https://mtw-gw.onrender.com';
        const baseUrlApi = baseUrl + '/api';

        const res = await fetch(`${baseUrlApi}/website/init?domain=${currentHostname}&partnerId=${defaultPartnerId}`);
        const data = await res.json();

        if (!data.success) {
            console.warn('⚠️ Domain not registered in B2B engine. Using fallbacks.');
            return;
        }

        // --- 1. SYSTEM SETTINGS (Обработка техработ) ---
        if (data.settings && data.settings.maintenance) {
            document.body.innerHTML = `
                <div style="display:flex; flex-direction:column; justify-content:center; align-items:center; height:100vh; background:#0a0c10; color:#fff; font-family:sans-serif;">
                    <h1 style="color:#e94560; letter-spacing:1px;">🛠️ UNDER MAINTENANCE</h1>
                    <p style="color:#8a99ad;">Ecosystem upgrades in progress.</p>
                </div>`;
            return;
        }

        // --- 2. SEO META TAGS ---
        if (data.meta) {
            document.title = data.meta.title || data.title;
            let metaDesc = document.querySelector('meta[name="description"]') || document.createElement('meta');
            metaDesc.name = 'description';
            metaDesc.content = data.meta.description || '';
            if (!metaDesc.parentNode) document.head.appendChild(metaDesc);
        }

        // --- 3. CUSTOM BRAND THEME STYLES (Цветовой акцент) ---
        if (data.styles && data.styles.primaryColor) {
            const accentColor = data.styles.primaryColor;
            const styleNode = document.createElement('style');
            styleNode.innerHTML = `
                :root { --accent-blue: ${accentColor} !important; --accent-pink: ${accentColor} !important; --neon-green: ${accentColor} !important; }
                .btn-primary, .lk-tab-btn.active { border-color: ${accentColor} !important; box-shadow: 0 0 12px ${accentColor}40 !important; }
            `;
            document.head.appendChild(styleNode);
        }

        // --- 4. 🖼️ ДИНАМИЧЕСКИЙ ПОДГРУЗЧИК СЛАЙДЕРА БАННЕРОВ (Новая логика) ---

        if(data.banners?.home) {
            const homeBanners = data.banners?.home || [];
            const sliderContainer = document.getElementById('sliderContainer');
            const dotsContainer = document.getElementById('sliderDotsContainer');

            if (sliderContainer && dotsContainer && homeBanners.length > 0) {

                // Генерируем HTML слайдов на основе URL картинок и ссылок из админки
                sliderContainer.innerHTML = homeBanners.map((b, index) => {
                    // Извлекаем чистый эндпоинт клика (например, 'casino' или 'sport') для поддержки навигации твоей витрины
                    const targetView = b.click_url.replace('/', '');
                    const clickAction = targetView ? `toggleView('${targetView}')` : `alert('Campaign link registered!')`;

                    return `
                    <div class="slide-item" style="background-image: linear-gradient(135deg, rgba(13,16,23,0.92) 0%, rgba(13,17,23,0.7) 100%), url('${b.image_url}'); border-left: 5px solid var(--accent-pink);">
                        <div class="slide-content">
                            <h2>Dynamic Campaign Node #${index + 1}</h2>
                            <p>Exclusive limited offer deployed by administration for domain layout tracking. Tap button to unlock event arena routing map.</p>
                            <button class="btn-primary" onclick="${clickAction}">Launch Event</button>
                        </div>
                    </div>
                `;
                }).join('');

                // Генерируем HTML навигационных точек (dots) строго по количеству баннеров
                dotsContainer.innerHTML = homeBanners.map((_, index) => `
                <div class="slider-dot ${index === 0 ? 'active' : ''}" id="mtw_dot_${index}" onclick="moveSlide(${index})"></div>
            `).join('');

                // Сбрасываем счетчик и запускаем цикл автоматического перелистывания слайдера
                currentSlideIndex = 0;
                startSliderAutoCycle(homeBanners.length);
            }
        }


    } catch (err) {
        console.error('Ecosystem boot collapsed:', err);
    }
}

// --- 5. 🛠️ ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ УПРАВЛЕНИЯ СЛАЙДЕРОМ ---

// Функция ручного переключения слайда при клике на точку (твоя moveSlide)
function moveSlide(index) {
    const sliderContainer = document.getElementById('sliderContainer');
    const totalSlides = document.querySelectorAll('#sliderContainer .slide-item').length;
    if (!sliderContainer || totalSlides === 0) return;

    currentSlideIndex = index;

    // Плавное смещение контейнера по горизонтали (X) на нужный кадр
    sliderContainer.style.transform = `translateX(-${currentSlideIndex * 100}%)`;

    // Переключаем активный CSS-класс у точек
    document.querySelectorAll('.slider-dot').forEach(dot => dot.classList.remove('active'));
    const targetDot = document.getElementById(`mtw_dot_${index}`);
    if (targetDot) targetDot.classList.add('active');

    // Перезапускаем таймер авто-слайдов, чтобы картинка не прыгнула сразу после ручного клика
    startSliderAutoCycle(totalSlides);
}

// Функция циклического таймера авто-перелистывания (раз в 5 секунд)
function startSliderAutoCycle(totalSlides) {
    if (sliderTimerInterval) clearInterval(sliderTimerInterval);

    sliderTimerInterval = setInterval(() => {
        currentSlideIndex = (currentSlideIndex + 1) % totalSlides;

        const sliderContainer = document.getElementById('sliderContainer');
        if (sliderContainer) {
            sliderContainer.style.transform = `translateX(-${currentSlideIndex * 100}%)`;

            document.querySelectorAll('.slider-dot').forEach(dot => dot.classList.remove('active'));
            const nextDot = document.getElementById(`mtw_dot_${currentSlideIndex}`);
            if (nextDot) nextDot.classList.add('active');
        }
    }, 5000);
}

// Инициализация при загрузке документа
window.addEventListener('DOMContentLoaded', bootWhiteLabelPlatform);


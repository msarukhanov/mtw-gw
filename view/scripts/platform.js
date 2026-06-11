const CORE_SERVER = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
    ? 'http://localhost:3000'
    : 'https://mtw-gw.onrender.com';

let currentUsername = "";
let currentSessionId = "";
let socket = null;

let currentPlayerHistoryType = 'all';

let currentSlideIndex = 0;
let currentSlideIdx = 0;
let sliderTimerInterval = null;

let dynamicTranslations = {};
let currentLanguage = 'en';


function updateWallet(data) {
    const profileBalance = document.getElementById('profile-balance');
    const profileBonus = document.getElementById('profile-bonus');

    const walletDisplay = document.getElementById('wallet-display');
    const bonusDisplay = document.getElementById('bonus-display');

    if (data.balance !== undefined) {
        const formattedBal = data.realBalance + ' 🪙';
        const formattedBonus = data.bonusBalance + ' 🪙';

        if (profileBalance) profileBalance.innerText = formattedBal;
        if (profileBonus) profileBonus.innerText = formattedBonus;

        if (walletDisplay) walletDisplay.innerText = formattedBal;
        if (bonusDisplay) profileBonus.innerText = formattedBonus;
    }
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



function moveSlide(index) {
    const sliderContainer = document.getElementById('sliderContainer');
    const totalSlides = document.querySelectorAll('#sliderContainer .slide-item').length;
    if (!sliderContainer || totalSlides === 0) return;

    // Гарантируем, что индекс не выйдет за пределы (если индекс больше черты, сбрасываем в 0)
    currentSlideIdx = (index >= totalSlides || index < 0) ? 0 : index;

    // Плавное смещение контейнера по горизонтали (X) на нужный кадр
    sliderContainer.style.transform = `translateX(-${currentSlideIdx * 100}%)`;

    // Переключаем активный CSS-класс у точек
    document.querySelectorAll('.slider-dot').forEach(dot => dot.classList.remove('active'));
    const targetDot = document.getElementById(`mtw_dot_${currentSlideIdx}`);
    if (targetDot) targetDot.classList.add('active');

    // Перезапускаем таймер авто-слайдов, чтобы картинка не прыгнула сразу после ручного клика
    startSliderAutoCycle(totalSlides);
}

// Функция циклического таймера авто-перелистывания (раз в 5 секунд)
function startSliderAutoCycle(totalSlides) {
    if (sliderTimerInterval) clearInterval(sliderTimerInterval);
    if (totalSlides <= 1) return; // Если слайд один, крутить нечего

    sliderTimerInterval = setInterval(() => {
        // Вычисляем следующий индекс с остатком от деления, чтобы после 2 шёл 0
        currentSlideIdx = (currentSlideIdx + 1) % totalSlides;

        const sliderContainer = document.getElementById('sliderContainer');
        if (sliderContainer) {
            sliderContainer.style.transform = `translateX(-${currentSlideIdx * 100}%)`;

            document.querySelectorAll('.slider-dot').forEach(dot => dot.classList.remove('active'));
            const nextDot = document.getElementById(`mtw_dot_${currentSlideIdx}`);
            if (nextDot) nextDot.classList.add('active');
        }
    }, 5000);
}

// ВАЖНО: Удалите старый фоновый setInterval, который вызывал moveSlide(nextIdx) каждые 5 секунд.
// Он конфликтовал с функцией startSliderAutoCycle и удваивал скорость прокрутки!



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
        if (modalTitle) modalTitle.innerText = _t('header.buttons.sign_up');

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
        if (modalTitle) modalTitle.innerText = _t('auth.windows.acc_sign_in');
    }
}

function handleMobileProfileClick() {
    if (currentSessionId) {
        openUserMenu();
    } else {
        openAuthModal('login');
    }
}

async function handleLogin() {
    const user = document.getElementById('loginUser').value.trim();
    // Пароль в бэкенде пока не проверяется, берем только username
    if (!user) return alert(_t('auth.messages.username_invalid'));

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

        if (data.error) {
            return alert(data.error || _t('auth.messages.login_fail'));
        }

        closeAuthModal();
        initSession(data);
    } catch (err) {
        alert('Server communication error during Sign In');
    }
}

async function handleSignup() {
    const user = document.getElementById('signupUser').value.trim();
    const refCode = document.getElementById('signupRef').value.trim();

    if (!user) return alert(_t('auth.messages.username_required'));

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

        alert(_t('auth.messages.signup_suc'));
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

    if (userDisplay) userDisplay.innerText = currentUsername;

    updateWallet(data);

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
            updateWallet(wsData);
        });
    }


    toggleView('home');
}


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
    loadPlayerGamificationStats();

    // ФЕТЧ 1: Запрашиваем ТОЛЬКО данные профиля и баланса (Отработает мгновенно)

}

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

function setPlayerHistoryType(type) {
    currentPlayerHistoryType = type;

    document.querySelectorAll('[id^="btn_history_"]').forEach(btn => btn.classList.remove('active'));
    if (type === 'bets') document.getElementById('btn_history_bets').classList.add('active');
    else if (type === 'cashier') document.getElementById('btn_history_cash').classList.add('active');
    // else document.getElementById('btn_history_all').classList.add('active');

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
        alert(_t('player.affiliate.copied'));
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
    } catch(e) {
        console.error('Profile sync failure:', e);
    }
}

async function apiChangePassword() {
    const passInput = document.getElementById('changePasswordInput');
    if (!passInput) return;

    const newPass = passInput.value.trim();
    if (!newPass || newPass.length < 6) return alert(_t('player.info.short_password'));

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
            alert(_t('player.info.pass_changed'));
            passInput.value = '';
        } else {
            alert(data.error || _t('player.info.pass_err'));
        }
    } catch(e) {
        alert('Connection error during credential routing.');
    }
}

async function apiApplyPromo() {
    const promoInput = document.getElementById('promoCodeInput');
    if (!promoInput) return;

    const code = promoInput.value.trim();
    if (!code) return alert(_t('player.promo.invalid'));

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
            alert(`${_t('player.promo.success')}: +${data.bonus} 🪙`);
            promoInput.value = '';
            openUserMenu(); // Refresh data
        } else { alert(data.error || _t('player.promo.fail')); }
    } catch(e) { alert('Server validation timeout error.'); }
}

async function apiDeposit() {
    const amountInput = document.getElementById('depositAmount');
    const gatewaySelect = document.getElementById('depositGateway');
    if (!amountInput || !gatewaySelect) return;

    const amount = amountInput.value.trim();
    const gateway = gatewaySelect.value;

    if (!amount || Number(amount) <= 0) return alert(_t('player.payments.deposit_invalid_amount'));

    try {
        const res = await fetch(`${CORE_SERVER}/api/player/deposit/init`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: currentUsername,
                partnerId: 'demo_mtwtech',
                token: currentSessionId, // для checkPlayer middleware
                amount: amount,
                gateway: gateway
            })
        });
        const data = await res.json();

        if (data.success && data.paymentUrl) {
            alert(_t('player.payments.deposit_redirecting'));
            // Автоматически открываем ссылку на оплату в новой вкладке браузера
            window.open(data.paymentUrl, '_blank');
        } else {
            alert(data.error || _t('player.payments.deposit_reject'));
        }
    } catch (err) {
        console.error('Deposit checkout routing crashed:', err);
        alert('Billing engine connection error.');
    }
}

async function apiWithdraw() {
    const amount = document.getElementById('withdrawAmount').value.trim();
    const gateway = document.getElementById('withdrawGateway').value;
    const walletDetails = document.getElementById('withdrawWalletDetails').value.trim();

    if (!amount || Number(amount) <= 0 || !walletDetails) {
        return alert(_t('player.payments.withdraw_invalid'));
    }

    try {
        const res = await fetch(`${CORE_SERVER}/api/player/withdraw/init`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: currentUsername, partnerId: 'demo_mtwtech', token: currentSessionId,
                amount, gateway, walletDetails
            })
        });
        const data = await res.json();

        if (data.success) {
            alert(data.message);
            document.getElementById('withdrawAmount').value = '';
            document.getElementById('withdrawWalletDetails').value = '';
            // Обновляем баланс в UI
            if (typeof updatePlayerBalanceOnUI === 'function') updatePlayerBalanceOnUI(data.balance);
        } else {
            alert(`Error: ${data.message || data.error}`);
        }
    } catch (err) { alert('Connection error during cashout request routing.'); }
}

function logoutSession() {
    location.reload();
}


function translatePage() {
    const langPackage = dynamicTranslations[currentLanguage];
    if (!langPackage) return;

    if (!window.htmlTranslationIndexed) {
        document.querySelectorAll('a, button, label, h2, h3, span, div').forEach(element => {
            const currentText = element.innerText.trim();
            if (!currentText || element.children.length > 0) return;
            const foundPath = findKeyByValue(dynamicTranslations['en'] || langPackage, currentText);
            if (foundPath) {
                element.setAttribute('data-i18n', foundPath);
            }
        });
        window.htmlTranslationIndexed = true;
    }

    // --- СТАНДАРТНЫЙ ДВИЖОК ОБНОВЛЕНИЯ ТЕКСТОВ ---
    document.querySelectorAll('[data-i18n]').forEach(element => {
        const path = element.getAttribute('data-i18n');
        const text = path.split('.').reduce((acc, part) => acc && acc[part], langPackage);
        if (text) element.innerText = text;
    });

    // Переводим плейсхолдеры в инпутах
    document.querySelectorAll('[data-i18n-placeholder]').forEach(input => {
        const path = input.getAttribute('data-i18n-placeholder');
        const placeholderText = path.split('.').reduce((acc, part) => acc && acc[part], langPackage);
        if (placeholderText) input.setAttribute('placeholder', placeholderText);
    });
}

function _t(path, fallbackText = '') {
    const langPackage = dynamicTranslations[currentLanguage];
    if (!langPackage) return fallbackText; // Если язык еще не загрузился — отдаем дефолт

    // Ищем строку по вложенным ключам (например, "auth.errors.invalid_pass")
    const translatedText = path.split('.').reduce((acc, part) => acc && acc[part], langPackage);

    return translatedText || fallbackText; // Если перевода в базе нет — отдаем fallbackText
}

// Рекурсивный помощник для поиска пути ключа по тексту (например: находит "header.links.home" по слову "Home")
function findKeyByValue(obj, targetValue, currentPath = '') {
    for (const key in obj) {
        const value = obj[key];
        const newPath = currentPath ? `${currentPath}.${key}` : key;

        if (typeof value === 'object' && value !== null) {
            const deepResult = findKeyByValue(value, targetValue, newPath);
            if (deepResult) return deepResult;
        } else if (typeof value === 'string' && value.toLowerCase() === targetValue.toLowerCase()) {
            return newPath;
        }
    }
    return null;
}


// Переключение языка игроком кликом по селектору
function changePlatformLanguage(newLang) {
    if (!dynamicTranslations[newLang]) return;
    currentLanguage = newLang;
    localStorage.setItem('platform_lang', newLang); // Запоминаем выбор в LocalStorage
    translatePage();
}

// Функция запуска WebApp, которая ждет полной готовности скрипта Дурова
function initializeTelegramEcosystemAuth() {
    // Проверяем наличие объекта WebApp
    const tg = window.Telegram ? window.Telegram.WebApp : null;

    if (tg) {
        // Сигнализируем Телеграму, что наше приложение готово к работе (расширяет окно) [INDEX]
        tg.ready();

        // Вытаскиваем initData
        const tgInitData = tg.initData;

        // Если строка пустая (такое бывает, если ты открыл сайт в обычном Chrome, а не внутри ТГ)
        if (!tgInitData) {
            console.log("ℹ️ [Telegram SDK] Платформа запущена в обычном веб-браузере. Автологин пропущен.");
            return;
        }

        console.log("🤖 [Telegram WebApp Detected] Строка initData получена. Запуск бесшовной сессии...");

        // Запускаем твой fetch-запрос авторизации
        executeTelegramBackendAuth(tgInitData);
    } else {
        console.log("ℹ️ [Telegram SDK] Объект WebApp не найден. Включен стандартный режим витрины.");
    }
}

// Вынесем сам запрос в изолированную функцию
async function executeTelegramBackendAuth(tgInitData) {
    try {
        const authRes = await fetch(`${SERVER_URL}/api/public/tg-auth`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                partnerId: 'demo_mtwtech',
                initData: tgInitData
            })
        });
        const data = await authRes.json();

        if (!data.error) {

            initSession(data);

            console.log(`✅ [Telegram Auth Success] Раунды синхронизированы. Добро пожаловать, ${currentUsername}!`);
        } else {
            console.warn("⚠️ [Telegram Auth Reject] Бэкенд отклонил подпись Телеграма:", data.message);
        }
    } catch (err) {
        console.error("❌ Критическая ошибка соединения со шлюзом tg-auth:", err);
    }
}

// Запускаем инициализацию строго после того, как DOM-структура полностью готова
window.addEventListener('DOMContentLoaded', initializeTelegramEcosystemAuth);
window.addEventListener('DOMContentLoaded', bootWhiteLabelPlatform);

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

        if (data.translations && data.langSettings) {
            dynamicTranslations = data.translations; // Сохраняем тексты из СУБД

            const supportedLangs = data.langSettings.supported_langs || ['en'];
            const defaultLang = data.langSettings.default_lang || 'en';

            let savedLang = localStorage.getItem('platform_lang');

            if (savedLang && supportedLangs.includes(savedLang)) {
                currentLanguage = savedLang;
            } else {
                currentLanguage = defaultLang;
                localStorage.setItem('platform_lang', defaultLang);
            }

            const langSelector = document.getElementById('langSelector');
            if (langSelector) {
                if (supportedLangs.length <= 1) {
                    langSelector.style.display = 'none';
                } else {
                    langSelector.style.display = 'inline-block';

                    const langOpt = {
                        en: '<option value="en">🇺🇸 EN</option>',
                        es: '<option value="es">🇪🇸 ES</option>',
                        pt: '<option value="pt">🇧🇷 PT</option>',
                        fr: '<option value="fr">🇫🇷 FR</option>',
                        de: '<option value="de">🇩🇪 DE</option>',
                        it: '<option value="it">🇮🇹 IT</option>',
                        hi: '<option value="hi">🇮🇳 HI</option>',
                        ru: '<option value="ru">🇷🇺 RU</option>',
                    };
                    // Генерируем опции выбора на лету на основе массива из базы данных
                    langSelector.innerHTML = supportedLangs.map(lang => langOpt[lang]).join('');
                    langSelector.value = currentLanguage;
                }
            }

            translatePage();
        }


        if(data.banners?.home?.length) {
            const homeBanners = data.banners?.home || [];
            const sliderContainer = document.getElementById('sliderContainer');
            const dotsContainer = document.getElementById('sliderDotsContainer');

            if (sliderContainer && dotsContainer && homeBanners.length > 0) {

                // Генерируем HTML слайдов на основе URL картинок и ссылок из админки
                // sliderContainer.innerHTML = homeBanners.map((b, index) => {
                //     // Извлекаем чистый эндпоинт клика (например, 'casino' или 'sport') для поддержки навигации твоей витрины
                //     const targetView = b.click_url.replace('/', '');
                //     const clickAction = targetView ? `toggleView('${targetView}')` : `alert('Campaign link registered!')`;
                //
                //     return `
                //     <div class="slide-item" style="background-image: linear-gradient(135deg, rgba(13,16,23,0.92) 0%, rgba(13,17,23,0.7) 100%), url('${b.image_url}'); border-left: 5px solid var(--accent-pink);">
                //         <div class="slide-content">
                //             <h2>${_t('home.slider.banners.title', `Dynamic Campaign Node #${index + 1}`)}</h2>
                //             <p>${_t('home.slider.banners.description', 'Exclusive limited offer deployed by administration for domain layout tracking. Tap button to unlock event arena routing map.')}</p>
                //             <button class="btn-primary" onclick="${clickAction}">${_t('home.slider.banners.button', 'Launch Event')}</button>
                //         </div>
                //     </div>
                // `;
                // }).join('');

                // Генерируем HTML слайдов на основе URL картинок и ссылок из админки
                sliderContainer.innerHTML = homeBanners.map((b, index) => {
                    // Извлекаем чистый эндпоинт клика (например, 'casino' или 'sport') для поддержки навигации твоей витрины
                    const targetView = b.click_url ? b.click_url.replace('/', '') : '';
                    const clickAction = targetView ? `toggleView('${targetView}')` : `alert('Campaign link registered!')`;

                    // Безопасно получаем переводы с гарантированным дефолтным текстом
                    const titleText = _t('home.slider.key_100') || `Dynamic Campaign Node #${index + 1}`;
                    const descText = _t('home.slider.key_89') || 'Exclusive limited offer deployed by administration for domain layout tracking. Tap button to unlock event arena routing map.';
                    const btnText = _t('home.slider.key_90') || 'Launch Event';

                    return `
                        <div class="slide-item" style="background-image: linear-gradient(135deg, rgba(13,16,23,0.92) 0%, rgba(13,17,23,0.7) 100%), url('${b.image_url}'); border-left: 5px solid var(--accent-pink);">
                            <div class="slide-content">
                                <h2>${titleText}</h2>
                                <p>${descText}</p>
                                <button class="btn-primary" onclick="${clickAction}">${btnText}</button>
                            </div>
                        </div>
                    `;
                }).join('');


                // Генерируем HTML навигационных точек (dots) строго по количеству баннеров
                dotsContainer.innerHTML = homeBanners.map((_, index) => `
                <div class="slider-dot ${index === 0 ? 'active' : ''}" id="mtw_dot_${index}" onclick="moveSlide(${index})"></div>
            `).join('');

                // Сбрасываем счетчик и запускаем цикл автоматического перелистывания слайдера
                currentSlideIdx = 0;
                startSliderAutoCycle(homeBanners.length);
            }
        }

        if (data.settings && data.settings.gateways) {
            const gtw = data.settings.gateways;

            // Проверяем селекты депозита и вывода, если они есть на странице
            ['depositGateway', 'withdrawGateway'].forEach(selectId => {
                const selectEl = document.getElementById(selectId);
                if (selectEl) {
                    // Перебираем все option внутри select и скрываем те, что отключены админом
                    Array.from(selectEl.options).forEach(opt => {
                        if (gtw[opt.value] === false) {
                            opt.style.display = 'none'; // Скрываем платежку
                            opt.disabled = true;
                        } else {
                            opt.style.display = 'block';
                            opt.disabled = false;
                        }
                    });

                    // Сбрасываем выбранный дефолтный элемент на первый видимый
                    const firstVisible = Array.from(selectEl.options).find(o => o.style.display !== 'none');
                    if (firstVisible) selectEl.value = firstVisible.value;
                }
            });
        }

    } catch (err) {
        console.error('Ecosystem boot collapsed:', err);
    }
}

async function loadPlayerGamificationStats() {
    try {
        const res = await fetch(`${CORE_SERVER}/api/player/stats`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: currentUsername, partnerId: 'demo_mtwtech', token: currentSessionId })
        });
        const data = await res.json();

        if (data.success) {
            // А. Рендерим Уровень и прогресс-бар XP игрока
            document.getElementById('lk-player-level-badge').innerText = `${_t('player.info.level')}: ${data.level}`;
            document.getElementById('lk-player-xp-text').innerText = `${data.xp} / ${data.nextLevelXp} XP`;
            document.getElementById('lk-player-xp-bar').style.width = `${data.xpPct}%`;

            // Б. Управляем интерфейсом Кланов
            const activePane = document.getElementById('lk-clan-active-pane');
            const joinPane = document.getElementById('lk-clan-join-pane');

            // [ВСТАВИТЬ ВНУТРЬ loadPlayerGamificationStats ПОСЛЕ ОБРАБОТКИ КЛАНОВ]
            const badgesGrid = document.getElementById('lk-badges-grid');

            if (badgesGrid && data.achievements) {
                if (data.achievements.length === 0) {
                    badgesGrid.innerHTML = `<div style="grid-column:1/-1; color:var(--text-muted); font-size:12px; padding:10px 0;">No trophies minted by server</div>`;
                } else {
                    badgesGrid.innerHTML = data.achievements.map(ach => {
                        // Если ачивка заблокирована — делаем ее черно-белой и прозрачной
                        const isUnlocked = ach.is_unlocked;
                        const filterStyle = isUnlocked ? 'filter: drop-shadow(0 0 6px var(--accent-yellow));' : 'filter: grayscale(1) opacity(0.25);';
                        const borderStyle = isUnlocked ? 'border-color: rgba(255, 183, 3, 0.4); background: rgba(255, 183, 3, 0.04);' : 'border-color: #1a1e26;';

                        // Локализуем статус "Completed"
                        const progressText = isUnlocked ? `✅ ${_t('player.achievements.completed')}` : `${Math.floor(ach.current_value)} / ${Math.floor(ach.target_value)}`;

                        return `
                <div class="badge-item" style="border: 1px solid; ${borderStyle} padding: 10px 5px; border-radius: 6px; display: flex; flex-direction: column; align-items: center; justify-content: center; position: relative; transition: all 0.2s ease;" title="${ach.description}">
                    <!-- Иконка значка (эмодзи) -->
                    <span style="font-size: 26px; margin-bottom: 4px; ${filterStyle}">${ach.badge_icon}</span>
                    
                    <!-- Короткое имя ачивки -->
                    <b style="font-size: 11px; color: ${isUnlocked ? '#fff' : 'var(--text-muted)'}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; width: 100%; display: block;">${ach.title}</b>
                    
                    <!-- Цифровой прогресс мелким шрифтом -->
                    <span style="font-size: 9px; color: var(--text-muted); font-family: monospace; margin-top: 3px; display: block; white-space: nowrap;">${progressText}</span>
                </div>
            `;
                    }).join('');
                }
            }


            if (data.clan) {
                // Игрок состоит в клане
                joinPane.style.display = 'none';
                activePane.style.display = 'block';
                document.getElementById('lk-my-clan-name').innerText = data.clan.name;
                document.getElementById('lk-my-clan-level').innerText = `${_t('player.guild.level')}${data.clan.level}`;

                // Выводим командный квест клана
                const qBox = document.getElementById('lk-clan-quest-box');
                if (data.clanQuest) {
                    qBox.style.display = 'block';
                    document.getElementById('lk-cq-title').innerText = data.clanQuest.title;
                    document.getElementById('lk-cq-progress-text').innerText = `${data.clanQuest.current.toFixed(0)} / ${data.clanQuest.target} 🪙`;
                    document.getElementById('lk-cq-pct').innerText = `${data.clanQuest.pct}%`;
                    document.getElementById('lk-cq-bar').style.width = `${data.clanQuest.pct}%`;
                    document.getElementById('lk-cq-reward-text').innerText = `${_t('player.guild.pool_reward')}: ${data.clanQuest.reward} ${_t('player.guild.split')}`;
                } else {
                    qBox.style.display = 'none'; // Нет активного квеста
                }
            } else {
                // У игрока нет клана
                activePane.style.display = 'none';
                joinPane.style.display = 'flex';

                // Подгружаем список публичных кланов в селект для вступления
                loadPublicClansSelectOptions();
            }
        }
    } catch (err) { console.error('Gamification layout update crashed:', err); }
}

async function loadPublicClansSelectOptions() {
    try {
        const res = await fetch(`${CORE_SERVER}/api/player/clan/list?partnerId=demo_mtwtech`);
        const data = await res.json();
        const select = document.getElementById('lk-public-clans-select');
        if (select && data.success && data.clans) {
            if (data.clans.length === 0) {
                select.innerHTML = `<option value="">${_t('player.guild.no_active')}</option>`;
                return;
            }
            select.innerHTML = data.clans.map(c => `<option value="${c.id}">${c.clan_name} (${_t('player.guild.level')}${c.clan_level}) — Owner: ${c.owner_username}</option>`).join('');
        }
    } catch (err) { console.error(err); }
}


async function apiCreatePlayerClan() {
    const nameInput = document.getElementById('lk-new-clan-name-input');
    const name = nameInput.value.trim();
    if (!name) return alert(_t('player.guild.create_name_invalid'));

    showLoader();
    try {
        const res = await fetch(`${CORE_SERVER}/api/player/clan/create`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: currentUsername, partnerId: 'demo_mtwtech', token: currentSessionId, clanName: name })
        });
        const data = await res.json();
        if (res.ok && data.success) {
            alert(`Syndicate "${name}" ${_t('player.guild.create_success')}`);
            nameInput.value = '';
            loadPlayerGamificationStats(); // Перерисовываем блок
        } else { alert(data.error || 'Failed to create clan'); }
    } catch (err) { console.error(err); }
    finally { hideLoader(); }
}

async function apiJoinPlayerClan() {
    const select = document.getElementById('lk-public-clans-select');
    const clanId = select.value;
    if (!clanId) return alert(_t('player.guild.join_select_invalid'));

    showLoader();
    try {
        const res = await fetch(`${CORE_SERVER}/api/player/clan/join`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: currentUsername, partnerId: 'demo_mtwtech', token: currentSessionId, clanId })
        });
        if (res.ok) {
            alert(_t('player.guild.join_success'));
            loadPlayerGamificationStats();
        } else { alert('Failed to join selected clan array'); }
    } catch (err) { console.error(err); }
    finally { hideLoader(); }
}



// Инициализация при загрузке документа
window.addEventListener('DOMContentLoaded', bootWhiteLabelPlatform);


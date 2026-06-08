// Подключаемся к вашему модульному серверу Node.js

const baseUrl = (location.hostname === 'localhost') ? 'http://localhost:3000' : 'https://mtw-gw.onrender.com';
const baseUrlApi = baseUrl + '/api';

const socket = io(baseUrl);

// Единые глобальные переменные состояния игры на клиенте
let currentUser = null;
let currentBalance = 0;
let jackpot = 1000;
let serverConfig = null; // Здесь будут храниться цены и настройки с сервера
let currentTab = 'lobby';

let isDrawing = false;

// Элементы интерфейса (общие для всех вкладок)
const usernameLabel = document.getElementById('usernameLabel');
const balanceLabel = document.getElementById('balanceLabel');
const authBtn = document.getElementById('authBtn');
const jackpotLabel = document.getElementById('jackpotLabel');

// Элемент общей ленты истории (создаем один раз внизу страницы)
const tabsContainer = document.querySelector('.tabs-container');
const globalHistoryDiv = document.createElement('div');
globalHistoryDiv.id = 'globalHistoryBox';
globalHistoryDiv.style.cssText = "margin-top: 25px; border-top: 1px solid #393e46; padding-top: 15px; text-align: left; max-height: 200px; overflow-y: auto;";
document.body.appendChild(globalHistoryDiv);

const gameTabs = ['lottery','scratch','slots3x3','slots5x3','wof','mines','crash','dice','hilo','blackjack','holdem','roulette'];

// --- Табы / Переключение вкладок ---
function changeTab(tab) {
    if(tab) {
        document.getElementById('lobby').style.display = 'none';
        document.getElementById('backToLobbyBtn').style.display = 'block';

        gameTabs.forEach(t => {
            const element = document.getElementById(t);
            const tabBtn = document.getElementById('tab_' + t);
            if (!element) return;

            if (tab === t) {
                element.style.display = 'block';
                if (tabBtn) tabBtn.classList.add('selected');
            } else {
                element.style.display = 'none';
                if (tabBtn) tabBtn.classList.remove('selected');
            }
        });
        currentTab = tab;

        // При переключении вкладок обновляем общую историю, если игрок залогинен
        if (currentUser) loadGeneralHistory();
    }
    else {
        gameTabs.forEach(t => {
            const element = document.getElementById(t);
            if(element) element.style.display = 'none';
        });
        document.getElementById('lobby').style.display = 'block';
        document.getElementById('backToLobbyBtn').style.display = 'none';
    }
}
window.goToLobby = function() {
    gameTabs.forEach(t => {
        const element = document.getElementById(t);
        if(element) element.style.display = 'none';
    });
    document.getElementById('lobby').style.display = 'block';
    document.getElementById('backToLobbyBtn').style.display = 'none';
};

// --- Функция обновления шапки профиля ---
function updateUIProfile() {
    if (currentUser) {
        if (usernameLabel) usernameLabel.innerText = currentUser;
        if (balanceLabel) balanceLabel.innerText = currentBalance;
        if (authBtn) authBtn.innerText = "Logout";
    } else {
        if (usernameLabel) usernameLabel.innerText = "Guest";
        if (balanceLabel) balanceLabel.innerText = "0";
        if (authBtn) authBtn.innerText = "Login";
    }
}

function updateJackpotUI() {
    if (jackpotLabel) jackpotLabel.innerText = jackpot;
}

// --- СЕРВЕРНАЯ АВТОРИЗАЦИЯ (REST API) ---
async function handleAuth() {
    if (currentUser) {
        // Разлогин
        currentUser = null;
        currentBalance = 0;
        serverConfig = null;
        updateUIProfile();
        clearAllGamesUI(); // функция сброса полей (очистка билетов, слотов и т.д.)
        renderGeneralHistory([]); // очищаем историю на экране
    } else {
        // Логин
        const name = prompt("Enter your login (letters, numbers, underscores only):", "Player_1");
        if (!name) return;

        try {
            const response = await fetch(baseUrlApi + '/auth', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: name, partnerId: globalPartnerId })
            });
            const data = await response.json();

            if (data.error) return alert(data.error);

            // Сохраняем данные, присланные сервером
            currentUser = data.username;
            currentBalance = data.balance;
            jackpot = data.jackpot;
            serverConfig = data.config; // сохраняем цены и пулы символов бэкенда

            // Подключаем вебсокет к персональной комнате игрока на сервере для личных уведомлений
            socket.emit('join_game', currentUser);

            updateUIProfile();
            updateJackpotUI();
            applyServerConfigToUI(); // Подстраиваем цены на кнопках под сервер
            loadGeneralHistory();   // Скачиваем историю действий из базы данных

            if (typeof updateBetButtonState === 'function') updateBetButtonState();
        } catch (err) {
            console.error("Auth error:", err);
            alert("Server connection failed. Is Node.js running?");
        }
    }
}

// Автоматическая подстройка цен на кнопках интерфейса под конфиг бэкенда
function applyServerConfigToUI() {
    if (!serverConfig) return;

    // Пример динамического изменения ценников на кнопках (проверьте id ваших кнопок/лейблов)
    const slotsLabel = document.getElementById('slotsCostLabel');
    if (slotsLabel) slotsLabel.innerText = serverConfig.slots3x3.cost;

    const wofLabel = document.getElementById('wofCostLabel');
    if (wofLabel) wofLabel.innerText = serverConfig.wheel.cost;

    const scratchLabel = document.getElementById('scratchCostLabel');
    if (scratchLabel) scratchLabel.innerText = serverConfig.scratch.cost;
}

// --- ЗАПРОС ЕДИНОЙ ЛЕНТЫ ИСТОРИИ ИЗ БАЗЫ ДАННЫХ ---
async function loadGeneralHistory() {
    if (!currentUser) return;
    try {
        const response = await fetch(baseUrlApi + '/player/history', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: currentUser, partnerId: globalPartnerId })
        });
        const data = await response.json();
        if (data.history) {
            renderGeneralHistory(data.history);
        }
    } catch (err) {
        console.error("Failed to load history from server:", err);
    }
}

// Отрисовка единой ленты истории на экране мобилки
function renderGeneralHistory(historyArray) {
    if (!historyArray || historyArray.length === 0) {
        globalHistoryDiv.innerHTML = '<p style="color:#888; font-size:12px; text-align:center;">Activity history is empty</p>';
        return;
    }

    let html = '<b style="font-size:14px; color:#e94560;">📜 Recent Activity (All Games):</b><br>';
    historyArray.forEach(item => {
        // Подсвечиваем выигрыши зеленым, проигрыши или траты — обычным цветом
        const isWin = item.win || item.change.includes('+');
        const changeColor = isWin ? '#4ecca3' : '#8a8ab0';

        html += `<div style="font-size:12px; margin-bottom:5px; background:rgba(15, 52, 96, 0.4); padding:6px; border-radius:6px; border-left: 3px solid ${isWin ? '#4ecca3' : '#e94560'}">
                <span style="color:#888">[${item.time}]</span> <b>${item.game}</b>: ${item.details} 
                <span style="float:right; color:${changeColor}; font-weight:bold;">${item.change}</span>
            </div>`;
    });
    globalHistoryDiv.innerHTML = html;
}

function clearAllGamesUI() {
    if (typeof clearCurrentTicketsUI === 'function') clearCurrentTicketsUI();
    const resultBox = document.getElementById('resultBox');
    if (resultBox) resultBox.innerText = "Please login to start playing.";
}

// --- СЛУШАЕМ СЕРВЕР ЧЕРЕЗ ВЕБСОКЕТЫ (Постоянный живой поток пакетов) ---
socket.on('timer_update', (data) => {
    jackpot = data.jackpot;
    updateJackpotUI();

    // Каждую секунду бэкенд шлет время до тиража лотереи.
    // Если функция отображения лотерейного таймера существует — скармливаем время ей.
    if (typeof updateLotteryTimerUI === 'function') {
        updateLotteryTimerUI(data.timeLeft);
    }
});



let globalSessionId = null;
let globalPartnerId = 'demo_mtwtech';

// Функция парсинга параметров из ссылки (?game=mines&session_id=123)
function getUrlParams() {
    const params = {};
    const queryString = window.location.search;
    const urlParams = new URLSearchParams(queryString);

    if(urlParams.has('game')) params.game = urlParams.get('game');
    if(urlParams.has('sessionId')) params.sessionId = urlParams.get('sessionId');
    if(urlParams.has('partnerId')) params.partnerId = urlParams.get('partnerId');
    return params;
}

function handleUrlRoutingAndStart() {
    const urlParams = getUrlParams();

    // МГНОВЕННЫЙ РОУТИНГ: Если в ссылке указана игра, сразу изолируем её на экране
    if (urlParams.game && gameTabs.includes(urlParams.game)) {
        // Переключаем табы моментально до выполнения сетевых запросов
        changeTab(urlParams.game);
    }
    else {
        changeTab('');
    }

    console.log(urlParams);
    // Если передан токен сессии, запускаем асинхронный бесшовный логин
    if (urlParams.sessionId && urlParams.partnerId) {
        globalSessionId = urlParams.sessionId;
        globalPartnerId = urlParams.partnerId;
        initSeamlessGame(globalSessionId, globalPartnerId);
    } else {
        // Если сессии нет — просто обновляем интерфейс для гостя
        updateUIProfile();
    }
}

// Вспомогательная функция, чтобы игрок не успел нажать кнопку «Ставка» до того, как бэкенд подгрузит его реальный баланс
function toggleAllGameButtons(disabledStatus) {
    const allActionButtons = [
        document.getElementById('betBtn'),       // Лотерея
        document.getElementById('spinBtn'),      // Слоты
        document.getElementById('spinBtnWof'),   // Колесо
        document.getElementById('buyBtn'),       // Скретч
        document.getElementById('minesStartBtn'),// Минёр
        document.getElementById('crashActionBtn')// Авиатор
    ];
    allActionButtons.forEach(btn => {
        if (btn) btn.disabled = disabledStatus;
    });
}

// 4. АСИНХРОННЫЙ СИМЛЕСС ЛОГИН ПРИ ЗАГРУЗКЕ В IFRAME
async function initSeamlessGame(sessionId, partnerId) {
    try {
        // Блокируем кнопки ставок во всех играх, пока идет проверка баланса на бэкенде
        toggleAllGameButtons(true);

        const response = await
            fetch(`${baseUrlApi}/auth/seamless`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId, partnerId })
        });
        const data = await response.json();

        if (data.error) {
            console.error("Seamless login failed:", data.error);
            // Красиво выводим ошибку вместо лобби или поверх открытой игры
            document.getElementById('lobby').innerHTML = `<h3 style="color:#e94560; text-align:center;">Session Expired: ${data.error}</h3>`;
            return;
        }

        // Успешный бесшовный вход с платформы казино!
        currentUser = data.username;
        currentBalance = data.balance;
        jackpot = data.jackpot;
        serverConfig = data.config;

        // Подключаем живые вебсокеты для таймеров
        socket.emit('join_game', currentUser);

        // Синхронизируем шапку WebApp
        updateUIProfile();
        updateJackpotUI();
        if (typeof applyServerConfigToUI === 'function') applyServerConfigToUI();

        // Разблокируем кнопки игр — баланс подгружен, игрок готов ставить монеты
        toggleAllGameButtons(false);
        if (typeof updateBetButtonState === 'function') updateBetButtonState();

    } catch (err) {
        console.error("Seamless connection error:", err);
        toggleAllGameButtons(true);
    }
}



// ЗАПУСК СИСТЕМЫ: Выполняется мгновенно при чтении скрипта
handleUrlRoutingAndStart();
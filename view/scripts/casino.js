// Глобальный стейт приложения для управления роутингом и лобби
let currentSlideIdx = 0;
let partnerId = 'demo_mtwtech';
let sessionId = null;
let currentMainTab = 'collections'; // collections, categories, providers
let activeSubFilter = null; // Конкретный slug коллекции, категории или провайдера

// Списки данных, загружаемые с бэкенда
let partnerCollections = [];
let allCategories = [];
let allProviders = [];

// 1. ИНИЦИАЛИЗАЦИЯ И ОБРАБОТКА URL (Пункт 7)
window.addEventListener('DOMContentLoaded', async () => {
    // Парсим параметры из URL-строки браузера
    const urlParams = new URLSearchParams(window.location.search);

    // Забираем partnerId и sessionId. Если в URL пусто, ищем в localStorage
    partnerId = urlParams.get('partnerId') || localStorage.getItem('partnerId') || 'demo_mtwtech';
    sessionId = urlParams.get('sessionId') || urlParams.get('token') || localStorage.getItem('sessionId');

    localStorage.setItem('partnerId', partnerId);
    if (sessionId) localStorage.setItem('sessionId', sessionId);

    // Читаем прямые ссылки из URL на игры, категории или провайдеров
    const urlGame = urlParams.get('game');
    const urlCategory = urlParams.get('category');
    const urlProvider = urlParams.get('provider');

    // Предзагружаем базовые данные для табов
    await initLobbyData();

    // Маршрутизация при загрузке страницы
    if (urlGame) {
        // Пункт 6: Если в URL указана конкретная игра — сразу запускаем её iFrame
        launchGame(urlGame);
    } else if (urlCategory) {
        switchMainTab('categories');
        selectSubFilter(urlCategory);
    } else if (urlProvider) {
        switchMainTab('providers');
        selectSubFilter(urlProvider);
    } else {
        // Пункт 7: Если ничего нет — открываем коллекции по умолчанию
        // switchMainTab('collections');
        switchLobbyMode('lobby');
    }

    // Запускаем автопереключение промо-слайдера
    initSliderInterval();
});

// Загрузка списков с Postgres бэкенда (Пункт 1)
// Исправленная функция загрузки метаданных лобби
async function initLobbyData() {
    try {
        // 1. Загружаем коллекции партнера
        const collRes = await fetch(`${baseUrlApi}/catalog/collections?partnerId=${partnerId}`);
        const collData = await collRes.json();
        if (collData.success) partnerCollections = collData.collections;

        // 2. Загружаем все уникальные категории
        const catRes = await fetch(`${baseUrlApi}/catalog/categories`);
        const catData = await catRes.json();
        if (catData.success) allCategories = catData.categories;

        // 3. ИСПРАВЛЕНО: Загружаем уникальных провайдеров напрямую через твой новый API-роут!
        const provRes = await fetch(`${baseUrlApi}/catalog/providers`);
        const provData = await provRes.json();
        if (provData.success) allProviders = provData.providers;

    } catch (err) {
        console.error("❌ Failed to initialize lobby metadata keys:", err.message);
    }
}

// Изменение выбора подкатегорий и загрузки игр
async function selectSubFilter(subId) {
    activeSubFilter = subId;

    // Перерисовываем табы, чтобы подсветить выбранную кнопку в горизонтальной ленте
    renderSubTabBar();

    let url = '';
    // ИСПРАВЛЕНО: Теперь для провайдеров тоже шлем прямой отфильтрованный запрос к Postgres бэкенду
    if (currentMainTab === 'collections') url = `${baseUrlApi}/catalog/collection/${subId}?partnerId=${partnerId}&limit=30`;
    if (currentMainTab === 'categories') url = `${baseUrlApi}/catalog/category/${subId}?partnerId=${partnerId}&limit=30`;
    if (currentMainTab === 'providers') url = `${baseUrlApi}/catalog/collections?partnerId=${partnerId}&provider=${subId}&limit=30`;

    try {
        const response = await fetch(url);
        const result = await response.json();

        let games = [];
        if (currentMainTab === 'providers') {
            // Если мы передали фильтр провайдера в эндпоинт getPartnerGamesCatalog (который мы написали в Postgres-версии),
            // бэкенд сам вернет отфильтрованный массив игр этого провайдера!

            // Если вы используете общий эндпоинт коллекций, оставляем легкую фильтрацию,
            // но если обновили метод в state.js — забираем напрямую:
            const set = new Set();
            result.collections?.forEach(c => c.games.forEach(g => { if(g.provider === subId) set.add(JSON.stringify(g)); }));
            games = result.games ? result.games : Array.from(set).map(s => JSON.parse(s));
        } else {
            games = result.games || [];
        }

        renderGamesGrid(games);
    } catch (err) {
        console.error("❌ Failed to render subset filter games:", err.message);
    }
}


// 2. ПЕРЕКЛЮЧАТЕЛЬ ПОД СЛАЙДЕРОМ (Пункт 2)
function switchMainTab(tabName) {
    currentMainTab = tabName;
    activeSubFilter = null; // Сбрасываем подфильтры

    // Подсвечиваем активный селектор на фронтенде
    document.querySelectorAll('.game-tab').forEach(el => el.classList.remove('selected'));
    const activeTabEl = document.getElementById(`tab-${tabName}`);
    if (activeTabEl) activeTabEl.classList.add('selected');

    // Отрисовываем горизонтальный скролл-бар кнопок (Пункты 3, 4, 5)
    renderSubTabBar();

    // Очищаем или сбрасываем сетку игр до выбора подкатегории
    document.getElementById('lobbyGamesGrid').innerHTML = '<p style="color:#a0a5b5; padding:20px;">Select an option above to load games...</p>';

    // Автоматический выбор первого элемента для удобства
    // if (tabName === 'collections' && partnerCollections.length > 0) selectSubFilter(partnerCollections[0].slug);
    // if (tabName === 'categories' && allCategories.length > 0) selectSubFilter(allCategories[0]);
    // if (tabName === 'providers' && allProviders.length > 0) selectSubFilter(allProviders[0]);

    // Автоматический выбор первого элемента для отрисовки игр при клике на главный Таб
    if (tabName === 'collections' && partnerCollections.length > 0) {
        selectSubFilter(partnerCollections[0].slug); // Исправлено: берем slug первой коллекции
    }
    if (tabName === 'categories' && allCategories.length > 0) {
        selectSubFilter(allCategories[0]); // ИСПРАВЛЕНО: берем первую строку из массива категорий
    }
    if (tabName === 'providers' && allProviders.length > 0) {
        selectSubFilter(allProviders[0]); // Исправлено: берем первого провайдера
    }

}

// Рендеринг горизонтального подменю кнопок (Пункты 3, 4, 5)
function renderSubTabBar() {
    const container = document.getElementById('subTabsContainer');
    if (!container) return;
    container.innerHTML = '';

    let items = [];
    if (currentMainTab === 'collections') items = partnerCollections.map(c => ({ id: c.slug, label: c.name }));
    if (currentMainTab === 'categories') items = allCategories.map(c => ({ id: c, label: '🎰 ' + c.toUpperCase() }));
    if (currentMainTab === 'providers') items = allProviders.map(p => ({ id: p, label: '🔌 ' + p }));

    items.forEach(item => {
        const btn = document.createElement('button');
        btn.className = `lobby-cat-btn ${activeSubFilter === item.id ? 'active' : ''}`;
        btn.innerText = item.label;
        btn.onclick = () => selectSubFilter(item.id);
        container.appendChild(btn);
    });
}

// Отрисовка карточек игр в сетку (С поддержкой ДЕМО и РЕАЛ кнопок)
// function renderGamesGrid(games) {
//     const grid = document.getElementById('lobbyGamesGrid');
//     if (!grid) return;
//
//     if (games.length === 0) {
//         grid.innerHTML = '<p style="color:#a0a5b5; padding:20px;">No active games found in this partition.</p>';
//         return;
//     }
//
//     grid.innerHTML = games.map(game => `
//         <div class="game-card">
//             <div class="game-icon" style="font-size: 32px; margin-bottom: 8px;">${getGameIcon(game.slug)}</div>
//             <h3 style="font-size: 15px; margin-bottom: 8px;">${game.name}</h3>
//             <span style="font-size: 11px; color:#a0a5b5; display:block; margin-bottom:10px;">${game.provider}</span>
//             <div style="display:flex; gap:6px; justify-content:center;">
//                 <button class="login-btn" style="padding:4px 8px; font-size:12px;" onclick="launchGame('${game.slug}', false)">Real</button>
//                 ${game.has_demo ? `<button class="tab-btn" style="padding:4px 8px; font-size:12px; background:#3a4150; color:#fff;" onclick="launchGame('${game.slug}', true)">Demo</button>` : ''}
//             </div>
//         </div>
//     `).join('');
// }

// 3. ОТКРЫТИЕ ИГРЫ В IFRAME И СКРЫТИЕ СЛАЙДЕРА (Пункт 6)
async function launchGame(gameSlug, isDemo = false) {
    try {
        const response = await fetch(`${baseUrlApi}/game/${gameSlug}/launch`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                partnerId: partnerId,
                sessionId: isDemo ? null : sessionId,
                isDemo: isDemo,
                theme: 'dark'
            })
        });

        const result = await response.json();

        if (!result.success || !result.iframeUrl) {
            alert(`Launch Error: ${result.error || 'Access denied'}`);
            return;
        }

        // СКРЫВАЕМ СЛАЙДЕР И ЛОББИ, чтобы не мешали игре (Пункт 6)
        document.querySelector('.promo-slider').style.display = 'none';
        document.getElementById('section-home').style.display = 'none';

        // Разворачиваем iFrame игры на странице в специальный выделенный контейнер
        const iframeContainer = document.getElementById('iframePlayZone');
        const iframe = document.getElementById('activeGameIframe');

        iframe.src = result.iframeUrl;
        iframeContainer.style.display = 'block';

        // Прокручиваем экран наверх к игре
        window.scrollTo({ top: 0, behavior: 'smooth' });

        console.log(`🚀 Game session successfully opened via token layer: ${gameSlug}`);
    } catch (err) {
        console.error("❌ Game launch execution crashed:", err.message);
    }
}

// Переключатель режимов лобби (Главная, Категории, Провайдеры)
async function switchLobbyMode(mode) {
    currentMainTab = mode;
    activeSubFilter = null;

    // Подсвечиваем главные табы
    document.querySelectorAll('.game-tab').forEach(el => el.classList.remove('selected'));
    const tabMapping = { 'lobby': 'tab-lobby', 'categories': 'tab-categories', 'providers': 'tab-providers' };
    if (tabMapping[mode]) document.getElementById(tabMapping[mode]).classList.add('selected');

    const subTabs = document.getElementById('subTabsContainer');
    const lobbyContainer = document.getElementById('lobbyCollectionsContainer');

    if (mode === 'lobby') {
        // СКРЫВАЕМ панель подфильтров, так как коллекции идут сразу все вместе подряд (Пункт 3)
        if (subTabs) subTabs.style.display = 'none';

        // Отрисовываем горизонтальные ленты коллекций сверху вниз
        renderLobbyCollections();
    } else {
        // ПОКАЗЫВАЕМ панель подфильтров для Категорий или Провайдеров (Пункты 4, 5)
        if (subTabs) subTabs.style.display = 'flex';
        renderSubTabBar();

        lobbyContainer.innerHTML = '<p style="color:#a0a5b5; padding:20px; text-align:center;">Выберите опцию выше для загрузки игр...</p>';

        // Автовыбор первого элемента для отображения
        if (mode === 'categories' && allCategories.length > 0) selectSubFilter(allCategories[0]);
        if (mode === 'providers' && allProviders.length > 0) selectSubFilter(allProviders[0]);
    }
}

// РЕНДЕРИНГ ЛОББИ: Списки коллекций идут подряд, игры скроллятся горизонтально (Пункт 3)
function renderLobbyCollections() {
    const container = document.getElementById('lobbyCollectionsContainer');
    if (!container) return;

    if (partnerCollections.length === 0) {
        container.innerHTML = '<p style="color:#a0a5b5; padding:20px; text-align:center;">Коллекции партнера пусты или не загружены.</p>';
        return;
    }

    // Собираем HTML-блоки: каждый блок — это заголовок коллекции + скролл-лента карточек игр внутри
    container.innerHTML = partnerCollections.map(col => `
        <div class="collection-block">
            <div class="collection-title">${col.name}</div>
            <div class="horizontal-games-scroll">
                ${col.games.map(game => `
                    <div class="game-card">
                        <div class="game-icon" style="font-size: 32px; margin-bottom: 6px;">${getGameIcon(game)}</div>
                        <h3 style="font-size: 14px; margin-bottom: 6px; line-height: 1.2;">${game.name}</h3>
                        <span style="font-size: 11px; color:#a0a5b5; display:block; margin-bottom:10px;">${game.provider}</span>
                        <div style="display:flex; gap:4px; width:100%; justify-content:center; margin-top:auto;">
                            <button class="login-btn" style="padding:4px 10px; font-size:12px; flex:1;" onclick="launchGame('${game.slug}', false)">Real</button>
                            <button class="tab-btn" style="padding:4px 6px; font-size:12px; background:#3a4150; color:#fff; margin:0;" onclick="launchGame('${game.slug}', true)">Demo</button>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
    `).join('');
}

// Модифицированный метод загрузки игр из подфильтров Категорий и Провайдеров (Пункты 4, 5)
// Перестраивает лобби обратно в стандартную вертикальную сетку (Плитку)
function renderGamesGrid(games) {
    const container = document.getElementById('lobbyCollectionsContainer');
    if (!container) return;

    if (games.length === 0) {
        container.innerHTML = '<p style="color:#a0a5b5; padding:20px; text-align:center;">Игры в данном разделе отсутствуют.</p>';
        return;
    }

    // Возвращаем стандартный плоский вид CSS-сетки для выбранной категории
    container.innerHTML = `
        <div class="games-grid" style="grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 15px; width:100%;">
            ${games.map(game => `
                <div class="game-card">
                    <div class="game-icon" style="font-size: 32px; margin-bottom: 8px;">${getGameIcon(game)}</div>
                    <h3 style="font-size: 14px; margin-bottom: 6px;">${game.name}</h3>
                    <span style="font-size: 11px; color:#a0a5b5; display:block; margin-bottom:10px;">${game.provider}</span>
                    <div style="display:flex; gap:6px; width:100%; justify-content:center; margin-top:auto;">
                        <button class="login-btn" style="padding:4px 10px; font-size:12px; flex:1;" onclick="launchGame('${game.slug}', false)">Real</button>
                        <button class="tab-btn" style="padding:4px 6px; font-size:12px; background:#3a4150; color:#fff; margin:0;" onclick="launchGame('${game.slug}', true)">Demo</button>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

// Внутри обработчика window.loaded (Пункт 7) обязательно замените стартовый вызов:
// БЫЛО: switchMainTab('collections');
// СТАЛО: switchLobbyMode('lobby');


// Метод закрытия iFrame игры и возврата слайдера/лобби на место
function closeActiveGame() {
    document.getElementById('iframePlayZone').style.display = 'none';
    document.getElementById('activeGameIframe').src = '';

    // ВОЗВРАЩАЕМ СЛАЙДЕР И ЛОББИ обратно (Пункт 6)
    document.querySelector('.promo-slider').style.display = 'block';
    document.getElementById('section-home').style.display = 'block';
}

// Справочник иконок по слагам для красоты сетки
function getGameIcon(game) {
    if(game.image) {
        return `<img src="${game.image}">`;
    }
    const icons = {
        'crash-aviator': '🚀',
        '5-min-lottery': '🎰',
        'mines-sweeper': '💣',
        'dice-roll': '🎲',
        'hi-lo-card': '📈',
        'blackjack': '🎩',
        'holdem': '👑',
        'wheel-of-fortune': '🎡',
        'roulette': '🎡',
        'classic-slots': '🎰',
        '5x3-slots': '🍒',
        'naruto-shinobi': '🥷',
        'scratch-cards': '🎫'
    };
    return icons[game.slug] || '🎮';
}

// -------------------------------------------------------------------------
// 🏙️ ЛОГИКА УПРАВЛЕНИЯ ПРОМО-СЛАЙДЕРОМ БАННЕРОВ
// -------------------------------------------------------------------------

// Метод ручного переключения слайда по клику на точку навигации
function moveSlide(idx) {
    currentSlideIdx = idx;
    const container = document.getElementById('sliderContainer');

    // Сдвигаем flex-контейнер влево на нужный шаг (33.333% для 3-х слайдов)
    if (container) {
        container.style.transform = `translateX(-${idx * 33.333}%)`;
    }

    // Переключаем класс визуального выделения (active) для точек пагинации
    const dots = document.querySelectorAll('.slider-dot');
    dots.forEach(dot => dot.classList.remove('active'));
    if (dots[idx]) {
        dots[idx].classList.add('active');
    }
}

// Фоновый интервал для покадровой автоматической прокрутки баннеров
function initSliderInterval() {
    setInterval(() => {
        const homeSection = document.getElementById('section-home');

        // Слайдер листается автоматически только если лобби активно и НЕ скрыто игрой
        if (homeSection && homeSection.style.display !== 'none' && homeSection.classList.contains('active')) {
            let nextIdx = (currentSlideIdx + 1) % 3; // Циклический круг по 3-м слайдам
            moveSlide(nextIdx);
        }
    }, 5000); // Интервал автоматической смены баннера — 5 секунд
}


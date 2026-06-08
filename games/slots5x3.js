// --- ПЕРЕМЕННЫЕ И ЭЛЕМЕНТЫ SLOTS 5x3 ---
let isSlots53Spinning = false;
let isFreeSpinModeActive = false;
const SPIN_COST_5X3 = 20;
let customImages = {};    // Картинки игровых символов в формате Base64
let customBackground = ""; // Фоновое изображение страницы в формате Base64
let currentImgFit = "square"; // Режим отображения картинок: square, portrait, landscape
let customBackgrounds = {
    body: "",     // Основной фон страницы
    game: "",     // Фон контейнера игры
    machine: ""   // Внутренний подкладочный фон слота
};

// --- КОНФИГУРАЦИЯ ТЕМАТИКИ СЛОТА (Кастомизируемая часть) ---
const SLOT_THEME_CONFIG = {
    // 1. Тексты и заголовки
    texts: {
        title: "Naruto Shinobi Slots", // Название в шапке
        costPerSpin: "Cost per spin:",
        lines: "Lines:",
        spinBtnNormal: "SPIN",
        spinBtnBonus: "BONUS SPIN",
        msgWelcome: "Match lines left to right! Wild (W) replaces all icons!",
        msgRolling: "Reels rolling...",
        msgNoMatch: "No match this spin. Try again!",
        msgGameOver: "GAME OVER! Out of coins.",
        msgLoginFirst: "Please login first!",
        msgNoCoins: "Not enough coins!",
        msgServerError: "Server error. Try again.",
        getWinMessage: (totalWin, linesCount) => `🎉 WIN! Total payout: +${totalWin} 🪙 (Hit ${linesCount} lines!)`
    },
    // 2. Цветовая палитра и фоны (передаются в CSS переменные)
    styles: {
        bodyBackground: "#1a1a2e",      // Общий фон страницы
        containerBg: "#16213e",         // Фон игрового контейнера
        machineBg: "#070714",           // Фон внутренности барабанов
        machineBorder: "#e94560",       // Цвет рамки автомата
        cellBg: "#101026",              // Фон ячейки
        cellBorder: "#2d2d5f",          // Граница ячейки
        cellHighlightBg: "rgba(78, 204, 163, 0.25)", // Подсветка выигравшей ячейки
        cellHighlightBorder: "#4ecca3",              // Граница выигравшей ячейки
        btnSpinBg: "linear-gradient(135deg, #e94560, #951c30)",   // Кнопка спина
        btnBonusBg: "linear-gradient(135deg, #ff9f1c, #ff4000)",  // Кнопка во фриспинах
        bannerBg: "linear-gradient(90deg, #951c30, #e94560)"      // Баннеры джекпота/фриспинов
    },
    // 3. Символы (Можно использовать эмодзи ИЛИ ссылки на картинки <img>)
    // ВАЖНО: Ключи должны совпадать с тем, что присылает сервер (🍒, 💎, W, S и т.д.)
    symbols: {
        '🍒': '🍥', // Например, заменяем вишню на Рамен
        '🍋': '🍃', // Лимон на знак Конохи
        '🍊': '🦊', // Апельсин на Девятихвостого
        '🍇': '🌀', // Виноград на Расенган
        '🦁': '🐸', // Льва на Жабу Гамабунту
        '💎': '⚔️', // Алмаз на Кунай
        'W': '🌶️',  // Кушина / Wild
        'S': '🦊'   // Наруто / Scatter

        /* ЕСЛИ ХОТИТЕ КАРТИНКИ вместо эмодзи, раскомментируйте это:
        '🍒': '<img src="images/ramen.png" style="width:80%; height:80%; object-fit:contain;">',
        '🍋': '<img src="images/konoha.png" style="width:80%; height:80%; object-fit:contain;">',
        'W': '<img src="images/wild_naruto.png" style="width:80%; height:80%; object-fit:contain;">',
        */
    }
};

// Массив для визуального фейкового вращения (формируется автоматически из ключей или значений)
const DEFAULT_SYMBOLS = Object.keys(SLOT_THEME_CONFIG.symbols);

function applySlotTheme() {
    const cfg = SLOT_THEME_CONFIG;

    // 1. Применяем цвета в CSS переменные document
    const root = document.documentElement;
    root.style.setProperty('--body-bg', cfg.styles.bodyBackground);
    root.style.setProperty('--container-bg', cfg.styles.containerBg);
    root.style.setProperty('--machine-bg', cfg.styles.machineBg);
    root.style.setProperty('--machine-border', cfg.styles.machineBorder);
    root.style.setProperty('--cell-bg', cfg.styles.cellBg);
    root.style.setProperty('--cell-border', cfg.styles.cellBorder);
    root.style.setProperty('--cell-highlight-bg', cfg.styles.cellHighlightBg);
    root.style.setProperty('--cell-highlight-border', cfg.styles.cellHighlightBorder);
    root.style.setProperty('--btn-spin-bg', cfg.styles.btnSpinBg);
    root.style.setProperty('--btn-bonus-bg', cfg.styles.btnBonusBg);
    root.style.setProperty('--banner-bg', cfg.styles.bannerBg);

    // 2. Меняем тексты на странице (если элементы существуют)
    const titleEl = document.querySelector('h1');
    if (titleEl) titleEl.innerText = cfg.texts.title;

    const labelCost = document.getElementById('labelCostPerSpin');
    const labelLines = document.getElementById('labelLines');

    if (labelCost) labelCost.innerText = cfg.texts.costPerSpin;
    if (labelLines) labelLines.innerText = cfg.texts.lines;


    if (slots53Msg) slots53Msg.innerText = cfg.texts.msgWelcome;
    if (slots53SpinBtn && !isFreeSpinModeActive) slots53SpinBtn.innerText = cfg.texts.spinBtnNormal;
}



const slots53Machine = document.getElementById('slots53Machine');
const slots53SpinBtn = document.getElementById('slots53SpinBtn');
const slots53Msg = document.getElementById('slots53Msg');
const fsBanner = document.getElementById('fsBanner');
const fsCountLabel = document.getElementById('fsCountLabel');

const CLIENT_PAYLINES = [
    [1, 1, 1, 1, 1], // Линия 1 (Горизонталь по центру)
    [0, 0, 0, 0, 0], // Линия 2 (Горизонталь сверху)
    [2, 2, 2, 2, 2], // Линия 3 (Горизонталь снизу)
    [0, 1, 2, 1, 0], // Линия 4 (Зигзаг вниз)
    [2, 1, 0, 1, 2], // Линия 5 (Зигзаг вверх)
    [0, 0, 1, 2, 2], // Линия 6
    [2, 2, 1, 0, 0], // Линия 7
    [1, 0, 1, 2, 1], // Линия 8
    [1, 2, 1, 0, 1], // Линия 9
    [1, 0, 0, 0, 1], // Линия 10
    [1, 2, 2, 2, 1], // Линия 11
    [0, 1, 1, 1, 0], // Линия 12
    [2, 1, 1, 1, 2], // Линия 13
    [0, 1, 0, 1, 0], // Линия 14
    [2, 1, 2, 1, 2], // Линия 15
    [1, 1, 0, 1, 1], // Линия 16
    [1, 1, 2, 1, 1], // Линия 17
    [0, 0, 2, 0, 0], // Линия 18
    [2, 2, 0, 2, 2], // Линия 19
    [0, 2, 0, 2, 0]  // Линия 20
];

function initSlots53UI() {
    if (!slots53Machine) return;
    const cfg = SLOT_THEME_CONFIG;

    slots53Machine.innerHTML = '';

    for (let col = 0; col < 5; col++) {
        const reelDiv = document.createElement('div');
        reelDiv.classList.add('slots53-reel');
        reelDiv.id = `reel53_${col}`;

        for (let row = 0; row < 3; row++) {
            const cellDiv = document.createElement('div');
            cellDiv.classList.add('slots53-cell');
            cellDiv.id = `cell53_${col}_${row}`;
            // cellDiv.innerText = DEFAULT_SYMBOLS[Math.floor(Math.random() * DEFAULT_SYMBOLS.length)];

            const randomServerSymbol = DEFAULT_SYMBOLS[Math.floor(Math.random() * DEFAULT_SYMBOLS.length)];
            cellDiv.innerHTML = getSymbolVisual(randomServerSymbol);

            reelDiv.appendChild(cellDiv);
        }
        slots53Machine.appendChild(reelDiv);
    }
}

// НАЖАТИЕ КНОПКИ SPIN
if (slots53SpinBtn) {
    slots53SpinBtn.onclick = async () => {
        if (isSlots53Spinning) return;

        const cfg = SLOT_THEME_CONFIG;

        if (!currentUser) {
            slots53Msg.innerText = cfg.texts.msgLoginFirst;
            slots53Msg.style.color = "#e94560";
            return;
        }

        // Если фриспинов нет, проверяем баланс на обычную ставку
        if (!isFreeSpinModeActive && currentBalance < SPIN_COST_5X3) {
            slots53Msg.innerText = cfg.texts.msgNoCoins;
            slots53Msg.style.color = "#e94560";
            return;
        }

        isSlots53Spinning = true;
        slots53SpinBtn.disabled = true;
        slots53Msg.innerText = cfg.texts.msgRolling;
        slots53Msg.style.color = "#8a8ab0";

        // Сбрасываем старую неоновую подсветку линий
        document.querySelectorAll('.slots53-cell').forEach(c => c.classList.remove('highlight'));

        // 1. Запускаем визуальный фейковый скролл символов (эффект вращения)
        const reelIntervals = [];
        for (let col = 0; col < 5; col++) {
            const interval = setInterval(() => {
                for (let row = 0; row < 3; row++) {
                    const cell = document.getElementById(`cell53_${col}_${row}`);
                    // if (cell) cell.innerText = DEFAULT_SYMBOLS[Math.floor(Math.random() * DEFAULT_SYMBOLS.length)];

                    const fakeSymbol = DEFAULT_SYMBOLS[Math.floor(Math.random() * DEFAULT_SYMBOLS.length)];
                    if (cell) cell.innerHTML = getSymbolVisual(fakeSymbol);

                }
            }, 50 + col * 15); // Чем правее барабан, тем быстрее мелькают иконки
            reelIntervals.push(interval);
        }

        try {
            // Отправляем запрос на сервер Node.js
            const response = await fetch(`${baseUrlApi}/slots5x3/spin`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: currentUser, partnerId: globalPartnerId, token:globalGameSession })
            });
            const data = await response.json();

            if (data.error) {
                reelIntervals.forEach(clearInterval);
                slots53Msg.innerText = data.error;
                slots53Msg.style.color = "#e94560";
                isSlots53Spinning = false;
                slots53SpinBtn.disabled = false;
                return;
            }

            // 2. КАСТКАДНАЯ ОСТАНОВКА БАРАБАНОВ (Слева направо)
            for (let col = 0; col < 5; col++) {
                // Задержка остановки между соседними колонками (400мс)
                await new Promise(resolve => setTimeout(resolve, 400));
                clearInterval(reelIntervals[col]); // Выключаем фейковый перебор для колонки

                // Вставляем точную иконку из матрицы, которую рассчитал сервер
                // Примечание: сервер возвращает matrix[col][row], раскладываем по ячейкам
                for (let row = 0; row < 3; row++) {
                    const cell = document.getElementById(`cell53_${col}_${row}`);
                    // if (cell) cell.innerText = data.matrix[col][row];

                    if (cell) cell.innerHTML = getSymbolVisual(data.matrix[col][row]);

                }
            }

            // Синхронизируем глобальный баланс и джекпот
            currentBalance = data.balance;
            jackpot = data.jackpot;
            if (typeof updateUIProfile === 'function') updateUIProfile();
            if (typeof updateJackpotUI === 'function') updateJackpotUI();

            // 3. ПОДСВЕТКА ВЫИГРЫШНЫХ ЛИНИЙ И СБОР НАГРАД
            if (data.hitLines && data.hitLines.length > 0) {
                // Было: slots53Msg.innerText = `🎉 WIN! Total payout: +${data.totalWin} 🪙 (Hit ${data.hitLines.length} lines!)`;

                slots53Msg.innerText = SLOT_THEME_CONFIG.texts.getWinMessage(data.totalWin, data.hitLines.length);

                slots53Msg.style.color = "#4ecca3";

                // Проходимся по каждой выигравшей линии и красим её ячейки в неон
                data.hitLines.forEach(hit => {
                    const lineTemplate = CLIENT_PAYLINES[hit.lineIndex];
                    // Подсвечиваем только те ячейки, которые участвовали в комбинации (hit.count)
                    for (let col = 0; col < hit.count; col++) {
                        const targetRow = lineTemplate[col];
                        const winningCell = document.getElementById(`cell53_${col}_${targetRow}`);
                        if (winningCell) winningCell.classList.add('highlight');
                    }
                });
            } else {
                slots53Msg.innerText = cfg.texts.msgNoMatch;
                slots53Msg.style.color = "#8a8ab0";
            }

            // 4. КОНТРОЛЬ БОНУСНОГО РЕЖИМА (ФРИСПИНЫ)
            handleFreeSpinsStateUI(data.freeSpins);

        } catch (err) {
            console.error("Slots 5x3 error:", err);
            reelIntervals.forEach(clearInterval);
            slots53Msg.innerText = cfg.texts.msgServerError;
            slots53Msg.style.color = "#e94560";
        }

        isSlots53Spinning = false;
        // Проверяем доступность кнопки для следующего хода
        if (isFreeSpinModeActive || currentBalance >= SPIN_COST_5X3) {
            slots53SpinBtn.disabled = false;
        } else {
            slots53Msg.innerText = cfg.texts.msgGameOver;
            slots53Msg.style.color = "#e94560";
        }
    };
}

// Управление состояниями Free Spins в интерфейсе
// Управление состояниями Free Spins в интерфейсе (ПОЛНОЕ ИСПРАВЛЕНИЕ БАГА)
function handleFreeSpinsStateUI(fsData) {
    if (!fsData) return;

    // Сценарий А: Игрок только что поймал 3 Скаттера в обычном режиме
    if (fsData.triggered > 0) {
        alert(fsData.message); // Показываем крупное уведомление
        isFreeSpinModeActive = true; // Жестко включаем режим фриспинов
        fsBanner.style.display = "block";
        slots53SpinBtn.classList.add('fs-active'); // Кнопка становится зеленой
    }

    // КЛЮЧЕВОЕ ИСПРАВЛЕНИЕ: Если сервер подтверждает, что мы в режиме фриспинов
    if (fsData.isFreeSpinMode) { // Проверьте имя переменной из JSON бэкенда (data.freeSpins.isFreeSpinMode)
        isFreeSpinModeActive = true;
        fsBanner.style.display = "block";

        // Намертво привязываем счетчик из базы данных к экрану
        fsCountLabel.innerText = fsData.remaining;
        slots53SpinBtn.innerText = `${SLOT_THEME_CONFIG.texts.spinBtnBonus} (${fsData.remaining})`;
        slots53SpinBtn.classList.add('fs-active');
    } else {
        // Защита: если сервер говорит, что режима фриспинов нет, выключаем флаг
        isFreeSpinModeActive = false;
    }

    // Сценарий Б: Бонусный раунд ПОЛНОСТЬЮ ЗАВЕРШЕН (remaining дошел до 0)
    if (fsData.finished || (isFreeSpinModeActive && fsData.remaining === 0)) {
        alert(`🏆 BONUS ROUND COMPLETED!\nTotal Free Spins win: +${fsData.bonusTotalPrize || fsData.totalWon} 🪙`);

        // Сбрасываем все флаги в исходное состояние
        isFreeSpinModeActive = false;
        fsBanner.style.display = "none";
        slots53SpinBtn.classList.remove('fs-active');
        slots53SpinBtn.innerText = "SPIN";

        slots53Msg.innerText = `Bonus over! Total won: +${fsData.bonusTotalPrize || fsData.totalWon} 🪙`;
        slots53Msg.style.color = "#4ecca3";
    }

    // Автоматически обновляем общую историю действий игрока внизу экрана
    if (typeof loadGeneralHistory === 'function') loadGeneralHistory();
}

applySlotTheme();
initSlots53UI();

// --- РАСШИРЕННЫЙ МОДУЛЬ НАСТРОЙКИ СЛОТА ---


// Показать/скрыть боковую панель кастомизации
function toggleConfigPanel() {
    const panel = document.getElementById('configPanel');
    if (!panel) return;
    if (panel.style.display === 'none') {
        panel.style.display = 'block';
        fillConfigInputs(); // Заполняем текущие тексты и настройки
    } else {
        panel.style.display = 'none';
    }
}

// Генерация списка полей для загрузки картинок на основе DEFAULT_SYMBOLS
function initConfigPanelUI() {
    const container = document.getElementById('imageInputsContainer');
    if (!container) return;
    container.innerHTML = '';

    DEFAULT_SYMBOLS.forEach(symbol => {
        const div = document.createElement('div');
        div.style.marginBottom = '10px';
        div.style.display = 'flex';
        div.style.alignItems = 'center';
        div.style.justifyContent = 'space-between';

        div.innerHTML = `
            <span style="font-size: 20px; width: 30px;">${symbol}</span>
            <input type="file" accept="image/*" id="file_${symbol}" onchange="handleFileLoad('${symbol}')" style="font-size: 11px; color: #8a8ab0; width: 180px;">
            <div id="preview_${symbol}" style="width: 35px; height: 35px; border: 1px dashed #444; display:flex; align-items:center; justify-content:center; font-size:10px; background-size:contain; background-repeat:no-repeat; background-position:center;">${symbol}</div>
        `;
        container.appendChild(div);
    });
}

// Чтение и генерация превью для картинок-символов
function handleFileLoad(symbol) {
    const fileInput = document.getElementById(`file_${symbol}`);
    const preview = document.getElementById(`preview_${symbol}`);

    if (fileInput.files && fileInput.files[0]) {
        const reader = new FileReader();
        reader.onload = function (e) {
            customImages[symbol] = e.target.result;
            preview.innerHTML = "";
            preview.style.backgroundImage = `url(${e.target.result})`;
        };
        reader.readAsDataURL(fileInput.files[0]);
    }
}

// Чтение и генерация превью для фонового изображения страницы
function handleBgFileLoad() {
    const fileInput = document.getElementById('bgFileInput');
    const preview = document.getElementById('bgPreview');

    if (fileInput.files && fileInput.files[0]) {
        const reader = new FileReader();
        reader.onload = function (e) {
            customBackground = e.target.result;
            preview.innerText = "";
            preview.style.backgroundImage = `url(${e.target.result})`;
        };
        reader.readAsDataURL(fileInput.files[0]);
    }
}

// Динамическое вычисление стилей для картинок внутри барабана
// function getSymbolVisual(serverSymbol) {
//     if (customImages[serverSymbol]) {
//         let styleStr = "display:block; margin:auto; transition: all 0.2s;";
//
//         // В зависимости от выбора администратора, кастомизируем размеры картинок
//         if (currentImgFit === "square") {
//             styleStr += "width:85%; height:85%; object-fit:cover; border-radius: 8px;";
//         } else if (currentImgFit === "portrait") {
//             styleStr += "width:65%; height:95%; object-fit:cover; border-radius: 6px;";
//         } else if (currentImgFit === "landscape") {
//             styleStr += "width:95%; height:60%; object-fit:cover; border-radius: 6px;";
//         }
//
//         return `<img src="${customImages[serverSymbol]}" style="${styleStr}">`;
//     }
//     return SLOT_THEME_CONFIG.symbols[serverSymbol] || serverSymbol;
// }

// Динамическое отображение символов с поддержкой пропорций ячеек
function getSymbolVisual(serverSymbol) {
    if (customImages[serverSymbol]) {
        // Картинка теперь всегда аккуратно заполняет размеры ячейки, которые диктует конфиг
        let styleStr = "width:100%; height:100%; object-fit:cover; border-radius:8px; display:block; margin:auto;";
        return `<img src="${customImages[serverSymbol]}" style="${styleStr}">`;
    }
    return SLOT_THEME_CONFIG.symbols[serverSymbol] || serverSymbol;
}



// Первичная инициализация панели при загрузке скрипта


// --- ТРЕХУРОВНЕВАЯ СИСТЕМА ФОНОВ И КАСТОМИЗАЦИЯ ---

// Объект для хранения трех разных фонов в Base64


// Функция-загрузчик для трех типов фонов
function handleBgLoad(type) {
    let inputId = "";
    let previewId = "";

    if (type === 'body') { inputId = 'bgBodyInput'; previewId = 'previewBgBody'; }
    else if (type === 'game') { inputId = 'bgGameInput'; previewId = 'previewBgGame'; }
    else if (type === 'machine') { inputId = 'bgMachineInput'; previewId = 'previewBgMachine'; }

    const fileInput = document.getElementById(inputId);
    const preview = document.getElementById(previewId);

    if (fileInput && fileInput.files && fileInput.files[0]) {
        const reader = new FileReader();
        reader.onload = function (e) {
            customBackgrounds[type] = e.target.result;
            preview.innerText = "";
            preview.style.backgroundImage = `url(${e.target.result})`;
        }
        reader.readAsDataURL(fileInput.files[0]);
    }
}

// Вспомогательная функция для безопасного наката стилей на элементы
function applyBackgroundStyles(element, base64Url) {
    if (!element || !base64Url) return;
    element.style.backgroundImage = `url(${base64Url})`;
    element.style.backgroundSize = "cover";
    element.style.backgroundPosition = "center";
    element.style.backgroundRepeat = "no-repeat";
}

// Заполнение полей ввода и мини-превью при открытии панели
function fillConfigInputs() {
    const cfg = SLOT_THEME_CONFIG.texts;
    document.getElementById('cfg_txt_title').value = cfg.title;
    document.getElementById('cfg_txt_spin').value = cfg.spinBtnNormal;
    document.getElementById('cfg_txt_welcome').value = cfg.msgWelcome;
    document.getElementById('cfg_txt_rolling').value = cfg.msgRolling;
    document.getElementById('cfg_img_fit').value = currentImgFit;

    // Обновляем мини-картинки в интерфейсе настроек
    const types = ['body', 'game', 'machine'];
    types.forEach(type => {
        const preview = document.getElementById(`previewBg${type.charAt(0).toUpperCase() + type.slice(1)}`);
        if (preview && customBackgrounds[type]) {
            preview.innerText = "";
            preview.style.backgroundImage = `url(${customBackgrounds[type]})`;
        }
    });
}

// Сохранение и применение изменений
function saveAndApplyConfig() {
    const cfg = SLOT_THEME_CONFIG.texts;

    // 1. Считываем тексты
    cfg.title = document.getElementById('cfg_txt_title').value;
    cfg.spinBtnNormal = document.getElementById('cfg_txt_spin').value;
    cfg.msgWelcome = document.getElementById('cfg_txt_welcome').value;
    cfg.msgRolling = document.getElementById('cfg_txt_rolling').value;

    // 2. Считываем и применяем пропорции для ячеек барабана
    currentImgFit = document.getElementById('cfg_img_fit').value;
    const root = document.documentElement;

    if (currentImgFit === "square") {
        root.style.setProperty('--cell-aspect', '1');       // Квадрат 1:1
    } else if (currentImgFit === "portrait") {
        root.style.setProperty('--cell-aspect', '3 / 4');   // Вытянутый вертикальный портрет
    } else if (currentImgFit === "landscape") {
        root.style.setProperty('--cell-aspect', '4 / 3');   // Вытянутый горизонтальный пейзаж
    }

    // 3. Послойное наложение фонов (оставляем ваш прежний код без изменений)
    if (customBackgrounds.body) {
        applyBackgroundStyles(document.body, customBackgrounds.body);
        document.body.style.backgroundAttachment = "fixed";
    }
    const gameContainer = document.getElementById('slots53');
    if (customBackgrounds.game && gameContainer) {
        applyBackgroundStyles(gameContainer, customBackgrounds.game);
    }
    if (customBackgrounds.machine && slots53Machine) {
        applyBackgroundStyles(slots53Machine, customBackgrounds.machine);
    }

    // 4. Обновление UI
    applySlotTheme();
    initSlots53UI();
    toggleConfigPanel();
}


// --- СБОРКА И СХРАНЕНИЕ ПАКЕТА В JSON ФАЙЛ ---
function exportConfigToFile() {
    const exportData = {
        themeTitle: SLOT_THEME_CONFIG.texts.title,
        texts: {
            title: SLOT_THEME_CONFIG.texts.title,
            spinBtnNormal: SLOT_THEME_CONFIG.texts.spinBtnNormal,
            msgWelcome: SLOT_THEME_CONFIG.texts.msgWelcome,
            msgRolling: SLOT_THEME_CONFIG.texts.msgRolling
        },
        imgFit: currentImgFit,
        backgrounds: customBackgrounds, // Сохраняем все 3 фона сразу
        symbolsBlobs: customImages
    };

    const jsonString = JSON.stringify(exportData, null, 2);
    const blob = new Blob([jsonString], { type: "application/json" });
    const link = document.createElement("a");
    const fileName = SLOT_THEME_CONFIG.texts.title.toLowerCase().replace(/[^a-z0-9]/g, "_") + "_theme.json";

    link.href = URL.createObjectURL(blob);
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(link.href);
}

// --- ЧТЕНИЕ И РАСПАКОВКА ИЗ JSON ФАЙЛА ---
function importConfigFromFile() {
    const fileOpts = document.getElementById('importFileOpts');
    if (!fileOpts || !fileOpts.files || !fileOpts.files[0]) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const importedData = JSON.parse(e.target.result);

            // Восстановление текстов, пропорций и иконок
            if (importedData.texts) Object.assign(SLOT_THEME_CONFIG.texts, importedData.texts);

            // Восстановление пропорций из файла
            if (importedData.imgFit) currentImgFit = importedData.imgFit;

            // Сразу же активируем нужный аспект ратио в CSS
            const root = document.documentElement;
            if (currentImgFit === "square") root.style.setProperty('--cell-aspect', '1');
            else if (currentImgFit === "portrait") root.style.setProperty('--cell-aspect', '3 / 4');
            else if (currentImgFit === "landscape") root.style.setProperty('--cell-aspect', '4 / 3');

            if (importedData.symbolsBlobs) customImages = importedData.symbolsBlobs;

            // Восстановление всех трех фонов
            if (importedData.backgrounds) {
                customBackgrounds = Object.assign({ body: "", game: "", machine: "" }, importedData.backgrounds);
            } else if (importedData.backgroundBlob) {
                // Обратная совместимость (на случай, если загружается старый файл с одним фоном автомата)
                customBackgrounds.machine = importedData.backgroundBlob;
            }

            // Накатываем считанные фоны на реальные DOM-элементы
            if (customBackgrounds.body) {
                applyBackgroundStyles(document.body, customBackgrounds.body);
                document.body.style.backgroundAttachment = "fixed";
            }
            const gameContainer = document.getElementById('slots53');
            if (customBackgrounds.game && gameContainer) {
                applyBackgroundStyles(gameContainer, customBackgrounds.game);
            }
            if (customBackgrounds.machine && slots53Machine) {
                applyBackgroundStyles(slots53Machine, customBackgrounds.machine);
            }

            // Обновляем превью символов в боковом меню
            DEFAULT_SYMBOLS.forEach(symbol => {
                const preview = document.getElementById(`preview_${symbol}`);
                if (preview && customImages[symbol]) {
                    preview.innerText = "";
                    preview.style.backgroundImage = `url(${customImages[symbol]})`;
                }
            });

            applySlotTheme();
            initSlots53UI();
            fillConfigInputs();

            alert(`🎉 Full theme "${importedData.themeTitle || 'Import'}" loaded!`);
        } catch (err) {
            console.error(err);
            alert("JSON error.");
        }
    };
    reader.readAsText(fileOpts.files[0]);
}

// --- МОДУЛЬ ОБРАБОТКИ ПАРАМЕТРОВ URL (ИНТЕГРАЦИЯ ТЕМ) ---

async function checkUrlParametersAndLoad() {
    // 1. Читаем параметры из адресной строки (например, ?edit=true&theme=aaa)
    const urlParams = new URLSearchParams(window.location.search);

    const isEditMode = urlParams.get('edit') === 'true';
    const themeName = urlParams.get('theme');

    // 2. Управляем отображением кнопки редактирования
    const configBtn = document.getElementById('adminConfigBtn');
    if (configBtn) {
        if (isEditMode) {
            configBtn.style.display = 'block'; // Показываем, если edit=true
        } else {
            configBtn.style.display = 'none';  // Прячем во всех остальных случаях
        }
    }

    // 3. Автоматическая подгрузка JSON файла темы, если указан параметр theme
    if (themeName) {
        // Формируем путь до локального файла конфигурации темы
        const themeUrl = `./${themeName}.json`;

        try {
            const response = await fetch(themeUrl);

            if (!response.ok) {
                throw new Error(`Файл темы ${themeName}.json не найден на сервере (Статус: ${response.status})`);
            }

            const importedData = await response.json();

            // Запускаем процесс парсинга и наката полученных данных на автомат
            applyImportedThemeData(importedData);

            console.log(`[Theme Engine] Тема "${themeName}" успешно загружена из файла.`);
        } catch (error) {
            console.error("[Theme Engine] Ошибка автоматической загрузки пресета темы:", error);
            // Если файл темы не найден — автомат продолжит работать на дефолтных эмодзи
        }
    }
}

// Вспомогательная изолированная функция наката структуры данных из JSON (аналог ручного импорта)
function applyImportedThemeData(importedData) {
    // Восстанавливаем тексты, если они прописаны в файле
    if (importedData.texts) {
        Object.assign(SLOT_THEME_CONFIG.texts, importedData.texts);
    }

    // Восстанавливаем пропорции ячеек
    if (importedData.imgFit) {
        currentImgFit = importedData.imgFit;
    }

    // Накатываем CSS-пропорции на уровень документа
    const root = document.documentElement;
    if (currentImgFit === "square") root.style.setProperty('--cell-aspect', '1');
    else if (currentImgFit === "portrait") root.style.setProperty('--cell-aspect', '3 / 4');
    else if (currentImgFit === "landscape") root.style.setProperty('--cell-aspect', '4 / 3');

    // Распаковываем медиафайлы символов
    if (importedData.symbolsBlobs) {
        customImages = importedData.symbolsBlobs;
    }

    // Распаковываем трехуровневую систему фонов
    if (importedData.backgrounds) {
        customBackgrounds = Object.assign({ body: "", game: "", machine: "" }, importedData.backgrounds);
    }

    // Физически перерисовываем фоны на элементах страницы
    if (customBackgrounds.body) {
        applyBackgroundStyles(document.body, customBackgrounds.body);
        document.body.style.backgroundAttachment = "fixed";
    }

    const gameContainer = document.getElementById('slots53');
    if (customBackgrounds.game && gameContainer) {
        applyBackgroundStyles(gameContainer, customBackgrounds.game);
    }

    if (customBackgrounds.machine && slots53Machine) {
        applyBackgroundStyles(slots53Machine, customBackgrounds.machine);
    }

    // Синхронизируем мини-картинки внутри скрытой админ-панели (на случай если её откроют)
    DEFAULT_SYMBOLS.forEach(symbol => {
        const preview = document.getElementById(`preview_${symbol}`);
        if (preview && customImages[symbol]) {
            preview.innerText = "";
            preview.style.backgroundImage = `url(${customImages[symbol]})`;
        }
    });

    // Финальное обновление текстов шапки и рендер ячеек игрового поля
    applySlotTheme();
    initSlots53UI();
    fillConfigInputs();
}

// Переносим вызов инициализации в самый конец файла
initConfigPanelUI();
checkUrlParametersAndLoad(); // <--- Запуск проверки при старте страницы


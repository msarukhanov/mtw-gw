// --- ПЕРЕМЕННЫЕ И ЭЛЕМЕНТЫ ИГРЫ CRASH ---
let crashClientState = "betting"; // betting, flying, crashed
let hasPlacedCrashBet = false;
let hasCashedOutCrash = false;
let crashAnimFrame = null;
let crashFlightProgress = 0; // для плавной отрисовки графика

const crashCanvas = document.getElementById('crashCanvas');
const crashCtx = crashCanvas ? crashCanvas.getContext('2d') : null;
const crashActionBtn = document.getElementById('crashActionBtn');
const crashBetInput = document.getElementById('crashBetInput');
const crashOverlay = document.getElementById('crashOverlay');
const crashLiveMult = document.getElementById('crashLiveMult');

// Глобальный HTML-элемент картинки спрайта
let crashSpriteImg = new Image();
let crashCanvasBgImg = new Image();
let customLineColor = "#e94560"; // Цвет линии по умолчанию

// --- КЛИЕНТСКИЙ КРЭШ КОНФИГУРАТОР ---
let customCrashBg = "";
let customCrashSpriteBase64 = "";
let customCanvasBgBase64 = "";

let customSpriteSize = 30;

const CRASH_THEME_CONFIG = {
    texts: {
        btnPlace: "PLACE BET",
        liveHeader: "LIVE BETS (ALL PLAYERS)",
        nextFlight: "NEXT FLIGHT IN"
    }
};

function drawCrashGraph(multiplier, stateStr) {
    if (!crashCtx || !crashCanvas) return;
    const w = crashCanvas.width;
    const h = crashCanvas.height;

    crashCtx.clearRect(0, 0, w, h);

    // === ОТРИСОВКА КАСТОМНОГО ФОНА КАНВАСА ===
    if (crashCanvasBgImg.src && crashCanvasBgImg.complete && crashCanvasBgImg.naturalWidth !== 0) {
        crashCtx.drawImage(crashCanvasBgImg, 0, 0, w, h);
    } else {
        // Дефолтный заливающий цвет, если картинка фона не загружена
        crashCtx.fillStyle = "#070714";
        crashCtx.fillRect(0, 0, w, h);
    }

    // Рисуем сетку на фоне (поверх картинки, с легкой прозрачностью)
    crashCtx.strokeStyle = "rgba(37, 37, 77, 0.4)";
    crashCtx.lineWidth = 1;
    for (let i = 50; i < w; i += 50) {
        crashCtx.beginPath(); crashCtx.moveTo(i, 0); crashCtx.lineTo(i, h); crashCtx.stroke();
    }
    for (let i = 40; i < h; i += 40) {
        crashCtx.beginPath(); crashCtx.moveTo(0, i); crashCtx.lineTo(w, i); crashCtx.stroke();
    }

    if (stateStr === "flying") {
        crashFlightProgress += 1.5;
        if (crashFlightProgress > w - 60) crashFlightProgress = w - 60;

        const x = crashFlightProgress;
        const y = h - 20 - (Math.pow(x / (w - 60), 2) * (h - 60));

        // Рисуем неоновую линию хвоста с динамическим цветом
        crashCtx.strokeStyle = customLineColor;
        crashCtx.lineWidth = 4;
        crashCtx.shadowBlur = 10;
        crashCtx.shadowColor = customLineColor;

        crashCtx.beginPath();
        crashCtx.moveTo(0, h - 20);
        crashCtx.quadraticCurveTo(x / 2, h - 20, x, y);
        crashCtx.stroke();

        crashCtx.shadowBlur = 0; // Сброс тени

        // === ДИНАМИЧЕСКИЙ ОТРИСОВЩИК ОБЪЕКТА ===
        // Если картинка загружена и готова — рисуем спрайт, иначе — стандартный круг
        // Внутри drawCrashGraph, в блоке отрисовки спрайта:
        if (crashSpriteImg.src && crashSpriteImg.complete && crashSpriteImg.naturalWidth !== 0) {
            const size = customSpriteSize; // 👈 Заменили жесткие 30 на динамическую переменную
            crashCtx.drawImage(crashSpriteImg, x - size / 2, y - size / 2, size, size);
        }
        else {
            crashCtx.fillStyle = "#4ecca3";
            crashCtx.beginPath();
            crashCtx.arc(x, y, 10, 0, Math.PI * 2);
            crashCtx.fill();
        }
    }
}


// Главная кнопка действия (Смена режимов Ставка -> Ожидание -> Кэшаут)
if (crashActionBtn) {
    crashActionBtn.onclick = async () => {
        if (!currentUser) return alert("Please login first!");

        // Режим 1: Делаем ставку во время ожидания
        if (crashClientState === "betting" && !hasPlacedCrashBet) {
            const bet = parseInt(crashBetInput.value);
            if (isNaN(bet) || bet <= 0) return alert("Invalid bet amount");
            if (currentBalance < bet) return alert("Not enough coins");

            try {
                const response = await fetch(baseUrlApi + '/crash/bet', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username: currentUser, partnerId: globalPartnerId, token:globalGameSession, bet })
                });
                const data = await response.json();

                if (data.error) {
                    crashOverlay.innerText = data.error;
                    return;
                }

                hasPlacedCrashBet = true;
                currentBalance = data.balance;
                if (typeof updateUIProfile === 'function') updateUIProfile();

                crashActionBtn.disabled = true;
                crashActionBtn.innerText = "BET ACCEPTED";
                crashBetInput.disabled = true;
            } catch (err) {
                console.error("Crash bet error:", err);
            }
        }
        // Режим 2: Нажимаем Кэшаут (Забрать деньги) во время полета
        else if (crashClientState === "flying" && hasPlacedCrashBet && !hasCashedOutCrash) {
            try {
                const response = await fetch(baseUrlApi + '/crash/cashout', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username: currentUser, partnerId: globalPartnerId, token:globalGameSession })
                });
                const data = await response.json();

                if (data.error) return alert(data.error);


                // На фронтенде внутри crashActionBtn.onclick в блоке успешного кэшаута:
                hasCashedOutCrash = true;
                currentBalance = data.balance;
                if (typeof updateUIProfile === 'function') updateUIProfile();

                // ИСПРАВЛЕНИЕ: Мгновенно гасим зеленую кнопку кэшаута на клиенте
                crashActionBtn.disabled = true;
                crashActionBtn.classList.remove('cashout-active'); // Кнопка перестанет быть зеленой
                crashActionBtn.innerText = `CASHED OUT (+${data.prize} 🪙)`;


                if (typeof loadGeneralHistory === 'function') loadGeneralHistory();
            } catch (err) {
                console.error("Crash cashout error:", err);
            }
        }
    };
}

// --- РИСОВАНИЕ ГРАФИКА НА CANVAS ---
function drawCrashGraph222(multiplier, stateStr) {
    if (!crashCtx || !crashCanvas) return;
    const w = crashCanvas.width;
    const h = crashCanvas.height;
    crashCtx.clearRect(0, 0, w, h);

    // Рисуем сетку на фоне
    crashCtx.strokeStyle = "rgba(37, 37, 77, 0.3)";
    crashCtx.lineWidth = 1;
    for (let i = 50; i < w; i += 50) {
        crashCtx.beginPath(); crashCtx.moveTo(i, 0); crashCtx.lineTo(i, h); crashCtx.stroke();
    }
    for (let i = 40; i < h; i += 40) {
        crashCtx.beginPath(); crashCtx.moveTo(0, i); crashCtx.lineTo(w, i); crashCtx.stroke();
    }

    if (stateStr === "flying") {
        crashFlightProgress += 1.5;
        if (crashFlightProgress > w - 60) crashFlightProgress = w - 60;

        // Координаты полета (параболическая кривая вверх-вправо)
        const x = crashFlightProgress;
        const y = h - 20 - (Math.pow(x / (w - 60), 2) * (h - 60));

        // Рисуем неоновую линию хвоста
        crashCtx.strokeStyle = "#e94560";
        crashCtx.lineWidth = 4;
        crashCtx.shadowBlur = 10;
        crashCtx.shadowColor = "#e94560";

        crashCtx.beginPath();
        crashCtx.moveTo(0, h - 20);
        // Проводим плавную кривую до текущей точки самолета
        crashCtx.quadraticCurveTo(x / 2, h - 20, x, y);
        crashCtx.stroke();

        // Сброс тени
        crashCtx.shadowBlur = 0;

        // Рисуем сам летящий самолетик (замените на картинку вашего персонажа)
        crashCtx.fillStyle = "#4ecca3";
        crashCtx.beginPath();
        crashCtx.arc(x, y, 10, 0, Math.PI * 2);
        crashCtx.fill();
    }
}

// Хранилище для отрисовки текущей таблицы ставок
let currentRoundBetsCache = {};

socket.emit('join_game_room', {username:currentUser, partnerId:globalPartnerId, game:'crash'});

socket.on('crash_state', (data) => {
    crashClientState = data.status;
    const betsBox = document.getElementById('crashLiveBetsBox');

    // Состояние 1: Прием ставок
    if (data.status === "betting") {
        cancelAnimationFrame(crashAnimFrame);
        crashFlightProgress = 0;
        if (crashCtx) crashCtx.clearRect(0, 0, crashCanvas.width, crashCanvas.height);

        crashLiveMult.style.display = "none";
        crashOverlay.style.display = "block";
        crashOverlay.style.color = "#4ecca3";

        // crashOverlay.innerText = `NEXT FLIGHT IN ${Math.ceil(data.timeLeft / 1000)}s`;
        // Внутри socket.on('crash_state') для состояния "betting":
        const nextFlightPrefix = CRASH_THEME_CONFIG.texts.nextFlight || "NEXT FLIGHT IN";
        crashOverlay.innerText = `${nextFlightPrefix} ${Math.ceil(data.timeLeft / 1000)}s`; // 👈 Теперь текст кастомный


        if (!hasPlacedCrashBet) {
            crashActionBtn.disabled = false;
            crashActionBtn.classList.remove('cashout-active');
            crashActionBtn.innerText = CRASH_THEME_CONFIG.texts.btnPlace;
            crashBetInput.disabled = false;
        }

        // ОБНОВЛЯЕМ ТАБЛИЦУ СТАВОК (Стадия ожидания)
        if (betsBox && data.bets) {
            currentRoundBetsCache = data.bets; // запоминаем кто сколько поставил
            betsBox.innerHTML = Object.keys(data.bets).map(username => {
                return `<div style="display: flex; justify-content: space-between; background: rgba(255,255,255,0.02); padding: 6px 10px; border-radius: 6px;">
                        <span style="color: #fff;">👤 ${username}</span>
                        <span style="color: #8a8ab0;">${data.bets[username]} 🪙</span>
                    </div>`;
            }).join('');
            if (Object.keys(data.bets).length === 0) {
                betsBox.innerHTML = `<div style="text-align: center; color: #444; padding: 10px;">Placing bets...</div>`;
            }
        }
    }
    // Состояние 2: Самолет летит!
    else if (data.status === "flying") {
        crashOverlay.style.display = "none";
        crashLiveMult.style.display = "block";
        crashLiveMult.innerText = `${data.multiplier.toFixed(2)}x`;

        if (hasPlacedCrashBet && !hasCashedOutCrash) {
            crashActionBtn.disabled = false;
            crashActionBtn.classList.add('cashout-active');
            const betVal = parseInt(crashBetInput.value);
            const estWin = Math.floor(betVal * data.multiplier);
            crashActionBtn.innerText = `TAKE WIN: ${estWin} 🪙`;
        }

        drawCrashGraph(data.multiplier, "flying");

        // ОБНОВЛЯЕМ ТАБЛИЦУ СТАВОК (В полете: подсвечиваем тех, кто нажал Кэшаут)
        if (betsBox && currentRoundBetsCache) {
            betsBox.innerHTML = Object.keys(currentRoundBetsCache).map(username => {
                // Проверяем, зафиксировал ли сервер кэшаут для этого юзера на текущем иксе
                const cashOutMultiplier = data.cashedOut && data.cashedOut[username];
                if (cashOutMultiplier) {
                    const winAmount = Math.floor(currentRoundBetsCache[username] * cashOutMultiplier);
                    return `<div style="display: flex; justify-content: space-between; background: rgba(78, 204, 163, 0.1); padding: 6px 10px; border-radius: 6px; border-left: 3px solid #4ecca3;">
                            <span style="color: #4ecca3; font-weight: bold;">👤 ${username}</span>
                            <span style="color: #4ecca3; font-weight: bold;">Cashed out ${cashOutMultiplier.toFixed(2)}x (+${winAmount} 🪙)</span>
                        </div>`;
                }
                // Если еще летит
                return `<div style="display: flex; justify-content: space-between; background: rgba(255,255,255,0.02); padding: 6px 10px; border-radius: 6px;">
                        <span style="color: #fff;">👤 ${username}</span>
                        <span style="color: #8a8ab0; font-style: italic;">In flight...</span>
                    </div>`;
            }).join('');
        }
    }
    // Состояние 3: Краш
    else if (data.status === "crashed") {
        crashClientState = "crashed";
        crashLiveMult.style.display = "none";
        crashOverlay.style.display = "block";
        crashOverlay.style.color = "#e94560";
        crashOverlay.innerHTML = `FLEW AWAY<br><span style="font-size:32px; font-weight:900;">${data.multiplier.toFixed(2)}x</span>`;

        if (crashCtx && crashCanvas) {
            crashCtx.fillStyle = "rgba(233, 69, 96, 0.1)";
            crashCtx.fillRect(0, 0, crashCanvas.width, crashCanvas.height);
        }

        crashActionBtn.disabled = true;
        crashActionBtn.classList.remove('cashout-active');
        crashActionBtn.innerText = "CRASHED";

        // В финальной таблице подсвечиваем красным тех, кто сгорел
        if (betsBox && currentRoundBetsCache) {
            betsBox.innerHTML = Object.keys(currentRoundBetsCache).map(username => {
                const cashOutMultiplier = data.cashedOut && data.cashedOut[username];
                if (cashOutMultiplier) {
                    const winAmount = Math.floor(currentRoundBetsCache[username] * cashOutMultiplier);
                    return `<div style="display: flex; justify-content: space-between; background: rgba(78, 204, 163, 0.05); padding: 6px 10px; border-radius: 6px;">
                            <span style="color: #666;">👤 ${username}</span>
                            <span style="color: #4ecca3;">Won +${winAmount} 🪙</span>
                        </div>`;
                }
                return `<div style="display: flex; justify-content: space-between; background: rgba(233, 69, 96, 0.1); padding: 6px 10px; border-radius: 6px; border-left: 3px solid #e94560;">
                        <span style="color: #e94560;">走 ${username}</span>
                        <span style="color: #e94560; font-weight: bold;">Crashed (-${currentRoundBetsCache[username]} 🪙)</span>
                    </div>`;
            }).join('');
        }

        hasPlacedCrashBet = false;
        hasCashedOutCrash = false;
        currentRoundBetsCache = {}; // зачищаем раунд

        if (typeof loadGeneralHistory === 'function') loadGeneralHistory();
    }
});

// 2. Добавляем функцию-обработчик загрузки файла
function handleCanvasBgLoad() {
    const fileInput = document.getElementById('crashCanvasBgInput');
    const preview = document.getElementById('previewCrashCanvasBg');

    if (fileInput.files && fileInput.files[0]) {
        const reader = new FileReader();
        reader.onload = function (e) {
            customCanvasBgBase64 = e.target.result;
            if (preview) {
                preview.innerText = "";
                preview.style.backgroundImage = `url(${e.target.result})`;
            }
        };
        reader.readAsDataURL(fileInput.files[0]);
    }
}

// 3. Обновляем функцию применения изменений на экране
function applyCrashTheme() {
    const cfg = CRASH_THEME_CONFIG;

    const liveHeaderEl = document.querySelector('#crash div div[style*="letter-spacing"]');
    if (liveHeaderEl) liveHeaderEl.innerText = cfg.texts.liveHeader;

    if (crashClientState === "betting" && !hasPlacedCrashBet) {
        if (crashActionBtn) crashActionBtn.innerText = cfg.texts.btnPlace;
    }

    if (document.getElementById('cfg_line_color')) {
        customLineColor = document.getElementById('cfg_line_color').value;
    }

    if (customCrashSpriteBase64) crashSpriteImg.src = customCrashSpriteBase64;
    else crashSpriteImg.src = "";

    // Накатываем фон на сам Canvas элемент
    if (customCanvasBgBase64) {
        crashCanvasBgImg.src = customCanvasBgBase64;
    } else {
        crashCanvasBgImg.src = "";
    }

    // Принудительно перерисовываем пустой экран с новым фоном, если игра сейчас спит
    if (crashClientState === "betting" && crashCtx) {
        drawCrashGraph(1, "betting");
    }

    if (customCrashBg) {
        document.body.style.backgroundImage = `url(${customCrashBg})`;
        document.body.style.backgroundSize = "cover";
        document.body.style.backgroundPosition = "center";
        document.body.style.backgroundAttachment = "fixed";
    }

    // Внутри функции applyCrashTheme():
    // Внутри функции applyCrashTheme() в customCrash.js:
    const overlayEl = document.getElementById('crashOverlay');
    if (overlayEl) {
        const hexColor = document.getElementById('cfg_overlay_bg').value;
        const opacity = parseInt(document.getElementById('cfg_overlay_opacity').value) / 100;

        const r = parseInt(hexColor.slice(1, 3), 16);
        const g = parseInt(hexColor.slice(3, 5), 16);
        const b = parseInt(hexColor.slice(5, 7), 16);

        // Накатываем полноэкранный полупрозрачный фон
        overlayEl.style.backgroundColor = `rgba(${r}, ${g}, ${b}, ${opacity})`;
    }

}




// Показ/скрытие админки
function toggleConfigPanel() {
    const panel = document.getElementById('configPanel');
    if (!panel) return;
    if (panel.style.display === 'none') {
        panel.style.display = 'block';
        fillConfigInputs();
    } else {
        panel.style.display = 'none';
    }
}

function fillConfigInputs() {
    const cfg = CRASH_THEME_CONFIG.texts;
    document.getElementById('cfg_txt_btn').value = cfg.btnPlace;
    document.getElementById('cfg_txt_live').value = cfg.liveHeader;
    document.getElementById('cfg_line_color').value = customLineColor;

    const preview = document.getElementById('previewCrashSprite');
    if (preview && customCrashSpriteBase64) {
        preview.innerText = "";
        preview.style.backgroundImage = `url(${customCrashSpriteBase64})`;
    }
}

// FileReader для Спрайта
function handleSpriteLoad() {
    const fileInput = document.getElementById('crashSpriteInput');
    const preview = document.getElementById('previewCrashSprite');

    if (fileInput.files && fileInput.files[0]) {
        const reader = new FileReader();
        reader.onload = function (e) {
            customCrashSpriteBase64 = e.target.result;
            preview.innerText = "";
            preview.style.backgroundImage = `url(${e.target.result})`;
        };
        reader.readAsDataURL(fileInput.files[0]);
    }
}

// FileReader для Фона страницы
function handleBgLoad() {
    const fileInput = document.getElementById('crashBgInput');

    if (fileInput.files && fileInput.files[0]) {
        const reader = new FileReader();
        reader.onload = function (e) {
            customCrashBg = e.target.result;
        };
        reader.readAsDataURL(fileInput.files[0]);
    }
}

// Кнопка сохранения изменений в админке
// Замените вашу функцию сохранения на эту:
saveAndApplyConfig = function() {
    // 1. Считываем измененные тексты из полей ввода
    CRASH_THEME_CONFIG.texts.btnPlace = document.getElementById('cfg_txt_btn').value;
    CRASH_THEME_CONFIG.texts.liveHeader = document.getElementById('cfg_txt_live').value;
    CRASH_THEME_CONFIG.texts.nextFlight = document.getElementById('cfg_txt_next_flight').value;

    // 2. Считываем размер объекта
    customSpriteSize = parseInt(document.getElementById('cfg_sprite_size').value);

    // 3. ПРИНУДИТЕЛЬНО запускаем пересчет и накат всех медиа-данных и фонов канваса
    applyCrashTheme();

    // 4. Закрываем панель управления
    toggleConfigPanel();
};



// 1. Синхронизируем инпуты при открытии панели
const originalFillConfigInputs = fillConfigInputs;
// Исправленная синхронизация инпутов и мини-превью при открытии панели
// Исправленная синхронизация всех инпутов, ползунков и превью при открытии панели
fillConfigInputs = function() {
    // 1. Вызываем базовое заполнение текстовых полей ставки и таблицы
    originalFillConfigInputs();

    // 2. ИСПРАВЛЕНИЕ РАЗМЕРА: Выставляем ползунок и подпись в актуальное сохраненное значение
    const sizeInput = document.getElementById('cfg_sprite_size');
    const sizeLabel = document.getElementById('sizeValLabel');
    if (sizeInput && sizeLabel) {
        sizeInput.value = customSpriteSize;       // Синхронизируем положение ползунка
        sizeLabel.innerText = customSpriteSize;   // Синхронизируем текстовую подпись пикселей
    }

    // 3. Восстанавливаем мини-превью для Спрайта Персонажа
    const spritePreview = document.getElementById('previewCrashSprite');
    if (spritePreview && customCrashSpriteBase64) {
        spritePreview.innerText = "";
        spritePreview.style.backgroundImage = `url(${customCrashSpriteBase64})`;
    }

    // 4. Восстанавливаем мини-превью для фона Канваса
    const canvasPreview = document.getElementById('previewCrashCanvasBg');
    if (canvasPreview && customCanvasBgBase64) {
        canvasPreview.innerText = "";
        canvasPreview.style.backgroundImage = `url(${customCanvasBgBase64})`;
    }
};



// 2. Считываем новые настройки при нажатии "Save and Apply"
const originalSaveAndApplyConfig = saveAndApplyConfig;
saveAndApplyConfig = function() {
    // Считываем размер объекта
    customSpriteSize = parseInt(document.getElementById('cfg_sprite_size').value);

    // Считываем текст оверлея
    CRASH_THEME_CONFIG.texts.nextFlight = document.getElementById('cfg_txt_next_flight').value;

    // Вызываем оригинальный метод применения настроек
    originalSaveAndApplyConfig();
};

// 3. Добавляем в экспорт JSON (Замените вашу функцию exportConfigToFile)
function exportConfigToFile() {
    const hexColor = document.getElementById('cfg_overlay_bg').value;
    const opacity = document.getElementById('cfg_overlay_opacity').value;

    const exportData = {
        themeTitle: "Crash Advanced Theme",
        texts: CRASH_THEME_CONFIG.texts,
        lineColor: customLineColor,
        spriteBlob: customCrashSpriteBase64,
        backgroundBlob: customCrashBg,
        canvasBgBlob: customCanvasBgBase64,
        // Новые сохраненные метрики:
        spriteSize: customSpriteSize,
        overlayBgColor: hexColor,
        overlayOpacity: opacity
    };

    const jsonString = JSON.stringify(exportData, null, 2);
    const blob = new Blob([jsonString], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "crash_advanced_theme.json";
    link.click();
    URL.revokeObjectURL(link.href);
}

// 4. Добавляем восстановление при импорте и загрузке по URL (Внутрь applyImportedThemeData)
const originalApplyImportedThemeData = applyImportedThemeData;
applyImportedThemeData = function(importedData) {
    if (importedData.spriteSize) {
        customSpriteSize = parseInt(importedData.spriteSize);
    }
    if (importedData.overlayBgColor) {
        document.getElementById('cfg_overlay_bg').value = importedData.overlayBgColor;
    }
    if (importedData.overlayOpacity) {
        document.getElementById('cfg_overlay_opacity').value = importedData.overlayOpacity;
    }

    originalApplyImportedThemeData(importedData);
};


// --- РАСПАКОВКА JSON С ДИСКА ---
function importConfigFromFile() {
    const fileOpts = document.getElementById('importFileOpts');
    if (!fileOpts || !fileOpts.files || !fileOpts.files[0]) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const importedData = JSON.parse(e.target.result);
            applyImportedThemeData(importedData);
            alert("🎉 Crash theme successfully loaded!");
        } catch (err) {
            console.error(err);
            alert("JSON payload error.");
        }
    };
    reader.readAsText(fileOpts.files[0]);
}

// --- ОДНОТИПНЫЙ РАСПАКОВЩИК ДЛЯ ИМПОРТА И URL ---
function applyImportedThemeData(importedData) {
    if (importedData.texts) {
        Object.assign(CRASH_THEME_CONFIG.texts, importedData.texts);
    }
    if (importedData.lineColor) {
        customLineColor = importedData.lineColor;
        const lineInput = document.getElementById('cfg_line_color');
        if (lineInput) lineInput.value = customLineColor;
    }
    if (importedData.spriteBlob) {
        customCrashSpriteBase64 = importedData.spriteBlob;
    }
    if (importedData.backgroundBlob) {
        customCrashBg = importedData.backgroundBlob;
    }

    // ВАЖНО: Восстанавливаем Base64-код фона канваса и скармливаем его объекту картинки
    if (importedData.canvasBgBlob) {
        customCanvasBgBase64 = importedData.canvasBgBlob;
        crashCanvasBgImg.src = customCanvasBgBase64;
    } else {
        customCanvasBgBase64 = "";
        crashCanvasBgImg.src = "";
    }

    if (importedData.spriteSize) {
        customSpriteSize = parseInt(importedData.spriteSize);
    }
    if (importedData.overlayBgColor) {
        const bgInput = document.getElementById('cfg_overlay_bg');
        if (bgInput) bgInput.value = importedData.overlayBgColor;
    }
    if (importedData.overlayOpacity) {
        const opacityInput = document.getElementById('cfg_overlay_opacity');
        if (opacityInput) opacityInput.value = importedData.overlayOpacity;
    }

    // Обновляем весь экран игры и превью
    applyCrashTheme();
    fillConfigInputs();
}


// --- ОБРАБОТЧИК АДРЕСНОЙ СТРОКИ (?edit=true&theme=имя) ---
async function checkUrlParametersAndLoad() {
    const urlParams = new URLSearchParams(window.location.search);
    const isEditMode = urlParams.get('edit') === 'true';
    const themeName = urlParams.get('theme');

    const configBtn = document.getElementById('adminConfigBtn');
    if (configBtn) {
        configBtn.style.display = isEditMode ? 'block' : 'none';
    }

    if (themeName) {
        const themeUrl = `../assets/casino/themes/${themeName}.json`;
        try {
            const response = await fetch(themeUrl);
            if (!response.ok) throw new Error(`Status: ${response.status}`);
            const importedData = await response.json();
            applyImportedThemeData(importedData);
            console.log(`[Crash Engine] Тема "${themeName}" накачена.`);
        } catch (error) {
            console.error("[Crash Engine] Ошибка автозагрузки пресета:", error);
        }
    }
}

// Запуск инициализации при чтении файла браузером
checkUrlParametersAndLoad();


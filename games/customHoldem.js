let isHlPlaying = false;

// Вспомогательный объект для значков мастей
const HL_SUIT_SYMBOLS = { 'H': '♥', 'D': '♦', 'C': '♣', 'S': '♠' };

// --- ГЛОБАЛЬНЫЕ НАСТРОЙКИ КАСТОМИЗАЦИИ ХОЛДЕМА ---
let customCardBack = ""; // Рубашка карт в Base64
let customVideoSrc = ""; // Видео в Base64 или локальный URL

const HOLDEM_THEME_CONFIG = {
    texts: {
        title: "🃏 CASINO HOLDEM",
        playBtn: "PLAY HAND",
        welcome: "Beat the dealer's poker hand!"
    }
};

// Функция ждет, пока видео доиграет до указанной секунды (например, 2.5 секунды)
function waitVideoPercentage(videoElement, percentage) {
    return new Promise((resolve) => {
        if (!videoElement) return resolve();

        const checkTime = () => {
            // Вычисляем целевую секунду на основе текущей длины видео
            const targetTime = videoElement.duration * percentage;

            if (videoElement.currentTime >= targetTime || videoElement.ended) {
                videoElement.removeEventListener('timeupdate', checkTime);
                resolve();
            }
        };

        videoElement.addEventListener('timeupdate', checkTime);
    });
}

// Универсальный рендерер карт для Холдема
function renderHlCards(containerId, cardsArray) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';

    cardsArray.forEach(cardStr => {
        const cardDiv = document.createElement('div');

        if (cardStr === 'XX') {
            cardDiv.className = 'hl-card-unit hl-back';
            cardDiv.innerText = '?';
        } else {
            const value = cardStr.charAt(0);
            const suit = cardStr.charAt(1);
            const isRed = (suit === 'H' || suit === 'D');

            cardDiv.className = `hl-card-unit ${isRed ? 'hl-red' : ''}`;
            cardDiv.innerHTML = `
                <div style="align-self: flex-start; line-height: 1;">${value === 'T' ? '10' : value}</div>
                <div style="align-self: center; font-size: 22px; line-height: 1;">${HL_SUIT_SYMBOLS[suit] || suit}</div>
            `;
        }
        container.appendChild(cardDiv);
    });
}

// Главная функция запуска раздачи Холдема
async function hlSpin() {
    if (isHlPlaying) return;

    if (!currentUser) {
        document.getElementById('msgBoxHl').innerText = "Please login first!";
        document.getElementById('msgBoxHl').style.color = "#e94560";
        return;
    }

    if (currentBalance < 20) {
        document.getElementById('msgBoxHl').innerText = "Not enough coins!";
        document.getElementById('msgBoxHl').style.color = "#e94560";
        return;
    }

    // Блокируем интерфейс
    isHlPlaying = true;
    document.getElementById('hlSpinBtn').disabled = true;
    document.getElementById('msgBoxHl').innerText = "Dealing...";
    document.getElementById('msgBoxHl').style.color = "#8a8ab0";

    // Сброс интерфейса перед началом
    document.getElementById('hlPlayerComboLabel').innerText = '?';
    document.getElementById('hlDealerComboLabel').innerText = '?';
    document.getElementById('hlPlayerCards').innerHTML = '';
    document.getElementById('hlDealerCards').innerHTML = '';
    document.getElementById('hlBoardCards').innerHTML = '';

    const bgVideo = document.getElementById('hlVideoBg');

    try {
        // 1. Сразу запускаем видео с самого начала
        if (bgVideo) {
            bgVideo.muted = true; // Принудительный mute для прохождения политик браузера
            bgVideo.currentTime = 0;

            // Запускаем и обрабатываем возможный отказ браузера
            let playPromise = bgVideo.play();
            if (playPromise !== undefined) {
                playPromise.catch(error => {
                    console.log("Браузер заблокировал автовоспроизведение, пробуем еще раз:", error);
                    // Повторная попытка
                    bgVideo.play();
                });
            }
        }

        // 2. Параллельно отправляем запрос на сервер, чтобы данные уже были готовы
        const response = await fetch(baseUrlApi + '/holdem/spin', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: currentUser, partnerId: globalPartnerId, token: globalGameSession })
        });
        const data = await response.json();

        if (data.error) {
            document.getElementById('msgBoxHl').innerText = data.error;
            document.getElementById('msgBoxHl').style.color = "#e94560";
            if (bgVideo) { bgVideo.pause(); bgVideo.currentTime = 0; }
            isHlPlaying = false;
            document.getElementById('hlSpinBtn').disabled = false;
            return;
        }

        // Обновляем баланс в фоне
        currentBalance = data.balance;
        if (typeof balanceLabel !== 'undefined' && balanceLabel) balanceLabel.innerText = currentBalance;

        // 3. СИНХРОНИЗАЦИЯ С ВИДЕО
        // Здесь вы можете настроить задержки (в миллисекундах) под ваше видео,
        // чтобы карты появлялись ровно тогда, когда они сдаются на видео.

        // Показываем рубашки карт дилера и карты игрока
        renderHlCards('hlDealerCards', ['XX', 'XX']);
        await waitVideoPercentage(bgVideo, 0.20);

        renderHlCards('hlPlayerCards', data.playerHand);
        document.getElementById('hlPlayerComboLabel').innerText = data.playerCombo;
        await waitVideoPercentage(bgVideo, 0.50); // Ждем пока дилер на видео сдаст Флоп

        // Выкладываем Флоп (первые 3 карты)
        renderHlCards('hlBoardCards', data.communityCards.slice(0, 3));
        await waitVideoPercentage(bgVideo, 0.75); // Ждем Тёрн и Ривер на видео

        // Выкладываем оставшиеся общие карты
        renderHlCards('hlBoardCards', data.communityCards);
        await waitVideoPercentage(bgVideo, 0.95); // Ждем финальный момент видео (открытие карт дилера)

        // Вскрываем карты дилера
        renderHlCards('hlDealerCards', data.dealerHand);
        document.getElementById('hlDealerComboLabel').innerText = data.dealerCombo;

        // 4. ОЖИДАНИЕ ОКОНЧАНИЯ ВИДЕО
        // Если видео еще не доиграло до конца, скрипт послушно ждет его завершения
        if (bgVideo && !bgVideo.ended) {
            await new Promise(resolve => {
                bgVideo.onended = resolve;
                // Предохранитель: если видео зависнет, через 4 секунды игра все равно завершится
                setTimeout(resolve, 6000);
            });
        }

        // 5. ВЫВОД РЕЗУЛЬТАТА И СБРОС НА СТАРТ
        // Видео закончилось -> выводим победный/проигрышный текст
        const msgBox = document.getElementById('msgBoxHl');
        if (data.status === 'WIN') {
            msgBox.innerHTML = `🎉 You Win! +${data.prize} 🪙`;
            msgBox.style.color = "#4ecca3";
        } else if (data.status === 'PUSH') {
            msgBox.innerText = "Push! Bet returned. 🪙";
            msgBox.style.color = "#8a8ab0";
        } else {
            msgBox.innerText = "Dealer wins this hand! ❌";
            msgBox.style.color = "#e94560";
        }

    } catch (err) {
        console.error("Holdem error:", err);
        document.getElementById('msgBoxHl').innerText = "Server error. Try again.";
        document.getElementById('msgBoxHl').style.color = "#e94560";
    } finally {
        // Возвращаем видео к статичной стартовой картинке (первому кадру)
        if (bgVideo) {
            bgVideo.pause();
            bgVideo.currentTime = 0;
            bgVideo.onended = null; // Очищаем событие
        }
        isHlPlaying = false;
        document.getElementById('hlSpinBtn').disabled = false;
    }
}



// Применение текстов и стилей темы на страницу
function applyHoldemTheme() {
    const cfg = HOLDEM_THEME_CONFIG;

    const titleEl = document.querySelector('#hlGame h1');
    if (titleEl) titleEl.innerText = cfg.texts.title;

    const btnEl = document.getElementById('hlSpinBtn');
    if (btnEl && !isHlPlaying) btnEl.innerText = cfg.texts.playBtn;

    const msgBox = document.getElementById('msgBoxHl');
    if (msgBox && !isHlPlaying) msgBox.innerText = cfg.texts.welcome;

    // Накатываем рубашку карт, если она загружена
    const root = document.documentElement;
    if (customCardBack) {
        root.style.setProperty('--card-back', `url(${customCardBack})`);
    } else {
        root.style.removeProperty('--card-back');
    }
}

// Модифицируем универсальный рендерер карт, чтобы он учитывал кастомную рубашку
const originalRenderHlCards = renderHlCards;
renderHlCards = function(containerId, cardsArray) {
    originalRenderHlCards(containerId, cardsArray);

    // Если есть кастомная рубашка, добавляем класс-флаг, отключающий стандартный значок клевера
    if (customCardBack) {
        const containers = document.getElementById(containerId);
        if (containers) {
            containers.querySelectorAll('.hl-back').forEach(card => card.classList.add('custom-active'));
        }
    }
};

// --- ЛОГИКА ИНТЕРФЕЙСА ПАНЕЛИ НАСТРОЕК ---
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
    const cfg = HOLDEM_THEME_CONFIG.texts;
    document.getElementById('cfg_txt_title').value = cfg.title;
    document.getElementById('cfg_txt_btn').value = cfg.playBtn;
    document.getElementById('cfg_txt_welcome').value = cfg.welcome;

    const preview = document.getElementById('previewCardBack');
    if (preview && customCardBack) {
        preview.innerText = "";
        preview.style.backgroundImage = `url(${customCardBack})`;
    }
}

// Обработка загрузки файла рубашки карт
function handleCardBackLoad() {
    const fileInput = document.getElementById('cardBackInput');
    const preview = document.getElementById('previewCardBack');

    if (fileInput.files && fileInput.files[0]) {
        const reader = new FileReader();
        reader.onload = function (e) {
            customCardBack = e.target.result;
            preview.innerText = "";
            preview.style.backgroundImage = `url(${e.target.result})`;
        };
        reader.readAsDataURL(fileInput.files[0]);
    }
}

// Обработка загрузки тяжелого видеофайла стола
function handleVideoLoad() {
    const fileInput = document.getElementById('videoBgInput');
    const videoElement = document.getElementById('hlVideoBg');

    if (fileInput.files && fileInput.files[0]) {
        const reader = new FileReader();
        reader.onload = function (e) {
            customVideoSrc = e.target.result;
            if (videoElement) {
                videoElement.src = e.target.result;
                videoElement.currentTime = 0;
            }
        };
        reader.readAsDataURL(fileInput.files[0]);
    }
}

// Применение настроек из меню на живой экран
function saveAndApplyConfig() {
    const cfg = HOLDEM_THEME_CONFIG.texts;
    cfg.title = document.getElementById('cfg_txt_title').value;
    cfg.playBtn = document.getElementById('cfg_txt_btn').value;
    cfg.welcome = document.getElementById('cfg_txt_welcome').value;

    applyHoldemTheme();
    toggleConfigPanel();
}

// --- ЭКСПОРТ КОНФИГУРАЦИИ В JSON ---
function exportConfigToFile() {
    const exportData = {
        themeTitle: HOLDEM_THEME_CONFIG.texts.title,
        texts: HOLDEM_THEME_CONFIG.texts,
        cardBackBlob: customCardBack,
        videoBlob: customVideoSrc
    };

    const jsonString = JSON.stringify(exportData, null, 2);
    const blob = new Blob([jsonString], { type: "application/json" });
    const link = document.createElement("a");
    const fileName = HOLDEM_THEME_CONFIG.texts.title.toLowerCase().replace(/[^a-z0-9]/g, "_") + "_holdem_theme.json";

    link.href = URL.createObjectURL(blob);
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(link.href);
}

// --- ИМПОРТ ИЗ JSON С КОМПЬЮТЕРА ---
function importConfigFromFile() {
    const fileOpts = document.getElementById('importFileOpts');
    if (!fileOpts || !fileOpts.files || !fileOpts.files[0]) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const importedData = JSON.parse(e.target.result);
            applyImportedThemeData(importedData);
            alert(`🎉 Holdem theme "${importedData.themeTitle || 'Import'}" loaded!`);
        } catch (err) {
            console.error(err);
            alert("JSON syntax error.");
        }
    };
    reader.readAsText(fileOpts.files[0]);
}

// --- УНИВЕРСАЛЬНЫЙ НАКАТ СТРУКТУРЫ ДАННЫХ ---
function applyImportedThemeData(importedData) {
    if (importedData.texts) {
        Object.assign(HOLDEM_THEME_CONFIG.texts, importedData.texts);
    }
    if (importedData.cardBackBlob) {
        customCardBack = importedData.cardBackBlob;
    }
    if (importedData.videoBlob) {
        customVideoSrc = importedData.videoBlob;
        const videoElement = document.getElementById('hlVideoBg');
        if (videoElement) {
            videoElement.src = importedData.videoBlob;
            videoElement.currentTime = 0;
        }
    }

    applyHoldemTheme();
    fillConfigInputs();
}

// --- СЧИТЫВАНИЕ URL ПАРАМЕТРОВ (?edit=true&theme=имя) ---
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
            if (!response.ok) throw new Error(`Тема ${themeName}.json не найдена на сервере.`);
            const importedData = await response.json();
            applyImportedThemeData(importedData);
            console.log(`[Holdem Engine] Тема "${themeName}" успешно загружена.`);
        } catch (error) {
            console.error("[Holdem Engine] Ошибка автозагрузки пресета:", error);
        }
    }
}

// Автоматический пуск при сборке скрипта
checkUrlParametersAndLoad();






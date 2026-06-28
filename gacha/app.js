import { API_URL, initTownScrollListeners, t } from './shared.js';
import { Game, updateState } from './stateManager.js';

// =========================================================================
// АВТОМАТИЧЕСКАЯ ПОДМЕНА ССЫЛОК ДЛЯ ВСЕЙ ИГРЫ (ОДИН РАЗ НА ВЕСЬ ПРОЕКТ)
// =========================================================================

// 1. Перехватываем установку src у ВСЕХ картинок (теги <img>)
// const originalSrcDescriptor = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
//
// Object.defineProperty(HTMLImageElement.prototype, 'src', {
//     set: function(val) {
//         if (typeof val === 'string' && val.trim() !== '') {
//             const cleanUrl = val.trim();
//             // Если в кэше есть blob-версия этой ссылки — подставляем её скрытно
//             if (window.gameAssets && window.gameAssets[cleanUrl] && window.gameAssets[cleanUrl] !== 'loading') {
//                 return originalSrcDescriptor.set.call(this, window.gameAssets[cleanUrl]);
//             }
//         }
//         // Если в кэше нет — пускаем оригинальную ссылку как обычно
//         return originalSrcDescriptor.set.call(this, val);
//     },
//     get: function() {
//         return originalSrcDescriptor.get.call(this);
//     }
// });
//
// // 2. Перехватываем установку backgroundImage у ВСЕХ элементов через style
// const originalBgDescriptor = Object.getOwnPropertyDescriptor(CSSStyleDeclaration.prototype, 'backgroundImage');
//
// Object.defineProperty(CSSStyleDeclaration.prototype, 'backgroundImage', {
//     set: function(val) {
//         if (typeof val === 'string' && val.trim() !== '') {
//             const cleanStr = val.trim();
//             // Если в кэше есть готовая CSS-строка url("blob:...") — подставляем её
//             if (window.gameAssets && window.gameAssets[cleanStr] && window.gameAssets[cleanStr] !== 'loading') {
//                 return originalBgDescriptor.set.call(this, window.gameAssets[cleanStr]);
//             }
//         }
//         return originalBgDescriptor.set.call(this, val);
//     },
//     get: function() {
//         return originalBgDescriptor.get.call(this);
//     }
// });

// =========================================================================
// ГЛОБАЛЬНЫЙ ПЕРЕХВАТЧИК ДИНАМИЧЕСКОГО HTML (MUTATION OBSERVER + SETTERS)
// =========================================================================

// Вспомогательная функция для поиска и замены url() в CSS-строках
function replaceUrlsInCssString(cssString) {
    if (!cssString || typeof cssString !== 'string' || !cssString.includes('url(')) {
        return cssString;
    }
    return cssString.replace(/url\(['"]?([^'")]+)['"]?\)/g, (match, urlInside) => {
        const cleanUrl = urlInside.trim();
        if (window.gameAssets && window.gameAssets[cleanUrl] && window.gameAssets[cleanUrl] !== 'loading') {
            return `url("${window.gameAssets[cleanUrl]}")`;
        }
        return match;
    });
}

// 1. Обработка конкретного элемента (проверка картинок и инлайн-стилей)
function processElement(el) {
    if (!el || el.nodeType !== Node.ELEMENT_NODE) return;

    // Если это тег <img>, проверяем его src
    if (el.tagName === 'IMG') {
        const currentSrc = el.getAttribute('src');
        if (currentSrc && window.gameAssets && window.gameAssets[currentSrc] && window.gameAssets[currentSrc] !== 'loading') {
            el.src = window.gameAssets[currentSrc];
        }
    }

    // Проверяем инлайн-стили любого элемента на наличие url()
    const currentStyle = el.getAttribute('style');
    if (currentStyle && currentStyle.includes('url(')) {
        const updatedStyle = replaceUrlsInCssString(currentStyle);
        if (currentStyle !== updatedStyle) {
            // Отключаем на секунду наблюдатель, чтобы не вызвать бесконечный цикл
            observer.disconnect();
            el.setAttribute('style', updatedStyle);
            startObserving();
        }
    }
}

// 2. Инициализация MutationObserver для отслеживания динамического HTML
const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
        // Если добавились новые элементы (например, отрисовался новый персонаж через innerHTML)
        if (mutation.type === 'childList') {
            mutation.addedNodes.forEach(node => {
                if (node.nodeType === Node.ELEMENT_NODE) {
                    processElement(node);
                    // Проверяем также всех вложенных детей внутри добавленного узла
                    node.querySelectorAll('*').forEach(processElement);
                }
            });
        }
        // Если у существующего элемента динамически изменился атрибут style
        else if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
            processElement(mutation.target);
        }
    }
});

function startObserving() {
    observer.observe(document.body, {
        childList: true,      // Следить за добавлением новых тегов
        subtree: true,        // Следить по всей глубине документа
        attributes: true,     // Следить за изменением атрибутов
        attributeFilter: ['style'] // Интересует только изменение инлайн-стилей
    });
}

// 3. Сохраняем стандартные JS-перехватчики (для точечной установки через el.style.X)
const originalSrcDescriptor = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
Object.defineProperty(HTMLImageElement.prototype, 'src', {
    set: function(val) {
        if (typeof val === 'string' && val.trim() !== '') {
            const cleanUrl = val.trim();
            if (window.gameAssets && window.gameAssets[cleanUrl] && window.gameAssets[cleanUrl] !== 'loading') {
                return originalSrcDescriptor.set.call(this, window.gameAssets[cleanUrl]);
            }
        }
        return originalSrcDescriptor.set.call(this, val);
    },
    get: function() { return originalSrcDescriptor.get.call(this); }
});

const originalBgDescriptor = Object.getOwnPropertyDescriptor(CSSStyleDeclaration.prototype, 'backgroundImage');
Object.defineProperty(CSSStyleDeclaration.prototype, 'backgroundImage', {
    set: function(val) {
        return originalBgDescriptor.set.call(this, replaceUrlsInCssString(val));
    },
    get: function() { return originalBgDescriptor.get.call(this); }
});

// Запускаем слежку сразу при подключении скрипта
// if (document.body) {
//     startObserving();
// } else {
//     document.addEventListener('DOMContentLoaded', startObserving);
// }


let customConfig;



window.gameAssets = {};

const assetCache = {
    // Теперь функция гарантированно возвращает Promise с базой данных внутри
    init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(Game.gameId + 'GameAssetsDB', 1);

            // Создаем хранилище при первом запуске
            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains('resources')) {
                    db.createObjectStore('resources');
                }
            };

            // Возвращаем объект базы данных при успешном открытии
            request.onsuccess = (e) => {
                resolve(e.target.result);
            };

            request.onerror = (e) => {
                reject(e.target.error);
            };
        });
    },

    async get(url) {
        if (!url || typeof url !== 'string' || url.startsWith('blob:') || url.startsWith('data:')) {
            return url;
        }

        try {
            // Ждем инициализации базы данных (теперь тут будет объект базы, а не undefined)
            const db = await this.init();

            return new Promise((resolve) => {
                const tx = db.transaction('resources', 'readonly');
                const store = tx.objectStore('resources');
                const req = store.get(url);

                req.onsuccess = async () => {
                    if (req.result) {
                        // Файл найден в IndexedDB, возвращаем локальную blob-ссылку
                        resolve(URL.createObjectURL(req.result));
                    } else {
                        // Файла нет в базе, скачиваем из сети
                        try {
                            const res = await fetch(url);
                            if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
                            const blob = await res.blob();

                            // Сохраняем скачанный Blob в IndexedDB
                            const writeTx = db.transaction('resources', 'readwrite');
                            writeTx.objectStore('resources').put(blob, url);

                            resolve(URL.createObjectURL(blob));
                        } catch (err) {
                            console.error(`Не удалось скачать ресурс [${url}]:`, err);
                            resolve(url); // Фолбэк на сеть в случае ошибки
                        }
                    }
                };

                req.onerror = () => resolve(url);
            });
        } catch (err) {
            console.error('Ошибка инициализации IndexedDB:', err);
            return url; // Если база вообще не открылась, игра будет грузить картинки по сети напрямую
        }
    }
};


function cacheConfigUrls(obj, promises = []) {
    if (!obj || typeof obj !== 'object') return promises;

    const allowedExtensions = /\.(png|jpg|jpeg|webp|svg|glb)(\?.*)?$/i;

    for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
            const val = obj[key];

            if (typeof val === 'string' && val.trim() !== '') {
                const originalStr = val.trim();
                let cleanUrl = originalStr;
                const isCssUrl = originalStr.startsWith('url(');

                if (isCssUrl) {
                    cleanUrl = originalStr.replace(/^url\(['"]?|['"]?\)$/g, '').trim();
                }

                // Фильтр от мусора и эмодзи
                if (cleanUrl.length < 4 || (!cleanUrl.includes('.') && !cleanUrl.includes('/'))) {
                    continue;
                }

                if (!allowedExtensions.test(cleanUrl)) {
                    continue;
                }

                // Если файл уже обрабатывается или скачан — пропускаем
                if (window.gameAssets[cleanUrl]) {
                    continue;
                }

                // Сразу помечаем, чтобы не дублировать запросы
                window.gameAssets[cleanUrl] = 'loading';
                if (isCssUrl) window.gameAssets[originalStr] = 'loading';

                // Запускаем старую рабочую логику скачивания в IndexedDB
                promises.push(
                    assetCache.get(cleanUrl).then(blobUrl => {
                        window.gameAssets[cleanUrl] = blobUrl;

                        if (isCssUrl) {
                            window.gameAssets[originalStr] = `url("${blobUrl}")`;
                        }

                        // БЕЗОПАСНЫЙ ПРЕДРЕНДЕР:
                        // Если это картинка, просто пускаем её через стандартный Image().
                        // Браузер сам раскодирует её в кэш без вызова ошибок и фризов.
                        if (!cleanUrl.endsWith('.glb')) {
                            const img = new Image();
                            img.src = blobUrl;
                        }
                    }).catch(() => {
                        // Если что-то пошло не так — просто возвращаем оригинал, игра не упадет
                        window.gameAssets[cleanUrl] = cleanUrl;
                        if (isCssUrl) window.gameAssets[originalStr] = originalStr;
                    })
                );

            } else if (typeof val === 'object') {
                // Корректная рекурсия, которая у вас работала
                promises = cacheConfigUrls(val, promises);
            }
        }
    }
    return promises;
}




// Управление экраном загрузки
window.loaderControl = {
    start: () => {
        const loader = document.getElementById('loading-wrapper');
        const viewer = document.getElementById('elf');
        loader.style.opacity = '1';
        loader.style.display = 'block';
        if (viewer && typeof viewer.play === 'function') viewer.play();
    },
    end: () => {
        const loader = document.getElementById('loading-wrapper');
        const viewer = document.getElementById('elf');
        loader.style.opacity = '0';
        setTimeout(() => {
            loader.style.display = 'none';
            if (viewer && typeof viewer.pause === 'function') viewer.pause();
        }, 400);
    }
};



async function initWrapper() {
    const urlParams = new URLSearchParams(window.location.search);
    Game.gameId = urlParams.get('game_id') || 'game_combat_stars';
    // Game.gameId = urlParams.get('game_id') || 'game_casino';
    Game.deviceId = localStorage.getItem('mock_device_id') || 'dev_' + Math.random().toString(36).substr(2, 5);
    localStorage.setItem('mock_device_id', Game.deviceId);
    Game.locale = urlParams.get('locale') || 'en';

    Game.uiContainer = document.getElementById('game-ui');

    try {
        const res = await fetch(`${API_URL}/auth/init-game?game_id=${Game.gameId}`);
        if (res.error) throw new Error('Network error');
        const config = customConfig || await res.json();
        Game.config = config;

        console.log('Начался разбор конфига и кэширование картинок...');
        const downloadPromises = cacheConfigUrls(Game.config);
        await Promise.all(downloadPromises);
        console.log('Все картинки в кэше, игра готова к запуску!');

        startObserving();

        updateState('GAME_LOGIN');
        window.loaderControl.end();
    } catch (err) {
        console.error(err);
        Game.uiContainer.innerHTML = `<div style="padding:40px; color:#ff8a80; font-size:20px; text-align:center;">❌ Error: ${err.message}</div>`;
    }

    initTownScrollListeners();
    initGlobalFullscreen();
}

window.t = t;
window.onload = initWrapper;
window.initWrapper = initWrapper;

window.addEventListener('message', function(event) {
    console.log(event);
    if (!event.data || event.data.type !== 'CONFIG_UI_UPDATE') return;

    const payload = event.data;

    console.log("Full game configuration synchronized with admin state:");

    // Перезаписываем глобальный объект конфигурации в игре данными из админки

    // По желанию можно вытащить служебные переменные админки:
    // const activeOrientation = payload.currentOrientation;
    // const activeWidgetIdx = payload.currentUiWidgetIdx;

    customConfig = payload.fullConfig;

    initWrapper();
});

screen.orientation.addEventListener("change", () => {
    console.log(`New orientation: ${screen.orientation.type}`);
    updateState(Game.gameState);
});

/**
 * Инициализирует независимую глобальную кнопку Fullscreen.
 * Инжектится прямо в body и работает в обход игровых стейтов.
 */
function initGlobalFullscreen() {
    // Защита от дублирования: если кнопка уже создана, ничего не делаем
    if (document.getElementById('global-fs-button')) return;

    // Вживляем кнопку в самый корень документа
    const btnHTML = `
        <div id="global-fs-button" class="global-fullscreen-btn" title="Fullscreen">
            <img src="./assets/icons/fs_enable.png" style="width: 100%">
        </div>
    `;
    document.getElementById('wrapper').insertAdjacentHTML('beforeend', btnHTML);

    const fsBtn = document.getElementById('global-fs-button');

    // Функция переключения полноэкранного режима
    fsBtn.onclick = (e) => {
        e.stopPropagation(); // Защита от ложных триггеров на фоне

        if (!document.fullscreenElement) {
            // Если экран не развернут — разворачиваем весь корневой документ
            document.documentElement.requestFullscreen()
                .catch(err => {
                    console.error(`[Fullscreen Error]: ${err.message}`);
                });
        } else {
            // Если уже в фуллскрине — нативно выходим из него
            document.exitFullscreen();
        }
    };

    // Слушатель изменения состояния экрана (меняем иконку)
    // Нужен для того, чтобы если игрок вышел из фуллскрина кнопкой ESC на клавиатуре,
    // иконка на нашей кнопке тоже синхронно поменялась обратно
    document.addEventListener('fullscreenchange', () => {
        if (document.fullscreenElement) {
            // fsBtn.innerHTML = '🗖'; // Иконка свернутого окна
            fsBtn.innerHTML = '<img src="./assets/icons/fs_disable.png" style="width: 100%">'
        } else {
            // fsBtn.innerHTML = '📺'; // Иконка телевизора/монитора
            fsBtn.innerHTML = '<img src="./assets/icons/fs_enable.png" style="width: 100%">';
        }
    });
}


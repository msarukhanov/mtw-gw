const baseUrl = (location.hostname === 'localhost') ? 'http://localhost:3000' : 'https://mtw-gw.onrender.com';
export const API_URL = baseUrl + '/api/vgb';
export const SOCKET_URL = baseUrl;

export function t(key, Game, replaceValue = null) {
    const lang = Game.locale || 'ru';

    // Безопасно идем по новому пути: config.localization.ui.[язык].[ключ]
    let text = Game.config?.localization?.ui?.[lang]?.[key] || Game.config?.localization?.dialogs?.[lang]?.[key] || key;

    if (replaceValue !== null) {
        text = text.replace('{value}', replaceValue);
    }
    return text;
}

export function locObj(obj, Game) {
    if (!obj) return '';
    const lang = Game.locale || 'en';
    return obj[lang] || obj['en'] || ''; // Откатываемся на английский, если перевода нет
}

export function getWindowContentStyle(Game) {
    const settings = Game.config?.ui?.windows_settings || {};

    // Пропускаем формулу top через наш applyLayout с авто-оберткой calc()
    const formatValue = (val) => {
        if (!val) return 'unset';
        if (typeof val === 'string' && /[\+\-\*\/]/.test(val) && !val.includes('calc')) {
            return `calc(${val})`;
        }
        return val;
    };

    return `
        top: ${formatValue(settings.content_top || '15%')};
        bottom: ${settings.content_bottom || '5%'};
        left: ${settings.content_left || '5%'};
        width: ${settings.content_width || '90%'};
    `.replace(/\s+/g, ' ');
}

export function applyLayout(layout) {
    if (!layout) return '';

    const formatValue = (val) => {
        if (!val || val === 'unset' || val === 'auto') return 'unset';
        if (typeof val === 'number') return `${val}%`;
        if (typeof val === 'string' && /[\+\-\*\/]/.test(val) && !val.includes('calc')) {
            return `calc(${val})`;
        }
        return val;
    };

    const getHalf = (val) => {
        if (!val || val === 'unset' || val === 'auto') return '0px';
        if (typeof val === 'string' && val.includes('px')) return `${parseFloat(val) / 2}px`;
        if (typeof val === 'string' && val.includes('%')) return `${parseFloat(val) / 2}%`;
        return `${parseFloat(val) / 2}%`;
    };

    const w = formatValue(layout.width); const h = formatValue(layout.height);
    const halfW = getHalf(layout.width); const halfH = getHalf(layout.height);

    const top = layout.top ? `calc(${formatValue(layout.top)} - ${halfH})` : 'unset';
    const bottom = layout.bottom ? `calc(${formatValue(layout.bottom)} - ${halfH})` : 'unset';
    const left = layout.left ? `calc(${formatValue(layout.left)} - ${halfW})` : 'unset';
    const right = layout.right ? `calc(${formatValue(layout.right)} - ${halfW})` : 'unset';

    return `
        position: absolute;
        top: ${top}; bottom: ${bottom}; left: ${left}; right: ${right};
        width: ${w}; height: ${h};
        background-color: ${layout.backgroundColor || 'transparent'};
        background-image: ${layout.backgroundImage || 'none'};
        background-size: contain;
        background-repeat: no-repeat;
        background-position: center;
        color: ${layout.textColor || '#ffffff'};
        border: none; outline: none;
    `.replace(/\s+/g, ' ');
}

export function getFormattedTime(time) {
    // Берем текущее время ПК и корректируем его на смещение сервера
    const actualServerTimestamp = Date.now() + (time || 0);
    const date = new Date(actualServerTimestamp);

    // Красиво форматируем с ведущими нулями (например, 09:05 вместо 9:5)
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');

    return `${hours}:${minutes}`;
}

export function parseEffectText(effInstance, Game) {
    const lang = Game.locale || 'ru';
    const effMeta = Game.config?.mechanics?.effects?.[effInstance.effect_id];
    const rawTemplate = Game.config?.localization?.effects?.[lang]?.[effMeta?.desc_loc_key] || 'Unknown effect';

    let text = rawTemplate.replace('{value}', effInstance.value);
    if (effInstance.target_stat_id) {
        const statName = Game.config?.localization?.stats?.[lang]?.[effInstance.target_stat_id] || effInstance.target_stat_id;
        const statMeta = Game.config?.mechanics?.stats?.[effInstance.target_stat_id];
        text = text.replace('выбранный стат', `<b style="color:#ffcc00">${statMeta?.icon || ''} ${statName}</b>`);
        text = text.replace('selected stat', `<b style="color:#ffcc00">${statMeta?.icon || ''} ${statName}</b>`);
    }
    return text;
}

export function getHeroRating(hero, Game) {
    const statsMeta = Game.config?.mechanics?.stats || {};
    const prototype = Game.config.catalog?.heroes?.[hero.hero_id];
    if (!prototype) return 0; // Возвращаем 0 вместо строки, чтобы не ломать математику

    let totalPowerRating = 0;

    Object.keys(statsMeta).forEach(statId => {
        // 1. Базовое значение и прирост за уровень из прототипа героя
        const base = prototype.base_stats?.[statId] || 0;
        const growth = prototype.stats_growth?.[statId] || 0;

        // Формула: Уровень в конфиге начинается с 1, значит (level - 1) * growth,
        // либо оставляем твой вариант (growth * level), если у тебя шаг идет с нулевого уровня
        let totalValue = base + (growth * (hero.level || 1));

        // 2. Добавляем статы от надетого оружия (безопасный поиск по твоему каталогу)
        const weaponId = hero.equipped?.weapon;
        if (weaponId) {
            const itemConfig = Game.config.catalog?.items?.[weaponId];
            if (itemConfig && itemConfig.stats && itemConfig.stats[statId]) {
                totalValue += itemConfig.stats[statId];
            }
        }

        // 3. ИСПРАВЛЕНО: Берем rating_weight из механики конфига, а не из героя
        const weight = statsMeta[statId]?.rating_weight || 0;

        totalPowerRating += totalValue * weight;
    });

    return totalPowerRating;
}



let isDown = false;
let startX;
let scrollLeft;

export function initTownScrollListeners() {
    const viewport = document.getElementById('town-viewport');
    if (!viewport) return;

    // МЕХАНИКА DRAG-TO-SCROLL (Перетаскивание мышкой на ПК)
    viewport.addEventListener('mousedown', (e) => {
        isDown = true;
        startX = e.pageX - viewport.offsetLeft;
        scrollLeft = viewport.scrollLeft;
    });
    viewport.addEventListener('mouseleave', () => { isDown = false; });
    viewport.addEventListener('mouseup', () => { isDown = false; });
    viewport.addEventListener('mousemove', (e) => {
        if (!isDown) return;
        e.preventDefault();
        const x = e.pageX - viewport.offsetLeft;
        const walk = (x - startX) * 1.5; // Скорость скролла
        viewport.scrollLeft = scrollLeft - walk;
    });
}

// Умный менеджер фонов с автоматической первичной центровкой
// frontend/app.js

export function updateBackground222(state, config) {
    const wrapper = document.getElementById('wrapper');
    const bgElement = document.getElementById('game-bg');
    const bgImg = document.getElementById('image-bg');
    if (!wrapper || !bgElement || !bgImg || !config || !config.ui) return;

    const orientation = config.orientation || 'landscape';
    const widgets = config.ui[orientation] || [];

    let screenWidgetId = 'screen_main_menu';
    if (state === 'SERVER_SELECT') screenWidgetId = 'screen_server_select';
    else if (state === 'SHOP') screenWidgetId = 'screen_shop';
    else if (state === 'GACHA') screenWidgetId = 'screen_gacha';
    else if (state === 'INVENTORY') screenWidgetId = 'screen_inventory';
    else if (state === 'HEROES') screenWidgetId = 'screen_heroes';
    else if (state === 'GAMES') screenWidgetId = 'screen_games';
    else if (state === 'ARENA') screenWidgetId = 'screen_arena';
    else if (state === 'PROFILE') screenWidgetId = 'screen_profile';

    const screenMeta = widgets.find(w => w.id === screenWidgetId);

    // Безопасная проверка наличия картинки
    const hasImage = !!(screenMeta && screenMeta.bg_image);
    bgImg.style.display = hasImage ? 'block' : 'none';

    // Функция сброса в стандартный фолбэк (100% экрана, скролл отключен)
    const resetToFullscreen = () => {
        bgImg.style.width = '100vw';
        bgImg.style.height = '100vh';
        bgElement.style.width = '100vw';
        bgElement.style.height = '100vh';
    };

    if (hasImage) {
        // Вешаем колбэк ДО назначения src, чтобы гарантированно поймать загрузку (даже из кэша)
        bgImg.onload = () => {
            // Защита: если пока картинка грузилась, игрок уже ушел на другой экран
            if (bgImg.getAttribute('src') !== screenMeta.bg_image) return;

            const imgWidth = bgImg.naturalWidth;
            const imgHeight = bgImg.naturalHeight;

            if (!imgWidth || !imgHeight) {
                resetToFullscreen();
                return;
            }

            // Вычисляем реальное соотношение сторон самого файла картинки
            const imgAspectRatio = imgWidth / imgHeight;

            if (state === 'MAIN_MENU') {
                if (orientation === 'landscape') {
                    // --- ЛАНДШАФТ: Высота 100vh, ширина зависит от пропорций картинки ---
                    // Вычисляем физическую ширину в пикселях, которую должна занять картинка при высоте 100vh
                    const calculatedWidthPx = window.innerHeight * imgAspectRatio;

                    // Переводим пиксели в точный, честныйvw
                    const targetVw = (calculatedWidthPx / window.innerWidth) * 100;
                    const targetWidthStr = `${targetVw}vw`;

                    bgImg.style.width = targetWidthStr;
                    bgImg.style.height = '100vh';
                    bgElement.style.width = targetWidthStr;
                    bgElement.style.height = '100vh';

                    // Центрируем нативный скролл wrapper'а
                    requestAnimationFrame(() => {
                        wrapper.scrollTo({
                            left: (wrapper.scrollWidth - window.innerWidth) / 2,
                            top: 0,
                            behavior: 'instant'
                        });
                    });
                } else {
                    // --- ПОРТРЕТ: Ширина 100vw, высота зависит от пропорций картинки ---
                    // Вычисляем физическую высоту в пикселях при ширине 100vw
                    const calculatedHeightPx = window.innerWidth / imgAspectRatio;

                    // Переводим пиксели в честный vh
                    const targetVh = (calculatedHeightPx / window.innerHeight) * 100;
                    const targetHeightStr = `${targetVh}vh`;

                    bgImg.style.width = '100vw';
                    bgImg.style.height = targetHeightStr;
                    bgElement.style.width = '100vw';
                    bgElement.style.height = targetHeightStr;

                    // Центрируем нативный скролл по вертикали
                    requestAnimationFrame(() => {
                        wrapper.scrollTo({
                            left: 0,
                            top: (wrapper.scrollHeight - wrapper.clientHeight) / 2,
                            behavior: 'instant'
                        });
                    });
                }
            } else {
                // Если это не главное меню, а окно — просто растягиваем картинку по экрану
                resetToFullscreen();
            }
        };

        // Запускаем загрузку ассета
        bgImg.src = screenMeta.bg_image;
    } else {
        bgImg.src = '';
        resetToFullscreen();
    }
}


export function updateBackground(state, config) {
    const wrapper = document.getElementById('wrapper');
    const bgElement = document.getElementById('game-bg');
    const bgImg = document.getElementById('image-bg');
    if (!wrapper || !bgElement || !bgImg || !config || !config.ui) return;

    const orientation = config.orientation || 'landscape';
    const widgets = config.ui[orientation] || [];

    const orientationType = screen.orientation.type;   // e.g., "portrait-primary"
    const orientationAngle = screen.orientation.angle; // e.g., 0, 90, 180, 270
    const isLandscape =  orientationType.includes('landscape');
    const isPortrait =  orientationType.includes('portrait');
    console.log(`Type: ${orientationType}, Angle: ${orientationAngle}`, isLandscape, isPortrait);

    let screenWidgetId = 'screen_main_menu';
    if (state === 'GAME_LOGIN') screenWidgetId = 'screen_server_select';
    else if (state === 'SERVER_SELECT') screenWidgetId = 'screen_server_select';
    else if (state === 'SHOP') screenWidgetId = 'screen_shop';
    else if (state === 'GACHA') screenWidgetId = 'screen_gacha';
    else if (state === 'INVENTORY') screenWidgetId = 'screen_inventory';
    else if (state === 'HEROES') screenWidgetId = 'screen_heroes';
    else if (state === 'GAMES') screenWidgetId = 'screen_games';
    else if (state === 'ARENA') screenWidgetId = 'screen_arena';
    else if (state === 'PROFILE') screenWidgetId = 'screen_profile';

    const screenMeta = widgets.find(w => w.id === screenWidgetId);

    const hasImage = !!(screenMeta && screenMeta.bg_image);
    bgImg.style.display = hasImage ? 'block' : 'none';

    // Функция сброса в стандартный фиксированный фолбэк (Строго 1 экран, нативный скролл ОТКЛЮЧЕН)
    const resetToFullscreen = () => {
        // bgImg.style.width = '100vw';
        // bgImg.style.height = '100vh';
        // bgImg.style.objectFit = 'cover'; // Картинка покроет экран без черных полос
        // bgElement.style.width = '100vw';
        // bgElement.style.height = '100vh';

        // Намертво блокируем нативный скролл на уровне CSS, чтобы экран не люфтил

        console.log(orientation);
        if (isLandscape) {
            bgImg.style.width = '100vw';
            bgImg.style.height = '100vh';
            bgImg.style.objectFit = 'cover'; // Картинка покроет экран без черных полос
            bgElement.style.width = '100vw';
            bgElement.style.height = '100vh';
        }
        else {
            bgImg.style.width = '100vh';
            bgImg.style.height = '100vw';
            bgImg.style.objectFit = 'cover'; // Картинка покроет экран без черных полос
            bgElement.style.width = '100vh';
            bgElement.style.height = '100vw';
        }

        wrapper.style.overflow = 'hidden';
    };

    if (hasImage) {
        bgImg.onload = () => {
            if (bgImg.getAttribute('src') !== screenMeta.bg_image) return;

            const imgWidth = bgImg.naturalWidth;
            const imgHeight = bgImg.naturalHeight;

            if (!imgWidth || !imgHeight) {
                resetToFullscreen();
                return;
            }

            const imgAspectRatio = imgWidth / imgHeight;

            // ДИНАМИЧЕСКАЯ ПРОВЕKA: Включаем панораму только в MAIN_MENU и только если в конфиге scrollable === true
            const isScrollable = screenMeta.scrollable === true;

            if (state === 'MAIN_MENU' && isScrollable) {
                // Разрешаем нативный скролл браузера для прокрутки панорамы хаба
                wrapper.style.overflow = 'auto';

                // if (orientation === 'landscape') {
                if (isLandscape) {
                    // --- ЛАНДШАФТ ПАНOРАМА ---
                    const calculatedWidthPx = window.innerHeight * imgAspectRatio;
                    const targetVw = (calculatedWidthPx / window.innerWidth) * 100;
                    const targetWidthStr = `${targetVw}vw`;

                    bgImg.style.width = targetWidthStr;
                    bgImg.style.height = '100vh';
                    bgElement.style.width = targetWidthStr;
                    bgElement.style.height = '100vh';

                    requestAnimationFrame(() => {
                        wrapper.scrollTo({
                            left: (wrapper.scrollWidth - window.innerWidth) / 2,
                            top: 0,
                            behavior: 'instant'
                        });
                    });
                } else {
                    // --- ПОРТРЕТ ПАНOРАМА ---
                    const calculatedHeightPx = window.innerWidth / imgAspectRatio;
                    const targetVh = (calculatedHeightPx / window.innerHeight) * 100;
                    const targetHeightStr = `${targetVh}vh`;

                    // bgImg.style.width = '100vw';
                    // bgImg.style.height = targetHeightStr;
                    // bgElement.style.width = '100vw';
                    // bgElement.style.height = targetHeightStr;

                    bgImg.style.width = targetHeightStr;
                    bgImg.style.height = '100vw';
                    bgElement.style.width = targetHeightStr;
                    bgElement.style.height = '100vw';

                    requestAnimationFrame(() => {
                        wrapper.scrollTo({
                            left: 0,
                            top: (wrapper.scrollHeight - wrapper.clientHeight) / 2,
                            behavior: 'instant'
                        });
                    });
                }
            } else {
                // Если это любое другое окно или в главном меню выключен скролл (scrollable: false)
                resetToFullscreen();
            }
        };

        bgImg.src = screenMeta.bg_image;
    } else {
        bgImg.src = '';
        resetToFullscreen();
    }
}


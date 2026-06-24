const baseUrl = (location.hostname === 'localhost') ? 'http://localhost:3000' : 'https://mtw-gw.onrender.com';
export const API_URL = baseUrl + '/api/vgb';
export const SOCKET_URL = baseUrl;

export let headers;

import {Game} from './stateManager.js';

export function setHeaders(head) {
    headers = head;
}

export function t(key, replaceValue = null) {
    const lang = Game.locale || 'ru';

    // Безопасно идем по новому пути: config.localization.ui.[язык].[ключ]
    let text = Game.config?.localization?.ui?.[lang]?.[key] || Game.config?.localization?.dialogs?.[lang]?.[key] || key;

    if (replaceValue !== null) {
        text = text.replace('{value}', replaceValue);
    }
    return text;
}

export function locObj(obj) {
    if (!obj) return '';
    const lang = Game.locale || 'en';
    return obj[lang] || obj['en'] || ''; // Откатываемся на английский, если перевода нет
}

export function getWindowContentStyle() {
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

export function parseEffectText(effInstance) {
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

export function getHeroRating(hero) {
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




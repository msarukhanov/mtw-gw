import { t, locObj, getHeroRating, getWindowContentStyle } from '../../shared.js';
import { Game, updateState } from '../../stateManager.js';
import { DialogManager } from '../../dialogManager.js';

import { getHeroCardHTML } from './heroCard.js';
import { initHeroViewScreen } from './heroView.js';

const ListFilters = {
    currentFaction: 'all',
    currentClass: 'all',
    mode: 'owned' // 'owned' | 'catalog'
};

export function getHeroListHTML() {
    const orientation = Game.config.orientation || 'landscape';
    const screenSettings = Game.config?.ui?.[orientation]?.find(w => w.id === 'screen_heroes') || {};
    const listSettings = screenSettings.list_settings || {};
    const displayMode = listSettings.display_mode || 'grid'; // "row", "grid"
    // const displayMode = 'row'; // "row", "grid"
    const gridColumns = listSettings.grid_columns || 6; // "grid" или "compact_icon"
    const gap = listSettings.gap || '2%';

    const iconSize = '32px';
    // Вкладки режимов
    const modeTabsHTML = `
        <div style="display: flex; flex-direction: column; width: 100%; gap: 3px; margin-bottom: 12px; pointer-events: auto; flex-shrink: 0;">
            <button class="btn-filter-mode" data-mode="owned" style="flex: 1; height: 26px; background: ${ListFilters.mode === 'owned' ? '#ffcc00' : '#222'}; color: ${ListFilters.mode === 'owned' ? '#000' : '#fff'}; border: none; font-size: ${iconSize}; cursor: pointer; border-radius: 4px;">👤</button>
            <button class="btn-filter-mode" data-mode="catalog" style="flex: 1; height: ${iconSize}; background: ${ListFilters.mode === 'catalog' ? '#ffcc00' : '#222'}; color: ${ListFilters.mode === 'catalog' ? '#000' : '#fff'}; border: none; font-size: calc(${iconSize} - 4px); cursor: pointer; border-radius: 4px;">📖</button>
        </div>
    `;

    // Иконки фракций (Вертикально)
    const factionFilterHTML = `
        <div style="display: flex; flex-direction: column; gap: 6px; width: 100%; align-items: center; pointer-events: auto; overflow-y: auto; flex: 1; margin-bottom: 12px; ">
            <button class="btn-faction-filter" data-faction-id="all" style="width: 32px; height: 32px; background: ${ListFilters.currentFaction === 'all' ? '#ffcc00' : '#222'}; color: ${ListFilters.currentFaction === 'all' ? '#000' : '#fff'}; border: none; border-radius: 50%; cursor: pointer; font-size: 9px; font-weight: bold; flex-shrink: 0;">ALL</button>
            ${Object.entries(Game.config.catalog.factions || {}).map(([id, f]) => {
        const isActive = ListFilters.currentFaction === id;
        return `<button class="btn-faction-filter" data-faction-id="${id}" style="width: ${iconSize}; height: ${iconSize}; background: ${isActive ? '#ffcc00' : '#111'}; border: 2px solid ${isActive ? '#ffcc00' : '#444'}; border-radius: 50%; padding: 0; cursor: pointer; font-size: calc(${iconSize} - 8px); flex-shrink: 0;" title="${locObj(f.title_loc)}">${f.icon}</button>`;
    }).join('')}
        </div>
    `;

    // ИСПРАВЛЕНО: Горизонтальный ряд классов в самом низу левого меню (Ширина сайдбара увеличена до 110px для этого)
    const classFilterHTML = `
        <div style="display: flex; flex-direction: row; justify-content: space-between; gap: 4px; pointer-events: auto; flex-shrink: 0; border-top: 1px solid #333; padding: 10px;background: #222222;position: absolute; z-index: 10;bottom: 5px;left: 5px;">
            <button class="btn-class-filter" data-class-id="all" style="flex: 1; height: 26px; background: ${ListFilters.currentClass === 'all' ? '#ffcc00' : '#222'}; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">🌐</button>
            ${Object.entries(Game.config.catalog.classes || {}).map(([id, c]) => {
        const isActive = ListFilters.currentClass === id;
        return `<button class="btn-class-filter" data-class-id="${id}" style="flex: 1; height: ${iconSize}; background: ${isActive ? '#ffcc00' : '#111'}; border: 1px solid ${isActive ? '#ffcc00' : '#444'}; border-radius: 4px; padding: 0; cursor: pointer; font-size: calc(${iconSize} - 8px);" title="${locObj(c.title_loc)}">${c.icon}</button>`;
    }).join('')}
        </div>
    `;

    // Сайдбар с жесткой фиксацией высоты 100%
    let sidebarHTML = `
        <div class="sidebar-filters" style="display: flex; flex-direction: column; align-items: center; border-right: 1px solid #333; padding: 5px; box-sizing: border-box; height: 100%; flex-shrink: 0; background: #222222;">
            ${modeTabsHTML}
            ${factionFilterHTML}
            ${classFilterHTML}
        </div>
    `;

    // --- ФИЛЬТРАЦИЯ И СОРТИРОВКА ---
    let displayHeroes = [];
    const rarityOrder = Game.config.mechanics?.rarities?.hero || ["R", "SR", "SSR", "UR"];

    if (ListFilters.mode === 'owned') {
        displayHeroes = [...(Game.player.heroes || [])];
        displayHeroes.sort((a, b) => {
            const powerA = getHeroRating(a);
            const powerB = getHeroRating(b);
            if (powerB !== powerA) return powerB - powerA;
            return rarityOrder.indexOf(Game.config.catalog.heroes[b.hero_id]?.rarity) - rarityOrder.indexOf(Game.config.catalog.heroes[a.hero_id]?.rarity);
        });

        displayHeroes = displayHeroes.filter(hero => {
            const proto = Game.config.catalog.heroes[hero.hero_id];
            if (!proto) return false;
            return (ListFilters.currentFaction === 'all' || proto.faction_id === ListFilters.currentFaction) &&
                (ListFilters.currentClass === 'all' || proto.class_id === ListFilters.currentClass);
        });
    } else {
        Object.entries(Game.config.catalog.heroes || {}).forEach(([heroId, proto]) => {
            if ((ListFilters.currentFaction === 'all' || proto.faction_id === ListFilters.currentFaction) &&
                (ListFilters.currentClass === 'all' || proto.class_id === ListFilters.currentClass)) {
                const ownedCopy = Game.player.heroes?.find(h => h.hero_id === heroId);
                displayHeroes.push(ownedCopy ? { ...ownedCopy, isLockedInCatalog: false } : { instance_id: `catalog_${heroId}`, hero_id: heroId, level: 0, stars: 0, equipped: {}, isLockedInCatalog: true });
            }
        });
    }

    const isCompact = displayMode === "grid";
    const gridStyle = isCompact
        ? `display: grid; grid-template-columns: repeat(${gridColumns}, 1fr); grid-auto-rows: max-content; gap: ${gap}; width: calc(100%); height: 100%; overflow-y: auto; box-sizing: border-box; padding-left: 12px; pointer-events: auto;`
        : `display: flex; flex-direction: row; flex-wrap: nowrap; overflow-x: auto; overflow-y: hidden; gap: ${gap}; justify-content: flex-start; align-items: center; width: calc(100%); height: 100%; box-sizing: border-box; padding: 12px; pointer-events: auto;`;


    return `
        <div class="screen-content ui-element" style="${getWindowContentStyle()} display: flex; flex-direction: row; box-sizing: border-box; top: 45px; height: calc(100% - 45px)">
            ${sidebarHTML}
            <div class="heroes-grid-container" style="${gridStyle}">
                ${displayHeroes.length === 0
        ? `<div style="color:#aaa; padding:20px; width:100%; text-align:center; font-size:13px;">${t('inventory_empty')}</div>`
        : displayHeroes.map(hero => getHeroCardHTML(hero, listSettings.card_layout, displayMode)).join('')
        }
            </div>
        </div>
    `;
}

export function initHeroListScreen(container, updateUiCallback) {
    const refresh = () => {
        const oldScreen = container.querySelector('.screen-content');
        if (oldScreen) oldScreen.remove();
        initHeroListScreen(container, updateUiCallback);
    };

    // container.innerHTML += getHeroListHTML();

    container.insertAdjacentHTML('beforeend', getHeroListHTML(Game));

    DialogManager.trigger('OPEN_HEROES_FIRST_TIME');

    container.querySelectorAll('.btn-class-filter').forEach(btn => {
        btn.onclick = () => { ListFilters.currentClass = btn.dataset.classId; refresh(); };
    });

    container.querySelectorAll('.btn-faction-filter').forEach(btn => {
        btn.onclick = () => { ListFilters.currentFaction = btn.dataset.factionId; refresh(); };
    });

    container.querySelectorAll('.btn-filter-mode').forEach(btn => {
        btn.onclick = () => { ListFilters.mode = btn.dataset.mode; refresh(); };
    });

    container.querySelectorAll('.hero-card-clickable').forEach(card => {
        card.onclick = () => {
            const instanceId = card.dataset.heroViewInstanceId;
            const currentListIds = Array.from(container.querySelectorAll('.hero-card-clickable'))
                .map(c => c.dataset.heroViewInstanceId);

            Game.activeHeroTab = 'stats';
            Game.activeHeroInstance = instanceId;
            Game.currentListIds = currentListIds;
            // Game.gameState = 'HERO_VIEW';

            updateState('HERO_VIEW');

            // initHeroViewScreen(container, instanceId, currentListIds, updateUiCallback);
        };
    });
}
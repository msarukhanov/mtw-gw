// gameList.js
import { t, locObj, getWindowContentStyle } from '../../shared.js';
import {Game} from "../../stateManager.js";
import { getGameCardHTML } from './gameCard.js';
import { initGameLauncherScreen } from './gameLauncher.js';

// ИСПРАВЛЕНО: Добавлен режим фильтрации коллекции (Мои / Все игры)
const GameFilters = {
    currentGenre: 'all',
    currentPlatform: 'all',
    mode: 'owned' // 'owned' (доступные) | 'catalog' (все существующие в игре)
};

export function getGameListHTML() {
    const orientation = Game.config.orientation || 'landscape';
    const screenSettings = Game.config?.ui?.[orientation]?.find(w => w.id === 'screen_games') || {};
    const listSettings = screenSettings.list_settings || {};

    const displayMode = listSettings.display_mode || 'grid';
    const gridColumns = listSettings.grid_columns || 4;
    const gap = listSettings.gap || '2%';

    const iconSize = '32px';

    // Блок 1: Компактный переключатель "Моя библиотека / Магазин приложений"
    const modeTabsHTML = `
        <div style="display: flex; flex-direction: column; width: 100%; gap: 3px; margin-bottom: 12px; pointer-events: auto; flex-shrink: 0;">
            <button class="btn-game-mode" data-mode="owned" style="flex: 1; height: ${iconSize}${iconSize}; background: ${GameFilters.mode === 'owned' ? '#ffcc00' : '#222'}; color: ${GameFilters.mode === 'owned' ? '#000' : '#fff'}; border: none; font-size: calc(${iconSize} - 8px); cursor: pointer; border-radius: 4px;" title="${t('games_owned_mode') || 'Мои игры'}">👤</button>
            <button class="btn-game-mode" data-mode="catalog" style="flex: 1; height: ${iconSize}; background: ${GameFilters.mode === 'catalog' ? '#ffcc00' : '#222'}; color: ${GameFilters.mode === 'catalog' ? '#000' : '#fff'}; border: none; font-size: calc(${iconSize} - 8px); cursor: pointer; border-radius: 4px;" title="${t('games_catalog_mode') || 'Каталог'}">📖</button>
        </div>
    `;

    // Иконки жанров
    const genreFilterHTML = `
        <div style="display: flex; flex-direction: column; gap: 6px; width: 100%; align-items: center; pointer-events: auto; overflow-y: auto; flex: 1; margin-bottom: 12px;">
            <button class="btn-genre-filter" data-genre-id="all" style="width: 32px; height: 32px; background: ${GameFilters.currentGenre === 'all' ? '#ffcc00' : '#222'}; color: ${GameFilters.currentGenre === 'all' ? '#000' : '#fff'}; border: none; border-radius: 50%; cursor: pointer; font-size: 9px; font-weight: bold; flex-shrink: 0;">ALL</button>
            ${Object.entries(Game.config.catalog?.game_genres || {}).map(([id, g]) => {
        const isActive = GameFilters.currentGenre === id;
        return `<button class="btn-genre-filter" data-genre-id="${id}" style="width: ${iconSize}; height: ${iconSize}; background: ${isActive ? '#ffcc00' : '#111'}; border: 2px solid ${isActive ? '#ffcc00' : '#444'}; border-radius: 50%; padding: 0; cursor: pointer; font-size: calc(${iconSize} - 8px); flex-shrink: 0;" title="${locObj(g.title_loc)}">${g.icon}</button>`;
        }).join('')}
        </div>
    `;

    // Фильтр платформ внизу
    const platformFilterHTML = `
        <div style="display: flex; flex-direction: row; justify-content: space-between; gap: 4px; pointer-events: auto; flex-shrink: 0; border-top: 1px solid #333; padding: 10px; background: #222222; position: absolute; z-index: 10; bottom: 5px; left: 5px;">
            <button class="btn-platform-filter" data-platform-id="all" style="flex: 1; height: 26px; background: ${GameFilters.currentPlatform === 'all' ? '#ffcc00' : '#222'}; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">🌐</button>
            ${Object.entries(Game.config.catalog?.game_platforms || {}).map(([id, p]) => {
        const isActive = GameFilters.currentPlatform === id;
        return `<button class="btn-platform-filter" data-platform-id="${id}" style="flex: 1; height: ${iconSize}; background: ${isActive ? '#ffcc00' : '#111'}; border: 1px solid ${isActive ? '#ffcc00' : '#444'}; border-radius: 4px; padding: 0; cursor: pointer; font-size: calc(${iconSize} - 8px);" title="${locObj(p.title_loc)}">${p.icon}</button>`;
        }).join('')}
        </div>
    `;

    let sidebarHTML = `
        <div class="sidebar-filters" style="display: flex; flex-direction: column; align-items: center; border-right: 1px solid #333; padding: 5px; box-sizing: border-box; height: 100%; flex-shrink: 0; background: #222222;">
            ${modeTabsHTML}
            ${genreFilterHTML}
            ${platformFilterHTML}
        </div>
    `;

    // --- ИСПРАВЛЕННАЯ СБОРКА И ФИЛЬТРАЦИЯ НА ОСНОВЕ ТВОЕГО МАССИВА GAMES ---
    let displayGames = [];
    const playerGamesList = Game.player?.games || []; // Твой реальный массив из профиля!c

    if (GameFilters.mode === 'owned') {
        // РЕЖИМ 1 (Мои игры): Берем только те игры, которые реально есть в массиве игрока
        playerGamesList.forEach(playerGame => {
            const proto = Game.config.catalog?.games?.[playerGame.game_id];
            if (!proto) return;

            const matchGenre = GameFilters.currentGenre === 'all' || proto.genre_id === GameFilters.currentGenre;
            const matchPlatform = GameFilters.currentPlatform === 'all' || proto.platform_id === GameFilters.currentPlatform;

            if (matchGenre && matchPlatform) {
                // Копируем данные инстанса игры и снимаем флаг блокировки
                displayGames.push({
                    ...playerGame,
                    is_locked: false
                });
            }
        });
    } else {
        // РЕЖИМ 2 (Каталог): Проходим по вообще всем играм из статической базы бэка
        Object.entries(Game.config.catalog?.games || {}).forEach(([gameId, proto]) => {
            const matchGenre = GameFilters.currentGenre === 'all' || proto.genre_id === GameFilters.currentGenre;
            const matchPlatform = GameFilters.currentPlatform === 'all' || proto.platform_id === GameFilters.currentPlatform;

            if (matchGenre && matchPlatform) {
                // Проверяем, есть ли этот game_id в массиве игр игрока
                const ownedCopy = playerGamesList.find(g => g.game_id === gameId);

                if (ownedCopy) {
                    // Если игра есть — выводим её цветной
                    displayGames.push({
                        ...ownedCopy,
                        is_locked: false
                    });
                } else {
                    // Если игры нет — выводим её заблокированной (серой)
                    displayGames.push({
                        instance_id: `catalog_${gameId}`,
                        game_id: gameId,
                        level: 0,
                        stars: 0,
                        is_locked: true
                    });
                }
            }
        });
    }



    const isGridMode = displayMode === "grid";
    const gridStyle = isGridMode
        ? `display: grid; grid-template-columns: repeat(${gridColumns}, 1fr); grid-auto-rows: max-content; gap: ${gap}; width: calc(100%); height: 100%; overflow-y: auto; box-sizing: border-box; padding-left: 12px; pointer-events: auto;`
        : `display: flex; flex-direction: row; flex-wrap: nowrap; overflow-x: auto; overflow-y: hidden; gap: ${gap}; justify-content: flex-start; align-items: center; width: calc(100%); height: 100%; box-sizing: border-box; padding: 12px; pointer-events: auto;`;

    return `
        <div class="screen-content ui-element" style="${getWindowContentStyle()} display: flex; flex-direction: row; box-sizing: border-box; top: 45px; height: calc(100% - 45px)">
            ${sidebarHTML}
            <div class="games-grid-container" style="${gridStyle}">
                ${displayGames.length === 0
        ? `<div style="color:#aaa; padding:20px; width:100%; text-align:center; font-size:13px;">${t('games_list_empty') || 'Нет доступных игр'}</div>`
        : displayGames.map(game => getGameCardHTML(game, listSettings.card_layout, displayMode)).join('')
        }
            </div>
        </div>
    `;
}

export function initGameListScreen(container, updateUiCallback) {
    const refresh = () => {
        const oldScreen = container.querySelector('.screen-content');
        if (oldScreen) oldScreen.remove();
        initGameListScreen(container, updateUiCallback);
    };

    // container.innerHTML += getGameListHTML();

    container.insertAdjacentHTML('beforeend', getGameListHTML());

    container.querySelectorAll('.btn-genre-filter').forEach(btn => {
        btn.onclick = () => { GameFilters.currentGenre = btn.dataset.genreId; refresh(); };
    });

    container.querySelectorAll('.btn-platform-filter').forEach(btn => {
        btn.onclick = () => { GameFilters.currentPlatform = btn.dataset.platformId; refresh(); };
    });

    // ДОБАВЛЕНО: Слушатель кликов по табам "Мои игры / Каталог"
    container.querySelectorAll('.btn-game-mode').forEach(btn => {
        btn.onclick = () => { GameFilters.mode = btn.dataset.mode; refresh(); };
    });


    container.querySelectorAll('.game-card-clickable').forEach(card => {
        card.onclick = () => {
            const gameId = card.dataset.launcherGameId;
            const proto = Game.config.catalog?.games?.[gameId];
            const inventory = Game.player?.games || {};

            initGameLauncherScreen(container, gameId, updateUiCallback);
        };
    });
}

import { Game } from '../../stateManager.js';
import { API_URL, t, locObj, getWindowContentStyle } from "../../shared.js";
import { renderCraftPanel, bindCraftEvents } from './craftDetails.js';

export const CraftState = {
    currentCategory: 'all', // Фильтр по типам предметов из механик
    selectedRecipeId: null  // ID активного рецепта для правой панели
};

export function getCraftHTML() {
    const orientation = Game.config.orientation || 'landscape';
    const screenSettings = Game.config?.ui?.[orientation]?.find(w => w.id === 'screen_craft') || {};
    const listSettings = screenSettings.list_settings || {};

    const gridColumns = listSettings.grid_columns || 4;
    const rowHeight = listSettings.grid_row_height || "80px";
    const gap = listSettings.gap || "10px";
    const padding = listSettings.padding || "12px";
    const headerHeight = listSettings.header_height || "40px";
    const headerBg = listSettings.header_background || "#1a1a1a";
    const sidebarWidth = listSettings.sidebar_width || "110px";
    const detailsWidth = listSettings.details_panel_width || "280px";

    const recipesCatalog = Game.config?.catalog?.recipes || {};
    const itemTypesConfig = Game.config?.mechanics?.item_types || {};

    // --- 1. ЛЕВОЕ МЕНЮ КАТЕГОРИЙ (КОЛОНКА 1) ---
    const sidebarHTML = `
        <div class="sidebar-filters" style="display: flex; flex-direction: column; align-items: center; border-right: 1px solid #333; padding: 5px; box-sizing: border-box; height: 100%; width: ${sidebarWidth}; flex-shrink: 0; background: #222222;">
            <div style="display: flex; flex-direction: column; width: 100%; gap: 6px; pointer-events: auto; overflow-y: auto; flex: 1;">
                ${Object.entries(itemTypesConfig).map(([id, typeData]) => {
        const isActive = CraftState.currentCategory === id;
        return `<button class="btn-craft-tab" data-cat-id="${id}" style="width: 100%; min-height: 40px; background: ${isActive ? '#ffcc00' : '#111'}; color: ${isActive ? '#000' : '#fff'}; border: 2px solid ${isActive ? '#ffcc00' : '#444'}; border-radius: 6px; padding: 4px; cursor: pointer; font-size: 11px; font-weight: bold; flex-shrink: 0;">${typeData.icon || '🛠️'} ${locObj(typeData.title_loc)}</button>`;
    }).join('')}
            </div>
        </div>
    `;

    // --- 2. ВЕРХНИЙ ХЕДЕР ЦЕНТРАЛЬНОЙ ЧАСТИ ---
    const centerHeaderHTML = `
        <div class="craft-header" style="width: 100%; height: ${headerHeight}; display: flex; align-items: center; padding: 0 15px; box-sizing: border-box; border-bottom: 1px solid #333; background: ${headerBg}; flex-shrink: 0; pointer-events: auto;">
            <div style="font-size: 14px; color: #ffcc00; font-weight: bold;">
                🔨 <span>${t('craft_title') || 'Divine Forge'}</span>
            </div>
        </div>
    `;

    // --- ФИЛЬТРАЦИЯ РЕЦЕПТОВ ---
    const filteredRecipes = Object.entries(recipesCatalog).filter(([_, recipe]) => {
        const resultItemMeta = Game.config?.catalog?.items?.[recipe.result?.itemId];
        if (!resultItemMeta) return false;
        if (CraftState.currentCategory === 'all') return true;
        return resultItemMeta.category === CraftState.currentCategory;
    });

    // Авто-выбор первого доступного рецепта в списке
    if (filteredRecipes.length > 0 && (!CraftState.selectedRecipeId || !recipesCatalog[CraftState.selectedRecipeId])) {
        CraftState.selectedRecipeId = filteredRecipes[0];
    } else if (filteredRecipes.length === 0) {
        CraftState.selectedRecipeId = null;
    }

    // --- 3. ЦЕНТРАЛЬНАЯ СЕТКА РЕЦЕПТОВ (КОЛОНКА 2) ---
    let gridContentHTML = '';
    if (filteredRecipes.length === 0) {
        gridContentHTML = `<div style="color:#aaa; padding:20px; width:100%; text-align:center; font-size:12px;">${t('craft_empty') || 'No recipes available'}</div>`;
    } else {
        gridContentHTML = filteredRecipes.map(([recipeId, recipe]) => {
            const resultItemMeta = Game.config?.catalog?.items?.[recipe.result?.itemId];
            const isSelected = CraftState.selectedRecipeId === recipeId;
            const rarityOrder = { "UR": "#e63946", "SSR": "#ff9800", "SR": "#9c27b0", "R": "#2196f3" };
            const borderColor = rarityOrder[resultItemMeta?.rarity] || '#444';

            return `
                <div class="craft-cell" data-recipe-id="${recipeId}" style="background: #1e1e1e; border: 2px solid ${isSelected ? '#ffcc00' : borderColor}; border-radius: 8px; padding: 8px; display: flex; align-items: center; gap: 10px; cursor: pointer; box-sizing: border-box; height: 100%;">
                    <div style="font-size: 28px; background: #262626; width: 44px; height: 44px; display: flex; align-items: center; justify-content: center; border-radius: 6px; border: 1px solid #333; flex-shrink: 0;">
                        ${resultItemMeta?.icon || '⚔️'}
                    </div>
                    <div style="display: flex; flex-direction: column; min-width: 0; flex: 1;">
                        <span style="font-size: 12px; color: #fff; font-weight: bold; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${locObj(resultItemMeta?.title_loc)}</span>
                        <span style="font-size: 10px; color: #ffcc00; font-family: monospace; margin-top: 2px;">💰 ${recipe.gold_cost || 0}</span>
                    </div>
                </div>
            `;
        }).join('');
    }

    const gridStyle = `display: grid; grid-template-columns: repeat(${gridColumns}, 1fr); grid-auto-rows: ${rowHeight}; gap: ${gap}; width: 100%; height: 100%; overflow-y: auto; box-sizing: border-box; padding: ${padding}; pointer-events: auto;`;

    // --- 4. ПРАВАЯ ПАНЕЛЬ РЕЦЕПТА (КОЛОНКА 3) ---
    const detailsPanelHTML = renderCraftPanel(CraftState.selectedRecipeId, recipesCatalog, detailsWidth);

    return `
        <div class="screen-content ui-element" style="${getWindowContentStyle()} display: flex; flex-direction: row; box-sizing: border-box; top: 45px; height: calc(100% - 45px); overflow: hidden;">
            ${sidebarHTML}
            <div class="craft-center-area" style="display: flex; flex-direction: column; flex: 1; height: 100%; overflow: hidden;">
                ${centerHeaderHTML}
                <div class="craft-grid-container" style="${gridStyle}">
                    ${gridContentHTML}
                </div>
            </div>
            ${detailsPanelHTML}
        </div>
    `;
}

export function initCraftScreen(container, updateUiCallback) {
    const refreshUI = () => {
        const oldScreen = container.querySelector('.screen-content');
        if (oldScreen) oldScreen.remove();
        initCraftScreen(container, updateUiCallback);
    };

    container.insertAdjacentHTML('beforeend', getCraftHTML());

    // Переключение левых вкладок типов предметов
    container.querySelectorAll('.btn-craft-tab').forEach(btn => {
        btn.onclick = () => {
            CraftState.currentCategory = btn.dataset.catId;
            CraftState.selectedRecipeId = null;
            refreshUI();
        };
    });

    // Клик по ячейке рецепта в сетке
    container.querySelectorAll('.craft-cell').forEach(cell => {
        cell.onclick = () => {
            CraftState.selectedRecipeId = cell.dataset.recipeId;
            refreshUI();
        };
    });

    // Привязываем логику каунтера и отправки запроса на бэк
    bindCraftEvents(container, updateUiCallback, refreshUI);
}

import { Game } from '../../stateManager.js';
import { t, locObj, getWindowContentStyle } from "../../shared.js";
import { renderDetailsPanel, bindDetailsEvents } from './inventoryDetails.js';

// Единое состояние фильтрации и выбранного предмета
export const InventoryState = {
    currentCategory: 'all', // 'all' | 'equipment' | 'consumable' | 'material'
    selectedItemId: null   // ID подсвеченного предмета, который отображается в 3-й колонке
};

export function getInventoryHTML() {
    const orientation = Game.config.orientation || 'landscape';
    const screenSettings = Game.config?.ui?.[orientation]?.find(w => w.id === 'screen_inventory') || {};
    const listSettings = screenSettings.list_settings || {};

    const gridColumns = listSettings.grid_columns || 5;
    const rowHeight = listSettings.grid_row_height || "70px";
    const gap = listSettings.gap || "8px";
    const padding = listSettings.padding || "10px";
    const headerHeight = listSettings.header_height || "40px";
    const headerBg = listSettings.header_background || "#1a1a1a";
    const sidebarWidth = listSettings.sidebar_width || "110px";
    const detailsWidth = listSettings.details_panel_width || "260px";

    const playerInventory = Game.player?.inventory || {};
    const rarityColors = { "UR": "#e63946", "SSR": "#ff9800", "SR": "#9c27b0", "R": "#2196f3" };

    // --- 1. ЛЕВОЕ МЕНЮ КАТЕГОРИЙ (КОЛОНКА 1) ---
    // --- 1. ЛЕВОЕ МЕНЮ КАТЕГОРИЙ С ВАЛИДАЦИЕЙ ---
    const itemTypesConfig = Game.config?.mechanics?.item_types || {};

    const sidebarHTML = `
    <div class="sidebar-filters" style="display: flex; flex-direction: column; align-items: center; border-right: 1px solid #333; padding: 5px; box-sizing: border-box; height: 100%; width: ${sidebarWidth}; flex-shrink: 0; background: #222222;">
        <div style="display: flex; flex-direction: column; width: 100%; gap: 6px; pointer-events: auto; overflow-y: auto; flex: 1;">
            ${Object.entries(itemTypesConfig).map(([id, typeData]) => {
        const isActive = InventoryState.currentCategory === id;

        // ВАЛИДАЦИЯ: Защита от пустых полей в типе предмета
        const icon = typeData?.icon || "📦";
        const title = typeData?.title_loc ? locObj(typeData.title_loc) : `Category ${id}`;

        return `
                    <button class="btn-inventory-tab" data-cat-id="${id}" style="width: 100%; min-height: 40px; background: ${isActive ? '#ffcc00' : '#111'}; color: ${isActive ? '#000' : '#fff'}; border: 2px solid ${isActive ? '#ffcc00' : '#444'}; border-radius: 6px; padding: 4px; cursor: pointer; font-size: 11px; font-weight: bold; flex-shrink: 0;">
                        ${icon} ${title}
                    </button>
                `;
    }).join('')}
        </div>
    </div>
`;

// --- 2. ЦЕНТРАЛЬНАЯ СЕТКА ПРЕДМЕТОВ С ВАЛИДАЦИЕЙ КАТАЛОГА ---




    // --- 2. ВЕРХНИЙ ХЕДЕР ЦЕНТРАЛЬНОЙ ЧАСТИ ---
    const centerHeaderHTML = `
        <div class="inventory-header" style="width: 100%; height: ${headerHeight}; display: flex; align-items: center; padding: 0 15px; box-sizing: border-box; border-bottom: 1px solid #333; background: ${headerBg}; flex-shrink: 0; pointer-events: auto;">
            <div style="font-size: 14px; color: #ffcc00; font-weight: bold;">
                🎒 <span>${t('inventory_title') || 'Bag'}</span>
            </div>
        </div>
    `;

    // --- ФИЛЬТРАЦИЯ ПРЕДМЕТОВ ДЛЯ СЕТКИ ---
    // --- 1. ФИЛЬТРАЦИЯ ПРЕДМЕТОВ ---
    const filteredItems = Object.entries(playerInventory).filter(([itemId, count]) => {
        if (count <= 0) return false;
        const meta = Game.config?.catalog?.items?.[itemId];
        if (!meta) return false;

        if (InventoryState.currentCategory === 'all') return true;
        return meta.category === InventoryState.currentCategory;
    });

    // --- 2. ДОБАВЛЕНО: АВТОСОРТИРОВКА ПО РЕДКОСТИ (От UR до R) ---
    // Порядок редкости берем из механик вашего конфига или задаем дефолтный для предметов
    const itemRarityOrder = Game.config?.mechanics?.rarities?.items || ["R", "SR", "SSR", "UR"];

    filteredItems.sort((a, b) => {
        const metaA = Game.config?.catalog?.items?.[a[0]];
        const metaB = Game.config?.catalog?.items?.[b[0]];

        const indexA = itemRarityOrder.indexOf(metaA?.rarity || "R");
        const indexB = itemRarityOrder.indexOf(metaB?.rarity || "R");

        // Сортируем по убыванию (высший индекс редкости идет первым)
        if (indexB !== indexA) {
            return indexB - indexA;
        }
        // Если редкость одинаковая, сортируем по алфавиту ID предмета
        return a[0].localeCompare(b[0]);
    });

    // Авто-выбор первого предмета из уже отсортированного списка
    if (filteredItems.length > 0 && (!InventoryState.selectedItemId || !playerInventory[InventoryState.selectedItemId])) {
        InventoryState.selectedItemId = filteredItems[0][0];
    } else if (filteredItems.length === 0) {
        InventoryState.selectedItemId = null;
    }

    // const filteredItems = Object.entries(playerInventory).filter(([itemId, count]) => {
    //     if (count <= 0) return false;
    //     const meta = Game.config?.catalog?.items?.[itemId];
    //     if (!meta) return false;
    //
    //     if (InventoryState.currentCategory === 'all') return true;
    //     return meta.category === InventoryState.currentCategory;
    // });
    //
    // // Если текущий выбранный предмет исчез или не установлен, авто-выбираем первый из списка
    // if (filteredItems.length > 0 && (!InventoryState.selectedItemId || !playerInventory[InventoryState.selectedItemId])) {
    //     InventoryState.selectedItemId = filteredItems[0][0];
    // } else if (filteredItems.length === 0) {
    //     InventoryState.selectedItemId = null;
    // }

    // --- 3. ЦЕНТРАЛЬНАЯ СЕТКА ПРЕДМЕТОВ (КОЛОНКА 2) ---
    // let gridContentHTML = '';
    // if (filteredItems.length === 0) {
    //     gridContentHTML = `<div style="color:#aaa; padding:20px; width:100%; text-align:center; font-size:12px;">${t('inventory_empty') || 'Empty'}</div>`;
    // } else {
    //     gridContentHTML = filteredItems.map(([itemId, count]) => {
    //         const meta = Game.config?.catalog?.items?.[itemId];
    //         const isSelected = InventoryState.selectedItemId === itemId;
    //         const borderColor = rarityColors[meta?.rarity] || '#444';
    //
    //         return `
    //             <div class="inventory-cell" data-item-id="${itemId}" style="background: #1e1e1e; border: 2px solid ${isSelected ? '#ffcc00' : borderColor}; border-radius: 6px; position: relative; display: flex; align-items: center; justify-content: center; font-size: 32px; cursor: pointer; box-sizing: border-box; height: 100%; transition: transform 0.1s;">
    //                 ${meta?.icon || '📦'}
    //                 <span style="position: absolute; bottom: 2px; right: 4px; background: rgba(0,0,0,0.8); color: #fff; font-size: 10px; padding: 1px 4px; border-radius: 8px; font-weight: bold; font-family: monospace;">
    //                     ${count}
    //                 </span>
    //             </div>
    //         `;
    //     }).join('');
    // }

    let gridContentHTML = '';
    if (filteredItems.length === 0) {
        gridContentHTML = `<div style="color:#aaa; padding:20px; width:100%; text-align:center; font-size:12px;">${t('inventory_empty') || 'Empty'}</div>`;
    } else {
        gridContentHTML = filteredItems.map(([itemId, count]) => {
            const meta = Game.config?.catalog?.items?.[itemId];
            const isSelected = InventoryState.selectedItemId === itemId;

            // ВАЛИДАЦИЯ: Если админ забыл указать редкость предмета в каталоге
            const borderColor = meta?.rarity ? (rarityColors[meta.rarity] || '#444') : '#444';
            // ВАЛИДАЦИЯ: Если забыли указать иконку предмета
            const itemIcon = meta?.icon || '📦';

            return `
            <div class="inventory-cell" data-item-id="${itemId}" style="background: #1e1e1e; border: 2px solid ${isSelected ? '#ffcc00' : borderColor}; border-radius: 6px; position: relative; display: flex; align-items: center; justify-content: center; font-size: 32px; cursor: pointer; box-sizing: border-box; height: 100%;">
                ${itemIcon}
                <span style="position: absolute; bottom: 2px; right: 4px; background: rgba(0,0,0,0.8); color: #fff; font-size: 10px; padding: 1px 4px; border-radius: 8px; font-weight: bold; font-family: monospace;">
                    ${count}
                </span>
            </div>
        `;
        }).join('');
    }

    const gridStyle = `display: grid; grid-template-columns: repeat(${gridColumns}, 1fr); grid-auto-rows: ${rowHeight}; gap: ${gap}; width: 100%; height: 100%; overflow-y: auto; box-sizing: border-box; padding: ${padding}; pointer-events: auto;`;

    // --- 4. ПРАВАЯ ПАНЕЛЬ ИНФОРМАЦИИ (КОЛОНКА 3) ---
    const detailsPanelHTML = renderDetailsPanel(InventoryState.selectedItemId, playerInventory, rarityColors, detailsWidth);

    // ФИНАЛЬНАЯ СБОРКА ТРЕХКОЛОНОЧНОГО ПЛАНА
    return `
        <div class="screen-content ui-element" style="${getWindowContentStyle()} display: flex; flex-direction: row; box-sizing: border-box; top: 45px; height: calc(100% - 45px); overflow: hidden;">
            ${sidebarHTML}
            <div class="inventory-center-area" style="display: flex; flex-direction: column; flex: 1; height: 100%; overflow: hidden;">
                ${centerHeaderHTML}
                <div class="inventory-grid-container" style="${gridStyle}">
                    ${gridContentHTML}
                </div>
            </div>
            ${detailsPanelHTML}
        </div>
    `;
}

export function initInventoryScreen(container, updateUiCallback) {
    const refreshUI = () => {
        const oldScreen = container.querySelector('.screen-content');
        if (oldScreen) oldScreen.remove();
        initInventoryScreen(container, updateUiCallback);
    };

    container.insertAdjacentHTML('beforeend', getInventoryHTML());

    // Слушатели левых табов категорий
    container.querySelectorAll('.btn-inventory-tab').forEach(btn => {
        btn.onclick = () => {
            InventoryState.currentCategory = btn.dataset.catId;
            InventoryState.selectedItemId = null; // Сбрасываем фокус при смене вкладки
            refreshUI();
        };
    });

    // Клик по ячейке предмета в сетке (перенос фокуса без перезапроса бэка)
    container.querySelectorAll('.inventory-cell').forEach(cell => {
        cell.onclick = () => {
            InventoryState.selectedItemId = cell.dataset.itemId;
            refreshUI();
        };
    });

    // Привязываем события для кнопок управления внутри 3-й колонки
    bindDetailsEvents(container, updateUiCallback, refreshUI);
}


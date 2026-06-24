import { t, getWindowContentStyle } from '../../shared.js';
import {Game} from "../../stateManager.js";
import { initPreBattleScreen } from './preBattle.js';

export function getTowerHTML(container, towerKey = 'main_tower') {
    const orientation = Game.config.orientation || 'landscape';
    const screenSettings = Game.config?.ui?.[orientation]?.find(w => w.id === 'screen_pve_tower') || {};
    const listSettings = screenSettings.list_settings || {};
    const cardLayout = listSettings.card_layout || {};

    // Извлекаем текущий этаж игрока для КОНКРЕТНОЙ башни (из нашего нового объекта БД)
    const currentFloorNum = Game.player.pve_progress?.towers?.[towerKey] || 1;
    const towerFloorsConfig = Game.config.pve_towers?.[towerKey]?.floors || {};

    // Разворачиваем этажи в обратном порядке, чтобы самые высокие были сверху экрана
    const sortedFloors = Object.keys(towerFloorsConfig).sort((a, b) => {
        return b.replace(/^\D+/g, '') - a.replace(/^\D+/g, '');
    });

    let floorsHTML = '';

    sortedFloors.forEach(floorId => {
        const floorNum = parseInt(floorId.replace(/^\D+/g, ''));
        const isCurrent = floorNum === currentFloorNum;
        const isCleared = floorNum < currentFloorNum;
        const isLocked = floorNum > currentFloorNum;

        let statusBadge = `<span style="color: #666; font-size: 11px;">LOCKED 🔒</span>`;
        let borderStyle = `border: ${cardLayout.border || '1px solid #444'};`;
        let bgStyle = `background: ${cardLayout.backgroundColor || '#222'};`;

        if (isCurrent) {
            statusBadge = `<span style="color: #ffcc00; font-size: 11px; font-weight: bold; animation: pulse_gold_glow 2s infinite;">CHALLENGE ⚔️</span>`;
            borderStyle = `border: 1px solid #ffcc00; box-shadow: 0 0 10px rgba(255,204,0,0.3);`;
            bgStyle = `background: rgba(255, 204, 0, 0.05);`;
        } else if (isCleared) {
            statusBadge = `<span style="color: #4caf50; font-size: 11px;">CLEARED ✓</span>`;
            bgStyle = `background: rgba(30, 40, 30, 0.4); opacity: 0.7;`;
        }

        floorsHTML += `
            <div class="tower-floor-card" data-floor-id="${floorId}" data-locked="${isLocked}"
                 style="width: ${cardLayout.width || '90%'}; height: ${cardLayout.height || '70px'}; margin: ${cardLayout.margin || '0 auto'}; border-radius: ${cardLayout.borderRadius || '4px'}; display: flex; flex-direction: row; justify-content: space-between; align-items: center; padding: 0 20px; box-sizing: border-box; cursor: ${isLocked ? 'not-allowed' : 'pointer'}; transition: all 0.2s; ${borderStyle} ${bgStyle} pointer-events: auto;">
                <div style="color: #fff; font-size: 14px; font-weight: bold;">FLOOR ${floorNum}</div>
                <div>${statusBadge}</div>
            </div>
        `;
    });

    return `
        <div class="screen-content ui-element" style="${getWindowContentStyle()} box-sizing: border-box; top: 45px; height: calc(100% - 45px); overflow-y: auto; overflow-x: hidden; background-image: url('${screenSettings.bg_image}'); background-size: cover; background-position: center; padding: 15px 0;">
            <div class="tower-stack-container" style="display: flex; flex-direction: column; gap: ${listSettings.gap || '10px'}; width: 100%;">
                ${floorsHTML}
            </div>
        </div>
    `;
}

export function initPveTowerScreen(container, towerKey = 'main_tower', updateUiCallback) {
    const refresh = () => {
        const oldScreen = container.querySelector('.screen-content');
        if (oldScreen) oldScreen.remove();
        initPveTowerScreen(container, towerKey, updateUiCallback);
    };

    container.insertAdjacentHTML('beforeend', getTowerHTML(container, towerKey));

    // Внутри initTowerScreen в файле pveTower.js:
    container.querySelectorAll('.tower-floor-card').forEach(card => {
        card.onclick = () => {
            const isLocked = card.dataset.locked === 'true';
            if (isLocked) return;

            const floorId = card.dataset.floorId; // Передаст например "floor_1"

            const oldScreen = container.querySelector('.screen-content');
            if (oldScreen) oldScreen.remove();

            Game.pveContext = {
                previousState: 'PVE_TOWER',
                stageId: floorId,
                type: 'tower',
                towerKey: towerKey // 'main_tower', 'faction_light' и т.д.
            };
            Game.gameState = 'PRE_BATTLE';

            // Передаем: container, floorId, тип 'tower', и ключ башни 'main_tower'
            initPreBattleScreen(container, floorId, 'tower', towerKey, updateUiCallback);
        };
    });

}

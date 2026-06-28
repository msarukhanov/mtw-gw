import { t, locObj, getWindowContentStyle } from '../../shared.js';
import {Game} from "../../stateManager.js";
import { initPreBattleScreen } from './preBattle.js';

export function getCampaignHTML() {
    const orientation = Game.config.orientation || 'landscape';
    const screenSettings = Game.config?.ui?.[orientation]?.find(w => w.id === 'screen_pve_campaign') || {};
    const nodesLayout = screenSettings.nodes_layout || {};
    const styles = nodesLayout.styles || {};

    // Определяем текущий этап игрока из стейта БД (например, "stage_1_1")
    const currentProgressStage = Game.player.pve_progress?.campaign || "stage_1_1";
    const stagesConfig = Game.config.pve_campaign?.stages || {};

    let nodesHTML = '';

    Object.entries(stagesConfig).forEach(([stageId, stage]) => {
        // Проверяем статус этапа: текущий, пройденный или заблокированный
        const isCurrent = stageId === currentProgressStage;

        // Логика определения пройденных этапов для линейной кампании:
        // (Парсим числа из "stage_1_2", чтобы понять, что 1_1 меньше 1_2 и значит уже пройден)
        const currentNums = currentProgressStage.replace('stage_', '').split('_').map(Number);
        const stageNums = stageId.replace('stage_', '').split('_').map(Number);

        let isUnlocked = false;
        if (stageNums[0] < currentNums[0]) isUnlocked = true; // Прошлые главы
        if (stageNums[0] === currentNums[0] && stageNums[1] <= currentNums[1]) isUnlocked = true; // Текущая глава

        // Выбираем конфиг стилей из UI-секции (ЗероКод)
        const stateStyle = isUnlocked ? styles.unlocked : styles.locked;
        const pos = stage.ui_position || { x: "100px", y: "100px" };
        const animClass = isCurrent ? (nodesLayout.active_animation || 'pulse_gold_glow') : '';

        // Поддержка иконки-картинки или дефолтной цифры
        let nodeInnerContent = stageNums[1]; // По дефолту пишем номер этапа (например, "2")
        if (stateStyle?.icon_image) {
            nodeInnerContent = `<img src="${stateStyle.icon_image}" style="width:100%; height:100%; border-radius:50%;">`;
        }

        nodesHTML += `
            <div class="campaign-stage-node ui-element-clickable ${animClass}" 
                 data-stage-id="${stageId}"
                 style="position: absolute; left: ${pos.x}; top: ${pos.y}; width: ${nodesLayout.node_width || '60px'}; height: ${nodesLayout.node_height || '60px'}; background: ${stateStyle?.backgroundColor || '#222'}; border: ${stateStyle?.border || '1px solid #555'}; border-radius: ${stateStyle?.borderRadius || '50%'}; box-shadow: ${stateStyle?.boxShadow || 'none'}; color: ${stateStyle?.textColor || '#fff'}; display: flex; align-items: center; justify-content: center; font-weight: bold; cursor: ${isUnlocked ? 'pointer' : 'not-allowed'}; opacity: ${isUnlocked ? '1' : (nodesLayout.locked_opacity || '0.5')}; pointer-events: auto; z-index: 5;"
                 title="${locObj(stage.title_loc)}">
                ${nodeInnerContent}
            </div>
        `;
    });

    // Отрендерим сундук айдла, если он настроен в UI
    let idleChestHTML = '';
    if (screenSettings.idle_bar_widget) {
        const chest = screenSettings.idle_bar_widget;
        idleChestHTML = `
            <div class="ui-element-clickable" id="${chest.id}" data-action="${chest.action}"
                 style="position: absolute; bottom: ${chest.layout.bottom}; left: ${chest.layout.left}; width: ${chest.layout.width}; height: ${chest.layout.height}; background-image: ${chest.layout.backgroundImage}; background-size: contain; background-repeat: no-repeat; cursor: pointer; pointer-events: auto; z-index: 10;">
            </div>
        `;
    }

    const scrollWidth = screenSettings.active_width ? `${screenSettings.active_width}px` : '100%';

    return `
        <div class="screen-content ui-element" style="${getWindowContentStyle()} box-sizing: border-box; top: 5px; height: calc(100% - 10px); overflow-x: auto; overflow-y: hidden; background-image: url('${screenSettings.backgroundImage}'); background-size: cover; background-position: center;z-index: 21">
            <div class="campaign-map-scroll-container" style="width: ${scrollWidth}; height: 100%; position: relative;">
                ${nodesHTML}
                ${idleChestHTML}
            </div>
        </div>
    `;
}

export function initPveCampaignScreen(container, updateUiCallback) {
    const refresh = () => {
        const oldScreen = container.querySelector('.screen-content');
        if (oldScreen) oldScreen.remove();
        initCampaignScreen(container, updateUiCallback);
    };

    container.insertAdjacentHTML('beforeend', getCampaignHTML());

    // Биндим клики по доступным этапам
    container.querySelectorAll('.campaign-stage-node').forEach(node => {
        node.onclick = () => {
            const stageId = node.dataset.stageId;

            // Проверяем по прогрессу, пускать ли
            const currentProgressStage = Game.player.pve_progress?.campaign || "stage_1_1";
            const currentNums = currentProgressStage.replace('stage_', '').split('_').map(Number);
            const stageNums = stageId.replace('stage_', '').split('_').map(Number);

            // Если этап заблокирован (номер больше текущего открытого), ничего не делаем
            if (stageNums[0] > currentNums[0] || (stageNums[0] === currentNums[0] && stageNums[1] > currentNums[1])) {
                return;
            }

            // УСПЕХ: Очищаем экран карты и открываем тактическую предбоевую подготовку
            const oldScreen = container.querySelector('.screen-content');
            if (oldScreen) oldScreen.remove();

            Game.pveContext = {
                previousState: 'PVE_CAMPAIGN', // Откуда пришли
                stageId: stageId,
                type: 'campaign',
                towerKey: null
            };
            Game.gameState = 'PRE_BATTLE';

            // Передаем правильные параметры: container, stageId, тип активности, towerKey (null для кампании)
            initPreBattleScreen(container, stageId, 'campaign', null, updateUiCallback);
        };
    });

    // Биндим сбор айдл наград, если кнопка отрендерилась
    const idleChest = container.querySelector('#campaign_idle_chest');
    if (idleChest) {
        idleChest.onclick = () => {
            // Твоя функция AppActions или вызов попапа сбора айдла
            console.log("Trigger claim idle rewards from campaign layout");
        };
    }
}

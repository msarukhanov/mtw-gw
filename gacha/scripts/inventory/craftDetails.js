import { Game } from '../../stateManager.js';
import { API_URL, headers, t, locObj } from "../../shared.js";
import { CraftState } from './craft.js';
import { showRewardsPopup } from '../inventory/inventoryPopup.js';
import {sendSocket} from "../../socket.js";

let currentCraftCount = 1;

export function renderCraftPanel(recipeId, recipesCatalog, panelWidth) {
    if (!recipeId || !recipesCatalog[recipeId]) {
        return `
            <div class="craft-details-panel" style="width: ${panelWidth}; height: 100%; background: #1a1a1a; border-left: 1px solid #333; display: flex; align-items: center; justify-content: center; color: #666; font-size: 12px; padding: 15px; box-sizing: border-box;">
                ${t('craft_no_selection') || 'Select a recipe'}
            </div>
        `;
    }

    const startRecipe = recipesCatalog[recipeId];
    const resultItemMeta = Game.config?.catalog?.items?.[startRecipe.result?.itemId];

    const playerInv = Game.player?.game_data?.inventory || Game.player?.inventory || {};
    const playerRes = Game.player?.resources || {};

    // --- 1. РАСЧЕТ МАКСИМУМА ДЛЯ ОБЫЧНОГО КРАФТА (Линейный) ---
    let directMax = recipeGoldCost > 0 ? Math.floor((parseInt(playerRes.gold) || 0) / startRecipe.gold_cost) : Infinity;
    const recipeGoldCost = startRecipe.gold_cost || 0;

    if (startRecipe.ingredients) {
        Object.entries(startRecipe.ingredients).forEach(([matId, neededForOne]) => {
            const stock = playerInv[matId] || 0;
            const maxForThisMat = Math.floor(stock / neededForOne);
            if (maxForThisMat < directMax) directMax = maxForThisMat;
        });
    }
    if (directMax === Infinity) directMax = 0;

    // --- 2. РАСЧЕТ МАКСИМУМА ДЛЯ РЕКУРСИВНОГО АВТОКРАФТА ---
    const itemToRecipeMap = {};
    Object.entries(recipesCatalog).forEach(([rId, rData]) => {
        if (rData.result?.itemId) itemToRecipeMap[rData.result.itemId] = rData;
    });

    function simulateAutoCraft(targetCount) {
        let tempInventory = JSON.parse(JSON.stringify(playerInv));
        let sumGold = 0;
        let isPossible = true;

        function runSim(targetItemId, neededAmount) {
            const stock = tempInventory[targetItemId] || 0;
            if (stock >= neededAmount) {
                tempInventory[targetItemId] -= neededAmount;
                return;
            }
            let remaining = neededAmount - stock;
            tempInventory[targetItemId] = 0;

            const subRecipe = itemToRecipeMap[targetItemId];
            if (!subRecipe) { isPossible = false; return; }

            sumGold += (subRecipe.gold_cost || 0) * remaining;
            if (subRecipe.ingredients) {
                Object.entries(subRecipe.ingredients).forEach(([matId, forOne]) => {
                    if (isPossible) runSim(matId, forOne * remaining);
                });
            }
        }

        try {
            runSim(startRecipe.result.itemId, targetCount);
            if (sumGold > (parseInt(playerRes.gold) || 0)) isPossible = false;
        } catch (e) { isPossible = false; }

        return { isPossible, sumGold };
    }

    let autoMax = 0;
    while (true) {
        const nextCheck = simulateAutoCraft(autoMax + 1);
        if (nextCheck.isPossible) autoMax++;
        else break;
        if (autoMax >= 99) { autoMax = 99; break; }
    }

    // Итоговый лимит каунтера выставляем по максимальному (автокрафту), чтобы игрок мог выбрать много штук
    const finalCounterMax = Math.max(directMax, autoMax);

    if (currentCraftCount > finalCounterMax) currentCraftCount = finalCounterMax;
    if (currentCraftCount <= 0 && finalCounterMax > 0) currentCraftCount = 1;

    // Расчет стоимостей для выбранного на счетчике количества
    const normalGoldCost = recipeGoldCost * currentCraftCount;
    const autoSimResult = simulateAutoCraft(currentCraftCount);
    const totalAutoGoldCost = autoSimResult.sumGold;

    // Проверяем доступность кнопок для выбранного количества
    const canDoNormalCraft = currentCraftCount <= directMax && (parseInt(playerRes.gold) || 0) >= normalGoldCost;
    const canDoAutoCraft = currentCraftCount <= autoMax && autoSimResult.isPossible;

    // Отрисовка списка ПРЯМЫХ ингредиентов рецепта
    let ingredientsHTML = '';
    if (startRecipe.ingredients) {
        ingredientsHTML = Object.entries(startRecipe.ingredients).map(([matId, neededForOne]) => {
            const totalNeeded = neededForOne * currentCraftCount;
            const currentStock = playerInv[matId] || 0;
            const hasEnoughDirectly = currentStock >= totalNeeded;
            const matMeta = Game.config?.catalog?.items?.[matId];

            return `
                <div style="background: rgba(0,0,0,0.4); border: 1px solid ${hasEnoughDirectly ? '#2a2a2a' : '#ff9800'}; padding: 5px 8px; border-radius: 5px; display: flex; align-items: center; justify-content: space-between; font-size: 11px;">
                    <div style="display: flex; align-items: center; gap: 6px; min-width: 0;">
                        <span>${matMeta?.icon || '📦'}</span>
                        <span style="color: #ccc; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${matMeta ? locObj(matMeta.title_loc) : matId}</span>
                    </div>
                    <div style="font-family: monospace; color: #fff; flex-shrink: 0;">
                        ${totalNeeded} <span style="font-size: 9px; color: ${hasEnoughDirectly ? '#666' : '#ff9800'};">(${currentStock})</span>
                    </div>
                </div>
            `;
        }).join('');
    }

    return `
        <div class="craft-details-panel" style="width: ${panelWidth}; height: 100%; background: #1a1a1a; border-left: 1px solid #333; display: flex; flex-direction: column; justify-content: space-between; padding: 12px; box-sizing: border-box; flex-shrink: 0; pointer-events: auto;">
            
            <div style="display: flex; flex-direction: column; gap: 8px; overflow-y: auto; flex: 1; padding-right: 2px;">
                <div style="display: flex; align-items: center; gap: 10px; border-bottom: 1px solid #222; padding-bottom: 8px;">
                    <div style="font-size: 32px; background: #2c3e50; width: 48px; height: 48px; display: flex; align-items: center; justify-content: center; border-radius: 6px; border: 1px solid #ffcc00; flex-shrink: 0;">
                        ${resultItemMeta?.icon || '⚔️'}
                    </div>
                    <div style="min-width: 0; flex: 1;">
                        <div style="font-size: 13px; font-weight: bold; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${locObj(resultItemMeta?.title_loc)}</div>
                        <div style="font-size: 10px; color: #aaa; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${locObj(resultItemMeta?.desc_loc)}</div>
                    </div>
                </div>

                <div style="display: flex; flex-direction: column; gap: 5px; margin-top: 4px;">
                    <div style="font-size: 10px; color: #666; font-weight: bold; text-transform: uppercase;">${t('craft_ingredients') || 'Ingredients'}</div>
                    ${ingredientsHTML}
                </div>
            </div>

            <!-- Секция цен и раздельных кнопок крафта -->
            <div style="display: flex; flex-direction: column; gap: 6px; border-top: 1px solid #222; padding-top: 8px; margin-top: 5px;">
                
                <!-- Селектор количества -->
                <div style="display: flex; align-items: center; justify-content: space-between; gap: 4px; background: #0a0a0a; border: 1px solid #222; padding: 4px; border-radius: 6px;">
                    <button id="craft-details-minus" style="width: 28px; height: 26px; background: #222; color: #fff; border: 1px solid #444; border-radius: 4px; font-size: 14px; font-weight: bold; cursor: pointer;">-</button>
                    <div style="font-size: 13px; color: #fff; font-weight: bold; font-family: monospace;">${currentCraftCount}</div>
                    <button id="craft-details-plus" style="width: 28px; height: 26px; background: #222; color: #fff; border: 1px solid #444; border-radius: 4px; font-size: 14px; font-weight: bold; cursor: pointer;">+</button>
                    <button id="craft-details-max" data-max-val="${finalCounterMax}" style="height: 26px; padding: 0 6px; background: #222; color: #ffcc00; border: 1px solid #444; border-radius: 4px; font-size: 10px; font-weight: bold; cursor: pointer;">MAX</button>
                </div>

                <!-- Блок вывода стоимости золота для двух режимов -->
                <div style="background: #111; border-radius: 5px; padding: 4px; font-size: 10px; display: flex; flex-direction: column; gap: 2px; font-family: monospace;">
                    <div style="display: flex; justify-content: space-between; color: ${canDoNormalCraft ? '#aaa' : '#666'};">
                        <span>Normal Cost (Max: ${directMax}):</span>
                        <span style="font-weight: bold; color: ${canDoNormalCraft ? '#fff' : '#ef4444'};">${normalGoldCost}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; color: ${canDoAutoCraft ? '#ffcc00' : '#666'};">
                        <span>Auto Forge Cost (Max: ${autoMax}):</span>
                        <span style="font-weight: bold; color: ${canDoAutoCraft ? '#ffcc00' : '#ef4444'};">${totalAutoGoldCost}</span>
                    </div>
                </div>

                                <!-- Горизонтальные Кнопки двух разных типов крафта -->
                <div style="display: flex; gap: 6px; width: 100%;">
                    <!-- 1. Кнопка ОБЫЧНОГО крафта -->
                    <button id="craft-btn-normal" ${canDoNormalCraft ? '' : 'disabled style="opacity: 0.3; background: #333; cursor: not-allowed;"'} style="flex: 1; height: 32px; background: #3b82f6; color: #fff; border: none; border-radius: 6px; font-size: 11px; font-weight: bold; cursor: pointer;">
                        ${t('craft_btn_normal') || 'Craft'}
                    </button>

                    <!-- 2. Кнопка РЕКУРСИВНОГО автокрафта -->
                    <button id="craft-btn-auto" ${canDoAutoCraft ? '' : 'disabled style="opacity: 0.3; background: #333; cursor: not-allowed;"'} style="flex: 1; height: 32px; background: #673ab7; color: #fff; border: none; border-radius: 6px; font-size: 11px; font-weight: bold; cursor: pointer;">
                        ${t('craft_btn_autoforge') || 'Auto Forge'}
                    </button>
                </div>

            </div>
        </div>
    `;
}

export function bindCraftEvents(container, updateUiCallback, refreshUI) {
    const recipeId = CraftState.selectedRecipeId;
    if (!recipeId) return;

    const btnMinus = container.querySelector('#craft-details-minus');
    const btnPlus = container.querySelector('#craft-details-plus');
    const btnMax = container.querySelector('#craft-details-max');
    const btnNormal = container.querySelector('#craft-btn-normal');
    const btnAuto = container.querySelector('#craft-btn-auto');

    const maxCount = btnMax ? parseInt(btnMax.dataset.maxVal || 0) : 0;

    if (btnMinus) {
        btnMinus.onclick = () => { if (currentCraftCount > 1) { currentCraftCount--; refreshUI(); } };
    }
    if (btnPlus) {
        btnPlus.onclick = () => { if (currentCraftCount < maxCount) { currentCraftCount++; refreshUI(); } };
    }
    if (btnMax) {
        btnMax.onclick = () => { currentCraftCount = maxCount; refreshUI(); };
    }

    // Обработчик 1: Клик по кнопке ОБЫЧНОГО крафта
    if (btnNormal && !btnNormal.hasAttribute('disabled')) {
        btnNormal.onclick = () => sendCraftFetch('craft');
    }

    // Обработчик 2: Клик по кнопке РЕКУРСИВНОГО автокрафта
    if (btnAuto && !btnAuto.hasAttribute('disabled')) {
        btnAuto.onclick = () => sendCraftFetch('autoCraftItem');
    }

    // Вспомогательная функция отправки запросов
    async function sendCraftFetch(method) {
        sendSocket('item', method, {
            recipeId: recipeId, // Ключ snake_case для вашего бэкенд роута
            count: currentCraftCount
        });
        // try {
        //
        //     const res = await fetch(`${API_URL}${endpoint}`, {
        //         method: 'POST',
        //         headers,
        //         body: JSON.stringify({
        //             recipe_id: recipeId, // Ключ snake_case для вашего бэкенд роута
        //             count: currentCraftCount
        //         })
        //     });
        //
        //     const data = await res.json();
        //     if (!res.ok || data.error) throw new Error(data.error || 'Craft error');
        //
        //     // Синхронизируем стейт игрока на фронте
        //     Game.player = { ...Game.player, ...data.game_data };
        //     if (data.resources) Game.player.resources = data.resources;
        //     if (data.combat_power) Game.player.combat_power = data.combat_power;
        //
        //     // Вызываем анимированный поп-ап выигрыша для финального предмета
        //     showRewardsPopup({ [data.crafted_item]: data.crafted_count }, () => {
        //         updateUiCallback(); // Обновляем топ-хедер валют всей игры
        //         refreshUI();        // Перерисовываем Кузницу со свежими остатками ресурсов
        //     });
        // } catch (err) {
        //     alert(t(err.message) || err.message);
        // }
    }
}


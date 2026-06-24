import { t, locObj, getWindowContentStyle, API_URL, headers } from '../../shared.js';
import { Game } from '../../stateManager.js';

import {sendSocket} from "../../socket.js";

import {getHeroBench} from "../widgets/heroBench.js";
import { initCombatArenaScreen } from './combatArena.js';


// Внутренний стейт экрана подготовки, чтобы хранить текущую расстановку до отправки на бэк
let CurrentTeamSetup = {
    teamKey: 'campaign', // 'campaign', 'tower_main_tower' и т.д.
    selectedHeroInstIds: [], // Массив длиной до size (5)
    activeBonus: { hp: "0%", atk: "0%" }
};

export function getPreBattleHTML(container, stageId, type, towerKey = null) {
    const orientation = Game.config.orientation || 'landscape';
    const screenSettings = Game.config?.ui?.[orientation]?.find(w => w.id === 'screen_pre_battle') || {};
    const teamPrototype = Game.config?.mechanics?.prototypes?.team || { size: 5, position: [1, 2, 2] };

    CurrentTeamSetup.teamKey = type === 'campaign' ? 'pve_main' : `tower_${towerKey}`;

// Инициализируем из базы только ОДИН РАЗ при входе, если локальный массив пуст
    if (CurrentTeamSetup.selectedHeroInstIds.length === 0) {
        // В твоем профиле отряд лежит либо в teams.pve_main, либо прямо на корне game_data.pve_main
        const savedTeam = Game.player.teams?.[CurrentTeamSetup.teamKey] || Game.player[CurrentTeamSetup.teamKey];
        if (Array.isArray(savedTeam)) {
            CurrentTeamSetup.selectedHeroInstIds = [...savedTeam];
        }
    }

    // --- ВЕРХНЯЯ ИНФОРМАЦИОННАЯ ПАНЕЛЬ ЭТАПА ---
    let stageTitle = `PvE Stage: ${stageId}`;
    if (type === 'campaign') {
        stageTitle = locObj(Game.config.pve_campaign?.stages?.[stageId]?.title_loc) || stageTitle;
    }

    const playerRowNames = ['Back', 'Middle', 'Front'];
    // Разворачиваем массив, чтобы слоты шли от заднего ряда к переднему
    const reversedPlayerPositions = [...teamPrototype.position].reverse();

    let fieldRowsHTML = '';
    // Считаем индексы правильно с учетом разворота
    let absoluteSlotIndex = 0;

    reversedPlayerPositions.forEach((slotsInRow, rowIndex) => {
        let rowSlotsHTML = '';
        for (let s = 0; s < slotsInRow; s++) {
            // Для корректного маппинга инстансов: если массив развернут,
            // восстанавливаем оригинальный индекс слота в зависимости от ряда
            let logicalIndex = absoluteSlotIndex;
            if (rowIndex === 0) logicalIndex = teamPrototype.position[0] + teamPrototype.position[1] + s; // Back слоты (4, 5)
            else if (rowIndex === 1) logicalIndex = teamPrototype.position[0] + s; // Mid слоты (2, 3)
            else logicalIndex = s; // Front слот (0, 1)

            const currentHeroInstId = CurrentTeamSetup.selectedHeroInstIds[logicalIndex];
            let slotContent = `<div style="color: #444; font-size: 24px; font-weight: 300;">＋</div>`;
            let slotActiveStyle = 'border: 1px dashed #555; background: rgba(0,0,0,0.4);';

            if (currentHeroInstId) {
                const hero = Game.player.heroes?.find(h => h.instance_id === currentHeroInstId);
                const proto = Game.config.catalog.heroes[hero?.hero_id];
                if (proto) {
                    slotContent = `
            <!-- Контейнер персонажа: Абсолютно свободен, БЕЗ обрезки высоты, растет НАВЕРХ -->
            <div class="hero-combat-idle" style="width: 100%; position: absolute; bottom: 0; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; pointer-events: none;">
                <!-- Арт в полный рост: фиксируем только ширину, высота автоматическая -->
                <img src="${proto.image || proto.icon}" style="width: 65px; height: auto; display: block; filter: drop-shadow(0 4px 8px rgba(0,0,0,0.5)); pointer-events: auto;">
                
                <!-- Подпись уровня крепится поверх ног персонажа -->
                <span style="font-size: 8px; color: #fff; background: rgba(0,0,0,0.85); padding: 1px 4px; border-radius: 2px; margin-bottom: 2px; font-weight: bold; z-index: 2; pointer-events: auto;">Lv.${hero.level}</span>
                
                <!-- Кнопка удаления -->
                <div class="btn-remove-from-field" data-inst-id="${currentHeroInstId}" style="position: absolute; top: 0; right: 0; width: 14px; height: 14px; background: #e53935; color: #fff; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 8px; cursor: pointer; font-weight: bold; pointer-events: auto; z-index: 3;">✕</div>
            </div>
        `;
                    // Слоты превращаются в плоские светящиеся тактические платформы под ногами героев
                    slotActiveStyle = 'border-bottom: 3px solid #ffcc00; background: radial-gradient(ellipse at bottom, rgba(255, 204, 0, 0.2) 0%, rgba(0,0,0,0) 70%); box-shadow: 0 10px 15px -5px rgba(255,204,0,0.3);';
                }
            }

// Дефолтный стиль пустого слота игрока (Просто плоский круг/маркер на земле)
            rowSlotsHTML += `
    <div class="battle-tactical-slot" data-slot-index="${logicalIndex}" style="width: 75px; height: 35px; border-radius: 50%; display: flex; align-items: flex-end; justify-content: center; position: relative; transition: all 0.2s; ${slotActiveStyle}">
        ${slotContent}
    </div>
`;
            absoluteSlotIndex++;
        }

        fieldRowsHTML += `
            <div class="formation-row" style="display: flex; flex-direction: column; justify-content: center; align-items: center; gap: 10px; height: 100%; min-width: 75px; background: rgba(255,255,255,0.01); border-radius: 6px; padding: 5px 0;">
                <div style="font-size: 9px; color: #888; text-align: center; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 2px;">${playerRowNames[rowIndex]}</div>
                <div style="display: flex; flex-direction: column; gap: 8px; justify-content: center;">
                    ${rowSlotsHTML}
                </div>
            </div>
        `;
    });


    // --- ПАНЕЛЬ ОТОБРАЖЕНИЯ СИНЕРГИИ / БОНУСОВ ФРАКЦИЙ ---
    recalculateLocalFactionBonus(); // Метод считает синергию прямо на клиенте для мгновенного UI отклика
    validateAndCalculateTeam(container);
    const bonusText = `Faction Bonus: ATK +${CurrentTeamSetup.activeBonus.atk}, HP +${CurrentTeamSetup.activeBonus.hp}`;

    let stageConfig = null;
    let enemyUnits = [];

    if (type === 'campaign') {
        stageConfig = Game.config.pve_campaign?.stages?.[stageId];
        enemyUnits = stageConfig?.enemies || [];
    } else if (type === 'tower') {
        stageConfig = Game.config.pve_towers?.[towerKey]?.floors?.[stageId];
        enemyUnits = stageConfig?.enemies || [];
    } else if (type === 'arena') {
        stageTitle = `PvP Duel: vs ${Game.pveContext?.opponentName || 'Player'}`;

        // Читаем массив, прилетевший с сервера через getOpponents
        // Вражеский отряд в БД сохранен как инстансы [{ hero_id: "eleniel", level: 120, stars: 5, ... }]
        // Но так как у них в базе нет жестких полей position, мы маппим их индексы по порядку (0, 1, 2...)
        const rawEnemyHeroes = Game.pveContext?.enemyHeroes || [];
        enemyUnits = rawEnemyHeroes.map((hero, idx) => ({
            hero_id: hero.hero_id,
            level: hero.level || 1,
            stars: hero.stars || 1,
            position: idx // Расставляем по порядку в тактические слоты врага
        }));
    }  else if (type === 'boss') {
        const bossMeta = Game.config.pve_bosses?.[stageId]; // stageId здесь хранит bossKey
        if (bossMeta) {
            stageTitle = `Raid Boss: ${locObj(bossMeta.title_loc) || bossMeta.boss_id || stageId}`;
            // Генерируем одного массивного юнита-босса для тактической сетки
            enemyUnits = [
                {
                    hero_id: bossMeta.hero_id, // "anjeihydra"
                    level: bossMeta.level || 1,
                    stars: bossMeta.stars || 1,
                    position: 2 // Сажаем по центру во Front ряд (индекс 2 для сетки)
                }
            ];
        }
    }

    // =========================================================================
    const enemyRowNames = ['Front', 'Middle', 'Back'];
    const enemyPrototypePosition = teamPrototype.position;

    let enemyFieldRowsHTML = '';
    let absoluteEnemySlotIndex = 0;

    const assignedSlots = {};
    const unassignedEnemies = [];

    enemyUnits.forEach((enemy) => {
        const pos = Number(enemy.position);
        // Если позиция валидна, в лимите сетки (0-4) и этот слот ЕЩЕ НЕ ЗАНЯТ другим мобом
        if (enemy.position !== undefined && pos >= 0 && pos < 5 && !assignedSlots[pos]) {
            assignedSlots[pos] = enemy;
        } else {
            // Если слот уже занят (дубликат позиции), либо позиции нет — шлем в буфер свободных мест!
            unassignedEnemies.push(enemy);
        }
    });

    // Отрисовываем сетку, сажая буферных мобов в любые оставшиеся пустые слоты
    enemyPrototypePosition.forEach((slotsInRow, rowIndex) => {
        let enemyRowSlotsHTML = '';

        for (let s = 0; s < slotsInRow; s++) {
            // Проверяем жесткую посадку
            let enemyData = assignedSlots[absoluteEnemySlotIndex];

            // Если этот слот был пустым, но у нас в буфере остались "лишние" мобы от наложения позиций
            if (!enemyData && unassignedEnemies.length > 0) {
                enemyData = unassignedEnemies.shift();
            }

            const proto = Game.config.catalog?.heroes?.[enemyData?.hero_id];

            let slotContent = `<div style="color: #331111; font-size: 20px; font-weight: 300;">🞩</div>`;
            let slotStyle = 'border-bottom: 3px solid rgba(229, 57, 53, 0.3); background: radial-gradient(ellipse at bottom, rgba(229, 57, 53, 0.05) 0%, rgba(0,0,0,0) 70%); height: 90px; overflow: visible;';

            if (proto && enemyData) {
                slotContent = `
                    <div class="hero-combat-idle" style="width: 100%; position: absolute; bottom: 0; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; pointer-events: none; height: 140px;">
                        <img src="${proto.image || proto.icon}" style="width: 65px; height: auto; display: block; transform: scaleX(-1); filter: drop-shadow(0 4px 8px rgba(0,0,0,0.5)); pointer-events: auto;">
                        <span style="font-size: 8px; color: #fff; background: rgba(229,57,53,0.9); padding: 1px 4px; border-radius: 2px; margin-bottom: 2px; font-weight: bold; z-index: 2; pointer-events: auto;">Lv.${enemyData.level || 1}</span>
                    </div>
                `;
                slotStyle = 'border-bottom: 3px solid #e53935; background: radial-gradient(ellipse at bottom, rgba(229, 57, 53, 0.2) 0%, rgba(0,0,0,0) 70%); box-shadow: 0 10px 15px -5px rgba(229,57,53,0.3); overflow: visible;';
            }

            enemyRowSlotsHTML += `
                <div class="enemy-tactical-slot" style="width: 75px; height: 35px; border-radius: 50%; display: flex; align-items: flex-end; justify-content: center; position: relative; ${slotStyle}">
                    ${slotContent}
                </div>
            `;

            absoluteEnemySlotIndex++;
        }

        enemyFieldRowsHTML += `
            <div class="enemy-formation-row" style="display: flex; flex-direction: column; justify-content: center; align-items: center; gap: 10px; height: 100%; min-width: 75px; padding: 5px 0;">
                <div style="font-size: 9px; color: #8c4141; text-align: center; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 2px;">${enemyRowNames[rowIndex]}</div>
                <div style="display: flex; flex-direction: column; gap: 8px; justify-content: center;">
                    ${enemyRowSlotsHTML}
                </div>
            </div>
        `;
    });

    return `
        <div class="screen-content ui-element" style="${getWindowContentStyle()} display: flex; flex-direction: column; justify-content: space-between; box-sizing: border-box; top: 5px; height: calc(100% - 10px); padding: 15px; background: linear-gradient(180deg, #111 0%, #171124 100%); z-index: 21">
            
            <!-- Верхушка: Название этапа и синергия -->
            <div style="display: flex; flex-direction: row; justify-content: space-between; align-items: center; width: 100%; height: 35px; border-bottom: 1px solid #333;">
                <div style="color: #fff; font-size: 15px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px;">⚔️ ${stageTitle}</div>
                <div id="formation-bonus-tag" style="background: rgba(255,204,0,0.15); border: 1px solid #ffcc00; color: #ffcc00; font-size: 11px; padding: 4px 10px; border-radius: 4px; font-weight: bold;">${bonusText}</div>
            </div>

            <!-- ПОЛНОЦЕННОЕ ПОЛЕ БОЯ С ДВУМЯ СЕТКАМИ ДРУГ НАПРОТИВ ДРУГА -->
            <div class="tactical-battleground-field" style="display: flex; flex-direction: row; justify-content: center; align-items: center; gap: 15px; flex: 1; width: 100%; min-height: 170px; padding: 0 10px; box-sizing: border-box; background: rgba(0,0,0,0.3); border-radius: 8px; border: 1px solid #222; position: relative;">
                
                <!-- ЛЕВАЯ СТОРОНА: Сетка отряда игрока (Союзники) -->
                <div class="alliance-grid-zone" style="display: flex; flex-direction: row; gap: 20px; align-items: center; justify-content: center; flex: 1; height: 100%;">
                    ${fieldRowsHTML}
                </div>

                <!-- Визуальный центр-разделитель поля -->
                <div style="color: rgba(255,255,255,0.05); font-size: 28px; font-weight: 900; font-style: italic; user-select: none; padding: 0 10px;">VS</div>

                <!-- ПРАВАЯ СТОРОНА: Сетка отряда монстров (Враги стоят зеркально!) -->
                <div class="horde-grid-zone" style="display: flex; flex-direction: row; gap: 20px; align-items: center; justify-content: center; flex: 1; height: 100%;">
                    ${enemyFieldRowsHTML}
                </div>
            </div>

            <!-- Нижняя панель: Склад персонажей игрока и Кнопка "В бой" -->
            ${getHeroBench(CurrentTeamSetup, stageId, type, towerKey)}

        </div>
    `;
}

// Вспомогательный клиентский метод мгновенного пересчета синергий отряда для отзывчивости интерфейса
function recalculateLocalFactionBonus() {
    const factionBonuses = Game.config?.mechanics?.prototypes?.team?.bonuses?.faction || {};
    const factionCounts = {};

    CurrentTeamSetup.selectedHeroInstIds.forEach(instId => {
        const hero = Game.player.heroes?.find(h => h.instance_id === instId);
        const proto = Game.config?.catalog?.heroes?.[hero?.hero_id];
        if (proto?.faction_id) {
            factionCounts[proto.faction_id] = (factionCounts[proto.faction_id] || 0) + 1;
        }
    });

    let maxCount = 0;
    Object.values(factionCounts).forEach(c => { if (c > maxCount) maxCount = c; });

    let activeBonus = { hp: "0%", atk: "0%" };
    for (let milestone = maxCount; milestone >= 3; milestone--) {
        if (factionBonuses[milestone]) {
            activeBonus = factionBonuses[milestone];
            break;
        }
    }
    CurrentTeamSetup.activeBonus = activeBonus;
}

// Вспомогательный метод: пересчитывает бонусы и управляет состоянием кнопки "В бой"
function validateAndCalculateTeam(container) {
    // 1. Считаем синергию фракций
    const factionBonuses = Game.config?.mechanics?.prototypes?.team?.bonuses?.faction || {};
    const factionCounts = {};

    CurrentTeamSetup.selectedHeroInstIds.forEach(instId => {
        const hero = Game.player.heroes?.find(h => h.instance_id === instId);
        const proto = Game.config?.catalog?.heroes?.[hero?.hero_id];
        if (proto?.faction_id) {
            factionCounts[proto.faction_id] = (factionCounts[proto.faction_id] || 0) + 1;
        }
    });

    let maxCount = 0;
    Object.values(factionCounts).forEach(c => { if (c > maxCount) maxCount = c; });

    let localBonus = { hp: "0%", atk: "0%" };
    for (let milestone = maxCount; milestone >= 3; milestone--) {
        if (factionBonuses[milestone]) {
            localBonus = { ...factionBonuses[milestone] };
            break;
        }
    }
    CurrentTeamSetup.activeBonus = localBonus;

    // 2. ВАЛИДАТОР: Управляем кнопкой Battle на основе длины массива
    const startBtn = container.querySelector('#btn_start_pve_fight_execute') || container.querySelector('#btn_start_pvp_fight_execute');
    if (startBtn) {
        if (CurrentTeamSetup.selectedHeroInstIds.length === 0) {
            startBtn.disabled = true;
            startBtn.style.background = '#444';
            startBtn.style.color = '#888';
            startBtn.style.boxShadow = 'none';
            startBtn.style.cursor = 'not-allowed';
            startBtn.innerText = 'EMPTY SQUAD';
        } else {
            startBtn.disabled = false;
            startBtn.style.background = 'linear-gradient(135deg, #4caf50 0%, #2e7d32 100%)';
            startBtn.style.color = '#fff';
            startBtn.style.boxShadow = '0 4px 15px rgba(76,175,80,0.4)';
            startBtn.style.cursor = 'pointer';
            startBtn.innerText = t('btn_start_battle_label') || 'Battle';
        }
    }
}


export function initPreBattleScreen(container, stageId, type, towerKey = null, updateUiCallback) {
    // Локальный рефреш БЕЗ отправки запросов на сервер
    const refreshUI = () => {
        const oldScreen = container.querySelector('.screen-content');
        if (oldScreen) oldScreen.remove();
        initPreBattleScreen(container, stageId, type, towerKey, updateUiCallback);
    };

    container.insertAdjacentHTML('beforeend', getPreBattleHTML(container, stageId, type, towerKey));
    validateAndCalculateTeam(container);

    const teamPrototype = Game.config?.mechanics?.prototypes?.team || { size: 5 };

    // =========================================================================
    // СОБЫТИЕ 1: ДОБАВЛЕНИЕ В ОТРЯД
    // =========================================================================
    container.querySelectorAll('.bench-hero-selectable').forEach(card => {
        card.onclick = () => {
            const instId = card.dataset.instId;
            if (CurrentTeamSetup.selectedHeroInstIds.length >= teamPrototype.size) return;
            if (CurrentTeamSetup.selectedHeroInstIds.includes(instId)) return;
            CurrentTeamSetup.selectedHeroInstIds.push(instId);
            refreshUI();
            saveTeamStateToServer(null);
        };
    });

    // =========================================================================
    // СОБЫТИЕ 2: УДАЛЕНИЕ ИЗ ОТРЯДА
    // =========================================================================
    container.querySelectorAll('.btn-remove-from-field').forEach(btn => {
        btn.onclick = (e) => {
            e.stopPropagation();
            const instId = btn.dataset.instId;
            CurrentTeamSetup.selectedHeroInstIds = CurrentTeamSetup.selectedHeroInstIds.filter(id => id !== instId);
            refreshUI();
            saveTeamStateToServer(null);
        };
    });

    // =========================================================================
    // СОБЫТИЕ 3: КНОПКА "В БОЙ"
    // =========================================================================
    const startBtn = container.querySelector('#btn_start_pve_fight_execute');
    if (startBtn) {
        startBtn.onclick = async () => {
            if (CurrentTeamSetup.selectedHeroInstIds.length === 0) {
                alert("Your deployment team is empty!");
                return;
            }

            try {
                startBtn.disabled = true;
                startBtn.style.opacity = '0.5';
                startBtn.innerText = 'STARTING...';

                // Динамически определяем метод контроллера бэкенда и тело пакета
                let socketMethod = 'pve';
                let socketPayload = { type: type, stage: stageId, towerKey: towerKey };

                if (type === 'arena') {
                    socketMethod = 'pvp';
                    socketPayload = { opponentId: stageId }; // stageId хранит UUID соперника на Арене
                }
                else if (type === 'boss') {
                    socketMethod = 'boss';
                    socketPayload = { bossKey: stageId };   // stageId хранит ключ босса (например, boss_01)
                }

                // Отправляем сокет-пакет в модуль 'battle' по нашей единой схеме!
                // Бэкенд за 1 миллисекунду просчитает раунды в RAM Редиса и вернет реплей боя.
                sendSocket('battle', socketMethod, socketPayload);

                // let fetchUrl = '/battle';
                // let fetchBody = { type: type, stage: stageId, towerKey: towerKey };
                //
                // if (type === 'campaign') {
                //     fetchUrl += '/pve/campaign';
                // } else if (type === 'tower') {
                //     fetchUrl += '/pve/tower';
                // }
                // else if (type === 'arena') {
                //     fetchUrl += '/pvp';
                //     fetchBody = { opponentId: stageId }; // Прокидываем ID вражеского игрока
                // }
                // else if (type === 'boss') {
                //     fetchUrl += '/pve/boss';
                //     fetchBody = { bossKey: stageId }; // stageId хранит в себе переданный bossKey
                // }
                //
                // const response = await fetch(API_URL+fetchUrl, {
                //     method: 'POST',
                //     headers,
                //     body: JSON.stringify(fetchBody)
                // });
                //
                // const result = await response.json();
                //
                // if (result.error) {
                //     alert(`Battle rejected: ${result.error}`);
                //     refreshUI();
                //     return;
                // }
                //
                // // Очищаем экран подготовки отряда
                // const oldScreen = container.querySelector('.screen-content');
                // if (oldScreen) oldScreen.remove();
                //
                // // ИМПОРТИРУЙ И ВЫЗОВИ НАШ КОМПОНЕНТ COMBAT ARENA:
                //
                // initCombatArenaScreen(container, {type, stageId, towerKey}, result, updateUiCallback);

            } catch (err) {
                console.error("Combat API error:", err);
                alert("Server connection failed.");
                refreshUI();
            }
        };
    }
}

// Внутри pvePreBattle.js:
async function saveTeamStateToServer(callback) {
    sendSocket('hero', 'saveTeam', {
        teamKey: CurrentTeamSetup.teamKey,
        heroInstIds: [...CurrentTeamSetup.selectedHeroInstIds]
    });
    // try {
    //     const response = await fetch(API_URL+'/hero/team/save', {
    //         method: 'POST',
    //         headers,
    //         body: JSON.stringify({
    //             // Жестко передаем текущие выбранные ID и ключ
    //             teamKey: CurrentTeamSetup.teamKey,
    //             heroInstIds: [...CurrentTeamSetup.selectedHeroInstIds]
    //         })
    //     });
    //     const resData = await response.json();
    //
    //     if (resData && !resData.error) {
    //         // Перезаписываем объект игрока актуальными данными от сервера
    //         Game.player = resData;
    //         if (callback) callback();
    //     } else {
    //         console.error("Сервер отклонил сохранение отряда:", resData.message);
    //     }
    // } catch (e) {
    //     console.error("Ошибка синхронизации отряда с БД:", e);
    // }
}



import { t, locObj, getWindowContentStyle } from '../../shared.js';
import { Game } from '../../stateManager.js';
import {sendSocket} from "../../socket.js";

let CombatState = {
    battleId: '',
    end: false,
    replay: [],
    currentCharacterId: null,
    currentRoundIndex: 0,
    currentActionIndex: 0,
    isPlaybackActive: false,
    playbackSpeed: 1000, //1000,

    pTeam: null
};

export function getCombatArenaHTML(battleResult, stageId, type, towerKey = null) {
    const orientation = Game.config.orientation || 'landscape';
    const screenSettings = Game.config?.ui?.[orientation]?.find(w => w.id === 'screen_combat_arena') || {};
    const layers = screenSettings.render_layers || { background: {}, characters: {}, vfx_top: {}, ui_overlay: {} };
    const hpBar = screenSettings.hp_bar_settings || {};

    // 1. Отрендерим твой отряд (Игрок)
    const playerHeroIds = Game.player.teams?.pve_main || [];
    const teamPrototype = Game.config?.mechanics?.prototypes?.team || { position: [1, 2, 2] };
    let playerRows = { back: '', middle: '', front: '' };
    let playerSlotsHTML = '';

    // Создаем пустые контейнеры под каждый ряд игрока
    playerHeroIds.forEach((instId, index) => {
        const hero = Game.player.heroes?.find(h => h.instance_id === instId);
        const proto = Game.config.catalog?.heroes?.[hero?.hero_id];
        if (proto) {
            const cardHTML = `
                <div id="combat_unit_p_${index}" class="hero-combat-idle" 
                     style="position: relative; width: 65px; height: 140px; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; transition: all 0.2s ease-in-out;margin: -30px 0;">
                    
                    <!-- Полоска HP теперь находится НАВЕРХУ, над головой персонажа (Пункт 3 ТЗ) -->
                    <div style="width: 55px; height: 4px; background: #222; border-radius: 2px; overflow: hidden; position: absolute; top: 0; z-index: 5; box-shadow: 0 1px 3px rgba(0,0,0,0.5);">
                        <div id="hp_bar_p_${index}" style="width: 100%; height: 100%; background: #4caf50; transition: width 0.2s;"></div>
                    </div>
                    <div style="width: 55px; height: 3px; background: #222; border-radius: 1px; overflow: hidden; position: absolute; top: 6px; z-index: 5; box-shadow: 0 1px 2px rgba(0,0,0,0.4);">
                        <div id="energy_bar_p_${index}" style="width: 0%; height: 100%; background: #00bcd4; transition: width 0.2s;"></div>
                    </div>
            
                    <!-- Полноразмерный арт персонажа: уходит вверх, может выходить за рамки слота -->
                    <img src="${proto.image || proto.icon}" style="width: 100%; height: auto; display: block; filter: drop-shadow(0 6px 10px rgba(0,0,0,0.6));">
                    
                    <!-- Уровень в самом низу у ног -->
                    <span style="font-size: 8px; color: #fff; font-weight: bold; background: rgba(0,0,0,0.7); padding: 1px 3px; border-radius: 2px; position: absolute; bottom: 2px; z-index: 5;">Lv.${hero.level}</span>
                    
                    <div id="jrpg_menu_p_${index}" class="jrpg-action-menu"></div>
                </div>
            `;
            // Распределяем по рядам на основе оригинального индекса в массиве (0-1: Front, 2-3: Mid, 4-5: Back)
            if (index < teamPrototype.position[0]) playerRows.front += cardHTML;
            else if (index < teamPrototype.position[0] + teamPrototype.position[1]) playerRows.middle += cardHTML;
            else playerRows.back += cardHTML;
        }
    });

    // 2. ИСПРАВЛЕНИЕ: Отрендерим команду врагов по РЕАЛЬНОМУ конфигу этапа!
    let stageConfig = null;
    if (type === 'campaign') {
        stageConfig = Game.config.pve_campaign?.stages?.[stageId];
    } else if (type === 'tower') {
        stageConfig = Game.config.pve_towers?.[towerKey]?.floors?.[stageId];
    }

    let enemyUnits = [];
    let enemyRows = { front: '', middle: '', back: '' };
    let enemySlotsHTML = '';

    if (type === 'campaign') {
        const stageConfig = Game.config.pve_campaign?.stages?.[stageId];
        enemyUnits = stageConfig?.enemies || [];
    } else if (type === 'tower') {
        const stageConfig = Game.config.pve_towers?.[towerKey]?.floors?.[stageId];
        enemyUnits = stageConfig?.enemies || [];
    }
    // КРИТИЧЕСКИЙ ФИКС: Если это Арена, берем реальных героев соперника из контекста Game!
    else if (type === 'arena') {
        const rawEnemyHeroes = Game.pveContext?.enemyHeroes || [];

        // Маппим героев оппонента в стандартный формат для боевого рендерера
        enemyUnits = rawEnemyHeroes.map((hero, idx) => ({
            hero_id: hero.hero_id,
            level: hero.level || 1,
            stars: hero.stars || 1,
            position: idx // Выстраиваем по порядку в ряды Front -> Mid -> Back
        }));
    }
    else if (type === 'arena_live') {

        const rawPlayerHeroes = Game.pveContext?.teams?._homeRaw || [];
        const rawEnemyHeroes = Game.pveContext?.teams?._awayRaw || [];

        playerRows = { back: '', middle: '', front: '' };
        playerSlotsHTML = '';

        // Создаем пустые контейнеры под каждый ряд игрока
        rawPlayerHeroes.forEach((hero, index) => {
            const proto = Game.config.catalog?.heroes?.[hero?.hero_id];
            if (proto) {
                const cardHTML = `
                    <div id="combat_unit_p_${index}" class="hero-combat-idle" 
                         style="position: relative; width: 65px; height: 140px; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; transition: all 0.2s ease-in-out;margin: -30px 0;">
                        
                        <!-- Полоска HP теперь находится НАВЕРХУ, над головой персонажа (Пункт 3 ТЗ) -->
                        <div style="width: 55px; height: 4px; background: #222; border-radius: 2px; overflow: hidden; position: absolute; top: 0; z-index: 5; box-shadow: 0 1px 3px rgba(0,0,0,0.5);">
                            <div id="hp_bar_p_${index}" style="width: 100%; height: 100%; background: #4caf50; transition: width 0.2s;"></div>
                        </div>
                        
                        <div style="width: 55px; height: 3px; background: #222; border-radius: 1px; overflow: hidden; position: absolute; top: 6px; z-index: 5; box-shadow: 0 1px 2px rgba(0,0,0,0.4);">
                            <div id="energy_bar_e_${index}" style="width: 0%; height: 100%; background: #00bcd4; transition: width 0.2s;"></div>
                        </div>
                
                        <!-- Полноразмерный арт персонажа: уходит вверх, может выходить за рамки слота -->
                        <img src="${proto.image || proto.icon}" style="width: 100%; height: auto; display: block; filter: drop-shadow(0 6px 10px rgba(0,0,0,0.6));">
                        
                        <!-- Уровень в самом низу у ног -->
                        <span style="font-size: 8px; color: #fff; font-weight: bold; background: rgba(0,0,0,0.7); padding: 1px 3px; border-radius: 2px; position: absolute; bottom: 2px; z-index: 5;">Lv.${hero.level}</span>
                    </div>
                `;

                // Распределяем по рядам на основе оригинального индекса в массиве (0-1: Front, 2-3: Mid, 4-5: Back)
                if (index <= teamPrototype.position[0]) enemyRows.front += cardHTML;
                else if (index > teamPrototype.position[0] && index<teamPrototype.position[1]) enemyRows.middle += cardHTML;
                else enemyRows.back += cardHTML;
            }
        });

        enemyUnits = rawEnemyHeroes.map((hero, idx) => ({
            hero_id: hero.hero_id,
            level: hero.level || 1,
            stars: hero.stars || 1,
            position: idx // Выстраиваем по порядку в ряды Front -> Mid -> Back
        }));
    }
    else if (type === 'boss') {
        const bossMeta = Game.config.pve_bosses?.[stageId];
        const proto = Game.config.catalog?.heroes?.[bossMeta?.hero_id];
        if (proto) {
            // Босс рендерится как один огромный полноростовой юнит по центру в среднем ряду Front
            enemyRows.front = `
                <div id="combat_unit_e_0" class="hero-combat-idle" 
                     style="position: relative; width: 85px; height: 160px; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; transition: all 0.2s ease-in-out;">
                    <div style="width: 75px; height: 5px; background: #222; border-radius: 2px; overflow: hidden; position: absolute; top: 0; z-index: 5; box-shadow: 0 1px 3px rgba(0,0,0,0.5);">
                        <div id="hp_bar_e_0" style="width: 100%; height: 100%; background: #ef5350; transition: width 0.2s;"></div>
                    </div>
                     <div style="width: 55px; height: 3px; background: #222; border-radius: 1px; overflow: hidden; position: absolute; top: 6px; z-index: 5; box-shadow: 0 1px 2px rgba(0,0,0,0.4);">
                        <div id="energy_bar_e_0" style="width: 0%; height: 100%; background: #00bcd4; transition: width 0.2s;"></div>
                     </div>
                    <!-- Босс масштабируется чуть крупнее обычных героев -->
                    <img src="${proto.image || proto.icon}" style="width: 110%; height: auto; display: block; transform: scaleX(-1); filter: drop-shadow(0 8px 16px rgba(0,0,0,0.7));">
                    <span style="font-size: 8px; color: #fff; font-weight: bold; background: #ef4444; padding: 1px 4px; border-radius: 2px; position: absolute; bottom: 2px; z-index: 5; letter-spacing: 0.5px;">BOSS</span>
                </div>
            `;
        }
    }

    console.log(enemyUnits);

    enemyUnits.forEach((enemy, index) => {
        const proto = Game.config.catalog?.heroes?.[enemy.hero_id];
        if (proto) {
            const cardHTML = `
                <div id="combat_unit_e_${index}" class="hero-combat-idle" 
                     style="position: relative; width: 65px; height: 140px; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; transition: all 0.2s ease-in-out;margin: -30px 0;">
                    
                    <!-- Полоска HP над головой врага -->
                    <div style="width: 55px; height: 4px; background: #222; border-radius: 2px; overflow: hidden; position: absolute; top: 0; z-index: 5; box-shadow: 0 1px 3px rgba(0,0,0,0.5);">
                        <div id="hp_bar_e_${index}" style="width: 100%; height: 100%; background: #f44336; transition: width 0.2s;"></div>
                    </div>
                     <div style="width: 55px; height: 3px; background: #222; border-radius: 1px; overflow: hidden; position: absolute; top: 6px; z-index: 5; box-shadow: 0 1px 2px rgba(0,0,0,0.4);">
                         <div id="energy_bar_e_${index}" style="width: 0%; height: 100%; background: #00bcd4; transition: width 0.2s;"></div>
                    </div>
            
                    <!-- Полноразмерный арт врага с разворотом к игроку -->
                    <img src="${proto.image || proto.icon}" style="width: 100%; height: auto; display: block; transform: scaleX(-1); filter: drop-shadow(0 6px 10px rgba(0,0,0,0.6));">
                    
                    <span style="font-size: 8px; color: #fff; font-weight: bold; background: rgba(229,57,53,0.8); padding: 1px 3px; border-radius: 2px; position: absolute; bottom: 2px; z-index: 5;">Lv.${enemy.level || 1}</span>
                </div>
            `;


            // Распределяем врагов по зеркальным рядам на основе их свойства position из конфига

            const pos = enemy.position !== undefined ? enemy.position : index;

            if (pos === teamPrototype.position[0]) {
                enemyRows.front += cardHTML;
            }
            else if (pos === teamPrototype.position[1]) {
                enemyRows.middle += cardHTML;
            }
            else {
                enemyRows.back += cardHTML;
            }
        }
    });

    const combatVictoryPopUp = `
                    <!-- ПОЛНОЭКРАННЫЙ ДАШБОРД РЕЗУЛЬТАТОВ (MVP, НАГРАДЫ, СТАТИСТИКА, 3 КНОПКИ) -->
            <div id="combat_victory_popup" style="display: none; position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: rgba(5, 5, 5, 0.95); z-index: 100; flex-direction: column; padding: 20px; box-sizing: border-box; pointer-events: auto; font-family: sans-serif;">
                
                <!-- Заголовок Матча -->
                <div id="victory-popup-title" style="font-size: 32px; font-weight: bold; color: #4caf50; text-transform: uppercase; letter-spacing: 4px; text-align: center; margin-bottom: 15px; text-shadow: 0 0 20px rgba(76,175,80,0.6);">VICTORY</div>
                
                <!-- Главный Контент-Блок (Разбит на Сайдбар MVP и Панель Данных) -->
                <div style="display: flex; flex-direction: row; width: 100%; flex: 1; gap: 20px; min-height: 0;">
                    
                    <!-- ЛЕВАЯ ЧАСТЬ: ВИЗУАЛ MVP ПЕРСОНАЖА -->
                    <div style="flex: 0.8; background: rgba(255,255,255,0.02); border: 1px solid #333; border-radius: 8px; display: flex; flex-direction: column; align-items: center; justify-content: center; pading: 15px; position: relative; overflow: hidden;">
                        <div style="position: absolute; top: 10px; background: #ffcc00; color: #000; font-size: 10px; font-weight: bold; padding: 2px 12px; border-radius: 4px; letter-spacing: 1px; box-shadow: 0 0 10px #ffcc00;">MOST VALUABLE PLAYER</div>
                        <!-- Спрайт/Иконка MVP героя -->
                        <div id="mvp-hero-avatar-zone" class="hero-combat-idle" style="margin-top: 15px;">
                            <img id="mvp-hero-img" src="" style="height: 90px; border-radius: 8px; border: 2px solid #ffcc00; box-shadow: 0 0 20px rgba(255,204,0,0.2);">
                        </div>
                        <div id="mvp-hero-name" style="color: #fff; font-size: 14px; font-weight: bold; margin-top: 8px;">Hero Name</div>
                        <div id="mvp-hero-score" style="color: #ffcc00; font-size: 11px; margin-top: 2px;">Damage: 0</div>
                    </div>

                    <!-- ПРАВАЯ ЧАСТЬ: ДИНАМИЧЕСКИЕ ВКЛАДКИ (НАГРАДЫ / СТАТИСТИКА БОЯ) -->
                    <div style="flex: 2.2; display: flex; flex-direction: column; min-width: 0;">
                        <!-- Переключатели вкладок (Табы из настроек ЗероКода) -->
                        <div style="display: flex; flex-direction: row; gap: 5px; margin-bottom: 10px;">
                            <button id="tab-btn-rewards" class="result-tab-btn" style="flex: 1; height: 32px; background: #ffcc00; color: #000; border: none; border-radius: 4px; font-size: 12px; font-weight: bold; cursor: pointer;">🎁 REWARDS CLAIMED</button>
                            <button id="tab-btn-stats" class="result-tab-btn" style="flex: 1; height: 32px; background: #222; color: #fff; border: 1px solid #444; border-radius: 4px; font-size: 12px; font-weight: bold; cursor: pointer;">📊 COMBAT METRICS</button>
                        </div>

                        <!-- Слой Списка Наград -->
                        <div id="result-view-rewards" style="display: flex; flex-direction: column; gap: 6px; background: #111; border: 1px solid #222; border-radius: 6px; padding: 15px; flex: 1; overflow-y: auto;"></div>

                        <!-- Слой Статистики Урона (Полосочные Графики/Метрики) -->
                        <div id="result-view-stats" style="display: none; flex-direction: column; gap: 10px; background: #111; border: 1px solid #222; border-radius: 6px; padding: 15px; flex: 1; overflow-y: auto;">
                            <!-- Сюда движок вставит полоски урона для каждого героя игрока -->
                        </div>
                    </div>

                </div>

                                <!-- НИЖНЯЯ ПАНЕЛЬ С КНОПКАМИ УПРАВЛЕНИЯ (ВСЁ СГРУППИРОВАНО СПРАВА) -->
                <div style="display: flex; flex-direction: row; justify-content: flex-end; align-items: center; width: 100%; border-top: 1px solid #333; padding-top: 15px; margin-top: 15px; flex-shrink: 0; gap: 20px;">
                    
                    <!-- Переключатель AUTO-NEXT (Теперь прижат вправо к кнопке Next) -->
                    <div style="display: flex; flex-direction: row; align-items: center; gap: 8px; pointer-events: auto;">
                        <label class="switch" style="position: relative; display: inline-block; width: 44px; height: 22px;">
                            <input type="checkbox" id="checkbox-auto-next" style="opacity: 0; width: 0; height: 0;">
                            <span class="slider" style="position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: #333; border: 1px solid #555; transition: .3s; border-radius: 22px;"></span>
                        </label>
                        <span style="color: #aaa; font-size: 11px; font-weight: bold; letter-spacing: 1px; text-transform: uppercase;">Auto Next</span>
                    </div>

                    <!-- Кнопки Навигации -->
                    <div style="display: flex; flex-direction: row; gap: 10px; pointer-events: auto;">
                        <!-- Кнопка CONFIRM (Выход на карту) -->
                        <button id="btn_close_combat_victory_screen" style="width: 110px; height: 40px; background: #222; color: #fff; border: 1px solid #444; border-radius: 4px; font-size: 12px; font-weight: bold; cursor: pointer; text-transform: uppercase;">
                            CONFIRM
                        </button>
                        
                        <!-- Кнопка NEXT STAGE (Прямой клик) -->
                        <button id="btn_next_combat_stage_direct" style="width: 140px; height: 40px; background: linear-gradient(135deg, #ffcc00 0%, #ffb300 100%); color: #000; border: none; border-radius: 4px; font-size: 12px; font-weight: bold; cursor: pointer; text-transform: uppercase;">
                            NEXT STAGE ▶
                        </button>
                    </div>

                </div>


            </div>

    `;

    return `
        <div class="screen-content ui-element" style="${getWindowContentStyle()} box-sizing: border-box; top: 5px; height: calc(100% - 10px); position: relative; background-image: url('${screenSettings.backgroundImage}'); background-size: cover; background-position: center; overflow: hidden;z-index: 21;">
            <div id="combat-layer-characters" style="position: absolute; width: 100%; height: 100%; display: flex; flex-direction: row; justify-content: center; align-items: center; gap: 20px; padding: 0 20px; box-sizing: border-box; z-index: ${layers.characters?.zIndex || 3};">
                
                <!-- ЛЕВАЯ ПОЛОВИНА: ОТРИСОВКА ОТРЯДА ИГРОКА (Back -> Mid -> Front) -->
                <div class="combat-side-player-tactical" style="display: flex; flex-direction: row; gap: 20px; height: 100%; align-items: center; justify-content: flex-end; flex: 1;">
                    <div style="display:flex; flex-direction:column; gap:10px; justify-content:center; align-items:center;">${playerRows.back}</div>
                    <div style="display:flex; flex-direction:column; gap:10px; justify-content:center; align-items:center;">${playerRows.middle}</div>
                    <div style="display:flex; flex-direction:column; gap:10px; justify-content:center; align-items:center;">${playerRows.front}</div>
                </div>

                <!-- ЛИНИЯ СТОЛКНОВЕНИЯ В ЦЕНТРЕ ЭКРАНА -->
                <div style="color: rgba(255,255,255,0.06); font-size: 36px; font-weight: 900; font-style: italic; user-select: none;">VS</div>

                <!-- ПРАВАЯ ПОЛОВИНА: ОТРИСОВКА ОТРЯДА ВРАГОВ (Front -> Mid -> Back) -->
                <div class="combat-side-enemy-tactical" style="display: flex; flex-direction: row; gap: 20px; height: 100%; align-items: center; justify-content: flex-start; flex: 1;">
                    <div style="display:flex; flex-direction:column; gap:10px; justify-content:center; align-items:center;">${enemyRows.front}</div>
                    <div style="display:flex; flex-direction:column; gap:10px; justify-content:center; align-items:center;">${enemyRows.middle}</div>
                    <div style="display:flex; flex-direction:column; gap:10px; justify-content:center; align-items:center;">${enemyRows.back}</div>
                </div>

            </div>
            <div id="combat-layer-vfx" style="position: absolute; width: 100%; height: 100%; top: 0; left: 0; pointer-events: none; z-index: ${layers.vfx_top?.zIndex || 4};"></div>
            <div class="combat-ui-overlay" style="position: absolute; top: 15px; left: 0; width: 100%; padding: 0 20px; box-sizing: border-box; display: flex; flex-direction: row; justify-content: space-between; align-items: center; z-index: ${layers.ui_overlay?.zIndex || 5};">
                <div id="combat-round-counter" style="background: rgba(0,0,0,0.7); color: #fff; font-size: 14px; font-weight: bold; padding: 4px 12px; border-radius: 4px; border: 1px solid #444;">ROUND: 1</div>
                <div style="display: flex; flex-direction: row; gap: 8px;">
                    <button id="btn_combat_speed_toggle" style="background: #222; color: #ffcc00; border: 1px solid #ffcc00; border-radius: 4px; padding: 4px 10px; font-size: 11px; cursor: pointer; pointer-events: auto; font-weight: bold;">▶ x1</button>
                    <button id="btn_combat_mode_toggle" style="background: #111; color: #fff; border: 1px solid #444; border-radius: 4px; padding: 4px 10px; font-size: 11px; cursor: pointer; pointer-events: auto; font-weight: bold; text-transform: uppercase;">Mode: JRPG</button>

                </div>
            </div>
            <div id="gacha_ultimate_panel" class="gacha-ult-panel" style="display: none;"></div>

            
        ${combatVictoryPopUp}
    `;
}


function renderJRPGMenu(currentAction, container, GameConfig) {
    // 1. Находим нужный слот меню по ID ходящего юнита
    const menuContainer = container.querySelector(`#jrpg_menu_${currentAction.attacker_id}`);
    if (!menuContainer) return;

    // Поднимаем слой самого персонажа на поле боя, чтобы меню отображалось НАД всеми соседями
    const attackerUnitNode = container.querySelector(`#combat_unit_${currentAction.attacker_id}`);
    if (attackerUnitNode) {
        attackerUnitNode.style.zIndex = "999";
    }

    const catalog = GameConfig.catalog || {};

    // --- СТРОГО ТВОЯ ЛОГИКА ОПРЕДЕЛЕНИЯ ГОТОВНОСТИ УЛЬТЫ ---
    const heroData = Game.player.heroes?.find(h => h.instance_id === currentAction.instanceId);
    if(!heroData) return;
    const heroProto = Game.config.catalog.heroes[heroData.hero_id];
    if(!heroProto) return;
    const ultSkill = heroProto?.skills?.find(s => Game.config.catalog?.skills?.[s.skill_id]?.type === "ultimate");

    const energyBarNode = container.querySelector(`#energy_bar_${currentAction.attacker_id}`);
    const currentEnergy = energyBarNode ? parseFloat(energyBarNode.style.width) || 0 : 0;

    const isUltReady = ultSkill && currentEnergy >= 100;
    // ------------------------------------------------------

    // Динамически подтягиваем название ульты из каталога навыков для красивого вывода на кнопке
    const ultTitle = ultSkill ? (catalog.skills[ultSkill.skill_id]?.title_loc?.ru || catalog.skills[ultSkill.skill_id]?.title_loc?.en || "УЛЬТИМЕЙТ") : "НЕТ НАВЫКА";

    // 2. Генерируем скошенные кнопки строго в твой родной интерфейсный столбик
    menuContainer.innerHTML = `
        <button class="jrpg-btn" data-action="basic_strike">⚔️ Attack</button>
        <button class="jrpg-btn" data-action="${ultSkill ? ultSkill.skill_id : ''}" ${!isUltReady ? 'disabled' : ''}>🔮 ${ultTitle}</button>
        <button class="jrpg-btn" data-action="basic_strike" style="box-shadow: -4px 4px 0px #777;">🛡️ Skip</button>
    `;

    // Анимируем плавное появление меню на экране
    menuContainer.classList.add('active');

    // 3. Вешаем обработчики кликов на сгенерированные кнопки
    menuContainer.querySelectorAll('.jrpg-btn').forEach(btn => {
        btn.onclick = (e) => {
            e.stopPropagation();
            const selectedSkillId = btn.getAttribute('data-action');
            if (!selectedSkillId) return; // Защита от клика по задизейбленной ульте

            // Скрываем меню с экрана
            menuContainer.classList.remove('active');

            // Возвращаем слой персонажа на поле боя в исходное положение
            if (attackerUnitNode) {
                attackerUnitNode.style.zIndex = "3";
            }

            // Мгновенный отзывчивый визуальный сброс полоски маны при успешном прожиме ультимейта
            if (selectedSkillId === ultSkill?.skill_id && energyBarNode) {
                energyBarNode.style.width = '0%';

                // Синхронно гасим и нижнюю Гача-панель аватарок, если она активна
                const playerHeroIds = Game.player.teams?.pve_main || [];
                const playerHeroIdx = playerHeroIds.indexOf(currentAction.instanceId);
                if (playerHeroIdx !== -1) {
                    const gachaEnergyBar = container.querySelector(`#gacha_energy_p_${playerHeroIdx}`);
                    const gachaSlotNode = container.querySelector(`#gacha_slot_p_${playerHeroIdx}`);
                    if (gachaEnergyBar) gachaEnergyBar.style.width = '0%';
                    if (gachaSlotNode) gachaSlotNode.classList.remove('ultimate-ready');
                }
            }

            // Отправляем сокет-команду на бэкенд для продвижения симуляции боя
            sendSocket('battle', 'pveTurn', {
                battleId: CombatState.battleId,
                reqHeroId: currentAction.instanceId,
                reqSkillId: selectedSkillId
            });
        };
    });
}

function renderJRPGMenuBig(currentAction, container, GameConfig) {
    // Находим слой VFX — он гарантированно растянут на весь экран и лежит поверх поля боя
    const vfxLayer = container.querySelector('#combat-layer-vfx');

    // 1. Ищем или создаем контейнер меню теперь ВНУТРИ vfxLayer, а не в корне контейнера!
    // Это автоматически поднимет меню на самый верхний слой экрана
    let menuContainer = container.querySelector('#jrpg_menu_big_overlay');
    if (!menuContainer) {
        menuContainer = document.createElement('div');
        menuContainer.id = 'jrpg_menu_big_overlay';

        menuContainer.style.position = 'absolute';
        menuContainer.style.top = '50%';
        menuContainer.style.left = '-300px';
        menuContainer.style.transform = 'translateY(-50%)';

        menuContainer.style.display = 'flex';
        menuContainer.style.alignItems = 'center';
        menuContainer.style.gap = '5px';

        // --- КРИТИЧЕСКИЙ ФИКС СЛОЕВ ---
        menuContainer.style.zIndex = '100'; // Внутри vfxLayer этого более чем достаточно
        // Форсируем перехват мыши! Так как у vfxLayer стоит pointer-events: none,
        // этот auto заставит браузер обрабатывать клики СТРОГО на самом меню
        menuContainer.style.pointerEvents = 'auto';

        menuContainer.style.transition = 'left 0.25s ease-out, opacity 0.25s ease-out';
        menuContainer.style.opacity = '0';

        // ВСТАВЛЯЕМ ВНУТРИ VFX СЛОЯ
        if (vfxLayer) {
            vfxLayer.appendChild(menuContainer);
        } else {
            container.appendChild(menuContainer); // Фоллбек
        }
    }

    const catalog = GameConfig.catalog || {};

    // --- ТВОЯ НАДЕЖНАЯ ЛОГИКА СКИЛЛОВ И ЭНЕРГИИ (БЕЗ ИЗМЕНЕНИЙ) ---
    const heroData = Game.player.heroes?.find(h => h.instance_id === currentAction.instanceId);
    if (!heroData) return;

    const heroProto = Game.config.catalog.heroes[heroData.hero_id];
    if (!heroProto) return;

    const ultSkill = heroProto?.skills?.find(s => Game.config.catalog?.skills?.[s.skill_id]?.type === "ultimate");

    const energyBarNode = container.querySelector(`#energy_bar_${currentAction.attacker_id}`);
    const currentEnergy = energyBarNode ? parseFloat(energyBarNode.style.width) || 0 : 0;

    const isUltReady = ultSkill && currentEnergy >= 100;
    // ------------------------------------------------------------------

    const ultTitle = ultSkill ? (catalog.skills[ultSkill.skill_id]?.title_loc?.ru || catalog.skills[ultSkill.skill_id]?.title_loc?.en || "ULTIMATE") : "NO SKILL";

    // 2. ГЕНЕРИРУЕМ ИНТЕРФЕЙС (Твои скошенные кнопки)
    menuContainer.innerHTML = `
        <div class="jrpg-big-avatar-circle" style="width: 90px; height: 90px; border-radius: 50%; border: 3px solid #ffcc00; overflow: hidden; background: #222; position: relative; flex-shrink: 0;">
            <img src="${heroProto.icon}" style="width: 100%; height: 100%; object-fit: cover;">
            <div style="position: absolute; bottom: 0; right: 0; background: #ffcc00; color: #000; font-size: 9px; font-weight: bold; padding: 1px 4px; border-radius: 3px 0 0 0;">LV.${heroData.level || 1}</div>
        </div>

        <div class="jrpg-big-buttons-column" style="display: flex; flex-direction: column; gap: 8px;  transform: skewX(-10deg) translateX(0);">
            <button class="jrpg-btn" data-action="basic_strike">⚔️ Attack</button>
            <button class="jrpg-btn" data-action="${ultSkill ? ultSkill.skill_id : ''}" ${!isUltReady ? 'disabled' : ''}>🔮 ${ultTitle}</button>
            <button class="jrpg-btn" data-action="basic_strike" style="box-shadow: -4px 4px 0px #777;">🛡️ Skip</button>
        </div>
    `;

    // Выезжаем плавно на 5px
    requestAnimationFrame(() => {
        menuContainer.style.left = '5px';
        menuContainer.style.opacity = '1';
    });

    // 3. ВЕШАЕМ ОБРАБОТЧИКИ КЛИКОВ НА КНОПКИ
    menuContainer.querySelectorAll('.jrpg-btn').forEach(btn => {
        btn.onclick = (e) => {
            e.stopPropagation();
            const selectedSkillId = btn.getAttribute('data-action');
            if (!selectedSkillId) return;

            // Уезжаем обратно за экран
            menuContainer.style.left = '-300px';
            menuContainer.style.opacity = '0';

            // Мгновенный сброс полосок энергии при ульте
            if (selectedSkillId === ultSkill?.skill_id && energyBarNode) {
                energyBarNode.style.width = '0%';

                const playerHeroIds = Game.player.teams?.pve_main || [];
                const playerHeroIdx = playerHeroIds.indexOf(currentAction.instanceId);
                if (playerHeroIdx !== -1) {
                    const gachaEnergyBar = container.querySelector(`#gacha_energy_p_${playerHeroIdx}`);
                    const gachaSlotNode = container.querySelector(`#gacha_slot_p_${playerHeroIdx}`);
                    if (gachaEnergyBar) gachaEnergyBar.style.width = '0%';
                    if (gachaSlotNode) gachaSlotNode.classList.remove('ultimate-ready');
                }
            }

            sendSocket('battle', 'pveTurn', {
                battleId: CombatState.battleId,
                reqHeroId: currentAction.instanceId,
                reqSkillId: selectedSkillId
            });
        };
    });
}





function renderGachaSkipButton(heroIdx, currentAction, container) {
    const slotNode = container.querySelector(`#gacha_slot_p_${heroIdx}`);
    if (!slotNode) return;

    // Проверяем, чтобы кнопка не наплодилась дважды
    if (slotNode.querySelector('.gacha-skip-btn')) return;

    const skipBtn = document.createElement('button');
    skipBtn.className = 'gacha-skip-btn';
    skipBtn.style.position = 'absolute';

    // Сдвигаем повыше и делаем крупнее
    skipBtn.style.top = '-26px'; // Подняли повыше, так как высота стала больше
    skipBtn.style.left = '0';
    skipBtn.style.width = '100%';
    skipBtn.style.height = '22px'; // Сделали кнопку побольше и заметнее

    // Стилизуем кнопку (сделаем её поярче и аккуратнее)
    skipBtn.style.background = '#222';
    skipBtn.style.color = '#ffcc00'; // Желтый текст, чтобы бросался в глаза
    skipBtn.style.border = '2px solid #555';
    skipBtn.style.fontSize = '14px'; // Увеличили шрифт
    skipBtn.style.padding = '0';
    skipBtn.style.fontWeight = 'bold';
    skipBtn.style.borderRadius = '4px'; // Слегка скруглим углы
    skipBtn.style.cursor = 'pointer';
    skipBtn.style.zIndex = '100'; // Форсируем слой над полем боя
    skipBtn.innerText = 'SKIP ';

    slotNode.appendChild(skipBtn);

    // Клик по СКИПу — это на самом деле отправка автоатаки на бэкэнд
    skipBtn.onclick = (e) => {
        e.stopPropagation();

        // --- ТОЧНЫЙ И НАДЕЖНЫЙ СБОР ИНСТАНСА ---
        // Берем инстанс-айди прямо из разметки слота, куда была вставлена кнопка
        const verifiedInstanceId = slotNode.getAttribute('data-instance-id');

        skipBtn.remove(); // Удаляем кнопку с экрана
        slotNode.classList.remove('ultimate-ready');

        // Мгновенно тушим полоску ульты под аватаркой на клике, как мы делали в Блоке 3
        const gachaEnergyBar = slotNode.querySelector('.gacha-energy-bar');
        if (gachaEnergyBar) gachaEnergyBar.style.width = '0%';

        sendSocket('battle', 'pveTurn', {
            battleId: CombatState.battleId,
            reqHeroId: verifiedInstanceId, // <--- Теперь летит железно правильный инстанс
            reqSkillId: "basic_strike"
        });
    };
}


export function initCombatArenaScreen(updateUiCallback) {
    // ==========================================
    // БЛОК 1: ИНИЦИАЛИЗАЦИЯ ПЕРЕМЕННЫХ
    // ==========================================
    const container = Game.uiContainer;

    const {type, stageId, towerKey} = Game.pveContext;
    const battleResult = Game.battleResult;

    // Задаем базовый режим интерфейса по умолчанию, если он еще не выбран игроком
    if (CombatState.uiMode === undefined) {
        // CombatState.uiMode = 'jrpg';
        CombatState.uiMode = 'gacha';
    }

    // ==========================================
    // БЛОК 2: ОБРАБОТКА ДАННЫХ И РАСЧЕТ СЕССИИ БОЯ
    // ==========================================
    // Проверяем: это абсолютно новое сражение или продолжение существующего ручного боя?
    if (!CombatState.battleId || (CombatState.battleId !== battleResult.battleId)) {
        // Сценарий А: Новый бой (или переключились на другую сессию)
        CombatState.battleId = battleResult.battleId;
        CombatState.replay = battleResult.replay;
        CombatState.currentActionIndex = 0; // Начинаем воспроизведение логов строго с самого начала (ход 0)
        CombatState.currentRoundIndex = 0;

        // Включаем флаг активности плеера и запускаем первый шаг с небольшой задержкой
        CombatState.isPlaybackActive = true;

        container.insertAdjacentHTML('beforeend', getCombatArenaHTML(battleResult, stageId, type, towerKey));
        renderCombatArenaDOM(container, battleResult, stageId, type, towerKey);

        setTimeout(playNextAction, 500);
    }
    else {
        // Сценарий Б: Бой уже идет (игрок только что прислал свой ход сокетом)
        const previousLength = CombatState.replay.length;

        // Записываем обновленный (удлинившийся) лог действий от сервера
        CombatState.replay = battleResult.replay;

        // Перематываем указатель плеера на первый новый ход, который прислал сервер
        CombatState.currentActionIndex = previousLength;
        console.log(`[ПЛЕЕР]: Бой продолжается. Перемотка на индекс: ${previousLength}`);

        CombatState.isPlaybackActive = true;
        setTimeout(playNextAction, 500);
    }

    // Синхронизируем мета-данные состояния боя в глобальный стейт фронтенда
    CombatState.end = battleResult.end;
    CombatState.currentCharacterId = battleResult.currentCharacterId;
    CombatState.currentCharacterInstance = battleResult.currentCharacterInstance;
    CombatState.options = battleResult.options;



    const vfxLayer = container.querySelector('#combat-layer-vfx');
    const roundCounter = container.querySelector('#combat-round-counter');

    async function playNextAction() {
        const currentAction = CombatState.replay[CombatState.currentActionIndex];

        // Проверяем, принадлежит ли текущий ОЖИДАЕМЫЙ на поле персонаж команде игрока
        const isPlayerTurn = Game.player.heroes?.some(h => h.instance_id === CombatState.currentCharacterInstance);

        // --- СЦЕНАРИЙ А: ЛОГ ТЕКУЩИХ ХОДОВ ИСЧЕРПАН, БОЙ ПРОДОЛЖАЕТСЯ ---
        if (!CombatState.end && isPlayerTurn && !currentAction) {
            CombatState.isPlaybackActive = false; // Ставим плеер на паузу

            // 1. Остановка для режима JRPG (ждем клика по меню навыков)
            if (CombatState.uiMode === 'jrpg') {
                const attackerNode = container.querySelector(`#combat_unit_${CombatState.currentCharacterId}`);
                if (attackerNode) attackerNode.style.boxShadow = "0 0 20px #ffcc00"; // Подсвечиваем ходящего

                // Отрисовываем меню выбора навыков
                // renderJRPGMenu({
                //     attacker_id: CombatState.currentCharacterId,
                //     instanceId: CombatState.currentCharacterInstance
                // }, container, Game.config);

                renderJRPGMenuBig({
                    attacker_id: CombatState.currentCharacterId,
                    instanceId: CombatState.currentCharacterInstance
                }, container, Game.config);

                return;
            }
            // 2. Логика для режима GACHA (авто-атака или ожидание ультимейта)
            // 2. Логика для режима GACHA (авто-атака или ожидание ультимейта)
            else if (CombatState.uiMode === 'gacha') {
                const energyBarNode = container.querySelector(`#energy_bar_${CombatState.currentCharacterId}`);
                const currentEnergy = energyBarNode ? parseFloat(energyBarNode.style.width) || 0 : 0;

                if (currentEnergy < 100) {
                    console.log(`[GACHA MODE]: Энергия персонажа на экране: ${currentEnergy}%. Отправляем авто-атаку.`);
                    sendSocket('battle', 'pveTurn', {
                        battleId: CombatState.battleId,
                        reqHeroId: CombatState.currentCharacterInstance,
                        reqSkillId: "basic_strike"
                    });
                    return;
                }
                else {
                    // Энергия на экране честно равна 100% — выводим кнопку скипа хода / ульты
                    const playerHeroIds = Game.player.teams?.pve_main || [];
                    const playerHeroIdx = playerHeroIds.indexOf(CombatState.currentCharacterInstance);
                    if (playerHeroIdx !== -1) {
                        renderGachaSkipButton(playerHeroIdx, { instanceId: CombatState.currentCharacterInstance }, container);
                    }
                    return;
                }
            }

        }

        // --- ЗАЩИТНЫЙ ВЫХОД: Если лог пуст, но это не ход игрока (проверяется в Блоке 5) ---
        if (!currentAction) {
            playNextActionEndCheck(); // Передаем управление Блоку 5
            return;
        }


        // Обновляем визуальный счетчик раундов
        const currentRound = currentAction.turn;
        if (roundCounter) roundCounter.innerText = `ROUND: ${currentRound}`;

        // Анимация каста навыка/ульты персонажем
        const attackerNode = container.querySelector(`#combat_unit_${currentAction.attacker_id}`);
        const attackerImg = attackerNode?.querySelector('img');
        const actionAnimation = currentAction.action;

        if (attackerNode && attackerImg && actionAnimation.type === 'skill') {
            attackerNode.classList.add('ultimate-cast-active');
            attackerImg.classList.add('ultimate-glow-active');

            setTimeout(() => {
                attackerNode.classList.remove('ultimate-cast-active');
                attackerImg.classList.remove('ultimate-glow-active');
            }, 600);
        }

        const subActionTime = CombatState.playbackSpeed;

        // Запускаем отрисовку под-действий (цифры урона, баффы)
        if (currentAction.sub_actions && currentAction.sub_actions.length) {
            currentAction.sub_actions.forEach((subAction) => {
                updateBarsEffects(container, currentAction, subAction, subActionTime);
            });

            // Ждем завершения анимации и переходим к следующему индексу лога
            setTimeout(() => {
                CombatState.currentActionIndex++;
                playNextAction();
            }, subActionTime);
        }
        else {
            CombatState.currentActionIndex++;
            playNextAction();
        }

        // const subActionTime = CombatState.playbackSpeed;
        //
        // if (currentAction.sub_actions && currentAction.sub_actions.length) {
        //     let index = 0;
        //
        //     const playSubAction = () => {
        //         setTimeout(() => {
        //             const subAction = currentAction.sub_actions[index];
        //
        //             updateBarsEffects(container, currentAction, subAction, subActionTime);
        //
        //             if (index < currentAction.sub_actions.length - 1) {
        //                 index++;
        //                 playSubAction();
        //             }
        //             else {
        //                 CombatState.currentActionIndex++;
        //                 playNextAction();
        //             }
        //         }, subActionTime);
        //     };
        //     playSubAction();
        // }
        // else {
        //     CombatState.currentActionIndex++;
        //     playNextAction();
        // }

    }

    function playNextActionEndCheck() {
        // Если флаг завершения боя установлен на сервере и мы досмотрели реплей до конца
        if (CombatState.end) {
            CombatState.isPlaybackActive = false; // Полностью останавливаем плеер

            console.log(`[ПЛЕЕР]: Бой успешно завершен. Результат: ${battleResult.win ? 'ПОБЕДА' : 'ПОРАЖЕНИЕ'}`);

            // Вызываем окно результатов боя, прокидывая отчет о наградах и прогресс
            showBattleEndPopup(battleResult, container, type, towerKey, updateUiCallback);
        }
        else {
            // Защитный фоллбек: если реплей кончился, но сервер не прислал флаг конца боя и это не ход игрока
            console.warn("[ПЛЕЕР]: Лог ходов пуст, но состояние боя не определено. Ожидание синхронизации.");
        }
    }
}


function renderCombatArenaDOM(container, battleResult, stageId, type, towerKey) {
    // 1. Рендерим базовый каркас HTML структуры арены

    const ultPanel = container.querySelector('#gacha_ultimate_panel');
    const modeBtn = container.querySelector('#btn_combat_mode_toggle');
    const speedBtn = container.querySelector('#btn_combat_speed_toggle');

    // 2. Инициализация и сборка панели ультимейтов для GACHA режима
    if (ultPanel) {
        let panelHTML = '';
        const playerHeroIds = Game.player.teams?.pve_main || [];

        playerHeroIds.forEach((instId, index) => {
            const hero = Game.player.heroes?.find(h => h.instance_id === instId);
            const proto = Game.config.catalog?.heroes?.[hero?.hero_id];
            if (proto) {
                panelHTML += `
                    <div id="gacha_slot_p_${index}" class="gacha-hero-slot" data-instance-id="${instId}">
                        <img src="${proto.icon}" style="width: 100%; height: 100%; object-fit: cover;">
                        <div id="gacha_energy_p_${index}" class="gacha-energy-bar" style="width: 0%;"></div>
                    </div>
                `;
            }
        });
        ultPanel.innerHTML = panelHTML;

        // Навешиваем события клика по аватаркам (активация ульты "на лету")
        ultPanel.querySelectorAll('.gacha-hero-slot').forEach(slot => {
            slot.onclick = () => {
                // Ульта прожимается только если она готова и сейчас включен Гача-режим
                if (!slot.classList.contains('ultimate-ready') || CombatState.uiMode !== 'gacha') return;

                const instId = slot.getAttribute('data-instance-id');
                const heroData = Game.player.heroes?.find(h => h.instance_id === instId);
                if(!heroData) return;
                const heroProto = Game.config.catalog.heroes[heroData.hero_id];
                if(!heroProto) return;
                const ultSkill = heroProto?.skills?.find(s => Game.config.catalog?.skills?.[s.skill_id]?.type === "ultimate");

                if (ultSkill) {
                    slot.classList.remove('ultimate-ready'); // Визуально снимаем подсветку до ответа сервера

                    const gachaEnergyBar = slot.querySelector('.gacha-energy-bar');
                    if (gachaEnergyBar) {
                        gachaEnergyBar.style.width = '0%';
                    }

                    const playerHeroIds = Game.player.teams?.pve_main || [];
                    const playerHeroIdx = playerHeroIds.indexOf(instId);

                    if (playerHeroIdx !== -1) {
                        // Находим полоску маны над головой персонажа НА ПОЛЕ БОЯ и сбрасываем в 0%
                        const fieldEnergyBar = container.querySelector(`#energy_bar_p_${playerHeroIdx}`);
                        if (fieldEnergyBar) {
                            fieldEnergyBar.style.width = '0%';
                        }
                    }

                    const activeSkipBtn = container.querySelector('.gacha-skip-btn');
                    if (activeSkipBtn) {
                        activeSkipBtn.remove();
                    }

                    sendSocket('battle', 'pveTurn', {
                        battleId: CombatState.battleId,
                        reqHeroId: instId,
                        reqSkillId: ultSkill.skill_id
                    });
                }
            };
        });
    }

    // 3. Управление кнопкой переключения режимов (JRPG / GACHA)
    if (modeBtn) {
        // Устанавливаем корректное стартовое состояние кнопки и видимость панели
        modeBtn.innerText = `Mode: ${CombatState.uiMode.toUpperCase()}`;
        if (ultPanel) {
            ultPanel.style.display = CombatState.uiMode === 'gacha' ? 'flex' : 'none';
        }

        modeBtn.onclick = () => {
            if (CombatState.uiMode === 'jrpg') {
                CombatState.uiMode = 'gacha';
                modeBtn.innerText = 'Mode: GACHA';
                if (ultPanel) ultPanel.style.display = 'flex';

                // Если бой стоял на паузе в ожидании хода, в Гаче автоматически снимаем её
                if (!CombatState.isPlaybackActive) {
                    CombatState.isPlaybackActive = true;
                    playNextAction();
                }
            } else {
                CombatState.uiMode = 'jrpg';
                modeBtn.innerText = 'Mode: JRPG';
                if (ultPanel) ultPanel.style.display = 'none';
            }
        };
    }

    // 4. Управление тумблером скорости воспроизведения анимаций
    if (speedBtn) {
        speedBtn.onclick = () => {
            if (CombatState.playbackSpeed === 1000) {
                CombatState.playbackSpeed = 500;
                speedBtn.innerText = '▶▶ x2';
            } else if (CombatState.playbackSpeed === 500 || CombatState.playbackSpeed === 400) {
                CombatState.playbackSpeed = 200;
                speedBtn.innerText = '▶▶▶ x5';
            } else {
                CombatState.playbackSpeed = 1000;
                speedBtn.innerText = '▶ x1';
            }
        };
    }
}

function updateBarsEffects(container, currentAction, subAction, subActionTime) {
    // Безопасный поиск нод. Если это дот начала/конца хода, атакующего может не быть — и это нормально!
    const attackerNode = container.querySelector(`#combat_unit_${currentAction?.attacker_id}`);
    const targetNode = container.querySelector(`#combat_unit_${subAction?.target_id}`);

    // Если цель действия не найдена на поле боя — мгновенно выходим, защищая плеер от падения
    if (!targetNode) return;

    const attackerImg = attackerNode?.querySelector('img');
    const actionAnimation = currentAction?.action;

    const targetImg = targetNode.querySelector('img');

    const attackerHpBar = container.querySelector(`#hp_bar_${currentAction.attacker_id}`);
    const targetHpBar = container.querySelector(`#hp_bar_${subAction.target_id}`);

    const targetEnergyBar = container.querySelector(`#energy_bar_${subAction.target_id}`);
    const attackerEnergyBar = attackerNode ? container.querySelector(`#energy_bar_${currentAction.attacker_id}`) : null;

    const vfxLayer = container.querySelector('#combat-layer-vfx');

    const targetRect = targetNode.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();

    // Очередь анимации: вычисляем координаты для вылета текста над головой юнита
    const posX = targetRect.left - containerRect.left + (targetRect.width / 2) - 20;
    const posY = targetRect.top - containerRect.top - 15;

    // --- ФАЗА 1: ФИЗИЧЕСКИЙ РЫВОК АТАКУЮЩЕГО (Только при атаках с руки) ---
    if (attackerNode && attackerImg && actionAnimation?.type === 'attack' && subAction.type === 'damage') {
        const isPlayer = currentAction.attacker_id.startsWith('p');
        const jumpDistance = isPlayer ? 30 : -30;

        attackerImg.style.transition = 'transform 0.15s ease-out';
        attackerImg.style.transform = isPlayer ? `translateX(${jumpDistance}px) scale(1.1)` : `scaleX(-1) translateX(${jumpDistance}px) scale(1.1)`;
        attackerNode.style.zIndex = "10";

        // Возвращаем персонажа на место по таймеру
        setTimeout(() => {
            if (attackerImg) {
                attackerImg.style.transform = isPlayer ? 'translateX(0) scale(1)' : 'scaleX(-1) translateX(0) scale(1)';
                attackerNode.style.zIndex = "3";
            }
        }, 150);
    }

    if (subAction.type === 'damage' || subAction.type === 'tick_damage') {
        const isTick = subAction.type === 'tick_damage';

        // Эффект сотрясения картинки при получении прямого урона
        if (targetImg && !isTick) {
            const isPlayerAttacking = currentAction?.attacker_id?.startsWith('p');
            targetNode.classList.add('hit-flash');
            targetImg.classList.add(isPlayerAttacking ? 'hit-shake-e' : 'hit-shake-p');

            setTimeout(() => {
                targetNode.classList.remove('hit-flash');
                if (targetImg) targetImg.classList.remove('hit-shake-e', 'hit-shake-p');
            }, 350);
        }

        // Создаем всплывающий текст урона
        const damageTextNode = document.createElement('div');
        damageTextNode.className = 'damage-float-text';
        damageTextNode.style.position = 'absolute';
        damageTextNode.style.left = `${posX}px`;
        damageTextNode.style.top = `${posY}px`;
        damageTextNode.style.fontFamily = 'Arial Black, sans-serif';
        damageTextNode.style.fontSize = subAction.is_crit ? '28px' : '20px';
        // Крит = желтый, обычный = белый, дот яда/горения = фиолетово-оранжевый
        damageTextNode.style.color = subAction.is_crit ? '#ffeb3b' : (isTick ? '#e91e63' : '#ffffff');
        damageTextNode.style.fontWeight = 'bold';
        damageTextNode.style.zIndex = "100";
        damageTextNode.innerText = `-${subAction.damage}`;

        if (vfxLayer) {
            vfxLayer.appendChild(damageTextNode);
            setTimeout(() => damageTextNode.remove(), 1200);
        }

        if (attackerHpBar && subAction.attacker_left_hp !== undefined && subAction.attacker_max_hp !== undefined) {
            const hpPercent = Math.max(0, Math.min(100, (Number(subAction.attacker_left_hp) / Number(subAction.attacker_max_hp)) * 100));
            attackerHpBar.style.width = `${hpPercent}%`;
        }

        if (targetHpBar && subAction.target_left_hp !== undefined && subAction.target_max_hp !== undefined) {
            const hpPercent = Math.max(0, Math.min(100, (Number(subAction.target_left_hp) / Number(subAction.target_max_hp)) * 100));
            targetHpBar.style.width = `${hpPercent}%`;
        }
    }
    else if (subAction.type === 'energy_change') {
        const energyTextNode = document.createElement('div');
        energyTextNode.style.position = 'absolute';
        energyTextNode.style.left = `${posX}px`;
        energyTextNode.style.top = `${posY - 15}px`; // Выталкиваем чуть выше
        energyTextNode.style.fontFamily = 'sans-serif';
        energyTextNode.style.fontSize = '14px';
        energyTextNode.style.color = '#00bcd4';
        energyTextNode.style.fontWeight = 'bold';
        energyTextNode.style.zIndex = "100";
        energyTextNode.innerText = subAction.energy_change >= 0 ? `+${subAction.energy_change} MP` : `${subAction.energy_change} MP`;

        if (vfxLayer) {
            vfxLayer.appendChild(energyTextNode);
            setTimeout(() => energyTextNode.remove(), 1000);
        }

        const playerHeroIds = Game.player.teams?.pve_main || [];
        let playerHeroIdx = playerHeroIds.indexOf(CombatState.currentCharacterInstance);

        // Исправлено: используем только проверенную и точную переменную subAction
        if (subAction.self) {
            if (attackerEnergyBar && subAction.current_energy !== undefined) {
                attackerEnergyBar.style.width = `${Math.min(100, subAction.current_energy)}%`;
            }
            playerHeroIdx = currentAction.attacker_id;
        }
        else {
            if (targetEnergyBar && subAction.current_energy !== undefined) {
                targetEnergyBar.style.width = `${Math.min(100, subAction.current_energy)}%`;
            }
            playerHeroIdx = subAction.target_id;
        }

        console.log('[IDS for gacha]:', CombatState.uiMode, currentAction.attacker_id, subAction.target_id, `#gacha_energy_${playerHeroIdx}`, `#gacha_slot_${playerHeroIdx}`);

        if (CombatState.uiMode === 'gacha') {
            // Находим его нижнюю аватарку и полоску маны под ней
            const gachaEnergyBar = container.querySelector(`#gacha_energy_${playerHeroIdx}`);
            const gachaSlotNode = container.querySelector(`#gacha_slot_${playerHeroIdx}`);

            const playerCharEnergy = Math.min(100, subAction.current_energy);
            console.log(playerCharEnergy, gachaSlotNode, gachaEnergyBar);
            if (gachaEnergyBar) gachaEnergyBar.style.width = `${playerCharEnergy}%`;
            if (gachaSlotNode && playerCharEnergy===100) {
                gachaSlotNode.classList.add('ultimate-ready');
            }

            renderGachaSkipButton(playerHeroIdx, { instanceId: CombatState.currentCharacterInstance }, container);
        }
    }
    else if (subAction.type === 'effect_applied') {
        const effectTextNode = document.createElement('div');
        effectTextNode.style.position = 'absolute';
        effectTextNode.style.left = `${posX}px`;
        effectTextNode.style.top = `${posY - 30}px`; // Еще выше
        effectTextNode.style.fontFamily = 'sans-serif';
        effectTextNode.style.fontSize = '12px';
        effectTextNode.style.color = '#ff9800';
        effectTextNode.style.fontWeight = 'bold';
        effectTextNode.style.zIndex = "100";
        effectTextNode.innerText = `${subAction.effect_id?.replace('eff_', '').toUpperCase()}`;

        if (vfxLayer) {
            vfxLayer.appendChild(effectTextNode);
            setTimeout(() => effectTextNode.remove(), 1000);
        }
    }

    if (subAction.target_died) {
        console.log('[DIED ACTION]', subAction);
    }

    // Обработка смерти персонажа на экране
    if (subAction.target_died) {
        targetNode.style.opacity = '0.2';
        targetNode.style.filter = 'grayscale(100%)';
        targetNode.style.transition = 'opacity 0.5s ease, filter 0.5s ease';
    }

    if (subAction.target_died && String(subAction.target_died) === 'true') {
        targetNode.style.opacity = '0.2';
        targetNode.style.filter = 'grayscale(100%)';
        targetNode.style.transition = 'opacity 0.5s ease, filter 0.5s ease';
        targetNode.style.pointerEvents = 'none'; // Блокируем клики по трупу на поле боя
    }

    // Дополнительно: проверяем смерть атакующего, если он убился (тоже в самый конец)
    if (attackerNode && subAction.attacker_died && String(subAction.attacker_died) === 'true') {
        attackerNode.style.opacity = '0.2';
        attackerNode.style.filter = 'grayscale(100%)';
        attackerNode.style.transition = 'opacity 0.5s ease, filter 0.5s ease';
        attackerNode.style.pointerEvents = 'none';
    }
}


function showBattleEndPopup(battleResult, container, type, towerKey, updateUiCallback) {

    const ultPanel = container.querySelector('#gacha_ultimate_panel');
    if(ultPanel) ultPanel.innerHTML = '';

    // Внутри функции showBattleEndPopup
    const victoryPopup = container.querySelector('#combat_victory_popup');
    const popupTitle = container.querySelector('#victory-popup-title');

// КРИТИЧЕСКИЙ ФИКС: Ищем строго по ID result-view-rewards, который зашит в HTML-слое!
    const rewardsList = container.querySelector('#result-view-rewards');

    const statsList = container.querySelector('#result-view-stats');
    const closeBtn = container.querySelector('#btn_close_combat_victory_screen');
    const nextStageDirectBtn = container.querySelector('#btn_next_combat_stage_direct');
    const autoNextCheckbox = container.querySelector('#checkbox-auto-next');


    if (!victoryPopup) return;

    // Считываем глобальный флаг автонекста из localStorage, чтобы игра помнила выбор игрока
    const isAutoNextEnabled = localStorage.getItem('gacha_builder_auto_next') === 'true';
    if (autoNextCheckbox) autoNextCheckbox.checked = isAutoNextEnabled;

    // =========================================================================
    // 1. ДИНАМИЧЕСКИЙ РАСЧЕТ МЕТРИК СТАТИСТИКИ И ВЫБОР MVP ИЗ РЕПЛЕЯ БЭКЕНДА
    // =========================================================================
    const damageTracker = {}; // { p_0: 5055, p_1: 1889 }
    let maxDamageDone = 0;
    let mvpUnitId = 'p_0';


    (battleResult.replay || []).forEach(round => {
        (round.actions || []).forEach(act => {
            // Считаем урон только для отряда игрока (нападающие с префиксом "p_")
            if (act.attacker_id && act.attacker_id.startsWith('p')) {
                damageTracker[act.attacker_id] = (damageTracker[act.attacker_id] || 0) + Number(act.damage);

                if (damageTracker[act.attacker_id] > maxDamageDone) {
                    maxDamageDone = damageTracker[act.attacker_id];
                    mvpUnitId = act.attacker_id;
                }
            }
        });
    });

    // Привязываем данные к блоку MVP в сайдбаре результаты
    const mvpIndex = parseInt(mvpUnitId.split('_')[1]);
    const playerHeroIds = Game.player.teams?.pve_main || [];
    const mvpHeroInstance = Game.player.heroes?.find(h => h.instance_id === playerHeroIds[mvpIndex]);
    const mvpProto = Game.config.catalog?.heroes?.[mvpHeroInstance?.hero_id];

    if (mvpProto) {
        container.querySelector('#mvp-hero-img').src = mvpProto.image || mvpProto.icon;;
        container.querySelector('#mvp-hero-name').innerText = locObj(mvpProto.title_loc) || mvpHeroInstance.hero_id;
        container.querySelector('#mvp-hero-score').innerText = `💥 Total DMG: ${maxDamageDone}`;
    }

    // =========================================================================
    // 2. ОТРИСОВКА ВКЛАДКИ REWARDS (НАГРАДЫ)
    // =========================================================================
    if (battleResult.win) {
        if (popupTitle) { popupTitle.innerText = 'VICTORY'; popupTitle.style.color = '#4caf50'; }

        let lootHTML = '';
        if (battleResult.rewardReport?.resources) {
            Object.entries(battleResult.rewardReport.resources).forEach(([resKey, amount]) => {
                lootHTML += `
                    <div style="display:flex; flex-direction:row; justify-content:space-between; font-size:12px; color:#fff; border-bottom:1px solid #222; padding: 4px 0;">
                        <span>💰 ${resKey.toUpperCase()}</span>
                        <span style="color:#ffcc00; font-weight:bold;">+${amount}</span>
                    </div>
                `;
            });
        }
        if (battleResult.rewardReport?.items) {
            Object.entries(battleResult.rewardReport.items).forEach(([itemId, amount]) => {
                lootHTML += `
                    <div style="display:flex; flex-direction:row; justify-content:space-between; font-size:12px; color:#fff; border-bottom:1px solid #222; padding: 4px 0;">
                        <span>🔮 ${itemId.toUpperCase()}</span>
                        <span style="color:#4caf50; font-weight:bold;">+${amount}</span>
                    </div>
                `;
            });
        }
        if (rewardsList) rewardsList.innerHTML = lootHTML || '<div style="color:#666; font-size:11px;">No items dropped.</div>';
    } else {
        if (popupTitle) { popupTitle.innerText = 'DEFEAT'; popupTitle.style.color = '#f44336'; }
        if (rewardsList) rewardsList.innerHTML = '<div style="color:#666; font-size:12px;">Your squad has been defeated.</div>';
        if (nextStageDirectBtn) nextStageDirectBtn.style.display = 'none';
    }

    // =========================================================================
    // 3. ОТРИСОВКА ВКЛАДКИ COMBAT METRICS (ПОЛОСКИ СТАТИСТИКИ УРОНА)
    // =========================================================================
    let statsHTML = '';
    playerHeroIds.forEach((instId, index) => {
        const hero = Game.player.heroes?.find(h => h.instance_id === instId);
        const proto = Game.config.catalog?.heroes?.[hero?.hero_id];
        if (proto) {
            const unitDmg = damageTracker[`p_${index}`] || 0;
            // Вычисляем процент заполнения полоски относительно лидера по урону
            const barWidthPercent = maxDamageDone > 0 ? (unitDmg / maxDamageDone) * 100 : 0;

            statsHTML += `
                <div style="display: flex; flex-direction: row; align-items: center; gap: 10px; width: 100%;">
                    <img src="${proto.icon}" style="width: 28px; height: 28px; border-radius: 4px;">
                    <div style="flex: 1; display: flex; flex-direction: column; gap: 3px;">
                        <div style="display: flex; flex-direction: row; justify-content: space-between; font-size: 10px; color: #fff;">
                            <span>${proto.title_loc?.en || hero.hero_id}</span>
                            <span style="font-weight: bold; color: #ef4444;">${unitDmg} DMG</span>
                        </div>
                        <!-- График полоски урона (ЗероКод стили из конфига) -->
                        <div style="width: 100%; height: 8px; background: #222; border-radius: 4px; overflow: hidden;">
                            <div style="width: ${barWidthPercent}%; height: 100%; background: #ef4444; border-radius: 4px; transition: width 0.5s;"></div>
                        </div>
                    </div>
                </div>
            `;
        }
    });
    if (statsList) statsList.innerHTML = statsHTML;

    // Включаем отображение попапа флексом
    victoryPopup.style.display = 'flex';

    // =========================================================================
    // 4. ОПЕРАЦИИ БИНДИНГА ПЕРЕКЛЮЧЕНИЯ ТАБОВ (ОКНО РЕЗУЛЬТАТОВ)
    // =========================================================================
    const btnRewards = container.querySelector('#tab-btn-rewards');
    const btnStats = container.querySelector('#tab-btn-stats');
    const viewRewards = container.querySelector('#result-view-rewards');
    const viewStats = container.querySelector('#result-view-stats');

    if (btnRewards && btnStats) {
        btnRewards.onclick = () => {
            btnRewards.style.background = '#ffcc00'; btnRewards.style.color = '#000';
            btnStats.style.background = '#222'; btnStats.style.color = '#fff';
            if (viewRewards) viewRewards.style.display = 'flex';
            if (viewStats) viewStats.style.display = 'none';
        };
        btnStats.onclick = () => {
            btnStats.style.background = '#ffcc00'; btnStats.style.color = '#000';
            btnRewards.style.background = '#222'; btnRewards.style.color = '#fff';
            if (viewRewards) viewRewards.style.display = 'none';
            if (viewStats) viewStats.style.display = 'flex';
        };
    }

    // Сохранение флага чекбокса автонекста
    if (autoNextCheckbox) {
        autoNextCheckbox.onchange = () => {
            localStorage.setItem('gacha_builder_auto_next', autoNextCheckbox.checked);
        };
    }

    // =========================================================================
    // 5. ОБРАБОТЧИКИ 3-Х КНОПОК НАВИГАЦИИ МАТЧА
    // =========================================================================

    // Кнопка 1: CONFIRM (Выход на карту главы)
    if (closeBtn) {
        closeBtn.onclick = () => {
            const oldScreen = container.querySelector('.screen-content');
            if (oldScreen) oldScreen.remove();
            import('./pveCampaign.js').then(mCampaign => {
                import('./pveTower.js').then(mTower => {
                    if (type === 'campaign') mCampaign.initPveCampaignScreen(container, updateUiCallback);
                    else if (type === 'tower') mTower.initPveTowerScreen(container, towerKey, updateUiCallback);
                    else if (type === 'boss') {
                        import('./pveBossList.js').then(mBoss => {
                            mBoss.initBossListScreen(container, updateUiCallback);
                        });
                    }
                    else if (updateUiCallback) updateUiCallback();
                });
            });
        };
    }

    // Функция обработки прямого шага к следующему этапу
    const triggerNextStageJump = () => {
        const oldScreen = container.querySelector('.screen-content');
        if (oldScreen) oldScreen.remove();
        const nextStageId = battleResult.next_stage;
        import('./preBattle.js').then(mPreBattle => {
            mPreBattle.initPreBattleScreen(container, nextStageId, type, towerKey, updateUiCallback);
        });
    };

    // Кнопка 2: NEXT STAGE (Прямой клик)
    if (nextStageDirectBtn && battleResult.win) {
        nextStageDirectBtn.onclick = () => {
            triggerNextStageJump();
        };
    }

    // ЛОГИКА АВТОНЕКСТА: Если чекбокс активен и игрок победил — запускаем триггер прыжка автоматически через 3 секунды!
    if (battleResult.win && autoNextCheckbox && autoNextCheckbox.checked) {
        console.log("[AUTO-NEXT] Match clear. Jumping to next node setup in 3 seconds...");
        setTimeout(() => {
            if (container.querySelector('#combat_victory_popup')?.style.display === 'flex') {
                triggerNextStageJump();
            }
        }, 3000);
    }

    if (type === 'boss') {
        // 1. Меняем заголовок окна результатов на Рейд-Рапорт
        if (popupTitle) {
            popupTitle.innerText = 'RAID REPORT';
            popupTitle.style.color = '#ff9800'; // Оранжевый цвет для рейдов
        }

        // 2. Вытаскиваем урон по боссу, переданный сервером в boss_stats
        const bStats = battleResult.boss_stats || {};

        // Перезаписываем левую панель MVP под вывод урона по боссу
        container.querySelector('#mvp-hero-name').innerText = "STAGE CLEARANCE";
        if (container.querySelector('#mvp-hero-score')) {
            container.querySelector('#mvp-hero-score').innerHTML = `
                <div style="font-size: 9px; color: #aaa; margin-top: 5px;">BOSS HP LEFT:</div>
                <div style="color: #ef4444; font-weight: bold; font-family: monospace;">${((bStats.current_hp / bStats.max_hp) * 100).toFixed(1)}%</div>
            `;
        }

        // Выводим суммарный нанесенный урон во вкладку статистики по умолчанию
        if (statsList) {
            statsList.innerHTML = `
                <div style="background: rgba(255,152,0,0.05); border: 1px solid #ff9800; border-radius: 6px; padding: 10px; text-align: center; color: #fff; margin-bottom: 10px;">
                    <div style="font-size: 10px; color: #ff9800; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px;">💥 Total Damage Dealt:</div>
                    <div style="font-size: 20px; font-weight: bold; font-family: monospace; color: #fff; margin-top: 2px;">${bStats.total_damage_dealt || 0}</div>
                </div>
            ` + statsList.innerHTML;
        }

        // 3. Скрываем кнопку NEXT STAGE и тумблер автонекста, так как босс-файт — это одиночный заход
        if (nextStageDirectBtn) nextStageDirectBtn.style.display = 'none';
        const autoNextZone = autoNextCheckbox?.closest('div');
        if (autoNextZone) autoNextZone.style.display = 'none';
    }

}




// if (!document.getElementById('combat-dynamic-vfx-styles')) {
//     const styleTag = document.createElement('style');
//     styleTag.id = 'combat-dynamic-vfx-styles';
//     styleTag.innerHTML = `
//         /* 1. Анимация покачивания героя в режиме ожидания боя (Idle) */
//
//     `;
//     document.head.appendChild(styleTag);
// }
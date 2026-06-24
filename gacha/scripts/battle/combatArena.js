import { t, locObj, getWindowContentStyle } from '../../shared.js';
import { Game } from '../../stateManager.js';

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

        <!-- Полноразмерный арт персонажа: уходит вверх, может выходить за рамки слота -->
        <img src="${proto.image || proto.icon}" style="width: 100%; height: auto; display: block; filter: drop-shadow(0 6px 10px rgba(0,0,0,0.6));">
        
        <!-- Уровень в самом низу у ног -->
        <span style="font-size: 8px; color: #fff; font-weight: bold; background: rgba(0,0,0,0.7); padding: 1px 3px; border-radius: 2px; position: absolute; bottom: 2px; z-index: 5;">Lv.${hero.level}</span>
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
        console.log(type, Game.pveContext);

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
                
                        <!-- Полноразмерный арт персонажа: уходит вверх, может выходить за рамки слота -->
                        <img src="${proto.image || proto.icon}" style="width: 100%; height: auto; display: block; filter: drop-shadow(0 6px 10px rgba(0,0,0,0.6));">
                        
                        <!-- Уровень в самом низу у ног -->
                        <span style="font-size: 8px; color: #fff; font-weight: bold; background: rgba(0,0,0,0.7); padding: 1px 3px; border-radius: 2px; position: absolute; bottom: 2px; z-index: 5;">Lv.${hero.level}</span>
                    </div>
                `;

                // Распределяем по рядам на основе оригинального индекса в массиве (0-1: Front, 2-3: Mid, 4-5: Back)
                if (index < teamPrototype.position[0]) playerRows.front += cardHTML;
                else if (index < teamPrototype.position[0] + teamPrototype.position[1]) playerRows.middle += cardHTML;
                else playerRows.back += cardHTML;
            }
        });

        // Маппим героев оппонента в стандартный формат для боевого рендерера
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
                    <!-- Босс масштабируется чуть крупнее обычных героев -->
                    <img src="${proto.image || proto.icon}" style="width: 110%; height: auto; display: block; transform: scaleX(-1); filter: drop-shadow(0 8px 16px rgba(0,0,0,0.7));">
                    <span style="font-size: 8px; color: #fff; font-weight: bold; background: #ef4444; padding: 1px 4px; border-radius: 2px; position: absolute; bottom: 2px; z-index: 5; letter-spacing: 0.5px;">BOSS</span>
                </div>
            `;
        }
    }

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

        <!-- Полноразмерный арт врага с разворотом к игроку -->
        <img src="${proto.image || proto.icon}" style="width: 100%; height: auto; display: block; transform: scaleX(-1); filter: drop-shadow(0 6px 10px rgba(0,0,0,0.6));">
        
        <span style="font-size: 8px; color: #fff; font-weight: bold; background: rgba(229,57,53,0.8); padding: 1px 3px; border-radius: 2px; position: absolute; bottom: 2px; z-index: 5;">Lv.${enemy.level || 1}</span>
    </div>
`;


            // Распределяем врагов по зеркальным рядам на основе их свойства position из конфига
            const pos = enemy.position !== undefined ? enemy.position : index;
            if (pos < teamPrototype.position[0]) enemyRows.front += cardHTML;
            else if (pos < teamPrototype.position[0] + teamPrototype.position[1]) enemyRows.middle += cardHTML;
            else enemyRows.back += cardHTML;
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
                            <img id="mvp-hero-img" src="" style="width: 90px; height: 90px; border-radius: 8px; border: 2px solid #ffcc00; box-shadow: 0 0 20px rgba(255,204,0,0.2);">
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
        <div class="screen-content ui-element" style="${getWindowContentStyle()} box-sizing: border-box; top: 5px; height: calc(100% - 10px); position: relative; background-image: url('${screenSettings.bg_image}'); background-size: cover; background-position: center; overflow: hidden;z-index: 21;">
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
                </div>
            </div>
        ${combatVictoryPopUp}
    `;
}

export function initCombatArenaScreen(updateUiCallback) {
    const container = Game.uiContainer;

    const oldScreen = container.querySelector('.screen-content');
    if (oldScreen) oldScreen.remove();

    const {type, stageId, towerKey} = Game.pveContext;
    const battleResult = Game.battleResult;

    // Вставь этот блок в самое начало функции initCombatArenaScreen
    if (!document.getElementById('combat-dynamic-vfx-styles')) {
        const styleTag = document.createElement('style');
        styleTag.id = 'combat-dynamic-vfx-styles';
        styleTag.innerHTML = `
        /* 1. Анимация покачивания героя в режиме ожидания боя (Idle) */
        @keyframes hero_combat_idle {
            0% { transform: translateY(0); }
            50% { transform: translateY(-4px); }
            100% { transform: translateY(0); }
        }
        .hero-combat-idle {
            animation: hero_combat_idle 2.5s infinite ease-in-out;
        }

        /* 2. Эффект получения урона: карточка краснеет и вздрагивает */
        @keyframes hit_flash_effect {
            0% { filter: brightness(1) drop-shadow(0 0 0px rgba(255,0,0,0)); transform: scale(1); }
            15% { filter: brightness(0.6) sepia(1) hue-rotate(-50deg) saturate(5); transform: scale(1.08); box-shadow: 0 0 15px #f44336; }
            100% { filter: brightness(1) sepia(0) hue-rotate(0deg) saturate(1); transform: scale(1); box-shadow: none; }
        }
        .hit-flash {
            animation: hit_flash_effect 0.35s ease-out forwards !important;
        }

        /* 3. Физическая микро-тряска картинок при получении удара (чтобы обходить флекс-сетку) */
        @keyframes combat_shake_player {
            0% { transform: scaleX(1) translateX(0); }
            20% { transform: scaleX(1) translateX(-6px); }
            100% { transform: scaleX(1) translateX(0); }
        }
        .hit-shake-p {
            animation: combat_shake_player 0.2s ease-in-out forwards !important;
        }

        @keyframes combat_shake_enemy {
            0% { transform: scaleX(-1) translateX(0); }
            20% { transform: scaleX(-1) translateX(-6px); }
            100% { transform: scaleX(-1) translateX(0); }
        }
        .hit-shake-e {
            animation: combat_shake_enemy 0.2s ease-in-out forwards !important;
        }

        /* 4. Всплывание и растворение цифр урона над головами */
        @keyframes float_up_and_fade {
            0% { transform: translateY(0) scale(0.8); opacity: 0; }
            20% { transform: translateY(-20px) scale(1.2); opacity: 1; }
            80% { transform: translateY(-40px) scale(1); opacity: 1; }
            100% { transform: translateY(-60px) scale(0.8); opacity: 0; }
        }
        .damage-float-text {
            animation: float_up_and_fade 0.9s forwards cubic-bezier(0.25, 1, 0.5, 1) !important;
            text-shadow: 2px 2px 0px #000, -2px -2px 0px #000, 2px -2px 0px #000, -2px 2px 0px #000;
        }
    `;
        document.head.appendChild(styleTag);
    }

    // КРИТИЧЕСКИЙ ФИКС: Стейт теперь объявлен строго внутри инициализатора экрана,
    // что гарантирует доступность переменной для всех вложенных функций
    let CombatState = {
        replay: battleResult.replay || [],
        currentRoundIndex: 0,
        currentActionIndex: 0,
        isPlaybackActive: false,
        playbackSpeed: 1000
    };

    // container.insertAdjacentHTML('beforeend', getCombatArenaHTML(battleResult));
    // Внутри initCombatArenaScreen(container, battleResult, stageId, type, towerKey, updateUiCallback)
    container.insertAdjacentHTML('beforeend', getCombatArenaHTML(battleResult, stageId, type, towerKey));


    const vfxLayer = container.querySelector('#combat-layer-vfx');
    const roundCounter = container.querySelector('#combat-round-counter');
    const speedBtn = container.querySelector('#btn_combat_speed_toggle');

    if (speedBtn) {
        speedBtn.onclick = () => {
            if (CombatState.playbackSpeed === 1000) {
                CombatState.playbackSpeed = 400;
                speedBtn.innerText = '▶▶ x2';
            } else if (CombatState.playbackSpeed === 400) {
                CombatState.playbackSpeed = 100;
                speedBtn.innerText = '▶▶▶ x5';
            } else {
                CombatState.playbackSpeed = 1000;
                speedBtn.innerText = '▶ x1';
            }
        };
    }

    async function playNextAction() {
        const currentRound = CombatState.replay[CombatState.currentRoundIndex];

        // КРИТИЧЕСКИЙ ФИКС 1: Если раунды в реплее кончились — ВСЕГДА принудительно вызываем финал боя
        if (!currentRound) {
            showBattleEndPopup(battleResult, container, type, towerKey, updateUiCallback);
            return;
        }

        if (roundCounter) roundCounter.innerText = `ROUND: ${currentRound.round}`;

        const actions = currentRound.actions || [];
        const action = actions[CombatState.currentActionIndex];

        // Если действия в ТЕКУЩЕМ раунде кончились, переключаемся на СЛЕДУЮЩИЙ раунд
        if (!action) {
            CombatState.currentRoundIndex++;
            CombatState.currentActionIndex = 0;
            setTimeout(playNextAction, CombatState.playbackSpeed);
            return;
        }

        const attackerNode = container.querySelector(`#combat_unit_${action.attacker_id}`);
        const targetNode = container.querySelector(`#combat_unit_${action.target_id}`);
        const hpBarNode = container.querySelector(`#hp_bar_${action.target_id}`);

        if (attackerNode && targetNode) {
            // КРИТИЧЕСКИЙ ФИКС АНИМАЦИИ: Находим картинки внутри контейнеров
            const attackerImg = attackerNode.querySelector('img');
            const targetImg = targetNode.querySelector('img');

            const isPlayer = action.attacker_id.startsWith('p');
            const jumpDistance = isPlayer ? 30 : -30; // Игроки прыгают вправо, враги влево

            // 1. Физический рывок картинки атакующего вперед
            if (attackerImg) {
                attackerImg.style.transition = 'transform 0.15s ease-out';
                attackerImg.style.transform = isPlayer ? `translateX(${jumpDistance}px) scale(1.1)` : `scaleX(-1) translateX(${jumpDistance}px) scale(1.1)`;
                attackerNode.style.zIndex = "10";
            }

            // Момент удара (таймаут соприкосновения)
            setTimeout(() => {
                // 1. Возвращаем картинку атакующего на место
                if (attackerImg) {
                    attackerImg.style.transform = isPlayer ? 'translateX(0) scale(1)' : 'scaleX(-1) translateX(0) scale(1)';
                    attackerNode.style.zIndex = "3";
                }

                // 2. ЗАПУСК ТВОИХ ОРИГИНАЛЬНЫХ АНИМАЦИЙ: Красная вспышка на весь контейнер + Тряска картинки
                if (targetImg) {
                    targetNode.classList.add('hit-flash');

                    // Вешаем класс физической тряски в зависимости от стороны (игрок или моб)
                    targetImg.classList.add(isPlayer ? 'hit-shake-e' : 'hit-shake-p');

                    // Чистим классы через 350мс после завершения анимации, чтобы их можно было запустить на следующем шаге
                    setTimeout(() => {
                        targetNode.classList.remove('hit-flash');
                        if (targetImg) {
                            targetImg.classList.remove('hit-shake-e', 'hit-shake-p');
                        }
                    }, 350);
                }

                // Дальше идет твой рабочий код вылета цифр урона и сдвига HP...
                const targetRect = targetNode.getBoundingClientRect();
                //
                // const targetRect = targetNode.getBoundingClientRect();
                const containerRect = container.getBoundingClientRect();

                const posX = targetRect.left - containerRect.left + (targetRect.width / 2) - 20;
// ИСПРАВЛЕНО: Сдвигаем цифры урона на 15 пикселей НАВЕРХ над полоской здоровья (которая стоит на top:0)
                const posY = targetRect.top - containerRect.top - 15;
                //
                // const posX = targetRect.left - containerRect.left + (targetRect.width / 2) - 20;
                // const posY = targetRect.top - containerRect.top + 10;

                const damageTextNode = document.createElement('div');
                damageTextNode.className = 'damage-float-text';
                damageTextNode.style.position = 'absolute';
                damageTextNode.style.left = `${posX}px`;
                damageTextNode.style.top = `${posY}px`;
                damageTextNode.style.fontFamily = 'Arial Black, sans-serif';
                damageTextNode.style.fontSize = action.is_crit ? '28px' : '20px';
                damageTextNode.style.color = action.is_crit ? '#ffeb3b' : '#ffffff';
                damageTextNode.style.fontWeight = 'bold';
                damageTextNode.style.zIndex = "100";
                damageTextNode.innerText = `-${action.damage}`;

                if (vfxLayer) {
                    vfxLayer.appendChild(damageTextNode);
                    setTimeout(() => damageTextNode.remove(), 1200);
                }

                // Расчет полоски здоровья
                if (hpBarNode) {
                    if (!CombatState.maxHpCache) CombatState.maxHpCache = {};
                    const unitId = action.target_id;

                    if (CombatState.maxHpCache[unitId] === undefined) {
                        const computedMax = Number(action.target_left_hp) + Number(action.damage);
                        CombatState.maxHpCache[unitId] = computedMax > 0 ? computedMax : 1000;
                    }

                    const maxHp = CombatState.maxHpCache[unitId];
                    const hpPercent = Math.max(0, Math.min(100, (Number(action.target_left_hp) / maxHp) * 100));
                    hpBarNode.style.width = `${hpPercent}%`;

                    if (action.target_left_hp === 0) {
                        targetNode.style.opacity = '0.2';
                        targetNode.style.filter = 'grayscale(100%)';
                    }
                }

                // КРИТИЧЕСКИЙ ФИКС 2: Мы НЕ прерываем цикл, даже если кто-то умер!
                // Мы просто инкрементируем индекс и берем СЛЕДУЮЩЕЕ действие из реплея бэкенда,
                // чтобы отрисовать атаку p_1 по e_1.
                CombatState.currentActionIndex++;
                setTimeout(playNextAction, CombatState.playbackSpeed);

            }, 200);
        } else {
            CombatState.currentActionIndex++;
            playNextAction();
        }
    }


    // Автоматический запуск проигрывания реплея при инициализации экрана
    CombatState.isPlaybackActive = true;
    setTimeout(playNextAction, 500);
}

function showBattleEndPopup(battleResult, container, type, towerKey, updateUiCallback) {

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
        if (battleResult.rewards?.resources) {
            Object.entries(battleResult.rewards.resources).forEach(([resKey, amount]) => {
                lootHTML += `
                    <div style="display:flex; flex-direction:row; justify-content:space-between; font-size:12px; color:#fff; border-bottom:1px solid #222; padding: 4px 0;">
                        <span>💰 ${resKey.toUpperCase()}</span>
                        <span style="color:#ffcc00; font-weight:bold;">+${amount}</span>
                    </div>
                `;
            });
            window.updateResources(battleResult.resources);
        }
        if (battleResult.rewards?.items) {
            Object.entries(battleResult.rewards.items).forEach(([itemId, amount]) => {
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

    // Внутри pveCombatArena.js -> showBattleEndPopup:

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






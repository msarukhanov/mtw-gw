import { t, API_URL, headers } from '../../shared.js';
import { Game } from "../../stateManager.js";
import { initCombatArenaScreen } from '../battle/combatArena.js';
// 🔥 ИМПОРТИРУЕМ НАШ ИЗОЛИРОВАННЫЙ КУПОН
import { getArenaSlipHTML, initArenaSlip, addOutcomeToSlip, validateSlipMatches } from './arenaBettingSlip.js';

let fullLine = [];
let filteredLine = [];
let sidebarMode = 'LIVE';
let activeLiveMatchId = null;

export function getArenaBettingHTML() {
    return `
        <div class="screen-content ui-element" style="box-sizing: border-box; top: 5px; height: calc(100% - 10px); width: 100%; display: flex; flex-direction: column; padding: 20px; background-color: #120b1e; color: #fff; font-family: sans-serif;">
            
            <!-- Header -->
            <div style="color: #ffcc00; font-size: 18px; font-weight: bold; border-bottom: 1px solid #2d1b4e; padding-bottom: 10px; margin-bottom: 15px; text-transform: uppercase; letter-spacing: 1px; display: flex; justify-content: space-between; align-items: center; width: 100%;">
                <span>🏆 ${t('gacha_grand_cup', 'Gacha Grand Cup')}</span>
                <span style="font-size: 13px; color: #aaa; font-weight: normal;">${t('bc_balance', 'Balance')}: <b style="color: #00f5d4;" id="arena-bc-balance">${Game.player.resources?.blood_coin || 0} BC</b></span>
            </div>

            <!-- Main Layout -->
            <div style="display: flex; flex-direction: row; gap: 15px; flex: 1; height: calc(100% - 50px); min-height: 0;">
                
                <!-- Sidebar -->
                <div style="width: 160px; display: flex; flex-direction: column; gap: 10px; border-right: 1px solid #2d1b4e; padding-right: 10px;">
                    <div style="display: flex; gap: 5px; width: 100%;">
                        <button id="arenaToggleLiveBtn" style="flex:1; padding: 8px; border-radius: 4px; cursor: pointer; font-size: 11px; font-weight: bold; transition: all 0.2s;"> Live </button>
                        <button id="arenaTogglePrematchBtn" style="flex:1; padding: 8px; border-radius: 4px; cursor: pointer; font-size: 11px; font-weight: bold; transition: all 0.2s;"> Prematch </button>
                    </div>
                    <div id="arenaSidebarMenuList" style="display: flex; flex-direction: column; gap: 6px; overflow-y: auto; flex: 1;"></div>
                    <button id="btnBackToArenaMenu" style="width: 100%; background: #2d1b4e; color: #fff; border: none; padding: 8px; border-radius: 4px; font-size: 11px; cursor: pointer;">⬅ ${t('back_to_arena', 'Back')}</button>
                </div>

                <!-- Central Content -->
                <div id="arenaEventsList" style="flex: 1; overflow-y: auto; flex-direction: column; gap: 12px; padding-right: 5px;"></div>

                <!-- ВСТАВЛЯЕМ HTML ИЗОЛИРОВАННОГО КУПОНА ИЗ КОМПОНЕНТА -->
                ${getArenaSlipHTML()}

            </div>
        </div>
    `;
}

export async function initArenaBettingScreen(container, updateUiCallback) {
    activeLiveMatchId = null;

    container.innerHTML = '';
    container.insertAdjacentHTML('beforeend', getArenaBettingHTML());

    const liveBtn = container.querySelector('#arenaToggleLiveBtn');
    const prematchBtn = container.querySelector('#arenaTogglePrematchBtn');
    const listContainer = container.querySelector('#arenaEventsList');
    const menuContainer = container.querySelector('#arenaSidebarMenuList');

    liveBtn.onclick = async () => {
        sidebarMode = 'LIVE';
        activeLiveMatchId = null;
        updateModeButtons();
        await loadLine();
    };

    prematchBtn.onclick = async () => {
        sidebarMode = 'PREMATCH';
        activeLiveMatchId = null;
        updateModeButtons();
        await loadLine();
    };
    initArenaSlip(container);

    function updateModeButtons() {
        if (sidebarMode === 'LIVE') {
            liveBtn.style.background = 'rgba(233,69,96,0.1)'; liveBtn.style.color = '#e94560'; liveBtn.style.border = '1px solid #e94560';
            prematchBtn.style.background = '#1c1830'; prematchBtn.style.color = '#aaa'; prematchBtn.style.border = '1px solid #2d1b4e';
        } else {
            prematchBtn.style.background = 'rgba(233,69,96,0.1)'; prematchBtn.style.color = '#e94560'; prematchBtn.style.border = '1px solid #e94560';
            liveBtn.style.background = '#1c1830'; liveBtn.style.color = '#aaa'; liveBtn.style.border = '1px solid #2d1b4e';
        }
    }

    function renderSidebar() {
        const uniqueLeagues = [...new Set(fullLine.map(m => m.league || 'Gacha Cup'))];
        menuContainer.innerHTML = uniqueLeagues.map(l => `
            <div style="padding: 6px 10px; background: rgba(255,255,255,0.02); border: 1px solid #2d1b4e; border-radius: 4px; font-size: 11px; color: #aaa; text-align: center; font-weight: bold;">${l}</div>
        `).join('');
    }

    window.io.emit('join_arena_room', {
        gameId: String(Game.gameId),
        serverId: String(Game.serverId)
    });

    window.io.on('arena_tick', (data) => {
        if (sidebarMode === 'LIVE' && activeLiveMatchId === data.match_id) {
            const currentMatch = fullLine.find(m => m.match_id === data.match_id);
            if (currentMatch) {
                currentMatch.minute = data.minute;
                currentMatch.score_home = data.score_home;
                currentMatch.score_away = data.score_away;
                currentMatch.status = data.status;
            }
            // Мягко обновляем маркеты под окном боя, не ломая запущенный Canvas
            const subMarkets = listContainer.querySelector('#liveMarketsSubContainer');
            if (subMarkets && currentMatch) {
                subMarkets.innerHTML = generateOddsGridHTML2(currentMatch);
                bindOddsGridButtons([currentMatch]);
            }
        }
    });

    // Мягкое обновление линии через веб-сокеты
    window.io.on('arena_line_update', (newLine) => {
        if (sidebarMode !== 'LIVE' || !newLine || !Array.isArray(newLine)) return;
        console.log("[WS UPDATE]", newLine);
        fullLine = newLine;
        filteredLine = fullLine.filter(m => {
            if (!m || !m.status) return false;
            return m.status === 'LIVE';
        });
        // Сверяем матчи внутри изолированного компонента купона
        validateSlipMatches(container, fullLine);
        renderScreen();
    });

    async function loadLine() {
        try {
            const res = await fetch(`${API_URL}/battle/pvp/arena-line?serverId=${Game.serverId}&gameId=${Game.gameId}`, { method: 'GET', headers });
            const data = await res.json();
            fullLine = Array.isArray(data) ? data : [];
            filteredLine = fullLine.filter(m => {
                if (!m || !m.status) return false;
                return m.status === sidebarMode;
            });
            renderScreen();
        } catch (err) {
            console.error("Line download error:", err);
        }
    }



    container.querySelector('#btnBackToArenaMenu').onclick = () => {
        container.innerHTML = '';
        const { initPvpArenaScreen } = require('./pvpArena.js');
        initPvpArenaScreen(container, updateUiCallback);
    };

    function renderScreen() {
        renderSidebar();

        // Сценарий 1: Открыт плеер трансляции боя
        // --- СЦЕНАРИЙ 1: Открыт плеер трансляции боя ПРЯМО В ОКНЕ ---
        // --- СЦЕНАРИЙ 1: Открыт плеер трансляции боя АВТОМАТИЧЕСКИ В ОКНЕ ---
        if (sidebarMode === 'LIVE' && activeLiveMatchId) {
            const currentMatch = fullLine.find(m => m.match_id === activeLiveMatchId);
            if (!currentMatch) { activeLiveMatchId = null; renderScreen(); return; }

            console.log(currentMatch);

            // Если общая рамка и контейнер для 2D-боевки еще не созданы в центре
            const hasVisualContainer = listContainer.querySelector('#gacha-embedded-visual-box');
            if (!hasVisualContainer) {
                // Рендерим чистый каркас с окном для боя
                listContainer.innerHTML = `
                    <button id="btnBackToLine" style="align-self: flex-start; background: #1c1830; color: #ffcc00; border: 1px solid #2d1b4e; padding: 4px 10px; border-radius: 4px; cursor: pointer; font-size: 11px; margin-bottom: 10px;">⬅ ${t('back_to_list', 'Back to list')}</button>
                    
                    <!-- Шапка боя -->
                    <div style="background: #1c1830; border: 2px solid #2d1b4e; border-bottom: none; border-top-left-radius: 8px; border-top-right-radius: 8px; padding: 10px 15px; display: flex; justify-content: space-between; font-weight: bold; font-family: monospace; box-sizing: border-box; width: 100%;">
                        <span style="color: #00f5d4;">${currentMatch.teams?.home || 'Team A'}</span>
                        <span style="color: #ffcc00; font-size: 14px;" id="live-combat-round-counter">⚔️ ${t('combat_round', 'Round')}: ${currentMatch.minute || 1}</span>
                        <span style="color: #e94560;">${currentMatch.teams?.away || 'Team B'}</span>
                    </div>

                    <!-- Внешний wrapper-контейнер (подстраивает высоту под масштаб) -->
                    <div id="gacha-visual-parent-wrapper" style="width: 100%; height: 50dvh; background: #000; border: 2px solid #2d1b4e; border-bottom-left-radius: 8px; border-bottom-right-radius: 8px; overflow: hidden; position: relative; box-sizing: border-box;">
                        
                        <!-- 🔥 СУПЕР-ФИКС: Контейнер для боёвки. Никаких 800х450! Он берет размеры прямо из настроек UI твоего экрана! -->
                        <div id="gacha-embedded-visual-box" style="width: 100%; height: 50dvh; position: absolute; top: 0; left: 0; transform-origin: top left;">
                            <!-- Сюда initCombatArenaScreen вставит Canvas, и камера встанет идеально -->
                        </div>

                    </div>

                    <!-- Контейнер для расширенных Гача-маркетов под боем -->
                    <div id="liveMarketsSubContainer" style="width: 100%; margin-top: 15px; display: flex; flex-direction: column; gap: 10px; box-sizing: border-box;"></div>
                `;

                listContainer.querySelector('#btnBackToLine').onclick = () => { activeLiveMatchId = null; renderScreen(); };

                // --- ЛОГИКА АВТОМАТИЧЕСКОГО МАСШТАБИРОВАНИЯ ОКНА БОЯ (АВТОСКЕЙЛ) ---
                const wrapper = listContainer.querySelector('#gacha-visual-parent-wrapper');
                const box = listContainer.querySelector('#gacha-embedded-visual-box');

                // 1. Десериализуем полный JSON-объект результатов боя из базы
                const fullReplayData = typeof currentMatch.battle_replay === 'string'
                    ? JSON.parse(currentMatch.battle_replay)
                    : currentMatch.battle_replay;

                const roundsArray = Array.isArray(fullReplayData.replay) ? fullReplayData.replay : [];

                // 2. Формируем чистый объект ответа сервера (Скармливаем реплей ЦЕЛИКОМ, чтобы он не сдыхал после 1 раунда!)
                const fakeServerResult = {
                    success: true,
                    win: fullReplayData.win,
                    total_rounds: roundsArray.length,
                    replay: roundsArray, // Передаем полный массив раундов
                    rewards: { resources: {} },
                    resources: Game.player.resources,
                    next_stage: null,
                };

                // Настраиваем контекст игры
                Game.pveContext = { previousState: 'ARENA_BETTING', stageId: currentMatch.match_id, type: 'arena_live', teams: currentMatch.teams };
                Game.gameState = 'BATTLE_VISUAL';

                // 3. Выцепляем созданный бокс прямо внутри условия
                const embeddedBox = listContainer.querySelector('#gacha-embedded-visual-box');

                // 4. 🔥 МГНОВЕННЫЙ АВТОЗАПУСК БОЯ: Передаем embeddedBox в твой визуализатор!
                initCombatArenaScreen(
                    embeddedBox,
                    { type: 'arena_live', stageId: currentMatch.match_id, towerKey: null },
                    fakeServerResult,
                    updateUiCallback
                );
            }

            // 5. Постоянно обновляем маркеты под окном боя при тиках сокетов
            const subMarkets = listContainer.querySelector('#liveMarketsSubContainer');
            if (subMarkets) {
                subMarkets.innerHTML = generateOddsGridHTML2(currentMatch);
                bindOddsGridButtons([currentMatch]);
            }
            return;
        }


        // Сценарий 2: Список карточек матчей
        if (filteredLine.length === 0) {
            const noMatchesText = sidebarMode === 'LIVE' ? "No live matches right now" : "No upcoming matches available";
            listContainer.innerHTML = `
                <div style="color: #666; text-align: center; font-size: 12px; margin-top: 40px; border: 1px dashed #2d1b4e; padding: 20px; border-radius: 8px; background: rgba(255,255,255,0.01); width: 100%; box-sizing: border-box;">
                    ${noMatchesText}
                </div>
            `;
            return;
        }

        listContainer.innerHTML = filteredLine.map(m => `
            <div style="background: rgba(255,255,255,0.02); border: 1px solid #2d1b4e; border-radius: 8px; padding: 10px; display: flex; flex-direction: column; gap: 8px; box-sizing: border-box; width: 100%;">
                <div style="display: flex; justify-content: space-between; font-size: 11px; color: #ffcc00; width: 100%;">
                    <span>🏆 ${m.league || 'Gacha Cup'}</span>
                    ${m.status === 'LIVE' ? `<span style="color: #00f5d4; font-weight: bold; cursor: pointer; text-decoration: underline;" class="lnk-open-live-match" data-match-id="${m.match_id}">Watch Live 🔍</span>` : ''}
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center; font-weight: bold; font-size: 12px; width: 100%;">
                    <span>${m.teams?.home || 'Unknown'} vs ${m.teams?.away || 'Unknown'}</span>
                    <span style="font-family: monospace; color: #e94560;">[ ${m.score_home || 0} : ${m.score_away || 0} ]</span>
                </div>
                <div id="odds-grid-${m.match_id}" style="width: 100%;">
                    ${generateOddsGridHTML(m)}
                </div>
            </div>
        `).join('');

        bindOddsGridButtons();
    }

    function generateOddsGridHTML(m) {
        return `
            <div style="display: flex; gap: 5px; margin-top: 5px; width: 100%;">
                <button class="odd-btn" data-match-id="${m.match_id}" data-outcome="p1" style="flex:1; background: #1c1830; border:1px solid #2d1b4e; color:#fff; padding:6px; border-radius:4px; font-size:11px; cursor:pointer; font-weight: bold; display: flex; justify-content: space-between; padding: 6px 12px;">
                    <span>W1</span> <b style="color:#ffcc00;">${m.markets?.winner?.odds?.p1 || '1.01'}</b>
                </button>
                <button class="odd-btn" data-match-id="${m.match_id}" data-outcome="x" style="flex:1; background: #1c1830; border:1px solid #2d1b4e; color:#fff; padding:6px; border-radius:4px; font-size:11px; cursor:pointer; font-weight: bold; display: flex; justify-content: space-between; padding: 6px 12px;">
                    <span>X</span> <b style="color:#ffcc00;">${m.markets?.winner?.odds?.x || '—'}</b>
                </button>
                <button class="odd-btn" data-match-id="${m.match_id}" data-outcome="p2" style="flex:1; background: #1c1830; border:1px solid #2d1b4e; color:#fff; padding:6px; border-radius:4px; font-size:11px; cursor:pointer; font-weight: bold; display: flex; justify-content: space-between; padding: 6px 12px;">
                    <span>W2</span> <b style="color:#ffcc00;">${m.markets?.winner?.odds?.p2 || '1.01'}</b>
                </button>
            </div>
        `;
    }

    function generateOddsGridHTML2(m) {
        // Безопасное чтение коэффициентов из JSONB структуры
        const p1Odd = m.markets?.winner?.odds?.p1 || '1.01';
        const p2Odd = m.markets?.winner?.odds?.p2 || '1.01';

        const totalTarget = m.markets?.total?.target || '14.5';
        const overOdd = m.markets?.total?.odds?.over || '1.85';
        const underOdd = m.markets?.total?.odds?.under || '1.85';

        const fbHomeOdd = m.markets?.btts?.odds?.yes || '1.90';
        const fbAwayOdd = m.markets?.btts?.odds?.no || '1.90';

        return `
            <!-- РЫНОК 1: Исход боя -->
            <div style="background: rgba(255,255,255,0.01); border: 1px solid #1c1830; border-radius: 6px; padding: 6px;">
                <div style="font-size: 11px; color: #aaa; margin-bottom: 4px; font-weight: bold; text-transform: uppercase;">⚔️ ${m.markets?.winner?.label || 'Победа в матче'}</div>
                <div style="display: flex; gap: 5px;">
                    <button class="odd-btn" data-match-id="${m.match_id}" data-market="winner" data-outcome="p1" style="flex:1; background: #1c1830; border:1px solid #2d1b4e; color:#fff; padding:6px; border-radius:4px; font-size:11px; cursor:pointer; font-weight: bold; display: flex; justify-content: space-between; padding: 6px 12px;">
                        <span>W1</span> <b style="color:#ffcc00;">${p1Odd}</b>
                    </button>
                    <button class="odd-btn" data-match-id="${m.match_id}" data-market="winner" data-outcome="p2" style="flex:1; background: #1c1830; border:1px solid #2d1b4e; color:#fff; padding:6px; border-radius:4px; font-size:11px; cursor:pointer; font-weight: bold; display: flex; justify-content: space-between; padding: 6px 12px;">
                        <span>W2</span> <b style="color:#ffcc00;">${p2Odd}</b>
                    </button>
                </div>
            </div>

            <!-- РЫНОК 2: Тотал раундов боя -->
            <div style="background: rgba(255,255,255,0.01); border: 1px solid #1c1830; border-radius: 6px; padding: 6px;">
                <div style="font-size: 11px; color: #aaa; margin-bottom: 4px; font-weight: bold; text-transform: uppercase;">⏱️ ${m.markets?.total?.label || 'Тотал раундов'}</div>
                <div style="display: flex; gap: 5px;">
                    <button class="odd-btn" data-match-id="${m.match_id}" data-market="total" data-outcome="over" style="flex:1; background: #1c1830; border:1px solid #2d1b4e; color:#fff; padding:6px; border-radius:4px; font-size:11px; cursor:pointer; font-weight: bold; display: flex; justify-content: space-between; padding: 6px 12px;">
                        <span>${t('odds_over', 'Over')} ${totalTarget}</span> <b style="color:#ffcc00;">${overOdd}</b>
                    </button>
                    <button class="odd-btn" data-match-id="${m.match_id}" data-market="total" data-outcome="under" style="flex:1; background: #1c1830; border:1px solid #2d1b4e; color:#fff; padding:6px; border-radius:4px; font-size:11px; cursor:pointer; font-weight: bold; display: flex; justify-content: space-between; padding: 6px 12px;">
                        <span>${t('odds_under', 'Under')} ${totalTarget}</span> <b style="color:#ffcc00;">${underOdd}</b>
                    </button>
                </div>
            </div>

            <!-- РЫНОК 3: Первая кровь (First Blood) -->
            <div style="background: rgba(255,255,255,0.01); border: 1px solid #1c1830; border-radius: 6px; padding: 6px;">
                <div style="font-size: 11px; color: #aaa; margin-bottom: 4px; font-weight: bold; text-transform: uppercase;">🩸 ${m.markets?.btts?.label || 'Первая Кровь'}</div>
                <div style="display: flex; gap: 5px;">
                    <button class="odd-btn" data-match-id="${m.match_id}" data-market="btts" data-outcome="yes" style="flex:1; background: #1c1830; border:1px solid #2d1b4e; color:#fff; padding:6px; border-radius:4px; font-size:11px; cursor:pointer; font-weight: bold; display: flex; justify-content: space-between; padding: 6px 12px;">
                        <span>FB W1</span> <b style="color:#ffcc00;">${fbHomeOdd}</b>
                    </button>
                    <button class="odd-btn" data-match-id="${m.match_id}" data-market="btts" data-outcome="no" style="flex:1; background: #1c1830; border:1px solid #2d1b4e; color:#fff; padding:6px; border-radius:4px; font-size:11px; cursor:pointer; font-weight: bold; display: flex; justify-content: space-between; padding: 6px 12px;">
                        <span>FB W2</span> <b style="color:#ffcc00;">${fbAwayOdd}</b>
                    </button>
                </div>
            </div>
        `;
    }


    function bindOddsGridButtons() {
        container.querySelectorAll('.lnk-open-live-match').forEach(lnk => {
            lnk.onclick = () => {
                activeLiveMatchId = lnk.dataset.matchId;
                listContainer.innerHTML = '';
                renderScreen();
            };
        });

        container.querySelectorAll('.odd-btn').forEach(btn => {
            btn.onclick = () => {
                const matchId = btn.dataset.matchId;
                const outcome = btn.dataset.outcome;
                const match = filteredLine.find(m => m.match_id === matchId);
                if (!match) return;

                const odds = match.markets?.winner?.odds?.[outcome];
                if (!odds || odds === '—') return;

                // Передаем исход в изолированный купон
                addOutcomeToSlip(container, match, 'winner', outcome, odds);
            };
        });
    }

    // Запуск стартовых методов при монтировании экрана
    updateModeButtons();
    await loadLine();
}


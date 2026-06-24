import { t, locObj, getWindowContentStyle, API_URL, headers } from '../../shared.js';
import {Game} from "../../stateManager.js";
import { initPreBattleScreen } from './preBattle.js';
import {sendSocket} from "../../socket.js";

export function getPvpArenaHTML() {
    const orientation = Game.config.orientation || 'landscape';
    const screenSettings = Game.config?.ui?.[orientation]?.find(w => w.id === 'screen_arena') || {};

    return `
        <div class="screen-content ui-element" style="${getWindowContentStyle()} box-sizing: border-box; top: 5px; height: calc(100% - 10px); background-image: url('${screenSettings.bg_image || ''}'); background-size: cover; background-position: center; display: flex; flex-direction: column; padding: 20px; background-color: #120b1e;">
            
            <!-- Заголовок Арены -->
            <div style="color: #ffcc00; font-size: 18px; font-weight: bold; border-bottom: 1px solid #333; padding-bottom: 10px; margin-bottom: 15px; text-transform: uppercase; letter-spacing: 1px; display: flex; justify-content: space-between; align-items: center; width: 100%;">
                <span>⚔️ Arena Challengers</span>
                <span style="font-size: 12px; color: #aaa; font-weight: normal;">Your Rating: <b style="color: #ffcc00;">${Game.player.resources?.arena_rating || 1000}</b></span>
            </div>

            <!-- Контейнер Списка Оппонентов на весь экран -->
            <div id="arena-opponents-list-container" style="flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; max-width: 600px; margin: 0 auto; width: 100%;">
                <div style="color: #666; font-size: 12px; text-align: center; padding: 4px;">Loading server players...</div>
            </div>

        </div>
    `;
}

export async function initPvpArenaScreen(container, updateUiCallback) {
    const isReload = !!container.querySelector('.screen-content');
    if(!isReload) {
        sendSocket('arena', 'getOpponents', {});
    }

    const oldScreen = container.querySelector('.screen-content');
    if (oldScreen) {
        oldScreen.remove();
    }
    // 1. Отрендерить чистую разметку Арены
    container.insertAdjacentHTML('beforeend', getPvpArenaHTML());

    const opponentsContainer = container.querySelector('#arena-opponents-list-container');

    // Читаем соперников строго из реактивного стейта Game, обновленного сокет-роутером
    if (Game.pvp_opponents && Game.pvp_opponents.length > 0) {
        opponentsContainer.innerHTML = Game.pvp_opponents.map(opp => `
            <div style="display: flex; flex-direction: row; justify-content: space-between; align-items: center; background: rgba(255,255,255,0.03); border: 1px solid #2d1b4e; border-radius: 8px; padding: 12px 20px; box-sizing: border-box; width: 100%; pointer-events: auto;">
                <div style="display: flex; flex-direction: column; gap: 3px;">
                    <b style="color: #fff; font-size: 13px;">${opp.nickname || 'Unknown'}</b>
                    <span style="color: #aaa; font-size: 9px; font-weight: bold; letter-spacing: 0.5px;">ACCOUNT LEVEL ${opp.level || 1}</span>
                </div>
                <div style="display: flex; flex-direction: row; align-items: center; gap: 20px;">
                    <span style="color: #ffcc00; font-size: 12px; font-weight: bold; font-family: monospace;">⚔️ CP ${opp.combat_power || 0}</span>
                    <!-- Используем UUID игрока (user_id) для точечной сокет-атаки -->
                    <button class="btn-challenge-opponent" 
                            data-opponent-id="${opp.user_id}" 
                            data-opponent-name="${opp.nickname || 'Player'}"
                            style="background: linear-gradient(135deg, #e53935 0%, #b71c1c 100%); color: #fff; border: none; padding: 6px 16px; border-radius: 4px; font-size: 11px; cursor: pointer; pointer-events: auto; font-weight: bold; text-transform: uppercase; box-shadow: 0 2px 8px rgba(229,57,53,0.3); transition: transform 0.1s;">
                        Attack
                    </button>
                </div>
            </div>
        `).join('');

        // 3. БИНДИМ КЛИК ПО КНОПКЕ АТАКЫ БЕЗ ОШИБОК ОБЛАСТИ ВИДИМОСТИ
        container.querySelectorAll('.btn-challenge-opponent').forEach(btn => {
            btn.onclick = () => {
                const opponentId = btn.dataset.opponentId;
                const opponentName = btn.dataset.opponentName;

                // ИСПРАВЛЕНО: Ищем врага строго внутри глобального стейта Game.pvp_opponents
                const selectedOpponent = Game.pvp_opponents.find(o => String(o.user_id) === String(opponentId));

                const currentScreen = container.querySelector('.screen-content');
                if (currentScreen) currentScreen.remove();

                // Записываем контекст Арены для тактического экрана 3х3 (И для кнопки Назад)
                Game.pveContext = {
                    previousState: 'ARENA',
                    stageId: opponentId, // Передаем UUID соперника
                    type: 'arena',
                    towerKey: null,
                    opponentName: opponentName,
                    enemyHeroes: selectedOpponent?.heroes || [] // Передаем его ростер для отрисовки на поле подготовки
            };

                Game.gameState = 'PRE_BATTLE';

                // Открываем тактическое поле 3х3
                const { initPreBattleScreen } = require('./preBattle.js');
                initPreBattleScreen(container, opponentId, 'arena', null, updateUiCallback);
            };
        });

    } else {
        opponentsContainer.innerHTML = `<div style="color:#777; font-size:12px; text-align:center; padding:30px;">No other players found on this server yet.</div>`;
    }
}

import { t, locObj, getWindowContentStyle } from '../../shared.js';
import { Game } from "../../stateManager.js";
import { initPreBattleScreen } from './preBattle.js';
import {sendSocket} from "../../socket.js";

/**
 * ГЕНЕРАЦИЯ БАЗОВОГО КАРКАСА ЭКРАНА БОССОВ
 */
export function getBossListHTML() {
    const orientation = Game.config.orientation || 'landscape';
    const screenSettings = Game.config?.ui?.[orientation]?.find(w => w.id === 'screen_pve_boss') || {};

    return `
        <div class="screen-content ui-element" style="${getWindowContentStyle()} box-sizing: border-box; top: 45px; height: calc(100% - 45px); padding: 20px; background-color: #0b0714; display: flex; flex-direction: column;">
            
            <!-- Шапка экрана -->
            <div style="color: #ffcc00; font-size: 16px; font-weight: bold; border-bottom: 1px solid #333; padding-bottom: 10px; margin-bottom: 15px; text-transform: uppercase; letter-spacing: 1px; display: flex; flex-direction: row; align-items: center; gap: 10px;">
                <span>🌋 Epic Raid Bosses</span>
            </div>

            <!-- Реактивная сетка Карточек Боссов -->
            <div id="boss-cards-container" style="flex: 1; overflow-y: auto; display: flex; flex-direction: row; flex-wrap: wrap; gap: 15px; justify-content: center; align-items: flex-start; pointer-events: auto;">
                <!-- Карточки будут сгенерированы динамически из RAM стейта Game -->
            </div>

        </div>
    `;
}

/**
 * ГЕНЕРАЦИЯ ДИНАМИЧЕСКОГО СПИСКА КАРТОЧЕК БОССОВ НА ОСНОВЕ СТЭЙТА ИЗ REDIS
 */
function generateBossCardsHTML() {
    const bossesConfig = Game.config.pve_bosses || {};
    const bossStatuses = Game.boss_list || {}; // Свежие статусы из сокет-события 'boss'

    if (Object.keys(bossesConfig).length === 0) {
        return `<div style="color:#555; font-size:12px; text-align:center; padding:20px;">No bosses configured in ZeroCode master build.</div>`;
    }

    let listHTML = '';

    Object.entries(bossesConfig).forEach(([bossKey, boss]) => {
        const proto = Game.config.catalog?.heroes?.[boss.hero_id];
        const bossIcon = proto?.image || proto?.icon || './gacha/assets/images/heroes/heroAvatars/eleniel.webp';
        const bossTitle = locObj(boss.title_loc) || boss.title_loc?.en || bossKey;

        // ИСПРАВЛЕНО: Полностью in-memory вычисление текущего HP без fetch-задержек
        let currentHp = Number(boss.max_hp);
        if (boss.boss_type === 'local') {
            currentHp = Game.player.local_boss_hp?.[bossKey] !== undefined ? Number(Game.player.local_boss_hp[bossKey]) : Number(boss.max_hp);
        } else {
            currentHp = bossStatuses[bossKey] !== undefined ? Number(bossStatuses[bossKey]) : Number(boss.max_hp);
        }

        const isDead = currentHp <= 0;
        const hpPercent = Math.max(0, Math.min(100, (currentHp / Number(boss.max_hp)) * 100));

        let typeBadgeColor = '#3b82f6';
        if (boss.boss_type === 'server') typeBadgeColor = '#ef4444';
        if (boss.boss_type === 'local') typeBadgeColor = '#10b981';

        listHTML += `
            <div class="boss-raid-card" style="width: 200px; background: rgba(255,255,255,0.02); border: 2px solid ${isDead ? '#333' : '#4a216b'}; border-radius: 12px; padding: 12px; box-sizing: border-box; display: flex; flex-direction: column; align-items: center; position: relative; opacity: ${isDead ? 0.6 : 1}; min-height: 250px;">
                <span style="position: absolute; top: 8px; left: 8px; background: ${typeBadgeColor}; color: #fff; font-size: 8px; font-weight: bold; padding: 1px 6px; border-radius: 3px; text-transform: uppercase;">
                    ${boss.boss_type}
                </span>
                <div style="width: 100%; height: 110px; display: flex; align-items: flex-end; justify-content: center; overflow: hidden; margin-top: 10px; border-bottom: 1px solid #222; padding-bottom: 5px; position: relative;">
                    <img src="${bossIcon}" style="width: 65px; height: auto; display: block; filter: drop-shadow(0 4px 8px rgba(0,0,0,0.6));">
                    ${isDead ? `<div style="position: absolute; top: 40%; background: rgba(229,57,53,0.9); color: #fff; font-size: 10px; font-weight: bold; padding: 3px 10px; border-radius: 4px; transform: rotate(-15deg); letter-spacing: 1px; border: 1px solid #fff;">DEFEATED</div>` : ''}
                </div>
                <div style="color: #fff; font-size: 13px; font-weight: bold; margin-top: 8px; text-align: center; width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                    ${bossTitle}
                </div>
                <div style="color: #ffcc00; font-size: 10px; font-weight: bold; margin-top: 2px;">Lvl.${boss.level}</div>
                <div style="width: 100%; display: flex; flex-direction: column; gap: 3px; margin-top: 10px;">
                    <div style="display: flex; flex-direction: row; justify-content: space-between; font-size: 8px; color: #aaa; font-weight: bold; font-family: monospace;">
                        <span>HP BAR</span>
                        <span>${hpPercent.toFixed(1)}%</span>
                    </div>
                    <div style="width: 100%; height: 5px; background: #222; border-radius: 3px; overflow: hidden; border: 1px solid #333;">
                        <div style="width: ${hpPercent}%; height: 100%; background: linear-gradient(90deg, #d32f2f 0%, #ef5350 100%); transition: width 0.4s;"></div>
                    </div>
                </div>
                <button class="btn-challenge-boss" data-boss-key="${bossKey}" ${isDead ? 'disabled style="background: #333; color: #666; cursor: not-allowed;"' : ''}
                        style="width: 100%; height: 32px; margin-top: 12px; background: linear-gradient(135deg, #673ab7 0%, #512da8 100%); color: #fff; border: none; border-radius: 4px; font-size: 11px; font-weight: bold; cursor: pointer; text-transform: uppercase; pointer-events: auto;">
                    Challenge
                </button>
            </div>
        `;
    });

    return listHTML;
}

// Передаем управление Части 2 — Инициализации экрана сокетными выстрелами и привязке кликов Challenge
/**
 * ИНИЦИАЛИЗАЦИЯ И СВЯЗЫВАНИЕ ИНТЕРФЕЙСА БОССОВ К СОКЕТНОЙ ШИНЕ
 */
export function initBossListScreen(container, updateUiCallback) {
    // 1. Находим и полностью вычищаем старый контент экрана, чтобы избежать дублирования DOM-элементов
    const isReload = !!container.querySelector('.screen-content');
    if(!isReload) {
        sendSocket('battle', 'get_boss_statuses', {});
    }

    const oldScreen = container.querySelector('.screen-content');
    if (oldScreen) {
        oldScreen.remove();
    }

    container.insertAdjacentHTML('beforeend', getBossListHTML());

    // 3. Наполняем контейнер карточками боссов из текущего RAM стейта Game
    const cardsContainer = container.querySelector('#boss-cards-container');
    if (cardsContainer) {
        cardsContainer.innerHTML = generateBossCardsHTML();
    }

    // 5. Находим свежесозданные кнопки Challenge и вешаем на них обработчики кликов
    const challengeButtons = container.querySelectorAll('.btn-challenge-boss');
    challengeButtons.forEach(btn => {
        btn.onclick = () => {
            const bossKey = btn.dataset.bossKey;

            // Чистим экран перед уходом в пребаттл
            const currentScreen = container.querySelector('.screen-content');
            if (currentScreen) currentScreen.remove();

            // Формируем PvE контекст для боевого экрана
            Game.pveContext = {
                previousState: 'PVE_BOSS_LIST',
                stageId: bossKey,
                type: 'boss',
                towerKey: null
            };

            // Переключаем стейт и отрисовываем окно подготовки к рейду
            Game.gameState = 'PRE_BATTLE';
            initPreBattleScreen(container, bossKey, 'boss', null, updateUiCallback);
        };
    });
}

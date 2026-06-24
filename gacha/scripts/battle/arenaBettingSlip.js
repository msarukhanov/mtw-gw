import { t } from '../../shared.js';
import { Game } from "../../stateManager.js";
import { API_URL, headers } from '../../shared.js';

// Внутреннее изолированное состояние купона (теперь оно не пересекается с линией матчей)
let betSlipItems = [];
let stakeAmount = 100;

/**
 * Возвращает чистый HTML каркас купона
 */
export function getArenaSlipHTML() {
    return `
        <div id="arenaBetSlipComponent" style="width: 240px; background: rgba(255,255,255,0.02); border: 1px solid #2d1b4e; border-radius: 8px; padding: 12px; display: flex; flex-direction: column; box-sizing: border-box;">
            <h3 style="margin: 0 0 10px 0; font-size: 14px; color: #ffcc00; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid #2d1b4e; padding-bottom: 5px;">🎫 ${t('bet_slip', 'Bet Slip')}</h3>
            
            <!-- Контейнер для выбранных исходов -->
            <div id="arenaSlipItemsContainer" style="flex: 1; overflow-y: auto; margin-bottom: 10px; display: flex; flex-direction: column; gap: 6px;"></div>
            
            <!-- Панель управления ставкой -->
            <div id="arenaSlipControls" style="display: none; border-top: 1px solid #2d1b4e; padding-top: 10px;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 5px; font-size: 12px;">
                    <span>${t('bet_type', 'Type')}:</span><strong id="arenaSlipBetType" style="color: #ffcc00;">SINGLE</strong>
                </div>
                <div style="display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 13px;">
                    <span>${t('total_odds', 'Odds')}:</span><strong id="arenaSlipTotalOdds" style="color: #ffcc00;">1.00</strong>
                </div>
                <span style="font-size: 11px; color: #aaa;">${t('stake_amount', 'Stake Amount')} (BC):</span>
                <input type="number" id="arenaStakeAmount" value="${stakeAmount}" style="width:100%; padding:6px; margin:5px 0; background:#1c1830; border:1px solid #2d1b4e; color:#fff; border-radius:4px; box-sizing: border-box; font-family: monospace;">
                <div style="margin: 8px 0; font-size:12px;">${t('potential_win', 'Potential Win')}: <b id="arenaPotWin" style="color:#00f5d4;">0 BC</b></div>
                <button id="btnPlaceArenaBet" style="width:100%; background: linear-gradient(135deg, #ffcc00 0%, #ff9900 100%); color:#000; padding:10px; border:0; font-weight:bold; border-radius:4px; cursor:pointer; text-transform:uppercase; font-size:11px;">${t('place_bet', 'Place Bet')}</button>
            </div>
        </div>
    `;
}

/**
 * Инициализация логики купона и привязка к DOM-ноде родителя
 */
export function initArenaSlip(parentContainer) {
    const component = parentContainer.querySelector('#arenaBetSlipComponent');
    if (!component) return;

    const stakeInput = component.querySelector('#arenaStakeAmount');
    const placeBetBtn = component.querySelector('#btnPlaceArenaBet');

    // Хендлер ввода суммы ставки
    stakeInput.oninput = () => {
        stakeAmount = parseFloat(stakeInput.value) || 0;
        calculateSlipWin(component);
    };

    // Хендлер отправки купона на сервер
    placeBetBtn.onclick = async () => {
        if (betSlipItems.length === 0) return;
        if (stakeAmount <= 0) return alert(t('err_invalid_stake', 'Enter a valid stake'));

        const currentBcBalance = Game.player.resources?.blood_coin || 0;
        if (stakeAmount > currentBcBalance) return alert(t('err_insufficient_funds', 'Insufficient Blood Coins!'));

        const totalOdds = parseFloat(component.querySelector('#arenaSlipTotalOdds').innerText) || 1.00;

        const payload = {
            username: Game.player.nickname,
            items: betSlipItems.map(i => ({ matchId: i.matchId, market: i.market, selectedOutcome: i.outcome })),
            stake: stakeAmount,
            totalOdds: totalOdds
        };

        try {
            const res = await fetch(`${API_URL}/battle/pvp/bet?gameId=${Game.gameId}&serverId=${Game.serverId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...headers },
                body: JSON.stringify(payload)
            });
            const data = await res.json();

            if (res.ok && data.success) {
                alert(t('bet_placed_success', 'Bet placed successfully!'));

                // Списываем БК на клиенте гачи
                if (!Game.player.resources) Game.player.resources = {};
                Game.player.resources.blood_coin = Math.max(0, currentBcBalance - stakeAmount);

                // Апдейтим баланс в шапке экрана, если элемент существует
                const headerBalance = parentContainer.querySelector('#arena-bc-balance');
                if (headerBalance) headerBalance.innerText = `${Game.player.resources.blood_coin} BC`;

                // Чистим купон
                clearSlip(component);
            } else {
                alert(data.error || "Betting failed");
            }
        } catch (err) {
            console.error("Bet error:", err);
            alert("Network error");
        }
    };

    // Рисуем стартовое состояние (пустой купон)
    updateSlipUI(component);
}

/**
 * Публичный метод для добавления исхода в купон из ленты матчей
 */
export function addOutcomeToSlip(parentContainer, match, marketKey, outcomeKey, odds) {
    const component = parentContainer.querySelector('#arenaBetSlipComponent');
    if (!component) return;

    // В режиме ординаров — просто перезаписываем массив новой ставкой
    betSlipItems = [{
        matchId: match.match_id,
        teams: `${match.teams?.home || 'Team A'} vs ${match.teams?.away || 'Team B'}`,
        market: marketKey,
        outcome: outcomeKey,
        odds: parseFloat(odds)
    }];

    updateSlipUI(component);
}

/**
 * Публичный метод для проверки и удаления завершенных матчей из купона при обновлении линии
 */
export function validateSlipMatches(parentContainer, freshLine) {
    const component = parentContainer.querySelector('#arenaBetSlipComponent');
    if (!component || betSlipItems.length === 0) return;

    const currentMatchId = betSlipItems[0].matchId;
    const matchInLine = freshLine.find(m => m.match_id === currentMatchId);

    if (!matchInLine || matchInLine.status === 'FINISHED') {
        clearSlip(component);
        alert(t('event_finished_removed', 'The event in your slip has finished and was removed.'));
    }
}

// --- ВНУТРЕННИЕ СЛУЖЕБНЫЕ ФУНКЦИИ КОМПОНЕНТА ---

function updateSlipUI(component) {
    const itemsContainer = component.querySelector('#arenaSlipItemsContainer');
    const controls = component.querySelector('#arenaSlipControls');

    if (betSlipItems.length === 0) {
        itemsContainer.innerHTML = `<div style="color: #666; font-size: 11px; text-align: center; margin-top: 20px;">${t('select_odds_to_bet', 'Select odds to bet')}</div>`;
        controls.style.display = 'none';
        return;
    }

    controls.style.display = 'block';
    itemsContainer.innerHTML = betSlipItems.map(item => `
        <div style="background: #1c1830; border: 1px solid #2d1b4e; padding: 6px; border-radius: 4px; font-size: 11px; position: relative; width: 100%; box-sizing: border-box;">
            <b style="color: #fff; display: block; max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${item.teams}</b>
            <small style="color: #aaa;">${t('outcome_win', 'Win')} ➔ ${item.outcome.toUpperCase()}</small>
            <span style="position: absolute; right: 8px; top: 6px; color: #ffcc00; font-weight: bold;">${item.odds.toFixed(2)}</span>
        </div>
    `).join('');

    // Вычисляем общий кэф (для ординара это просто кэф единственного события)
    const totalOdds = betSlipItems[0].odds;
    component.querySelector('#arenaSlipBetType').innerText = betSlipItems.length > 1 ? "EXPRESS" : "SINGLE";
    component.querySelector('#arenaSlipTotalOdds').innerText = totalOdds.toFixed(2);

    calculateSlipWin(component);
}

function calculateSlipWin(component) {
    const totalOddsEl = component.querySelector('#arenaSlipTotalOdds');
    const potWinEl = component.querySelector('#arenaPotWin');
    if (!totalOddsEl || !potWinEl) return;

    const odds = parseFloat(totalOddsEl.innerText) || 1.00;
    potWinEl.innerText = Math.floor(stakeAmount * odds) + ' BC';
}

function clearSlip(component) {
    betSlipItems = [];
    updateSlipUI(component);
}

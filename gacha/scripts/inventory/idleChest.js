import { t, API_URL, headers, applyLayout } from '../../shared.js';
import {Game} from "../../stateManager.js";
import {sendSocket} from "../../socket.js";

export async function claimIdleRewards(idleKey, updateUiCallback, modalElement) {
    const modalElement = document.getElementById('idle-chest-modal-overlay');
    if(modalElement) {
        modalElement.remove();
    }
    // try {
    //     updateState('LOADING');
    //
    //     const res = await fetch(`${API_URL}/game/idle/claim`, {
    //         method: 'POST',
    //         headers,
    //         body: JSON.stringify({ idle_key: idleKey })
    //     });
    //
    //     const data = await res.json();
    //     if (!res.ok || data.error) throw new Error(data.error || 'Claim error');
    //
    //     // Используем твое Умное Слияние стейта!
    //     Game.player = {
    //         ...Game.player,
    //         ...data,
    //         ...(data.game_data || {})
    //     };
    //
    //     modalElement.remove(); // Закрываем окно сундука
    //     updateUiCallback(); // Обновляем главный экран, чтобы баланс валют вырос
    //
    //     // Выводим отчет о том, что именно упало в карман
    //     if (data.gained && Object.keys(data.gained).length > 0) {
    //         const report = Object.entries(data.gained)
    //             .map(([resKey, amount]) => `• ${resKey.toUpperCase()}: +${amount}`)
    //             .join('\n');
    //         alert(`🎉 Айдл-награды успешно собраны!\n\n${report}`);
    //     }
    //
    // } catch (err) {
    //     alert(t(err.message) || err.message);
    // } finally {
    //     updateState('MAIN_MENU');
    // }
}

export async function openIdleChestModal(container, idleKey, updateUiCallback) {
    sendSocket('game','claimIdle', {idleKey});
    // try {
    //     // Запрашиваем у бэкенда точный расчет накопленных наград БЕЗ их сбора
    //     const queryParams = new URLSearchParams({ idle_key: idleKey, gameId:Game.gameId }).toString();
    //     const res = await fetch(`${API_URL}/game/idle/pending?${queryParams}`, {
    //         method: 'GET',
    //         headers
    //     });
    //
    //     const data = await res.json();
    //     if (!res.ok || data.error) throw new Error(data.error || 'Pending fetch error');
    //
    //     const pending = data.pending || {};
    //     const minutesPassed = data.minutesPassed || 0;
    //
    //     // Создаем оверлей модального окна сундука
    //     const chestModal = document.createElement('div');
    //     chestModal.id = 'idle-chest-modal-overlay';
    //     chestModal.style.cssText = 'position:fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(5,5,5,0.85); z-index:250; display:flex; align-items:center; justify-content:center; box-sizing:border-box; padding:20px;';
    //
    //     chestModal.innerHTML = `
    //         <div style="background:#1a0f2e; border:3px solid #673ab7; width:100%; max-width:420px; padding:25px; border-radius:16px; text-align:center; box-shadow:0 0 20px rgba(103,58,183,0.5); display:flex; flex-direction:column; gap:15px; position:relative;">
    //
    //             <!-- Кнопка Закрыть Х -->
    //             <button id="close-chest-modal-btn" style="position:absolute; top:12px; right:12px; background:#ef4444; color:#fff; border:none; padding:4px 8px; border-radius:4px; font-weight:bold; cursor:pointer; font-size:12px;">❌</button>
    //
    //             <h3 style="margin:0; font-size:22px; color:#fff; text-shadow:0 2px 4px rgba(0,0,0,0.5);">🎁 Idle chest</h3>
    //             <p style="color:#b39ddb; font-size:12px; margin:0;">Gathering: <b>${minutesPassed} min.</b></p>
    //
    //             <!-- Сетка капающих ресурсов -->
    //             <div style="display:grid; grid-template-columns: repeat(2, 1fr); gap:10px; background:#0d061a; padding:15px; border-radius:8px; border:1px solid #3d216b; max-height:150px; overflow-y:auto;">
    //                 ${Object.entries(pending).length === 0
    //         ? `<div style="color:#666; font-size:12px; grid-column:span 2; padding:10px;">Idle rewards are empty</div>`
    //         : Object.entries(pending).map(([resKey, amount]) => {
    //             const resMeta = Game.config?.mechanics?.resources?.[resKey];
    //             return `
    //                             <div style="display:flex; align-items:center; justify-content:space-between; background:rgba(255,255,255,0.02); padding:6px 10px; border-radius:4px; border:1px solid #22123b;">
    //                                 <span style="font-size:16px; display:flex; align-items:center; gap:6px; color:#fff;">
    //                                     ${resMeta?.icon || '🔮'} <span style="font-size:11px; color:#aaa;">${resKey.toUpperCase()}</span>
    //                                 </span>
    //                                 <b style="color:#4ade80; font-family:monospace; font-size:13px;">+${amount}</b>
    //                             </div>
    //                         `;
    //         }).join('')}
    //             </div>
    //
    //             <!-- Кнопка забора -->
    //             <button id="claim-idle-btn" style="width:100%; padding:12px; background:#22c55e; color:#fff; border:none; border-radius:8px; font-weight:bold; font-size:14px; cursor:pointer; box-shadow:0 4px 10px rgba(34,197,94,0.3); transition:0.2s;" ${minutesPassed === 0 ? 'disabled style="opacity:0.5; pointer-events:none;"' : ''}>
    //                 💰 Collect
    //             </button>
    //         </div>
    //     `;
    //
    //     document.body.appendChild(chestModal);
    //
    //     // Бинд кнопки Х (закрытие)
    //     chestModal.querySelector('#close-chest-modal-btn').onclick = (e) => {
    //         e.stopPropagation();
    //         chestModal.remove();
    //     };
    //
    //     // Бинд кнопки фактического сбора ресурсов
    //     chestModal.querySelector('#claim-idle-btn').onclick = (e) => {
    //         e.stopPropagation();
    //         claimIdleRewards(idleKey, updateUiCallback, chestModal);
    //     };
    //
    // } catch (err) {
    //     alert(t(err.message) || err.message);
    // }
}

export function injectIdleChestButton(container, targetSelector, idleKey, updateUiCallback) {

    const townBgContainer = document.getElementById('game-bg');

    if(!Game.config.mechanics.idle) return;

    const orientation = Game.config.orientation || 'landscape';
    const widgets = Game.config.ui[orientation] || [];
    const idleBtn = widgets.find(item => item.id === 'btn_idle');
    const layout = idleBtn.layout;

    // 1. Проверяем, может кнопка уже была создана ранее, чтобы не плодить дубликаты
    if (container.querySelector('#btn-auto-injected-idle-chest')) return;

    // 2. Ищем целевой контейнер на экране, куда админка или макет просит прилепить кнопку
    const targetElement = container.querySelector(targetSelector) || container.querySelector('.screen-content') || container;

    if (!targetElement) {
        console.warn(`[IdleChest] Не удалось найти элемент "${targetSelector}" для инъекции кнопки.`);
        return;
    }

    // 3. Создаем элемент кнопки
    const chestBtn = document.createElement('button');
    chestBtn.id = 'btn-auto-injected-idle-chest';
    chestBtn.className = 'pulse ui-element'; // Используем твой класс pulse для красивой игровой анимации

    // Стилизуем кнопку под общую фиолетово-золотую неоновую гамму проекта
    chestBtn.style.cssText = `
       
        top: ${layout.top || 'unset'};
        bottom: ${layout.bottom || 'unset'};
        left: ${layout.left || 'unset'};
        right: ${layout.right || 'unset'};
        width: ${layout.width};
        height: ${layout.height};
        background: #221042;
        border: 2px solid #ffcc00;
        border-radius: 50%;
        box-shadow: 0 0 15px rgba(255, 204, 0, 0.4), inset 0 0 10px rgba(103, 58, 183, 0.5);
        font-size: ${layout.textSize};
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        z-index: 100;
        pointer-events: auto;
        transition: transform 0.2s, box-shadow 0.2s;
        ${applyLayout(layout)}
        position: fixed;
    `;
    chestBtn.innerHTML = '🎁';
    chestBtn.title = Game.locale === 'ru' ? 'Забрать авто-доход' : 'Claim Auto-Income';

    // Эффект легкого увеличения при наведении мышки
    chestBtn.onmouseenter = () => {
        chestBtn.style.transform = 'scale(1.1)';
        chestBtn.style.boxShadow = '0 0 25px #ffcc00, inset 0 0 15px #673ab7';
    };
    chestBtn.onmouseleave = () => {
        chestBtn.style.transform = 'scale(1)';
        chestBtn.style.boxShadow = '0 0 15px rgba(255, 204, 0, 0.4), inset 0 0 10px rgba(103, 58, 183, 0.5)';
    };

    // 4. Вешаем на неё наше готовое модальное окно просмотра/сбора
    chestBtn.onclick = (e) => {
        e.stopPropagation();
        sendSocket('game','getPendingIdle', {idleKey});
        // openIdleChestModal(container, idleKey, updateUiCallback);
    };

    // 5. Железобетонно встраиваем кнопку внутрь выбранного элемента интерфейса
    // targetElement.appendChild(chestBtn);
    targetElement.appendChild(chestBtn);
}

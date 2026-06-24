import { Game } from '../../stateManager.js';
import {API_URL, headers, t, locObj, getWindowContentStyle} from "../../shared.js";
import {sendSocket} from "../../socket.js";

/**
 * Открывает модальное окно покупки товара с выбором количества
 * @param {string} shopId - ID текущего магазина
 * @param {Object} slotItem - Объект слота из showcase бэкенда
 * @param {Function} onSuccessCallback - Коллбэк (newResources, newState) при успешной покупке
 */
export function openBuyModal(shopId, slotItem, onSuccessCallback) {
    const itemProto = Game.config.catalog.items[slotItem.itemId];

    // 1. РАСЧЕТ МАКСИМАЛЬНОГО КОЛИЧЕСТВА ДЛЯ ПОКУПКИ
    const isCash = slotItem.cost.resource === 'usd';
    const remainingLimit = slotItem.buy_limit - slotItem.bought_count;

    let maxByWallet = remainingLimit;

    if (!isCash) {
        const playerBalance = parseInt(Game.player.resources[slotItem.cost.resource]) || 0;
        if (slotItem.cost.amount > 0) {
            maxByWallet = Math.floor(playerBalance / slotItem.cost.amount);
        }
    }

    // Итоговый максимум: сколько доступно по лимиту товара И сколько игрок может себе позволить
    const absoluteMax = Math.min(remainingLimit, maxByWallet);
    let currentCount = absoluteMax > 0 ? 1 : 0;

    // Валюта и цены
    const currencyIcon = isCash ? '💵' : (Game.config.mechanics?.resources?.[slotItem.cost.resource]?.icon || '🔮');
    const itemTitle = itemProto ? locObj(itemProto.title_loc) : slotItem.itemId;
    const itemDesc = itemProto ? locObj(itemProto.desc_loc) : '';

    // 2. ГЕНЕРАЦИЯ HTML РАЗМЕТКИ МОДАЛЬНОГО ОКНА
    const modalHTML = `
        <div id="shop-modal-overlay" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); z-index: 9999; display: flex; align-items: center; justify-content: center; pointer-events: auto;">
            <div style="background: #111; border: 2px solid #333; border-radius: 8px; width: 340px; padding: 15px; box-sizing: border-box; display: flex; flex-direction: column; gap: 10px; position: relative;">
                
                <!-- Заголовок окна -->
                <h2 style="margin: 0; font-size: 16px; color: #ffcc00; text-align: center;">${t('shop_modal_title')}</h2>
                
                <!-- Карточка товара внутри модалки -->
                <div style="background: #1a1a1a; border: 1px solid #222; border-radius: 6px; padding: 10px; display: flex; flex-direction: column; align-items: center; gap: 5px;">
                    <div style="font-size: 42px; position: relative;">
                        ${itemProto?.icon || '📦'}
                        <span id="modal-item-total-amount" style="position: absolute; bottom: -2px; right: -8px; background: rgba(0,0,0,0.9); color: #fff; font-size: 11px; padding: 1px 5px; border-radius: 10px; font-weight: bold;">
                            x${slotItem.amount}
                        </span>
                    </div>
                    <div style="font-size: 13px; color: #fff; font-weight: bold;">${itemTitle}</div>
                    <div style="font-size: 11px; color: #aaa; text-align: center; min-height: 24px; padding: 0 5px;">${itemDesc}</div>
                </div>

                <!-- Интерфейс выбора количества -->
                <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; background: #0a0a0a; border: 1px solid #222; padding: 6px; border-radius: 6px;">
                    <button id="modal-btn-minus" style="width: 32px; height: 30px; background: #222; color: #fff; border: 1px solid #444; border-radius: 4px; font-size: 16px; font-weight: bold; cursor: pointer;">-</button>
                    
                    <div style="flex: 1; text-align: center; font-size: 16px; color: #fff; font-weight: bold;">
                        <span id="modal-txt-count">${currentCount}</span>
                        <span style="font-size: 11px; color: #666; font-weight: normal;"> / ${remainingLimit}</span>
                    </div>
                    
                    <button id="modal-btn-plus" style="width: 32px; height: 30px; background: #222; color: #fff; border: 1px solid #444; border-radius: 4px; font-size: 16px; font-weight: bold; cursor: pointer;">+</button>
                    <button id="modal-btn-max" style="height: 30px; padding: 0 8px; background: #222; color: #ffcc00; border: 1px solid #444; border-radius: 4px; font-size: 11px; font-weight: bold; cursor: pointer;">MAX</button>
                </div>

                <!-- Итоговая стоимость покупки -->
                <div style="display: flex; justify-content: space-between; align-items: center; font-size: 12px; padding: 0 5px; color: #aaa;">
                    <span>${t('shop_total_cost')}:</span>
                    <div style="display: flex; align-items: center; gap: 4px; font-size: 14px; font-weight: bold; color: #fff;">
                        <span id="modal-txt-total-cost">0</span>
                        <span>${currencyIcon}</span>
                    </div>
                </div>

                <!-- Кнопки управления Действием -->
                <div style="display: flex; gap: 10px; margin-top: 5px;">
                    <button id="modal-btn-cancel" style="flex: 1; height: 34px; background: #111; color: #aaa; border: 1px solid #333; border-radius: 6px; font-size: 12px; font-weight: bold; cursor: pointer;">
                        ${t('cancel')}
                    </button>
                    <button id="modal-btn-confirm" style="flex: 1; height: 34px; background: #ffcc00; color: #000; border: none; border-radius: 6px; font-size: 12px; font-weight: bold; cursor: pointer;">
                        ${t('buy')}
                    </button>
                </div>

            </div>
        </div>
    `;

    // Внедряем модальное окно в body
    document.body.insertAdjacentHTML('beforeend', modalHTML);

    const overlay = document.getElementById('shop-modal-overlay');
    const btnMinus = document.getElementById('modal-btn-minus');
    const btnPlus = document.getElementById('modal-btn-plus');
    const btnMax = document.getElementById('modal-btn-max');
    const btnCancel = document.getElementById('modal-btn-cancel');
    const btnConfirm = document.getElementById('modal-btn-confirm');

    const txtCount = document.getElementById('modal-txt-count');
    const txtTotalCost = document.getElementById('modal-txt-total-cost');
    const txtTotalAmount = document.getElementById('modal-item-total-amount');

    // 3. ФУНКЦИЯ ДИНАМИЧЕСКОГО ОБНОВЛЕНИЯ ДАННЫХ В ОКНЕ
    const updateModalData = () => {
        txtCount.innerText = currentCount;

        // Обновляем отображение итогового количества выдаваемых предметов (xКоличество * Стаку)
        txtTotalAmount.innerText = `x${slotItem.amount * currentCount}`;

        // Расчет и форматирование полной цены
        const rawCost = slotItem.cost.amount * currentCount;
        txtTotalCost.innerText = isCash ? rawCost.toFixed(2) : rawCost;

        // Блокируем кнопку покупки, если выбран 0 (или нет денег / исчерпан лимит)
        if (currentCount <= 0) {
            btnConfirm.style.background = '#333';
            btnConfirm.style.color = '#666';
            btnConfirm.style.pointerEvents = 'none';
        } else {
            btnConfirm.style.background = '#ffcc00';
            btnConfirm.style.color = '#000';
            btnConfirm.style.pointerEvents = 'auto';
        }
    };

    // 4. НАВЕШИВАНИЕ ОБРАБОТЧИКОВ СОБЫТИЙ (КЛИКИ)
    btnMinus.onclick = () => {
        if (currentCount > 1) {
            currentCount--;
            updateModalData();
        }
    };

    btnPlus.onclick = () => {
        if (currentCount < absoluteMax) {
            currentCount++;
            updateModalData();
        }
    };

    btnMax.onclick = () => {
        currentCount = absoluteMax;
        updateModalData();
    };

    const closeModal = () => {
        if (overlay) overlay.remove();
    };

    btnCancel.onclick = closeModal;

    // ОТПРАВКА ЗАПРОСА НА ПОКУПКУ ПРИ ПОДТВЕРЖДЕНИИ
    btnConfirm.onclick = async () => {
        if (currentCount <= 0) return;

        // Выбираем правильный роут в зависимости от типа валюты (Пункт 3 плана)
        // const endpoint = isCash ? '/shop/buy-cash-fake' : '/shop/buy-virtual';
        const method = isCash ? 'buyItemCashFake' : 'buyItemVirtual';

        sendSocket('item', method, {
            shopId: shopId,
            slotId: slotItem.slotId,
            count: currentCount // Передаем сколько штук хотим купить
        });

        // try {
        //     const res = await fetch(API_URL+endpoint, {
        //         method: 'POST',
        //         headers,
        //         body: JSON.stringify({
        //             userId: Game.player.user_id,
        //             serverId: Game.player.server_id,
        //             shopId: shopId,
        //             slotId: slotItem.slotId,
        //             count: currentCount // Передаем сколько штук хотим купить
        //         })
        //     });
        //
        //     const data = await res.json();
        //
        //     if (data.success) {
        //         closeModal();
        //         // Возвращаем измененные ресурсы и витрину обратно в базовый shopView через коллбэк
        //         onSuccessCallback(data.resources, data.state);
        //     } else {
        //         alert(data.message || data.error);
        //     }
        // } catch (e) {
        //     console.error(e);
        //     alert("Критическая ошибка отправки транзакции");
        // }
    };

    // Первичная инициализация состояния модалки при открытии
    updateModalData();
}

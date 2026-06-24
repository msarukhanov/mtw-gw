import { API_URL, initTownScrollListeners, t } from './shared.js';
import { Game, updateState } from './stateManager.js';

let customConfig;

async function initWrapper() {
    const urlParams = new URLSearchParams(window.location.search);
    Game.gameId = urlParams.get('game_id') || 'game_combat_stars';
    // Game.gameId = urlParams.get('game_id') || 'game_casino';
    Game.deviceId = localStorage.getItem('mock_device_id') || 'dev_' + Math.random().toString(36).substr(2, 5);
    localStorage.setItem('mock_device_id', Game.deviceId);
    Game.locale = urlParams.get('locale') || 'en';

    Game.uiContainer = document.getElementById('game-ui');

    try {
        const res = await fetch(`${API_URL}/auth/init-game?game_id=${Game.gameId}`);
        if (res.error) throw new Error('Network error');
        const config = customConfig || await res.json();
        Game.config = config;

        updateState('GAME_LOGIN');
    } catch (err) {
        console.error(err);
        Game.uiContainer.innerHTML = `<div style="padding:40px; color:#ff8a80; font-size:20px; text-align:center;">❌ Error: ${err.message}</div>`;
    }

    initTownScrollListeners();
    initGlobalFullscreen();
}

window.t = t;
window.onload = initWrapper;
window.initWrapper = initWrapper;

window.addEventListener('message', function(event) {
    console.log(event);
    if (!event.data || event.data.type !== 'CONFIG_UI_UPDATE') return;

    const payload = event.data;

    console.log("Full game configuration synchronized with admin state:");

    // Перезаписываем глобальный объект конфигурации в игре данными из админки

    // По желанию можно вытащить служебные переменные админки:
    // const activeOrientation = payload.currentOrientation;
    // const activeWidgetIdx = payload.currentUiWidgetIdx;

    customConfig = payload.fullConfig;

    initWrapper();
});

screen.orientation.addEventListener("change", () => {
    console.log(`New orientation: ${screen.orientation.type}`);
    updateState(Game.gameState);
});

/**
 * Инициализирует независимую глобальную кнопку Fullscreen.
 * Инжектится прямо в body и работает в обход игровых стейтов.
 */
function initGlobalFullscreen() {
    // Защита от дублирования: если кнопка уже создана, ничего не делаем
    if (document.getElementById('global-fs-button')) return;

    // Вживляем кнопку в самый корень документа
    const btnHTML = `
        <div id="global-fs-button" class="global-fullscreen-btn" title="Fullscreen">
            📺
        </div>
    `;
    document.getElementById('wrapper').insertAdjacentHTML('beforeend', btnHTML);

    const fsBtn = document.getElementById('global-fs-button');

    // Функция переключения полноэкранного режима
    fsBtn.onclick = (e) => {
        e.stopPropagation(); // Защита от ложных триггеров на фоне

        if (!document.fullscreenElement) {
            // Если экран не развернут — разворачиваем весь корневой документ
            document.documentElement.requestFullscreen()
                .catch(err => {
                    console.error(`[Fullscreen Error]: ${err.message}`);
                });
        } else {
            // Если уже в фуллскрине — нативно выходим из него
            document.exitFullscreen();
        }
    };

    // Слушатель изменения состояния экрана (меняем иконку)
    // Нужен для того, чтобы если игрок вышел из фуллскрина кнопкой ESC на клавиатуре,
    // иконка на нашей кнопке тоже синхронно поменялась обратно
    document.addEventListener('fullscreenchange', () => {
        if (document.fullscreenElement) {
            fsBtn.innerHTML = '🗖'; // Иконка свернутого окна
        } else {
            fsBtn.innerHTML = '📺'; // Иконка телевизора/монитора
        }
    });
}


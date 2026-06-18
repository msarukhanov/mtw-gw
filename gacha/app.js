// frontend/app.js

import { renderGameUI, } from './render.js';
import { API_URL, updateBackground, initTownScrollListeners } from './shared.js';

const Game = {
    config: null,
    player: null,
    gameState: 'LOADING',
    gameId: '', serverId: '', deviceId: '',
    locale: 'en',
    uiContainer: null,
    activeShopType: 'basic'
};

let customConfig;

// Единственная чистая функция локализации для системных нужд ядра
function t(key, replaceValue = null) {
    if (!Game.config || !Game.config.localization) return key;
    let text = Game.config.localization.ui[Game.locale]?.[key] || key;
    if (replaceValue !== null) {
        text = text.replace('{value}', replaceValue);
    }
    return text;
}

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
}

const AppActions = {
    changeState: (s) => updateState(s),

    handleMenuAction: (action) => {
        if (action === 'open_login') updateState('GAME_LOGIN');
        if (action === 'open_server_select') updateState('SERVER_SELECT');
        if (action === 'open_shop') updateState('SHOP');
        if (action === 'open_inventory') updateState('INVENTORY');
        if (action === 'open_heroes') updateState('HEROES');
        if (action === 'open_gacha') updateState('GACHA');
        if (action === 'open_games') updateState('GAMES');
        if (action === 'open_arena') updateState('ARENA');
        if (action === 'open_profile') updateState('PROFILE');
    }
};

export function updateState(newState) {
    Game.gameState = newState;

    // Обновляем фон (наша умная нативная прокрутка)
    updateBackground(newState, Game.config);

    // Передаем в рендер наш СТАБИЛЬНЫЙ объект действий AppActions
    renderGameUI(Game.uiContainer, Game, AppActions);
}

window.t = t;
window.updateState = updateState;
window.onload = initWrapper;
window.initWrapper = initWrapper;
window.updateState = updateState;

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





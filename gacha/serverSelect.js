import { t, locObj, API_URL, SOCKET_URL, setHeaders } from './shared.js';
import { Game, updateState} from './stateManager.js';
import {connect} from './socket.js';

let HasAccount = false;
let HasServer = false;
let CachedUser = null;

let IsSelectingServerMode = false;

function checkAuthCache() {
    try {
        const savedMeta = localStorage.getItem('gacha_builder_account_meta');
        const savedToken = localStorage.getItem('gacha_builder_account_token');
        const savedServer = localStorage.getItem('gacha_builder_last_server');

        if (savedToken && savedToken !== 'undefined' && savedToken !== 'null') {
            HasAccount = true;
            CachedUser = savedMeta ? JSON.parse(savedMeta) : { username: "Commander", level: 1 };
            CachedUser.device_id = savedToken;

            if (savedServer && savedServer !== 'undefined' && savedServer !== 'null') {
                CachedUser.server_id = savedServer;
                HasServer = true;
            } else {
                HasServer = false;
                CachedUser.server_id = null;
            }
        } else {
            HasAccount = false;
            HasServer = false;
            CachedUser = null;
        }
        console.log('[SAVED]:', savedMeta, savedToken, savedServer)
    } catch (e) {
        HasAccount = false;
        HasServer = false;
        CachedUser = null;
    }
}

async function runAuth(loginData, refreshCallback) {
    updateState('LOADING');
    try {
        let devId = Game.deviceId;
        if (!devId) {
            devId = 'dev_' + Math.random().toString(36).substr(2, 9);
            localStorage.setItem('gacha_builder_device_id', devId);
        }

        const res = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                game_id: Game.gameId,
                device_id: devId,
                username: loginData.username || null,
                password: loginData.password || null
            })
        });

        const data = await res.json();

        if(!data || data.error) {
            Game.gameState = 'GAME_LOGIN';
            refreshCallback();
            return;
        }

        // Фиксируем учетку в кэше
        Game.deviceId = data.player_id || devId;
        localStorage.setItem('gacha_builder_account_token', data.sessionId);
        localStorage.setItem('gacha_builder_account_meta', JSON.stringify({
            username: data.username,
            game_id: Game.gameId,
            partnerId: data.partnerId,
            device: Game.deviceId,
            sessionId: data.sessionId
        }));

        CachedUser = { username: data.username, game_id: Game.gameId, partnerId: data.partnerId, device: Game.deviceId};

        // Проверяем, привязана ли уже игра к какому-то миру
        if (data.server_id) {
            localStorage.setItem('gacha_builder_last_server', data.server_id);
        } else {
            localStorage.removeItem('gacha_builder_last_server');
        }

        IsSelectingServerMode = false;

        // Возвращаем стейт лаунчера и перерисовываем это же окно
        Game.gameState = 'SERVER_SELECT';
        refreshCallback();

    } catch (err) {
        console.error(err);
        alert(t('alert_login_error') || 'Auth Failed');
        Game.gameState = 'GAME_LOGIN';
        refreshCallback();
    }
}

async function runFinalGameStart(serverId) {
    updateState('LOADING');
    window.loaderControl.start();
    try {
        const res = await fetch(`${API_URL}/auth/enter`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: CachedUser.username, game_id: Game.gameId, server_id: serverId, device_id: Game.deviceId })
        });
        if (!res.ok) throw new Error();
        const data = await res.json();

        if(!data || data.error) {
            Game.gameState = 'GAME_LOGIN';
            refreshCallback();
            return;
        }

        localStorage.setItem('gacha_builder_account_token', data.sessionId);
        localStorage.setItem('gacha_builder_account_meta', JSON.stringify({
            username: data.username,
            game_id: Game.gameId,
            partnerId: data.partnerId,
            device: Game.deviceId,
            sessionId: data.sessionId
        }));

        setHeaders({
            'Content-Type': 'application/json',
            'x-username': data.username,
            'x-game-id': Game.gameId,
            'x-device-id': Game.deviceId,
            'x-server-id': serverId
        });

        CachedUser = { username: data.username, game_id: Game.gameId, partnerId: data.partnerId, device: Game.deviceId};

        Game.player = data;
        Game.userId = data.id;
        Game.sessionId = data.sessionId;
        Game.serverId = serverId;
        Game.partnerId = data.partnerId;
        if (data.server_time) Game.serverTimeOffset = data.server_time - Date.now();

        connect(data.id, data.username, Game.serverId, Game.gameId, Game.partnerId);

        // if (typeof io !== 'undefined') {
        //     const socket = io(SOCKET_URL);
        //     socket.on('connect', () => {
        //         window.io = socket;
        //         setTimeout(() => {
        //             console.log('🚀 Sending handshake now...');
        //             socket.emit('platform_join', {
        //                 username: data.username,
        //                 serverId,
        //                 partnerId: 'demo_mtwtech'
        //             });
        //         }, 1000);
        //     });
        //     socket.on('wallet_update', (wsData) => {
        //         console.log('⚡ Live WS Wallet Update:', data.balance);
        //         updateWallet(wsData);
        //     });
        // }

        // updateState('MAIN_MENU'); // Входим в игру!
    } catch (err) {
        console.log(err);
        alert(t('alert_login_error'));
        updateState('SERVER_SELECT');
    }
}


function makeLoginHTML() {
    const orientation = Game.config.orientation || 'landscape';
    const screenMeta = Game.config?.ui?.[orientation]?.find(w => w.id === 'screen_game_login') || {};
    const providers = screenMeta.auth_providers || ["google", "discord"];
    const socialIcons = { google: "🌐", discord: "💬", telegram: "✈" };

    return `
            <h2 style="margin: 0 0 5px 0; font-size: 20px; color: #ffcc00; text-align: center;">${t('login_header')}</h2>
            <input type="text" id="auth-username" placeholder="${t('login_user_placeholder')}" style="background: #0a0a0a; color: #fff; border: 1px solid #333; padding: 10px; border-radius: 6px; font-size: 13px; width: 100%; box-sizing: border-box;">
            <input type="password" id="auth-password" placeholder="${t('login_pass_placeholder')}" style="background: #0a0a0a; color: #fff; border: 1px solid #333; padding: 10px; border-radius: 6px; font-size: 13px; width: 100%; box-sizing: border-box;">
            <button id="btn-submit-auth" style="width: 100%; height: 38px; background: #ffcc00; color: #000; border: none; font-weight: bold; border-radius: 6px; font-size: 13px; cursor: pointer; margin-top: 5px;">${t('login_btn_submit')}</button>
            <button id="btn-guest-auth" style="width: 100%; height: 30px; background: #111; color: #aaa; border: 1px solid #333; border-radius: 6px; font-size: 12px; cursor: pointer;">${t('login_btn_guest')}</button>
            <div style="text-align: center; color: #666; font-size: 10px; margin-top: 2px;">${t('login_or_social')}</div>
            <div style="display: flex; justify-content: center; gap: 15px;">
                ${providers.map(pId => `<button class="btn-social-auth ui-element" data-provider="${pId}" style="width: 40px; height: 40px; background: #222; border: 1px solid #444; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 18px; cursor: pointer;">${socialIcons[pId] || "🔗"}</button>`).join('')}
            </div>
        `
}

function makeServersHTML() {
    const servers = Game.config?.servers || [];

    return `
            <div style="text-align: center; margin-bottom: 5px;">
                <span style="font-size: 11px; color: #aaa; text-transform: uppercase;">${t('server_current_account')}</span>
                <b style="font-size: 16px; color: #ffcc00; display: block; margin-top: 2px;">${CachedUser.username}</b>
            </div>
            <h3 style="margin: 5px 0 5px 0; font-size: 14px; color: #fff; text-align: center; border-top: 1px solid #222; padding-top: 10px;">${t('server_select_title')}</h3>
            
            <div class="launcher-servers-list" style="display: flex; flex-direction: column; gap: 6px; max-height: 180px; overflow-y: auto; padding-right: 3px; box-sizing: border-box; margin-bottom: 5px;">
                ${servers.length === 0
        ? `<div style="color:#666; text-align:center; font-size:12px;">No worlds available</div>`
        : servers.map(s => {
            const serverName = locObj(s.name) || s.id;
            let srvColor = s.status === 'hot' ? '#d84315' : (s.status === 'maintenance' ? '#444' : '#1565c0');
            return `
                            <button class="btn-select-world-node" data-world-id="${s.id}" ${s.status === 'maintenance' ? 'disabled' : ''}
                                    style="width: 100%; padding: 8px; background: ${srvColor}; color: #fff; border: none; border-radius: 4px; font-weight: bold; font-size: 12px; cursor: ${s.status === 'maintenance' ? 'not-allowed' : 'pointer'}; ${s.status === 'maintenance' ? 'opacity:0.4;' : ''}">
                                ${serverName} ${s.text ? `(${locObj(s.text)})` : ''}
                            </button>
                        `;
        }).join('')}
            </div>

            <!-- ДОБАВЛЕНО: Кнопка Назад из локализации в самом низу списка -->
            <button id="btn-launcher-back-to-menu" 
                    style="width: 100%; height: 28px; background: #222; color: #aaa; border: 1px solid #444; font-weight: bold; border-radius: 4px; font-size: 11px; cursor: pointer; margin-top: 5px;">
                ${t('btn_server_back_label') || 'Back'}
            </button>
    `;
}


function makeFastLoginHTML() {

    return `
        <h2 style="margin: 0 0 5px 0; font-size: 18px; color: #ffcc00; text-align: center; text-transform: uppercase; letter-spacing: 0.5px;">${t('server_current_account')}</h2>
        
        <div style="text-align: center; margin: 5px 0;">
            <b style="font-size: 22px; color: #fff; display: block; margin-bottom: 2px;">${CachedUser.username}</b>
        </div>

        <div style="background: rgba(255,255,255,0.02); border: 1px solid #222; padding: 10px; border-radius: 6px; text-align: center;">
            <span style="font-size: 11px; color: #888; display: block; text-transform: uppercase;">${t('profile_server')}</span>
            <b style="font-size: 15px; color: #2196f3; font-family: monospace; display: block; margin-top: 2px;">${CachedUser.server_id}</b>
        </div>

        <div style="display: flex; flex-direction: column; width: 100%; gap: 8px; margin-top: 5px;">
            <!-- Кнопка: СТАРТ -->
            <button id="btn-launcher-start" style="width: 100%; height: 42px; background: #4caf50; color: #fff; border: none; font-weight: bold; border-radius: 6px; font-size: 15px; cursor: pointer; box-shadow: 0 2px 5px rgba(0,0,0,0.3);">
                ${t('login_btn_enter') || 'START'}
            </button>
            
            <!-- Кнопка: Выбрать сервер -->
            <button id="btn-launcher-goto-servers" style="width: 100%; height: 34px; background: #1565c0; color: #fff; border: none; font-weight: bold; border-radius: 6px; font-size: 12px; cursor: pointer;">
                ${t('server_select_title')}
            </button>
            
            <!-- Кнопка: Сменить учетную запись -->
            <button id="btn-launcher-logout" style="width: 100%; height: 26px; background: #111; color: #ef4444; border: 1px solid #ef4444; font-weight: bold; border-radius: 4px; font-size: 11px; cursor: pointer;">
                ${t('login_btn_change')}
            </button>
        </div>
    `
}

export function getServerSelectHTML() {
    checkAuthCache();

    // Базовый контейнер-обертка окна (Одинаковый по стилю для всех фаз)
    let boxWrapperStart = `
        <div class="screen-content ui-element" style="align-items:center; justify-content:center; top:0; bottom:0; left:0; width:100%; display:flex; flex-direction:column;">
            <div class="login-form-box" style="background: rgba(15,15,15,0.92); border: 2px solid #ffcc00; border-radius: 12px; padding: 25px; width: 340px; box-shadow: 0 10px 30px rgba(0,0,0,0.7); display: flex; flex-direction: column; gap: 12px; box-sizing: border-box; pointer-events: auto; color:#fff; font-family:sans-serif;">
    `;
    let boxWrapperEnd = `</div></div>`;

    let contentHTML;

    if (!HasAccount) {
        contentHTML = makeLoginHTML();
    }
    // else if (IsSelectingServerMode || !HasServer) {
    else if (IsSelectingServerMode) {
        Game.deviceId = CachedUser.device_id;
        contentHTML = makeServersHTML();
    }
    else {
        Game.deviceId = CachedUser.device_id;
        contentHTML = makeFastLoginHTML();
    }

    return boxWrapperStart + contentHTML + boxWrapperEnd;
}

export function initServerSelectScreen(container, updateUiCallback) {
    const refreshScreen = () => {
        container.innerHTML = '';

        // Принудительно заставляем ядро убрать верхние бары на этапе авторизации
        if (Game.gameState !== 'GAME_LOGIN') Game.gameState = 'SERVER_SELECT';

        container.insertAdjacentHTML('beforeend', getServerSelectHTML(Game));

        // Разводка бинда событий по фазам разметки
        if (!HasAccount) {
            bindLoginPhaseEvents();
        } else if (IsSelectingServerMode) {
            bindServerPhaseEvents();
        } else {
            bindMenuPhaseEvents();
        }
    };

    // Слушатели фазы 1.4 (Логин)
    const bindLoginPhaseEvents = () => {
        container.querySelector('#btn-submit-auth').onclick = (e) => {
            e.stopPropagation();
            const u = container.querySelector('#auth-username').value;
            const p = container.querySelector('#auth-password').value;
            if (!u.trim() || !p.trim()) return;
            runAuth({ type: "credentials", username: u, password: p }, refreshScreen);
        };

        container.querySelector('#btn-guest-auth').onclick = (e) => {
            e.stopPropagation();
            runAuth({ type: "guest" }, refreshScreen);
        };

        container.querySelectorAll('.btn-social-auth').forEach(b => {
            b.onclick = (e) => { e.stopPropagation(); runAuth({ type: "oauth", provider: b.dataset.provider }, refreshScreen); };
        });
    };

    // Слушатели фазы 1.3 (Выбор мира)
    // Слушатели фазы 1.3 (Выбор мира)
    const bindServerPhaseEvents = () => {
        container.querySelectorAll('.btn-select-world-node').forEach(b => {
            b.onclick = (e) => {
                e.stopPropagation();
                const worldId = b.dataset.worldId;

                // Запоминаем выбранный мир в кэше
                localStorage.setItem('gacha_builder_last_server', worldId);

                // Выключаем режим выбора серверов и возвращаем игрока на карточку Шага 1.2
                IsSelectingServerMode = false;
                refreshScreen();
            };
        });

        // ДОБАВЛЕНО: Обработчик клика кнопки Назад в списке серверов
        const backBtn = container.querySelector('#btn-launcher-back-to-menu');
        if (backBtn) {
            backBtn.onclick = (e) => {
                e.stopPropagation();

                // Выключаем флаг принудительного выбора серверов
                IsSelectingServerMode = false;

                // Перерисовываем экран — нативная логика проверит кэш и вернет игрока на Шаг 1.2
                refreshScreen();
            };
        }
    };


    // Слушатели фазы 1.2 (Меню игрока с кнопкой СТАРТ)
    const bindMenuPhaseEvents = () => {
        // Клик СТАРТ — запускает финишный коннект и загрузку MAIN_MENU
        container.querySelector('#btn-launcher-start').onclick = (e) => {
            e.stopPropagation();
            if(CachedUser.server_id) {
                runFinalGameStart(CachedUser.server_id);
            }
        };

        // Клик Выбрать сервер — переключает окно в режим сетки миров (Шаг 1.3)
        container.querySelector('#btn-launcher-goto-servers').onclick = (e) => {
            e.stopPropagation();
            IsSelectingServerMode = true;
            refreshScreen();
        };

        // Клик Сменить учетку — полный логаут и возврат на форму ввода (Шаг 1.4)
        container.querySelector('#btn-launcher-logout').onclick = (e) => {
            e.stopPropagation();
            localStorage.removeItem('gacha_builder_account_token');
            localStorage.removeItem('gacha_builder_account_meta');
            localStorage.removeItem('gacha_builder_last_server');

            Game.deviceId = null;
            HasAccount = false;
            HasServer = false;
            CachedUser = null;
            IsSelectingServerMode = false;

            Game.gameState = 'GAME_LOGIN';
            refreshScreen();
        };
    };

    refreshScreen();
}

window.updateResources = function(resources) {
    if (resources) Game.player.resources = resources;
    if (resources.gold) {
        const walletDisplay = document.getElementById('gold-display');
        const formattedBal = '💰: ' + resources.gold;

        if (walletDisplay) walletDisplay.innerText = formattedBal;
    }
};
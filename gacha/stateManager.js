import { renderGameUI } from './render.js';

export const Game = {
    config: null,
    player: null,
    gameState: 'LOADING',
    gameId: '', serverId: '', deviceId: '',
    locale: 'en',
    uiContainer: null,
    activeShopType: 'basic',
    activeHeroTab: 'stats'
};

const menuActions = {
    open_login: 'GAME_LOGIN',
    open_server_select: 'SERVER_SELECT',
    open_shop: 'SHOP',
    open_inventory: 'INVENTORY',
    open_heroes: 'HEROES',
    open_hero_view: 'HERO_VIEW',
    open_gacha: 'GACHA',
    open_games: 'GAMES',
    open_arena: 'ARENA',
    open_pve_campaign: 'PVE_CAMPAIGN',
    open_pve_tower: 'PVE_TOWER',
    open_pve_boss_list: 'PVE_BOSS_LIST',
    open_pvp_arena: 'PVP_ARENA',
    open_profile: 'PROFILE',
    open_craft: 'CRAFT',
    open_leaderboard: 'LEADERBOARD'
};

const stateScreens = {
    GAME_LOGIN: 'screen_server_select',
    SERVER_SELECT: 'screen_server_select',
    MAIN_MENU: 'screen_main_menu',
    SHOP: 'screen_shop',
    GACHA: 'screen_gacha',
    INVENTORY: 'screen_inventory',
    HEROES: 'screen_heroes',
    HERO_VIEW: 'screen_hero',
    GAMES: 'screen_games',
    ARENA: 'screen_arena',
    PVE_CAMPAIGN: 'screen_pve_campaign',
    PVE_TOWER: 'screen_pve_tower',
    PVE_BOSS_LIST: 'screen_pve_boss',
    PROFILE: 'screen_profile',
    CRAFT: 'screen_craft',
    LEADERBOARD: 'screen_leaderboard'
};

window.Game = Game;

export function updateState(newState) {
    Game.gameState = newState;

    // Обновляем фон (наша умная нативная прокрутка)
    updateBackground(newState);

    // Передаем в рендер наш СТАБИЛЬНЫЙ объект действий AppActions
    renderGameUI(Game.uiContainer);
}

export function handleMenuAction(action) {
    if(menuActions[action]) {
        updateState(menuActions[action])
    }
}

export function updateBackground(state) {
    const wrapper = document.getElementById('wrapper');
    const bgElement = document.getElementById('game-bg');
    const bgImg = document.getElementById('image-bg');
    if (!wrapper || !bgElement || !bgImg || !Game.config || !Game.config.ui) return;

    const orientation = Game.config.orientation || 'landscape';
    const widgets = Game.config.ui[orientation] || [];

    const orientationType = screen.orientation.type;   // e.g., "portrait-primary"
    const orientationAngle = screen.orientation.angle; // e.g., 0, 90, 180, 270
    const isLandscape =  orientationType.includes('landscape');
    const isPortrait =  orientationType.includes('portrait');
    console.log(`Type: ${orientationType}, Angle: ${orientationAngle}`, isLandscape, isPortrait);

    let screenWidgetId = stateScreens[state] ||'screen_main_menu';

    const screenMeta = widgets.find(w => w.id === screenWidgetId);

    const hasImage = !!(screenMeta && screenMeta.bg_image);
    bgImg.style.display = hasImage ? 'block' : 'none';

    // Функция сброса в стандартный фиксированный фолбэк (Строго 1 экран, нативный скролл ОТКЛЮЧЕН)
    const resetToFullscreen = () => {
        // bgImg.style.width = '100dvw';
        // bgImg.style.height = '100dvh';
        // bgImg.style.objectFit = 'cover'; // Картинка покроет экран без черных полос
        // bgElement.style.width = '100dvw';
        // bgElement.style.height = '100dvh';

        // Намертво блокируем нативный скролл на уровне CSS, чтобы экран не люфтил

        console.log(orientation);
        if (isLandscape) {
            bgImg.style.width = '100dvw';
            bgImg.style.height = '100dvh';
            bgImg.style.objectFit = 'cover'; // Картинка покроет экран без черных полос
            bgElement.style.width = '100dvw';
            bgElement.style.height = '100dvh';
        }
        else {
            bgImg.style.width = '100dvh';
            bgImg.style.height = '100dvw';
            bgImg.style.objectFit = 'cover'; // Картинка покроет экран без черных полос
            bgElement.style.width = '100dvh';
            bgElement.style.height = '100dvw';
        }

        wrapper.style.overflow = 'hidden';
    };

    if (hasImage) {
        bgImg.onload = () => {
            if (bgImg.getAttribute('src') !== screenMeta.bg_image) return;

            const imgWidth = bgImg.naturalWidth;
            const imgHeight = bgImg.naturalHeight;

            if (!imgWidth || !imgHeight) {
                resetToFullscreen();
                return;
            }

            const imgAspectRatio = imgWidth / imgHeight;

            // ДИНАМИЧЕСКАЯ ПРОВЕKA: Включаем панораму только в MAIN_MENU и только если в конфиге scrollable === true
            const isScrollable = screenMeta.scrollable === true;

            if (state === 'MAIN_MENU' && isScrollable) {
                // Разрешаем нативный скролл браузера для прокрутки панорамы хаба
                wrapper.style.overflow = 'auto';

                // if (orientation === 'landscape') {
                if (isLandscape) {
                    // --- ЛАНДШАФТ ПАНOРАМА ---
                    const calculatedWidthPx = window.innerHeight * imgAspectRatio;
                    const targetVw = (calculatedWidthPx / window.innerWidth) * 100;
                    const targetWidthStr = `${targetVw}dvw`;

                    bgImg.style.width = targetWidthStr;
                    bgImg.style.height = '100dvh';
                    bgElement.style.width = targetWidthStr;
                    bgElement.style.height = '100dvh';

                    requestAnimationFrame(() => {
                        wrapper.scrollTo({
                            left: (wrapper.scrollWidth - window.innerWidth) / 2,
                            top: 0,
                            behavior: 'instant'
                        });
                    });
                } else {
                    // --- ПОРТРЕТ ПАНOРАМА ---
                    const calculatedHeightPx = window.innerWidth / imgAspectRatio;
                    const targetVh = (calculatedHeightPx / window.innerHeight) * 100;
                    const targetHeightStr = `${targetVh}dvh`;

                    // bgImg.style.width = '100dvw';
                    // bgImg.style.height = targetHeightStr;
                    // bgElement.style.width = '100dvw';
                    // bgElement.style.height = targetHeightStr;

                    bgImg.style.width = targetHeightStr;
                    bgImg.style.height = '100dvw';
                    bgElement.style.width = targetHeightStr;
                    bgElement.style.height = '100dvw';

                    requestAnimationFrame(() => {
                        wrapper.scrollTo({
                            left: 0,
                            top: (wrapper.scrollHeight - wrapper.clientHeight) / 2,
                            behavior: 'instant'
                        });
                    });
                }
            } else {
                // Если это любое другое окно или в главном меню выключен скролл (scrollable: false)
                resetToFullscreen();
            }
        };

        bgImg.src = screenMeta.bg_image;
    } else {
        bgImg.src = '';
        resetToFullscreen();
    }
}
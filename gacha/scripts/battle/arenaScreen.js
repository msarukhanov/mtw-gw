// arenaScreen.js
import { t, locObj, applyLayout, getWindowContentStyle } from '../../shared.js';
import { Game } from '../../stateManager.js';
import { initGameLauncherScreen } from '../game/gameLauncher.js'; // Переиспользуем лаунчер айфреймов!

export function getArenaScreenHTML() {
    const orientation = Game.config.orientation || 'landscape';

    // Находим мета-данные экрана арены в конфиге
    const screenSettings = Game.config?.ui?.[orientation]?.find(w => w.id === 'screen_arena') || {};
    const arenaWidgets = screenSettings.arena_widgets || [];

    let widgetsHtml = '';

    arenaWidgets.forEach(w => {
        const label = Game.config?.localization?.ui?.[Game.locale]?.[w.label_loc_key] || w.label || '';

        // Считываем геймдизайнерские параметры вывески из конфига виджета
        const pos = w.layout?.textPosition || 'center';
        const size = w.layout?.textSize || '16px';
        const color = w.layout?.textColor || '#fff';

        let labelStyle = `position: absolute; left: 50%; transform: translateX(-50%); font-size: ${size}; color: ${color}; font-weight: bold; white-space: nowrap; pointer-events: none; z-index: 5;`;

        if (pos === 'top') {
            labelStyle += 'top: 0; transform: translate(-50%, -120%);';
        } else if (pos === 'bottom') {
            labelStyle += 'bottom: 0; transform: translate(-50%, 120%);';
        } else {
            labelStyle += 'top: 50%; transform: translate(-50%, -50%);';
        }

        // Рендерим интерактивную кнопку режима арены
        widgetsHtml += `
            <button class="btn ui-element arena-mode-clickable" 
                    style="${applyLayout(w.layout)}" 
                    data-arena-type-id="${w.arena_type_id}">
                <span style="${labelStyle}">${label}</span>
            </button>
        `;
    });

    // Окно разворачивается, сохраняя верхние бары ресурсов и профиля
    return `
        <div class="screen-content ui-element" style="${getWindowContentStyle()} box-sizing: border-box; width: 100%; height: 100%; position: relative;">
            <div class="arena-widgets-container" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: auto;">
                ${widgetsHtml}
            </div>
        </div>
    `;
}

export function initArenaScreen(container, updateUiCallback) {
    // Очищаем старый под-экран контента, если он затесался
    const oldScreen = container.querySelector('.screen-content');
    if (oldScreen) oldScreen.remove();

    // Вставляем разметку арены
    container.innerHTML += getArenaScreenHTML();

    // Вешаем клики на кнопки арен
    container.querySelectorAll('.arena-mode-clickable').forEach(btn => {
        btn.onclick = (e) => {
            e.stopPropagation(); // Защита от прокликивания
            const arenaTypeId = btn.dataset.arenaTypeId;
            const arenaMeta = Game.config.catalog?.arena_types?.[arenaTypeId];

            if (!arenaMeta) return;

            // --- ДИНАМИЧЕСКАЯ ПРОВЕРКА ДОСТУПА НА ОСНОВЕ ПРОФИЛЯ ИГРОКА ---
            const playerLevel = Game.player?.level || 1;
            const playerVip = Game.player?.vip_level || 0;

            const isLocked = playerLevel < (arenaMeta.min_level || 1) || playerVip < (arenaMeta.min_vip || 0);

            if (isLocked) {
                alert(t('arena_locked_alert') || 'Вход заблокирован! Прокачайте уровень или VIP.');
                return;
            }

            // Переиспользуем наш готовый лаунчер!
            // Передаем ему контейнер и псевдо-gameId (архитектура лаунчера считает ссылку из catalog.arena_types)
            // Но чтобы лаунчер сработал без переписывания, подменим ему объект поиска или временно передадим структуру
            // Архитектурно красивее вызвать initGameLauncherScreen, предварительно прописав этот же ID в catalog.games
            initGameLauncherScreen(container, arenaTypeId, updateUiCallback);
        };
    });
}

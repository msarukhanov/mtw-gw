// gameCard.js
import { t, locObj } from '../../shared.js';
import { Game } from '../../stateManager.js';

export function getGameCardHTML(gameData, cardLayout, displayMode = 'grid') {
    if (!cardLayout) return '';

    // Вытаскиваем статический прототип игры из каталога (или дефолтный заглушечный объект)
    const prototype = Game.config.catalog?.games?.[gameData.game_id];
    if (!prototype) return '';

    const isGridMode = displayMode === 'grid';
    // В гриде показываем компактную иконку игры, в row — широкий промо-баннер
    const gameImageSrc = isGridMode
        ? (prototype.icon || 'https://picsum.photos')
        : (prototype.banner || 'https://picsum.photos');

    // Если игра временно заблокирована для аккаунта (LiveOps правила)
    const lockStyle = gameData.is_locked ? "filter: grayscale(1) opacity(0.4);" : "";

    // РЕЖИМ 1: Компактная ячейка для CSS Grid
    if (isGridMode) {
        const compactCardStyle = `
            position: relative;
            width: 100%;
            aspect-ratio: 1 / 1;
            background-color: ${cardLayout.backgroundColor || '#1e1e1e'};
            border-radius: ${cardLayout.borderRadius || '8px'};
            border: 1px solid #333;
            box-shadow: 0 2px 6px rgba(0,0,0,0.4);
            box-sizing: border-box;
            overflow: hidden;
            cursor: pointer;
            ${lockStyle}
        `.replace(/\s+/g, ' ');

        return `
            <div class="ui-element game-card-clickable" style="${compactCardStyle}" data-launcher-game-id="${gameData.game_id}">
                <div style="width: 100%; height: 100%; background-image: url('${gameImageSrc}'); background-size: cover; background-position: center; position: relative;">
                    <!-- Статус игры (New, Hot, Beta) -->
                    ${prototype.status ? `
                        <div style="position: absolute; top: 4%; left: 4%; background: ${prototype.status === 'hot' ? '#ef4444' : '#3b82f6'}; color: #fff; padding: 1px 4px; border-radius: 2px; font-weight: bold; font-size: 8px; text-transform: uppercase;">
                            ${prototype.status}
                        </div>
                    ` : ''}
                    
                    <!-- Инфо-бар внизу иконки -->
                    <div style="position: absolute; bottom: 0; width: 100%; background: rgba(0,0,0,0.8); padding: 3px 5%; box-sizing: border-box; font-size: 9px; text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #fff;">
                        ${locObj(prototype.title_loc)}
                    </div>
                </div>
            </div>
        `;
    }

    // РЕЖИМ 2: Свободный flex-ряд с большими промо-карточками
    const widthStyle = cardLayout.width ? `width: ${cardLayout.width};` : `width: auto;`;
    const heightStyle = cardLayout.height ? `height: ${cardLayout.height};` : `height: 100%;`;

    const cardStyle = `
        position: relative;
        display: flex;
        flex-direction: column;
        flex-shrink: 0;
        ${widthStyle}
        ${heightStyle}
        aspect-ratio: ${cardLayout.aspectRatio || "16 / 9"};
        background-color: ${cardLayout.backgroundColor || '#1e1e1e'};
        border-radius: ${cardLayout.borderRadius || '12px'};
        overflow: hidden;
        box-shadow: 0 4px 10px rgba(0,0,0,0.5);
        box-sizing: border-box;
        cursor: pointer;
        ${lockStyle}
    `.replace(/\s+/g, ' ');

    return `
        <div class="ui-element game-card-clickable" style="${cardStyle}" data-launcher-game-id="${gameData.game_id}">
            <div style="width: 100%; flex: 1; background-image: url('${gameImageSrc}'); background-size: cover; background-position: center; position: relative;">
                ${prototype.status ? `
                    <div style="position: absolute; top: 6%; left: 4%; background: #ef4444; color: #fff; padding: 2px 6px; border-radius: 4px; font-weight: bold; font-size: 10px; text-transform: uppercase;">
                        ${prototype.status}
                    </div>
                ` : ''}
            </div>
            <div style="padding: 4% 6%; display: flex; flex-direction: column; gap: 2px; background: rgba(15,15,15,0.95);">
                <div style="font-size: 13px; font-weight: bold; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #fff;">
                    ${locObj(prototype.title_loc)}
                </div>
                <div style="font-size: 10px; color: #aaa; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                    ${locObj(prototype.desc_loc) || 'Кликните, чтобы запустить игру'}
                </div>
            </div>
        </div>
    `;
}

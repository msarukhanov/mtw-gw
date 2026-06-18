// heroCard.js
import { t, locObj, getHeroRating } from './shared.js';

export function getHeroCardHTML(hero, Game, cardLayout, displayMode = 'grid') {
    if (!cardLayout) return '';

    const prototype = Game.config.catalog?.heroes?.[hero.hero_id];
    if (!prototype) return '';

    const faction = Game.config.catalog?.factions?.[prototype.faction_id];
    const element = Game.config.catalog?.hero_elements?.[prototype.element_id];
    const starsHtml = "⭐".repeat(hero.stars || 1);
    let totalPowerRating = getHeroRating(hero, Game);

    const isGridMode = displayMode === 'grid';
    const heroImageSrc = isGridMode
        ? (prototype.icon || 'https://picsum.photos')
        : (prototype.image || 'https://picsum.photos');

    // Настройка заблокированной карточки в режиме Каталога
    const catalogLockStyle = hero.isLockedInCatalog ? "filter: grayscale(1) opacity(0.4);" : "";

    // РЕЖИМ 1: Идеальная компактная ячейка для CSS Grid из твоего списка
    if (isGridMode) {
        const compactCardStyle = `
            position: relative;
            width: 100%;
            aspect-ratio: 1 / 1;
            background-color: ${cardLayout.backgroundColor || '#1e1e1e'};
            border-radius: ${cardLayout.borderRadius || '4px'};
            border: 1px solid ${element?.color || '#333'};
            box-shadow: 0 2px 6px rgba(0,0,0,0.4);
            box-sizing: border-box;
            overflow: hidden;
            ${catalogLockStyle}
        `.replace(/\s+/g, ' ');

        return `
            <div class="ui-element hero-card-clickable" style="${compactCardStyle}" data-hero-view-instance-id="${hero.instance_id}">
                <div style="width: 100%; height: 100%; background-image: url('${heroImageSrc}'); background-size: cover; background-position: center top; position: relative;">
                    
                    <!-- Редкость -->
                    <div style="position: absolute; top: 4%; left: 4%; background: rgba(0,0,0,0.85); color: #fff; padding: 1px 3px; border-radius: 2px; font-weight: bold; font-size: 8px;">
                        ${prototype.rarity}
                    </div>

                    <!-- Фракция -->
                    ${faction ? `<div style="position: absolute; top: 4%; right: 4%; background: rgba(0,0,0,0.85); width: 14px; height: 14px; display: flex; align-items: center; justify-content: center; border-radius: 50%; font-size: 8px;">${faction.icon}</div>` : ''}
                    
                    <!-- Инфо-бар внизу иконки -->
                    <div style="position: absolute; bottom: 0; width: 100%; background: rgba(0,0,0,0.75); display: flex; justify-content: space-between; padding: 1px 4px; box-sizing: border-box; font-size: 8px; font-family: monospace;">
                        <span style="color: #aaa;">L.${hero.level || 0}</span>
                        <span style="color: #ffcc00; font-weight: bold;">⚔️${Math.floor(totalPowerRating)}</span>
                    </div>
                </div>
            </div>
        `;
    }

    // РЕЖИМ 2: Свободный flex-ряд с большими карточками
    const widthStyle = cardLayout.width ? `width: ${cardLayout.width};` : `width: auto;`;
    const heightStyle = cardLayout.height ? `height: ${cardLayout.height};` : `height: 100%;`;

    // const cardStyle = `
    //     position: relative;
    //     display: flex;
    //     flex-direction: column;
    //     ${widthStyle}
    //     ${heightStyle}
    //     aspect-ratio: ${cardLayout.aspectRatio || "9 / 16"};
    //     background-color: ${cardLayout.backgroundColor || '#1e1e1e'};
    //     border-radius: ${cardLayout.borderRadius || '8px'};
    //     border-top: 4px solid ${element?.color || '#333'};
    //     overflow: hidden;
    //     box-shadow: 0 4px 10px rgba(0,0,0,0.4);
    //     box-sizing: border-box;
    //     ${catalogLockStyle}
    // `.replace(/\s+/g, ' ');


    // Внутри heroCard.js (для РЕЖИМА 2 - Большая карточка):

    const cardStyle = `
            position: relative;
            display: flex;
            flex-direction: column;
            flex-shrink: 0; /* ИСПРАВЛЕНО: Запрещаем карточке сжиматься в row-ленте */
            ${widthStyle}
            ${heightStyle}
            aspect-ratio: ${cardLayout.aspectRatio || "9 / 16"};
            background-color: ${cardLayout.backgroundColor || '#1e1e1e'};
            border-radius: ${cardLayout.borderRadius || '8px'};
            border-top: 4px solid ${element?.color || '#333'};
            overflow: hidden;
            box-shadow: 0 4px 10px rgba(0,0,0,0.4);
            box-sizing: border-box;
            ${catalogLockStyle}
        `.replace(/\s+/g, ' ');

    return `
        <div class="ui-element hero-card-clickable" style="${cardStyle}" data-hero-view-instance-id="${hero.instance_id}">
            <div style="width: 100%; flex: 1; background-image: url('${heroImageSrc}'); background-size: cover; background-position: center top; position: relative;">
                <div style="position: absolute; top: 5%; left: 5%; background: rgba(0,0,0,0.75); color: #fff; padding: 2% 5%; border-radius: 4px; font-weight: bold; font-size: 11px; border: 1px solid rgba(255,255,255,0.2);">
                    ${prototype.rarity}
                </div>
                <div style="position: absolute; top: 5%; right: 5%; display: flex; gap: 5px;">
                    ${faction ? `<div style="background: rgba(0,0,0,0.75); width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; border-radius: 50%; font-size: 11px;">${faction.icon}</div>` : ''}
                </div>
                <div style="position: absolute; bottom: 5%; width: 100%; text-align: center; color: #ffeb3b; font-size: 12px; text-shadow: 0 2px 4px rgba(0,0,0,0.9);">
                    ${starsHtml}
                </div>
            </div>
            <div style="padding: 5% 8%; display: flex; flex-direction: column; gap: 2px; background: rgba(15,15,15,0.9);">
                <div style="font-size: 14px; font-weight: bold; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #fff;">
                    ${locObj(prototype.title_loc, Game)}
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center; font-size: 11px;">
                    <span style="color: #aaa;">${t('heroes_lvl', Game)} ${hero.level}</span>
                    <b style="color: #ffcc00;">⚔️ ${Math.floor(totalPowerRating)}</b>
                </div>
            </div>
        </div>
    `;
}

import {Game} from "../../stateManager.js";
import {getHeroRating} from "../../shared.js";

export function getHeroBench(CurrentTeamSetup, stageId, type, towerKey) {
    const ownedHeroes = [...(Game.player.heroes || [])];
    ownedHeroes.sort((a, b) => getHeroRating(b) - getHeroRating(a));

    const benchHeroesHTML = ownedHeroes.map(hero => {
        const proto = Game.config.catalog.heroes[hero.hero_id];
        const isAlreadyOnField = CurrentTeamSetup.selectedHeroInstIds.includes(hero.instance_id);

        return `
            <div class="bench-hero-card ${isAlreadyOnField ? 'bench-hero-locked' : 'bench-hero-selectable'}" 
                 data-inst-id="${hero.instance_id}" 
                 style="width: 65px; height: 85px; background: #1a1a1a; border: 1px solid ${isAlreadyOnField ? '#333' : '#444'}; opacity: ${isAlreadyOnField ? '0.4' : '1'}; border-radius: 6px; padding: 4px; box-sizing: border-box; display: flex; flex-direction: column; align-items: center; justify-content: space-between; cursor: ${isAlreadyOnField ? 'not-allowed' : 'pointer'}; flex-shrink: 0; pointer-events: auto; transition: transform 0.1s;">
                <img src="${proto?.icon}" style="width: 40px; height: 40px;object-fit: cover; border-radius: 4px;">
                <div style="font-size: 10px; font-weight: bold; color: #ffcc00;">★ ${hero.stars}</div>
                <div style="font-size: 9px; color: #aaa;">CP ${Math.floor(getHeroRating(hero))}</div>
            </div>
        `;
    }).join('');

    return `
        <div style="display: flex; flex-direction: row; width: 100%; height: 100px; gap: 15px; align-items: center; border-top: 1px solid #333; padding-top: 10px; box-sizing: border-box;">
            <div class="bench-heroes-carousel" style="display: flex; flex-direction: row; gap: 8px; flex: 1; overflow-x: auto; overflow-y: hidden; height: 100%; padding-bottom: 4px; align-items: center;">
                ${benchHeroesHTML}
            </div>
            <button id="btn_start_pve_fight_execute" data-stage-id="${stageId}" data-pve-type="${type}" data-tower-key="${towerKey}"
                style="width: 130px; height: 75px; background: linear-gradient(135deg, #4caf50 0%, #2e7d32 100%); color: #fff; border: none; border-radius: 6px; font-size: 16px; font-weight: bold; cursor: pointer; pointer-events: auto; box-shadow: 0 4px 15px rgba(76,175,80,0.4); text-transform: uppercase; letter-spacing: 1px;">
                ${t('btn_start_battle_label') || 'Battle'}
            </button>
        </div>
    `;
}
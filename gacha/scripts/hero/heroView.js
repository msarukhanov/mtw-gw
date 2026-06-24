import { t, locObj, getHeroRating, getWindowContentStyle, headers, API_URL } from '../../shared.js';
import { Game } from '../../stateManager.js';
import {sendSocket} from "../../socket.js";

export async function equipHeroItem(heroInstanceId, itemId, slotId, updateUiCallback) {
    sendSocket('hero','equipItem', {
        heroInstanceId,
        itemId: itemId, // Если null -> предмет снимется
        slotId: slotId  // Передаем конкретный слот (weapon, armor, personal)
    });
    // try {
    //     // Отправляем запрос на правильный роут /hero/equip
    //     const res = await fetch(`${API_URL}/hero/equip`, {
    //         method: 'POST',
    //         headers,
    //         body: JSON.stringify({
    //             heroInstanceId: heroInstanceId,
    //             itemId: itemId, // Если null -> предмет снимется
    //             slotId: slotId  // Передаем конкретный слот (weapon, armor, personal)
    //         })
    //     });
    //
    //     const data = await res.json();
    //     if (!res.ok || data.error) throw new Error(data.error || 'Equip error');
    //
    //     // Синхронизируем стейт: бэкенд возвращает полностью обновленную game_data
    //     Game.player = {...Game.player,...data.game_data};
    //     if (data.resources) Game.player.resources = data.resources;
    //     if (data.combat_power) Game.player.combat_power = data.combat_power;
    //
    //     updateUiCallback();
    //     alert(t('alert_equip_success') || 'Экипировка успешно изменена!');
    // } catch (err) {
    //     console.error(err);
    //     alert(t(err.message) || err.message);
    // }
}

export async function levelUpHero(heroInstanceId, levelsToUp, updateUiCallback) {
    sendSocket('hero','levelUp', {heroInstanceId, levels_to_up: levelsToUp});
    // try {
    //     const res = await fetch(`${API_URL}/hero/levelup`, {
    //         method: 'POST',
    //         headers,
    //         body: JSON.stringify({
    //             heroInstanceId: heroInstanceId,
    //             levels_to_up: levelsToUp
    //         })
    //     });
    //
    //     const data = await res.json();
    //     if (!res.ok || data.error) throw new Error(data.error || 'Level Up error');
    //
    //     // Синхронизируем стейт игрока и ресурсы
    //     Game.player = {...Game.player,...data.game_data};
    //     if (data.resources) Game.player.resources = data.resources;
    //     if (data.combat_power) Game.player.combat_power = data.combat_power;
    //
    //     updateUiCallback();
    //     alert(`Уровень успешно повышен на +${levelsToUp}!`);
    // } catch (err) {
    //     alert(t(err.message) || err.message);
    // }
}

export async function upgradePersonalItem(heroInstanceId, updateUiCallback) {
    sendSocket('hero','upgradePersonalItem', {heroInstanceId: heroInstanceId});
    // try {
    //     updateState('LOADING');
    //     const res = await fetch(`${API_URL}/hero/upgrade-personal`, {
    //         method: 'POST',
    //         headers,
    //         body: JSON.stringify({
    //             heroInstanceId: heroInstanceId
    //         })
    //     });
    //
    //     const data = await res.json();
    //     if (!res.ok || data.error) throw new Error(data.error || 'Personal Item error');
    //
    //     // Синхронизируем стейт game_data
    //     Game.player = {...Game.player,...data.game_data};
    //     if (data.resources) Game.player.resources = data.resources;
    //     if (data.combat_power) Game.player.combat_power = data.combat_power;
    //
    //     updateUiCallback();
    //     alert('Уникальный артефакт успешно улучшен!');
    // } catch (err) {
    //     alert(t(err.message) || err.message);
    // } finally {
    //     updateState('MAIN_MENU');
    // }
}

export async function changeHeroSkin(heroInstanceId, skinId, updateUiCallback) {
    sendSocket('hero','changeHeroSkin', {heroInstanceId, skinId});
    // try {
    //     updateState('LOADING');
    //     const res = await fetch(`${API_URL}/hero/change-skin`, {
    //         method: 'POST',
    //         headers,
    //         body: JSON.stringify({
    //             heroInstanceId: heroInstanceId,
    //             skin_id: skinId
    //         })
    //     });
    //
    //     const data = await res.json();
    //     if (!res.ok || data.error) throw new Error(data.error || 'Change skin error');
    //
    //     // Синхронизируем стейт game_data
    //     Game.player = {...Game.player,...data.game_data};
    //     if (data.resources) Game.player.resources = data.resources;
    //     if (data.combat_power) Game.player.combat_power = data.combat_power;
    //
    //     updateUiCallback();
    //     // alert('Облик бога успешно изменен!');
    // } catch (err) {
    //     alert(t(err.message) || err.message);
    // } finally {
    //     updateState('MAIN_MENU');
    // }
}

export async function upgradeHeroStars(heroInstanceId, fodderInstIds, updateUiCallback) {
    sendSocket('hero','upgradeStars', {
        heroInstanceId: heroInstanceId,
        fodder_inst_ids: fodderInstIds
    });
    // try {
    //     updateState('LOADING');
    //     const res = await fetch(`${API_URL}/hero/upgrade-stars`, {
    //         method: 'POST',
    //         headers,
    //         body: JSON.stringify({
    //             heroInstanceId: heroInstanceId,
    //             fodder_inst_ids: fodderInstIds
    //         })
    //     });
    //
    //     const data = await res.json();
    //     if (!res.ok || data.error) throw new Error(data.error || 'Upgrade stars error');
    //
    //     // Синхронизируем состояние профиля и ресурсов
    //     Game.player = {...Game.player,...data.game_data};
    //     if (data.resources) Game.player.resources = data.resources;
    //     if (data.combat_power) Game.player.combat_power = data.combat_power;
    //
    //     updateUiCallback();
    //     alert('Эволюция успешна! Звездный ранг бога повышен!');
    // } catch (err) {
    //     alert(t(err.message) || err.message);
    // } finally {
    //     updateState('MAIN_MENU');
    // }
}

export async function manageHeroPet(heroInstanceId, petId, isLevelUpAction, updateUiCallback) {
    sendSocket('hero','managePet', {
        heroInstanceId,
        petId, // Передаем null, если это чистый левелап текущего
        isLevelUpAction
    });
    // try {
    //     updateState('LOADING');
    //     const res = await fetch(`${API_URL}/hero/manage-pet`, {
    //         method: 'POST',
    //         headers,
    //         body: JSON.stringify({
    //             heroInstanceId: heroInstanceId,
    //             pet_id: petId, // Передаем null, если это чистый левелап текущего
    //             is_level_up_action: isLevelUpAction
    //         })
    //     });
    //
    //     const data = await res.json();
    //     if (!res.ok || data.error) throw new Error(data.error || 'Pet action error');
    //
    //     // Синхронизируем стейт
    //     Game.player = {...Game.player,...data.game_data};
    //     if (data.resources) Game.player.resources = data.resources;
    //     if (data.combat_power) Game.player.combat_power = data.combat_power;
    //
    //     updateUiCallback();
    //     alert(isLevelUpAction ? 'Питомец успешно покормлен и повысил уровень!' : 'Питомец успешно привязан к божеству!');
    // } catch (err) {
    //     alert(t(err.message) || err.message);
    // } finally {
    //     updateState('MAIN_MENU');
    // }
}


export function getHeroViewHTML(instanceId, listIds) {
    let isCatalogLocked = instanceId.startsWith('catalog_');
    let hero = null;
    let prototype = null;

    if (isCatalogLocked) {
        const heroId = instanceId.replace('catalog_', '');
        prototype = Game.config.catalog.heroes[heroId];
        hero = { hero_id: heroId, level: 100, stars: 5, equipped: {} };
    } else {
        // Забираем данные из правильного вложенного объекта game_data
        const heroesList = Game.player?.heroes || [];
        hero = heroesList.find(h => h.instance_id === instanceId);
        prototype = Game.config.catalog.heroes[hero?.hero_id];
    }

    if (!prototype) return '';

    const currentIndex = listIds.indexOf(instanceId);
    const prevInstanceId = currentIndex > 0 ? listIds[currentIndex - 1] : null;
    const nextInstanceId = currentIndex < listIds.length - 1 ? listIds[currentIndex + 1] : null;

    const orientation = Game.config.orientation || 'landscape';
    const viewSettings = Game.config?.ui?.[orientation]?.find(w => w.id === 'screen_hero_view') || {};
    const configuredTabs = viewSettings.menu_tabs || ['stats', 'inventory', 'bio'];

    if (!configuredTabs.includes(Game.activeHeroTab)) {
        Game.activeHeroTab = configuredTabs[0] || 'stats';
    }

    // Блок Меню Вкладок
    const blockMenuHTML = `
        <div class="view-block-menu" style="display:flex; flex-direction:column; gap:8px; background:rgba(0,0,0,0.4); padding:10px; border-radius:6px; flex-shrink:0;">
            ${configuredTabs.map(tabKey => {
        const isActive = Game.activeHeroTab === tabKey;
        const cacheKey = tabKey === 'inventory' ? 'tab_inventory' : `tab_${tabKey}`;
        return `
                    <button class="tab-btn" data-tab="${tabKey}" style="padding:10px; background:${isActive ? '#ffcc00' : '#222'}; color:${isActive ? '#000' : '#fff'}; border:none; border-radius:4px; font-weight:bold; cursor:pointer; font-size:12px;">
                        ${t(cacheKey)}
                    </button>
                `;
    }).join('')}
        </div>
    `;

    const currentSkinId = hero.active_skin || `${hero.hero_id}_skin_default`;
    const currentSkinObj = prototype.skins?.find(s => s.skin_id === currentSkinId);
    let heroImageSrc = currentSkinObj?.image || prototype.image;

    // const blockAvatarHTML = `
    //     <div class="view-block-avatar" style="flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; position:relative; background: url('${heroImageSrc}') center center / contain no-repeat; height:100%;">
    //         ${prevInstanceId ? `<button class="nav-arrow-btn" data-target-id="${prevInstanceId}" style="position:absolute; left:5px; top:50%; transform:translateY(-50%); font-size:24px; background:rgba(0,0,0,0.7); color:#fff; border:1px solid #444; border-radius:4px; cursor:pointer; padding:8px 12px; z-index:10; pointer-events:auto;">◀</button>` : ''}
    //
    //         <div style="position:absolute; bottom:10px; background:rgba(15,15,15,0.85); padding:8px 16px; border-radius:4px; text-align:center; border:1px solid #333; min-width:150px;">
    //             <h3 style="margin:0 0 2px 0; color:#fff; font-size:16px;">${locObj(prototype.title_loc)}</h3>
    //             <span style="color:#ffcc00; font-weight:bold; font-size:13px; font-family:monospace;">⚔️ ${Math.floor(hero.combat_power || getHeroRating(hero))}</span>
    //         </div>
    //
    //         ${nextInstanceId ? `<button class="nav-arrow-btn" data-target-id="${nextInstanceId}" style="position:absolute; right:5px; top:50%; transform:translateY(-50%); font-size:24px; background:rgba(0,0,0,0.7); color:#fff; border:1px solid #444; border-radius:4px; cursor:pointer; padding:8px 12px; z-index:10; pointer-events:auto;">▶</button>` : ''}
    //     </div>
    // `;

    // --- УЛУЧШЕНИЕ БЛОКА АВАТАРА (Поддержка вывода питомца) ---
    const activePet = hero.pet; // { pet_id: "frost_fox", level: 10 }
    const petProto = activePet ? Game.config.catalog?.pets?.[activePet.pet_id] : null;

    const blockAvatarHTML = `
        <div class="view-block-avatar " style="flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; position:relative; background: url('') center center / contain no-repeat; height:100%;">
            ${prevInstanceId ? `<button class="nav-arrow-btn" data-target-id="${prevInstanceId}" style="position:absolute; left:5px; top:50%; transform:translateY(-50%); font-size:24px; background:rgba(0,0,0,0.7); color:#fff; border:1px solid #444; border-radius:4px; cursor:pointer; padding:8px 12px; z-index:10; pointer-events:auto;">◀</button>` : ''}
            
            <img class="idle_pulse" src="${heroImageSrc}" style="height: 100%;width: auto;">
            <!-- ОТОБРАЖЕНИЕ ПИТОМЦА РЯДОМ С ПЕРСОНАЖЕМ -->
            ${petProto ? `
                <div class="ui-element pet-floating-badge" style="position:absolute; bottom:80px; right:20px; display:flex; flex-direction:column; align-items:center; background:rgba(20,20,20,0.9); border:2px solid #ffcc00; padding:6px; border-radius:12px; box-shadow:0 0 10px #ffcc00; animation: bounce 3s infinite ease-in-out; pointer-events:auto;" title="${activePet.pet_id}">
                    <div style="font-size:24px; line-height:1;">${petProto.icon || '🐾'}</div>
                    <span style="font-size:9px; color:#ffcc00; font-weight:bold; font-family:monospace; margin-top:2px;">Lvl ${activePet.level}</span>
                </div>
                
                <!-- Простая CSS-анимация парения питомца -->
                <style>
                    @keyframes bounce {
                        0%, 100% { transform: translateY(0); }
                        50% { transform: translateY(-8px); }
                    }
                </style>
            ` : ''}

            <div style="position:absolute; bottom:10px; background:rgba(15,15,15,0.85); padding:8px 16px; border-radius:4px; text-align:center; border:1px solid #333; min-width:150px;">
                <h3 style="margin:0 0 2px 0; color:#fff; font-size:16px;">${locObj(prototype.title_loc)}</h3>
                <span style="color:#ffcc00; font-weight:bold; font-size:13px; font-family:monospace;">⚔️ ${Math.floor(hero.combat_power || getHeroRating(hero))}</span>
            </div>

            ${nextInstanceId ? `<button class="nav-arrow-btn" data-target-id="${nextInstanceId}" style="position:absolute; right:5px; top:50%; transform:translateY(-50%); font-size:24px; background:rgba(0,0,0,0.7); color:#fff; border:1px solid #444; border-radius:4px; cursor:pointer; padding:8px 12px; z-index:10; pointer-events:auto;">▶</button>` : ''}
        </div>
    `;


    let contentInner = '';

    // --- ВКЛАДКА 1: ХАРАКТЕРИСТИКИ (УЛУЧШЕНО ПОД ВСЕ СЛОТЫ ШМОТА) ---
    if (Game.activeHeroTab === 'stats') {
        const playerRes = Game.player?.resources || {};

        contentInner = `
            <h4 style="margin:0 0 10px 0; font-size:14px; border-bottom:1px solid #333; padding-bottom:5px;">${t('tab_stats')} (Lvl ${hero.level})</h4>
            
            <!-- Сетка характеристик -->
            <div style="display:flex; flex-direction:column; gap:6px; font-size:12px; font-family:sans-serif; margin-bottom: 15px;">
                ${Object.entries(Game.config.mechanics.stats || {}).map(([statId, meta]) => {
            const base = prototype.base_stats?.[statId] || 0;
            const growth = prototype.stats_growth?.[statId] || 0;
            let val = base + (growth * hero.level);

            if (hero.equipped) {
                Object.values(hero.equipped).forEach(equippedItemId => {
                    if (equippedItemId && Game.config.catalog.items[equippedItemId]?.stats?.[statId]) {
                        val += Game.config.catalog.items[equippedItemId].stats[statId];
                    }
                });
            }
            return `<div style="display:flex; justify-content:space-between; background:rgba(255,255,255,0.03); padding:4px 6px; border-radius:2px;"><span>${meta.icon} ${t(meta.name_loc_key)}</span><b style="color:#fff;">${val}</b></div>`;
        }).join('')}
                    </div>

            <!-- БЛОК ПРОКАЧКИ УРОВНЯ -->
            ${isCatalogLocked ? '' : `
                <div style="margin-top:auto; background:rgba(0,0,0,0.3); padding:8px; border-radius:4px; border:1px solid #333;">
                    <div style="display:flex; justify-content:space-between; font-size:10px; color:#aaa; margin-bottom:8px;">
                        <span>💰 ${playerRes.gold || 0}</span>
                        <span>🧪 ${playerRes.hero_exp || playerRes.exp || 0}</span>
                    </div>
                    <div style="display:flex; gap:6px;">
                        <button class="btn-lvlup-action" data-levels="1" style="flex:1; padding:6px; background:#4ade80; color:#000; border:none; border-radius:3px; font-weight:bold; font-size:11px; cursor:pointer; pointer-events:auto;">+1 LVL</button>
                        <button class="btn-lvlup-action" data-levels="10" style="flex:1; padding:6px; background:#22c55e; color:#fff; border:none; border-radius:3px; font-weight:bold; font-size:11px; cursor:pointer; pointer-events:auto;">+10 LVL</button>
                    </div>
                </div>
            `}
        `;
    }
    // --- ВКЛАДКА 2: ИНВЕНТАРЬ / СЛОТЫ ЭКИПИРОВКИ ---
    else if (Game.activeHeroTab === 'inventory') {
        contentInner = `
            <h4 style="margin:0 0 10px 0; font-size:14px; border-bottom:1px solid #333; padding-bottom:5px;">${t('tab_inventory')}</h4>
            ${isCatalogLocked ? `<p style="color:#aaa; font-size:12px;">${t('hero_view_locked')}</p>` : `
                <div style="display:flex; flex-direction:column; gap:8px;">
                    ${(prototype.inventory_slots || Game.config.mechanics.inventory_slots).map(slot => {
            const equippedItemId = hero.equipped?.[slot];
            const itemMeta = Game.config.catalog.items[equippedItemId];

            return `
                            <div style="display:flex; align-items:center; justify-content:space-between; background:#222; padding:6px 10px; border-radius:4px; border:1px solid #333; box-sizing:border-box;">
                                <div style="font-size:12px;">
                                    <span style="color:#aaa; font-size:10px;">${slot.toUpperCase()}:</span>
                                    <b style="margin-left:6px; color:#fff;">${itemMeta ? `${itemMeta.icon} ${locObj(itemMeta.title_loc)}` : t('heroes_slot_empty')}</b>
                                </div>
                                <div style="display:flex; gap:4px;">
                                    ${equippedItemId ? `
                                        <button class="btn-view-unequip" data-hero-id="${instanceId}" data-slot="${slot}" style="padding:4px 8px; background:#ef4444; color:#fff; border:none; border-radius:3px; font-weight:bold; font-size:11px; cursor:pointer; pointer-events:auto;">❌</button>
                                    ` : ''}
                                    <button class="btn-view-equip" data-hero-id="${instanceId}" data-slot="${slot}" style="padding:4px 8px; background:#ffcc00; color:#000; border:none; border-radius:3px; font-weight:bold; font-size:11px; cursor:pointer; pointer-events:auto;">
                                        ${t('heroes_equip_btn')}
                                    </button>
                                </div>
                            </div>
                        `;
        }).join('')}
                </div>
            `}
        `;
    }
    // --- ВКЛАДКА 3: СИНЕРГИИ / УЗЫ ---
    else if (Game.activeHeroTab === 'bonds') {
        let bondsListHTML = '';
        if (prototype.bonds && prototype.bonds.length > 0) {
            prototype.bonds.forEach(bond => {
                const pHeroes = Game.player?.game_data?.heroes || Game.player?.heroes || [];
                const isBondActive = pHeroes.some(h => h.hero_id === bond.target_hero_id);
                const statMeta = Game.config?.mechanics?.stats?.[bond.bonus_stat_id];
                const statSign = statMeta?.icon || '🔺';
                const bondBoxStyle = isBondActive
                    ? `background: rgba(255,204,0,0.05); border: 1px solid rgba(255,204,0,0.25); color: #fff;`
                    : `background: rgba(0,0,0,0.4); border: 1px solid #222; color: #555; filter: grayscale(1);`;

                bondsListHTML += `
                <div style="display: flex; flex-direction: column; gap: 4px; padding: 8px 12px; border-radius: 6px; font-size: 12px; margin-bottom: 8px; box-sizing: border-box; ${bondBoxStyle}">
                    <div style="display: flex; justify-content: space-between; align-items: center; font-weight: bold;">
                        <span>${bond.desc_loc?.[Game.locale || 'en'] || bond.desc_loc?.['en'] || 'Bond Link'}</span>
                        <span style="font-size: 9px; color: ${isBondActive ? '#4ade80' : '#666'}; background: ${isBondActive ? 'rgba(74,222,128,0.1)' : 'rgba(0,0,0,0.3)'}; padding: 2px 6px; border-radius: 4px;">
                            ${isBondActive ? 'ACTIVE' : 'LOCKED'}
                        </span>
                    </div>
                    <div style="font-size: 11px; color: ${isBondActive ? '#ffcc00' : '#444'}; font-family: monospace; display: flex; align-items: center; gap: 4px; margin-top: 2px;">
                        <span>${statSign}</span> 
                        <span>${t(statMeta?.name_loc_key)} +${bond.bonus_value}%</span>
                    </div>
                </div>
            `;
            });
        }
        contentInner = `
            <h4 style="margin:0 0 10px 0; font-size:14px; border-bottom:1px solid #333; padding-bottom:5px;">${t('tab_bonds')}</h4>
            <div style="display: flex; flex-direction: column; width: 100%; height: 100%;">
                ${bondsListHTML || `<div style="color: #666; text-align: center; padding: 20px; font-size: 12px;">У этого персонажа нет древних уз синергии...</div>`}
            </div>
        `;
    }
    // --- ВКЛАДКА 4: ЗВЕЗДЫ ---
    else if (Game.activeHeroTab === 'stars') {
        const starsHtml = "⭐".repeat(hero.stars || 1);
        const playerRes = Game.player?.resources || {};
        const playerInv = Game.player?.inventory || {};

        // Достаем рецепт для следующей звезды
        const nextStarIdx = (hero.stars || 1) + 1;
        const heroProto = Game.config.catalog?.heroes?.[hero.hero_id];
        const recipe = heroProto?.star_recipes?.[nextStarIdx] || Game.config?.gacha?.rules?.general_star_recipes?.[nextStarIdx];

        let recipeRequirementsHTML = '';

        if (recipe && !isCatalogLocked) {
            recipeRequirementsHTML = `
                <div style="margin-top: 15px; display:flex; flex-direction:column; gap:6px; font-size:11px; background:rgba(0,0,0,0.2); padding:8px; border-radius:4px; border:1px solid #333;">
                    <b style="color:#aaa; text-align:center; margin-bottom:4px;">ТРЕБОВАНИЯ ДЛЯ ЭВОЛЮЦИИ:</b>
                    
                    <!-- Проверка золота/ресурсов -->
                    ${recipe.resources ? Object.entries(recipe.resources).map(([resKey, amount]) => {
                const hasEnough = (parseInt(playerRes[resKey]) || 0) >= amount;
                return `<div style="display:flex; justify-content:space-between; color:${hasEnough ? '#4ade80' : '#ef4444'}"><span>${resKey.toUpperCase()}: ${amount}</span><span>(Есть: ${playerRes[resKey] || 0})</span></div>`;
            }).join('') : ''}

                    <!-- Проверка осколков (shards) -->
                    ${recipe.shards ? Object.entries(recipe.shards).map(([shardId, amount]) => {
                const hasEnough = (playerInv[shardId] || 0) >= amount;
                return `<div style="display:flex; justify-content:space-between; color:${hasEnough ? '#4ade80' : '#ef4444'}"><span>🧩 Осколки: ${amount}</span><span>(Есть: ${playerInv[shardId] || 0})</span></div>`;
            }).join('') : ''}

                    <!-- Проверка требований к героям-донорам -->
                    ${recipe.fodder_count ? `
                        <div style="display:flex; justify-content:space-between; color:#ffcc00; border-top:1px solid #444; padding-top:4px; margin-top:4px;">
                            <span>🔥 Требуется корма: ${recipe.fodder_count} богов</span>
                        </div>
                    ` : ''}

                    <button class="btn-trigger-evolution" style="margin-top:8px; width:100%; padding:8px; background:#ffcc00; color:#000; border:none; border-radius:3px; font-weight:bold; font-size:12px; cursor:pointer; pointer-events:auto;">
                        СОВЕРШИТЬ ВОЗВЫШЕНИЕ
                    </button>
                </div>
            `;
        } else {
            recipeRequirementsHTML = `<p style="color:#aaa; font-size:11px; text-align:center; margin-top:10px;">${isCatalogLocked ? t('hero_view_locked') : 'Достигнут максимальный предел звездного величия!'}</p>`;
        }

        contentInner = `
            <h4 style="margin:0 0 10px 0; font-size:14px; border-bottom:1px solid #333; padding-bottom:5px;">${t('tab_stars')}</h4>
            <div style="text-align:center; padding:10px; font-size:24px; text-shadow:0 0 8px #ffcc00;">${starsHtml}</div>
            <p style="color:#ccc; font-size:12px; text-align:center; margin:0;">Текущая стадия звездного возвышения бога.</p>
            ${recipeRequirementsHTML}
        `;
    }
    else if (Game.activeHeroTab === 'personal_item') {
        const itemLevel = hero.personal_item_level || 0;
        const pItemId = prototype.personal_item_id;
        const pItemProto = Game.config.catalog?.personal_items?.[pItemId];
        const playerInv = Game.player?.inventory || {};

        let actionBlockHTML = '';

        if (!pItemId) {
            actionBlockHTML = `<p style="color:#666; font-size:12px; text-align:center; padding:10px;">У этого бога нет личного уникального артефакта.</p>`;
        } else if (isCatalogLocked) {
            actionBlockHTML = `<p style="color:#aaa; font-size:12px; text-align:center; padding:10px;">Заблокировано в режиме каталога.</p>`;
        } else {
            const nextLevel = itemLevel + 1;
            const unlockLevelRequirement = Game.config?.mechanics?.personal_item_unlock_level || 100;
            const levelCosts = Game.config?.mechanics?.personal_item_costs?.[nextLevel];

            if (itemLevel === 0 && hero.level < unlockLevelRequirement) {
                // Если артефакт ещё закрыт по уровню героя
                actionBlockHTML = `
                    <div style="text-align:center; color:#ef4444; font-size:11px; margin-top:15px; padding:8px; background:rgba(239,68,68,0.05); border:1px solid rgba(239,68,68,0.2); border-radius:4px;">
                        🔒 ТРЕБУЕТСЯ ${unlockLevelRequirement} УРОВЕНЬ БОГА ДЛЯ ПРОБУЖДЕНИЯ АРТЕФАКТА
                    </div>
                `;
            } else if (!levelCosts) {
                // Если достигнут максимальный уровень прокачки
                actionBlockHTML = `<p style="color:#4ade80; font-size:12px; font-weight:bold; text-align:center; margin-top:15px;">✨ Достигнут максимальный уровень пробуждения артефакта!</p>`;
            } else {
                // Выводим требования ресурсов для прокачки/разблокировки
                actionBlockHTML = `
                    <div style="margin-top: 15px; display:flex; flex-direction:column; gap:6px; font-size:11px; background:rgba(0,0,0,0.2); padding:8px; border-radius:4px; border:1px solid #333;">
                        <b style="color:#aaa; text-align:center; margin-bottom:4px;">СТОИМОСТЬ УЛУЧШЕНИЯ:</b>
                        
                        ${levelCosts.materials ? Object.entries(levelCosts.materials).map(([matId, neededAmount]) => {
                    const hasEnough = (playerInv[matId] || 0) >= neededAmount;
                    return `
                                <div style="display:flex; justify-content:space-between; color:${hasEnough ? '#4ade80' : '#ef4444'}">
                                    <span>💎 Ресурс [${matId}]: ${neededAmount} шт.</span>
                                    <span>(Есть: ${playerInv[matId] || 0})</span>
                                </div>
                            `;
                }).join('') : ''}

                        <button class="btn-upgrade-personal-item" style="margin-top:8px; width:100%; padding:8px; background:#ffcc00; color:#000; border:none; border-radius:3px; font-weight:bold; font-size:11px; cursor:pointer; pointer-events:auto;">
                            ${itemLevel === 0 ? 'ПРОБУДИТЬ АРТЕФАКТ' : 'ПОВЫСИТЬ УРОВЕНЬ'}
                        </button>
                    </div>
                `;
            }
        }

        contentInner = `
            <h4 style="margin:0 0 10px 0; font-size:14px; border-bottom:1px solid #333; padding-bottom:5px;">Артефакт Бога</h4>
            ${pItemProto ? `
                <div style="display:flex; align-items:center; gap:10px; background:rgba(255,255,255,0.02); padding:8px; border-radius:4px; border:1px solid #222; margin-bottom:10px;">
                    <div style="font-size:24px; background:#222; width:42px; height:42px; display:flex; align-items:center; justify-content:center; border-radius:6px; border:1px solid #ffcc00;">
                        ${pItemProto.icon || '🔱'}
                    </div>
                    <div style="display:flex; flex-direction:column;">
                        <b style="color:#fff; font-size:13px;">${locObj(pItemProto.title_loc)}</b>
                        <span style="color:#ffcc00; font-size:10px; font-weight:bold; font-family:monospace;">Уровень пробуждения: +${itemLevel}</span>
                    </div>
                </div>
                
                <!-- Текущие бонусы к характеристикам артефакта -->
                <div style="display:flex; flex-direction:column; gap:4px; font-size:11px; margin-bottom:10px;">
                    <span style="color:#666; font-size:10px; font-weight:bold; margin-bottom:2px;">ТЕКУЩИЕ БОНУСЫ:</span>
                    ${Object.entries(pItemProto.stats_per_level || {}).map(([statId, valPerLvl]) => {
            const currentStatValue = valPerLvl * itemLevel;
            const meta = Game.config.mechanics.stats[statId] || {};
            return `<div style="display:flex; justify-content:space-between; background:rgba(255,255,255,0.01); padding:3px 6px;"><span>${meta.icon || ''} ${t(meta.name_loc_key)}</span><b style="color:#4ade80;">+${currentStatValue}</b></div>`;
        }).join('')}
                </div>
            ` : ''}
            ${actionBlockHTML}
        `;
    }
    else if (Game.activeHeroTab === 'pets') {
        const playerInv = Game.player?.game_data?.inventory || Game.player?.inventory || {};
        let petActionHTML = '';

        if (isCatalogLocked) {
            petActionHTML = `<p style="color:#aaa; font-size:11px; text-align:center;">Заблокировано в режиме каталога.</p>`;
        } else if (!activePet) {
            // Кнопка привязки, если питомца у героя нет
            petActionHTML = `
                <div style="margin-top:auto; text-align:center;">
                    <p style="color:#aaa; font-size:11px; margin-bottom:8px;">У этого бога сейчас нет спутника.</p>
                    <button class="btn-open-pet-selector" style="width:100%; padding:8px; background:#ffcc00; color:#000; border:none; border-radius:3px; font-weight:bold; font-size:11px; cursor:pointer; pointer-events:auto;">
                        💥 ПРИВЯЗАТЬ СПУТНИКА
                    </button>
                </div>
            `;
        } else {
            // Кнопка прокачки уровня, если питомец надет
            const nextPetLvl = activePet.level + 1;
            const levelCost = GameConfig?.mechanics?.pet_level_costs?.[nextPetLvl];

            if (!levelCost) {
                petActionHTML = `<p style="color:#4ade80; font-size:11px; font-weight:bold; text-align:center; margin-top:10px;">✨ Спутник достиг максимальной эволюции!</p>`;
            } else {
                const hasFood = (playerInv["pet_food"] || 0) >= levelCost.food;
                petActionHTML = `
                    <div style="margin-top:auto; background:rgba(0,0,0,0.2); padding:8px; border-radius:4px; border:1px solid #333; font-size:11px; display:flex; flex-direction:column; gap:4px;">
                        <div style="display:flex; justify-content:space-between; color:${hasFood ? '#4ade80' : '#ef4444'}">
                            <span>🍖 Корм (pet_food): ${levelCost.food} шт.</span>
                            <span>(В наличии: ${playerInv["pet_food"] || 0})</span>
                        </div>
                        <button class="btn-feed-pet" style="margin-top:6px; width:100%; padding:6px; background:#4ade80; color:#000; border:none; border-radius:3px; font-weight:bold; font-size:11px; cursor:pointer; pointer-events:auto;">
                            🍖 ПОКОРМИТЬ СПУТНИКА
                        </button>
                    </div>
                `;
            }
        }

        contentInner = `
            <h4 style="margin:0 0 10px 0; font-size:14px; border-bottom:1px solid #333; padding-bottom:5px;">Спутник Божества</h4>
            ${petProto ? `
                <div style="background:rgba(255,255,255,0.02); border:1px solid #333; border-radius:6px; padding:10px; display:flex; flex-direction:column; gap:6px;">
                    <div style="display:flex; align-items:center; gap:8px;">
                        <span style="font-size:28px;">${petProto.icon || '🐾'}</span>
                        <div style="display:flex; flex-direction:column;">
                            <b style="color:#fff; font-size:13px;">${activePet.pet_id.toUpperCase()}</b>
                            <span style="color:#ffcc00; font-size:10px; font-family:monospace;">Текущий уровень: ${activePet.level}</span>
                        </div>
                    </div>
                    <!-- Прибавка к характеристикам от питомца -->
                    <div style="border-top:1px solid #222; padding-top:4px; display:flex; flex-direction:column; gap:3px; font-size:10px; color:#aaa;">
                        <span style="font-weight:bold; color:#666;">БОНУС СЛУГИ:</span>
                        ${Object.entries(petProto.base_stats || {}).map(([sId, baseVal]) => {
            const growth = petProto.stats_growth?.[sId] || 0;
            const totalBonus = baseVal + (growth * activePet.level);
            const m = Game.config.mechanics.stats[sId] || {};
            return `<div style="display:flex; justify-content:space-between;"><span>${m.icon || ''} ${t(m.name_loc_key)}</span><b style="color:#4ade80;">+${totalBonus}</b></div>`;
        }).join('')}
                    </div>
                </div>
            ` : `<p style="color:#666; font-size:12px; text-align:center; padding:15px;">У этого бога пока нет верного зверя-спутника.</p>`}
            ${petActionHTML}
        `;
    }
    else if (Game.activeHeroTab === 'skins') {
        const skinsList = prototype.skins || [];
        const activeSkinId = hero.active_skin || `${hero.hero_id}_skin_default`;

        contentInner = `
            <h4 style="margin:0 0 10px 0; font-size:14px; border-bottom:1px solid #333; padding-bottom:5px;">Гардероб Божества</h4>
            <div style="display:flex; flex-direction:column; gap:8px; height:100%; overflow-y:auto; padding-right:4px;">
                ${skinsList.length === 0 ? `<p style="color:#666; font-size:12px; text-align:center;">У этого бога нет альтернативных обликов.</p>` :
            skinsList.map(skin => {
                const isEquipped = activeSkinId === skin.skin_id;
                return `
                        <div style="display:flex; flex-direction:column; background:#222; border-radius:6px; border:1px solid ${isEquipped ? '#ffcc00' : '#333'}; overflow:hidden; box-sizing:border-box;">
                            <!-- Мини-превью картинки скина -->
                            <div style="width:100%; height:80px; background: url('${skin.image || heroImageSrc}') center top / cover no-repeat; position:relative;">
                                ${isEquipped ? `<span style="position:absolute; top:6px; left:6px; background:#ffcc00; color:#000; font-size:9px; font-weight:bold; padding:2px 6px; border-radius:4px;">НАДЕТО</span>` : ''}
                            </div>
                            <!-- Инфо и кнопка управления -->
                            <div style="padding:8px; display:flex; justify-content:space-between; align-items:center; background:#1a1a1a;">
                                <span style="font-size:12px; font-weight:bold; color:#fff;">${locObj(skin.name_loc)}</span>
                                ${isCatalogLocked || isEquipped ? '' : `
                                    <button class="btn-equip-hero-skin" data-skin-id="${skin.skin_id}" style="padding:4px 8px; background:#ffcc00; color:#000; border:none; border-radius:3px; font-weight:bold; font-size:11px; cursor:pointer; pointer-events:auto;">
                                        ПРИМЕНИТЬ
                                    </button>
                                `}
                            </div>
                        </div>
                    `;
            }).join('')}
            </div>
        `;
    }


    // --- ВКЛАДКА 5: БИОГРАФИЯ ---
    else if (Game.activeHeroTab === 'bio') {
        contentInner = `
            <h4 style="margin:0 0 10px 0; font-size:14px; border-bottom:1px solid #333; padding-bottom:5px;">${t('tab_bio')}</h4>
            <p style="color:#ccc; line-height:1.5; font-size:12px; margin:0;">${locObj(prototype.desc_loc) || t('hero_view_biography')}</p>
        `;
    }

    const blockContentHTML = `
        <div class="view-block-content" style="width:35%; background:rgba(25,25,25,0.85); padding:12px; border-radius:6px; box-sizing:border-box; display:flex; flex-direction:column; border:1px solid #333; height:100%; overflow-y:auto;">
            ${contentInner}
        </div>
    `;

    const blockOrder = viewSettings.view_layout || ['menu', 'avatar', 'content'];
    const blocksMap = { 'menu': blockMenuHTML, 'avatar': blockAvatarHTML, 'content': blockContentHTML };
    const arrangedBlocks = blockOrder.map(blockKey => blocksMap[blockKey] || '').join('');

    return `
      
        <div class="hero-view-inner-container" style="width:100%; height:100%; display:flex; flex-direction:row; gap:12px; box-sizing:border-box;">
            ${arrangedBlocks}
        </div>
    
    `;
}

export function initHeroViewScreen(container, updateUiCallback) {

    const instanceId = Game.activeHeroInstance;
    const listIds = Game.currentListIds;

    const systemBackBtn = container.querySelector('[data-ui-action="go_back"]') || container.querySelector('#btn_back');
    let originalBackAction = null;

    if (systemBackBtn) {
        originalBackAction = systemBackBtn.onclick;
        systemBackBtn.onclick = (e) => {
            e.stopPropagation();
            systemBackBtn.onclick = originalBackAction;
            renderNode.remove();
        };
    }

    const renderNode = document.createElement('div');
    renderNode.className = 'screen-content ui-element';
    renderNode.style.cssText = `${getWindowContentStyle()} display: flex; flex-direction: row; box-sizing: border-box; top: 45px; height: calc(100% - 45px)`;
    renderNode.innerHTML = getHeroViewHTML(instanceId, listIds);

    // container.insertAdjacentHTML('beforeend', getHeroViewHTML(instanceId, listIds));

    const contentContainer = container.querySelector('.screen-content') || container;
    // contentContainer.appendChild(renderNode);
    container.appendChild(renderNode);

    const reRender = (nextId) => {
        renderNode.innerHTML = getHeroViewHTML(nextId, listIds);
        // container.insertAdjacentHTML('beforeend', getHeroViewHTML(instanceId, listIds));
        attachEvents(nextId);
    };

    const attachEvents = (currentId) => {
        // Под-меню табов (ИСПРАВЛЕНО: поддержка опечатки из конфига)
        renderNode.querySelectorAll('.tab-btn').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                Game.activeHeroTab = btn.dataset.tab === 'inventory' ? 'inventory' : btn.dataset.tab;
                reRender(currentId);
            };
        });

        // Навигация по стрелочкам
        renderNode.querySelectorAll('.nav-arrow-btn').forEach(arrow => {
            arrow.onclick = (e) => {
                e.stopPropagation();
                reRender(arrow.dataset.targetId);
            };
        });

        // Снятие предмета
        renderNode.querySelectorAll('.btn-view-unequip').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                const slot = btn.dataset.slot;
                equipHeroItem(currentId, null, slot, () => {
                    // updateUiCallback();
                    reRender(currentId);
                });
            };
        });

        // УЛУЧШЕНО: Выбор подходящих вещей вместо хардкода!
        renderNode.querySelectorAll('.btn-view-equip').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                const slot = btn.dataset.slot;

                // Фильтруем инвентарь игрока, оставляя только те вещи, у которых slot_id совпадает с типом слота
                // const playerInv = Game.player?.game_data?.inventory || Game.player?.inventory || {};
                // const candidateItemIds = Object.keys(playerInv).filter(itemId => {
                //     return Game.config.catalog.items[itemId]?.slot_id === slot;
                // });
                //
                // if (candidateItemIds.length === 0) {
                //     alert(t('inventory_empty') || 'В инвентаре нет подходящих предметов для этого слота!');
                //     return;
                // }

                const playerInv = Game.player?.inventory || {};

                const candidateItemIds = Object.keys(playerInv).filter(itemId => {
                    const itemMeta = Game.config.catalog?.items?.[itemId];
                    if (!itemMeta) return false;

                    // Выводим в консоль для отладки, чтобы увидеть несоответствие полей
                    console.log(`[Equip Debug] Слот героя: ${slot}, Поле шмотки slot_id: ${itemMeta.slot}, type: ${itemMeta.type}`);

                    // Проверяем все возможные варианты нейминга из админки (slot_id или type)
                    const itemSlot = itemMeta.slot || itemMeta.type || '';

                    return itemSlot.toLowerCase() === slot.toLowerCase();
                });

                if (candidateItemIds.length === 0) {
                    console.warn(`[Equip Warning] Для слота ${slot} не найдено шмоток. Содержимое инвентаря игрока:`, playerInv);
                }

                // Рендерим быстрый оверлей выбора шмотки прямо поверх контента
                const selectModal = document.createElement('div');
                selectModal.style.cssText = 'position:absolute; top:0; left:0; width:100%; height:100%; background:rgba(10,10,10,0.95); z-index:30; padding:20px; box-sizing:border-box; display:flex; flex-direction:column; gap:10px; border-radius: inherit;';
                selectModal.innerHTML = `
                    <h3 style="margin:0; font-size:14px; color:#fff; border-bottom:1px solid #333; padding-bottom:6px; display:flex; justify-content:space-between; align-items:center;">
                        <span>Выберите предмет для слота ${slot.toUpperCase()}</span>
                        <button id="close-select-modal" style="background:#ef4444; color:#fff; border:none; padding:4px 8px; border-radius:3px; cursor:pointer; font-size:11px;">❌</button>
                    </h3>
                    <div style="flex:1; overflow-y:auto; display:flex; flex-direction:column; gap:6px;">
                        ${candidateItemIds.map(itemId => {
                    const meta = Game.config.catalog.items[itemId];
                    return `
                                <div class="item-select-row" data-item-id="${itemId}" style="display:flex; justify-content:space-between; align-items:center; background:#222; padding:8px; border-radius:4px; border:1px solid #444; cursor:pointer; font-size:12px;">
                                    <span>${meta.icon} ${locObj(meta.title_loc)} (Осталось: ${playerInv[itemId]})</span>
                                    <b style="color:#ffcc00;">+${Object.values(meta.stats || {})[0] || 0} стат</b>
                                </div>
                            `;
                }).join('')}
                    </div>
                `;
                renderNode.appendChild(selectModal);

                // Бинд кнопки закрытия модалки выбора
                selectModal.querySelector('#close-select-modal').onclick = (ev) => {
                    ev.stopPropagation();
                    selectModal.remove();
                };

                // Бинд клика по строке шмотки
                selectModal.querySelectorAll('.item-select-row').forEach(row => {
                    row.onclick = (ev) => {
                        ev.stopPropagation();
                        const chosenItemId = row.dataset.itemId;
                        selectModal.remove();

                        // Отправляем запрос на экипировку
                        equipHeroItem(currentId, chosenItemId, slot, () => {
                            // updateUiCallback();
                            reRender(currentId);
                        });
                    };
                });
            };
        });

        // События клика по кнопкам прокачки уровня
        renderNode.querySelectorAll('.btn-lvlup-action').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                const levels = parseInt(btn.dataset.levels);
                levelUpHero(currentId, levels, () => {
                    // updateUiCallback();
                    reRender(currentId);
                });
            };
        });

        // Логика кнопки эволюции звезд
        renderNode.querySelectorAll('.btn-trigger-evolution').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();

                const nextStarIdx = (hero.stars || 1) + 1;
                const heroProto = Game.config.catalog?.heroes?.[hero.hero_id];
                const recipe = heroProto?.star_recipes?.[nextStarIdx] || Game.config?.gacha?.rules?.general_star_recipes?.[nextStarIdx];

                if (!recipe) return;

                // Если рецепт НЕ требует корма — сразу шлем пустой массив доноров в запрос
                if (!recipe.fodder_count || recipe.fodder_count <= 0) {
                    upgradeHeroStars(currentId, [], () => {
                        // updateUiCallback();
                        reRender(currentId);
                    });
                    return;
                }

                // --- ЕСЛИ ТРЕБУЕТСЯ КОРМ: ОТКРЫВАЕМ ОКНО ВЫБОРА ДОНОРОВ ---
                const allHeroes = Game.player?.game_data?.heroes || Game.player?.heroes || [];
                // Фильтруем список: убираем самого прокачиваемого героя и подбираем кандидатов (например, по фракции, если заложено правилами)
                const candidateFodders = allHeroes.filter(h => {
                    if (h.instance_id === currentId) return false; // сам себя сожрать не может

                    const fProto = Game.config.catalog?.heroes?.[h.hero_id];
                    if (recipe.fodder_requirements?.same_hero && h.hero_id !== hero.hero_id) return false;
                    if (recipe.fodder_requirements?.faction && fProto?.faction_id !== heroProto?.faction_id) return false;

                    return true;
                });

                if (candidateFodders.length < recipe.fodder_count) {
                    alert(`Недостаточно персонажей для корма! Нужно: ${recipe.fodder_count}, доступно: ${candidateFodders.length}`);
                    return;
                }

                // Массив для хранения выбранных пользователем инстансов-доноров
                let selectedFodderIds = [];

                const fodderModal = document.createElement('div');
                fodderModal.style.cssText = 'position:absolute; top:0; left:0; width:100%; height:100%; background:rgba(10,10,10,0.95); z-index:30; padding:20px; box-sizing:border-box; display:flex; flex-direction:column; gap:10px; border-radius: inherit;';
                fodderModal.innerHTML = `
                    <h3 style="margin:0; font-size:14px; color:#fff; border-bottom:1px solid #333; padding-bottom:6px; display:flex; justify-content:space-between; align-items:center;">
                        <span>Выберите жертвенных богов (${recipe.fodder_count} шт.)</span>
                        <button id="close-fodder-modal" style="background:#ef4444; color:#fff; border:none; padding:4px 8px; border-radius:3px; cursor:pointer; font-size:11px;">❌</button>
                    </h3>
                    <div style="flex:1; overflow-y:auto; display:flex; flex-direction:column; gap:6px;">
                        ${candidateFodders.map(f => {
                    const p = Game.config.catalog.heroes[f.hero_id];
                    return `
                                <div class="fodder-select-row" data-f-id="${f.instance_id}" style="display:flex; justify-content:space-between; align-items:center; background:#222; padding:8px; border-radius:4px; border:1px solid #444; cursor:pointer; font-size:12px; transition: 0.2s;">
                                    <span>${p.icon || '👤'} ${locObj(p.title_loc)} (Lvl ${f.level}, ⭐${f.stars})</span>
                                    <input type="checkbox" class="fodder-check" data-id="${f.instance_id}" style="pointer-events:none;" />
                                </div>
                            `;
                }).join('')}
                    </div>
                    <button id="confirm-evolution-btn" style="width:100%; padding:10px; background:#22c55e; color:#fff; border:none; border-radius:4px; font-weight:bold; cursor:pointer; opacity:0.5;">
                        ПОДТВЕРДИТЬ ЖЕРТВОПРИНОШЕНИЕ (0/${recipe.fodder_count})
                    </button>
                `;
                renderNode.appendChild(fodderModal);

                // Закрытие модалки
                fodderModal.querySelector('#close-fodder-modal').onclick = (ev) => {
                    ev.stopPropagation();
                    fodderModal.remove();
                };

                const confirmBtn = fodderModal.querySelector('#confirm-evolution-btn');

                // Клик по строке персонажа-корма
                fodderModal.querySelectorAll('.fodder-select-row').forEach(row => {
                    row.onclick = (ev) => {
                        ev.stopPropagation();
                        const fId = row.dataset.fId;
                        const checkbox = row.querySelector('.fodder-check');

                        if (selectedFodderIds.includes(fId)) {
                            // Убираем выделение
                            selectedFodderIds = selectedFodderIds.filter(id => id !== fId);
                            checkbox.checked = false;
                            row.style.borderColor = '#444';
                            row.style.background = '#222';
                        } else {
                            // Проверяем лимит выбора по рецепту
                            if (selectedFodderIds.length >= recipe.fodder_count) return;

                            selectedFodderIds.push(fId);
                            checkbox.checked = true;
                            row.style.borderColor = '#ffcc00';
                            row.style.background = 'rgba(255,204,0,0.03)';
                        }

                        // Обновляем состояние кнопки подтверждения
                        confirmBtn.innerText = `ПОДТВЕРДИТЬ ЖЕРТВОПРИНОШЕНИЕ (${selectedFodderIds.length}/${recipe.fodder_count})`;
                        if (selectedFodderIds.length === recipe.fodder_count) {
                            confirmBtn.style.opacity = '1';
                        } else {
                            confirmBtn.style.opacity = '0.5';
                        }
                    };
                });

                // Клик по кнопке отправки запроса
                confirmBtn.onclick = (ev) => {
                    ev.stopPropagation();
                    if (selectedFodderIds.length !== recipe.fodder_count) return;

                    fodderModal.remove();
                    upgradeHeroStars(currentId, selectedFodderIds, () => {
                        // updateUiCallback();
                        reRender(currentId);
                    });
                };
            };
        });

        renderNode.querySelectorAll('.btn-upgrade-personal-item').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                upgradePersonalItem(currentId, () => {
                    // updateUiCallback();
                    reRender(currentId);
                });
            };
        });

        // Логика кнопки применения скина обликов
        renderNode.querySelectorAll('.btn-equip-hero-skin').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                const skinId = btn.dataset.skinId;
                changeHeroSkin(currentId, skinId, () => {
                    // updateUiCallback();
                    reRender(currentId);
                });
            };
        });

        // Логика прокачки (кормления) питомца
        renderNode.querySelectorAll('.btn-feed-pet').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                manageHeroPet(currentId, null, true, () => {
                    // updateUiCallback();
                    reRender(currentId);
                });
            };
        });

        // Открытие селектора питомцев для привязки к богу
        renderNode.querySelectorAll('.btn-open-pet-selector').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();

                // Фильтруем инвентарь игрока в поисках карт питомцев
                const playerInv = Game.player?.game_data?.inventory || Game.player?.inventory || {};
                const availablePets = Object.keys(playerInv).filter(id => {
                    return Game.config.catalog?.pets?.[id] !== undefined;
                });

                if (availablePets.length === 0) {
                    alert('В вашем инвентаре нет доступных существ для привязки!');
                    return;
                }

                // Модалка выбора питомца
                const petModal = document.createElement('div');
                petModal.style.cssText = 'position:absolute; top:0; left:0; width:100%; height:100%; background:rgba(10,10,10,0.95); z-index:30; padding:20px; box-sizing:border-box; display:flex; flex-direction:column; gap:10px; border-radius: inherit;';
                petModal.innerHTML = `
                    <h3 style="margin:0; font-size:14px; color:#fff; border-bottom:1px solid #333; padding-bottom:6px; display:flex; justify-content:space-between; align-items:center;">
                        <span>Выберите спутника для привязки</span>
                        <button id="close-pet-modal" style="background:#ef4444; color:#fff; border:none; padding:4px 8px; border-radius:3px; cursor:pointer; font-size:11px;">❌</button>
                    </h3>
                    <div style="flex:1; overflow-y:auto; display:flex; flex-direction:column; gap:6px;">
                        ${availablePets.map(pId => {
                    const meta = Game.config.catalog.pets[pId];
                    return `
                                <div class="pet-select-row" data-pet-id="${pId}" style="display:flex; justify-content:space-between; align-items:center; background:#222; padding:8px; border-radius:4px; border:1px solid #444; cursor:pointer; font-size:12px;">
                                    <span>${meta.icon || '🐾'} ${pId.toUpperCase()} (Доступно карт: ${playerInv[pId]})</span>
                                    <b style="color:#ffcc00;">Привязать</b>
                                </div>
                            `;
                }).join('')}
                    </div>
                `;
                renderNode.appendChild(petModal);

                petModal.querySelector('#close-pet-modal').onclick = (ev) => {
                    ev.stopPropagation();
                    petModal.remove();
                };

                petModal.querySelectorAll('.pet-select-row').forEach(row => {
                    row.onclick = (ev) => {
                        ev.stopPropagation();
                        const chosenPetId = row.dataset.petId;
                        petModal.remove();

                        manageHeroPet(currentId, chosenPetId, false, () => {
                            // updateUiCallback();
                            reRender(currentId);
                        });
                    };
                });
            };
        });

    };

    attachEvents(instanceId);
}




// heroView.js
import { t, locObj, getHeroRating, getWindowContentStyle } from './shared.js';

export async function equipHeroItem(heroInstanceId, itemId, Game, updateUiCallback) {
    try {
        const res = await fetch(`${API_URL}/inventory/equip`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                game_id: Game.gameId,
                server_id: Game.serverId,
                device_id: Game.deviceId,
                hero_instance_id: heroInstanceId,
                item_id: itemId
            })
        });
        const data = await res.json();
        if (!res.ok || data.error) throw new Error(data.error || 'Equip error');

        Game.player = data.player_state;
        updateUiCallback();
        alert(t('alert_equip_success', Game));
    } catch (err) {
        alert(t(err.message, Game));
    }
}

// Локальный стейт выбранной вкладки внутри окна осмотра
let CurrentTab = 'stats'; // 'stats' | 'inventory' | 'bio'

function getLoc(key, Game) {
    const lang = Game.locale || 'ru';
    return Game.config?.localization?.ui?.[lang]?.[key] || key;
}

export function getHeroViewHTML(instanceId, listIds, Game) {
    let isCatalogLocked = instanceId.startsWith('catalog_');
    let hero = null;
    let prototype = null;

    if (isCatalogLocked) {
        const heroId = instanceId.replace('catalog_', '');
        prototype = Game.config.catalog.heroes[heroId];
        // В каталоге показываем потенциал Бога на 100 уровне с 5 звездами
        hero = { hero_id: heroId, level: 100, stars: 5, equipped: {} };
    } else {
        hero = Game.player.heroes.find(h => h.instance_id === instanceId);
        prototype = Game.config.catalog.heroes[hero?.hero_id];
    }

    if (!prototype) return '';

    // Вычисляем соседей для переключения по стрелочкам
    const currentIndex = listIds.indexOf(instanceId);
    const prevInstanceId = currentIndex > 0 ? listIds[currentIndex - 1] : null;
    const nextInstanceId = currentIndex < listIds.length - 1 ? listIds[currentIndex + 1] : null;

    // --- СБОРКА ТРЕХ СТРУКТУРНЫХ БЛОКОВ UI ---

    // Получаем настройки экрана из ui.landscape
    const orientation = Game.config.orientation || 'landscape';
    const viewSettings = Game.config?.ui?.[orientation]?.find(w => w.id === 'screen_hero_view') || {};

    // 3. ИСПРАВЛЕНО: Табы меню теперь полностью берутся из твоего конфига!
    const configuredTabs = viewSettings.menu_tabs || ['stats', 'inventory', 'bio'];

    // Если текущий выбранный таб почему-то не входит в конфиг (например, автор его удалил), сбрасываем на первый доступный
    if (!configuredTabs.includes(CurrentTab)) {
        CurrentTab = configuredTabs[0] || 'stats';
    }

    // Рендерим блок меню строго на основе переданного массива menu_tabs
    const blockMenuHTML = `
        <div class="view-block-menu" style="display:flex; flex-direction:column; gap:8px; background:rgba(0,0,0,0.4); padding:10px; border-radius:6px; flex-shrink:0;">
            ${configuredTabs.map(tabKey => {
        const isActive = CurrentTab === tabKey;
        // Ищем локализацию по ключу "tab_stats", "tab_inventrory" и т.д.
        return `
                    <button class="tab-btn" data-tab="${tabKey}" style="padding:10px; background:${isActive ? '#ffcc00' : '#222'}; color:${isActive ? '#000' : '#fff'}; border:none; border-radius:4px; font-weight:bold; cursor:pointer; font-size:12px;">
                        ${t(`tab_${tabKey}`, Game)}
                    </button>
                `;
    }).join('')}
        </div>
    `;

    // Блок Аватар (Большой полноростовой арт и стрелочки навигации)
    let heroImageSrc = prototype.image || 'https://picsum.photos';
    const blockAvatarHTML = `
        <div class="view-block-avatar" style="flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; position:relative; background: url('${heroImageSrc}') center center / contain no-repeat; height:100%;">
            ${prevInstanceId ? `<button class="nav-arrow-btn" data-target-id="${prevInstanceId}" style="position:absolute; left:5px; top:50%; transform:translateY(-50%); font-size:24px; background:rgba(0,0,0,0.7); color:#fff; border:1px solid #444; border-radius:4px; cursor:pointer; padding:8px 12px; z-index:10; pointer-events:auto;">◀</button>` : ''}
            
            <div style="position:absolute; bottom:10px; background:rgba(15,15,15,0.85); padding:8px 16px; border-radius:4px; text-align:center; border:1px solid #333; min-width:150px;">
                <h3 style="margin:0 0 2px 0; color:#fff; font-size:16px;">${locObj(prototype.title_loc, Game)}</h3>
                <span style="color:#ffcc00; font-weight:bold; font-size:13px; font-family:monospace;">⚔️ ${Math.floor(getHeroRating(hero, Game))}</span>
            </div>

            ${nextInstanceId ? `<button class="nav-arrow-btn" data-target-id="${nextInstanceId}" style="position:absolute; right:5px; top:50%; transform:translateY(-50%); font-size:24px; background:rgba(0,0,0,0.7); color:#fff; border:1px solid #444; border-radius:4px; cursor:pointer; padding:8px 12px; z-index:10; pointer-events:auto;">▶</button>` : ''}
        </div>
    `;

    // Блок Контент (Детализация текущего таба — ИСПРАВЛЕНЫ УСЛОВИЯ И КОНТЕНТ)
    let contentInner = '';

    if (CurrentTab === 'stats') {
        contentInner = `
            <h4 style="margin:0 0 10px 0; font-size:14px; border-bottom:1px solid #333; padding-bottom:5px;">${t('tab_stats', Game)} (Lvl ${hero.level})</h4>
            <div style="display:flex; flex-direction:column; gap:6px; font-size:12px; font-family:sans-serif;">
                ${Object.entries(Game.config.mechanics.stats || {}).map(([statId, meta]) => {
            const base = prototype.base_stats?.[statId] || 0;
            const growth = prototype.stats_growth?.[statId] || 0;
            let val = base + (growth * hero.level);

            const wep = hero.equipped?.weapon;
            if (wep && Game.config.catalog.items[wep]?.stats?.[statId]) {
                val += Game.config.catalog.items[wep].stats[statId];
            }
            return `<div style="display:flex; justify-content:space-between; background:rgba(255,255,255,0.03); padding:4px 6px; border-radius:2px;"><span>${meta.icon} ${t(meta.name_loc_key, Game)}</span><b style="color:#fff;">${val}</b></div>`;
        }).join('')}
            </div>
        `;
    }
    else if (CurrentTab === 'inventrory') { // Учитываем твою опечатку 'inventrory' из конфига для точного маппинга
        contentInner = `
            <h4 style="margin:0 0 10px 0; font-size:14px; border-bottom:1px solid #333; padding-bottom:5px;">${t('tab_inventrory', Game)}</h4>
            ${isCatalogLocked ? `<p style="color:#aaa; font-size:12px;">${t('hero_view_locked', Game)}</p>` : `
                <div style="display:flex; flex-direction:column; gap:8px;">
                    ${(prototype.inventory_slots || Game.config.mechanics.inventory_slots).map(slot => {
            const equippedItemId = hero.equipped?.[slot];
            const itemMeta = Game.config.catalog.items[equippedItemId];

            return `
                            <div style="display:flex; align-items:center; justify-content:space-between; background:#222; padding:6px 10px; border-radius:4px; border:1px solid #333; box-sizing:border-box;">
                                <div style="font-size:12px;">
                                    <span style="color:#aaa; font-size:10px;">${slot.toUpperCase()}:</span>
                                    <b style="margin-left:6px; color:#fff;">${itemMeta ? `${itemMeta.icon} ${locObj(itemMeta.title_loc, Game)}` : t('heroes_slot_empty', Game)}</b>
                                </div>
                                <button class="btn-view-equip" data-hero-id="${instanceId}" data-slot="${slot}" style="padding:4px 8px; background:#ffcc00; color:#000; border:none; border-radius:3px; font-weight:bold; font-size:11px; cursor:pointer; pointer-events:auto;">
                                    ${t('heroes_equip_btn', Game)}
                                </button>
                            </div>
                        `;
        }).join('')}
                </div>
            `}
        `;
    }
    else if (CurrentTab === 'bonds') {
        let bondsListHTML = '';

        if (prototype.bonds && prototype.bonds.length > 0) {
            prototype.bonds.forEach(bond => {
                // Проверяем, разблокирована ли синергия (есть ли целевой Бог у игрока на аккаунте)
                const isBondActive = Game.player.heroes?.some(h => h.hero_id === bond.target_hero_id);
                const targetProto = Game.config.catalog?.heroes?.[bond.target_hero_id];

                const statMeta = Game.config?.mechanics?.stats?.[bond.bonus_stat_id];
                const statSign = statMeta?.icon || '🔺';

                // Настраиваем визуал: активные узы светятся золотом, закрытые — тусклые серые
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
                        <span>${t(statMeta?.name_loc_key, Game)} +${bond.bonus_value}%</span>
                    </div>
                </div>
            `;
            });
        }

        contentInner = `
        <h4 style="margin:0 0 10px 0; font-size:14px; border-bottom:1px solid #333; padding-bottom:5px;">${t('tab_bonds', Game)}</h4>
        <div style="display: flex; flex-direction: column; width: 100%; height: 100%;">
            ${bondsListHTML || `<div style="color: #666; text-align: center; padding: 20px; font-size: 12px;">У этого персонажа нет древних уз синергии...</div>`}
        </div>
    `;
    }
    else if (CurrentTab === 'stars') {
        const starsHtml = "⭐".repeat(hero.stars || 1);
        contentInner = `
            <h4 style="margin:0 0 10px 0; font-size:14px; border-bottom:1px solid #333; padding-bottom:5px;">${t('tab_stars', Game)}</h4>
            <div style="text-align:center; padding:15px; font-size:24px;">${starsHtml}</div>
            <p style="color:#aaa; font-size:12px; text-align:center;">${t('stars_upgrade_desc', Game) || 'Система возвышения звезд'}</p>
        `;
    }
    else if (CurrentTab === 'bio') {
        contentInner = `
            <h4 style="margin:0 0 10px 0; font-size:14px; border-bottom:1px solid #333; padding-bottom:5px;">${t('tab_bio', Game)}</h4>
            <p style="color:#ccc; line-height:1.5; font-size:12px; margin:0;">${locObj(prototype.desc_loc, Game) || t('hero_view_biography', Game)}</p>
        `;
    }

    const blockContentHTML = `
        <div class="view-block-content" style="width:35%; background:rgba(25,25,25,0.85); padding:12px; border-radius:6px; box-sizing:border-box; display:flex; flex-direction:column; border:1px solid #333; height:100%; overflow-y:auto;">
            ${contentInner}
        </div>
    `;

    // Порядок расположения самих блоков
    const blockOrder = viewSettings.view_layout || ['menu', 'avatar', 'content'];

    const blocksMap = {
        'menu': blockMenuHTML,
        'avatar': blockAvatarHTML,
        'content': blockContentHTML
    };

    const arrangedBlocks = blockOrder.map(blockKey => blocksMap[blockKey] || '').join('');

    return `
        <div class="hero-view-inner-container" style="width:100%; height:100%; display:flex; flex-direction:row; gap:12px; box-sizing:border-box;">
            ${arrangedBlocks}
        </div>
    `;
}


export function initHeroViewScreen(container, instanceId, listIds, Game, updateUiCallback) {
    // 2. КНОПКА ЗАКРЫТЬ: Находим системную кнопку Назад на экране
    const systemBackBtn = container.querySelector('[data-ui-action="go_back"]') || container.querySelector('#btn_back');
    let originalBackAction = null;

    // Перехватываем клик системной кнопки, чтобы она закрывала только наше HeroView под-окно
    if (systemBackBtn) {
        originalBackAction = systemBackBtn.onclick;
        systemBackBtn.onclick = (e) => {
            e.stopPropagation();
            // Возвращаем системной кнопке её первоначальный экшен
            systemBackBtn.onclick = originalBackAction;
            // Удаляем обертку нашего экрана осмотра
            renderNode.remove();
        };
    }

    // Создаем внутренний узел, который встает ровно внутрь границ окна контента, сохраняя бордеры и ресурсы
    const renderNode = document.createElement('div');
    renderNode.className = 'hero-view-overlay-wrapper';
    renderNode.style.cssText = 'position:absolute; top:0; left:0; width:100%; height:100%; z-index:20; background:#151515; box-sizing:border-box; padding:10px; border-radius:inherit;';
    renderNode.innerHTML = getHeroViewHTML(instanceId, listIds, Game);

    // Находим контейнер контента внутри окна heroList, чтобы встать под ресурсы
    const contentContainer = container.querySelector('.screen-content') || container;
    contentContainer.appendChild(renderNode);

    const reRender = (nextId) => {
        renderNode.innerHTML = getHeroViewHTML(nextId, listIds, Game);
        attachEvents(nextId);
    };

    const attachEvents = (currentId) => {
        // Табы под-меню
        renderNode.querySelectorAll('.tab-btn').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                CurrentTab = btn.dataset.tab;
                reRender(currentId);
            };
        });

        // Стрелочки переключения Богов
        renderNode.querySelectorAll('.nav-arrow-btn').forEach(arrow => {
            arrow.onclick = (e) => {
                e.stopPropagation();
                reRender(arrow.dataset.targetId);
            };
        });

        // Логика быстрой экипировки
        renderNode.querySelectorAll('.btn-view-equip').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                const inventory = Game.player.inventory || {};
                const bestWeapon = inventory["zeus_staff"] > 0 ? "zeus_staff" : (inventory["rusty_sword"] > 0 ? "rusty_sword" : null);

                if (!bestWeapon) {
                    alert(t('inventory_empty', Game));
                    return;
                }
                equipHeroItem(currentId, bestWeapon, Game, () => {
                    updateUiCallback();
                    reRender(currentId);
                });
            };
        });
    };

    attachEvents(instanceId);
}


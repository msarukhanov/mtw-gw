function cascadeRenameKey(type, oldKey, newKey) {
    if (!oldKey || !newKey || oldKey === newKey) return;

    // --- КАСКАДНОЕ ПЕРЕИМЕНОВАНИЕ ДЛЯ ПЕРСОНАЖЕЙ (HERO) ---
    if (type === 'hero') {
        // 1. Обновляем узы/связи (Bonds) у ВСЕХ остальных персонажей игры
        Object.keys(target.catalog?.heroes || {}).forEach(hk => {
            const hero = target.catalog.heroes[hk];
            if (hero.bonds) {
                hero.bonds.forEach(bond => {
                    if (bond.target_hero_id === oldKey) {
                        bond.target_hero_id = newKey;
                    }
                });
            }
        });

        // 2. Обновляем Гачу (Gacha Drop Pools)
        if (target.gacha && target.gacha.pools) {
            Object.keys(target.gacha.pools).forEach(poolKey => {
                const pool = target.gacha.pools[poolKey];
                if (pool.heroes) {
                    Object.keys(pool.heroes).forEach(rarity => {
                        if (Array.isArray(pool.heroes[rarity])) {
                            target.gacha.pools[poolKey].heroes[rarity] = pool.heroes[rarity].map(h => h === oldKey ? newKey : h);
                        }
                    });
                }
                if (pool.rate_up && pool.rate_up[oldKey] !== undefined) {
                    pool.rate_up[newKey] = pool.rate_up[oldKey];
                    delete pool.rate_up[oldKey];
                }
            });
        }

        // 3. Обновляем PVE Кампанию
        if (target.pve_campaign && target.pve_campaign.stages) {
            Object.keys(target.pve_campaign.stages).forEach(stageKey => {
                const stage = target.pve_campaign.stages[stageKey];
                if (Array.isArray(stage.enemies)) {
                    stage.enemies.forEach(enemy => {
                        if (enemy.hero_id === oldKey) {
                            enemy.hero_id = newKey;
                        }
                    });
                }
            });
        }

        // 4. Обновляем PVE Башни
        if (target.pve_towers) {
            Object.keys(target.pve_towers).forEach(towerKey => {
                const tower = target.pve_towers[towerKey];
                if (tower.floors) {
                    Object.keys(tower.floors).forEach(floorKey => {
                        const floor = tower.floors[floorKey];
                        if (Array.isArray(floor.enemies)) {
                            floor.enemies.forEach(enemy => {
                                if (enemy.hero_id === oldKey) {
                                    enemy.hero_id = newKey;
                                }
                            });
                        }
                    });
                }
            });
        }

        // 5. Обновляем PVE Боссов
        if (target.pve_bosses) {
            Object.keys(target.pve_bosses).forEach(bossKey => {
                if (target.pve_bosses[bossKey].hero_id === oldKey) {
                    target.pve_bosses[bossKey].hero_id = newKey;
                }
            });
        }

        // 6. Обновляем список банов на Арене
        if (target.pvp_arena && target.pvp_arena.season_buffs && Array.isArray(target.pvp_arena.season_buffs.banned_heroes)) {
            target.pvp_arena.season_buffs.banned_heroes = target.pvp_arena.season_buffs.banned_heroes.map(h => h === oldKey ? newKey : h);
        }

        // 7. НОВОЕ: Обновляем привязку к скинам героев в наградных матрицах Баттл-Пассов
        if (target.battle_passes) {
            Object.keys(target.battle_passes).forEach(bpKey => {
                const bp = target.battle_passes[bpKey];
                if (Array.isArray(bp.levels_matrix)) {
                    bp.levels_matrix.forEach(row => {
                        if (row.premium_rewards && Array.isArray(row.premium_rewards.skins)) {
                            row.premium_rewards.skins.forEach(s => { if (s.hero_id === oldKey) s.hero_id = newKey; });
                        }
                        if (row.free_rewards && Array.isArray(row.free_rewards.skins)) {
                            row.free_rewards.skins.forEach(s => { if (s.hero_id === oldKey) s.hero_id = newKey; });
                        }
                    });
                }
            });
        }
    }

    // --- КАСКАДНОЕ ПЕРЕИМЕНОВАНИЕ ДЛЯ ПРЕДМЕТОВ (ITEM) ---
    else if (type === 'item') {
        // 1. Обновляем привязку к сигнатурному оружию у героев
        Object.keys(target.catalog?.heroes || {}).forEach(hk => {
            if (target.catalog.heroes[hk].personal_item_id === oldKey) {
                target.catalog.heroes[hk].personal_item_id = newKey;
            }
        });

        // 2. Обновляем таблицы дропа сундуков у других предметов
        Object.keys(target.catalog?.items || {}).forEach(iKey => {
            const item = target.catalog.items[iKey];
            if (item.drop_table) {
                item.drop_table.forEach(drop => {
                    if (drop.type === 'item' && drop.id === oldKey) {
                        drop.id = newKey;
                    }
                });
            }
        });

        // 3. Обновляем витрины статичных магазинов
        if (target.catalog?.shops) {
            Object.keys(target.catalog.shops).forEach(shopKey => {
                const shop = target.catalog.shops[shopKey];
                if (shop.slots) {
                    shop.slots.forEach(slot => {
                        if (slot.is_random === false && slot.itemId === oldKey) {
                            slot.itemId = newKey;
                        }
                    });
                }
            });
        }

        // 4. Обновляем случайные пулы магазинов
        if (target.catalog?.shop_pools) {
            Object.keys(target.catalog.shop_pools).forEach(poolKey => {
                target.catalog.shop_pools[poolKey].forEach(item => {
                    if (item.item_type === 'item' && item.itemId === oldKey) {
                        item.itemId = newKey;
                    }
                });
            });
        }

        // 5. Обновляем рецепты крафта
        if (target.catalog?.recipes) {
            Object.keys(target.catalog.recipes).forEach(recKey => {
                const recipe = target.catalog.recipes[recKey];
                if (recipe.result && recipe.result.itemId === oldKey) {
                    recipe.result.itemId = newKey;
                }
                if (recipe.ingredients && recipe.ingredients[oldKey] !== undefined) {
                    recipe.ingredients[newKey] = recipe.ingredients[oldKey];
                    delete recipe.ingredients[oldKey];
                }
            });
        }

        // 6. Обновляем награды этапов кампании
        if (target.pve_campaign && target.pve_campaign.stages) {
            Object.keys(target.pve_campaign.stages).forEach(stageKey => {
                const stage = target.pve_campaign.stages[stageKey];
                if (stage.rewards && Array.isArray(stage.rewards.items)) {
                    stage.rewards.items.forEach(rew => { if (rew.itemId === oldKey) rew.itemId = newKey; });
                }
            });
        }

        // 7. Обновляем награды этажей башен
        if (target.pve_towers) {
            Object.keys(target.pve_towers).forEach(towerKey => {
                const tower = target.pve_towers[towerKey];
                if (tower.floors) {
                    Object.keys(tower.floors).forEach(floorKey => {
                        const floor = tower.floors[floorKey];
                        if (floor.rewards && Array.isArray(floor.rewards.items)) {
                            floor.rewards.items.forEach(rew => { if (rew.itemId === oldKey) rew.itemId = newKey; });
                        }
                    });
                }
            });
        }

        // 8. Обновляем Магазин Арены
        if (target.pvp_arena && target.pvp_arena.shop && Array.isArray(target.pvp_arena.shop.slots)) {
            target.pvp_arena.shop.slots.forEach(slot => { if (slot.itemId === oldKey) slot.itemId = newKey; });
        }

        // 9. НОВОЕ: Обновляем Магазин Гильдии
        if (target.social && target.social.guild_system && target.social.guild_system.shop && Array.isArray(target.social.guild_system.shop.slots)) {
            target.social.guild_system.shop.slots.forEach(slot => { if (slot.itemId === oldKey) slot.itemId = newKey; });
        }

        // 10. НОВОЕ: Обновляем Квесты (Предметы в наградах тасок Daily & Weekly)
        if (target.quests) {
            ['daily', 'weekly'].forEach(qType => {
                const pool = target.quests[qType]?.task_pool || {};
                Object.keys(pool).forEach(tKey => {
                    if (pool[tKey].rewards && Array.isArray(pool[tKey].rewards.items)) {
                        pool[tKey].rewards.items.forEach(rew => { if (rew.itemId === oldKey) rew.itemId = newKey; });
                    }
                });
                const milestones = target.quests[qType]?.milestones || [];
                milestones.forEach(m => {
                    if (m.rewards && Array.isArray(m.rewards.items)) {
                        m.rewards.items.forEach(rew => { if (rew.itemId === oldKey) rew.itemId = newKey; });
                    }
                });
            });
        }

        // 11. НОВОЕ: Обновляем привязку валюты опыта и наград предметов в Баттл-Пассах
        if (target.battle_passes) {
            Object.keys(target.battle_passes).forEach(bpKey => {
                const bp = target.battle_passes[bpKey];
                if (bp.points_item_id === oldKey) bp.points_item_id = newKey;
                if (Array.isArray(bp.levels_matrix)) {
                    bp.levels_matrix.forEach(row => {
                        if (row.free_rewards && Array.isArray(row.free_rewards.items)) {
                            row.free_rewards.items.forEach(rew => { if (rew.itemId === oldKey) rew.itemId = newKey; });
                        }
                        if (row.premium_rewards && Array.isArray(row.premium_rewards.items)) {
                            row.premium_rewards.items.forEach(rew => { if (rew.itemId === oldKey) rew.itemId = newKey; });
                        }
                    });
                }
            });
        }

        // 12. НОВОЕ: Обновляем награды предметов в шаблонах Доски Экспедиций (bounty_board)
        if (target.bounty_board && target.bounty_board.mission_pool) {
            Object.keys(target.bounty_board.mission_pool).forEach(mKey => {
                const mission = target.bounty_board.mission_pool[mKey];
                if (mission.rewards && Array.isArray(mission.rewards.items)) {
                    mission.rewards.items.forEach(rew => { if (rew.itemId === oldKey) rew.itemId = newKey; });
                }
            });
        }

        // 13. НОВОЕ: Вычищаем удаленные предметы из наград временных акций (limited_offers)
        if (target.limited_offers && target.limited_offers.offers_pool) {
            Object.keys(target.limited_offers.offers_pool).forEach(oKey => {
                const offer = target.limited_offers.offers_pool[oKey];

                // Проверяем стоимость оффера (если он стоил этого предмета)
                if (offer.cost && offer.cost.resource === key) {
                    offer.cost.amount = 0; // Делаем бесплатным, чтобы не ломать логику покупки
                    offer.cost.resource = "gold";
                }
                if (offer.old_cost && offer.old_cost.resource === key) {
                    delete offer.old_cost;
                }

                // Вычищаем предмет из массива наград внутри акции
                if (offer.rewards && Array.isArray(offer.rewards.items)) {
                    offer.rewards.items = offer.rewards.items.filter(rew => rew.itemId !== key);
                }
            });
        }
    }

    else if (type === 'ui_screen') {
        if (target.limited_offers && target.limited_offers.offers_pool) {
            Object.keys(target.limited_offers.offers_pool).forEach(oKey => {
                const offer = target.limited_offers.offers_pool[oKey];
                if (offer.linked_ui_screen_id === oldKey) {
                    offer.linked_ui_screen_id = newKey;
                }
            });
        }
    }
}

function cascadeDeleteKey(type, key) {
    if (!key) return;

    // --- КАСКАД ДЛЯ ПЕРСОНАЖЕЙ (HERO) ---
    if (type === 'hero') {
        // 1. Чистим связи (Bonds) у ВСЕХ остальных героев каталога
        Object.keys(target.catalog?.heroes || {}).forEach(hk => {
            const hero = target.catalog.heroes[hk];
            if (hero.bonds) {
                target.catalog.heroes[hk].bonds = hero.bonds.filter(bond => bond.target_hero_id !== key);
            }
        });

        // 2. Чистим Гачу (Gacha Drop Pools)
        if (target.gacha && target.gacha.pools) {
            Object.keys(target.gacha.pools).forEach(poolKey => {
                const pool = target.gacha.pools[poolKey];
                if (pool.heroes) {
                    Object.keys(pool.heroes).forEach(rarity => {
                        if (Array.isArray(pool.heroes[rarity])) {
                            target.gacha.pools[poolKey].heroes[rarity] = pool.heroes[rarity].filter(h => h !== key);
                        }
                    });
                }
                if (pool.rate_up && pool.rate_up[key] !== undefined) {
                    delete target.gacha.pools[poolKey].rate_up[key];
                }
            });
        }

        // 3. Чистим PVE Кампанию
        if (target.pve_campaign && target.pve_campaign.stages) {
            Object.keys(target.pve_campaign.stages).forEach(stageKey => {
                const stage = target.pve_campaign.stages[stageKey];
                if (Array.isArray(stage.enemies)) {
                    target.pve_campaign.stages[stageKey].enemies = stage.enemies.filter(enemy => enemy.hero_id !== key);
                }
            });
        }

        // 4. Чистим PVE Башни
        if (target.pve_towers) {
            Object.keys(target.pve_towers).forEach(towerKey => {
                const tower = target.pve_towers[towerKey];
                if (tower.floors) {
                    Object.keys(tower.floors).forEach(floorKey => {
                        const floor = tower.floors[floorKey];
                        if (Array.isArray(floor.enemies)) {
                            target.pve_towers[towerKey].floors[floorKey].enemies = floor.enemies.filter(enemy => enemy.hero_id !== key);
                        }
                    });
                }
            });
        }

        // 5. Чистим PVE Боссов
        if (target.pve_bosses) {
            Object.keys(target.pve_bosses).forEach(bossKey => {
                if (target.pve_bosses[bossKey].hero_id === key) {
                    target.pve_bosses[bossKey].hero_id = "";
                }
            });
        }

        // 6. Чистим Арену (Список сезонных банов)
        if (target.pvp_arena && target.pvp_arena.season_buffs && Array.isArray(target.pvp_arena.season_buffs.banned_heroes)) {
            target.pvp_arena.season_buffs.banned_heroes = target.pvp_arena.season_buffs.banned_heroes.filter(h => h !== key);
        }

        // 7. НОВОЕ: Чистим наградные скины в Боевых Пропусках (Levels Matrix)
        if (target.battle_passes) {
            Object.keys(target.battle_passes).forEach(bpKey => {
                const bp = target.battle_passes[bpKey];
                if (Array.isArray(bp.levels_matrix)) {
                    bp.levels_matrix.forEach(row => {
                        if (row.premium_rewards && Array.isArray(row.premium_rewards.skins)) {
                            row.premium_rewards.skins = row.premium_rewards.skins.filter(s => s.hero_id !== key);
                        }
                        if (row.free_rewards && Array.isArray(row.free_rewards.skins)) {
                            row.free_rewards.skins = row.free_rewards.skins.filter(s => s.hero_id !== key);
                        }
                    });
                }
            });
        }
    }

    // --- КАСКАД ДЛЯ ПРЕДМЕТОВ (ITEM) ---
    else if (type === 'item') {
        // 1. Удаляем привязку к сигнатурному оружию у героев
        Object.keys(target.catalog?.heroes || {}).forEach(hk => {
            if (target.catalog.heroes[hk].personal_item_id === key) {
                target.catalog.heroes[hk].personal_item_id = "";
            }
        });

        // 2. Чистим сундуки (Drop Tables)
        Object.keys(target.catalog?.items || {}).forEach(iKey => {
            const item = target.catalog.items[iKey];
            if (item.drop_table) {
                target.catalog.items[iKey].drop_table = item.drop_table.filter(drop => !(drop.type === 'item' && drop.id === key));
            }
        });

        // 3. Чистим слоты статичных магазинов
        if (target.catalog?.shops) {
            Object.keys(target.catalog.shops).forEach(shopKey => {
                const shop = target.catalog.shops[shopKey];
                if (shop.slots) {
                    target.catalog.shops[shopKey].slots = shop.slots.filter(slot => !(slot.is_random === false && slot.itemId === key));
                }
            });
        }

        // 4. Чистим случайные пулы магазинов
        if (target.catalog?.shop_pools) {
            Object.keys(target.catalog.shop_pools).forEach(poolKey => {
                target.catalog.shop_pools[poolKey] = target.catalog.shop_pools[poolKey].filter(item => !(item.item_type === 'item' && item.itemId === key));
            });
        }

        // 5. Чистим рецепты крафта
        if (target.catalog?.recipes) {
            Object.keys(target.catalog.recipes).forEach(recKey => {
                const recipe = target.catalog.recipes[recKey];
                if (recipe.result && recipe.result.itemId === key) {
                    delete target.catalog.recipes[recKey];
                }
                else if (recipe.ingredients && recipe.ingredients[key] !== undefined) {
                    delete target.catalog.recipes[recKey].ingredients[key];
                }
            });
        }

        // 6. Чистим награды этапов кампании
        if (target.pve_campaign && target.pve_campaign.stages) {
            Object.keys(target.pve_campaign.stages).forEach(stageKey => {
                const stage = target.pve_campaign.stages[stageKey];
                if (stage.rewards && Array.isArray(stage.rewards.items)) {
                    target.pve_campaign.stages[stageKey].rewards.items = stage.rewards.items.filter(rew => rew.itemId !== key);
                }
            });
        }

        // 7. Чистим награды этажей башен
        if (target.pve_towers) {
            Object.keys(target.pve_towers).forEach(towerKey => {
                const tower = target.pve_towers[towerKey];
                if (tower.floors) {
                    Object.keys(tower.floors).forEach(floorKey => {
                        const floor = tower.floors[floorKey];
                        if (floor.rewards && Array.isArray(floor.rewards.items)) {
                            target.pve_towers[towerKey].floors[floorKey].rewards.items = floor.rewards.items.filter(rew => rew.itemId !== key);
                        }
                    });
                }
            });
        }

        // 8. Чистим Магазин Арены (slots)
        if (target.pvp_arena && target.pvp_arena.shop && Array.isArray(target.pvp_arena.shop.slots)) {
            target.pvp_arena.shop.slots = target.pvp_arena.shop.slots.filter(slot => slot.itemId !== key);
        }

        // 9. НОВОЕ: Чистим Магазин Гильдии (slots)
        if (target.social && target.social.guild_system && target.social.guild_system.shop && Array.isArray(target.social.guild_system.shop.slots)) {
            target.social.guild_system.shop.slots = target.social.guild_system.shop.slots.filter(slot => slot.itemId !== key);
        }

        // 10. НОВОЕ: Чистим Квесты (Предметы в наградах тасок Daily & Weekly)
        if (target.quests) {
            ['daily', 'weekly'].forEach(qType => {
                const pool = target.quests[qType]?.task_pool || {};
                Object.keys(pool).forEach(tKey => {
                    if (pool[tKey].rewards && Array.isArray(pool[tKey].rewards.items)) {
                        pool[tKey].rewards.items = pool[tKey].rewards.items.filter(rew => rew.itemId !== key);
                    }
                });
                const milestones = target.quests[qType]?.milestones || [];
                milestones.forEach(m => {
                    if (m.rewards && Array.isArray(m.rewards.items)) {
                        m.rewards.items = m.rewards.items.filter(rew => rew.itemId !== key);
                    }
                });
            });
        }

        // 11. НОВОЕ: Чистим привязку валюты опыта и наград предметов в Баттл-Пассах
        if (target.battle_passes) {
            Object.keys(target.battle_passes).forEach(bpKey => {
                const bp = target.battle_passes[bpKey];
                if (bp.points_item_id === key) bp.points_item_id = "";
                if (Array.isArray(bp.levels_matrix)) {
                    bp.levels_matrix.forEach(row => {
                        if (row.free_rewards && Array.isArray(row.free_rewards.items)) {
                            row.free_rewards.items = row.free_rewards.items.filter(rew => rew.itemId !== key);
                        }
                        if (row.premium_rewards && Array.isArray(row.premium_rewards.items)) {
                            row.premium_rewards.items = row.premium_rewards.items.filter(rew => rew.itemId !== key);
                        }
                    });
                }
            });
        }

        // 12. НОВОЕ: Чистим награды предметов в шаблонах Доски Экспедиций (bounty_board)
        if (target.bounty_board && target.bounty_board.mission_pool) {
            Object.keys(target.bounty_board.mission_pool).forEach(mKey => {
                const mission = target.bounty_board.mission_pool[mKey];
                if (mission.rewards && Array.isArray(mission.rewards.items)) {
                    mission.rewards.items = mission.rewards.items.filter(rew => rew.itemId !== key);
                }
            });
        }

        if (target.limited_offers && target.limited_offers.offers_pool) {
            Object.keys(target.limited_offers.offers_pool).forEach(oKey => {
                const offer = target.limited_offers.offers_pool[oKey];

                // Переименовываем валюту стоимости оффера, если она совпадала со старым ID
                if (offer.cost && offer.cost.resource === oldKey) {
                    offer.cost.resource = newKey;
                }
                if (offer.old_cost && offer.old_cost.resource === oldKey) {
                    offer.old_cost.resource = newKey;
                }

                // Переименовываем ID предмета внутри массива наград акции
                if (offer.rewards && Array.isArray(offer.rewards.items)) {
                    offer.rewards.items.forEach(rew => {
                        if (rew.itemId === oldKey) {
                            rew.itemId = newKey;
                        }
                    });
                }
            });
        }
    }
}

function isKeyDuplicate(section, newKey, oldKey) {
    if (newKey === oldKey) return false;

    if (section === 'hero' && target.catalog.heroes[newKey]) return true;
    if (section === 'item' && target.catalog.items[newKey]) return true;
    if (section === 'resource' && target.mechanics.resources[newKey]) return true;
    if (section === 'dialog' && target.dialogs[newKey]) return true;

    return false;
}

function generateLocInputs(locObject, basePathString) {
    if (!locObject) return '<p style="color:var(--text-muted); font-size:11px;">Localization missing</p>';

    return target.languages.map(lang => {
        if (locObject[lang] === undefined) locObject[lang] = "";
        return `
            <div style="display:flex; align-items:center; gap:8px; margin-bottom:5px;">
                <span class="badge" style="width:30px; text-align:center;">${lang.toUpperCase()}</span>
                <input type="text" value="${locObject[lang] || ''}" oninput="${basePathString}['${lang}'] = this.value">
            </div>
        `;
    }).join('');
}

function updateGlobalField(key, val) {
    target[key] = val;
}

function updateWinSettings(key, val) {
    target.ui.windows_settings[key] = val;
}

function deleteResource(key) {
    delete target.mechanics.resources[key];
    state.resource = null;
    document.getElementById('resource-editor').innerHTML = '';
    renderResources();
}

function renameResourceKey(oldKey, newKey) {
    if (!newKey || oldKey === newKey) return;

    if (isKeyDuplicate('resource', newKey, oldKey)) {
        alert(`Error: Resource key "${newKey}" already exists!`);
        renderResources();
        selectResource(oldKey);
        return;
    }

    target.mechanics.resources[newKey] = target.mechanics.resources[oldKey];
    delete target.mechanics.resources[oldKey];

    if (state.resource === oldKey) state.resource = newKey;
    renderResources();
    selectResource(newKey);
}
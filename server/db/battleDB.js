const { redisClient } = require('../../redisClient');
const Cache = require('./cacheManager');
const {gamesConfigDB} = require('./configDB');
const { getHeroActualStats } = require('./_shared');
const { simulatePvEBattle } = require('../battles/pve');



async function processPvEBattle(userId, serverId, gameConfig, type, stage, towerKey) {
    // ------------------------------------------------------------------------
    // ЭШЕЛОН 1: РАБОТА ЧЕРЕЗ REDIS КЭШ (БЫСТРЫЙ ПУТЬ В RAM)
    // ------------------------------------------------------------------------
    if (redisClient.isOpen && redisClient.isReady) {
        try {
            // Читаем плоский объект игрока из кэша по твоему единому ключу (сервер + имя)
            let player = await Cache.getPlayer(userId, serverId);
            if (!player) throw new Error("Player profile not found in Redis cache");

            // Твоя оригинальная инициализация структуры прогресса
            if (!player.pve_progress) {
                player.pve_progress = { campaign: "stage_1_1", towers: {} };
            }
            if (!player.pve_progress.towers) player.pve_progress.towers = {};

            let stageConfig = null;
            let teamKey = '';

            // ТВОЯ ОРИГИНАЛЬНАЯ ЛОГИКА ПРОВЕРКИ ПРОГРЕССА СТРЕЛА В СТРЕЛУ
            if (type === 'campaign') {
                teamKey = 'pve_main';
                stageConfig = gameConfig.pve_campaign?.stages?.[stage];

                if (player.pve_progress?.campaign !== stage) {
                    return { error: true, message: "Этот этап кампании еще заблокирован" };
                }
            }
            else if (type === 'tower') {
                if (!towerKey) return { error: true, message: "Не указан ключ башни (towerKey)" };

                teamKey = `tower_${towerKey}`;
                stageConfig = gameConfig.pve_towers?.[towerKey]?.floors?.[stage];

                const currentFloor = player.pve_progress?.towers?.[towerKey] || 1;
                const targetFloorNum = parseInt(stage.replace(/^\D+/g, '')) || 1;

                if (currentFloor !== targetFloorNum) {
                    return { error: true, message: "Этот этаж башни заблокирован" };
                }
            }
            else {
                return { error: true, message: "Неверный тип PvE активности" };
            }

            if (!stageConfig) {
                return { error: true, message: `Конфигурация уровня ${stage} не найдена` };
            }

            // --- ТВОЯ ПРОВЕРКА И СПИСАНИЕ ЭНЕРГИИ В ПАМЯТИ ---
            let currentResources = player.resources || {};
            if (stageConfig.energy_cost && stageConfig.energy_cost > 0) {
                const currentEnergy = currentResources.energy || 0;
                if (currentEnergy < stageConfig.energy_cost) {
                    return { error: true, message: "Недостаточно энергии для начала боя" };
                }
                currentResources.energy -= stageConfig.energy_cost;
            }

            // --- ТВОЙ ОРИГИНАЛЬНЫЙ СБОР ХАРАКТЕРИСТИК ОТРЯДА ИЗ RAM ---
            const playerHeroIds = player.teams?.[teamKey] || player[teamKey] || [];
            if (playerHeroIds.length === 0) {
                return { error: true, message: `Команда для этого режима пуста (Искали ключ: "${teamKey}")` };
            }

            const playerTeamStats = [];
            for (const instId of playerHeroIds) {
                const heroInstance = player.heroes?.find(h => h.instance_id === instId);
                if (heroInstance) {
                    let rawStats = getHeroActualStats(heroInstance, { config: gameConfig });
                    let combatStats = { ...rawStats };

                    // Твой фракционный бонус отряда
                    const teamBonus = player.team_bonuses?.[teamKey];
                    if (teamBonus) {
                        if (teamBonus.hp && teamBonus.hp.endsWith('%')) {
                            combatStats.hp += combatStats.hp * (parseFloat(teamBonus.hp) / 100);
                        }
                        if (teamBonus.atk && teamBonus.atk.endsWith('%')) {
                            combatStats.atk += combatStats.atk * (parseFloat(teamBonus.atk) / 100);
                        }
                    }
                    playerTeamStats.push(combatStats);
                }
            }

            // --- ТВОЙ ОРИГИНАЛЬНЫЙ СБОР ХАРАКТЕРИСТИК ВРАГОВ ИЗ RAM ---
            const enemyTeamStats = [];
            const enemyUnits = stageConfig.enemies || [];

            enemyUnits.forEach(enemy => {
                const targetHeroId = enemy.hero_id || enemy.enemy_id;
                const proto = gameConfig.catalog?.heroes?.[targetHeroId];

                if (proto) {
                    const virtualEnemy = {
                        hero_id: targetHeroId,
                        level: Number(enemy.level) || 1,
                        stars: Number(enemy.stars) || Number(proto.base_stars) || 1,
                        equipped: {}
                    };

                    let stats = getHeroActualStats(virtualEnemy, { config: gameConfig });
                    if (stats) {
                        stats.position = enemy.position;
                        enemyTeamStats.push(stats);
                    }
                } else {
                    console.error(`[PvE БОЙ]: Прототип врага "${targetHeroId}" не найден в каталоге heroes!`);
                }
            });

            if (enemyTeamStats.length === 0) {
                return { error: true, message: `Ошибка конфигурации этапа: не удалось загрузить ни одного врага для этапа ${stage}` };
            }

            // --- ЗАПУСК ТВОЕГО РОДНОГО СИМУЛЯТОРА БОЯ ---
            const battleResult = await simulatePvEBattle(playerTeamStats, enemyTeamStats, gameConfig);

            // --- ТВОЙ ОРИГИНАЛЬНЫЙ МАТЕМАТИЧЕСКИЙ РАСЧЕТ ЛУТА И НАГРАД В RAM ---
            let rewardReport = { resources: {}, items: {} };

            if (battleResult.win) {
                // 1. Начисление ресурсов (валют) в RAM объект resources
                if (stageConfig.rewards?.resources) {
                    Object.entries(stageConfig.rewards.resources).forEach(([resKey, amount]) => {
                        currentResources[resKey] = (currentResources[resKey] || 0) + amount;
                        rewardReport.resources[resKey] = amount;
                    });
                }

                // 2. Начисление предметов по шансам в словарный инвентарь в RAM
                if (stageConfig.rewards?.items) {
                    if (!player.inventory) player.inventory = {};

                    stageConfig.rewards.items.forEach(drop => {
                        const chance = drop.chance !== undefined ? drop.chance : 1.0;
                        if (Math.random() <= chance) {
                            player.inventory[drop.itemId] = (player.inventory[drop.itemId] || 0) + (drop.amount || 1);
                            rewardReport.items[drop.itemId] = (rewardReport.items[drop.itemId] || 0) + (drop.amount || 1);
                        }
                    });
                }

                // 3. ТВОЙ ОРИГИНАЛЬНЫЙ СДВИГ ПРОГРЕССА СТРОК В RAM
                if (type === 'campaign') {
                    const currentNum = parseInt(stage.split('_')[2]); // stage_1_1 -> 1
                    const chapterNum = parseInt(stage.split('_')[1]); // stage_1_1 -> 1
                    const nextStageKey = `stage_${chapterNum}_${currentNum + 1}`;

                    if (gameConfig.pve_campaign?.stages?.[nextStageKey]) {
                        player.pve_progress.campaign = nextStageKey;
                    } else {
                        const nextChapterKey = `stage_${chapterNum + 1}_1`;
                        if (gameConfig.pve_campaign?.stages?.[nextChapterKey]) {
                            player.pve_progress.campaign = nextChapterKey;
                        }
                    }
                }
                else if (type === 'tower') {
                    const currentFloorNum = parseInt(stage.replace(/^\D+/g, ''));
                    player.pve_progress.towers[towerKey] = currentFloorNum + 1;
                }
            }

            // Синхронизируем все измененные поля обратно в стейт игрока
            player.resources = currentResources;

            // Записываем обновленного плоского игрока в Редис. Lazy Write сбросит его в БД.
            await Cache.setPlayer(userId, serverId, player);

            // Возвращаем ответ строго по твоему формату Express-контроллера
            return {
                success: true,
                win: battleResult.win,
                replay: battleResult.replay,
                // rewards: rewardReport,
                resources: currentResources,
                pve_progress: player.pve_progress,
                next_stage: type === 'campaign' ? player.pve_progress.campaign : player.pve_progress.towers[towerKey]
            };

        } catch (cacheErr) {
            console.warn('[BattleDB:PvE] Сбой Redis, проваливаюсь в Postgres Fallback:', cacheErr.message);
        }
    }

    // ------------------------------------------------------------------------
    // ЭШЕЛОН 2: ТВОЙ СТАРЫЙ НЕПРИКОСНОВЕННЫЙ SQL FALLBACK (БЕЗОПАСНАЯ СУБД)
    // ------------------------------------------------------------------------
    const client = await global.pool.connect();
    try {
        await client.query('BEGIN');

        // Блокируем строку профиля по UUID (id) для полной изоляции транзакции
        const { rows } = await client.query(
            `SELECT resources, game_data FROM player_server_profiles WHERE id = $1 AND server_id = $2 FOR UPDATE;`,
            [userId, serverId]
        );
        if (rows.length === 0) {
            await client.query('ROLLBACK');
            return { error: true, message: "Player profile not found" };
        }

        let currentResources = rows[0].resources || {};
        let gameData = rows[0].game_data || {};

        // Инициализация структуры прогресса, если её не было в базе
        if (!gameData.pve_progress) {
            gameData.pve_progress = { campaign: "stage_1_1", towers: {} };
        }
        if (!gameData.pve_progress.towers) gameData.pve_progress.towers = {};

        let stageConfig = null;
        let teamKey = '';

        if (type === 'campaign') {
            teamKey = 'pve_main';
            stageConfig = gameConfig.pve_campaign?.stages?.[stage];

            if (gameData.pve_progress?.campaign !== stage) {
                await client.query('ROLLBACK');
                return { error: true, message: "Этот этап кампании еще заблокирован" };
            }
        }
        else if (type === 'tower') {
            if (!towerKey) {
                await client.query('ROLLBACK');
                return { error: true, message: "Не указан ключ башни (towerKey)" };
            }

            teamKey = `tower_${towerKey}`;
            stageConfig = gameConfig.pve_towers?.[towerKey]?.floors?.[stage];

            const currentFloor = gameData.pve_progress?.towers?.[towerKey] || 1;
            const targetFloorNum = parseInt(stage.replace(/^\D+/g, '')) || 1;

            if (currentFloor !== targetFloorNum) {
                await client.query('ROLLBACK');
                return { error: true, message: "Этот этаж башни заблокирован" };
            }
        }
        else {
            await client.query('ROLLBACK');
            return { error: true, message: "Неверный тип PvE активности" };
        }

        if (!stageConfig) {
            await client.query('ROLLBACK');
            return { error: true, message: `Конфигурация уровня ${stage} не найдена` };
        }

        // --- ПРОВЕРКА И СПИСАНИЕ ЭНЕРГИИ В СУБД ---
        if (stageConfig.energy_cost && stageConfig.energy_cost > 0) {
            const currentEnergy = currentResources.energy || 0;
            if (currentEnergy < stageConfig.energy_cost) {
                await client.query('ROLLBACK');
                return { error: true, message: "Недостаточно энергии для начала боя" };
            }
            currentResources.energy -= stageConfig.energy_cost;
        }

        const playerHeroIds = gameData.teams?.[teamKey] || gameData[teamKey] || [];
        if (playerHeroIds.length === 0) {
            await client.query('ROLLBACK');
            return { error: true, message: `Команда для этого режима пуста (Искали ключ: "${teamKey}")` };
        }

        // Сбор характеристик команды игрока для SQL-режима
        const playerTeamStats = [];
        for (const instId of playerHeroIds) {
            const heroInstance = gameData.heroes?.find(h => h.instance_id === instId);
            if (heroInstance) {
                let rawStats = getHeroActualStats(heroInstance, { config: gameConfig });
                let combatStats = { ...rawStats };

                const teamBonus = gameData.team_bonuses?.[teamKey];
                if (teamBonus) {
                    if (teamBonus.hp && teamBonus.hp.endsWith('%')) {
                        combatStats.hp += combatStats.hp * (parseFloat(teamBonus.hp) / 100);
                    }
                    if (teamBonus.atk && teamBonus.atk.endsWith('%')) {
                        combatStats.atk += combatStats.atk * (parseFloat(teamBonus.atk) / 100);
                    }
                }
                playerTeamStats.push(combatStats);
            }
        }

        // Сбор характеристик мобов для SQL-режима
        const enemyTeamStats = [];
        const enemyUnits = stageConfig.enemies || [];

        enemyUnits.forEach(enemy => {
            const targetHeroId = enemy.hero_id || enemy.enemy_id;
            const proto = gameConfig.catalog?.heroes?.[targetHeroId];

            if (proto) {
                const virtualEnemy = {
                    hero_id: targetHeroId,
                    level: Number(enemy.level) || 1,
                    stars: Number(enemy.stars) || Number(proto.base_stars) || 1,
                    equipped: {}
                };

                let stats = getHeroActualStats(virtualEnemy, { config: gameConfig });
                if (stats) {
                    stats.position = enemy.position;
                    enemyTeamStats.push(stats);
                }
            } else {
                console.error(`[PvE БОЙ]: Прототип врага "${targetHeroId}" не найден в каталоге heroes!`);
            }
        });

        if (enemyTeamStats.length === 0) {
            await client.query('ROLLBACK');
            return { error: true, message: `Ошибка конфигурации этапа: не удалось загрузить ни одного врага для этапа ${stage}` };
        }

        // --- ЗАПУСК ТВОЕГО РОДНОГО СИМУЛЯТОРА БОЯ ---
        const battleResult = await simulatePvEBattle(playerTeamStats, enemyTeamStats, gameConfig);

        let rewardReport = { resources: {}, items: {} };

        if (battleResult.win) {
            if (stageConfig.rewards?.resources) {
                Object.entries(stageConfig.rewards.resources).forEach(([resKey, amount]) => {
                    currentResources[resKey] = (currentResources[resKey] || 0) + amount;
                    rewardReport.resources[resKey] = amount;
                });
            }

            if (stageConfig.rewards?.items) {
                if (!gameData.inventory) gameData.inventory = {};

                stageConfig.rewards.items.forEach(drop => {
                    const chance = drop.chance !== undefined ? drop.chance : 1.0;
                    if (Math.random() <= chance) {
                        gameData.inventory[drop.itemId] = (gameData.inventory[drop.itemId] || 0) + (drop.amount || 1);
                        rewardReport.items[drop.itemId] = (rewardReport.items[drop.itemId] || 0) + (drop.amount || 1);
                    }
                });
            }

            if (type === 'campaign') {
                const currentNum = parseInt(stage.split('_'));
                const chapterNum = parseInt(stage.split('_'));
                const nextStageKey = `stage_${chapterNum}_${currentNum + 1}`;

                if (gameConfig.pve_campaign?.stages?.[nextStageKey]) {
                    gameData.pve_progress.campaign = nextStageKey;
                } else {
                    const nextChapterKey = `stage_${chapterNum + 1}_1`;
                    if (gameConfig.pve_campaign?.stages?.[nextChapterKey]) {
                        gameData.pve_progress.campaign = nextChapterKey;
                    }
                }
            }
            else if (type === 'tower') {
                const currentFloorNum = parseInt(stage.replace(/^\D+/g, ''));
                gameData.pve_progress.towers[towerKey] = currentFloorNum + 1;
            }
        }

        // Атомарно пишем в базу изменений
        const updateQuery = `
            UPDATE player_server_profiles 
            SET resources = $3, game_data = $4, updated_at = CURRENT_TIMESTAMP 
            WHERE id = $1 AND server_id = $2;
        `;
        await client.query(updateQuery, [userId, serverId, JSON.stringify(currentResources), JSON.stringify(gameData)]);
        await client.query('COMMIT');

        return {
            success: true,
            win: battleResult.win,
            replay: battleResult.replay,
            rewards: rewardReport,
            resources: currentResources,
            next_stage: type === 'campaign' ? gameData.pve_progress.campaign : gameData.pve_progress.towers[towerKey]
        };

    } catch (e) {
        await client.query('ROLLBACK');
        console.error("Критическая ошибка PvE боя в SQL Fallback:", e);
        return { error: true, message: e.message };
    } finally {
        client.release();
    }
}




/**
 * Обработка PvP боя на Арене (Сначала Redis, ниже Postgres Fallback с защитой от дедлоков)
 */
async function processPvPBattle(userId, serverId, gameConfig, opponentId) {
    // ------------------------------------------------------------------------
    // ЭШЕЛОН 1: РАБОТА ЧЕРЕЗ REDIS КЭШ (СВЕРХБЫСТРЫЙ ПУТЬ В RAM)
    // ------------------------------------------------------------------------
    if (redisClient.isOpen && redisClient.isReady) {
        try {
            // Достаем из памяти профили обоих игроков за микросекунды
            let attacker = await Cache.getPlayer(userId, serverId);
            let defender = await Cache.getPlayer(opponentId, serverId);

            if (!attacker || !defender) {
                throw new Error("Один из профилей игроков не найден в кэше Redis");
            }

            // Проверка отрядов в памяти
            const attackerHeroIds = attacker.teams?.pve_main || [];
            const defenderHeroIds = defender.teams?.pve_main || [];

            if (attackerHeroIds.length === 0) return { error: true, message: "Ваш атакующий отряд пуст" };
            if (defenderHeroIds.length === 0) return { error: true, message: "Защитный отряд выбранного оппонента пуст" };

            // Сборка характеристик (Бизнес-логика)
            const attackerTeamStats = [];
            attackerHeroIds.forEach(instId => {
                const heroInstance = attacker.heroes?.find(h => h.instance_id === instId);
                if (heroInstance) {
                    let stats = { ...getHeroActualStats(heroInstance, { config: gameConfig }) };
                    const teamBonus = attacker.team_bonuses?.pve_main;
                    if (teamBonus) {
                        if (teamBonus.hp?.endsWith('%')) stats.hp *= (1 + parseFloat(teamBonus.hp) / 100);
                        if (teamBonus.atk?.endsWith('%')) stats.atk *= (1 + parseFloat(teamBonus.atk) / 100);
                    }
                    attackerTeamStats.push(stats);
                }
            });

            const defenderTeamStats = [];
            defenderHeroIds.forEach((instId, index) => {
                const heroInstance = defender.heroes?.find(h => h.instance_id === instId);
                if (heroInstance) {
                    let stats = { ...getHeroActualStats(heroInstance, { config: gameConfig }) };
                    const teamBonus = defender.team_bonuses?.pve_main;
                    if (teamBonus) {
                        if (teamBonus.hp?.endsWith('%')) stats.hp *= (1 + parseFloat(teamBonus.hp) / 100);
                        if (teamBonus.atk?.endsWith('%')) stats.atk *= (1 + parseFloat(teamBonus.atk) / 100);
                    }
                    stats.position = index;
                    defenderTeamStats.push(stats);
                }
            });

            // Запускаем симулятор раундов
            const battleResult = await simulatePvEBattle(attackerTeamStats, defenderTeamStats, gameConfig);

            let ratingChange = 15;
            let attackerResources = attacker.resources || {};
            let defenderResources = defender.resources || {};

            if (!attackerResources.arena_rating) attackerResources.arena_rating = 1000;
            if (!defenderResources.arena_rating) defenderResources.arena_rating = 1000;

            let rewardReport = { resources: {} };

            // Расчет изменения рейтинга и золота в памяти
            if (battleResult.win) {
                attackerResources.arena_rating += ratingChange;
                defenderResources.arena_rating = Math.max(0, defenderResources.arena_rating - ratingChange);
                attackerResources.gold = (attackerResources.gold || 0) + 300;
                rewardReport.resources.gold = 300;
                rewardReport.resources.arena_rating = `+${ratingChange}`;
            } else {
                attackerResources.arena_rating = Math.max(0, attackerResources.arena_rating - ratingChange);
                defenderResources.arena_rating += ratingChange;
                rewardReport.resources.arena_rating = `-${ratingChange}`;
            }

            const nowTimestamp = Date.now();

            // Пишем историю матча атакующему
            if (!attacker.match_history) attacker.match_history = [];
            attacker.match_history.unshift({
                timestamp: nowTimestamp,
                game_id: "PvP_Arena",
                stake: { arena_rating: ratingChange },
                prize: battleResult.win ? { gold: 300 } : null,
                status: battleResult.win ? "WIN" : "LOSE",
                description: `vs ${defender.nickname || 'Player'}`
            });
            if (attacker.match_history.length > 20) attacker.match_history.pop();

            // Зеркальная история матча защитнику
            if (!defender.match_history) defender.match_history = [];
            defender.match_history.unshift({
                timestamp: nowTimestamp,
                game_id: "PvP_Arena",
                stake: { arena_rating: ratingChange },
                prize: battleResult.win ? null : { gold: 300 },
                status: battleResult.win ? "LOSE" : "WIN",
                description: `Defended vs ${attacker.nickname || 'Player'}`
            });
            if (defender.match_history.length > 20) defender.match_history.pop();

            // Сохраняем ОБОИХ игроков в Редис. Lazy Write фоном обновит обе строки в базе за минуту.
            await Cache.setPlayer(userId, serverId, attacker);
            await Cache.setPlayer(opponentId, serverId, defender);

            return {
                success: true,
                win: battleResult.win,
                replay: battleResult.replay,
                rewards: rewardReport,
                resources: attackerResources,
                next_stage: null
            };

        } catch (cacheErr) {
            console.warn('[BattleDB:PvP] Сбой Redis, проваливаюсь в Postgres Fallback:', cacheErr);
        }
    }

    // ------------------------------------------------------------------------
    // ЭШЕЛОН 2: ТВОЙ СТАРЫЙ SQL FALLBACK С ЗАЩИТОЙ ОТ ДЕДЛОКОВ (БЕЗОПАСНЫЙ ПУТЬ)
    // ------------------------------------------------------------------------
    const client = await global.pool.connect();
    try {
        await client.query('BEGIN');

        // Сортировка ID для полного исключения Deadlock при FOR UPDATE
        const idOrder = [userId, opponentId].sort();
        const selectQuery = `
            SELECT user_id, resources, game_data, combat_power, nickname 
            FROM player_server_profiles 
            WHERE user_id IN ($1, $2) AND server_id = $3 FOR UPDATE;
        `;
        const { rows } = await client.query(selectQuery, [...idOrder, serverId]);

        const attackerRow = rows.find(o => String(o.user_id) === String(userId));
        const defenderRow = rows.find(o => String(o.user_id) === String(opponentId));

        if (!attackerRow || !defenderRow) {
            await client.query('ROLLBACK');
            return { error: true, message: "Один из профилей игроков не найден в базе данных" };
        }

        let attackerGameData = attackerRow.game_data || {};
        let defenderGameData = defenderRow.game_data || {};
        let attackerResources = attackerRow.resources || {};
        let defenderResources = defenderRow.resources || {};

        const attackerHeroIds = attackerGameData.teams?.pve_main || [];
        const defenderHeroIds = defenderGameData.teams?.pve_main || [];

        if (attackerHeroIds.length === 0) { await client.query('ROLLBACK'); return { error: true, message: "Ваш атакующий отряд пуст" }; }
        if (defenderHeroIds.length === 0) { await client.query('ROLLBACK'); return { error: true, message: "Защитный отряд выбранного оппонента пуст" }; }

        const attackerTeamStats = [];
        attackerHeroIds.forEach(instId => {
            const heroInstance = attackerGameData.heroes?.find(h => h.instance_id === instId);
            if (heroInstance) {
                let stats = { ...getHeroActualStats(heroInstance, { config: gameConfig }) };
                const teamBonus = attackerGameData.team_bonuses?.pve_main;
                if (teamBonus) {
                    if (teamBonus.hp?.endsWith('%')) stats.hp *= (1 + parseFloat(teamBonus.hp) / 100);
                    if (teamBonus.atk?.endsWith('%')) stats.atk *= (1 + parseFloat(teamBonus.atk) / 100);
                }
                attackerTeamStats.push(stats);
            }
        });

        const defenderTeamStats = [];
        defenderHeroIds.forEach((instId, index) => {
            const heroInstance = defenderGameData.heroes?.find(h => h.instance_id === instId);
            if (heroInstance) {
                let stats = { ...getHeroActualStats(heroInstance, { config: gameConfig }) };
                const teamBonus = defenderGameData.team_bonuses?.pve_main;
                if (teamBonus) {
                    if (teamBonus.hp?.endsWith('%')) stats.hp *= (1 + parseFloat(teamBonus.hp) / 100);
                    if (teamBonus.atk?.endsWith('%')) stats.atk *= (1 + parseFloat(teamBonus.atk) / 100);
                }
                stats.position = index;
                defenderTeamStats.push(stats);
            }
        });

        const battleResult = await simulatePvEBattle(attackerTeamStats, defenderTeamStats, gameConfig);

        let ratingChange = 15;
        if (!attackerResources.arena_rating) attackerResources.arena_rating = 1000;
        if (!defenderResources.arena_rating) defenderResources.arena_rating = 1000;

        let rewardReport = { resources: {} };

        if (battleResult.win) {
            attackerResources.arena_rating += ratingChange;
            defenderResources.arena_rating = Math.max(0, defenderResources.arena_rating - ratingChange);

            attackerResources.gold = (attackerResources.gold || 0) + 300;
            rewardReport.resources.gold = 300;
            rewardReport.resources.arena_rating = `+${ratingChange}`;
        } else {
            attackerResources.arena_rating = Math.max(0, attackerResources.arena_rating - ratingChange);
            defenderResources.arena_rating += ratingChange;

            rewardReport.resources.arena_rating = `-${ratingChange}`;
        }

        const nowTimestamp = Date.now();

        // Запись истории матча Атакующему (Игрок) в оперативной памяти
        if (!attacker.match_history) attacker.match_history = [];
        attacker.match_history.unshift({
            timestamp: nowTimestamp,
            game_id: "PvP_Arena",
            stake: { arena_rating: ratingChange },
            prize: battleResult.win ? { gold: 300 } : null,
            status: battleResult.win ? "WIN" : "LOSE",
            description: `vs ${defender.nickname || 'Player'}`
        });
        if (attacker.match_history.length > 20) attacker.match_history.pop();

        // КРИТИЧЕСКИЙ ФИКС: Записываем зеркальную историю матча ВТОРОМУ пользователю (Защитнику) в RAM!
        if (!defender.match_history) defender.match_history = [];
        defender.match_history.unshift({
            timestamp: nowTimestamp,
            game_id: "PvP_Arena",
            stake: { arena_rating: ratingChange },
            prize: battleResult.win ? null : { gold: 300 },
            status: battleResult.win ? "LOSE" : "WIN",      // Статус инвертируется зеркально
            description: `Defended vs ${attacker.nickname || 'Player'}`
        });
        if (defender.match_history.length > 20) defender.match_history.pop();

        // Сохраняем ОБОИХ измененных игроков в Редис. Lazy Write фоном обновит их в базе за минуту.
        await Cache.setPlayer(userId, serverId, attacker);
        await Cache.setPlayer(opponentId, serverId, defender);

        return {
            success: true,
            win: battleResult.win,
            replay: battleResult.replay,
            rewards: rewardReport,
            resources: attackerResources,
            next_stage: null
        };

    } catch (cacheErr) {
        console.warn('[BattleDB:PvP] Сбой Redis, проваливаюсь в Postgres Fallback:', cacheErr);
    }
}

/**
 * Получить список соперников для Арены (Сначала пробуем живых из Redis, иначе Postgres Fallback)
 */
/**
 * 1. ИСПРАВЛЕНО: Подбор соперников строго по диапазону РЕЙТИНГА (±100 очков) через Redis ZSET
 */
async function getArenaOpponents(userId, serverId) {
    if (redisClient.isOpen && redisClient.isReady) {
        try {
            const leaderboardKey = `lb:${serverId}:arena`;
            const attackerKey = `p:${serverId}:${userId}`;

            // Вытаскиваем текущий профиль атакующего, чтобы узнать его рейтинг
            const cachedAttacker = await redisClient.get(attackerKey);
            const attackerRating = cachedAttacker ? (JSON.parse(cachedAttacker).resources?.arena_rating || 1000) : 1000;

            // Задаем умный диапазон подбора по рейтингу Арены
            const minRating = Math.max(0, attackerRating - 100);
            const maxRating = attackerRating + 100;

            // Ищем UUID игроков, чей рейтинг находится в диапазоне [minRating, maxRating]
            // ZRANGE_BY_SCORE вернет массив ID пользователей
            const opponentIds = await redisClient.zRangeByScore(leaderboardKey, minRating, maxRating);

            // Фильтруем самого себя и берем случайных 5 человек из подходящего пула
            let filteredIds = opponentIds.filter(id => String(id) !== String(userId));

            // Если в честном диапазоне ±100 мало людей, расширяем пул до ±500, чтобы игрок не сидел без боев
            if (filteredIds.length < 3) {
                const wideOpponents = await redisClient.zRangeByScore(leaderboardKey, Math.max(0, attackerRating - 500), attackerRating + 500);
                filteredIds = wideOpponents.filter(id => String(id) !== String(userId));
            }

            // Перемешиваем и берем первые 5 штук
            const selectedIds = filteredIds.sort(() => 0.5 - Math.random()).slice(0, 5);

            if (selectedIds.length > 0) {
                const opponentsData = [];
                for (const oppId of selectedIds) {
                    const oppKey = `p:${serverId}:${oppId}`;
                    const cachedData = await redisClient.get(oppKey);

                    if (cachedData) {
                        const opp = JSON.parse(cachedData);
                        opponentsData.push({
                            user_id: opp.user_id,
                            nickname: opp.nickname,
                            level: opp.level,
                            combat_power: opp.combat_power,
                            heroes: opp.heroes || [] // Герои из развернутого плоского объекта
                        });
                    }
                }
                if (opponentsData.length > 0) return opponentsData;
            }
        } catch (cacheErr) {
            console.warn('[BattleDB:GetOpponents] Сбой Redis ZSET, падаю в Postgres Fallback:', cacheErr);
        }
    }

    // --- СТАРЫЙ SQL FALLBACK НА СЛУЧАЙ ОТКЛЮЧЕНИЯ REDIS ---
    try {
        // Подстраховочный подбор: берем просто 5 случайных игроков сервера
        const query = `
            SELECT user_id, nickname, level, combat_power, game_data
            FROM player_server_profiles 
            WHERE server_id = $1 AND user_id != $2
            LIMIT 5;
        `;
        const { rows } = await global.pool.query(query, [serverId, userId]);

        return rows.map(opp => ({
            user_id: opp.user_id,
            nickname: opp.nickname,
            level: opp.level,
            combat_power: opp.combat_power,
            heroes: opp.game_data?.heroes || []
    }));
    } catch (e) {
        console.error("[Fallback PvP GetOpponents Error]:", e);
        return { error: true, message: e.message };
    }
}

/**
 * 2. ДОБАВЛЕНО: Быстрое получение ТОП-100 игроков сервера (Лидерборд) за 0 мс
 */
async function getArenaLeaderboard(serverId) {
    if (redisClient.isOpen && redisClient.isReady) {
        try {
            const leaderboardKey = `lb:${serverId}:arena`;

            // Вытаскиваем топ-100 игроков с их скорами (от высшего к низшему)
            const topUsers = await redisClient.zRangeWithScores(leaderboardKey, 0, 99, { REV: true });

            const leaderboardResult = [];
            let rank = 1;

            for (const cell of topUsers) {
                const userKey = `p:${serverId}:${cell.value}`;
                const cachedData = await redisClient.get(userKey);

                if (cachedData) {
                    const profile = JSON.parse(cachedData);
                    leaderboardResult.push({
                        rank: rank++,
                        nickname: profile.nickname,
                        level: profile.level,
                        combat_power: profile.combat_power,
                        arena_rating: cell.score // Рейтинг забираем прямо из ZSET
                    });
                }
            }
            return leaderboardResult;
        } catch (err) {
            console.warn('[BattleDB:Leaderboard] Сбой Редиса, иду в Postgres Fallback:', err);
        }
    }

    // --- SQL FALLBACK ДЛЯ ЛИДЕРБОРДА ---
    try {
        const query = `
            SELECT nickname, level, combat_power, (resources->>'arena_rating')::int as rating
            FROM player_server_profiles
            WHERE server_id = $1
            ORDER BY rating DESC NULLS LAST
            LIMIT 100;
        `;
        const { rows } = await global.pool.query(query, [serverId]);

        let rank = 1;
        return rows.map(row => ({
            rank: rank++,
            nickname: row.nickname,
            level: row.level,
            combat_power: row.combat_power,
            arena_rating: row.rating || 1000
        }));
    } catch (e) {
        console.error("[Fallback Leaderboard Error]:", e);
        return { error: true, message: e.message };
    }
}

/**
 * Обработка боя с Боссом (Сначала Redis, ниже Postgres Fallback с защитой от race conditions)
 */
async function processBossBattle(userId, serverId, gameId, gameConfig, bossKey) {
    const bossMeta = gameConfig.pve_bosses?.[bossKey];
    if (!bossMeta) return { error: true, message: "Конфигурация босса не найдена" };

    // ------------------------------------------------------------------------
    // ЭШЕЛОН 1: РАБОТА ЧЕРЕЗ REDIS КЭШ (СВЕРХБЫСТРЫЙ RAM ПУТЬ)
    // ------------------------------------------------------------------------
    if (redisClient.isOpen && redisClient.isReady) {
        try {
            // 1. Извлекаем профиль атакующего игрока из Редиса
            let player = await Cache.getPlayer(userId, serverId);
            if (!player) throw new Error("Профиль игрока не найден в кэше Redis");

            let resources = player.resources || {};
            let bossCurrentHp = Number(bossMeta.max_hp);
            let damagePool = {};
            const globalBossKey = `b:state:${gameId}:${serverId}:${bossKey}`;

            // Разделение логики: Мировой/Гильдейский vs Соло босс
            if (bossMeta.boss_type === 'server' || bossMeta.boss_type === 'guild') {
                // Инициализируем стейт босса в Редисе, если его еще нет (атомарно через HSETNX / GET)
                const exists = await redisClient.exists(globalBossKey);
                if (!exists) {
                    await redisClient.hSet(globalBossKey, 'current_hp', String(bossMeta.max_hp));
                    await redisClient.hSet(globalBossKey, 'total_damage_pool', '{}');
                }

                // Извлекаем текущие данные глобального босса из Редиса
                const bHp = await redisClient.hGet(globalBossKey, 'current_hp');
                const bPool = await redisClient.hGet(globalBossKey, 'total_damage_pool');

                bossCurrentHp = Number(bHp);
                damagePool = JSON.parse(bPool || '{}');

                if (bossCurrentHp <= 0) {
                    return { error: true, message: "Этот босс уже повержен! Ожидайте сброса таймера." };
                }
            } else {
                // Локальный соло-босс: его здоровье хранится внутри профиля самого игрока
                if (!player.local_boss_hp) player.local_boss_hp = {};
                if (player.local_boss_hp[bossKey] === undefined) {
                    player.local_boss_hp[bossKey] = bossMeta.max_hp;
                }
                bossCurrentHp = Number(player.local_boss_hp[bossKey]);
                if (bossCurrentHp <= 0) {
                    return { error: true, message: "Вы уже победили этого соло-босса!" };
                }
            }

            // Запускаем общую бизнес-логику симуляции боя
            const simPayload = runBossSimulation(player, bossMeta, bossCurrentHp, gameConfig, bossKey);
            if (simPayload.error) return simPayload;

            const { battleResult, totalDamageDealtToBoss, nextBossHp } = simPayload;

            // Сохранение прогресса здоровья босса в Редисе
            if (bossMeta.boss_type === 'server' || bossMeta.boss_type === 'guild') {
                damagePool[userId] = (damagePool[userId] || 0) + totalDamageDealtToBoss;

                await redisClient.hSet(globalBossKey, 'current_hp', String(nextBossHp));
                await redisClient.hSet(globalBossKey, 'total_damage_pool', JSON.stringify(damagePool));

                // Ставим глобального босса также в очередь dirty на фоновую синхронизацию с Postgres
                await redisClient.sAdd('dirty_global_bosses', globalBossKey);
            } else {
                player.local_boss_hp[bossKey] = nextBossHp;
            }

            // Начисление лута по тирам наград в оперативную память
            let rewardReport = { resources: {}, items: {} };
            const tierRewards = bossMeta.rewards_by_tier || [];
            let activeTier = null;

            for (let i = tierRewards.length - 1; i >= 0; i--) {
                if (totalDamageDealtToBoss >= tierRewards[i].min_dmg) {
                    activeTier = tierRewards[i];
                    break;
                }
            }

            if (activeTier) {
                if (activeTier.resources) {
                    Object.entries(activeTier.resources).forEach(([resKey, amount]) => {
                        resources[resKey] = (resources[resKey] || 0) + amount;
                        rewardReport.resources[resKey] = amount;
                    });
                }
                if (activeTier.items) {
                    if (!player.inventory) player.inventory = {};
                    activeTier.items.forEach(drop => {
                        player.inventory[drop.itemId] = (player.inventory[drop.itemId] || 0) + (drop.amount || 1);
                        rewardReport.items[drop.itemId] = (rewardReport.items[drop.itemId] || 0) + (drop.amount || 1);
                    });
                }
            }

            // Фиксируем изменения игрока в Редисе. Lazy Write сбросит профиль в БД.
            await Cache.setPlayer(userId, serverId, player);

            return {
                success: true,
                win: nextBossHp <= 0,
                replay: battleResult.replay,
                rewards: rewardReport,
                resources: resources,
                next_stage: null,
                boss_stats: {
                    boss_key: bossKey,
                    total_damage_dealt: totalDamageDealtToBoss,
                    current_hp: nextBossHp,
                    max_hp: bossMeta.max_hp
                }
            };

        } catch (cacheErr) {
            console.warn('[BattleDB:Boss] Сбой Redis в процессе боя, падаю в Postgres Fallback:', cacheErr);
        }
    }

    // ------------------------------------------------------------------------
    // ЭШЕЛОН 2: ТВОЙ СТАРЫЙ ОРИГИНАЛЬНЫЙ SQL FALLBACK С ДВОЙНОЙ БЛОКИРОВКОЙ И СУБД
    // ------------------------------------------------------------------------
    const client = await global.pool.connect();
    try {
        await client.query('BEGIN');

        const { rows: pRows } = await client.query(
            `SELECT resources, game_data FROM player_server_profiles WHERE user_id = $1 AND server_id = $2 FOR UPDATE;`,
            [userId, serverId]
        );
        if (pRows.length === 0) {
            await client.query('ROLLBACK');
            return { error: true, message: "Профиль игрока не найден" };
        }

        let currentResources = pRows[0].resources || {};
        let gameData = pRows[0].game_data || {};

        let bossCurrentHp = Number(bossMeta.max_hp);
        let damagePool = {};

        if (bossMeta.boss_type === 'server' || bossMeta.boss_type === 'guild') {
            await client.query(`
                INSERT INTO global_boss_states (game_id, server_id, boss_key, current_hp, total_damage_pool)
                VALUES ($1, $2, $3, $4, '{}'::jsonb)
                ON CONFLICT (game_id, server_id, boss_key) DO NOTHING;
            `, [gameId, serverId, bossKey, bossMeta.max_hp]);

            const { rows: bRows } = await client.query(`
                SELECT current_hp, total_damage_pool FROM global_boss_states 
                WHERE game_id = $1 AND server_id = $2 AND boss_key = $3 FOR UPDATE;
            `, [gameId, serverId, bossKey]);

            bossCurrentHp = Number(bRows[0].current_hp);
            damagePool = bRows[0].total_damage_pool || {};

            if (bossCurrentHp <= 0) {
                await client.query('ROLLBACK');
                return { error: true, message: "Этот босс уже повержен! Ожидайте сброса таймера." };
            }
        } else {
            if (!gameData.local_boss_hp) gameData.local_boss_hp = {};
            if (gameData.local_boss_hp[bossKey] === undefined) {
                gameData.local_boss_hp[bossKey] = bossMeta.max_hp;
            }
            bossCurrentHp = Number(gameData.local_boss_hp[bossKey]);
            if (bossCurrentHp <= 0) {
                await client.query('ROLLBACK');
                return { error: true, message: "Вы уже победили этого соло-босса!" };
            }
        }

        // Вызов общей бизнес-логики симуляции
        const dbPlayerVirtual = { game_data: gameData, ...gameData };
        const simPayload = runBossSimulation(dbPlayerVirtual, bossMeta, bossCurrentHp, gameConfig, bossKey);
        if (simPayload.error) { await client.query('ROLLBACK'); return simPayload; }

        const { battleResult, totalDamageDealtToBoss, nextBossHp } = simPayload;

        if (bossMeta.boss_type === 'server' || bossMeta.boss_type === 'guild') {
            damagePool[userId] = (damagePool[userId] || 0) + totalDamageDealtToBoss;
            await client.query(`
                UPDATE global_boss_states 
                SET current_hp = $1, total_damage_pool = $2, updated_at = CURRENT_TIMESTAMP
                WHERE game_id = $3 AND server_id = $4 AND boss_key = $5;
            `, [nextBossHp, JSON.stringify(damagePool), gameId, serverId, bossKey]);
        } else {
            gameData.local_boss_hp[bossKey] = nextBossHp;
        }

        let rewardReport = { resources: {}, items: {} };
        const tierRewards = bossMeta.rewards_by_tier || [];
        let activeTier = null;

        for (let i = tierRewards.length - 1; i >= 0; i--) {
            if (totalDamageDealtToBoss >= tierRewards[i].min_dmg) {
                activeTier = tierRewards[i];
                break;
            }
        }

        if (activeTier) {
            if (activeTier.resources) {
                Object.entries(activeTier.resources).forEach(([resKey, amount]) => {
                    currentResources[resKey] = (currentResources[resKey] || 0) + amount;
                    rewardReport.resources[resKey] = amount;
                });
            }
            if (activeTier.items) {
                if (!player.inventory) player.inventory = {};
                activeTier.items.forEach(drop => {
                    player.inventory[drop.itemId] = (parseInt(player.inventory[drop.itemId]) || 0) + (drop.amount || 1);
                    rewardReport.items[drop.itemId] = (parseInt(rewardReport.items[drop.itemId]) || 0) + (drop.amount || 1);
                });
            }
        }

        // Фиксируем изменения игрока в Редисе. Lazy Write сбросит профиль в БД.
        await Cache.setPlayer(userId, serverId, player);

        return {
            success: true,
            win: nextBossHp <= 0,
            replay: battleResult.replay,
            rewards: rewardReport,
            resources: resources,
            next_stage: null,
            boss_stats: {
                boss_key: bossKey,
                total_damage_dealt: totalDamageDealtToBoss,
                current_hp: nextBossHp,
                max_hp: bossMeta.max_hp
            }
        };

    } catch (cacheErr) {
        console.warn('[BattleDB:Boss] Сбой Redis в процессе боя, падаю в Postgres Fallback:', cacheErr);
    }
}

/**
 * Получить статусы здоровья боссов сервера (Сначала из Redis, иначе Postgres Fallback)
 */
async function getBossStatuses(serverId, gameId, gameConfig) {
    const bossesConfig = gameConfig.pve_bosses;
    const statuses = {};

    // ------------------------------------------------------------------------
    // ЭШЕЛОН 1: БЫСТРЫЙ ПУТЬ ЧЕРЕЗ REDIS (Считываем хэши боссов из RAM)
    // ------------------------------------------------------------------------
    if (redisClient.isOpen && redisClient.isReady) {
        try {
            let allCachedFound = true;

            for (const [bossKey, boss] of Object.entries(bossesConfig)) {
                if (boss.boss_type === 'server' || boss.boss_type === 'guild') {
                    const globalBossKey = `b:state:${gameId}:${serverId}:${bossKey}`;
                    const bHp = await redisClient.hGet(globalBossKey, 'current_hp');

                    if (bHp !== null) {
                        statuses[bossKey] = Number(bHp);
                    } else {
                        // Если хотя бы одного босса нет в кэше Редиса — сбрасываем флаг,
                        // чтобы сработал холодный старт через Postgres Fallback
                        allCachedFound = false;
                        break;
                    }
                } else {
                    // Соло боссы не выводятся в глобальные статусы, пропускаем их
                    continue;
                }
            }

            if (allCachedFound && Object.keys(statuses).length > 0) {
                return statuses;
            }
        } catch (cacheErr) {
            console.warn('[BattleDB:GetBossStatuses] Сбой Redis, переключаюсь на Postgres:', cacheErr);
        }
    }

    // ------------------------------------------------------------------------
    // ЭШЕЛОН 2: ТВОЙ СТАРЫЙ ОРИГИНАЛЬНЫЙ SQL FALLBACK С ХОЛОДНЫМ СТАРТОМ И СУБД
    // ------------------------------------------------------------------------
    const client = await global.pool.connect();
    try {
        await client.query('BEGIN');

        // ХОЛОДНЫЙ СТАРТ: Проверяем каждого глобального босса из конфига админки
        for (const [bossKey, boss] of Object.entries(bossesConfig)) {
            if (boss.boss_type === 'server' || boss.boss_type === 'guild') {
                await client.query(`
                    INSERT INTO global_boss_states (game_id, server_id, boss_key, current_hp, total_damage_pool)
                    VALUES ($1, $2, $3, $4, '{}'::jsonb)
                    ON CONFLICT (game_id, server_id, boss_key) DO NOTHING;
                `, [gameId, serverId, bossKey, boss.max_hp]);
            }
        }

        await client.query('COMMIT');

        // Теперь спокойно делаем SELECT — база гарантированно вернет актуальные строки для всех боссов
        const query = `
            SELECT boss_key, current_hp 
            FROM global_boss_states 
            WHERE game_id = $1 AND server_id = $2;
        `;
        const { rows } = await global.pool.query(query, [gameId, serverId]);

        const dbStatuses = {};
        rows.forEach(r => {
            dbStatuses[r.boss_key] = Number(r.current_hp);

            // Заодно прогреваем Редис на будущее, чтобы при следующем запросе разгрузить СУБД
            if (redisClient.isOpen && redisClient.isReady) {
                const globalBossKey = `b:state:${gameId}:${serverId}:${r.boss_key}`;
                redisClient.hSet(globalBossKey, 'current_hp', String(r.current_hp));
            }
        });

        return dbStatuses;

    } catch (e) {
        await client.query('ROLLBACK');
        console.error("[Fallback Boss Statuses Error]:", e);
        return { error: true, message: e.message };
    } finally {
        client.release();
    }
}




module.exports = {
    processPvEBattle,
    processPvPBattle,
    getArenaOpponents,
    getArenaLeaderboard,
    processBossBattle,
    getBossStatuses,
};













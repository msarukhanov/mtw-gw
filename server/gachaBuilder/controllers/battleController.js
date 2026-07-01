const { gamesConfigDB } = require('../db/configDB');
const virtualArena = require('../battles/virtualArena');
const battleDB = require('../db/battleDB');
const questsDB = require('../db/questsDB');
const { handlePlayerTurn } = require('../battles/pve');

exports.pve = async function (req, res) {
    try {
        // Данные авторизации забираем из мидлвейра
        const { id: userId, serverId, gameId, username, deviceId } = req.player;

        // Из тела запроса берем параметры активности
        const { type, stage, towerKey, params } = req.body;

        if (!type || !stage) {
            return res.status(400).json({ error: "Отсутствуют обязательные параметры: type или stage" });
        }

        const gameConfig = gamesConfigDB[gameId];
        if (!gameConfig) return res.status(400).json({ error: "Конфигурация игры не найдена" });

        // Передаем управление в сервисный файл БД
        const result = await battleDB.processPvEBattle(
            userId, serverId, gameConfig, type, stage, towerKey, params
        );

        if (result.error) return res.status(400).json({ error: result.message });

        switch (type) {
            case 'campaign':
                await questsDB.incrementQuestTask(userId, serverId, gameId, 'fight_campaign_stage', 1);
                break;
            case 'tower':
                await questsDB.incrementQuestTask(userId, serverId, gameId, 'fight_tower_floor', 1);
                break;
        }

        return res.json(result);

    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: e.message, msg: '[Battle:PvE] Critical error' });
    }
};

exports.pveTurn = async function (req, res) {
    try {
        // Данные авторизации забираем из мидлвейра auth
        const { id: userId, serverId, gameId } = req.player;

        // Из тела запроса берем только параметры самого боевого действия
        const { battleId, reqHeroId, reqSkillId } = req.body;

        // Валидация входных данных для совершения хода
        if (!battleId || !reqHeroId || !reqSkillId) {
            return res.status(400).json({
                error: "Отсутствуют обязательные параметры хода: battleId, reqHeroId или reqSkillId"
            });
        }

        const gameConfig = gamesConfigDB[gameId];
        if (!gameConfig) {
            return res.status(400).json({ error: "Конфигурация игры не найдена" });
        }

        // Передаем управление в сервисный слой, который мы написали ранее
        const result = await handlePlayerTurn(
            userId, serverId, battleId, reqHeroId, reqSkillId, gameConfig
        );

        if (result.error) {
            return res.status(400).json({ error: result.message });
        }

        // Возвращаем фронтенду ваш утвержденный объект { battle_id, win, end, total_rounds, replay, turn_list }
        return res.json(result);

    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: e.message, msg: '[Battle:PvE:Turn] Critical error' });
    }
};


exports.pvp = async function (req, res) {
    try {
        // Данные авторизации из мидлвейра
        const { id: userId, serverId, gameId } = req.player;
        const { opponentId } = req.body;

        if (userId === opponentId) {
            return res.status(400).json({ error: "Нельзя атаковать самого себя" });
        }
        if (!opponentId) {
            return res.status(400).json({ error: "Не указан ID оппонента (opponentId)" });
        }

        const gameConfig = gamesConfigDB[gameId];
        if (!gameConfig) return res.status(400).json({ error: "Конфигурация игры не найдена" });

        // Вызываем гибридный PvP метод из сервиса
        const result = await battleDB.processPvPBattle(
            userId, serverId, gameConfig, opponentId
        );

        if (result.error) return res.status(400).json({ error: result.message });

        await questsDB.incrementQuestTask(userId, serverId, gameId, 'fight_pvp_battle', 1);

        return res.json(result);

    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: e.message, msg: '[Battle:PvP] Critical error' });
    }
};

// --- ПОЛУЧЕНИЕ СПИСКА СОПЕРНИКОВ ДЛЯ АРЕНЫ ---
exports.getOpponents = async function (req, res) {
    try {
        const { id: userId, serverId } = req.player;

        // Вызываем гибридный метод из сервиса
        const responseData = await battleDB.getArenaOpponents(userId, serverId);

        if (responseData.error) return res.status(400).json({ error: responseData.message });
        return res.json(responseData);

    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: e.message, msg: '[Battle:GetOpponents] Critical error' });
    }
};

// --- ПОЛУЧЕНИЕ ТОП ИГРОКОВ (ЛИДЕРБОРД АРЕНЫ) ---
exports.getLeaderboard = async function (req, res) {
    try {
        const { serverId } = req.player;

        // Вызываем гибридный метод из сервиса
        const topPlayers = await battleDB.getArenaLeaderboard(serverId);

        if (topPlayers.error) return res.status(400).json({ error: topPlayers.message });
        return res.json(topPlayers);

    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: e.message, msg: '[Battle:Leaderboard] Critical error' });
    }
};

// --- БОЙ С БОССОМ (СОЛО ИЛИ МИРОВОЙ/ГИЛЬДЕЙСКИЙ) ---
exports.boss = async function (req, res) {
    try {
        // Данные авторизации забираем из мидлвейра auth
        const { id: userId, serverId, gameId } = req.player;
        // Из тела запроса берем только ключ босса
        const { bossKey } = req.body;

        if (!bossKey) {
            return res.status(400).json({ error: "Параметр bossKey обязателен" });
        }

        const gameConfig = gamesConfigDB[gameId];
        if (!gameConfig) return res.status(400).json({ error: "Конфигурация игры не найдена" });

        // Передаем управление в сервисный файл БД
        const result = await battleDB.processBossBattle(
            userId, serverId, gameId, gameConfig, bossKey
        );

        if (result.error) return res.status(400).json({ error: result.message });

        // switch (type) {
        //     case 'campaign':
        //         await questsDB.incrementQuestTask(userId, serverId, gameId, 'fight_campaign_stage', 1);
        //         break;
        //     case 'tower':
        //         await questsDB.incrementQuestTask(userId, serverId, gameId, 'fight_tower_floor', 1);
        //         break;
        // }

        await questsDB.incrementQuestTask(userId, serverId, gameId, 'fight_boss_fight', 1);

        return res.json(result);

    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: e.message, msg: '[Battle:Boss] Critical error' });
    }
};

// --- ПОЛУЧЕНИЕ СТАТУСОВ ЗДОРОВЬЯ МИРОВЫХ БОССОВ ---
exports.getBossStatuses = async function (req, res) {
    try {
        const { serverId, gameId } = req.player;
        const gameConfig = gamesConfigDB[gameId];

        if (!gameConfig || !gameConfig.pve_bosses) {
            return res.json({});
        }

        // Вызываем гибридный метод из сервиса
        const statuses = await battleDB.getBossStatuses(serverId, gameId, gameConfig);

        if (statuses.error) return res.status(400).json({ error: statuses.message });
        return res.json(statuses);

    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: e.message, msg: '[Battle:GetBossStatuses] Critical error' });
    }
};


exports.getArenaMatches = async function (req, res) {
    try {
        const { serverId, gameId } = req.player;
        const partnerId = req.player.partnerId || 'demo_mtwtech';

        const query = `
            SELECT match_id, league, teams, status, minute, score_home, score_away, markets, ball_zone 
            FROM b2b_pvp_arena_matches 
            WHERE partner_id = $1 AND game_id = $2 AND server_id = $3 AND status != 'FINISHED'
            ORDER BY id ASC;
        `;
        const { rows } = await global.pool.query(query, [partnerId, gameId, serverId]);
        return res.json(rows);
    } catch (e) {
        console.error("[Arena API Ошибка получения линии]:", e);
        return res.status(500).json({ error: e.message });
    }
};

exports.getArenaLineRoute = async function (req, res) {
    try {
        const serverId = String(req.query.serverId || req.player.serverId);
        const gameId = req.query.gameId;
        const partnerId = req.query.partnerId || 'demo_mtwtech';

        if (!serverId || !gameId) {
            return res.status(400).json({ error: "Missing serverId or gameId parameters" });
        }

        const line = await virtualArena.getArenaLine(partnerId, gameId, serverId);
        return res.json(line);
    } catch (e) {
        console.error("[Arena API Line Error]:", e);
        return res.status(500).json({ error: e.message });
    }
};

// 2. Контроллер приёма ставок на БК
exports.placeArenaBetRoute = async function (req, res) {
    try {
        const serverId = String(req.query.serverId || req.body.serverId);
        const gameId = req.query.gameId;
        const partnerId = req.query.partnerId || 'demo_mtwtech';

        // Извлекаем username из тела запроса (как на твоем фронте: payload.username)
        const { username, items, stake, totalOdds } = req.body;

        if (!serverId || !gameId) {
            return res.status(400).json({ error: "Missing serverId or gameId query parameters" });
        }

        const betData = { items, stake, totalOdds };

        // Вызываем переработанный под БК метод
        const result = await virtualArena.createSportsBet(username, partnerId, betData, gameId, serverId);

        return res.json({ success: true, bet: result });
    } catch (e) {
        console.error("[Arena API Bet Error]:", e);
        return res.status(400).json({ error: e.message });
    }
};

// 3. Тестовый триггер генерации сетки (чтобы не ждать крон)
exports.triggerArenaGeneration = async function (req, res) {
    try {
        const { serverId, gameId, partnerId } = req.body;
        const GameConfig = global.gamesConfigDB?.[gameId] || {}; // Твой глобальный конфиг игры

        await virtualArena.generateDailySchedule(partnerId || 'demo_mtwtech', gameId, serverId, GameConfig);

        return res.json({ success: true, message: "Сетка на 256 участников успешно создана!" });
    } catch (e) {
        console.error("[Arena API Gen Error]:", e);
        return res.status(500).json({ error: e.message });
    }
};



// exports.pve = async function (req, res) {
//     const client = await pool.connect();
//     try {
//         const { id: userId, serverId, gameId, username, deviceId } = req.player;
//         const { type, stage, towerKey } = req.body; // towerKey: 'main_tower' | 'faction_light'
//
//         const GameConfig = gamesConfigDB[gameId];
//         if (!GameConfig) return res.status(400).json({ error: "Config not found" });
//
//         await client.query('BEGIN');
//
//         // Блокируем строку профиля
//         const { rows } = await client.query(
//             `SELECT resources, game_data FROM player_server_profiles WHERE user_id = $1 AND server_id = $2 FOR UPDATE;`,
//             [userId, serverId]
//         );
//         if (rows.length === 0) {
//             await client.query('ROLLBACK');
//             return res.status(404).json({ error: "Player profile not found" });
//         }
//
//         let currentResources = rows[0].resources || {};
//         let gameData = rows[0].game_data || {};
//
//         // Инициализация структуры прогресса, если её не было
//         if (!gameData.pve_progress) {
//             gameData.pve_progress = { campaign: "stage_1_1", towers: {} };
//         }
//         if (!gameData.pve_progress.towers) gameData.pve_progress.towers = {};
//
//         let stageConfig = null;
//         let teamKey = '';
//
//         if (type === 'campaign') {
//             // Ключ команды в БД должен строго совпадать с тем, что шлет фронтенд
//             teamKey = 'pve_main';
//             stageConfig = GameConfig.pve_campaign?.stages?.[stage];
//
//             // Защита прогресса
//             if (gameData.pve_progress?.campaign !== stage) {
//                 await client.query('ROLLBACK');
//                 return res.status(400).json({ error: "Этот этап кампании еще заблокирован" });
//             }
//         }
//         else if (type === 'tower') {
//             if (!towerKey) {
//                 await client.query('ROLLBACK');
//                 return res.status(400).json({ error: "Не указан ключ башни (towerKey)" });
//             }
//
//             // ИСПРАВЛЕНИЕ: Ключ команды для башни должен быть точно таким же, как на фронте!
//             teamKey = `tower_${towerKey}`;
//             stageConfig = GameConfig.pve_towers?.[towerKey]?.floors?.[stage];
//
//             const currentFloor = gameData.pve_progress?.towers?.[towerKey] || 1;
//             const targetFloorNum = parseInt(stage.replace(/^\D+/g, '')) || 1;
//
//             if (currentFloor !== targetFloorNum) {
//                 await client.query('ROLLBACK');
//                 return res.status(400).json({ error: "Этот этаж башни заблокирован" });
//             }
//         }
//         else {
//             await client.query('ROLLBACK');
//             return res.status(400).json({ error: "Неверный тип PvE активности" });
//         }
//
//         if (!stageConfig) {
//             await client.query('ROLLBACK');
//             return res.status(404).json({ error: `Конфигурация уровня ${stage} не найдена` });
//         }
//
//         // --- ПРОВЕРКА И СПИСАНИЕ ЭНЕРГИИ ---
//         if (stageConfig.energy_cost && stageConfig.energy_cost > 0) {
//             const currentEnergy = currentResources.energy || 0;
//             if (currentEnergy < stageConfig.energy_cost) {
//                 await client.query('ROLLBACK');
//                 return res.status(400).json({ error: "Недостаточно энергии для начала боя" });
//             }
//             // Списываем энергию локально перед боем
//             currentResources.energy -= stageConfig.energy_cost;
//         }
//
//         const playerHeroIds = gameData.teams?.[teamKey] || gameData[teamKey] || [];
//
//         if (playerHeroIds.length === 0) {
//             await client.query('ROLLBACK');
//             return res.status(400).json({
//                 error: `Команда для этого режима пуста (Искали ключ: "${teamKey}")`
//             });
//         }
//
//         // Внутри твоего файла контроллера (блок сборки статов игрока):
//         const playerTeamStats = [];
//         for (const instId of playerHeroIds) {
//             const heroInstance = gameData.heroes?.find(h => h.instance_id === instId);
//             if (heroInstance) {
//                 // 1. Получаем чистые статы (которые теперь гарантированно являются клоном)
//                 let rawStats = getHeroActualStats(heroInstance, { config: GameConfig });
//
//                 // 2. Делаем глубокую копию объекта статов для этого конкретного боя
//                 let combatStats = { ...rawStats };
//
//                 // 3. Безопасно накладываем фракционный бонус отряда
//                 const teamBonus = gameData.team_bonuses?.[teamKey];
//                 if (teamBonus) {
//                     if (teamBonus.hp && teamBonus.hp.endsWith('%')) {
//                         const percent = parseFloat(teamBonus.hp) / 100;
//                         combatStats.hp += combatStats.hp * percent;
//                     }
//                     if (teamBonus.atk && teamBonus.atk.endsWith('%')) {
//                         const percent = parseFloat(teamBonus.atk) / 100;
//                         combatStats.atk += combatStats.atk * percent;
//                     }
//                 }
//
//                 playerTeamStats.push(combatStats);
//             }
//         }
//
//         const enemyTeamStats = [];
//         const enemyUnits = stageConfig.enemies || [];
//
//         enemyUnits.forEach(enemy => {
//             // ИСПРАВЛЕНИЕ: Читаем строго enemy.hero_id, как заложено в твоем каталоге!
//             const targetHeroId = enemy.hero_id || enemy.enemy_id;
//             const proto = GameConfig.catalog?.heroes?.[targetHeroId];
//
//             if (proto) {
//                 // Создаем изолированный виртуальный объект врага для getHeroActualStats
//                 const virtualEnemy = {
//                     hero_id: targetHeroId,
//                     level: Number(enemy.level) || 1,
//                     stars: Number(enemy.stars) || Number(proto.base_stars) || 1,
//                     equipped: {} // у мобов по дефолту шмота нет
//                 };
//
//                 // Вызываем нашу безопасную функцию чистых статов
//                 let stats = getHeroActualStats(virtualEnemy, { config: GameConfig });
//                 if (stats) {
//                     stats.position = enemy.position; // привязываем позицию на поле боя
//                     enemyTeamStats.push(stats);
//                 }
//             } else {
//                 console.error(`[PvE БОЙ]: Прототип врага "${targetHeroId}" не найден в каталоге heroes!`);
//             }
//         });
//
//         // Финальная проверка: если массив всё ещё пуст, значит в конфиге этапа опечатка в ID героя
//         if (enemyTeamStats.length === 0) {
//             await client.query('ROLLBACK');
//             return res.status(400).json({
//                 error: `Ошибка конфигурации этапа: не удалось загрузить ни одного врага для этапа ${stage}`
//             });
//         }
//
//         // --- РАСЧЕТ БОЯ ---
//         const battleResult = await simulatePvEBattle(playerTeamStats, enemyTeamStats, GameConfig);
//
//         let rewardReport = { resources: {}, items: {} };
//
//         if (battleResult.win) {
//             // 1. Начисление ресурсов (валют) в колонку resources
//             if (stageConfig.rewards?.resources) {
//                 Object.entries(stageConfig.rewards.resources).forEach(([resKey, amount]) => {
//                     currentResources[resKey] = (currentResources[resKey] || 0) + amount;
//                     rewardReport.resources[resKey] = amount;
//                 });
//             }
//
//             // 2. Начисление предметов в СЛОВАРНЫЙ инвентарь (Без инстансов!)
//             if (stageConfig.rewards?.items) {
//                 if (!gameData.inventory) gameData.inventory = {};
//
//                 stageConfig.rewards.items.forEach(drop => {
//                     const chance = drop.chance !== undefined ? drop.chance : 1.0;
//                     if (Math.random() <= chance) {
//                         // Просто инкрементируем количество в словаре
//                         gameData.inventory[drop.itemId] = (gameData.inventory[drop.itemId] || 0) + (drop.amount || 1);
//
//                         rewardReport.items[drop.itemId] = (rewardReport.items[drop.itemId] || 0) + (drop.amount || 1);
//                     }
//                 });
//             }
//
//             // 3. Сдвиг прогресса строк
//             if (type === 'campaign') {
//                 const currentNum = parseInt(stage.split('_')[2]); // stage_1_1 -> 1
//                 const chapterNum = parseInt(stage.split('_')[1]); // stage_1_1 -> 1
//                 const nextStageKey = `stage_${chapterNum}_${currentNum + 1}`;
//
//                 if (GameConfig.pve_campaign?.stages?.[nextStageKey]) {
//                     gameData.pve_progress.campaign = nextStageKey;
//                 } else {
//                     const nextChapterKey = `stage_${chapterNum + 1}_1`;
//                     if (GameConfig.pve_campaign?.stages?.[nextChapterKey]) {
//                         gameData.pve_progress.campaign = nextChapterKey;
//                     }
//                 }
//             }
//             else if (type === 'tower') {
//                 const currentFloorNum = parseInt(stage.replace(/^\D+/g, ''));
//                 gameData.pve_progress.towers[towerKey] = currentFloorNum + 1;
//             }
//         }
//
//         // Записываем всё за один атомарный запрос
//         const updateQuery = `
//             UPDATE player_server_profiles
//             SET resources = $3, game_data = $4, updated_at = CURRENT_TIMESTAMP
//             WHERE user_id = $1 AND server_id = $2;
//         `;
//         await client.query(updateQuery, [userId, serverId, JSON.stringify(currentResources), JSON.stringify(gameData)]);
//         await client.query('COMMIT');
//
//         return res.json({
//             success: true,
//             win: battleResult.win,
//             replay: battleResult.replay,
//             rewards: rewardReport,
//             resources: currentResources,
//             next_stage: type === 'campaign' ? gameData.pve_progress.campaign : gameData.pve_progress.towers[towerKey]
//         });
//
//     } catch (e) {
//         await client.query('ROLLBACK');
//         console.error("Критическая ошибка PvE боя:", e);
//         return res.status(500).json({ error: e.message });
//     } finally {
//         client.release();
//     }
// };
//
// exports.getOpponents = async function (req, res) {
//     try {
//         const { id: userId, serverId, gameId } = req.player;
//
//         // КРИТИЧЕСКИЙ ФИКС 1: Явно вытаскиваем game_data из PostgreSQL,
//         // чтобы фронтенд знал, какие именно герои стоят в защите у соперников!
//         const query = `
//             SELECT user_id, nickname, level, combat_power, game_data
//             FROM player_server_profiles
//             WHERE server_id = $1 AND user_id != $2
//             LIMIT 5;
//         `;
//         const { rows } = await global.pool.query(query, [serverId, userId]);
//
//         // Маппим данные, отдавая наружу плоскую карточку оппонента и его героев
//         const responseData = rows.map(opp => ({
//             user_id: opp.user_id,
//             nickname: opp.nickname,
//             level: opp.level,
//             combat_power: opp.combat_power,
//             // Передаем массив героев из JSONB, чтобы preBattle прочитал их
//             heroes: opp.game_data?.heroes || []
//         }));
//
//         return res.json(responseData);
//     } catch (e) {
//         console.error("[PvP API Ошибка списка соперников]:", e);
//         return res.status(500).json({ error: e.message });
//     }
// };
//
// exports.pvp = async function (req, res) {
//     const client = await pool.connect();
//     try {
//         const { id: userId, serverId, gameId } = req.player;
//         const { opponentId } = req.body;
//
//         if (userId === opponentId) return res.status(400).json({ error: "Нельзя атаковать самого себя" });
//
//         const GameConfig = gamesConfigDB[gameId];
//         if (!GameConfig) return res.status(400).json({ error: "Config database not found" });
//
//         await client.query('BEGIN');
//
//         // Сортировка ID для полного исключения Deadlock при FOR UPDATE
//         const idOrder = [userId, opponentId].sort();
//         const selectQuery = `
//             SELECT user_id, resources, game_data, combat_power, nickname
//             FROM player_server_profiles
//             WHERE user_id IN ($1, $2) AND server_id = $3 FOR UPDATE;
//         `;
//         const { rows } = await client.query(selectQuery, [...idOrder, serverId]);
//
//         // const attackerRow = rows.find(r => r.user_id === userId);
//         const attackerRow = rows.find(o => String(o.user_id) === String(userId));
//         // const defenderRow = rows.find(r => r.user_id === opponentId);
//         const defenderRow = rows.find(o => String(o.user_id) === String(opponentId));
//
//         if (!attackerRow || !defenderRow) {
//             await client.query('ROLLBACK');
//             return res.status(404).json({ error: "Один из профилей игроков не найден в базе данных" });
//         }
//
//         let attackerGameData = attackerRow.game_data || {};
//         let defenderGameData = defenderRow.game_data || {};
//
//         let attackerResources = attackerRow.resources || {};
//         let defenderResources = defenderRow.resources || {};
//
//         // Обе стороны берут свои команды из метаданных pve_main
//         const attackerHeroIds = attackerGameData.teams?.pve_main || [];
//         const defenderHeroIds = defenderGameData.teams?.pve_main || [];
//
//         if (attackerHeroIds.length === 0) {
//             await client.query('ROLLBACK');
//             return res.status(400).json({ error: "Ваш атакующий отряд пуст" });
//         }
//         if (defenderHeroIds.length === 0) {
//             await client.query('ROLLBACK');
//             return res.status(400).json({ error: "Защитный отряд выбранного оппонента пуст" });
//         }
//
//         // Сборка чистых характеристик Атакующего (Игрок)
//         const attackerTeamStats = [];
//         attackerHeroIds.forEach(instId => {
//             const heroInstance = attackerGameData.heroes?.find(h => h.instance_id === instId);
//             if (heroInstance) {
//                 let stats = { ...getHeroActualStats(heroInstance, { config: GameConfig }) };
//                 const teamBonus = attackerGameData.team_bonuses?.pve_main;
//                 if (teamBonus) {
//                     if (teamBonus.hp?.endsWith('%')) stats.hp *= (1 + parseFloat(teamBonus.hp) / 100);
//                     if (teamBonus.atk?.endsWith('%')) stats.atk *= (1 + parseFloat(teamBonus.atk) / 100);
//                 }
//                 attackerTeamStats.push(stats);
//             }
//         });
//
//         // Сборка чистых характеристик Защищающегося (Оппонент)
//         const defenderTeamStats = [];
//         defenderHeroIds.forEach((instId, index) => {
//             const heroInstance = defenderGameData.heroes?.find(h => h.instance_id === instId);
//             if (heroInstance) {
//                 let stats = { ...getHeroActualStats(heroInstance, { config: GameConfig }) };
//                 const teamBonus = defenderGameData.team_bonuses?.pve_main;
//                 if (teamBonus) {
//                     if (teamBonus.hp?.endsWith('%')) stats.hp *= (1 + parseFloat(teamBonus.hp) / 100);
//                     if (teamBonus.atk?.endsWith('%')) stats.atk *= (1 + parseFloat(teamBonus.atk) / 100);
//                 }
//                 stats.position = index;
//                 defenderTeamStats.push(stats);
//             }
//         });
//
//         // Расчет автобоя через единый пошаговый симулятор раундов
//         const battleResult = await simulatePvEBattle(attackerTeamStats, defenderTeamStats, GameConfig);
//
//         let ratingChange = 15;
//         if (!attackerResources.arena_rating) attackerResources.arena_rating = 1000;
//         if (!defenderResources.arena_rating) defenderResources.arena_rating = 1000;
//
//         let rewardReport = { resources: {} };
//
//         if (battleResult.win) {
//             attackerResources.arena_rating += ratingChange;
//             defenderResources.arena_rating = Math.max(0, defenderResources.arena_rating - ratingChange);
//
//             attackerResources.gold = (attackerResources.gold || 0) + 300;
//             rewardReport.resources.gold = 300;
//             rewardReport.resources.arena_rating = `+${ratingChange}`;
//         } else {
//             attackerResources.arena_rating = Math.max(0, attackerResources.arena_rating - ratingChange);
//             defenderResources.arena_rating += ratingChange;
//
//             rewardReport.resources.arena_rating = `-${ratingChange}`;
//         }
//
//         const nowTimestamp = Date.now();
//
//         // Запись истории матча Атакующему (Игрок)
//         if (!attackerGameData.match_history) attackerGameData.match_history = [];
//         attackerGameData.match_history.unshift({
//             timestamp: nowTimestamp,
//             game_id: "PvP_Arena",
//             stake: { arena_rating: ratingChange },
//             prize: battleResult.win ? { gold: 300 } : null,
//             status: battleResult.win ? "WIN" : "LOSE",
//             description: `vs ${defenderRow.nickname || 'Player'}`
//         });
//         if (attackerGameData.match_history.length > 20) attackerGameData.match_history.pop();
//
//         // КРИТИЧЕСКИЙ ФИКС 2: Записываем зеркальную историю матча ВТОРОМУ пользователю (Защитнику)!
//         if (!defenderGameData.match_history) defenderGameData.match_history = [];
//         defenderGameData.match_history.unshift({
//             timestamp: nowTimestamp,
//             game_id: "PvP_Arena",
//             stake: { arena_rating: ratingChange },
//             prize: battleResult.win ? null : { gold: 300 }, // если нападающий проиграл, защитник мог бы что-то получить
//             status: battleResult.win ? "LOSE" : "WIN",      // Статус инвертируется зеркально!
//             description: `Defended vs ${attackerRow.nickname || 'Player'}`
//         });
//         if (defenderGameData.match_history.length > 20) defenderGameData.match_history.pop();
//
//         // Атомарно сохраняем обновленные данные ОБОИХ игроков в СУБД за один запрос
//         const updateAttackerQuery = `UPDATE player_server_profiles SET resources = $3, game_data = $4 WHERE user_id = $1 AND server_id = $2 RETURNING *;`;
//         const { rows: updateAttackerRows } = await client.query(updateAttackerQuery, [userId, serverId, JSON.stringify(attackerResources), JSON.stringify(attackerGameData)]);
//
//         const updateDefenderQuery = `UPDATE player_server_profiles SET resources = $3, game_data = $4 WHERE user_id = $1 AND server_id = $2;`;
//         await client.query(updateDefenderQuery, [opponentId, serverId, JSON.stringify(defenderResources), JSON.stringify(defenderGameData)]);
//
//         await client.query('COMMIT');
//
//         const finalProfile = updateAttackerRows[0];
//
//         // КРИТИЧЕСКИЙ ФИКС 3: Ответ возвращает структуру ОДИН В ОДИН как в PvE!
//         // Передаем resources, game_data разворачиваем наружу и явно дописываем next_stage: null
//         return res.json({
//             success: true,
//             win: battleResult.win,
//             replay: battleResult.replay,
//             rewards: rewardReport,
//             resources: attackerResources, // Текущие обновленные ресурсы из Postgres
//             next_stage: null              // На Арене нет следующего этапа, кнопка NEXT заблокируется
//         });
//
//     } catch (e) {
//         await client.query('ROLLBACK');
//         console.error("[PvP Блокирующий расчет боя провалился]:", e);
//         return res.status(500).json({ error: e.message });
//     } finally {
//
//         client.release();
//     }
// };
//
// exports.boss = async function (req, res) {
//     const client = await pool.connect();
//     try {
//         const { id: userId, serverId, gameId } = req.player;
//         const { bossKey } = req.body; // Получаем ключ босса с фронтенда
//
//         const GameConfig = gamesConfigDB[gameId];
//         if (!GameConfig) return res.status(400).json({ error: "Config database not found" });
//
//         const bossMeta = GameConfig.pve_bosses?.[bossKey];
//         if (!bossMeta) return res.status(404).json({ error: "Конфигурация босса не найдена" });
//
//         await client.query('BEGIN');
//
//         // 1. БЛОКИРУЕМ СТРОКУ ИГРОКА И СТРОКУ БОССА (Защита от race condition при коллективном уроне)
//         const { rows: pRows } = await client.query(
//             `SELECT resources, game_data FROM player_server_profiles WHERE user_id = $1 AND server_id = $2 FOR UPDATE;`,
//             [userId, serverId]
//         );
//         if (pRows.length === 0) {
//             await client.query('ROLLBACK');
//             return res.status(404).json({ error: "Профиль игрока не найден" });
//         }
//
//         let currentResources = pRows[0].resources || {};
//         let gameData = pRows[0].game_data || {};
//
//         // Инициализируем или достаем текущее здоровье босса из глобальной таблицы
//         let bossCurrentHp = Number(bossMeta.max_hp);
//         let damagePool = {};
//
//         if (bossMeta.boss_type === 'server' || bossMeta.boss_type === 'guild') {
//             // Инициализируем строку босса, если её ещё нет в БД (UPSERT)
//             await client.query(`
//                 INSERT INTO global_boss_states (game_id, server_id, boss_key, current_hp, total_damage_pool)
//                 VALUES ($1, $2, $3, $4, '{}'::jsonb)
//                 ON CONFLICT (game_id, server_id, boss_key) DO NOTHING;
//             `, [gameId, serverId, bossKey, bossMeta.max_hp]);
//
//             // Блокируем строку босса для безопасного вычитания HP
//             const { rows: bRows } = await client.query(`
//                 SELECT current_hp, total_damage_pool FROM global_boss_states
//                 WHERE game_id = $1 AND server_id = $2 AND boss_key = $3 FOR UPDATE;
//             `, [gameId, serverId, bossKey]);
//
//             bossCurrentHp = Number(bRows[0].current_hp);
//             damagePool = bRows[0].total_damage_pool || {};
//
//             if (bossCurrentHp <= 0) {
//                 await client.query('ROLLBACK');
//                 return res.status(400).json({ error: "Этот босс уже повержен! Ожидайте сброса таймера." });
//             }
//         }
//         else {
//             // Локальный соло-босс: его здоровье хранится внутри game_data самого игрока
//             if (!gameData.local_boss_hp) gameData.local_boss_hp = {};
//             if (gameData.local_boss_hp[bossKey] === undefined) {
//                 gameData.local_boss_hp[bossKey] = bossMeta.max_hp;
//             }
//             bossCurrentHp = Number(gameData.local_boss_hp[bossKey]);
//             if (bossCurrentHp <= 0) {
//                 await client.query('ROLLBACK');
//                 return res.status(400).json({ error: "Вы уже победили этого соло-босса!" });
//             }
//         }
//
//         // 2. СБОРКА ЧИСТЫХ СТАТОВ ОТРЯДА ИГРОКА (Из ключа pve_main)
//         const playerHeroIds = gameData.teams?.pve_main || [];
//         if (playerHeroIds.length === 0) {
//             await client.query('ROLLBACK');
//             return res.status(400).json({ error: "Ваш атакующий отряд пуст!" });
//         }
//
//         const playerTeamStats = [];
//         playerHeroIds.forEach(instId => {
//             const heroInstance = gameData.heroes?.find(h => h.instance_id === instId);
//             if (heroInstance) {
//                 let combatStats = { ...getHeroActualStats(heroInstance, { config: GameConfig }) };
//                 const teamBonus = gameData.team_bonuses?.pve_main;
//                 if (teamBonus) {
//                     if (teamBonus.hp?.endsWith('%')) combatStats.hp *= (1 + parseFloat(teamBonus.hp) / 100);
//                     if (teamBonus.atk?.endsWith('%')) combatStats.atk *= (1 + parseFloat(teamBonus.atk) / 100);
//                 }
//                 playerTeamStats.push(combatStats);
//             }
//         });
//
//         // 3. СБОРКА ХАРАКТЕРИСТИК БОССА (Босс — это один огромный юнит на стороне врага)
//         const bossProto = GameConfig.catalog?.heroes?.[bossMeta.hero_id];
//         if (!bossProto) {
//             await client.query('ROLLBACK');
//             return res.status(404).json({ error: "Прототип персонажа босса не найден в каталоге" });
//         }
//
//         // Генерируем виртуальный слепок босса с накрученным уровнем
//         const virtualBossHero = {
//             hero_id: bossMeta.hero_id,
//             level: bossMeta.level || 1,
//             stars: bossProto.base_stars || 1,
//             equipped: {}
//         };
//         let bossStats = { ...getHeroActualStats(virtualBossHero, { config: GameConfig }) };
//
//         // Перезаписываем его здоровье реальным текущим остатком из базы данных!
//         bossStats.hp = bossCurrentHp;
//         bossStats.position = 2; // Сажаем по центру в средний ряд врага
//
//         const enemyTeamStats = [bossStats];
//
//         // 4. ЗАПУСК НАШЕГО СТАБИЛЬНОГО СИМУЛЯТОРА БОЯ (Вариант А)
//         const battleResult = await simulatePvEBattle(playerTeamStats, enemyTeamStats, GameConfig);
//
//         // Считаем, сколько суммарного урона отряд игрока успел нанести боссу до своей смерти
//         let totalDamageDealtToBoss = 0;
//         battleResult.replay.forEach(round => {
//             round.actions.forEach(act => {
//                 if (act.attacker_id.startsWith('p') && act.target_id === 'e_0') {
//                     totalDamageDealtToBoss += Number(act.damage);
//                 }
//             });
//         });
//
//         // Корректируем урон, чтобы не вычесть больше, чем у босса было здоровья
//         if (totalDamageDealtToBoss > bossCurrentHp) {
//             totalDamageDealtToBoss = bossCurrentHp;
//         }
//
//         // Вычисляем новое здоровье босса после атаки
//         const nextBossHp = bossCurrentHp - totalDamageDealtToBoss;
//
//         // 5. СОХРАНЕНИЕ ПРОГРЕССА ЗДОРОВЬЯ И НАЧИСЛЕНИЕ ЛУТА ПО ТИРАМ НАГРАД
//         // =========================================================================
//         // ИСПРАВЛЕННЫЙ БЛОК 5: РАЗДЕЛЬНОЕ СОХРАНЕНИЕ HP (МИРОВОЙ vs СОЛО БОСС)
//         // =========================================================================
//         if (bossMeta.boss_type === 'server' || bossMeta.boss_type === 'guild') {
//             // А. Логика для Мировых/Клановых боссов — пишем в глобальную таблицу
//             damagePool[userId] = (damagePool[userId] || 0) + totalDamageDealtToBoss;
//
//             await client.query(`
//                 UPDATE global_boss_states
//                 SET current_hp = $1, total_damage_pool = $2, updated_at = CURRENT_TIMESTAMP
//                 WHERE game_id = $3 AND server_id = $4 AND boss_key = $5;
//             `, [nextBossHp, JSON.stringify(damagePool), gameId, serverId, bossKey]);
//
//         } else {
//             // Б. Логика для СОЛО-босса — пишем СТРОГО в game_data самого игрока!
//             if (!gameData.local_boss_hp) gameData.local_boss_hp = {};
//             gameData.local_boss_hp[bossKey] = nextBossHp;
//
//             console.log(`[БЭКЕНД СОЛО БОСС] Здоровье босса "${bossKey}" успешно обновлено в game_data игрока до: ${nextBossHp}`);
//         }
//
//         // --- МАТЕМАТИКА НАЧИСЛЕНИЯ ЛУТА ПО ТИРАМ НАГРАД ---
//         let rewardReport = { resources: {}, items: {} };
//         const tierRewards = bossMeta.rewards_by_tier || [];
//
//         let activeTier = null;
//         for (let i = tierRewards.length - 1; i >= 0; i--) {
//             if (totalDamageDealtToBoss >= tierRewards[i].min_dmg) {
//                 activeTier = tierRewards[i];
//                 break;
//             }
//         }
//
//         if (activeTier) {
//             if (activeTier.resources) {
//                 Object.entries(activeTier.resources).forEach(([resKey, amount]) => {
//                     currentResources[resKey] = (currentResources[resKey] || 0) + amount;
//                     rewardReport.resources[resKey] = amount;
//                 });
//             }
//             if (activeTier.items) {
//                 if (!gameData.inventory) gameData.inventory = {};
//                 activeTier.items.forEach(drop => {
//                     gameData.inventory[drop.itemId] = (gameData.inventory[drop.itemId] || 0) + (drop.amount || 1);
//                     rewardReport.items[drop.itemId] = (rewardReport.items[drop.itemId] || 0) + (drop.amount || 1);
//                 });
//             }
//         }
//
//         // Финальный коммит изменений игрока в PostgreSQL
//         const updatePlayerQuery = `
//             UPDATE player_server_profiles
//             SET resources = $3, game_data = $4, updated_at = CURRENT_TIMESTAMP
//             WHERE user_id = $1 AND server_id = $2;
//         `;
//         await client.query(updatePlayerQuery, [userId, serverId, JSON.stringify(currentResources), JSON.stringify(gameData)]);
//         await client.query('COMMIT');
//
//
//         // Отдаем клиенту результат по нашему строгому ПВЕ-шаблону
//         return res.json({
//             success: true,
//             win: nextBossHp <= 0, // Победа засчитывается только если босс упал в 0!
//             replay: battleResult.replay,
//             rewards: rewardReport,
//             resources: currentResources,
//             next_stage: null, // У боссов нет переключения на следующий этап внутри боя
//             boss_stats: {
//                 boss_key: bossKey,
//                 total_damage_dealt: totalDamageDealtToBoss,
//                 current_hp: nextBossHp,
//                 max_hp: bossMeta.max_hp
//             }
//         });
//
//     } catch (e) {
//         await client.query('ROLLBACK');
//         console.error("[БЭКЕНД БОСС КРИТ]:", e);
//         return res.status(500).json({ error: e.message });
//     } finally {
//         client.release();
//     }
// };
//
// exports.getBossStatuses = async function (req, res) {
//     const client = await pool.connect();
//     try {
//         const { serverId, gameId } = req.player;
//         const GameConfig = gamesConfigDB[gameId];
//
//         if (!GameConfig || !GameConfig.pve_bosses) {
//             return res.json({});
//         }
//
//         await client.query('BEGIN');
//
//         const bossesConfig = GameConfig.pve_bosses;
//
//         // ХОЛОДНЫЙ СТАРТ: Проверяем каждого глобального босса из конфига админки
//         for (const [bossKey, boss] of Object.entries(bossesConfig)) {
//             if (boss.boss_type === 'server' || boss.boss_type === 'guild') {
//                 await client.query(`
//                     INSERT INTO global_boss_states (game_id, server_id, boss_key, current_hp, total_damage_pool)
//                     VALUES ($1, $2, $3, $4, '{}'::jsonb)
//                     ON CONFLICT (game_id, server_id, boss_key) DO NOTHING;
//                 `, [gameId, serverId, bossKey, boss.max_hp]);
//             }
//         }
//
//         await client.query('COMMIT');
//
//         // Теперь спокойно делаем SELECT — база гарантированно вернет актуальные строки для всех боссов
//         const query = `
//             SELECT boss_key, current_hp
//             FROM global_boss_states
//             WHERE game_id = $1 AND server_id = $2;
//         `;
//         const { rows } = await global.pool.query(query, [gameId, serverId]);
//
//         const statuses = {};
//         rows.forEach(r => {
//             statuses[r.boss_key] = Number(r.current_hp);
//         });
//
//         return res.json(statuses);
//     } catch (e) {
//         await client.query('ROLLBACK');
//         console.error("[БЭКЕНД БОССЫ СТАТУС КРИТ]:", e);
//         return res.status(500).json({ error: e.message });
//     } finally {
//         client.release();
//     }
// };




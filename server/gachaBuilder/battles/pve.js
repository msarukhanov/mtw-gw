const { Parser } = require('expr-eval'); // библиотека для безопасного просчета формул из конфига
const {getHeroRating, getItemRating, getHeroActualStats, recalculateAndSaveCombatPower} = require('../db/_shared');
const { getBattleState, saveBattleState, deleteBattleState } = require('./battleStateManager');
const Cache = require('../db/cacheManager');

const {evaluateFormula, processUnitEffects, getTargets, prepareTeams, executeDamageAction, autoTurn, generateTimelinePrediction} = require('./battleFunctions');


async function handlePlayerTurn(userId, serverId, battleId, reqHeroId, reqSkillId, GameConfig) {
    const catalog = GameConfig.catalog || {};
    const targetGauge = GameConfig.mechanics?.combat_system?.gauge_config?.target_value || 100;

    let player = await Cache.getPlayer(userId, serverId);

    if(!player) {
        return { error: true, message: "Invalid player data" };
    }

    const cachedSession = await getBattleState(battleId);

    if (!cachedSession) {
        return { error: true, message: "Боевая сессия не найдена или время её жизни истекло." };
    }

    if (cachedSession.user_id !== userId) {
        return { error: true, message: "У вас нет прав доступа к этой боевой сессии." };
    }

    const { currentCharacterId, currentCharacterInstance, currentTeam, options } = cachedSession;

    const { pTeam, eTeam } = cachedSession.state;

    if (currentTeam !== 'pTeam') {
        return { error: true, message: "Сейчас ход противника. Ожидайте действий ИИ." };
    }

    if (currentCharacterInstance !== reqHeroId) {
        return { error: true, message: `Нарушение очереди. Сейчас должен ходить персонаж с ID: ${currentCharacterId}` };
    }

    const turnMode = GameConfig.mechanics?.combat_system?.turn_mode || 'team_alternating';
    let readyUnits;

    if (turnMode === 'team_alternating') {
        const currentTeam = (cachedSession.currentTeam === 'pTeam') ? pTeam : eTeam;
        readyUnits = currentTeam.filter(u => u.current_hp > 0);
    }
    else {
        // Поштучный режим (individual_speed): ваш оригинальный рабочий код со шкалами
        readyUnits = [...pTeam, ...eTeam].filter(u => u.current_hp > 0 && u.action_gauge >= targetGauge);

        if (readyUnits.length === 0) {
            let tempUnits = [...pTeam, ...eTeam].filter(u => u.current_hp > 0);
            const tickMultiplier = GameConfig.mechanics?.combat_system?.gauge_config?.tick_multiplier || 0.1;

            while (readyUnits.length === 0) {
                tempUnits.forEach(u => { u.action_gauge += (u.stats?.speed || 0) * tickMultiplier; });
                readyUnits = tempUnits.filter(u => u.action_gauge >= targetGauge);
            }
        }
    }

    // Сортируем готовых точно по правилам нашего движка
    readyUnits.sort((a, b) => (b.stats?.speed || 0) - (a.stats?.speed || 0) || b.action_gauge - a.action_gauge);
    const currentActiveUnit = readyUnits[0];

    // Проверяем, принадлежит ли ходящий юнит команде игрока
    if (currentActiveUnit.side !== 'player') {
        return { error: true, message: "Сейчас ход противника. Ожидайте действий ИИ." };
    }

    const hasSkill = currentActiveUnit.skills.some(s => s.skill_id === reqSkillId);
    // Если это не базовая атака (которая у всех по умолчанию), и навыка нет — бьем тревогу
    if (reqSkillId !== "basic_strike" && !hasSkill) {
        return { error: true, message: "У данного персонажа нет такого навыка." };
    }

    const skillConfig = catalog.skills?.[reqSkillId];
    if (!skillConfig) {
        return { error: true, message: "Конфигурация навыка не найдена в каталоге." };
    }

    if (skillConfig.type === "ultimate") {
        const energyCost = skillConfig.energy_cost || 100;
        if (currentActiveUnit.energy < energyCost) {
            return { error: true, message: `Недостаточно энергии для Ультимейта. Требуется: ${energyCost}, текущая: ${currentActiveUnit.energy}` };
        }
    }

    const battleResult = await simulatePvEBattle([], [], GameConfig, {
        isAuto: false,
        battleId: battleId,
        userId: userId,
        manualAction: {
            heroInstanceId: reqHeroId,
            skill_id: reqSkillId
        }
    });

    let rewardReport;
    const {type, stage, towerKey} = options;
    console.log(options);
    if(battleResult.end) {
        const stageConfig = (type === 'campaign') ? GameConfig.pve_campaign?.stages?.[stage]: GameConfig.pve_towers?.[towerKey]?.floors?.[stage];
        rewardReport = await endPvEBattle(battleResult, stageConfig, player, GameConfig, type, stage, towerKey); // мутируем player.resources
    }

    await Cache.setPlayer(player);

    return {
        success: true,
        battleId,
        currentCharacterId: battleResult.currentCharacterId,
        currentCharacterInstance: battleResult.currentCharacterInstance,
        end: battleResult.end,
        win: battleResult.end ? battleResult.win: null,
        replay: battleResult.replay,
        turn_list: battleResult.turn_list,
        rewards: battleResult.end ? rewardReport : null,
        pve_progress: battleResult.end ? player.pve_progress : null,
        next_stage: battleResult.end ? (type === 'campaign' ? player.pve_progress.campaign : player.pve_progress.towers[towerKey]) : null
    };
}

async function simulatePvEBattle(playerTeamRaw, enemyTeamRaw, GameConfig, options = { isAuto: true }) {
    let roundsLog = [];
    let pTeam, eTeam;
    let currentTurnCount = 0;
    let currentActionCount = 0;
    let currentTeamTurn = 'pTeam';
    let currentCharacterId = '';
    let currentCharacterInstance = '';
    let currentCharacterObject = null; // Будет хранить весь объект текущего ходящего юнита
    let battleStatus = 'started'; // Начальный статус по умолчанию
    let playerActionRequired = false; // Маркер ожидания действия игрока

    const catalog = GameConfig.catalog || {};
    const formulas = GameConfig.mechanics?.combat_formulas || {};
    const systemConfig = GameConfig.mechanics?.combat_system || {};

    const turnMode = systemConfig.turn_mode || 'team_alternating';
    const maxTurnsLimit = systemConfig.round_limits[turnMode] || 30;
    const targetGauge = systemConfig.gauge_config?.target_value || 100;
    const tickMultiplier = systemConfig.gauge_config?.tick_multiplier || 0.1;

    let cachedSession = null;

    // --- АВТОМАТИЧЕСКИЙ РЕЖИМ ---
    if (options.isAuto) {
        const teams = prepareTeams(playerTeamRaw, enemyTeamRaw, GameConfig);
        pTeam = teams.pTeam;
        eTeam = teams.eTeam;
        battleStatus = 'ongoing';
    }
    // --- РУЧНОЙ / ПОШАГОВЫЙ РЕЖИМ ---
    else {

        if (options.battleId) {
            cachedSession = await getBattleState(options.battleId);
        }

        // Если бой создается С НУЛЯ
        if (!cachedSession) {
            const teams = prepareTeams(playerTeamRaw, enemyTeamRaw, GameConfig);
            pTeam = teams.pTeam;
            eTeam = teams.eTeam;

            const teamsToSort = (turnMode === 'team_alternating') ? [...pTeam] : [...pTeam, ...eTeam];
            let startReadyUnits = teamsToSort.filter(u => u.current_hp > 0);
            startReadyUnits.sort((a, b) => (b.stats ?.speed || 0) - (a.stats ?.speed || 0));

            let firstAttacker = startReadyUnits[0];

            currentCharacterInstance = firstAttacker ? firstAttacker.instanceId : (pTeam[0] ?.instanceId || '');
            currentCharacterId = firstAttacker ? firstAttacker.id : (pTeam[0] ?.id || '');
            currentCharacterObject = firstAttacker || pTeam[0] || null;

            // Проверяем, принадлежит ли первый ходящий игроку
            const isFirstPlayer = pTeam.some(u => u.instanceId === currentCharacterInstance);
            if (isFirstPlayer) {
                battleStatus = 'waiting';
                playerActionRequired = true;
            } else {
                battleStatus = 'started';
                playerActionRequired = false;
            }

            // Логируем инициализацию (ход 0)
            startReadyUnits.forEach(h => {
                roundsLog.push({
                    turn: 0,
                    attacker_id: h.id,
                    instanceId: h.instanceId || null,
                    action: {type: "start_battle", value: "initial_setup"},
                    effects_applied: [],
                    sub_actions: [],
                    snapshot: {
                        hp: h.current_hp || 0,
                        energy: h.energy || 0,
                        active_effects: h.active_effects ? [...h.active_effects] : []
                    }
                });
            });

            // Сохраняем расширенное состояние в Redis
            await saveBattleState(
                options.battleId,
                options.userId,
                {pTeam, eTeam},
                battleStatus,
                currentTurnCount,
                currentTeamTurn,
                currentCharacterId,
                currentCharacterInstance,
                roundsLog,
                options,
                {
                    currentCharacterObject,
                    playerActionRequired
                }
            );

            return {
                battleId: options.battleId,
                currentCharacterId,
                currentCharacterInstance,
                currentCharacterObject,
                win: false,
                end: false,
                status: battleStatus,
                playerActionRequired,
                total_rounds: 0,
                replay: roundsLog,
                turn_list: generateTimelinePrediction(pTeam, eTeam, GameConfig, 12),
                options
            };
        }
        // Если бой ВОССТАНАВЛИВАЕТСЯ из кэша
        else {
            pTeam = cachedSession.state.pTeam;
            eTeam = cachedSession.state.eTeam;
            currentTurnCount = cachedSession.currentTurn || 0;
            currentTeamTurn = cachedSession.currentTeam || 'pTeam';
            currentCharacterId = cachedSession.currentCharacterId || null;
            currentCharacterInstance = cachedSession.currentCharacterInstance || null;
            roundsLog = cachedSession.roundsLog || [];

            // Восстанавливаем новые параметры из мета-данных или дополнительных полей кэша
            currentCharacterObject = cachedSession.currentCharacterObject || null;
            battleStatus = 'ongoing'; // Переводим в онгоинг, так как цикл сейчас продолжит работу
            playerActionRequired = cachedSession.playerActionRequired || false;
        }
    }



    // Переменная для хранения выбранного скилла (из manualAction или от ИИ)
    let currentSkillId = null;
    let manualInstanceId = options?.manualAction?.heroInstanceId || null;
    let manualSkillId = options?.manualAction?.skill_id || null;

    let readyUnits, attacker;

    // 1. Проверка на смерть одной из команд
    const checkTeamDead = () => {
        let alivePlayers = pTeam.filter(u => u.current_hp > 0);
        let aliveEnemies = eTeam.filter(u => u.current_hp > 0);
        return (alivePlayers.length === 0 || aliveEnemies.length === 0);
    };

    // 2. Поиск персонажа, который должен ходить прямо сейчас
    const findActiveCharacter = () => {
        // Запускаем бесконечный цикл начисления очков хода (если никто не готов)
        // Он гарантированно прервется `return`, как только найдется юнит
        while (true) {
            if (turnMode === 'team_alternating') {
                const currentTeam = (currentTeamTurn === 'pTeam') ? pTeam : eTeam;
                let readyUnits = currentTeam.filter(u => u.current_hp > 0 && u.has_acted === false);

                // Если в текущей команде все живые уже походили
                if (readyUnits.length === 0) {
                    // Сбрасываем флаги ходов для текущей команды
                    currentTeam.forEach(u => u.has_acted = false);

                    // Переключаем ход на другую команду
                    if (currentTeamTurn === 'pTeam') {
                        currentTeamTurn = 'eTeam';
                    } else {
                        currentTeamTurn = 'pTeam';
                        currentTurnCount++; // Круг завершился, увеличиваем глобальный счетчик раундов
                    }

                    // Обновляем флаги для следующей команды на всякий случай и проверяем заново на следующей итерации while
                    const nextTeam = (currentTeamTurn === 'pTeam') ? pTeam : eTeam;
                    nextTeam.forEach(u => u.has_acted = false);
                    continue;
                }

                // Сортируем готовую к ходу команду по скорости
                readyUnits.sort((a, b) => (b.stats?.speed || 0) - (a.stats?.speed || 0));
                return readyUnits[0];

            } else {
                // Режим индивидуальной шкалы скорости (individual_speed)
                let readyUnits = [...pTeam, ...eTeam].filter(u => u.current_hp > 0 && u.action_gauge >= targetGauge);

                // Если никто еще не набрал нужный порог шкалы (targetGauge)
                if (readyUnits.length === 0) {
                    // "Тикаем" шкалу для ВСЕХ живых персонажей на основе их скорости
                    [...pTeam, ...eTeam].filter(u => u.current_hp > 0).forEach(u => {
                        u.action_gauge += (u.stats?.speed || 0) * tickMultiplier;
                    });
                    continue; // Возвращаемся в начало цикла while и проверяем шкалу снова
                }

                // Сортируем: сначала те, у кого больше шкала, при равенстве — у кого выше базовая скорость
                readyUnits.sort((a, b) => b.action_gauge - a.action_gauge || (b.stats?.speed || 0) - (a.stats?.speed || 0));
                return readyUnits[0];
            }
        }
    };

    // --- НАЧАЛО ИГРОВОГО ЦИКЛА ---
    while (currentTurnCount < maxTurnsLimit) {
        // 1. Срочная проверка: если кто-то уже умер, бой закончен
        if (checkTeamDead()) break;

        // 2. Определяем, чей сейчас ход
        let activeCharacter = findActiveCharacter();

        // Если игрок прислал действие (ручной режим)
        if (manualInstanceId) {
            attacker = pTeam.find(u => u.instanceId === manualInstanceId && u.current_hp > 0);
            currentSkillId = manualSkillId;

            // Сбрасываем маркеры ручного действия, так как мы его уже применили
            manualInstanceId = null;
            manualSkillId = null;
        }
        // Автоматический выбор (ход монстра ИЛИ включен авто-бой)
        else {
            attacker = activeCharacter;
            currentSkillId = null;
        }

        // Защитная проверка на случай непредвиденных сбоев
        if (!attacker) break;

        // Определяем сторону персонажа (игрок или NPC)
        const isPlayerCharacter = pTeam.some(u => u.instanceId === attacker.instanceId);

        // --- КРИТИЧЕСКАЯ ТОЧКА ОСТАНОВКИ ДЛЯ РУЧНОГО РЕЖИМА ---
        // Если авто-бой ВЫКЛЮЧЕН, ходить должен персонаж ИГРОКА, но экшена от игрока НЕТ (manualInstanceId уже сброшен)
        // Это значит, что мы только что прокрутили все ходы ИИ и уперлись в очередь игрока. Время остановиться!
        if (!options.isAuto && isPlayerCharacter && !currentSkillId) {
            battleStatus = 'waiting';
            playerActionRequired = true;
            currentCharacterId = attacker.id;
            currentCharacterInstance = attacker.instanceId;
            currentCharacterObject = attacker;
            break; // Выходим из цикла. Код ниже сохранит бой в Redis и вернет состояние.
        }

        // 3. Продвигаем счетчики раундов в зависимости от системы
        if (turnMode === 'individual_speed') {
            currentTurnCount++;
        } else if (turnMode === 'team_alternating') {
            attacker.has_acted = true;
        }

        // 4. Фаза начала хода (эффекты типа яда, кровотечения, стана)
        let turnStartEffects = processUnitEffects(attacker, "on_turn_start", [...pTeam, ...eTeam], GameConfig);

        // Если персонаж находится в контроле (оглушен) — он пропускает ход
        if (turnStartEffects.is_stunned) {
            roundsLog.push({
                turn: currentTurnCount,
                attacker_id: attacker.id,
                instanceId: attacker.instanceId || null,
                action: { type: "skip_turn", value: "stunned" },
                effects_applied: turnStartEffects.tick_actions || [],
                sub_actions: [],
                snapshot: { hp: attacker.current_hp, energy: attacker.energy, active_effects: [...attacker.active_effects] }
            });
        }
        // Если ходить может — выполняем действие
        else {
            autoTurn(attacker, turnStartEffects, pTeam, eTeam, currentTurnCount, options, catalog, GameConfig, roundsLog);
        }

        // 5. Фаза завершения хода
        attacker.action_gauge = 0; // Сбрасываем шкалу инициативы
        processUnitEffects(attacker, "on_turn_end", [...pTeam, ...eTeam], GameConfig);

        // Еще раз проверяем смерть команд после нанесенного урона/эффектов
        if (checkTeamDead()) break;
    }
    // --- КОНЕЦ ИГРОВОГО ЦИКЛА ---
    // --- ОПРЕДЕЛЕНИЕ ИСХОДА БОЯ ---
    let isPlayerWin = pTeam.some(u => u.current_hp > 0) && eTeam.every(u => u.current_hp <= 0);
    let isBattleFinished = eTeam.every(u => u.current_hp <= 0) || pTeam.every(u => u.current_hp <= 0) || currentTurnCount >= maxTurnsLimit;

    if (isBattleFinished) {
        battleStatus = 'finished';
        playerActionRequired = false;
    }

    // --- ОПРЕДЕЛЕНИЕ СЛЕДУЮЩЕГО ХОДЯЩЕГО ДЛЯ БУДУЩЕЙ СЕССИИ ---
    // Если бой ещё не закончен, нам нужно заглянуть вперёд и узнать, кто будет ходить СЛЕДУЮЩИМ
    if (!isBattleFinished) {
        let nextActiveUnit = null;

        if (turnMode === 'team_alternating') {
            const activeTeamUnits = (currentTeamTurn === 'pTeam') ? pTeam : eTeam;
            const currentReady = activeTeamUnits.filter(u => u.current_hp > 0 && !u.has_acted);

            if (currentReady.length > 0) {
                currentReady.sort((a, b) => (b.stats?.speed || 0) - (a.stats?.speed || 0));
                nextActiveUnit = currentReady[0];
            } else {
                // Если текущая команда вся походила, временно смотрим на следующую команду
                const nextTeamTurn = (currentTeamTurn === 'pTeam') ? 'eTeam' : 'pTeam';
                const nextTeam = (nextTeamTurn === 'pTeam') ? pTeam : eTeam;
                const nextReady = nextTeam.filter(u => u.current_hp > 0);
                nextReady.sort((a, b) => (b.stats?.speed || 0) - (a.stats?.speed || 0));
                nextActiveUnit = nextReady[0];
            }
        } else {
            // Режим индивидуальной скорости
            const allAlive = [...pTeam, ...eTeam].filter(u => u.current_hp > 0);
            allAlive.sort((a, b) => b.action_gauge - a.action_gauge || (b.stats?.speed || 0) - (a.stats?.speed || 0));
            nextActiveUnit = allAlive[0];
        }

        // Корректно заполняем ID следующего персонажа
        if (nextActiveUnit) {
            currentCharacterId = nextActiveUnit.id;
            currentCharacterInstance = nextActiveUnit.instanceId;
            currentCharacterObject = nextActiveUnit;

            // Проверяем, принадлежит ли следующий персонаж игроку
            const isNextCharacterPlayers = pTeam.some(u => u.instanceId === nextActiveUnit.instanceId);

            if (!options.isAuto) {
                battleStatus = isNextCharacterPlayers ? 'waiting' : 'ongoing';
                playerActionRequired = isNextCharacterPlayers;
            }
        }
    }

    // --- РАБОТА С РЕДИСОМ (СОХРАНЕНИЕ / УДАЛЕНИЕ) ---
    if (!options.isAuto) {
        if (!isBattleFinished) {
            // Больше никакого хардкода currentTeamTurn = 'pTeam'! Сохраняем реальное состояние очереди.
            await saveBattleState(
                options.battleId,
                options.userId,
                { pTeam, eTeam },
                battleStatus,
                currentTurnCount,
                currentTeamTurn,
                currentCharacterId,
                currentCharacterInstance,
                roundsLog,
                (cachedSession ? cachedSession.options : options),
                {
                    currentCharacterObject,
                    playerActionRequired
                }
            );
        } else {
            // Если бой завершился — зачищаем кэш в Redis
            await deleteBattleState(options.battleId);
        }
    }

    // --- ВОЗВРАТ РЕЗУЛЬТАТА ---
    return {
        battleId: options.battleId,
        currentCharacterId,
        currentCharacterInstance,
        currentCharacterObject,
        win: isPlayerWin,
        end: isBattleFinished,
        status: battleStatus,
        playerActionRequired,
        total_rounds: currentTurnCount,
        replay: roundsLog,
        turn_list: generateTimelinePrediction(pTeam, eTeam, GameConfig, 12),
        options
    };
}

async function endPvEBattle(battleResult, stageConfig, player, gameConfig, type, stage, towerKey) {
    let rewardReport = { resources: {}, items: {} };

    if (battleResult.win) {
        // 1. Начисление ресурсов (валют) в RAM объект resources
        if (stageConfig.rewards?.resources) {
            Object.entries(stageConfig.rewards.resources).forEach(([resKey, amount]) => {
                player.resources[resKey] = (player.resources[resKey] || 0) + amount;
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
            }
        else {
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

    return rewardReport
}

module.exports = {
    simulatePvEBattle,
    endPvEBattle,
    handlePlayerTurn
};
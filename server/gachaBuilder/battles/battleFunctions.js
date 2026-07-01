const { Parser } = require('expr-eval'); // библиотека для безопасного просчета формул из конфига
const {getHeroRating, getItemRating, getHeroActualStats, recalculateAndSaveCombatPower} = require('../db/_shared');
const { getBattleState, saveBattleState, deleteBattleState } = require('./battleStateManager');
const Cache = require('../db/cacheManager');

function evaluateFormula(formulaStr, context = {}) {
    if (!formulaStr) return 0;

    try {
        // Разворачиваем ключи контекста (A, T, BASE_DMG) в переменные внутри dynamic-функции
        const keys = Object.keys(context);
        const values = Object.values(context);

        const fn = new Function(...keys, `return (${formulaStr});`);
        const result = fn(...values);

        return isNaN(result) ? 0 : result;
    } catch (error) {
        console.error(`[Formula Error] Ошибка в формуле: "${formulaStr}":`, error.message);
        return 0;
    }
}

function prepareTeams(playerTeamRaw, enemyTeamRaw, GameConfig) {
    const catalog = GameConfig.catalog || {};

    let pTeam, eTeam;

    pTeam = playerTeamRaw.map((hero, idx) => ({
        id: `p_${idx}`,
        hero_id: hero.hero_id,
        side: 'player',
        instanceId: hero.instance_id,
        has_acted: false,
        max_hp: getHeroActualStats(hero, { config: GameConfig })?.hp || 100,
        current_hp: getHeroActualStats(hero, { config: GameConfig })?.hp || 100,
        energy: 0,
        action_gauge: 0,
        skills: hero.skills || [],
        active_effects: [],
        stats: getHeroActualStats(hero, { config: GameConfig }),
        line_index: GameConfig.mechanics?.prototypes?.team?.position?.[idx] || 0
}));

    eTeam = enemyTeamRaw.map((enemy, idx) => ({
        id: `e_${idx}`,
        hero_id: enemy.hero_id,
        side: 'enemy',
        has_acted: false,
        max_hp: getHeroActualStats(enemy, { config: GameConfig })?.hp || 100,
        current_hp: getHeroActualStats(enemy, { config: GameConfig })?.hp || 100,
        energy: 0,
        action_gauge: 0,
        skills: enemy.skills || [],
        active_effects: [],
        stats: getHeroActualStats(enemy, { config: GameConfig }),
        line_index: GameConfig.mechanics?.prototypes?.team?.position?.[idx] || 0
}));

    // Автобой: Срабатывание пассивных навыков "on_battle_start"
    const allStartUnits = [...pTeam, ...eTeam];
    allStartUnits.forEach(unit => {
        unit.skills.forEach(s => {
            const cfg = catalog.skills?.[s.skill_id];
            if (cfg?.trigger?.event !== 'on_battle_start') return;
            const lvlData = cfg.levels?.[0];

            let potentialTargets = cfg.targeting?.side === 'allies'
                ? (unit.side === 'player' ? pTeam : eTeam)
                : (unit.side === 'player' ? eTeam : pTeam);

            if (cfg.targeting?.selector === 'all') {
                potentialTargets.forEach(t => {
                    const val = evaluateFormula(lvlData?.actions?.[0]?.params?.value_formula || "10", { A: unit.stats, T: t.stats, GameConfig });
                    t.active_effects.push({
                        effect_id: lvlData?.actions?.[0]?.effect_id,
                        stat_id: "atk", value: val, duration: -1, caster_id: unit.id
                });
                    if (t.stats.atk) t.stats.atk *= (1 + val / 100);
                });
            }
        });
    });

    return {pTeam, eTeam};
}

function processUnitEffects(unit, phase, allUnits, GameConfig) {
    const catalog = GameConfig.catalog || {};
    let effectPhaseLog = {
        phase: phase,
        tick_actions: [], // Что сработало (например, урон от яда)
        is_stunned: false
    };

    if (unit.current_hp <= 0) return effectPhaseLog;

    // --- ФАЗА 1: НАЧАЛО ХОДА ---
    if (phase === "on_turn_start") {
        // 1. Проверяем наличие контроля (Stun). Если тип эффекта "control" — юнит застанен
        const hasStun = unit.active_effects.some(eff => catalog.effects?.[eff.effect_id]?.type === "control");
        if (hasStun) {
            effectPhaseLog.is_stunned = true;
        }

        // 2. Обрабатываем периодический урон/лечение (tick_effect)
        unit.active_effects.forEach(eff => {
            const effectConfig = catalog.effects?.[eff.effect_id];
            if (!effectConfig || effectConfig.type !== "tick_effect" || effectConfig.trigger_phase !== "on_turn_start") return;

            if (effectConfig.actions) {
                effectConfig.actions.forEach(action => {
                    if (action.type === "deal_damage") {
                        // Ищем кастера, который наложил этот дебафф. Если он мертв — берем самого юнита для расчетов
                        const caster = allUnits.find(u => u.id === eff.caster_id) || unit;

                        let tickDamage = evaluateFormula(action.value_formula, { C: caster.stats, T: unit.stats, GameConfig });
                        tickDamage = Math.floor(Math.max(1, tickDamage));

                        unit.current_hp = Math.max(0, unit.current_hp - tickDamage);

                        effectPhaseLog.tick_actions.push({
                            type: "tick_damage",
                            effect_id: eff.effect_id,
                            damage: tickDamage,
                            target_left_hp: unit.current_hp
                        });
                    }
                });
            }
        });
    }

    // --- ФАЗА 2: КОНЕЦ ХОДА ---
    if (phase === "on_turn_end") {
        // Уменьшаем длительность у временных эффектов (duration > 0). Перманентные (-1) не трогаем.
        unit.active_effects.forEach(eff => {
            if (eff.duration > 0) eff.duration -= 1;
        });

        // Находим те эффекты, которые только что закончились (duration стал равен 0)
        const expiredEffects = unit.active_effects.filter(eff => eff.duration === 0);

        expiredEffects.forEach(eff => {
            // Если этот статус модифицировал статы (например, увеличивал атаку на 10%), откатываем стат назад
            if (eff.stat_id && unit.stats[eff.stat_id]) {
                unit.stats[eff.stat_id] /= (1 + eff.value / 100);
            }

            effectPhaseLog.tick_actions.push({
                type: "effect_expired",
                effect_id: eff.effect_id
            });
        });

        // Оставляем только те эффекты, у которых длительность еще не истекла (не равна 0)
        unit.active_effects = unit.active_effects.filter(eff => eff.duration !== 0);
    }

    return effectPhaseLog;
}

function getTargets(attacker, pTeam, eTeam, targetingConfig) {
    const { side, selector } = targetingConfig;

    // 1. Определяем команду, среди которой ищем цели
    let potentialTargets = [];
    if (side === 'self') return [attacker];

    if (side === 'allies') {
        potentialTargets = attacker.side === 'player' ? pTeam : eTeam;
    } else if (side === 'enemies') {
        potentialTargets = attacker.side === 'player' ? eTeam : pTeam;
    } else {
        potentialTargets = [...pTeam, ...eTeam]; // all_battlefield
    }

    // Оставляем только живых
    let aliveTargets = potentialTargets.filter(u => u.current_hp > 0);
    if (aliveTargets.length === 0) return [];

    // 2. Применяем селектор алгоритма
    switch (selector) {
        case 'all':
            return aliveTargets;

        case 'closest_alive': {
            // Сортируем по индексу линии (от 0 и выше), а внутри линии — по боевому ID для стабильности
            aliveTargets.sort((a, b) => a.line_index - b.line_index || a.id.localeCompare(b.id));
            return [aliveTargets[0]]; // Возвращаем самого ближнего
        }

        case 'furthest_alive': {
            // Сортируем по индексу линии в обратном порядке (от дальних к ближним)
            aliveTargets.sort((a, b) => b.line_index - a.line_index || a.id.localeCompare(b.id));
            return [aliveTargets[0]];
        }

        case 'lowest_hp_percent': {
            // Ищем минимальное отношение текущего HP к максимальному
            aliveTargets.sort((a, b) => {
                const pctA = a.current_hp / (a.stats.hp || 1);
                const pctB = b.current_hp / (b.stats.hp || 1);
                return pctA - pctB;
            });
            return [aliveTargets[0]];
        }

        case 'lowest_hp_absolute': {
            aliveTargets.sort((a, b) => a.current_hp - b.current_hp);
            return [aliveTargets[0]];
        }

        case 'highest_atk': {
            aliveTargets.sort((a, b) => (b.stats.atk || 0) - (a.stats.atk || 0));
            return [aliveTargets[0]];
        }

        case 'random': {
            const randomIndex = Math.floor(Math.random() * aliveTargets.length);
            return [aliveTargets[randomIndex]];
        }

        default:
            // Фоллбек на ближайшего, если геймдизайнер опечатался в селекторе
            aliveTargets.sort((a, b) => a.line_index - b.line_index);
            return [aliveTargets[0]];
    }
}

function executeDamageAction(attacker, target, actionConfig, GameConfig) {
    const formulas = GameConfig.mechanics?.combat_formulas || {};
    let actionLog = {
        target_id: target.id,
        is_hit: false,
        is_crit: false,
        damage_dealt: 0,
        target_left_hp: target.current_hp
    };

    // 1. ПРОВЕРКА НА ПОПАДАНИЕ (Hit Chance / Dodge)
    const hitChance = evaluateFormula(formulas.hit_chance_formula, { A: attacker.stats, T: target.stats, GameConfig });
    if (Math.random() * 100 > hitChance) {
        // Промах! Урон равен 0, прерываем выполнение
        return actionLog;
    }

    actionLog.is_hit = true;

    // 2. РАСЧЁТ БАЗОВОГО УРОНА (с учётом атаки и брони)
    let baseDamage = evaluateFormula(formulas.base_damage_formula, { A: attacker.stats, T: target.stats, GameConfig });
    baseDamage = Math.max(1, baseDamage); // Защита от отрицательного или нулевого урона

    // 3. ПРОВЕРКА И РАСЧЁТ КРИТА
    let finalDamage = baseDamage;
    // Крит-шанс берется напрямую из характеристик атакующего
    if (actionConfig.can_crit && Math.random() * 100 < (attacker.stats.crit || 0)) {
        actionLog.is_crit = true;
        // Считаем критический урон, прокидывая BASE_DMG в контекст
        const critMultiplier = evaluateFormula(formulas.crit_damage_formula, {
            A: attacker.stats,
            T: target.stats,
            BASE_DMG: baseDamage,
            GameConfig
        });
        finalDamage = critMultiplier > 0 ? critMultiplier : baseDamage * 2; // Дефолтный х2 фоллбек
    }

    finalDamage = Math.floor(finalDamage);

    // 4. НАНЕСЕНИЕ УРОНА И ОБНОВЛЕНИЕ HP
    target.current_hp = Math.max(0, target.current_hp - finalDamage);
    actionLog.attacker_died = attacker.current_hp<=0;
    actionLog.target_died = target.current_hp<=0;
    actionLog.damage_dealt = finalDamage;
    actionLog.target_left_hp = target.current_hp;

    // 5. ВАМПИРИЗМ (Lifesteal) — Сразу лечим атакующего, если у него есть этот стат
    if (attacker.stats.lifesteal && attacker.stats.lifesteal > 0) {
        const healValue = Math.floor(finalDamage * (attacker.stats.lifesteal / 100));
        if (healValue > 0 && attacker.current_hp > 0) {
            attacker.current_hp = Math.min(attacker.stats.hp, attacker.current_hp + healValue);
        }
    }

    return actionLog;
}

function autoTurn(attacker, turnStartEffects, pTeam, eTeam, currentTurnCount, options, catalog, GameConfig, roundsLog) {
    let skillId = "basic_strike";
    let isUltimateUsed = false;

    if (!options.isAuto && attacker.side === 'player' && options.manualAction) {
        skillId = options.manualAction.skill_id;
        options.manualAction = null;
    }
    else {
        const ultSkill = attacker.skills.find(s => catalog.skills?.[s.skill_id]?.type === "ultimate");
        if (ultSkill && attacker.energy >= (catalog.skills?.[ultSkill.skill_id]?.energy_cost || 100)) {
            skillId = ultSkill.skill_id;
        }
    else {
            const basicSkill = attacker.skills.find(s => catalog.skills?.[s.skill_id]?.type === "active");
            skillId = basicSkill ? basicSkill.skill_id : "basic_strike";
        }
    }

    const skillConfig = catalog.skills?.[skillId];
    const isAttackType = skillConfig?.type !== "ultimate";

    const skillLevel = attacker.skills.find(s => s.skill_id === skillId)?.level || 1;
    const levelData = skillConfig?.levels?.find(l => l.level === skillLevel);

    if (!levelData) {
        attacker.action_gauge = 0;
        return;
    }

    if (skillConfig.type === "ultimate") {
        attacker.energy = Math.max(0, attacker.energy - (skillConfig.energy_cost || 100));
        isUltimateUsed = true;
    }

    let finalTargets = getTargets(attacker, pTeam, eTeam, skillConfig.targeting);

    let currentTurnLog = {
        turn: currentTurnCount,
        attacker_id: attacker.id,
        instanceId: attacker.instanceId,
        action: isAttackType ? { type: "attack", value: "basic_strike" } : { type: "skill", value: skillId },
        effects_applied: turnStartEffects.tick_actions,
        sub_actions: []
    };

    levelData.actions.forEach(action => {

        if (action.type === "deal_damage") {
            finalTargets.forEach(target => {
                if (target.current_hp <= 0) return; // Не бьем мертвых

                // Вызываем вашу автономную функцию обсчета удара (криты, промахи, вампиризм там)
                const damageResult = executeDamageAction(attacker, target, action, GameConfig);

                // Формируем под-действие для лога анимаций фронтенда
                currentTurnLog.sub_actions.push({
                    type: "damage",
                    turn: currentTurnCount,
                    target_id: target.id,
                    is_hit: damageResult.is_hit,
                    is_crit: damageResult.is_crit,
                    damage: damageResult.damage_dealt,

                    attacker_max_hp: attacker.max_hp,
                    attacker_left_hp: attacker.current_hp,

                    target_max_hp: target.max_hp,
                    target_left_hp: target.current_hp,

                    attacker_died: damageResult.attacker_died || false,
                    target_died: damageResult.target_died || false
                });
            });
        }

        if (action.type === "apply_effect") {
            let effTargets = action.targeting === "self" ? [attacker] : finalTargets;
            effTargets.forEach(target => {
                if (target.current_hp <= 0) return;

                if (action.params?.chance && Math.random() * 100 > action.params.chance) return;

                const val = evaluateFormula(action.params?.value_formula, { A: attacker.stats, T: target.stats, GameConfig });
                target.active_effects.push({
                        effect_id: action.effect_id,
                        stat_id: action.params?.stat_id,
                    value: val,
                    duration: action.duration,
                    caster_id: attacker.id
            });

                // Если бафф мгновенно меняет характеристики на поле боя — пересчитываем
                if (action.params?.stat_id && target.stats[action.params.stat_id]) {
                    target.stats[action.params.stat_id] *= (1 + val / 100);
                }

                currentTurnLog.sub_actions.push({
                    type: "effect_applied",
                    turn: currentTurnCount,
                    target_id: target.id,
                    effect_id: action.effect_id,
                    duration: action.duration
                });
            });
        }

        if (action.type === "modify_energy") {
            let energyTargets = action.targeting === "self" ? [attacker] : finalTargets;
            energyTargets.forEach(target => {
                if (target.current_hp <= 0) return;

                const energyVal = Math.floor(evaluateFormula(action.value_formula, { A: attacker.stats, T: target.stats, GameConfig }));

                target.energy = Math.max(0, Math.min(100, target.energy + energyVal));

                currentTurnLog.sub_actions.push({
                    type: "energy_change",
                    turn: currentTurnCount,
                    self: action.targeting === "self",
                    target_id: target.id,
                    energy_change: energyVal,
                    current_energy: target.energy
                });
            });
        }
    });

    attacker.action_gauge = 0;

    let turnEndEffects = processUnitEffects(attacker, "on_turn_end", [...pTeam, ...eTeam], GameConfig);

    if (turnEndEffects.tick_actions.length > 0) {
        currentTurnLog.sub_actions.push(...turnEndEffects.tick_actions);
    }

    currentTurnLog.snapshot = {
        hp: attacker.current_hp,
        energy: attacker.energy,
        action: isAttackType ? { type: "attack", value: "basic_strike" } : { type: "skill", value: skillId },
        active_effects: [...attacker.active_effects]
    };

    roundsLog.push(currentTurnLog);
}

function generateTimelinePrediction(pTeam, eTeam, GameConfig, steps = 12) {
    const systemConfig = GameConfig.mechanics?.combat_system || {};
    const turnMode = systemConfig.turn_mode || 'team_alternating';
    const targetGauge = systemConfig.gauge_config?.target_value || 100;
    const tickMultiplier = systemConfig.gauge_config?.tick_multiplier || 0.1;

    let predictedTimeline = [];

    // Оставляем для прогноза только ЖИВЫХ участников
    let vPlayers = pTeam.filter(u => u.current_hp > 0);
    let vEnemies = eTeam.filter(u => u.current_hp > 0);

    if (vPlayers.length === 0 || vEnemies.length === 0) return predictedTimeline;

    // ------------------------------------------------------------------------
    // РЕЖИМ 1: Покомандный (team_alternating)
    // ------------------------------------------------------------------------
    if (turnMode === 'team_alternating') {
        // В командном режиме лента статична и проста: сначала все живые игроки по скорости,
        // потом все живые враги по скорости (или наоборот, зависит от текущей активной команды).
        // Копируем массивы, чтобы отсортировать их чисто для визуала
        let sortedPlayers = [...vPlayers].sort((a, b) => (b.stats?.speed || 0) - (a.stats?.speed || 0));
        let sortedEnemies = [...vEnemies].sort((a, b) => (b.stats?.speed || 0) - (a.stats?.speed || 0));

        let pIdx = 0;
        let eIdx = 0;

        // Цикл просто чередует живых юнитов, пока не наберет нужное количество шагов (steps)
        while (predictedTimeline.length < steps) {
            // Если сходили все игроки, переключаемся на врагов, и наоборот
            if (pIdx < sortedPlayers.length) {
                predictedTimeline.push(sortedPlayers[pIdx++].id);
            } else if (eIdx < sortedEnemies.length) {
                predictedTimeline.push(sortedEnemies[eIdx++].id);
            } else {
                // Если сходили вообще все, а шагов в ленте еще мало — сбрасываем индексы на новый круг
                pIdx = 0;
                eIdx = 0;
            }
        }
        return predictedTimeline;
    }

    // ------------------------------------------------------------------------
    // РЕЖИМ 2: Поштучный по скорости (individual_speed)
    // ------------------------------------------------------------------------
    if (turnMode === 'individual_speed') {
        // Делаем глубокую копию шкал, скоростей и станов, чтобы симулировать тики времени
        let virtualUnits = [...vPlayers, ...vEnemies].map(u => ({
                id: u.id,
                speed: Number(u.stats?.speed || 0),
            action_gauge: Number(u.action_gauge || 0),
            // Проверяем стан из каталога эффектов
            is_stunned: u.active_effects?.some(e => GameConfig.catalog?.effects?.[e.effect_id]?.type === 'control') || false
    }));

        // Если у всех юнитов скорость 0, ленту построить невозможно (защита от зависания)
        if (virtualUnits.every(u => u.speed === 0)) return predictedTimeline;

        while (predictedTimeline.length < steps) {
            // Проверяем, набрал ли кто-то шкалу хода >= 100
            let readyUnits = virtualUnits.filter(u => u.action_gauge >= targetGauge);

            if (readyUnits.length > 0) {
                // Сортируем готовых точно так же, как в вашем основном боевом цикле
                readyUnits.sort((a, b) => b.speed - a.speed || b.action_gauge - a.action_gauge);

                let nextUnit = readyUnits[0];
                predictedTimeline.push(nextUnit.id);

                // Имитируем сброс шкалы после совершенного хода
                nextUnit.action_gauge = 0;
                continue;
            }

            // Если на этом тике никто не готов, продвигаем шкалы всех живых вперед
            virtualUnits.forEach(u => {
                u.action_gauge += u.speed * tickMultiplier;
            });
        }
        return predictedTimeline;
    }

    return predictedTimeline;
}

module.exports = {evaluateFormula, processUnitEffects, getTargets, prepareTeams, executeDamageAction, autoTurn, generateTimelinePrediction};
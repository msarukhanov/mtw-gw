const { Parser } = require('expr-eval'); // библиотека для безопасного просчета формул из конфига

async function simulatePvEBattle(playerTeamStats, enemyTeamStats, GameConfig) {
    let roundsLog = [];
    let isPlayerWin = false;

    // Инициализируем участников боя
    let pTeam = playerTeamStats.map((hero, index) => ({ ...hero, side: 'player', id: `p_${index}`, current_hp: hero.hp }));
    let eTeam = enemyTeamStats.map((enemy, index) => ({ ...enemy, side: 'enemy', id: `e_${index}`, current_hp: enemy.hp }));

    const formulas = GameConfig.mechanics?.combat_formulas || {
        damage_formula: "ATK * (100 / (100 + ARMOR))"
    };

    let round = 1;
    const maxRounds = 30; // защита от бесконечного цикла, если у всех реген или 0 урона

    while (round <= maxRounds) {
        let roundActions = [];

        // Сортируем всех живых участников по скорости (speed), чтобы определить очередность хода
        let queue = [...pTeam, ...eTeam].filter(unit => unit.current_hp > 0);
        queue.sort((a, b) => (b.speed || 0) - (a.speed || 0));

        if (pTeam.filter(u => u.current_hp > 0).length === 0 || eTeam.filter(u => u.current_hp > 0).length === 0) {
            break;
        }

        for (let attacker of queue) {
            if (attacker.current_hp <= 0) continue; // если его убили до его хода

            // Ищем цель (самого первого живого врага противоположной команды)
            let targets = attacker.side === 'player' ? eTeam : pTeam;
            let aliveTargets = targets.filter(t => t.current_hp > 0);
            if (aliveTargets.length === 0) break;

            let target = aliveTargets[0]; // простейший таргет-селектор

            // --- РАСЧЕТ КАСТОМНОЙ ФОРМУЛЫ ИЗ ЗЕРОКОДА ---
            // Безопасно подставляем статы в формулу пользователя платформы
            let baseDamage = 0;
            try {
                baseDamage = Parser.evaluate(formulas.damage_formula, {
                    ATK: attacker.atk || 0,
                    ARMOR: target.armor || 0
                });
            } catch(e) {
                // Дефолтный фоллбек, если пользователь ошибся в синтаксисе формулы
                baseDamage = Math.max(1, (attacker.atk || 0) - (target.armor || 0));
            }

            // Логика Крита (РНГ)
            let isCrit = false;
            let finalDamage = Math.floor(baseDamage);
            if (attacker.crit && Math.random() * 100 < attacker.crit) {
                isCrit = true;
                finalDamage = Math.floor(finalDamage * 2); // или тоже через формулу
            }

            // Наносим урон
            target.current_hp = Math.max(0, target.current_hp - finalDamage);

            roundActions.push({
                attacker_id: attacker.id,
                target_id: target.id,
                damage: finalDamage,
                is_crit: isCrit,
                target_left_hp: target.current_hp
            });

            if (target.current_hp <= 0) {
                // Если кто-то умер, проверяем условие победы прямо во время раунда
                if (targets.filter(t => t.current_hp > 0).length === 0) break;
            }
        }

        roundsLog.push({ round: round, actions: roundActions });

        // Проверяем финал боя
        let playersAlive = pTeam.some(u => u.current_hp > 0);
        let enemiesAlive = eTeam.some(u => u.current_hp > 0);

        if (!enemiesAlive) {
            isPlayerWin = true;
            break;
        }
        if (!playersAlive) {
            isPlayerWin = false;
            break;
        }

        round++;
    }

    return {
        win: isPlayerWin,
        total_rounds: round > maxRounds ? maxRounds : round,
        replay: roundsLog
    };
}

module.exports = {
    simulatePvEBattle,
};
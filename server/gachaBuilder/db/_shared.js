const {gamesConfigDB} = require('./configDB');

async function recalculateAndSaveCombatPower(userId, serverId, gameId) {
    const GameConfig = gamesConfigDB[gameId];
    if (!GameConfig) {
        console.error(`Конфиг для gameId "${gameId}" не найден при пересчете силы`);
        return 0;
    }

    const client = await global.pool.connect();
    try {
        await client.query('BEGIN');

        // 1. Блокируем строку игрока и достаем актуальную game_data
        const selectQuery = `
            SELECT game_data FROM player_server_profiles 
            WHERE id = $1 AND server_id = $2 FOR UPDATE;
        `;
        const { rows } = await client.query(selectQuery, [userId, serverId]);
        if (rows.length === 0) {
            await client.query('ROLLBACK');
            return 0;
        }

        let gameData = rows[0].game_data || {};
        let heroes = gameData.heroes || [];
        const GameContext = { config: GameConfig };

        let totalAccountPower = 0;

        // 2. Пробегаемся по героям, считаем БР для КАЖДОГО и обновляем поле внутри объекта
        heroes.forEach(hero => {
            const heroPower = Math.floor(getHeroRating(hero, GameContext));

            // Записываем БР конкретного героя прямо в его профиль
            hero.combat_power = heroPower;

            // Суммируем общую силу аккаунта
            totalAccountPower += heroPower;
        });

        // Синхронизируем обновленный массив героев обратно в game_data
        gameData.heroes = heroes;
        totalAccountPower = Math.floor(totalAccountPower);

        // 3. Сохраняем обновленный тяжелый JSONB (с БР героев)
        // и оптимизированную колонку общего рейтинга за ОДИН запрос
        const updateQuery = `
            UPDATE player_server_profiles
            SET 
                game_data = $3,
                combat_power = $4, 
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $1 AND server_id = $2;
        `;
        await client.query(updateQuery, [userId, serverId, JSON.stringify(gameData), totalAccountPower]);
        await client.query('COMMIT');

        return totalAccountPower;

    } catch (e) {
        await client.query('ROLLBACK');
        console.error("Ошибка при полном пересчете боевой силы:", e);
        return 0;
    } finally {
        client.release();
    }
}

function getHeroActualStats(hero, Game) {
    const statsMeta = Game.config?.mechanics?.stats || {};
    const prototype = Game.config.catalog?.heroes?.[hero.hero_id];
    if (!prototype) return null;

    let actualStats = {};

    Object.keys(statsMeta).forEach(statId => {
        // КРИТИЧЕСКИЙ ФИКС: Явно извлекаем примитивные числовые значения (Number),
        // полностью исключая передачу ссылки на объекты из gamesConfigDB в памяти Node.js
        const base = Number(prototype.base_stats?.[statId] || 0);
        const growth = Number(prototype.stats_growth?.[statId] || 0);
        let totalValue = base + (growth * (Number(hero.level) || 1));

        // Рассчитываем множитель звездности
        const baseStars = Number(prototype.base_stars || 1);
        const starBonusMultiplier = 1 + Math.max(0, (Number(hero.stars) || baseStars) - baseStars) * 0.1;
        totalValue = totalValue * starBonusMultiplier;

        // Экипировка
        if (hero.equipped) {
            Object.entries(hero.equipped).forEach(([slotId, itemId]) => {
                if (itemId && slotId !== 'personal') {
                    const itemConfig = Game.config.catalog?.items?.[itemId];
                    if (itemConfig?.stats?.[statId]) {
                        totalValue += Number(itemConfig.stats[statId]);
                    }
                }
            });
        }

        // Персональный предмет
        if (hero.personal_item_level && hero.personal_item_level > 0) {
            const pItemConfig = Game.config.catalog?.personal_items?.[prototype.personal_item_id];
            const statBonusPerItemLevel = Number(pItemConfig?.stats_per_level?.[statId] || 0);
            totalValue += statBonusPerItemLevel * Number(hero.personal_item_level);
        }

        // Питомец
        if (hero.pet && hero.pet.level > 0) {
            const petConfig = Game.config.catalog?.pets?.[hero.pet.pet_id];
            const petBaseStat = Number(petConfig?.base_stats?.[statId] || 0);
            const petGrowthStat = Number(petConfig?.stats_growth?.[statId] || 0);
            totalValue += petBaseStat + (petGrowthStat * Number(hero.pet.level));
        }

        // Записываем чистый примитив
        actualStats[statId] = totalValue;
    });

    return actualStats;
}


// Твоя функция пересчета БР теперь становится ультра-короткой:
function getHeroRating(hero, Game) {
    const statsMeta = Game.config?.mechanics?.stats || {};
    const actualStats = getHeroActualStats(hero, Game);
    if (!actualStats) return 0;

    let totalPowerRating = 0;
    Object.keys(actualStats).forEach(statId => {
        const weight = statsMeta[statId]?.rating_weight || 0;
        totalPowerRating += actualStats[statId] * weight;
    });

    return totalPowerRating;
}

function getItemRating(itemId, GameContext) {
    const itemConfig = GameContext.config?.catalog?.items?.[itemId];
    const statsMeta = GameContext.config?.mechanics?.stats || {};

    if (!itemConfig || !itemConfig.stats) return 0;

    let totalItemPower = 0;

    // Пробегаемся по статам предмета и умножаем на их веса из механики
    Object.keys(itemConfig.stats).forEach(statId => {
        const statValue = itemConfig.stats[statId] || 0;
        const weight = statsMeta[statId]?.rating_weight || 0;
        totalItemPower += statValue * weight;
    });

    return totalItemPower;
}

function getCurrentIdleRate(gameData, GameConfig, idleKey) {
    // 1. Берем базовый рейт из конфига айдла
    const baseRate = { ...(GameConfig.mechanics?.idle?.[idleKey]?.rate || {}) };

    // Если это не основной айдл, а какая-то отдельная шахта, возвращаем базу
    if (idleKey !== 'main_loot_claim_at') return baseRate;

    // 2. Получаем текущий этап кампании игрока
    const currentStage = gameData.pve_progress?.campaign || "stage_1_1";

    // 3. Бежим по ВСЕМ этапам кампании до текущего включительно и суммируем бонусы
    const stages = GameConfig.pve_campaign?.stages || {};

    Object.entries(stages).forEach(([stageId, stageConfig]) => {
        if (stageConfig.idle_bonus_per_minute) {
            if (stageId !== currentStage) {
                Object.entries(stageConfig.idle_bonus_per_minute).forEach(([resKey, bonus]) => {
                    baseRate[resKey] = (baseRate[resKey] || 0) + bonus;
                });
            }
        }
    });

    return baseRate;
}


module.exports = {
    recalculateAndSaveCombatPower,
    getHeroRating,
    getItemRating,
    getCurrentIdleRate,
    getHeroActualStats
};
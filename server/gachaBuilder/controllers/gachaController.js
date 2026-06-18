// backend/controllers/gachaController.js

const { gamesConfigDB } = require('../db/configDB');
const { getOrCreateGachaCounters, consumeGachaPayment, addHeroOrShard } = require('../db/gachaDB');

exports.summon = async function (req, res) {
    try {
        // Принимаем mode (например, 1 или 10) — сколько круток хочет сделать игрок
        const { game_id, server_id, device_id, banner_id, mode } = req.body;

        const countMode = parseInt(mode) || 1;
        const gameConfig = gamesConfigDB[game_id];
        const banner = gameConfig?.gacha?.banners?.find(b => b.id === banner_id);
        const pool = gameConfig?.gacha?.pools?.[banner?.pool_id];

        if (!gameConfig || !banner || !pool) {
            return res.status(400).json({ error: "Критическая ошибка: Конфигурация баннера или пула не найдена" });
        }

        // Валидация режима крутки на основе твоего массива modes из конфига
        if (!pool.modes.includes(countMode)) {
            return res.status(400).json({ error: `Этот пул не поддерживает режим призыва х${countMode}` });
        }

        // Извлекаем или инициализируем изолированные счетчики Гачи (Pity и лимиты)
        const gachaCounter = getOrCreateGachaCounters(game_id, server_id, device_id, banner_id);

        // ВАЛИДАЦИЯ СУТОЧНОГО ЛИМИТА ИЗ ТВОЕГО К О Н Ф И Г А (gacha.rules)
        // Если крутим за алмазы (diamond), проверяем ограничение на максимальное количество круток
        if (pool.currency === 'diamond') {
            const dailyLimit = gameConfig.gacha?.rules?.max_standard_diamond_daily || 999;
            if (gachaCounter.daily_pulls + countMode > dailyLimit) {
                return res.status(400).json({
                    error: `Превышен суточный лимит призывов за алмазы! Лимит: ${dailyLimit}, вы уже сделали: ${gachaCounter.daily_pulls}`
                });
            }
        }

        // 1. АТОМАРНОЕ СПИСАНИЕ СРЕДСТВ ЧЕРЕЗ КЛИЕНТСКИЙ МУЛЬТИ-РЕЖИМ (cost * countMode)
        const paymentSuccess = consumeGachaPayment(game_id, server_id, device_id, pool.currency, pool.cost, countMode);
        if (!paymentSuccess) {
            return res.status(400).json({
                error: `Недостаточно средств! Требуется: ${pool.cost * countMode} x ${pool.currency}`
            });
        }

        // Массивы для сбора результатов мульти-призыва
        let droppedHeroes = [];
        let playerStateAfterAllRewards = null;

        // 2. ЦИКЛ МУЛЬТИ-ПРИЗЫВА (крутим столько раз, сколько указано в countMode)
        for (let i = 0; i < countMode; i++) {
            // Увеличиваем счетчик круток до гаранта
            gachaCounter.pity++;

            // Фиксируем суточный лимит
            if (pool.currency === 'diamond') gachaCounter.daily_pulls++;

            let selectedRarity = "R";

            // Логика жесткого гаранта (Pity System) на основе pity_threshold баннера
            if (banner.pity_threshold > 0 && gachaCounter.pity >= banner.pity_threshold) {
                selectedRarity = "SSR";
                gachaCounter.pity = 0; // сброс гаранта
                console.log(`[RNG] Сработал HARD PITY на баннере ${banner_id}`);
            } else {
                // Обычный бросок кубика по весам (rates) твоего пула дропа
                const rand = Math.random() * 100;
                if (rand < pool.rates.SSR) {
                    selectedRarity = "SSR";
                    gachaCounter.pity = 0; // сброс, так как SSR выпал досрочно
                } else if (rand < (pool.rates.SSR + pool.rates.SR)) {
                    selectedRarity = "SR";
                } else {
                    selectedRarity = "R";
                }
            }

            // Вытаскиваем случайного героя из пула наград баннера для данной редкости
            const heroesPool = pool.heroes[selectedRarity] || [];
            // Если геймдизайнер оставил массив пустым, откатываемся на дефолтного Зевса
            const finalHeroId = heroesPool.length > 0 ? heroesPool[Math.floor(Math.random() * heroesPool.length)] : "hero_zeus";

            // 3. НАЧИСЛЕНИЕ НАГРАДЫ (С проверкой правила дубликатов)
            const rewardResult = addHeroOrShard(gameConfig, game_id, server_id, device_id, finalHeroId);

            droppedHeroes.push({
                hero_id: finalHeroId,
                rarity: selectedRarity,
                is_duplicate_converted: rewardResult.isDuplicateConverted
            });

            playerStateAfterAllRewards = rewardResult.player_state;
        }

        // Возвращаем на клиент массив всех выпавших Богов и обновленный стейт
        res.json({
            success: true,
            pull_results: droppedHeroes, // массив объектов призыва (для красивого вывода х10 на фронте)
            pity_counter: gachaCounter.pity,
            daily_pulls_done: gachaCounter.daily_pulls,
            player_state: playerStateAfterAllRewards
        });

    } catch (e) {
        console.log(e);
        return res.status(400).json({ error: e.message, msg: '[Gacha:Summon] error' });
    }
};

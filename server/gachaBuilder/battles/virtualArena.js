// virtualArena.js
const crypto = require('crypto');
const pool = global.pool;

const { simulatePvEBattle } = require('./pve');

const BOT_NAMES = ["ShadowBlade", "GachaGod", "Zeus99", "CryptoKnight", "PixelHero", "Phoenix", "Slayer", "Alpha"];

let arenaEngineInterval = null;

// Функция генерации фейкового бота с максимальной прокачкой
/**
 * Генерирует полноценную команду бота из 3-х случайных героев,
 * вытягивая их статы из официального каталога GameConfig и рассчитывая под 80 уровень.
 */
function generateBotTeam(gameConfig) {
    const botTeam = [];
    const teamSize = 3;

    // Защита: если каталог пуст или не передан, берем дефолтный фоллбек
    const heroesCatalog = gameConfig?.catalog?.heroes;
    if (!heroesCatalog || Object.keys(heroesCatalog).length === 0) {
        // Фоллбек на случай, если конфиг не прогрузился в глобал
        for (let i = 0; i < teamSize; i++) {
            botTeam.push({ instance_id: `bot_hero_${crypto.randomBytes(3).toString('hex')}`, id: 'fallback_hero', hp: 5000, atk: 450, armor: 100, crit: 20, speed: 120, is_bot: true });
        }
        return botTeam;
    }

    const availableHeroKeys = Object.keys(heroesCatalog);
    const targetLevel = 80; // Топ прокачка для Арены

    for (let i = 0; i < teamSize; i++) {
        // Выбираем случайного героя из каталога (например, "eleniel")
        const randomHeroKey = availableHeroKeys[Math.floor(Math.random() * availableHeroKeys.length)];
        const catalogHero = heroesCatalog[randomHeroKey];

        // Базовые статы из твоего конфига
        const base = catalogHero.base_stats || { hp: 1000, atk: 250, speed: 120 };
        const growth = catalogHero.stats_growth || { hp: 50, atk: 25, speed: 5 };

        // Рассчитываем статы по формуле прогрессии: базовые + рост * (уровень - 1)
        const finalHp = Number(base.hp || 0) + Number(growth.hp || 0) * (targetLevel - 1);
        const finalAtk = Number(base.atk || 0) + Number(growth.atk || 0) * (targetLevel - 1);
        const finalSpeed = Number(base.speed || 0) + Number(growth.speed || 0) * (targetLevel - 1);

        botTeam.push({
            instance_id: `bot_h_${crypto.randomBytes(3).toString('hex')}`,
            hero_id: randomHeroKey, // Сохраняем оригинальный id (eleniel) для анимаций на фронте
            level: targetLevel,
            hp: finalHp,
            atk: finalAtk,
            armor: 150, // Дефолтная броня, если её нет в росте каталога
            crit: catalogHero.rarity === "UR" ? 30 : 20, // Крит в зависимости от редкости из конфига
            speed: finalSpeed,
            is_bot: true
        });
    }

    return botTeam;
}


const roundOdd = (val) => parseFloat(Math.max(1.01, Math.min(50, val)).toFixed(2));

function generateArenaMarkets(homePower, awayPower, currentMinute = 0, scoreHome = 0, scoreAway = 0, partnerId = 'demo_mtwtech') {
    const globalConfig = global.CONFIG || {};
    const partnerConfig = globalConfig[partnerId] || {};
    const config = partnerConfig.sport || { margin: 1.06 }; // Маржа 6%
    const margin = config.margin || 1.06;

    const timeLeft = 90 - currentMinute;
    const powerDiff = Math.abs(homePower - awayPower) / 100;
    const scoreDiff = scoreHome - scoreAway;

    // 1. МАРКЕТ: Победа в матче (1Х2) -> убираем Ничью (Х), так как в гаче кто-то всегда побеждает
    let p1Chance = 0.50 + powerDiff + (scoreDiff * 0.20);
    let p2Chance = 0.50 - powerDiff - (scoreDiff * 0.20);

    p1Chance = Math.max(0.05, Math.min(0.95, p1Chance));
    p2Chance = Math.max(0.05, 1 - p1Chance);

    // 2. МАРКЕТ: Тотал ходов/раундов битвы (Вместо тотала голов)
    // Допустим, средний бой идет 15 ходов. Делаем линию Тотал 14.5
    const totalLine = 14.5;
    let overChance = 0.50 + (powerDiff * 0.1); // Если силы равны, бой затянется
    overChance = Math.max(0.1, Math.min(0.9, overChance));
    let underChance = 1 - overChance;

    // 3. МАРКЕТ: Фора по выжившим персонажам (Вместо форы по голам)
    // Какое преимущество по живым героям будет у победителя (-1.5 / +1.5)
    let handicapValue = -1.5;
    let h1Chance = p1Chance * 0.9;
    h1Chance = Math.max(0.1, Math.min(0.9, h1Chance));
    let h2Chance = 1 - h1Chance;

    // 4. МАРКЕТ: Первая кровь (First Blood) -> Кто первый убьет вражеского героя (Вместо обе забьют)
    // Шансы 50/50 с небольшой корректировкой на скорость/силу команд
    let fbHomeChance = 0.50 + (powerDiff * 0.5);
    fbHomeChance = Math.max(0.1, Math.min(0.9, fbHomeChance));
    let fbAwayChance = 1 - fbHomeChance;

    return {
        winner: {
            label: "Победа на Арене (1Х2)",
            odds: {
                p1: roundOdd((1 / p1Chance) * margin),
                x: 50.0, // Ставим огромный кэф, так как ничьей в пошаговом бою быть не может
                p2: roundOdd((1 / p2Chance) * margin)
            }
        },
        total: {
            label: `Тотал раундов боя (Б/М ${totalLine})`,
            target: totalLine,
            odds: {
                over: roundOdd((1 / overChance) * margin),
                under: roundOdd((1 / underChance) * margin)
            }
        },
        handicap: {
            label: `Фора по выжившим героям (${handicapValue})`,
            value: handicapValue,
            odds: {
                h1: roundOdd((1 / h1Chance) * margin),
                h2: roundOdd((1 / h2Chance) * margin)
            }
        },
        btts: {
            label: "Первая кровь (First Blood)",
            odds: {
                yes: roundOdd((1 / fbHomeChance) * margin), // YES — Первая кровь за Хозяевами
                no: roundOdd((1 / fbAwayChance) * margin)   // NO — Первая кровь за Гостями
            }
        }
    };
}

async function checkSettledBets(finishedMatch) {
    const finishedMatchId = finishedMatch.match_id || finishedMatch.id;

    let pendingBetsRes;
    try {
        // Ищем в Postgres все купоны со статусом PENDING под этот матч через JSONB оператор @>
        const queryJsonFilter = JSON.stringify([{ matchId: finishedMatchId }]);
        pendingBetsRes = await pool.query(
            "SELECT * FROM sports_bets WHERE status = 'PENDING' AND items @> $1::jsonb",
            [queryJsonFilter]
        );
    } catch (err) {
        console.error("❌ [Arena Settlement Error] Failed to fetch pending bets:", err.message);
        return;
    }

    const pendingBets = pendingBetsRes.rows;

    for (let bet of pendingBets) {
        let items = typeof bet.items === 'string' ? JSON.parse(bet.items) : bet.items;
        let isBetLost = false;

        // Извлекаем итоговый счет матча Арены
        const sh = finishedMatch.score?.home !== undefined ? finishedMatch.score.home : finishedMatch.score_home;
        const sa = finishedMatch.score?.away !== undefined ? finishedMatch.score.away : finishedMatch.score_away;

        for (let item of items) {
            if (item.matchId !== finishedMatchId) continue;

            let isItemWin = false;

            // 1. Маркет: Результат матча (1X2)
            if (item.market === 'winner') {
                if (item.selectedOutcome === 'p1' && sh > sa) isItemWin = true;
                if (item.selectedOutcome === 'p2' && sa > sh) isItemWin = true;
                // Ничьи (x) на Арене нет, исход всегда false
            }
            // 2. Маркет: Тотал раундов битвы (Вместо тотала голов)
            else if (item.market === 'total') {
                // В нашей модели тотал завязан на симуляцию счета (sh + sa)
                const totalPoints = sh + sa;
                if (item.selectedOutcome === 'over' && totalPoints > Number(item.target)) isItemWin = true;
                if (item.selectedOutcome === 'under' && totalPoints < Number(item.target)) isItemWin = true;
            }
            // 3. Маркет: Фора по героям
            else if (item.market === 'handicap') {
                if (item.selectedOutcome === 'h1' && (sh + Number(item.handicapValue)) > sa) isItemWin = true;
                if (item.selectedOutcome === 'h2' && (sh + Number(item.handicapValue)) < sa) isItemWin = true;
            }
            // 4. Маркет: Первая кровь (Вместо "Обе забьют")
            else if (item.market === 'btts') {
                // В архитектуре тикера: если первый гол забит Хозяевами (yes), иначе (no)
                if (item.selectedOutcome === 'yes' && sh > 0) isItemWin = true;
                if (item.selectedOutcome === 'no' && sa > 0) isItemWin = true;
            }

            item.status = isItemWin ? "WON" : "LOST";
            if (!isItemWin) isBetLost = true;
        }

        // Записываем промежуточные результаты исходов в купон
        await pool.query(
            "UPDATE sports_bets SET items = $1::jsonb WHERE id = $2",
            [JSON.stringify(items), bet.id]
        );

        // Проверяем, завершились ли остальные события внутри этого купона (для Экспрессов)
        const allItemsFinished = items.every(i => i.status !== "PENDING");

        if (allItemsFinished) {
            const isWholeBetWon = items.every(i => i.status === "WON");
            const finalStatus = isWholeBetWon ? "WON" : "LOST";

            let finalPayout = 0;
            if (finalStatus === "WON") {
                const globalConfig = global.CONFIG || {};
                const partnerConfig = globalConfig[bet.partner_id] || {};
                const sportConfig = partnerConfig.sport || { maxPayout: 50000 };

                // Фиксированный расчет ординара без футбольного комбо-бонуса ради простоты тестов
                finalPayout = Math.floor(Number(bet.stake) * Number(bet.total_odds));

                // Отрезаем по B2B лимиту
                if (sportConfig.maxPayout && finalPayout > Number(sportConfig.maxPayout)) {
                    finalPayout = Number(sportConfig.maxPayout);
                }
            }

            // Начисляем выигрыш в Blood Coins (БК) напрямую в ресурсы Гачи (вместо фиатного баланса футбола)
            if (finalStatus === "WON" && finalPayout > 0) {
                try {
                    // Атомарный апдейт поля resources -> blood_coin внутри JSONB профиля
                    const updateBcQuery = `
                        UPDATE player_server_profiles 
                        SET resources = jsonb_set(
                            resources, 
                            '{blood_coin}', 
                            (COALESCE(resources->>'blood_coin', '0')::int + $1)::text::jsonb
                        )
                        WHERE nickname = $2 AND server_id = $3;
                    `;
                    // Подставляем данные b2b сессии из купона ставки
                    await pool.query(updateBcQuery, [finalPayout, bet.username, String(bet.server_id || '1')]);
                } catch (err) {
                    console.error(`❌ [Arena Payment System Error] Failed to credit BC for bet #${bet.id}:`, err.message);
                    continue;
                }
            }

            // Фиксируем закрытие купона
            await pool.query(
                "UPDATE sports_bets SET status = $1, prize = $2 WHERE id = $3",
                [finalStatus, finalPayout, bet.id]
            );
            console.log(`✅ [Arena Gacha] Купон #${bet.id} успешно рассчитан. Статус: ${finalStatus}, выплата: ${finalPayout} БК`);
        }
    }
}

exports.generateDailySchedule = async (partnerId = 'demo_mtwtech', gameId, serverId, gameConfig) => {
    // Проверка несыгранных матчей в Postgres
    const countRes = await pool.query(
        "SELECT COUNT(*) FROM b2b_pvp_arena_matches WHERE server_id = $1 AND game_id = $2 AND status != 'FINISHED'",
        [String(serverId), String(gameId)]
    );
    if (parseInt(countRes.rows[0].count) > 0) return { success: false, message: "Есть активные матчи" };

    const query = `
        SELECT user_id, nickname, game_data 
        FROM player_server_profiles 
        WHERE server_id = $1 LIMIT 256;
    `;
    const { rows: realPlayers } = await pool.query(query, [String(serverId)]);

    // Собираем реальных игроков
    let participants = realPlayers.map(p => {
        const playerHeroes = p.game_data?.heroes || [];

        // Маппим реальных героев игрока под ТОП-характеристики из каталога
        const upgradedHeroes = playerHeroes.map(h => {
            const catalogHero = gameConfig?.catalog?.heroes?.[h.hero_id] || {};
            const base = catalogHero.base_stats || { hp: 1000, atk: 250, speed: 120 };
            const growth = catalogHero.stats_growth || { hp: 50, atk: 25, speed: 5 };

            return {
                ...h,
                hp: Number(base.hp || 0) + Number(growth.hp || 0) * (80 - 1),
                atk: Number(base.atk || 0) + Number(growth.atk || 0) * (80 - 1),
                armor: 160,
                crit: 30,
                speed: Number(base.speed || 0) + Number(growth.speed || 0) * (80 - 1),
                is_bot: false
            };
        });

        return {
            id: String(p.user_id),
            name: p.nickname,
            // Если у игрока пустой отряд в базе, выдаем ему сгенерированную команду из каталога
            team: upgradedHeroes.length > 0 ? upgradedHeroes : generateBotTeam(gameConfig)
        };
    });

    // Добиваем ботами из каталога до 256 участников
    while (participants.length < 256) {
        const botName = `${BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)]}_${Math.floor(100 + Math.random() * 900)}`;
        participants.push({
            id: `bot_${crypto.randomBytes(4).toString('hex')}`,
            name: botName,
            team: generateBotTeam(gameConfig) // Генерирует легальный отряд по каталогу конфига
        });
    }

    // Перемешиваем турнирную сетку
    participants.sort(() => Math.random() - 0.5);
    const timestamp = Date.now();

    // Разбиваем на пары и запускаем симулятор
    for (let i = 0; i < participants.length; i += 2) {
        const home = participants[i];
        const away = participants[i+1];
        const matchId = `ga_arena_${timestamp}_${i}`;

        const teamsData = { home: home.name, away: away.name, _homeRaw: home.team, _awayRaw: away.team };

        // Считаем power на основе РЕАЛЬНЫХ расчетных характеристик из каталога
        const homePower = Math.floor(home.team.reduce((sum, h) => sum + (h.atk + h.hp / 10), 0) / 10);
        const awayPower = Math.floor(away.team.reduce((sum, h) => sum + (h.atk + h.hp / 10), 0) / 10);

        const marketsData = generateArenaMarkets(homePower, awayPower, 0, 0, 0, partnerId);

        const battleResult = await simulatePvEBattle(home.team, away.team, gameConfig);

        await pool.query(
            `INSERT INTO b2b_pvp_arena_matches (match_id, partner_id, game_id, server_id, league, teams, status, minute, score_home, score_away, markets, ball_zone, battle_replay)
             VALUES ($1, $2, $3, $4, $5, $6::jsonb, 'PREMATCH', 0, 0, 0, $7::jsonb, 0, $8::jsonb)`,
            [matchId, String(partnerId), String(gameId), String(serverId), "Gacha Grand Cup", JSON.stringify(teamsData), JSON.stringify(marketsData), JSON.stringify(battleResult)]
        );
    }

    // Переводим 2 первых матча в LIVE
    await pool.query(
        `UPDATE b2b_pvp_arena_matches SET status = 'LIVE' WHERE id IN (
            SELECT id FROM b2b_pvp_arena_matches WHERE status = 'PREMATCH' AND server_id = $1 AND game_id = $2 ORDER BY id ASC LIMIT 2
         )`, [String(serverId), String(gameId)]
    );

    console.log(`[virtualArena] Сетка на 256 легальных участников по каталогу успешно сгенерирована.`);
    return { success: true };
};


exports.startArenaEngine = (ms = 3000, io = null) => {
    if (arenaEngineInterval) return;

    console.log(`🚀 [Gacha Arena Engine] Запущен с интервалом ${ms}мс.`);

    arenaEngineInterval = setInterval(async () => {
        try {
            let hasFinished = false, hasNew = false;
            // 1. Запрашиваем LIVE матчи
            let liveRes = await pool.query("SELECT * FROM b2b_pvp_arena_matches WHERE status = 'LIVE'");
            let liveMatches = liveRes.rows;

            // 🔥 ФИКС ПОЯВЛЕНИЯ НОВЫХ МАТЧЕЙ: Если лайв пуст, мгновенно пихаем новые из прематча
            // 🔥 ФИКС ПОЯВЛЕНИЯ НОВЫХ МАТЧЕЙ: Если лайв пуст, мгновенно пихаем новые из прематча
            if (liveMatches.length === 0) {
                const prematchRes = await pool.query(
                    `SELECT * FROM b2b_pvp_arena_matches WHERE status = 'PREMATCH' ORDER BY id ASC LIMIT 2`
                );

                if (prematchRes.rowCount > 0) {
                    for (let m of prematchRes.rows) {

                        // ====================================================================
                        // 🛠️ НАЧАЛО БЛОКА ЗАЩИТЫ КАССЫ (ВЫБОР УМНОГО РЕПЛЕЯ ПЕРЕД СТАРТОМ LIVE)
                        // ====================================================================
                        // 1. Считаем, сколько БК игроки успели поставить в прематче на этот конкретный матч m.match_id
                        const poolsRes = await pool.query(`
                            SELECT 
                                COALESCE(SUM(CASE WHEN (item->>'selectedOutcome') = 'p1' THEN stake * total_odds END), 0)::numeric as potential_payout_p1,
                                COALESCE(SUM(CASE WHEN (item->>'selectedOutcome') = 'p2' THEN stake * total_odds END), 0)::numeric as potential_payout_p2,
                                COALESCE(SUM(stake), 0)::numeric as total_stake_money
                            FROM sports_bets, jsonb_array_elements(items) as item
                            WHERE status = 'PENDING' AND (item->>'matchId') = $1
                        `, [m.match_id]);

                        const payoutP1 = Number(poolsRes.rows[0].potential_payout_p1 || 0); // Выплата, если победит W1
                        const payoutP2 = Number(poolsRes.rows[0].potential_payout_p2 || 0); // Выплата, если победит W2
                        const totalCollected = Number(poolsRes.rows[0].total_stake_money || 0); // Весь банк матча


                        // Десериализуем данные команд, которые были записаны при генерации дня
                        const teamsData = typeof m.teams === 'string' ? JSON.parse(m.teams) : m.teams;

                        // 2. Делаем 5 быстрых прогонов боя, чтобы получить кандидатов с РАЗНЫМИ исходами (РНГ, криты)
                        const candidates = [];
                        const gameConfig = global.gamesConfigDB?.[m.game_id] || {}; // Подтягиваем конфиг игры

                        for (let k = 0; k < 5; k++) {
                            // Клонируем отряды, чтобы симулятор их не мутировал
                            const homeClone = JSON.parse(JSON.stringify(teamsData._homeRaw));
                            const awayClone = JSON.parse(JSON.stringify(teamsData._awayRaw));

                            // Запускаем твой реальный пошаговый боевой движок
                            const simRes = await simulatePvEBattle(homeClone, awayClone, gameConfig);

                            // Считаем чистую прибыль платформы в БК при таком сценарии реплея
                            // Доход = Весь банк - Выплата угадавшей стороне
                            const platformProfit = simRes.win ? (totalCollected - payoutP1) : (totalCollected - payoutP2);

                            candidates.push({ replay: simRes, profit: platformProfit });
                        }

                        // 3. Сортируем кандидатов: на первом месте будет реплей с МАКСИМАЛЬНОЙ прибылью для кассы платформы
                        candidates.sort((a, b) => b.profit - a.profit);
                        const bestReplayForPlatform = candidates[0].replay;


                        //ъъъъъъъъъъъъъъъъъъъъъ

                        // const targetHouseProfit = totalCollected * 0.06;
                        //
                        // // Сортируем кандидатов по минимальному отклонению от идеальных 6%
                        // candidates.sort((a, b) => {
                        //     const deviationA = Math.abs(a.profit - targetHouseProfit);
                        //     const deviationB = Math.abs(b.profit - targetHouseProfit);
                        //     return deviationA - deviationB; // Кто ближе к 6%, тот встает на первое место!
                        // });
                        //
                        // // Сервер выберет реплей, который максимально честно удерживает 6% маржи!
                        // const bestReplayForPlatform = candidates[0].replay;


                        //ъъъъъъъъъъъъъъъъъъъъъ

                        // 4. Переводим матч в LIVE и принудительно перезаписываем battle_replay на самый выгодный для нас!
                        await pool.query(
                            `UPDATE b2b_pvp_arena_matches 
                             SET status = 'LIVE', battle_replay = $1::jsonb 
                             WHERE id = $2`,
                            [JSON.stringify(bestReplayForPlatform), m.id]
                        );
                        // ====================================================================
                        // 🛠️ КОНЕЦ БЛОКА ЗАЩИТЫ КАССЫ
                        // ====================================================================

                        console.log(`[Arena Engine] Матч ${m.match_id} защищен алгоритмом профита и переведен в LIVE!`);
                    }
                    hasNew = true;

                    // Перезапрашиваем LIVE матчи, чтобы этот же тик сервера сразу их обработал без задержки!
                    const freshLiveRes = await pool.query("SELECT * FROM b2b_pvp_arena_matches WHERE status = 'LIVE'");
                    liveMatches = freshLiveRes.rows;
                } else {
                    // Если прематч полностью пуст — перегенерируем день
                    await module.exports.generateDailySchedule();
                    return;
                }
            }


            // 2. Крутим активные бои
            // Множество для сбора уникальных комнат, которые обновились на этом тике

            const updatedRooms = new Map();

            // 2. Крутим активные бои
            for (let match of liveMatches) {
                let newMinute = Number(match.minute || 0) + 2;
                let scoreHome = Number(match.score_home || 0);
                let scoreAway = Number(match.score_away || 0);
                let newStatus = "LIVE";
                let ballZone = 0;

                const replayData = typeof match.battle_replay === 'string' ? JSON.parse(match.battle_replay) : match.battle_replay;
                const teams = typeof match.teams === 'string' ? JSON.parse(match.teams) : match.teams;

                const totalCombatRounds = replayData.replay?.length || 1;
                const roundIndex = Math.min(
                    totalCombatRounds - 1,
                    Math.floor((newMinute / 90) * totalCombatRounds)
                );

                if (newMinute >= 90) {
                    newMinute = 90;
                    newStatus = "FINISHED";

                    if (replayData.win) {
                        if (scoreHome <= scoreAway) scoreHome = scoreAway + 1;
                    } else {
                        if (scoreAway <= scoreHome) scoreAway = scoreHome + 1;
                    }
                } else {
                    if (Math.random() < 0.08) {
                        Math.random() > 0.5 ? scoreHome++ : scoreAway++;
                        ballZone = scoreHome > scoreAway ? 3 : 4;
                    }
                }

                const homePower = Math.floor((Number(teams._homeRaw?.atk || 0) + Number(teams._homeRaw?.hp || 0) / 10) / 10);
                const awayPower = Math.floor((Number(teams._awayRaw?.atk || 0) + Number(teams._awayRaw?.hp || 0) / 10) / 10);
                const newMarkets = generateArenaMarkets(homePower, awayPower, newMinute, scoreHome, scoreAway, match.partner_id);

                // Сохраняем состояние матча в Postgres
                await pool.query(
                    `UPDATE b2b_pvp_arena_matches 
                     SET minute = $1, score_home = $2, score_away = $3, status = $4, markets = $5::jsonb, ball_zone = $6::integer 
                     WHERE id = $7`,
                    [newMinute, scoreHome, scoreAway, newStatus, JSON.stringify(newMarkets), Number(ballZone), match.id]
                );

                const mGameId = String(match.game_id);
                const mServerId = String(match.server_id);
                const mPartnerId = String(match.partner_id || 'demo_mtwtech');
                const targetRoomName = `room_${mGameId}_${mServerId}`;

                // Добавляем комнату в Map для последующей групповой рассылки линии
                updatedRooms.set(targetRoomName, { partnerId: mPartnerId, gameId: mGameId, serverId: mServerId });

                // СИНХРОНИЗАЦИЯ: arena_tick шлем сразу, так как логи раундов уникальны для каждого матча
                if (io) {
                    const mGameId = String(match.game_id);
                    const mServerId = String(match.server_id);
                    const targetRoomName = `room_${mGameId}_${mServerId}`;

                    // Берем конкретный раунд из оригинального simulatePvEBattle [Turn 4]
                    const currentRoundData = replayData.replay?.[roundIndex] || { round: roundIndex + 1, actions: [] };

                    // Пушим СЫРОЙ JSON раунда (массив actions) для твоего 2D-визуализатора
                    io.to(targetRoomName).emit('arena_tick', {
                        match_id: match.match_id,
                        status: newStatus,
                        battle_round: currentRoundData,
                        is_final: newStatus === "FINISHED"
                    });
                }

                if (newStatus === "FINISHED") {
                    await checkSettledBets({
                        match_id: match.match_id,
                        id: match.id,
                        score: { home: scoreHome, away: scoreAway },
                        status: newStatus,
                        partner_id: match.partner_id
                    });
                    hasFinished = true;
                }
            } // ➔ КОНЕЦ ЦИКЛА ПО МАТЧАМ

            // 🔥 ГРУППИРОВКА И ОБНОВЛЕНИЕ ЛИНИИ В КОНЦЕ ЦИКЛА
            // Пробегаем по всем уникальным комнатам игр/серверов и пушим им линию ОДИН РАЗ за весь тик
            if(hasFinished || hasNew) {
                if (io && updatedRooms.size > 0) {
                    for (let [roomName, meta] of updatedRooms) {
                        const targetRoomLine = await module.exports.getArenaLine(meta.partnerId, meta.gameId, meta.serverId);
                        io.to(roomName).emit('arena_line_update', targetRoomLine);
                        console.log(`[Сокет Сервер] Отправлено пакетное обновление линии для комнаты: ${roomName} (${targetRoomLine.length} матчей)`);
                    }
                }
            }


        } catch (err) {
            console.error("❌ [Arena Engine Core Error]:", err.stack || err.message);
        }
    }, ms);

    return { success: true, message: "Движок успешно запущен" };
};


exports.getArenaLine = async function(partnerId = null, gameId = null, serverId = null) {
    try {
        let query = `
            SELECT id, match_id, partner_id, game_id, server_id, sport, league, teams, status, minute, score_home, score_away, markets, ball_zone,battle_replay 
            FROM b2b_pvp_arena_matches
            WHERE status IN ('PREMATCH', 'LIVE')
        `;
        const params = [];

        // Если параметры переданы (запрос из API контроллера), добавляем их в SQL
        if (partnerId) { params.push(partnerId); query += ` AND partner_id = $${params.length}`; }
        if (gameId) { params.push(gameId); query += ` AND game_id = $${params.length}`; }
        if (serverId) { params.push(serverId); query += ` AND server_id = $${params.length}`; }

        query += " ORDER BY id ASC;";

        const { rows } = await pool.query(query, params);
        return rows;
    } catch (err) {
        console.error("❌ [Arena getArenaLine Error]:", err.message);
        return [];
    }
};



exports.createSportsBet = async function (username, partnerId, betData, gameId = null, serverId = null) {
        const enrichedItems = [];

        // 1. Извлекаем конфигурацию конкретного партнера
        const globalConfig = global.CONFIG || {};
        const partnerConfig = globalConfig[partnerId] || {};
        const config = partnerConfig.sport || { minStake: 10, maxStake: 5000, maxOdds: 1000 };

        const stake = Number(betData.stake);
        if (stake < Number(config.minStake) || stake > Number(config.maxStake)) {
            throw new Error(`Ставка должна быть от ${config.minStake} до ${config.maxStake} БК 🪙`);
        }

        let totalOdds = Number(betData.totalOdds);
        if (totalOdds > Number(config.maxOdds)) {
            totalOdds = Number(config.maxOdds); // Отрезаем по B2B лимиту
        }

        // 2. Валидация баланса Blood Coins (БК) для Гача-Арены
        if (gameId && serverId) {
            // Проверяем наличие профиля и баланс БК атомарно
            const profileRes = await pool.query(
                "SELECT resources FROM player_server_profiles WHERE server_id = $1 AND nickname = $2 FOR UPDATE",
                [serverId, username]
            );

            if (profileRes.rowCount === 0) {
                throw new Error("Профиль игрока на этом сервере не найден");
            }

            const resources = profileRes.rows[0].resources || {};
            const currentBc = Number(resources.blood_coin || 0);

            if (currentBc < stake) {
                throw new Error("Недостаточно Blood Coins (БК) для совершения ставки ❌");
            }
        }

        // 3. Обогащение исходов из правильной таблицы матчей
        for (let item of betData.items) {
            let matchRes;

            if (gameId && serverId) {
                // Если это Гача-Арена, тянем маркеты и статус из таблицы Арены
                matchRes = await pool.query(
                    "SELECT markets, status FROM b2b_pvp_arena_matches WHERE match_id = $1 AND server_id = $2 LIMIT 1",
                    [item.matchId, serverId]
                );
            } else {
                // Иначе стандартный виртуальный футбол
                matchRes = await pool.query("SELECT markets, status FROM matches WHERE match_id = $1 LIMIT 1", [item.matchId]);
            }

            if (matchRes.rowCount === 0) {
                throw new Error(`Матч #${item.matchId} не найден`);
            }

            const match = matchRes.rows[0];
            if (match.status !== 'PREMATCH') {
                throw new Error(`Прием ставок на матч #${item.matchId} заблокирован, так как он уже в LIVE/FINISHED 🚫`);
            }

            let target = null;
            let handicapValue = null;

            const markets = typeof match.markets === 'string' ? JSON.parse(match.markets) : match.markets;
            if (markets && markets[item.market]) {
                target = markets[item.market].target || null;
                handicapValue = markets[item.market].value || null;
            }

            enrichedItems.push({
                ...item,
                target,
                handicapValue,
                settled: false,
                won: false
            });
        }

        const type = enrichedItems.length > 1 ? "MULTI" : "SINGLE";

        // 4. Списание Blood Coins (БК) из профиля игрока Гачи
        if (gameId && serverId) {
            const deductBcQuery = `
            UPDATE player_server_profiles 
            SET resources = jsonb_set(
                resources, 
                '{blood_coin}', 
                ((resources->>'blood_coin')::int - $1)::text::jsonb
            )
            WHERE server_id = $2 AND nickname = $3;
        `;
            await pool.query(deductBcQuery, [stake, serverId, username]);
        }

        // 5. Запись купона в sports_bets (сохраняем структуру таблицы для фронта!)
        const insertBetRes = await pool.query(
            `INSERT INTO sports_bets (username, partner_id, type, items, total_odds, stake, status, timestamp) 
         VALUES ($1, $2, $3, $4::jsonb, $5, $6, 'PENDING', NOW()) RETURNING id`,
            [username, partnerId, type, JSON.stringify(enrichedItems), totalOdds, stake]
        );

        return {
            _id: insertBetRes.rows[0].id, // ИСПРАВЛЕНО: rows[0].id вместо rows.id
            username,
            partnerId,
            items: enrichedItems,
            totalOdds,
            stake,
            status: "PENDING",
            gameId,
            serverId
        };
    };

exports.getUserBets = async function (username, status, gameId = null, serverId = null) {
    try {
        let res;
        let query = "SELECT * FROM sports_bets WHERE username = $1";
        const params = [username];

        // Фильтр по статусу, если он передан
        if (status) {
            params.push(status);
            query += ` AND status = $${params.length}`;
        }

        // Изолируем историю Арены от футбола, если передан контекст Гачи
        if (gameId && serverId) {
            params.push(gameId, serverId);
            query += ` AND game_id = $${params.length - 1} AND server_id = $${params.length}`;
        } else {
            // Если это обычный футбол, исключаем гача-матчи из выдачи
            query += " AND game_id IS NULL AND server_id IS NULL";
        }

        query += " ORDER BY timestamp DESC";

        res = await pool.query(query, params);

        return res.rows.map(b => ({
            _id: b.id,
            username: b.username,
            partnerId: b.partner_id,
            type: b.type,
            items: typeof b.items === 'string' ? JSON.parse(b.items) : b.items,
            totalOdds: Number(b.total_odds),
            stake: Number(b.stake),
            status: b.status,
            prize: Number(b.prize || 0),
            timestamp: b.timestamp,
            gameId: b.game_id || null,
            serverId: b.server_id || null
        }));
    } catch (err) {
        console.error("❌ [Postgres V-Football getUserBets Error]:", err.message);
        return [];
    }
};

exports.checkSettledBets = checkSettledBets;



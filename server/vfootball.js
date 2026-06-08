const TEAMS_DB = [
    // La Liga (Испания)
    { name: "Real Madrid", power: 95, league: "La Liga" },
    { name: "Barcelona", power: 89, league: "La Liga" },
    { name: "Atletico Madrid", power: 85, league: "La Liga" },
    { name: "Girona", power: 81, league: "La Liga" },
    { name: "Real Sociedad", power: 80, league: "La Liga" },

    // Premier League (Англия)
    { name: "Manchester City", power: 94, league: "Premier League" },
    { name: "Liverpool", power: 91, league: "Premier League" },
    { name: "Arsenal", power: 90, league: "Premier League" },
    { name: "Aston Villa", power: 81, league: "Premier League" },
    { name: "Tottenham Hotspur", power: 83, league: "Premier League" },
    { name: "Manchester United", power: 82, league: "Premier League" },
    { name: "Chelsea", power: 82, league: "Premier League" },
    { name: "Newcastle United", power: 81, league: "Premier League" },

    // Bundesliga (Германия)
    { name: "Bayern Munich", power: 91, league: "Bundesliga" },
    { name: "Bayer Leverkusen", power: 86, league: "Bundesliga" },
    { name: "Borussia Dortmund", power: 84, league: "Bundesliga" },
    { name: "RB Leipzig", power: 83, league: "Bundesliga" },
    { name: "VfB Stuttgart", power: 80, league: "Bundesliga" },

    // Serie A (Италия)
    { name: "Inter Milan", power: 87, league: "Serie A" },
    { name: "Juventus", power: 83, league: "Serie A" },
    { name: "AC Milan", power: 82, league: "Serie A" },
    { name: "Atalanta", power: 82, league: "Serie A" },
    { name: "Napoli", power: 81, league: "Serie A" },
    { name: "AS Roma", power: 80, league: "Serie A" },
    { name: "Lazio", power: 79, league: "Serie A" },

    // Ligue 1 (Франция)
    { name: "PSG", power: 88, league: "Ligue 1" },
    { name: "Monaco", power: 79, league: "Ligue 1" },
    { name: "Lille", power: 78, league: "Ligue 1" },
    { name: "Marseille", power: 78, league: "Ligue 1" },

    // Другие топ-лиги Европы
    { name: "Sporting CP", power: 80, league: "Primeira Liga" }, // Португалия
    { name: "Benfica", power: 80, league: "Primeira Liga" },     // Португалия
    { name: "FC Porto", power: 79, league: "Primeira Liga" },    // Португалия

    { name: "PSV Eindhoven", power: 79, league: "Eredivisie" },   // Нидерланды
    { name: "Feyenoord", power: 78, league: "Eredivisie" }       // Нидерланды
];

const crypto = require('crypto');

// ИСПРАВЛЕНО: Забираем глобальный пул Postgres вместо удаленного файла DB.js
const pool = global.pool;

let engineInterval = null;

// Ограничение коэффициентов от 1.01 до 50
const roundOdd = (val) => parseFloat(Math.max(1.01, Math.min(50, val)).toFixed(2));

function getComboBonusFactor(itemsCount) {
    if (itemsCount <= 1) return 1.0;  // Ординар — без бонуса
    if (itemsCount === 2) return 1.03; // +3% к выигрышу
    if (itemsCount === 3) return 1.05; // +5% к выигрышу
    if (itemsCount === 4) return 1.08; // +8% к выигрышу
    return 1.12;                       // 5 и более событий — +12% к выигрышу
}

// Генератор рынков и коэффициентов с маржой 6%
function generateMarkets(home, away, currentMinute = 0, scoreHome = 0, scoreAway = 0, leagueName, partnerId = 'demo_mtwtech') {
    // ИСПРАВЛЕНО: Безопасное чтение спортивного конфига из глобального объекта с защитой от undefined
    const globalConfig = global.CONFIG || {};
    const partnerConfig = globalConfig[partnerId] || {};
    const config = partnerConfig.sport || {
        margin: 1.06,
        uclMargin: 1.05,
        maxStake: 5000,
        minStake: 10,
        maxOdds: 1000,
        cashoutFactor: 0.90,
        maxPayout: 50000
    };

    const timeLeft = 90 - currentMinute;
    const powerDiff = Math.abs(home.power - away.power) / 100;
    const scoreDiff = scoreHome - scoreAway;

    // Исход 1X2
    let p1Chance = 0.38 + powerDiff + (scoreDiff * 0.25) - (currentMinute / 90) * 0.05;
    let p2Chance = 0.32 - powerDiff - (scoreDiff * 0.25) - (currentMinute / 90) * 0.05;
    if (scoreDiff === 0) {
        p1Chance += (timeLeft / 90) * 0.03;
        p2Chance += (timeLeft / 90) * 0.03;
    }
    p1Chance = Math.max(0.02, Math.min(0.96, p1Chance));
    p2Chance = Math.max(0.02, Math.min(0.96, p2Chance));
    let xChance = Math.max(0.02, 1 - p1Chance - p2Chance);

    // Тотал матча
    const currentGoals = scoreHome + scoreAway;
    const totalLine = currentGoals <= 2 ? currentGoals + 2.5 : currentGoals + 1.5;
    const goalsNeeded = totalLine - currentGoals;
    const overChance = Math.max(0.05, ((90 - currentMinute) / 90) * (2.0 / goalsNeeded) * (1 + (home.power + away.power) / 300));
    const underChance = 1 - overChance;

    // Фора (Гандикап)
    let handicapValue = scoreDiff === 0 ? (powerDiff > 0.05 ? -1 : powerDiff < -0.05 ? 1 : 0) : -scoreDiff;
    let h1Chance = p1Chance * (1 + (handicapValue * 0.15));
    h1Chance = Math.max(0.1, Math.min(0.9, h1Chance));
    let h2Chance = 1 - h1Chance;

    // Если разница в силе огромная, закладываем маржу 8% (1.08), если равная игра — 5% (1.05)
    // ИСПРАВЛЕНО: Безопасное чтение margin/uclMargin из динамического объекта config
    const margin = leagueName && leagueName.includes("Champions") ? (config.uclMargin || 1.05) : (config.margin || 1.06);

    const bttsYesChance = Math.max(0.1, 0.6 - (scoreDiff * 0.05) - (currentMinute / 90) * 0.2); // Модель вероятности обе забьют
    const bttsNoChance = 1 - bttsYesChance;

    return {
        winner: {
            label: "Match Result (1X2)",
            odds: { p1: roundOdd((1 / p1Chance) * margin), x: roundOdd((1 / xChance) * margin), p2: roundOdd((1 / p2Chance) * margin) }
        },
        total: {
            label: `Total Goals (Over/Under ${totalLine})`,
            target: totalLine,
            odds: { over: roundOdd((1 / overChance) * margin), under: roundOdd((1 / underChance) * margin) }
        },
        handicap: {
            label: `Match Handicap (${handicapValue > 0 ? '+' + handicapValue : handicapValue})`,
            value: handicapValue,
            odds: { h1: roundOdd((1 / h1Chance) * margin), h2: roundOdd((1 / h2Chance) * margin) }
        },
        btts: {
            label: "Both Teams To Score",
            odds: { yes: roundOdd((1 / bttsYesChance) * margin), no: roundOdd((1 / bttsNoChance) * margin) }
        }
    };
}

// Автоматический расчет купонов при завершении матча
async function checkSettledBets(finishedMatch) {
    // В Postgres finishedMatch.id соответствует колонке match_id
    const finishedMatchId = finishedMatch.match_id || finishedMatch.id;

    let pendingBetsRes;
    try {
        // ИСПРАВЛЕНО: Быстрый поиск в Postgres по JSONB-массиву купонов с помощью оператора @>
        const queryJsonFilter = JSON.stringify([{ matchId: finishedMatchId }]);
        pendingBetsRes = await pool.query(
            "SELECT * FROM sports_bets WHERE status = 'PENDING' AND items @> $1::jsonb",
            [queryJsonFilter]
        );
    } catch (err) {
        console.error("❌ [Postgres V-Football Cron] Failed to fetch pending bets:", err.message);
        return;
    }

    const pendingBets = pendingBetsRes.rows;
    const walletService = require('./services/seamlessService'); // Безопасный импорт сервиса

    for (let bet of pendingBets) {
        // Безопасно десериализуем элементы купона, если они пришли в виде строки
        let items = typeof bet.items === 'string' ? JSON.parse(bet.items) : bet.items;
        let isBetLost = false;

        for (let item of items) {
            if (item.matchId !== finishedMatchId) continue;

            let isItemWin = false;
            // Сверяем счет матча из объекта finishedMatch
            const sh = finishedMatch.score?.home !== undefined ? finishedMatch.score.home : finishedMatch.score_home;
            const sa = finishedMatch.score?.away !== undefined ? finishedMatch.score.away : finishedMatch.score_away;

            if (item.market === 'winner') {
                if (item.selectedOutcome === 'p1' && sh > sa) isItemWin = true;
                if (item.selectedOutcome === 'x' && sh === sa) isItemWin = true;
                if (item.selectedOutcome === 'p2' && sa > sh) isItemWin = true;
            }
            else if (item.market === 'total') {
                const totalGoals = sh + sa;
                if (item.selectedOutcome === 'over' && totalGoals > Number(item.target)) isItemWin = true;
                if (item.selectedOutcome === 'under' && totalGoals < Number(item.target)) isItemWin = true;
            }
            else if (item.market === 'handicap') {
                if (item.selectedOutcome === 'h1' && (sh + Number(item.handicapValue)) > sa) isItemWin = true;
                if (item.selectedOutcome === 'h2' && (sh + Number(item.handicapValue)) < sa) isItemWin = true;
            }
            else if (item.market === 'btts') {
                const bothScored = sh > 0 && sa > 0;
                if (item.selectedOutcome === 'yes' && bothScored) isItemWin = true;
                if (item.selectedOutcome === 'no' && !bothScored) isItemWin = true;
            }

            item.status = isItemWin ? "WON" : "LOST";
            if (!isItemWin) isBetLost = true;
        }

        // 1. Записываем промежуточные результаты исходов в JSONB-колонку купона ставки
        await pool.query(
            "UPDATE sports_bets SET items = $1::jsonb WHERE id = $2",
            [JSON.stringify(items), bet.id]
        );

        // Проверяем, завершились ли остальные события внутри этого купона
        const allItemsFinished = items.every(i => i.status !== "PENDING");

        if (allItemsFinished) {
            const isWholeBetWon = items.every(i => i.status === "WON");
            const finalStatus = isWholeBetWon ? "WON" : "LOST";

            let finalPayout = 0;
            if (finalStatus === "WON") {
                // Извлекаем финансовый конфиг конкретного B2B-партнера для лимитов maxPayout
                const globalConfig = global.CONFIG || {};
                const partnerConfig = globalConfig[bet.partner_id] || {};
                const sportConfig = partnerConfig.sport || { maxPayout: 50000 };

                // Считаем базовый выигрыш с учетом комбо-бонуса экспресса
                const bonusFactor = getComboBonusFactor(items.length);
                finalPayout = Math.floor(Number(bet.stake) * Number(bet.total_odds) * bonusFactor);

                // ЗАЩИТА ОТ СВЕРХВЫИГРЫШЕЙ: Обрезаем по B2B лимиту кассы оператора
                if (sportConfig.maxPayout && finalPayout > Number(sportConfig.maxPayout)) {
                    finalPayout = Number(sportConfig.maxPayout);
                    console.log(`⚠️ [V-Football] Выплата по купону #${bet.id} ограничена лимитом Max Payout: ${sportConfig.maxPayout}`);
                }
            }

            // Связываем расчет напрямую с вашим методом шлюза платформы
            if (finalStatus === "WON" && finalPayout > 0) {
                try {
                    const sportsRoundId = `sp_win_${crypto.randomBytes(6).toString('hex')}`;
                    const gameName = `Sportsbook Win (${bet.type})`;

                    // Выплачиваем выигрыш на внешний шлюз
                    await walletService.credit(bet.username, bet.partner_id, null, finalPayout, gameName, sportsRoundId);

                    // Обновляем локальный баланс игрока в Postgres
                    await pool.query(
                        'UPDATE players SET balance = balance + $1 WHERE username = $2 AND partner_id = $3',
                        [finalPayout, bet.username, bet.partner_id]
                    );
                } catch (err) {
                    console.error(`❌ [Postgres V-Football] Failed to process seamless credit for bet #${bet.id}:`, err.message);
                    continue; // Пропускаем обновление статуса ставки, чтобы движок повторно обработал ее при перезапуске
                }
            }

            // Фиксируем финальный расчет купона в таблице sports_bets
            await pool.query(
                "UPDATE sports_bets SET status = $1, prize = $2 WHERE id = $3",
                [finalStatus, finalPayout, bet.id]
            );
            console.log(`✅ [V-Football] Купон #${bet.id} успешно рассчитан со статусом: ${finalStatus}, выплата: ${finalPayout}`);
        }
    }
}


module.exports = {
    // Генерация игрового дня на основе TEAMS_DB
    generateDailySchedule: async () => {
        // Подсчет несыгранных матчей через нативный SQL-запрос COUNT
        const countRes = await pool.query(
            "SELECT COUNT(*) FROM matches WHERE status != 'FINISHED'"
        );
        const activeCount = parseInt(countRes.rows[0].count); // Исправлено: в pg результат лежит в rows[0]

        if (activeCount > 0) {
            console.log(`[V-Football] Генерация отменена. В базе еще есть ${activeCount} несыгранных матчей.`);
            return { success: false, message: `Есть активные матчи: ${activeCount}` };
        }

        const timestamp = Date.now();
        let totalGenerated = 0;

        if (typeof TEAMS_DB === 'undefined') {
            console.error("❌ Critical: TEAMS_DB is not defined for generateDailySchedule");
            return { success: false, message: "Database configuration error" };
        }

        // ----------------------------------------------------
        // ЭТАП 1: ГЕНЕРАЦИЯ НАЦИОНАЛЬНЫХ ЛИГ
        // ----------------------------------------------------
        const groups = TEAMS_DB.reduce((acc, team) => {
            if (!acc[team.league]) acc[team.league] = [];
            acc[team.league].push(team);
            return acc;
        }, {});

        for (const leagueName in groups) {
            const shuffled = [...groups[leagueName]].sort(() => Math.random() - 0.5);

            for (let i = 0; i < shuffled.length; i += 2) {
                if (!shuffled[i] || !shuffled[i+1]) break; // Защита от нечетного кол-ва
                const home = shuffled[i];
                const away = shuffled[i+1];

                const matchId = `fb_league_${timestamp}_${i}_${leagueName.replace(/\s+/g, '')}`;
                const teamsData = { home: home.name, away: away.name, _homeRaw: home, _awayRaw: away };
                const marketsData = generateMarkets(home, away, 0, 0, 0, leagueName);

                // ИСПРАВЛЕНО: Полное соответствие 9 колонок и 9 передаваемых значений в Postgres
                await pool.query(
                    `INSERT INTO matches (match_id, sport, league, teams, status, minute, score_home, score_away, markets, ball_zone)
                     VALUES ($1, $2, $3, $4::jsonb, $5, 0, 0, 0, $6::jsonb, 0)`,
                    [matchId, "⚽ Football", leagueName, JSON.stringify(teamsData), "PREMATCH", JSON.stringify(marketsData)]
                );
                totalGenerated++;
            }
        }

        // ----------------------------------------------------
        // ЭТАП 2: ГЕНЕРАЦИЯ ЛИГИ ЧЕМПИОНОВ (Топы из всех лиг)
        // ----------------------------------------------------
        const uclTeams = TEAMS_DB.filter(team => team.power >= 88).sort(() => Math.random() - 0.5);

        for (let i = 0; i < uclTeams.length; i += 2) {
            if (!uclTeams[i] || !uclTeams[i+1]) break;
            const home = uclTeams[i];
            const away = uclTeams[i+1];

            const matchId = `fb_ucl_${timestamp}_${i}`;
            const teamsData = { home: home.name, away: away.name, _homeRaw: home, _awayRaw: away };
            const marketsData = generateMarkets(home, away, 0, 0, 0, "🏆 Champions League");

            // ИСПРАВЛЕНО: Полное соответствие 9 колонок и 9 передаваемых значений для ЛЧ
            await pool.query(
                `INSERT INTO matches (match_id, sport, league, teams, status, minute, score_home, score_away, markets, ball_zone)
                 VALUES ($1, $2, $3, $4::jsonb, $5, 0, 0, 0, $6::jsonb, 0)`,
                [matchId, "⚽ Football", "🏆 Champions League", JSON.stringify(teamsData), "PREMATCH", JSON.stringify(marketsData)]
            );
            totalGenerated++;
        }

        // ----------------------------------------------------
        // ЭТАП 3: АВТОМАТИЧЕСКИЙ СТАРТ ПЕРВЫХ МАТЧЕЙ В LIVE
        // ----------------------------------------------------
        try {
            // Переводим в LIVE 2 первых матча Лиги Чемпионов
            await pool.query(
                `UPDATE matches 
                 SET status = 'LIVE' 
                 WHERE id IN (
                     SELECT id FROM matches 
                     WHERE status = 'PREMATCH' AND league = '🏆 Champions League' 
                     ORDER BY id ASC 
                     LIMIT 2
                 )`
            );

            // Переводим в LIVE по одному первому матчу из каждой национальной лиги
            for (const leagueName in groups) {
                await pool.query(
                    `UPDATE matches 
                     SET status = 'LIVE' 
                     WHERE id IN (
                         SELECT id FROM matches 
                         WHERE status = 'PREMATCH' AND league = $1 
                         ORDER BY id ASC 
                         LIMIT 1
                     )`,
                    [leagueName]
                );
            }
        } catch (err) {
            console.error("❌ [Postgres V-Football Live Activation] Failed to move matches to live:", err.message);
        }

        console.log(`[V-Football] Успешно сгенерирован игровой день: ${totalGenerated} матчей (Лиги + ЛЧ).`);
        return { success: true, message: `Сгенерировано матчей: ${totalGenerated}` };
    },

    // Старт движка лайв-симуляции
    // Передаем io вторым аргументом (ms = интервал, io = инстанс Socket.io)
    startEngine: (ms = 3000, io = null) => {
        if (engineInterval) {
            console.log("[V-Football] Движок уже запущен.");
            return { success: false, message: "Движок уже запущен" };
        }

        console.log(`[V-Football] Симуляция матчей ЗАПУЩЕНА с интервалом ${ms}мс.`);

        engineInterval = setInterval(async () => {
            try {
                // Запрашиваем LIVE матчи
                const liveRes = await pool.query("SELECT * FROM matches WHERE status = 'LIVE'");
                let liveMatches = liveRes.rows;

                if (liveMatches.length === 0) {
                    const prematchRes = await pool.query(
                        `SELECT * FROM matches WHERE status = 'PREMATCH' ORDER BY id ASC LIMIT 2`
                    );

                    if (prematchRes.rowCount > 0) {
                        for (let m of prematchRes.rows) {
                            await pool.query("UPDATE matches SET status = 'LIVE' WHERE id = $1", [m.id]);
                        }
                    } else {
                        await module.exports.generateDailySchedule();
                        console.log("[V-Football] Все матчи дня завершены. Движок перезапущен.");
                        clearInterval(engineInterval);
                        engineInterval = null;
                    }

                    if (io) {
                        const newLine = await module.exports.getSportsLine();
                        io.emit('sports_line_update', newLine);
                    }
                    return;
                }

                for (let match of liveMatches) {
                    // Железобетонно приводим к числам все данные из Postgres колонок
                    let newMinute = Number(match.minute || 0) + 1;
                    let scoreHome = Number(match.score_home || 0);
                    let scoreAway = Number(match.score_away || 0);
                    let newStatus = "LIVE";
                    let ballZone = 0;

                    // Извлекаем JSONB объект команд
                    const teams = typeof match.teams === 'string' ? JSON.parse(match.teams) : match.teams;

                    // ДЕБАГ-ЛОГ №1: Проверяем, что команды и их сила успешно прочитаны из базы Neon
                    if (!teams?._homeRaw || !teams?._awayRaw) {
                        console.error(`❌ [V-Football Debug] Критическая ошибка: Данные _homeRaw/_awayRaw не найдены в матче #${match.match_id}! Структура поля teams:`, teams);
                    }

                    if (newMinute >= 90) {
                        newMinute = 90;
                        newStatus = "FINISHED";
                    } else {
                        const randomEvent = Math.random();
                        if (randomEvent < 0.07) {
                            // Никакого хардкода: берем силу строго из структуры TEAMS_DB внутри JSONB
                            const p1 = Number(teams._homeRaw?.power || 0);
                            const p2 = Number(teams._awayRaw?.power || 0);

                            if (p1 === 0 || p2 === 0) {
                                console.warn(`⚠️ [V-Football Debug] Внимание: Сила команд равна нулю (p1: ${p1}, p2: ${p2}). Проверьте генерацию в TEAMS_DB.`);
                            }

                            if (Math.random() < (p1 / (p1 + p2))) {
                                scoreHome++;
                                ballZone = 3; // ГОЛ хозяев
                            } else {
                                scoreAway++;
                                ballZone = 4; // ГОЛ гостей
                            }
                        } else if (randomEvent < 0.25) {
                            ballZone = Math.random() > 0.5 ? 1 : 2; // Атака
                        } else {
                            ballZone = 0; // Центр поля
                        }
                    }

                    const targetPartnerId = match.partner_id || 'demo_mtwtech';

                    // Пересчитываем рынки
                    const newMarkets = generateMarkets(teams._homeRaw, teams._awayRaw, newMinute, scoreHome, scoreAway, match.league, targetPartnerId);

                    // ДЕБАГ-ЛОГ №2: Проверяем, не сломалась ли математика коэффициентов в NaN
                    if (isNaN(newMarkets.winner.odds.p1)) {
                        console.error(`❌ [V-Football Debug] Математический краш: generateMarkets выдал NaN для матча #${match.match_id}! Проверьте передаваемые параметры:`, {
                            minute: newMinute, scoreHome, scoreAway, league: match.league
                        });
                    }

                    // Апдейтим состояние матча в Postgres по его первичному INT ключу id
                    // Принудительно кастуем ball_zone к INTEGER через аргументы пула
                    const updateRes = await pool.query(
                        `UPDATE matches 
                         SET minute = $1, score_home = $2, score_away = $3, status = $4, markets = $5::jsonb, ball_zone = $6::integer 
                         WHERE id = $7`,
                        [newMinute, scoreHome, scoreAway, newStatus, JSON.stringify(newMarkets), Number(ballZone), match.id]
                    );

                    // ДЕБАГ-ЛОГ №3: Убеждаемся, что строка в базе Neon физически обновилась
                    if (updateRes.rowCount === 0) {
                        console.error(`❌ [V-Football Debug] Ошибка БД: Строка матча с id ${match.id} не найдена для обновления!`);
                    }

                    const updatedMatchObject = {
                        ...match,
                        match_id: match.match_id,
                        score: { home: scoreHome, away: scoreAway },
                        status: newStatus
                    };

                    if (newStatus === "FINISHED") {
                        await checkSettledBets(updatedMatchObject);
                    }
                }

                // Пушим свежую линию в веб-сокеты на фронтенд
                if (io) {
                    const newLine = await module.exports.getSportsLine();
                    io.emit('sports_line_update', newLine);
                }
            } catch (err) {
                // Сюда вылетит любая скрытая SQL или JS ошибка, блокировавшая симуляцию
                console.error("❌ [Postgres V-Football Engine Core Error]:", err.stack || err.message);
            }
        }, ms);

        return { success: true, message: "Движок успешно запущен" };
    },

    stopEngine: () => {
        if (!engineInterval) return { success: false, message: "Движок не запущен" };
        clearInterval(engineInterval);
        engineInterval = null;
        console.log("[V-Football] Симуляция матчей ОСТАНОВЛЕНА.");
        return { success: true, message: "Движок остановлен" };
    },

    // Получение линии для контроллера/фронтенда из Postgres
    getSportsLine: async () => {
        try {
            const res = await pool.query("SELECT * FROM matches ORDER BY id ASC");
            return res.rows.map(m => {
                const minute = parseInt(m.minute);
                const scoreHome = parseInt(m.score_home || 0);
                const scoreAway = parseInt(m.score_away || 0);
                const teams = typeof m.teams === 'string' ? JSON.parse(m.teams) : m.teams;
                const markets = typeof m.markets === 'string' ? JSON.parse(m.markets) : m.markets;

                const formattedStatus = minute === 90
                    ? `FINISHED`
                    : `LIVE (${minute} min, ${scoreHome}:${scoreAway})`;

                return {
                    id: m.match_id,
                    sport: m.sport,
                    league: m.league,
                    teams: typeof teams === 'string' ? teams : `${teams.home} - ${teams.away}`,
                    status: minute === 0 && m.status === "PREMATCH" ? "PREMATCH" : formattedStatus,
                    markets: markets,
                    ballZone: parseInt(m.ball_zone || 0)
                };
            });
        } catch (err) {
            console.error("❌ [Postgres getSportsLine Error]:", err.message);
            return [];
        }
    },

    // Создание купона с чтением параметров тоталов и фор прямо из Postgres матчей
    createSportsBet: async (username, partnerId, betData) => {
        const enrichedItems = [];

        // Извлекаем конфигурацию конкретного партнера из глобальной памяти
        const globalConfig = global.CONFIG || {};
        const partnerConfig = globalConfig[partnerId] || {};
        const config = partnerConfig.sport || { minStake: 10, maxStake: 5000, maxOdds: 1000 };

        const stake = Number(betData.stake);
        if (stake < Number(config.minStake) || stake > Number(config.maxStake)) {
            throw new Error(`Stake should be from ${config.minStake} to ${config.maxStake} 🪙`);
        }

        let totalOdds = Number(betData.totalOdds);
        if (totalOdds > Number(config.maxOdds)) {
            totalOdds = Number(config.maxOdds); // Отрезаем по B2B лимиту бренда
        }

        for (let item of betData.items) {
            // Читаем актуальный матч из Postgres таблицы matches
            const matchRes = await pool.query("SELECT markets FROM matches WHERE match_id = $1 LIMIT 1", [item.matchId]);

            let target = null;
            let handicapValue = null;

            if (matchRes.rowCount > 0) {
                const markets = typeof matchRes.rows.markets === 'string' ? JSON.parse(matchRes.rows.markets) : matchRes.rows.markets;
                if (markets[item.market]) {
                    target = markets[item.market].target || null;
                    handicapValue = markets[item.market].value || null;
                }
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

        // INSERT купона ставки в PostgreSQL с использованием сериализации в JSONB
        const insertBetRes = await pool.query(
            `INSERT INTO sports_bets (username, partner_id, type, items, total_odds, stake, status, timestamp) 
             VALUES ($1, $2, $3, $4::jsonb, $5, $6, 'PENDING', NOW()) RETURNING id`,
            [username, partnerId, type, JSON.stringify(enrichedItems), totalOdds, stake]
        );

        return {
            _id: insertBetRes.rows.id,
            username,
            partnerId,
            items: enrichedItems,
            totalOdds,
            stake,
            status: "PENDING"
        };
    },

    getUserBets: async (username, status) => {
        try {
            let res;
            if (status) {
                // Запрашиваем купоны конкретного статуса ("PENDING", "WON", "LOST", "CASHOUT")
                res = await pool.query(
                    "SELECT * FROM sports_bets WHERE username = $1 AND status = $2 ORDER BY timestamp DESC",
                    [username, status]
                );
            } else {
                // Запрашиваем всю историю купонов игрока
                res = await pool.query(
                    "SELECT * FROM sports_bets WHERE username = $1 ORDER BY timestamp DESC",
                    [username]
                );
            }

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
                timestamp: b.timestamp
            }));
        } catch (err) {
            console.error("❌ [Postgres V-Football getUserBets Error]:", err.message);
            return [];
        }
    },

    calculateCashout: async (betId) => {
        try {
            // Ищем купон по нативному ID в таблице sports_bets
            const betRes = await pool.query(
                "SELECT * FROM sports_bets WHERE id = $1 AND status = 'PENDING' LIMIT 1",
                [betId]
            );
            if (betRes.rowCount === 0) return { success: false, message: "Ставка не найдена или уже рассчитана" };
            const bet = betRes.rows[0];

            let currentLiveOdds = 1;
            const items = typeof bet.items === 'string' ? JSON.parse(bet.items) : bet.items;

            for (let item of items) {
                // Ищем актуальный матч по строковому match_id в таблице matches
                const matchRes = await pool.query(
                    "SELECT * FROM matches WHERE match_id = $1 LIMIT 1",
                    [item.matchId]
                );

                if (matchRes.rowCount === 0) return { success: false, message: "Один из матчей купона недоступен" };
                const match = matchRes.rows[0];

                const minute = parseInt(match.minute);
                const scoreHome = parseInt(match.score_home || 0);
                const scoreAway = parseInt(match.score_away || 0);

                // Если матч завершен, проверяем сыграл ли исход
                if (minute === 90 || match.status === "FINISHED") {
                    if (item.status === "LOST") return { success: true, cashoutValue: 0 }; // Купон уже проигран
                    currentLiveOdds *= Number(item.odds);
                    continue;
                }

                // Если матч в лайве, парсим JSONB рынки и берем свежий кэф
                const markets = typeof match.markets === 'string' ? JSON.parse(match.markets) : match.markets;
                const liveMarket = markets[item.market];

                if (!liveMarket || !liveMarket.odds[item.selectedOutcome]) {
                    return { success: false, message: "Коэффициенты заблокированы" };
                }

                currentLiveOdds *= Number(liveMarket.odds[item.selectedOutcome]);
            }

            // Извлекаем фактор кэшаута (cashoutFactor) конкретного бренда из глобальной памяти CONFIG
            const globalConfig = global.CONFIG || {};
            const partnerConfig = globalConfig[bet.partner_id] || {};
            const sportConfig = partnerConfig.sport || { cashoutFactor: 0.90 };

            // Формула кэшаута: (Первоначальный кэф / Текущий кэф) * Ставка * B2B Фактор маржи
            let cashoutValue = (Number(bet.total_odds) / currentLiveOdds) * Number(bet.stake) * (sportConfig.cashoutFactor || 0.90);
            cashoutValue = Math.floor(cashoutValue);

            const maxWin = Number(bet.stake) * Number(bet.total_odds);
            cashoutValue = Math.max(0, Math.min(maxWin * 0.95, cashoutValue));

            return { success: true, cashoutValue };
        } catch (err) {
            console.error("❌ [Postgres V-Football calculateCashout Error]:", err.message);
            return { success: false, message: "Ошибка расчета выкупа" };
        }
    },

    executeCashout: async (betId, username) => {
        try {
            const cashoutData = await module.exports.calculateCashout(betId);
            if (!cashoutData.success || cashoutData.cashoutValue <= 0) {
                return { success: false, message: cashoutData.message || "Выкуп невозможен" };
            }

            // Находим купон, чтобы вытащить partner_id для правильной маршрутизации транзакции
            const betRes = await pool.query(
                "SELECT partner_id FROM sports_bets WHERE id = $1 AND username = $2 LIMIT 1",
                [betId, username]
            );
            if (betRes.rowCount === 0) return { success: false, message: "Доступ запрещен" };
            const partnerId = betRes.rows[0].partner_id;

            const walletService = require('./services/seamlessService');
            const cashoutRoundId = `sports_co_${crypto.randomBytes(6).toString('hex')}`;
            const gameName = "Sportsbook Cashout";

            // ИСПРАВЛЕНО: Безопасный асинхронный кредит на шлюз со всеми обязательными B2B-параметрами
            const creditResult = await walletService.credit(
                username,
                partnerId,
                null, // сессия null, транзакция кэшаута фоновая
                cashoutData.cashoutValue,
                gameName,
                cashoutRoundId
            );

            const freshBalance = creditResult && creditResult.balance !== undefined
                ? creditResult.balance
                : cashoutData.cashoutValue;

            // Помечаем купон в Postgres как завершенный со статусом CASHOUT
            await pool.query(
                "UPDATE sports_bets SET status = 'CASHOUT', prize = $1 WHERE id = $2 AND username = $3",
                [cashoutData.cashoutValue, betId, username]
            );

            // Синхронизируем локальный кэш баланса игрока в таблице players
            await pool.query(
                "UPDATE players SET balance = $1 WHERE username = $2 AND partner_id = $3",
                [freshBalance, username, partnerId]
            );

            return { success: true, newBalance: freshBalance, cashoutValue: cashoutData.cashoutValue };
        } catch (err) {
            console.error("❌ [Postgres V-Football executeCashout Error]:", err.message);
            return { success: false, message: "Внутренняя ошибка системы выкупа ставок" };
        }
    },

    // Получение архива результатов (последние 50 сыгранных матчей из Postgres)
    getMatchResults: async () => {
        try {
            // Вытаскиваем матчи со статусом FINISHED, сортируя по минуте/id
            const res = await pool.query(
                `SELECT match_id, league, teams, score_home, score_away 
                 FROM matches 
                 WHERE status = 'FINISHED' 
                 ORDER BY id DESC 
                 LIMIT 50`
            );

            return res.rows.map(m => {
                const teams = typeof m.teams === 'string' ? JSON.parse(m.teams) : m.teams;
                return {
                    id: m.match_id,
                    league: m.league,
                    teams: typeof teams === 'string' ? teams : `${teams.home} - ${teams.away}`,
                    score: `${m.score_home || 0}:${m.score_away || 0}`,
                    status: "FINISHED"
                };
            });
        } catch (err) {
            console.error("❌ [Postgres getMatchResults Error]:", err.message);
            return [];
        }
    },

    updateBookmakerConfig: async (partnerId, newConfig) => {
        if (!global.CONFIG) global.CONFIG = {};
        if (!global.CONFIG[partnerId]) global.CONFIG[partnerId] = {};
        if (!global.CONFIG[partnerId].sport) global.CONFIG[partnerId].sport = {};

        // Обновляем параметры внутри оперативной памяти бэкенда
        global.CONFIG[partnerId].sport = { ...global.CONFIG[partnerId].sport, ...newConfig };

        // Сохраняем измененное JSON-дерево в таблицу b2b_configs в Postgres
        await pool.query(
            `INSERT INTO b2b_configs (id, config_data) VALUES ($1, $2::jsonb)
             ON CONFLICT (id) DO UPDATE SET config_data = b2b_configs.config_data || EXCLUDED.config_data`,
            ['global_config', JSON.stringify({ [partnerId]: global.CONFIG[partnerId] })]
        );

        console.log(`[V-Football] Конфигурация БК успешно обновлена для партнера ${partnerId}`);
        return { success: true, config: global.CONFIG[partnerId].sport };
    },

    getBookmakerConfig: (partnerId) => {
        const globalConfig = global.CONFIG || {};
        const partnerConfig = globalConfig[partnerId] || {};
        return partnerConfig.sport || {};
    }
};
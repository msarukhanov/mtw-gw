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

const { betsDb, matchesDb } = require('./DB');

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
function generateMarkets(home, away, currentMinute = 0, scoreHome = 0, scoreAway = 0, leagueName) {

    const config = DEFAULT_CONFIG.sport;

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

    const margin = leagueName.includes("Champions") ? config.uclMargin : config.margin;

    const bttsYesChance = Math.max(0.1, 0.6 - (scoreDiff * 0.05) - (currentMinute / 90) * 0.2); // Грубая модель вероятности
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
    const pendingBets = await betsDb.find({
        status: "PENDING",
        "items.matchId": finishedMatch.id
    });

    const config = DEFAULT_CONFIG.sport;

    for (let bet of pendingBets) {
        let isBetLost = false;

        for (let item of bet.items) {
            if (item.matchId !== finishedMatch.id) continue;

            let isItemWin = false;
            const sh = finishedMatch.score.home;
            const sa = finishedMatch.score.away;

            if (item.market === 'winner') {
                if (item.selectedOutcome === 'p1' && sh > sa) isItemWin = true;
                if (item.selectedOutcome === 'x' && sh === sa) isItemWin = true;
                if (item.selectedOutcome === 'p2' && sa > sh) isItemWin = true;
            }
            else if (item.market === 'total') {
                const totalGoals = sh + sa;
                if (item.selectedOutcome === 'over' && totalGoals > item.target) isItemWin = true;
                if (item.selectedOutcome === 'under' && totalGoals < item.target) isItemWin = true;
            }
            else if (item.market === 'handicap') {
                if (item.selectedOutcome === 'h1' && (sh + item.handicapValue) > sa) isItemWin = true;
                if (item.selectedOutcome === 'h2' && (sh + item.handicapValue) < sa) isItemWin = true;
            }
            else if (item.market === 'btts') {
                const bothScored = sh > 0 && sa > 0;
                if (item.selectedOutcome === 'yes' && bothScored) isItemWin = true;
                if (item.selectedOutcome === 'no' && !bothScored) isItemWin = true;
            }

            item.status = isItemWin ? "WON" : "LOST";
            if (!isItemWin) isBetLost = true;
        }

        // Записываем промежуточные результаты исходов в документ ставки
        await betsDb.update({ _id: bet._id }, { $set: { items: bet.items } });

        const updatedBet = await betsDb.findOne({ _id: bet._id });
        const allItemsFinished = updatedBet.items.every(i => i.status !== "PENDING");

        if (allItemsFinished) {
            const isWholeBetWon = updatedBet.items.every(i => i.status === "WON");
            const finalStatus = isWholeBetWon ? "WON" : "LOST";

            let finalPayout = 0;
            if (finalStatus === "WON") {
                // 1. Считаем базовый выигрыш с учетом комбо-бонуса
                const bonusFactor = getComboBonusFactor(updatedBet.items.length);
                finalPayout = Math.floor(updatedBet.stake * updatedBet.totalOdds * bonusFactor);

                // 🔥 ИСПРАВЛЕНО: Защита от сверхвыигрышей (Лимит на выплату)
                // Если в конфиге заложен лимит maxPayout (например, 500000), обрезаем сумму
                if (config.maxPayout && finalPayout > config.maxPayout) {
                    finalPayout = config.maxPayout;
                    console.log(`[V-Football] Выплата по купону ${bet._id} урезана до лимита Max Payout: ${config.maxPayout}`);
                }
            }

            const seamless = require('../services/seamlessService');
            if (typeof module.exports.settleBet === 'function') {
                // Передаем итоговую, проверенную лимитами сумму выплаты
                await module.exports.settleBet(bet._id, finalStatus, finalPayout, seamless.credit);
            } else {
                await betsDb.update(
                    { _id: bet._id },
                    { $set: { status: finalStatus, payout: finalPayout } }
                );
            }
        }

        // if (allItemsFinished) {
        //     const isWholeBetWon = updatedBet.items.every(i => i.status === "WON");
        //     const finalStatus = isWholeBetWon ? "WON" : "LOST";
        //
        //     const seamless = require('../services/seamlessService');
        //
        //     // Защита от отсутствия глобального объекта sportsMethods
        //     if (typeof module.exports.settleBet === 'function') {
        //         await module.exports.settleBet(bet._id, finalStatus, seamless.credit);
        //     } else {
        //         // Если метод расчета лежит в другом сервисе — адаптируй вызов под себя:
        //         await betsDb.update({ _id: bet._id }, { $set: { status: finalStatus } });
        //         console.log(`[V-Football] Купон ${bet._id} рассчитан со статусом: ${finalStatus}`);
        //     }
        // }
    }
}

module.exports = {
    // Генерация игрового дня на основе TEAMS_DB
    generateDailySchedule: async () => {
        const activeCount = await matchesDb.count({ status: { $ne: "FINISHED" } });
        if (activeCount > 0) {
            console.log(`[V-Football] Генерация отменена. В базе еще есть ${activeCount} несыгранных матчей.`);
            return { success: false, message: `Есть активные матчи: ${activeCount}` };
        }

        const timestamp = Date.now();

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

                await matchesDb.insert({
                    id: `fb_league_${timestamp}_${i}_${leagueName.replace(/\s+/g, '')}`,
                    sport: "⚽ Football",
                    league: leagueName, // Реальная лига (La Liga, Premier League и т.д.)
                    teams: { home: home.name, away: away.name, _homeRaw: home, _awayRaw: away },
                    status: "PREMATCH",
                    minute: 0,
                    score: { home: 0, away: 0 },
                    markets: generateMarkets(home, away, 0, 0, 0, leagueName)
                });
            }
        }

        // ----------------------------------------------------
        // ЭТАП 2: ГЕНЕРАЦИЯ ЛИГИ ЧЕМПИОНОВ (Топы из всех лиг)
        // ----------------------------------------------------
        // Отбираем команды с силой 88 и выше (можно настроить порог под свой массив)
        const uclTeams = TEAMS_DB.filter(team => team.power >= 88).sort(() => Math.random() - 0.5);

        for (let i = 0; i < uclTeams.length; i += 2) {
            if (!uclTeams[i] || !uclTeams[i+1]) break;
            const home = uclTeams[i];
            const away = uclTeams[i+1];

            await matchesDb.insert({
                id: `fb_ucl_${timestamp}_${i}`,
                sport: "⚽ Football",
                league: "🏆 Champions League", // Отдельный турнир
                teams: { home: home.name, away: away.name, _homeRaw: home, _awayRaw: away },
                status: "PREMATCH",
                minute: 0,
                score: { home: 0, away: 0 },
                markets: generateMarkets(home, away, 0, 0, 0, "🏆 Champions League")
            });
        }

        // ----------------------------------------------------
        // ЭТАП 3: АВТОМАТИЧЕСКИЙ СТАРТ ПЕРВЫХ МАТЧЕЙ В LIVE
        // ----------------------------------------------------
        // Переводим в LIVE 2 матча Лиги Чемпионов
        const firstUcl = await matchesDb.find({ status: "PREMATCH", league: "🏆 Champions League" }).limit(2);
        for (let m of firstUcl) {
            await matchesDb.update({ _id: m._id }, { $set: { status: "LIVE" } });
        }

        // Переводим в LIVE по одному первому матчу из каждой национальной лиги
        for (const leagueName in groups) {
            const firstLeagueMatch = await matchesDb.findOne({ status: "PREMATCH", league: leagueName });
            if (firstLeagueMatch) {
                await matchesDb.update({ _id: firstLeagueMatch._id }, { $set: { status: "LIVE" } });
            }
        }

        const totalGenerated = await matchesDb.count({ status: "PREMATCH" }) + await matchesDb.count({ status: "LIVE" });
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
            let liveMatches = await matchesDb.find({ status: "LIVE" });

            if (liveMatches.length === 0) {
                let prematch = await matchesDb.find({ status: "PREMATCH" }).limit(2);
                if (prematch.length > 0) {
                    for (let m of prematch) {
                        await matchesDb.update({ _id: m._id }, { $set: { status: "LIVE" } });
                    }
                } else {
                    await module.exports.generateDailySchedule();
                    console.log("[V-Football] Все матчи дня завершены. Движок перезапущен.");
                    clearInterval(engineInterval);
                    engineInterval = null;
                }

                // 🔥 ДАЖЕ ЕСЛИ МАТЧИ ИЗМЕНИЛИ СТАТУС НА LIVE — СЛЕДУЕТ ОТПРАВИТЬ ОБНОВЛЕНИЕ
                if (io) {
                    const newLine = await module.exports.getSportsLine();
                    io.emit('sports_line_update', newLine);
                }
                return;
            }

            for (let match of liveMatches) {
                // let newMinute = match.minute + Math.floor(Math.random() * 3) + 2;
                let newMinute = match.minute + 1;
                let newScore = { ...match.score };
                let newStatus = "LIVE";
                let ballZone = 0; // 🔥 По умолчанию мяч в центре поля

                if (newMinute >= 90) {
                    newMinute = 90;
                    newStatus = "FINISHED";
                } else {
                    const randomEvent = Math.random();
                    if (randomEvent < 0.07) {
                        // Симуляция гола
                        const p1 = match.teams._homeRaw.power;
                        const p2 = match.teams._awayRaw.power;
                        if (Math.random() < (p1 / (p1 + p2))) {
                            newScore.home++;
                            ballZone = 3; // ГОЛ хозяев (зона ворот справа)
                        } else {
                            newScore.away++;
                            ballZone = 4; // ГОЛ гостей (зона ворот слева)
                        }
                    } else if (randomEvent < 0.25) {
                        // Опасная атака без гола (1 — атака хозяев, 2 — атака гостей)
                        ballZone = Math.random() > 0.5 ? 1 : 2;
                    } else {
                        ballZone = 0; // Спокойная игра в центре
                    }
                }

                const newMarkets = generateMarkets(match.teams._homeRaw, match.teams._awayRaw, newMinute, newScore.home, newScore.away, match.league);

                // Модифицируем локальный объект для чекера ставок
                match.minute = newMinute;
                match.score = newScore;
                match.status = newStatus;
                match.markets = newMarkets;
                match.ballZone = ballZone; // 🔥 Фиксируем локально

                // 🔥 ИСПРАВЛЕНО: Теперь база данных NeDB гарантированно сохраняет и обновляет ballZone в файле matches.db!
                await matchesDb.update(
                    { _id: match._id },
                    {
                        $set: {
                            minute: newMinute,
                            score: newScore,
                            status: newStatus,
                            markets: newMarkets,
                            ballZone: ballZone // <--- Добавили поле в базу
                        }
                    }
                );

                if (newStatus === "FINISHED") {
                    await checkSettledBets(match);
                }
            }


            // 🔥 В САМОМ КОНЦЕ ТИКА: собираем актуальную линию из БД и пушим в сокеты
            if (io) {
                const newLine = await module.exports.getSportsLine();
                io.emit('sports_line_update', newLine); // Отправка всем онлайн игрокам
            }

        }, ms);

        return { success: true, message: "Движок успешно запущен" };
    },

    // Остановка движка
    stopEngine: () => {
        if (!engineInterval) return { success: false, message: "Движок не запущен" };
        clearInterval(engineInterval);
        engineInterval = null;
        console.log("[V-Football] Симуляция матчей ОСТАНОВЛЕНА.");
        return { success: true, message: "Движок остановлен" };
    },

    // Получение линии для контроллера/фронтенда из БД
    getSportsLine: async () => {
        const matches = await matchesDb.find({});
        return matches.map(m => {
            const formattedStatus = m.minute === 90
                ? `FINISHED`
                : `LIVE (${m.minute} min, ${m.score.home}:${m.score.away})`;

            return {
                id: m.id,
                sport: m.sport,
                league: m.league,
                teams: `${m.teams.home} - ${m.teams.away}`,
                status: m.minute === 0 && m.status === "PREMATCH" ? "PREMATCH" : formattedStatus,
                markets: m.markets,
                ballZone: m.ballZone || 0 // 🔥 ИСПРАВЛЕНО: Передаем зону мяча на фронтенд по API и сокетам!
            };
        });
    },

    // Создание купона с чтением параметров тоталов и фор прямо из БД матчей + запись в bets.db
    createSportsBet: async (username, partnerId, betData) => {
        const enrichedItems = [];

        const config = DEFAULT_CONFIG.sport;

        const stake = Number(betData.stake);
        if (stake < config.minStake || stake > config.maxStake) {
            throw new Error(`Stake should be from ${config.minStake} to ${config.maxStake} 🪙`);
        }

        let totalOdds = Number(betData.totalOdds);
        if (totalOdds > config.maxOdds) {
            totalOdds = config.maxOdds; // Отрезаем кэф по лимиту
        }

        for (let item of betData.items) {
            // Читаем актуальный матч из базы данных NeDB, чтобы получить зафиксированные коэффициенты
            const rawMatch = await matchesDb.findOne({ id: item.matchId });

            let target = null;
            let handicapValue = null;

            if (rawMatch && rawMatch.markets[item.market]) {
                target = rawMatch.markets[item.market].target || null;
                handicapValue = rawMatch.markets[item.market].value || null;
            }

            enrichedItems.push({
                ...item,
                target,
                handicapValue,
                settled: false,
                won: false
            });
        }

        const newBet = {
            _id: `sports_bet_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
            username,
            partnerId,
            items: enrichedItems,
            totalOdds: totalOdds,
            stake: Number(betData.stake),
            status: "PENDING",
            createdAt: new Date()
        };

        // Сохраняем купон в базу данных bets.db для последующего автоматического расчета
        await betsDb.insert(newBet);

        return newBet;
    },

    getUserBets: async (username, status) => {
        const query = { username };
        if (status) query.status = status; // Например, "PENDING", "WON", "LOST" или "CASHOUT"

        // Сортируем: сначала самые свежие ставки
        return await betsDb.find(query).sort({ createdAt: -1 });
    },

    calculateCashout: async (betId) => {
        const bet = await betsDb.findOne({ _id: betId, status: "PENDING" });
        if (!bet) return { success: false, message: "Ставка не найдена или уже рассчитана" };

        let currentLiveOdds = 1;

        for (let item of bet.items) {
            // Ищем актуальный матч в лайве или прематче
            const match = await matchesDb.findOne({ id: item.matchId });

            if (!match) return { success: false, message: "Один из матчей купона недоступен" };

            // Если матч уже завершился, проверяем статус исхода в купоне
            if (match.status === "FINISHED") {
                if (item.status === "LOST") return { success: true, cashoutValue: 0 }; // Купон уже проигран
                currentLiveOdds *= item.odds; // Если исход выиграл, фиксируем его кэф
                continue;
            }

            // Если матч идет прямо сейчас, берем обновленный коэффициент на выбранный исход
            const liveMarket = match.markets[item.market];
            if (!liveMarket || !liveMarket.odds[item.selectedOutcome]) {
                return { success: false, message: "Коэффициенты заблокированы" };
            }

            currentLiveOdds *= liveMarket.odds[item.selectedOutcome];
        }

        // Формула кэшаута букмекера: (Первоначальный кэф / Текущий кэф) * Сумма ставки * Фактор маржи кэшаута
        // Если шансы игрока выросли (текущий кэф упал), сумма кэшаута будет выше ставки.
        let cashoutValue = (bet.totalOdds / currentLiveOdds) * bet.stake * BOOKMAKER_CONFIG.cashoutFactor;
        cashoutValue = Math.floor(cashoutValue);

        // Кэшаут не может быть отрицательным или превышать максимальный потенциальный выигрыш
        const maxWin = bet.stake * bet.totalOdds;
        cashoutValue = Math.max(0, Math.min(maxWin * 0.95, cashoutValue));

        return { success: true, cashoutValue };
    },

    // Метод выполнения выкупа ставки
    executeCashout: async (betId, username) => {
        const cashoutData = await module.exports.calculateCashout(betId);
        if (!cashoutData.success || cashoutData.cashoutValue <= 0) {
            return { success: false, message: cashoutData.message || "Выкуп невозможен" };
        }

        // Помечаем купон как завершенный со статусом CASHOUT
        await betsDb.update(
            { _id: betId, username },
            { $set: { status: "CASHOUT", payout: cashoutData.cashoutValue } }
        );

        const seamless = require('../services/seamlessService');
        // Возвращаем деньги игроку на баланс
        await seamless.credit(username, cashoutData.cashoutValue);

        return { success: true, newBalance: cashoutData.cashoutValue };
    },

    // Метод получения архива результатов (последние 50 сыгранных матчей)
    getMatchResults: async () => {
        const finishedMatches = await matchesDb.find({ status: "FINISHED" })
            .sort({ minute: -1 })
            .limit(50);
        return finishedMatches.map(m => ({
            id: m.id,
            league: m.league,
            teams: typeof m.teams === 'string' ? m.teams : `${m.teams.home} - ${m.teams.away}`,
            score: `${m.score.home}:${m.score.away}`,
            status: "FINISHED"
        }));
    },

    updateBookmakerConfig: (newConfig) => {
        BOOKMAKER_CONFIG = { ...BOOKMAKER_CONFIG, ...newConfig };
        console.log("[V-Football] Конфигурация БК успешно обновлена:", BOOKMAKER_CONFIG);
        return { success: true, config: BOOKMAKER_CONFIG };
    },

    getBookmakerConfig: () => DEFAULT_CONFIG.sport

};
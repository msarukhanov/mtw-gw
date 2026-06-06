const state = require('../state');
const seamless = require('../services/seamlessService');
const vfootball = require('../vfootball');
// 1. Отдать линию матчей на фронтенд
exports.getLine = async (req, res) => {
    // const line = await state.getSportsLine();
    const line = await vfootball.getSportsLine();
    res.json({ success: true, line });
};

exports.placeBet = async (req, res) => {
    // items: [{matchId, market, outcome}, ...]
    const { items, stake, sessionId } = req.body;
    const partnerId = req.partnerId; // Извлекаем partnerId, добавленный мидлваром checkPlayer
    const username = req.username;

    if (!items || !Array.isArray(items) || items.length === 0 || !stake || stake <= 0) {
        return res.status(400).json({ error: "Invalid bet slip data" });
    }

    try {
        let calculatedTotalOdds = 1;
        const verifiedItems = [];

        // Проверяем каждый исход в экспрессе/одинаре
        for (const item of items) {
            const match = (await state.getSportsLine()).find(m => m.id === item.matchId);
            if (!match) return res.status(404).json({ error: `Match ${item.matchId} not found` });

            if (!match.markets[item.market] || !match.markets[item.market].odds[item.outcome]) {
                return res.status(400).json({ error: "Selected market outcome not found" });
            }

            const odds = match.markets[item.market].odds[item.outcome];
            calculatedTotalOdds *= odds;

            verifiedItems.push({
                matchId: item.matchId,
                teams: match.teams,
                market: item.market,
                outcome: item.outcome,
                odds: odds
            });
        }

        // Ограничим максимальный кэф для демо, например, 1000, чтобы не сломать экономику
        calculatedTotalOdds = Math.min(1000, parseFloat(calculatedTotalOdds.toFixed(2)));
        const roundId = `sports_${items.length > 1 ? 'multi' : 'single'}_${Date.now()}_${partnerId}_${username}`;

        // 1. ИСПРАВЛЕНО: Списание одной общей транзакции через Seamless Wallet с передачей partnerId
        await seamless.debit(username, partnerId, sessionId, Number(stake), "Sportsbook Bet", roundId);

        // 2. ИСПРАВЛЕНО: Сохраняем купон в базу bets.db с привязкой к partnerId
        const savedBet = await state.createSportsBet(username, partnerId, {
            items: verifiedItems,
            totalOdds: calculatedTotalOdds,
            stake
        });

        // 3. ИСПРАВЛЕНО: Отправляем в общую историю и лояльность с передачей partnerId
        const typeText = items.length > 1 ? "Multi Bet" : "Single Bet";
        await state.savePlayerActionHistory(username, partnerId, {
            game: "Sportsbook",
            details: `${typeText} placed. Total Odds: ${calculatedTotalOdds}. Matches: ${items.length}`,
            change: `-${stake} 🪙`,
            win: false
        });

        if (req.player) req.player.balance -= stake;

        res.json({ success: true, balance: req.player.balance, betId: savedBet._id });
    } catch (err) {
        console.error(`[Partner: ${partnerId}] Sportsbook bet placement failed:`, err.message);
        res.status(500).json({ error: err.message || "Betting system error" });
    }
};

exports.userBets = async (req, res) => {
    try {
        const { username, status } = req.query;
        if (!username) return res.status(400).json({ success: false, error: 'Username required' });

        const bets = await vFootball.getUserBets(username, status);
        res.json({ success: true, bets });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
};

exports.cashout = async (req, res) => {
    try {
        const { betId, username } = req.body;
        if (!betId || !username) {
            return res.status(400).json({ success: false, error: 'Missing parameters' });
        }

        const result = await vFootball.executeCashout(betId, username);
        if (!result.success) {
            return res.status(400).json({ success: false, error: result.message });
        }

        // Получаем актуальный баланс пользователя после начисления кэшаута
        const userBalance = await seamless.getBalance(username);

        res.json({
            success: true,
            message: 'Cashout processed successfully',
            newBalance: userBalance
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
};

exports.cashoutValue = async (req, res) => {
    try {
        const { betId } = req.query;
        if (!betId) return res.status(400).json({ success: false, error: 'Bet ID required' });

        const result = await vFootball.calculateCashout(betId);
        res.json(result);
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
};

exports.results = async (req, res) => {
    try {
        const results = await vfootball.getMatchResults();
        res.json({ success: true, results });
    } catch (err) {
        console.error("Error fetching results:", err);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
};




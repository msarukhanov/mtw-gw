const state = require('../state');
const seamless = require('../services/seamlessService'); // твой сервис дебита/кредита

// 1. Отдать линию матчей на фронтенд
exports.getLine = (req, res) => {
    const line = state.getSportsLine();
    res.json({ success: true, line });
};

exports.placeBet = async (req, res) => {
    const { items, stake, sessionId } = req.body; // items: [{matchId, market, outcome}, ...]
    const username = req.username;

    if (!items || !Array.isArray(items) || items.length === 0 || !stake || stake <= 0) {
        return res.status(400).json({ error: "Invalid bet slip data" });
    }

    try {
        let calculatedTotalOdds = 1;
        const verifiedItems = [];

        // Проверяем каждый исход в экспрессе/одинаре
        for (const item of items) {
            const match = state.getSportsLine().find(m => m.id === item.matchId);
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
        const roundId = `sports_${items.length > 1 ? 'multi' : 'single'}_${Date.now()}_${username}`;

        // 1. Списание одной общей транзакции через Seamless Wallet
        await seamless.debit(username, sessionId, Number(stake), "Sportsbook Bet", roundId);

        // 2. Сохраняем купон в базу
        const savedBet = await state.createSportsBet(username, {
            items: verifiedItems,
            totalOdds: calculatedTotalOdds,
            stake
        });

        // 3. Отправляем в общую историю и лояльность
        const typeText = items.length > 1 ? "Multi Bet" : "Single Bet";
        await state.savePlayerActionHistory(username, {
            game: "Sportsbook",
            details: `${typeText} placed. Total Odds: ${calculatedTotalOdds}. Matches: ${items.length}`,
            change: `-${stake} 🪙`,
            win: false
        });

        if (req.player) req.player.balance -= stake;

        res.json({ success: true, balance: req.player.balance, betId: savedBet._id });
    } catch (err) {
        res.status(500).json({ error: err.message || "Betting system error" });
    }
};



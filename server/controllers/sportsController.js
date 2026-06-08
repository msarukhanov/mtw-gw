const crypto = require('crypto');
const state = require('../state');
const seamless = require('../services/seamlessService');
const vfootball = require('../vfootball');

// 1. Отдать линию матчей на фронтенд
exports.getLine = async (req, res) => {
    try {
        const line = await vfootball.getSportsLine();
        res.json({ success: true, line });
    } catch (err) {
        console.error("Error fetching sports line:", err);
        res.status(500).json({ error: "Failed to load line" });
    }
};

exports.placeBet = async (req, res) => {
    const { items, stake, sessionId: bodySessionId } = req.body;
    const partnerId = req.partnerId;
    const username = req.username;
    // Надежно вытаскиваем сессию из всех возможных мест
    const sessionId = bodySessionId || req.sessionId || req.headers['x-session-id'] || (req.player && req.player.sessionId);

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

        // Ограничим максимальный кэф для демо, чтобы не сломать экономику
        calculatedTotalOdds = Math.min(1000, parseFloat(calculatedTotalOdds.toFixed(2)));

        // Исправлено: безопасный roundId вместо Date.now()
        const roundId = `sports_${items.length > 1 ? 'multi' : 'single'}_${crypto.randomBytes(8).toString('hex')}`;
        const gameName = "Sportsbook";

        // 1. Списание одной общей транзакции через Seamless Wallet с проверкой средств
        // Ошибки (например недостаточный баланс) автоматически улетят в блок catch
        const debitResult = await seamless.debit(username, partnerId, sessionId, Number(stake), gameName, roundId);

        // Берем актуальный авторизованный баланс строго из ответа платформы
        const currentBalance = debitResult.balance;

        // 2. Сохраняем купон в базу bets.db с привязкой к partnerId
        const savedBet = await state.createSportsBet(username, partnerId, {
            items: verifiedItems,
            totalOdds: calculatedTotalOdds,
            stake,
            roundId // сохраняем roundId, чтобы использовать его при расчете или кэшауте ставки
        });

        // 3. Отправляем в общую историю и лояльность с передачей partnerId
        const typeText = items.length > 1 ? "Multi Bet" : "Single Bet";
        await state.savePlayerActionHistory(username, partnerId, {
            game: "Sportsbook",
            details: `${typeText} placed. Total Odds: ${calculatedTotalOdds}. Matches: ${items.length}`,
            change: `-${stake} 🪙`,
            win: false
        });

        // Безопасный фолбэк для локального стейта Express, если он используется
        if (req.player) req.player.balance = currentBalance;

        res.json({ success: true, balance: currentBalance, betId: savedBet._id });
    } catch (err) {
        console.error(`[Partner: ${partnerId}] Sportsbook bet placement failed:`, err.message);
        res.status(400).json({ error: err.message || "Betting system error" });
    }
};

exports.userBets = async (req, res) => {
    try {
        const { username, status } = req.query;
        if (!username) return res.status(400).json({ success: false, error: 'Username required' });

        // Исправлено: заменено vFootball на vfootball (согласно импорту в начале файла)
        const bets = await vfootball.getUserBets(username, status);
        res.json({ success: true, bets });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
};

exports.cashout = async (req, res) => {
    try {
        const { betId, username } = req.body;
        const partnerId = req.partnerId;
        const sessionId = req.sessionId || req.headers['x-session-id'] || (req.player && req.player.sessionId);

        if (!betId || !username) {
            return res.status(400).json({ success: false, error: 'Missing parameters' });
        }

        // Выполняем кэшаут во внутреннем движке футбола
        const result = await vfootball.executeCashout(betId, username);
        if (!result.success) {
            return res.status(400).json({ success: false, error: result.message });
        }

        // ИСПРАВЛЕНО: Отправляем начисленный кэшаут на шлюз платформы через Credit!
        // Вытаскиваем сумму кэшаута (сумма возврата ставки, рассчитанная движком)
        const cashoutAmount = result.cashoutAmount || result.amount || 0;

        let currentBalance;
        if (cashoutAmount > 0) {
            // Генерируем ID транзакции для кэшаута
            const roundId = `sports_cashout_${crypto.randomBytes(8).toString('hex')}`;
            const creditResult = await seamless.credit(username, partnerId, sessionId, cashoutAmount, "Sportsbook Cashout", roundId);
            currentBalance = creditResult.balance;
        } else {
            // Если сумма 0, просто смотрим текущий баланс в базе
            const platformUser = await state.getOrCreatePlayer(username, partnerId);
            currentBalance = platformUser.balance;
        }

        res.json({
            success: true,
            message: 'Cashout processed successfully',
            newBalance: currentBalance
        });
    } catch (err) {
        console.error("Sportsbook cashout error:", err);
        res.status(500).json({ success: false, error: err.message || 'Internal server error' });
    }
};

exports.cashoutValue = async (req, res) => {
    try {
        const { betId } = req.query;
        if (!betId) return res.status(400).json({ success: false, error: 'Bet ID required' });

        const result = await vfootball.calculateCashout(betId);
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
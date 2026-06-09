const crypto = require('crypto');
const state = require('../state');
const seamless = require('../services/seamlessService');

// Значения карт для Блэкджека
const CARD_VALUES = {
    '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, 'T': 10, 'J': 10, 'Q': 10, 'K': 10, 'A': 11
};

// Генерация и тасовка колоды
function createDeck() {
    const suits = ['H', 'D', 'C', 'S']; // Черви, Бубны, Трефы, Пики
    const values = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
    let deck = [];
    for (let suit of suits) {
        for (let value of values) {
            deck.push(value + suit);
        }
    }
    // Тасовка Фишера-Йетса
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
}

// Подсчет очков с учетом мягкого Туза (A = 11 или 1)
function calculateScore(hand) {
    let score = 0;
    let aces = 0;
    for (let card of hand) {
        const val = card[0]; // Берем первый символ, например 'A' из 'AH'
        score += CARD_VALUES[val];
        if (val === 'A') aces++;
    }
    while (score > 21 && aces > 0) {
        score -= 10;
        aces--;
    }
    return score;
}


// Временное хранилище активных игр в оперативной памяти сервера
const activeGames = new Map();


exports.deal = async (req, res) => {
    const partnerId = req.partnerId;
    const username = req.username;
    // Берем sessionId, который заехал в req (например, из middleware авторизации)
    const sessionId = req.sessionId || req.headers['x-session-id'];

    const partnerConfig = state.getConfig(partnerId) || {};
    const config = partnerConfig.blackjack || { cost: 20, rtp: 95 };

    if (activeGames.has(username)) {
        return res.status(400).json({ error: "You already have an active game!" });
    }

    // Создаем уникальный ID раунда для этой раздачи
    const roundId = 'bj_' + crypto.randomBytes(8).toString('hex');
    const gameName = "Blackjack";

    let debitResult;
    try {
        // Списываем ставку через HTTP-запрос к платформе
        debitResult = await seamless.debit(username, partnerId, sessionId, config.cost, gameName, roundId);
        if(debitResult.error) {
            return res.status(400).json(debitResult);
        }
    } catch (err) {
        // Если на платформе не хватило денег или упала сеть, сервис выбросит ошибку
        return res.status(400).json({ error: err.message || "Insufficient funds or platform error" });
    }

    // Получаем актуальный баланс из ответа сервера
    let currentBalance = debitResult.balance;

    // Заносим в локальный банк Блэкджека этого партнера для контроля RTP
    state.addBlackjackBank(partnerId, config.cost);

    let deck, playerHand, dealerHand, playerScore, dealerScore;
    let attempts = 0;
    const maxAttempts = 5;

    // ЦИКЛ КОНТРОЛЯ RTP / ЗАЩИТЫ КАССЫ
    do {
        deck = createDeck();
        playerHand = [deck.pop(), deck.pop()];
        dealerHand = [deck.pop(), deck.pop()];
        playerScore = calculateScore(playerHand);
        dealerScore = calculateScore(dealerHand);

        if (playerScore === 21 && dealerScore !== 21) {
            const potentialPrize = config.cost * 2.5;
            const currentBank = state.getBlackjackBank(partnerId);

            if (potentialPrize > currentBank) {
                attempts++;
                continue;
            }
        }
        break;
    } while (attempts < maxAttempts);

    // Если у игрока остался натуральный Блэкджек (касса одобрила)
    if (playerScore === 21) {
        let prize = config.cost * 2.5;
        let status = 'BLACKJACK';

        if (dealerScore === 21) {
            prize = config.cost;
            status = 'PUSH';
        }

        // Начисляем выигрыш через HTTP-запрос к платформе
        const creditResult = await seamless.credit(username, partnerId, sessionId, prize, gameName, roundId);
        currentBalance = creditResult.balance; // Обновляем баланс из ответа

        state.reduceBlackjackBank(partnerId, prize);
        await saveHistory(username, partnerId, playerHand, dealerHand, prize, true);

        return res.json({
            status, playerHand, dealerHand, playerScore, dealerScore, prize, balance: currentBalance
        });
    }

    // Если игра продолжается, сохраняем сессию (включая sessionId и roundId)
    activeGames.set(username, {
        bet: config.cost, partnerId, sessionId, roundId, deck, playerHand, dealerHand
    });

    res.json({
        status: 'IN_PROGRESS',
        playerHand,
        dealerHand: [dealerHand[0], 'XX'],
        playerScore,
        balance: currentBalance
    });
};

exports.action = async (req, res) => {
    const username = req.username;
    const { action } = req.body; // 'HIT' или 'STAND'

    const game = activeGames.get(username);
    if (!game) {
        return res.status(400).json({ error: "No active game found" });
    }

    const gameName = "Blackjack";

    if (action === 'HIT') {
        game.playerHand.push(game.deck.pop());
        const playerScore = calculateScore(game.playerHand);

        // Перебор (Bust) -> деньги уже списаны на этапе deal(), баланс не меняется
        if (playerScore > 21) {
            activeGames.delete(username);
            await saveHistory(username, game.partnerId, game.playerHand, game.dealerHand, 0, false);

            // Запрашиваем инфо о балансе, чтобы вернуть актуальный (так как мы ничего не начисляем)
            // Либо можно передать старый баланс, но безопаснее получить актуальный
            const platformUser = await state.getOrCreatePlayer(username, game.partnerId);

            return res.json({
                status: 'BUST',
                playerHand: game.playerHand,
                dealerHand: game.dealerHand,
                playerScore,
                prize: 0,
                balance: platformUser.balance
            });
        }

        return res.json({
            status: 'IN_PROGRESS',
            playerHand: game.playerHand,
            dealerHand: [game.dealerHand[0], 'XX'],
            playerScore
        });
    }

    if (action === 'STAND') {
        activeGames.delete(username);

        let dealerScore = calculateScore(game.dealerHand);
        while (dealerScore < 17) {
            game.dealerHand.push(game.deck.pop());
            dealerScore = calculateScore(game.dealerHand);
        }

        const playerScore = calculateScore(game.playerHand);
        let prize = 0;
        let status = 'LOSE';

        if (dealerScore > 21 || playerScore > dealerScore) {
            prize = game.bet * 2;
            status = 'WIN';
        } else if (playerScore === dealerScore) {
            prize = game.bet;
            status = 'PUSH';
        }

        let currentBalance;
        if (prize > 0) {
            // Если есть выигрыш или возврат (PUSH), шлем HTTP-запрос кредита
            const creditResult = await seamless.credit(game.username || username, game.partnerId, game.sessionId, prize, gameName, game.roundId);
            currentBalance = creditResult.balance;
        } else {
            // Если проигрыш, просто смотрим текущий баланс в базе
            const platformUser = await state.getOrCreatePlayer(username, game.partnerId);
            currentBalance = platformUser.balance;
        }

        await saveHistory(username, game.partnerId, game.playerHand, game.dealerHand, prize, prize > 0);

        return res.json({
            status,
            playerHand: game.playerHand,
            dealerHand: game.dealerHand,
            playerScore,
            dealerScore,
            prize,
            balance: currentBalance
        });
    }
};


// Хелпер логирования в вашем стиле
async function saveHistory(username, pHand, dHand, prize, isWin) {
    await state.savePlayerActionHistory(username, {
        game: "Blackjack",
        details: `P: ${pHand.join(',')} | D: ${dHand.join(',')}`,
        change: prize > 0 ? `+${prize} 🪙` : `Loss`,
        win: isWin
    });
}

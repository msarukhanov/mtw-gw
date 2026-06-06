const state = require('../state');

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
    const config = state.getConfig().blackjack || { cost: 20 };
    const username = req.username;

    if (activeGames.has(username)) {
        return res.status(400).json({ error: "You already have an active game!" });
    }

    if (req.player.balance < config.cost) {
        return res.status(400).json({ error: "Insufficient funds" });
    }

    // 1. Списываем ставку
    req.player.balance -= config.cost;
    await state.updateBalance(username, req.player.balance);

    // 2. Инициализируем игру
    const deck = createDeck();
    const playerHand = [deck.pop(), deck.pop()];
    const dealerHand = [deck.pop(), deck.pop()];

    const playerScore = calculateScore(playerHand);

    // Если у игрока сразу 21 (Натуральный Блэкджек) — игра завершается мгновенно
    if (playerScore === 21) {
        const dealerScore = calculateScore(dealerHand);
        let prize = config.cost * 2.5; // Выплата 3 к 2 (вернуть ставку + 1.5 сверху)
        let status = 'BLACKJACK';

        if (dealerScore === 21) {
            prize = config.cost; // Ничья (Push)
            status = 'PUSH';
        }

        req.player.balance += prize;
        await state.updateBalance(username, req.player.balance);
        await saveHistory(username, playerHand, dealerHand, prize, true);

        return res.json({
            status,
            playerHand,
            dealerHand, // Сразу показываем обе карты дилера
            playerScore,
            dealerScore,
            prize,
            balance: req.player.balance
        });
    }

    // Сохраняем сессию в память сервера
    activeGames.set(username, {
        bet: config.cost,
        deck,
        playerHand,
        dealerHand
    });

    // Отдаем клиенту состояние. ВАЖНО: вторую карту дилера маскируем под 'XX'!
    res.json({
        status: 'IN_PROGRESS',
        playerHand,
        dealerHand: [dealerHand[0], 'XX'],
        playerScore,
        balance: req.player.balance
    });
};

exports.action = async (req, res) => {
    const username = req.username;
    const { action } = req.body; // 'HIT' или 'STAND'

    const game = activeGames.get(username);
    if (!game) {
        return res.status(400).json({ error: "No active game found" });
    }

    if (action === 'HIT') {
        game.playerHand.push(game.deck.pop());
        const playerScore = calculateScore(game.playerHand);

        // Перебор (Bust)
        if (playerScore > 21) {
            activeGames.delete(username);
            await saveHistory(username, game.playerHand, game.dealerHand, 0, false);
            return res.json({
                status: 'BUST',
                playerHand: game.playerHand,
                dealerHand: game.dealerHand,
                playerScore,
                prize: 0,
                balance: req.player.balance
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
        // Дилер обязан брать карты, пока у него меньше 17 очков
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

        req.player.balance += prize;
        await state.updateBalance(username, req.player.balance);
        await saveHistory(username, game.playerHand, game.dealerHand, prize, prize > 0);

        return res.json({
            status,
            playerHand: game.playerHand,
            dealerHand: game.dealerHand,
            playerScore,
            dealerScore,
            prize,
            balance: req.player.balance
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

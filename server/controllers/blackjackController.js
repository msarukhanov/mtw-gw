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
    const partnerId = req.partnerId;
    const username = req.username;

    const partnerConfig = state.getConfig(partnerId) || {};
    const config = partnerConfig.blackjack || { cost: 20, rtp: 95 }; // Читаем ваш RTP из конфига

    if (activeGames.has(username)) {
        return res.status(400).json({ error: "You already have an active game!" });
    }

    if (req.player.balance < config.cost) {
        return res.status(400).json({ error: "Insufficient funds" });
    }

    // Списываем ставку и заносим в банк Блэкджека этого партнера
    req.player.balance -= config.cost;
    await state.updateBalance(username, partnerId, req.player.balance);
    state.addBlackjackBank(partnerId, config.cost); // Добавляем метод в state

    let deck, playerHand, dealerHand, playerScore, dealerScore;
    let attempts = 0;
    const maxAttempts = 5; // Защита от бесконечного цикла

    // ЦИКЛ КОНТРОЛЯ RTP / ЗАЩИТЫ КАССЫ
    do {
        deck = engine.createDeck();
        playerHand = [deck.pop(), deck.pop()];
        dealerHand = [deck.pop(), deck.pop()];
        playerScore = engine.calculateScore(playerHand);
        dealerScore = engine.calculateScore(dealerHand);

        // Проверяем, есть ли у игрока мгновенный выигрыш (21 очко)
        if (playerScore === 21 && dealerScore !== 21) {
            const potentialPrize = config.cost * 2.5;
            const currentBank = state.getBlackjackBank(partnerId);

            // Если в кассе партнера нет денег на выплату — делаем пересдачу (Re-roll)
            if (potentialPrize > currentBank) {
                attempts++;
                continue;
            }
        }
        break; // Раздача безопасна для кассы, выходим из цикла
    } while (attempts < maxAttempts);

    // Если у игрока остался натуральный Блэкджек (касса одобрила)
    if (playerScore === 21) {
        let prize = config.cost * 2.5;
        let status = 'BLACKJACK';

        if (dealerScore === 21) {
            prize = config.cost;
            status = 'PUSH';
        }

        req.player.balance += prize;
        await state.updateBalance(username, partnerId, req.player.balance);
        state.reduceBlackjackBank(partnerId, prize); // Списываем из кассы партнера
        await saveHistory(username, partnerId, playerHand, dealerHand, prize, true);

        return res.json({
            status, playerHand, dealerHand, playerScore, dealerScore, prize, balance: req.player.balance
        });
    }

    // Если игра продолжается, сохраняем сессию
    activeGames.set(username, {
        bet: config.cost, partnerId, deck, playerHand, dealerHand
    });

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

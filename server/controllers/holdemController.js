const crypto = require('crypto');
const state = require('../state');
const seamless = require('../services/seamlessService'); // Подключите ваш сервис

let blackjackBanks = {};
let holdemBanks = {};

// Блэкджек касса
addBlackjackBank = (partnerId, amount) => {
    if (!blackjackBanks[partnerId]) blackjackBanks[partnerId] = 0;
    blackjackBanks[partnerId] += amount;
};
getBlackjackBank = (partnerId) => {
    return blackjackBanks[partnerId] || 0;
};
reduceBlackjackBank = (partnerId, amount) => {
    if (!blackjackBanks[partnerId]) blackjackBanks[partnerId] = 0;
    blackjackBanks[partnerId] -= amount;
};

// Холдем касса
addHoldemBank = (partnerId, amount) => {
    if (!holdemBanks[partnerId]) holdemBanks[partnerId] = 0;
    holdemBanks[partnerId] += amount;
};
getHoldemBank = (partnerId) => {
    return holdemBanks[partnerId] || 0;
};
reduceHoldemBank = (partnerId, amount) => {
    if (!holdemBanks[partnerId]) holdemBanks[partnerId] = 0;
    holdemBanks[partnerId] -= amount;
};

const CARD_RANKS = {
    '2':2, '3':3, '4':4, '5':5, '6':6, '7':7, '8':8, '9':9, 'T':10, 'J':11, 'Q':12, 'K':13, 'A':14
};

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

const HAND_NAMES = [
    "High Card", "Pair", "Two Pair", "Three of a Kind",
    "Straight", "Flush", "Full House", "Four of a Kind",
    "Straight Flush", "Royal Flush"
];

// Функция переводит строковые карты (напр. 'AH') в числовые объекты для удобства сортировки
function parseHand(cards) {
    return cards.map(c => ({
        rank: CARD_RANKS[c.charAt(0)],
        suit: c.charAt(1),
        str: c
    })).sort((a, b) => b.rank - a.rank);
}

// Главная функция: находит лучшую комбинацию из 5 карт среди 7 доступных
function evaluate7Cards(cards7) {
    const parsed = parseHand(cards7);

    // Группируем по мастям (для Флеша)
    const suits = {};
    // Группируем по рангам (для Пар/Трипсов/Каре)
    const ranks = {};

    parsed.forEach(c => {
        suits[c.suit] = (suits[c.suit] || 0) + 1;
        ranks[c.rank] = (ranks[c.rank] || 0) + 1;
    });

    // 1. Проверяем Флеш
    let flushSuit = Object.keys(suits).find(s => suits[s] >= 5);
    let isFlush = !!flushSuit;

    // 2. Проверяем Стрит
    let isStraight = false;
    let straightHigh = 0;
    const uniqueRanks = [...new Set(parsed.map(c => c.rank))].sort((a,b) => b-a);

    // Особый случай: колесо стрита (A-2-3-4-5), если есть Туз(14), добавляем его как 1
    if (uniqueRanks.includes(14)) uniqueRanks.push(1);

    for (let i = 0; i <= uniqueRanks.length - 5; i++) {
        if (uniqueRanks[i] - uniqueRanks[i+4] === 4) {
            isStraight = true;
            straightHigh = uniqueRanks[i];
            break;
        }
    }

    // Стрит-Флеш / Роял-Флеш
    if (isFlush && isStraight) {
        const flushCards = parsed.filter(c => c.suit === flushSuit).map(c => c.rank);
        if (flushCards.includes(14) && flushCards.includes(13) && flushCards.includes(12) && flushCards.includes(11) && flushCards.includes(10)) {
            return { score: 9, name: HAND_NAMES[9], tieBreaker: 14 }; // Royal Flush
        }
        if (straightHigh === 14 && isStraight) { /* Стрит не флешевый */ }
        else if (isStraight) {
            // Для упрощения: если и стрит и флеш в 7 картах, оцениваем как Стрит-Флеш
            return { score: 8, name: HAND_NAMES[8], tieBreaker: straightHigh };
        }
    }

    // Подсчет одинаковых карт
    const rankCounts = Object.entries(ranks).map(([r, count]) => ({ rank: Number(r), count })).sort((a,b) => b.count - a.count || b.rank - a.rank);

    if (rankCounts[0].count === 4) {
        return { score: 7, name: HAND_NAMES[7], tieBreaker: rankCounts[0].rank * 100 + (rankCounts[1]?.rank || 0) };
    }
    if (rankCounts[0].count === 3 && rankCounts[1]?.count >= 2) {
        return { score: 6, name: HAND_NAMES[6], tieBreaker: rankCounts[0].rank * 100 + rankCounts[1].rank };
    }
    if (isFlush) {
        const flushCards = parsed.filter(c => c.suit === flushSuit).slice(0, 5).map(c => c.rank);
        return { score: 5, name: HAND_NAMES[5], tieBreaker: flushCards[0] };
    }
    if (isStraight) {
        return { score: 4, name: HAND_NAMES[4], tieBreaker: straightHigh };
    }
    if (rankCounts[0].count === 3) {
        return { score: 3, name: HAND_NAMES[3], tieBreaker: rankCounts[0].rank };
    }
    if (rankCounts[0].count === 2 && rankCounts[1]?.count === 2) {
        return { score: 2, name: HAND_NAMES[2], tieBreaker: rankCounts[0].rank * 100 + rankCounts[1].rank };
    }
    if (rankCounts[0].count === 2) {
        return { score: 1, name: HAND_NAMES[1], tieBreaker: rankCounts[0].rank * 100 + rankCounts[1].rank };
    }

    return { score: 0, name: HAND_NAMES[0], tieBreaker: parsed[0].rank };
}

exports.spinHoldem = async (req, res) => {
    const partnerId = req.partnerId;
    const username = req.username;
    const sessionId = req.sessionId || req.headers['x-session-id']; // Извлекаем сессию

    const partnerConfig = state.getConfig(partnerId) || {};
    const config = partnerConfig.holdem || { cost: 20, rtp: 95 };
    console.log(config);

    // Генерируем ID раунда для HTTP-запросов
    const roundId = 'holdem_' + crypto.randomBytes(8).toString('hex');
    const gameName = "Casino-Holdem";

    let debitResult;
    try {
        // Списываем ставку через HTTP-запрос дебита к платформе вместо RAM
        debitResult = await seamless.debit(req.player, username, partnerId, sessionId, config.cost, gameName, roundId);
        if(debitResult.error) {
            return res.status(400).json(debitResult);
        }
    } catch (err) {
        return res.status(400).json({ error: err.message || "Insufficient funds or platform error" });
    }

    let currentBalance = debitResult.balance;
    addHoldemBank(partnerId, config.cost);

    let deck, playerHand, dealerHand, communityCards;
    let playerEval, dealerEval, status, prize;
    let attempts = 0;
    const maxAttempts = 10;

    // ЦИКЛ КОНТРОЛЯ RTP И КАССЫ ОПЕРАТОРА
    do {
        deck = createDeck();
        playerHand = [deck.pop(), deck.pop()];
        dealerHand = [deck.pop(), deck.pop()];
        communityCards = [deck.pop(), deck.pop(), deck.pop(), deck.pop(), deck.pop()];

        const player7 = playerHand.concat(communityCards);
        const dealer7 = dealerHand.concat(communityCards);

        playerEval = evaluate7Cards(player7);
        dealerEval = evaluate7Cards(dealer7);

        status = 'LOSE';
        prize = 0;

        if (playerEval.score > dealerEval.score) {
            status = 'WIN';
        } else if (playerEval.score === dealerEval.score) {
            if (playerEval.tieBreaker > dealerEval.tieBreaker) status = 'WIN';
            else if (playerEval.tieBreaker === dealerEval.tieBreaker) status = 'PUSH';
        }

        if (status === 'WIN') {
            let multiplier = 2;
            if (playerEval.score >= 4) multiplier = 3;
            if (playerEval.score >= 6) multiplier = 5;
            prize = config.cost * multiplier;
        } else if (status === 'PUSH') {
            prize = config.cost;
        }

        const currentBank = getHoldemBank(partnerId);

        const rtpRoll = Math.random() * 100;
        const forceLossByRtp = (status === 'WIN' && rtpRoll > config.rtp);

        if ((prize > currentBank || forceLossByRtp) && attempts < maxAttempts) {
            attempts++;
            continue;
        }
        break;
    } while (true);

    if (prize > 0) {
        // Начисляем одобренный выигрыш/возврат через HTTP-запрос кредита к платформе
        const creditResult = await seamless.credit(username, partnerId, sessionId, prize, gameName, roundId);
        currentBalance = creditResult.balance;

        reduceHoldemBank(partnerId, prize);
    }

    await state.savePlayerActionHistory(username, partnerId, {
        game: "Casino-Holdem",
        details: `P: ${playerHand.join(',')} (${playerEval.name}) | D: ${dealerHand.join(',')} | Board: ${communityCards.join(',')}`,
        change: prize > 0 ? `+${prize} 🪙` : `Loss`,
        win: prize > 0
    });

    res.json({
        status, playerHand, dealerHand, communityCards,
        playerCombo: playerEval.name, dealerCombo: dealerEval.name,
        prize, balance: currentBalance
    });
};





const crypto = require('crypto');
const state = require('../state');
const seamless = require('../services/seamlessService'); // Подключите ваш сервис

exports.turn = async (req, res) => {
    const { choice, bet } = req.body;
    const partnerId = req.partnerId;
    const username = req.username;
    const sessionId = req.sessionId || req.headers['x-session-id']; // Извлекаем сессию

    // Достаем конфигурацию колоды конкретного партнера
    const config = state.getConfig(partnerId).hilo;

    // ВАЛИДАЦИЯ ВХОДЯЩИХ ДАННЫХ
    if (!Number.isInteger(bet) || bet <= 0) {
        return res.status(400).json({ error: "Invalid bet amount" });
    }
    if (choice !== "higher" && choice !== "lower") {
        return res.status(400).json({ error: "Invalid choice mode" });
    }

    // Получаем или генерируем стартовую карту с привязкой к partnerId
    let currentCard = state.getHiloCard(username, partnerId);
    if (!currentCard) {
        currentCard = config.cards[state.getRandomInt(config.cards.length)];
        state.setHiloCard(username, partnerId, currentCard);
    }

    // Считаем множители для текущей карты на столе
    const multipliers = state.getHiloMultipliers(currentCard.value, partnerId);
    const chosenMultiplier = multipliers[choice];
    const potentialPrize = Math.floor(bet * chosenMultiplier);

    // Генерируем ID раунда для HTTP-запросов
    const roundId = 'hilo_' + crypto.randomBytes(8).toString('hex');
    const gameName = "Hi-Lo";

    let debitResult;
    try {
        // Списываем баланс через HTTP-запрос дебита к платформе вместо RAM
        debitResult = await seamless.debit(req.player, username, partnerId, sessionId, bet, gameName, roundId);
        if(debitResult.error) {
            return res.status(400).json(debitResult);
        }
    } catch (err) {
        return res.status(400).json({ error: err.message || "Insufficient funds or platform error" });
    }

    let currentBalance = debitResult.balance;

    // Добавляем ставку в изолированный банк этого партнера
    state.addHiloBank(partnerId, bet);

    // ГЕНЕРИРУЕМ СЛЕДУЮЩУЮ КАРТУ (Крипто-рандом)
    let nextCardIndex = state.getRandomInt(config.cards.length);
    let nextCard = config.cards[nextCardIndex];

    // --- КОНТРОЛЬ RTP (ПРОВЕРКА КОПИЛКИ ИГРЫ ТЕНАНТА) ---
    const currentBank = state.getHiloBank(partnerId);
    let forceLose = false;

    if (potentialPrize > currentBank) {
        forceLose = true;
    }

    if (forceLose) {
        let validLosingCards = [];
        if (choice === "higher") {
            validLosingCards = config.cards.filter(c => c.value < currentCard.value);
        } else {
            validLosingCards = config.cards.filter(c => c.value > currentCard.value);
        }

        if (validLosingCards.length > 0) {
            nextCard = validLosingCards[state.getRandomInt(validLosingCards.length)];
        }
    }

    // ПРОВЕРКА ИСХОДА ИГРЫ
    let isWin = false;
    if (choice === "higher" && nextCard.value >= currentCard.value) isWin = true;
    if (choice === "lower" && nextCard.value <= currentCard.value) isWin = true;

    let prize = 0;
    if (isWin) {
        prize = potentialPrize;

        // Выплачиваем выигрыш из изолированного банка этого pfртнера
        state.reduceHiloBank(partnerId, prize);

        // Начисляем выигрыш через HTTP-запрос кредита к платформе
        const creditResult = await seamless.credit(username, partnerId, sessionId, prize, gameName, roundId);
        currentBalance = creditResult.balance;
    }

    // Сохраняем новую карту как текущую для следующего хода игрока
    const previousCard = currentCard;

    // Записываем карту в память в рамках текущего бренда
    state.setHiloCard(username, partnerId, nextCard);

    // Считаем множители уже для НОВОЙ карты, чтобы обновить кнопки на фронтенде
    const nextMultipliers = state.getHiloMultipliers(currentCard.value, partnerId);

    // Запись действия в историю активности с передачей partnerId
    await state.savePlayerActionHistory(username, partnerId, {
        game: "Hi-Lo",
        details: `Guessed ${choice === "higher" ? "Higher" : "Lower"} on ${previousCard.name}${previousCard.suit}. Dropped: ${nextCard.name}${nextCard.suit}`,
        change: isWin ? `+${prize} 🪙` : `-${bet} 🪙`,
        win: isWin
    });

    // Возвращаем изолированный результат клиенту с актуальным балансом
    res.json({
        isWin,
        prize,
        chosenMultiplier,
        previousCard,
        nextCard,
        nextMultipliers,
        balance: currentBalance
    });
};
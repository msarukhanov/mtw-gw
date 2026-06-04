const state = require('../state');

exports.turn = async (req, res) => {
    const { choice, bet } = req.body;
    const partnerId = req.partnerId; // Извлекаем partnerId, добавленный мидлваром checkPlayer
    const username = req.username;

    // ИСПРАВЛЕНО: Достаем конфигурацию колоды конкретного партнера
    const config = state.getConfig(partnerId).hilo;

    // ВАЛИДАЦИЯ ВХОДЯЩИХ ДАННЫХ
    if (!Number.isInteger(bet) || bet <= 0) {
        return res.status(400).json({ error: "Invalid bet amount" });
    }
    if (req.player.balance < bet) {
        return res.status(400).json({ error: "Insufficient funds" });
    }
    if (choice !== "higher" && choice !== "lower") {
        return res.status(400).json({ error: "Invalid choice mode" });
    }

    // ИСПРАВЛЕНО: Получаем или генерируем стартовую карту с привязкой к partnerId
    let currentCard = state.getHiloCard(username, partnerId);
    if (!currentCard) {
        currentCard = config.cards[state.getRandomInt(config.cards.length)];
        state.setHiloCard(username, partnerId, currentCard);
    }

    // Считаем множители для текущей карты на столе
    const multipliers = state.getHiloMultipliers(currentCard.value);
    const chosenMultiplier = multipliers[choice];
    const potentialPrize = Math.floor(bet * chosenMultiplier);

    // Списываем баланс у игрока и закидываем в копилку игры текущего партнера
    req.player.balance -= bet;

    // ИСПРАВЛЕНО: Добавляем ставку в изолированный банк этого партнера
    state.addHiloBank(partnerId, bet);

    // ГЕНЕРИРУЕМ СЛЕДУЮЩУЮ КАРТУ (Крипто-рандом)
    let nextCardIndex = state.getRandomInt(config.cards.length);
    let nextCard = config.cards[nextCardIndex];

    // --- КОНТРОЛЬ RTP (ПРОВЕРКА КОПИЛКИ ИГРЫ ТЕНАНТА) ---
    // ИСПРАВЛЕНО: Проверяем банк строго текущего партнера
    const currentBank = state.getHiloBank(partnerId);
    let forceLose = false;

    // Если у конкретного партнера в банке нет денег — включаем принудительный слив
    if (potentialPrize > currentBank) {
        forceLose = true;
    }

    // Если сработал лимит RTP, подсовываем карту, ломающую ставку игрока
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
        req.player.balance += prize;
        // ИСПРАВЛЕНО: Выплачиваем выигрыш из изолированного банка этого партнера
        state.reduceHiloBank(partnerId, prize);
    }

    // Сохраняем новую карту как текущую для следующего хода игрока
    const previousCard = currentCard;

    // ИСПРАВЛЕНО: Записываем карту в память в рамках текущего бренда
    state.setHiloCard(username, partnerId, nextCard);

    // Считаем множители уже для НОВОЙ карты, чтобы обновить кнопки на фронтенде
    const nextMultipliers = state.getHiloMultipliers(nextCard.value);

    // ИСПРАВЛЕНО: Фиксируем баланс игрока в NeDB с привязкой к паре Игрок + Партнер
    await state.updateBalance(username, partnerId, req.player.balance);

    // ИСПРАВЛЕНО: Запись действия в историю активности с передачей partnerId
    await state.savePlayerActionHistory(username, partnerId, {
        game: "Hi-Lo",
        details: `Guessed ${choice === "higher" ? "Higher" : "Lower"} on ${previousCard.name}${previousCard.suit}. Dropped: ${nextCard.name}${nextCard.suit}`,
        change: isWin ? `+${prize} 🪙` : `-${bet} 🪙`,
        win: isWin
    });

    // Возвращаем изолированный результат клиенту
    res.json({
        isWin,
        prize,
        chosenMultiplier,
        previousCard,
        nextCard,
        nextMultipliers,
        balance: req.player.balance
    });
};

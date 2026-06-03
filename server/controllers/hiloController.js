const state = require('../state');

exports.turn = async (req, res) => {
    const { choice, bet } = req.body; // choice: "higher" или "lower", bet: сумма ставки
    const config = state.getConfig().hilo;

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

    // Получаем или генерируем стартовую карту для игрока, если её не было
    let currentCard = state.getHiloCard(req.username);
    if (!currentCard) {
        currentCard = config.cards[state.getRandomInt(config.cards.length)];
        state.setHiloCard(req.username, currentCard);
    }

    // Считаем множители для текущей карты на столе
    const multipliers = state.getHiloMultipliers(currentCard.value);
    const chosenMultiplier = multipliers[choice];
    const potentialPrize = Math.floor(bet * chosenMultiplier);

    // Списываем баланс у игрока и закидываем в копилку игры
    req.player.balance -= bet;
    state.addHiloBank(bet);

    // ГЕНЕРИРУЕМ СЛЕДУЮЩУЮ КАРТУ (Крипто-рандом)
    let nextCardIndex = state.getRandomInt(config.cards.length);
    let nextCard = config.cards[nextCardIndex];

    // --- КОНТРОЛЬ RTP (ПРОВЕРКА КОПИЛКИ ИГРЫ) ---
    const currentBank = state.getHiloBank();
    let forceLose = false;

    // Если в банке игры нет денег на выплату приза — включаем принудительный слив
    if (potentialPrize > currentBank) {
        forceLose = true;
    }

    // Если сработал лимит RTP, подсовываем карту, ломающую ставку игрока
    if (forceLose) {
        let validLosingCards = [];
        if (choice === "higher") {
            // Игроку нужно было выше или равно, подбираем строго карты, которые НИЖЕ текущей
            validLosingCards = config.cards.filter(c => c.value < currentCard.value);
        } else {
            // Игроку нужно было ниже или равно, подбираем строго карты, которые ВЫШЕ текущей
            validLosingCards = config.cards.filter(c => c.value > currentCard.value);
        }

        // Если есть ломающие карты, выбираем случайную из них. Если текущая карта Двойка или Туз и ломать некуда — берем противоположную масть того же номинала, чтобы выигрыш не ушел в космос
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
        state.reduceHiloBank(prize); // списываем приз из банка RTP
    }

    // Сохраняем новую карту как текущую для следующего хода игрока
    const previousCard = currentCard;
    state.setHiloCard(req.username, nextCard);

    // Считаем множители уже для НОВОЙ карты, чтобы обновить кнопки на фронтенде
    const nextMultipliers = state.getHiloMultipliers(nextCard.value);

    // Фиксируем баланс игрока в NeDB/SQLite
    await state.updateBalance(req.username, req.player.balance);

    // Запись действия в единую ленту истории транзакций
    await state.savePlayerActionHistory(req.username, {
        game: "Hi-Lo",
        details: `Guessed ${choice === "higher" ? "Higher" : "Lower"} on ${previousCard.name}${previousCard.suit}. Dropped: ${nextCard.name}${nextCard.suit}`,
        change: isWin ? `+${prize} 🪙` : `-${bet} 🪙`,
        win: isWin
    });

    // Возвращаем результат
    res.json({
        isWin,
        prize,
        chosenMultiplier,
        previousCard,
        nextCard,
        nextMultipliers, // множители для следующего раунда
        balance: req.player.balance
    });
};

const state = require('../state');

// 1. СТАРТ ИГРЫ (Игрок делает ставку и выбирает количество мин)
module.exports.start = async (req, res) => {
    const { minesCount, bet } = req.body;
    const config = state.getConfig().mines;

    // ВАЛИДАЦИЯ ВХОДЯЩИХ ДАННЫХ
    if (!Number.isInteger(minesCount) || minesCount < config.minMines || minesCount > config.maxMines) {
        return res.status(400).json({ error: `Mines count must be between ${config.minMines} and ${config.maxMines}` });
    }
    if (!Number.isInteger(bet) || bet <= 0) {
        return res.status(400).json({ error: "Invalid bet amount" });
    }
    if (req.player.balance < bet) {
        return res.status(400).json({ error: "Insufficient funds" });
    }
    if (state.getMinesGame(req.username)) {
        return res.status(400).json({ error: "You already have an active game. Cashout or explode first!" });
    }

    // Списываем баланс у игрока в SQLite/NeDB
    req.player.balance -= bet;
    await state.updateBalance(req.username, req.player.balance);

    // Добавляем чистую ставку игрока в банк (копилку) этой игры
    state.addMinesBank(bet);

    // Генерация первоначального скрытого поля (0 - пусто, 1 - мина)
    const board = Array(config.gridSize).fill(0);
    let deployedMines = 0;
    while (deployedMines < minesCount) {
        const randomIndex = state.getRandomInt(config.gridSize);
        if (board[randomIndex] === 0) {
            board[randomIndex] = 1;
            deployedMines++;
        }
    }

    // Сохраняем сессию раунда в оперативной памяти бэкенда
    const gameSession = {
        bet: bet,
        minesCount: minesCount,
        board: board,
        openedCells: [],
        status: "playing"
    };
    state.setMinesGame(req.username, gameSession);

    res.json({
        message: "Game started",
        balance: req.player.balance,
        nextMultiplier: state.getMinesMultiplier(config.gridSize, minesCount, 1)
    });
};

// 2. ОТКРЫТИЕ ЯЧЕЙКИ (С жестким контролем RTP в реальном времени)
module.exports.openCell = async (req, res) => {
    const { cellIndex } = req.body;
    const game = state.getMinesGame(req.username);
    const config = state.getConfig().mines;

    if (!game || game.status !== "playing") {
        return res.status(400).json({ error: "No active game found" });
    }
    if (!Number.isInteger(cellIndex) || cellIndex < 0 || cellIndex >= config.gridSize) {
        return res.status(400).json({ error: "Invalid cell index" });
    }
    if (game.openedCells.includes(cellIndex)) {
        return res.status(400).json({ error: "Cell already opened" });
    }

    // Считаем потенциальный выигрыш, если этот ход окажется успешным
    const currentMultiplier = state.getMinesMultiplier(config.gridSize, game.minesCount, game.openedCells.length + 1);
    const potentialWin = Math.floor(game.bet * currentMultiplier);

    // --- КЛЮЧЕВАЯ ЛОГИКА RTP СЕРВЕРА ---
    // Проверяем текущее состояние копилки игры.
    // Если потенциальный выигрыш игрока превышает доступный лимит банка — включаем принудительный взрыв
    const currentBank = state.getMinesBank();
    let forceExplode = false;

    if (potentialWin > currentBank) {
        forceExplode = true;
    }

    // Если система RTP требует слить игрока, мы тайно подсовываем мину прямо под текущий клик
    if (forceExplode) {
        game.board[cellIndex] = 1;
    }
    // ----------------------------------

    game.openedCells.push(cellIndex);

    // ПРОВЕРКА НА ВЗРЫВ (Сработал естественный рандом или защита RTP)
    if (game.board[cellIndex] === 1) {
        state.deleteMinesGame(req.username);

        // Фиксируем проигрыш ставки в единой истории транзакций
        await state.savePlayerActionHistory(req.username, {
            game: "Mines",
            details: `Exploded on cell ${cellIndex}. Total opened: ${game.openedCells.length - 1}`,
            change: `-${game.bet} 🪙`,
            win: false
        });

        // Возвращаем игроку всё поле, чтобы он видел расположение остальных мин
        return res.json({
            outcome: "explode",
            fullBoard: game.board,
            balance: req.player.balance
        });
    }

    // Если ячейка оказалась чистой и система лимитов пропустила ход
    const nextMultiplier = state.getMinesMultiplier(config.gridSize, game.minesCount, game.openedCells.length + 1);

    // Проверка на автоматическую победу (если открыты вообще все чистые ячейки на поле)
    const maxCleanCells = config.gridSize - game.minesCount;
    if (game.openedCells.length === maxCleanCells) {

        // Начисляем деньги на баланс
        req.player.balance += potentialWin;
        await state.updateBalance(req.username, req.player.balance);

        // Вычитаем чистую прибыль игрока из банка (копилки) игры
        state.reduceMinesBank(potentialWin);
        state.deleteMinesGame(req.username);

        await state.savePlayerActionHistory(req.username, {
            game: "Mines",
            details: `Cleared the whole board! Multiplier: ${currentMultiplier}x`,
            change: `+${potentialWin} 🪙`,
            win: true
        });

        return res.json({
            outcome: "win",
            fullBoard: game.board,
            prize: potentialWin,
            balance: req.player.balance
        });
    }

    // Обычный успешный шаг — продолжаем игру
    res.json({
        outcome: "success",
        openedCells: game.openedCells,
        currentWin: potentialWin,
        currentMultiplier: currentMultiplier,
        nextMultiplier: nextMultiplier
    });
};

// 3. КНОПКА «ЗАБРАТЬ ВЫИГРЫШ» (CASHOUT)
module.exports.cashout = async (req, res) => {
    const game = state.getMinesGame(req.username);
    const config = state.getConfig().mines;

    if (!game || game.status !== "playing") {
        return res.status(400).json({ error: "No active game to cashout" });
    }
    if (game.openedCells.length === 0) {
        return res.status(400).json({ error: "You must open at least one cell before cashout" });
    }

    // Рассчитываем финальную сумму выплаты
    const finalMultiplier = state.getMinesMultiplier(config.gridSize, game.minesCount, game.openedCells.length);
    const totalWin = Math.floor(game.bet * finalMultiplier);

    // Начисляем баланс игроку
    req.player.balance += totalWin;
    await state.updateBalance(req.username, req.player.balance);

    // Выплачиваем деньги из банка (копилки) игры
    state.reduceMinesBank(totalWin);

    // Закрываем игровую сессию
    state.deleteMinesGame(req.username);

    // Добавляем запись в единую ленту транзакций
    await state.savePlayerActionHistory(req.username, {
        game: "Mines",
        details: `Cashout after ${game.openedCells.length} cells. Multiplier: ${finalMultiplier}x`,
        change: `+${totalWin} 🪙`,
        win: true
    });

    res.json({
        prize: totalWin,
        balance: req.player.balance,
        fullBoard: game.board
    });
};

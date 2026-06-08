const crypto = require('crypto');
const state = require('../state');
const seamlessService = require('../services/seamlessService'); // Подключите ваш сервис

// 1. СТАРТ ИГРЫ (Игрок делает ставку и выбирает количество мин)
exports.start = async (req, res) => {
    const { minesCount, bet } = req.body;
    const partnerId = req.partnerId;
    const username = req.username;
    const sessionId = req.sessionId || req.headers['x-session-id']; // Извлекаем сессию

    // Достаем настройки игры конкретного партнера
    const config = state.getConfig(partnerId).mines;

    // ВАЛИДАЦИЯ ВХОДЯЩИХ ДАННЫХ
    if (!Number.isInteger(minesCount) || minesCount < config.minMines || minesCount > config.maxMines) {
        return res.status(400).json({ error: `Mines count must be between ${config.minMines} and ${config.maxMines}` });
    }
    if (!Number.isInteger(bet) || bet <= 0) {
        return res.status(400).json({ error: "Invalid bet amount" });
    }

    // Проверяем наличие активной игры с учетом партнера
    if (state.getMinesGame(username, partnerId)) {
        return res.status(400).json({ error: "You already have an active game. Cashout or explode first!" });
    }

    // Генерируем ID раунда для HTTP-запросов и сохраняем его на протяжении всей игры
    const roundId = 'mines_' + crypto.randomBytes(8).toString('hex');
    const gameName = "Mines";

    let debitResult;
    try {
        // Списываем баланс через HTTP-запрос дебита к платформе вместо RAM
        debitResult = await seamlessService.debit(username, partnerId, sessionId, bet, gameName, roundId);
    } catch (err) {
        return res.status(400).json({ error: err.message || "Insufficient funds or platform error" });
    }

    const currentBalance = debitResult.balance;

    // Добавляем чистую ставку игрока в изолированный банк (копилку) этого партнера
    state.addMinesBank(partnerId, bet);

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

    // Сохраняем сессию раунда в оперативной памяти бэкенда (включая sessionId и roundId)
    const gameSession = {
        bet: bet,
        minesCount: minesCount,
        board: board,
        openedCells: [],
        status: "playing",
        sessionId: sessionId,
        roundId: roundId
    };

    // Записываем сессию в память в рамках текущего бренда
    state.setMinesGame(username, partnerId, gameSession);

    res.json({
        message: "Game started",
        balance: currentBalance,
        nextMultiplier: state.getMinesMultiplier(config.gridSize, minesCount, 1, partnerId)
    });
};

// 2. ОТКРЫТИЕ ЯЧЕЙКИ (С жестким контролем RTP в реальном времени)
exports.openCell = async (req, res) => {
    const { cellIndex } = req.body;
    const partnerId = req.partnerId;
    const username = req.username;

    // Достаем сессию игры и конфигурацию строго для текущего партнера
    const game = state.getMinesGame(username, partnerId);
    const config = state.getConfig(partnerId).mines;

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

    // --- КЛЮЧЕВАЯ ЛОГИКА RTP СЕРВЕРА (ИЗОЛИРОВАННАЯ) ---
    const currentBank = state.getMinesBank(partnerId);
    let forceExplode = false;

    if (potentialWin > currentBank) {
        forceExplode = true;
    }

    if (forceExplode) {
        game.board[cellIndex] = 1;
    }
    // ----------------------------------

    game.openedCells.push(cellIndex);

    const gameName = "Mines";

    // ПРОВЕРКА НА ВЗРЫВ
    if (game.board[cellIndex] === 1) {
        // Удаляем сессию этого игрока в рамках текущего бренда
        state.deleteMinesGame(username, partnerId);

        // Логируем историю с привязкой к partnerId
        await state.savePlayerActionHistory(username, partnerId, {
            game: "Mines",
            details: `Exploded on cell ${cellIndex}. Total opened: ${game.openedCells.length - 1}`,
            change: `-${game.bet} 🪙`,
            win: false
        });

        // Деньги уже списаны на этапе start(), поэтому запрашиваем текущий баланс у базы данных для ответа
        const platformUser = await state.getOrCreatePlayer(username, partnerId);

        return res.json({
            outcome: "explode",
            fullBoard: game.board,
            balance: platformUser.balance
        });
    }

    const nextMultiplier = state.getMinesMultiplier(config.gridSize, game.minesCount, game.openedCells.length + 1);

    // Проверка на автоматическую победу (очищено все поле)
    const maxCleanCells = config.gridSize - game.minesCount;
    if (game.openedCells.length === maxCleanCells) {

        // Начисляем финальный выигрыш через HTTP-запрос кредита к платформе
        const creditResult = await seamlessService.credit(username, partnerId, game.sessionId, potentialWin, gameName, game.roundId);
        const currentBalance = creditResult.balance;

        // Апдейтим локальный банк
        state.reduceMinesBank(partnerId, potentialWin);
        state.deleteMinesGame(username, partnerId);

        await state.savePlayerActionHistory(username, partnerId, {
            game: "Mines",
            details: `Cleared the whole board! Multiplier: ${currentMultiplier}x`,
            change: `+${potentialWin} 🪙`,
            win: true
        });

        return res.json({
            outcome: "win",
            fullBoard: game.board,
            prize: potentialWin,
            balance: currentBalance
        });
    }

    res.json({
        outcome: "success",
        openedCells: game.openedCells,
        currentWin: potentialWin,
        currentMultiplier: currentMultiplier,
        nextMultiplier: nextMultiplier
    });
};

// 3. КНОПКА «ЗАБРАТЬ ВЫИГРЫШ» (CASHOUT)
exports.cashout = async (req, res) => {
    const partnerId = req.partnerId;
    const username = req.username;

    // Получаем сессию и конфиг конкретного партнера
    const game = state.getMinesGame(username, partnerId);
    const config = state.getConfig(partnerId).mines;

    if (!game || game.status !== "playing") {
        return res.status(400).json({ error: "No active game to cashout" });
    }
    if (game.openedCells.length === 0) {
        return res.status(400).json({ error: "You must open at least one cell before cashout" });
    }

    const finalMultiplier = state.getMinesMultiplier(config.gridSize, game.minesCount, game.openedCells.length);
    const totalWin = Math.floor(game.bet * finalMultiplier);
    const gameName = "Mines";

    // Начисляем выигрыш через HTTP-запрос кредита к платформе
    const creditResult = await seamlessService.credit(username, partnerId, game.sessionId, totalWin, gameName, game.roundId);
    const currentBalance = creditResult.balance;

    // Вычитаем выигрыш из изолированной копилки бренда
    state.reduceMinesBank(partnerId, totalWin);

    // Стираем сессию в рамках текущего бренда
    state.deleteMinesGame(username, partnerId);

    // Пишем лог с передачей partnerId
    await state.savePlayerActionHistory(username, partnerId, {
        game: "Mines",
        details: `Cashout after ${game.openedCells.length} cells. Multiplier: ${finalMultiplier}x`,
        change: `+${totalWin} 🪙`,
        win: true
    });

    res.json({
        prize: totalWin,
        balance: currentBalance,
        fullBoard: game.board
    });
};



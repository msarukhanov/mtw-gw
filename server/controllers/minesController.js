const state = require('../state');

// 1. СТАРТ ИГРЫ (Игрок делает ставку и выбирает количество мин)
module.exports.start = async (req, res) => {
    const { minesCount, bet } = req.body;
    const partnerId = req.partnerId; // Извлекаем partnerId, добавленный мидлваром checkPlayer
    const username = req.username;

    // ИСПРАВЛЕНО: Достаем настройки игры конкретного партнера
    const config = state.getConfig(partnerId).mines;

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

    // ИСПРАВЛЕНО: Проверяем наличие активной игры с учетом партнера
    if (state.getMinesGame(username, partnerId)) {
        return res.status(400).json({ error: "You already have an active game. Cashout or explode first!" });
    }

    // Списываем баланс у игрока в SQLite/NeDB с привязкой к паре Игрок + Партнер
    req.player.balance -= bet;
    await state.updateBalance(username, partnerId, req.player.balance);

    // ИСПРАВЛЕНО: Добавляем чистую ставку игрока в изолированный банк (копилку) этого партнера
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

    // Сохраняем сессию раунда в оперативной памяти бэкенда
    const gameSession = {
        bet: bet,
        minesCount: minesCount,
        board: board,
        openedCells: [],
        status: "playing"
    };

    // ИСПРАВЛЕНО: Записываем сессию в память в рамках текущего бренда
    state.setMinesGame(username, partnerId, gameSession);

    res.json({
        message: "Game started",
        balance: req.player.balance,
        // Множитель рассчитывается на основе формулы, завязанной на глобальный CONFIG
        nextMultiplier: state.getMinesMultiplier(config.gridSize, minesCount, 1)
    });
};

// 2. ОТКРЫТИЕ ЯЧЕЙКИ (С жестким контролем RTP в реальном времени)
module.exports.openCell = async (req, res) => {
    const { cellIndex } = req.body;
    const partnerId = req.partnerId; // Извлекаем partnerId, добавленный мидлваром checkPlayer
    const username = req.username;

    // ИСПРАВЛЕНО: Достаем сессию игры и конфигурацию строго для текущего партнера
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
    // ИСПРАВЛЕНО: Проверяем копилку игры строго текущего партнера
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

    // ПРОВЕРКА НА ВЗРЫВ
    if (game.board[cellIndex] === 1) {
        // ИСПРАВЛЕНО: Удаляем сессию этого игрока в рамках текущего бренда
        state.deleteMinesGame(username, partnerId);

        // ИСПРАВЛЕНО: Логируем историю с привязкой к partnerId
        await state.savePlayerActionHistory(username, partnerId, {
            game: "Mines",
            details: `Exploded on cell ${cellIndex}. Total opened: ${game.openedCells.length - 1}`,
            change: `-${game.bet} 🪙`,
            win: false
        });

        return res.json({
            outcome: "explode",
            fullBoard: game.board,
            balance: req.player.balance
        });
    }

    const nextMultiplier = state.getMinesMultiplier(config.gridSize, game.minesCount, game.openedCells.length + 1);

    // Проверка на автоматическую победу (очищено все поле)
    const maxCleanCells = config.gridSize - game.minesCount;
    if (game.openedCells.length === maxCleanCells) {

        req.player.balance += potentialWin;
        // ИСПРАВЛЕНО: Апдейтим баланс и банк с учетом partnerId
        await state.updateBalance(username, partnerId, req.player.balance);
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
            balance: req.player.balance
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
module.exports.cashout = async (req, res) => {
    const partnerId = req.partnerId;
    const username = req.username;

    // ИСПРАВЛЕНО: Получаем сессию и конфиг конкретного партнера
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

    req.player.balance += totalWin;
    // ИСПРАВЛЕНО: Зачисляем выигрыш и вычитаем его из изолированной копилки бренда
    await state.updateBalance(username, partnerId, req.player.balance);
    state.reduceMinesBank(partnerId, totalWin);

    // ИСПРАВЛЕНО: Стираем сессию в рамках текущего бренда
    state.deleteMinesGame(username, partnerId);

    // ИСПРАВЛЕНО: Пишем лог с передачей partnerId
    await state.savePlayerActionHistory(username, partnerId, {
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


// --- ПЕРЕМЕННЫЕ И ЭЛЕМЕНТЫ ИГРЫ MINES ---
let isMinesPlaying = false;
const GRID_SIZE = 25;

const minesGrid = document.getElementById('minesGrid');
const minesStartBtn = document.getElementById('minesStartBtn');
const minesCashoutBtn = document.getElementById('minesCashoutBtn');
const minesBetInput = document.getElementById('minesBetInput');
const minesCountInput = document.getElementById('minesCountInput');
const minesMsg = document.getElementById('minesMsg');

// Отрисовка пустого поля при первом запуске
function initMinesGridUI() {
    if (!minesGrid) return;
    minesGrid.innerHTML = '';
    for (let i = 0; i < GRID_SIZE; i++) {
        const cell = document.createElement('button');
        cell.classList.add('mines-cell');
        cell.dataset.index = i;
        cell.disabled = true; // Заблокированы, пока игра не началась
        cell.onclick = () => openMinesCell(i, cell);
        minesGrid.appendChild(cell);
    }
}
initMinesGridUI();

// 1. НАЖАТИЕ КНОПКИ START
minesStartBtn.onclick = async () => {
    if (isMinesPlaying) return;

    if (!currentUser) {
        minesMsg.innerText = "Please login first!";
        minesMsg.style.color = "#e94560";
        return;
    }

    const bet = parseInt(minesBetInput.value);
    const minesCount = parseInt(minesCountInput.value);

    if (isNaN(bet) || bet <= 0 || isNaN(minesCount) || minesCount < 1 || minesCount > 24) {
        minesMsg.innerText = "Invalid bet or mines count!";
        minesMsg.style.color = "#e94560";
        return;
    }

    if (currentBalance < bet) {
        minesMsg.innerText = "Not enough coins!";
        minesMsg.style.color = "#e94560";
        return;
    }

    try {
        const response = await fetch(baseUrlApi + '/mines/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: currentUser, partnerId: globalPartnerId, minesCount, bet })
        });
        const data = await response.json();

        if (data.error) {
            minesMsg.innerText = data.error;
            minesMsg.style.color = "#e94560";
            return;
        }

        // НА ЗАМЕНУ (Очистка и активация игрового поля при старте)
        document.querySelectorAll('.mines-cell').forEach(cell => {
            cell.classList.remove('mine', 'safe'); // Жестко стираем старые цвета взрывов и побед
            cell.style.background = '';            // Сбрасываем мягкую подсветку скрытых мин
            cell.innerText = '';                   // Стираем бомбы и алмазы
            cell.disabled = false;                 // Активируем ячейку для тапа
        });

        // Успешный старт на сервере
        isMinesPlaying = true;
        minesStartBtn.disabled = true;
        minesCashoutBtn.disabled = true; // Акцентируем: нужно угадать хотя бы 1 ячейку
        minesBetInput.disabled = true;
        minesCountInput.disabled = true;

        // Синхронизируем баланс
        currentBalance = data.balance;
        if (typeof updateUIProfile === 'function') updateUIProfile();

        minesMsg.innerText = `Game started! Next hit multiplier: ${data.nextMultiplier}x`;
        minesMsg.style.color = "#fff";

        // Очищаем и активируем игровое поле
        document.querySelectorAll('.mines-cell').forEach(cell => {
            cell.className = 'mines-cell';
            cell.innerText = '';
            cell.disabled = false;
        });

    } catch (err) {
        console.error("Mines start error:", err);
        minesMsg.innerText = "Server error. Try again.";
        minesMsg.style.color = "#e94560";
    }
};

// 2. КЛИК ПО ЯЧЕЙКЕ НА ПОЛЕ
async function openMinesCell(index, cellButton) {
    if (!isMinesPlaying) return;

    try {
        const response = await fetch(baseUrlApi + '/mines/open', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: currentUser, partnerId: globalPartnerId, cellIndex: index })
        });
        const data = await response.json();

        if (data.error) {
            minesMsg.innerText = data.error;
            minesMsg.style.color = "#e94560";
            return;
        }

        // СЛУЧАЙ 1: ВЗРЫВ (МИНА ИЛИ СРАБОТАЛ ВАШ RTP)
        if (data.outcome === "explode") {
            cellButton.classList.add('mine');
            cellButton.innerText = '💣';
            revealFinalMinesBoard(data.fullBoard);
            endMinesGameSession("💥 BOOM! You exploded!", "#e94560");
            return;
        }

        // СЛУЧАЙ 2: АВТО-ПОБЕДА (Открыты все чистые поля)
        if (data.outcome === "win") {
            cellButton.classList.add('safe');
            cellButton.innerText = '💎'; // Сюда можно подставить картинку вашего персонажа
            revealFinalMinesBoard(data.fullBoard);

            currentBalance = data.balance;
            if (typeof updateUIProfile === 'function') updateUIProfile();

            endMinesGameSession(`🏆 PERFECT WIN! +${data.prize} 🪙`, "#4ecca3");
            return;
        }

        // СЛУЧАЙ 3: Обычный успешный ход (Ячейка чистая)
        cellButton.classList.add('safe');
        cellButton.innerText = '💎';
        cellButton.disabled = true; // Больше нажать на неё нельзя
        minesCashoutBtn.disabled = false; // Теперь можно безопасно забрать текущий приз

        minesMsg.innerText = `Current Win: ${data.currentWin} 🪙 (${data.currentMultiplier}x) | Next: ${data.nextMultiplier}x`;
        minesMsg.style.color = "#4ecca3";

    } catch (err) {
        console.error("Mines open error:", err);
    }
}

// 3. НАЖАТИЕ КНОПКИ CASHOUT (ЗАБРАТЬ ДЕНЬГИ)
minesCashoutBtn.onclick = async () => {
    if (!isMinesPlaying) return;

    try {
        const response = await fetch(baseUrlApi + '/mines/cashout', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: currentUser, partnerId: globalPartnerId })
        });
        const data = await response.json();

        if (data.error) {
            minesMsg.innerText = data.error;
            minesMsg.style.color = "#e94560";
            return;
        }

        // Забираем выигрыш
        currentBalance = data.balance;
        if (typeof updateUIProfile === 'function') updateUIProfile();

        revealFinalMinesBoard(data.fullBoard);
        endMinesGameSession(`💰 Cashout successful! +${data.prize} 🪙`, "#4ecca3");

    } catch (err) {
        console.error("Mines cashout error:", err);
    }
};

// Показать расположение всех скрытых мин после окончания раунда
function revealFinalMinesBoard(boardArray) {
    if (!boardArray) return;
    const cells = document.querySelectorAll('.mines-cell');
    cells.forEach((cell, idx) => {
        cell.disabled = true;
        if (boardArray[idx] === 1) {
            if (!cell.classList.contains('mine')) {
                cell.style.background = "rgba(233, 69, 96, 0.2)"; // Мягко подсвечиваем остальные мины
                cell.innerText = '💣';
            }
        } else {
            if (!cell.classList.contains('safe')) {
                cell.innerText = '💎';
            }
        }
    });
}

// Завершение игровой сессии на клиенте и разблокировка ввода
function endMinesGameSession(messageText, textColor) {
    isMinesPlaying = false;
    minesStartBtn.disabled = false;
    minesCashoutBtn.disabled = true;
    minesBetInput.disabled = false;
    minesCountInput.disabled = false;

    minesMsg.innerText = messageText;
    minesMsg.style.color = textColor;

    // Автоматически обновляем единую ленту истории действий
    if (typeof loadGeneralHistory === 'function') loadGeneralHistory();
}

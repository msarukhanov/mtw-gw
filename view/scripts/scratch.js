const CARD_PRICE = 15;
const SYMBOLS_Scratch = ['🦁', '🐯', '🐻', '🍒', '🍀'];

let isCardActive = false;

const canvas_Scratch = document.getElementById('scratchCanvas');
const ctx_Scratch = canvas_Scratch.getContext('2d');
const prizesGrid = document.getElementById('prizesGrid');

const buyBtn = document.getElementById('buyBtn');
const msgBox_Scratch = document.getElementById('msgBox_Scratch');

if (typeof balanceLabel !== 'undefined' && balanceLabel) {
    balanceLabel.innerText = currentBalance;
}

function initScratchLayer() {
    if (!canvas_Scratch || !ctx_Scratch) return;
    ctx_Scratch.globalCompositeOperation = 'source-over';

    const grad = ctx_Scratch.createLinearGradient(0, 0, 260, 260);
    grad.addColorStop(0, '#393e46');
    grad.addColorStop(1, '#222831');
    ctx_Scratch.fillStyle = grad;
    ctx_Scratch.fillRect(0, 0, canvas_Scratch.width, canvas_Scratch.height);

    ctx_Scratch.fillStyle = '#8a8ab0';
    ctx_Scratch.font = 'bold 16px Arial';
    ctx_Scratch.textAlign = 'center';
    ctx_Scratch.fillText('SCRATCH HERE WITH FINGER', 130, 135);
}
initScratchLayer();

// СЕРВЕРНАЯ ПОКУПКА СКРЕТЧ-КАРТЫ
buyBtn.onclick = async () => {
    if (isCardActive) return;

    if (!currentUser) {
        msgBox_Scratch.innerText = "Please login first!";
        msgBox_Scratch.style.color = "#e94560";
        return;
    }

    if (currentBalance < CARD_PRICE) {
        msgBox_Scratch.innerText = "Not enough coins!";
        msgBox_Scratch.style.color = "#e94560";
        return;
    }

    try {
        const response = await fetch(baseUrlApi + '/scratch/buy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: currentUser })
        });
        const data = await response.json();

        if (data.error) {
            msgBox_Scratch.innerText = data.error;
            msgBox_Scratch.style.color = "#e94560";
            return;
        }

        // Накатываем новые финансовые данные от бэкенда
        currentBalance = data.balance;
        jackpot = data.jackpot;

        if (typeof balanceLabel !== 'undefined' && balanceLabel) balanceLabel.innerText = currentBalance;
        if (typeof updateJackpotUI === 'function') updateJackpotUI();

        isCardActive = true;
        buyBtn.disabled = true;
        msgBox_Scratch.innerText = "Scratch the card to reveal items!";
        msgBox_Scratch.style.color = "#fff";

        // Запоминаем серверный пул выигрыша для текущего раунда стирания
        currentPrizePool = data.prize;

        // Рендерим ячейки, которые прислал сервер, и заливаем холст краской поверх
        generateHiddenPrizes(data.cells);
        initScratchLayer();

    } catch (err) {
        console.error("Scratch error:", err);
        msgBox_Scratch.innerText = "Server error. Try again.";
        msgBox_Scratch.style.color = "#e94560";
    }
};

let currentPrizePool = 0;

// Генерация сетки на основе ответа бэкенда
function generateHiddenPrizes(serverCells) {
    if (!prizesGrid || !serverCells) return;
    prizesGrid.innerHTML = '';

    serverCells.forEach(sym => {
        const cell = document.createElement('div');
        cell.classList.add('cell');
        cell.innerText = sym;
        prizesGrid.appendChild(cell);
    });
}

// --- МЕХАНИКА СТИРАНИЯ (Осталась прежней) ---
function scratch(e) {
    if (!isDrawing || !isCardActive) return;

    const rect = canvas_Scratch.getBoundingClientRect();
    let x, y;

    if (e.touches) {
        x = e.touches[0].clientX - rect.left;
        y = e.touches[0].clientY - rect.top;
    } else {
        x = e.clientX - rect.left;
        y = e.clientY - rect.top;
    }

    ctx_Scratch.globalCompositeOperation = 'destination-out';

    ctx_Scratch.beginPath();
    ctx_Scratch.arc(x, y, 20, 0, Math.PI * 2);
    ctx_Scratch.fill();
}

canvas_Scratch.addEventListener('mousedown', () => isDrawing = true);
canvas_Scratch.addEventListener('mouseup', () => { isDrawing = false; checkCardCleared(); });
canvas_Scratch.addEventListener('mousemove', scratch);

canvas_Scratch.addEventListener('touchstart', () => isDrawing = true);
canvas_Scratch.addEventListener('touchend', () => { isDrawing = false; checkCardCleared(); });
canvas_Scratch.addEventListener('touchmove', scratch);

// Проверка: стер ли пользователь достаточное количество слоя, чтобы показать итог
function checkCardCleared() {
    if (!isCardActive || !ctx_Scratch || !canvas_Scratch) return;

    // Считаем прозрачные пиксели на холсте
    const imgData = ctx_Scratch.getImageData(0, 0, canvas_Scratch.width, canvas_Scratch.height);
    let clearPixels = 0;

    // Проверяем альфа-канал каждого 4-го байта (прозрачность)
    for (let i = 3; i < imgData.data.length; i += 4) {
        if (imgData.data[i] === 0) clearPixels++;
    }

    // Если стерто более 45% поверхности, автоматически открываем карту целиком
    const percentCleared = (clearPixels / (canvas_Scratch.width * canvas_Scratch.height)) * 100;
    if (percentCleared > 45) {
        processScratchResult();
    }
}

// Подсчет результатов и выдача наград на основе серверного ответа
function processScratchResult() {
    isCardActive = false;

    // Полностью очищаем холст, показывая всю сетку под ним
    ctx_Scratch.clearRect(0, 0, canvas_Scratch.width, canvas_Scratch.height);

    if (currentPrizePool > 0) {
        // Если выигрыш больше обычной выплаты (40 монет), значит это был Глобальный Джекпот!
        if (currentPrizePool > 50) {
            msgBox_Scratch.innerHTML = `🚨 MEGA JACKPOT!!! You won ${currentPrizePool} 🪙!`;
            msgBox_Scratch.style.color = "#4ecca3";

            // Синхронизируем сброс джекпота на клиенте
            jackpot = 1000;
            if (typeof updateJackpotUI === 'function') updateJackpotUI();
        } else {
            msgBox_Scratch.innerHTML = `🎉 Winner! You matched 3 symbols: +${currentPrizePool} 🪙`;
            msgBox_Scratch.style.color = "#4ecca3";
        }
    } else {
        msgBox_Scratch.innerText = "No match this time! Better luck next card.";
        msgBox_Scratch.style.color = "#e94560";
    }

    // Обновляем отображение баланса (переменная уже изменена при клике «Купить»)
    if (typeof balanceLabel !== 'undefined' && balanceLabel) {
        balanceLabel.innerText = currentBalance;
    }

    // Возвращаем кнопку покупки в рабочее состояние
    buyBtn.disabled = false;
}
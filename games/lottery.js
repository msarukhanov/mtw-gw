const TOTAL_NUMBERS = 49;
const NEEDED_CHOICES = 6;
const TICKET_PRICE = 1;

// Подгружаем историю из localStorage или создаем пустую (пока оставим локальной)
let historyData = JSON.parse(localStorage.getItem('lottery_history')) || [];

const selectedNumbers = new Set();
let registeredTickets = [];

const ticketBox = document.getElementById('ticketBox');
const betBtn = document.getElementById('betBtn');
const ballsBox = document.getElementById('ballsBox');
const resultBox = document.getElementById('resultBox');

const timerDisplay = document.getElementById('timerDisplay');

const container = document.getElementById('lottery');

const currentTicketsDiv = document.createElement('div');
currentTicketsDiv.style.margin = "15px 0";
currentTicketsDiv.style.fontSize = "14px";
container.insertBefore(currentTicketsDiv, resultBox);

const historyDiv = document.createElement('div');
historyDiv.style.marginTop = "25px";
historyDiv.style.borderTop = "1px solid #393e46";
historyDiv.style.paddingTop = "15px";
historyDiv.style.textAlign = "left";
historyDiv.style.maxHeight = "150px";
historyDiv.style.overflowY = "auto";
container.appendChild(historyDiv);

// Первичная отрисовка интерфейса
updateUIProfile();
renderHistory();

// Создание кнопок-чисел
for (let i = 1; i <= TOTAL_NUMBERS; i++) {
    const btn = document.createElement('button');
    btn.classList.add('number-btn');
    btn.innerText = i;
    btn.onclick = () => toggleNumber(i, btn);
    ticketBox.appendChild(btn);
}

// СЕРВЕРНАЯ АВТОРИЗАЦИЯ
async function handleAuth() {
    if (currentUser) {
        currentUser = null;
        currentBalance = 0;
        historyData = [];
        registeredTickets = [];
        clearCurrentTicketsUI();
        renderHistory();
        updateUIProfile();
        updateBetButtonState();
    } else {
        const name = prompt("Enter your login:", "Player1");
        if (!name) return;

        try {
            const response = await fetch(baseUrlApi + '/auth', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: name, partnerId: globalPartnerId, token:globalGameSession })
            });
            const data = await response.json();

            if (data.error) return alert(data.error);

            currentUser = data.username;
            currentBalance = data.balance;

            // Подключаем сокет к персональной комнате игрока на сервере
            socket.emit('join_game', currentUser);

            updateUIProfile();
            updateBetButtonState();
        } catch (err) {
            console.error("Auth error:", err);
            alert("Server connection failed");
        }
    }
}

function updateUIProfile() {
    if (currentUser) {
        usernameLabel.innerText = currentUser;
        balanceLabel.innerText = currentBalance;
        authBtn.innerText = "Logout";
    } else {
        usernameLabel.innerText = "Guest";
        balanceLabel.innerText = "0";
        authBtn.innerText = "Login";
    }
}

function toggleNumber(num, btn) {
    if (isDrawing) return;

    if (selectedNumbers.has(num)) {
        selectedNumbers.delete(num);
        btn.classList.remove('selected');
    } else if (selectedNumbers.size < NEEDED_CHOICES) {
        selectedNumbers.add(num);
        btn.classList.add('selected');
    }
    updateBetButtonState();
}

function updateBetButtonState() {
    if (isDrawing) {
        betBtn.disabled = true;
        betBtn.innerText = "Draw in progress...";
        return;
    }
    if (!currentUser) {
        betBtn.disabled = true;
        betBtn.innerText = "Login to play";
        return;
    }
    if (selectedNumbers.size === NEEDED_CHOICES) {
        if (currentBalance >= TICKET_PRICE) {
            betBtn.disabled = false;
            betBtn.innerText = `Buy ticket #${registeredTickets.length + 1} for ${TICKET_PRICE} 🪙`;
        } else {
            betBtn.disabled = true;
            betBtn.innerText = "Not enough coins";
        }
    } else {
        betBtn.disabled = true;
        betBtn.innerText = `Pick ${NEEDED_CHOICES - selectedNumbers.size} more numbers`;
    }
}

// СЕРВЕРНАЯ ПОКУПКА БИЛЕТА
betBtn.onclick = async () => {
    if (currentBalance < TICKET_PRICE || selectedNumbers.size !== NEEDED_CHOICES) return;

    const ticket = Array.from(selectedNumbers).sort((a, b) => a - b);

    try {
        const response = await fetch(baseUrlApi + '/lottery/buy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: currentUser, partnerId: globalPartnerId, token:globalGameSession, numbers: ticket })
        });
        const data = await response.json();

        if (data.error) return alert(data.error);

        // Синхронизируем баланс и джекпот с ответом сервера
        currentBalance = data.balance;
        jackpot = data.jackpot;
        updateUIProfile();
        updateJackpotUI();

        registeredTickets.push(ticket);
        renderCurrentTickets();

        selectedNumbers.clear();
        document.querySelectorAll('.number-btn').forEach(b => b.classList.remove('selected'));

        updateBetButtonState();
        resultBox.innerText = `Ticket #${registeredTickets.length} successfully bought!`;
    } catch (err) {
        console.error("Ticket purchase error:", err);
        alert("Failed to buy ticket via server");
    }
};

function renderCurrentTickets() {
    currentTicketsDiv.innerHTML = `<b style="color:#4ecca3">Tickets bought for this draw (${registeredTickets.length}):</b><br>`;
    registeredTickets.forEach((t, index) => {
        currentTicketsDiv.innerHTML += `Ticket ${index + 1}: [ ${t.join(', ')} ]<br>`;
    });
}

function clearCurrentTicketsUI() {
    registeredTickets = [];
    currentTicketsDiv.innerHTML = '';
}

function renderHistory() {
    if (historyData.length === 0) {
        historyDiv.innerHTML = '<p style="color:#888; font-size:12px; text-align:center;">Draw history is empty</p>';
        return;
    }
    let html = '<b style="font-size:14px; color:#e94560;">📜 Draw History:</b><br>';

    [...historyData].reverse().forEach(game => {
        html += `<div style="font-size:12px; margin-bottom:5px; background:#0f3460; padding:5px; border-radius:5px;">
                <b>Draw at ${game.time}</b><br>
                Drawn: <span style="color:#ff4b5c">${game.winNums.join(', ')}</span><br>
                Tickets: ${game.ticketsCount} | Won: <span style="color:#4ecca3">+${game.totalPrize} 🪙</span>
            </div>`;
    });
    historyDiv.innerHTML = html;
}

// СЕРВЕРНЫЙ ИНТЕРФЕЙС ТАЙМЕРА (Вызывается из корневого сокета каждую секунду)
window.updateLotteryTimerUI = function(timeLeft) {
    const totalSecondsLeft = Math.ceil(timeLeft / 1000);
    const minutes = Math.floor(totalSecondsLeft / 60);
    const seconds = totalSecondsLeft % 60;

    timerDisplay.innerText = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};


// Логика кнопки автоматического выбора чисел (локальный генератор для заполнения кнопок)
document.getElementById('quickPickBtn').onclick = () => {
    if (isDrawing) return;

    selectedNumbers.clear();
    const allButtons = document.querySelectorAll('.number-btn');
    allButtons.forEach(btn => btn.classList.remove('selected'));

    const buffer = new Uint32Array(1);
    while (selectedNumbers.size < NEEDED_CHOICES) {
        window.crypto.getRandomValues(buffer);
        const randomNum = (buffer[0] % TOTAL_NUMBERS) + 1;
        selectedNumbers.add(randomNum);
    }

    allButtons.forEach(btn => {
        const num = parseInt(btn.innerText);
        if (selectedNumbers.has(num)) {
            btn.classList.add('selected');
        }
    });

    updateBetButtonState();
};

// АНИМАЦИЯ РОЗЫГРЫША (Теперь запускается по сигналу с сервера)
async function runClientDrawAnimation(winningNumbers, totalPrize, newBalance) {
    isDrawing = true;
    updateBetButtonState();
    ballsBox.innerHTML = '';
    resultBox.innerText = '🚨 DRAW STARTED! Mixing balls...';
    document.querySelectorAll('.number-btn').forEach(b => b.disabled = true);

    // Поочередная визуализация шаров, присланных сервером
    for (let i = 0; i < winningNumbers.length; i++) {
        await new Promise(res => setTimeout(res, 600));
        const ball = document.createElement('div');
        ball.classList.add('ball');
        ball.innerText = winningNumbers[i];
        ballsBox.appendChild(ball);
    }

    // Вывод результатов на основе серверного подсчета
    if (registeredTickets.length > 0) {
        if (totalPrize > 0) {
            resultBox.innerHTML = `🎉 Draw over! Total win: ${totalPrize} 🪙!`;
        } else {
            resultBox.innerHTML = `❌ None of your ${registeredTickets.length} tickets won.`;
        }
    } else {
        resultBox.innerHTML = `Draw completed. You didn't buy any tickets for this round.`;
    }

    // Обновляем баланс данными из бэкенда
    currentBalance = newBalance;
    updateUIProfile();

    // Сохраняем тираж в локальную историю
    const timeString = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    historyData.push({
        time: timeString,
        winNums: winningNumbers,
        ticketsCount: registeredTickets.length,
        totalPrize: totalPrize
    });

    if (historyData.length > 20) historyData.shift();
    localStorage.setItem('lottery_history', JSON.stringify(historyData));
    renderHistory();

    // Тайм-аут отображения результатов перед сбросом поля
    setTimeout(() => {
        clearCurrentTicketsUI();
        isDrawing = false;
        selectedNumbers.clear();
        document.querySelectorAll('.number-btn').forEach(b => {
            b.disabled = false;
            b.classList.remove('selected');
        });
        resultBox.innerText = "Pick numbers for the next round!";
        updateBetButtonState();
    }, 7000);
}

socket.emit('join_game_room', {username:currentUser, partnerId:globalPartnerId, game:'lottery'});
// СЛУШАЕМ СЕРВЕР: Событие для авторизованного игрока, сделавшего ставки
socket.on('lottery_result', (data) => {
    runClientDrawAnimation(data.winningNumbers, data.totalPrize, data.newBalance);
});

// СЛУШАЕМ СЕРВЕР: Событие для гостей или игроков без билетов в этом раунде
socket.on('global_draw_info', (data) => {
    if (!isDrawing) { // Запускаем анимацию просмотра, только если сами не играли
        runClientDrawAnimation(data.winningNumbers, 0, currentBalance);
    }
});

let isMrBetPlaced = false;


// Подключаем слушатель сокетов для рулетки (вызов функции добавьте при инициализации сокетов в main.js)
function listenRouletteSockets(socket) {
    if (!socket) return;

    socket.emit('join_game_room', {username:currentUser, partnerId:globalPartnerId, game:'roulette'});

    socket.on('roulette_state', (data) => {
        const statusLabel = document.getElementById('mrStatusLabel');
        const timerLabel = document.getElementById('mrTimerLabel');
        const wheelScreen = document.getElementById('mrWheelScreen');
        const resultBall = document.getElementById('mrResultBall');
        const resultText = document.getElementById('mrResultText');

        if (data.status === 'betting') {
            // 1. СТАДИЯ ПРИЕМА СТАВОК
            statusLabel.innerText = "Accepting bets...";
            statusLabel.style.color = "#ffffff";

            const secondsLeft = Math.round(data.timeLeft / 1000);
            const displaySeconds = secondsLeft > 0 ? secondsLeft : 0;
            timerLabel.innerText = `00:${displaySeconds < 10 ? '0' : ''}${displaySeconds}`;
            timerLabel.style.color = "#4ecca3";

            // Возвращаем шарик в режим спокойного ожидания
            resultBall.className = "mr-ball-placeholder mr-ball-idle";
            wheelScreen.className = "mr-wheel-screen"; // Убираем мерцание экрана

            if (!isMrBetPlaced) {
                toggleMrButtons(false);
            }
            updateMrChipsPools(data.bets);

        } else if (data.status === 'spinning') {
            // 2. СТАДИЯ ВРАЩЕНИЯ КОЛЕСА
            isMrBetPlaced = false;
            toggleMrButtons(true);

            statusLabel.innerText = "Wheel is spinning!";
            statusLabel.style.color = "#e94560";
            timerLabel.innerText = "00:00";
            timerLabel.style.color = "#777";

            resultText.innerText = "The ball is rolling...";

            // ВКЛЮЧАЕМ АНИМАЦИЮ ВРАЩЕНИЯ
            resultBall.className = "mr-ball-placeholder mr-ball-spinning";
            resultBall.innerText = ""; // Прячем знак вопроса во время кручения
            wheelScreen.className = "mr-wheel-screen mr-screen-spinning"; // Подсвечиваем рамку экрана

            // Очищаем список ставок на фронте
            document.getElementById('mrActiveBetsList').innerHTML =
                '<div style="color: #e94560; text-align: center; font-weight: bold; letter-spacing: 0.5px;">💥 BETS CLOSED! SPINNING...</div>';
            document.getElementById('mrPlayersCount').innerText = '0';

        } else if (data.status === 'results') {
            // 3. СТАДИЯ РЕЗУЛЬТАТОВ РАУНДА
            statusLabel.innerText = "Round Results";
            statusLabel.style.color = "#4ecca3";
            wheelScreen.className = "mr-wheel-screen"; // Выключаем мерцание рамки

            // ОСТАНАВЛИВАЕМ ВРАЩЕНИЕ И ВСПЫХИВАЕМ ЦВЕТОМ СЕКТОРА
            resultBall.innerText = data.winningNumber;
            const winColor = data.color === 'red' ? '#e94560' : (data.color === 'black' ? '#0f1115' : '#4ecca3');

            resultBall.style.background = winColor;
            resultBall.style.borderColor = "#ffffff";
            resultBall.style.boxShadow = `0 0 20px ${winColor}, 0 0 40px ${winColor}`;

            // Применяем класс триумфального появления
            resultBall.className = "mr-ball-placeholder mr-ball-win";

            resultText.innerHTML = `Result: <span style="color: ${data.color === 'black' ? '#fff' : winColor}; text-transform: uppercase; font-weight: bold;">${data.color} ${data.winningNumber}</span>`;

            // Проверка ваших выигрышей
            const myWin = data.winners.find(w => w.username === currentUser);
            const msgBox = document.getElementById('msgBoxMr');

            if (myWin) {
                msgBox.innerHTML = `🎉 You Won! +${myWin.winAmount} 🪙`;
                msgBox.style.color = "#4ecca3";
                currentBalance += myWin.winAmount;
                if (typeof balanceLabel !== 'undefined' && balanceLabel) balanceLabel.innerText = currentBalance;
            } else {
                msgBox.innerText = "Better luck next time!";
                msgBox.style.color = "#8a8ab0";
            }
        }
    });

}

// Отправка ставки на бэкенд через обычный POST-запрос (в стиле вашего Краша)
async function mrPlaceBet(betType, betValue) {
    if (isMrBetPlaced) return;

    if (!currentUser) {
        document.getElementById('msgBoxMr').innerText = "Please login first!";
        document.getElementById('msgBoxMr').style.color = "#e94560";
        return;
    }

    const selectEl = document.getElementById('mrBetAmountSelect');
    const betAmount = parseInt(selectEl.value);

    if (currentBalance < betAmount) {
        document.getElementById('msgBoxMr').innerText = "Not enough coins!";
        document.getElementById('msgBoxMr').style.color = "#e94560";
        return;
    }

    // Блокируем ввод на время запроса
    toggleMrButtons(true);
    document.getElementById('msgBoxMr').innerText = "Placing bet...";
    document.getElementById('msgBoxMr').style.color = "#8a8ab0";

    try {
        const response = await fetch(baseUrlApi + '/roulette/bet', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: currentUser,
                partnerId: globalPartnerId,
                betAmount,
                betType,
                betValue
            })
        });
        const data = await response.json();

        if (data.error) {
            document.getElementById('msgBoxMr').innerText = data.error;
            document.getElementById('msgBoxMr').style.color = "#e94560";
            toggleMrButtons(false);
            return;
        }

        // Ставка успешно принята
        isMrBetPlaced = true;
        currentBalance = data.balance;
        if (typeof balanceLabel !== 'undefined' && balanceLabel) balanceLabel.innerText = currentBalance;

        document.getElementById('msgBoxMr').innerHTML = `👍 Bet of ${betAmount} 🪙 on <b>${betValue.toUpperCase()}</b> accepted!`;
        document.getElementById('msgBoxMr').style.color = "#4ecca3";

    } catch (err) {
        console.error("Roulette bet error:", err);
        document.getElementById('msgBoxMr').innerText = "Server error. Try again.";
        document.getElementById('msgBoxMr').style.color = "#e94560";
        toggleMrButtons(false);
    }
}

// Хелпер включения/выключения интерактивности кнопок стола ставок
function toggleMrButtons(disabledState) {
    const buttons = document.querySelectorAll('.mr-bet-btn');
    buttons.forEach(btn => btn.disabled = disabledState);
    document.getElementById('mrBetAmountSelect').disabled = disabledState;
}

// Функция подсчета общего пула монет на каждом секторе (для визуализации ставок ботов)
function updateMrChipsPools(betsObject) {
    const pools = { red: 0, black: 0, even: 0, odd: 0 };
    const listContainer = document.getElementById('mrActiveBetsList');
    const countLabel = document.getElementById('mrPlayersCount');

    if (!betsObject || Object.keys(betsObject).length === 0) {
        listContainer.innerHTML = '<div style="color: #8a8ab0; text-align: center;">Waiting for bets...</div>';
        countLabel.innerText = '0';
        return;
    }

    listContainer.innerHTML = ''; // Очищаем старый список
    let playersCount = 0;

    Object.entries(betsObject).forEach(([username, bet]) => {
        playersCount++;

        // Считаем суммы для кнопок
        if (pools[bet.betValue] !== undefined) {
            pools[bet.betValue] += bet.betAmount;
        }

        // Подбираем цвет плашки в зависимости от того, на что поставлено
        let badgeColor = '#8a8ab0'; // Дефолтный серый
        if (bet.betValue === 'red') badgeColor = '#e94560';
        if (bet.betValue === 'black') badgeColor = '#1a1a2e; border: 1px solid #393e46';

        // Создаем строчку игрока
        const betRow = document.createElement('div');
        betRow.style.display = 'flex';
        betRow.style.justify = 'space-between';
        betRow.style.alignItems = 'center';
        betRow.style.background = '#0f3460';
        betRow.style.padding = '6px 10px';
        betRow.style.borderRadius = '8px';

        // Выделяем реального игрока жирным/зеленым цветом, чтобы он себя видел
        const isMe = (username === currentUser);
        const nameStyle = isMe ? 'color: #4ecca3; font-weight: bold;' : 'color: #fff;';

        betRow.innerHTML = `
            <span style="${nameStyle}">${username} ${isMe ? '(You)' : ''}</span>
            <div style="display: flex; gap: 8px; align-items: center;">
                <span style="background: ${badgeColor}; font-size: 11px; padding: 2px 6px; border-radius: 4px; font-weight: bold; text-transform: uppercase;">
                    ${bet.betValue}
                </span>
                <span style="color: #4ecca3; font-weight: bold;">${bet.betAmount} 🪙</span>
            </div>
        `;
        listContainer.appendChild(betRow);
    });

    countLabel.innerText = playersCount;

    // Рендерим общие суммы фишек на кнопках стола
    document.getElementById('mrPool_red').innerText = `${pools.red} 🪙`;
    document.getElementById('mrPool_black').innerText = `${pools.black} 🪙`;
    document.getElementById('mrPool_even').innerText = `${pools.even} 🪙`;
    document.getElementById('mrPool_odd').innerText = `${pools.odd} 🪙`;
}

listenRouletteSockets(socket);
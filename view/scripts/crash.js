// --- ПЕРЕМЕННЫЕ И ЭЛЕМЕНТЫ ИГРЫ CRASH ---
let crashClientState = "betting"; // betting, flying, crashed
let hasPlacedCrashBet = false;
let hasCashedOutCrash = false;
let crashAnimFrame = null;
let crashFlightProgress = 0; // для плавной отрисовки графика

const crashCanvas = document.getElementById('crashCanvas');
const crashCtx = crashCanvas ? crashCanvas.getContext('2d') : null;
const crashActionBtn = document.getElementById('crashActionBtn');
const crashBetInput = document.getElementById('crashBetInput');
const crashOverlay = document.getElementById('crashOverlay');
const crashLiveMult = document.getElementById('crashLiveMult');

// Главная кнопка действия (Смена режимов Ставка -> Ожидание -> Кэшаут)
if (crashActionBtn) {
    crashActionBtn.onclick = async () => {
        if (!currentUser) return alert("Please login first!");

        // Режим 1: Делаем ставку во время ожидания
        if (crashClientState === "betting" && !hasPlacedCrashBet) {
            const bet = parseInt(crashBetInput.value);
            if (isNaN(bet) || bet <= 0) return alert("Invalid bet amount");
            if (currentBalance < bet) return alert("Not enough coins");

            try {
                const response = await fetch(baseUrlApi + '/crash/bet', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username: currentUser, bet })
                });
                const data = await response.json();

                if (data.error) {
                    crashOverlay.innerText = data.error;
                    return;
                }

                hasPlacedCrashBet = true;
                currentBalance = data.balance;
                if (typeof updateUIProfile === 'function') updateUIProfile();

                crashActionBtn.disabled = true;
                crashActionBtn.innerText = "BET ACCEPTED";
                crashBetInput.disabled = true;
            } catch (err) {
                console.error("Crash bet error:", err);
            }
        }
        // Режим 2: Нажимаем Кэшаут (Забрать деньги) во время полета
        else if (crashClientState === "flying" && hasPlacedCrashBet && !hasCashedOutCrash) {
            try {
                const response = await fetch(baseUrlApi + '/crash/cashout', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username: currentUser })
                });
                const data = await response.json();

                if (data.error) return alert(data.error);

                hasCashedOutCrash = true;
                currentBalance = data.balance;
                if (typeof updateUIProfile === 'function') updateUIProfile();

                crashActionBtn.disabled = true;
                crashActionBtn.classList.remove('cashout-active');
                crashActionBtn.innerText = `CASHED OUT (+${data.prize} 🪙)`;

                if (typeof loadGeneralHistory === 'function') loadGeneralHistory();
            } catch (err) {
                console.error("Crash cashout error:", err);
            }
        }
    };
}

// --- РИСОВАНИЕ ГРАФИКА НА CANVAS ---
function drawCrashGraph(multiplier, stateStr) {
    if (!crashCtx || !crashCanvas) return;
    const w = crashCanvas.width;
    const h = crashCanvas.height;
    crashCtx.clearRect(0, 0, w, h);

    // Рисуем сетку на фоне
    crashCtx.strokeStyle = "rgba(37, 37, 77, 0.3)";
    crashCtx.lineWidth = 1;
    for (let i = 50; i < w; i += 50) {
        crashCtx.beginPath(); crashCtx.moveTo(i, 0); crashCtx.lineTo(i, h); crashCtx.stroke();
    }
    for (let i = 40; i < h; i += 40) {
        crashCtx.beginPath(); crashCtx.moveTo(0, i); crashCtx.lineTo(w, i); crashCtx.stroke();
    }

    if (stateStr === "flying") {
        crashFlightProgress += 1.5;
        if (crashFlightProgress > w - 60) crashFlightProgress = w - 60;

        // Координаты полета (параболическая кривая вверх-вправо)
        const x = crashFlightProgress;
        const y = h - 20 - (Math.pow(x / (w - 60), 2) * (h - 60));

        // Рисуем неоновую линию хвоста
        crashCtx.strokeStyle = "#e94560";
        crashCtx.lineWidth = 4;
        crashCtx.shadowBlur = 10;
        crashCtx.shadowColor = "#e94560";

        crashCtx.beginPath();
        crashCtx.moveTo(0, h - 20);
        // Проводим плавную кривую до текущей точки самолета
        crashCtx.quadraticCurveTo(x / 2, h - 20, x, y);
        crashCtx.stroke();

        // Сброс тени
        crashCtx.shadowBlur = 0;

        // Рисуем сам летящий самолетик (замените на картинку вашего персонажа)
        crashCtx.fillStyle = "#4ecca3";
        crashCtx.beginPath();
        crashCtx.arc(x, y, 10, 0, Math.PI * 2);
        crashCtx.fill();
    }
}

// --- СЛУШАЕМ СЕРВЕР ЧЕРЕЗ ВЕБСОКЕТЫ (Общий поток для Авиатора) ---
socket.on('crash_state', (data) => {
    crashClientState = data.status;

    // Состояние 1: Идет прием ставок (Обратный отсчет)
    if (data.status === "betting") {
        cancelAnimationFrame(crashAnimFrame);
        crashFlightProgress = 0;
        if (crashCtx) crashCtx.clearRect(0, 0, crashCanvas.width, crashCanvas.height);

        crashLiveMult.style.display = "none";
        crashOverlay.style.display = "block";
        crashOverlay.style.color = "#4ecca3";
        crashOverlay.innerText = `NEXT FLIGHT IN ${Math.ceil(data.timeLeft / 1000)}s`;

        // Если игрок еще не делал ставку в этом раунде, даем ему кнопку
        if (!hasPlacedCrashBet) {
            crashActionBtn.disabled = false;
            crashActionBtn.classList.remove('cashout-active');
            crashActionBtn.innerText = "PLACE BET";
            crashBetInput.disabled = false;
        }
    }
    // Состояние 2: Самолёт летит в реальном времени!
    else if (data.status === "flying") {
        crashOverlay.style.display = "none";
        crashLiveMult.style.display = "block";
        crashLiveMult.innerText = `${data.multiplier.toFixed(2)}x`;

        // Если игрок в полете и еще не забрал деньги — активируем кнопку КЭШАУТ
        if (hasPlacedCrashBet && !hasCashedOutCrash) {
            crashActionBtn.disabled = false;
            crashActionBtn.classList.add('cashout-active');
            const betVal = parseInt(crashBetInput.value);
            const estWin = Math.floor(betVal * data.multiplier);
            crashActionBtn.innerText = `TAKE WIN: ${estWin} 🪙`;
        }

        // Перерисовываем график на Canvas
        drawCrashGraph(data.multiplier, "flying");
    }
    // Состояние 3: Краш (Самолет улетел)
    else if (data.status === "crashed") {
        crashClientState = "crashed";
        crashLiveMult.style.display = "none";
        crashOverlay.style.display = "block";
        crashOverlay.style.color = "#e94560";
        crashOverlay.innerHTML = `FLEW AWAY<br><span style="font-size:32px; font-weight:900;">${data.multiplier.toFixed(2)}x</span>`;

        // Окрашиваем график в красный цвет взрыва
        if (crashCtx && crashCanvas) {
            crashCtx.fillStyle = "rgba(233, 69, 96, 0.1)";
            crashCtx.fillRect(0, 0, crashCanvas.width, crashCanvas.height);
        }

        // Блокируем управление до начала нового раунда
        crashActionBtn.disabled = true;
        crashActionBtn.classList.remove('cashout-active');
        crashActionBtn.innerText = "CRASHED";

        // Сбрасываем флаги личной игровой сессии для следующего полета
        hasPlacedCrashBet = false;
        hasCashedOutCrash = false;

        if (typeof loadGeneralHistory === 'function') loadGeneralHistory();
    }
});

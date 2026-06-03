const SYMBOLS_Slots = ['🦁', '🐯', '🐻', '💎', '🍒', '🍀'];
const SPIN_COST = 10;

let isSpinning = false;

const spinBtn = document.getElementById('spinBtn');
const msgBox = document.getElementById('msgBox');

const reels = [
    document.getElementById('reel1'),
    document.getElementById('reel2'),
    document.getElementById('reel3')
];

// Инициализация баланса слотов из глобальной переменной
if (typeof balanceLabel !== 'undefined' && balanceLabel) {
    balanceLabel.innerText = currentBalance;
}

// Функция генерации ленты символов внутри каждого барабана (визуал при старте)
function initReels() {
    reels.forEach(reel => {
        if (!reel) return;
        reel.innerHTML = '';
        for (let i = 0; i < 10; i++) {
            const symDiv = document.createElement('div');
            symDiv.classList.add('symbol');
            symDiv.innerText = SYMBOLS_Slots[Math.floor(Math.random() * SYMBOLS_Slots.length)];
            reel.appendChild(symDiv);
        }
    });
}

initReels();

// СЕРВЕРНАЯ ЛОГИКА НАЖАТИЯ КНОПКИ SPIN
spinBtn.onclick = async () => {
    if (isSpinning) return;

    // Проверка авторизации на клиенте перед запросом
    if (!currentUser) {
        msgBox.innerText = "Please login first!";
        msgBox.style.color = "#e94560";
        return;
    }

    if (currentBalance < SPIN_COST) {
        msgBox.innerText = "Not enough coins!";
        msgBox.style.color = "#e94560";
        return;
    }

    isSpinning = true;
    spinBtn.disabled = true;
    msgBox.innerText = "Spinning...";
    msgBox.style.color = "#8a8ab0";

    // 1. Запускаем анимацию быстрого вращения для всех барабанов
    reels.forEach(reel => { if (reel) reel.classList.add('blur-spin'); });

    try {
        // Отправляем запрос на сервер Node.js
        const response = await fetch(baseUrlApi + '/slots/spin', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: currentUser })
        });
        const data = await response.json();

        if (data.error) {
            isSpinning = false;
            spinBtn.disabled = false;
            msgBox.innerText = data.error;
            msgBox.style.color = "#e94560";
            reels.forEach(reel => { if (reel) reel.classList.remove('blur-spin'); });
            return;
        }

        // Сервер подтвердил ставку, берем выигрышные символы и новые балансы
        const finalResults = data.results;
        const serverPrize = data.prize;

        // Синхронизируем глобальные переменные с сервером
        currentBalance = data.balance;
        jackpot = data.jackpot;

        if (typeof balanceLabel !== 'undefined' && balanceLabel) balanceLabel.innerText = currentBalance;
        if (typeof updateJackpotUI === 'function') updateJackpotUI();

        // 2. Поочередно останавливаем барабаны на символах, которые прислал сервер
        for (let i = 0; i < reels.length; i++) {
            await new Promise(resolve => setTimeout(resolve, 600 + i * 400));

            const reel = reels[i];
            if (!reel) continue;

            reel.classList.remove('blur-spin'); // Выключаем анимацию прокрутки
            reel.innerHTML = '';

            // Отрисовываем серверный символ строго по центру
            const winSymbolDiv = document.createElement('div');
            winSymbolDiv.classList.add('symbol');
            winSymbolDiv.innerText = finalResults[i];
            reel.appendChild(winSymbolDiv);

            // Заполняем декоративные нижние невидимые ячейки
            for (let j = 0; j < 2; j++) {
                const extraDiv = document.createElement('div');
                extraDiv.classList.add('symbol');
                extraDiv.innerText = SYMBOLS_Slots[Math.floor(Math.random() * SYMBOLS_Slots.length)];
                reel.appendChild(extraDiv);
            }
        }

        // 3. Выводим результат на основе подсчета сервера
        if (serverPrize > 0) {
            if (finalResults[0] === '💎' && finalResults[1] === '💎' && finalResults[2] === '💎') {
                msgBox.innerHTML = `🔥 JACKPOT! All 3 matched! +${serverPrize} 🪙`;
            } else if (finalResults[0] === finalResults[1] && finalResults[1] === finalResults[2]) {
                msgBox.innerHTML = `🔥 JACKPOT! All 3 matched! +${serverPrize} 🪙`;
            } else {
                msgBox.innerHTML = `🎉 Nice! 2 Match! +${serverPrize} 🪙`;
            }
            msgBox.style.color = "#4ecca3";
        } else {
            msgBox.innerText = "No luck this time!";
            msgBox.style.color = "#e94560";
        }

    } catch (err) {
        console.error("Slots error:", err);
        msgBox.innerText = "Server error. Try again.";
        msgBox.style.color = "#e94560";
        reels.forEach(reel => { if (reel) reel.classList.remove('blur-spin'); });
    }

    // Завершаем спин и проверяем баланс для следующего нажатия
    isSpinning = false;
    if (currentBalance >= SPIN_COST) {
        spinBtn.disabled = false;
    } else {
        msgBox.innerText = "GAME OVER! Out of coins.";
        msgBox.style.color = "#e94560";
    }
};
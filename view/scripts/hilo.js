// --- ПЕРЕМЕННЫЕ И ЭЛЕМЕНТЫ ИГРЫ HI-LO ---
const hiloCardView = document.getElementById('hiloCardView');
const hiloCardTop = document.getElementById('hiloCardTop');
const hiloCardCenter = document.getElementById('hiloCardCenter');
const hiloCardBottom = document.getElementById('hiloCardBottom');

const hiloBetInput = document.getElementById('hiloBetInput');
const hiloHigherBtn = document.getElementById('hiloHigherBtn');
const hiloLowerBtn = document.getElementById('hiloLowerBtn');
const hiloHigherMult = document.getElementById('hiloHigherMult');
const hiloLowerMult = document.getElementById('hiloLowerMult');
const hiloMsg = document.getElementById('hiloMsg');

// Базовые стартовые множители при первой загрузке (для Туза/Ace)
let currentHigherMult = "12.00x";
let currentLowerMult = "1.05x";

// Функция обновления визуального стиля игральной карты на экране
function updateCardUI(cardObj, multipliersObj) {
    if (!cardObj) return;

    // Обновляем текст номиналов и масти
    hiloCardTop.innerText = cardObj.name;
    hiloCardCenter.innerText = cardObj.suit;
    hiloCardBottom.innerText = cardObj.name;

    // Если масть красная (Черви или Буби), добавляем класс окрашивания
    if (cardObj.suit === '♥' || cardObj.suit === '♦') {
        hiloCardView.classList.add('red-suit');
    } else {
        hiloCardView.classList.remove('red-suit');
    }

    // Если сервер прислал обновленные множители — выводим их на кнопках
    if (multipliersObj) {
        hiloHigherMult.innerText = `${multipliersObj.higher.toFixed(2)}x`;
        hiloLowerMult.innerText = `${multipliersObj.lower.toFixed(2)}x`;
    }
}

// Первичная инициализация стартовой карты по умолчанию (Туз Пик)
updateCardUI({ name: 'A', suit: '♠', value: 14 }, { higher: 12.00, lower: 1.05 });

// Универсальный обработчик хода (Выше / Ниже)
async function makeHiloTurn(choiceMode) {
    if (!currentUser) {
        hiloMsg.innerText = "Please login first!";
        hiloMsg.style.color = "#e94560";
        return;
    }

    const bet = parseInt(hiloBetInput.value);
    if (isNaN(bet) || bet <= 0) {
        hiloMsg.innerText = "Invalid bet amount!";
        hiloMsg.style.color = "#e94560";
        return;
    }

    if (currentBalance < bet) {
        hiloMsg.innerText = "Not enough coins!";
        hiloMsg.style.color = "#e94560";
        return;
    }

    // Блокируем управление во время отправки запроса
    hiloHigherBtn.disabled = true;
    hiloLowerBtn.disabled = true;
    hiloBetInput.disabled = true;
    hiloMsg.innerText = "Flipping card...";
    hiloMsg.style.color = "#8a8ab0";

    // Добавляем эффект анимации переворота карты на клиенте
    hiloCardView.style.transform = "rotateY(90deg)";

    try {
        const response = await fetch(baseUrlApi + '/hilo/turn', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: currentUser, partnerId: globalPartnerId, choice: choiceMode, bet })
        });
        const data = await response.json();

        if (data.error) {
            hiloMsg.innerText = data.error;
            hiloMsg.style.color = "#e94560";
            hiloHigherBtn.disabled = false;
            hiloLowerBtn.disabled = false;
            hiloBetInput.disabled = false;
            hiloCardView.style.transform = "none";
            return;
        }

        // Небольшая задержка, чтобы анимация переворота выглядела красиво
        setTimeout(() => {
            // Возвращаем карту в нормальное положение и рендерим новые серверные данные
            hiloCardView.style.transform = "none";
            updateCardUI(data.nextCard, data.nextMultipliers);

            // Синхронизируем глобальный баланс
            currentBalance = data.balance;
            if (typeof updateUIProfile === 'function') updateUIProfile();

            // Выводим результат хода
            if (data.isWin) {
                hiloMsg.innerText = `🎉 WIN! Next card was ${data.nextCard.name}${data.nextCard.suit}. +${data.prize} 🪙`;
                hiloMsg.style.color = "#4ecca3";
            } else {
                hiloMsg.innerText = `❌ Lost! Next card was ${data.nextCard.name}${data.nextCard.suit}.`;
                hiloMsg.style.color = "#e94560";
            }

            // Разблокируем кнопки
            hiloHigherBtn.disabled = false;
            hiloLowerBtn.disabled = false;
            hiloBetInput.disabled = false;

            // Обновляем единую ленту активности внизу экрана
            if (typeof loadGeneralHistory === 'function') loadGeneralHistory();

        }, 250);

    } catch (err) {
        console.error("Hi-Lo error:", err);
        hiloMsg.innerText = "Server error. Try again.";
        hiloMsg.style.color = "#e94560";
        hiloHigherBtn.disabled = false;
        hiloLowerBtn.disabled = false;
        hiloBetInput.disabled = false;
        hiloCardView.style.transform = "none";
    }
}

// Назначаем клики на кнопки направлений
if (hiloHigherBtn) hiloHigherBtn.onclick = () => makeHiloTurn('higher');
if (hiloLowerBtn) hiloLowerBtn.onclick = () => makeHiloTurn('lower');

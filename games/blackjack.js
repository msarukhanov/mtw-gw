let isBjPlaying = false;

// Вспомогательный объект для красивого отображения значков мастей
const SUIT_SYMBOLS = { 'H': '♥', 'D': '♦', 'C': '♣', 'S': '♠' };

// 1. Метод отрисовки массива карт на экране
function renderCards(containerId, cardsArray) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';

    cardsArray.forEach(cardStr => {
        const cardDiv = document.createElement('div');

        if (cardStr === 'XX') {
            cardDiv.className = 'bj-card-unit bj-back';
            cardDiv.innerText = '?';
        } else {
            const value = cardStr.charAt(0);
            const suit = cardStr.charAt(1);
            const isRed = (suit === 'H' || suit === 'D');

            cardDiv.className = `bj-card-unit ${isRed ? 'bj-red' : ''}`;
            cardDiv.innerHTML = `
                <div style="align-self: flex-start; line-height: 1;">${value === 'T' ? '10' : value}</div>
                <div style="align-self: center; font-size: 24px; line-height: 1;">${SUIT_SYMBOLS[suit] || suit}</div>
            `;
        }
        container.appendChild(cardDiv);
    });
}


// 2. Старт игры — Кнопка DEAL
async function bjDeal() {
    if (isBjPlaying) return;

    if (!currentUser) {
        document.getElementById('msgBoxBj').innerText = "Please login first!";
        document.getElementById('msgBoxBj').style.color = "#e94560";
        return;
    }

    if (currentBalance < 20) { // Стоимость игры
        document.getElementById('msgBoxBj').innerText = "Not enough coins!";
        document.getElementById('msgBoxBj').style.color = "#e94560";
        return;
    }

    // Блокируем интерфейс во время запроса
    document.getElementById('bjDealBtn').disabled = true;
    document.getElementById('msgBoxBj').innerText = "Dealing cards...";
    document.getElementById('msgBoxBj').style.color = "#8a8ab0";

    try {
        const response = await fetch(baseUrlApi + '/blackjack/deal', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: currentUser, partnerId: globalPartnerId })
        });
        const data = await response.json();

        if (data.error) {
            document.getElementById('msgBoxBj').innerText = data.error;
            document.getElementById('msgBoxBj').style.color = "#e94560";
            document.getElementById('bjDealBtn').disabled = false;
            return;
        }

        // Обновляем баланс в вашей системе
        currentBalance = data.balance;
        if (typeof balanceLabel !== 'undefined' && balanceLabel) balanceLabel.innerText = currentBalance;

        // Рендерим стартовые карты
        renderCards('playerCards', data.playerHand);
        renderCards('dealerCards', data.dealerHand);
        document.getElementById('playerScoreLabel').innerText = data.playerScore;
        document.getElementById('dealerScoreLabel').innerText = '?';

        if (data.status === 'IN_PROGRESS') {
            // Переключаем кнопки управления на HIT / STAND
            isBjPlaying = true;
            document.getElementById('bjDealBtn').style.display = 'none';
            document.getElementById('bjInGameActionBtns').style.display = 'flex';
            document.getElementById('msgBoxBj').innerText = "Hit or Stand?";
            document.getElementById('msgBoxBj').style.color = "#ffffff";
        } else {
            // Натуральный Блэкджек (сразу победа или ничья)
            handleBjGameEnd(data);
        }

    } catch (err) {
        console.error("BJ Deal error:", err);
        document.getElementById('msgBoxBj').innerText = "Server error. Try again.";
        document.getElementById('msgBoxBj').style.color = "#e94560";
        document.getElementById('bjDealBtn').disabled = false;
    }
}

// 3. Ход игрока — Кнопки HIT или STAND
async function bjAction(playerChoice) {
    if (!isBjPlaying) return;

    try {
        const response = await fetch(baseUrlApi + '/blackjack/action', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: currentUser, partnerId: globalPartnerId, action: playerChoice })
        });
        const data = await response.json();

        if (data.error) {
            document.getElementById('msgBoxBj').innerText = data.error;
            return;
        }

        // Рендерим обновленные карты
        renderCards('playerCards', data.playerHand);
        renderCards('dealerCards', data.dealerHand);
        document.getElementById('playerScoreLabel').innerText = data.playerScore;

        if (data.status === 'IN_PROGRESS') {
            document.getElementById('msgBoxBj').innerText = "Hit or Stand?";
        } else {
            // Игра завершилась (Перебор, победа или проигрыш)
            handleBjGameEnd(data);
        }

    } catch (err) {
        console.error("BJ Action error:", err);
    }
}

// 4. Финал раунда
function handleBjGameEnd(data) {
    isBjPlaying = false;

    // Показываем финальный счет дилера и обновляем баланс
    document.getElementById('dealerScoreLabel').innerText = data.dealerScore || '21';
    currentBalance = data.balance;
    if (typeof balanceLabel !== 'undefined' && balanceLabel) balanceLabel.innerText = currentBalance;

    const msgBox = document.getElementById('msgBoxBj');

    // Стилизуем результат в вашем стиле
    if (data.status === 'WIN' || data.status === 'BLACKJACK') {
        msgBox.innerHTML = `🎉 You Win! +${data.prize} 🪙`;
        msgBox.style.color = "#4ecca3";
    } else if (data.status === 'PUSH') {
        msgBox.innerText = "Push! Bet returned. 🪙";
        msgBox.style.color = "#8a8ab0";
    } else if (data.status === 'BUST') {
        msgBox.innerText = "Bust! Over 21. ❌";
        msgBox.style.color = "#e94560";
    } else {
        msgBox.innerText = "Dealer Wins! ❌";
        msgBox.style.color = "#e94560";
    }

    // Возвращаем кнопку DEAL
    document.getElementById('bjInGameActionBtns').style.display = 'none';
    document.getElementById('bjDealBtn').style.display = 'block';
    document.getElementById('bjDealBtn').disabled = false;
}

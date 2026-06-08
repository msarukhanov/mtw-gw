let isHlPlaying = false;

// Вспомогательный объект для значков мастей
const HL_SUIT_SYMBOLS = { 'H': '♥', 'D': '♦', 'C': '♣', 'S': '♠' };

// Универсальный рендерер карт для Холдема
function renderHlCards(containerId, cardsArray) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';

    cardsArray.forEach(cardStr => {
        const cardDiv = document.createElement('div');

        if (cardStr === 'XX') {
            cardDiv.className = 'hl-card-unit hl-back';
            cardDiv.innerText = '?';
        } else {
            const value = cardStr.charAt(0);
            const suit = cardStr.charAt(1);
            const isRed = (suit === 'H' || suit === 'D');

            cardDiv.className = `hl-card-unit ${isRed ? 'hl-red' : ''}`;
            cardDiv.innerHTML = `
                <div style="align-self: flex-start; line-height: 1;">${value === 'T' ? '10' : value}</div>
                <div style="align-self: center; font-size: 22px; line-height: 1;">${HL_SUIT_SYMBOLS[suit] || suit}</div>
            `;
        }
        container.appendChild(cardDiv);
    });
}

// Главная функция запуска раздачи Холдема
async function hlSpin() {
    if (isHlPlaying) return;

    if (!currentUser) {
        document.getElementById('msgBoxHl').innerText = "Please login first!";
        document.getElementById('msgBoxHl').style.color = "#e94560";
        return;
    }

    if (currentBalance < 20) { // Стоимость игры
        document.getElementById('msgBoxHl').innerText = "Not enough coins!";
        document.getElementById('msgBoxHl').style.color = "#e94560";
        return;
    }

    // Блокируем кнопку на время запроса
    isHlPlaying = true;
    document.getElementById('hlSpinBtn').disabled = true;
    document.getElementById('msgBoxHl').innerText = "Shuffling and dealing...";
    document.getElementById('msgBoxHl').style.color = "#8a8ab0";

    // Сбрасываем старые подписи комбинаций
    document.getElementById('hlPlayerComboLabel').innerText = '?';
    document.getElementById('hlDealerComboLabel').innerText = '?';

    try {
        const response = await fetch(baseUrlApi + '/holdem/spin', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: currentUser, partnerId: globalPartnerId, token:globalGameSession })
        });
        const data = await response.json();

        if (data.error) {
            document.getElementById('msgBoxHl').innerText = data.error;
            document.getElementById('msgBoxHl').style.color = "#e94560";
            isHlPlaying = false;
            document.getElementById('hlSpinBtn').disabled = false;
            return;
        }

        // Обновляем баланс в вашей глобальной переменной
        currentBalance = data.balance;
        if (typeof balanceLabel !== 'undefined' && balanceLabel) balanceLabel.innerText = currentBalance;

        // Раскладываем карты на столе
        renderHlCards('hlPlayerCards', data.playerHand);
        renderHlCards('hlDealerCards', data.dealerHand);
        renderHlCards('hlBoardCards', data.communityCards);

        // Выводим комбинации, которые определил сервер
        document.getElementById('hlPlayerComboLabel').innerText = data.playerCombo;
        document.getElementById('hlDealerComboLabel').innerText = data.dealerCombo;

        // Выводим результат раунда в вашем фирменном стиле
        const msgBox = document.getElementById('msgBoxHl');
        if (data.status === 'WIN') {
            msgBox.innerHTML = `🎉 You Win! +${data.prize} 🪙`;
            msgBox.style.color = "#4ecca3";
        } else if (data.status === 'PUSH') {
            msgBox.innerText = "Push! Bet returned. 🪙";
            msgBox.style.color = "#8a8ab0";
        } else {
            msgBox.innerText = "Dealer wins this hand! ❌";
            msgBox.style.color = "#e94560";
        }

    } catch (err) {
        console.error("Holdem error:", err);
        document.getElementById('msgBoxHl').innerText = "Server error. Try again.";
        document.getElementById('msgBoxHl').style.color = "#e94560";
    } finally {
        isHlPlaying = false;
        document.getElementById('hlSpinBtn').disabled = false;
    }
}

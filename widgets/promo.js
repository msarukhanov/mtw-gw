document.getElementById('frontPromoForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const inputField = document.getElementById('frontPromoInput');
    const submitBtn = document.getElementById('frontPromoBtn');
    const messageBox = document.getElementById('frontPromoMessage');

    const codeValue = inputField.value.trim();

    // Блокируем интерфейс на время запроса
    submitBtn.disabled = true;
    inputField.disabled = true;
    messageBox.className = 'promo-message'; // Сбрасываем стили
    messageBox.style.display = 'none';

    try {
        const response = await fetch(`${baseUrlApi}/promo/activate`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                // Если у тебя используется JWT или сессии, не забудь передать токен авторизации:
                // 'Authorization': 'Bearer ' + localStorage.getItem('token')
            },
            body: JSON.stringify({ username: currentUser, partnerId: globalPartnerId, code: codeValue })
        });

        const data = await response.json();

        if (response.ok && data.success) {
            // Успешная активация
            messageBox.innerText = data.message;
            currentBalance = data.balance;
            messageBox.classList.add('success');
            inputField.value = ''; // Очищаем поле ввода

            // Если на фронтенде есть функция обновления баланса игрока в шапке,
            // вызови её здесь (например, updatePlayerBalance())
        } else {
            // Бэкенд вернул ошибку (код не найден, истек лимит и т.д.)
            messageBox.innerText = data.error || 'Promo activation error';
            messageBox.classList.add('error');
        }
    } catch (error) {
        // Ошибка сети или сервера
        console.error('Promo activation error:', error);
        messageBox.innerText = 'Ошибка соединения с сервером. Попробуйте позже.';
        messageBox.classList.add('error');
    } finally {
        // Разблокируем интерфейс обратно
        submitBtn.disabled = false;
        inputField.disabled = false;
    }
});
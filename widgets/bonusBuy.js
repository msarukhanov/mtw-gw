async function triggerBonusBuy() {
    const btn = document.getElementById('buyBonusBtn');

    if (!confirm('Are you sure you want to buy bonus за 100 🪙?')) {
        return;
    }

    // Блокируем кнопку на время анимации и запроса
    btn.disabled = true;

    try {
        const response = await fetch(`${baseUrlApi}/slots/buy-bonus`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                // 'Authorization': 'Bearer ' + localStorage.getItem('token') // если нужно
            },
            body: JSON.stringify({
                sessionId: globalSessionId, // Передаешь ID сессии для Seamless дебита
                partnerId: globalPartnerId
            })
        });

        const data = await response.json();

        if (response.ok && data.success) {
            // Бэкенд возвращает: data.results (массив символов) и data.prize (выигрыш)
            console.log('Результат бонусного раунда:', data.results);

            // 🎰 ТУТ ЗАПУСКАЕШЬ СВОЮ АНИМАЦИЮ СЛОТОВ
            // Передаешь в свой графический движок полученные символы data.results,
            // чтобы барабаны остановились именно на них.

            // Пример вызова твоей функции анимации:
            // startSpinAnimation(data.results, () => {
            //     alert(`🎉 МЕГА ВЫИГРЫШ: +${data.prize} 🪙`);
            //     if (typeof updatePlayerWallet === 'function') updatePlayerWallet();
            // });

        } else {
            alert(data.error || 'Ошибка при покупке бонуса');
        }
    } catch (error) {
        console.error('Bonus buy error:', error);
        alert('Ошибка сети при покупке бонуса.');
    } finally {
        // Разблокируем кнопку обратно после завершения раунда
        btn.disabled = false;
    }
}
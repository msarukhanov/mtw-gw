let currentTabLeaderboard = 'balance';

async function fetchAndRenderLeaderboard() {
    try {
        const response = await fetch(`${baseUrlApi}/leaderboard?type=${currentTabLeaderboard}&partnerId=${globalPartnerId}`);
        const data = await response.json();

        if (!data.success) return;

        // Меняем текст в шапке таблицы в зависимости от выбранной вкладки
        const headers = { balance: 'Balance', xp: 'XP (XP)', tournamentPoints: 'Points' };
        document.getElementById('lb-value-header').innerText = headers[currentTabLeaderboard];

        const tbody = document.getElementById('frontLeaderboardBody');

        // Если игроков в базе нет вообще
        if (data.leaderboard.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:#a0a5b5; padding:20px;">No records</td></tr>`;
            return;
        }

        // Рендерим строки таблицы
        tbody.innerHTML = data.leaderboard.map(p => {
            // Определяем, какое значение выводить в правый столбец
            let displayValue = '';
            if (currentTabLeaderboard === 'balance') displayValue = `${p.balance} 🪙`;
            if (currentTabLeaderboard === 'xp') displayValue = `${p.level * 1000} XP`; // или просто p.level
            if (currentTabLeaderboard === 'tournamentPoints') displayValue = `${p.tournamentPoints} PTS`;

            // Иконки для топ-3 мест
            let rankDisplay = p.rank;
            if (p.rank === 1) rankDisplay = '🥇';
            if (p.rank === 2) rankDisplay = '🥈';
            if (p.rank === 3) rankDisplay = '🥉';

            return `
                    <tr class="rank-${p.rank} lb-row-${p.rank <= 3 ? p.rank : 'other'}">
                        <td><span class="rank-badge">${rankDisplay}</span></td>
                        <td><b>${p.username}</b></td>
                        <td><span style="color:#a0a5b5;">Level ${p.level}</span></td>
                        <td style="text-align: right;" class="val-highlight">${displayValue}</td>
                    </tr>
                `;
        }).join('');

    } catch (error) {
        console.error('Leader load error:', error);
    }
}

// Переключение вкладок
function switchLeaderboardTab(type, button) {
    currentTabLeaderboard = type;

    // Переключаем активный класс у кнопок
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    button.classList.add('active');

    fetchAndRenderLeaderboard();
}

// Автоматический запуск при загрузке страницы фронтенда
document.addEventListener('DOMContentLoaded', fetchAndRenderLeaderboard);
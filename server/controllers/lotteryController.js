const state = require('../state');
const ROUND_DURATION = 5 * 60 * 1000; // 5 минут

function initLotteryService(io) {
    setInterval(() => {
        const now = Date.now();
        const msPassed = now % ROUND_DURATION;
        const timeToDraw = ROUND_DURATION - msPassed;

        // Рассылаем таймер и джекпот всем сокетам
        io.emit('timer_update', {
            timeLeft: timeToDraw,
            jackpot: state.getJackpot()
        });

        // Время вышло — запускаем тираж
        if (timeToDraw <= 1000) {
            runGlobalDraw(io);
        }
    }, 1000);
}

// Добавили async перед функцией
async function runGlobalDraw(io) {
    const winSet = new Set();
    while (winSet.size < 6) {
        winSet.add(state.getRandomInt(49) + 1);
    }
    const winningNumbers = Array.from(winSet).sort((a, b) => a - b);

    // ИСПРАВЛЕНИЕ: Добавили await, так как метод базы теперь асинхронный
    const activeGamers = await state.getGamersWithTickets();

    // Заменяем forEach на обычный цикл for...of, чтобы await внутри работал корректно
    for (const player of activeGamers) {
        let playerTotalWin = 0;
        let ticketsResults = [];

        player.tickets.forEach(ticket => {
            let matches = ticket.filter(num => winningNumbers.includes(num)).length;
            let prize = 0;
            if (matches === 2) prize = 15;
            if (matches === 3) prize = 50;
            if (matches === 4) prize = 200;
            if (matches === 5) prize = 1000;
            if (matches === 6) prize = 10000;

            playerTotalWin += prize;
            ticketsResults.push({ ticket, matches, prize });
        });

        const finalBalance = player.balance + playerTotalWin;

        // ИСПРАВЛЕНИЕ: Добавили await для сохранения баланса в NeDB
        await state.updateBalance(player.username, finalBalance);
        state.clearPlayerTickets(player.username);

        io.to(player.username).emit('lottery_result', {
            winningNumbers,
            ticketsResults,
            totalPrize: playerTotalWin,
            newBalance: finalBalance
        });
    }

    io.emit('global_draw_info', { winningNumbers });
}

module.exports = { initLotteryService };

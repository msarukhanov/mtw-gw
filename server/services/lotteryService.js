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
// async function runGlobalDraw(io) {
//     // Подтягиваем настройки лотереи
//     const config = state.getConfig().lottery;
//
//     const winSet = new Set();
//     // Генерируем нужное количество чисел (из конфига, например 6)
//     while (winSet.size < config.neededChoices) {
//         // Ограничиваем максимальный шар числом из конфига (например 49)
//         winSet.add(state.getRandomInt(config.totalNumbers) + 1);
//     }
//     const winningNumbers = Array.from(winSet).sort((a, b) => a - b);
//
//     // ИСПРАВЛЕНИЕ: Добавили await, так как метод базы теперь асинхронный
//     const activeGamers = await state.getGamersWithTickets();
//
//     // Заменяем forEach на обычный цикл for...of, чтобы await внутри работал корректно
//     for (const player of activeGamers) {
//         let playerTotalWin = 0;
//         let ticketsResults = [];
//
//         player.tickets.forEach(ticket => {
//             let matches = ticket.filter(num => winningNumbers.includes(num)).length;
//             let prize = 0;
//             if (matches === 2) prize = 15;
//             if (matches === 3) prize = 50;
//             if (matches === 4) prize = 200;
//             if (matches === 5) prize = 1000;
//             if (matches === 6) prize = 10000;
//
//             playerTotalWin += prize;
//             ticketsResults.push({ ticket, matches, prize });
//         });
//
//         const finalBalance = player.balance + playerTotalWin;
//
//         // ИСПРАВЛЕНИЕ: Добавили await для сохранения баланса в NeDB
//         await state.updateBalance(player.username, finalBalance);
//         await state.savePlayerActionHistory(player.username, {
//             game: "Lottery Draw",
//             details: `Drawn: [ ${winningNumbers.join(', ')} ]. Matched in ${player.tickets.length} tickets`,
//             change: playerTotalWin > 0 ? `+${playerTotalWin} 🪙` : `0 🪙`,
//             win: playerTotalWin > 0
//         });
//
//         state.clearPlayerTickets(player.username);
//
//         io.to(player.username).emit('lottery_result', {
//             winningNumbers,
//             ticketsResults,
//             totalPrize: playerTotalWin,
//             newBalance: finalBalance
//         });
//     }
//
//     const timeString = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
//     const drawHistoryRecord = {
//         time: timeString,
//         winNums: winningNumbers,
//         timestamp: Date.now()
//     };
//
//     // Сохраняем в постоянную базу истории NeDB через await
//     await state.saveDrawToHistory(drawHistoryRecord);
//
//     // Транслируем информацию всем, включая гостей
//     io.emit('global_draw_info', { winningNumbers, historyRecord: drawHistoryRecord });
// }

async function runGlobalDraw(io) {
    const config = state.getConfig().lottery;
    const TARGET_RTP = config.rtp / 100;; // Желаемый лимит отдачи (максимум 75% от собранных денег)

    // 1. Получаем список активных игроков с билетами
    const activeGamers = await state.getGamersWithTickets();

    // 2. Считаем экономику тиража: сколько всего билетов куплено и сколько заработано
    let totalTicketsCount = 0;
    activeGamers.forEach(p => totalTicketsCount += p.tickets.length);
    const totalIncome = totalTicketsCount * config.ticketPrice; // Общие сборы тиража

    let winningNumbers = [];
    let bestNumbers = [];
    let minOverpay = Infinity;
    let successDrawFound = false;

    // 3. СИСТЕМА КОНТРОЛЯ RTP: Ищем безопасную комбинацию чисел (макс. 500 попыток)
    for (let attempt = 0; attempt < 500; attempt++) {
        // Генерируем тестовый набор выигрышных чисел
        const winSet = new Set();
        while (winSet.size < config.neededChoices) {
            winSet.add(state.getRandomInt(config.totalNumbers) + 1);
        }
        const testWinningNumbers = Array.from(winSet).sort((a, b) => a - b);

        // Считаем, сколько игроки суммарно выиграют при этих числах
        let potentialTotalWin = 0;
        for (const player of activeGamers) {
            player.tickets.forEach(ticket => {
                let matches = ticket.filter(num => testWinningNumbers.includes(num)).length;
                if (matches === 2) potentialTotalWin += 15;
                if (matches === 3) potentialTotalWin += 50;
                if (matches === 4) potentialTotalWin += 200;
                if (matches === 5) potentialTotalWin += 1000;
                if (matches === 6) potentialTotalWin += 10000;
            });
        }

        // Вычисляем потенциальный RTP этой попытки
        const potentialRTP = totalIncome > 0 ? (potentialTotalWin / totalIncome) : 0;

        // Если сборов еще мало (например, играет 1-2 человека), просто страхуем банк от крупных выигрышей
        const isSafeForBank = totalIncome === 0 ? (potentialTotalWin <= 50) : (potentialRTP <= TARGET_RTP);

        if (isSafeForBank) {
            // Комбинация идеальна, она не разоряет сервер! Берем её
            winningNumbers = testWinningNumbers;
            successDrawFound = true;
            break;
        }

        // На случай, если все 500 попыток выдадут превышение лимита,
        // запоминаем комбинацию, которая нанесет наименьший урон кассе
        if (potentialTotalWin < minOverpay) {
            minOverpay = potentialTotalWin;
            bestNumbers = testWinningNumbers;
        }
    }

    // Если идеальный тираж не подобрался, берем наименее убыточный вариант из сохраненных
    if (!successDrawFound) {
        winningNumbers = bestNumbers.length > 0 ? bestNumbers : [1, 2, 3, 4, 5, 6];
    }

    // 4. НАЧИСЛЕНИЕ ВЫИГРЫШЕЙ (выполняется один раз для утвержденных winningNumbers)
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

        await state.updateBalance(player.username, finalBalance);
        await state.savePlayerActionHistory(player.username, {
            game: "Lottery Draw",
            details: `Drawn: [ ${winningNumbers.join(', ')} ]. Matched in ${player.tickets.length} tickets`,
            change: playerTotalWin > 0 ? `+${playerTotalWin} 🪙` : `0 🪙`,
            win: playerTotalWin > 0
        });

        state.clearPlayerTickets(player.username);

        io.to(player.username).emit('lottery_result', {
            winningNumbers,
            ticketsResults,
            totalPrize: playerTotalWin,
            newBalance: finalBalance
        });
    }

    // 5. СОХРАНЕНИЕ ИСТОРИИ ТИРАЖА
    const timeString = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const drawHistoryRecord = {
        time: timeString,
        winNums: winningNumbers,
        timestamp: Date.now()
    };

    await state.saveDrawToHistory(drawHistoryRecord);
    io.emit('global_draw_info', { winningNumbers, historyRecord: drawHistoryRecord });
}


module.exports = { initLotteryService };

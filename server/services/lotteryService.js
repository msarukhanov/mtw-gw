const state = require('../state');
const ROUND_DURATION = 5 * 60 * 1000; // 5 minutes

function initLotteryService(io) {
    const lotteryInterval = setInterval(() => {
        const now = Date.now();
        const msPassed = now % ROUND_DURATION;
        const timeToDraw = ROUND_DURATION - msPassed;

        // ИСПРАВЛЕНО: Рассылаем таймер и джекпот персонально в комнату каждого B2B-партнера
        const partnerIds = Object.keys(state.getConfig() || {});
        if (partnerIds.length === 0 || partnerIds.includes('lottery')) partnerIds.push('demo_mtwtech');

        for (const partnerId of partnerIds) {
            if (partnerId === 'lottery' || partnerId === 'slots' || partnerId === 'wheel' || partnerId === 'scratch' || partnerId === 'gamification') continue;

            io.to(partnerId+'_lottery').emit('timer_update', {
                timeLeft: timeToDraw,
                jackpot: state.getJackpot(partnerId) // Возвращаем джекпот конкретного бренда
            });
        }

        // Время вышло — запускаем тираж
        if (timeToDraw <= 1000) {
            if(state.BGS.crash) {
                runGlobalDraw(io, partnerIds);
            }
        }
        if(!state.BGS.crash) {
            clearInterval(lotteryInterval);
        }
    }, 1000);
}

async function runGlobalDraw(io, partnerIds) {
    // 1. Получаем список абсолютно всех активных игроков с билетами со всех сайтов
    const allActiveGamers = await state.getGamersWithTickets();

    // Группируем игроков по их partnerId: { site_A: [player1, player2], site_B: [...] }
    const gamersByPartner = {};
    allActiveGamers.forEach(gamer => {
        const pId = gamer.partnerId || 'demo_mtwtech';
        if (!gamersByPartner[pId]) gamersByPartner[pId] = [];
        gamersByPartner[pId].push(gamer);
    });

    // Запускаем независимый изолированный тираж для каждого партнера
    for (const partnerId of partnerIds) {
        if (partnerId === 'lottery' || partnerId === 'slots' || partnerId === 'wheel' || partnerId === 'scratch' || partnerId === 'gamification') continue;

        // Достаем настройки лотереи конкретного партнера
        const config = state.getConfig(partnerId).lottery || { ticketPrice: 1, totalNumbers: 49, neededChoices: 6, rtp: 75 };
        const TARGET_RTP = config.rtp / 100;

        const activeGamers = gamersByPartner[partnerId] || [];

        // 2. Считаем экономику тиража конкретного бренда
        let totalTicketsCount = 0;
        activeGamers.forEach(p => totalTicketsCount += p.tickets.length);
        const totalIncome = totalTicketsCount * config.ticketPrice;

        let winningNumbers = [];
        let bestNumbers = [];
        let minOverpay = Infinity;
        let successDrawFound = false;

        // 3. СИСТЕМА КОНТРОЛЯ RTP (Изолированная под пулы партнера)
        for (let attempt = 0; attempt < 500; attempt++) {
            const winSet = new Set();
            while (winSet.size < config.neededChoices) {
                winSet.add(state.getRandomInt(config.totalNumbers) + 1);
            }
            const testWinningNumbers = Array.from(winSet).sort((a, b) => a - b);

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

            const potentialRTP = totalIncome > 0 ? (potentialTotalWin / totalIncome) : 0;
            const isSafeForBank = totalIncome === 0 ? (potentialTotalWin <= 50) : (potentialRTP <= TARGET_RTP);

            if (isSafeForBank) {
                winningNumbers = testWinningNumbers;
                successDrawFound = true;
                break;
            }

            if (potentialTotalWin < minOverpay) {
                minOverpay = potentialTotalWin;
                bestNumbers = testWinningNumbers;
            }
        }

        if (!successDrawFound) {
            winningNumbers = bestNumbers.length > 0 ? bestNumbers : [1, 2, 3, 4, 5, 6];
        }

        // 4. НАЧИСЛЕНИЕ ВЫИГРЫШЕЙ (Для игроков этого конкретного бренда)
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

            // ИСПРАВЛЕНО: Все сохранения баланса и истории завязаны на пару player.username + partnerId
            await state.updateBalance(player.username, partnerId, finalBalance);
            await state.savePlayerActionHistory(player.username, partnerId, {
                game: "Lottery Draw",
                details: `Drawn: [ ${winningNumbers.join(', ')} ]. Matched in ${player.tickets.length} tickets`,
                change: playerTotalWin > 0 ? `+${playerTotalWin} 🪙` : `0 🪙`,
                win: playerTotalWin > 0
            });

            // Очищаем билеты в оперативной памяти бэкенда с учетом partnerId
            state.clearPlayerTickets(player.username, partnerId);

            // Таргетированная отправка результатов конкретному игроку
            io.to(player.username).emit('lottery_result', {
                winningNumbers,
                ticketsResults,
                totalPrize: playerTotalWin,
                newBalance: finalBalance
            });
        }

        // 5. СОХРАНЕНИЕ ИСТОРИИ ТИРАЖА ЭТОГО ОПЕРАТОРА
        const timeString = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const drawHistoryRecord = {
            partnerId: partnerId, // Фиксируем, чья это история тиража
            time: timeString,
            winNums: winningNumbers,
            timestamp: Date.now()
        };

        await state.saveDrawToHistory(drawHistoryRecord);

        // Транслируем информацию о выпавших числах строго в комнату текущего бренда
        io.to(partnerId+'_lottery').emit('global_draw_info', { winningNumbers, historyRecord: drawHistoryRecord });
    }
}

module.exports = { initLotteryService };

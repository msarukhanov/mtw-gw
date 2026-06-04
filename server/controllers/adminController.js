// const state = require('../state');
//
// // Отдача HTML-страницы админки
// exports.renderPanel = async (req, res) => {
//     const config = state.getConfig();
//     const jackpot = state.getJackpot();
//     const players = await state.getAllPlayers();
//
//     // Генерируем список игроков для HTML
//     const playersRows = players.map(p => `
//         <tr>
//             <td style="padding:8px; border:1px solid #ddd;">${p.username}</td>
//             <td style="padding:8px; border:1px solid #ddd;"><b>${p.balance} 🪙</b></td>
//             <td style="padding:8px; border:1px solid #ddd;">
//                 <form action="/admin/update-balance" method="POST" style="display:inline;">
//                     <input type="hidden" name="username" value="${p.username}">
//                     <input type="number" name="balance" value="${p.balance}" style="width:80px; padding:4px;">
//                     <button type="submit" style="background:#28a745; color:white; border:0; padding:4px 8px; cursor:pointer;">Изм.</button>
//                 </form>
//             </td>
//         </tr>
//     `).join('');
//
//     const html = `
//     <!DOCTYPE html>
//     <html lang="ru">
//     <head>
//         <meta charset="UTF-8">
//         <title>Управление Казино</title>
//     </head>
//     <body style="font-family:sans-serif; margin:30px; background:#f4f6f9; color:#333;">
//         <h1>🎛 Панель администратора</h1>
//         <hr style="margin-bottom:20px;">
//
//         <div style="display:flex; gap:20px;">
//             <!-- Настройки игр -->
//             <div style="flex:1; background:white; padding:20px; border-radius:8px; box-shadow:0 2px 4px rgba(0,0,0,0.1);">
//                 <h2>🎰 Настройки RTP и цен</h2>
//                 <form action="/admin/update-config" method="POST">
//                     <h3>Слоты (Slots)</h3>
//                     Цена спина: <input type="number" name="slots_cost" value="${config.slots.cost}" style="width:60px; padding:4px;"> |
//                     RTP %: <input type="number" name="slots_rtp" value="${config.slots.rtp}" style="width:60px; padding:4px;"><br><br>
//
//                     <h3>Колесо (Wheel)</h3>
//                     Цена спина: <input type="number" name="wheel_cost" value="${config.wheel.cost}" style="width:60px; padding:4px;"> |
//                     RTP %: <input type="number" name="wheel_rtp" value="${config.wheel.rtp}" style="width:60px; padding:4px;"><br><br>
//
//                     <h3>Скретч-карты (Scratch)</h3>
//                     Цена билета: <input type="number" name="scratch_cost" value="${config.scratch.cost}" style="width:60px; padding:4px;"> |
//                     RTP %: <input type="number" name="scratch_rtp" value="${config.scratch.rtp}" style="width:60px; padding:4px;"><br><br>
//
//                     <h3>Лотерея (Lottery)</h3>
//                     Цена билета: <input type="number" name="lottery_ticketPrice" value="${config.lottery.ticketPrice}" style="width:60px; padding:4px;"> |
//                     RTP %: <input type="number" name="lottery_rtp" value="${config.lottery.rtp}" style="width:60px; padding:4px;"><br><br>
//
//                     <button type="submit" style="background:#007bff; color:white; border:0; padding:10px 15px; border-radius:4px; cursor:pointer;">Сохранить конфиг</button>
//                 </form>
//             </div>
//
//             <!-- Джекпот -->
//             <div style="flex:1; background:white; padding:20px; border-radius:8px; box-shadow:0 2px 4px rgba(0,0,0,0.1);">
//                 <h2>💰 Глобальный Джекпот</h2>
//                 <p style="font-size:24px; color:#dc3545; margin:10px 0;">Текущий: <b>${jackpot} 🪙</b></p>
//                 <form action="/admin/update-jackpot" method="POST">
//                     Установить значение: <input type="number" name="jackpot" value="${jackpot}" style="width:100px; padding:4px;">
//                     <button type="submit" style="background:#dc3545; color:white; border:0; padding:5px 10px; cursor:pointer;">Изменить</button>
//                 </form>
//             </div>
//         </div>
//
//         <!-- Список игроков -->
//         <div style="margin-top:20px; background:white; padding:20px; border-radius:8px; box-shadow:0 2px 4px rgba(0,0,0,0.1);">
//             <h2>👥 Управление пользователями</h2>
//             <table style="width:100%; border-collapse:collapse; text-align:left;">
//                 <thead>
//                     <tr style="background:#eee;">
//                         <th style="padding:8px; border:1px solid #ddd;">Логин</th>
//                         <th style="padding:8px; border:1px solid #ddd;">Баланс</th>
//                         <th style="padding:8px; border:1px solid #ddd;">Действие</th>
//                     </tr>
//                 </thead>
//                 <tbody>
//                     ${playersRows}
//                 </tbody>
//             </table>
//         </div>
//     </body>
//     </html>
//     `;
//     res.send(html);
// };

const state = require('../state');

// 1. Отдаем все данные одним пакетом для фронтенда админки
exports.getAdminData = async (req, res) => {
    try {
        const config = state.getConfig();
        const jackpot = state.getJackpot();
        const players = await state.getAllPlayers();
        res.json({ config, jackpot, players });
    } catch (err) {
        res.status(500).json({ error: "Ошибка сбора данных" });
    }
};

// 2. Обработчик изменения конфига (RTP и Стоимость)
exports.updateConfig = (req, res) => {
    for (const key in req.body) {
        const [game, param] = key.split('_');
        if (game && param) {
            state.updateConfigParam(game, param, req.body[key]);
        }
    }
    res.json({ success: true });
};

// 3. Обработчик изменения джекпота
exports.updateJackpot = (req, res) => {
    if (req.body.jackpot !== undefined) {
        state.setJackpot(req.body.jackpot);
        res.json({ success: true });
    } else {
        res.status(400).json({ error: "Неверные данные" });
    }
};

// 4. Обработчик изменения баланса игрока
exports.updateBalance = async (req, res) => {
    const { username, balance } = req.body;
    if (username && balance !== undefined) {
        await state.updateBalance(username, Number(balance));
        res.json({ success: true });
    } else {
        res.status(400).json({ error: "Не указан пользователь или баланс" });
    }
};

// Обработчик завершения турнира и распределения призов
exports.endTournament = async (req, res) => {
    try {
        const winners = await state.endCurrentTournament();
        res.json({ success: true, winners });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Не удалось завершить турнир" });
    }
};







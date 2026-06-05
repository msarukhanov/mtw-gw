const state = require('../state');

exports.getTop = async (req, res) => {
    try {
        // Получаем тип топа из query-параметра (например: /api/leaderboard?type=xp)
        const type = req.query.type || 'balance';
        const leaderboard = await state.getLeaderboard(type, 10);

        res.json({ success: true, leaderboard });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Не удалось загрузить таблицу лидеров" });
    }
};

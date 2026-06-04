const state = require('../state');

exports.getTop = async (req, res) => {
    try {
        // ИСПРАВЛЕНО: Извлекаем partnerId, добавленный мидлваром checkPlayer из токена
        const partnerId = req.partnerId;

        // Получаем тип топа из query-параметра (например: /api/leaderboard?type=xp)
        const type = req.query.type || 'balance';

        // ИСПРАВЛЕНО: Передаем partnerId первым аргументом, чтобы собрать ТОП-10 строго внутри этого скина
        const leaderboard = await state.getLeaderboard(partnerId, type, 10);

        res.json({ success: true, leaderboard });
    } catch (err) {
        console.error(`[Partner Leaderboard Error]:`, err);
        res.status(500).json({ error: "Failed to load leaderboard database" });
    }
};

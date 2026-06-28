const { gamesConfigDB } = require('../db/configDB');
const gachaDB = require('../db/gachaDB'); // Наш файл со всеми SQL-функциями
const questsDB = require('../db/questsDB');


exports.summon = async function (req, res) {
    try {
        // Извлекаем чистые данные авторизации, подготовленные миддлвейром auth
        const { id: userId, serverId, gameId } = req.player;

        // Из тела запроса берем только параметры, относящиеся к самому призыву
        const { bannerId, count, wishlist } = req.body;

        if (!bannerId) {
            return res.status(400).json({ error: "Параметр bannerId обязателен" });
        }

        const activeCount = parseInt(count) || 1;
        const activeWishlist = wishlist || []; // Массив из hero_id, выбранных игроком

        // Вызываем нашу универсальную функцию из базы данных
        const result = await gachaDB.summonGacha(
            userId,
            serverId,
            gameId,
            bannerId,
            activeCount,
            activeWishlist
        );

        const questResult = await questsDB.incrementQuestTask(userId, serverId, gameId, 'gacha_summon', activeCount);

        // Если база вернула ошибку (не хватило алмазов, превышен лимит и т.д.)
        if (result.error) {
            return res.status(400).json({ error: result.message });
        }

        // Возвращаем фронтенду массив наград для анимации и обновленное состояние профиля
        return res.json(result);

    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: e.message, msg: '[Gacha:Summon] error' });
    }
};

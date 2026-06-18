// backend/controllers/itemsController.js
const { gamesConfigDB } = require('../db/configDB');
const { buyShopItem } = require('../db/playersDB');

exports.buyItem = async function (req, res) {
    try {
        // Добавляем shop_type (basic/vip) из тела запроса к твоему новому конфигу магазинов
        const { game_id, server_id, device_id, shop_type, shop_item_id } = req.body;

        const gameConfig = gamesConfigDB[game_id];
        const activeShopType = shop_type || 'basic'; // по умолчанию идем в обычный магазин

        // Передаем категорию магазина в playersDB для валидации и транзакции
        const result = buyShopItem(gameConfig, game_id, server_id, device_id, activeShopType, shop_item_id);

        if (result.error) {
            return res.status(400).json({ error: result.error });
        }

        res.json(result);
    }
    catch (e) {
        console.log(e);
        return res.status(400).json({ error: e.message, msg: '[Items:Buy] error' });
    }
};

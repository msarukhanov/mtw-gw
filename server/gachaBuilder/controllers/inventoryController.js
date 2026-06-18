// backend/controllers/inventoryController.js
const { gamesConfigDB } = require('../db/configDB');
const { equipItem } = require('../db/playersDB');

exports.equip = async function (req, res) {
    try {
        const { game_id, server_id, device_id, hero_instance_id, item_id } = req.body;
        const gameConfig = gamesConfigDB[game_id];

        // Инфраструктурный метод сам подхватит новую вложенность catalog.items
        const result = equipItem(gameConfig, game_id, server_id, device_id, hero_instance_id, item_id);

        if (result.error) {
            return res.status(400).json({ error: result.error });
        }

        res.json(result);
    }
    catch(e) {
        console.log(e);
        return res.status(400).json({ error: e.message, msg: '[Inventory:Equip] error' });
    }
};

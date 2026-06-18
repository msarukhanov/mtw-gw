// backend/db/playersDB.js
const axios = require('axios');

// const isDemo = process.env.env === 'demo';
const isDemo = true;
const demoUrl = (isDemo ? 'https://mtw-gw.onrender.com' : 'http://localhost:3000') + '/api/auth';

const playersDB = {};

// backend/db/playersDB.js

async function getOrCreatePlayer(username, password, gameId, deviceId) {
    if (!playersDB[gameId]) playersDB[gameId] = {};
    // if (!playersDB[gameId][deviceId]) playersDB[gameId][deviceId] = {};

    try {
        if (!playersDB[gameId][deviceId]) {

            const integration = {
                url: demoUrl,
                secret: 'demo_showcase_secure_token',
                body: {
                    // token: sessionId,
                    username,
                    password,
                    partnerId: 'demo_mtwtech',
                }
            };
            integration.url += '';

            const response = await axios.post(`${integration.url}`, integration.body);

            if (!response.data || !response.data.sessionId) {
                return {err: true}
            }

            delete response.data.jackpot;
            delete response.data.config;

            playersDB[gameId][deviceId] = response.data;

            return response.data;
        }
        return playersDB[gameId][deviceId];
    }
    catch (e) {
        console.error(e);
        return {
            error: true,
            e
        }
    }

}

async function logInServer(username, gameId, serverId, deviceId) {

    if (!playersDB[gameId]) playersDB[gameId] = {};
    // if (!playersDB[gameId][serverId]) playersDB[gameId][serverId] = {};

    const heroInstId = "h_inst_" + Math.random().toString(36).substr(2, 5);

    let player = playersDB[gameId][deviceId];
    if(!player) {
        await getOrCreatePlayer(username, '', gameId, deviceId);
    }
    player = playersDB[gameId][deviceId]

    playersDB[gameId][serverId] = {
        ...player,
        player_id: "p_" + Math.random().toString(36).substr(2, 5),
        server_id: serverId,

        // --- ТВОИ НОВЫЕ ПАРАМЕТРЫ ПРОФИЛЯ ---
        nickname: "NeoGod_" + Math.floor(100 + Math.random() * 900),
        // avatar_icon: "🧙‍♂️", // Emoji или путь к картинке
        avatar_icon: './assets/images/heroes/heroAvatars/eleniel.webp', // Emoji или путь к картинке
        level: 10,
        exp: 340,
        max_exp: 1000, // Порог опыта для следующего уровня
        vip_level: 3,
        created_at: Date.now(), // Фиксируем время входа для расчета онлайна

        resources: {
            gold: 10000,
            exp: 500,
            diamond: 2500,
            friendship: 150
        },
        inventory: {"scroll_epic": 5, "rusty_sword": 1},
        heroes: [
            {
                instance_id: heroInstId,
                hero_id: "eleniel",
                level: 120,
                stars: 5,
                exp: 0,
                equipped: {weapon: null}
            },
            {
                instance_id: "h_inst_" + Math.random().toString(36).substr(2, 5),
                hero_id: "adelina",
                level: 100,
                stars: 5,
                exp: 0,
                equipped: {weapon: null}
            },
            {
                instance_id: "h_inst_" + Math.random().toString(36).substr(2, 5),
                hero_id: "rafaelAfterlife",
                level: 100,
                stars: 5,
                exp: 0,
                equipped: {weapon: null}
            },
            {
                instance_id: "h_inst_" + Math.random().toString(36).substr(2, 5),
                hero_id: "marishka",
                level: 100,
                stars: 5,
                exp: 0,
                equipped: {weapon: null}
            },
            {
                instance_id: "h_inst_" + Math.random().toString(36).substr(2, 5),
                hero_id: "anjeihydra",
                level: 100,
                stars: 5,
                exp: 0,
                equipped: {weapon: null}
            },
        ],
        active_home_hero: heroInstId,

        games: [
            {
                instance_id: "h_inst_" + Math.random().toString(36).substr(2, 5),
                game_id: "slots53char",
                level: 10,
                stars: 1,
                exp: 0,
                equipped: {bonus: null}
            },
            {
                instance_id: "h_inst_" + Math.random().toString(36).substr(2, 5),
                game_id: "elvenCrash",
                level: 10,
                stars: 1,
                exp: 0,
                equipped: {bonus: null}
            },
            {
                instance_id: "h_inst_" + Math.random().toString(36).substr(2, 5),
                game_id: "elvenHoldem",
                level: 10,
                stars: 1,
                exp: 0,
                equipped: {bonus: null}
            },
            {
                instance_id: "h_inst_" + Math.random().toString(36).substr(2, 5),
                game_id: "narutoShinobi",
                level: 10,
                stars: 1,
                exp: 0,
                equipped: {bonus: null}
            },
        ],
        gacha_pity: {"banner_standard_01": 0},

        achievements: [
            {id: "first_summon", progress: 1, max: 1, is_claimed: true, unlocked_at: 1781347200000},
            {id: "god_level_100", progress: 1, max: 5, is_claimed: false, unlocked_at: null}
        ],

        transactions: [
            {
                tx_id: "tx_001",
                timestamp: 1781350800000,
                pack_id: "shop_staff_god",
                cost: 500,
                status: "success"
            },
            {tx_id: "tx_002", timestamp: 1781361600000, pack_id: "shop_scroll_1", cost: 50, status: "success"}
        ],

        match_history: [
            {
                match_id: "m_992",
                timestamp: 1781354400000,
                game_id: "elvenCrash",
                result: "win",
                reward: {resource: "gold", count: 1500}
            },
            {
                match_id: "m_993",
                timestamp: 1781358000000,
                game_id: "narutoShinobi",
                result: "lose",
                reward: {resource: "exp", count: 100}
            }
        ],

        social_binds: {
            "email": "neogod777@gmail.com",
            "discord": "neogod_player",
            "telegram": null // Пока не привязано
        }
    };

    if(player.realBalance) {
        playersDB[gameId][serverId].resources.gold = player.realBalance;
    }
    if(player.bonusBalance) {
        playersDB[gameId][serverId].resources.diamond = player.bonusBalance;
    }

    return playersDB[gameId][serverId];
}

// Покупка с поддержкой твоих новых раздельных категорий магазинов (basic / vip)
function buyShopItem(gameConfig, gameId, serverId, deviceId, shopType, shopItemId) {
    const player = playersDB[gameId]?.[serverId]?.[deviceId];

    // Ищем товар внутри конкретного магазина (например, shops.basic или shops.vip)
    const targetShop = gameConfig?.shops?.[shopType];
    const shopItem = targetShop?.catalog.find(i => i.id === shopItemId);

    if (!player || !shopItem) return { error: "Товар или магазин не найден" };

    // У тебя валюта списания в магазинах завязана на gems (cost_gems),
    // но в новой mechanics.resources у тебя VIP-деньги называются diamond.
    // Бэк автоматически смапит cost_gems на баланс player.resources.diamond для защиты экономики.
    const price = shopItem.cost_gems;
    if (player.resources.diamond < price) return { error: "Недостаточно бриллиантов (Diamond)!" };

    // Транзакция экономики
    player.resources.diamond -= price;
    player.inventory[shopItem.item_id] = (player.inventory[shopItem.item_id] || 0) + (shopItem.amount || 1);

    console.log(`[Экономика] Игрок ${player.player_id} купил ${shopItem.item_id} в категории [${shopType}]`);
    return { success: true, player_state: player };
}

// Экипировка снаряжения персонажа
function equipItem(gameConfig, gameId, serverId, deviceId, heroInstanceId, itemId) {
    const player = playersDB[gameId]?.[serverId]?.[deviceId];
    const hero = player?.heroes.find(h => h.instance_id === heroInstanceId);
    const itemMeta = gameConfig?.catalog?.items?.[itemId]; // Новый путь к каталогу айтемов

    if (!player || !hero || !itemMeta) return { error: "Сущность не найдена" };
    if (!player.inventory[itemId] || player.inventory[itemId] <= 0) return { error: "Предмета нет в рюкзаке" };

    const targetSlot = itemMeta.slot;

    // Снимаем старую вещь в рюкзак, если она была надета
    const oldItem = hero.equipped[targetSlot];
    if (oldItem) player.inventory[oldItem] = (player.inventory[oldItem] || 0) + 1;

    // Списываем и надеваем новую
    player.inventory[itemId]--;
    if (player.inventory[itemId] <= 0) delete player.inventory[itemId];

    hero.equipped[targetSlot] = itemId;
    return { success: true, player_state: player };
}

module.exports = {
    getOrCreatePlayer,
    logInServer,
    buyShopItem,
    equipItem,
    playersDB // Экспортируем ссылку на инстанс памяти
};

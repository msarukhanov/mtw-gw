const BASE_LANGUAGES = {
    "en": {},
    "fr": {},
    "de": {},
    "es": {},
    "ru": {},

    "kr": {},
    "jp": {},
    "ch": {},
};
const BASE_STATS = {
    "hp": {name_loc_key: "hp", value: 1},
    "armor": {name_loc_key: "armor", value: 1},
    "atk": {name_loc_key: "atk", value: 1},
    "crit": {name_loc_key: "crit", value: 1},
    "dodge": {name_loc_key: "dodge", value: 1},
    "speed": {name_loc_key: "dodge", value: 1}
};
const BASE_EFFECT_STATS = {
    "period": 0,
    "periodMax": 0,
    "is_dispelable": true,
    "icon": "",
    "stats": {},
    "action": {},
};
const BASE_INVENTORY_SLOTS = ["weapon", "armor", "boots", "ring"];

const HERO_PROTOTYPE = {
    title_loc: BASE_LANGUAGES, 
    rarity: "",
    max_level: 100,
    icon: "", image: "", model: "",
    faction_id: "", class_id: "", element_id: "",
    category_ids: [], skills: [], extra_skills: [],
    base_stats: BASE_STATS, stats_growth: BASE_STATS, effects: [],
    skins: [], bonds: [],
    inventory_slots: BASE_INVENTORY_SLOTS, personal_item_id: "", extra_inventory_slots: []
};

const gamesConfigDB = {

    "game_combat_stars": {
        orientation: "landscape",
        servers: [
            {id: "world_01", name: {...BASE_LANGUAGES, ru: "S1: Олимп", en: "S1: Olympus"}, status: "hot", text: {...BASE_LANGUAGES, ru: "Рекомендуемый мир", en:"Recommended"}}
        ],
        default_lang: "en",
        languages: ["en", "ru"],

        mechanics: {
            // 1. Твои оригинальные ресурсы
            resources: {
                "gold": {
                    icon: "🔮",
                    title_loc: { ...BASE_LANGUAGES, ru: "Золото", en: "Gold" },
                    desc_loc: { ...BASE_LANGUAGES, ru: "Основные деньги.", en: "Main money." }
                },
                "exp": {
                    icon: "🔮",
                    title_loc: { ...BASE_LANGUAGES, ru: "Опыт", en: "Exp" },
                    desc_loc: { ...BASE_LANGUAGES, ru: "Ресурс усиления героев.", en: "Hero level up resource." }
                },
                "diamond": {
                    icon: "🔮",
                    title_loc: { ...BASE_LANGUAGES, ru: "Алмазы", en: "Diamond" },
                    desc_loc: { ...BASE_LANGUAGES, ru: "ВИП деньги.", en: "VIP money." }
                },
                "friendship": {
                    icon: "🔮",
                    title_loc: { ...BASE_LANGUAGES, ru: "Дружба", en: "Friendship" },
                    desc_loc: { ...BASE_LANGUAGES, ru: "Жетоны дружбы.", en: "Friendship badges." }
                },
            },

            // 2. Твои оригинальные характеристики с весами для формулы расчета Боевого Рейтинга (БР)
            stats: {
                "hp": { ...BASE_STATS.hp, order: 1, icon: "❤️", display: "int", rating_weight: 0.1 },
                "armor": { ...BASE_STATS.armor, order: 2, icon: "🛡️", display: "int", rating_weight: 1.5 },
                "atk": { ...BASE_STATS.atk, order: 3, icon: "⚔️", display: "int", rating_weight: 2.0 },
                "crit": { ...BASE_STATS.crit, order: 4, icon: "🎯", display: "percent", rating_weight: 5.0 },
                "dodge": { ...BASE_STATS.dodge, order: 5, icon: "💨", display: "percent", rating_weight: 4.0 }
            },

            // 3. Твои оригинальные боевые эффекты
            effects: {
                "eff_stat_boost_percent": { ...BASE_EFFECT_STATS, polarity: "buff", type: "stat_mod", desc_loc_key: "eff_stat_boost" },
                "eff_chain_lightning": { ...BASE_EFFECT_STATS, polarity: "buff", type: "trigger", desc_loc_key: "eff_lightning" },
                "eff_damage_reduction": { ...BASE_EFFECT_STATS, polarity: "buff", type: "stat_mod", desc_loc_key: "eff_shield" }
            },

            // 4. Твои градации редкостей для списков, сортировок и фильтров
            rarities: {
                hero: ["R", "SR", "SSR", "UR"],
                items: ["R", "SR", "SSR"],
            },

            item_types: {
                "all": {
                    icon: "💰",
                    title_loc: { ru: "Все", en: "All" }
                },
                "equipment": {
                    icon: "⚔️",
                    title_loc: { ru: "Снаряжение", en: "Equip" }
                },
                "consumable": {
                    icon: "🧪",
                    title_loc: { ru: "Расходники", en: "Items" }
                },
                "material": {
                    icon: "🧩",
                    title_loc: { ru: "Материалы", en: "Mat" }
                },
                // --- Добавленные категории ---
                "shard": {
                    icon: "💎",
                    title_loc: { ru: "Осколки", en: "Shards" }
                },
                "currency": {
                    icon: "🪙",
                    title_loc: { ru: "Валюта", en: "Currency" }
                }
            },

            // 5. Твои оригинальные слоты экипировки богов
            inventory_slots: BASE_INVENTORY_SLOTS,

            // 6. Твои прототипы сущностей и логика командных синергий/бонусов фракций
            prototypes: {
                "hero": HERO_PROTOTYPE,
                "team": {
                    size: 5,
                    position: [1,2,2],
                    bonuses: {
                        faction: {
                            "3": { "hp": "5%", "atk": "5%" },
                            "4": { "hp": "10%", "atk": "10%" },
                            "5": { "hp": "15%", "atk": "15%" },
                        }
                    },
                    additional: {
                        beasts: 3,
                    },
                }
            },

            level_costs: {
                "1": { gold: 1, exp: 5 },
                "2": { gold: 2, exp: 1 },
                "3": { gold: 4, exp: 2 },
                "10": { gold: 10, exp: 5 },
                "100": { gold: 150, exp: 8 },
                "119": { gold: 250, exp: 12 }
            },

            // Минимальный уровень героя, нужный для пробуждения уникального предмета (personal)
            personal_item_unlock_level: 100,

            // Стоимость улучшения уникального предмета по уровням (для функции upgradePersonalItem)
            personal_item_costs: {
                "1": { materials: { "core_holy_empire": 5, "gold": 5000 } },
                "2": { materials: { "core_holy_empire": 10, "gold": 12000 } },
                "3": { materials: { "core_holy_empire": 20, "gold": 30000 } }
            },

            // Стоимость улучшения уровня питомцев (для функции manageHeroPet)
            pet_level_costs: {
                "1": { food: 10 },
                "2": { food: 25 },
                "3": { food: 60 },
                "10": { food: 200 }
            },

            // Общие/Дефолтные рецепты возвышения звезд (если у бога нет персонального star_recipes)
            general_star_recipes: {
                "2": { resources: { gold: 5000 }, shards: {}, fodder_count: 0 },
                "5": { resources: { gold: 25000 }, shards: {}, fodder_count: 0 },
                "6": {
                    resources: { gold: 50000, diamond: 500 },
                    shards: {},
                    fodder_count: 1,
                    fodder_requirements: { same_hero: false, faction: true }
                }
            },

            idle: {
                main_loot_claim_at: {
                    rate: {
                        gold: 10,
                        exp: 10,
                    },
                    maxHours: 12,
                }
            },

            combat_formulas: {
                // Строковые формулы, которые парсит бэкенд. Доступные переменные: ATK, DEF (или ARMOR)
                damage_formula: "ATK * (100 / (100 + ARMOR))",
                crit_chance_formula: "ATTACKER_CRIT - DEFENDER_DODGE", // пример кастомной логики
                crit_multiplier: "2.0"
            }
        },

        ui: {
            windows_settings: {
                content_top: "5px",
                content_bottom: "5px",
                content_left: "5px",
                content_width: "calc(100% - 10px)"
            },
            landscape: [
                {
                    id: "screen_game_login",
                    bg_image: "./gacha/assets/images/server_select_bg.png",
                    scrollable: false,
                    // Конфиг поддерживаемых соцсетей для формы авторизации
                    auth_providers: ["google", "discord", "telegram"]
                },
                {
                    id: "screen_server_select",
                    bg_image: "./gacha/assets/images/server_select_bg.png",
                    scrollable: false,
                    bg_width: 1000,
                    active_width: 1000,
                },
                {
                    id: "screen_main_menu",
                    bg_image: "./gacha/assets/images/main_menu_bg_4.png",
                    bg_width: 1200,
                    scrollable: false,
                    active_width: 1000,
                    home_hero_layout: {
                        top: "20%",
                        left: "15%",
                        height: "100%",
                        zIndex: 3,
                        animation: "idle_pulse"
                    }
                },
                {
                    id: "player_bar",
                    type: "text_panel",
                    action: "open_profile",
                    layout: {
                        top: "35px",
                        left: "15% + 5px",
                        width: "30%",
                        height: "60px",
                        backgroundColor: "#222"
                    }
                },
                {
                    id: "resource_bar",
                    type: "text_panel",
                    layout: {
                        top: "25px",
                        right: "105px",
                        width: "200px",
                        height: "40px",

                        backgroundColor: "#222",

                        textColor: "#ffeb3b",
                        textSize: "20px",
                        textPosition: "bottom"
                    }
                },
                {
                    id: "btn_back",
                    type: "button",
                    label_loc_key: "btn_back_label",
                    action: "go_back",
                    onlyInWindows: true,
                    layout: {
                        top: "22px",
                        left: "22px",
                        width: "40px",
                        height: "40px",
                        backgroundColor: "#0a0a0a",
                        textColor: "#FFF",
                        textSize: "30px",
                    }
                },
                {
                    id: "btn_idle",
                    type: "button",
                    label_loc_key: "btn_back_label",
                    action: "go_back",
                    onlyInWindows: true,
                    layout: {
                        top: "90% - 5px",
                        right: "5% + 5px",
                        width: "9%",
                        height: "20%",

                        backgroundColor: "#221042",
                        // backgroundImage: "url('./gacha/assets/images/main_casino.png')",

                        textColor: "#fff",
                        textSize: "30px",
                        textPosition: "bottom"
                    }
                },
                {
                    id: "btn_heroes",
                    type: "button",
                    label_loc_key: "btn_heroes_label",
                    action: "open_heroes",
                    layout: {
                        top: "25%",
                        right: "31% + 5px",
                        width: "20%",
                        height: "16%",



                        backgroundColor: "rgba(55,55,55,.6)",
                        // backgroundImage: "url('./gacha/assets/images/main_heroes.png')",

                        textColor: "#fff",
                        textSize: "20px",
                        textPosition: "bottom"
                    }
                },
                {
                    id: "btn_games",
                    type: "button",
                    label_loc_key: "btn_games_label",
                    action: "open_games",
                    layout: {
                        top: "90% - 5px",
                        right: "10% + 5px",
                        width: "20%",
                        height: "20%",

                        backgroundColor: "rgba(195,55,55,.6)",
                        // backgroundImage: "url('./gacha/assets/images/main_casino.png')",

                        textColor: "#fff",
                        textSize: "20px",
                        textPosition: "bottom"
                    }
                },
                {
                    id: "btn_inventory",
                    type: "button",
                    label_loc_key: "btn_inventory_label",
                    action: "open_inventory",
                    layout: {
                        top: "43%",
                        right: "7% + 5px",
                        width: "14%",
                        height: "16%",

                        backgroundColor: "rgba(55,155,55,.6)",
                        // backgroundImage: "url('./gacha/assets/images/main_inventory.png')",

                        textColor: "#fff",
                        textSize: "20px",
                        textPosition: "bottom"
                    }
                },
                {
                    id: "btn_shop",
                    type: "button",
                    label_loc_key: "btn_shop_label",
                    action: "open_shop",
                    layout: {
                        top: "43%",
                        right: "21% + 5px",
                        width: "12%",
                        height: "16%",

                        backgroundColor: "rgba(155,155,55,.6)",
                        // backgroundImage: "url('./gacha/assets/images/main_shop.png')",

                        textColor: "#fff",
                        textSize: "20px",
                        textPosition: "bottom"

                    }
                },
                {
                    id: "btn_gacha",
                    type: "button",
                    label_loc_key: "btn_gacha_label",
                    action: "open_gacha",
                    layout: {
                        top: "25%",
                        right: "10% + 5px",
                        width: "20%",
                        height: "16%",

                        backgroundColor: "rgba(0,55,255,.6)",
                        // backgroundImage: "url('./gacha/assets/images/main_gacha.png')",

                        textColor: "#fff",
                        textSize: "20px",
                        textPosition: "bottom"
                    }
                },
                {
                    id: "btn_temple_power",
                    type: "button",
                    label_loc_key: "btn_temple_power_label",
                    // action: "open_temple_power",
                    action: "open_leaderboard",
                    layout: {
                        top: "61%",
                        right: "42% + 5px",
                        width: "16%",
                        height: "16%",

                        backgroundColor: "rgba(0,0,55,.6)",
                        // backgroundImage: "url('./gacha/assets/images/main_temple_power.png')",

                        textColor: "#fff",
                        textSize: "20px",
                        textPosition: "bottom"
                    }
                },

                {
                    id: "btn_arena",
                    type: "button",
                    label_loc_key: "btn_arena_label",
                    action: "open_arena",
                    layout: {
                        top: "43%",
                        right: "34% + 5px",
                        width: "12%",
                        height: "16%",

                        backgroundColor: "rgba(55,0,55,.6)",
                        // backgroundImage: "url('./gacha/assets/images/main_arena.png')",

                        textColor: "#fff",
                        textSize: "20px",
                        textPosition: "bottom"
                    }
                },
                // {
                //     id: "btn_pvp",
                //     type: "button",
                //     label_loc_key: "btn_pvp_label",
                //     action: "open_pvp_arena",
                //     layout: {
                //         top: "43%",
                //         right: "34% + 5px",
                //         width: "12%",
                //         height: "16%",
                //
                //         backgroundColor: "rgba(55,0,55,.6)",
                //         // backgroundImage: "url('./gacha/assets/images/main_arena.png')",
                //
                //         textColor: "#fff",
                //         textSize: "20px",
                //         textPosition: "bottom"
                //     }
                // },
                // {
                //     id: "btn_bets",
                //     type: "button",
                //     label_loc_key: "btn_bets_label",
                //     action: "open_bets",
                //     layout: {
                //         top: "78%",
                //         right: "34% + 5px",
                //         width: "12%",
                //         height: "16%",
                //
                //         backgroundColor: "rgba(55,0,55,.6)",
                //         // backgroundImage: "url('./gacha/assets/images/main_arena.png')",
                //
                //         textColor: "#fff",
                //         textSize: "20px",
                //         textPosition: "bottom"
                //     }
                // },

                {
                    id: "btn_boss",
                    type: "button",
                    label_loc_key: "btn_pve_boss_label",
                    action: "open_pve_boss_list",
                    layout: {
                        top: "43%",
                        right: "47% + 5px",
                        width: "12%",
                        height: "16%",

                        backgroundColor: "rgba(105,0,105,.6)",
                        // backgroundImage: "url('./gacha/assets/images/main_arena.png')",

                        textColor: "#fff",
                        textSize: "20px",
                        textPosition: "bottom"
                    }
                },

                {
                    id: "btn_pve_campaign",
                    type: "button",
                    label_loc_key: "btn_pve_campaign_label",
                    action: "open_pve_campaign",
                    layout: {
                        top: "61%",
                        right: "8% + 5px",
                        width: "16%",
                        height: "16%",

                        backgroundColor: "rgba(55,0,155,.6)",
                        // backgroundImage: "url('./gacha/assets/images/main_arena.png')",

                        textColor: "#fff",
                        textSize: "20px",
                        textPosition: "bottom"
                    }
                },
                {
                    id: "btn_pve_tower",
                    type: "button",
                    label_loc_key: "btn_pve_tower_label",
                    action: "open_pve_tower",
                    layout: {
                        top: "61%",
                        right: "25% + 5px",
                        width: "16%",
                        height: "16%",

                        backgroundColor: "rgba(255,140,155,.6)",
                        // backgroundImage: "url('./gacha/assets/images/main_arena.png')",

                        textColor: "#fff",
                        textSize: "20px",
                        textPosition: "bottom"
                    }
                },

                {
                    id: "screen_heroes",
                    bg_image: "",
                    bg_width: 1000,
                    active_width: 1000,
                    list_settings: {
                        display_mode: "grid",
                        gap: "2%",
                        card_layout: {
                            height: "100%",
                            aspectRatio: "9 / 16",
                            backgroundColor: "#1e1e1e",
                            borderRadius: "8px"
                        }
                    }
                },
                {
                    id: "screen_hero_view",
                    bg_image: "./gacha/assets/images/screen_hero.png",
                    bg_width: 1000,
                    active_width: 1000,
                    // Вот правильное место для Data-Driven структуры блоков интерфейса!
                    view_layout: ['menu', 'avatar', 'content'],
                    menu_tabs: ['stats','inventory','stars','bonds','bio']
                },
                {
                    id: "screen_hero",
                    bg_image: "./gacha/assets/images/screen_hero.png",
                    bg_width: 1000,
                    active_width: 1000,

                    // list_settings: {
                    //     display_mode: "grid",
                    //     gap: "2%",
                    //     card_layout: {
                    //         height: "100%",
                    //         aspectRatio: "9 / 16",
                    //         backgroundColor: "#1e1e1e",
                    //         borderRadius: "8px"
                    //     }
                    // }
                },
                {
                    id: "screen_leaderboard",
                    bg_image: "./gacha/assets/images/leaderboard_bg.jpg",
                    bg_width: 1000,
                    active_width: 1000,
                    list_settings: {
                        grid_columns: 1,
                        gap: "8px",
                        padding: "15px",
                        header_height: "40px",
                        header_background: "#121212",
                        sidebar_width: "220px",       // Левая колонка: вкладки переключения (Сила / Уровень)
                        center_area_width: "520px",   // Центральная колонка: Сама скролл-таблица ТОП-100 игроков
                        details_panel_width: "260px"  // Правая колонка: Профиль текущего игрока, его аватар и точное место
                    }
                },

                {
                    id: "screen_gacha",
                    bg_image: "./gacha/assets/images/summon_altar_bg.png",
                    bg_width: 1000,
                    active_width: 1000,
                    list_settings: {
                        grid_columns: 1, // Список баннеров идет в один ряд/колонку слева
                        gap: "12px",
                        padding: "15px",
                        header_height: "40px",
                        header_background: "#121212",
                        sidebar_width: "240px",      // Левая колонка: список доступных баннеров
                        center_area_width: "480px",   // Центральная колонка: Визуал Врат/Алтаря
                        details_panel_width: "280px"  // Правая колонка: Кнопки призыва, Вишлист, Пити-счетчики
                    }
                },
                {
                    id: "screen_games",
                    bg_image: "",
                    bg_width: 1000,
                    active_width: 1000,
                    list_settings: {
                        display_mode: "grid",
                        gap: "2%",
                        card_layout: {
                            height: "100%",
                            aspectRatio: "9 / 16",
                            backgroundColor: "#1e1e1e",
                            borderRadius: "8px"
                        }
                    }
                },
                {
                    id: "screen_game",
                    companion_stream: {
                        enabled: true,         // true — включить персонажа рядом с iframe, false — чистый фуллскрин iframe
                        position: "left",      // left / right — с какой стороны от игры стоит персонаж
                        width: "25%",          // Какую долю экрана занимает персонаж (остальное уходит под iframe)
                        bubble_color: "rgba(20, 20, 20, 0.95)",
                        bubble_text_color: "#fff",
                        // Дефолтный пак фраз (пока нет вебсокетов), который движок будет крутить рандомно
                        phrases_loc_keys: ["companion_game_start", "companion_game_cheer", "companion_game_idle"]
                    }
                },
                {
                    id: "screen_shop",
                    bg_image: "",
                    bg_width: 1000,
                    active_width: 1000,
                    list_settings: {
                        display_mode: "grid",
                        grid_columns: 4,
                        grid_row_height: "155px",
                        gap: "2%",
                        padding: "12px",
                        // --- НОВЫЕ НАСТРОЙКИ ХЕДЕРА ПРАВОЙ ЧАСТИ ---
                        header_height: "40px",
                        header_background: "#1a1a1a",
                        // ------------------------------------------
                        card_layout: {
                            height: "100%",
                            aspectRatio: "9 / 16",
                            backgroundColor: "#1e1e1e",
                            borderRadius: "8px",
                            title_font_size: "12px",
                            price_font_size: "12px",
                            sold_out_color: "#ff3333",
                            sold_out_bg: "#333333",
                            accent_color: "#ffcc00"
                        }
                    }
                },
                {
                    id: "screen_profile",
                    bg_image: "./gacha/assets/images/profile_bg.png", // Фон окна профиля
                    bg_width: 1000,
                    active_width: 1000,

                    // Настраиваемый порядок и состав вкладок профиля (Пункт 5 твоего ТЗ)
                    profile_layout: {
                        // Задаем порядок табов. B2B-клиент может менять их местами, удалять или добавлять свои
                        tabs_order: ["main", "achievements", "transactions", "match_history", "promo", "social_bind"],

                        // Спецификация полей для таблицы истории транзакций (Пункт 3 твоего ТЗ)
                        transaction_fields: [
                            // { id: "timestamp", label_loc_key: "tx_date", type: "date" },
                            // { id: "pack_id", label_loc_key: "tx_product", type: "loc_string" },
                            // { id: "cost", label_loc_key: "tx_cost", type: "number" },
                            // { id: "status", label_loc_key: "tx_status", type: "string" },

                            { id: "timestamp", label_loc_key: "match_date", type: "date" },
                            { id: "amount", label_loc_key: "match_reward", type: "resource" },
                            { id: "type", label_loc_key: "match_game", type: "loc_string" },
                            { id: "description", label_loc_key: "match_game", type: "loc_string" },
                        ],

                        // Спецификация полей для таблицы истории игр/боев (Пункт 4 твоего ТЗ)
                        match_history_fields: [
                            // { id: "timestamp", label_loc_key: "match_date", type: "date" },
                            // { id: "game_id", label_loc_key: "match_game", type: "loc_string" },
                            // { id: "result", label_loc_key: "match_result", type: "badge" }, // Win / Lose с подсветкой
                            // { id: "reward", label_loc_key: "match_reward", type: "resource" },

                            { id: "timestamp", label_loc_key: "match_date", type: "date" },
                            { id: "game_id", label_loc_key: "match_game", type: "loc_string" },
                            { id: "stake", label_loc_key: "match_reward", type: "resource" },
                            { id: "prize", label_loc_key: "match_reward", type: "resource" },
                            { id: "status", label_loc_key: "match_result", type: "badge" }, // Win / Lose с подсветкой

                        ]
                    }
                },
                {
                    id: "screen_arena",
                    bg_image: "./gacha/assets/images/arena/arena_bg.jpg", // Фон самого экрана арены
                    bg_width: 1000,
                    active_width: 1000,
                    // Настраиваемые интерактивные кнопки режимов Арены (прямо как в главном меню)
                    widgets: [
                        // {
                        //     id: "btn_arena",
                        //     type: "button",
                        //     label_loc_key: "btn_arena_label",
                        //     action: "open_pvp_arena",
                        //     layout: {
                        //         top: "43%",
                        //         right: "34% + 5px",
                        //         width: "12%",
                        //         height: "16%",
                        //
                        //         backgroundColor: "rgba(55,0,55,.6)",
                        //         // backgroundImage: "url('./gacha/assets/images/main_arena.png')",
                        //
                        //         textColor: "#fff",
                        //         textSize: "20px",
                        //         textPosition: "bottom"
                        //     }
                        // },
                        // {
                        //     id: "btn_bets",
                        //     type: "button",
                        //     label_loc_key: "btn_bets_label",
                        //     action: "open_bets",
                        //     layout: {
                        //         top: "78%",
                        //         right: "34% + 5px",
                        //         width: "12%",
                        //         height: "16%",
                        //
                        //         backgroundColor: "rgba(55,0,55,.6)",
                        //         // backgroundImage: "url('./gacha/assets/images/main_arena.png')",
                        //
                        //         textColor: "#fff",
                        //         textSize: "20px",
                        //         textPosition: "bottom"
                        //     }
                        // },


                        {
                            id: "btn_arena",
                            type: "button",
                            label_loc_key: "btn_arena_label",
                            action: "open_pvp_arena",
                            layout: {
                                top: "50%",
                                left: "25%",
                                width: "35%",
                                height: "50%",
                                backgroundColor: "transparent",
                                backgroundImage: "url('./gacha/assets/images/arena/PREMATCH.png')",
                                textColor: "#fff",
                                textSize: "24px",
                                textPosition: "bottom"
                            }
                        },
                        {
                            id: "btn_bets",
                            type: "button",
                            label_loc_key: "btn_bets_label",
                            action: "open_bets",
                            layout: {
                                top: "50%",
                                left: "75%",
                                width: "35%",
                                height: "50%",
                                backgroundColor: "transparent",
                                backgroundImage: "url('./gacha/assets/images/arena/LIVE.png')",
                                // textColor: "#ffcc00",
                                textColor: "#fff",
                                textSize: "24px",
                                textPosition: "bottom"
                            }
                        }
                    ],

                    arena_widgets: [
                        // {
                        //     id: "PREMATCH",
                        //     label_loc_key: "arena_standard_title",
                        //     arena_type_id: "PREMATCH", // Ссылка на правила из каталога
                        //     layout: {
                        //         top: "50%",
                        //         left: "25%",
                        //         width: "35%",
                        //         height: "50%",
                        //         backgroundColor: "transparent",
                        //         backgroundImage: "url('./gacha/assets/images/arena/PREMATCH.png')",
                        //         textColor: "#fff",
                        //         textSize: "18px",
                        //         textPosition: "bottom"
                        //     }
                        // },
                        // {
                        //     id: "LIVE",
                        //     label_loc_key: "arena_event_title",
                        //     arena_type_id: "LIVE",
                        //     layout: {
                        //         top: "50%",
                        //         left: "75%",
                        //         width: "35%",
                        //         height: "50%",
                        //         backgroundColor: "transparent",
                        //         backgroundImage: "url('./gacha/assets/images/arena/LIVE.png')",
                        //         textColor: "#ffcc00",
                        //         textSize: "18px",
                        //         textPosition: "bottom"
                        //     }
                        // }
                    ]
                },

                {
                    id: "screen_inventory",
                    bg_image: "./gacha/assets/images/screen_inventory.png",
                    bg_width: 1000,
                    active_width: 1000,
                    list_settings: {
                        grid_columns: 5,
                        grid_row_height: "70px",
                        gap: "8px",
                        padding: "10px",
                        header_height: "40px",
                        header_background: "#1a1a1a",
                        sidebar_width: "110px",
                        details_panel_width: "260px" // Ширина 3-й колонки под описание и кнопки
                    }
                },
                {
                    id: "screen_craft",
                    bg_image: "",
                    bg_width: 1000,
                    active_width: 1000,
                    list_settings: {
                        grid_columns: 4,
                        grid_row_height: "80px",
                        gap: "10px",
                        padding: "12px",
                        header_height: "40px",
                        header_background: "#1a1a1a",
                        sidebar_width: "110px",
                        details_panel_width: "280px" // Правая панель под ингредиенты и кнопку молота
                    }
                },

                // =========================================================================
                // ЭКРАН КЛАССИЧЕСКОЙ PvE КАМПАНИИ
                // =========================================================================
                {
                    id: "screen_pvp_arena",
                    bg_image: "./gacha/assets/images/arena/arena_bg.jpg", // Фон самого экрана арены
                    bg_width: 1000,
                    active_width: 1000,
                },
                {
                    id: "screen_pve_boss_list",
                    bg_image: "./gacha/assets/images/arena/arena_bg.jpg", // Фон самого экрана арены
                    bg_width: 1000,
                    active_width: 1000,
                },
                {
                    id: "screen_pve_campaign",
                    bg_image: "./gacha/assets/images/pve/campaign_bg_1.png",
                    scrollable: true, // Карта кампании может скроллиться вбок или вниз
                    active_width: 1000, // Растянутая ширина под скролл
                    fullscreen: true,

                    nodes_layout: {
                        display_mode: "absolute_nodes",
                        node_width: "70px",
                        node_height: "70px",

                        // Кастомизация состояний нод этапов (Пункт 1 твоего запроса)
                        styles: {
                            unlocked: {
                                backgroundColor: "#ffcc00",
                                border: "3px solid #fff",
                                borderRadius: "50%",
                                boxShadow: "0 0 15px #ffcc00",
                                textColor: "#000",
                                // icon_image: "./gacha/assets/images/ui/node_active.png" // Возможность добавить картинку
                            },
                            locked: {
                                backgroundColor: "#222222",
                                border: "2px solid #555",
                                borderRadius: "50%",
                                boxShadow: "none",
                                textColor: "#666",
                                // icon_image: "./gacha/assets/images/ui/node_locked.png"
                            }
                        },
                        active_animation: "pulse_gold_glow" // ID CSS анимации из паспорта ниже
                    },

                    // Виджет быстрого отображения и сбора айдл-наград прямо с экрана кампании
                    idle_bar_widget: {
                        id: "campaign_idle_chest",
                        action: "open_idle_rewards_popup",
                        layout: {
                            bottom: "20px",
                            left: "20px",
                            width: "80px",
                            height: "80px",
                            backgroundImage: "url('./gacha/assets/images/pve/idle_chest_full.png')"
                        }
                    }
                },
                {
                    id: "screen_pve_tower",
                    bg_image: "./gacha/assets/images/pve/tower_inside_bg.jpg",
                    scrollable: true,
                    fullscreen: true,
                    orientation: "portrait_allowed", // Башни часто удобно скроллить вертикально

                    list_settings: {
                        display_mode: "vertical_stack", // Этажи идут друг над другом (снизу вверх)
                        gap: "10px",
                        card_layout: {
                            width: "50%",
                            height: "80px",
                            margin: "0 auto",
                            backgroundColor: "rgba(30, 20, 40, 0.8)",
                            border: "1px solid #4a3b5c",
                            borderRadius: "4px"
                        }
                    }
                },
                {
                    id: "screen_pre_battle",
                    bg_image: "./gacha/assets/images/pve/pre_battle_blur.jpg",
                    scrollable: false,
                    fullscreen: true,

                    // Спецификация блоков интерфейса подготовки к бою
                    view_layout: ['top_stage_info', 'player_team_slots', 'enemy_team_slots', 'bottom_actions'],

                    // Сетка расстановки отряда 3x3 на фронтенде (берется из prototypes.team.position)
                    grid_settings: {
                        width: "40%",
                        height: "60%",
                        slot_background: "rgba(255,255,255,0.05)",
                        slot_border: "1px dashed #555"
                    },

                    btn_start_battle: {
                        id: "btn_start_combat_execute",
                        type: "button",
                        label_loc_key: "btn_start_battle_label",
                        action: "send_pve_battle_request", // Триггерит POST запрос на бэкенд
                        layout: {
                            bottom: "5vh",
                            right: "5%",
                            width: "18%",
                            height: "50px",
                            backgroundColor: "#8bc34a", // Зеленая кнопка "В Бой"
                            textColor: "#FFF"
                        }
                    }
                },
                {
                    id: "screen_combat_arena",
                    bg_image: "./gacha/assets/images/pve/battleground_1.jpg",
                    scrollable: false,
                    fullscreen: true,
                    // Конфигурация слоёв рендеринга для фронтенд-клиента
                    render_layers: {
                        background: { zIndex: 1 },
                        vfx_bottom: { zIndex: 2 },  // Эффекты под ногами героев
                        characters: { zIndex: 3 },  // Спрайты/Карточки персонажей
                        vfx_top: { zIndex: 4 },     // Снаряды, молнии, цифры урона
                        ui_overlay: { zIndex: 5 }   // Кнопки "Пауза", "Автобой", "Пропуск x2"
                    },

                    // Конфиг полосок здоровья над головами персонажей
                    hp_bar_settings: {
                        width: "80px",
                        height: "6px",
                        backgroundColor: "#222",
                        player_color: "#4caf50",
                        enemy_color: "#f44336",
                        shield_color: "#2196f3"
                    },

                    // Конфиг всплывающего текста цифр урона (Combat Text)
                    damage_text_settings: {
                        font: "Arial Black",
                        size_normal: "24px",
                        size_crit: "36px",
                        color_normal: "#ffffff",
                        color_crit: "#ffeb3b",
                        color_heal: "#4caf50",
                        animation: "float_up_and_fade" // Тип CSS/JS анимации для фронта
                    },

                    battle_result_window: {
                        display_type: "fullscreen_overlay",
                        bg_image: "./gacha/assets/images/battle/victory_screen_bg.jpg",
                        mvp_badge_color: "#ffcc00",
                        mvp_animation: "hero_combat_idle",

                        // Настройки вкладок (Пункт 3 твоего ТЗ)
                        tabs_order: ["rewards", "combat_stats"],

                        // Цвета графиков статистики урона
                        stats_colors: {
                            damage_dealt: "#ef4444", // Красный бар для нанесенного урона
                            damage_taken: "#3b82f6", // Синий бар для полученного урона
                            healing: "#22c55e"       // Зеленый бар для отхила
                        }
                    }
                },


            ]
        },

        localization: {
            ui: {
                "ru": {
                    "game_title": "⚡ Combat Stars: Эпоха Богов",
                    "btn_shop_label": "Магазин гемов",
                    "btn_heroes_label": "Пантеон Богов",
                    "btn_games_label": "Games of Luck",
                    "btn_inventory_label": "Сокровищница",
                    "btn_gacha_label": "Призыв Богов",
                    "btn_temple_power_label": "Замок мощи",
                    "btn_arena_label": "PvP",
                    "btn_back_label": "✖",

                    "profile_vip": "VIP Уровень",
                    "profile_server": "Сервер",
                    "profile_online": "Время в игре",
                    "profile_online_val": "{value} мин.",
                    "profile_server_time": "Время сервера",

                    "server_select_title": "ВЫБОР ИГРОВОГО СЕРВЕРА",
                    "shop_title": "ВНУТРИИГРОВОЙ МАГАЗИН",
                    "shop_buy_btn": "Купить",
                    "inventory_title": "🎒 ПРЕДМЕТЫ НА АККАУНТЕ",
                    "inventory_empty": "Рюкзак пуст...",
                    "inventory_type_meta": "Валюта/Снаряжение",
                    "heroes_title": "👤 ТВОЙ ПАНТЕОН БОГОВ",
                    "heroes_lvl": "Уровень",
                    "heroes_slot_weapon": "Слот оружия",
                    "heroes_slot_empty": "Свободен",
                    "heroes_equip_btn": "Надеть",

                    "gacha_title": "РИТУАЛ ПРИЗЫВА БОГОВ",
                    "gacha_chances": "Шансы Богов: SSR — 30%, R — 70%",
                    "gacha_pity": "До гарантированного SSR Божества: {value} ритуалов",
                    "gacha_scrolls": "Древних свитков в наличии: {value} шт.",
                    "gacha_btn": "НАЧАТЬ РИТУАЛ",
                    "alert_buy_success": "Покупка совершена успешно!",
                    "alert_equip_success": "Снаряжение успешно изменено!",
                    "alert_login_error": "Ошибка подключения к игровому серверу!",
                    "alert_summon_new": "🆕 Новый экземпляр!",
                    "alert_summon_dup": "➡️ Конвертирован в 10 осколков",

                    "gacha_alert_title": "🔮 РИТУАЛ ЗАВЕРШЕН",
                    "gacha_alert_new": "🆕 Новый экземпляр!",
                    "gacha_alert_dup": "➡️ Конвертирован в 10 осколков",

                    "tab_stats": "📊 Характеристики",
                    "tab_inventory": "⚔️ Снаряжение",
                    "tab_stars": "⭐ Звёзды",
                    "tab_bonds": "🔗 Узы",
                    "tab_bio": "📖 Биография",
                    "hero_view_biography": "Древнее могущественное божество, сошедшее на арену Combat Stars...",
                    "hero_view_locked": "Просмотр снаряжения заблокирован в режиме каталога.",

                    "tab_profile_main": "👤 Аккаунт",
                    "tab_profile_achievements": "🏅 Достижения",
                    "tab_profile_transactions": "💳 Транзакции",
                    "tab_profile_match_history": "🎮 История игр",
                    "tab_profile_promo": "🎁 Промокоды",
                    "tab_profile_social_bind": "🔗 Привязка",

                    "tx_date": "Дата", "tx_product": "Товар", "tx_cost": "Цена", "tx_status": "Статус",
                    "match_date": "Время", "match_game": "Режим/Игра", "match_result": "Итог", "match_reward": "Награда",

                    "profile_change_avatar": "Сменить аватар",
                    "profile_change_frame": "Сменить рамку",
                    "profile_save_btn": "Сохранить",
                    "profile_nickname_label": "Имя аккаунта",

                    "btn_set_home_hero": "На главный экран",
                    "alert_home_hero_success": "Персонаж успешно установлен на главный экран!",

                    "promo_title": "АКТИВАЦИЯ КОДОВ",
                    "promo_input_placeholder": "Введите промокод...",
                    "invite_input_placeholder": "Введите ID инвайт-кода...",
                    "promo_btn_activate": "Активировать",
                    "invite_btn_link": "Применить",
                    "alert_promo_success": "Промокод успешно активирован! Награды начислены.",
                    "alert_invite_success": "Инвайт-код успешно применен!",

                    "social_title": "БЕЗОПАСНОСТЬ АККАУНТА",
                    "social_desc": "Привяжите профиль к социальным сетям, чтобы сохранить игровой прогресс.",
                    "social_status_linked": "Привязано: {value}",
                    "social_status_empty": "Не привязано",
                    "social_btn_bind": "Привязать",

                    "companion_game_start": "Ну что, смертный, покажи на что ты способен!",
                    "companion_game_cheer": "Отличный ход! Энергия Олимпа переполняет меня!",
                    "companion_game_idle": "Не отвлекайся, победа уже близко."
                },
                "en": {
                    "player": "Player",
                    "login_btn_enter": "Enter Game",
                    "login_btn_change": "Switch Account",
                    "login_no_avatar": "👤",
                    "login_header": "PLAYER SIGN IN",
                    "login_user_placeholder": "Enter login or email...",
                    "login_pass_placeholder": "Enter password...",
                    "login_btn_submit": "SIGN IN",
                    "login_btn_guest": "PLAY AS GUEST",
                    "login_or_social": "— OR CONNECT WITH —",
                    "server_current_account": "Current Account",
                    "server_select_title": "SELECT GAME SERVER",
                    "btn_server_back_label": "Back",

                    "game_title": "⚡ Combat Stars: Age of Gods",
                    "btn_shop_label": "Shop",
                    "btn_heroes_label": "Heroes",
                    "btn_games_label": "Games of Luck",
                    "btn_inventory_label": "Treasury",
                    "btn_gacha_label": "Summon",
                    "btn_temple_power_label": "Castle of Power",
                    "btn_arena_label": "Arena",
                    "btn_pvp_label": "PvP",
                    "btn_bets_label": "Bets",
                    "btn_pve_boss_label": "BOSS",
                    "btn_pve_campaign_label": "Campaign",
                    "btn_pve_tower_label": "Tower o Gods",
                    "btn_start_battle_label": "FIGHT",
                    "btn_back_label": "✖",

                    "profile_vip": "VIP Level",
                    "profile_server": "Server",
                    "profile_online": "Online Time",
                    "profile_online_val": "{value} min.",
                    "profile_server_time": "Server Time",

                    "shop_title": "IN-GAME SHOP",
                    "shop_buy_btn": "Buy",
                    "inventory_type_meta": "Currency/Gear",

                    "heroes_title": "Your Heroes",
                    "heroes_lvl": "Level",
                    "heroes_slot_weapon": "Weapon Slot",
                    "heroes_slot_empty": "Empty",
                    "heroes_equip_btn": "Equip",

                    "gacha_title": "RITUAL OF GODLY SUMMON",
                    "gacha_chances": "Godly Chances: SSR — 30%, R — 70%",
                    "gacha_pity": "Until guaranteed SSR Deity: {value} rituals",
                    "gacha_scrolls": "Ancient scrolls in stock: {value} pcs.",
                    "gacha_btn": "START RITUAL",
                    "alert_buy_success": "Purchase successful!",
                    "alert_equip_success": "Equipment changed successfully!",
                    "alert_login_error": "Failed to connect to the game server!",
                    "alert_summon_new": "🆕 New instance!",
                    "alert_summon_dup": "➡️ Converted into 10 shards",

                    "gacha_alert_title": "🔮 SUMMON COMPLETED",
                    "gacha_alert_new": "🆕 New instance!",
                    "gacha_alert_dup": "➡️ Converted into 10 shards",

                    "tab_stats": "📊 Attributes",
                    "tab_inventory": "⚔️ Gear",
                    "tab_bonds": "🔗 Bonds",
                    "tab_stars": "⭐ StarUp",
                    "tab_bio": "📖 Biography",
                    "hero_view_biography": "A powerful ancient deity that descended upon the Combat Stars arena...",
                    "hero_view_locked": "Equipment viewing is locked in Catalog mode.",


                    "arena_standard_title": "🏆 PREMATCH",
                    "arena_event_title": "⚡ Live",
                    "arena_locked_alert": "Locked",

                    "tab_profile_main": "👤 Account",
                    "tab_profile_achievements": "🏅 Badges",
                    "tab_profile_transactions": "💳 Billing",
                    "tab_profile_match_history": "🎮 History",
                    "tab_profile_promo": "🎁 Promo Codes",
                    "tab_profile_social_bind": "🔗 Linking",

                    "tx_date": "Date", "tx_product": "Item", "tx_cost": "Price", "tx_status": "Status",
                    "match_date": "Time", "match_game": "Game Mode", "match_result": "Result", "match_reward": "Reward",

                    "profile_change_avatar": "Change Avatar",
                    "profile_change_frame": "Change Frame",
                    "profile_save_btn": "Save",
                    "profile_nickname_label": "Account Name",

                    "btn_set_home_hero": "Set to Home Screen",
                    "alert_home_hero_success": "Character successfully set to Home Screen!",

                    "promo_title": "REDEEM CODES",
                    "promo_input_placeholder": "Enter promo code...",
                    "invite_input_placeholder": "Enter invite ID...",
                    "promo_btn_activate": "Redeem",
                    "invite_btn_link": "Apply",
                    "alert_promo_success": "Code redeemed successfully! Rewards added.",
                    "alert_invite_success": "Invite code applied successfully!",

                    "social_title": "ACCOUNT SECURITY",
                    "social_desc": "Link your profile to social networks to save your game progress.",
                    "social_status_linked": "Linked: {value}",
                    "social_status_empty": "Not linked",
                    "social_btn_bind": "Link",


                    "companion_game_start": "Well, mortal, show me what you are capable of!",
                    "companion_game_cheer": "Great move! The energy of Olympus flows through me!",
                    "companion_game_idle": "Stay focused, victory is near.",


                    loading: "Loading",
                    cancel: "Cancel",
                    ok: "OK",
                    gold: "Gold",

                    // --- Shop Screen ---
                    refresh_btn: "Refresh",
                    next_refresh: "Reset in",
                    shop_locked_msg: "Shop is locked",
                    shop_modal_title: "Purchase Item",
                    shop_total_cost: "Total Cost",
                    buy: "Buy",

                    // --- Inventory Screen ---
                    inventory_title: "Bag",
                    inventory_empty: "Bag is empty...",
                    inv_cat_all: "All",
                    inv_cat_equip: "Equip",
                    inv_cat_consume: "Items",
                    inv_cat_notion: "Mat",
                    inv_no_selection: "Select an item from the bag to view details",
                    inv_qty: "In Stock",
                    inv_stats: "Attributes",
                    inv_sell_earn: "Selling returns",
                    sell: "Sell",
                    use: "Use",

                    // --- Forge (Craft) Screen ---
                    craft_title: "Divine Forge",
                    craft_empty: "No recipes found for this category.",
                    craft_no_selection: "Select a recipe from the forge to start crafting",
                    craft_ingredients: "Required Materials",
                    craft_free_mats: "No materials required",
                    craft_gold_cost: "Gold Cost",
                    craft_total_gold: "Total Gold Cost",
                    craft_btn_normal: "Craft",
                    craft_btn_autoforge: "Auto Forge",

                    // --- Rewards Popup ---
                    popup_rewards_title: "Success!",

                    // --- Backend errors for translation ---
                    "Неверное количество для крафта": "Invalid crafting amount",
                    "Рецепт не найден": "Recipe not found",
                    "Профиль не найден": "Player profile not found",
                    "Недостаточно золота для автокрафта. Суммарно нужно: ": "Insufficient gold for auto-craft. Total needed: ",
                    "Недостаточно базового материала: ": "Missing base material: "
                }
            },
            stats: {
                "ru": {
                    "hp": "Здоровье",
                    "armor": "Броня",
                    "atk": "Атака",
                    "crit": "Крит",
                    "dodge": "Уворот"
                },
                "en": {
                    "hp": "HP",
                    "armor": "Armor",
                    "atk": "Attack",
                    "crit": "Crit",
                    "dodge": "Dodge"
                }
            },
            effects: {
                "ru": {
                    "eff_stat_boost": "Увеличивает выбранный стат на {value}%",
                    "eff_lightning": "⚡ Цепная молния: {value}% шанс поразить молнией всех врагов при ударе",
                    "eff_shield": "🛡️ Щит Короля: Снижает весь входящий урон на {value}%"
                },
                "en": {
                    "eff_stat_boost": "Increases selected stat by {value}%",
                    "eff_lightning": "⚡ Chain Lightning: {value}% chance to strike all enemies on hit",
                    "eff_shield": "🛡️ King's Shield: Reduces all incoming damage by {value}%"
                }
            },
            dialogs: {
                "en": {
                    "story_author": "Chronicle",
                    "story_step_1": "In an era when the stars began to fade, the evil forces came once again...",
                    "story_adelina_title": "Queen Adelina",
                    "story_step_2": "So you are the hero?! How pathetic...",
                    "helper_name": "Athena (Helper)",
                    "helper_menu_tutorial": "Listem, \"Hero\"... Here is your hub...",
                    "helper_heroes_tutorial": "Hi! This is your Pantheon. Here you can sort Gods by factions, check their Power Rating, and equip items!",

                    "dialog_hint_next": "▶ Click to continue"
                }
            }
        },

        catalog: {
            items: {
                "scroll_epic": {
                    category: "currency",
                    rarity: "SR",
                    is_usable: false,
                    icon: "🔮",
                    title_loc: { ru: "Древний свиток", en: "Ancient Scroll" },
                    desc_loc: { ru: "Используется во Вратах Призыва.", en: "Used in the Summon Gate." }
                },
                "rusty_sword": {
                    category: "equipment",
                    rarity: "R",
                    is_usable: false,
                    slot: "weapon",
                    icon: "⚔️",
                    stats: { "atk": 15, "crit": 3 },
                    title_loc: { ru: "Ржавый меч", en: "Rusty Sword" },
                    desc_loc: { ru: "Старый потрепанный клинок.", en: "An old battered blade." }
                },
                "zeus_staff": {
                    category: "equipment",
                    rarity: "SSR",
                    is_usable: false,
                    slot: "weapon",
                    icon: "⚡",
                    stats: { "atk": 150 },
                    effects: [
                        { effect_id: "eff_chain_lightning", value: 35 },
                        { effect_id: "eff_stat_boost_percent", value: 10, target_stat_id: "atk" }
                    ],
                    title_loc: { ru: "⚡ Посох Громовержца", en: "⚡ Staff of Thunder" },
                    desc_loc: { ru: "Артефакт Самого Зевса.", en: "Artifact of Zeus himself." }
                },
                "event_elixir": {
                    category: "consumable",
                    rarity: "SSR",
                    is_usable: true,
                    icon: "🧪",
                    payload: { action: "grant_resource", resource: "diamond", amount: 2000 },
                    title_loc: { ru: "🧪 Пыльца Асгарда", en: "🧪 Asgard Dust" },
                    desc_loc: { ru: "Дарует 2000 алмазов.", en: "Grants 2000 diamonds." }
                },
                // --- Добавленные предметы до 10 штук ---
                "knight_armor": {
                    category: "equipment",
                    rarity: "SR",
                    is_usable: false,
                    slot: "armor",
                    icon: "🛡️",
                    stats: { "def": 45, "hp": 200 },
                    title_loc: { ru: "Доспех Рыцаря", en: "Knight Armor" }
                },
                "speed_boots": {
                    category: "equipment",
                    rarity: "R",
                    is_usable: false,
                    slot: "boots",
                    icon: "🥾",
                    stats: { "speed": 10 },
                    title_loc: { ru: "Сапоги Скорости", en: "Boots of Speed" }
                },
                "gold_ring": {
                    category: "equipment",
                    rarity: "SR",
                    is_usable: false,
                    slot: "ring",
                    icon: "💍",
                    stats: { "hp": 150, "crit": 2 },
                    title_loc: { ru: "Кольцо Избранного", en: "Chosen Ring" }
                },
                "chest_bronze": {
                    category: "consumable",
                    rarity: "R",
                    is_usable: true,
                    icon: "📦",
                    title_loc: { ru: "Бронзовый сундук", en: "Bronze Chest" }
                },
                "chest_legendary": {
                    category: "consumable",
                    rarity: "SSR",
                    is_usable: true,
                    icon: "👑",
                    title_loc: { ru: "Легендарный сундук", en: "Legendary Chest" }
                },
                "hero_shard_generic": {
                    category: "material",
                    rarity: "SR",
                    is_usable: false,
                    icon: "🧩",
                    title_loc: { ru: "Осколок героя", en: "Universal Hero Shard" }
                }
            },
            recipes: {
                // Рецепт 1: Крафт "Доспеха Рыцаря" (SR) из "Ржавого меча" и "Осколков героя"
                "recipe_knight_armor": {
                    gold_cost: 5000,
                    ingredients: {
                        "rusty_sword": 2,          // Требуется 2 ржавых меча из инвентаря
                        "hero_shard_generic": 10   // Требуется 10 осколков героя
                    },
                    result: {
                        itemId: "knight_armor",    // ИСПРАВЛЕНО: Строго camelCase под бэкенд
                        amount: 1
                    }
                },

                // Рецепт 2: Божественный крафт "Посоха Громовержца" (SSR)
                "recipe_zeus_staff": {
                    gold_cost: 50000,
                    ingredients: {
                        "scroll_epic": 5,          // Требуется потратить 5 древних свитков
                        "gold_ring": 1             // Требуется 1 Кольцо Избранного
                    },
                    result: {
                        itemId: "zeus_staff",      // ИСПРАВЛЕНО: Строго camelCase под бэкенд
                        amount: 1
                    }
                }
            },
            shops: {
                // Магазин 1: Случайный, с лимитами, авто-сбросом и платным рефрешем
                random_market: {
                    title_loc: { ru: "Рынок Удачи", en: "Fortune Market" },
                    order: 1,
                    requirements: { player_level: 1, vip_level: 0 },
                    refresh_settings: {
                        auto_refresh_interval_ms: 86400000, // Авто-сброс раз в 24 часа
                        manual_refresh_cost: { resource: "diamond", amount: 50 } // Цена ручного сброса
                    },
                    // Слоты, которые при генерации будут заглядывать в пулы случайных предметов
                    slots: [
                        { slotId: "rnd_slot_1", is_random: true, poolId: "pool_cheap_goods", buy_limit: 1 },
                        { slotId: "rnd_slot_2", is_random: true, poolId: "pool_cheap_goods", buy_limit: 1 },
                        { slotId: "rnd_slot_3", is_random: true, poolId: "pool_cheap_goods", buy_limit: 1 },
                        { slotId: "rnd_slot_4", is_random: true, poolId: "pool_cheap_goods", buy_limit: 1 },
                        { slotId: "rnd_slot_5", is_random: true, poolId: "pool_cheap_goods", buy_limit: 1 },
                        { slotId: "rnd_slot_6", is_random: true, poolId: "pool_cheap_goods", buy_limit: 1 },

                        { slotId: "rnd_slot_7", is_random: true, poolId: "pool_expensive_goods", buy_limit: 3 },
                        { slotId: "rnd_slot_8", is_random: true, poolId: "pool_expensive_goods", buy_limit: 1 },
                        { slotId: "rnd_slot_9", is_random: true, poolId: "pool_expensive_goods", buy_limit: 1 },
                        { slotId: "rnd_slot_10", is_random: true, poolId: "pool_expensive_goods", buy_limit: 1 }
                    ]
                },
                // Магазин 2: Не случайный, статичный, с ограничением по VIP уровню
                vip_shop: {
                    title_loc: { ru: "VIP Магазин", en: "VIP Shop" },
                    order: 2,
                    requirements: { player_level: 10, vip_level: 3 }, // Требует 3 VIP
                    refresh_settings: { auto_refresh_interval_ms: 0 }, // 0 = никогда автоматически не обновляется витрина, она статична
                    slots: [
                        {
                            slotId: "vip_slot_1",
                            is_random: false,
                            item_type: "equipment",
                            itemId: "zeus_staff",
                            amount: 1,
                            cost: { resource: "diamond", amount: 1500 },
                            old_cost: { resource: "diamond", amount: 2000 }, // Скидка для визуала
                            buy_limit: 1 // Можно купить 1 раз за всё время жизни витрины
                        },
                        {
                            slotId: "vip_slot_2",
                            is_random: false,
                            item_type: "item",
                            itemId: "chest_legendary",
                            amount: 2,
                            cost: { resource: "diamond", amount: 500 },
                            buy_limit: 2
                        }
                    ]
                },
                // Магазин 3: Демо-магазин за реальные деньги ($)
                cash_shop: {
                    title_loc: { ru: "Премиум Бандлы", en: "Premium Bundles" },
                    order: 3,
                    requirements: { player_level: 1, vip_level: 0 },
                    refresh_settings: { auto_refresh_interval_ms: 0 }, // Статичный
                    slots: [
                        {
                            slotId: "cash_slot_1",
                            is_random: false,
                            item_type: "item",
                            itemId: "event_elixir",
                            amount: 1,
                            cost: { resource: "usd", amount: 4.99 }, // Покупка за реал
                            buy_limit: 1
                        },
                        {
                            slotId: "cash_slot_2",
                            is_random: false,
                            item_type: "item",
                            itemId: "scroll_epic",
                            amount: 50,
                            cost: { resource: "usd", amount: 19.99 },
                            buy_limit: 5
                        }
                    ]
                }
            },
            shop_pools: {
                pool_cheap_goods: [
                    { item_type: "item", itemId: "rusty_sword", amount: 1, weight: 40, cost: { resource: "gold", amount: 1000 } },
                    { item_type: "item", itemId: "speed_boots", amount: 1, weight: 40, cost: { resource: "gold", amount: 1500 } },
                    { item_type: "resource", itemId: "exp", amount: 5000, weight: 20, cost: { resource: "gold", amount: 2000 } }
                ],
                pool_expensive_goods: [
                    { item_type: "item", itemId: "scroll_epic", amount: 1, weight: 50, cost: { resource: "diamond", amount: 100 } },
                    { item_type: "item", itemId: "knight_armor", amount: 1, weight: 25, cost: { resource: "gold", amount: 25000 } },
                    { item_type: "item", itemId: "gold_ring", amount: 1, weight: 15, cost: { resource: "diamond", amount: 300 } },
                    { item_type: "item", itemId: "hero_shard_generic", amount: 5, weight: 10, cost: { resource: "diamond", amount: 150 } }
                ]
            },


            factions: {
                "holy_empire": {
                    title_loc: {...BASE_LANGUAGES, ru: "", en: "Holy Empire"},
                    icon: "⚡",
                    desc_loc: {...BASE_LANGUAGES, ru: "", en: "Gods of thunder and lightning"}
                },
                "guild_adventurers": {
                    title_loc: {...BASE_LANGUAGES, ru: "", en: "Adventurers"},
                    icon: "🛡️",
                    desc_loc: {...BASE_LANGUAGES, ru: "", en: "Norse warriors"}
                }
            },
            classes: {
                "tank": {
                    title_loc: {...BASE_LANGUAGES, ru: "Танк", en: "Tank"},
                    icon: "🛡️",
                    desc_loc: {...BASE_LANGUAGES, ru: "Защищает союзников, впитывает урон", en: "Protects allies, absorbs damage"}
                },
                "dps": {
                    title_loc: {...BASE_LANGUAGES, ru: "Боец (DPS)", en: "DPS"},
                    icon: "⚔️",
                    desc_loc: {...BASE_LANGUAGES, ru: "Наносит колоссальный урон", en: "Deals massive damage"}
                },
                "support": {
                    title_loc: {...BASE_LANGUAGES, ru: "Поддержка", en: "Support"},
                    icon: "🧪",
                    desc_loc: {...BASE_LANGUAGES, ru: "Исцеляет и баффает команду", en: "Heals and buffs the team"}
                }
            },

            skills: {
                "queen_will": {
                    title_loc: {...BASE_LANGUAGES, en: "Queen's Will"},
                    icon: "👑",
                    desc_loc: {...BASE_LANGUAGES, en: "Increases team stats by 10%"}
                },
                "thunder_strike": {
                    title_loc: {...BASE_LANGUAGES, ru: "Карающий Раскат", en: "Thunder Strike"},
                    icon: "⚡",
                    desc_loc: {...BASE_LANGUAGES, ru: "Наносит 200% урона по площади", en: "Deals 200% AoE damage"}
                },
            },
            hero_elements: {
                "thunder": {title_loc: {...BASE_LANGUAGES, ru: "Молния", en: "Thunder"}, icon: "⚡", color: "#ffeb3b"},
                "light": {title_loc: {...BASE_LANGUAGES, ru: "Свет", en: "Light"}, icon: "☀️", color: "#fff"},
                "blood": {title_loc: {...BASE_LANGUAGES, ru: "Свет", en: "Light"}, icon: "☀️", color: "#FF0000"},
                "ice": {title_loc: {...BASE_LANGUAGES, ru: "Лёд", en: "Ice"}, icon: "❄️", color: "#cefcff"},
            },
            hero_categories: {
                "aoe": {title_loc: {...BASE_LANGUAGES, ru: "Урон по площади (AoE)", en: "AoE Damage"}},
                "heal": {title_loc: {...BASE_LANGUAGES, ru: "Лечение", en: "Healing"}}
            },
            heroes: {
                "eleniel": {
                    title_loc: {...BASE_LANGUAGES, ru: "", en: "Eleniel Falaner"},
                    bio_loc: {...BASE_LANGUAGES, ru: "", en: "Eleniel Falaner BIO"},

                    rarity: "UR",
                    max_level: 200,

                    icon: "./gacha/assets/images/heroes/heroAvatars/eleniel.webp",
                    image: "./gacha/assets/images/heroes/heroFullheight/eleniel.png",
                    model: "",

                    faction_id: "holy_empire",
                    class_id: "dps",
                    element_id: "❄️",
                    category_ids: ["aoe"],

                    skills: ["queen_will"],
                    extra_skills: [],

                    base_stats: {"hp": 1000, "atk": 250, "speed": 120},
                    stats_growth: {"hp": 50, "atk": 25, "speed": 5},
                    effects: [],


                    skins: [
                        {
                            skin_id: "eleniel_skin_default",
                            name_loc: {...BASE_LANGUAGES, ru: "Классический", en: "Default"},
                            image: "./gacha/assets/images/heroes/heroFullheight/eleniel.png"
                        },
                        {
                            skin_id: "eleniel_skin_beach",
                            name_loc: {...BASE_LANGUAGES, ru: "Пляжный Повелитель", en: "Beach Lord"},
                            image: "./gacha/assets/images/heroes/heroFullheight/eleniel.png"
                        }
                    ],
                    bonds: [
                        {
                            target_hero_id: "rafaelAfterlife",
                            bonus_stat_id: "atk",
                            bonus_value: 15,
                            desc_loc: {
                                ...BASE_LANGUAGES,
                                en: "Absolute Zero"
                            }
                        }
                    ],

                    inventory_slots: BASE_INVENTORY_SLOTS,
                    personal_item_id: "adelina_staff",
                    extra_inventory_slots: ["amulet"]
                },
                "adelina": {
                    title_loc: {...BASE_LANGUAGES, ru: "", en: "Adelina d'Lys"},
                    bio_loc: {...BASE_LANGUAGES, ru: "", en: "Adelina d'Lys BIO"},

                    rarity: "SSR",
                    max_level: 100,

                    icon: "./gacha/assets/images/heroes/heroAvatars/adelina.webp",
                    image: "./gacha/assets/images/heroes/heroFullheight/adelina.png", 
                    model: "",

                    faction_id: "holy_empire",
                    class_id: "support",
                    element_id: "light",
                    category_ids: ["heal"],

                    skills: ["queen_will"],
                    extra_skills: [],

                    base_stats: {"hp": 500, "atk": 150, "speed": 90},
                    stats_growth: {"hp": 30, "atk": 12, "speed": 2},
                    effects: [], 

                    
                    skins: [
                        {
                            skin_id: "adelina_skin_default",
                            name_loc: {...BASE_LANGUAGES, ru: "Классический", en: "Default"},
                            image: "./gacha/assets/images/heroes/heroFullheight/adelina.png"
                        },
                        {
                            skin_id: "adelina_skin_beach",
                            name_loc: {...BASE_LANGUAGES, ru: "Пляжный Повелитель", en: "Beach Lord"},
                            image: "./gacha/assets/images/heroes/heroFullheight/adelina.png"
                        }
                    ],
                    bonds: [
                        {
                            target_hero_id: "rafaelAfterlife",
                            bonus_stat_id: "atk",
                            bonus_value: 5,
                            desc_loc: {
                                ...BASE_LANGUAGES,
                                en: "Queen and her Archmage"
                            }
                        }
                    ],

                    inventory_slots: BASE_INVENTORY_SLOTS,
                    personal_item_id: "adelina_staff",
                    extra_inventory_slots: ["amulet"] 
                },
                "rafaelAfterlife": {
                    title_loc: {...BASE_LANGUAGES, en: "Rafael \"Afterlife\""},
                    rarity: "SSR",
                    max_level: 100,

                    icon: "./gacha/assets/images/heroes/heroAvatars/rafaelAfterlife.webp",
                    image: "./gacha/assets/images/heroes/heroFullheight/rafaelAfterlife.png",
                    model: "",

                    
                    faction_id: "guild_adventurers",
                    class_id: "dps",
                    element_id: "thunder",
                    category_ids: ["aoe"],

                    skills: ["skill_thunder_strike"], 
                    extra_skills: [], 

                    
                    base_stats: {"hp": 500, "atk": 150, "speed": 90},
                    stats_growth: {"hp": 30, "atk": 12, "speed": 2},
                    effects: [],
                    
                    skins: [
                        {
                            skin_id: "rafaelAfterlife_skin_default",
                            name_loc: {...BASE_LANGUAGES, en: "Default"},
                            image: "./gacha/assets/images/heroes/heroFullheight/rafaelAfterlife.png"
                        },
                        {
                            skin_id: "rafaelAfterlife_skin_beach",
                            name_loc: {...BASE_LANGUAGES, en: "The Reaper of Queen"},
                            image: ""
                        }
                    ],
                    bonds: [
                        {
                            target_hero_id: "adelina_dlys",
                            bonus_stat_id: "atk",
                            bonus_value: 5,
                            desc_loc: {
                                ...BASE_LANGUAGES,
                                en: "Queen and her Archmage"
                            }
                        },
                        {
                            target_hero_id: "eleniel",
                            bonus_stat_id: "atk",
                            bonus_value: 15,
                            desc_loc: {
                                ...BASE_LANGUAGES,
                                en: "Absolute Zero"
                            }
                        }
                    ],

                    
                    inventory_slots: BASE_INVENTORY_SLOTS,
                    personal_item_id: "zeus_staff", 
                    extra_inventory_slots: ["amulet"] 
                },
                "marishka": {
                    title_loc: {...BASE_LANGUAGES, en: "Marishka \"The Dark\""},
                    rarity: "SR",
                    max_level: 100,

                    icon: "./gacha/assets/images/heroes/heroAvatars/marishka.webp",
                    image: "./gacha/assets/images/heroes/heroFullheight/marishka.png",
                    model: "",


                    faction_id: "guild_adventurers",
                    class_id: "dps",
                    element_id: "thunder",
                    category_ids: ["aoe"],

                    skills: ["skill_thunder_strike"],
                    extra_skills: [],


                    base_stats: {"hp": 500, "atk": 150, "speed": 90},
                    stats_growth: {"hp": 30, "atk": 12, "speed": 2},
                    effects: [],

                    skins: [
                        {
                            skin_id: "marishka_skin_default",
                            name_loc: {...BASE_LANGUAGES, en: "Default"},
                            image: "./gacha/assets/images/heroes/heroFullheight/marishka.png"
                        },
                        {
                            skin_id: "marishka_skin_beach",
                            name_loc: {...BASE_LANGUAGES, en: "The Reaper of Queen"},
                            image: ""
                        }
                    ],
                    bonds: [
                        {
                            target_hero_id: "The Reaper of Queen",
                            bonus_stat_id: "atk",
                            bonus_value: 5,
                            desc_loc: {
                                ...BASE_LANGUAGES,
                                en: "The Reaper of Queen"
                            }
                        }
                    ],


                    inventory_slots: BASE_INVENTORY_SLOTS,
                    personal_item_id: "zeus_staff",
                    extra_inventory_slots: ["amulet"]
                },
                "anjeihydra": {
                    title_loc: {...BASE_LANGUAGES, en: "Anjei \"Hydra\""},
                    rarity: "R",
                    max_level: 100,

                    icon: "./gacha/assets/images/heroes/heroAvatars/anjeihydra.webp",
                    image: "./gacha/assets/images/heroes/heroFullheight/anjeihydra.png",
                    model: "",


                    faction_id: "holy_empire",
                    class_id: "dps",
                    element_id: "thunder",
                    category_ids: ["aoe"],

                    skills: ["skill_thunder_strike"],
                    extra_skills: [],


                    base_stats: {"hp": 500, "atk": 150, "speed": 90},
                    stats_growth: {"hp": 30, "atk": 12, "speed": 2},
                    effects: [],

                    skins: [
                        {
                            skin_id: "anjeihydra_skin_default",
                            name_loc: {...BASE_LANGUAGES, en: "Default"},
                            image: "./gacha/assets/images/heroes/heroFullheight/anjeihydra.png"
                        },
                        {
                            skin_id: "anjeihydra_skin_beach",
                            name_loc: {...BASE_LANGUAGES, en: "The Reaper of Queen"},
                            image: ""
                        }
                    ],
                    bonds: [
                        {
                            target_hero_id: "vanessa",
                            bonus_stat_id: "atk",
                            bonus_value: 5,
                            desc_loc: {
                                ...BASE_LANGUAGES,
                                en: "The Reaper of Queen"
                            }
                        }
                    ],


                    inventory_slots: BASE_INVENTORY_SLOTS,
                    personal_item_id: "zeus_staff",
                    extra_inventory_slots: ["amulet"]
                },


                "selena": {
                    title_loc: {...BASE_LANGUAGES, en: "Anjei \"Hydra\""},
                    rarity: "UR",
                    max_level: 100,

                    icon: "./gacha/assets/images/heroes/heroAvatars/selena.webp",
                    image: "./gacha/assets/images/heroes/heroFullheight/selena.png",
                    model: "",


                    faction_id: "holy_empire",
                    class_id: "support",
                    element_id: "blood",
                    category_ids: ["heal"],

                    skills: ["skill_thunder_strike"],
                    extra_skills: [],


                    base_stats: {"hp": 500, "atk": 150, "speed": 90},
                    stats_growth: {"hp": 30, "atk": 12, "speed": 2},
                    effects: [],

                    skins: [
                        {
                            skin_id: "selena_skin_default",
                            name_loc: {...BASE_LANGUAGES, en: "Default"},
                            image: "./gacha/assets/images/heroes/heroFullheight/selena.png"
                        },
                        {
                            skin_id: "anjeihydra_skin_beach",
                            name_loc: {...BASE_LANGUAGES, en: "The Reaper of Queen"},
                            image: ""
                        }
                    ],
                    bonds: [

                    ],


                    inventory_slots: BASE_INVENTORY_SLOTS,
                    personal_item_id: "",
                    extra_inventory_slots: ["amulet"]
                },
            },

            game_genres: {
                "slots": { icon: "🎰", title_loc: { ru: "РПГ", en: "Slots" } },
                "card": { icon: "🃏", title_loc: { ru: "РПГ", en: "Card" } },
                "crash": { icon: "✈️", title_loc: { ru: "Аркада", en: "Crash" } }
            },
            game_platforms: {
                "mobile": { icon: "📱", title_loc: { ru: "Мобильные", en: "Mobile" } },
                "web": { icon: "🌐", title_loc: { ru: "Браузерные", en: "Web" } }
            },
            games: {
                "elvenCrash": {
                    ...HERO_PROTOTYPE,
                    title_loc: {...BASE_LANGUAGES, ru: "", en: "Elven Crash"},
                    rarity: "SSR",
                    max_level: 100,

                    genre_id: "crash",
                    platform_id: "web",
                    status: "hot",
                    
                    icon: "./gacha/assets/images/games/elvenCrash.jpeg",
                    banner: "./gacha/assets/images/games/elvenCrash.jpeg",

                    slug: 'elven-crash'
                },
                "elvenHoldem": {
                    ...HERO_PROTOTYPE,
                    title_loc: {...BASE_LANGUAGES, ru: "", en: "Elven Holdem"},
                    rarity: "SSR",
                    max_level: 100,

                    genre_id: "card",
                    platform_id: "web",
                    status: "hot",
                    
                    icon: "./gacha/assets/images/games/elvenHoldem.jpeg",
                    banner: "./gacha/assets/images/games/elvenHoldem.jpeg",
                    model: "./assets/models/zeus_spine.json",

                    slug: 'elven-holdem'
                },
                "narutoShinobi": {
                    ...HERO_PROTOTYPE,
                    title_loc: {...BASE_LANGUAGES, ru: "", en: "Naruto Shinobi"},
                    rarity: "SSR",
                    max_level: 100,

                    genre_id: "slots",
                    platform_id: "web",
                    status: "hot",

                    icon: "./gacha/assets/images/games/naruto_shinobi_slots.jpeg",
                    banner: "./gacha/assets/images/games/naruto_shinobi_slots.jpeg",
                    model: "./assets/models/zeus_spine.json",

                    slug: 'naruto-shinobi'
                },

                "blackjack": {
                    ...HERO_PROTOTYPE,
                    title_loc: {...BASE_LANGUAGES, ru: "", en: "Blackjack"},

                    genre_id: "card",
                    platform_id: "web",
                    status: "",

                    icon: "./gacha/assets/images/games/blackjack.jpeg",
                    banner: "./gacha/assets/images/games/blackjack.jpeg",

                    slug: 'blackjack'
                },
                "crash": {
                    ...HERO_PROTOTYPE,
                    title_loc: {...BASE_LANGUAGES, ru: "", en: "Crash"},
                    rarity: "SSR",
                    max_level: 100,

                    genre_id: "crash",
                    platform_id: "web",
                    status: "",

                    icon: "./gacha/assets/images/games/crash.jpeg",
                    banner: "./gacha/assets/images/games/crash.jpeg",

                    slug: 'crash-aviator'
                },
                "dice": {
                    ...HERO_PROTOTYPE,
                    title_loc: {...BASE_LANGUAGES, ru: "", en: "Dice"},
                    rarity: "SSR",
                    max_level: 100,

                    genre_id: "card",
                    platform_id: "web",
                    status: "",

                    icon: "./gacha/assets/images/games/dice.jpeg",
                    banner: "./gacha/assets/images/games/dice.jpeg",

                    slug: 'dice-roll'
                },
                "hilo": {
                    ...HERO_PROTOTYPE,
                    title_loc: {...BASE_LANGUAGES, ru: "", en: "HiLo"},
                    rarity: "SSR",
                    max_level: 100,

                    genre_id: "card",
                    platform_id: "web",
                    status: "",

                    icon: "./gacha/assets/images/games/hilo.jpeg",
                    banner: "./gacha/assets/images/games/hilo.jpeg",

                    slug: 'hi-lo-card'
                },
                "holdem": {
                    ...HERO_PROTOTYPE,
                    title_loc: {...BASE_LANGUAGES, ru: "", en: "holdem"},
                    rarity: "SSR",
                    max_level: 100,

                    genre_id: "card",
                    platform_id: "web",
                    status: "",

                    icon: "./gacha/assets/images/games/holdem.jpeg",
                    banner: "./gacha/assets/images/games/holdem.jpeg",

                    slug: 'holdem'
                },
                "lottery": {
                    ...HERO_PROTOTYPE,
                    title_loc: {...BASE_LANGUAGES, ru: "", en: "Lottery"},
                    rarity: "SSR",
                    max_level: 100,

                    genre_id: "slots",
                    platform_id: "web",
                    status: "",

                    icon: "./gacha/assets/images/games/lottery.jpeg",
                    banner: "./gacha/assets/images/games/lottery.jpeg",

                    slug: '5-min-lottery'
                },

                "mines": {
                    ...HERO_PROTOTYPE,
                    title_loc: {...BASE_LANGUAGES, ru: "", en: "Mines"},
                    rarity: "SSR",
                    max_level: 100,

                    genre_id: "slots",
                    platform_id: "web",
                    status: "",

                    icon: "./gacha/assets/images/games/mines.jpeg",
                    banner: "./gacha/assets/images/games/mines.jpeg",

                    slug: 'mines-sweeper'
                },

                "roulette": {
                    ...HERO_PROTOTYPE,
                    title_loc: {...BASE_LANGUAGES, ru: "", en: "Roulette"},
                    rarity: "SSR",
                    max_level: 100,

                    genre_id: "slots",
                    platform_id: "web",
                    status: "",

                    icon: "./gacha/assets/images/games/roulette.jpeg",
                    banner: "./gacha/assets/images/games/roulette.jpeg",

                    slug: 'roulette'
                },

                "scratch": {
                    ...HERO_PROTOTYPE,
                    title_loc: {...BASE_LANGUAGES, ru: "", en: "Scratch"},
                    rarity: "SSR",
                    max_level: 100,

                    genre_id: "slots",
                    platform_id: "web",
                    status: "",

                    icon: "./gacha/assets/images/games/scratch.jpeg",
                    banner: "./gacha/assets/images/games/scratch.jpeg",

                    slug: 'scratch-cards'
                },

                "slots53char": {
                    ...HERO_PROTOTYPE,
                    title_loc: {...BASE_LANGUAGES, ru: "", en: "Slots 5x3"},
                    rarity: "SSR",
                    max_level: 100,

                    genre_id: "slots",
                    platform_id: "web",
                    status: "",

                    icon: "./gacha/assets/images/games/slots5x3.jpeg",
                    banner: "./gacha/assets/images/games/slots5x3.jpeg",

                    slug: '5x3-slots'
                    // embed_url: "https://mtwtech.onrender.com/games/slots5x3char?partnerId=demo_mtwtech&mode=real&character=adelina&fullscreen=true&hidePlayer=true",
                    // embed_url: "https://mtwtech.onrender.com/games/slots5x3char?partnerId=demo_mtwtech&mode=real&fullscreen=true&hidePlayer=true",
                },

                "wof": {
                    ...HERO_PROTOTYPE,
                    title_loc: {...BASE_LANGUAGES, ru: "", en: "Wheel of Fortune"},
                    rarity: "SSR",
                    max_level: 100,

                    genre_id: "slots",
                    platform_id: "web",
                    status: "",

                    icon: "./gacha/assets/images/games/wof.jpeg",
                    banner: "./gacha/assets/images/games/wof.jpeg",

                    slug: 'wheel-of-fortune'
                }
            },

            arena_types: {
                "PREMATCH": {
                    embed_url: "https://mtwtech.onrender.com/sport?eventType='PREMATCH'&hideSidebar=true&hidePlayer=true&fullscreen=true",
                    min_level: 1,
                    min_vip: 0
                },
                "LIVE": {
                    embed_url: "https://mtwtech.onrender.com/sport?eventType='LIVE'&hideSidebar=true&hidePlayer=true&fullscreen=true",
                    min_level: 1, // LiveOps условие доступа
                    min_vip: 0
                }
            },

            avatars: {
                "avatar_mage": { icon: "🧙‍♂️", title_loc: { ru: "Маг", en: "Mage" } },
                "avatar_warrior": { icon: "⚔️", title_loc: { ru: "Воин", en: "Warrior" } },
                "avatar_god": { icon: "⚡", title_loc: { ru: "Громовержец", en: "God of Thunder" } }
            },
            frames: {
                "frame_default": { color: "#444", title_loc: { ru: "Обычная", en: "Default" } },
                "frame_vip": { color: "#ffcc00", title_loc: { ru: "Золотая VIP", en: "Golden VIP" } },
                "frame_event": { color: "#ef4444", title_loc: { ru: "Пламя Асгарда", en: "Asgard Flame" } }
            },
            achievements_meta: {
                "first_summon": {
                    icon: "🔮",
                    title_loc: { ru: "Первый ритуал", en: "First Ritual" },
                    desc_loc: { ru: "Совершите свой первый призыв Божества.", en: "Perform your first deity summon." },
                    reward: { type: "resource", id: "diamond", count: 100 }
                },
                "god_level_100": {
                    icon: "⚡",
                    title_loc: { ru: "Сила Олимпа", en: "Power of Olympus" },
                    desc_loc: { ru: "Прокачайте 5 любых Богов до 100 уровня.", en: "Upgrade 5 any Gods to lvl 100." },
                    reward: { type: "item", id: "zeus_staff", count: 1 }
                }
            }
        },

        dialogs: {
            "FIRST_LOGIN": {
                // Все настройки геометрии и стилей вынесены в конфиг UI
                window_settings: {
                    display_type: "fullscreen", // fullscreen | helper
                    bg_image: "url('./gacha/assets/images/intro/intro_bg_1.jpg')",
                    backgroundColor: "#050505",

                    box_width: "80%",
                    box_height: "auto",
                    box_top: "unset",
                    box_bottom: "5vh",
                    box_left: "10%",
                    box_padding: "20px",
                    box_backgroundColor: "rgba(10, 10, 10, 0.9)",
                    box_border: "2px solid #333",
                    box_borderRadius: "8px",
                    box_shadow: "0 10px 30px rgba(0,0,0,0.8)",

                    speaker_color: "#ffcc00",
                    speaker_size: "14px",
                    text_color: "#dddddd",
                    text_size: "12px",

                    hint_loc_key: "dialog_hint_next", // Ссылка на локализацию подсказки клика
                    hint_color: "#666",
                    hint_size: "9px"
                },
                steps: [
                    { speaker_loc_key: "story_author", text_loc_key: "story_step_1", avatar: "" },
                    { speaker_loc_key: "story_adelina_title", text_loc_key: "story_step_2", avatar: "./gacha/assets/images/heroes/heroAvatars/adelina.webp" }
                ]
            },
            "FIRST_MENU": {
                // Все настройки геометрии и стилей вынесены в конфиг UI
                window_settings: {
                    display_type: "helper", // fullscreen | helper
                    bg_image: "none",
                    backgroundColor: "transparent",


                    box_width: "350px",
                    box_height: "auto",
                    box_top: "unset",
                    box_bottom: "20px",
                    box_left: "20px", // Отключаем лево, если позиционируем по правому краю
                    box_right: "unset",
                    box_padding: "15px",
                    box_backgroundColor: "rgba(20, 20, 20, 0.95)",
                    box_border: "1px solid #ffcc00",
                    box_borderRadius: "6px",
                    box_shadow: "0 4px 15px rgba(0,0,0,0.6)",

                    speaker_color: "#ffcc00",
                    speaker_size: "13px",
                    text_color: "#fff",
                    text_size: "12px",

                    hint_loc_key: "dialog_hint_next",
                    hint_color: "#999",
                    hint_size: "10px"
                },
                steps: [
                    { speaker_loc_key: "story_adelina_title", text_loc_key: "helper_menu_tutorial", avatar: "./gacha/assets/images/heroes/heroAvatars/adelina.webp" }
                ]
            },
            "OPEN_HEROES_FIRST_TIME": {
                window_settings: {
                    display_type: "helper",
                    bg_image: "none",
                    backgroundColor: "transparent",

                    box_width: "350px",
                    box_height: "auto",
                    box_top: "unset",
                    box_bottom: "20px",
                    box_left: "unset", // Отключаем лево, если позиционируем по правому краю
                    box_right: "20px",
                    box_padding: "15px",
                    box_backgroundColor: "rgba(20, 20, 20, 0.95)",
                    box_border: "1px solid #ffcc00",
                    box_borderRadius: "6px",
                    box_shadow: "0 4px 15px rgba(0,0,0,0.6)",

                    speaker_color: "#ffcc00",
                    speaker_size: "13px",
                    text_color: "#fff",
                    text_size: "12px",

                    hint_loc_key: "dialog_hint_next",
                    hint_color: "#999",
                    hint_size: "10px"
                },
                steps: [
                    { speaker_loc_key: "story_adelina_title", text_loc_key: "helper_heroes_tutorial", avatar: "./gacha/assets/images/heroes/heroAvatars/adelina.webp" }
                ]
            }
        },




        gacha: {
            rules: {
                max_standard_diamond_daily: 20,
                convert_duplicates_to_shards: false,
            },
            diamond_limits: {
                "banner_standard": 20,
                "banner_selena_event": 100
            },
            banners: [
                {
                    id: "banner_standard",
                    banner_type: "standard", 
                    poolId: "standard",
                    cost_item_id: "scroll_epic",
                    cost_amount: 1,
                    pity_threshold: 10,
                    title_loc: {...BASE_LANGUAGES,  ru: "🔮 Стандартный Призыв", en: "🔮 Standard Summon" }
                },
                {
                    id: "banner_selena_event",
                    banner_type: "event", 
                    poolId: "selena_event",
                    cost_item_id: "scroll_event", 
                    cost_amount: 1,
                    pity_threshold: 3,
                    title_loc: {...BASE_LANGUAGES,  ru: "Жрица Крови Уже здесь!", en: "Blood Priestess is here!" }
                },
                {
                    id: "banner_friendship",
                    banner_type: "friendship", 
                    poolId: "friendship",
                    cost_item_id: "currency_friendship_points", 
                    cost_amount: 100,
                    pity_threshold: 0, 
                    title_loc: {...BASE_LANGUAGES,  ru: "🤝 Призыв Дружбы", en: "🤝 Friendship Summon" }
                }
            ],
            pools: {
                "standard": {
                    cost: 1,
                    currency: 'scroll_epic',
                    modes: [1, 10],
                    rates: { "UR": 1, "SSR": 10, "SR": 19, "R": 70 },
                    heroes: { "UR":["eleniel", "selena"], "SSR": ["adelina", "rafaelAfterlife"], "SR": ["marishka"], "R": ["anjeihydra"] },
                    rate_up: {
                        "adelina": 70,
                        "rafaelAfterlife": 30
                    },
                    guarantees: {
                        first: { "SSR": 10, "UR": 120 },
                        every: { "SR": 10, "SSR": 50 }
                    }
                },
                "selena_event": {
                    cost: 2000,
                    currency: 'diamond',
                    modes: [1, 5],
                    rates: { "SSR": 30, "SR": 0, "R": 70 },
                    heroes: { "UR":["eleniel", "selena"], "SSR": ["adelina", "rafaelAfterlife"], "SR": ["marishka"], "R": ["anjeihydra"] },
                    rate_up: {
                        "selena": 70,
                        "eleniel": 30
                    },
                },
                "friendship": {
                    cost: 1000,
                    currency: 'friendship',
                    modes: [1, 10],
                    rates: { "SSR": 0, "SR": 10, "R": 90 }, 
                    heroes: { "SSR": [], "SR": [], "R": ["hero_goblin"] }
                }
            },
        },

        pve_campaign: {
            // Базовый рейт айдла, если игрок вообще ничего не прошёл
            base_idle_rate: { gold: 100, exp: 50 },
            stages: {
                "stage_1_1": {
                    title_loc: { ru: "Глава 1: Начало", en: "Chapter 1.1: The Beginning" },
                    ui_position: { x: "100px", y: "100px" },
                    enemies: [
                        { hero_id: "anjeihydra", level: 1, stars: 1, position: 1 },
                        { hero_id: "anjeihydra", level: 1, stars: 1, position: 2 },
                        { hero_id: "anjeihydra", level: 1, stars: 1, position: 2 },
                        { hero_id: "anjeihydra", level: 1, stars: 1, position: 3 },
                        { hero_id: "anjeihydra", level: 1, stars: 1, position: 3 },
                    ],
                    rewards: {
                        resources: { gold: 500, exp: 200, diamond: 10 },
                        items: [{ itemId: "scroll_epic", amount: 1, chance: 1.0 }] // 100% шанс
                    },
                    // НАПРАВЛЕНИЕ 4: прибавка к айдлу в час после прохождения этого этапа
                    idle_bonus_per_hour: { gold: 10, exp: 5 }
                },
                "stage_1_2": {
                    title_loc: { ru: "Глава 1: Начало", en: "Chapter 1.2: The Beginning" },
                    ui_position: { x: "200px", y: "100px" },
                    enemies: [
                        { hero_id: "anjeihydra", level: 1, stars: 1, position: 1 },
                        { hero_id: "anjeihydra", level: 1, stars: 1, position: 2 },
                        { hero_id: "anjeihydra", level: 1, stars: 1, position: 2 },
                        { hero_id: "anjeihydra", level: 1, stars: 1, position: 3 },
                        { hero_id: "anjeihydra", level: 1, stars: 1, position: 3 },
                    ],
                    rewards: {
                        resources: { gold: 500, exp: 200, diamond: 10 },
                        items: [{ itemId: "scroll_epic", amount: 1, chance: 1.0 }] // 100% шанс
                    },
                    // НАПРАВЛЕНИЕ 4: прибавка к айдлу в час после прохождения этого этапа
                    idle_bonus_per_hour: { gold: 10, exp: 5 }
                },
                "stage_1_3": {
                    title_loc: { ru: "Глава 1: Начало", en: "Chapter 1.3: The Beginning" },
                    ui_position: { x: "300px", y: "100px" },
                    enemies: [
                        { hero_id: "anjeihydra", level: 1, stars: 1, position: 1 },
                        { hero_id: "anjeihydra", level: 1, stars: 1, position: 2 },
                        { hero_id: "anjeihydra", level: 1, stars: 1, position: 2 },
                        { hero_id: "anjeihydra", level: 1, stars: 1, position: 3 },
                        { hero_id: "anjeihydra", level: 1, stars: 1, position: 3 },
                    ],
                    rewards: {
                        resources: { gold: 500, exp: 200, diamond: 10 },
                        items: [{ itemId: "scroll_epic", amount: 1, chance: 1.0 }] // 100% шанс
                    },
                    // НАПРАВЛЕНИЕ 4: прибавка к айдлу в час после прохождения этого этапа
                    idle_bonus_per_hour: { gold: 10, exp: 5 }
                },
                "stage_1_4": {
                    title_loc: { ru: "Глава 1: Начало", en: "Chapter 1.4: The Beginning" },
                    ui_position: { x: "400px", y: "100px" },
                    enemies: [
                        { hero_id: "anjeihydra", level: 1, stars: 1, position: 1 },
                        { hero_id: "anjeihydra", level: 1, stars: 1, position: 2 },
                        { hero_id: "anjeihydra", level: 1, stars: 1, position: 2 },
                        { hero_id: "anjeihydra", level: 1, stars: 1, position: 3 },
                        { hero_id: "anjeihydra", level: 1, stars: 1, position: 3 },
                    ],
                    rewards: {
                        resources: { gold: 500, exp: 200, diamond: 10 },
                        items: [{ itemId: "scroll_epic", amount: 1, chance: 1.0 }] // 100% шанс
                    },
                    // НАПРАВЛЕНИЕ 4: прибавка к айдлу в час после прохождения этого этапа
                    idle_bonus_per_hour: { gold: 10, exp: 5 }
                },
                "stage_1_5": {
                    title_loc: { ru: "Глава 1: Начало", en: "Chapter 1.5: The Beginning" },
                    ui_position: { x: "500px", y: "100px" },
                    enemies: [
                        { hero_id: "anjeihydra", level: 1, stars: 1, position: 1 },
                        { hero_id: "anjeihydra", level: 1, stars: 1, position: 2 },
                        { hero_id: "anjeihydra", level: 1, stars: 1, position: 2 },
                        { hero_id: "anjeihydra", level: 1, stars: 1, position: 3 },
                        { hero_id: "anjeihydra", level: 1, stars: 1, position: 3 },
                    ],
                    rewards: {
                        resources: { gold: 500, exp: 200, diamond: 10 },
                        items: [{ itemId: "scroll_epic", amount: 1, chance: 1.0 }] // 100% шанс
                    },
                    // НАПРАВЛЕНИЕ 4: прибавка к айдлу в час после прохождения этого этапа
                    idle_bonus_per_hour: { gold: 10, exp: 5 }
                },
                "stage_1_6": {
                    title_loc: { ru: "Глава 1: Начало", en: "Chapter 1.6: The Beginning" },
                    ui_position: { x: "600px", y: "100px" },
                    enemies: [
                        { hero_id: "anjeihydra", level: 1, stars: 1, position: 1 },
                        { hero_id: "anjeihydra", level: 1, stars: 1, position: 2 },
                        { hero_id: "anjeihydra", level: 1, stars: 1, position: 2 },
                        { hero_id: "anjeihydra", level: 1, stars: 1, position: 3 },
                        { hero_id: "anjeihydra", level: 1, stars: 1, position: 3 },
                    ],
                    rewards: {
                        resources: { gold: 500, exp: 200, diamond: 10 },
                        items: [{ itemId: "scroll_epic", amount: 1, chance: 1.0 }] // 100% шанс
                    },
                    // НАПРАВЛЕНИЕ 4: прибавка к айдлу в час после прохождения этого этапа
                    idle_bonus_per_hour: { gold: 10, exp: 5 }
                },
                "stage_1_7": {
                    title_loc: { ru: "Глава 1: Начало", en: "Chapter 1.7: The Beginning" },
                    ui_position: { x: "600px", y: "200px" },
                    enemies: [
                        { hero_id: "anjeihydra", level: 1, stars: 1, position: 1 },
                        { hero_id: "anjeihydra", level: 1, stars: 1, position: 2 },
                        { hero_id: "anjeihydra", level: 1, stars: 1, position: 2 },
                        { hero_id: "anjeihydra", level: 1, stars: 1, position: 3 },
                        { hero_id: "anjeihydra", level: 1, stars: 1, position: 3 },
                    ],
                    rewards: {
                        resources: { gold: 500, exp: 200, diamond: 10 },
                        items: [{ itemId: "scroll_epic", amount: 1, chance: 1.0 }] // 100% шанс
                    },
                    // НАПРАВЛЕНИЕ 4: прибавка к айдлу в час после прохождения этого этапа
                    idle_bonus_per_hour: { gold: 10, exp: 5 }
                },
                "stage_1_8": {
                    title_loc: { ru: "Глава 1: Начало", en: "Chapter 1.8: The Beginning" },
                    ui_position: { x: "500px", y: "200px" },
                    enemies: [
                        { hero_id: "anjeihydra", level: 1, stars: 1, position: 1 },
                        { hero_id: "anjeihydra", level: 1, stars: 1, position: 2 },
                        { hero_id: "anjeihydra", level: 1, stars: 1, position: 2 },
                        { hero_id: "anjeihydra", level: 1, stars: 1, position: 3 },
                        { hero_id: "anjeihydra", level: 1, stars: 1, position: 3 },
                    ],
                    rewards: {
                        resources: { gold: 500, exp: 200, diamond: 10 },
                        items: [{ itemId: "scroll_epic", amount: 1, chance: 1.0 }] // 100% шанс
                    },
                    // НАПРАВЛЕНИЕ 4: прибавка к айдлу в час после прохождения этого этапа
                    idle_bonus_per_hour: { gold: 10, exp: 5 }
                },
                "stage_1_9": {
                    title_loc: { ru: "Глава 1: Начало", en: "Chapter 1.9: The Beginning" },
                    ui_position: { x: "400px", y: "200px" },
                    enemies: [
                        { hero_id: "anjeihydra", level: 1, stars: 1, position: 1 },
                        { hero_id: "anjeihydra", level: 1, stars: 1, position: 2 },
                        { hero_id: "anjeihydra", level: 1, stars: 1, position: 2 },
                        { hero_id: "anjeihydra", level: 1, stars: 1, position: 3 },
                        { hero_id: "anjeihydra", level: 1, stars: 1, position: 3 },
                    ],
                    rewards: {
                        resources: { gold: 500, exp: 200, diamond: 10 },
                        items: [{ itemId: "scroll_epic", amount: 1, chance: 1.0 }] // 100% шанс
                    },
                    // НАПРАВЛЕНИЕ 4: прибавка к айдлу в час после прохождения этого этапа
                    idle_bonus_per_hour: { gold: 10, exp: 5 }
                },
                "stage_1_10": {
                    title_loc: { ru: "Глава 1: Глубже в лес", en: "Chapter 1.10: Deeper in Forest" },
                    ui_position: { x: "400px", y: "300px" },
                    enemies: [
                        { hero_id: "anjeihydra", level: 3, stars: 1, position: 1 },
                        { hero_id: "eleniel", level: 5, stars: 1, position: 3 }
                    ],
                    rewards: {
                        resources: { gold: 700, exp: 350 }
                    },
                    idle_bonus_per_hour: { gold: 15, exp: 8 }
                }
            }
        },

        pve_towers: {
            "main_tower": {
                title_loc: { ru: "Башня Олимпа", en: "Olympus Tower" },
                floors: {
                    "floor_1": {
                        enemies: [
                            { hero_id: "anjeihydra", level: 5, stars: 1, position: 1 },
                            { hero_id: "anjeihydra", level: 5, stars: 1, position: 3 }
                        ],
                        rewards: {
                            resources: { diamond: 50, gold: 1000 }
                        }
                    },
                    "floor_2": {
                        enemies: [
                            { hero_id: "anjeihydra", level: 8, stars: 2, position: 0 },
                            { hero_id: "anjeihydra", level: 8, stars: 2, position: 2 },
                            { hero_id: "anjeihydra", level: 8, stars: 2, position: 4 }
                        ],
                        rewards: {
                            resources: { diamond: 100, gold: 2000 },
                            items: [ { itemId: "scroll_epic", amount: 1, chance: 1.0 } ]
                        }
                    }
                }
            }
        },

        pve_bosses: {
            "world_hydra": {
                boss_id: "world_hydra",
                hero_id: "anjeihydra",      // Ссылка на визуал и базовые статы из каталога heroes
                level: 300,
                max_hp: 100000000,         // 100 млн HP для серверного босса
                boss_type: "server",       // "local" (соло) | "guild" (клановый) | "server" (общий на сервер)
                reset_cron: "0 0 * * *",   // Сброс раз в сутки (в полночь)
                rewards_by_tier: [
                    { min_dmg: 100000, resources: { gold: 5000, exp: 2000 } },
                    { min_dmg: 1000000, resources: { gold: 25000, exp: 10000, diamond: 50 } },
                    { min_dmg: 10000000, resources: { gold: 100000, exp: 50000, diamond: 200, scroll_epic: 1 } }
                ]
            },
            "guild_titan": {
                boss_id: "guild_titan",
                hero_id: "eleniel",         // Боссом может быть и измененный прототип героя
                level: 150,
                max_hp: 25000000,          // 25 млн HP для клана
                boss_type: "guild",
                reset_cron: "0 0 * * *",
                rewards_by_tier: [
                    { min_dmg: 50000, resources: { gold: 2000 } },
                    { min_dmg: 500000, resources: { gold: 10000, diamond: 20 } }
                ]
            },
            "queen_challenge": {
                boss_id: "queen_challenge",
                hero_id: "adelina",         // Боссом может быть и измененный прототип героя
                level: 100,
                max_hp: 5000000,          // 25 млн HP для клана
                boss_type: "solo",
                reset_cron: "0 0 * * *",
                rewards_by_tier: [
                    { min_dmg: 50000, resources: { gold: 2000 } },
                    { min_dmg: 500000, resources: { gold: 10000, diamond: 20 } }
                ]
            }
        }
    }
};

module.exports = {gamesConfigDB};



// "game_combat_stars": {
//     orientation: "landscape",
//         servers: [
//         {id: "world_01", name: {...BASE_LANGUAGES, ru: "S1: Олимп", en: "S1: Olympus"}, status: "hot", text: {...BASE_LANGUAGES, ru: "Рекомендуемый мир", en:"Recommended"}}
//     ],
//         languages: BASE_LANGUAGES,
//
//         mechanics: {
//         resources: {
//             "gold": {
//                 icon: "🔮",
//                     title_loc: {...BASE_LANGUAGES, ru: "Золото", en: "Gold"},
//                 desc_loc: {...BASE_LANGUAGES, ru: "Основные деньги.", en: "Main money."}
//             },
//             "exp": {
//                 icon: "🔮",
//                     title_loc: {...BASE_LANGUAGES, ru: "Золото", en: "Exp"},
//                 desc_loc: {...BASE_LANGUAGES, ru: "Ресурс усиления героев.", en: "Hero level up resource."}
//             },
//             "diamond": {
//                 icon: "🔮",
//                     title_loc: {...BASE_LANGUAGES, ru: "Золото", en: "Diamond"},
//                 desc_loc: {...BASE_LANGUAGES, ru: "ВИП деньги.", en: "VIP money."}
//             },
//             "friendship": {
//                 icon: "🔮",
//                     title_loc: {...BASE_LANGUAGES, ru: "Дружба", en: "Friendship"},
//                 desc_loc: {...BASE_LANGUAGES, ru: "Жетоны дружбы.", en: "Friendship badges."}
//             },
//         },
//         stats: {
//             "hp": {...BASE_STATS.hp, order: 1, icon: "❤️", display: "int", rating_weight: 0.1},
//             "armor": {...BASE_STATS.armor, order: 2, icon: "🛡️", display: "int", rating_weight: 1.5},
//             "atk": {...BASE_STATS.atk, order: 3, icon: "⚔️", display: "int", rating_weight: 2.0},
//             "crit": {...BASE_STATS.crit, order: 4, icon: "🎯", display: "percent", rating_weight: 5.0},
//             "dodge": {...BASE_STATS.dodge, order: 5, icon: "💨", display: "percent", rating_weight: 4.0}
//         },
//         effects: {
//             "eff_stat_boost_percent": {...BASE_EFFECT_STATS, polarity: "buff", type: "stat_mod", desc_loc_key: "eff_stat_boost"},
//             "eff_chain_lightning": {...BASE_EFFECT_STATS, polarity: "buff", type: "trigger", desc_loc_key: "eff_lightning"},
//             "eff_damage_reduction": {...BASE_EFFECT_STATS, polarity: "buff", type: "stat_mod", desc_loc_key: "eff_shield"}
//         },
//         rarities: {
//             hero: ["R", "SR", "SSR", "UR"],
//                 items: ["R", "SR", "SSR"],
//         },
//         inventory_slots: BASE_INVENTORY_SLOTS,
//             prototypes: {
//             "hero": HERO_PROTOTYPE,
//                 "team": {
//                 size: 5,
//                     position: [1,2,2],
//                     bonuses: {
//                     faction: {
//                         "3": {
//                             "hp": "5%",
//                                 "atk": "5%",
//                         },
//                         "4": {
//                             "hp": "10%",
//                                 "atk": "10%",
//                         },
//                         "5": {
//                             "hp": "15%",
//                                 "atk": "15%",
//                         },
//                     }
//                 },
//                 additional: {
//                     beasts: 3,
//                 },
//             }
//         }
//     },
//
//     ui: {
//         windows_settings: {
//             content_top: "5px",
//                 content_bottom: "5px",
//                 content_left: "5px",
//                 content_width: "calc(100% - 10px)"
//         },
//         landscape: [
//             {
//                 id: "screen_main_menu",
//                 bg_image: "./gacha/assets/images/main_menu_bg_1.png",
//                 bg_width: 1200,
//                 scrollable: true,
//                 active_width: 1000,
//                 home_hero_layout: {
//                     top: "40%",         // Позиция по вертикали на панораме
//                     left: "45%",        // Позиция по горизонтали (например, по центру хаба)
//                     height: "55%",      // Высота персонажа относительно экрана (например, в полный рост)
//                     zIndex: 3,          // Помещаем за бары интерфейса, но перед фоном арта
//                     animation: "idle_pulse" // Конфигурируемый класс анимации (например, легкое покачивание)
//                 }
//             },
//             {
//                 id: "player_bar",
//                 type: "text_panel",
//                 action: "open_profile",
//                 layout: {
//                     top: "35px",
//                     left: "15% + 5px",
//                     width: "30%",
//                     height: "60px",
//                     backgroundColor: "#222"
//                 }
//             },
//             {
//                 id: "resource_bar",
//                 type: "text_panel",
//                 layout: {
//                     top: "25px",
//                     right: "105px",
//                     width: "200px",
//                     height: "40px",
//
//                     backgroundColor: "#222",
//
//                     textColor: "#ffeb3b",
//                     textSize: "20px",
//                     textPosition: "bottom"
//                 }
//             },
//             {
//                 id: "btn_back",
//                 type: "button",
//                 label_loc_key: "btn_back_label",
//                 action: "go_back",
//                 onlyInWindows: true,
//                 layout: {
//                     top: "22px",
//                     left: "22px",
//                     width: "40px",
//                     height: "40px",
//                     backgroundColor: "#0a0a0a",
//                     textColor: "#FFF",
//                     textSize: "30px",
//                 }
//             },
//
//             {
//                 id: "btn_heroes",
//                 type: "button",
//                 label_loc_key: "btn_heroes_label",
//                 action: "open_heroes",
//                 layout: {
//                     top: "80%",
//                     left: "60%",
//                     width: "16%",
//                     height: "40%",
//
//                     backgroundColor: "transparent",
//                     backgroundImage: "url('./gacha/assets/images/main_heroes.png')",
//
//                     textColor: "#fff",
//                     textSize: "20px",
//                     textPosition: "bottom"
//                 }
//             },
//             {
//                 id: "btn_games",
//                 type: "button",
//                 label_loc_key: "btn_games_label",
//                 action: "open_games",
//                 layout: {
//                     top: "80%",
//                     left: "15%",
//                     width: "16%",
//                     height: "40%",
//
//                     backgroundColor: "transparent",
//                     backgroundImage: "url('./gacha/assets/images/main_casino.png')",
//
//                     textColor: "#fff",
//                     textSize: "20px",
//                     textPosition: "bottom"
//                 }
//             },
//             {
//                 id: "btn_inventory",
//                 type: "button",
//                 label_loc_key: "btn_inventory_label",
//                 action: "open_inventory",
//                 layout: {
//                     top: "50%",
//                     left: "25%",
//                     width: "16%",
//                     height: "40%",
//
//                     backgroundColor: "transparent",
//                     backgroundImage: "url('./gacha/assets/images/main_inventory.png')",
//
//                     textColor: "#fff",
//                     textSize: "20px",
//                     textPosition: "bottom"
//                 }
//             },
//             {
//                 id: "btn_shop",
//                 type: "button",
//                 label_loc_key: "btn_shop_label",
//                 action: "open_shop",
//                 layout: {
//                     top: "80%",
//                     left: "40%",
//                     width: "16%",
//                     height: "40%",
//
//                     backgroundColor: "transparent",
//                     backgroundImage: "url('./gacha/assets/images/main_shop.png')",
//
//                     textColor: "#fff",
//                     textSize: "20px",
//                     textPosition: "bottom"
//
//                 }
//             },
//             {
//                 id: "btn_gacha",
//                 type: "button",
//                 label_loc_key: "btn_gacha_label",
//                 action: "open_gacha",
//                 layout: {
//                     top: "50%",
//                     left: "75%",
//                     width: "16%",
//                     height: "40%",
//
//                     backgroundColor: "transparent",
//                     backgroundImage: "url('./gacha/assets/images/main_gacha.png')",
//
//                     textColor: "#fff",
//                     textSize: "20px",
//                     textPosition: "bottom"
//                 }
//             },
//             {
//                 id: "btn_temple_power",
//                 type: "button",
//                 label_loc_key: "btn_temple_power_label",
//                 action: "open_temple_power",
//                 layout: {
//                     top: "40%",
//                     left: "50%",
//                     width: "16%",
//                     height: "40%",
//
//                     backgroundColor: "transparent",
//                     backgroundImage: "url('./gacha/assets/images/main_temple_power.png')",
//
//                     textColor: "#fff",
//                     textSize: "20px",
//                     textPosition: "bottom"
//                 }
//             },
//             {
//                 id: "btn_arena",
//                 type: "button",
//                 label_loc_key: "btn_arena_label",
//                 action: "open_arena",
//                 layout: {
//                     top: "80%",
//                     right: "15%",
//                     width: "16%",
//                     height: "40%",
//
//                     backgroundColor: "transparent",
//                     backgroundImage: "url('./gacha/assets/images/main_arena.png')",
//
//                     textColor: "#fff",
//                     textSize: "20px",
//                     textPosition: "bottom"
//                 }
//             },
//             {
//                 id: "screen_server_select",
//                 bg_image: "./gacha/assets/images/server_select_bg.png", // Фон самого экрана арены
//                 bg_width: 1000,
//                 active_width: 1000,
//             },
//             {
//                 id: "screen_heroes",
//                 bg_image: "",
//                 bg_width: 1000,
//                 active_width: 1000,
//                 list_settings: {
//                     display_mode: "grid",
//                     gap: "2%",
//                     card_layout: {
//                         height: "100%",
//                         aspectRatio: "9 / 16",
//                         backgroundColor: "#1e1e1e",
//                         borderRadius: "8px"
//                     }
//                 }
//             },
//             {
//                 id: "screen_hero_view",
//                 bg_image: "",
//                 bg_width: 1000,
//                 active_width: 1000,
//                 // Вот правильное место для Data-Driven структуры блоков интерфейса!
//                 view_layout: ['menu', 'avatar', 'content'],
//                 menu_tabs: ['stats','inventory','stars','bonds','bio']
//             },
//             {
//                 id: "screen_games",
//                 bg_image: "",
//                 bg_width: 1000,
//                 active_width: 1000,
//                 list_settings: {
//                     display_mode: "grid",
//                     gap: "2%",
//                     card_layout: {
//                         height: "100%",
//                         aspectRatio: "9 / 16",
//                         backgroundColor: "#1e1e1e",
//                         borderRadius: "8px"
//                     }
//                 }
//             },
//             {
//                 id: "screen_game",
//                 companion_stream: {
//                     enabled: true,         // true — включить персонажа рядом с iframe, false — чистый фуллскрин iframe
//                     position: "left",      // left / right — с какой стороны от игры стоит персонаж
//                     width: "25%",          // Какую долю экрана занимает персонаж (остальное уходит под iframe)
//                     bubble_color: "rgba(20, 20, 20, 0.95)",
//                     bubble_text_color: "#fff",
//                     // Дефолтный пак фраз (пока нет вебсокетов), который движок будет крутить рандомно
//                     phrases_loc_keys: ["companion_game_start", "companion_game_cheer", "companion_game_idle"]
//                 }
//             },
//             {
//                 id: "screen_shop",
//                 bg_image: "",
//                 bg_width: 1000,
//                 active_width: 1000,
//             },
//             {
//                 id: "screen_profile",
//                 bg_image: "./gacha/assets/images/backgrounds/profile_bg.png", // Фон окна профиля
//                 bg_width: 1000,
//                 active_width: 1000,
//
//                 // Настраиваемый порядок и состав вкладок профиля (Пункт 5 твоего ТЗ)
//                 profile_layout: {
//                     // Задаем порядок табов. B2B-клиент может менять их местами, удалять или добавлять свои
//                     tabs_order: ["main", "achievements", "transactions", "match_history", "promo", "social_bind"],
//
//                     // Спецификация полей для таблицы истории транзакций (Пункт 3 твоего ТЗ)
//                     transaction_fields: [
//                         { id: "timestamp", label_loc_key: "tx_date", type: "date" },
//                         { id: "pack_id", label_loc_key: "tx_product", type: "loc_string" },
//                         { id: "cost", label_loc_key: "tx_cost", type: "number" },
//                         { id: "status", label_loc_key: "tx_status", type: "string" }
//                     ],
//
//                     // Спецификация полей для таблицы истории игр/боев (Пункт 4 твоего ТЗ)
//                     match_history_fields: [
//                         { id: "timestamp", label_loc_key: "match_date", type: "date" },
//                         { id: "game_id", label_loc_key: "match_game", type: "loc_string" },
//                         { id: "result", label_loc_key: "match_result", type: "badge" }, // Win / Lose с подсветкой
//                         { id: "reward", label_loc_key: "match_reward", type: "resource" }
//                     ]
//                 }
//             },
//             {
//                 id: "screen_arena",
//                 bg_image: "./gacha/assets/images/arena/arena_bg.jpg", // Фон самого экрана арены
//                 bg_width: 1000,
//                 active_width: 1000,
//                 // Настраиваемые интерактивные кнопки режимов Арены (прямо как в главном меню)
//                 arena_widgets: [
//                     {
//                         id: "PREMATCH",
//                         label_loc_key: "arena_standard_title",
//                         arena_type_id: "PREMATCH", // Ссылка на правила из каталога
//                         layout: {
//                             top: "50%",
//                             left: "25%",
//                             width: "35%",
//                             height: "50%",
//                             backgroundColor: "transparent",
//                             backgroundImage: "url('./gacha/assets/images/arena/PREMATCH.png')",
//                             textColor: "#fff",
//                             textSize: "18px",
//                             textPosition: "bottom"
//                         }
//                     },
//                     {
//                         id: "LIVE",
//                         label_loc_key: "arena_event_title",
//                         arena_type_id: "LIVE",
//                         layout: {
//                             top: "50%",
//                             left: "75%",
//                             width: "35%",
//                             height: "50%",
//                             backgroundColor: "transparent",
//                             backgroundImage: "url('./gacha/assets/images/arena/LIVE.png')",
//                             textColor: "#ffcc00",
//                             textSize: "18px",
//                             textPosition: "bottom"
//                         }
//                     }
//                 ]
//             }
//         ]
//     },
//
//     localization: {
//         ui: {
//             "ru": {
//                 "game_title": "⚡ Combat Stars: Эпоха Богов",
//                     "btn_shop_label": "Магазин гемов",
//                     "btn_heroes_label": "Пантеон Богов",
//                     "btn_games_label": "Games of Luck",
//                     "btn_inventory_label": "Сокровищница",
//                     "btn_gacha_label": "Призыв Богов",
//                     "btn_temple_power_label": "Замок мощи",
//                     "btn_back_label": "✖",
//
//                     "profile_vip": "VIP Уровень",
//                     "profile_server": "Сервер",
//                     "profile_online": "Время в игре",
//                     "profile_online_val": "{value} мин.",
//                     "profile_server_time": "Время сервера",
//
//                     "server_select_title": "ВЫБОР ИГРОВОГО СЕРВЕРА",
//                     "shop_title": "ВНУТРИИГРОВОЙ МАГАЗИН",
//                     "shop_buy_btn": "Купить",
//                     "inventory_title": "🎒 ПРЕДМЕТЫ НА АККАУНТЕ",
//                     "inventory_empty": "Рюкзак пуст...",
//                     "inventory_type_meta": "Валюта/Снаряжение",
//                     "heroes_title": "👤 ТВОЙ ПАНТЕОН БОГОВ",
//                     "heroes_lvl": "Уровень",
//                     "heroes_slot_weapon": "Слот оружия",
//                     "heroes_slot_empty": "Свободен",
//                     "heroes_equip_btn": "Надеть",
//
//                     "gacha_title": "РИТУАЛ ПРИЗЫВА БОГОВ",
//                     "gacha_chances": "Шансы Богов: SSR — 30%, R — 70%",
//                     "gacha_pity": "До гарантированного SSR Божества: {value} ритуалов",
//                     "gacha_scrolls": "Древних свитков в наличии: {value} шт.",
//                     "gacha_btn": "НАЧАТЬ РИТУАЛ",
//                     "alert_buy_success": "Покупка совершена успешно!",
//                     "alert_equip_success": "Снаряжение успешно изменено!",
//                     "alert_login_error": "Ошибка подключения к игровому серверу!",
//                     "alert_summon_new": "🆕 Новый экземпляр!",
//                     "alert_summon_dup": "➡️ Конвертирован в 10 осколков",
//
//                     "gacha_alert_title": "🔮 РИТУАЛ ЗАВЕРШЕН",
//                     "gacha_alert_new": "🆕 Новый экземпляр!",
//                     "gacha_alert_dup": "➡️ Конвертирован в 10 осколков",
//
//                     "tab_stats": "📊 Характеристики",
//                     "tab_inventory": "⚔️ Снаряжение",
//                     "tab_stars": "⭐ Звёзды",
//                     "tab_bonds": "🔗 Узы",
//                     "tab_bio": "📖 Биография",
//                     "hero_view_biography": "Древнее могущественное божество, сошедшее на арену Combat Stars...",
//                     "hero_view_locked": "Просмотр снаряжения заблокирован в режиме каталога.",
//
//                     "tab_profile_main": "👤 Аккаунт",
//                     "tab_profile_achievements": "🏅 Достижения",
//                     "tab_profile_transactions": "💳 Транзакции",
//                     "tab_profile_match_history": "🎮 История игр",
//                     "tab_profile_promo": "🎁 Промокоды",
//                     "tab_profile_social_bind": "🔗 Привязка",
//
//                     "tx_date": "Дата", "tx_product": "Товар", "tx_cost": "Цена", "tx_status": "Статус",
//                     "match_date": "Время", "match_game": "Режим/Игра", "match_result": "Итог", "match_reward": "Награда",
//
//                     "profile_change_avatar": "Сменить аватар",
//                     "profile_change_frame": "Сменить рамку",
//                     "profile_save_btn": "Сохранить",
//                     "profile_nickname_label": "Имя аккаунта",
//
//                     "btn_set_home_hero": "На главный экран",
//                     "alert_home_hero_success": "Персонаж успешно установлен на главный экран!",
//
//                     "promo_title": "АКТИВАЦИЯ КОДОВ",
//                     "promo_input_placeholder": "Введите промокод...",
//                     "invite_input_placeholder": "Введите ID инвайт-кода...",
//                     "promo_btn_activate": "Активировать",
//                     "invite_btn_link": "Применить",
//                     "alert_promo_success": "Промокод успешно активирован! Награды начислены.",
//                     "alert_invite_success": "Инвайт-код успешно применен!",
//
//                     "social_title": "БЕЗОПАСНОСТЬ АККАУНТА",
//                     "social_desc": "Привяжите профиль к социальным сетям, чтобы сохранить игровой прогресс.",
//                     "social_status_linked": "Привязано: {value}",
//                     "social_status_empty": "Не привязано",
//                     "social_btn_bind": "Привязать",
//
//                     "companion_game_start": "Ну что, смертный, покажи на что ты способен!",
//                     "companion_game_cheer": "Отличный ход! Энергия Олимпа переполняет меня!",
//                     "companion_game_idle": "Не отвлекайся, победа уже близко."
//             },
//             "en": {
//                 "player": "Player",
//
//                     "game_title": "⚡ Combat Stars: Age of Gods",
//                     "btn_shop_label": "Gem Shop",
//                     "btn_heroes_label": "Pantheon of Gods",
//                     "btn_games_label": "Games of Luck",
//                     "btn_inventory_label": "Treasury",
//                     "btn_gacha_label": "God Summon",
//                     "btn_temple_power_label": "Castle of Power",
//                     "btn_back_label": "✖",
//
//                     "profile_vip": "VIP Level",
//                     "profile_server": "Server",
//                     "profile_online": "Online Time",
//                     "profile_online_val": "{value} min.",
//                     "profile_server_time": "Server Time",
//
//                     "server_select_title": "SELECT GAME SERVER",
//                     "shop_title": "IN-GAME SHOP",
//                     "shop_buy_btn": "Buy",
//                     "inventory_title": "🎒 ACCOUNT ITEMS",
//                     "inventory_empty": "Bag is empty...",
//                     "inventory_type_meta": "Currency/Gear",
//
//                     "heroes_title": "Your Heroes",
//                     "heroes_lvl": "Level",
//                     "heroes_slot_weapon": "Weapon Slot",
//                     "heroes_slot_empty": "Empty",
//                     "heroes_equip_btn": "Equip",
//
//                     "gacha_title": "RITUAL OF GODLY SUMMON",
//                     "gacha_chances": "Godly Chances: SSR — 30%, R — 70%",
//                     "gacha_pity": "Until guaranteed SSR Deity: {value} rituals",
//                     "gacha_scrolls": "Ancient scrolls in stock: {value} pcs.",
//                     "gacha_btn": "START RITUAL",
//                     "alert_buy_success": "Purchase successful!",
//                     "alert_equip_success": "Equipment changed successfully!",
//                     "alert_login_error": "Failed to connect to the game server!",
//                     "alert_summon_new": "🆕 New instance!",
//                     "alert_summon_dup": "➡️ Converted into 10 shards",
//
//                     "gacha_alert_title": "🔮 SUMMON COMPLETED",
//                     "gacha_alert_new": "🆕 New instance!",
//                     "gacha_alert_dup": "➡️ Converted into 10 shards",
//
//                     "tab_stats": "📊 Attributes",
//                     "tab_inventory": "⚔️ Gear",
//                     "tab_bonds": "🔗 Bonds",
//                     "tab_stars": "⭐ StarUp",
//                     "tab_bio": "📖 Biography",
//                     "hero_view_biography": "A powerful ancient deity that descended upon the Combat Stars arena...",
//                     "hero_view_locked": "Equipment viewing is locked in Catalog mode.",
//
//                     "btn_arena_label": "Arena",
//                     "arena_standard_title": "🏆 PREMATCH",
//                     "arena_event_title": "⚡ Live",
//                     "arena_locked_alert": "Locked",
//
//                     "tab_profile_main": "👤 Account",
//                     "tab_profile_achievements": "🏅 Badges",
//                     "tab_profile_transactions": "💳 Billing",
//                     "tab_profile_match_history": "🎮 History",
//                     "tab_profile_promo": "🎁 Promo Codes",
//                     "tab_profile_social_bind": "🔗 Linking",
//
//                     "tx_date": "Date", "tx_product": "Item", "tx_cost": "Price", "tx_status": "Status",
//                     "match_date": "Time", "match_game": "Game Mode", "match_result": "Result", "match_reward": "Reward",
//
//                     "profile_change_avatar": "Change Avatar",
//                     "profile_change_frame": "Change Frame",
//                     "profile_save_btn": "Save",
//                     "profile_nickname_label": "Account Name",
//
//                     "btn_set_home_hero": "Set to Home Screen",
//                     "alert_home_hero_success": "Character successfully set to Home Screen!",
//
//                     "promo_title": "REDEEM CODES",
//                     "promo_input_placeholder": "Enter promo code...",
//                     "invite_input_placeholder": "Enter invite ID...",
//                     "promo_btn_activate": "Redeem",
//                     "invite_btn_link": "Apply",
//                     "alert_promo_success": "Code redeemed successfully! Rewards added.",
//                     "alert_invite_success": "Invite code applied successfully!",
//
//                     "social_title": "ACCOUNT SECURITY",
//                     "social_desc": "Link your profile to social networks to save your game progress.",
//                     "social_status_linked": "Linked: {value}",
//                     "social_status_empty": "Not linked",
//                     "social_btn_bind": "Link",
//
//
//                     "companion_game_start": "Well, mortal, show me what you are capable of!",
//                     "companion_game_cheer": "Great move! The energy of Olympus flows through me!",
//                     "companion_game_idle": "Stay focused, victory is near."
//             }
//         },
//         stats: {
//             "ru": {
//                 "hp": "Здоровье",
//                     "armor": "Броня",
//                     "atk": "Атака",
//                     "crit": "Крит",
//                     "dodge": "Уворот"
//             },
//             "en": {
//                 "hp": "HP",
//                     "armor": "Armor",
//                     "atk": "Attack",
//                     "crit": "Crit",
//                     "dodge": "Dodge"
//             }
//         },
//         effects: {
//             "ru": {
//                 "eff_stat_boost": "Увеличивает выбранный стат на {value}%",
//                     "eff_lightning": "⚡ Цепная молния: {value}% шанс поразить молнией всех врагов при ударе",
//                     "eff_shield": "🛡️ Щит Короля: Снижает весь входящий урон на {value}%"
//             },
//             "en": {
//                 "eff_stat_boost": "Increases selected stat by {value}%",
//                     "eff_lightning": "⚡ Chain Lightning: {value}% chance to strike all enemies on hit",
//                     "eff_shield": "🛡️ King's Shield: Reduces all incoming damage by {value}%"
//             }
//         },
//         dialogs: {
//             "en": {
//                 "story_author": "Chronicle",
//                     "story_step_1": "In an era when the stars began to fade, the evil forces came once again...",
//                     "story_adelina_title": "Queen Adelina",
//                     "story_step_2": "So you are the hero?! How pathetic...",
//                     "helper_name": "Athena (Helper)",
//                     "helper_menu_tutorial": "Listem, \"Hero\"... Here is your hub...",
//                     "helper_heroes_tutorial": "Hi! This is your Pantheon. Here you can sort Gods by factions, check their Power Rating, and equip items!",
//
//                     "dialog_hint_next": "▶ Click to continue"
//             }
//         }
//     },
//
//     catalog: {
//         items: {
//             "scroll_epic": {
//                 category: "currency",
//                     rarity: "SR",
//                     is_usable: false,
//                     icon: "🔮",
//                     expiration: null,
//                     title_loc: {...BASE_LANGUAGES, ru: "Древний свиток", en: "Ancient Scroll"},
//                 desc_loc: {...BASE_LANGUAGES, ru: "Используется во Вратах Призыва.", en: "Used in the Summon Gate."}
//             },
//             "rusty_sword": {
//                 category: "equipment",
//                     rarity: "R",
//                     is_usable: false,
//                     slot: "weapon",
//                     icon: "⚔️",
//                     expiration: null,
//                     stats: {"atk": 15, "crit": 3},
//                 effects: [],
//                     title_loc: {...BASE_LANGUAGES, ru: "Ржавый меч", en: "Rusty Sword"},
//                 desc_loc: {...BASE_LANGUAGES, ru: "Старый потрепанный клинок.", en: "An old battered blade."}
//             },
//             "zeus_staff": {
//                 category: "equipment",
//                     rarity: "SSR",
//                     is_usable: false,
//                     slot: "weapon",
//                     icon: "⚡",
//                     expiration: null,
//                     stats: {"atk": 150},
//                 effects: [{effect_id: "eff_chain_lightning", value: 35}, {
//                     effect_id: "eff_stat_boost_percent",
//                     value: 10,
//                     target_stat_id: "atk"
//                 }],
//                     title_loc: {...BASE_LANGUAGES, ru: "⚡ Посох Громовержца", en: "⚡ Staff of Thunder"},
//                 desc_loc: {...BASE_LANGUAGES, ru: "Артефакт Самого Зевса.", en: "Artifact of Zeus himself."}
//             },
//             "event_elixir": {
//                 category: "consumable",
//                     rarity: "SSR",
//                     is_usable: true,
//                     icon: "🧪",
//                     expiration: 1781347200000,
//                     payload: {action: "grant_resource", resource: "gems", amount: 2000},
//                 title_loc: {...BASE_LANGUAGES, ru: "🧪 Пыльца Асгарда", en: "🧪 Asgard Dust"},
//                 desc_loc: {...BASE_LANGUAGES, ru: "Дарует 2000 гемов.", en: "Grants 2000 gems."}
//             }
//         },
//         factions: {
//             "holy_empire": {
//                 title_loc: {...BASE_LANGUAGES, ru: "", en: "Holy Empire"},
//                 icon: "⚡",
//                     desc_loc: {...BASE_LANGUAGES, ru: "", en: "Gods of thunder and lightning"}
//             },
//             "guild_adventurers": {
//                 title_loc: {...BASE_LANGUAGES, ru: "", en: "Adventurers"},
//                 icon: "🛡️",
//                     desc_loc: {...BASE_LANGUAGES, ru: "", en: "Norse warriors"}
//             }
//         },
//         classes: {
//             "tank": {
//                 title_loc: {...BASE_LANGUAGES, ru: "Танк", en: "Tank"},
//                 icon: "🛡️",
//                     desc_loc: {...BASE_LANGUAGES, ru: "Защищает союзников, впитывает урон", en: "Protects allies, absorbs damage"}
//             },
//             "dps": {
//                 title_loc: {...BASE_LANGUAGES, ru: "Боец (DPS)", en: "DPS"},
//                 icon: "⚔️",
//                     desc_loc: {...BASE_LANGUAGES, ru: "Наносит колоссальный урон", en: "Deals massive damage"}
//             },
//             "support": {
//                 title_loc: {...BASE_LANGUAGES, ru: "Поддержка", en: "Support"},
//                 icon: "🧪",
//                     desc_loc: {...BASE_LANGUAGES, ru: "Исцеляет и баффает команду", en: "Heals and buffs the team"}
//             }
//         },
//
//         skills: {
//             "queen_will": {
//                 title_loc: {...BASE_LANGUAGES, en: "Queen's Will"},
//                 icon: "👑",
//                     desc_loc: {...BASE_LANGUAGES, en: "Increases team stats by 10%"}
//             },
//             "thunder_strike": {
//                 title_loc: {...BASE_LANGUAGES, ru: "Карающий Раскат", en: "Thunder Strike"},
//                 icon: "⚡",
//                     desc_loc: {...BASE_LANGUAGES, ru: "Наносит 200% урона по площади", en: "Deals 200% AoE damage"}
//             },
//         },
//         hero_elements: {
//             "thunder": {title_loc: {...BASE_LANGUAGES, ru: "Молния", en: "Thunder"}, icon: "⚡", color: "#ffeb3b"},
//             "light": {title_loc: {...BASE_LANGUAGES, ru: "Свет", en: "Light"}, icon: "☀️", color: "#fff"},
//             "blood": {title_loc: {...BASE_LANGUAGES, ru: "Свет", en: "Light"}, icon: "☀️", color: "#FF0000"},
//             "ice": {title_loc: {...BASE_LANGUAGES, ru: "Лёд", en: "Ice"}, icon: "❄️", color: "#cefcff"},
//         },
//         hero_categories: {
//             "aoe": {title_loc: {...BASE_LANGUAGES, ru: "Урон по площади (AoE)", en: "AoE Damage"}},
//             "heal": {title_loc: {...BASE_LANGUAGES, ru: "Лечение", en: "Healing"}}
//         },
//         heroes: {
//             "eleniel": {
//                 title_loc: {...BASE_LANGUAGES, ru: "", en: "Eleniel Falaner"},
//                 bio_loc: {...BASE_LANGUAGES, ru: "", en: "Eleniel Falaner BIO"},
//
//                 rarity: "UR",
//                     max_level: 200,
//
//                     icon: "./gacha/assets/images/heroes/heroAvatars/eleniel.webp",
//                     image: "./gacha/assets/images/heroes/heroFullheight/eleniel.png",
//                     model: "",
//
//                     faction_id: "holy_empire",
//                     class_id: "dps",
//                     element_id: "❄️",
//                     category_ids: ["aoe"],
//
//                     skills: ["queen_will"],
//                     extra_skills: [],
//
//                     base_stats: {"hp": 1000, "atk": 250, "speed": 120},
//                 stats_growth: {"hp": 50, "atk": 25, "speed": 5},
//                 effects: [],
//
//
//                     skins: [
//                     {
//                         skin_id: "eleniel_skin_default",
//                         name_loc: {...BASE_LANGUAGES, ru: "Классический", en: "Default"},
//                         image: "./gacha/assets/images/heroes/heroFullheight/eleniel.png"
//                     },
//                     {
//                         skin_id: "eleniel_skin_beach",
//                         name_loc: {...BASE_LANGUAGES, ru: "Пляжный Повелитель", en: "Beach Lord"},
//                         image: "./gacha/assets/images/heroes/heroFullheight/eleniel.png"
//                     }
//                 ],
//                     bonds: [
//                     {
//                         target_hero_id: "rafaelAfterlife",
//                         bonus_stat_id: "atk",
//                         bonus_value: 15,
//                         desc_loc: {
//                             ...BASE_LANGUAGES,
//                             en: "Absolute Zero"
//                         }
//                     }
//                 ],
//
//                     inventory_slots: BASE_INVENTORY_SLOTS,
//                     personal_item_id: "adelina_staff",
//                     extra_inventory_slots: ["amulet"]
//             },
//             "adelina": {
//                 title_loc: {...BASE_LANGUAGES, ru: "", en: "Adelina d'Lys"},
//                 bio_loc: {...BASE_LANGUAGES, ru: "", en: "Adelina d'Lys BIO"},
//
//                 rarity: "SSR",
//                     max_level: 100,
//
//                     icon: "./gacha/assets/images/heroes/heroAvatars/adelina.webp",
//                     image: "./gacha/assets/images/heroes/heroFullheight/adelina.png",
//                     model: "",
//
//                     faction_id: "holy_empire",
//                     class_id: "support",
//                     element_id: "light",
//                     category_ids: ["heal"],
//
//                     skills: ["queen_will"],
//                     extra_skills: [],
//
//                     base_stats: {"hp": 500, "atk": 150, "speed": 90},
//                 stats_growth: {"hp": 30, "atk": 12, "speed": 2},
//                 effects: [],
//
//
//                     skins: [
//                     {
//                         skin_id: "adelina_skin_default",
//                         name_loc: {...BASE_LANGUAGES, ru: "Классический", en: "Default"},
//                         image: "./gacha/assets/images/heroes/heroFullheight/adelina.png"
//                     },
//                     {
//                         skin_id: "adelina_skin_beach",
//                         name_loc: {...BASE_LANGUAGES, ru: "Пляжный Повелитель", en: "Beach Lord"},
//                         image: "./gacha/assets/images/heroes/heroFullheight/adelina.png"
//                     }
//                 ],
//                     bonds: [
//                     {
//                         target_hero_id: "rafaelAfterlife",
//                         bonus_stat_id: "atk",
//                         bonus_value: 5,
//                         desc_loc: {
//                             ...BASE_LANGUAGES,
//                             en: "Queen and her Archmage"
//                         }
//                     }
//                 ],
//
//                     inventory_slots: BASE_INVENTORY_SLOTS,
//                     personal_item_id: "adelina_staff",
//                     extra_inventory_slots: ["amulet"]
//             },
//             "rafaelAfterlife": {
//                 title_loc: {...BASE_LANGUAGES, en: "Rafael \"Afterlife\""},
//                 rarity: "SSR",
//                     max_level: 100,
//
//                     icon: "./gacha/assets/images/heroes/heroAvatars/rafaelAfterlife.webp",
//                     image: "./gacha/assets/images/heroes/heroFullheight/rafaelAfterlife.png",
//                     model: "",
//
//
//                     faction_id: "guild_adventurers",
//                     class_id: "dps",
//                     element_id: "thunder",
//                     category_ids: ["aoe"],
//
//                     skills: ["skill_thunder_strike"],
//                     extra_skills: [],
//
//
//                     base_stats: {"hp": 500, "atk": 150, "speed": 90},
//                 stats_growth: {"hp": 30, "atk": 12, "speed": 2},
//                 effects: [],
//
//                     skins: [
//                     {
//                         skin_id: "rafaelAfterlife_skin_default",
//                         name_loc: {...BASE_LANGUAGES, en: "Default"},
//                         image: "./gacha/assets/images/heroes/heroFullheight/rafaelAfterlife.png"
//                     },
//                     {
//                         skin_id: "rafaelAfterlife_skin_beach",
//                         name_loc: {...BASE_LANGUAGES, en: "The Reaper of Queen"},
//                         image: ""
//                     }
//                 ],
//                     bonds: [
//                     {
//                         target_hero_id: "adelina_dlys",
//                         bonus_stat_id: "atk",
//                         bonus_value: 5,
//                         desc_loc: {
//                             ...BASE_LANGUAGES,
//                             en: "Queen and her Archmage"
//                         }
//                     },
//                     {
//                         target_hero_id: "eleniel",
//                         bonus_stat_id: "atk",
//                         bonus_value: 15,
//                         desc_loc: {
//                             ...BASE_LANGUAGES,
//                             en: "Absolute Zero"
//                         }
//                     }
//                 ],
//
//
//                     inventory_slots: BASE_INVENTORY_SLOTS,
//                     personal_item_id: "zeus_staff",
//                     extra_inventory_slots: ["amulet"]
//             },
//             "marishka": {
//                 title_loc: {...BASE_LANGUAGES, en: "Marishka \"The Dark\""},
//                 rarity: "SSR",
//                     max_level: 100,
//
//                     icon: "./gacha/assets/images/heroes/heroAvatars/marishka.webp",
//                     image: "./gacha/assets/images/heroes/heroFullheight/marishka.png",
//                     model: "",
//
//
//                     faction_id: "guild_adventurers",
//                     class_id: "dps",
//                     element_id: "thunder",
//                     category_ids: ["aoe"],
//
//                     skills: ["skill_thunder_strike"],
//                     extra_skills: [],
//
//
//                     base_stats: {"hp": 500, "atk": 150, "speed": 90},
//                 stats_growth: {"hp": 30, "atk": 12, "speed": 2},
//                 effects: [],
//
//                     skins: [
//                     {
//                         skin_id: "marishka_skin_default",
//                         name_loc: {...BASE_LANGUAGES, en: "Default"},
//                         image: "./gacha/assets/images/heroes/heroFullheight/marishka.png"
//                     },
//                     {
//                         skin_id: "marishka_skin_beach",
//                         name_loc: {...BASE_LANGUAGES, en: "The Reaper of Queen"},
//                         image: ""
//                     }
//                 ],
//                     bonds: [
//                     {
//                         target_hero_id: "The Reaper of Queen",
//                         bonus_stat_id: "atk",
//                         bonus_value: 5,
//                         desc_loc: {
//                             ...BASE_LANGUAGES,
//                             en: "The Reaper of Queen"
//                         }
//                     }
//                 ],
//
//
//                     inventory_slots: BASE_INVENTORY_SLOTS,
//                     personal_item_id: "zeus_staff",
//                     extra_inventory_slots: ["amulet"]
//             },
//             "anjeihydra": {
//                 title_loc: {...BASE_LANGUAGES, en: "Anjei \"Hydra\""},
//                 rarity: "SSR",
//                     max_level: 100,
//
//                     icon: "./gacha/assets/images/heroes/heroAvatars/anjeihydra.webp",
//                     image: "./gacha/assets/images/heroes/heroFullheight/anjeihydra.png",
//                     model: "",
//
//
//                     faction_id: "holy_empire",
//                     class_id: "dps",
//                     element_id: "thunder",
//                     category_ids: ["aoe"],
//
//                     skills: ["skill_thunder_strike"],
//                     extra_skills: [],
//
//
//                     base_stats: {"hp": 500, "atk": 150, "speed": 90},
//                 stats_growth: {"hp": 30, "atk": 12, "speed": 2},
//                 effects: [],
//
//                     skins: [
//                     {
//                         skin_id: "anjeihydra_skin_default",
//                         name_loc: {...BASE_LANGUAGES, en: "Default"},
//                         image: "./gacha/assets/images/heroes/heroFullheight/anjeihydra.png"
//                     },
//                     {
//                         skin_id: "anjeihydra_skin_beach",
//                         name_loc: {...BASE_LANGUAGES, en: "The Reaper of Queen"},
//                         image: ""
//                     }
//                 ],
//                     bonds: [
//                     {
//                         target_hero_id: "vanessa",
//                         bonus_stat_id: "atk",
//                         bonus_value: 5,
//                         desc_loc: {
//                             ...BASE_LANGUAGES,
//                             en: "The Reaper of Queen"
//                         }
//                     }
//                 ],
//
//
//                     inventory_slots: BASE_INVENTORY_SLOTS,
//                     personal_item_id: "zeus_staff",
//                     extra_inventory_slots: ["amulet"]
//             },
//
//
//             "selena": {
//                 title_loc: {...BASE_LANGUAGES, en: "Anjei \"Hydra\""},
//                 rarity: "UR",
//                     max_level: 100,
//
//                     icon: "./gacha/assets/images/heroes/heroAvatars/selena.webp",
//                     image: "./gacha/assets/images/heroes/heroFullheight/selena.png",
//                     model: "",
//
//
//                     faction_id: "holy_empire",
//                     class_id: "support",
//                     element_id: "blood",
//                     category_ids: ["heal"],
//
//                     skills: ["skill_thunder_strike"],
//                     extra_skills: [],
//
//
//                     base_stats: {"hp": 500, "atk": 150, "speed": 90},
//                 stats_growth: {"hp": 30, "atk": 12, "speed": 2},
//                 effects: [],
//
//                     skins: [
//                     {
//                         skin_id: "selena_skin_default",
//                         name_loc: {...BASE_LANGUAGES, en: "Default"},
//                         image: "./gacha/assets/images/heroes/heroFullheight/selena.png"
//                     },
//                     {
//                         skin_id: "anjeihydra_skin_beach",
//                         name_loc: {...BASE_LANGUAGES, en: "The Reaper of Queen"},
//                         image: ""
//                     }
//                 ],
//                     bonds: [
//
//                 ],
//
//
//                     inventory_slots: BASE_INVENTORY_SLOTS,
//                     personal_item_id: "",
//                     extra_inventory_slots: ["amulet"]
//             },
//         },
//
//         game_genres: {
//             "slots": { icon: "🎰", title_loc: { ru: "РПГ", en: "Slots" } },
//             "card": { icon: "🃏", title_loc: { ru: "РПГ", en: "Card" } },
//             "crash": { icon: "✈️", title_loc: { ru: "Аркада", en: "Crash" } }
//         },
//         game_platforms: {
//             "mobile": { icon: "📱", title_loc: { ru: "Мобильные", en: "Mobile" } },
//             "web": { icon: "🌐", title_loc: { ru: "Браузерные", en: "Web" } }
//         },
//         games: {
//             "elvenCrash": {
//             ...HERO_PROTOTYPE,
//                     title_loc: {...BASE_LANGUAGES, ru: "", en: "Elven Crash"},
//                 rarity: "SSR",
//                     max_level: 100,
//
//                     genre_id: "crash",
//                     platform_id: "web",
//                     status: "hot",
//
//                     icon: "./gacha/assets/images/games/elvenCrash.jpeg",
//                     banner: "./gacha/assets/images/games/elvenCrash.jpeg",
//             },
//             "elvenHoldem": {
//             ...HERO_PROTOTYPE,
//                     title_loc: {...BASE_LANGUAGES, ru: "", en: "Elven Holdem"},
//                 rarity: "SSR",
//                     max_level: 100,
//
//                     genre_id: "card",
//                     platform_id: "web",
//                     status: "hot",
//
//                     icon: "./gacha/assets/images/games/elvenHoldem.jpeg",
//                     banner: "./gacha/assets/images/games/elvenHoldem.jpeg",
//                     model: "./assets/models/zeus_spine.json",
//             },
//             "narutoShinobi": {
//             ...HERO_PROTOTYPE,
//                     title_loc: {...BASE_LANGUAGES, ru: "", en: "Naruto Shinobi"},
//                 rarity: "SSR",
//                     max_level: 100,
//
//                     genre_id: "slots",
//                     platform_id: "web",
//                     status: "hot",
//
//                     icon: "./gacha/assets/images/games/naruto_shinobi_slots.jpeg",
//                     banner: "./gacha/assets/images/games/naruto_shinobi_slots.jpeg",
//                     model: "./assets/models/zeus_spine.json",
//             },
//
//             "blackjack": {
//             ...HERO_PROTOTYPE,
//                     title_loc: {...BASE_LANGUAGES, ru: "", en: "Blackjack"},
//
//                 genre_id: "card",
//                     platform_id: "web",
//                     status: "",
//
//                     icon: "./gacha/assets/images/games/blackjack.jpeg",
//                     banner: "./gacha/assets/images/games/blackjack.jpeg"
//             },
//             "crash": {
//             ...HERO_PROTOTYPE,
//                     title_loc: {...BASE_LANGUAGES, ru: "", en: "Crash"},
//                 rarity: "SSR",
//                     max_level: 100,
//
//                     genre_id: "crash",
//                     platform_id: "web",
//                     status: "",
//
//                     icon: "./gacha/assets/images/games/crash.jpeg",
//                     banner: "./gacha/assets/images/games/crash.jpeg"
//             },
//             "dice": {
//             ...HERO_PROTOTYPE,
//                     title_loc: {...BASE_LANGUAGES, ru: "", en: "Dice"},
//                 rarity: "SSR",
//                     max_level: 100,
//
//                     genre_id: "card",
//                     platform_id: "web",
//                     status: "",
//
//                     icon: "./gacha/assets/images/games/dice.jpeg",
//                     banner: "./gacha/assets/images/games/dice.jpeg"
//             },
//             "hilo": {
//             ...HERO_PROTOTYPE,
//                     title_loc: {...BASE_LANGUAGES, ru: "", en: "HiLo"},
//                 rarity: "SSR",
//                     max_level: 100,
//
//                     genre_id: "card",
//                     platform_id: "web",
//                     status: "",
//
//                     icon: "./gacha/assets/images/games/hilo.jpeg",
//                     banner: "./gacha/assets/images/games/hilo.jpeg"
//             },
//             "holdem": {
//             ...HERO_PROTOTYPE,
//                     title_loc: {...BASE_LANGUAGES, ru: "", en: "holdem"},
//                 rarity: "SSR",
//                     max_level: 100,
//
//                     genre_id: "card",
//                     platform_id: "web",
//                     status: "",
//
//                     icon: "./gacha/assets/images/games/holdem.jpeg",
//                     banner: "./gacha/assets/images/games/holdem.jpeg"
//             },
//             "lottery": {
//             ...HERO_PROTOTYPE,
//                     title_loc: {...BASE_LANGUAGES, ru: "", en: "Lottery"},
//                 rarity: "SSR",
//                     max_level: 100,
//
//                     genre_id: "slots",
//                     platform_id: "web",
//                     status: "",
//
//                     icon: "./gacha/assets/images/games/lottery.jpeg",
//                     banner: "./gacha/assets/images/games/lottery.jpeg"
//             },
//
//             "mines": {
//             ...HERO_PROTOTYPE,
//                     title_loc: {...BASE_LANGUAGES, ru: "", en: "Mines"},
//                 rarity: "SSR",
//                     max_level: 100,
//
//                     genre_id: "slots",
//                     platform_id: "web",
//                     status: "",
//
//                     icon: "./gacha/assets/images/games/mines.jpeg",
//                     banner: "./gacha/assets/images/games/mines.jpeg"
//             },
//
//             "roulette": {
//             ...HERO_PROTOTYPE,
//                     title_loc: {...BASE_LANGUAGES, ru: "", en: "Roulette"},
//                 rarity: "SSR",
//                     max_level: 100,
//
//                     genre_id: "slots",
//                     platform_id: "web",
//                     status: "",
//
//                     icon: "./gacha/assets/images/games/roulette.jpeg",
//                     banner: "./gacha/assets/images/games/roulette.jpeg"
//             },
//
//             "scratch": {
//             ...HERO_PROTOTYPE,
//                     title_loc: {...BASE_LANGUAGES, ru: "", en: "Scratch"},
//                 rarity: "SSR",
//                     max_level: 100,
//
//                     genre_id: "slots",
//                     platform_id: "web",
//                     status: "",
//
//                     icon: "./gacha/assets/images/games/scratch.jpeg",
//                     banner: "./gacha/assets/images/games/scratch.jpeg"
//             },
//
//             "slots53char": {
//             ...HERO_PROTOTYPE,
//                     title_loc: {...BASE_LANGUAGES, ru: "", en: "Slots 5x3"},
//                 rarity: "SSR",
//                     max_level: 100,
//
//                     genre_id: "slots",
//                     platform_id: "web",
//                     status: "",
//
//                     icon: "./gacha/assets/images/games/slots5x3.jpeg",
//                     banner: "./gacha/assets/images/games/slots5x3.jpeg",
//
//                     // embed_url: "https://mtwtech.onrender.com/games/slots5x3char?partnerId=demo_mtwtech&mode=real&character=adelina&fullscreen=true&hidePlayer=true",
//                     embed_url: "https://mtwtech.onrender.com/games/slots5x3char?partnerId=demo_mtwtech&mode=real&fullscreen=true&hidePlayer=true",
//             },
//
//             "wof": {
//             ...HERO_PROTOTYPE,
//                     title_loc: {...BASE_LANGUAGES, ru: "", en: "Wheel of Fortune"},
//                 rarity: "SSR",
//                     max_level: 100,
//
//                     genre_id: "slots",
//                     platform_id: "web",
//                     status: "",
//
//                     icon: "./gacha/assets/images/games/wof.jpeg",
//                     banner: "./gacha/assets/images/games/wof.jpeg"
//             }
//         },
//
//         arena_types: {
//             "PREMATCH": {
//                 embed_url: "https://mtwtech.onrender.com/sport?eventType='PREMATCH'&hideSidebar=true&hidePlayer=true&fullscreen=true",
//                     min_level: 1,
//                     min_vip: 0
//             },
//             "LIVE": {
//                 embed_url: "https://mtwtech.onrender.com/sport?eventType='LIVE'&hideSidebar=true&hidePlayer=true&fullscreen=true",
//                     min_level: 1, // LiveOps условие доступа
//                     min_vip: 0
//             }
//         },
//
//         avatars: {
//             "avatar_mage": { icon: "🧙‍♂️", title_loc: { ru: "Маг", en: "Mage" } },
//             "avatar_warrior": { icon: "⚔️", title_loc: { ru: "Воин", en: "Warrior" } },
//             "avatar_god": { icon: "⚡", title_loc: { ru: "Громовержец", en: "God of Thunder" } }
//         },
//         frames: {
//             "frame_default": { color: "#444", title_loc: { ru: "Обычная", en: "Default" } },
//             "frame_vip": { color: "#ffcc00", title_loc: { ru: "Золотая VIP", en: "Golden VIP" } },
//             "frame_event": { color: "#ef4444", title_loc: { ru: "Пламя Асгарда", en: "Asgard Flame" } }
//         },
//         achievements_meta: {
//             "first_summon": {
//                 icon: "🔮",
//                     title_loc: { ru: "Первый ритуал", en: "First Ritual" },
//                 desc_loc: { ru: "Совершите свой первый призыв Божества.", en: "Perform your first deity summon." },
//                 reward: { type: "resource", id: "diamond", count: 100 }
//             },
//             "god_level_100": {
//                 icon: "⚡",
//                     title_loc: { ru: "Сила Олимпа", en: "Power of Olympus" },
//                 desc_loc: { ru: "Прокачайте 5 любых Богов до 100 уровня.", en: "Upgrade 5 any Gods to lvl 100." },
//                 reward: { type: "item", id: "zeus_staff", count: 1 }
//             }
//         }
//     },
//
//     dialogs: {
//         "FIRST_LOGIN": {
//             // Все настройки геометрии и стилей вынесены в конфиг UI
//             window_settings: {
//                 display_type: "fullscreen", // fullscreen | helper
//                     bg_image: "url('./gacha/assets/images/intro/intro_bg_1.jpg')",
//                     backgroundColor: "#050505",
//
//                     box_width: "80%",
//                     box_height: "auto",
//                     box_top: "unset",
//                     box_bottom: "5vh",
//                     box_left: "10%",
//                     box_padding: "20px",
//                     box_backgroundColor: "rgba(10, 10, 10, 0.9)",
//                     box_border: "2px solid #333",
//                     box_borderRadius: "8px",
//                     box_shadow: "0 10px 30px rgba(0,0,0,0.8)",
//
//                     speaker_color: "#ffcc00",
//                     speaker_size: "14px",
//                     text_color: "#dddddd",
//                     text_size: "12px",
//
//                     hint_loc_key: "dialog_hint_next", // Ссылка на локализацию подсказки клика
//                     hint_color: "#666",
//                     hint_size: "9px"
//             },
//             steps: [
//                 { speaker_loc_key: "story_author", text_loc_key: "story_step_1", avatar: "" },
//                 { speaker_loc_key: "story_adelina_title", text_loc_key: "story_step_2", avatar: "./gacha/assets/images/heroes/heroAvatars/adelina.webp" }
//             ]
//         },
//         "FIRST_MENU": {
//             // Все настройки геометрии и стилей вынесены в конфиг UI
//             window_settings: {
//                 display_type: "helper", // fullscreen | helper
//                     bg_image: "none",
//                     backgroundColor: "transparent",
//
//
//                     box_width: "350px",
//                     box_height: "auto",
//                     box_top: "unset",
//                     box_bottom: "20px",
//                     box_left: "20px", // Отключаем лево, если позиционируем по правому краю
//                     box_right: "unset",
//                     box_padding: "15px",
//                     box_backgroundColor: "rgba(20, 20, 20, 0.95)",
//                     box_border: "1px solid #ffcc00",
//                     box_borderRadius: "6px",
//                     box_shadow: "0 4px 15px rgba(0,0,0,0.6)",
//
//                     speaker_color: "#ffcc00",
//                     speaker_size: "13px",
//                     text_color: "#fff",
//                     text_size: "12px",
//
//                     hint_loc_key: "dialog_hint_next",
//                     hint_color: "#999",
//                     hint_size: "10px"
//             },
//             steps: [
//                 { speaker_loc_key: "story_adelina_title", text_loc_key: "helper_menu_tutorial", avatar: "./gacha/assets/images/heroes/heroAvatars/adelina.webp" }
//             ]
//         },
//         "OPEN_HEROES_FIRST_TIME": {
//             window_settings: {
//                 display_type: "helper",
//                     bg_image: "none",
//                     backgroundColor: "transparent",
//
//                     box_width: "350px",
//                     box_height: "auto",
//                     box_top: "unset",
//                     box_bottom: "20px",
//                     box_left: "unset", // Отключаем лево, если позиционируем по правому краю
//                     box_right: "20px",
//                     box_padding: "15px",
//                     box_backgroundColor: "rgba(20, 20, 20, 0.95)",
//                     box_border: "1px solid #ffcc00",
//                     box_borderRadius: "6px",
//                     box_shadow: "0 4px 15px rgba(0,0,0,0.6)",
//
//                     speaker_color: "#ffcc00",
//                     speaker_size: "13px",
//                     text_color: "#fff",
//                     text_size: "12px",
//
//                     hint_loc_key: "dialog_hint_next",
//                     hint_color: "#999",
//                     hint_size: "10px"
//             },
//             steps: [
//                 { speaker_loc_key: "story_adelina_title", text_loc_key: "helper_heroes_tutorial", avatar: "./gacha/assets/images/heroes/heroAvatars/adelina.webp" }
//             ]
//         }
//     },
//
//     shops: {
//         basic: {
//             title_loc: {...BASE_LANGUAGES, ru: "Обычный магазин", en: "🔮 Standard shopp" },
//             order: 1,
//                 catalog: [
//                 {
//                     id: "shop_scroll_1",
//                     itemId: "scroll_epic",
//                     cost_gems: 50,
//                     amount: 1,
//                     title_loc: {...BASE_LANGUAGES, ru: "Свиток Бога (СКИДКА)", en: "God Scroll (SALE)"}
//                 },
//                 {
//                     id: "shop_staff_god",
//                     itemId: "zeus_staff",
//                     cost_gems: 500,
//                     amount: 1,
//                     title_loc: {...BASE_LANGUAGES, ru: "⚡ Посох Зевса", en: "⚡ Staff of Zeus"}
//                 }
//             ]
//         },
//         vip: {
//             title_loc: {...BASE_LANGUAGES,  ru: "Вип Магазин", en: "Vip shop" },
//             order: 2,
//                 catalog: [
//                 {
//                     id: "shop_scroll_1",
//                     itemId: "scroll_epic",
//                     cost_gems: 50,
//                     amount: 1,
//                     title_loc: {...BASE_LANGUAGES, ru: "Свиток Бога (СКИДКА)", en: "God Scroll (SALE)"}
//                 },
//                 {
//                     id: "shop_staff_god",
//                     itemId: "zeus_staff",
//                     cost_gems: 500,
//                     amount: 1,
//                     title_loc: {...BASE_LANGUAGES, ru: "⚡ Посох Зевса", en: "⚡ Staff of Zeus"}
//                 }
//             ]
//         }
//     },
//
//     gacha: {
//         rules: {
//             max_standard_diamond_daily: 20,
//                 convert_duplicates_to_shards: false,
//         },
//         banners: [
//             {
//                 id: "banner_standard",
//                 banner_type: "standard",
//                 poolId: "standard_pool",
//                 cost_item_id: "scroll_epic",
//                 cost_amount: 1,
//                 pity_threshold: 10,
//                 title_loc: {...BASE_LANGUAGES,  ru: "🔮 Стандартный Призыв", en: "🔮 Standard Summon" }
//             },
//             {
//                 id: "banner_zeus_event",
//                 banner_type: "event",
//                 poolId: "zeus_event_pool",
//                 cost_item_id: "scroll_event",
//                 cost_amount: 1,
//                 pity_threshold: 3,
//                 title_loc: {...BASE_LANGUAGES,  ru: "⚡ Лимитированный Ритуал Зевса", en: "⚡ Limited Zeus Ritual" }
//             },
//             {
//                 id: "banner_friendship",
//                 banner_type: "friendship",
//                 poolId: "friendship_pool",
//                 cost_item_id: "currency_friendship_points",
//                 cost_amount: 100,
//                 pity_threshold: 0,
//                 title_loc: {...BASE_LANGUAGES,  ru: "🤝 Призыв Дружбы", en: "🤝 Friendship Summon" }
//             }
//         ],
//             pools: {
//             "standard": {
//                 cost: 1,
//                     currency: 'scroll_epic',
//                     modes: [1, 10],
//                     rates: { "SSR": 5, "SR": 25, "R": 70 },
//                 heroes: { "SSR": ["hero_arturia"], "SR": [], "R": ["hero_goblin"] },
//             },
//             "zeus_event": {
//                 cost: 2000,
//                     currency: 'diamond',
//                     modes: [1, 5],
//                     rates: { "SSR": 30, "SR": 0, "R": 70 },
//                 heroes: { "SSR": ["hero_zeus"], "SR": [], "R": ["hero_goblin"] }
//             },
//             "friendship": {
//                 cost: 1000,
//                     currency: 'friendship',
//                     modes: [1, 10],
//                     rates: { "SSR": 0, "SR": 10, "R": 90 },
//                 heroes: { "SSR": [], "SR": [], "R": ["hero_goblin"] }
//             }
//         },
//     },
// }

// "game_casino": {
//     orientation: "landscape",
//         servers: [
//         {id: "world_01", name: {...BASE_LANGUAGES, ru: "S1: Олимп", en: "S1: Olympus"}, status: "hot", text: {...BASE_LANGUAGES, ru: "Рекомендуемый мир", en:"Recommended"}}
//     ],
//         languages: BASE_LANGUAGES,
//
//         mechanics: {
//         resources: {
//             "gold": {
//                 icon: "🔮",
//                     title_loc: {...BASE_LANGUAGES, ru: "Золото", en: "Gold"},
//                 desc_loc: {...BASE_LANGUAGES, ru: "Основные деньги.", en: "Main money."}
//             },
//             "exp": {
//                 icon: "🔮",
//                     title_loc: {...BASE_LANGUAGES, ru: "Золото", en: "Exp"},
//                 desc_loc: {...BASE_LANGUAGES, ru: "Ресурс усиления героев.", en: "Hero level up resource."}
//             },
//             "diamond": {
//                 icon: "🔮",
//                     title_loc: {...BASE_LANGUAGES, ru: "Золото", en: "Diamond"},
//                 desc_loc: {...BASE_LANGUAGES, ru: "ВИП деньги.", en: "VIP money."}
//             },
//             "friendship": {
//                 icon: "🔮",
//                     title_loc: {...BASE_LANGUAGES, ru: "Дружба", en: "Friendship"},
//                 desc_loc: {...BASE_LANGUAGES, ru: "Жетоны дружбы.", en: "Friendship badges."}
//             },
//         },
//         stats: {
//             "hp": {...BASE_STATS.hp, order: 1, icon: "❤️", display: "int", rating_weight: 0.1},
//             "armor": {...BASE_STATS.armor, order: 2, icon: "🛡️", display: "int", rating_weight: 1.5},
//             "atk": {...BASE_STATS.atk, order: 3, icon: "⚔️", display: "int", rating_weight: 2.0},
//             "crit": {...BASE_STATS.crit, order: 4, icon: "🎯", display: "percent", rating_weight: 5.0},
//             "dodge": {...BASE_STATS.dodge, order: 5, icon: "💨", display: "percent", rating_weight: 4.0}
//         },
//         effects: {
//             "eff_stat_boost_percent": {...BASE_EFFECT_STATS, polarity: "buff", type: "stat_mod", desc_loc_key: "eff_stat_boost"},
//             "eff_chain_lightning": {...BASE_EFFECT_STATS, polarity: "buff", type: "trigger", desc_loc_key: "eff_lightning"},
//             "eff_damage_reduction": {...BASE_EFFECT_STATS, polarity: "buff", type: "stat_mod", desc_loc_key: "eff_shield"}
//         },
//         rarities: {
//             hero: ["R", "SR", "SSR", "UR"],
//                 items: ["R", "SR", "SSR"],
//         },
//         inventory_slots: BASE_INVENTORY_SLOTS,
//             prototypes: {
//             "hero": HERO_PROTOTYPE,
//                 "team": {
//                 size: 5,
//                     position: [1,2,2],
//                     bonuses: {
//                     faction: {
//                         "3": {
//                             "hp": "5%",
//                                 "atk": "5%",
//                         },
//                         "4": {
//                             "hp": "10%",
//                                 "atk": "10%",
//                         },
//                         "5": {
//                             "hp": "15%",
//                                 "atk": "15%",
//                         },
//                     }
//                 },
//                 additional: {
//                     beasts: 3,
//                 },
//             }
//         }
//     },
//
//     ui: {
//         landscape: [
//             {
//                 id: "player_bar",
//                 type: "text_panel",
//                 layout: {
//                     top: "35px",
//                     left: "15% + 5px",
//                     width: "30%",
//                     height: "60px",
//                     backgroundColor: "#222"
//                 }
//             },
//             {
//                 id: "resource_bar",
//                 type: "text_panel",
//                 layout: {
//                     top: "25px",
//                     right: "105px",
//                     width: "200px",
//                     height: "40px",
//
//                     backgroundColor: "#222",
//
//                     textColor: "#ffeb3b",
//                     textSize: "20px",
//                     textPosition: "bottom"
//                 }
//             },
//             {
//                 id: "btn_casino",
//                 type: "button",
//                 label_loc_key: "btn_casino_label",
//                 action: "open_heroes",
//                 layout: {
//                     top: "60% - 5px",
//                     left: "11% + 5px",
//                     width: "22%",
//                     height: "80%",
//
//                     backgroundColor: "transparent",
//
//                     textColor: "#fff",
//                     textSize: "20px",
//                     textPosition: "bottom"
//                 }
//             },
//             {
//                 id: "btn_sport",
//                 type: "button",
//                 label_loc_key: "btn_sport_label",
//                 action: "open_inventory",
//                 layout: {
//                     top: "45%",
//                     left: "50%",
//                     width: "38%",
//                     height: "40%",
//
//                     backgroundColor: "transparent",
//
//                     textColor: "#fff",
//                     textSize: "20px",
//                     textPosition: "bottom"
//                 }
//             },
//             {
//                 id: "btn_cashier",
//                 type: "button",
//                 label_loc_key: "btn_cashier_label",
//                 action: "open_shop",
//                 layout: {
//                     top: "55%",
//                     right: "13%",
//                     width: "18%",
//                     height: "80%",
//
//                     backgroundColor: "transparent",
//
//                     textColor: "#fff",
//                     textSize: "20px",
//                     textPosition: "bottom"
//
//                 }
//             },
//             {
//                 id: "btn_back",
//                 type: "button",
//                 label_loc_key: "btn_back_label",
//                 action: "go_back",
//                 onlyInWindows: true,
//                 layout: {top: "45px", right: "50px", width: "60px", height: "60px", backgroundColor: "#e53935"}
//             },
//
//             {
//                 id: "screen_main_menu",
//                 bg_image: "./gacha/assets/images/bg224.webp",
//                 bg_width: 1200,
//                 active_width: 1000,
//             },
//             {
//                 id: "screen_shop",
//                 bg_image: "",
//                 bg_width: 1000,
//                 active_width: 1000,
//             },
//             {
//                 id: "screen_shop",
//                 bg_image: "",
//                 bg_width: 1000,
//                 active_width: 1000,
//             },
//         ]
//     },
//
//     localization: {
//         ui: {
//             "ru": {
//                 "game_title": "⚡ Combat Stars: Эпоха Богов",
//                     "btn_shop_label": "Магазин гемов",
//                     "btn_heroes_label": "Пантеон Богов",
//                     "btn_inventory_label": "Сокровищница",
//                     "btn_gacha_label": "Призыв Богов",
//                     "btn_temple_power_label": "Замок мощи",
//                     "btn_back_label": "↩️ Назад",
//
//                     "profile_vip": "VIP Уровень",
//                     "profile_server": "Сервер",
//                     "profile_online": "Время в игре",
//                     "profile_online_val": "{value} мин.",
//                     "profile_server_time": "Время сервера",
//
//                     "server_select_title": "ВЫБОР ИГРОВОГО СЕРВЕРА",
//                     "shop_title": "ВНУТРИИГРОВОЙ МАГАЗИН",
//                     "shop_buy_btn": "Купить",
//                     "inventory_title": "🎒 ПРЕДМЕТЫ НА АККАУНТЕ",
//                     "inventory_empty": "Рюкзак пуст...",
//                     "inventory_type_meta": "Валюта/Снаряжение",
//                     "heroes_title": "👤 ТВОЙ ПАНТЕОН БОГОВ",
//                     "heroes_lvl": "Уровень",
//                     "heroes_slot_weapon": "Слот оружия",
//                     "heroes_slot_empty": "Свободен",
//                     "heroes_equip_btn": "Надеть",
//
//                     "gacha_title": "РИТУАЛ ПРИЗЫВА БОГОВ",
//                     "gacha_chances": "Шансы Богов: SSR — 30%, R — 70%",
//                     "gacha_pity": "До гарантированного SSR Божества: {value} ритуалов",
//                     "gacha_scrolls": "Древних свитков в наличии: {value} шт.",
//                     "gacha_btn": "НАЧАТЬ РИТУАЛ",
//                     "alert_buy_success": "Покупка совершена успешно!",
//                     "alert_equip_success": "Снаряжение успешно изменено!",
//                     "alert_login_error": "Ошибка подключения к игровому серверу!",
//                     "alert_summon_new": "🆕 Новый экземпляр!",
//                     "alert_summon_dup": "➡️ Конвертирован в 10 осколков",
//
//                     "gacha_alert_title": "🔮 РИТУАЛ ЗАВЕРШЕН",
//                     "gacha_alert_new": "🆕 Новый экземпляр!",
//                     "gacha_alert_dup": "➡️ Конвертирован в 10 осколков",
//             },
//             "en": {
//                 "game_title": "MTWTech",
//                     "btn_cashier_label": "Cashier",
//                     "btn_sport_label": "Sportsbook",
//                     "btn_casino_label": "Casino",
//
//                     "btn_back_label": "↩️ Back",
//
//                     "profile_vip": "VIP Level",
//                     "profile_server": "Server",
//                     "profile_online": "Online Time",
//                     "profile_online_val": "{value} min.",
//                     "profile_server_time": "Server Time",
//
//                     "server_select_title": "SELECT GAME SERVER",
//                     "shop_title": "IN-GAME SHOP",
//                     "shop_buy_btn": "Buy",
//                     "inventory_title": "🎒 ACCOUNT ITEMS",
//                     "inventory_empty": "Bag is empty...",
//                     "inventory_type_meta": "Currency/Gear",
//                     "heroes_title": "YOUR GAME COLLECTION",
//                     "heroes_lvl": "Level",
//                     "heroes_slot_weapon": "Weapon Slot",
//                     "heroes_slot_empty": "Empty",
//                     "heroes_equip_btn": "Equip",
//
//                     "gacha_title": "RITUAL OF GODLY SUMMON",
//                     "gacha_chances": "Godly Chances: SSR — 30%, R — 70%",
//                     "gacha_pity": "Until guaranteed SSR Deity: {value} rituals",
//                     "gacha_scrolls": "Ancient scrolls in stock: {value} pcs.",
//                     "gacha_btn": "START RITUAL",
//                     "alert_buy_success": "Purchase successful!",
//                     "alert_equip_success": "Equipment changed successfully!",
//                     "alert_login_error": "Failed to connect to the game server!",
//                     "alert_summon_new": "🆕 New instance!",
//                     "alert_summon_dup": "➡️ Converted into 10 shards",
//
//                     "gacha_alert_title": "🔮 SUMMON COMPLETED",
//                     "gacha_alert_new": "🆕 New instance!",
//                     "gacha_alert_dup": "➡️ Converted into 10 shards",
//             }
//         },
//         stats: {
//             "ru": {
//                 "stat_hp": "Здоровье",
//                     "stat_armor": "Броня",
//                     "stat_atk": "Атака",
//                     "stat_crit": "Крит",
//                     "stat_dodge": "Уворот"
//             },
//             "en": {
//                 "stat_hp": "HP",
//                     "stat_armor": "Armor",
//                     "stat_atk": "Attack",
//                     "stat_crit": "Crit",
//                     "stat_dodge": "Dodge"
//             }
//         },
//         effects: {
//             "ru": {
//                 "eff_stat_boost": "Увеличивает выбранный стат на {value}%",
//                     "eff_lightning": "⚡ Цепная молния: {value}% шанс поразить молнией всех врагов при ударе",
//                     "eff_shield": "🛡️ Щит Короля: Снижает весь входящий урон на {value}%"
//             },
//             "en": {
//                 "eff_stat_boost": "Increases selected stat by {value}%",
//                     "eff_lightning": "⚡ Chain Lightning: {value}% chance to strike all enemies on hit",
//                     "eff_shield": "🛡️ King's Shield: Reduces all incoming damage by {value}%"
//             }
//         },
//     },
//
//
//     catalog: {
//         items: {
//             "scroll_epic": {
//                 category: "currency",
//                     rarity: "SR",
//                     is_usable: false,
//                     icon: "🔮",
//                     expiration: null,
//                     title_loc: {...BASE_LANGUAGES, ru: "Древний свиток", en: "Ancient Scroll"},
//                 desc_loc: {...BASE_LANGUAGES, ru: "Используется во Вратах Призыва.", en: "Used in the Summon Gate."}
//             },
//             "rusty_sword": {
//                 category: "equipment",
//                     rarity: "R",
//                     is_usable: false,
//                     slot: "weapon",
//                     icon: "⚔️",
//                     expiration: null,
//                     stats: {"stat_atk": 15, "stat_crit": 3},
//                 effects: [],
//                     title_loc: {...BASE_LANGUAGES, ru: "Ржавый меч", en: "Rusty Sword"},
//                 desc_loc: {...BASE_LANGUAGES, ru: "Старый потрепанный клинок.", en: "An old battered blade."}
//             },
//             "zeus_staff": {
//                 category: "equipment",
//                     rarity: "SSR",
//                     is_usable: false,
//                     slot: "weapon",
//                     icon: "⚡",
//                     expiration: null,
//                     stats: {"stat_atk": 150},
//                 effects: [{effect_id: "eff_chain_lightning", value: 35}, {
//                     effect_id: "eff_stat_boost_percent",
//                     value: 10,
//                     target_stat_id: "stat_atk"
//                 }],
//                     title_loc: {...BASE_LANGUAGES, ru: "⚡ Посох Громовержца", en: "⚡ Staff of Thunder"},
//                 desc_loc: {...BASE_LANGUAGES, ru: "Артефакт Самого Зевса.", en: "Artifact of Zeus himself."}
//             },
//             "event_elixir": {
//                 category: "consumable",
//                     rarity: "SSR",
//                     is_usable: true,
//                     icon: "🧪",
//                     expiration: 1781347200000,
//                     payload: {action: "grant_resource", resource: "gems", amount: 2000},
//                 title_loc: {...BASE_LANGUAGES, ru: "🧪 Пыльца Асгарда", en: "🧪 Asgard Dust"},
//                 desc_loc: {...BASE_LANGUAGES, ru: "Дарует 2000 гемов.", en: "Grants 2000 gems."}
//             }
//         },
//         factions: {
//             "olympus": {
//                 title_loc: {...BASE_LANGUAGES, ru: "Олимп", en: "Olympus"},
//                 icon: "⚡",
//                     desc_loc: {...BASE_LANGUAGES, ru: "Боги грома и молний", en: "Gods of thunder and lightning"}
//             },
//             "asgard": {
//                 title_loc: {...BASE_LANGUAGES, ru: "Асгард", en: "Asgard"},
//                 icon: "🛡️",
//                     desc_loc: {...BASE_LANGUAGES, ru: "Скандинавские воины", en: "Norse warriors"}
//             }
//         },
//         classes: {
//             "cls_tank": {
//                 title_loc: {...BASE_LANGUAGES, ru: "Танк", en: "Tank"},
//                 icon: "🛡️",
//                     desc_loc: {...BASE_LANGUAGES, ru: "Защищает союзников, впитывает урон", en: "Protects allies, absorbs damage"}
//             },
//             "cls_dps": {
//                 title_loc: {...BASE_LANGUAGES, ru: "Боец (DPS)", en: "DPS"},
//                 icon: "⚔️",
//                     desc_loc: {...BASE_LANGUAGES, ru: "Наносит колоссальный урон", en: "Deals massive damage"}
//             },
//             "cls_support": {
//                 title_loc: {...BASE_LANGUAGES, ru: "Поддержка", en: "Support"},
//                 icon: "🧪",
//                     desc_loc: {...BASE_LANGUAGES, ru: "Исцеляет и баффает команду", en: "Heals and buffs the team"}
//             }
//         },
//
//         skills: {
//             "skill_thunder_strike": {
//                 title_loc: {...BASE_LANGUAGES, ru: "Карающий Раскат", en: "Thunder Strike"},
//                 icon: "⚡",
//                     desc_loc: {...BASE_LANGUAGES, ru: "Наносит 200% урона по площади", en: "Deals 200% AoE damage"}
//             },
//             "skill_king_will": {
//                 title_loc: {...BASE_LANGUAGES, ru: "Воля Короля", en: "King's Will"},
//                 icon: "👑",
//                     desc_loc: {...BASE_LANGUAGES, ru: "Повышает защиту всей команды на 20%", en: "Increases team defense by 20%"}
//             }
//         },
//         hero_elements: {
//             "elem_thunder": {title_loc: {...BASE_LANGUAGES, ru: "Молния", en: "Thunder"}, icon: "⚡", color: "#ffeb3b"},
//             "elem_light": {title_loc: {...BASE_LANGUAGES, ru: "Свет", en: "Light"}, icon: "☀️", color: "#fff"}
//         },
//         hero_categories: {
//             "cat_aoe": {title_loc: {...BASE_LANGUAGES, ru: "Урон по площади (AoE)", en: "AoE Damage"}},
//             "cat_heal": {title_loc: {...BASE_LANGUAGES, ru: "Лечение", en: "Healing"}}
//         },
//         heroes: {
//             "elvenCrash": {
//             ...HERO_PROTOTYPE,
//                     title_loc: {...BASE_LANGUAGES, ru: "", en: "Elven Crash"},
//                 rarity: "SSR",
//                     max_level: 100,
//
//
//                     icon: "⚡",
//                     image: "./gacha/assets/images/elvenCrash.jpeg",
//                     model: "./assets/models/zeus_spine.json",
//             },
//             "elvenHoldem": {
//             ...HERO_PROTOTYPE,
//                     title_loc: {...BASE_LANGUAGES, ru: "", en: "Elven Holdem"},
//                 rarity: "SSR",
//                     max_level: 100,
//
//
//                     icon: "⚡",
//                     image: "./gacha/assets/images/elvenHoldem.jpeg",
//                     model: "./assets/models/zeus_spine.json",
//             },
//             "narutoShinobi": {
//             ...HERO_PROTOTYPE,
//                     title_loc: {...BASE_LANGUAGES, ru: "", en: "Naruto Shinobi"},
//                 rarity: "SSR",
//                     max_level: 100,
//
//
//                     icon: "⚡",
//                     image: "./gacha/assets/images/narutoShinobi.jpeg",
//                     model: "./assets/models/zeus_spine.json",
//             }
//         }
//     },
//
//     shops: {
//         basic: {
//             title_loc: {...BASE_LANGUAGES, ru: "Обычный магазин", en: "🔮 Standard shopp" },
//             order: 1,
//                 catalog: [
//                 {
//                     id: "shop_scroll_1",
//                     itemId: "scroll_epic",
//                     cost_gems: 50,
//                     amount: 1,
//                     title_loc: {...BASE_LANGUAGES, ru: "Свиток Бога (СКИДКА)", en: "God Scroll (SALE)"}
//                 },
//                 {
//                     id: "shop_staff_god",
//                     itemId: "zeus_staff",
//                     cost_gems: 500,
//                     amount: 1,
//                     title_loc: {...BASE_LANGUAGES, ru: "⚡ Посох Зевса", en: "⚡ Staff of Zeus"}
//                 }
//             ]
//         },
//         vip: {
//             title_loc: {...BASE_LANGUAGES,  ru: "Вип Магазин", en: "Vip shop" },
//             order: 2,
//                 catalog: [
//                 {
//                     id: "shop_scroll_1",
//                     itemId: "scroll_epic",
//                     cost_gems: 50,
//                     amount: 1,
//                     title_loc: {...BASE_LANGUAGES, ru: "Свиток Бога (СКИДКА)", en: "God Scroll (SALE)"}
//                 },
//                 {
//                     id: "shop_staff_god",
//                     itemId: "zeus_staff",
//                     cost_gems: 500,
//                     amount: 1,
//                     title_loc: {...BASE_LANGUAGES, ru: "⚡ Посох Зевса", en: "⚡ Staff of Zeus"}
//                 }
//             ]
//         }
//     },
//
//     gacha: {
//         rules: {
//             max_standard_diamond_daily: 20,
//                 convert_duplicates_to_shards: false,
//         },
//         banners: [
//             {
//                 id: "banner_standard",
//                 banner_type: "standard",
//                 poolId: "standard_pool",
//                 cost_item_id: "scroll_epic",
//                 cost_amount: 1,
//                 pity_threshold: 10,
//                 title_loc: {...BASE_LANGUAGES,  ru: "🔮 Стандартный Призыв", en: "🔮 Standard Summon" }
//             },
//             {
//                 id: "banner_zeus_event",
//                 banner_type: "event",
//                 poolId: "zeus_event_pool",
//                 cost_item_id: "scroll_event",
//                 cost_amount: 1,
//                 pity_threshold: 3,
//                 title_loc: {...BASE_LANGUAGES,  ru: "⚡ Лимитированный Ритуал Зевса", en: "⚡ Limited Zeus Ritual" }
//             },
//             {
//                 id: "banner_friendship",
//                 banner_type: "friendship",
//                 poolId: "friendship_pool",
//                 cost_item_id: "currency_friendship_points",
//                 cost_amount: 100,
//                 pity_threshold: 0,
//                 title_loc: {...BASE_LANGUAGES,  ru: "🤝 Призыв Дружбы", en: "🤝 Friendship Summon" }
//             }
//         ],
//             pools: {
//             "standard": {
//                 cost: 1,
//                     currency: 'scroll_epic',
//                     modes: [1, 10],
//                     rates: { "SSR": 5, "SR": 25, "R": 70 },
//                 heroes: { "SSR": ["hero_arturia"], "SR": [], "R": ["hero_goblin"] },
//             },
//             "zeus_event": {
//                 cost: 2000,
//                     currency: 'diamond',
//                     modes: [1, 5],
//                     rates: { "SSR": 30, "SR": 0, "R": 70 },
//                 heroes: { "SSR": ["hero_zeus"], "SR": [], "R": ["hero_goblin"] }
//             },
//             "friendship": {
//                 cost: 1000,
//                     currency: 'friendship',
//                     modes: [1, 10],
//                     rates: { "SSR": 0, "SR": 10, "R": 90 },
//                 heroes: { "SSR": [], "SR": [], "R": ["hero_goblin"] }
//             }
//         },
//     },
// },

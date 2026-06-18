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
            resources: {
                "gold": {
                    icon: "🔮",
                    title_loc: {...BASE_LANGUAGES, ru: "Золото", en: "Gold"},
                    desc_loc: {...BASE_LANGUAGES, ru: "Основные деньги.", en: "Main money."}
                },
                "exp": {
                    icon: "🔮",
                    title_loc: {...BASE_LANGUAGES, ru: "Золото", en: "Exp"},
                    desc_loc: {...BASE_LANGUAGES, ru: "Ресурс усиления героев.", en: "Hero level up resource."}
                },
                "diamond": {
                    icon: "🔮",
                    title_loc: {...BASE_LANGUAGES, ru: "Золото", en: "Diamond"},
                    desc_loc: {...BASE_LANGUAGES, ru: "ВИП деньги.", en: "VIP money."}
                },
                "friendship": {
                    icon: "🔮",
                    title_loc: {...BASE_LANGUAGES, ru: "Дружба", en: "Friendship"},
                    desc_loc: {...BASE_LANGUAGES, ru: "Жетоны дружбы.", en: "Friendship badges."}
                },
            },
            stats: {
                "hp": {...BASE_STATS.hp, order: 1, icon: "❤️", display: "int", rating_weight: 0.1},
                "armor": {...BASE_STATS.armor, order: 2, icon: "🛡️", display: "int", rating_weight: 1.5},
                "atk": {...BASE_STATS.atk, order: 3, icon: "⚔️", display: "int", rating_weight: 2.0},
                "crit": {...BASE_STATS.crit, order: 4, icon: "🎯", display: "percent", rating_weight: 5.0},
                "dodge": {...BASE_STATS.dodge, order: 5, icon: "💨", display: "percent", rating_weight: 4.0}
            },
            effects: {
                "eff_stat_boost_percent": {...BASE_EFFECT_STATS, polarity: "buff", type: "stat_mod", desc_loc_key: "eff_stat_boost"},
                "eff_chain_lightning": {...BASE_EFFECT_STATS, polarity: "buff", type: "trigger", desc_loc_key: "eff_lightning"},
                "eff_damage_reduction": {...BASE_EFFECT_STATS, polarity: "buff", type: "stat_mod", desc_loc_key: "eff_shield"}
            },
            rarities: {
                hero: ["R", "SR", "SSR", "UR"],
                game: ["R", "SR", "SSR", "UR"],
                items: ["R", "SR", "SSR"],
            },
            inventory_slots: BASE_INVENTORY_SLOTS,
            prototypes: {
                "hero": HERO_PROTOTYPE,
                "team": {
                    size: 5,
                    position: [1,2,2],
                    bonuses: {
                        faction: {
                            "3": {
                                "hp": "5%",
                                "atk": "5%",
                            },
                            "4": {
                                "hp": "10%",
                                "atk": "10%",
                            },
                            "5": {
                                "hp": "15%",
                                "atk": "15%",
                            },
                        }
                    },
                    additional: {
                        beasts: 3,
                    },
                }
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
                    id: "screen_main_menu",
                    bg_image: "./gacha/assets/images/main_menu_bg_4.png",
                    bg_width: 1200,
                    scrollable: false,
                    active_width: 1000,
                    home_hero_layout: {
                        top: "20%",         // Позиция по вертикали на панораме
                        left: "15%",        // Позиция по горизонтали (например, по центру хаба)
                        height: "100%",      // Высота персонажа относительно экрана (например, в полный рост)
                        zIndex: 3,          // Помещаем за бары интерфейса, но перед фоном арта
                        animation: "idle_pulse" // Конфигурируемый класс анимации (например, легкое покачивание)
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
                    action: "open_temple_power",
                    layout: {
                        top: "61%",
                        right: "10% + 5px",
                        width: "20%",
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
                {
                    id: "screen_server_select",
                    bg_image: "./gacha/assets/images/server_select_bg.png", // Фон самого экрана арены
                    bg_width: 1000,
                    active_width: 1000,
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
                    bg_image: "",
                    bg_width: 1000,
                    active_width: 1000,
                    // Вот правильное место для Data-Driven структуры блоков интерфейса!
                    view_layout: ['menu', 'avatar', 'content'],
                    menu_tabs: ['stats','inventory','stars','bonds','bio']
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
                },
                {
                    id: "screen_profile",
                    bg_image: "./gacha/assets/images/backgrounds/profile_bg.png", // Фон окна профиля
                    bg_width: 1000,
                    active_width: 1000,

                    // Настраиваемый порядок и состав вкладок профиля (Пункт 5 твоего ТЗ)
                    profile_layout: {
                        // Задаем порядок табов. B2B-клиент может менять их местами, удалять или добавлять свои
                        tabs_order: ["main", "achievements", "transactions", "match_history", "promo", "social_bind"],

                        // Спецификация полей для таблицы истории транзакций (Пункт 3 твоего ТЗ)
                        transaction_fields: [
                            { id: "timestamp", label_loc_key: "tx_date", type: "date" },
                            { id: "pack_id", label_loc_key: "tx_product", type: "loc_string" },
                            { id: "cost", label_loc_key: "tx_cost", type: "number" },
                            { id: "status", label_loc_key: "tx_status", type: "string" }
                        ],

                        // Спецификация полей для таблицы истории игр/боев (Пункт 4 твоего ТЗ)
                        match_history_fields: [
                            { id: "timestamp", label_loc_key: "match_date", type: "date" },
                            { id: "game_id", label_loc_key: "match_game", type: "loc_string" },
                            { id: "result", label_loc_key: "match_result", type: "badge" }, // Win / Lose с подсветкой
                            { id: "reward", label_loc_key: "match_reward", type: "resource" }
                        ]
                    }
                },
                {
                    id: "screen_arena",
                    bg_image: "./gacha/assets/images/arena/arena_bg.jpg", // Фон самого экрана арены
                    bg_width: 1000,
                    active_width: 1000,
                    // Настраиваемые интерактивные кнопки режимов Арены (прямо как в главном меню)
                    arena_widgets: [
                        {
                            id: "PREMATCH",
                            label_loc_key: "arena_standard_title",
                            arena_type_id: "PREMATCH", // Ссылка на правила из каталога
                            layout: {
                                top: "50%",
                                left: "25%",
                                width: "35%",
                                height: "50%",
                                backgroundColor: "transparent",
                                backgroundImage: "url('./gacha/assets/images/arena/PREMATCH.png')",
                                textColor: "#fff",
                                textSize: "18px",
                                textPosition: "bottom"
                            }
                        },
                        {
                            id: "LIVE",
                            label_loc_key: "arena_event_title",
                            arena_type_id: "LIVE",
                            layout: {
                                top: "50%",
                                left: "75%",
                                width: "35%",
                                height: "50%",
                                backgroundColor: "transparent",
                                backgroundImage: "url('./gacha/assets/images/arena/LIVE.png')",
                                textColor: "#ffcc00",
                                textSize: "18px",
                                textPosition: "bottom"
                            }
                        }
                    ]
                }
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

                    "game_title": "⚡ Combat Stars: Age of Gods",
                    "btn_shop_label": "Shop",
                    "btn_heroes_label": "Heroes",
                    "btn_games_label": "Games of Luck",
                    "btn_inventory_label": "Treasury",
                    "btn_gacha_label": "Summon",
                    "btn_temple_power_label": "Castle of Power",
                    "btn_arena_label": "PvP",
                    "btn_back_label": "✖",

                    "profile_vip": "VIP Level",
                    "profile_server": "Server",
                    "profile_online": "Online Time",
                    "profile_online_val": "{value} min.",
                    "profile_server_time": "Server Time",

                    "server_select_title": "SELECT GAME SERVER",
                    "shop_title": "IN-GAME SHOP",
                    "shop_buy_btn": "Buy",
                    "inventory_title": "🎒 ACCOUNT ITEMS",
                    "inventory_empty": "Bag is empty...",
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
                    "companion_game_idle": "Stay focused, victory is near."
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
                    expiration: null,
                    title_loc: {...BASE_LANGUAGES, ru: "Древний свиток", en: "Ancient Scroll"},
                    desc_loc: {...BASE_LANGUAGES, ru: "Используется во Вратах Призыва.", en: "Used in the Summon Gate."}
                },
                "rusty_sword": {
                    category: "equipment",
                    rarity: "R",
                    is_usable: false,
                    slot: "weapon",
                    icon: "⚔️",
                    expiration: null,
                    stats: {"atk": 15, "crit": 3},
                    effects: [],
                    title_loc: {...BASE_LANGUAGES, ru: "Ржавый меч", en: "Rusty Sword"},
                    desc_loc: {...BASE_LANGUAGES, ru: "Старый потрепанный клинок.", en: "An old battered blade."}
                },
                "zeus_staff": {
                    category: "equipment",
                    rarity: "SSR",
                    is_usable: false,
                    slot: "weapon",
                    icon: "⚡",
                    expiration: null,
                    stats: {"atk": 150},
                    effects: [{effect_id: "eff_chain_lightning", value: 35}, {
                        effect_id: "eff_stat_boost_percent",
                        value: 10,
                        target_stat_id: "atk"
                    }],
                    title_loc: {...BASE_LANGUAGES, ru: "⚡ Посох Громовержца", en: "⚡ Staff of Thunder"},
                    desc_loc: {...BASE_LANGUAGES, ru: "Артефакт Самого Зевса.", en: "Artifact of Zeus himself."}
                },
                "event_elixir": {
                    category: "consumable",
                    rarity: "SSR",
                    is_usable: true,
                    icon: "🧪",
                    expiration: 1781347200000,
                    payload: {action: "grant_resource", resource: "gems", amount: 2000},
                    title_loc: {...BASE_LANGUAGES, ru: "🧪 Пыльца Асгарда", en: "🧪 Asgard Dust"},
                    desc_loc: {...BASE_LANGUAGES, ru: "Дарует 2000 гемов.", en: "Grants 2000 gems."}
                }
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
                    element_id: "ice",
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
                    rarity: "SSR",
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
                    rarity: "SSR",
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
                },

                "blackjack": {
                    ...HERO_PROTOTYPE,
                    title_loc: {...BASE_LANGUAGES, ru: "", en: "Blackjack"},

                    genre_id: "card",
                    platform_id: "web",
                    status: "",

                    icon: "./gacha/assets/images/games/blackjack.jpeg",
                    banner: "./gacha/assets/images/games/blackjack.jpeg"
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
                    banner: "./gacha/assets/images/games/crash.jpeg"
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
                    banner: "./gacha/assets/images/games/dice.jpeg"
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
                    banner: "./gacha/assets/images/games/hilo.jpeg"
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
                    banner: "./gacha/assets/images/games/holdem.jpeg"
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
                    banner: "./gacha/assets/images/games/lottery.jpeg"
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
                    banner: "./gacha/assets/images/games/mines.jpeg"
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
                    banner: "./gacha/assets/images/games/roulette.jpeg"
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
                    banner: "./gacha/assets/images/games/scratch.jpeg"
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

                    // embed_url: "https://mtwtech.onrender.com/games/slots5x3char?partnerId=demo_mtwtech&mode=real&character=adelina&fullscreen=true&hidePlayer=true",
                    embed_url: "https://mtwtech.onrender.com/games/slots5x3char?partnerId=demo_mtwtech&mode=real&fullscreen=true&hidePlayer=true",
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
                    banner: "./gacha/assets/images/games/wof.jpeg"
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
                    box_bottom: "5dvh",
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

        shops: {
            basic: {
                title_loc: {...BASE_LANGUAGES, ru: "Обычный магазин", en: "🔮 Standard shopp" },
                order: 1,
                catalog: [
                    {
                        id: "shop_scroll_1",
                        item_id: "scroll_epic",
                        cost_gems: 50,
                        amount: 1,
                        title_loc: {...BASE_LANGUAGES, ru: "Свиток Бога (СКИДКА)", en: "God Scroll (SALE)"}
                    },
                    {
                        id: "shop_staff_god",
                        item_id: "zeus_staff",
                        cost_gems: 500,
                        amount: 1,
                        title_loc: {...BASE_LANGUAGES, ru: "⚡ Посох Зевса", en: "⚡ Staff of Zeus"}
                    }
                ]
            },
            vip: {
                title_loc: {...BASE_LANGUAGES,  ru: "Вип Магазин", en: "Vip shop" },
                order: 2,
                catalog: [
                    {
                        id: "shop_scroll_1",
                        item_id: "scroll_epic",
                        cost_gems: 50,
                        amount: 1,
                        title_loc: {...BASE_LANGUAGES, ru: "Свиток Бога (СКИДКА)", en: "God Scroll (SALE)"}
                    },
                    {
                        id: "shop_staff_god",
                        item_id: "zeus_staff",
                        cost_gems: 500,
                        amount: 1,
                        title_loc: {...BASE_LANGUAGES, ru: "⚡ Посох Зевса", en: "⚡ Staff of Zeus"}
                    }
                ]
            }
        },

        gacha: {
            rules: {
                max_standard_diamond_daily: 20,
                convert_duplicates_to_shards: false,
            },
            banners: [
                {
                    id: "banner_standard",
                    banner_type: "standard",
                    pool_id: "standard_pool",
                    cost_item_id: "scroll_epic",
                    cost_amount: 1,
                    pity_threshold: 10,
                    title_loc: {...BASE_LANGUAGES,  ru: "🔮 Стандартный Призыв", en: "🔮 Standard Summon" }
                },
                {
                    id: "banner_zeus_event",
                    banner_type: "event",
                    pool_id: "zeus_event_pool",
                    cost_item_id: "scroll_event",
                    cost_amount: 1,
                    pity_threshold: 3,
                    title_loc: {...BASE_LANGUAGES,  ru: "⚡ Лимитированный Ритуал Зевса", en: "⚡ Limited Zeus Ritual" }
                },
                {
                    id: "banner_friendship",
                    banner_type: "friendship",
                    pool_id: "friendship_pool",
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
                    rates: { "SSR": 5, "SR": 25, "R": 70 },
                    heroes: { "SSR": ["hero_arturia"], "SR": [], "R": ["hero_goblin"] },
                },
                "zeus_event": {
                    cost: 2000,
                    currency: 'diamond',
                    modes: [1, 5],
                    rates: { "SSR": 30, "SR": 0, "R": 70 },
                    heroes: { "SSR": ["hero_zeus"], "SR": [], "R": ["hero_goblin"] }
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
    }
};

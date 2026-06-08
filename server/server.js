require('dotenv').config();

const express = require('express');
const cors = require('cors');
const http = require('http');
const path = require('path');
const { Pool } = require('pg');

const { Server } = require('socket.io');

const { configDb } = require('./DB');
const state = require('./state');
const vfootball = require('./vfootball');


const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    // ВАЖНО ДЛЯ NEON: Облачные базы требуют обязательный SSL-сертификат
    ssl: {
        rejectUnauthorized: false
    }
});

// Пробрасываем пул в глобальную видимость Node.js, чтобы state.js имел к нему доступ
global.pool = pool;

const authRoutes = require('./routes/authRoutes');
const gameRoutes = require('./routes/gameRoutes');
const adminRoutes = require('./routes/adminRoutes');
const sportRoutes = require('./routes/sportRoutes');
const websiteRoutes = require('./routes/websiteRoutes');


const app = express();
app.use(cors({
    origin: '*',
    credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const server = http.createServer(app);

io = new Server(server, {
    cors: {
        origin: "*", // Позволяет фронтенду с любого домена слать события
        methods: ["GET", "POST"],
        credentials: true
    },
    transports: ['websocket', 'polling']
});

// Подключаем разделенные роуты
app.use('/api', authRoutes);
app.use('/api', adminRoutes);
app.use('/api', gameRoutes);
app.use('/api', sportRoutes);
app.use('/api', websiteRoutes);

DEFAULT_CONFIG = {

    sport: {
        margin: 1.06,          // Дефолтная маржа 6%
        uclMargin: 1.05,       // Маржа на Лигу Чемпионов 5% (кэфы выше)
        maxStake: 5000,        // Максимальная ставка на один купон
        minStake: 10,          // Минимальная ставка
        maxOdds: 1000,         // Максимальный итоговый кэф в купоне
        cashoutFactor: 0.90,    // Множитель кэшаута (90% от честной стоимости)
        maxPayout: 50000
    },

    lottery: { ticketPrice: 1, totalNumbers: 49, neededChoices: 6, rtp: 75 }, // 75% лимит выплат
    slots3x3: { cost: 10, symbols: ['🦁', '🐯', '🐻', '💎', '🍒', '🍀'], rtp: 80 }, // 80% отдача
    wheel: {
        cost: 20,
        rtp: 70, // 70% отдача
        sectors: [
            { label: '1', prize: 10 }, { label: '💎 JACKPOT', prize: 'JACKPOT' },
            { label: '2', prize: 10 }, { label: 'Empty', prize: 0 },
            { label: '3', prize: 10 }, { label: '4', prize: 10 },
            { label: '5', prize: 10 }, { label: 'Double', prize: 40 },
            { label: '6', prize: 10 }, { label: '7', prize: 10 }
        ]
    },
    scratch: { cost: 15, symbols: ['🦁', '🐯', '🐻', '🍒', '🍀'], rtp: 75 }, // 75% отдача
    mines: {
        gridSize: 25,     // Сетка 5х5 (25 ячеек)
        minMines: 1,      // Минимальное количество бомб
        maxMines: 24,     // Максимальное количество бомб
        rtpPercent: 80    // Целевой процент отдачи (например, 95%)
    },
    crash: {
        betTime: 8000,     // Время на прием ставок (8 секунд)
        maxMultiplier: 1000, // Максимально возможный икс
        baseRtp: 80        // Базовый RTP игры в %
    },
    dice: {
        minRoll: 1,
        maxRoll: 100,
        baseRtp: 96,
        houseEdge: 0.04 // 4% комиссия дома (RTP игры = 96%)
    },
    hilo: {
        baseRtp: 96,
        houseEdge: 0.04, // 4% маржа дома (RTP = 96%)
        // Массив карт от Двойки до Туза (номиналы от 2 до 14 для удобства математики)
        cards: [
            { suit: '♠', name: '2', value: 2 }, { suit: '♦', name: '3', value: 3 },
            { suit: '♣', name: '4', value: 4 }, { suit: '♥', name: '5', value: 5 },
            { suit: '♠', name: '6', value: 6 }, { suit: '♦', name: '7', value: 7 },
            { suit: '♣', name: '8', value: 8 }, { suit: '♥', name: '9', value: 9 },
            { suit: '♠', name: '10', value: 10 }, { suit: '♦', name: 'J', value: 11 },
            { suit: '♣', name: 'Q', value: 12 }, { suit: '♥', name: 'K', value: 13 },
            { suit: '♠', name: 'A', value: 14 }
        ]
    },
    blackjack: { cost: 20, rtp: 95 },
    holdem: { cost: 20, rtp: 95 },
    roulette: { cost: 20, rtp: 95, betTime: 15000 },

    slots5x3: {
        cost: 20, // Стоимость одного обычного спина
        rtp: 95,
        // 20 фиксированных линий выплат (координаты y для каждого из 5 барабанов: ряд 0, 1 или 2)
        paylines: [
            [1, 1, 1, 1, 1], // Линия 1 (Горизонталь по центру)
            [0, 0, 0, 0, 0], // Линия 2 (Горизонталь сверху)
            [2, 2, 2, 2, 2], // Линия 3 (Горизонталь снизу)
            [0, 1, 2, 1, 0], // Линия 4 (Зигзаг вниз)
            [2, 1, 0, 1, 2], // Линия 5 (Зигзаг вверх)
            [0, 0, 1, 2, 2], // Линия 6
            [2, 2, 1, 0, 0], // Линия 7
            [1, 0, 1, 2, 1], // Линия 8
            [1, 2, 1, 0, 1], // Линия 9
            [1, 0, 0, 0, 1], // Линия 10
            [1, 2, 2, 2, 1], // Линия 11
            [0, 1, 1, 1, 0], // Линия 12
            [2, 1, 1, 1, 2], // Линия 13
            [0, 1, 0, 1, 0], // Линия 14
            [2, 1, 2, 1, 2], // Линия 15
            [1, 1, 0, 1, 1], // Линия 16
            [1, 1, 2, 1, 1], // Линия 17
            [0, 0, 2, 0, 0], // Линия 18
            [2, 2, 0, 2, 2], // Линия 19
            [0, 2, 0, 2, 0]  // Линия 20
        ],
        // Таблица выплат за количество символов в линии (от 3 до 5)
        payouts: {
            '🍒': { 3: 5,  4: 20,  5: 100 },
            '🍋': { 3: 5,  4: 25,  5: 120 },
            '🍊': { 3: 10, 4: 40,  5: 200 },
            '🍇': { 3: 15, 4: 60,  5: 300 },
            '🦁': { 3: 20, 4: 100, 5: 600 },
            '💎': { 3: 50, 4: 250, 5: 2000 }
        },
        // Виртуальные ленты (Reel Strips) для каждого из 5 барабанов (W - Wild, S - Scatter)
        strips: [
            ['🍒','🍋','🍒','🍊','🍇','🍒','🍋','🦁','W','🍒','🍋','🍊','S','🍒','🍇','💎','🍒','🍋','🍊','🍇'],
            ['🍋','🍒','🍋','🍇','🍊','🍋','🍒','W','🦁','🍋','🍒','🍇','S','🍋','🍊','💎','🍋','🍒','🍇','🍊'],
            ['🍊','🍇','🍒','🍋','🍒','🍊','🍇','🦁','W','🍊','🍒','🍋','S','🍊','🍇','💎','🍊','🍒','🍋','🍇'],
            ['🍇','🍊','🍋','🍒','🍋','🍇','🍊','W','🦁','🍇','🍋','🍒','S','🍇','🍊','💎','🍇','🍋','🍒','🍊'],
            ['🦁','💎','🍒','🍋','🍊','🍇','🍒','W','S','🦁','💎','🍒','🍋','🍊','🍇','🍒','🍋','🍊','🍇','🍒']
        ]
    },

    gamification: {
        xpPerGame: 10,          // Сколько XP давать за одну игру
        xpMultiplier: 1000,     // Множитель опыта для нового уровня (level * multiplier)
        levelUpBonus: 100,      // Награда в коинах за поднятие уровня

        questTargetGames: 30,   // Сколько игр нужно сделать для дневного квеста
        questReward: 50,        // Награда за выполнение квеста

        tournamentActive: 1,    // 1 - идет турнир, 0 - выключен
        tournamentPrize: 5000,   // Призовой фонд турнира
    },

    cashbackPercent: 10,
    affiliatePercent: 10,

    promoCodes: [
        { code: "START2026", reward: 100, maxUses: 1, active: 1 } // Пример дефолтного кода
    ]
};

// Вся необходимая конфигурация банков и оперативной памяти
const banks = {
    globalJackpot: 1000,
    mines: 5000,
    crash: 5000,
    dice: 3000,
    hilo: 4000
};
const CONFIG = {};

// Исправлено: Выносим инициализацию бэкенд-адресов без использования браузерного объекта location
const isDemoMode = process.env.env === 'demo' || process.env.NODE_ENV === 'production';
const defaultPlatformUrl = isDemoMode ? 'https://onrender.com' : 'http://localhost:3000/api/seamless';

// server.js -> Исправленная функция инициализации для Postgres
async function initConfig() {
    try {
        // Запрашиваем глобальный конфиг из таблицы b2b_configs
        const res = await global.pool.query(
            "SELECT config_data FROM b2b_configs WHERE id = $1 LIMIT 1",
            ['global_config']
        );

        // Если в базе ничего нет (первый запуск)
        if (res.rowCount === 0) {
            const firstB2BConfig = {
                "demo_skin_default": {
                    ...DEFAULT_CONFIG,
                    integration: {
                        url: defaultPlatformUrl,
                        secret: 'demo_showcase_secure_token'
                    }
                },
                "banks_demo_skin_default": {
                    globalJackpot: 1000,
                    mines: 5000,
                    crash: 5000,
                    dice: 3000,
                    hilo: 4000,
                    slots5x3: 10000
                }
            };

            // ИСПРАВЛЕНО: Записываем стартовую конфигурацию в Postgres
            await global.pool.query(
                "INSERT INTO b2b_configs (id, config_data) VALUES ($1, $2::jsonb)",
                ['global_config', JSON.stringify(firstB2BConfig)]
            );

            // Загружаем данные в оперативную память бэкенда
            global.CONFIG = {};
            global.banks = {};
            global.CONFIG["demo_skin_default"] = firstB2BConfig["demo_skin_default"];
            global.banks["demo_skin_default"] = firstB2BConfig["banks_demo_skin_default"];

            console.log("ℹ️ [Postgres B2B] Core initialized with default partner: demo_skin_default");
        } else {
            // Если база уже заполнена, восстанавливаем CONFIG и banks в память из Postgres
            const cfg = res.rows[0].config_data;

            global.CONFIG = {};
            global.banks = {};

            Object.keys(cfg).forEach(key => {
                if (key.startsWith('banks_')) {
                    const pId = key.replace('banks_', '');
                    global.banks[pId] = cfg[key];
                } else {
                    global.CONFIG[key] = cfg[key];
                }
            });
            console.log("✅ [Postgres B2B] Multi-tenant config successfully loaded from Neon");
        }



    } catch (err) {
        console.error("❌ Critical error during Postgres B2B initConfig:", err.message);
    }
}


async function initConfig222() {
    const res = await global.pool.query("SELECT config_data FROM b2b_configs WHERE id = 'global_config' LIMIT 1");
    let cfg2 = res.rowCount > 0 ? res.rows[0].config_data : null;
    console.log(cfg2);


    let cfg = await configDb.findOne({ _id: "global_config" });

    if (!cfg) {
        // Создаем стартовую структуру, где "demo_skin_default" — это наш первый B2B-партнер
        const firstB2BConfig = {
            _id: "global_config",
            "demo_skin_default": JSON.parse(JSON.stringify({
                ...DEFAULT_CONFIG,
                integration: {
                    url: defaultPlatformUrl,
                    secret: 'demo_showcase_secure_token'
                }
            })),
            "banks_demo_skin_default": {
                globalJackpot: 1000,
                mines: 5000,
                crash: 5000,
                dice: 3000,
                hilo: 4000,
                slots5x3: 10000
            }
        };
        await configDb.insert(firstB2BConfig);

        // Загружаем в оперативную память
        CONFIG["demo_skin_default"] = firstB2BConfig["demo_skin_default"];
        banks["demo_skin_default"] = firstB2BConfig["banks_demo_skin_default"];

        console.log("ℹ️ B2B Core initialized with default partner: demo_skin_default");
    } else {
        // ИСПРАВЛЕНО: Правильно восстанавливаем мультитенентную структуру CONFIG из базы NeDB, не забивая корень
        Object.keys(cfg).forEach(key => {
            if (key !== '_id') {
                if (key.startsWith('banks_')) {
                    const pId = key.replace('banks_', '');
                    banks[pId] = cfg[key];
                } else {
                    CONFIG[key] = cfg[key];
                }
            }
        });
        console.log("✅ B2B Multi-tenant config successfully loaded from config.db");
    }

    // Инициализация фоновых сервисов совместных игр через io
    const { initLotteryService } = require('./services/lotteryService');
    const { initCrashService } = require('./services/crashService');
    const { initRouletteService } = require('./services/rouletteService');

    initLotteryService(io);
    initCrashService(io);
    initRouletteService(io);
}

// Запускаем конфигурацию B2B ядра
initConfig().catch(err => console.error("❌ B2B Initialization crashed:", err.message));

// Обработка подключений Веб-сокетов
io.on('connection', (socket) => {
    socket.on('join_game', (username) => {
        socket.join(username);
    });

    socket.on('join_game_room', ({ username, partnerId, game }) => {
        console.log(`Socket joining room: ${partnerId}_${game}`);
        socket.join(partnerId + '_' + game);
    });

    socket.on('platform_join', (data) => {
        const { username, partnerId } = data;
        if (username && partnerId) {
            // Создаем уникальную изолированную комнату для обновлений, например: siteA_john
            const roomKey = `${partnerId}_${username}`;
            socket.join(roomKey);
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Modular Server running on port ${PORT}`);
});



// Переменная, чтобы код сброса не выполнился несколько раз в течение одной минуты 00:00
let lastResetDay = new Date().getDate();

setInterval(async () => {
    const now = new Date();
    const currentDay = now.getDate();
    const hours = now.getHours();
    const minutes = now.getMinutes();

    // Проверяем: наступила ли полночь (00:00) и наступил ли новый день
    if (hours === 0 && minutes === 0 && currentDay !== lastResetDay) {
        lastResetDay = currentDay; // Фиксируем новый день

        console.log("⏰ Наступила полночь. Запуск обнуления квестов...");
        try {
            await state.resetDailyQuestsForAll();
            await vfootball.generateDailySchedule();
        } catch (err) {
            console.error("Failed to reset daily quests:", err.message);
        }
    }
}, 60000);

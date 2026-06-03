const express = require('express');
const cors = require('cors');
const http = require('http');
const path = require('path');
const Datastore = require('nedb-promises');
const { Server } = require('socket.io');

const authRoutes = require('./routes/authRoutes');
const gameRoutes = require('./routes/gameRoutes');
const adminRoutes = require('./routes/adminRoutes');


const app = express();
app.use(cors({
    origin: '*',
    credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// Подключаем разделенные роуты
app.use('/api', authRoutes);
app.use('/api', adminRoutes);
app.use('/api', gameRoutes);


// Запуск фоновой службы лотереи по сокетам
const configDb = Datastore.create({ filename: path.join(__dirname, 'config.db'), autoload: true });
const DEFAULT_CONFIG = {
    lottery: { ticketPrice: 1, totalNumbers: 49, neededChoices: 6, rtp: 75 }, // 75% лимит выплат
    slots: { cost: 10, symbols: ['🦁', '🐯', '🐻', '💎', '🍒', '🍀'], rtp: 80 }, // 80% отдача
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
    }
};
CONFIG = {};

// Асинхронная функция инициализации конфига
async function initConfig() {
    let cfg = await configDb.findOne({ _id: "global_config" });
    if (!cfg) {
        // Если файла config.db нет или он пустой — записываем дефолтный
        await configDb.insert(DEFAULT_CONFIG);
        CONFIG = DEFAULT_CONFIG;
        console.log("ℹ️ Создан дефолтный конфиг в config.db");
    } else {
        CONFIG = cfg;
        console.log("✅ Актуальный конфиг успешно загружен из config.db");
    }

    const { initLotteryService } = require('./services/lotteryService');
    const { initCrashService } = require('./services/crashService');
    initLotteryService(io);
    initCrashService(io);
}
initConfig(); // Запускаем при старте сервера

// Подключение сокетов игроков к их комнатам
io.on('connection', (socket) => {
    socket.on('join_game', (username) => {
        socket.join(username);
    });
});

const PORT = 3000;
server.listen(PORT, () => {
    console.log(`Modular Server running on port ${PORT}`);
});

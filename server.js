const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');

const authRoutes = require('./routes/authRoutes');
const gameRoutes = require('./routes/gameRoutes');
const adminRoutes = require('./routes/adminRoutes');
const { initLotteryService } = require('./services/lotteryService');

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
initLotteryService(io);

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

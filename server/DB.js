const { Sequelize, DataTypes } = require('sequelize');
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    // ВАЖНО ДЛЯ NEON: Облачные базы требуют обязательный SSL-сертификат
    ssl: {
        rejectUnauthorized: false
    }
});

global.pool = pool;

// Подключение к Postgres. В продакшене Render сам подставит DATABASE_URL в process.env
const DATABASE_URL = process.env.DATABASE_URL;

const sequelize = new Sequelize(DATABASE_URL, {
    dialect: 'postgres',
    logging: false, // Отключаем лишний спам SQL-логов в консоли
    pool: { max: 10, min: 0, acquire: 30000, idle: 10000 }
});

// 1. Таблица Игроков (game.db)
const Player = sequelize.define('Player', {
    username: { type: DataTypes.STRING, allowNull: false },
    partnerId: { type: DataTypes.STRING, allowNull: false },
    balance: { type: DataTypes.INTEGER, defaultValue: 0 },
    xp: { type: DataTypes.INTEGER, defaultValue: 0 },
    level: { type: DataTypes.INTEGER, defaultValue: 1 },
    tournamentPoints: { type: DataTypes.INTEGER, defaultValue: 0 },
    // Используем JSONB для сохранения вложенных объектов без изменения логики игр
    dailyQuests: { type: DataTypes.JSONB, defaultValue: { gamesPlayed: 0, claimed: false } },
    usedPromos: { type: DataTypes.JSONB, defaultValue: {} },
    history: { type: DataTypes.JSONB, defaultValue: [] }
}, {
    indexes: [{ unique: true, fields: ['username', 'partnerId'] }] // Составной уникальный ключ B2B
});

// 2. Таблица Купонов Ставок (bets.db)
const SportsBet = sequelize.define('SportsBet', {
    username: { type: DataTypes.STRING, allowNull: false },
    partnerId: { type: DataTypes.STRING, allowNull: false },
    type: { type: DataTypes.STRING, allowNull: false }, // "SINGLE" / "MULTI"
    items: { type: DataTypes.JSONB, defaultValue: [] }, // Массив исходов экспресса
    totalOdds: { type: DataTypes.FLOAT, allowNull: false },
    stake: { type: DataTypes.INTEGER, allowNull: false },
    status: { type: DataTypes.STRING, defaultValue: 'PENDING' }, // "PENDING", "WON", "LOST", "CASHOUT"
    prize: { type: DataTypes.INTEGER, defaultValue: 0 },
    roundId: { type: DataTypes.STRING, allowNull: true }
});

// 3. Таблица Финансового Учета (accounting.db)
const FinancialTx = sequelize.define('FinancialTx', {
    partnerId: { type: DataTypes.STRING, allowNull: false },
    username: { type: DataTypes.STRING, allowNull: false },
    type: { type: DataTypes.STRING, allowNull: false }, // "DEBIT", "CREDIT", "AFFILIATE"
    amount: { type: DataTypes.INTEGER, allowNull: false },
    game: { type: DataTypes.STRING, allowNull: false },
    timestamp: { type: DataTypes.BIGINT, allowNull: false }
});

// 4. Таблица Спортивной Линии (matches.db)
const SportsMatch = sequelize.define('SportsMatch', {
    id: { type: DataTypes.STRING, primaryKey: true }, // Строковый уникальный ID матча
    sport: { type: DataTypes.STRING, allowNull: false },
    league: { type: DataTypes.STRING, allowNull: false },
    teams: { type: DataTypes.JSONB, allowNull: false }, // Может быть строкой или объектом {home, away}
    status: { type: DataTypes.STRING, defaultValue: 'PREMATCH' },
    markets: { type: DataTypes.JSONB, defaultValue: {} } // Сетка коэффициентов
});

// 5. Таблица Истории Лотереи (history.db)
const LotteryDraw = sequelize.define('LotteryDraw', {
    drawId: { type: DataTypes.STRING, allowNull: true },
    numbers: { type: DataTypes.JSONB, defaultValue: [] },
    jackpotPaid: { type: DataTypes.INTEGER, defaultValue: 0 },
    timestamp: { type: DataTypes.BIGINT, allowNull: false }
});

// 6. Глобальный Конфиг Платформы (config.db)
const GlobalConfig = sequelize.define('GlobalConfig', {
    id: { type: DataTypes.STRING, primaryKey: true, defaultValue: 'global_config' },
    configData: { type: DataTypes.JSONB, defaultValue: {} }, // Сюда завернем весь CONFIG по partnerId
    banksData: { type: DataTypes.JSONB, defaultValue: {} }   // Сюда завернем все банки по partnerId
});

// Функция синхронизации структуры таблиц с сервером Postgres
const initDb = async () => {
    try {
        await sequelize.authenticate();
        // alter: true автоматически подстроит таблицы в базе, если вы добавите новые поля в будущем
        await sequelize.sync({ alter: true });
        console.log("🐘 [PostgreSQL] All tables synchronized and ready.");
    } catch (err) {
        console.error("❌ [PostgreSQL] Connection or sync failed:", err.message);
    }
};

module.exports = {
    sequelize,
    initDb,
    Player,
    SportsBet,
    FinancialTx,
    SportsMatch,
    LotteryDraw,
    GlobalConfig
};

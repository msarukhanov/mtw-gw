const Datastore = require('nedb-promises');
const path = require('path');

// Экспортируем инстансы баз данных сразу. nedb-promises лениво инициализирует их при первом запросе.
const gameDb = Datastore.create({ filename: path.join(__dirname, 'game.db'), autoload: true });
const historyDb = Datastore.create({ filename: path.join(__dirname, 'history.db'), autoload: true });
const betsDb = Datastore.create({ filename: path.join(__dirname, 'bets.db'), autoload: true });
const accountingDb = Datastore.create({ filename: path.join(__dirname, 'accounting.db'), autoload: true });
const matchesDb = Datastore.create({ filename: path.join(__dirname, 'matches.db'), autoload: true });
const configDb = Datastore.create({ filename: path.join(__dirname, 'config.db'), autoload: true });

// Индексы настраиваются автоматически при первом обращении к базе
matchesDb.ensureIndex({ fieldName: 'status' });
matchesDb.ensureIndex({ fieldName: 'id', unique: true });
betsDb.ensureIndex({ fieldName: 'items.matchId' });

console.log("🎲 [Database] NeDB Layers linked successfully");

module.exports = {
    gameDb,
    historyDb,
    betsDb,
    accountingDb,
    matchesDb,
    configDb
};

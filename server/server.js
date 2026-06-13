require('dotenv').config();

const express = require('express');
const cors = require('cors');
const http = require('http');

const app = express();
app.use(cors({
    origin: '*',
    credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(require('./tgbot').webhookCallback('/api/callback/telegram'));

const server = http.createServer(app);

require('./DB');
require('./routes')(app);
require('./config')();
require('./cron')();
require('./socket')(server);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Modular Server running on port ${PORT}`);
});




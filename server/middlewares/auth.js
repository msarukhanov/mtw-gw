const auth = require('basic-auth');

module.exports = (req, res, next) => {
    const credentials = auth(req);

    // Установи свои логин и пароль здесь
    const ADMIN_USER = 'admin';
    const ADMIN_PASS = 'super_secret_pass_123';

    if (!credentials || credentials.name !== ADMIN_USER || credentials.pass !== ADMIN_PASS) {
        res.setHeader('WWW-Authenticate', 'Basic realm="Admin Area"');
        return res.status(401).send('Доступ запрещен. Неверный логин или пароль.');
    }

    next();
};

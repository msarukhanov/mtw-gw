const state = require('../state');

module.exports = (req, res, next) => {
    // 1. Извлекаем логин, пароль и partnerId из заголовков или тела запроса (для AJAX из локального admin.html)
    const username = req.headers['x-admin-user'] || req.body.admin_user;
    const password = req.headers['x-admin-pass'] || req.body.admin_pass;
    const partnerId = req.headers['x-partner-id'] || req.body.partnerId;

    // СЕКРЕТНЫЙ СУПЕР-АДМИН ДЛЯ ТЕБЯ (Доступ ко всем скинам для демонстрации, hint: admin / admin)
    if (username === 'admin' && password === 'admin') {
        // Если супер-админ заходит на конкретный скин, привязываем его, иначе ставим дефолтный
        req.partnerId = partnerId || "demo_mtwtech";
        req.adminUser = 'superadmin';
        return next();
    }

    // 2. B2B ЛОГИКА: Проверяем доступы локального администратора конкретного партнера
    if (!partnerId || !username || !password) {
        return res.status(401).json({ error: "Unauthorized. Missing administrator credentials or partnerId." });
    }

    // Достаем конфигурацию конкретного партнера из config.db
    const partnerConfig = state.getConfig(partnerId);

    // Ищем данные доступа админа внутри настроек этого партнера (задаются в config.db)
    // Пример структуры в базе: gamification: { adminUser: "owner_a", adminPass: "pass_a" }
    const gConfig = partnerConfig.gamification || {};
    const partnerAdminUser = gConfig.adminUser || "admin";
    const partnerAdminPass = gConfig.adminPass || "admin";

    // Проверяем соответствие учетных данных для этого конкретного бренда
    if (username !== partnerAdminUser || password !== partnerAdminPass) {
        return res.status(401).json({ error: "Access denied. Invalid credentials for this partner domain." });
    }

    // 3. МАРШРУТИЗАЦИЯ: Намертво привязываем partnerId к текущему запросу Express
    req.partnerId = partnerId;
    req.adminUser = username;

    next();
};

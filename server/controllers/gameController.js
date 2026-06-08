// controllers/gameCatalogController.js
const crypto = require('crypto');
const state = require('../state'); // Импортируем наше B2B ядро базы

// Пул подключений к PostgreSQL из глобальной видимости
const pool = global.pool;

// Дополнения в твой единый файл для работы с каталогом и коллекциями B2B

// =========================================================================
// ПУБЛИЧНЫЕ ЭНДПОИНТЫ ДЛЯ ВИТРИНЫ (ИГРОКИ)
// =========================================================================

// 1. Получить все коллекции текущего партнера (для лобби / главной страницы)
exports.getCollections = async (req, res) => {
    try {
        const partnerId = req.partnerId || req.query.partnerId;
        if (!partnerId) return res.status(400).json({ error: "Partner ID required" });

        const collections = await state.getPartnerCollections(partnerId);
        res.json({ success: true, collections });
    } catch (err) {
        console.error("❌ [Catalog API] getCollections failure:", err.message);
        res.status(500).json({ error: "Failed to fetch collections" });
    }
};

// 2. Получить список вообще всех доступных уникальных категорий игр
// Внутри controllers/gameCatalogController.js -> getAllCategories
// controllers/gameCatalogController.js -> getAllCategories
exports.getAllCategories = async (req, res) => {
    try {
        // ИСПРАВЛЕНО: Правильная функция для JSONB-массивов.
        // Добавлено принудительное приведение к типу ::jsonb для защиты от строковых сбоев драйвера
        const result = await pool.query(`
            SELECT DISTINCT jsonb_array_elements_text(categories::jsonb) as category 
            FROM games 
            WHERE is_active = true 
              AND categories IS NOT NULL 
              AND jsonb_typeof(categories::jsonb) = 'array'
            ORDER BY category ASC
        `);

        const categories = result.rows.map(row => row.category);
        res.json({ success: true, categories });
    } catch (err) {
        console.error("❌ [Catalog API] getAllCategories failure:", err.message);
        res.status(500).json({ error: "Failed to aggregate categories" });
    }
};

// controllers/gameCatalogController.js

// Получить список вообще всех доступных уникальных провайдеров игр
exports.getAllProviders = async (req, res) => {
    try {
        // DISTINCT убирает дубликаты, ORDER BY сортирует от A до Z на уровне СУБД Neon
        const result = await pool.query(`
            SELECT DISTINCT provider 
            FROM games 
            WHERE is_active = true AND provider IS NOT NULL AND provider != ''
            ORDER BY provider ASC
        `);

        // Превращаем массив строк-объектов [{ provider: 'Pragmatic' }] в плоский массив ['Pragmatic']
        const providers = result.rows.map(row => row.provider);
        res.json({ success: true, providers });
    } catch (err) {
        console.error("❌ [Catalog API] getAllProviders failure:", err.message);
        res.status(500).json({ success: false, error: "Failed to aggregate providers list" });
    }
};

// 3. Получить игры из конкретной коллекции партнера (с лимитом и пагинацией)
exports.getGamesByCollection = async (req, res) => {
    try {
        const partnerId = req.partnerId || req.query.partnerId;
        const { slug } = req.params;
        const limit = parseInt(req.query.limit) || 20;
        const offset = parseInt(req.query.offset) || 0;

        if (!partnerId) return res.status(400).json({ error: "Partner ID required" });

        // 1. Ищем саму коллекцию бренда
        const collRes = await pool.query(
            "SELECT game_ids FROM partner_collections WHERE partner_id = $1 AND slug = $2 LIMIT 1",
            [partnerId, slug]
        );

        if (collRes.rowCount === 0) {
            return res.status(404).json({ error: "Collection not found" });
        }

        const gameIds = typeof collRes.rows[0].game_ids === 'string'
            ? JSON.parse(collRes.rows[0].game_ids)
            : collRes.rows[0].game_ids;

        if (!gameIds || gameIds.length === 0) {
            return res.json({ success: true, count: 0, games: [] });
        }

        // 2. Подтягиваем игры со всеми B2B переопределениями партнера, лимитом и оффсетом
        const gamesQuery = `
            SELECT 
                g.id, COALESCE(pg.custom_name, g.name) as name, COALESCE(pg.custom_slug, g.slug) as slug,
                COALESCE(pg.custom_theme, g.theme) as theme, g.provider, g.has_demo, g.image, g.categories
            FROM games g
            LEFT JOIN partner_games pg ON g.id = pg.game_id AND pg.partner_id = $1
            LEFT JOIN partner_aggregators pa ON g.aggregator = pa.aggregator AND pa.partner_id = $1
            WHERE g.id = ANY($2::int[]) 
              AND g.is_active = true 
              AND COALESCE(pg.is_active, true) = true 
              AND COALESCE(pa.is_active, true) = true
            LIMIT $3 OFFSET $4
        `;

        const result = await pool.query(gamesQuery, [partnerId, gameIds, limit, offset]);
        res.json({ success: true, count: result.rowCount, games: result.rows });
    } catch (err) {
        console.error("❌ [Catalog API] getGamesByCollection failure:", err.message);
        res.status(500).json({ error: "Failed to load collection games" });
    }
};

// 4. Получить игры из определенной категории (с лимитом и пагинацией)
exports.getGamesByCategory = async (req, res) => {
    try {
        const partnerId = req.partnerId || req.query.partnerId;
        const { categoryName } = req.params;
        const limit = parseInt(req.query.limit) || 20;
        const offset = parseInt(req.query.offset) || 0;

        if (!partnerId) return res.status(400).json({ error: "Partner ID required" });

        // Тянем игры, проверяя вхождение строки в JSONB массив с лимитом СУБД
        const gamesQuery = `
            SELECT 
                g.id, COALESCE(pg.custom_name, g.name) as name, COALESCE(pg.custom_slug, g.slug) as slug,
                COALESCE(pg.custom_theme, g.theme) as theme, g.provider, g.has_demo, g.image, g.categories
            FROM games g
            LEFT JOIN partner_games pg ON g.id = pg.game_id AND pg.partner_id = $1
            LEFT JOIN partner_aggregators pa ON g.aggregator = pa.aggregator AND pa.partner_id = $1
            WHERE g.categories @> $2::jsonb 
              AND g.is_active = true 
              AND COALESCE(pg.is_active, true) = true 
              AND COALESCE(pa.is_active, true) = true
            LIMIT $3 OFFSET $4
        `;

        const result = await pool.query(gamesQuery, [partnerId, JSON.stringify([categoryName]), limit, offset]);
        res.json({ success: true, count: result.rowCount, games: result.rows });
    } catch (err) {
        console.error("❌ [Catalog API] getGamesByCategory failure:", err.message);
        res.status(500).json({ error: "Failed to load category games" });
    }
};

// 10. Запрос iFrame ссылки для запуска конкретной игры (B2B Launch Endpoint)
exports.launchGame = async (req, res) => {
    try {
        // Извлекаем параметры (поддерживаем как body, так и query для гибкости API партнера)
        const partnerId = req.partnerId || req.body.partnerId || req.query.partnerId;
        const { gameSlug } = req.params;
        const { sessionId, isDemo, theme } = req.body;

        if (!partnerId) return res.status(400).json({ error: "Missing B2B partner identifier (partnerId)" });

        // 1. Проверяем, существует ли игра и не выключена ли она у этого партнера
        const gameCheck = await pool.query(`
            SELECT g.url,g.name, COALESCE(pg.is_active, true) as is_game_active, COALESCE(pa.is_active, true) as is_aggregator_active
            FROM games g
            LEFT JOIN partner_games pg ON g.id = pg.game_id AND pg.partner_id = $1
            LEFT JOIN partner_aggregators pa ON g.aggregator = pa.aggregator AND pa.partner_id = $1
            WHERE (g.slug = $2 OR pg.custom_slug = $2) AND g.is_active = true LIMIT 1
        `, [partnerId, gameSlug]);

        if (gameCheck.rowCount === 0) {
            return res.status(404).json({ error: "Game not found in this partner's catalog" });
        }

        const game = gameCheck.rows[0];
        if (!game.is_game_active || !game.is_aggregator_active) {
            return res.status(403).json({ error: "This game or provider is currently disabled by operator" });
        }

        let username = null;
        const demoMode = isDemo === true || isDemo === 'true';

        // 2. Если это реальная игра (не демо), валидируем B2B-сессию пользователя
        if (!demoMode) {
            if (!sessionId) return res.status(400).json({ error: "Session ID required for real money mode" });

            // Запрашиваем данные игрока у внешней платформы по вашему бесшовному методу
            const seamless = require('../services/seamlessService');
            const externalUser = await seamless.validateSession(sessionId, partnerId);

            if (!externalUser || !externalUser.username) {
                return res.status(401).json({ error: "Invalid player seamless session token" });
            }
            username = externalUser.username;

            // Синхронизируем локальный кэш игрока в Postgres
            await state.getOrCreatePlayer(username, partnerId, async () => externalUser);
        }

        // 3. Создаем одноразовый токен запуска в Postgres game_sessions
        const launchToken = await state.createGameSession(partnerId, gameSlug, {
            username,
            isDemo: demoMode,
            theme: theme || 'default'
        });

        // 4. Собираем финальный iFrame URL
        // Движок игры развернется по своему внутреннему роуту (например /games/blackjack)
        // и сам считает параметры из query-строки при загрузке!
        const cleanBaseUrl = game.url.endsWith('/') ? game.url.slice(0, -1) : game.url;
        const iframeUrl = `${cleanBaseUrl}?sessionId=${launchToken}&partnerId=${partnerId}&mode=${demoMode ? 'demo' : 'real'}&theme=${theme || 'default'}`;

        res.json({
            success: true,
            gameSlug,
            name: game.name,
            mode: demoMode ? "DEMO" : "REAL",
            iframeUrl // Эту ссылку партнер зашивает в свой тег <iframe src="...">
        });

    } catch (err) {
        console.error("❌ [Catalog API] launchGame failure:", err.message);
        res.status(500).json({ error: "Failed to generate game launch session" });
    }
};



// =========================================================================
// ЭНДПОИНТЫ УПРАВЛЕНИЯ ДЛЯ АДМИНКИ ПАРТНЕРА (БЭК-ОФИС)
// =========================================================================

// 5. Админка: Добавить новую коллекцию
exports.adminAddCollection = async (req, res) => {
    try {
        const partnerId = req.partnerId; // Извлекается мидлваром админа из сессии/токена
        const { name, slug, gameIds } = req.body;

        if (!name || !slug) return res.status(400).json({ error: "Collection name and unique slug are required" });

        const newId = await state.createPartnerCollection(partnerId, name, slug, gameIds || []);
        res.json({ success: true, collectionId: newId, message: "Collection generated successfully" });
    } catch (err) {
        console.error("❌ [Admin Catalog API] addCollection failure:", err.message);
        res.status(400).json({ error: err.message.includes('unique') ? "Collection slug already exists" : "Database rejection" });
    }
};

// 6. Админка: Редактировать коллекцию (Состав игр и имя)
exports.adminEditCollection = async (req, res) => {
    try {
        const partnerId = req.partnerId;
        const { slug } = req.params;
        const { name, gameIds } = req.body;

        await state.updatePartnerCollection(partnerId, slug, { name, gameIds });
        res.json({ success: true, message: "Collection updated" });
    } catch (err) {
        console.error("❌ [Admin Catalog API] editCollection failure:", err.message);
        res.status(500).json({ error: "Failed to edit collection" });
    }
};

// 7. Админка: Удалить коллекцию партнера
exports.adminDeleteCollection = async (req, res) => {
    try {
        const partnerId = req.partnerId;
        const { slug } = req.params;

        const deleted = await state.deletePartnerCollection(partnerId, slug);
        if (!deleted) return res.status(404).json({ error: "Collection not found" });

        res.json({ success: true, message: "Collection destroyed" });
    } catch (err) {
        console.error("❌ [Admin Catalog API] deleteCollection failure:", err.message);
        res.status(500).json({ error: "Failed to drop collection" });
    }
};

// 8. Админка: Изменить настройки агрегатора для партнера (Вкл/Выкл Softswiss, Spribe и т.д.)
exports.adminUpdateAggregator = async (req, res) => {
    try {
        const partnerId = req.partnerId;
        const { aggregator, isActive } = req.body;

        if (!aggregator || isActive === undefined) {
            return res.status(400).json({ error: "Missing parameters: aggregator, isActive" });
        }

        await state.updatePartnerAggregatorStatus(partnerId, aggregator, isActive);
        res.json({ success: true, message: `Aggregator '${aggregator}' status updated to ${isActive}` });
    } catch (err) {
        console.error("❌ [Admin Catalog API] updateAggregator failure:", err.message);
        res.status(500).json({ error: "Failed to update aggregator route" });
    }
};

// 9. Админка: Тонкие настройки игры для партнера (Вкл/Выкл, кастомный RTP, название)
exports.adminUpdateGameSettings = async (req, res) => {
    try {
        const partnerId = req.partnerId;
        const { gameId, isActive, customName, customSlug, customTheme, customRtp } = req.body;

        if (!gameId) return res.status(400).json({ error: "Game ID parameter required" });

        await state.updatePartnerGameSettings(partnerId, parseInt(gameId), {
            isActive,
            customName,
            customSlug,
            customTheme,
            customRtp: customRtp ? parseFloat(customRtp) : null
        });

        res.json({ success: true, message: "Game customization mapping successfully updated" });
    } catch (err) {
        console.error("❌ [Admin Catalog API] updateGameSettings failure:", err.message);
        res.status(500).json({ error: "Failed to patch partner game setup" });
    }
};


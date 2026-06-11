const state = require('../state');
const seamless = require('../services/seamlessService');

const bcrypt = require('bcrypt'); // Для безопасного хэширования паролей

exports.login = async (req, res) => {
    const { username } = req.body;
    if (!username || typeof username !== 'string' || username.trim().length < 2) {
        return res.status(400).json({ error: "Invalid username" });
    }

    const cleanName = username.trim();
    const partnerId = "demo_mtwtech";

    try {
        // Убеждаемся, что игрок создан в game.db
        const player = await state.getOrCreatePlayer(cleanName, partnerId);

        // Генерируем криптографически безопасный случайный токен сессии
        const sessionId = 'ss_' + crypto.randomBytes(16).toString('hex');

        // Связываем токен сессии с реальным именем игрока в памяти
        global.activePlayerSessions[sessionId] = cleanName;

        // Удаляем сессию через 24 часа для безопасности
        setTimeout(() => { delete global.activePlayerSessions[sessionId]; }, 24 * 60 * 60 * 1000);

        res.json({
            success: true,
            username: player.username,
            sessionId: sessionId, // Отдаем сгенерированный токен для iFrame!
            balance: player.balance
        });
    } catch (err) {
        res.status(500).json({ error: "Platform login failed" });
    }
};
// Эндпоинт 1: Чистый профиль игрока (Баланс)
exports.getUserProfile = async (req, res) => {
    try {
        const { username, partnerId } = req; // Из middleware checkPlayer

        const pRes = await global.pool.query(
            'SELECT balance FROM players WHERE username = $1 AND partner_id = $2 LIMIT 1',
            [username, partnerId]
        );
        if (pRes.rowCount === 0) return res.status(404).json({ error: "User not found" });

        res.json({
            success: true,
            balance: Number(pRes.rows[0].balance).toFixed(2)
        });
    } catch (err) {
        res.status(500).json({ error: "Failed to load profile" });
    }
};

// Эндпоинт 2: История активности с фильтрацией по типу лога
exports.getUserHistory = async (req, res) => {
    try {
        const { username, partnerId } = req;
        const type = req.query.type || 'all'; // 'all', 'bets', 'cashier'

        let queryText = `SELECT category, action_type, description, amount_change::numeric, timestamp 
                         FROM player_history 
                         WHERE username = $1 AND partner_id = $2`;
        let queryParams = [username, partnerId];

        // Фильтруем историю на уровне базы данных PostgreSQL
        if (type === 'bets') {
            queryText += ` AND category IN ('casino', 'sport')`;
        } else if (type === 'cashier') {
            // В cashier попадают депозиты, выводы, промокоды и кэшбэки
            queryText += ` AND category = 'system'`;
        }

        queryText += ` ORDER BY timestamp DESC LIMIT 30`; // отдаем последние 30 записей

        const historyRes = await global.pool.query(queryText, queryParams);

        const formattedHistory = historyRes.rows.map(h => ({
            type: h.action_type.toUpperCase(),
            description: h.description,
            amount: Number(h.amount_change),
            date: new Date(h.timestamp).toLocaleDateString('en-US', {
                month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
            })
        }));

        res.json({ success: true, history: formattedHistory });
    } catch (err) {
        res.status(500).json({ error: "Failed to load history" });
    }
};


exports.changePassword = async (req, res) => {
    try {
        const { username, partnerId } = req;
        const { newPassword } = req.body;

        if (!newPassword || newPassword.length < 6) {
            return res.status(400).json({ success: false, error: "Password must be at least 6 characters long." });
        }

        // Хэшируем пароль перед записью в СУБД (Защита от утечек)
        const salt = await bcrypt.genSalt(10);
        const hash = await bcrypt.hash(newPassword, salt);

        await global.pool.query(
            'UPDATE players SET password_hash = $1 WHERE username = $2 AND partner_id = $3',
            [hash, username, partnerId]
        );

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: "Failed to update credential hashes" });
    }
};

// Контроллер получения статуса квестов и лидерборда
exports.getGamificationOverview = async (req, res) => {
    try {
        const { username, partnerId } = req; // забираем данные из checkPlayer middleware
        const status = await state.getPlayerGamificationStatus(username, partnerId);

        if (!status) return res.status(404).json({ error: "Player data missing" });
        res.json({ success: true, data: status });
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch gamification data" });
    }
};

// Контроллер ручного забора награды (клик по кнопке "Claim Reward")
exports.claimQuestReward = async (req, res) => {
    try {
        const { username, partnerId, sessionId } = req;
        const result = await state.claimDailyQuestReward(username, partnerId, sessionId);

        if (!result.success) return res.status(400).json(result);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: "Failed to execute claim sequence" });
    }
};

exports.getPlayerStats = async (req, res) => {
    try {
        const { username, partnerId } = req; // Из middleware checkPlayer

        // 1. Вытягиваем профиль, опыт, уровень и информацию о клане игрока
        const pRes = await global.pool.query(
            `SELECT p.level, p.xp, p.tournament_points, cm.clan_id, c.clan_name, c.clan_level
             FROM players p
             LEFT JOIN b2b_clan_members cm ON p.username = cm.username AND p.partner_id = cm.partner_id
             LEFT JOIN b2b_clans c ON cm.clan_id = c.id
             WHERE p.username = $1 AND p.partner_id = $2 LIMIT 1`,
            [username, partnerId]
        );

        if (pRes.rowCount === 0) return res.status(404).json({ error: "Player missing" });
        const pData = pRes.rows[0];

        // Подтягиваем коэффициенты XP из глобального конфига геймификации
        const gamificationConfig = global.CONFIG?.[partnerId]?.gamification || { xpMultiplier: 1000 };
        const nextLevelXp = Number(pData.level) * Number(gamificationConfig.xpMultiplier);
        const xpProgressPercentage = Math.min(Math.floor((Number(pData.xp) / nextLevelXp) * 100), 100);

        // 2. Ищем активный квест клана и текущий прогресс, если игрок состоит в клане
        let clanQuestData = null;
        if (pData.clan_id) {
            const cqRes = await global.pool.query(
                `SELECT cq.title, cq.target_turnover::numeric, cq.reward_pool::numeric, cqp.current_turnover::numeric, cqp.is_completed
                 FROM b2b_clan_quests cq
                 LEFT JOIN b2b_clan_quest_progress cqp ON cq.id = cqp.quest_id AND cqp.clan_id = $1
                 WHERE cq.partner_id = $2 AND cq.is_active = 1 AND cq.expires_at > NOW() LIMIT 1`,
                [pData.clan_id, partnerId]
            );

            if (cqRes.rowCount > 0) {
                const q = cqRes.rows[0];
                const current = Number(q.current_turnover || 0);
                const target = Number(q.target_turnover);
                clanQuestData = {
                    title: q.title,
                    current: current,
                    target: target,
                    reward: Number(q.reward_pool),
                    completed: q.is_completed,
                    pct: Math.min(Math.floor((current / target) * 100), 100)
                };
            }
        }

        // 3. Вытягиваем список топ-5 кланов для мини-лидерборда
        const topClansRes = await global.pool.query(
            `SELECT clan_name, clan_level FROM b2b_clans WHERE partner_id = $1 ORDER BY clan_level DESC, clan_xp DESC LIMIT 5`,
            [partnerId]
        );

        const achievementsRes = await global.pool.query(
            `SELECT a.title, a.description, a.badge_icon, a.condition_type, a.target_value::numeric,
            COALESCE(pa.current_value, 0)::numeric as current_value, 
            COALESCE(pa.is_unlocked, false) as is_unlocked
     FROM b2b_achievements a
     LEFT JOIN player_achievements pa ON a.id = pa.achievement_id AND pa.username = $1 AND pa.partner_id = $2
     WHERE a.partner_id = $2 AND a.is_active = 1
     ORDER BY a.id ASC`,
            [username, partnerId]
        );

        res.json({
            success: true,
            level: pData.level,
            xp: pData.xp,
            nextLevelXp,
            xpPct: xpProgressPercentage,
            clan: pData.clan_id ? { id: pData.clan_id, name: pData.clan_name, level: pData.clan_level } : null,
            clanQuest: clanQuestData,
            topClans: topClansRes.rows,
            achievements: achievementsRes.rows
        });

    } catch (err) {
        console.error("❌ Player gamification fetch failure:", err.message);
        res.status(500).json({ error: "Failed to compile stats node" });
    }
};

// ИГРОК: Создать свой новый клан
exports.playerCreateClan = async (req, res) => {
    const client = await global.pool.connect();
    try {
        const { username, partnerId } = req;
        const { clanName } = req.body;

        if (!clanName || clanName.trim().length < 3 || clanName.length > 20) {
            return res.status(400).json({ error: "Clan name must be 3-20 characters long." });
        }

        await client.query('BEGIN');

        // Проверяем, не состоит ли уже игрок в каком-то клане
        const checkMember = await client.query('SELECT id FROM b2b_clan_members WHERE username = $1 AND partner_id = $2', [username, partnerId]);
        if (checkMember.rowCount > 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: "You are already a member of another guild." });
        }

        // Вставляем клан
        const insertClan = await client.query(
            `INSERT INTO b2b_clans (partner_id, clan_name, owner_username) VALUES ($1, $2, $3) RETURNING id`,
            [partnerId, clanName.trim(), username]
        );
        const clanId = insertClan.rows[0].id;

        // Добавляем создателя как владельца (OWNER)
        await client.query(
            `INSERT INTO b2b_clan_members (partner_id, clan_id, username, role) VALUES ($1, $2, $3, 'OWNER')`,
            [partnerId, clanId, username]
        );

        await client.query('COMMIT');
        res.json({ success: true });
    } catch (err) {
        await client.query('ROLLBACK');
        if (err.code === '23505') return res.status(400).json({ error: "This clan name is already taken." });
        res.status(500).json({ error: "Failed to create guild" });
    } finally { client.release(); }
};

// ИГРОК: Посмотреть список доступных кланов для вступления
exports.getPublicClansList = async (req, res) => {
    try {
        const partnerId = req.query.partnerId || "demo_mtwtech";
        const result = await global.pool.query(
            `SELECT id, clan_name, clan_level, owner_username FROM b2b_clans WHERE partner_id = $1 ORDER BY id DESC LIMIT 20`,
            [partnerId]
        );
        res.json({ success: true, clans: result.rows });
    } catch (err) { res.status(500).json({ error: "Failed to load clans list" }); }
};

// ИГРОК: Вступить в существующий клан
exports.playerJoinClan = async (req, res) => {
    try {
        const { username, partnerId } = req;
        const { clanId } = req.body;

        await global.pool.query(
            `INSERT INTO b2b_clan_members (partner_id, clan_id, username, role) VALUES ($1, $2, $3, 'MEMBER')`,
            [partnerId, Number(clanId), username]
        );
        res.json({ success: true });
    } catch (err) {
        if (err.code === '23505') return res.status(400).json({ error: "You are already a member of a clan." });
        res.status(500).json({ error: "Failed to join clan." });
    }
};

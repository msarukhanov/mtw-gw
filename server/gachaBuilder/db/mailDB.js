// db/mailDB.js
const { redisClient } = require('../../redisClient');
const Cache = require('./cacheManager'); // Твой рабочий кэш-менеджер игроков

/**
 * СЛУЖЕБНАЯ: Безопасное начисление прикрепленной награды в игровой профиль (в RAM/Redis)
 * Принимает объект ресурсов игрока, инвентарь и массив наград из письма.
 */
function applyMailRewards(resources, inventory, rewardsList) {
    if (!Array.isArray(rewardsList)) return;

    rewardsList.forEach(reward => {
        const { type, id, count } = reward;
        const amount = parseInt(count) || 0;
        if (amount <= 0) return;

        if (type === 'resources' || type === 'currency') {
            // Прямое начисление золота, алмазов, опыта и т.д.
            resources[id] = (parseInt(resources[id]) || 0) + amount;
        }
        else if (type === 'item' || type === 'gear') {
            // Начисление предметов в инвентарь (стакинг одинаковых вещей)
            if (!inventory[id]) inventory[id] = 0;
            inventory[id] += amount;
        }
        // Здесь можно расширить под осколки или героев, если понадобится
    });
}

/**
 * ГЛАВНАЯ 1: Получение списка всех писем игрока при логине
 */
/**
 * ГЛАВНАЯ 1: Получение списка всех писем игрока
 */
async function getInitialMailState(userId, serverId, gameId) {
    try {
        const query = `
            SELECT id, title, body, rewards, is_read, is_claimed, created_at 
            FROM player_mailbox 
            WHERE user_id = $1 AND server_id = $2 AND game_id = $3
            ORDER BY created_at DESC;
        `;
        const { rows } = await global.pool.query(query, [userId, serverId, gameId]);

        // Возвращаем чистый объект для фронта
        return {
            mail_list: rows
        };
    } catch (err) {
        console.error('[mailDB:getInitialMailState] Error:', err);
        return { error: true, message: err.message };
    }
}

/**
 * ГЛАВНАЯ 2: Отметить письмо как прочитанное
 */
async function markMailAsRead(userId, serverId, gameId, mailId) {
    try {
        const query = `
            UPDATE player_mailbox 
            SET is_read = TRUE 
            WHERE id = $1 AND user_id = $2 AND server_id = $3 AND game_id = $4
            RETURNING id, is_read;
        `;
        const { rows } = await global.pool.query(query, [mailId, userId, serverId, gameId]);

        if (rows.length === 0) return { error: true, message: "Письмо не найдено" };

        return {
            action: 'marked_read_success',
            mailId: rows[0].id,
            is_read: true
        };
    } catch (err) {
        console.error('[mailDB:markMailAsRead] Error:', err);
        return { error: true, message: err.message };
    }
}

/**
 * ГЛАВНАЯ 3: Забрать награду из письма
 */
async function claimMailReward(userId, serverId, gameId, mailId) {
    const client = await global.pool.connect();
    try {
        await client.query('BEGIN');

        const mailQuery = `
            SELECT id, rewards, is_claimed 
            FROM player_mailbox 
            WHERE id = $1 AND user_id = $2 AND server_id = $3 AND game_id = $4
            FOR UPDATE;
        `;
        const { rows: mailRows } = await client.query(mailQuery, [mailId, userId, serverId, gameId]);

        if (mailRows.length === 0) throw new Error("Письмо не найдено");

        const mail = mailRows[0];
        if (mail.is_claimed) throw new Error("Награды уже завраны");

        const rewardsList = mail.rewards || [];
        if (rewardsList.length === 0) throw new Error("В письме нет наград");

        let playerObj = await Cache.getPlayer(userId, serverId);
        if (!playerObj) throw new Error("Профиль игрока не найден");

        let resources = playerObj.resources || {};
        let inventory = playerObj.inventory || {};

        applyMailRewards(resources, inventory, rewardsList);

        playerObj.resources = resources;
        playerObj.inventory = inventory;

        const updateMailQuery = `UPDATE player_mailbox SET is_claimed = TRUE, is_read = TRUE WHERE id = $1;`;
        await client.query(updateMailQuery, [mailId]);

        await client.query('COMMIT');
        await Cache.setPlayer(playerObj);

        // Возвращаем чистый плоский объект, как в твоем levelUpHero
        return {
            action: 'claim_success',
            mailId: mail.id,
            is_claimed: true,
            is_read: true,
            resources: playerObj.resources,
            inventory: playerObj.inventory
        };

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('[mailDB:claimMailReward] Error:', err);
        return { error: true, message: err.message };
    } finally {
        client.release();
    }
}

/**
 * СЛУЖЕБНАЯ: Отправить точечное письмо конкретному игроку
 * Вызывается из других систем бэка (н-р, из аренного крона) или админки
 */
async function sendMailToPlayer(userId, serverId, gameId, title, body, rewards = []) {
    try {
        const query = `
            INSERT INTO player_mailbox (game_id, server_id, user_id, title, body, rewards)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING id, title, created_at;
        `;

        // Массив наград обязательно приводим к JSON-строке для вставки в JSONB
        const { rows } = await global.pool.query(query, [
            gameId,
            serverId,
            userId,
            title,
            body,
            JSON.stringify(rewards)
        ]);

        // Если игрок сейчас онлайн на сокетах, шлем ему real-time сигнал-уведомление
        // Роутер на фронте увидит пакет и зажжет красную точку на иконке почты
        const playerSocketRoom = `p:${serverId}:${userId}`;
        if (global.io) {
            global.io.to(playerSocketRoom).emit('player_update', {
                type: 'mail',
                data: { action: 'new_mail_notification', mailId: rows[0].id }
            });
        }

        return { success: true, mailId: rows[0].id };
    } catch (err) {
        console.error('[mailDB:sendMailToPlayer] Error:', err);
        return { error: true, message: err.message };
    }
}

/**
 * СЛУЖЕБНАЯ: Массовая рассылка писем ВСЕМ игрокам сервера (Админ-панель / LiveOps)
 * Делается через пакетную вставку (Bulk Insert) на основе таблицы player_server_profiles
 */
async function broadcastMailToAllServerPlayers(serverId, gameId, title, body, rewards = []) {
    try {
        // Выбираем всех уникальных игроков, зарегистрированных на данном сервере
        const playersQuery = `
            SELECT user_id 
            FROM player_server_profiles 
            WHERE server_id = $1 AND game_id = $2;
        `;
        const { rows: players } = await global.pool.query(playersQuery, [serverId, gameId]);

        if (players.length === 0) return { success: true, sent_to: 0 };

        // Собираем тяжелый SQL-запрос для пакетной вставки всех строк за один раз
        // VALUES ($1, $2, $3, $4, $5, $6), ($1, $2, $7, $4, $5, $6)...
        const valueLines = [];
        const queryArgs = [gameId, serverId, title, body, JSON.stringify(rewards)];

        players.forEach((p, index) => {
            const argIndexForUser = queryArgs.length + 1;
            queryArgs.push(p.user_id);
            // Линия: ($1, $2, $user, $3, $4, $5)
            valueLines.push(`($1, $2, $${argIndexForUser}, $3, $4, $5)`);
        });

        const bulkQuery = `
            INSERT INTO player_mailbox (game_id, server_id, user_id, title, body, rewards)
            VALUES ${valueLines.join(', ')};
        `;

        await global.pool.query(bulkQuery, queryArgs);

        // Вещаем на сокет-комнату всей зоны сервера, чтобы у ВСЕХ онлайн-игроков зажглись уведомления
        const serverZoneRoom = `server:${serverId}:zone`;
        if (global.io) {
            global.io.to(serverZoneRoom).emit('player_update', {
                type: 'mail',
                data: { action: 'new_mail_notification' }
            });
        }

        return { success: true, sent_to: players.length };
    } catch (err) {
        console.error('[mailDB:broadcastMailToAllServerPlayers] Error:', err);
        return { error: true, message: err.message };
    }
}

/**
 * ГЛАВНАЯ 4: Удалить одно конкретное письмо
 */
async function deleteSingleMail(userId, serverId, gameId, mailId) {
    try {
        // Удаляем строку, только если она принадлежит этому конкретному юзеру и серверу
        const query = `
            DELETE FROM player_mailbox 
            WHERE id = $1 AND user_id = $2 AND server_id = $3 AND game_id = $4
            RETURNING id;
        `;
        const { rows } = await global.pool.query(query, [mailId, userId, serverId, gameId]);

        if (rows.length === 0) return { error: true, message: "Письмо не найдено или уже удалено" };

        return {
            action: 'delete_success',
            mailId: mailId
        };
    } catch (err) {
        console.error('[mailDB:deleteSingleMail] Error:', err);
        return { error: true, message: err.message };
    }
}

/**
 * ГЛАВНАЯ 5: Массовая очистка почты (Удалить все прочитанные и пустые письма)
 * Защита: Письма с незабранными наградами (is_claimed = FALSE AND rewards != '[]') ЭТОТ запрос НЕ затронет!
 */
async function clearReadAndClaimedMail(userId, serverId, gameId) {
    try {
        const query = `
            DELETE FROM player_mailbox 
            WHERE user_id = $1 AND server_id = $2 AND game_id = $3
              AND is_read = TRUE 
              AND (is_claimed = TRUE OR rewards = '[]'::jsonb);
        `;
        const { rowCount } = await global.pool.query(query, [userId, serverId, gameId]);

        // Возвращаем актуальное состояние — фронтенду проще будет сделать полный перезапрос getInitialState,
        // либо мы просто говорим, сколько строк стерли, чтобы фронт убрал их локально.
        return {
            action: 'clear_comb_success',
            deleted_count: rowCount
        };
    } catch (err) {
        console.error('[mailDB:clearReadAndClaimedMail] Error:', err);
        return { error: true, message: err.message };
    }
}

/**
 * СЛУЖЕБНАЯ: Фоновое удаление писем, у которых истек срок хранения.
 * Вызывается сервером раз в сутки по таймеру.
 * @param {string} gameId - ID игры, для которой чистим почту
 */
async function runMailAutoCleanup(gameId) {
    try {
        const GameConfig = global.gamesConfigDB[gameId];
        // Вытаскиваем лимит дней из твоего конфига, если его забыли настроить — берем 30 дней по дефолту
        const deleteDays = GameConfig?.mechanics?.mail_settings?.auto_delete_days || 30;

        // SQL-запрос удаляет письма, которые старше N дней.
        // Защита: Письма с НЕЗАБРАННЫМИ наградами (is_claimed = FALSE AND rewards != '[]') мы НЕ трогаем,
        // чтобы игрок не потерял ценные ресурсы, если долго не заходил в игру.
        const query = `
            DELETE FROM player_mailbox
            WHERE game_id = $1
              AND created_at < NOW() - INTERVAL '1 day' * $2
              AND (is_claimed = TRUE OR rewards = '[]'::jsonb);
        `;

        const { rowCount } = await global.pool.query(query, [gameId, deleteDays]);

        if (rowCount > 0) {
            console.log(`[Mailops:Cleanup] Успешно удалено ${rowCount} просроченных писем для игры ${gameId}`);
        }

        return { success: true, deleted_count: rowCount };
    } catch (err) {
        console.error('[Mailops:Cleanup] Критическая ошибка автоудаления почты:', err);
        return { error: true, message: err.message };
    }
}



module.exports = {
    getInitialMailState,
    markMailAsRead,
    claimMailReward,
    sendMailToPlayer,
    broadcastMailToAllServerPlayers,
    deleteSingleMail,
    clearReadAndClaimedMail,
    runMailAutoCleanup
};


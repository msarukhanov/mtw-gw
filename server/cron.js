const cron = require('node-cron');

const vfootball = require('./vfootball');
const state = require('./state');

function shedule() {
    // 📅 1. ЕЖЕДНЕВНЫЙ КРОН: Запускается КАЖДУЮ ПОЛНОЧЬ ровно в 00:00 (остается твой код)
    cron.schedule('0 0 * * *', async () => {
        console.log("⏰ [CRON] Наступила полночь 00:00. Запуск ежедневных процедур...");
        try {
            await state.resetDailyQuestsForAll();
            await state.runCronCashback('daily');
            if (typeof vfootball?.generateDailySchedule === 'function') {
                await vfootball.generateDailySchedule();
            }
        } catch (err) {
            console.error("❌ Критическая ошибка выполнения Ежедневного Крона:", err.message);
        }
    });

    // 📅 2. ЕЖЕНЕДЕЛЬНЫЙ КРОН: Запускается КАЖДЫЙ понедельник ровно в 00:00 (остается твой код)
    cron.schedule('0 0 * * 1', async () => {
        console.log("⏰ [CRON] Понедельник 00:00. Запуск еженедельных процедур...");
        try {
            await state.runCronCashback('weekly');
        } catch (err) {
            console.error("❌ Критическая ошибка выполнения Еженедельного Крона:", err.message);
        }
    });

    // 📅 3. 📊 АНАЛИТИЧЕСКИЙ КРОН (NEW): Запускается КАЖДЫЕ 30 МИНУТ (в 00 и 30 минут каждого часа) [INDEX]
    // Выражение '*/30 * * * *' означает: "раз в полчаса, круглые сутки" [INDEX]
    cron.schedule('*/30 * * * *', async () => {
        console.log("⏰ [CRON] 📊 Запущен срез исторических снимков одновременного онлайна (CCU)...");

        // Вытаскиваем массив активных доменов из нашей сокет-карты памяти
        const domains = Object.keys(global.onlineByDomains || {});
        if (domains.length === 0) {
            console.log("ℹ️ [CRON Analytics] В сети нет ни одного активного домена. Снимок пропущен.");
            return;
        }

        const client = await global.pool.connect();
        try {
            await client.query('BEGIN');

            for (const domain of domains) {
                // Извлекаем точное число живых сокетов для этого бренда на данный момент [INDEX]
                const onlineCount = global.onlineByDomains[domain]?.length || 0;

                // Быстрым сканом находим, какому B2B партнеру принадлежит этот сайт [INDEX]
                const webRes = await client.query(
                    'SELECT partner_id FROM b2b_websites WHERE domain_name = $1 LIMIT 1',
                    [domain]
                );

                if (webRes.rowCount > 0) {
                    const partnerId = webRes.rows[0].partner_id;

                    // Записываем срез CCU-метрики в таблицу b2b_online_snapshots [INDEX]
                    await client.query(
                        `INSERT INTO b2b_online_snapshots (partner_id, domain_name, online_count, timestamp) 
                         VALUES ($1, $2, $3, NOW())`,
                        [partnerId, domain, onlineCount]
                    );
                }
            }

            await client.query('COMMIT');
            console.log(`✅ [CRON Analytics] Успешно зафиксированы срезы онлайна для ${domains.length} брендов.`);
        } catch (err) {
            await client.query('ROLLBACK');
            console.error("❌ [CRON Analytics] Сбой записи исторических срезов CCU:", err.message);
        } finally {
            client.release();
        }
    });
}


module.exports = shedule;
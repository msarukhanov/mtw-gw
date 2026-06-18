

// Внутренний хелпер локализации интерфейса
function t(key, Game, replaceValue = null) {
    const lang = Game.locale || 'ru';
    let text = Game.config?.localization?.ui?.[lang]?.[key] || key;
    if (replaceValue !== null) text = text.replace('{value}', replaceValue);
    return text;
}

// Внутренний хелпер локализации объектов
function locObj(obj, Game) {
    if (!obj) return '';
    return obj[Game.locale || 'ru'] || obj['en'] || '';
}

// 1. СЕТЕВОЙ МЕТОД: Теперь живет строго внутри модуля Гачи
async function summonGacha(bannerId, modeValue, Game, updateUiCallback) {
    try {
        const res = await fetch(`${API_URL}/gacha/summon`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                game_id: Game.gameId,
                server_id: Game.serverId,
                device_id: Game.deviceId,
                banner_id: bannerId,
                mode: modeValue
            })
        });
        const data = await res.json();
        if (!res.ok || data.error) throw new Error(data.error || 'Summon error');

        // Обновляем глобальный стейт игрока
        Game.player = data.player_state;

        // Перерисовываем экран (чтобы обновились счетчики гаранта и баланс)
        updateUiCallback();

        // Формируем отчет о мульти-крутке без хардкод-текста
        const report = data.pull_results.map(res => {
            const name = locObj(Game.config.catalog.heroes[res.hero_id]?.title_loc, Game) || res.hero_id;
            const statusKey = res.is_duplicate_converted ? 'gacha_alert_dup' : 'gacha_alert_new';
            return `• [${res.rarity}] ${name} — ${t(statusKey, Game)}`;
        }).join('\n');

        alert(`${t('gacha_alert_title', Game)} (х${modeValue}):\n\n${report}`);

    } catch (err) {
        alert(t(err.message, Game));
    }
}

// 2. ГЕНЕРАЦИЯ HTML-СТРОКИ
function getGachaHTML(Game) {
    const lang = Game.locale || 'ru';
    const banners = Game.config?.gacha?.banners || [];
    const pools = Game.config?.gacha?.pools || {};

    let html = `
        <div class="screen-content ui-element" style="top:140px; padding-bottom:60px; flex-direction:row; flex-wrap:wrap; justify-content:center; gap:30px;">
            <h2 style="width:100%; margin:0; text-align:center; font-size:26px;">${t('gacha_title', Game)}</h2>
    `;

    if (banners.length === 0) {
        html += `<div style="color:#aaa; padding:20px;">No banners...</div>`;
    } else {
        html += banners.map(banner => {
            const pool = pools[banner.pool_id];
            if (!pool) return '';

            const currentPity = Game.player.gacha_pity?.[banner.id] || 0;
            let userBalance = 0;
            let currencyIcon = '🔮';

            const resourceMeta = Game.config?.mechanics?.resources?.[pool.currency];
            if (resourceMeta) currencyIcon = resourceMeta.icon || '🔮';

            if (Game.player.resources[pool.currency] !== undefined) {
                userBalance = Game.player.resources[pool.currency];
            } else if (Game.player.inventory[pool.currency] !== undefined) {
                userBalance = Game.player.inventory[pool.currency];
            }

            return `
                <div style="background:#221042; border:2px solid #5e35b1; width:100%; max-width:400px; padding:30px; border-radius:16px; text-align:center; box-sizing:border-box;">
                    <h3 style="margin-top:0; font-size:20px; color:#fff;">${locObj(banner.title_loc, Game)}</h3>
                    <p style="color:#b39ddb; font-size:14px; margin:10px 0;">
                        SSR — ${pool.rates.SSR}%, SR — ${pool.rates.SR}%, R — ${pool.rates.R}%
                    </p>
                    ${banner.pity_threshold > 0 ? `
                        <p style="color:#ffeb3b; font-weight:bold; font-size:14px; margin:10px 0;">
                            ${t('gacha_pity', Game, banner.pity_threshold - currentPity)}
                        </p>
                    ` : `<p style="color:#888; font-size:13px; font-style:italic;">No pity</p>`}
                    
                    <p style="font-size:15px; background:#11052C; padding:8px; border-radius:6px; margin:15px 0;">
                        ${lang === 'ru' ? 'В наличии:' : 'In stock:'} <b style="color:#4caf50;">${userBalance} ${currencyIcon}</b>
                    </p>
                    
                    <div style="display:flex; gap:10px; width:100%; margin-top:20px; justify-content:center;">
                        ${pool.modes.map(modeValue => {
                return `
                                <button class="btn ${banner.id === 'banner_zeus_event' ? 'pulse' : ''}" 
                                        style="background:#e91e63; font-size:14px; padding:12px; flex:1; height:auto; width:auto;" 
                                        data-summon-banner-id="${banner.id}" 
                                        data-summon-mode="${modeValue}">
                                    ${t('gacha_btn', Game)} x${modeValue}<br>
                                    <span style="font-size:11px; opacity:0.8; font-weight:normal;">(${pool.cost * modeValue} ${currencyIcon})</span>
                                </button>
                            `;
            }).join('')}
                    </div>
                </div>
            `;
        }).join('');
    }

    html += `</div>`;
    return html;
}

// 3. ТОЧКА ВХОДА ДЛЯ АДМИНИСТРИРОВАНИЯ ЭКРАНА
// Эта функция вызывается из render.js, она генерирует HTML и САМА вешает клики!
export function initGachaScreen(container, Game, updateUiCallback) {
    // Рендерим HTML контент
    container.innerHTML += getGachaHTML(Game);

    // НАВЕШИВАЕМ КЛИКИ СТРОГО ВНУТРИ ЭТОГО МОДУЛЯ (Локальная делегация)
    container.querySelectorAll('[data-summon-banner-id]').forEach(btn => {
        btn.onclick = () => {
            const bannerId = btn.dataset.summonBannerId;
            const modeValue = parseInt(btn.dataset.summonMode);

            // Запускаем локальный сетевой запрос призыва
            summonGacha(bannerId, modeValue, Game, updateUiCallback);
        };
    });
}

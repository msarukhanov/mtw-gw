const mtwProjectCurrencies = [
    { code: 'USD', flag: '$' },
    { code: 'EUR', flag: '€' },
    { code: 'BRL', flag: 'R$' },
    { code: 'RUB', flag: '₽' },
    { code: 'NGN', flag: '₦' },
    { code: 'EGP', flag: 'E£' },
    { code: 'INR', flag: '🇮🇳' }
];

const mtwProjectGateways = [
    { id: 'cryptomus', name: 'Cryptomus<br>(Crypto API)', icon: '🪙' },
    { id: 'aaio', name: 'AAIO Gateway<br>(RUB/CIS)', icon: '💳' },
    { id: 'pix', name: 'PIX Direct<br>(Brazil)', icon: '🇧🇷' },
    { id: 'payeer', name: 'Payeer<br>Wallet)', icon: '🅿️' },
    { id: 'flutterwave', name: 'Flutterwave<br>(Africa)', icon: '🌍' },
    { id: 'vodafone', name: 'Vodafone Cash<br>(MENA/Egypt)', icon: '📱' },
];

// const mtwProjectGateways = [
//     { id: 'cryptomus', name: 'Cryptomus API', icon: '🪙' },
//     { id: 'aaio', name: 'AAIO Payments', icon: '💳' },
//     { id: 'pix', name: 'PIX Direct', icon: '🇧🇷' },
//     { id: 'payeer', name: 'Payeer Wallet', icon: '🅿️' },
//     { id: 'flutterwave', name: 'Flutterwave', icon: '🌍' },
//     { id: 'vodafone', name: 'Vodafone Cash', icon: '📱' }
// ];

let currentWebsiteGatewaysCache = {};

function initGatewayModalSelectors() {
    const gSelect = document.getElementById('md_p_gateway');
    const cSelect = document.getElementById('md_p_currency');
    if (!gSelect || !cSelect) return;

    gSelect.innerHTML = mtwProjectGateways.map(g => `<option value="${g.id}">🔌 ${g.name}</option>`).join('');
    cSelect.innerHTML = mtwProjectCurrencies.map(c => `<option value="${c.code}">${c.flag} ${c.code}</option>`).join('');
}
initGatewayModalSelectors();

function openAdminGatewayLimitsModal(targetGatewayId) {
    const modal = document.getElementById('adminGatewayLimitsModal');
    if (!modal) return;

    modal.style.display = 'flex';

    // 🪄 АВТО-СЕЛЕКТ: Если кликнули по конкретной карточке, принудительно выставляем этот шлюз в выпадающий список модалки
    if (targetGatewayId) {
        const gSelect = document.getElementById('md_p_gateway');
        if (gSelect) gSelect.value = targetGatewayId;
    }

    syncAdminGatewayFieldsFromCache(); // Загружает лимиты и галочку из кэша для этой пары
}

function closeAdminGatewayLimitsModal() {
    const modal = document.getElementById('adminGatewayLimitsModal');
    if (modal) modal.style.display = 'none';
}

function syncAdminGatewayFieldsFromCache() {
    const gtw = document.getElementById('md_p_gateway').value;
    const cur = document.getElementById('md_p_currency').value;

    document.getElementById('md_p_matrix_title').innerText = `CONFIGURING ROUTE NODE: [${gtw.toUpperCase()}] ➔ [${cur}]`;

    // Если шлюза еще нет в кэше — создаем базовую пустую структуру
    if (!currentWebsiteGatewaysCache[gtw]) {
        currentWebsiteGatewaysCache[gtw] = { is_active: true, limits: {} };
    }
    if (!currentWebsiteGatewaysCache[gtw].limits) {
        currentWebsiteGatewaysCache[gtw].limits = {};
    }

    // А. Восстанавливаем состояние ГАЛОЧКИ активности шлюза (по дефолту true, если не задано)
    const isGatewayEnabled = currentWebsiteGatewaysCache[gtw].is_active !== false;
    document.getElementById('md_p_gateway_is_active').checked = isGatewayEnabled;

    // Б. Восстанавливаем лимиты для выбранной валюты
    const nodeLimits = currentWebsiteGatewaysCache[gtw].limits[cur] || { min_dep: 10, max_dep: 5000, min_out: 20, max_out: 2000 };

    document.getElementById('md_p_min_dep').value = nodeLimits.min_dep;
    document.getElementById('md_p_max_dep').value = nodeLimits.max_dep;
    document.getElementById('md_p_min_out').value = nodeLimits.min_out;
    document.getElementById('md_p_max_out').value = nodeLimits.max_out;
}

// 2. ФИКСАЦИЯ ИЗМЕНЕНИЙ В КЭШ ПРИ НАЖАТИИ КНОПКИ APPLY NODE
function applyGatewayModalChangesToCache() {
    const gtw = document.getElementById('md_p_gateway').value;
    const cur = document.getElementById('md_p_currency').value;

    if (!currentWebsiteGatewaysCache[gtw]) {
        currentWebsiteGatewaysCache[gtw] = { is_active: true, limits: {} };
    }
    if (!currentWebsiteGatewaysCache[gtw].limits) {
        currentWebsiteGatewaysCache[gtw].limits = {};
    }

    // А. Записываем состояние галочки шлюза в корень объекта
    currentWebsiteGatewaysCache[gtw].is_active = document.getElementById('md_p_gateway_is_active').checked;

    // Б. Записываем лимиты конкретной валюты
    currentWebsiteGatewaysCache[gtw].limits[cur] = {
        min_dep: parseFloat(document.getElementById('md_p_min_dep').value) || 10,
        max_dep: parseFloat(document.getElementById('md_p_max_dep').value) || 5000,
        min_out: parseFloat(document.getElementById('md_p_min_out').value) || 20,
        max_out: parseFloat(document.getElementById('md_p_max_out').value) || 2000
    };

    console.log(`⚡ [Cache Updated with Switcher] Matrix node ${gtw} -> ${cur} synchronized:`, currentWebsiteGatewaysCache[gtw]);

    const applyBtn = document.querySelector('[onclick="applyGatewayModalChangesToCache()"]');
    applyBtn.innerText = '✅ NODE APPLIED';
    applyBtn.style.background = 'var(--neon-green)';

    setTimeout(() => {
        applyBtn.innerText = '💾 APPLY NODE';
        applyBtn.style.background = 'var(--accent-pink)';
        closeAdminGatewayLimitsModal();

        // 🪄 МГНОВЕННЫЙ АПДЕЙТ ВИТРИНЫ: карточка сразу изменит цвет или статус на главной форме TAB 10!
        renderAdminGatewayStatusGrid();
    }, 600);
}

function renderAdminGatewayStatusGrid() {
    const gridContainer = document.getElementById('admin-gateways-status-grid');
    if (!gridContainer) return;

    gridContainer.innerHTML = mtwProjectGateways.map(gtw => {
        // Достаем из локального кэша сайта настройки этого шлюза
        const gtwCache = currentWebsiteGatewaysCache[gtw.id] || { is_active: true };
        const isActive = gtwCache.is_active !== false;

        // Визуальные неоновые стили в зависимости от того, включен шлюз или выключен
        const cardStyle = isActive
            ? 'background: rgba(78, 204, 163, 0.03); border: 1px solid rgba(78, 204, 163, 0.2); box-shadow: 0 0 6px rgba(78, 204, 163, 0.05);'
            : 'background: rgba(0,0,0,0.2); border: 1px solid #1c2331; opacity: 0.6;';

        const dotColor = isActive ? '#00f5d4; box-shadow: 0 0 6px #00f5d4;' : '#3d4657;';
        const statusText = isActive ? 'ACTIVE' : 'DISABLED';
        const statusTextColor = isActive ? '#00f5d4' : 'var(--text-muted)';

        return `
            <div onclick="openAdminGatewayLimitsModal('${gtw.id}')" 
                 onmouseover="this.style.borderColor='var(--accent-pink)'" 
                 onmouseout="this.style.borderColor='${isActive ? 'rgba(78, 204, 163, 0.2)' : '#1c2331'}'"
                 style="padding: 10px; border-radius: 6px; text-align: center; transition: all 0.2s ease; cursor: pointer; display: flex; flex-direction: column; gap: 4px; ${cardStyle}">
                
                <span style="font-size: 18px; display:block; margin-bottom: 2px;">${gtw.icon}</span>
                <b style="color: #fff; font-size: 11px; display: block; text-transform: uppercase; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${gtw.name}">${gtw.name}</b>
                
                <!-- Маленький живой статус-индикатор под низом карточки -->
                <div style="display: flex; align-items: center; justify-content: center; gap: 4px; margin-top: 2px;">
                    <span style="display: inline-block; width: 5px; height: 5px; border-radius: 50%; background: ${dotColor}"></span>
                    <span style="font-size: 9px; font-weight: 800; color: ${statusTextColor}; letter-spacing: 0.3px;">${statusText}</span>
                </div>
            </div>
        `;
    }).join('');
}

renderAdminGatewayStatusGrid();

async function loadAdminWebsites() {
    try {
        const currentPartnerId = localStorage.getItem('partnerId') || 'demo_mtwtech';
        const res = await fetch(`${SERVER_URL}/api/admin/websites?partnerId=${currentPartnerId}`);
        const data = await res.json();

        const tbody = document.getElementById('adminWebsitesTableBody');
        const bTargetSelect = document.getElementById('b_target_site');
        const bFilterSelect = document.getElementById('b_filter_site');

        if (data.success && data.websites) {
            cachedWebsites = data.websites; // Сохраняем в кэш

            if (tbody) {
                if (data.websites.length === 0) {
                    tbody.innerHTML = `<tr><td colspan="3" style="text-align:center; padding:15px; color:var(--text-muted);">No websites registered</td></tr>`;
                } else {
                    tbody.innerHTML = data.websites.map(w => {
                        const set = typeof w.settings === 'string' ? JSON.parse(w.settings) : (w.settings || {});
                        const stl = typeof w.styles === 'string' ? JSON.parse(w.styles) : (w.styles || {});
                        const isMaint = set.maintenance ? '🛠️ ТЕХ' : '🟢 ON';
                        const badgeColor = set.maintenance ? '#381b1b' : '#1b382c';
                        const accentColor = stl.primaryColor || '#00a8ff';

                        // Подсвечиваем строку, если она выбрана для редактирования
                        const isSelectedRow = editingWebsiteId === w.id ? 'background: rgba(0, 168, 255, 0.08); border-left: 2px solid var(--accent-blue);' : '';

                        return `
                            <tr style="border-bottom: 1px solid #141822; cursor:pointer; ${isSelectedRow}" onclick="editWebsiteNode(${w.id})">
                                <td style="padding:10px 0;">
                                    <b>${w.title}</b><br>
                                    <small style="color:var(--text-muted); font-size:11px;">${stl.bgTheme === 'dark' ? '🌌 Dark' : '☀️ Light'}</small>
                                </td>
                                <td style="font-family:monospace; vertical-align: middle;">
                                    <span style="color:${accentColor};">●</span> ${w.domain_name}
                                </td>
                                <td style="text-align:right; vertical-align: middle; display:flex; gap:8px; justify-content:flex-end; padding-top:14px;" onclick="event.stopPropagation();">
                                    <span class="badge" style="background:${badgeColor}; color: #fff; font-size:10px; padding:3px 6px; border-radius:4px; font-weight:600; height:fit-content;">
                                        ${isMaint}
                                    </span>
                                    <button type="button" onclick="deleteWebsiteNode(${w.id})" style="background:transparent; border:none; color:#ff4d4d; cursor:pointer; font-size:14px; padding:0 5px;" title="Удалить сайт">×</button>
                                </td>
                            </tr>
                        `;
                    }).join('');
                }
            }

            const optionsHtml = data.websites.map(w => `<option value="${w.id}">${w.title} (${w.domain_name})</option>`).join('');
            if (bTargetSelect) bTargetSelect.innerHTML = optionsHtml;
            if (bFilterSelect) bFilterSelect.innerHTML = `<option value="">🌍 Все подключенные сайты</option>` + optionsHtml;

            const tlTargetSelect = document.getElementById('tl_target_site');
            if (tlTargetSelect) {
                tlTargetSelect.innerHTML = data.websites.map(w => `<option value="${w.id}">${w.title} (${w.domain_name})</option>`).join('');
            }
// Сразу подгружаем переводы для первого сайта в селекторе
            initDashboardFilters();
        }
    } catch (err) { console.error(err); }
}

function editWebsiteNode(websiteId) {
    // cachedWebsites заводится глобально при загрузке таблицы сайтов
    const site = cachedWebsites.find(w => w.id === websiteId);
    if (!site) return console.error(`[Admin] Brand website ${websiteId} not found in cache.`);

    editingWebsiteId = websiteId;

    // Безопасно парсим JSONB объекты, если они пришли строкой
    const set = typeof site.settings === 'string' ? JSON.parse(site.settings) : (site.settings || {});
    const meta = typeof site.meta === 'string' ? JSON.parse(site.meta) : (site.meta || {});
    const stl = typeof site.styles === 'string' ? JSON.parse(site.styles) : (site.styles || {});

    // 💱 РАСПАКОВКА ВАЛЮТ (Пункт 3)
    // const curCfg = typeof site.currency_settings === 'string' ? JSON.parse(site.currency_settings) : (site.currency_settings || { supported_currencies: ['USD'], default_currency: 'USD' });
    // const supportedCurrencies = curCfg.supported_currencies || ['USD'];
    //
    // document.querySelectorAll('.w-currency-checkbox').forEach(cb => {
    //     cb.checked = supportedCurrencies.includes(cb.value);
    // });
    // const defCurrSelect = document.getElementById('w_default_currency');
    // if (defCurrSelect) defCurrSelect.value = curCfg.default_currency || 'USD';

    const curCfg = typeof site.currency_settings === 'string' ? JSON.parse(site.currency_settings) : (site.currency_settings || {});
    const supportedList = curCfg.supported_currencies || [];
    const limitsMap = curCfg.currencies || {};

// Намертво заливаем в оперативку админки сохраненную в Postgres матрицу шлюзов
    currentWebsiteGatewaysCache = curCfg.gateways || {};
    renderAdminGatewayStatusGrid();
    // mtwProjectCurrencies.forEach(cur => {
    //     const chk = document.getElementById(`cur_chk_${cur.code}`);
    //     if (chk) chk.checked = supportedList.includes(cur.code);
    //
    //     // Если лимитов в базе еще нет — выставляем безопасные базовые заглушки
    //     const limits = limitsMap[cur.code] || { min_dep: 10, max_dep: 5000, min_out: 20, max_out: 2000 };
    //     if(document.getElementById(`limits_${cur.code}_min_dep`)) document.getElementById(`limits_${cur.code}_min_dep`).value = limits.min_dep;
    //     if(document.getElementById(`limits_${cur.code}_max_dep`)) document.getElementById(`limits_${cur.code}_max_dep`).value = limits.max_dep;
    //     if(document.getElementById(`limits_${cur.code}_min_out`)) document.getElementById(`limits_${cur.code}_min_out`).value = limits.min_out;
    //     if(document.getElementById(`limits_${cur.code}_max_out`)) document.getElementById(`limits_${cur.code}_max_out`).value = limits.max_out;
    // });
    //
    // if (document.getElementById('w_default_currency')) {
    //     document.getElementById('w_default_currency').value = curCfg.default_currency || mtwProjectCurrencies[0].code;
    // }


    // 🌐 РАСПАКОВКА СИСТЕМНЫХ ЯЗЫКОВ И ПЛАТЕЖЕК
    const gtw = set.gateways || { cryptomus: true, aaio: true, pix: true, payeer: true, flutterwave: true, vodafone: true };
    const langCfg = typeof site.lang_settings === 'string' ? JSON.parse(site.lang_settings) : (site.lang_settings || { supported_langs: ['en'], default_lang: 'en' });
    const supportedLangs = langCfg.supported_langs || ['en'];

    // Восстанавливаем чекбоксы шлюзов в кассе
    if(document.getElementById('w_pay_cryptomus')) document.getElementById('w_pay_cryptomus').checked = gtw.cryptomus !== false;
    if(document.getElementById('w_pay_aaio')) document.getElementById('w_pay_aaio').checked = gtw.aaio !== false;
    if(document.getElementById('w_pay_pix')) document.getElementById('w_pay_pix').checked = gtw.pix !== false;
    if(document.getElementById('w_pay_payeer')) document.getElementById('w_pay_payeer').checked = gtw.payeer !== false;
    if(document.getElementById('w_pay_flutterwave')) document.getElementById('w_pay_flutterwave').checked = gtw.flutterwave !== false;
    if(document.getElementById('w_pay_vodafone')) document.getElementById('w_pay_vodafone').checked = gtw.vodafone !== false;

    // Восстанавливаем чекбоксы доступных сайту языков
    ['en', 'es', 'pt', 'fr', 'de', 'it', 'hi', 'ru'].forEach(lang => {
        const chk = document.getElementById(`tl_check_${lang}`);
        if (chk) chk.checked = supportedLangs.includes(lang);
    });
    const defLangSelect = document.getElementById('tl_default_lang');
    if (defLangSelect) defLangSelect.value = langCfg.default_lang || 'en';

    // Восстанавливаем базовые текстовые инпуты
    document.getElementById('w_domain').value = site.domain_name;
    document.getElementById('w_title').value = site.title;
    document.getElementById('w_reg_open').checked = set.registrationOpen !== false;
    document.getElementById('w_maintenance').checked = !!set.maintenance;

    document.getElementById('w_meta_title').value = meta.title || '';
    document.getElementById('w_meta_desc').value = meta.description || '';
    document.getElementById('w_theme_mode').value = stl.bgTheme || 'dark';
    document.getElementById('w_color_hex').value = stl.primaryColor || '#e94560';
    if(document.getElementById('w_color_picker')) document.getElementById('w_color_picker').value = stl.primaryColor || '#e94560';

    // Переводим форму в режим обновления
    const submitBtn = document.getElementById('w_submit_btn');
    if (submitBtn) {
        submitBtn.innerText = '🔄 Update Brand Configurations';
        submitBtn.style.background = 'var(--accent-pink)';
    }
    if (document.getElementById('w_cancel_btn')) document.getElementById('w_cancel_btn').style.display = 'inline-block';

    // Обновляем таблицы отображения локализации и баннеров под выбранный ID сайта
    const tlTargetSite = document.getElementById('tl_target_site');
    if (tlTargetSite) {
        tlTargetSite.value = websiteId;
        // loadAdminTranslationMatrix(); // Пересобирает рекурсивное дерево инпутов перевода для этого сайта
    }
}

function resetWebsiteForm() {
    editingWebsiteId = null;
    document.getElementById('websiteForm').reset();

    // Возвращаем дефолты чекбоксов и пикеров
    document.getElementById('w_reg_open').checked = true;
    document.getElementById('w_maintenance').checked = false;
    document.getElementById('w_color_picker').value = '#e94560';
    document.getElementById('w_color_hex').value = '#e94560';

    document.getElementById('w_submit_btn').innerText = '💾 Save Brand Domain & Layout';
    document.getElementById('w_submit_btn').style.background = 'var(--accent-blue)';
    document.getElementById('w_cancel_btn').style.display = 'none';

    document.getElementById('w_pay_cryptomus').checked = true;
    document.getElementById('w_pay_aaio').checked = true;
    document.getElementById('w_pay_pix').checked = true;
    document.getElementById('w_pay_payeer').checked = true;
    document.getElementById('w_pay_flutterwave').checked = true;
    document.getElementById('w_pay_vodafone').checked = true;

    loadAdminWebsites();
}

// 4. Обработчик формы: создание или апдейт в зависимости от переменной editingWebsiteId
document.getElementById('websiteForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    let domainInput = document.getElementById('w_domain').value.trim();
    const domain = domainInput
        .replace(/^(https?:\/\/)?(www\.)?/, '') // убирает протоколы и www
        .split('/')[0]                          // отсекает пути (всё, что после /)
        .split(':')[0];                         // отсекает порты (всё, что после :)

    const title = document.getElementById('w_title').value.trim();
    if (!domain || !title) return alert('Domain Name and Brand Title are required.');

    const currentPartnerId = localStorage.getItem('partnerId') || 'demo_mtwtech';

    // const selectedCurrencies = [];
    // document.querySelectorAll('.w-currency-checkbox:checked').forEach(cb => {
    //     selectedCurrencies.push(cb.value);
    // });
    //
    // if (selectedCurrencies.length === 0) {
    //     alert('Please select at least one enabled wallet currency.');
    //     return;
    // }
    //
    // const currencySettings = {
    //     supported_currencies: selectedCurrencies,
    //     default_currency: document.getElementById('w_default_currency').value
    // };

    const enabledWallets = [];
    document.querySelectorAll('.brand-wallet-cb:checked').forEach(cb => enabledWallets.push(cb.value));

    if (enabledWallets.length === 0) return alert('Select at least one brand wallet asset.');

    const currencySettings = {
        default_currency: document.getElementById('w_default_currency').value,
        supported_currencies: enabledWallets,
        gateways: currentWebsiteGatewaysCache // Отправляем этот вложенный объект в СУБД!
    };

    // const currencySettings = {
    //     default_currency: document.getElementById('w_default_currency').value,
    //     supported_currencies: enabledCurrencies,
    //     currencies: currenciesObject
    // };
    // Упаковываем основные сеттинги и включенные шлюзы в один объект settings

    // Дальше переменные metaObj, stylesObj и отправка fetch (остаются как были)

    // Собираем чистый объект конфигурации
    const payload = {
        partnerId: currentPartnerId,
        domain: domain,
        title: title,
        settings: {
            registrationOpen: document.getElementById('w_reg_open').checked,
            maintenance: document.getElementById('w_maintenance').checked,
            gateways: {
                cryptomus: document.getElementById('w_pay_cryptomus').checked,
                aaio: document.getElementById('w_pay_aaio').checked,
                pix: document.getElementById('w_pay_pix').checked,
                payeer: document.getElementById('w_pay_payeer').checked,
                flutterwave: document.getElementById('w_pay_flutterwave').checked,
                vodafone: document.getElementById('w_pay_vodafone').checked
            },
            currencySettings
        },
        meta: {
            title: document.getElementById('w_meta_title').value.trim() || title,
            description: document.getElementById('w_meta_desc').value.trim()
        },
        styles: {
            bgTheme: document.getElementById('w_theme_mode').value,
            primaryColor: document.getElementById('w_color_hex').value
        }
    };

    // ОПРЕДЕЛЯЕМ ЭНДПОИНТ: Если редактируем — переключаем роут и добавляем id в payload
    let targetUrl = `${SERVER_URL}/api/admin/websites/create`;

    if (editingWebsiteId) {
        targetUrl = `${SERVER_URL}/api/admin/websites/update`;
        payload.id = editingWebsiteId; // Добавляем ID строки для WHERE запроса в SQL
    }

    showLoader();
    try {
        const res = await fetch(targetUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await res.json();

        if (!res.error && data.success) {
            alert(editingWebsiteId ? 'Website configurations updated successfully!' : 'New website brand registered!');
            resetWebsiteForm(); // Сбрасывает форму и очищает переменную editingWebsiteId
        } else {
            alert(`Error: ${data.error || 'Failed to execute database command'}`);
        }
    } catch (err) {
        console.error(err);
        alert('Network connection error during layout deployment');
    } finally {
        hideLoader();
    }
});

async function deleteWebsiteNode(websiteId) {
    if (!confirm('ВНИМАНИЕ! Удаление сайта полностью удалит его домен, настройки, метатеги и ВСЕ привязанные к нему баннеры слайдеров. Продолжить?')) return;

    showLoader();
    const currentPartnerId = localStorage.getItem('partnerId') || 'demo_mtwtech';
    try {
        const res = await fetch(`${SERVER_URL}/api/admin/websites/delete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ partnerId: currentPartnerId, websiteId })
        });
        if (!res.error) {
            if (editingWebsiteId === websiteId) resetWebsiteForm();
            await loadAdminWebsites();
        }
    } catch (err) { console.error(err); }
    finally { hideLoader(); }
}



// // Функция автоматической сборки HTML-интерфейса валют при загрузке админки
// function renderAdminCurrencyMatrixLayout() {
//     const matrixContainer = document.getElementById('admin-currency-matrix-inputs');
//     const defaultSelect = document.getElementById('w_default_currency');
//     if (!matrixContainer || !defaultSelect) return;
//
//     // Генерируем строки лимитов для каждой валюты из массива
//     matrixContainer.innerHTML = mtwProjectCurrencies.map(cur => `
//         <div style="display:grid; grid-template-columns: 100px repeat(4, 1fr); gap:8px; align-items:center; border-bottom:1px solid #141822; padding-bottom:8px;">
//             <label style="color:#fff; font-size:12px; font-weight:bold; cursor:pointer;"><input type="checkbox" class="currency-row-toggle" value="${cur.code}" id="cur_chk_${cur.code}"> ${cur.flag} ${cur.code}</label>
//             <label style="font-size:10px; color:var(--text-muted);">Min Dep:<input type="number" id="limits_${cur.code}_min_dep" style="margin-top:2px; padding:4px; background:#0d1017; color:#fff; border:1px solid #262c3a; width:100%; font-size:11px;"></label>
//             <label style="font-size:10px; color:var(--text-muted);">Max Dep:<input type="number" id="limits_${cur.code}_max_dep" style="margin-top:2px; padding:4px; background:#0d1017; color:#fff; border:1px solid #262c3a; width:100%; font-size:11px;"></label>
//             <label style="font-size:10px; color:var(--text-muted);">Min Out:<input type="number" id="limits_${cur.code}_min_out" style="margin-top:2px; padding:4px; background:#0d1017; color:#fff; border:1px solid #262c3a; width:100%; font-size:11px;"></label>
//             <label style="font-size:10px; color:var(--text-muted);">Max Out:<input type="number" id="limits_${cur.code}_max_out" style="margin-top:2px; padding:4px; background:#0d1017; color:#fff; border:1px solid #262c3a; width:100%; font-size:11px;"></label>
//         </div>
//     `).join('');
//
//     // Наполняем выпадающий список дефолтной валюты
//     defaultSelect.innerHTML = mtwProjectCurrencies.map(cur => `
//         <option value="${cur.code}">${cur.flag} ${cur.code}</option>
//     `).join('');
// }
//
// // Запусти эту функцию один раз при инициализации панели (например, в DOMContentLoaded)
// renderAdminCurrencyMatrixLayout();

function renderAdminGatewayMatrixLayout() {
    const walletBlock = document.getElementById('brand-active-wallets-checkboxes');
    const gatewayContainer = document.getElementById('admin-gateways-limits-container');
    const defaultSelect = document.getElementById('w_default_currency');
    if (!walletBlock || !gatewayContainer || !defaultSelect) return;

    // 1. Рисуем чекбоксы валют бренда
    walletBlock.innerHTML = mtwProjectCurrencies.map(cur => `
        <label style="display:flex; align-items:center; gap:6px; font-size:12px; color:#fff; cursor:pointer;">
            <input type="checkbox" class="brand-wallet-cb" value="${cur.code}" id="b_wal_cb_${cur.code}"> ${cur.flag} ${cur.code}
        </label>
    `).join('');

    // 2. Наполняем селектор дефолта
    defaultSelect.innerHTML = mtwProjectCurrencies.map(cur => `<option value="${cur.code}">${cur.flag} ${cur.code}</option>`).join('');

    // 3. Рисуем аккордеоны/блоки для каждого шлюза и ВСЕХ валют внутри него!
    gatewayContainer.innerHTML = mtwProjectGateways.map(gtw => `
        <div style="border: 1px solid #1a1e26; background: #0c0f14; padding: 10px; border-radius: 5px;">
            <b style="color: var(--accent-pink); font-size: 11px; text-transform: uppercase; display:block; margin-bottom:8px;">🔌 ${gtw.name}</b>
            <div style="display:flex; flex-direction:column; gap:6px;">
                ${mtwProjectCurrencies.map(cur => `
                    <div style="display:grid; grid-template-columns: 80px repeat(4, 1fr); gap:6px; align-items:center; background:#090b0f; padding:6px; border-radius:4px;">
                        <span style="font-size:11px; color:#fff; font-weight:bold;">${cur.code}:</span>
                        <label style="font-size:9px; color:var(--text-muted);">Min Dep:<input type="number" id="gate_${gtw.id}_${cur.code}_min_dep" style="padding:3px; background:#0d1017; color:#fff; border:1px solid #262c3a; width:100%; font-size:11px;"></label>
                        <label style="font-size:9px; color:var(--text-muted);">Max Dep:<input type="number" id="gate_${gtw.id}_${cur.code}_max_dep" style="padding:3px; background:#0d1017; color:#fff; border:1px solid #262c3a; width:100%; font-size:11px;"></label>
                        <label style="font-size:9px; color:var(--text-muted);">Min Out:<input type="number" id="gate_${gtw.id}_${cur.code}_min_out" style="padding:3px; background:#0d1017; color:#fff; border:1px solid #262c3a; width:100%; font-size:11px;"></label>
                        <label style="font-size:9px; color:var(--text-muted);">Max Out:<input type="number" id="gate_${gtw.id}_${cur.code}_max_out" style="padding:3px; background:#0d1017; color:#fff; border:1px solid #262c3a; width:100%; font-size:11px;"></label>
                    </div>
                `).join('')}
            </div>
        </div>
    `).join('');
}
renderAdminGatewayMatrixLayout();
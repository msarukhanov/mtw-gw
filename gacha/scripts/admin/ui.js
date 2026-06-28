// let currentUiOrientation = 'landscape';
// let stateUiWidgetIdx = null;
//
// function switchUiOrientation(orientation, evt) {
//     currentUiOrientation = orientation;
//     stateUiWidgetIdx = null;
//
//     if (evt && evt.target && evt.target.parentElement) {
//         const parent = evt.target.parentElement;
//         parent.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
//         evt.target.classList.add('active');
//     }
//
//     document.getElementById('ui-sidebar-title').innerText = `${orientation.charAt(0).toUpperCase() + orientation.slice(1)} Elements`;
//     document.getElementById('ui-widget-editor').innerHTML = '';
//
//     if (!target.ui[orientation]) {
//         target.ui[orientation] = [];
//     }
//
//     // Динамически управляем пропорциями и геометрией виртуального смартфона
//     const device = document.getElementById('virtual-device-wrapper');
//     if (device) {
//         if (orientation === 'portrait') {
//             device.style.aspectRatio = '9 / 16';
//             device.style.maxWidth = '360px'; // Задаем аккуратную portrait-ширину, чтобы он не улетал по высоте
//             device.style.height = '100%';
//         } else {
//             device.style.aspectRatio = '16 / 9';
//             device.style.maxWidth = '800px'; // Идеальный ландшафтный масштаб
//             device.style.height = 'auto';
//         }
//     }
//
//     renderUiWindowsSettings();
//     renderUiWidgetsList();
// }
//
// function renderUiWindowsSettings() {
//     const container = document.getElementById('ui-windows-settings-form');
//     const settings = target.ui.windows_settings || {};
//
//     container.innerHTML = Object.keys(settings).map(key => `
//         <div class="form-group">
//             <label>${key.replace('_', ' ')}</label>
//             <input type="text" value="${settings[key]}" oninput="target.ui.windows_settings['${key}'] = this.value">
//         </div>
//     `).join('');
// }
//
// function renderUiWidgetsList() {
//     const list = document.getElementById('ui-widgets-list');
//     const collection = target.ui[currentUiOrientation] || [];
//
//     list.innerHTML = collection.map((item, idx) => `
//         <li class="crud-list-item ${stateUiWidgetIdx === idx ? 'active' : ''}" onclick="selectUiWidget(${idx})">
//             <span>${item.id || 'unnamed_widget'}</span>
//             <span class="badge">${item.type || 'widget'}</span>
//         </li>
//     `).join('');
// }
//
// function createNewUiWidget() {
//     if (!target.ui[currentUiOrientation]) {
//         target.ui[currentUiOrientation] = [];
//     }
//
//     const newWidget = {
//         id: `widget_${Date.now()}`,
//         type: "button",
//         label_loc_key: "",
//         action: "",
//         layout: { top: "0px", left: "0px", width: "100px", height: "40px", backgroundColor: "#222222" }
//     };
//
//     target.ui[currentUiOrientation].push(newWidget);
//     selectUiWidget(target.ui[currentUiOrientation].length - 1);
// }
//
// function deleteUiWidget(idx) {
//     if (!confirm('Are you sure you want to delete this UI element?')) return;
//
//     const item = target.ui[currentUiOrientation][idx];
//     if (item && item.id) {
//         cascadeDeleteKey('ui_widget', item.id);
//     }
//
//     target.ui[currentUiOrientation].splice(idx, 1);
//     stateUiWidgetIdx = null;
//     document.getElementById('ui-widget-editor').innerHTML = '';
//     renderUiWidgetsList();
// }
//
// function selectUiWidget(idx) {
//     stateUiWidgetIdx = idx;
//     renderUiWidgetsList();
//
//     const item = target.ui[currentUiOrientation][idx];
//     const ed = document.getElementById('ui-widget-editor');
//
//     const locOptions = Object.keys(target.localization?.ui?.en || {}).map(locKey =>
//         `<option value="${locKey}" ${item.label_loc_key === locKey ? 'selected' : ''}>${locKey} (${target.localization.ui.en[locKey]})</option>`
//     ).join('');
//
//     const dialogOptions = Object.keys(target.dialogs || {}).map(dKey =>
//         `<option value="open_dialog_${dKey}" ${item.action === `open_dialog_${dKey}` ? 'selected' : ''}>Trigger Dialog: ${dKey}</option>`
//     ).join('');
//
//     let nestedStructuresHtml = '';
//
//     if (item.layout) {
//         nestedStructuresHtml += `
//             <div class="sub-section">
//                 <div class="sub-section-title">Box Geometry Layout</div>
//                 <div class="form-grid">
//                     ${Object.keys(item.layout).map(lKey => `
//                         <div class="form-group">
//                             <label>${lKey}</label>
//                             <input type="text" value="${item.layout[lKey]}" oninput="target.ui['${currentUiOrientation}'][${idx}].layout['${lKey}'] = this.value">
//                         </div>
//                     `).join('')}
//                 </div>
//             </div>
//         `;
//     }
//
//     if (item.companion_stream) {
//         const stream = item.companion_stream;
//         nestedStructuresHtml += `
//             <div class="sub-section">
//                 <div class="sub-section-title">Companion Stream Overlay</div>
//                 <div class="form-grid">
//                     <div class="form-group"><label>Enabled</label>
//                         <select onchange="target.ui['${currentUiOrientation}'][${idx}].companion_stream.enabled = (this.value === 'true')">
//                             <option value="true" ${stream.enabled ? 'selected' : ''}>True</option>
//                             <option value="false" ${!stream.enabled ? 'selected' : ''}>False</option>
//                         </select>
//                     </div>
//                     <div class="form-group"><label>Position Side</label><input type="text" value="${stream.position || ''}" oninput="target.ui['${currentUiOrientation}'][${idx}].companion_stream.position = this.value"></div>
//                     <div class="form-group"><label>Screen Width %</label><input type="text" value="${stream.width || ''}" oninput="target.ui['${currentUiOrientation}'][${idx}].companion_stream.width = this.value"></div>
//                     <div class="form-group"><label>Bubble Color</label><input type="text" value="${stream.bubble_color || ''}" oninput="target.ui['${currentUiOrientation}'][${idx}].companion_stream.bubble_color = this.value"></div>
//                 </div>
//             </div>
//         `;
//     }
//
//     if (item.list_settings) {
//         const listSet = item.list_settings;
//         nestedStructuresHtml += `
//             <div class="sub-section">
//                 <div class="sub-section-title">List Rendering Layout</div>
//                 <div class="form-grid">
//                     <div class="form-group"><label>Display Mode</label><input type="text" value="${listSet.display_mode || ''}" oninput="target.ui['${currentUiOrientation}'][${idx}].list_settings.display_mode = this.value"></div>
//                     <div class="form-group"><label>Gap Size</label><input type="text" value="${listSet.gap || ''}" oninput="target.ui['${currentUiOrientation}'][${idx}].list_settings.gap = this.value"></div>
//                 </div>
//             </div>
//         `;
//     }
//
//     ed.innerHTML = `
//         <div class="card-header-flex">
//             <span class="card-title">Inspect Widget: ${item.id}</span>
//             <button class="danger" onclick="deleteUiWidget(${idx})">Delete Widget</button>
//         </div>
//         <div class="form-grid">
//             <div class="form-group"><label>Widget Unique ID</label><input type="text" value="${item.id || ''}" onchange="if(target.ui['${currentUiOrientation}'].some((w,wIdx)=>w.id===this.value && wIdx!==${idx})){alert('ID already exists!'); this.value='${item.id}';}else{target.ui['${currentUiOrientation}'][${idx}].id=this.value; renderUiWidgetsList();}"></div>
//             <div class="form-group"><label>Widget Type Class</label><input type="text" value="${item.type || ''}" oninput="target.ui['${currentUiOrientation}'][${idx}].type = this.value; renderUiWidgetsList();"></div>
//
//             <div class="form-group">
//                 <label>Action Callback Route</label>
//                 <select onchange="target.ui['${currentUiOrientation}'][${idx}].action = this.value">
//                     <option value="${item.action || ''}">Custom Action: ${item.action || 'None'}</option>
//                     <option value="go_back">Built-in: go_back</option>
//                     <option value="open_profile">Built-in: open_profile</option>
//                     ${dialogOptions}
//                 </select>
//             </div>
//
//             <div class="form-group">
//                 <label>Localization Key Bind</label>
//                 <select onchange="target.ui['${currentUiOrientation}'][${idx}].label_loc_key = this.value">
//                     <option value="">-- No Localization Assigned --</option>
//                     ${locOptions}
//                 </select>
//             </div>
//
//             <div class="form-group full-width"><label>Static Background Artwork Asset</label><input type="text" value="${item.backgroundImage || ''}" oninput="target.ui['${currentUiOrientation}'][${idx}].backgroundImage = this.value"></div>
//         </div>
//         ${nestedStructuresHtml}
//     `;
//
//     sendUpdateToPreview();
// }
//
// function reloadUiPreviewFrame() {
//     const iframe = document.getElementById('ui-preview-iframe');
//     if (!iframe) return;
//
//     // Вешаем одноразовый слушатель события 'load' на iframe
//     // Как только страница внутри фрейма полностью загрузится — сработает триггер обновления
//     iframe.addEventListener('load', function onFrameReloaded() {
//         sendUpdateToPreview();
//         // Удаляем слушатель, чтобы он не срабатывал повторно при обычных операциях
//         iframe.removeEventListener('load', onFrameReloaded);
//     }, { once: true });
//
//     // Принудительно перезагружаем фрейм
//     iframe.contentWindow.location.reload();
// }
//
// function sendUpdateToPreview() {
//     const iframe = document.getElementById('ui-preview-iframe');
//     if (!iframe || !iframe.contentWindow) return;
//
//     const messageData = {
//         type: 'CONFIG_UI_UPDATE',
//         currentOrientation: currentUiOrientation,
//         currentUiWidgetIdx: stateUiWidgetIdx,
//         fullConfig: window.target
//     };
//
//     iframe.contentWindow.postMessage(messageData, '*');
// }



// Переменные состояния для модуля UI
let currentUiScreenIdx = null;
let currentUiWidgetIdx = null; // Индекс выбранной кнопки внутри экрана

// Список доступных экшенов для выпадающего списка кнопок
const AVAILABLE_UI_ACTIONS = [
    // "go_back", "open_profile", "open_heroes", "open_leaderboard",
    // "open_gacha", "open_shop", "open_pvp_arena", "open_bets",
    // "open_idle_rewards_popup", "send_pve_battle_request",

    "go_back", "open_idle_rewards_popup", "open_profile", "open_games",
    "open_inventory", "open_leaderboard", "open_gacha", "open_heroes", "open_shop",
    "open_arena", "open_pve_campaign", "open_pve_tower", "open_pvp_arena", "open_bets",
];

function switchUiOrientation(orientation, evt) {
    // В новой версии у нас только landscape, но сохраняем метод для совместимости и sandbox девайса
    currentUiOrientation = 'landscape';
    currentUiScreenIdx = null;
    currentUiWidgetIdx = null;

    if (evt && evt.target && evt.target.parentElement) {
        evt.target.parentElement.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        evt.target.classList.add('active');
    }

    document.getElementById('ui-sidebar-title').innerText = "Game Screens";
    document.getElementById('ui-widget-editor').innerHTML = '';

    const device = document.getElementById('virtual-device-wrapper');
    if (device) {
        device.style.aspectRatio = '16 / 9';
        device.style.maxWidth = '800px';
        device.style.height = 'auto';
    }

    renderUiWindowsSettings();
    renderUiWidgetsList(); // В нашем случае это отрисовка списка экранов
}

function renderUiWindowsSettings() {
    const container = document.getElementById('ui-windows-settings-form');
    if (!container) return;
    const settings = target.ui.windows_settings || {};

    container.innerHTML = Object.keys(settings).map(key => `
        <div class="form-group">
            <label>${key.replace(/_/g, ' ')}</label>
            <input type="text" value="${settings[key]}" oninput="target.ui.windows_settings['${key}'] = this.value; sendUpdateToPreview();">
        </div>
    `).join('');
}

// Отрисовка списка экранов в сайдбаре (заменяет старый renderUiWidgetsList)
function renderUiWidgetsList() {
    const list = document.getElementById('ui-widgets-list');
    if (!list) return;
    const screens = target.ui.landscape || [];

    list.innerHTML = screens.map((screen, idx) => {
        const isDisabled = screen.disabled === true;
        const stateBadge = isDisabled ? '<span class="badge danger" style="font-size:9px; padding:2px 4px;">OFF</span>' : '<span class="badge" style="font-size:9px; background:#4caf50; padding:2px 4px;">ON</span>';

        return `
            <li class="crud-list-item ${currentUiScreenIdx === idx ? 'active' : ''}" onclick="selectUiScreen(${idx})" style="${isDisabled ? 'opacity: 0.6;' : ''}">
                <div style="display:flex; align-items:center; justify-content:space-between; width:100%;">
                    <span style="font-family:monospace; font-size:12px;">${screen.id}</span>
                    ${stateBadge}
                </div>
            </li>
        `;
    }).join('');
}

function selectUiScreen(idx) {
    currentUiScreenIdx = idx;
    renderUiWidgetsList();

    const screen = target.ui.landscape[idx];
    const ed = document.getElementById('ui-widget-editor');
    if (!ed) return;

    let viewLayoutHtml = '';
    if (screen.view_layout) {
        const tags = screen.view_layout.map((item, tIdx) => `
            <span class="badge" style="display:inline-flex; align-items:center; gap:5px; margin:2px; padding:4px 8px; background:var(--accent-blue);">
                ${item}
                <b style="cursor:pointer; color:#ff3333;" onclick="target.ui.landscape[${idx}].view_layout.splice(${tIdx},1); selectUiScreen(${idx});">×</b>
            </span>
        `).join('');

        viewLayoutHtml = `
            <div class="sub-section" style="margin-top:12px;">
                <div class="sub-section-title">View Layout Order Blocks</div>
                <div style="margin-bottom:8px; display:flex; flex-wrap:wrap;">${tags || '<span style="font-size:11px; color:var(--text-muted);">No layout blocks added</span>'}</div>
                <div style="display:flex; gap:6px;">
                    <input type="text" id="add-layout-block-${idx}" placeholder="e.g. top_stage_info" style="font-size:12px; padding:4px 8px;">
                    <button class="primary" style="padding:4px 10px; font-size:12px;" onclick="const val=document.getElementById('add-layout-block-${idx}').value.trim(); if(val){target.ui.landscape[${idx}].view_layout.push(val); selectUiScreen(${idx});}">+ Add Block</button>
                </div>
            </div>
        `;
    }

    let menuTabsHtml = '';
    if (screen.menu_tabs) {
        const tags = screen.menu_tabs.map((item, tIdx) => `
            <span class="badge" style="display:inline-flex; align-items:center; gap:5px; margin:2px; padding:4px 8px; background:var(--accent-pink);">
                ${item}
                <b style="cursor:pointer; color:#ff3333;" onclick="target.ui.landscape[${idx}].menu_tabs.splice(${tIdx},1); selectUiScreen(${idx});">×</b>
            </span>
        `).join('');

        menuTabsHtml = `
            <div class="sub-section" style="margin-top:12px;">
                <div class="sub-section-title">Menu Tabs Sequence</div>
                <div style="margin-bottom:8px; display:flex; flex-wrap:wrap;">${tags || '<span style="font-size:11px; color:var(--text-muted);">No tabs assigned</span>'}</div>
                <div style="display:flex; gap:6px;">
                    <input type="text" id="add-menu-tab-${idx}" placeholder="e.g. stats" style="font-size:12px; padding:4px 8px;">
                    <button class="primary" style="padding:4px 10px; font-size:12px;" onclick="const val=document.getElementById('add-menu-tab-${idx}').value.trim(); if(val){target.ui.landscape[${idx}].menu_tabs.push(val); selectUiScreen(${idx});}">+ Add Tab</button>
                </div>
            </div>
        `;
    }

    ed.innerHTML = `
        <div class="card-header-flex">
            <span class="card-title" style="font-family:monospace; font-size:13px;">Screen Config: ${screen.id}</span>
        </div>
        
        <div class="form-grid">
            <div class="form-group">
                <label>Operational Status</label>
                <select onchange="target.ui.landscape[${idx}].disabled = (this.value === 'true'); renderUiWidgetsList(); sendUpdateToPreview();">
                    <option value="false" ${screen.disabled !== true ? 'selected' : ''}>Active (ON)</option>
                    <option value="true" ${screen.disabled === true ? 'selected' : ''}>Disabled (OFF)</option>
                </select>
            </div>
            <div class="form-group">
                <label>Fullscreen Canvas</label>
                <select onchange="target.ui.landscape[${idx}].fullscreen = (this.value === 'true'); sendUpdateToPreview();">
                    <option value="false" ${!screen.fullscreen ? 'selected' : ''}>False</option>
                    <option value="true" ${screen.fullscreen === true ? 'selected' : ''}>True</option>
                </select>
            </div>
            <div class="form-group">
                <label>Scrollable Canvas</label>
                <select onchange="target.ui.landscape[${idx}].scrollable = (this.value === 'true'); sendUpdateToPreview();">
                    <option value="false" ${!screen.scrollable ? 'selected' : ''}>False</option>
                    <option value="true" ${screen.scrollable === true ? 'selected' : ''}>True</option>
                </select>
            </div>
            <div class="form-group">
                <label>Fallback BackScreen ID</label>
                <input type="text" value="${screen.backScreen || ''}" oninput="target.ui.landscape[${idx}].backScreen = this.value;">
            </div>
            <div class="form-group">
                <label>Canvas Texture Width (px)</label>
                <input type="number" value="${screen.bg_width || 1000}" oninput="target.ui.landscape[${idx}].bg_width = parseInt(this.value) || 1000; sendUpdateToPreview();">
            </div>
            <div class="form-group">
                <label>Active Render Width (px)</label>
                <input type="number" value="${screen.active_width || 1000}" oninput="target.ui.landscape[${idx}].active_width = parseInt(this.value) || 1000; sendUpdateToPreview();">
            </div>
            <div class="form-group full-width">
                <label>Background Texture Artwork Asset Path</label>
                <input type="text" value="${screen.backgroundImage || ''}" oninput="target.ui.landscape[${idx}].backgroundImage = this.value; sendUpdateToPreview();">
            </div>
        </div>

        ${viewLayoutHtml}
        ${menuTabsHtml}

        <div id="ui-dynamic-sub-inspectors"></div>
        <div id="ui-screen-buttons-crud" style="margin-top:20px;"></div>
    `;

    renderUiSubInspectors(idx, screen);
    renderUiScreenButtonsCrud(idx, screen); // Чистый вызов без лишних аргументов!

    sendUpdateToPreview();
}

function renderUiSubInspectors(idx, screen) {
    const container = document.getElementById('ui-dynamic-sub-inspectors');
    if (!container) return;

    let html = '';

    // 1. Companion Stream Overlay
    if (screen.companion_stream) {
        const stream = screen.companion_stream;
        html += `
            <div class="sub-section">
                <div class="sub-section-title">Companion Stream Overlay</div>
                <div class="form-grid">
                    <div class="form-group"><label>Enabled</label>
                        <select onchange="target.ui.landscape[${idx}].companion_stream.enabled = (this.value === 'true'); sendUpdateToPreview();">
                            <option value="true" ${stream.enabled ? 'selected' : ''}>True</option>
                            <option value="false" ${!stream.enabled ? 'selected' : ''}>False</option>
                        </select>
                    </div>
                    <div class="form-group"><label>Position Side</label><input type="text" value="${stream.position || ''}" oninput="target.ui.landscape[${idx}].companion_stream.position = this.value; sendUpdateToPreview();"></div>
                    <div class="form-group"><label>Screen Width %</label><input type="text" value="${stream.width || ''}" oninput="target.ui.landscape[${idx}].companion_stream.width = this.value; sendUpdateToPreview();"></div>
                    <div class="form-group"><label>Bubble Color</label><input type="text" value="${stream.bubble_color || ''}" oninput="target.ui.landscape[${idx}].companion_stream.bubble_color = this.value; sendUpdateToPreview();"></div>
                    <div class="form-group"><label>Bubble Text Color</label><input type="text" value="${stream.bubble_text_color || ''}" oninput="target.ui.landscape[${idx}].companion_stream.bubble_text_color = this.value; sendUpdateToPreview();"></div>
                    <div class="form-group full-width"><label>Phrases Loc Keys (Comma-separated array)</label>
                        <input type="text" value="${(stream.phrases_loc_keys || []).join(', ')}" onchange="target.ui.landscape[${idx}].companion_stream.phrases_loc_keys = this.value.split(',').map(s=>s.trim()).filter(Boolean); sendUpdateToPreview();" style="font-family:monospace;">
                    </div>
                </div>
            </div>
        `;
    }

    // 2. Home Hero Layout
    if (screen.home_hero_layout) {
        const hhl = screen.home_hero_layout;
        html += `
            <div class="sub-section">
                <div class="sub-section-title">Home Hero Display Layout</div>
                <div class="form-grid">
                    <div class="form-group"><label>Top Offset</label><input type="text" value="${hhl.top || ''}" oninput="target.ui.landscape[${idx}].home_hero_layout.top = this.value; sendUpdateToPreview();"></div>
                    <div class="form-group"><label>Left Offset</label><input type="text" value="${hhl.left || ''}" oninput="target.ui.landscape[${idx}].home_hero_layout.left = this.value; sendUpdateToPreview();"></div>
                    <div class="form-group"><label>Height Scale</label><input type="text" value="${hhl.height || ''}" oninput="target.ui.landscape[${idx}].home_hero_layout.height = this.value; sendUpdateToPreview();"></div>
                    <div class="form-group"><label>Sorting Layer (zIndex)</label><input type="number" value="${hhl.zIndex || 3}" oninput="target.ui.landscape[${idx}].home_hero_layout.zIndex = parseInt(this.value) || 0; sendUpdateToPreview();"></div>
                    <div class="form-group full-width"><label>Core CSS ID Animation</label><input type="text" value="${hhl.animation || ''}" oninput="target.ui.landscape[${idx}].home_hero_layout.animation = this.value; sendUpdateToPreview();"></div>
                </div>
            </div>
        `;
    }

    // 3. List Settings & Card Layout (Shop, Gacha, Leaderboard, Tower, Heroes)
    if (screen.list_settings) {
        const ls = screen.list_settings;
        let cardLayoutFields = '';
        if (ls.card_layout) {
            cardLayoutFields = `
                <div style="grid-column: span 2; font-size:11px; font-weight:600; color:var(--accent-pink); margin-top:5px; text-transform:uppercase;">Card Geometry Styles</div>
                ${Object.keys(ls.card_layout).map(clKey => `
                    <div class="form-group">
                        <label>${clKey.replace(/_/g, ' ')}</label>
                        <input type="text" value="${ls.card_layout[clKey]}" oninput="target.ui.landscape[${idx}].list_settings.card_layout['${clKey}'] = this.value; sendUpdateToPreview();">
                    </div>
                `).join('')}
            `;
        }

        html += `
            <div class="sub-section">
                <div class="sub-section-title">List & Container Layout Settings</div>
                <div class="form-grid">
                    ${ls.display_mode !== undefined ? `<div class="form-group"><label>Display Mode</label><input type="text" value="${ls.display_mode}" oninput="target.ui.landscape[${idx}].list_settings.display_mode = this.value; sendUpdateToPreview();"></div>` : ''}
                    ${ls.grid_columns !== undefined ? `<div class="form-group"><label>Grid Columns</label><input type="number" value="${ls.grid_columns}" oninput="target.ui.landscape[${idx}].list_settings.grid_columns = parseInt(this.value) || 1; sendUpdateToPreview();"></div>` : ''}
                    ${ls.grid_row_height !== undefined ? `<div class="form-group"><label>Grid Row Height</label><input type="text" value="${ls.grid_row_height}" oninput="target.ui.landscape[${idx}].list_settings.grid_row_height = this.value; sendUpdateToPreview();"></div>` : ''}
                    ${ls.gap !== undefined ? `<div class="form-group"><label>Gap Size</label><input type="text" value="${ls.gap}" oninput="target.ui.landscape[${idx}].list_settings.gap = this.value; sendUpdateToPreview();"></div>` : ''}
                    ${ls.padding !== undefined ? `<div class="form-group"><label>Container Padding</label><input type="text" value="${ls.padding}" oninput="target.ui.landscape[${idx}].list_settings.padding = this.value; sendUpdateToPreview();"></div>` : ''}
                    ${ls.header_height !== undefined ? `<div class="form-group"><label>Header Height</label><input type="text" value="${ls.header_height}" oninput="target.ui.landscape[${idx}].list_settings.header_height = this.value; sendUpdateToPreview();"></div>` : ''}
                    ${ls.header_background !== undefined ? `<div class="form-group"><label>Header Background</label><input type="text" value="${ls.header_background}" oninput="target.ui.landscape[${idx}].list_settings.header_background = this.value; sendUpdateToPreview();"></div>` : ''}
                    ${ls.sidebar_width !== undefined ? `<div class="form-group"><label>Left Sidebar Width</label><input type="text" value="${ls.sidebar_width}" oninput="target.ui.landscape[${idx}].list_settings.sidebar_width = this.value; sendUpdateToPreview();"></div>` : ''}
                    ${ls.center_area_width !== undefined ? `<div class="form-group"><label>Center Workspace Width</label><input type="text" value="${ls.center_area_width}" oninput="target.ui.landscape[${idx}].list_settings.center_area_width = this.value; sendUpdateToPreview();"></div>` : ''}
                    ${ls.details_panel_width !== undefined ? `<div class="form-group"><label>Right Inspector Width</label><input type="text" value="${ls.details_panel_width}" oninput="target.ui.landscape[${idx}].list_settings.details_panel_width = this.value; sendUpdateToPreview();"></div>` : ''}
                    ${cardLayoutFields}
                </div>
            </div>
        `;
    }

    // 4. Nodes Layout (Campaign Absolute Mapping)
    if (screen.nodes_layout) {
        const nl = screen.nodes_layout;
        let styleStatesHtml = '';
        if (nl.styles) {
            styleStatesHtml = Object.keys(nl.styles).map(state => `
                <div style="grid-column: span 2; font-size:11px; font-weight:600; color:var(--accent-blue); margin-top:5px; text-transform:uppercase;">Node State: ${state}</div>
                ${Object.keys(nl.styles[state]).map(styleProp => `
                    <div class="form-group">
                        <label>${styleProp}</label>
                        <input type="text" value="${nl.styles[state][styleProp]}" oninput="target.ui.landscape[${idx}].nodes_layout.styles['${state}']['${styleProp}'] = this.value; sendUpdateToPreview();">
                    </div>
                `).join('')}
            `).join('');
        }

        html += `
            <div class="sub-section">
                <div class="sub-section-title">PVE Campaign Stages Map Nodes Engine</div>
                <div class="form-grid">
                    <div class="form-group"><label>Display Mode</label><input type="text" value="${nl.display_mode || ''}" oninput="target.ui.landscape[${idx}].nodes_layout.display_mode = this.value;"></div>
                    <div class="form-group"><label>Stage Node Width</label><input type="text" value="${nl.node_width || ''}" oninput="target.ui.landscape[${idx}].nodes_layout.node_width = this.value; sendUpdateToPreview();"></div>
                    <div class="form-group"><label>Stage Node Height</label><input type="text" value="${nl.node_height || ''}" oninput="target.ui.landscape[${idx}].nodes_layout.node_height = this.value; sendUpdateToPreview();"></div>
                    <div class="form-group"><label>Active Glowing CSS Animation</label><input type="text" value="${nl.active_animation || ''}" oninput="target.ui.landscape[${idx}].nodes_layout.active_animation = this.value; sendUpdateToPreview();"></div>
                    ${styleStatesHtml}
                </div>
            </div>
        `;
    }

    // 5. Idle Bar Widget
    // 5. Idle Bar Widget (Сундук наград на экране кампании)
    if (screen.idle_bar_widget) {
        const ibw = screen.idle_bar_widget;
        html += `
            <div class="sub-section">
                <div class="sub-section-title">Idle Loot Box Chest Widget</div>
                <div class="form-grid">
                    <div class="form-group"><label>Widget Element ID</label><input type="text" value="${ibw.id || ''}" oninput="target.ui.landscape[${idx}].idle_bar_widget.id = this.value;"></div>
                    <div class="form-group"><label>Callback Action Trigger</label><input type="text" value="${ibw.action || ''}" oninput="target.ui.landscape[${idx}].idle_bar_widget.action = this.value;"></div>
                    ${Object.keys(ibw.layout || {}).map(lKey => `
                        <div class="form-group"><label>Geometry layout.${lKey}</label><input type="text" value="${ibw.layout[lKey]}" oninput="target.ui.landscape[${idx}].idle_bar_widget.layout['${lKey}'] = this.value; sendUpdateToPreview();"></div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    // 6. Combat Arena Layers, Bars & Damage Text Configuration (Экран боя)
    if (screen.render_layers) {
        html += `
            <div class="sub-section">
                <div class="sub-section-title">Combat Stage Layer Sorting Engine (zIndex)</div>
                <div class="form-grid">
                    ${Object.keys(screen.render_layers).map(layerKey => `
                        <div class="form-group"><label>Layer: ${layerKey}</label><input type="number" value="${screen.render_layers[layerKey].zIndex}" oninput="target.ui.landscape[${idx}].render_layers['${layerKey}'].zIndex = parseInt(this.value)||1; sendUpdateToPreview();"></div>
                    `).join('')}
                </div>
            </div>
        `;
    }
    if (screen.hp_bar_settings) {
        const hp = screen.hp_bar_settings;
        html += `
            <div class="sub-section">
                <div class="sub-section-title">HUD Healthbars Configuration</div>
                <div class="form-grid">
                    <div class="form-group"><label>Bar Width</label><input type="text" value="${hp.width}" oninput="target.ui.landscape[${idx}].hp_bar_settings.width = this.value; sendUpdateToPreview();"></div>
                    <div class="form-group"><label>Bar Height</label><input type="text" value="${hp.height}" oninput="target.ui.landscape[${idx}].hp_bar_settings.height = this.value; sendUpdateToPreview();"></div>
                    <div class="form-group"><label>Background Color</label><input type="text" value="${hp.backgroundColor}" oninput="target.ui.landscape[${idx}].hp_bar_settings.backgroundColor = this.value; sendUpdateToPreview();"></div>
                    <div class="form-group"><label>Player Team Color</label><input type="text" value="${hp.player_color}" oninput="target.ui.landscape[${idx}].hp_bar_settings.player_color = this.value; sendUpdateToPreview();"></div>
                    <div class="form-group"><label>Enemy Team Color</label><input type="text" value="${hp.enemy_color}" oninput="target.ui.landscape[${idx}].hp_bar_settings.enemy_color = this.value; sendUpdateToPreview();"></div>
                    <div class="form-group"><label>Shield Overlay Color</label><input type="text" value="${hp.shield_color}" oninput="target.ui.landscape[${idx}].hp_bar_settings.shield_color = this.value; sendUpdateToPreview();"></div>
                </div>
            </div>
        `;
    }
    if (screen.damage_text_settings) {
        const dt = screen.damage_text_settings;
        html += `
            <div class="sub-section">
                <div class="sub-section-title">Combat Damage Popup Typography</div>
                <div class="form-grid">
                    <div class="form-group"><label>Font Family</label><input type="text" value="${dt.font}" oninput="target.ui.landscape[${idx}].damage_text_settings.font = this.value; sendUpdateToPreview();"></div>
                    <div class="form-group"><label>Normal Size</label><input type="text" value="${dt.size_normal}" oninput="target.ui.landscape[${idx}].damage_text_settings.size_normal = this.value; sendUpdateToPreview();"></div>
                    <div class="form-group"><label>Critical Size</label><input type="text" value="${dt.size_crit}" oninput="target.ui.landscape[${idx}].damage_text_settings.size_crit = this.value; sendUpdateToPreview();"></div>
                    <div class="form-group"><label>Normal Color</label><input type="text" value="${dt.color_normal}" oninput="target.ui.landscape[${idx}].damage_text_settings.color_normal = this.value; sendUpdateToPreview();"></div>
                    <div class="form-group"><label>Critical Color</label><input type="text" value="${dt.color_crit}" oninput="target.ui.landscape[${idx}].damage_text_settings.color_crit = this.value; sendUpdateToPreview();"></div>
                    <div class="form-group"><label>Heal Green Color</label><input type="text" value="${dt.color_heal}" oninput="target.ui.landscape[${idx}].damage_text_settings.color_heal = this.value; sendUpdateToPreview();"></div>
                    <div class="form-group full-width"><label>CSS Kinetic Animation ID</label><input type="text" value="${dt.animation}" oninput="target.ui.landscape[${idx}].damage_text_settings.animation = this.value; sendUpdateToPreview();"></div>
                </div>
            </div>
        `;
    }

    // 7. Battle Result Window (Попап результатов матча)
    if (screen.battle_result_window) {
        const brw = screen.battle_result_window;
        html += `
            <div class="sub-section">
                <div class="sub-section-title">Post-Battle Summary Window Popup</div>
                <div class="form-grid">
                    <div class="form-group"><label>Display Frame Mode</label><input type="text" value="${brw.display_type}" oninput="target.ui.landscape[${idx}].battle_result_window.display_type = this.value;"></div>
                    <div class="form-group"><label>Backdrop Texture Path</label><input type="text" value="${brw.backgroundImage}" oninput="target.ui.landscape[${idx}].battle_result_window.backgroundImage = this.value; sendUpdateToPreview();"></div>
                    <div class="form-group"><label>MVP Ribbon Badge Hex</label><input type="text" value="${brw.mvp_badge_color}" oninput="target.ui.landscape[${idx}].battle_result_window.mvp_badge_color = this.value; sendUpdateToPreview();"></div>
                    <div class="form-group"><label>MVP Hero Sprite Animation ID</label><input type="text" value="${brw.mvp_animation}" oninput="target.ui.landscape[${idx}].battle_result_window.mvp_animation = this.value; sendUpdateToPreview();"></div>
                    <div class="form-group full-width"><label>Window Tabs Sequence (Comma-separated array)</label>
                        <input type="text" value="${(brw.tabs_order || []).join(', ')}" onchange="target.ui.landscape[${idx}].battle_result_window.tabs_order = this.value.split(',').map(s=>s.trim()).filter(Boolean); sendUpdateToPreview();" style="font-family:monospace;">
                    </div>
                    <div style="grid-column: span 2; font-size:11px; font-weight:600; color:var(--accent-pink); margin-top:5px; text-transform:uppercase;">Combat Graph Analytics Colors</div>
                    ${Object.keys(brw.stats_colors || {}).map(cKey => `
                        <div class="form-group"><label>Graph: ${cKey}</label><input type="text" value="${brw.stats_colors[cKey]}" oninput="target.ui.landscape[${idx}].battle_result_window.stats_colors['${cKey}'] = this.value; sendUpdateToPreview();"></div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    container.innerHTML = html;
}


// Функция отрисовки интерфейса управления кнопками конкретного экрана
// ПОЛНОСТЬЮ ИСПРАВЛЕННЫЙ БЕЗОПАСНЫЙ CRUD ДЛЯ UI.JS (БЕЗ ПЕРЕДАЧИ HTML СТРОК В ONCLICK)
// ИНТЕГРИРОВАННЫЙ В СПИСОК РЕДАКТОР КНОПОК (ЭФФЕКТ АККОРДЕОНА)
function renderUiScreenButtonsCrud(screenIdx, screen) {
    const container = document.getElementById('ui-screen-buttons-crud');
    if (!container) return;

    if (!screen.widgets) screen.widgets = [];
    const buttons = screen.widgets;

    // Собираем опции для селекторов один раз, чтобы не генерировать их в цикле
    const actionDropdownOptions = AVAILABLE_UI_ACTIONS.map(act =>
        `<option value="${act}">${act}</option>`
    ).join('');

    const currentLocOptions = Object.keys(target.localization?.ui?.en || {}).map(locKey =>
        `<option value="${locKey}">${locKey}</option>`
    ).join('');

    let buttonsListHtml = buttons.map((btn, bIdx) => {
        const isEditing = currentUiWidgetIdx === bIdx;

        // Если кнопка сейчас редактируется — генерируем её полноценную форму прямо сюда
        let editorFormHtml = '';
        if (isEditing) {
            if (!btn.layout) btn.layout = {};

            // Автоматическая генерация инпутов под все свойства layout объекта
            let layoutPropertiesHtml = Object.keys(btn.layout).map(lKey => `
                <div class="form-group" style="background: rgba(255,255,255,0.01); padding: 5px; border-radius: 4px; border: 1px solid rgba(255,255,255,0.05);">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                        <label style="color:var(--accent-blue); font-family:monospace; font-size:10px; margin:0;">layout.${lKey}</label>
                        <b style="cursor:pointer; color:#ff3333; font-size:11px;" title="Remove property" onclick="event.stopPropagation(); delete target.ui.landscape[${screenIdx}].widgets[${bIdx}].layout['${lKey}']; selectUiScreen(${screenIdx}); sendUpdateToPreview();">×</b>
                    </div>
                    <input type="text" value="${btn.layout[lKey] || ''}" onclick="event.stopPropagation();" oninput="target.ui.landscape[${screenIdx}].widgets[${bIdx}].layout['${lKey}'] = this.value; sendUpdateToPreview();" style="font-size:11px; padding:3px 6px;">
                </div>
            `).join('');

            editorFormHtml = `
                <div class="sub-section" style="border-left: 2px solid var(--accent-pink); padding:12px; background: rgba(0,0,0,0.2); margin-top:10px; cursor:default;" onclick="event.stopPropagation();">
                    <div class="form-grid" style="gap: 8px;">
                        <div class="form-group">
                            <label>ID Key</label>
                            <input type="text" value="${btn.id || ''}" onchange="if(target.ui.landscape[${screenIdx}].widgets.some((w,idx)=>w.id===this.value && idx!==${bIdx})){alert('ID duplicated!'); this.value='${btn.id}';}else{target.ui.landscape[${screenIdx}].widgets[${bIdx}].id=this.value; selectUiScreen(${screenIdx});}" style="font-size:11px; padding:4px;">
                        </div>
                        <div class="form-group">
                            <label>Type Class</label>
                            <input type="text" value="${btn.type || 'button'}" oninput="target.ui.landscape[${screenIdx}].widgets[${bIdx}].type = this.value; sendUpdateToPreview();" style="font-size:11px; padding:4px;">
                        </div>
                        <div class="form-group">
                            <label>Action Callback</label>
                            <select onchange="target.ui.landscape[${screenIdx}].widgets[${bIdx}].action = this.value; sendUpdateToPreview();" style="font-size:11px; padding:4px;">
                                ${AVAILABLE_UI_ACTIONS.map(act => `<option value="${act}" ${btn.action === act ? 'selected' : ''}>${act}</option>`).join('')}
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Localization Label</label>
                            <select onchange="target.ui.landscape[${screenIdx}].widgets[${bIdx}].label_loc_key = this.value; sendUpdateToPreview();" style="font-size:11px; padding:4px;">
                                <option value="">-- None --</option>
                                ${Object.keys(target.localization?.ui?.en || {}).map(locKey => `<option value="${locKey}" ${btn.label_loc_key === locKey ? 'selected' : ''}>${locKey}</option>`).join('')}
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Only In Windows</label>
                            <select onchange="target.ui.landscape[${screenIdx}].widgets[${bIdx}].onlyInWindows = (this.value === 'true'); sendUpdateToPreview();" style="font-size:11px; padding:4px;">
                                <option value="false" ${!btn.onlyInWindows ? 'selected' : ''}>False</option>
                                <option value="true" ${btn.onlyInWindows === true ? 'selected' : ''}>True</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>backgroundImage / Fallback</label>
                            <input type="text" value="${btn.backgroundImage || ''}" oninput="target.ui.landscape[${screenIdx}].widgets[${bIdx}].backgroundImage = this.value; sendUpdateToPreview();" style="font-size:11px; padding:4px;">
                        </div>
                    </div>

                    <div style="font-size:10px; font-weight:600; color:var(--text-muted); margin-top:10px; margin-bottom:5px; text-transform:uppercase;">Geometry Layout Matrix</div>
                    <div class="form-grid" style="gap: 6px;">
                        ${layoutPropertiesHtml || '<p style="grid-column:span 2; font-size:10px; color:var(--text-muted); margin:0;">No properties inside layout</p>'}
                    </div>

                    <!-- Инжектор новых кастомных свойств прямо в текущую кнопку -->
                    <div style="margin-top:10px; padding-top:8px; border-top: 1px dashed rgba(255,255,255,0.05); display:flex; gap:6px; align-items:flex-end;">
                        <div class="form-group" style="margin:0; flex:1;">
                            <input type="text" id="inline-new-prop-${bIdx}" placeholder="Add property, e.g. borderRadius" style="font-size:11px; padding:4px;">
                        </div>
                        <button class="primary" style="padding:4px 8px; font-size:10px; height:25px;" onclick="
                            const propKey = document.getElementById('inline-new-prop-${bIdx}').value.trim();
                            if(propKey) {
                                if(target.ui.landscape[${screenIdx}].widgets[${bIdx}].layout[propKey] !== undefined) {
                                    alert('Property exists!');
                                } else {
                                    target.ui.landscape[${screenIdx}].widgets[${bIdx}].layout[propKey] = '';
                                    selectUiScreen(${screenIdx});
                                }
                            }
                        ">🔌 Inject</button>
                    </div>
                </div>
            `;
        }

        return `
            <div style="margin-bottom: 8px; background: ${isEditing ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.01)'}; padding: 10px; border-radius: 6px; border: 1px solid ${isEditing ? 'var(--accent-pink)' : 'var(--border-color)'}; transition: all 0.2s ease;">
                <div class="element-row" style="margin:0; border:none; padding:0; background:transparent;">
                    <div class="element-info" style="cursor:pointer; width: 100%; display: flex; align-items: center; gap: 10px;" onclick="inspectUiWidget(${screenIdx}, ${bIdx})">
                        <span class="badge" style="background:${isEditing ? 'var(--accent-pink)' : 'var(--bg-main)'}; font-family:monospace; min-width: 80px; text-align: center;">
                            ${isEditing ? '🔽 ' : '▶️ '} ${btn.id || 'unnamed_widget'}
                        </span>
                        <span style="font-size:11px; color:var(--text-muted);">action: <b>${btn.action || 'none'}</b></span>
                        <span style="font-size:11px; color:var(--text-muted);">type: <b>${btn.type || 'button'}</b></span>
                    </div>
                    <div class="element-actions">
                        <button class="btn-sm btn-danger" onclick="event.stopPropagation(); target.ui.landscape[${screenIdx}].widgets.splice(${bIdx}, 1); currentUiWidgetIdx = null; selectUiScreen(${screenIdx});">Delete</button>
                    </div>
                </div>
                ${editorFormHtml}
            </div>
        `;
    }).join('');

    container.innerHTML = `
        <div class="sub-section" style="border-color: var(--accent-pink); margin-top:20px;">
            <div class="card-header-flex" style="border:none; padding:0; margin-bottom:12px;">
                <span class="sub-section-title" style="margin:0; color:var(--accent-pink);">Embedded Screen Buttons / Widgets</span>
                <button class="primary" style="padding: 2px 8px; font-size: 11px;" onclick="createNewScreenButton(${screenIdx}); selectUiScreen(${screenIdx});">+ Add Button Object</button>
            </div>
            <div style="margin-top: 10px;">
                ${buttonsListHtml || '<p style="color:var(--text-muted); font-size:12px; padding:5px;">No widget objects bound to this screen canvas</p>'}
            </div>
        </div>
    `;
}

function inspectUiWidget(screenIdx, bIdx) {
    // Если кликнули по уже открытой кнопке — закрываем её (эффект Toggle)
    if (currentUiWidgetIdx === bIdx) {
        currentUiWidgetIdx = null;
    } else {
        currentUiWidgetIdx = bIdx;
    }
    selectUiScreen(screenIdx);
}


// Сам редактор формы берет локализацию напрямую из target.localization без аргументов
function renderSingleWidgetForm(screenIdx, bIdx, btn) {
    const ed = document.getElementById('ui-single-widget-inspector');
    if (!ed) return;

    const actionDropdownOptions = AVAILABLE_UI_ACTIONS.map(act =>
        `<option value="${act}" ${btn.action === act ? 'selected' : ''}>${act}</option>`
    ).join('');

    // Вытаскиваем ключи локализации напрямую из глобального конфига прямо внутри функции
    const currentLocOptions = Object.keys(target.localization?.ui?.en || {}).map(locKey =>
        `<option value="${locKey}" ${btn.label_loc_key === locKey ? 'selected' : ''}>${locKey}</option>`
    ).join('');

    if (!btn.layout) btn.layout = {};

    let layoutPropertiesHtml = Object.keys(btn.layout).map(lKey => `
        <div class="form-group" style="background: rgba(255,255,255,0.01); padding: 5px; border-radius: 4px; border: 1px solid rgba(255,255,255,0.05);">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                <label style="color:var(--accent-blue); font-family:monospace; font-size:11px; margin:0;">layout.${lKey}</label>
                <b style="cursor:pointer; color:#ff3333; font-size:12px;" title="Remove property" onclick="delete target.ui.landscape[${screenIdx}].widgets[${bIdx}].layout['${lKey}']; renderSingleWidgetForm(${screenIdx}, ${bIdx}, target.ui.landscape[${screenIdx}].widgets[${bIdx}]); sendUpdateToPreview();">×</b>
            </div>
            <input type="text" value="${btn.layout[lKey] || ''}" oninput="target.ui.landscape[${screenIdx}].widgets[${bIdx}].layout['${lKey}'] = this.value; sendUpdateToPreview();">
        </div>
    `).join('');

    ed.innerHTML = `
        <div class="sub-section" style="border-left: 3px solid var(--accent-blue); padding:15px; background: rgba(0,0,0,0.2); margin-top:15px;">
            <div class="card-header-flex" style="border:none; padding:0; margin-bottom:12px;">
                <span class="sub-section-title" style="font-size:12px; color:var(--accent-blue); font-family:monospace; margin:0;">OBJECT EDITOR: ${btn.id}</span>
            </div>
            
            <div class="form-grid">
                <div class="form-group">
                    <label>Widget Unique ID</label>
                    <input type="text" value="${btn.id || ''}" onchange="if(target.ui.landscape[${screenIdx}].widgets.some((w,idx)=>w.id===this.value && idx!==${bIdx})){alert('ID already exists!'); this.value='${btn.id}';}else{target.ui.landscape[${screenIdx}].widgets[${bIdx}].id=this.value; selectUiScreen(${screenIdx});}">
                </div>
                <div class="form-group">
                    <label>Widget Type Class</label>
                    <input type="text" value="${btn.type || 'button'}" oninput="target.ui.landscape[${screenIdx}].widgets[${bIdx}].type = this.value; sendUpdateToPreview();">
                </div>
                <div class="form-group">
                    <label>Action Route Callback</label>
                    <select onchange="target.ui.landscape[${screenIdx}].widgets[${bIdx}].action = this.value; sendUpdateToPreview();">
                        <option value="">-- Select Action Route --</option>
                        ${actionDropdownOptions}
                    </select>
                </div>
                <div class="form-group">
                    <label>Localization Label Binding</label>
                    <select onchange="target.ui.landscape[${screenIdx}].widgets[${bIdx}].label_loc_key = this.value; sendUpdateToPreview();">
                        <option value="">-- No Translation Bound --</option>
                        ${currentLocOptions}
                    </select>
                </div>
                <div class="form-group">
                    <label>Render Only In Windows Overlay</label>
                    <select onchange="target.ui.landscape[${screenIdx}].widgets[${bIdx}].onlyInWindows = (this.value === 'true'); sendUpdateToPreview();">
                        <option value="false" ${!btn.onlyInWindows ? 'selected' : ''}>False</option>
                        <option value="true" ${btn.onlyInWindows === true ? 'selected' : ''}>True</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Direct Component backgroundImage (Fallback)</label>
                    <input type="text" value="${btn.backgroundImage || ''}" oninput="target.ui.landscape[${screenIdx}].widgets[${bIdx}].backgroundImage = this.value; sendUpdateToPreview();">
                </div>
            </div>

            <div style="font-size:11px; font-weight:600; color:var(--text-muted); margin-top:15px; margin-bottom:8px; text-transform:uppercase; letter-spacing:0.5px;">Geometry Metrics & Canvas CSS Styles Matrix</div>
            <div class="form-grid" id="layout-props-grid-${bIdx}">
                ${layoutPropertiesHtml || '<p style="grid-column:span 2; font-size:11px; color:var(--text-muted); padding:5px; margin:0;">No custom layout fields initiated</p>'}
            </div>

            <div style="margin-top:15px; padding-top:12px; border-top: 1px dashed rgba(255,255,255,0.05); display:flex; gap:10px; align-items:flex-end;">
                <div class="form-group" style="margin:0; flex:1;">
                    <label style="font-size:10px; color:var(--accent-blue);">Add Custom Style/Layout Property Key</label>
                    <input type="text" id="new-layout-prop-key-${bIdx}" placeholder="e.g. borderRadius, backgroundImage, border" style="font-size:12px; padding:5px;">
                </div>
                <button class="primary" style="padding:6px 12px; font-size:11px; height:31px;" onclick="
                    const propKey = document.getElementById('new-layout-prop-key-${bIdx}').value.trim();
                    if(propKey) {
                        if(target.ui.landscape[${screenIdx}].widgets[${bIdx}].layout[propKey] !== undefined) {
                            alert('Property already exists!');
                        } else {
                            target.ui.landscape[${screenIdx}].widgets[${bIdx}].layout[propKey] = '';
                            renderSingleWidgetForm(${screenIdx}, ${bIdx}, target.ui.landscape[${screenIdx}].widgets[${bIdx}]);
                        }
                    }
                ">🔌 Inject Property</button>
            </div>
        </div>
    `;
}



// Логика создания новой кнопки внутри выбранного экрана
function createNewScreenButton(screenIdx) {
    const screen = target.ui.landscape[screenIdx];
    const newBtn = {
        id: `btn_${Date.now().toString().slice(-6)}`,
        type: "button",
        label_loc_key: "",
        action: "go_back",
        layout: {
            top: "50%",
            left: "50%",
            width: "120px",
            height: "45px",
            backgroundColor: "#222222",
            textColor: "#ffffff"
        }
    };
    screen.widgets.push(newBtn);
    currentUiWidgetIdx = screen.widgets.length - 1;
}


// Финальный блок синхронизации для ui.js
function reloadUiPreviewFrame() {
    const iframe = document.getElementById('ui-preview-iframe');
    if (!iframe) return;

    // Вешаем одноразовый слушатель события 'load' на iframe
    iframe.addEventListener('load', function onFrameReloaded() {
        sendUpdateToPreview();
        // Удаляем слушатель, чтобы он не срабатывал повторно при обычных операциях
        iframe.removeEventListener('load', onFrameReloaded);
    }, { once: true });

    // Принудительно перезагружаем фрейм
    iframe.contentWindow.location.reload();
}

function sendUpdateToPreview() {
    const iframe = document.getElementById('ui-preview-iframe');
    if (!iframe || !iframe.contentWindow) return;

    const messageData = {
        type: 'CONFIG_UI_UPDATE',
        currentOrientation: 'landscape', // Фиксировано под ландшафт по ТЗ
        currentUiWidgetIdx: currentUiWidgetIdx,
        fullConfig: window.target
    };

    iframe.contentWindow.postMessage(messageData, '*');
}


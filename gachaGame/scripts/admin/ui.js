let currentUiOrientation = 'landscape';
let stateUiWidgetIdx = null;

function switchUiOrientation(orientation, evt) {
    currentUiOrientation = orientation;
    stateUiWidgetIdx = null;

    if (evt && evt.target && evt.target.parentElement) {
        const parent = evt.target.parentElement;
        parent.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        evt.target.classList.add('active');
    }

    document.getElementById('ui-sidebar-title').innerText = `${orientation.charAt(0).toUpperCase() + orientation.slice(1)} Elements`;
    document.getElementById('ui-widget-editor').innerHTML = '';

    if (!target.ui[orientation]) {
        target.ui[orientation] = [];
    }

    // Динамически управляем пропорциями и геометрией виртуального смартфона
    const device = document.getElementById('virtual-device-wrapper');
    if (device) {
        if (orientation === 'portrait') {
            device.style.aspectRatio = '9 / 16';
            device.style.maxWidth = '360px'; // Задаем аккуратную portrait-ширину, чтобы он не улетал по высоте
            device.style.height = '100%';
        } else {
            device.style.aspectRatio = '16 / 9';
            device.style.maxWidth = '800px'; // Идеальный ландшафтный масштаб
            device.style.height = 'auto';
        }
    }

    renderUiWindowsSettings();
    renderUiWidgetsList();
}


function renderUiWindowsSettings() {
    const container = document.getElementById('ui-windows-settings-form');
    const settings = target.ui.windows_settings || {};

    container.innerHTML = Object.keys(settings).map(key => `
        <div class="form-group">
            <label>${key.replace('_', ' ')}</label>
            <input type="text" value="${settings[key]}" oninput="target.ui.windows_settings['${key}'] = this.value">
        </div>
    `).join('');
}

function renderUiWidgetsList() {
    const list = document.getElementById('ui-widgets-list');
    const collection = target.ui[currentUiOrientation] || [];

    list.innerHTML = collection.map((item, idx) => `
        <li class="crud-list-item ${stateUiWidgetIdx === idx ? 'active' : ''}" onclick="selectUiWidget(${idx})">
            <span>${item.id || 'unnamed_widget'}</span>
            <span class="badge">${item.type || 'widget'}</span>
        </li>
    `).join('');
}

function createNewUiWidget() {
    if (!target.ui[currentUiOrientation]) {
        target.ui[currentUiOrientation] = [];
    }

    const newWidget = {
        id: `widget_${Date.now()}`,
        type: "button",
        label_loc_key: "",
        action: "",
        layout: { top: "0px", left: "0px", width: "100px", height: "40px", backgroundColor: "#222222" }
    };

    target.ui[currentUiOrientation].push(newWidget);
    selectUiWidget(target.ui[currentUiOrientation].length - 1);
}

function deleteUiWidget(idx) {
    if (!confirm('Are you sure you want to delete this UI element?')) return;

    const item = target.ui[currentUiOrientation][idx];
    if (item && item.id) {
        cascadeDeleteKey('ui_widget', item.id);
    }

    target.ui[currentUiOrientation].splice(idx, 1);
    stateUiWidgetIdx = null;
    document.getElementById('ui-widget-editor').innerHTML = '';
    renderUiWidgetsList();
}

function selectUiWidget(idx) {
    stateUiWidgetIdx = idx;
    renderUiWidgetsList();

    const item = target.ui[currentUiOrientation][idx];
    const ed = document.getElementById('ui-widget-editor');

    const locOptions = Object.keys(target.localization?.ui?.en || {}).map(locKey =>
        `<option value="${locKey}" ${item.label_loc_key === locKey ? 'selected' : ''}>${locKey} (${target.localization.ui.en[locKey]})</option>`
    ).join('');

    const dialogOptions = Object.keys(target.dialogs || {}).map(dKey =>
        `<option value="open_dialog_${dKey}" ${item.action === `open_dialog_${dKey}` ? 'selected' : ''}>Trigger Dialog: ${dKey}</option>`
    ).join('');

    let nestedStructuresHtml = '';

    if (item.layout) {
        nestedStructuresHtml += `
            <div class="sub-section">
                <div class="sub-section-title">Box Geometry Layout</div>
                <div class="form-grid">
                    ${Object.keys(item.layout).map(lKey => `
                        <div class="form-group">
                            <label>${lKey}</label>
                            <input type="text" value="${item.layout[lKey]}" oninput="target.ui['${currentUiOrientation}'][${idx}].layout['${lKey}'] = this.value">
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    if (item.companion_stream) {
        const stream = item.companion_stream;
        nestedStructuresHtml += `
            <div class="sub-section">
                <div class="sub-section-title">Companion Stream Overlay</div>
                <div class="form-grid">
                    <div class="form-group"><label>Enabled</label>
                        <select onchange="target.ui['${currentUiOrientation}'][${idx}].companion_stream.enabled = (this.value === 'true')">
                            <option value="true" ${stream.enabled ? 'selected' : ''}>True</option>
                            <option value="false" ${!stream.enabled ? 'selected' : ''}>False</option>
                        </select>
                    </div>
                    <div class="form-group"><label>Position Side</label><input type="text" value="${stream.position || ''}" oninput="target.ui['${currentUiOrientation}'][${idx}].companion_stream.position = this.value"></div>
                    <div class="form-group"><label>Screen Width %</label><input type="text" value="${stream.width || ''}" oninput="target.ui['${currentUiOrientation}'][${idx}].companion_stream.width = this.value"></div>
                    <div class="form-group"><label>Bubble Color</label><input type="text" value="${stream.bubble_color || ''}" oninput="target.ui['${currentUiOrientation}'][${idx}].companion_stream.bubble_color = this.value"></div>
                </div>
            </div>
        `;
    }

    if (item.list_settings) {
        const listSet = item.list_settings;
        nestedStructuresHtml += `
            <div class="sub-section">
                <div class="sub-section-title">List Rendering Layout</div>
                <div class="form-grid">
                    <div class="form-group"><label>Display Mode</label><input type="text" value="${listSet.display_mode || ''}" oninput="target.ui['${currentUiOrientation}'][${idx}].list_settings.display_mode = this.value"></div>
                    <div class="form-group"><label>Gap Size</label><input type="text" value="${listSet.gap || ''}" oninput="target.ui['${currentUiOrientation}'][${idx}].list_settings.gap = this.value"></div>
                </div>
            </div>
        `;
    }

    ed.innerHTML = `
        <div class="card-header-flex">
            <span class="card-title">Inspect Widget: ${item.id}</span>
            <button class="danger" onclick="deleteUiWidget(${idx})">Delete Widget</button>
        </div>
        <div class="form-grid">
            <div class="form-group"><label>Widget Unique ID</label><input type="text" value="${item.id || ''}" onchange="if(target.ui['${currentUiOrientation}'].some((w,wIdx)=>w.id===this.value && wIdx!==${idx})){alert('ID already exists!'); this.value='${item.id}';}else{target.ui['${currentUiOrientation}'][${idx}].id=this.value; renderUiWidgetsList();}"></div>
            <div class="form-group"><label>Widget Type Class</label><input type="text" value="${item.type || ''}" oninput="target.ui['${currentUiOrientation}'][${idx}].type = this.value; renderUiWidgetsList();"></div>

            <div class="form-group">
                <label>Action Callback Route</label>
                <select onchange="target.ui['${currentUiOrientation}'][${idx}].action = this.value">
                    <option value="${item.action || ''}">Custom Action: ${item.action || 'None'}</option>
                    <option value="go_back">Built-in: go_back</option>
                    <option value="open_profile">Built-in: open_profile</option>
                    ${dialogOptions}
                </select>
            </div>

            <div class="form-group">
                <label>Localization Key Bind</label>
                <select onchange="target.ui['${currentUiOrientation}'][${idx}].label_loc_key = this.value">
                    <option value="">-- No Localization Assigned --</option>
                    ${locOptions}
                </select>
            </div>

            <div class="form-group full-width"><label>Static Background Artwork Asset</label><input type="text" value="${item.bg_image || ''}" oninput="target.ui['${currentUiOrientation}'][${idx}].bg_image = this.value"></div>
        </div>
        ${nestedStructuresHtml}
    `;

    sendUpdateToPreview();
}

function reloadUiPreviewFrame() {
    const iframe = document.getElementById('ui-preview-iframe');
    if (!iframe) return;

    // Вешаем одноразовый слушатель события 'load' на iframe
    // Как только страница внутри фрейма полностью загрузится — сработает триггер обновления
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
        currentOrientation: currentUiOrientation,
        currentUiWidgetIdx: stateUiWidgetIdx,
        fullConfig: window.target
    };

    iframe.contentWindow.postMessage(messageData, '*');
}


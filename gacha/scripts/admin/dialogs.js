function renderDialogs() {
    const list = document.getElementById('dialog-list');
    list.innerHTML = Object.keys(target.dialogs).map(key => `
        <li class="crud-list-item ${state.dialog === key ? 'active' : ''}" onclick="selectDialog('${key}')">
            <span>${key}</span>
            <span class="badge">${target.dialogs[key].window_settings?.display_type || 'fullscreen'}</span>
        </li>
    `).join('');
}

function selectDialog(key) {
    state.dialog = key;
    renderDialogs();
    const d = target.dialogs[key];
    const ed = document.getElementById('dialog-editor');

    const dialogKeys = Object.keys(target.localization?.dialogs?.en || {});
    const heroAvatars = Object.keys(target.catalog?.heroes || {}).map(hKey => ({
        url: target.catalog.heroes[hKey].icon,
        name: target.catalog.heroes[hKey].title_loc?.en || hKey
})).filter(av => av.url);

    let stepsHtml = '';
    if (d.steps) {
        stepsHtml = d.steps.map((step, sIdx) => {
            const speakerOptions = dialogKeys.map(k =>
                `<option value="${k}" ${step.speaker_loc_key === k ? 'selected' : ''}>${k} (${target.localization.dialogs.en[k].substring(0,25)}...)</option>`
            ).join('');

            const textOptions = dialogKeys.map(k =>
                `<option value="${k}" ${step.text_loc_key === k ? 'selected' : ''}>${k} (${target.localization.dialogs.en[k].substring(0,25)}...)</option>`
            ).join('');

            const avatarOptions = heroAvatars.map(av =>
                `<option value="${av.url}" ${step.avatar === av.url ? 'selected' : ''}>Hero: ${av.name}</option>`
            ).join('');

            const hasImg = step.avatar && (step.avatar.startsWith('.') || step.avatar.startsWith('http'));
            const stepPreviewHtml = hasImg ?
                `<img id="step-avatar-prev-${sIdx}" src="${step.avatar}" style="width:45px; height:45px; border-radius:50%; object-fit:cover; border:1px solid var(--border-color);" onerror="this.parentElement.style.display='none'">` :
                `<div style="width:45px; height:45px; border-radius:50%; background:var(--bg-main); border:1px solid var(--border-color); display:flex; align-items:center; justify-content:center; font-size:16px;">👤</div>`;

            return `
                <div class="sub-section" style="margin-top:12px; padding:15px; border-left:3px solid var(--accent-pink);">
                    <div class="card-header-flex" style="border:none; padding:0; margin-bottom:10px;">
                        <span style="font-size:12px; font-weight:600; color:var(--accent-pink);">SEQUENCE STEP #${sIdx + 1}</span>
                        <button class="danger" style="padding: 2px 6px; font-size:11px;" onclick="target.dialogs['${key}'].steps.splice(${sIdx}, 1); selectDialog('${key}');">Remove Step</button>
                    </div>
                    
                    <div style="display:flex; gap:15px; align-items:flex-start; margin-bottom:12px;">
                        <div id="step-avatar-box-${sIdx}" style="flex-shrink:0;">
                            ${stepPreviewHtml}
                        </div>
                        <div style="flex:1;" class="form-grid">
                            <div class="form-group">
                                <label>Speaker Name Ref</label>
                                <select onchange="target.dialogs['${key}'].steps[${sIdx}].speaker_loc_key = this.value">
                                    <option value="">-- Custom Key / None --</option>
                                    ${speakerOptions}
                                </select>
                            </div>
                            <div class="form-group">
                                <label>Dialogue Text Ref</label>
                                <select onchange="target.dialogs['${key}'].steps[${sIdx}].text_loc_key = this.value">
                                    <option value="">-- Custom Key / None --</option>
                                    ${textOptions}
                                </select>
                            </div>
                        </div>
                    </div>

                    <div class="form-grid">
                        <div class="form-group">
                            <label>Link Character Face Icon</label>
                            <select onchange="target.dialogs['${key}'].steps[${sIdx}].avatar = this.value; selectDialog('${key}');">
                                <option value="">-- Select from Roster / Custom --</option>
                                ${avatarOptions}
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Or Manual Asset File Path</label>
                            <input type="text" value="${step.avatar || ''}" oninput="target.dialogs['${key}'].steps[${sIdx}].avatar = this.value; const img=document.getElementById('step-avatar-prev-${sIdx}'); if(img) img.src=this.value;">
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    ed.innerHTML = `
        <div class="card-header-flex">
            <span class="card-title">Edit Dialog Scenario Workflow: ${key}</span>
            <button class="danger" onclick="deleteDialog('${key}')">Delete Full Sequence</button>
        </div>
        <div class="form-grid">
            <div class="form-group"><label>Dialog Unique Configuration ID</label><input type="text" value="${key}" onchange="renameDialogKey('${key}', this.value)"></div>
            <div class="form-group">
                <label>Window Overlay Mode</label>
                <select onchange="target.dialogs['${key}'].window_settings.display_type = this.value; renderDialogs();">
                    <option value="fullscreen" ${d.window_settings?.display_type === 'fullscreen' ? 'selected' : ''}>Fullscreen Cinematic</option>
                    <option value="helper" ${d.window_settings?.display_type === 'helper' ? 'selected' : ''}>Helper Character Popup</option>
                </select>
            </div>
            <div class="form-group"><label>Box Outer Width</label><input type="text" value="${d.window_settings?.box_width || ''}" oninput="target.dialogs['${key}'].window_settings.box_width = this.value"></div>
            <div class="form-group"><label>Box Outer Height</label><input type="text" value="${d.window_settings?.box_height || ''}" oninput="target.dialogs['${key}'].window_settings.box_height = this.value"></div>
            <div class="form-group full-width"><label>Global Backdrop Texture Image</label><input type="text" value="${d.window_settings?.bg_image || ''}" oninput="target.dialogs['${key}'].window_settings.bg_image = this.value"></div>
        </div>

        <div style="margin-top:25px;">
            <div class="card-header-flex" style="border:none; padding:0; margin-bottom:5px;">
                <span class="card-title">Sequence Interactive Steps Flow</span>
                <button class="primary" style="padding: 4px 8px; font-size:11px;" onclick="addDialogStep('${key}')">+ Add Step Flow</button>
            </div>
            <div>${stepsHtml || '<p style="font-size:12px; color:var(--text-muted);">No sequence steps mapped for this tutorial</p>'}</div>
        </div>
    `;
}

function createNewDialog() {
    const newKey = `NEW_SCENARIO_${Object.keys(target.dialogs).length}`;
    target.dialogs[newKey] = { window_settings: { display_type: "fullscreen", box_width: "80%", box_height: "auto" }, steps: [] };
    selectDialog(newKey);
}

function addDialogStep(key) {
    if(!target.dialogs[key].steps) target.dialogs[key].steps = [];
    target.dialogs[key].steps.push({ speaker_loc_key: "", text_loc_key: "", avatar: "" });
    selectDialog(key);
}

function removeDialogStep(key, idx) {
    target.dialogs[key].steps.splice(idx, 1);
    selectDialog(key);
}

function deleteDialog(key) {
    delete target.dialogs[key];
    state.dialog = null;
    document.getElementById('dialog-editor').innerHTML = '';
    renderDialogs();
}

function renameDialogKey(oldKey, newKey) {
    if (!newKey || oldKey === newKey) return;

    if (isKeyDuplicate('dialog', newKey, oldKey)) {
        alert(`Error: Dialog key "${newKey}" already exists!`);
        renderDialogs();
        selectDialog(oldKey);
        return;
    }

    target.dialogs[newKey] = target.dialogs[oldKey];
    delete target.dialogs[oldKey];

    if (state.dialog === oldKey) state.dialog = newKey;
    renderDialogs();
    selectDialog(newKey);
}
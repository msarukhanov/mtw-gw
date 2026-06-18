let currentProfileSection = 'navigation';

function switchProfileSection(sectionId, evt) {
    currentProfileSection = sectionId;

    if (evt && evt.target && evt.target.parentElement) {
        const parent = evt.target.parentElement;
        parent.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        evt.target.classList.add('active');
    }

    renderProfileEditor();
}

function getProfileLayoutData() {
    const profileScreen = target.ui.landscape.find(item => item.id === 'screen_profile');
    if (!profileScreen) return null;
    if (!profileScreen.profile_layout) {
        profileScreen.profile_layout = { tabs_order: [], transaction_fields: [], match_history_fields: [] };
    }
    return profileScreen.profile_layout;
}

function renderProfileEditor() {
    const layout = getProfileLayoutData();
    const ed = document.getElementById('profile-section-editor');
    if (!layout) {
        ed.innerHTML = `<p style="color:var(--accent-red);">Error: screen_profile not found in landscape config!</p>`;
        return;
    }

    if (currentProfileSection === 'navigation') {
        let tabsHtml = (layout.tabs_order || []).map((tab, idx) => `
            <div class="element-row" style="margin-bottom: 8px;">
                <div class="element-info">
                    <span class="badge" style="width:30px; text-align:center;">#${idx + 1}</span>
                    <input type="text" value="${tab}" oninput="getProfileLayoutData().tabs_order[${idx}] = this.value">
                </div>
                <div class="element-actions">
                    <button class="btn-sm" onclick="moveProfileTab(${idx}, -1)">▲ Move Up</button>
                    <button class="btn-sm" onclick="moveProfileTab(${idx}, 1)">▼ Move Down</button>
                    <button class="btn-sm btn-danger" onclick="getProfileLayoutData().tabs_order.splice(${idx}, 1); renderProfileEditor();">Remove</button>
                </div>
            </div>
        `).join('');

        ed.innerHTML = `
            <div class="card-header-flex">
                <span class="card-title">Manage Profile Navigation Tabs Order</span>
                <button class="primary" onclick="getProfileLayoutData().tabs_order.push('new_tab'); renderProfileEditor();">+ Add Tab</button>
            </div>
            <div class="sub-section">
                <div class="sub-section-title">Tabs Sequence Flow</div>
                <div style="margin-top: 15px;">${tabsHtml || '<p style="color:var(--text-muted); font-size:13px;">No tabs configured</p>'}</div>
            </div>
        `;
    }
    else if (currentProfileSection === 'billing' || currentProfileSection === 'matches') {
        const fieldKey = currentProfileSection === 'billing' ? 'transaction_fields' : 'match_history_fields';
        const fields = layout[fieldKey] || [];

        const locOptions = Object.keys(target.localization?.ui?.en || {}).map(locKey =>
            `<option value="${locKey}">${locKey} (${target.localization.ui.en[locKey]})</option>`
        ).join('');

        let fieldsHtml = fields.map((field, idx) => {
            const currentLocOptions = Object.keys(target.localization?.ui?.en || {}).map(locKey =>
                `<option value="${locKey}" ${field.label_loc_key === locKey ? 'selected' : ''}>${locKey}</option>`
            ).join('');

            return `
                <div class="sub-section" style="margin-bottom: 12px; padding: 15px;">
                    <div class="card-header-flex" style="border:none; padding:0; margin-bottom:10px;">
                        <span style="font-size:12px; font-weight:600; color:var(--accent-blue);">COLUMN #${idx + 1}: ${field.id || 'unnamed'}</span>
                        <button class="danger" style="padding: 2px 6px; font-size: 11px;" onclick="getProfileLayoutData().${fieldKey}.splice(${idx}, 1); renderProfileEditor();">Remove Column</button>
                    </div>
                    <div class="form-grid">
                        <div class="form-group">
                            <label>Field Identifier (ID)</label>
                            <input type="text" value="${field.id || ''}" oninput="getProfileLayoutData().${fieldKey}[${idx}].id = this.value">
                        </div>
                        <div class="form-group">
                            <label>Data Render Type</label>
                            <select onchange="getProfileLayoutData().${fieldKey}[${idx}].type = this.value">
                                <option value="string" ${field.type === 'string' ? 'selected' : ''}>String (Raw Text)</option>
                                <option value="loc_string" ${field.type === 'loc_string' ? 'selected' : ''}>Localized String Reference</option>
                                <option value="number" ${field.type === 'number' ? 'selected' : ''}>Number (Numeric Value)</option>
                                <option value="date" ${field.type === 'date' ? 'selected' : ''}>Date/Time Formatter</option>
                                <option value="badge" ${field.type === 'badge' ? 'selected' : ''}>Badge Status Highlight</option>
                                <option value="resource" ${field.type === 'resource' ? 'selected' : ''}>Resource Icon & Count</option>
                            </select>
                        </div>
                        <div class="form-group full-width">
                            <label>Table Header Localization Key</label>
                            <select onchange="getProfileLayoutData().${fieldKey}[${idx}].label_loc_key = this.value">
                                <option value="">-- Select Header Translation Key --</option>
                                ${currentLocOptions}
                            </select>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        ed.innerHTML = `
            <div class="card-header-flex">
                <span class="card-title">${currentProfileSection === 'billing' ? 'Billing History Table Columns Spec' : 'Match History Table Columns Spec'}</span>
                <button class="primary" onclick="getProfileLayoutData().${fieldKey}.push({id:'new_field', label_loc_key:'', type:'string'}); renderProfileEditor();">+ Add Column</button>
            </div>
            <div style="margin-top: 15px;">${fieldsHtml || '<p style="color:var(--text-muted); font-size:13px;">No columns mapped for this table</p>'}</div>
        `;
    }
}

function moveProfileTab(idx, direction) {
    const layout = getProfileLayoutData();
    if (!layout || !layout.tabs_order) return;

    const targetIdx = idx + direction;
    if (targetIdx < 0 || targetIdx >= layout.tabs_order.length) return;

    const temp = layout.tabs_order[idx];
    layout.tabs_order[idx] = layout.tabs_order[targetIdx];
    layout.tabs_order[targetIdx] = temp;

    renderProfileEditor();
}

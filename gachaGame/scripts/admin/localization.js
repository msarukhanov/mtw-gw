let currentLocCategory = 'ui';
let stateLocKey = null;

function switchLocCategory(category, evt) {
    currentLocCategory = category;
    stateLocKey = null;

    if (evt && evt.target && evt.target.parentElement) {
        const parent = evt.target.parentElement;
        parent.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        evt.target.classList.add('active');
    }

    const titleMap = {
        'ui': 'UI Dictionary',
        'stats': 'Stats Dictionary',
        'effects': 'Effects Dictionary',
        'dialogs': 'Dialogs Dictionary'
    };
    document.getElementById('loc-sidebar-title').innerText = titleMap[category];
    document.getElementById('loc-key-editor').innerHTML = '';
    renderLocKeysList();
}

function getLocCategoryRoot() {
    if (!target.localization) target.localization = {};
    if (!target.localization[currentLocCategory]) {
        target.localization[currentLocCategory] = {};
    }
    return target.localization[currentLocCategory];
}

function getLocKeysFromCategory() {
    const root = getLocCategoryRoot();
    const uniqueKeys = new Set();

    target.languages.forEach(lang => {
        if (root[lang]) {
            Object.keys(root[lang]).forEach(k => uniqueKeys.add(k));
        }
    });

    return Array.from(uniqueKeys);
}

function renderLocKeysList() {
    const list = document.getElementById('loc-keys-list');
    const keys = getLocKeysFromCategory();
    const root = getLocCategoryRoot();

    list.innerHTML = keys.map(key => {
        const previewText = root['en'] && root['en'][key] ? root['en'][key] : (root['ru'] && root['ru'][key] ? root['ru'][key] : '');
        const truncated = previewText.length > 20 ? previewText.substring(0, 20) + '...' : previewText;
        const badgeText = truncated ? `<span class="badge" style="max-width:100px; overflow:hidden; text-overflow:ellipsis;">${truncated}</span>` : '';

        return `
            <li class="crud-list-item ${stateLocKey === key ? 'active' : ''}" onclick="selectLocKey('${key}')">
                <span style="font-family:monospace; font-size:12px;">${key}</span>
                ${badgeText}
            </li>
        `;
    }).join('');
}

function createNewLocKey() {
    const root = getLocCategoryRoot();
    const keys = getLocKeysFromCategory();
    let newKey = `new_${currentLocCategory}_key_${keys.length}`;

    while (keys.includes(newKey)) {
        newKey = `new_${currentLocCategory}_key_${Date.now()}`;
    }

    target.languages.forEach(lang => {
        if (!root[lang]) root[lang] = {};
        root[lang][newKey] = "";
    });

    stateLocKey = newKey;
    renderLocKeysList();
    selectLocKey(newKey);
}

function deleteLocKey(key) {
    if (!confirm(`Are you sure you want to delete localization key: ${key}?`)) return;

    const root = getLocCategoryRoot();
    target.languages.forEach(lang => {
        if (root[lang]) {
            delete root[lang][key];
        }
    });

    stateLocKey = null;
    document.getElementById('loc-key-editor').innerHTML = '';
    renderLocKeysList();
}

function renameLocKey(oldKey, newKey) {
    if (!newKey || oldKey === newKey) return;
    const root = getLocCategoryRoot();
    const keys = getLocKeysFromCategory();

    if (keys.includes(newKey)) {
        alert(`Error: Localization key "${newKey}" already exists in this category!`);
        renderLocKeysList();
        selectLocKey(oldKey);
        return;
    }

    target.languages.forEach(lang => {
        if (root[lang]) {
            if (root[lang][oldKey] !== undefined) {
                root[lang][newKey] = root[lang][oldKey];
                delete root[lang][oldKey];
            } else {
                root[lang][newKey] = "";
            }
        }
    });

    stateLocKey = newKey;
    renderLocKeysList();
    selectLocKey(newKey);
}

function selectLocKey(key) {
    stateLocKey = key;
    renderLocKeysList();

    const root = getLocCategoryRoot();
    const ed = document.getElementById('loc-key-editor');

    let languageInputsHtml = target.languages.map(lang => {
        if (!root[lang]) root[lang] = {};
        if (root[lang][key] === undefined) root[lang][key] = "";

        return `
            <div class="form-group full-width" style="margin-bottom: 12px;">
                <label><span class="badge">${lang.toUpperCase()}</span> Translation text</label>
                <textarea oninput="getLocCategoryRoot()['${lang}']['${key}'] = this.value; renderLocKeysList();">${root[lang][key]}</textarea>
            </div>
        `;
    }).join('');

    ed.innerHTML = `
        <div class="card-header-flex">
            <span class="card-title" style="font-family:monospace;">Loc Key: ${key}</span>
            <button class="danger" onclick="deleteLocKey('${key}')">Delete Phrase Key</button>
        </div>
        <div class="form-grid">
            <div class="form-group full-width">
                <label>Localization System Dictionary Key String</label>
                <input type="text" value="${key}" onchange="renameLocKey('${key}', this.value)" style="font-family:monospace;">
            </div>
        </div>
        <div class="sub-section" style="margin-top:20px;">
            <div class="sub-section-title">Active Language Pack Translations</div>
            <div style="margin-top:15px;">
                ${languageInputsHtml}
            </div>
        </div>
    `;
}

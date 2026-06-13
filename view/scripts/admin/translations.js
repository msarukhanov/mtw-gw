let currentTranslationPayload = {}; // Хранит редактируемый JSON-пакет
const platformLanguageMap = {
    "en": { flag: "🇺🇸", label: "EN" },
    "es": { flag: "🇪🇸", label: "ES" },
    "pt": { flag: "🇧🇷", label: "PT" },
    "fr": { flag: "🇫🇷", label: "FR" },
    "de": { flag: "🇩🇪", label: "DE" },
    "it": { flag: "🇮🇹", label: "IT" },
    "hi": { flag: "🇮🇳", label: "HI" },
    "ru": { flag: "🇷🇺", label: "RU" }
};


// 🗺️ ЭТАЛОННЫЙ ШАБЛОН СТРУКТУРЫ (Если в базе для языка еще пусто, строим форму по нему)
const i18nMasterTemplate = {
    "header": {
        "links": {
            "home": "",
            "games": "",
            "sport": "",
            "profile": ""
        },
        "buttons": {
            "sign_in": "",
            "sign_up": ""
        },
        "balance": {
            "wallet": "",
            "bonus": ""
        }
    },
    "auth": {
        "acc_sign_in": "",
        "username": "",
        "password": "",
        "sign_in": "",
        "ref_code": "",
        "create": ""
    }
};

// 1. Загрузка параметров мультиязычности из СУБД
async function loadAdminTranslationMatrix() {
    const websiteSelect = document.getElementById('tl_target_site');
    const langSelect = document.getElementById('tl_editing_lang');
    if (!websiteSelect || !langSelect) return;

    const websiteId = websiteSelect.value;
    const langCode = langSelect.value;
    if (!websiteId) return;

    try {
        const currentPartnerId = localStorage.getItem('partnerId') || 'demo_mtwtech';
        const res = await fetch(`${SERVER_URL}/api/admin/websites/translations?partnerId=${currentPartnerId}&websiteId=${websiteId}&langCode=${langCode}`);
        const data = await res.json();

        if (data.success && data.langSettings) {
            // Восстанавливаем чекбоксы поддерживаемых языков
            const supported = data.langSettings.supported_langs || ['en'];
            ['en', 'es', 'pt', 'fr', 'de', 'it', 'hi', 'ru'].forEach(lang => {
                const chk = document.getElementById(`tl_check_${lang}`);
                if (chk) chk.checked = supported.includes(lang);
            });

            // Выставляем дефолтный язык в селекторе
            const defLangSelect = document.getElementById('tl_default_lang');
            if (defLangSelect) defLangSelect.value = data.langSettings.default_lang || 'en';

            // Очищаем контейнер для инпутов
            const container = document.getElementById('localization-inputs-container');
            if (container) {
                container.innerHTML = ''; // Полностью зачищаем старую верстку

                // Проверяем: пустой ли JSON пришел из базы?
                let finalPayload = data.payload;
                if (!finalPayload || Object.keys(finalPayload).length === 0 || !finalPayload.header) {
                    // Если в базе пусто — берем наш чистый эталонный шаблон
                    finalPayload = JSON.parse(JSON.stringify(i18nMasterTemplate));
                }

                currentTranslationPayload = finalPayload; // Сохраняем в кэш для отправки

                // 🪄 ЗАПУСКАЕМ СБОРКУ ФОРМЫ
                buildDynamicJsonForm(finalPayload, container);
            }
        }
    } catch (err) {
        console.error('Failed to load translations layout:', err);
    }
}

// 2. ИСПРАВЛЕННАЯ РЕКУРСИВНАЯ ФУНКЦИЯ (СТРОИТ ДЕРЕВО ИНПУТОВ)
function buildDynamicJsonForm(obj, parentElement, currentPath = '') {
    for (const key in obj) {
        const value = obj[key];
        const fieldPath = currentPath ? `${currentPath}.${key}` : key;

        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
            // --- КАТЕГОРИЯ / ГРУППА ПОЛЕЙ (Вложенный объект JSON) ---
            const groupWrapper = document.createElement('div');
            groupWrapper.style.cssText = 'border: 1px solid #1a1e26; background: #0c0f14; padding: 15px; border-radius: 6px; margin-bottom: 12px; width: 100%; box-sizing: border-box;';

            const groupTitle = document.createElement('span');
            groupTitle.style.cssText = 'font-size: 11px; font-weight: 800; display: block; margin-bottom: 12px; text-transform: uppercase; letter-spacing: 0.5px;';
            groupTitle.style.color = currentPath ? 'var(--accent-pink)' : 'var(--accent-blue)';
            groupTitle.innerText = fieldPath.replace(/\./g, ' ➔ ');

            groupWrapper.appendChild(groupTitle);

            // Создаем СЕТКУ (Grid) внутри контейнера для дочерних элементов
            const gridContainer = document.createElement('div');
            gridContainer.style.cssText = 'display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px;';
            groupWrapper.appendChild(gridContainer);

            // Добавляем всю группу в родительский элемент
            parentElement.appendChild(groupWrapper);

            // Рекурсивно уходим вглубь объекта, передавая СЕТКУ как нового родителя
            buildDynamicJsonForm(value, gridContainer, fieldPath);
        } else {
            // --- КОНЕЧНОЕ ПОЛЕ (Строка / Инпут) ---
            const label = document.createElement('label');
            label.className = 'gamification-label';
            label.style.cssText = 'display: flex; flex-direction: column; gap: 5px; color: #8a99ad; font-size: 11px; font-weight: 600; text-transform: uppercase;';
            label.innerText = key.replace(/_/g, ' ') + ':';

            const input = document.createElement('input');
            input.type = 'text';
            input.className = 'dynamic-i18n-input';
            input.setAttribute('data-json-path', fieldPath); // Сохраняем путь для сборщика payload
            input.value = value || ''; // Если значение пустое — оставляем инпут чистым
            input.style.cssText = 'background: #0d1017 !important; border: 1px solid #262c3a !important; color: #fff !important; padding: 8px 12px !important; border-radius: 5px !important; font-size: 13px !important; margin-top: 4px !important; box-sizing: border-box !important; width: 100% !important;';

            // Неоновые фокусы
            input.addEventListener('focus', () => {
                input.style.borderColor = 'var(--neon-green)';
                input.style.boxShadow = '0 0 8px rgba(78, 204, 163, 0.2)';
            });
            input.addEventListener('blur', () => {
                input.style.borderColor = '#262c3a';
                input.style.boxShadow = 'none';
            });

            label.appendChild(input);
            parentElement.appendChild(label); // Вставляем инпут внутрь сетки (gridContainer)
        }
    }
}



// Функция-помощник для динамической записи значения внутрь объекта по строке-пути
function setJsonValueByPath(obj, path, value) {
    const parts = path.split('.');
    const lastPart = parts.pop();
    // Доходим до предпоследнего вложенного объекта
    const targetObj = parts.reduce((acc, part) => {
        if (!acc[part]) acc[part] = {}; // Создаем ветку, если её не было
        return acc[part];
    }, obj);
    targetObj[lastPart] = value; // Присваиваем значение конечной строке
}

// Сохранение динамически собранного словаря в Postgres
async function saveAdminTranslationMatrixNode() {
    const websiteId = document.getElementById('tl_target_site').value;
    const langCode = document.getElementById('tl_editing_lang').value;
    if (!websiteId) return alert('Select website brand to deploy localization matrix.');

    // Собираем массив поддерживаемых языков
    const supportedLangs = [];
    ['en', 'es', 'pt', 'fr', 'de', 'it', 'hi', 'ru'].forEach(lang => {
        if (document.getElementById(`tl_check_${lang}`).checked) {
            supportedLangs.push(lang);
        }
    });

    if (supportedLangs.length === 0) return alert('You must enable at least one supported language.');


    // 🪄 ДИНАМИЧЕСКИЙ СБОР ДАННЫХ ИЗ ИНПУТОВ
    // Клонируем исходный payload, чтобы сохранить структуру ключей, которых могло не быть на экране
    const updatedPayloadObj = JSON.parse(JSON.stringify(currentTranslationPayload));

    // Находим все динамические инпуты на странице
    const allInputs = document.querySelectorAll('.dynamic-i18n-input');
    allInputs.forEach(input => {
        const path = input.getAttribute('data-json-path'); // например: "header.links.home"
        const value = input.value.trim();

        // Записываем измененный текст строго по его пути в JSON
        setJsonValueByPath(updatedPayloadObj, path, value);
    });

    showLoader();
    const currentPartnerId = localStorage.getItem('partnerId') || 'demo_mtwtech';

    const bodyData = {
        partnerId: currentPartnerId,
        websiteId: websiteId,
        langCode: langCode,
        langSettings: {
            supported_langs: supportedLangs,
            default_lang: document.getElementById('tl_default_lang').value
        },
        payload: updatedPayloadObj // Отправляем полностью пересобранный чистый JSONB-пакет
    };

    try {
        const res = await fetch(`${SERVER_URL}/api/admin/websites/translations/save`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(bodyData)
        });
        if (res.ok) {
            alert(`Dynamic localization matrix for [${langCode.toUpperCase()}] saved successfully!`);
            loadAdminTranslationMatrix(); // Перечитываем интерфейс
        }
    } catch (err) {
        console.error(err);
    } finally {
        hideLoader();
    }
}
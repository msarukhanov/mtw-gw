// scripts/admin/quests.js — ЧАСТЬ 1 ИЗ 2
let currentQuestSection = 'daily'; // 'daily' или 'weekly'
let currentQuestTaskKey = null;   // ID открытого аккордеона задания

function switchQuestTab(sectionId, evt) {
    currentQuestSection = sectionId;
    currentQuestTaskKey = null;

    if (evt && evt.target && evt.target.parentElement) {
        evt.target.parentElement.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        evt.target.classList.add('active');
    }

    const titleElem = document.getElementById('quests-sidebar-title');
    if (titleElem) {
        titleElem.innerText = sectionId === 'daily' ? 'Daily Mission Board' : 'Weekly Mission Board';
    }

    const ed = document.getElementById('quests-editor');
    if (ed) ed.innerHTML = '';

    renderQuestsSidebarList();
}

function renderQuestsSidebarList() {
    const list = document.getElementById('quests-list');
    if (!list) return;

    // Инициализируем корневой узел quests, если его еще нет в JSON-конфиге
    if (!target.quests) {
        target.quests = {
            daily: { milestones: [], task_pool: {} },
            weekly: { milestones: [], task_pool: {} }
        };
    }

    const sidebarHeaderBtn = document.querySelector('#view-quests .crud-sidebar-header button');
    if (sidebarHeaderBtn) sidebarHeaderBtn.style.display = 'none'; // Синглтоны досок, кнопка скрыта

    if (currentQuestSection === 'daily') {
        list.innerHTML = `
            <li class="crud-list-item active" onclick="selectQuestNode('daily')">
                <div style="display:flex; align-items:center; gap:8px;">
                    <span>☀️</span>
                    <span>Daily Activity Board</span>
                </div>
            </li>
        `;
        renderQuestBoardForm();
    } else {
        list.innerHTML = `
            <li class="crud-list-item active" onclick="selectQuestNode('weekly')">
                <div style="display:flex; align-items:center; gap:8px;">
                    <span>🌙</span>
                    <span>Weekly Progression Board</span>
                </div>
            </li>
        `;
        renderQuestBoardForm();
    }
}

function selectQuestNode(section) {
    currentQuestTaskKey = null;
    renderQuestBoardForm();
}

function renderQuestBoardForm() {
    const ed = document.getElementById('quests-editor');
    if (!ed) return;

    const data = target.quests[currentQuestSection];
    if (!data.milestones) data.milestones = [];
    if (!data.task_pool) data.task_pool = {};

    // А) Рендеринг вех прогресса (milestones) с прямым JSON-текстареа для наград сундуков
    let milestonesHtml = data.milestones.map((m, mIdx) => `
        <div style="background: rgba(255,255,255,0.01); border: 1px solid var(--border-color); padding: 12px; border-radius: 8px; margin-bottom: 10px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                <span class="badge" style="background: var(--accent-blue);">Chest milestone #${mIdx + 1}</span>
                <button class="danger" style="padding: 2px 8px; font-size: 11px;" onclick="target.quests['${currentQuestSection}'].milestones.splice(${mIdx}, 1); renderQuestBoardForm();">Remove Chest</button>
            </div>
            <div class="form-grid" style="gap: 10px;">
                <div class="form-group" style="margin:0;">
                    <label>Required Activity Points Threshold</label>
                    <input type="number" value="${m.points_required || 0}" oninput="target.quests['${currentQuestSection}'].milestones[${mIdx}].points_required = parseInt(this.value) || 0;">
                </div>
                <div class="form-group full-width" style="margin:0;">
                    <label>Chest Rewards Object Map (Direct JSON Editor)</label>
                    <textarea style="width:100%; height:75px; font-family:monospace; font-size:11px; margin-top:4px;" oninput="try{target.quests['${currentQuestSection}'].milestones[${mIdx}].rewards = JSON.parse(this.value); this.style.borderColor='var(--border-color)';}catch(e){this.style.borderColor='var(--accent-red)';}">${JSON.stringify(m.rewards || {resources:{},items:[]}, null, 4)}</textarea>
                </div>
            </div>
        </div>
    `).join('');

    // Заготовка под инжект пула заданий (Task Pool), который мы соберем в Части 2
    ed.innerHTML = `
        <div class="card-header-flex">
            <span class="card-title" style="text-transform: capitalize;">Edit ${currentQuestSection} Missions Framework</span>
        </div>

        <!-- СЕКЦИЯ СУНДУКОВ АКТИВНОСТИ -->
        <div class="sub-section" style="border-color: var(--accent-blue); margin-top: 15px;">
            <div class="card-header-flex" style="border:none; padding:0; margin-bottom:12px;">
                <span class="sub-section-title" style="margin:0; color:var(--accent-blue);">🎁 Accumulated Activity Milestones (Chest Unlocks)</span>
                <button class="primary" style="padding: 2px 8px; font-size: 11px;" onclick="target.quests['${currentQuestSection}'].milestones.push({points_required: 20, rewards: {resources:{gold:1000},items:[]}}); renderQuestBoardForm();">+ Add Chest Milestone</button>
            </div>
            <div>${milestonesHtml || '<p style="font-size:11px; color:var(--text-muted); padding:5px; margin:0;">No chest reward milestones configured for this board.</p>'}</div>
        </div>

        <!-- АНКОР ДЛЯ ТАСК-ПУЛА (МЫ ИНЖЕКТИРУЕМ ЕГО ИЗ ЧАСТИ 2) -->
        <div id="quest-tasks-pool-anchor"></div>
    `;

    if (typeof renderQuestTasksPool === 'function') {
        renderQuestTasksPool(data);
    }
}

async function loadAdminGamificationConfig() {
    try {
        const currentPartnerId = localStorage.getItem('partnerId') || 'demo_mtwtech';
        const res = await fetch(`${SERVER_URL}/api/admin/gamification/config?partnerId=${currentPartnerId}`);
        const data = await res.json();

        if (data.success && data.config) {
            const cfg = data.config;
            document.getElementById('g_xpPerGame').value = cfg.xpPerGame;
            document.getElementById('g_xpMultiplier').value = cfg.xpMultiplier;
            document.getElementById('g_levelUpBonus').value = cfg.levelUpBonus;
            document.getElementById('g_questTargetGames').value = cfg.questTargetGames;
            document.getElementById('g_questReward').value = cfg.questReward;
            document.getElementById('g_tournamentActive').value = cfg.tournamentActive;
            document.getElementById('g_tournamentPrize').value = cfg.tournamentPrize;
            // Выводим процент партнерской комиссии (RevShare)
            document.getElementById('g_affiliatePercent').value = cfg.affiliatePercent || 0;
        }
    } catch (err) {
        console.error('Failed to load gamification config:', err);
    }
}

// 2. Обработчик отправки формы (Сохранение в базу данных)
document.getElementById('gamificationForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    showLoader();

    const currentPartnerId = localStorage.getItem('partnerId') || 'demo_mtwtech';
    const payload = {
        partnerId: currentPartnerId,
        xpPerGame: document.getElementById('g_xpPerGame').value,
        xpMultiplier: document.getElementById('g_xpMultiplier').value,
        levelUpBonus: document.getElementById('g_levelUpBonus').value,
        tournamentActive: document.getElementById('g_tournamentActive').value,
        tournamentPrize: document.getElementById('g_tournamentPrize').value,
        affiliatePercent: document.getElementById('g_affiliatePercent').value
    };

    try {
        const res = await fetch(`${SERVER_URL}/api/admin/gamification/config/save`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!res.error) {
            alert('Gamification and retention parameters successfully saved to PostgreSQL!');
            loadAdminGamificationConfig();
        }
    } catch (err) {
        console.error(err);
    } finally {
        hideLoader();
    }
});

// 3. Обработчик завершения турнира и выплаты призов игрокам в Postgres
async function loadAdminQuestsMatrix() {
    try {
        const currentPartnerId = localStorage.getItem('partnerId') || 'demo_mtwtech';
        const res = await fetch(`${SERVER_URL}/api/admin/quests?partnerId=${currentPartnerId}`);
        const data = await res.json();

        const tbody = document.getElementById('adminQuestsTableBody');
        if (tbody && data.success && data.quests) {
            cachedQuests = data.quests; // сохраняем в кэш

            if (data.quests.length === 0) {
                tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:15px; color:var(--text-muted);">No active quest types configured</td></tr>`;
                return;
            }

            tbody.innerHTML = data.quests.map(q => {
                const isSelectedRow = editingQuestId === q.id ? 'background: rgba(78, 204, 163, 0.08); border-left: 2px solid var(--neon-green);' : '';

                return `
                    <tr style="border-bottom: 1px solid #141822; cursor:pointer; ${isSelectedRow}" onclick="editQuestNode(${q.id})">
                        <td style="padding: 8px 0;"><b style="color: var(--neon-green);">${q.quest_type}</b></td>
                        <td><b>${Number(q.target_value)}</b></td>
                        <td><b style="color: #fff;">${Number(q.reward_amount)} 🪙</b></td>
                        <td><span style="color: var(--text-muted); font-size:11px;">${q.description}</span></td>
                        <td style="text-align: right;" onclick="event.stopPropagation();">
                            <button type="button" onclick="deleteAdminQuestNode(${q.id})" style="background: transparent; border: none; color: #ff4d4d; font-size: 16px; cursor: pointer; padding: 0 10px;">×</button>
                        </td>
                    </tr>
                `;
            }).join('');
        }
    } catch (err) { console.error(err); }
}

// Перенос данных квеста в инпуты формы при клике
function editQuestNode(questId) {
    const quest = cachedQuests.find(q => q.id === questId);
    if (!quest) return;

    editingQuestId = questId;

    document.getElementById('q_type').value = quest.quest_type;
    document.getElementById('q_target').value = Number(quest.target_value);
    document.getElementById('q_reward').value = Number(quest.reward_amount);
    document.getElementById('q_desc').value = quest.description;

    document.getElementById('q_submit_btn').innerText = '🔄 Update Quest Type';
    document.getElementById('q_cancel_btn').style.display = 'inline-block';

    loadAdminQuestsMatrix(); // перерисовываем для подсветки строки
}

// Сброс формы квестов
function resetQuestForm() {
    editingQuestId = null;
    document.getElementById('q_target').value = '';
    document.getElementById('q_reward').value = '';
    document.getElementById('q_desc').value = '';

    document.getElementById('q_submit_btn').innerText = '➕ Add / Update Quest Type';
    document.getElementById('q_cancel_btn').style.display = 'none';
    loadAdminQuestsMatrix();
}

async function createAdminQuestNode() {
    const target = document.getElementById('q_target').value;
    const reward = document.getElementById('q_reward').value;
    const desc = document.getElementById('q_desc').value;

    if (!target || !reward || !desc) return alert('Please fill all quest parameters');

    const currentPartnerId = localStorage.getItem('partnerId') || 'demo_mtwtech';
    const payload = {
        partnerId: currentPartnerId,
        questType: document.getElementById('q_type').value,
        targetValue: target,
        rewardAmount: reward,
        description: desc
    };

    // ДИНАМИЧЕСКИЙ РОУТИНГ КВЕСТОВ
    let targetUrl = `${SERVER_URL}/api/admin/quests/create`;
    if (editingQuestId) {
        targetUrl = `${SERVER_URL}/api/admin/quests/update`;
        payload.id = editingQuestId; // Прокидываем ID строки
    }

    showLoader();
    try {
        const res = await fetch(targetUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!res.error) {
            resetQuestForm(); // Очистит инпуты и сбросит ID редактирования
        }
    } catch (err) { console.error(err); }
    finally { hideLoader(); }
}

// 3. Удаление типа квеста
async function deleteAdminQuestNode(questId) {
    if (!confirm('Delete this quest type? Progress for all players on this quest will be lost.')) return;

    showLoader();
    const currentPartnerId = localStorage.getItem('partnerId') || 'demo_mtwtech';

    try {
        const res = await fetch(`${SERVER_URL}/api/admin/quests/delete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ partnerId: currentPartnerId, questId })
        });
        if (!res.error) resetQuestForm();
    } catch (err) {
        console.error(err);
    } finally {
        hideLoader();
    }
}

// Загрузка значков с подсветкой активной строки
async function loadAdminAchievementsInventory() {
    try {
        const currentPartnerId = localStorage.getItem('partnerId') || 'demo_mtwtech';
        const res = await fetch(`${SERVER_URL}/api/admin/achievements?partnerId=${currentPartnerId}`);
        const data = await res.json();

        const tbody = document.getElementById('adminAchievementsListTbody');
        if (tbody && data.success && data.achievements) {
            cachedAchievements = data.achievements; // сохраняем в кэш

            if (data.achievements.length === 0) {
                tbody.innerHTML = `<tr><td colspan="3" style="text-align:center; padding:15px; color:var(--text-muted);">No achievements configured.</td></tr>`;
                return;
            }
            tbody.innerHTML = data.achievements.map(a => {
                const isSelectedRow = editingAchievementId === a.id ? 'background: rgba(0, 245, 212, 0.08); border-left: 2px solid #00f5d4;' : '';

                return `
                    <tr style="border-bottom: 1px solid #141822; cursor:pointer; ${isSelectedRow}" onclick="editAchievementNode(${a.id})">
                        <td style="padding:8px 0;"><span style="font-size:16px; margin-right:5px;">${a.badge_icon}</span> <b>${a.title}</b></td>
                        <td><small style="color:var(--text-muted); font-family:monospace;">${a.condition_type} (${Number(a.target_value)})</small></td>
                        <td style="text-align:right; vertical-align: middle; display:flex; gap:8px; justify-content:flex-end; padding-top:10px;" onclick="event.stopPropagation();">
                            <b style="color:var(--neon-green);">+${Number(a.reward_amount)} 🪙</b>
                            <button type="button" onclick="deleteAdminAchievementNode(${a.id})" style="background:transparent; border:none; color:#ff4d4d; font-size:16px; cursor:pointer; padding:0 5px;" title="Delete Badge">×</button>
                        </td>
                    </tr>
                `;
            }).join('');
        }
    } catch (err) { console.error(err); }
}

// Перенос данных ачивки в инпуты формы при клике
function editAchievementNode(achievementId) {
    const ach = cachedAchievements.find(a => a.id === achievementId);
    if (!ach) return;

    editingAchievementId = achievementId;

    document.getElementById('a_title').value = ach.title;
    document.getElementById('a_icon').value = ach.badge_icon;
    document.getElementById('a_type').value = ach.condition_type;
    document.getElementById('a_target').value = Number(ach.target_value);
    document.getElementById('a_reward').value = Number(ach.reward_amount);
    document.getElementById('a_desc').value = ach.description;

    document.getElementById('a_submit_btn').innerText = '🔄 UPDATE BADGE TEMPLATE';
    document.getElementById('a_cancel_btn').style.display = 'inline-block';

    loadAdminAchievementsInventory(); // перерисовываем для подсветки строки
}

// Сброс формы ачивок
function resetAchievementForm() {
    editingAchievementId = null;
    document.getElementById('a_title').value = '';
    document.getElementById('a_icon').value = '';
    document.getElementById('a_target').value = '';
    document.getElementById('a_reward').value = '';
    document.getElementById('a_desc').value = '';

    document.getElementById('a_submit_btn').innerText = '➕ MINT BADGE TEMPLATE';
    document.getElementById('a_cancel_btn').style.display = 'none';
    loadAdminAchievementsInventory();
}

// УДАЛЕНИЕ ЗНАЧКА ЧЕРЕЗ БОЕВОЙ РОУТ БЭКЕНДА
async function deleteAdminAchievementNode(achievementId) {
    if (!confirm('Are you sure you want to delete this achievement badge? Progress for all players will be permanently wiped.')) return;

    showLoader();
    const currentPartnerId = localStorage.getItem('partnerId') || 'demo_mtwtech';
    try {
        const res = await fetch(`${SERVER_URL}/api/admin/achievements/delete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ partnerId: currentPartnerId, achievementId })
        });
        if (!res.error) {
            if (editingAchievementId === achievementId) resetAchievementForm();
            else loadAdminAchievementsInventory();
        }
    } catch (err) { console.error(err); }
    finally { hideLoader(); }
}

// 2. Создание нового значка
async function createAdminAchievementNode() {
    const title = document.getElementById('a_title').value;
    const icon = document.getElementById('a_icon').value;
    const target = document.getElementById('a_target').value;
    const reward = document.getElementById('a_reward').value;
    const desc = document.getElementById('a_desc').value;

    if (!title || !icon || !target || !reward || !desc) return alert('Fill all badge token parameters');

    const currentPartnerId = localStorage.getItem('partnerId') || 'demo_mtwtech';
    const payload = {
        partnerId: currentPartnerId, title, description: desc, badgeIcon: icon,
        conditionType: document.getElementById('a_type').value, targetValue: target, rewardAmount: reward
    };

    // ДИНАМИЧЕСКИЙ РОУТИНГ АЧИВОК
    let targetUrl = `${SERVER_URL}/api/admin/achievements/create`;
    if (editingAchievementId) {
        targetUrl = `${SERVER_URL}/api/admin/achievements/update`;
        payload.id = editingAchievementId; // Прокидываем ID строки
    }

    showLoader();
    try {
        const res = await fetch(targetUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!res.error) {
            resetAchievementForm(); // Очистит инпуты и сбросит ID редактирования
        }
    } catch (err) { console.error(err); }
    finally { hideLoader(); }
}
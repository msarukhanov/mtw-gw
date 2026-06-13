

// 1. Загрузка кланов и квестов из Postgres
async function loadAdminClansEcosystem() {
    try {
        const currentPartnerId = localStorage.getItem('partnerId') || 'demo_mtwtech';
        const res = await fetch(`${SERVER_URL}/api/admin/clans/quests?partnerId=${currentPartnerId}`);
        const data = await res.json();

        const tbody = document.getElementById('adminClansListTbody');
        if (tbody && data.success && data.clans) {
            if (data.clans.length === 0) {
                tbody.innerHTML = `<tr><td colspan="3" style="text-align:center; padding:15px; color:var(--text-muted);">No player guild unions created yet.</td></tr>`;
                return;
            }
            tbody.innerHTML = data.clans.map(c => `
                <tr style="border-bottom: 1px solid #141822;">
                    <td style="padding:8px 0;"><b style="color:#fff;">${c.clan_name}</b></td>
                    <td><small style="color:var(--text-muted); font-family:monospace;">${c.owner_username}</small></td>
                    <td>
                        <span class="badge" style="background:#1b2438; color:#fff; font-size:11px; padding:2px 6px; border-radius:4px; font-weight:bold;">Lvl ${c.clan_level}</span>
                        <small style="color:var(--text-muted); font-weight:600; margin-left:5px;">(${c.members_count} members)</small>
                    </td>
                </tr>
            `).join('');
        }
    } catch (err) { console.error('Failed to parse clan arrays:', err); }
}

// 2. Создание командного ивента
async function createAdminClanQuestNode() {
    const title = document.getElementById('cq_title').value;
    const target = document.getElementById('cq_target').value;
    const pool = document.getElementById('cq_pool').value;
    const expiresAt = document.getElementById('cq_end').value;

    if (!title || !target || !pool || !expiresAt) return alert('Please set title, targets, rewards and date timeline rules');

    showLoader();
    const currentPartnerId = localStorage.getItem('partnerId') || 'demo_mtwtech';

    try {
        const res = await fetch(`${SERVER_URL}/api/admin/clans/quests/create`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ partnerId: currentPartnerId, title, targetTurnover: target, rewardPool: pool, expiresAt })
        });
        if (!res.error) {
            alert('Co-Op Guild Tournament Campaign successfully deployed!');
            document.getElementById('cq_title').value = '';
            document.getElementById('cq_target').value = '';
            document.getElementById('cq_pool').value = '';
            document.getElementById('cq_end').value = '';
            loadAdminClansEcosystem();
        }
    } catch (err) { console.error(err); }
    finally { hideLoader(); }
}
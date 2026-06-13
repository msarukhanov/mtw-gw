async function loadAdminPlayers() {
    showLoader();
    try {
        const currentPartnerId = localStorage.getItem('partnerId') || 'demo_mtwtech';
        const searchVal = document.getElementById('player_search_input').value;
        const limitVal = document.getElementById('player_filter_limit').value;

        let queryParams = new URLSearchParams();
        queryParams.append('partnerId', currentPartnerId);
        queryParams.append('page', currentPlayersPage);
        queryParams.append('limit', limitVal);
        if (searchVal) queryParams.append('search', searchVal);

        const res = await fetch(`${SERVER_URL}/api/admin/players?${queryParams.toString()}`, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${localStorage.getItem('adminToken') || ''}` }
        });

        if (res.status === 401) return alert('No access');
        const data = await res.json();
        const tbody = document.getElementById('playersTableBody');

        if (tbody && data.success && data.players) {
            tbody.innerHTML = data.players.map(p => {

                const walletsArray = p.all_wallets || [];
                const walletsHtml = walletsArray.map(w => {
                    const isCurrent = (w.currency === p.current_currency);
                    // Если кошелек активный — красим его в зеленый неон, если архивный — в серый цвет
                    const badgeColor = isCurrent ? 'background: #1b382c; color: var(--neon-green); border: 1px solid var(--neon-green); font-weight:bold;' : 'background: #161920; color: var(--text-muted); border: 1px solid #262c3a;';
                    return `<span class="badge" style="padding:2px 5px; border-radius:4px; font-size:11px; margin-right:4px; display:inline-block; ${badgeColor}">${w.currency}: ${Number(w.balance).toFixed(2)}</span>`;
                }).join('');
                // Подготавливаем значения лимитов (если NULL, оставляем инпут пустым)
                const cMin = p.casino_min_limit !== null ? p.casino_min_limit : '';
                const cMax = p.casino_max_limit !== null ? p.casino_max_limit : '';
                const sMin = p.sport_min_limit !== null ? p.sport_min_limit : '';
                const sMax = p.sport_max_limit !== null ? p.sport_max_limit : '';

                const onlineBadgeColor = p.is_online
                    ? 'background: #00f5d4; box-shadow: 0 0 8px #00f5d4;'
                    : 'background: #262c3a;';

                const onlineTextStatus = p.is_online
                    ? '<small style="color:#00f5d4; font-size:10px; margin-left:5px; font-weight:700;">ONLINE</small>'
                    : '<small style="color:var(--text-muted); font-size:10px; margin-left:5px;">OFFLINE</small>';
                //<b style="color:var(--neon-green);">💵 Balance: ${Number(p.balance).toFixed(2)} 🪙</b><br>
                return `
                   <tr style="border-bottom: 1px solid #141822;">
                        <td style="padding: 10px 0; vertical-align: middle;">
                            <div style="display:flex; align-items:center; gap:8px;">
                          
                                <span style="display:inline-block; width:7px; height:7px; border-radius:50%; ${onlineBadgeColor}"></span>
                                <b style="color:#fff; font-size:13px;">${p.username}</b>
                                
                                 <small style="color:var(--text-muted);">Level: ${p.level || 1} (${p.xp || 0} XP)</small>
                                ${onlineTextStatus}
                            </div>
                        </td>
                       
                        <td>
                            ${walletsHtml}
                            <small style="color:var(--text-muted);">🏆 Tournament points: ${p.tournament_points || 0}</small>
                        </td>
                        <!-- КОЛОНКА 1: КАЗИНО ЛИМИТЫ -->
                        <td>
                            <div style="display: flex; gap: 4px;">
                                <input type="number" id="c_min_${p.username}" value="${cMin}" placeholder="Min" style="width:65px; padding:4px; margin:0; font-size:11px; background: #0c0f14; border-color:#222a36;">
                                <input type="number" id="c_max_${p.username}" value="${cMax}" placeholder="Max" style="width:65px; padding:4px; margin:0; font-size:11px; background: #0c0f14; border-color:#222a36;">
                            </div>
                        </td>
                        <!-- КОЛОНКА 2: СПОРТ ЛИМИТЫ -->
                        <td>
                            <div style="display: flex; gap: 4px;">
                                <input type="number" id="s_min_${p.username}" value="${sMin}" placeholder="Min" style="width:65px; padding:4px; margin:0; font-size:11px; background: #0c0f14; border-color:#222a36;">
                                <input type="number" id="s_max_${p.username}" value="${sMax}" placeholder="Max" style="width:65px; padding:4px; margin:0; font-size:11px; background: #0c0f14; border-color:#222a36;">
                            </div>
                        </td>
                        <td style="text-align: center;">
                            <button onclick="togglePlayerBan('${p.username}', ${p.is_banned})" class="btn-bets-period" style="background: ${p.is_banned ? '#e94560' : 'transparent'}; border-color: ${p.is_banned ? '#e94560' : '#262c3a'}; color: ${p.is_banned ? '#fff' : '#8a99ad'}; padding: 4px 10px; font-size: 11px;">
                                ${p.is_banned ? '🛑 BANNED' : '🟢 ACTIVE'}
                            </button>
                        </td>
                        <td style="text-align: right;">
                            <div style="display: inline-flex; gap: 5px; align-items: center;">
                                <input type="number" id="bal_${p.username}" value="${Number(p.balance).toFixed(2)}" style="width:80px; padding:4px; margin:0;">
                                <button onclick="savePlayerSettings('${p.username}')" style="background:var(--accent-blue); color:#fff; padding:5px 12px; border:none; border-radius:4px; font-weight:600; cursor:pointer;">Save</button>
                            </div>
                        </td>
                    </tr>
                `;
            }).join('');

            const pag = data.pagination;
            document.getElementById('lbl_players_page').innerText = `Page ${pag.page} of ${pag.totalPages || 1}`;
            document.getElementById('btn_players_prev').disabled = pag.page <= 1;
            document.getElementById('btn_players_next').disabled = pag.page >= pag.totalPages;
        }
    } catch (e) { console.error(e); }
    finally { hideLoader(); }
}

// Кнопка быстрого бана/разбана
async function togglePlayerBan(username, currentStatus) {
    const currentPartnerId = localStorage.getItem('partnerId') || 'demo_mtwtech';
    const res = await fetch(`${SERVER_URL}/api/admin/players/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ partnerId: currentPartnerId, username, isBanned: !currentStatus })
    });
    if (!res.error) loadAdminPlayers();
}

async function savePlayerSettings(username) {
    const currentPartnerId = localStorage.getItem('partnerId') || 'demo_mtwtech';
    const balance = document.getElementById('bal_' + username).value;

    // Считываем инпуты. Если пусто — отправляем -1 для сброса в NULL
    const cMinRaw = document.getElementById('c_min_' + username).value;
    const cMaxRaw = document.getElementById('c_max_' + username).value;
    const sMinRaw = document.getElementById('s_min_' + username).value;
    const sMaxRaw = document.getElementById('s_max_' + username).value;

    const casinoMin = cMinRaw === '' ? -1 : cMinRaw;
    const casinoMax = cMaxRaw === '' ? -1 : cMaxRaw;
    const sportMin = sMinRaw === '' ? -1 : sMinRaw;
    const sportMax = sMaxRaw === '' ? -1 : sMaxRaw;

    const res = await fetch(`${SERVER_URL}/api/admin/players/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            partnerId: currentPartnerId,
            username,
            balance,
            casinoMin,
            casinoMax,
            sportMin,
            sportMax
        })
    });

    if (!res.error) {
        alert(`Параметры игрока ${username} успешно обновлены!`);
        loadAdminPlayers();
    }
}

function changePlayersPage(direction) {
    currentPlayersPage += direction;
    loadAdminPlayers();
}
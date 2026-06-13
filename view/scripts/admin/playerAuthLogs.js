let currentSecurityAuditPage = 1;

// 1. Главная функция загрузки логов во вкладку
async function loadGlobalSecurityAuditTrail(page = 1) {
    currentSecurityAuditPage = page;
    const tbody = document.getElementById('globalSecurityAuditTbody');
    const totalsText = document.getElementById('sec-audit-totals-text');
    const controls = document.getElementById('sec-audit-pagination-controls');

    if (!tbody) return;

    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:25px; color:var(--text-muted);">Syncing secure audit blocks...</td></tr>`;

    const searchInput = document.getElementById('sec_search_username');
    const usernameQuery = searchInput ? searchInput.value.trim() : "";
    const currentPartnerId = localStorage.getItem('partnerId') || 'demo_mtwtech';

    try {
        const url = `${SERVER_URL}/api/admin/players/auth-logs?partnerId=${currentPartnerId}&username=${encodeURIComponent(usernameQuery)}&page=${page}&limit=15`;
        const res = await fetch(url);
        const data = await res.json();

        if (data.success && data.logs) {
            if (data.logs.length === 0) {
                tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:30px; color:var(--text-muted);">No login events found matching current criteria.</td></tr>`;
                if(totalsText) totalsText.innerText = "Showing 0 entries";
                if(controls) controls.innerHTML = '';
                return;
            }

            // Наполняем таблицу строками
            tbody.innerHTML = data.logs.map(log => {
                let methodColor = 'color: #00a8ff;';
                if (log.login_type === 'TELEGRAM_TWA') methodColor = 'color: #00f5d4; font-weight:bold;';
                else if (log.login_type === 'SESSION_TOKEN') methodColor = 'color: var(--text-muted);';

                const formattedDate = new Date(log.timestamp).toLocaleString();
                const shortAgent = log.user_agent.length > 55 ? log.user_agent.substring(0, 55) + '...' : log.user_agent;

                return `
                    <tr style="border-bottom: 1px solid #141822; background: rgba(0,0,0,0.15);" onmouseover="this.style.background='rgba(255,255,255,0.02)'" onmouseout="this.style.background='rgba(0,0,0,0.15)'">
                        <td style="padding:12px; color:var(--text-muted); font-family:monospace;">${formattedDate}</td>
                        <td><b style="color:#fff; font-size:13px; font-family:monospace;">${log.username}</b></td>
                        <td><span style="font-size:10px; text-transform:uppercase; ${methodColor}">${log.login_type}</span></td>
                        <td style="color:var(--accent-yellow); font-family:monospace; font-weight:600;">${log.ip_address}</td>
                        <td style="color:var(--accent-blue); font-family:monospace;">${log.domain_name}</td>
                        <td title="${log.user_agent}" style="color:var(--text-muted); cursor:help; font-size:11px;">${shortAgent}</td>
                    </tr>
                `;
            }).join('');

            // Выводим текстовый тотал
            const pg = data.pagination;
            if(totalsText) totalsText.innerText = `Showing ${data.logs.length} of ${pg.totalItems} security logs rows`;

            // Строим элементы управления пагинацией
            if (controls) {
                let paginationHtml = '';
                // Кнопка назад
                paginationHtml += `<button type="button" ${pg.page === 1 ? 'disabled' : ''} onclick="loadGlobalSecurityAuditTrail(${pg.page - 1})" style="padding:4px 10px; background:#161a23; color:#fff; border:1px solid #262c3a; border-radius:4px; cursor:pointer; font-size:12px;"><</button>`;

                // Текущая позиция
                paginationHtml += `<span style="color:#fff; font-size:12px; padding:5px 10px; background:#0c0f14; border-radius:4px; border:1px solid #141822; font-weight:bold;">${pg.page} / ${pg.totalPages}</span>`;

                // Кнопка вперед
                paginationHtml += `<button type="button" ${pg.page === pg.totalPages ? 'disabled' : ''} onclick="loadGlobalSecurityAuditTrail(${pg.page + 1})" style="padding:4px 10px; background:#161a23; color:#fff; border:1px solid #262c3a; border-radius:4px; cursor:pointer; font-size:12px;">></button>`;

                controls.innerHTML = pg.totalPages > 1 ? paginationHtml : '';
            }
        }
    } catch (err) {
        console.error(err);
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:20px; color:var(--accent-red);">Failed to parse logs grid layout from Postgres server.</td></tr>`;
    }
}

// Очистка поиска
function clearSecurityAuditSearch() {
    const input = document.getElementById('sec_search_username');
    if (input) input.value = '';
    loadGlobalSecurityAuditTrail(1);
}
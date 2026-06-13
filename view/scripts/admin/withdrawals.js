async function loadAdminPendingWithdrawals() {
    try {
        const currentPartnerId = localStorage.getItem('partnerId') || 'demo_mtwtech';
        const res = await fetch(`${SERVER_URL}/api/admin/withdrawals?partnerId=${currentPartnerId}&status=PENDING`);
        const data = await res.json();
        const tbody = document.getElementById('adminWithdrawalsTableBody');

        if (tbody && data.success && data.requests) {
            if (data.requests.length === 0) {
                tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:20px; color:var(--text-muted);">No pending withdrawal requests in queue. Good job!</td></tr>`;
                return;
            }
            tbody.innerHTML = data.requests.map(r => `
                <tr style="border-bottom: 1px solid #141822;">
                    <td style="padding: 10px 0;"><small style="color:var(--text-muted);">${new Date(r.timestamp).toLocaleString()}</small></td>
                    <td><b>${r.username}</b></td>
                    <td><b style="color:#ff4d4d;">-${Number(r.amount).toFixed(2)} 🪙</b></td>
                    <td><span class="badge" style="background:#161920; border:1px solid #262c3a; padding:2px 6px; border-radius:4px;">${r.gateway.toUpperCase()}</span></td>
                    <td><small style="font-family:monospace; color:#fff;">${r.wallet_details}</small></td>
                    <td style="text-align: right;">
                        <div style="display:inline-flex; gap:8px;">
                            <button onclick="processWithdrawalNode(${r.id}, 'APPROVE')" style="background:#1b382c; border:1px solid var(--neon-green); color:var(--neon-green); padding:4px 10px; border-radius:4px; cursor:pointer; font-weight:bold; font-size:11px;">🟢 APPROVE</button>
                            <button onclick="processWithdrawalNode(${r.id}, 'REJECT')" style="background:#381b1b; border:1px solid #ff4d4d; color:#ff4d4d; padding:4px 10px; border-radius:4px; cursor:pointer; font-weight:bold; font-size:11px;">🔴 REJECT</button>
                        </div>
                    </td>
                </tr>
            `).join('');
        }
    } catch (err) { console.error(err); }
}

// 2. Обработка клика админа Одобрить/Отклонить [INDEX]
async function processWithdrawalNode(requestId, action) {
    const confirmMsg = action === 'APPROVE'
        ? 'Confirm payout approval? Make sure you have checked player betting logs for security clearance.'
        : 'Reject this request and refund full amount back to player balance?';

    if (!confirm(confirmMsg)) return;

    showLoader();
    const currentPartnerId = localStorage.getItem('partnerId') || 'demo_mtwtech';

    try {
        const res = await fetch(`${SERVER_URL}/api/admin/withdrawals/process`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ partnerId: currentPartnerId, requestId, action })
        });
        if (!res.error) {
            await loadAdminPendingWithdrawals(); // обновляем список заявок
            if (typeof loadAdminFinance === 'function') loadAdminFinance(); // обновляем общий финансовый лог кассы
        }
    } catch (err) { console.error(err); }
    finally { hideLoader(); }
}

async function loadAdminAntifraudAlerts() {
    try {
        const currentPartnerId = localStorage.getItem('partnerId') || 'demo_mtwtech';
        const res = await fetch(`${SERVER_URL}/api/admin/antifraud?partnerId=${currentPartnerId}`);
        const data = await res.json();
        const tbody = document.getElementById('adminAntifraudTableBody');

        if (tbody && data.success && data.alerts) {
            if (data.alerts.length === 0) {
                tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:15px; color:var(--text-muted);">Ecosystem is secure. No fraud risk anomalies detected.</td></tr>`;
                return;
            }
            tbody.innerHTML = data.alerts.map(a => `
                <tr style="border-bottom: 1px solid #141822; background: rgba(255, 77, 77, 0.02);">
                    <td style="padding: 8px 0;"><small style="color:var(--text-muted);">${new Date(a.timestamp).toLocaleTimeString()}</small></td>
                    <td><b style="color:#fff;">${a.username}</b></td>
                    <td><span class="badge" style="background:#381b1b; color:#ff4d4d; border:1px solid #ff4d4d; padding:2px 6px; border-radius:4px; font-weight:bold;">${a.alert_type}</span></td>
                    <td><b style="color: ${a.risk_score >= 70 ? '#ff4d4d' : '#ffb703'};">${a.risk_score} / 100</b></td>
                    <td style="color: var(--text-muted); font-size:11px;">${a.description}</td>
                    <td style="text-align: right;">
                        <button onclick="dismissAntifraudAlert(${a.id})" class="btn-bets-period" style="padding: 2px 8px; font-size: 11px; border-color:#262c3a; color:#8a99ad;">Dismiss</button>
                    </td>
                </tr>
            `).join('');
        }
    } catch (err) { console.error(err); }
}

// 2. Кнопка сброса/архивации алерта админом
async function dismissAntifraudAlert(alertId) {
    const currentPartnerId = localStorage.getItem('partnerId') || 'demo_mtwtech';
    const res = await fetch(`${SERVER_URL}/api/admin/antifraud/dismiss`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ partnerId: currentPartnerId, alertId })
    });
    if (!res.error) loadAdminAntifraudAlerts();
}
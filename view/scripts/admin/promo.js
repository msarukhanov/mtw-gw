// 1. Загрузка списка промокодов с кнопками деактивации и выводом дат
async function loadAdminPromos() {
    try {
        const currentPartnerId = localStorage.getItem('partnerId') || 'demo_mtwtech';
        const res = await fetch(`${SERVER_URL}/api/admin/promos?partnerId=${currentPartnerId}`);
        const data = await res.json();

        const tbody = document.getElementById('promoCodesTableBody');
        if (tbody && data.success && data.promoCodes) {
            tbody.innerHTML = data.promoCodes.map(p => {
                // Красиво форматируем дату окончания, если она есть
                const expDate = p.expires_at
                    ? new Date(p.expires_at).toLocaleDateString() + ' ' + new Date(p.expires_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})
                    : '♾️ Forever';

                const isActive = p.is_active === 1;

                return `
                    <tr>
                        <td><b style="color: var(--accent-pink);">${p.code}</b></td>
                        <td><b>${Number(p.reward).toFixed(2)} 🪙</b></td>
                        <td><small style="color: var(--text-muted); font-weight:600;">${p.current_uses} / ${p.max_uses}</small></td>
                        <td><small style="color: #8a99ad; font-family: monospace;">${expDate}</small></td>
                        <td style="text-align: right;">
                            <button onclick="togglePromoCodeState('${p.code}', ${p.is_active})" class="btn-bets-period" style="background: ${isActive ? 'transparent' : '#381b1b'}; border-color: ${isActive ? '#262c3a' : '#ff4d4d'}; color: ${isActive ? '#4ecca3' : '#ff4d4d'}; padding: 4px 10px; font-size: 11px;">
                                ${isActive ? '🟢 ACTIVE' : '🛑 OFF'}
                            </button>
                        </td>
                    </tr>
                `;
            }).join('');
        }
    } catch (err) {
        console.error('Failed to load voucher list:', err);
    }
}

// 2. Создание нового промокода с учетом таймлайна жизни купона
document.getElementById('promoForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    showLoader();

    const currentPartnerId = localStorage.getItem('partnerId') || 'demo_mtwtech';
    const code = document.getElementById('p_code').value;
    const reward = document.getElementById('p_reward').value;
    const maxUses = document.getElementById('p_maxUses').value;
    const expiresAt = document.getElementById('p_expiresAt').value; // Забираем дату

    try {
        const res = await fetch(`${SERVER_URL}/api/admin/promos/create`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ partnerId: currentPartnerId, code, reward, maxUses, expiresAt })
        });

        if (!res.error) {
            alert('Promo voucher registered!');
            document.getElementById('promoForm').reset();
            document.getElementById('p_maxUses').value = '1';
            loadAdminPromos();
        }
    } catch (err) {
        console.error(err);
    } finally {
        hideLoader();
    }
});

// 3. Функция переключения активности купона кликом по кнопке в таблице [INDEX]
async function togglePromoCodeState(code, currentStatus) {
    const currentPartnerId = localStorage.getItem('partnerId') || 'demo_mtwtech';
    showLoader();
    try {
        const res = await fetch(`${SERVER_URL}/api/admin/promos/toggle`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ partnerId: currentPartnerId, code, currentStatus })
        });
        if (!res.error) loadAdminPromos();
    } catch (err) {
        console.error(err);
    } finally {
        hideLoader();
    }
}
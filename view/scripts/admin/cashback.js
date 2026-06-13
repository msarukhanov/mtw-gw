async function loadAdminCashbackConfig() {
    try {
        const currentPartnerId = localStorage.getItem('partnerId') || 'demo_mtwtech';
        const res = await fetch(`${SERVER_URL}/api/admin/cashback/config?partnerId=${currentPartnerId}`);
        const data = await res.json();

        if (data.success && data.config) {
            document.getElementById('g_cashbackPercent').value = data.config.percent;
            document.getElementById('g_cashbackMode').value = data.config.mode;

            // Если выбран авторежим или крон, кнопку ручной выплаты визуально делаем тусклой
            const manualBtn = document.getElementById('runCashbackBtn');
            if (data.config.mode !== 'manual') {
                manualBtn.style.opacity = '0.4';
                manualBtn.innerText = '💰 Manual payout disabled (Running in Auto/Cron mode)';
            } else {
                manualBtn.style.opacity = '1';
                manualBtn.innerText = '💰 Calculate and pay manual cashback everyone';
            }
        }
    } catch (err) {
        console.error('Failed to load cashback config:', err);
    }
}

// 2. Сохранение режима и процента в базу данных
document.getElementById('cashbackConfigForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    showLoader();

    const currentPartnerId = localStorage.getItem('partnerId') || 'demo_mtwtech';
    const percent = document.getElementById('g_cashbackPercent').value;
    const mode = document.getElementById('g_cashbackMode').value;

    try {
        const res = await fetch(`${SERVER_URL}/api/admin/cashback/config/save`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ partnerId: currentPartnerId, percent, mode })
        });

        if (!res.error) {
            alert(`Cashback rule updated successfully to [${mode.toUpperCase()}] at ${percent}%!`);
            loadAdminCashbackConfig(); // Перечитываем и обновляем состояние кнопки
        }
    } catch (err) {
        console.error(err);
    } finally {
        hideLoader();
    }
});

document.getElementById('runCashbackBtn').addEventListener('click', async () => {
    const percent = document.getElementById('g_cashbackPercent').value || 10;
    if (!confirm(`Confirm calculation and batch credit payout of ${percent}% cashback for all active players?`)) return;

    showLoader();
    const currentPartnerId = localStorage.getItem('partnerId') || 'demo_mtwtech';

    try {
        const res = await fetch(`${SERVER_URL}/api/admin/cashback/run`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ partnerId: currentPartnerId, percent })
        });
        const data = await res.json();
        if (data.success) {
            alert(data.message);
        }
    } catch (err) {
        console.error(err);
        alert('Cashback payout batch failure');
    } finally {
        hideLoader();
    }
});
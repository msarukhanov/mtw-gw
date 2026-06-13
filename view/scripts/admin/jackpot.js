async function loadAdminJackpotsMatrix() {
    try {
        const currentPartnerId = localStorage.getItem('partnerId') || 'demo_mtwtech';
        const res = await fetch(`${SERVER_URL}/api/admin/jackpots/list?partnerId=${currentPartnerId}`);
        const data = await res.json();

        const tbody = document.getElementById('adminJackpotTableBody');
        if (tbody && data.success && data.jackpots) {
            cachedJackpots = data.jackpots; // Сохраняем в локальный кэш админки

            tbody.innerHTML = data.jackpots.map(jk => {
                // Если строка выбрана для редактирования — подсвечиваем её золотым неоном
                const isSelectedRow = editingJackpotId === jk.id ? 'background: rgba(255, 183, 3, 0.08); border-left: 2px solid #ffb703;' : '';
                const statusBadge = jk.is_active === 1
                    ? '<span style="color:var(--neon-green); font-weight:bold;">ACTIVE</span>'
                    : '<span style="color:var(--text-muted);">DISABLED</span>';

                return `
                    <tr style="border-bottom: 1px solid #141822; cursor:pointer; ${isSelectedRow}" onclick="editJackpotNode(${jk.id})">
                        <td style="padding:10px 0;"><b style="color:#fff; letter-spacing:0.5px;">${jk.level_name}</b></td>
                        <td><b style="color:var(--accent-yellow); font-family:monospace;">${Number(jk.current_amount).toFixed(2)} 🪙</b></td>
                        <td><small style="color:var(--text-muted); font-family:monospace;">${Number(jk.fee_percent).toFixed(2)}%</small></td>
                        <td style="text-align: right; font-size:11px;">${statusBadge}</td>
                    </tr>
                `;
            }).join('');
        }
    } catch (err) { console.error('Failed to parse jackpot ecosystem matrix:', err); }
}

// 2. Клик по строке: разблокируем инпуты и переносим туда числа
function editJackpotNode(jackpotId) {
    const jk = cachedJackpots.find(j => j.id === jackpotId);
    if (!jk) return;

    editingJackpotId = jackpotId;

    // Меняем заголовок формы и наполняем инпуты
    document.getElementById('jk_form_title').innerText = `Editing Tier: ${jk.level_name}`;

    const inputs = ['jk_current', 'jk_start', 'jk_trigger', 'jk_fee', 'jk_active'];
    inputs.forEach(id => document.getElementById(id).disabled = false); // Активируем поля

    document.getElementById('jk_current').value = Number(jk.current_amount);
    document.getElementById('jk_start').value = Number(jk.start_amount);
    document.getElementById('jk_trigger').value = Number(jk.trigger_amount);
    document.getElementById('jk_fee').value = Number(jk.fee_percent);
    document.getElementById('jk_active').value = jk.is_active;

    // Включаем кнопку сохранения
    const saveBtn = document.getElementById('jk_save_btn');
    saveBtn.disabled = false;
    saveBtn.style.opacity = '1';
    saveBtn.style.cursor = 'pointer';

    document.getElementById('jk_cancel_btn').style.display = 'inline-block';

    loadAdminJackpotsMatrix(); // Перерисовываем таблицу для подсветки строки
}

// 3. Сброс формы в заблокированное состояние
function resetJackpotForm() {
    editingJackpotId = null;
    document.getElementById('jk_form_title').innerText = 'Select Jackpot Level to Edit';

    const inputs = ['jk_current', 'jk_start', 'jk_trigger', 'jk_fee', 'jk_active'];
    inputs.forEach(id => {
        document.getElementById(id).value = '';
        document.getElementById(id).disabled = true;
    });

    const saveBtn = document.getElementById('jk_save_btn');
    saveBtn.disabled = true;
    saveBtn.style.opacity = '0.4';
    saveBtn.style.cursor = 'not-allowed';

    document.getElementById('jk_cancel_btn').style.display = 'none';
    loadAdminJackpotsMatrix();
}

// 4. Сбор чисел и отправка POST-запроса апдейта в Postgres
async function saveAdminJackpotNodeData() {
    if (!editingJackpotId) return;

    const currentAmount = document.getElementById('jk_current').value;
    const startAmount = document.getElementById('jk_start').value;
    const triggerAmount = document.getElementById('jk_trigger').value;
    const feePercent = document.getElementById('jk_fee').value;
    const isActive = document.getElementById('jk_active').value;

    if (!currentAmount || !startAmount || !triggerAmount || !feePercent) {
        return alert('Please fill all mathematical jackpot variables.');
    }

    showLoader();
    const currentPartnerId = localStorage.getItem('partnerId') || 'demo_mtwtech';

    try {
        const res = await fetch(`${SERVER_URL}/api/admin/jackpots/save`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id: editingJackpotId,
                partnerId: currentPartnerId,
                currentAmount, startAmount, triggerAmount, feePercent, isActive
            })
        });

        if (res.ok) {
            alert('Jackpot level mathematical parameters successfully synchronized in СУБД!');
            resetJackpotForm(); // Сбрасываем форму и обновляем таблицу
        }
    } catch (err) { console.error(err); }
    finally { hideLoader(); }
}
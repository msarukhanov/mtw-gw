async function loadAdminFinance() {
    showLoader();
    try {
        let queryParams = new URLSearchParams();
        const fromDateVal = document.getElementById('fin_filter_from').value;
        const toDateVal = document.getElementById('fin_filter_to').value;
        const txTypeVal = document.getElementById('fin_filter_type').value;
        const limitVal = document.getElementById('fin_filter_limit').value;

        queryParams.append('txType', txTypeVal);
        queryParams.append('page', currentTxPage);
        queryParams.append('limit', limitVal);
        if (fromDateVal) queryParams.append('fromDate', fromDateVal);
        if (toDateVal) queryParams.append('toDate', toDateVal);

        const res = await fetch(`${baseUrlApi}/admin/finance/report?${queryParams.toString()}`);
        const data = await res.json();
        const txLedgerTbody = document.getElementById('tx_ledger_tbody');

        if (data.success && data.ledger) {
            if (data.ledger.items && data.ledger.items.length > 0) {
                txLedgerTbody.innerHTML = data.ledger.items.map(t => {
                    let badgeStyle = 'background: var(--accent-blue);';
                    let badgeText = 'BALANCE INJECT';
                    let flowText = `<b style="color: var(--neon-green);">+${t.amount} 🪙</b>`;

                    if (t.type === 'AFFILIATE') {
                        badgeStyle = 'background: #381b2c; border: 1px solid var(--accent-pink);';
                        badgeText = 'AFFILIATE SHARE';
                        flowText = `<b style="color: var(--accent-pink);">+${t.amount} 🪙</b>`;
                    } else if (t.game?.includes('Deposit')) {
                        badgeStyle = 'background: #1b3238; border: 1px solid var(--accent-blue);';
                        badgeText = 'DEPOSIT';
                    } else if (t.game?.includes('Withdraw')) {
                        badgeStyle = 'background: #381b1b; border: 1px solid #ff4d4d;';
                        badgeText = 'WITHDRAW';
                        flowText = `<b style="color: #ff4d4d;">-${t.amount} 🪙</b>`;
                    } else if (t.game?.includes('Promo') || t.game?.includes('Quest') || t.game?.includes('VIP')) {
                        badgeStyle = 'background: #1b382c; border: 1px solid var(--neon-green);';
                        badgeText = 'BONUS / QUEST';
                    }

                    return `
                        <tr>
                            <td><small style="color: var(--text-muted);">${new Date(t.ts).toLocaleString()}</small></td>
                            <td><b>${t.username}</b></td>
                            <td><small style="color: #fff; font-weight: 600;">${t.game || 'System'}</small></td>
                            <td><span class="badge" style="${badgeStyle} color: #fff; padding: 4px 10px; font-size: 11px; border-radius:4px;">${badgeText}</span></td>
                            <td style="font-size: 15px;">${flowText}</td>
                        </tr>
                    `;
                }).join('');

                const pag = data.ledger.pagination;
                document.getElementById('lbl_tx_page').innerText = `Страница ${pag.page} из ${pag.totalPages || 1}`;
                document.getElementById('btn_tx_prev').disabled = pag.page <= 1;
                document.getElementById('btn_tx_next').disabled = pag.page >= pag.totalPages;
            } else {
                txLedgerTbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--text-muted); padding:30px;">No transactions found</td></tr>`;
                document.getElementById('lbl_tx_page').innerText = 'Страница 1 из 1';
                document.getElementById('btn_tx_prev').disabled = true;
                document.getElementById('btn_tx_next').disabled = true;
            }
        }
    } catch (fErr) {
        console.error(fErr);
    } finally {
        hideLoader();
    }
}

function setFinancePeriod(period) {
    currentFinancePeriod = period;
    currentTxPage = 1;
    document.getElementById('fin_filter_from').value = '';
    document.getElementById('fin_filter_to').value = '';
    document.querySelectorAll('.btn-fin-period').forEach(btn => btn.classList.remove('active'));
    if (period === 'day') document.getElementById('btn_fin_day').classList.add('active');
    else if (period === 'week') document.getElementById('btn_fin_week').classList.add('active');
    else document.getElementById('btn_fin_all').classList.add('active');
    loadAdminFinance();
}

function triggerFinDateChange() {
    currentFinancePeriod = '';
    currentTxPage = 1;
    document.querySelectorAll('.btn-fin-period').forEach(btn => btn.classList.remove('active'));
    loadAdminFinance();
}

function changeTxPage(direction) {
    currentTxPage += direction;
    loadAdminFinance();
}

// 📥 ФУНКЦИЯ ЭКСПОРТА ТАБЛИЦЫ КАССЫ В CSV ФАЙЛ
async function exportLedgerToCSV() {
    showLoader();
    try {
        const fromDateVal = document.getElementById('fin_filter_from').value;
        const toDateVal = document.getElementById('fin_filter_to').value;
        const txTypeVal = document.getElementById('fin_filter_type').value;

        let queryParams = new URLSearchParams();
        queryParams.append('txType', txTypeVal);
        queryParams.append('page', 1);
        queryParams.append('limit', 5000); // Выгружаем максимум строк за выбранный период
        if (fromDateVal) queryParams.append('fromDate', fromDateVal);
        if (toDateVal) queryParams.append('toDate', toDateVal);

        const res = await fetch(`${baseUrlApi}/admin/finance/ledger?${queryParams.toString()}`);
        const data = await res.json();

        if (!data.success || !data.ledger.items || data.ledger.items.length === 0) {
            alert('Нет данных для выгрузки за выбранный период');
            return;
        }

        // Строим заголовки столбцов CSV
        let csvContent = "\uFEFF"; // BOM для корректного чтения кириллицы (например, имени "Марк") Excel-ем
        csvContent += "Дата;Пользователь;Описание/Игра;Тип;Сумма\n";

        // Заполняем строками
        data.ledger.items.forEach(t => {
            const date = new Date(t.ts).toLocaleString();
            const username = t.username;
            const game = t.game || 'System';
            const type = t.type;
            const amount = t.game?.includes('Withdraw') ? `-${t.amount}` : `${t.amount}`;

            csvContent += `"${date}";"${username}";"${game}";"${type}";"${amount}"\n`;
        });

        // Создаем виртуальную ссылку для скачивания файла на стороне браузера
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `financial_report_${txTypeVal}_${new Date().toISOString().slice(0,10)}.csv`);
        document.body.appendChild(link);

        link.click(); // Инициируем скачивание
        document.body.removeChild(link);
    } catch (err) {
        console.error('Ошибка экспорта CSV:', err);
    } finally {
        hideLoader();
    }
}
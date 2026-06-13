async function loadAdminBets() {
    showLoader();
    try {
        const category = document.getElementById('bets_filter_category').value;
        const username = document.getElementById('bets_filter_username').value;
        const fromDateVal = document.getElementById('bets_filter_from').value;
        const toDateVal = document.getElementById('bets_filter_to').value;
        const limitVal = document.getElementById('bets_filter_limit').value;

        let queryParams = new URLSearchParams();
        queryParams.append('category', category);
        queryParams.append('page', currentBetsPage);
        queryParams.append('limit', limitVal);

        if (username) queryParams.append('username', username);
        if (currentBetsPeriod) {
            queryParams.append('period', currentBetsPeriod);
        } else {
            if (fromDateVal) queryParams.append('fromDate', fromDateVal);
            if (toDateVal) queryParams.append('toDate', toDateVal);
        }

        const bRes = await fetch(`${baseUrlApi}/admin/bets/report?${queryParams.toString()}`);
        const bData = await bRes.json();
        const betsRegistryTbody = document.getElementById('bets_registry_tbody');

        if (bData.success && bData.report && bData.report.length > 0) {
            betsRegistryTbody.innerHTML = bData.report.map(b => {
                const gameName = b.game_id || b.game || (category === 'sport' ? 'Sports Match' : 'Casino Game');
                const isWin = b.status === 'WIN' || b.status === 'SUCCESS' || b.win === true;
                const displayAmount = isWin ? Number(b.prize || 0) : Number(b.stake || 0);

                return `
                    <tr>
                        <td><small style="color: var(--text-muted);">${new Date(b.timestamp).toLocaleString()}</small></td>
                        <td><b>${b.username}</b></td>
                        <td><span class="badge" style="background: var(--bg-main); border: 1px solid var(--border-color); color: #fff; padding: 4px 8px;">${gameName}</span></td>
                        <td><b style="color: ${!isWin ? 'var(--text-muted)' : 'var(--neon-green)'}">${!isWin ? '🔴 STAKE / OUT' : '🟢 WIN / IN'}</b></td>
                        <td><span style="color: ${!isWin ? '#fff' : 'var(--neon-green)'}; font-size: 15px;"><b>${displayAmount.toFixed(2)} 🪙</b></span></td>
                    </tr>
                `;
            }).join('');

            document.getElementById('lbl_bets_page').innerText = `Page ${bData.pagination.page} of ${bData.pagination.totalPages || 1}`;
            document.getElementById('btn_bets_prev').disabled = bData.pagination.page <= 1;
            document.getElementById('btn_bets_next').disabled = bData.pagination.page >= bData.pagination.totalPages;
        } else {
            betsRegistryTbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--text-muted); padding:30px;">No bets registered in engine for selected filters</td></tr>`;
            document.getElementById('lbl_bets_page').innerText = 'Page 1 of 1';
            document.getElementById('btn_bets_prev').disabled = true;
            document.getElementById('btn_bets_next').disabled = true;
        }
    } catch (bErr) {
        console.error('Bets registry sync failure:', bErr);
    } finally {
        hideLoader();
    }
}

function setBetsPeriod(period) {
    currentBetsPeriod = period;
    currentBetsPage = 1;
    document.getElementById('bets_filter_from').value = '';
    document.getElementById('bets_filter_to').value = '';
    document.querySelectorAll('.btn-bets-period').forEach(btn => btn.classList.remove('active'));
    if (period === 'day') document.getElementById('btn_bets_day').classList.add('active');
    else if (period === 'week') document.getElementById('btn_bets_week').classList.add('active');
    else document.getElementById('btn_bets_all').classList.add('active');
    loadAdminBets();
}

function triggerBetsDateChange() {
    currentBetsPeriod = '';
    currentBetsPage = 1;
    document.querySelectorAll('.btn-bets-period').forEach(btn => btn.classList.remove('active'));
    loadAdminBets();
}

function changeBetsPage(direction) {
    currentBetsPage += direction;
    loadAdminBets();
}
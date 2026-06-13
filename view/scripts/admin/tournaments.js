async function loadAdminTournamentsMatrix() {
    try {
        const currentPartnerId = localStorage.getItem('partnerId') || 'demo_mtwtech';
        const res = await fetch(`${SERVER_URL}/api/admin/tournaments?partnerId=${currentPartnerId}`);
        const data = await res.json();

        // Рендерим плашку текущего статуса
        const statusBlock = document.getElementById('active_tournament_card_details');
        const endBtn = document.getElementById('endTournamentBtn');

        if (data.success && data.activeTournament) {
            const t = data.activeTournament;
            statusBlock.innerHTML = `
                📌 <b>Title:</b> <span style="color:var(--accent-pink); font-weight:700;">${t.title}</span><br>
                💰 <b>Prize Pool:</b> ${Number(t.prize_pool).toFixed(2)} 🪙<br>
                ⚡ <b>Min Bet Qualification:</b> ${Number(t.min_bet_to_earn)} 🪙<br>
                📅 <b>Timeline:</b> <span style="font-family:monospace; font-size:11px;">${new Date(t.start_at).toLocaleDateString()} - ${new Date(t.end_at).toLocaleDateString()}</span>
            `;
            endBtn.disabled = false;
            endBtn.style.opacity = '1';
        } else {
            statusBlock.innerHTML = `<span style="color:var(--text-muted);">No active championships deployed at the moment. Use creation wizard to deploy nodes.</span>`;
            endBtn.disabled = true;
            endBtn.style.opacity = '0.3';
        }

        // Рендерим таблицу архива
        const tbody = document.getElementById('adminTournamentHistoryTbody');
        if (tbody && data.success && data.archive) {
            if (data.archive.length === 0) {
                tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:15px; color:var(--text-muted);">History logs archive is completely clean</td></tr>`;
                return;
            }
            tbody.innerHTML = data.archive.map(h => `
                <tr style="border-bottom: 1px solid #141822;">
                    <td style="padding: 8px 0; color:#fff;">${h.title}</td>
                    <td><b>${h.winner_username}</b></td>
                    <td><span class="badge" style="padding:2px 6px; font-size:11px; background:${h.place === 1 ? '#e1b12c' : h.place === 2 ? '#95a5a6' : '#d35400'}; color:#000; font-weight:bold;">Top ${h.place}</span></td>
                    <td><small style="font-family:monospace;">${h.points_earned} pts</small></td>
                    <td style="text-align: right; color:var(--neon-green); font-weight:bold;">+${Number(h.prize_paid).toFixed(2)} 🪙</td>
                </tr>
            `).join('');
        }
    } catch (err) {
        console.error('Failed to load tournament grid:', err);
    }
}

async function createAdminTournamentNode() {
    const title = document.getElementById('t_title').value;
    const prize = document.getElementById('t_prize').value;
    const minbet = document.getElementById('t_minbet').value;
    const start = document.getElementById('t_start').value;
    const end = document.getElementById('t_end').value;

    if (!title || !prize || !start || !end) return alert('Please input title, prize pool and calendar matrix timeline data');

    showLoader();
    const currentPartnerId = localStorage.getItem('partnerId') || 'demo_mtwtech';

    try {
        const res = await fetch(`${SERVER_URL}/api/admin/tournaments/create`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ partnerId: currentPartnerId, title, prizePool: prize, minBet: minbet, startAt: start, endAt: end })
        });

        if (!res.error) {
            alert('Championship node deployed successfully!');
            document.getElementById('t_title').value = '';
            document.getElementById('t_prize').value = '';
            document.getElementById('t_minbet').value = '';
            document.getElementById('t_start').value = '';
            document.getElementById('t_end').value = '';
            loadAdminTournamentsMatrix();
        }
    } catch (err) {
        console.error(err);
    } finally {
        hideLoader();
    }
}

document.getElementById('endTournamentBtn').addEventListener('click', async () => {
    if (!confirm('Are you sure you want to end the current network tournament? This will calculate top-3 leaders, execute balance payouts via seamless gateway and reset leaderboard points to 0.')) return;

    showLoader();
    const currentPartnerId = localStorage.getItem('partnerId') || 'demo_mtwtech';

    try {
        const res = await fetch(`${SERVER_URL}/api/admin/tournament/end`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ partnerId: currentPartnerId })
        });
        const data = await res.json();

        if (data.success) {
            if (data.winners && data.winners.length > 0) {
                const winnersList = data.winners.map(w => `Place ${w.place}: ${w.username} (${w.points} pts) -> +${w.prize} 🪙`).join('\n');
                alert(`🏆 Tournament finalized successfully!\n\nWinners Payout Log:\n${winnersList}`);
            } else {
                alert('Tournament finished. No active participants with points > 0 found.');
            }
            loadAdminGamificationConfig();
        }
    } catch (err) {
        console.error(err);
        alert('Failed to finalize current tournament sequence');
    } finally {
        hideLoader();
    }
});
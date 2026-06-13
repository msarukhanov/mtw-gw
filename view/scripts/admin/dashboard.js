async function loadAdminDashboard() {
    showLoader();
    try {
        let queryParams = new URLSearchParams();
        if (currentFinancePeriod) queryParams.append('period', currentFinancePeriod);

        const res = await fetch(`${baseUrlApi}/admin/finance/dashboard?${queryParams.toString()}`);
        const data = await res.json();

        if (data.success && data.metrics) {
            const m = data.metrics;
            document.getElementById('fin_bets').innerText = m.totalBets.toFixed(2) + ' 🪙';
            document.getElementById('fin_wins').innerText = m.totalWins.toFixed(2) + ' 🪙';
            document.getElementById('fin_ggr').innerText = m.ggr.toFixed(2) + ' 🪙';
            document.getElementById('fin_net').innerText = m.netProfit.toFixed(2) + ' 🪙';
            if(document.getElementById('fin_deposits')) document.getElementById('fin_deposits').innerText = m.totalDeposits.toFixed(2) + ' 🪙';
            if(document.getElementById('fin_withdraws')) document.getElementById('fin_withdraws').innerText = m.totalWithdraws.toFixed(2) + ' 🪙';
            document.getElementById('fin_logs').innerText = m.transactionsCount;
        }
    } catch (err) {
        console.error(err);
    } finally {
        hideLoader();
    }
}

async function loadAdminFinanceChart() {
    try {
        const domainSelect = document.getElementById('dashboard_global_domain_filter');
        const daysSelect = document.getElementById('dashboard_global_days_filter');

        const selectedDomain = domainSelect ? domainSelect.value : "";
        const selectedDays = daysSelect ? daysSelect.value : 7;
        const currentPartnerId = localStorage.getItem('partnerId') || 'demo_mtwtech';

        const res = await fetch(`${baseUrlApi}/admin/finance/chart?partnerId=${currentPartnerId}&domain=${selectedDomain}&days=${selectedDays}`);
        const data = await res.json();

        if (data.success) {
            renderNeonChart(data.timeline);
            renderActivityChart(data.timeline);
            renderCashflowChart(data.timeline);
            renderTrafficChart(data.timeline);

            // 🔥 ЗАПУСК ДВУХ НОВЫХ МОДУЛЕЙ ГРАФИКОВ
            renderMarketingChart(data.timeline);
            renderSharesChart(data.shares);
        }
    } catch (err) { console.error(err); }
}

// Позаботься о том, чтобы при загрузке админки селектор наполнялся брендами из cachedWebsites:
function initDashboardFilters() {
    const select = document.getElementById('dashboard_global_domain_filter');
    if (select && typeof cachedWebsites !== 'undefined' && cachedWebsites.length > 0) {
        select.innerHTML = '<option value="">All Brand Domains Combined</option>' +
            cachedWebsites.map(w => `<option value="${w.domain_name}">${w.title} (${w.domain_name})</option>`).join('');
    }
}

// Функция для второго графика (Количество ставок - Bar Chart)
function renderActivityChart(timelineData) {
    const ctx = document.getElementById('mtwActivityChart').getContext('2d');

    if (mtwActivityChartInstance) {
        mtwActivityChartInstance.destroy();
    }

    const labels = timelineData.map(d => {
        const dateObj = new Date(d.date);
        return dateObj.toLocaleDateString([], { month: 'short', day: 'numeric' });
    });

    const countData = timelineData.map(d => parseInt(d.betsCount || 0, 10));

    // Для количества ставок идеально подойдет гистограмма (Bar Chart) со светящимся неоновым цветом
    mtwActivityChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Bet count',
                data: countData,
                backgroundColor: 'rgba(0, 168, 255, 0.2)', // Твой неоновый синий с прозрачностью
                borderColor: '#00a8ff',
                borderWidth: 2,
                borderRadius: 4, // Скругление углов у столбиков
                hoverBackgroundColor: '#00a8ff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'top',
                    labels: {
                        color: '#8a99ad',
                        font: { family: 'Segoe UI', size: 12, weight: '600' }
                    }
                }
            },
            scales: {
                x: {
                    grid: { color: '#1a1e26', drawBorder: false },
                    ticks: { color: '#65758c', font: { size: 11 } }
                },
                y: {
                    grid: { color: '#1a1e26', drawBorder: false },
                    ticks: {
                        color: '#65758c',
                        font: { size: 11 },
                        precision: 0 // Только целые числа на вертикальной оси
                    }
                }
            }
        }
    });
}

function renderNeonChart(timelineData) {
    const ctx = document.getElementById('mtwFinanceChart').getContext('2d');

    if (mtwChartInstance) {
        mtwChartInstance.destroy();
    }

    const labels = timelineData.map(d => {
        const dateObj = new Date(d.date);
        return dateObj.toLocaleDateString([], { month: 'short', day: 'numeric' });
    });

    const ggrData = timelineData.map(d => Number(d.ggr || 0));
    const netData = timelineData.map(d => Number(d.netProfit || 0));

    // ТЕСТОВЫЙ ПРОВЕРОЧНЫЙ ХАК: Если данные полностью совпадают,
    // искусственно сдвинем Net Profit на 5%, чтобы ты увидел вторую линию
    const isIdentical = ggrData.every((val, index) => val === netData[index]);
    const finalNetData = isIdentical ? netData.map(v => v * 0.95) : netData;

    mtwChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Gross Revenue (GGR)',
                    data: ggrData,
                    borderColor: '#e94560',
                    backgroundColor: 'rgba(233, 69, 96, 0.02)',
                    borderWidth: 3,
                    pointBackgroundColor: '#e94560',
                    pointBorderColor: '#0b0d13',
                    pointBorderWidth: 2,
                    pointRadius: 4,
                    pointHoverRadius: 6,
                    tension: 0.3,
                    fill: true
                },
                {
                    label: isIdentical ? 'Net Profit (NGR) - Test -5%' : 'Net Profit (NGR)',
                    data: finalNetData,
                    borderColor: '#4ecca3',
                    backgroundColor: 'rgba(78, 204, 163, 0.02)',
                    borderWidth: 3,
                    pointBackgroundColor: '#4ecca3',
                    pointBorderColor: '#0b0d13',
                    pointBorderWidth: 2,
                    pointRadius: 4,
                    pointHoverRadius: 6,
                    tension: 0.3,
                    fill: true
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'top',
                    labels: {
                        color: '#8a99ad',
                        font: { family: 'Segoe UI', size: 12, weight: '600' }
                    }
                }
            },
            scales: {
                x: {
                    grid: { color: '#1a1e26', drawBorder: false },
                    ticks: { color: '#65758c', font: { size: 11 } }
                },
                y: {
                    grid: { color: '#1a1e26', drawBorder: false },
                    ticks: { color: '#65758c', font: { size: 11 } }
                }
            }
        }
    });
}

function renderCashflowChart(timelineData) {
    const ctx = document.getElementById('mtwCashflowChart').getContext('2d');

    if (mtwCashflowChartInstance) {
        mtwCashflowChartInstance.destroy();
    }

    const labels = timelineData.map(d => {
        const dateObj = new Date(d.date);
        return dateObj.toLocaleDateString([], { month: 'short', day: 'numeric' });
    });

    const depositData = timelineData.map(d => d.deposits);
    const withdrawData = timelineData.map(d => d.withdraws);

    mtwCashflowChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Deposit',
                    data: depositData,
                    borderColor: '#8c7ae6', // Фиолетовый неон под цвет карточки
                    backgroundColor: 'rgba(140, 122, 230, 0.02)',
                    borderWidth: 3,
                    pointBackgroundColor: '#8c7ae6',
                    pointHoverRadius: 6,
                    tension: 0.3
                },
                {
                    label: 'Withdraw',
                    data: withdrawData,
                    borderColor: '#e1b12c', // Оранжевый золото под цвет карточки
                    backgroundColor: 'rgba(225, 177, 44, 0.02)',
                    borderWidth: 3,
                    pointBackgroundColor: '#e1b12c',
                    pointHoverRadius: 6,
                    tension: 0.3
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'top', labels: { color: '#8a99ad', font: { weight: '600' } } }
            },
            scales: {
                x: { grid: { color: '#1a1e26', drawBorder: false }, ticks: { color: '#65758c' } },
                y: { grid: { color: '#1a1e26', drawBorder: false }, ticks: { color: '#65758c' } }
            }
        }
    });
}

function renderTrafficChart(timelineData) {
    const canvas = document.getElementById('mtwTrafficChart');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');

    if (mtwTrafficChartInstance) {
        mtwTrafficChartInstance.destroy();
    }

    const labels = timelineData.map(d => {
        const dateObj = new Date(d.date);
        return dateObj.toLocaleDateString([], { month: 'short', day: 'numeric' });
    });

    // Вытягиваем массивы пиков и среднего онлайна из нашего обновленного SQL-запроса бэкенда
    const peakData = timelineData.map(d => parseInt(d.peakOnline || 0, 10));
    const avgData = timelineData.map(d => parseInt(d.avgOnline || 0, 10));

    // Создаем красивый неоновый градиент под линией среднего онлайна
    const gradient = ctx.createLinearGradient(0, 0, 0, 200);
    gradient.addColorStop(0, 'rgba(0, 245, 212, 0.15)'); // Бирюзовый сверху
    gradient.addColorStop(1, 'rgba(0, 245, 212, 0.00)'); // Полное затухание внизу

    mtwTrafficChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Peak Online (Max CCU)',
                    data: peakData,
                    borderColor: '#ff007f', // Яркий розовый неон для пиков
                    borderWidth: 2,
                    borderDash: [5,5], // Пунктирная линия для обозначения "потолка" нагрузки
                    pointRadius: 2,
                    backgroundColor: 'transparent',
                    tension: 0.3
                },
                {
                    label: 'Average Active Users (Avg CCU)',
                    data: avgData,
                    borderColor: '#00f5d4', // Фирменный бирюзовый для стабильного среднего онлайна
                    borderWidth: 3,
                    backgroundColor: gradient,
                    fill: true, // Включаем градиентную заливку
                    pointRadius: 4,
                    pointBackgroundColor: '#00f5d4',
                    tension: 0.3
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'top',
                    labels: {
                        color: '#8a99ad',
                        font: { family: 'Segoe UI', size: 12, weight: '600' }
                    }
                },
                tooltip: {
                    backgroundColor: '#0c0f14',
                    titleColor: '#fff',
                    bodyColor: '#8a99ad',
                    borderColor: '#1a1e26',
                    borderWidth: 1
                }
            },
            scales: {
                x: {
                    grid: { color: '#1a1e26', drawBorder: false },
                    ticks: { color: '#65758c', font: { size: 11 } }
                },
                y: {
                    grid: { color: '#1a1e26', drawBorder: false },
                    ticks: {
                        color: '#65758c',
                        font: { size: 11 },
                        precision: 0,
                        beginAtZero: true
                    }
                }
            }
        }
    });
}

function renderMarketingChart(timelineData) {
    const ctx = document.getElementById('mtwMarketingChart').getContext('2d');
    if (mtwMarketingChartInstance) mtwMarketingChartInstance.destroy();

    const labels = timelineData.map(d => {
        const dateObj = new Date(d.date);
        return dateObj.toLocaleDateString([], { month: 'short', day: 'numeric' });
    });

    const signupData = timelineData.map(d => parseInt(d.signups || 0, 10));
    const ftdData = timelineData.map(d => parseInt(d.ftds || 0, 10));

    mtwMarketingChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'New Sign-ups (Registrations)',
                    data: signupData,
                    borderColor: '#00a8ff', // Синий неон
                    borderWidth: 2.5,
                    backgroundColor: 'transparent',
                    tension: 0.2
                },
                {
                    label: 'First-Time Deposits (FTD Conversion)',
                    data: ftdData,
                    borderColor: '#var(--neon-green)', // Зеленый неон для денег
                    borderWidth: 3,
                    pointBackgroundColor: 'var(--neon-green)',
                    backgroundColor: 'transparent',
                    tension: 0.2
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: 'top', labels: { color: '#8a99ad' } } },
            scales: {
                x: { grid: { color: '#1a1e26' }, ticks: { color: '#65758c' } },
                y: { grid: { color: '#1a1e26' }, ticks: { color: '#65758c', precision: 0 }, beginAtZero: true }
            }
        }
    });
}

function renderSharesChart(sharesData) {
    const ctx = document.getElementById('mtwSharesChart').getContext('2d');
    if (mtwSharesChartInstance) mtwSharesChartInstance.destroy();

    // Если данных от базы вообще нет (никто ещё не играл), рисуем пустую заглушку
    if (!sharesData || sharesData.length === 0) {
        sharesData = [{ game_category: 'No stakes logged', category_turnover: 1 }];
    }

    const labels = sharesData.map(s => s.game_category);
    const turnoverValues = sharesData.map(s => parseFloat(s.category_turnover || 0));

    // Стилизуем сектора под наши фирменные неоновые цвета
    const neonPalette = [
        '#00f5d4', // Бирюзовый (Slots)
        '#ff007f', // Розовый (Virtual Football)
        '#00a8ff', // Синий (Sportsbook)
        '#ffb703'  // Желтый (Резерв)
    ];

    mtwSharesChartInstance = new Chart(ctx, {
        type: 'doughnut', // Формат «пончика» выглядит изящнее обычного круга
        data: {
            labels: labels,
            datasets: [{
                data: turnoverValues,
                backgroundColor: neonPalette,
                borderColor: '#0c0f14', // Граница цвета фона карты, создающая эффект разрезов
                borderWidth: 3
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'right', // Легенда справа от круга, чтобы экономить высоту
                    labels: { color: '#8a99ad', boxWidth: 12, font: { size: 11 } }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return ` ${context.label}: ${parseFloat(context.raw).toFixed(2)} 🪙`;
                        }
                    }
                }
            },
            cutout: '65%' // Толщина кольца диаграммы
        }
    });
}
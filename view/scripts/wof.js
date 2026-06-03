const SECTORS_WoF = [
    {label: '1', prize: 10},
    {label: '💎 JACKPOT', prize: 200},
    {label: '2', prize: 10},
    {label: 'Empty', prize: 0},
    {label: '3', prize: 10},
    {label: '4', prize: 10},
    {label: '5', prize: 10},
    {label: 'Double', prize: 40},
    {label: '6', prize: 10},
    {label: '7', prize: 10},
];

const SPIN_COST_WoF = 20;
let currentAngle = 0; // Текущий угол поворота колеса в радианах

const canvas = document.getElementById('wheelCanvas');
const ctx = canvas.getContext('2d');

const spinBtnWof = document.getElementById('spinBtnWof');
const msgBoxWof = document.getElementById('msgBoxWof');

const totalSectors = SECTORS_WoF.length;
const arcSize = (2 * Math.PI) / totalSectors; // Угловой размер одного сектора

// Палитра неоновых цветов для секторов
const COLORS = ['#1a1a3a', '#0f3460', '#16213e', '#1f1f45', '#25254d', '#2e2e5c','#1a1a3a', '#0f3460', '#16213e', '#1f1f45', '#25254d', '#2e2e5c'];

if (typeof balanceLabel !== 'undefined' && balanceLabel) {
    balanceLabel.innerText = currentBalance;
}

// 1. Отрисовка колеса на Canvas
function drawWheel() {
    if (!canvas || !ctx) return;
    const center = canvas.width / 2;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (let i = 0; i < totalSectors; i++) {
        const angle = currentAngle + i * arcSize;

        ctx.fillStyle = COLORS[i % COLORS.length];
        ctx.beginPath();
        ctx.moveTo(center, center);
        ctx.arc(center, center, center - 10, angle, angle + arcSize, false);
        ctx.lineTo(center, center);
        ctx.fill();

        ctx.strokeStyle = '#25254d';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.save();
        ctx.fillStyle = SECTORS_WoF[i].prize > 50 ? '#4ecca3' : '#ffffff';
        ctx.font = 'bold 24px Arial';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';

        ctx.translate(center, center);
        ctx.rotate(angle + arcSize / 2);

        ctx.fillText(SECTORS_WoF[i].label, center - 40, 0);
        ctx.restore();
    }

    ctx.beginPath();
    ctx.arc(center, center, 40, 0, 2 * Math.PI, false);
    ctx.fillStyle = '#e94560';
    ctx.shadowBlur = 15;
    ctx.shadowColor = '#e94560';
    ctx.fill();
    ctx.shadowBlur = 0;
}

drawWheel();

// 2. СЕРВЕРНЫЙ ЗАПУСК ВРАЩЕНИЯ С ПЛАВНЫМ ЗАМЕДЛЕНИЕМ
spinBtnWof.onclick = async () => {
    if (isSpinning) return;

    if (!currentUser) {
        msgBoxWof.innerText = "Please login first!";
        msgBoxWof.style.color = "#e94560";
        return;
    }

    if (currentBalance < SPIN_COST_WoF) {
        msgBoxWof.innerText = "Not enough coins!";
        msgBoxWof.style.color = "#e94560";
        return;
    }

    isSpinning = true;
    spinBtnWof.disabled = true;
    msgBoxWof.innerText = "The wheel is spinning...";
    msgBoxWof.style.color = "#8a8ab0";

    try {
        // Запрашиваем результат раунда у сервера Node.js
        const response = await fetch(baseUrlApi + '/wheel/spin', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: currentUser })
        });
        const data = await response.json();

        if (data.error) {
            isSpinning = false;
            spinBtnWof.disabled = false;
            msgBoxWof.innerText = data.error;
            msgBoxWof.style.color = "#e94560";
            return;
        }

        // Сервер прислал точный индекс победного сектора (0-9)
        // Примечание: серверный индекс берется от деления остатка на количество секторов,
        // поэтому бэкенд-логика автоматически подстроится под вашу структуру!
        const winningSectorIndex = data.sectorIndex;
        const serverPrize = data.prize;
        const serverLabel = data.label;

        // Синхронизируем глобальный баланс и джекпот на клиенте
        currentBalance = data.balance;
        jackpot = data.jackpot;

        if (typeof balanceLabel !== 'undefined' && balanceLabel) balanceLabel.innerText = currentBalance;
        if (typeof updateJackpotUI === 'function') updateJackpotUI();

        // Расчет угла остановки колеса под выигрышный сектор
        const stopAngle = calculateStopAngle(winningSectorIndex);
        const spinDuration = 4000;
        const startTimestamp = performance.now();
        const startAngle = currentAngle % (2 * Math.PI);

        function animate(now) {
            const elapsed = now - startTimestamp;
            const progress = Math.min(elapsed / spinDuration, 1);
            const easeOutProgress = 1 - Math.pow(1 - progress, 3);

            currentAngle = startAngle + (stopAngle - startAngle) * easeOutProgress;
            drawWheel();

            if (progress < 1) {
                requestAnimationFrame(animate);
            } else {
                // Колесо остановилось, выводим утвержденные сервером результаты
                onSpinComplete(serverPrize, serverLabel);
            }
        }

        requestAnimationFrame(animate);

    } catch (err) {
        console.error("Wheel error:", err);
        msgBoxWof.innerText = "Server error. Try again.";
        msgBoxWof.style.color = "#e94560";
        isSpinning = false;
        spinBtnWof.disabled = false;
    }
};

function calculateStopAngle(sectorIndex) {
    const extraTurns = (5 + Math.floor(Math.random() * 3)) * 2 * Math.PI;
    const targetAngle = 1.5 * Math.PI - (sectorIndex * arcSize) - (arcSize / 2);
    return extraTurns + targetAngle;
}

// 3. Обработка выигрыша (на базе серверного ответа)
function onSpinComplete(prize, label) {
    isSpinning = false;

    if (prize > 0) {
        msgBoxWof.innerHTML = `🎉 Won: ${label}! +${prize} 🪙`;
        msgBoxWof.style.color = "#4ecca3";
    } else {
        msgBoxWof.innerText = "Better luck next time! ❌";
        msgBoxWof.style.color = "#e94560";
    }

    if (currentBalance >= SPIN_COST_WoF) {
        spinBtnWof.disabled = false;
    } else {
        msgBoxWof.innerText = "GAME OVER! Out of coins.";
        msgBoxWof.style.color = "#e94560";
    }
}



// --- ПЕРЕМЕННЫЕ И ЭЛЕМЕНТЫ SLOTS 5x3 ---
let isSlots53Spinning = false;
let isFreeSpinModeActive = false;
const SPIN_COST_5X3 = 20;
const DEFAULT_SYMBOLS = ['🍒', '🍋', '🍊', '🍇', '🦁', '💎', 'W', 'S'];

const slots53Machine = document.getElementById('slots53Machine');
const slots53SpinBtn = document.getElementById('slots53SpinBtn');
const slots53Msg = document.getElementById('slots53Msg');
const fsBanner = document.getElementById('fsBanner');
const fsCountLabel = document.getElementById('fsCountLabel');

// Структура Paylines (Для графической подсветки линий на клиенте, дублирует серверную)
const CLIENT_PAYLINES = [
    [1, 1, 1, 1, 1], // Линия 1 (Горизонталь по центру)
    [0, 0, 0, 0, 0], // Линия 2 (Горизонталь сверху)
    [2, 2, 2, 2, 2], // Линия 3 (Горизонталь снизу)
    [0, 1, 2, 1, 0], // Линия 4 (Зигзаг вниз)
    [2, 1, 0, 1, 2], // Линия 5 (Зигзаг вверх)
    [0, 0, 1, 2, 2], // Линия 6
    [2, 2, 1, 0, 0], // Линия 7
    [1, 0, 1, 2, 1], // Линия 8
    [1, 2, 1, 0, 1], // Линия 9
    [1, 0, 0, 0, 1], // Линия 10
    [1, 2, 2, 2, 1], // Линия 11
    [0, 1, 1, 1, 0], // Линия 12
    [2, 1, 1, 1, 2], // Линия 13
    [0, 1, 0, 1, 0], // Линия 14
    [2, 1, 2, 1, 2], // Линия 15
    [1, 1, 0, 1, 1], // Линия 16
    [1, 1, 2, 1, 1], // Линия 17
    [0, 0, 2, 0, 0], // Линия 18
    [2, 2, 0, 2, 2], // Линия 19
    [0, 2, 0, 2, 0]  // Линия 20
];


// Первичная генерация сетки 5х3 случайными символами при загрузке страницы
function initSlots53UI() {
    if (!slots53Machine) return;
    slots53Machine.innerHTML = '';

    for (let col = 0; col < 5; col++) {
        const reelDiv = document.createElement('div');
        reelDiv.classList.add('slots53-reel');
        reelDiv.id = `reel53_${col}`;

        for (let row = 0; row < 3; row++) {
            const cellDiv = document.createElement('div');
            cellDiv.classList.add('slots53-cell');
            cellDiv.id = `cell53_${col}_${row}`;
            cellDiv.innerText = DEFAULT_SYMBOLS[Math.floor(Math.random() * DEFAULT_SYMBOLS.length)];
            reelDiv.appendChild(cellDiv);
        }
        slots53Machine.appendChild(reelDiv);
    }
}
initSlots53UI();

// НАЖАТИЕ КНОПКИ SPIN
if (slots53SpinBtn) {
    slots53SpinBtn.onclick = async () => {
        if (isSlots53Spinning) return;

        if (!currentUser) {
            slots53Msg.innerText = "Please login first!";
            slots53Msg.style.color = "#e94560";
            return;
        }

        // Если фриспинов нет, проверяем баланс на обычную ставку
        if (!isFreeSpinModeActive && currentBalance < SPIN_COST_5X3) {
            slots53Msg.innerText = "Not enough coins!";
            slots53Msg.style.color = "#e94560";
            return;
        }

        isSlots53Spinning = true;
        slots53SpinBtn.disabled = true;
        slots53Msg.innerText = "Reels rolling...";
        slots53Msg.style.color = "#8a8ab0";

        // Сбрасываем старую неоновую подсветку линий
        document.querySelectorAll('.slots53-cell').forEach(c => c.classList.remove('highlight'));

        // 1. Запускаем визуальный фейковый скролл символов (эффект вращения)
        const reelIntervals = [];
        for (let col = 0; col < 5; col++) {
            const interval = setInterval(() => {
                for (let row = 0; row < 3; row++) {
                    const cell = document.getElementById(`cell53_${col}_${row}`);
                    if (cell) cell.innerText = DEFAULT_SYMBOLS[Math.floor(Math.random() * DEFAULT_SYMBOLS.length)];
                }
            }, 50 + col * 15); // Чем правее барабан, тем быстрее мелькают иконки
            reelIntervals.push(interval);
        }

        try {
            // Отправляем запрос на сервер Node.js
            const response = await fetch(`${baseUrlApi}/slots5x3/spin`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: currentUser, partnerId: globalPartnerId })
            });
            const data = await response.json();

            if (data.error) {
                reelIntervals.forEach(clearInterval);
                slots53Msg.innerText = data.error;
                slots53Msg.style.color = "#e94560";
                isSlots53Spinning = false;
                slots53SpinBtn.disabled = false;
                return;
            }

            // 2. КАСТКАДНАЯ ОСТАНОВКА БАРАБАНОВ (Слева направо)
            for (let col = 0; col < 5; col++) {
                // Задержка остановки между соседними колонками (400мс)
                await new Promise(resolve => setTimeout(resolve, 400));
                clearInterval(reelIntervals[col]); // Выключаем фейковый перебор для колонки

                // Вставляем точную иконку из матрицы, которую рассчитал сервер
                // Примечание: сервер возвращает matrix[col][row], раскладываем по ячейкам
                for (let row = 0; row < 3; row++) {
                    const cell = document.getElementById(`cell53_${col}_${row}`);
                    if (cell) cell.innerText = data.matrix[col][row];
                }
            }

            // Синхронизируем глобальный баланс и джекпот
            currentBalance = data.balance;
            jackpot = data.jackpot;
            if (typeof updateUIProfile === 'function') updateUIProfile();
            if (typeof updateJackpotUI === 'function') updateJackpotUI();

            // 3. ПОДСВЕТКА ВЫИГРЫШНЫХ ЛИНИЙ И СБОР НАГРАД
            if (data.hitLines && data.hitLines.length > 0) {
                slots53Msg.innerText = `🎉 WIN! Total payout: +${data.totalWin} 🪙 (Hit ${data.hitLines.length} lines!)`;
                slots53Msg.style.color = "#4ecca3";

                // Проходимся по каждой выигравшей линии и красим её ячейки в неон
                data.hitLines.forEach(hit => {
                    const lineTemplate = CLIENT_PAYLINES[hit.lineIndex];
                    // Подсвечиваем только те ячейки, которые участвовали в комбинации (hit.count)
                    for (let col = 0; col < hit.count; col++) {
                        const targetRow = lineTemplate[col];
                        const winningCell = document.getElementById(`cell53_${col}_${targetRow}`);
                        if (winningCell) winningCell.classList.add('highlight');
                    }
                });
            } else {
                slots53Msg.innerText = "No match this spin. Try again!";
                slots53Msg.style.color = "#8a8ab0";
            }

            // 4. КОНТРОЛЬ БОНУСНОГО РЕЖИМА (ФРИСПИНЫ)
            handleFreeSpinsStateUI(data.freeSpins);

        } catch (err) {
            console.error("Slots 5x3 error:", err);
            reelIntervals.forEach(clearInterval);
            slots53Msg.innerText = "Server error. Try again.";
            slots53Msg.style.color = "#e94560";
        }

        isSlots53Spinning = false;
        // Проверяем доступность кнопки для следующего хода
        if (isFreeSpinModeActive || currentBalance >= SPIN_COST_5X3) {
            slots53SpinBtn.disabled = false;
        } else {
            slots53Msg.innerText = "GAME OVER! Out of coins.";
            slots53Msg.style.color = "#e94560";
        }
    };
}

// Управление состояниями Free Spins в интерфейсе
// Управление состояниями Free Spins в интерфейсе (ПОЛНОЕ ИСПРАВЛЕНИЕ БАГА)
function handleFreeSpinsStateUI(fsData) {
    if (!fsData) return;

    // Сценарий А: Игрок только что поймал 3 Скаттера в обычном режиме
    if (fsData.triggered > 0) {
        alert(fsData.message); // Показываем крупное уведомление
        isFreeSpinModeActive = true; // Жестко включаем режим фриспинов
        fsBanner.style.display = "block";
        slots53SpinBtn.classList.add('fs-active'); // Кнопка становится зеленой
    }

    // КЛЮЧЕВОЕ ИСПРАВЛЕНИЕ: Если сервер подтверждает, что мы в режиме фриспинов
    if (fsData.isFreeSpinMode) { // Проверьте имя переменной из JSON бэкенда (data.freeSpins.isFreeSpinMode)
        isFreeSpinModeActive = true;
        fsBanner.style.display = "block";

        // Намертво привязываем счетчик из базы данных к экрану
        fsCountLabel.innerText = fsData.remaining;
        slots53SpinBtn.innerText = `BONUS SPIN (${fsData.remaining})`;
        slots53SpinBtn.classList.add('fs-active');
    } else {
        // Защита: если сервер говорит, что режима фриспинов нет, выключаем флаг
        isFreeSpinModeActive = false;
    }

    // Сценарий Б: Бонусный раунд ПОЛНОСТЬЮ ЗАВЕРШЕН (remaining дошел до 0)
    if (fsData.finished || (isFreeSpinModeActive && fsData.remaining === 0)) {
        alert(`🏆 BONUS ROUND COMPLETED!\nTotal Free Spins win: +${fsData.bonusTotalPrize || fsData.totalWon} 🪙`);

        // Сбрасываем все флаги в исходное состояние
        isFreeSpinModeActive = false;
        fsBanner.style.display = "none";
        slots53SpinBtn.classList.remove('fs-active');
        slots53SpinBtn.innerText = "SPIN";

        slots53Msg.innerText = `Bonus over! Total won: +${fsData.bonusTotalPrize || fsData.totalWon} 🪙`;
        slots53Msg.style.color = "#4ecca3";
    }

    // Автоматически обновляем общую историю действий игрока внизу экрана
    if (typeof loadGeneralHistory === 'function') loadGeneralHistory();
}


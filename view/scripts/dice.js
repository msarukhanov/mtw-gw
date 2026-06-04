// --- ПЕРЕМЕННЫЕ И ЭЛЕМЕНТЫ ИГРЫ DICE ---
let diceCondition = 'under'; // 'under' или 'over'
const DICE_HOUSE_EDGE = 0.04; // 4% маржа дома (соответствует серверной)

const diceResultNum = document.getElementById('diceResultNum');
const diceChanceLabel = document.getElementById('diceChanceLabel');
const diceMultLabel = document.getElementById('diceMultLabel');
const diceTargetLabel = document.getElementById('diceTargetLabel');
const diceTargetInput = document.getElementById('diceTargetInput');
const diceBetInput = document.getElementById('diceBetInput');
const diceRollBtn = document.getElementById('diceRollBtn');
const diceMsg = document.getElementById('diceMsg');

// Функция переключения режима (Roll Over / Roll Under)
window.setDiceCondition = function(mode) {
    if (typeof isSpinning !== 'undefined' && isSpinning) return; // блокировка во время броска

    diceCondition = mode;
    const btnUnder = document.getElementById('diceToggleUnder');
    const btnOver = document.getElementById('diceToggleOver');

    if (mode === 'under') {
        btnUnder.classList.add('active');
        btnOver.classList.remove('active');
        diceTargetLabel.innerText = "Target Number (< X)";
    } else {
        btnOver.classList.add('active');
        btnUnder.classList.remove('active');
        diceTargetLabel.innerText = "Target Number (> X)";
    }
    calculateDiceForecast();
};

// Расчет шансов и множителя на клиенте на лету при изменении настроек
function calculateDiceForecast() {
    if (!diceTargetInput || !diceChanceLabel || !diceMultLabel) return;

    let target = parseInt(diceTargetInput.value);
    if (isNaN(target) || target < 2 || target > 98) return;

    // Расчет выигрышных исходов из 100
    let chance = diceCondition === 'over' ? (100 - target) : (target - 1);

    // Формула множителя: (100 / Шанс) * (1 - маржа)
    let multiplier = (100 / chance) * (1 - DICE_HOUSE_EDGE);

    diceChanceLabel.innerText = `${chance}%`;
    diceMultLabel.innerText = `${multiplier.toFixed(2)}x`;
}

// Слушаем изменения в поле ввода целевого числа
if (diceTargetInput) {
    diceTargetInput.oninput = () => {
        let val = parseInt(diceTargetInput.value);
        if (val < 2) diceTargetInput.value = 2;
        if (val > 98) diceTargetInput.value = 98;
        calculateDiceForecast();
    };
}

// Первичный просчет при загрузке
calculateDiceForecast();

// НАЖАТИЕ КНОПКИ ROLL DICE
if (diceRollBtn) {
    diceRollBtn.onclick = async () => {
        if (!currentUser) {
            diceMsg.innerText = "Please login first!";
            diceMsg.style.color = "#e94560";
            return;
        }

        const bet = parseInt(diceBetInput.value);
        const target = parseInt(diceTargetInput.value);

        if (isNaN(bet) || bet <= 0 || isNaN(target) || target < 2 || target > 98) {
            diceMsg.innerText = "Invalid bet or target number!";
            diceMsg.style.color = "#e94560";
            return;
        }

        if (currentBalance < bet) {
            diceMsg.innerText = "Not enough coins!";
            diceMsg.style.color = "#e94560";
            return;
        }

        // Блокируем интерфейс во время броска костей
        diceRollBtn.disabled = true;
        diceTargetInput.disabled = true;
        diceBetInput.disabled = true;
        diceMsg.innerText = "Rolling...";
        diceMsg.style.color = "#8a8ab0";

        // Мягко сбрасываем старый цвет результата броска
        diceResultNum.className = "dice-result-number";

        try {
            const response = await fetch(baseUrlApi + '/dice/roll', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: currentUser, partnerId: globalPartnerId, target, condition: diceCondition, bet })
            });
            const data = await response.json();

            if (data.error) {
                diceMsg.innerText = data.error;
                diceMsg.style.color = "#e94560";
                diceRollBtn.disabled = false;
                diceTargetInput.disabled = false;
                diceBetInput.disabled = false;
                return;
            }

            // Эффект быстрой прокрутки случайных чисел перед выводом серверного результата
            let ticks = 0;
            const spinInterval = setInterval(() => {
                diceResultNum.innerText = Math.floor(Math.random() * 100) + 1;
                ticks++;

                if (ticks > 8) {
                    clearInterval(spinInterval);

                    // Выводим финальный, утвержденный сервером результат
                    diceResultNum.innerText = data.rollResult;

                    // Обновляем кошелек глобально
                    currentBalance = data.balance;
                    if (typeof updateUIProfile === 'function') updateUIProfile();

                    if (data.isWin) {
                        diceResultNum.classList.add('win');
                        diceMsg.innerText = `🎉 WIN! +${data.prize} 🪙 (${data.multiplier.toFixed(2)}x)`;
                        diceMsg.style.color = "#4ecca3";
                    } else {
                        diceResultNum.classList.add('lose');
                        diceMsg.innerText = `❌ No luck! Lost -${bet} 🪙`;
                        diceMsg.style.color = "#e94560";
                    }

                    // Разблокируем интерфейс для следующего хода
                    diceRollBtn.disabled = false;
                    diceTargetInput.disabled = false;
                    diceBetInput.disabled = false;

                    // Мгновенно обновляем единую ленту истории действий внизу экрана
                    if (typeof loadGeneralHistory === 'function') loadGeneralHistory();
                }
            }, 60);

        } catch (err) {
            console.error("Dice roll error:", err);
            diceMsg.innerText = "Server error. Try again.";
            diceMsg.style.color = "#e94560";
            diceRollBtn.disabled = false;
            diceTargetInput.disabled = false;
            diceBetInput.disabled = false;
        }
    };
}

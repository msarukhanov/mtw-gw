const {gamesConfigDB} = require('./configDB');
const { redisClient } = require('../../redisClient');
const Cache = require('./cacheManager');

function buildReturnedGameData(player) {
    const rootFields = ['id', 'user_id', 'server_id', 'nickname', 'level', 'combat_power', 'resources', 'idle_timestamps'];
    const returnedGameData = {};
    Object.entries(player).forEach(([key, val]) => {
        if (!rootFields.includes(key) && !['gameId', 'deviceId', 'sessionId', 'partnerId', 'username'].includes(key)) {
            returnedGameData[key] = val;
        }
    });
    return returnedGameData;
}

// --- 1. ПОЛУЧЕНИЕ ТЕКУЩЕГО СОСТОЯНИЯ КВЕСТОВ И КАЛЕНДАРЯ (БЕЗ СКРЫТЫХ МУТАЦИЙ) ---
exports.getPlayerQuestsState = async function(userId, serverId, gameId) {
    if (redisClient.isOpen && redisClient.isReady) {
        try {
            let player = await Cache.getPlayer(userId, serverId);
            if (!player) throw new Error("Профиль не найден в Redis");

            let isChanged = false;

            // Прямая инициализация квестов в корень
            if (!player.quests) {
                player.quests = {
                    daily: { points: 0, tasks: {}, claimed_milestones: [] },
                    weekly: { points: 0, tasks: {}, claimed_milestones: [] },
                    last_reset_day: ""
                };
                isChanged = true;
            }

            // Прямая инициализация календаря в корень
            if (!player.daily_login) {
                player.daily_login = {
                    last_claimed_date: "",
                    current_day_idx: 0,
                    is_today_claimed: false
                };
                isChanged = true;
            }

            // Проверка и сброс дня по локальному времени сервера
            const nowStr = new Date().toLocaleDateString('sv-SE');
            if (player.quests.last_reset_day !== nowStr) {
                player.quests.daily = { points: 0, tasks: {}, claimed_milestones: [] };
                player.quests.last_reset_day = nowStr;

                if (player.daily_login.last_claimed_date !== nowStr) {
                    player.daily_login.is_today_claimed = false;
                }
                isChanged = true;
            }

            if (isChanged) {
                await Cache.setPlayer(player);
            }

            return { success: true, quests: player.quests, daily_login: player.daily_login };
        } catch (cacheErr) {
            console.warn('[Quests:GetState] Сбой Redis:', cacheErr);
        }
    }
    return { error: true, message: "Cache subgroup error" };
};


// --- 1. СИСТЕМНЫЙ ИНКРЕМЕНТ СЧЕТЧИКА ТАСКИ ПО ХУКУ ТРИГГЕРА (ДВА ЭШЕЛОНА) ---
exports.incrementQuestTask = async function(userId, serverId, gameId, triggerType, amount) {
    const GameConfig = gamesConfigDB[gameId];
    if (!GameConfig?.quests) return { success: false };

    const activeAmount = parseInt(amount) || 1;

    if (redisClient.isOpen && redisClient.isReady) {
        try {
            let player = await Cache.getPlayer(userId, serverId);
            if (!player) throw new Error("Профиль не найден в Redis");

            // 1. Мягкая инициализация корня квестов
            if (!player.quests) {
                player.quests = {
                    daily: { points: 0, tasks: {}, claimed_milestones: [] },
                    weekly: { points: 0, tasks: {}, claimed_milestones: [] },
                    last_reset_day: ""
                };
            }

            // 2. Проверка сброса дня по локальному времени
            const nowStr = new Date().toLocaleDateString('sv-SE');
            if (player.quests.last_reset_day !== nowStr) {
                player.quests.daily = { points: 0, tasks: {}, claimed_milestones: [] };
                player.quests.last_reset_day = nowStr;
            }

            let isChanged = false;

            // 3. ПРЯМОЙ ИНКРЕМЕНТ DAILY БЕЗ СТРЕЛОЧНЫХ ФУНКЦИЙ (Жестко держим ссылку)
            const dPool = GameConfig.quests.daily?.task_pool || {};
            for (const tKey of Object.keys(dPool)) {
                const taskMeta = dPool[tKey];
                if (taskMeta.type === triggerType) {
                    if (player.quests.daily.tasks[tKey] === undefined) {
                        player.quests.daily.tasks[tKey] = 0;
                    }

                    const currentProgress = player.quests.daily.tasks[tKey];
                    const targetCount = taskMeta.target_count || 1;

                    if (currentProgress < targetCount) {
                        player.quests.daily.tasks[tKey] = Math.min(targetCount, currentProgress + activeAmount);
                        isChanged = true;

                        if (player.quests.daily.tasks[tKey] === targetCount) {
                            player.quests.daily.points += (taskMeta.points_reward || 10);
                        }
                    }
                }
            }

            // 4. ПРЯМОЙ ИНКРЕМЕНТ WEEKLY
            const wPool = GameConfig.quests.weekly?.task_pool || {};
            for (const tKey of Object.keys(wPool)) {
                const taskMeta = wPool[tKey];
                if (taskMeta.type === triggerType) {
                    if (player.quests.weekly.tasks[tKey] === undefined) {
                        player.quests.weekly.tasks[tKey] = 0;
                    }

                    const currentProgress = player.quests.weekly.tasks[tKey];
                    const targetCount = taskMeta.target_count || 1;

                    if (currentProgress < targetCount) {
                        player.quests.weekly.tasks[tKey] = Math.min(targetCount, currentProgress + activeAmount);
                        isChanged = true;

                        if (player.quests.weekly.tasks[tKey] === targetCount) {
                            player.quests.weekly.points += (taskMeta.points_reward || 10);
                        }
                    }
                }
            }

            // 5. Сохраняем реально изменившийся корневой объект player
            if (isChanged) {
                await Cache.setPlayer(player);
            }

            return { success: true, quests: player.quests };
        } catch (cacheErr) {
            console.warn('[Quests:Increment] Ошибка выполнения:', cacheErr);
        }
    }
    return { success: false };
};

// --- 2. СБОР НАГРАД С СУНДУКОВ АКТИВНОСТИ (ДВА ЭШЕЛОНА) ---
// --- 2. СБОР НАГРАД С СУНДУКОВ АКТИВНОСТИ (ПРЯМОЕ ОБНОВЛЕНИЕ КОРНЯ) ---
exports.claimQuestMilestone = async function(userId, serverId, gameId, boardType, milestoneIdx) {
    const GameConfig = gamesConfigDB[gameId];
    const boardConfig = GameConfig?.quests?.[boardType];
    if (!boardConfig) return { error: true, message: "Конфигурация доски заданий не найдена" };
    if (!['daily', 'weekly'].includes(boardType)) return { error: true, message: "Неверный тип доски" };

    const idx = parseInt(milestoneIdx);
    const milestoneMeta = boardConfig.milestones?.[idx];
    if (!milestoneMeta) return { error: true, message: "Заданный сундук не найден в конфиге" };

    const pointsRequired = milestoneMeta.points_required || 0;

    if (redisClient.isOpen && redisClient.isReady) {
        try {
            let player = await Cache.getPlayer(userId, serverId);
            if (!player) throw new Error("Профиль не найден в Redis");

            // Прямая проверка и инициализация базовой структуры
            if (!player.quests) {
                player.quests = {
                    daily: { points: 0, tasks: {}, claimed_milestones: [] },
                    weekly: { points: 0, tasks: {}, claimed_milestones: [] },
                    last_reset_day: ""
                };
            }

            const nowStr = new Date().toLocaleDateString('sv-SE');
            if (player.quests.last_reset_day !== nowStr) {
                player.quests.daily = { points: 0, tasks: {}, claimed_milestones: [] };
                player.quests.last_reset_day = nowStr;
            }

            // Прямая валидация очков и дубликатов сбора
            if (player.quests[boardType].points < pointsRequired) {
                return { error: true, message: `Недостаточно очков активности. Требуется: ${pointsRequired}` };
            }
            if (!player.quests[boardType].claimed_milestones) {
                player.quests[boardType].claimed_milestones = [];
            }
            if (player.quests[boardType].claimed_milestones.includes(idx)) {
                return { error: true, message: "Награда из этого сундука уже собрана" };
            }

            const rewards = milestoneMeta.rewards || {};

            // Начисляем ресурсы прямо в корень объекта player
            if (rewards.resources) {
                if (!player.resources) player.resources = {};
                for (const [resKey, resVal] of Object.entries(rewards.resources)) {
                    player.resources[resKey] = (parseInt(player.resources[resKey]) || 0) + resVal;
                }
            }

            // Начисляем предметы прямо в корень объекта player
            if (rewards.items) {
                if (!player.inventory) player.inventory = {};
                for (const item of rewards.items) {
                    player.inventory[item.itemId] = (parseInt(player.inventory[item.itemId]) || 0) + item.amount;
                }
            }

            // Фиксируем индекс собранного сундука прямо в массив
            player.quests[boardType].claimed_milestones.push(idx);

            await Cache.setPlayer(player);

            return { success: true, quests: player.quests, game_data: buildReturnedGameData(player) };
        } catch (cacheErr) {
            console.warn('[Quests:Claim] Сбой Redis:', cacheErr);
        }
    }
    return { error: true, message: "Cache subsystem offline" };
};

// --- 4. ЗАБОР НАГРАДЫ ЗА ЕЖЕДНЕВНЫЙ ВХОД (DAILY LOGIN) ---
// --- 3. ЗАБОР НАГРАДЫ ЗА ЕЖЕДНЕВНЫЙ ВХОД (DAILY LOGIN — ПРЯМОЕ ОБНОВЛЕНИЕ КОРНЯ) ---
exports.claimDailyLoginReward = async function(userId, serverId, gameId, calendarId) {
    const GameConfig = gamesConfigDB[gameId];
    const calendarConfig = GameConfig?.quests?.daily_login_calendars?.[calendarId];
    if (!calendarConfig) return { error: true, message: "Конфигурация календаря входа не найдена" };

    if (redisClient.isOpen && redisClient.isReady) {
        try {
            let player = await Cache.getPlayer(userId, serverId);
            if (!player) throw new Error("Профиль не найден в Redis");

            // Прямая инициализация базовых структур в корень, если их нет
            if (!player.quests) {
                player.quests = {
                    daily: { points: 0, tasks: {}, claimed_milestones: [] },
                    weekly: { points: 0, tasks: {}, claimed_milestones: [] },
                    last_reset_day: ""
                };
            }
            if (!player.daily_login) {
                player.daily_login = {
                    last_claimed_date: "",
                    current_day_idx: 0,
                    is_today_claimed: false
                };
            }

            // Мягкая синхронизация дат по локальному времени сервера
            const nowStr = new Date().toLocaleDateString('sv-SE');
            if (player.quests.last_reset_day !== nowStr) {
                player.quests.daily = { points: 0, tasks: {}, claimed_milestones: [] };
                player.quests.last_reset_day = nowStr;

                if (player.daily_login.last_claimed_date !== nowStr) {
                    player.daily_login.is_today_claimed = false;
                }
            }

            // Валидация возможности забрать награду
            if (player.daily_login.is_today_claimed) {
                return { error: true, message: "Сегодня награда за вход уже собрана" };
            }

            const currentDayIdx = player.daily_login.current_day_idx;
            const dayNode = calendarConfig.rewards?.[currentDayIdx];
            if (!dayNode) {
                return { error: true, message: "Награда для текущего дня отсутствует в сетке" };
            }

            // Прямое начисление ресурсов в корень player.resources
            if (dayNode.resources) {
                if (!player.resources) player.resources = {};
                for (const [resKey, resVal] of Object.entries(dayNode.resources)) {
                    player.resources[resKey] = (parseInt(player.resources[resKey]) || 0) + resVal;
                }
            }

            // Прямое начисление предметов в корень player.inventory
            if (dayNode.items) {
                if (!player.inventory) player.inventory = {};
                for (const item of dayNode.items) {
                    player.inventory[item.itemId] = (parseInt(player.inventory[item.itemId]) || 0) + item.amount;
                }
            }

            // Фиксируем дату сбора и блокируем повторный клик на сегодня
            player.daily_login.last_claimed_date = nowStr;
            player.daily_login.is_today_claimed = true;

            // Инкрементируем день. При достижении капа (например, 30 дней) — сбрасываем круг на 0
            const totalDaysInConfig = calendarConfig.rewards?.length || 30;
            player.daily_login.current_day_idx = (currentDayIdx + 1) % totalDaysInConfig;

            await Cache.setPlayer(player);

            return { success: true, daily_login: player.daily_login, game_data: buildReturnedGameData(player) };
        } catch (cacheErr) {
            console.warn('[DailyLogin] Сбой Redis:', cacheErr);
        }
    }
    return { error: true, message: "Cache layer offline" };
};






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

// --- 1. НАЧИСЛЕНИЕ ОПЫТА БАТТЛПАССА (ДОБАВЛЕНИЕ ТОКЕНОВ ОПЫТА) ---
exports.addBattlePassExp = async function(userId, serverId, gameId, bpId, amount) {
    const GameConfig = gamesConfigDB[gameId];
    const bpMeta = GameConfig?.battle_passes?.[bpId];
    if (!bpMeta) return { error: true, message: "Конфигурация Баттлпасса не найдена" };

    const pointsPerLevel = bpMeta.points_per_level || 100;
    const maxLevelsLimit = bpMeta.max_levels || 50;
    const activeAmount = parseInt(amount) || 0;

    // ------------------------------------------------------------------------
    // ЭШЕЛОН 1: ОПЕРАЦИЯ В ОПЕРАТИВНОЙ ПАМЯТИ REDIS (ТВОЙ ШАБЛОН)
    // ------------------------------------------------------------------------
    if (redisClient.isOpen && redisClient.isReady) {
        try {
            let player = await Cache.getPlayer(userId, serverId);
            if (!player) throw new Error("Профиль не найден в Redis");

            if (!player.battle_passes) player.battle_passes = {};
            if (!player.battle_passes[bpId]) {
                player.battle_passes[bpId] = { level: 1, exp: 0, claimed_free: [], claimed_premium: [], is_premium_unlocked: false };
            }

            let bpState = player.battle_passes[bpId];
            if (bpState.level >= maxLevelsLimit) {
                return { success: true, battle_passes: player.battle_passes, message: "Максимальный уровень уже достигнут" };
            }

            // Начисляем опыт и рассчитываем линейный или нелинейный левелап циклом
            bpState.exp += activeAmount;
            while (bpState.exp >= pointsPerLevel && bpState.level < maxLevelsLimit) {
                bpState.exp -= pointsPerLevel;
                bpState.level += 1;
            }

            // Избыточный опыт на капе просто сгорает
            if (bpState.level >= maxLevelsLimit) bpState.exp = 0;

            await Cache.setPlayer(player);

            return { success: true, battle_passes: player.battle_passes, game_data: buildReturnedGameData(player) };
        } catch (cacheErr) {
            console.warn('[BP:AddExp] Сбой Redis, проваливаюсь в Postgres Fallback:', cacheErr);
        }
    }

    // НАЧАЛО ЭШЕЛОНА 2
    const client = await global.pool.connect();
    try {
        await client.query('BEGIN');
        const { rows } = await client.query(`SELECT game_data FROM player_server_profiles WHERE id = $1 AND server_id = $2 FOR UPDATE;`, [userId, serverId]);
        if (rows.length === 0) throw new Error("Профиль не найден");

        let gameData = rows[0].game_data || {};
        if (!gameData.battle_passes) gameData.battle_passes = {};
        if (!gameData.battle_passes[bpId]) {
            gameData.battle_passes[bpId] = { level: 1, exp: 0, claimed_free: [], claimed_premium: [], is_premium_unlocked: false };
        }

        let bpState = gameData.battle_passes[bpId];
        if (bpState.level < maxLevelsLimit) {
            bpState.exp += activeAmount;
            while (bpState.exp >= pointsPerLevel && bpState.level < maxLevelsLimit) {
                bpState.exp -= pointsPerLevel;
                bpState.level += 1;
            }
            if (bpState.level >= maxLevelsLimit) bpState.exp = 0;
        }

        await client.query(`UPDATE player_server_profiles SET game_data = $3 WHERE id = $1 AND server_id = $2;`, [userId, serverId, JSON.stringify(gameData)]);
        await client.query('COMMIT');

        return { success: true, battle_passes: gameData.battle_passes, game_data: gameData };
    } catch (e) { await client.query('ROLLBACK'); return { error: true, message: e.message }; } finally { client.release(); }
};

// --- 2. АКТИВАЦИЯ ПРЕМИУМ ДОРОЖКИ БП ---
exports.unlockPremiumTrack = async function(userId, serverId, gameId, bpId) {
    const GameConfig = gamesConfigDB[gameId];
    const bpMeta = GameConfig?.battle_passes?.[bpId];
    if (!bpMeta) return { error: true, message: "Конфигурация не найдена" };

    const costResource = bpMeta.premium_unlock_cost?.resource || "diamond";
    const costAmount = bpMeta.premium_unlock_cost?.amount || 1000;

    // Предотвращаем бесплатную активацию платных БП через обычный эндпоинт
    if (costResource === 'usd') {
        return { error: true, message: "Прямая покупка невозможна, требуется верификация платежа" };
    }

    if (redisClient.isOpen && redisClient.isReady) {
        try {
            let player = await Cache.getPlayer(userId, serverId);
            if (!player) throw new Error("Профиль не найден в Redis");

            if (!player.battle_passes) player.battle_passes = {};
            if (!player.battle_passes[bpId]) {
                player.battle_passes[bpId] = { level: 1, exp: 0, claimed_free: [], claimed_premium: [], is_premium_unlocked: false };
            }

            let bpState = player.battle_passes[bpId];
            if (bpState.is_premium_unlocked) return { error: true, message: "Премиум уже разблокирован" };

            if ((parseInt(player.resources?.[costResource]) || 0) < costAmount) {
                return { error: true, message: "Недостаточно ресурсов" };
            }
            player.resources[costResource] -= costAmount;
            bpState.is_premium_unlocked = true;

            await Cache.setPlayer(player);

            return { success: true, battle_passes: player.battle_passes, game_data: buildReturnedGameData(player), resources: player.resources };
        } catch (cacheErr) {
            console.warn('[BP:UnlockPremium] Сбой Redis, проваливаюсь в Postgres Fallback:', cacheErr);
        }
    }

    // ЭШЕЛОН 2: ФОЛЛБЭК НА ПОСТГРЕС
    const client = await global.pool.connect();
    try {
        await client.query('BEGIN');
        const { rows } = await client.query(`SELECT game_data FROM player_server_profiles WHERE id = $1 AND server_id = $2 FOR UPDATE;`, [userId, serverId]);
        if (rows.length === 0) throw new Error("Профиль не найден");

        let gameData = rows[0].game_data || {};
        if (!gameData.battle_passes) gameData.battle_passes = {};
        if (!gameData.battle_passes[bpId]) {
            gameData.battle_passes[bpId] = { level: 1, exp: 0, claimed_free: [], claimed_premium: [], is_premium_unlocked: false };
        }

        let bpState = gameData.battle_passes[bpId];
        if (bpState.is_premium_unlocked) {
            await client.query('ROLLBACK');
            return { error: true, message: "Премиум уже разблокирован" };
        }

        if ((parseInt(gameData.resources?.[costResource]) || 0) < costAmount) {
            await client.query('ROLLBACK');
            return { error: true, message: "Недостаточно ресурсов" };
        }
        gameData.resources[costResource] -= costAmount;
        bpState.is_premium_unlocked = true;

        await client.query(`UPDATE player_server_profiles SET game_data = $3 WHERE id = $1 AND server_id = $2;`, [userId, serverId, JSON.stringify(gameData)]);
        await client.query('COMMIT');

        return { success: true, battle_passes: gameData.battle_passes, game_data: buildReturnedGameData(gameData), resources: gameData.resources };
    } catch (e) {
        await client.query('ROLLBACK');
        return { error: true, message: e.message };
    } finally {
        client.release();
    }
};

// --- 3. СБОР НАГРАД С ДОРОЖЕК БП ---
exports.claimBattlePassReward = async function(userId, serverId, gameId, bpId, targetLevel, trackType) {
    const GameConfig = gamesConfigDB[gameId];
    const bpMeta = GameConfig?.battle_passes?.[bpId];
    if (!bpMeta) return { error: true, message: "Конфигурация не найдена" };

    if (!['free', 'premium'].includes(trackType)) return { error: true, message: "Неверный тип дорожки" };

    const numericLevel = parseInt(targetLevel);
    const levelNode = bpMeta.levels_matrix?.find(l => l.level === numericLevel);
    if (!levelNode) return { error: true, message: "Уровень наград не найден в конфиге" };

    if (redisClient.isOpen && redisClient.isReady) {
        try {
            let player = await Cache.getPlayer(userId, serverId);
            if (!player) throw new Error("Профиль не найден в Redis");

            let bpState = player.battle_passes?.[bpId];
            if (!bpState || bpState.level < numericLevel) return { error: true, message: "Уровень БП слишком мал" };

            if (trackType === 'premium' && !bpState.is_premium_unlocked) {
                return { error: true, message: "Требуется разблокировать Премиум дорожку" };
            }

            const claimedArray = trackType === 'free' ? bpState.claimed_free : bpState.claimed_premium;
            if (claimedArray.includes(numericLevel)) return { error: true, message: "Награда уже собрана" };

            const rewards = trackType === 'free' ? levelNode.free_rewards : levelNode.premium_rewards;
            if (!rewards) return { error: true, message: "Награды для этого уровня пусты" };

            // Начисление наград (ресурсы)
            if (rewards.resources) {
                Object.entries(rewards.resources).forEach(([resKey, resVal]) => {
                    player.resources[resKey] = (parseInt(player.resources[resKey]) || 0) + resVal;
                });
            }
            // Начисление наград (предметы)
            if (rewards.items) {
                if (!player.inventory) player.inventory = {};
                rewards.items.forEach(item => {
                    player.inventory[item.itemId] = (parseInt(player.inventory[item.itemId]) || 0) + item.amount;
                });
            }
            // Начисление наград (скины)
            if (rewards.skins) {
                if (!player.heroesState) player.heroesState = {};
                if (!player.heroesState.unlocked_skins) player.heroesState.unlocked_skins = [];
                rewards.skins.forEach(s => {
                    if (!player.heroesState.unlocked_skins.includes(s.skin_id)) {
                        player.heroesState.unlocked_skins.push(s.skin_id);
                    }
                });
            }

            claimedArray.push(numericLevel);
            await Cache.setPlayer(player);

            return { success: true, battle_passes: player.battle_passes, game_data: buildReturnedGameData(player), resources: player.resources };
        } catch (cacheErr) {
            console.warn('[BP:ClaimReward] Сбой Redis, проваливаюсь в Postgres Fallback:', cacheErr);
        }
    }

    // ЭШЕЛОН 2: ФОЛЛБЭК НА ПОСТГРЕС
    const client = await global.pool.connect();
    try {
        await client.query('BEGIN');
        const { rows } = await client.query(`SELECT game_data FROM player_server_profiles WHERE id = $1 AND server_id = $2 FOR UPDATE;`, [userId, serverId]);
        if (rows.length === 0) throw new Error("Профиль не найден");

        let gameData = rows[0].game_data || {};
        let bpState = gameData.battle_passes?.[bpId];
        if (!bpState || bpState.level < numericLevel) {
            await client.query('ROLLBACK');
            return { error: true, message: "Уровень БП слишком мал" };
        }

        if (trackType === 'premium' && !bpState.is_premium_unlocked) {
            await client.query('ROLLBACK');
            return { error: true, message: "Требуется разблокировать Премиум дорожку" };
        }

        const claimedArray = trackType === 'free' ? bpState.claimed_free : bpState.claimed_premium;
        if (claimedArray.includes(numericLevel)) {
            await client.query('ROLLBACK');
            return { error: true, message: "Награда уже собрана" };
        }

        const rewards = trackType === 'free' ? levelNode.free_rewards : levelNode.premium_rewards;
        if (!rewards) {
            await client.query('ROLLBACK');
            return { error: true, message: "Награды для этого уровня пусты" };
        }

        if (rewards.resources) {
            Object.entries(rewards.resources).forEach(([resKey, resVal]) => {
                gameData.resources[resKey] = (parseInt(gameData.resources[resKey]) || 0) + resVal;
            });
        }
        if (rewards.items) {
            if (!gameData.inventory) gameData.inventory = {};
            rewards.items.forEach(item => {
                gameData.inventory[item.itemId] = (parseInt(gameData.inventory[item.itemId]) || 0) + item.amount;
            });
        }
        if (rewards.skins) {
            if (!gameData.heroesState) gameData.heroesState = {};
            if (!gameData.heroesState.unlocked_skins) gameData.heroesState.unlocked_skins = [];
            rewards.skins.forEach(s => {
                if (!gameData.heroesState.unlocked_skins.includes(s.skin_id)) {
                    gameData.heroesState.unlocked_skins.push(s.skin_id);
                }
            });
        }

        claimedArray.push(numericLevel);

        await client.query(`UPDATE player_server_profiles SET game_data = $3 WHERE id = $1 AND server_id = $2;`, [userId, serverId, JSON.stringify(gameData)]);
        await client.query('COMMIT');

        return { success: true, battle_passes: gameData.battle_passes, game_data: buildReturnedGameData(gameData), resources: gameData.resources };
    } catch (e) {
        await client.query('ROLLBACK');
        return { error: true, message: e.message };
    } finally {
        client.release();
    }
};

exports.claimAllBattlePassRewards = async function(userId, serverId, gameId, bpId) {
    const GameConfig = gamesConfigDB[gameId];
    const bpMeta = GameConfig?.battle_passes?.[bpId];
    if (!bpMeta) return { error: true, message: "Конфигурация не найдена" };

    // ------------------------------------------------------------------------
    // ЭШЕЛОН 1: ОПЕРАЦИЯ В ОПЕРАТИВНОЙ ПАМЯТИ REDIS
    // ------------------------------------------------------------------------
    if (redisClient.isOpen && redisClient.isReady) {
        try {
            let player = await Cache.getPlayer(userId, serverId);
            if (!player) throw new Error("Профиль не найден в Redis");

            let bpState = player.battle_passes?.[bpId];
            if (!bpState) return { error: true, message: "Прогресс БП не найден" };

            const currentLevel = bpState.level;
            const isPremium = bpState.is_premium_unlocked;

            let totalResources = {};
            let totalItems = {};
            let totalSkins = [];
            let rewardedLevelsFree = [];
            let rewardedLevelsPremium = [];

            bpMeta.levels_matrix?.forEach(node => {
                const lvl = parseInt(node.level);
                if (lvl > currentLevel) return;

                if (node.free_rewards && !bpState.claimed_free.includes(lvl)) {
                    rewardedLevelsFree.push(lvl);
                    if (node.free_rewards.resources) {
                        Object.entries(node.free_rewards.resources).forEach(([k, v]) => {
                            totalResources[k] = (totalResources[k] || 0) + v;
                        });
                    }
                    if (node.free_rewards.items) {
                        node.free_rewards.items.forEach(i => {
                            totalItems[i.itemId] = (totalItems[i.itemId] || 0) + i.amount;
                        });
                    }
                }

                if (isPremium && node.premium_rewards && !bpState.claimed_premium.includes(lvl)) {
                    rewardedLevelsPremium.push(lvl);
                    if (node.premium_rewards.resources) {
                        Object.entries(node.premium_rewards.resources).forEach(([k, v]) => {
                            totalResources[k] = (totalResources[k] || 0) + v;
                        });
                    }
                    if (node.premium_rewards.items) {
                        node.premium_rewards.items.forEach(i => {
                            totalItems[i.itemId] = (totalItems[i.itemId] || 0) + i.amount;
                        });
                    }
                    if (node.premium_rewards.skins) {
                        node.premium_rewards.skins.forEach(s => {
                            if (!totalSkins.includes(s.skin_id)) totalSkins.push(s.skin_id);
                        });
                    }
                }
            });

            if (rewardedLevelsFree.length === 0 && rewardedLevelsPremium.length === 0) {
                return { error: true, message: "Нет доступных наград для сбора" };
            }

            Object.entries(totalResources).forEach(([k, v]) => {
                player.resources[k] = (parseInt(player.resources[k]) || 0) + v;
            });

            if (Object.keys(totalItems).length > 0) {
                if (!player.inventory) player.inventory = {};
                Object.entries(totalItems).forEach(([k, v]) => {
                    player.inventory[k] = (parseInt(player.inventory[k]) || 0) + v;
                });
            }

            if (totalSkins.length > 0) {
                if (!player.heroesState) player.heroesState = {};
                if (!player.heroesState.unlocked_skins) player.heroesState.unlocked_skins = [];
                totalSkins.forEach(skinId => {
                    if (!player.heroesState.unlocked_skins.includes(skinId)) {
                        player.heroesState.unlocked_skins.push(skinId);
                    }
                });
            }

            bpState.claimed_free = [...bpState.claimed_free, ...rewardedLevelsFree];
            bpState.claimed_premium = [...bpState.claimed_premium, ...rewardedLevelsPremium];

            await Cache.setPlayer(player);

            return {
                success: true,
                battle_passes: player.battle_passes,
                game_data: buildReturnedGameData(player),
                resources: player.resources
            };
        } catch (cacheErr) {
            console.warn('[BP:ClaimAll] Сбой Redis, проваливаюсь в Postgres Fallback:', cacheErr);
        }
    }

    // ------------------------------------------------------------------------
    // ЭШЕЛОН 2: ФОЛЛБЭК НА POSTGRESQL (ДЛЯ НАДЕЖНОСТИ ПРИ СБОЕ КЭША)
    // ------------------------------------------------------------------------
    const client = await global.pool.connect();
    try {
        await client.query('BEGIN');
        const { rows } = await client.query(`SELECT game_data FROM player_server_profiles WHERE id = $1 AND server_id = $2 FOR UPDATE;`, [userId, serverId]);
        if (rows.length === 0) throw new Error("Профиль не найден");

        let gameData = rows[0].game_data || {};
        let bpState = gameData.battle_passes?.[bpId];
        if (!bpState) {
            await client.query('ROLLBACK');
            return { error: true, message: "Прогресс БП не найден" };
        }

        const currentLevel = bpState.level;
        const isPremium = bpState.is_premium_unlocked;

        let totalResources = {};
        let totalItems = {};
        let totalSkins = [];
        let rewardedLevelsFree = [];
        let rewardedLevelsPremium = [];

        bpMeta.levels_matrix?.forEach(node => {
            const lvl = parseInt(node.level);
            if (lvl > currentLevel) return;

            if (node.free_rewards && !bpState.claimed_free.includes(lvl)) {
                rewardedLevelsFree.push(lvl);
                if (node.free_rewards.resources) {
                    Object.entries(node.free_rewards.resources).forEach(([k, v]) => {
                        totalResources[k] = (totalResources[k] || 0) + v;
                    });
                }
                if (node.free_rewards.items) {
                    node.free_rewards.items.forEach(i => {
                        totalItems[i.itemId] = (totalItems[i.itemId] || 0) + i.amount;
                    });
                }
            }

            if (isPremium && node.premium_rewards && !bpState.claimed_premium.includes(lvl)) {
                rewardedLevelsPremium.push(lvl);
                if (node.premium_rewards.resources) {
                    Object.entries(node.premium_rewards.resources).forEach(([k, v]) => {
                        totalResources[k] = (totalResources[k] || 0) + v;
                    });
                }
                if (node.premium_rewards.items) {
                    node.premium_rewards.items.forEach(i => {
                        totalItems[i.itemId] = (totalItems[i.itemId] || 0) + i.amount;
                    });
                }
                if (node.premium_rewards.skins) {
                    node.premium_rewards.skins.forEach(s => {
                        if (!totalSkins.includes(s.skin_id)) totalSkins.push(s.skin_id);
                    });
                }
            }
        });

        if (rewardedLevelsFree.length === 0 && rewardedLevelsPremium.length === 0) {
            await client.query('ROLLBACK');
            return { error: true, message: "Нет доступных наград для сбора" };
        }

        if (!gameData.resources) gameData.resources = {};
        Object.entries(totalResources).forEach(([k, v]) => {
            gameData.resources[k] = (parseInt(gameData.resources[k]) || 0) + v;
        });

        if (Object.keys(totalItems).length > 0) {
            if (!gameData.inventory) gameData.inventory = {};
            Object.entries(totalItems).forEach(([k, v]) => {
                gameData.inventory[k] = (parseInt(gameData.inventory[k]) || 0) + v;
            });
        }

        if (totalSkins.length > 0) {
            if (!gameData.heroesState) gameData.heroesState = {};
            if (!gameData.heroesState.unlocked_skins) gameData.heroesState.unlocked_skins = [];
            totalSkins.forEach(skinId => {
                if (!gameData.heroesState.unlocked_skins.includes(skinId)) {
                    gameData.heroesState.unlocked_skins.push(skinId);
                }
            });
        }

        bpState.claimed_free = [...bpState.claimed_free, ...rewardedLevelsFree];
        bpState.claimed_premium = [...bpState.claimed_premium, ...rewardedLevelsPremium];

        await client.query(`UPDATE player_server_profiles SET game_data = $3 WHERE id = $1 AND server_id = $2;`, [userId, serverId, JSON.stringify(gameData)]);
        await client.query('COMMIT');

        return {
            success: true,
            battle_passes: gameData.battle_passes,
            game_data: buildReturnedGameData(gameData),
            resources: gameData.resources
        };
    } catch (e) {
        await client.query('ROLLBACK');
        return { error: true, message: e.message };
    } finally {
        client.release();
    }
};



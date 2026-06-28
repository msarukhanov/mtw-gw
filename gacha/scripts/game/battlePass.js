import { Game } from '../../stateManager.js';
import {t, getWindowContentStyle} from "../../shared.js";
import {sendSocket} from "../../socket.js";

export const BattlePassState = {
    activeBpId: null
};

function formatRewardsText(rewards) {
    if (!rewards) return t('bp_empty_slot');
    const parts = [];
    if (rewards.resources) {
        Object.entries(rewards.resources).forEach(([key, val]) => {
            parts.push(`${val} ${t(`res_${key}`, key)}`);
        });
    }
    if (rewards.items) {
        rewards.items.forEach(i => {
            parts.push(`${i.amount}x ${t(`item_${i.itemId}`, i.itemId)}`);
        });
    }
    if (rewards.skins) {
        rewards.skins.forEach(s => {
            parts.push(t('bp_skin_reward', { skin: s.skin_id }));
        });
    }
    return parts.length > 0 ? parts.join(', ') : t('bp_empty_slot');
}

export function getBattlePassHTML() {
    const orientation = Game.config.orientation || 'landscape';
    const screenSettings = Game.config?.ui?.[orientation]?.find(w => w.id === 'screen_battle_pass') || {};
    const listSettings = screenSettings.list_settings || {};

    const sidebarWidth = listSettings.sidebar_width || "220px";
    const headerHeight = listSettings.header_height || "40px";
    const headerBg = listSettings.header_background || "#121212";

    const bpCatalog = Game.config?.battle_passes || {};
    const playerBpStateAll = Game.battle_passes || {};

    if (!BattlePassState.activeBpId && Object.keys(bpCatalog).length > 0) {
        BattlePassState.activeBpId = Object.keys(bpCatalog)[0];
    }

    const currentBpId = BattlePassState.activeBpId;
    const bpMeta = bpCatalog[currentBpId] || {};
    const playerBpState = playerBpStateAll[currentBpId] || { level: 1, exp: 0, claimed_free: [], claimed_premium: [], is_premium_unlocked: false };
    // 1. САЙДБАР СЕЗОНОВ
    const sidebarHTML = `
        <div class="bp-sidebar" style="display: flex; flex-direction: column; border-right: 1px solid #252525; padding: 10px; box-sizing: border-box; height: 100%; width: ${sidebarWidth}; flex-shrink: 0; background: #141414; gap: 10px; pointer-events: auto;">
            <div style="font-size: 11px; color: #555; font-weight: bold; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 4px;">
                ${t('bp_seasons_catalog')}
            </div>
            ${Object.keys(bpCatalog).map(id => {
        const isActive = id === currentBpId;
        const meta = bpCatalog[id];
        const pState = playerBpStateAll[id] || { level: 1 };
        return `
                    <div class="bp-season-btn" data-bpid="${id}" style="width: 100%; height: 44px; background: ${isActive ? 'linear-gradient(135deg, #1b263b, #111)' : '#0c0c0c'}; border: 1px solid ${isActive ? '#2196f3' : '#222'}; border-radius: 6px; padding: 0 12px; box-sizing: border-box; cursor: pointer; display: flex; flex-direction: column; justify-content: center; text-align: left; transition: all 0.2s;">
                        <b style="font-size: 12px; color: ${isActive ? '#2196f3' : '#aaa'}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                            ${meta.title_loc?.[Game.config.default_lang || 'en'] || id}
                        </b>
                        <span style="font-size: 9px; color: #555; font-family: monospace;">${t('bp_your_level')}: ${pState.level}</span>
                    </div>
                `;
    }).join('')}
        </div>
    `;

    // 2. ИНФО-ПАНЕЛЬ
    const pointsPerLevel = bpMeta.points_per_level || 100;
    const progressPercent = Math.min(100, ((playerBpState.exp / pointsPerLevel) * 100));
    const costResource = bpMeta.premium_unlock_cost?.resource || "diamond";
    const costAmount = bpMeta.premium_unlock_cost?.amount || 1000;

    const resourceName = costResource === 'usd' ? 'USD' : t(`res_${costResource}`, costResource);
    const priceText = costResource === 'usd' ? `$${costAmount}` : `${costAmount} ${resourceName}`;

    const infoPanelHTML = `
        <div style="width: 100%; background: #111; border: 1px solid #1f1f1f; border-radius: 8px; padding: 12px; box-sizing: border-box; display: flex; align-items: center; justify-content: space-between; gap: 15px; margin-bottom: 12px;">
            <div style="display: flex; flex-direction: column; gap: 4px; text-align: left; flex: 1;">
                <div style="display: flex; align-items: center; gap: 10px;">
                    <span style="font-size: 18px; font-weight: bold; color: #ffcc00; font-family: 'Impact', sans-serif;">LVL ${playerBpState.level}</span>
                    <span style="font-size: 11px; color: #fff; font-weight: bold;">${bpMeta.title_loc?.[Game.config.default_lang || 'en'] || 'Season Pass'}</span>
                </div>
                <div style="width: 100%; max-width: 360px; height: 12px; background: #050505; border: 1px solid #222; border-radius: 6px; overflow: hidden; position: relative; margin-top: 4px;">
                    <div style="width: ${progressPercent}%; height: 100%; background: linear-gradient(90deg, #2196f3, #64dfdf); border-radius: 6px;"></div>
                    <span style="position: absolute; width: 100%; text-align: center; font-size: 9px; font-family: monospace; color: #fff; top: 0; line-height: 12px; font-weight: bold;">
                        ${playerBpState.exp} / ${pointsPerLevel} XP
                    </span>
                </div>
            </div>
            <div style="display: flex; gap: 8px; align-items: center;">
                <button id="bp-btn-claim-all" data-bpid="${currentBpId}" style="background: #222; border: 1px solid #4ecca3; color: #4ecca3; padding: 8px 14px; font-size: 11px; font-weight: bold; border-radius: 4px; cursor: pointer;">
                    📥 ${t('bp_btn_claim_all')}
                </button>

                ${playerBpState.is_premium_unlocked ? `
                    <div style="background: rgba(255,204,0,0.1); border: 1px solid #ffcc00; color: #ffcc00; padding: 6px 14px; font-size: 11px; font-weight: bold; border-radius: 4px; font-family: monospace;">👑 ${t('bp_premium_active')}</div>
                ` : `
                    <button id="bp-btn-unlock-premium" data-bpid="${currentBpId}" style="background: linear-gradient(135deg, #ffcc00, #b38f00); border: none; color: #12122c; padding: 8px 16px; font-size: 11px; font-weight: bold; border-radius: 4px; cursor: pointer; display: flex; align-items: center; gap: 6px;">
                        👑 ${t('bp_unlock_premium')} (${priceText})
                    </button>
                `}
            </div>
        </div>
    `;
    // 3. МАТРИЦА НАГРАД
    const levelsMatrix = bpMeta.levels_matrix || [];
    levelsMatrix.sort((a, b) => (a.level || 0) - (b.level || 0));

    const matrixHTML = levelsMatrix.length === 0 ? `
        <div style="margin: auto; color: #444; font-size: 12px; font-style: italic;">${t('bp_no_levels')}</div>
    ` : levelsMatrix.map(row => {
        const lvl = row.level || 1;
        const isLvlReached = playerBpState.level >= lvl;

        const hasFree = row.free_rewards && (Object.keys(row.free_rewards.resources || {}).length > 0 || row.free_rewards.items?.length > 0);
        const isFreeClaimed = playerBpState.claimed_free?.includes(lvl);

        let freeBtnHtml = '<span style="color:#444; font-size:11px;">—</span>';
        if (hasFree) {
            freeBtnHtml = isFreeClaimed ? `<span style="color:#555; font-size:11px;">${t('bp_claimed')} ✓</span>` :
                `<button class="bp-claim-btn" data-bpid="${currentBpId}" data-lvl="${lvl}" data-track="free" ${!isLvlReached ? 'disabled style="background:#1a1a1a; border:1px solid #333; color:#555; padding:4px 8px; font-size:10px; border-radius:4px;"' : 'style="background:#222; border:1px solid #4ecca3; color:#4ecca3; padding:4px 8px; font-size:10px; font-weight:bold; border-radius:4px; cursor:pointer;"'}>${t('bp_btn_claim')}</button>`;
        }

        const hasPremium = row.premium_rewards && (Object.keys(row.premium_rewards.resources || {}).length > 0 || row.premium_rewards.items?.length > 0 || row.premium_rewards.skins?.length > 0);
        const isPremiumClaimed = playerBpState.claimed_premium?.includes(lvl);

        let premiumBtnHtml = '<span style="color:#444; font-size:11px;">—</span>';
        if (hasPremium) {
            const canClaimPremium = isLvlReached && playerBpState.is_premium_unlocked;
            premiumBtnHtml = isPremiumClaimed ? `<span style="color:#ffcc00; font-size:11px;">${t('bp_claimed')} ✓</span>` :
                `<button class="bp-claim-btn" data-bpid="${currentBpId}" data-lvl="${lvl}" data-track="premium" ${!canClaimPremium ? 'disabled style="background:#1a1a1a; border:1px solid #333; color:#555; padding:4px 8px; font-size:10px; border-radius:4px;"' : 'style="background:linear-gradient(135deg, #ffcc00, #b38f00); border:none; color:#12122c; padding:4px 8px; font-size:10px; font-weight:bold; border-radius:4px; cursor:pointer;"'}>${t('bp_btn_claim')}</button>`;
        }

        return `
            <div style="width: 100%; min-height: 50px; background: #141414; border: 1px solid #1f1f1f; border-radius: 6px; display: grid; grid-template-columns: 2fr 1fr 2fr 1fr; align-items: center; padding: 6px 12px; box-sizing: border-box; gap: 10px;">
                <div style="text-align: left; font-size: 11px; color: #aaa;">
                    ${formatRewardsText(row.free_rewards)}
                </div>
                <div>${freeBtnHtml}</div>
                <div style="background: ${isLvlReached ? 'rgba(33,150,243,0.1)' : '#0a0a0a'}; border: 1px solid ${isLvlReached ? '#2196f3' : '#222'}; padding: 4px; border-radius: 4px; font-family: monospace; font-size: 11px; font-weight: bold; color: ${isLvlReached ? '#2196f3' : '#555'}; text-align: center;">
                    LVL ${lvl}
                </div>
                <div style="text-align: right; font-size: 11px; color: #ffcc00; padding-right: 5px;">
                    ${formatRewardsText(row.premium_rewards)}
                </div>
                <div>${premiumBtnHtml}</div>
            </div>
        `;
    }).join('');

    const centerAreaHTML = `
        <div class="bp-center-area" style="display: flex; flex-direction: column; flex: 1; height: 100%; background: #0a0a0a; overflow: hidden; padding: 15px; box-sizing: border-box;">
            ${infoPanelHTML}
            <div style="width: 100%; height: ${headerHeight}; display: grid; grid-template-columns: 2fr 1fr 2fr 1fr; align-items: center; padding: 0 12px; box-sizing: border-box; border-bottom: 1px solid #1f1f1f; background: ${headerBg}; border-radius: 6px 6px 0 0; flex-shrink: 0; pointer-events: auto;">
                <div style="font-size: 11px; color: #64dfdf; font-weight: bold; text-transform: uppercase; text-align: left;">🆓 ${t('bp_track_free')}</div>
                <div></div>
                <div style="font-size: 11px; color: #ffcc00; font-weight: bold; text-transform: uppercase; text-align: center;">🎯 ${t('bp_rank')}</div>
                <div style="font-size: 11px; color: var(--accent-pink); font-weight: bold; text-transform: uppercase; text-align: right; padding-right:10px;">👑 ${t('bp_track_premium')}</div>
            </div>
            <div style="flex: 1; overflow-y: auto; background: #070707; border: 1px solid #1f1f1f; border-top: none; border-radius: 0 0 6px 6px; padding: 10px; box-sizing: border-box; display: flex; flex-direction: column; gap: 8px; pointer-events: auto;">
                ${matrixHTML}
            </div>
        </div>
    `;

    return `
        <div class="screen-content ui-element" style="${getWindowContentStyle()} display: flex; flex-direction: row; box-sizing: border-box; top: 45px; height: calc(100% - 45px); overflow: hidden;">
            ${sidebarHTML}
            ${centerAreaHTML}
        </div>
    `;
}

export function initBattlePassScreen(container, updateUiCallback) {
    const isReload = !!container.querySelector('.screen-content');

    if (!isReload) {
        sendSocket('battlePass', 'addExp', { bpId: BattlePassState.activeBpId || 'bp_standard_season_1', amount: 0 });
    }

    const oldScreen = container.querySelector('.screen-content');
    if (oldScreen) oldScreen.remove();

    container.insertAdjacentHTML('beforeend', getBattlePassHTML());

    container.querySelectorAll('.bp-season-btn').forEach(btn => {
        btn.onclick = () => {
            const bpId = btn.dataset.bpid;
            if (BattlePassState.activeBpId === bpId) return;
            BattlePassState.activeBpId = bpId;
            sendSocket('battlePass', 'addExp', { bpId, amount: 0 });
        };
    });

    const unlockBtn = container.querySelector('#bp-btn-unlock-premium');
    if (unlockBtn) {
        unlockBtn.onclick = () => {
            sendSocket('battlePass', 'unlockPremium', { bpId: unlockBtn.dataset.bpid });
        };
    }

    const claimAllBtn = container.querySelector('#bp-btn-claim-all');
    if (claimAllBtn) {
        claimAllBtn.onclick = () => {
            sendSocket('battlePass', 'claimAllRewards', { bpId: claimAllBtn.dataset.bpid });
        };
    }

    container.querySelectorAll('.bp-claim-btn').forEach(btn => {
        btn.onclick = () => {
            const bpId = btn.dataset.bpid;
            const targetLevel = btn.dataset.lvl;
            const trackType = btn.dataset.track;
            sendSocket('battlePass', 'claimReward', { bpId, targetLevel, trackType });
        };
    });
}

import { Game } from '../../stateManager.js';
import {t, getWindowContentStyle} from "../../shared.js";
import {sendSocket} from "../../socket.js";

let bountyIntervalTimer = null;

export function getBountyHTML() {
    const orientation = Game.config.orientation || 'landscape';
    const screenSettings = Game.config?.ui?.[orientation]?.find(w => w.id === 'screen_bounty_board') || {};
    const listSettings = screenSettings.list_settings || {};

    const headerHeight = listSettings.header_height || "40px";
    const headerBg = listSettings.header_background || "#121212";

    const activeMissions = Game.bounty_missions || [];
    const poolConfig = Game.config?.bounty_board?.mission_pool || {};
    const rerollCost = Game.config?.bounty_board?.refresh_cost || { amount: 10, resource: "diamond" };

    const missionsListHTML = activeMissions.length === 0 ? `
        <div style="margin: auto; color: #444; font-size: 12px; font-style: italic;">
            ${t('bb_no_missions')}
        </div>
    ` : activeMissions.map(m => {
        const meta = poolConfig[m.mission_template_id];
        if (!meta) return '';

        const rarityColors = { "R": "#4caf50", "SR": "#2196f3", "SSR": "#e94560", "UR": "#ffeb3b" };
        const badgeBg = rarityColors[meta.rarity || "R"] || "#444";
        const fontColor = meta.rarity === 'UR' ? '#000' : '#fff';

        let rewardsText = [];
        if (meta.rewards?.resources) {
            Object.entries(meta.rewards.resources).forEach(([k, v]) => {
                rewardsText.push(`🔮 ${v} ${t(`res_${k}`, k)}`);
            });
        }
        if (meta.rewards?.items) {
            meta.rewards.items.forEach(i => {
                rewardsText.push(`📦 ${i.amount}x ${t(`item_${i.itemId}`, i.itemId)}`);
            });
        }

        const req = meta.requirements || {};

        // Локализуем требования по классам и стихиям героев
        const className = req.required_class_id ? t(`class_${req.required_class_id}`, req.required_class_id) : '';
        const elementName = req.required_element_id ? t(`elem_${req.required_element_id}`, req.required_element_id) : '';
        const condText = `${t('bb_req')}: Lv.${req.min_hero_level || 1} ${className} ${elementName}`.trim();

        let actionBtnHtml = '';
        const now = Date.now();

        if (m.status === 'available') {
            actionBtnHtml = `
                <button class="bb-action-btn" data-action="dispatch" data-id="${m.instance_id}" style="background:linear-gradient(135deg, #2196f3, #1565c0); border:none; color:#fff; padding:6px 14px; font-size:11px; font-weight:bold; border-radius:4px; cursor:pointer;">
                    ${t('bb_dispatch')}
                </button>
            `;
        }
        else if (m.status === 'dispatched') {
            if (now >= m.end_at) {
                actionBtnHtml = `
                    <button class="bb-action-btn" data-action="claim" data-id="${m.instance_id}" style="background:linear-gradient(135deg, #4ecca3, #2b9371); border:none; color:#12122c; padding:6px 14px; font-size:11px; font-weight:bold; border-radius:4px; cursor:pointer;">
                        ${t('bb_claim')}
                    </button>
                `;
            } else {
                const msLeft = Math.max(0, m.end_at - now);
                const hrs = Math.floor(msLeft / 3600000);
                const mins = Math.floor((msLeft % 3600000) / 60000);
                const secs = Math.floor((msLeft % 60000) / 1000);
                const timerString = `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

                // Вычисляем динамическую стоимость спидапа (минуты / 10, минимум 5 алмазов)
                const speedUpCost = Math.max(5, Math.ceil(msLeft / 600000));

                // Отрендерим и таймер, и компактную кнопку мгновенного ускорения за алмазы рядом
                actionBtnHtml = `
                    <div style="display: flex; align-items: center; gap: 6px;">
                        <span class="bb-countdown" data-end="${m.end_at}" data-id="${m.instance_id}" style="font-family:monospace; font-size:11px; color:#aaa; background:#1f1f1f; padding:6px 12px; border:1px solid #333; border-radius:4px; display: inline-block;">
                            ⏳ ${timerString}
                        </span>
                        <button class="bb-speedup-btn" data-id="${m.instance_id}" style="background: linear-gradient(135deg, #ffcc00, #b38f00); border:none; color:#12122c; padding:6px 10px; font-size:10px; font-weight:bold; border-radius:4px; cursor:pointer; display: flex; align-items: center; gap: 2px;">
                            ⚡ ${speedUpCost} 💎
                        </button>
                    </div>
                `;
            }
        }

        // Подставляем локализованное имя шаблона задания из title_loc (если админ заложил его в конфиг)
        const missionTitle = meta.title_loc?.[Game.config.default_lang || 'en'] || m.mission_template_id;

        return `
            <div style="width: 100%; min-height: 52px; background: #141414; border: 1px solid #1f1f1f; border-radius: 6px; display: flex; align-items: center; padding: 0 12px; box-sizing: border-box; justify-content: space-between; gap: 12px;">
                <div style="display: flex; align-items: center; gap: 12px; text-align: left; min-width: 0; flex: 1;">
                    <span style="background:${badgeBg}; color:${fontColor}; font-family:monospace; font-size:11px; font-weight:bold; min-width:36px; height:20px; display:flex; align-items:center; justify-content:center; border-radius:4px; flex-shrink:0;">
                        ${meta.rarity || 'R'}
                    </span>
                    <div style="min-width: 0; flex: 1;">
                        <b style="font-size: 12px; color: #fff; display:block; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                            ${missionTitle}
                        </b>
                        <span style="font-size:10px; color:#555; display:block; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                            ${condText} | ${t('bb_rewards')}: ${rewardsText.join(', ')}
                        </span>
                    </div>
                </div>
                <div style="flex-shrink:0;">${actionBtnHtml}</div>
            </div>
        `;
    }).join('');

    const rerollResourceName = t(`res_${rerollCost.resource}`, rerollCost.resource);

    return `
        <div class="screen-content ui-element" style="${getWindowContentStyle()} display: flex; flex-direction: column; box-sizing: border-box; top: 45px; height: calc(100% - 45px); overflow: hidden;">
            <div style="width: 100%; height: ${headerHeight}; display: flex; align-items: center; justify-content: space-between; padding: 0 15px; box-sizing: border-box; border-bottom: 1px solid #1f1f1f; background: ${headerBg}; flex-shrink: 0; pointer-events: auto;">
                <div style="font-size: 12px; color: #ffcc00; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px;">
                    🦅 ${t('bb_dispatch_center')}
                </div>
                <button id="bb-btn-reroll" style="background:#222; border:1px solid #ffcc00; color:#ffcc00; padding:4px 10px; font-size:11px; font-weight:bold; border-radius:4px; cursor:pointer; pointer-events:auto;">
                    🔄 ${t('bb_btn_refresh')} (${rerollCost.amount} ${rerollResourceName})
                </button>
            </div>
            <div style="flex: 1; overflow-y: auto; padding: 12px; box-sizing: border-box; display: flex; flex-direction: column; gap: ${listSettings.gap || '8px'}; pointer-events: auto;">
                ${missionsListHTML}
            </div>
        </div>
    `;
}


export function initBountyScreen(container, updateUiCallback) {
    const isReload = !!container.querySelector('.screen-content');
    if (!isReload) {
        sendSocket('bounty', 'refreshBoard', { isPaidReroll: false });
    }

    if (bountyIntervalTimer) {
        clearInterval(bountyIntervalTimer);
        bountyIntervalTimer = null;
    }

    const oldScreen = container.querySelector('.screen-content');
    if (oldScreen) oldScreen.remove();

    container.insertAdjacentHTML('beforeend', getBountyHTML());

    // А) ОБРАБОТКА ДЕЙСТВИЙ КНОПОК ВНУТРИ СТРОК КОНТРАКТОВ
    container.querySelectorAll('.bb-action-btn').forEach(btn => {
        btn.onclick = () => {
            const action = btn.dataset.action;
            const instanceId = btn.dataset.id;

            if (action === 'dispatch') {
                const poolConfig = Game.config?.bounty_board?.mission_pool || {};
                const activeMissions = Game.bounty_missions || [];
                const currentMission = activeMissions.find(m => m.instance_id === instanceId) || {};
                const meta = poolConfig[currentMission.mission_template_id] || {};
                const requiredSlotsCount = meta.requirements?.slots_count || 1;

                const busyHeroes = [];
                activeMissions.forEach(m => {
                    if (m.status === 'dispatched' && m.assigned_heroes) busyHeroes.push(...m.assigned_heroes);
                });

                const allMyHeroes = Game.player?.heroes || [];
                const freeHeroesArray = allMyHeroes
                    .map(h => h.instance_id || h.id)
                    .filter(id => !busyHeroes.includes(id));

                if (freeHeroesArray.length < requiredSlotsCount) {
                    return alert(`${t('bb_alert_no_heroes')}: ${requiredSlotsCount}`);
                }

                const selectedHeroIds = freeHeroesArray.slice(0, requiredSlotsCount);
                sendSocket('bounty', 'dispatchHeroes', { instanceId, heroIdsArray: selectedHeroIds });
            }
            else if (action === 'claim') {
                sendSocket('bounty', 'claimReward', { instanceId });
            }
        };
    });

    // Б) ОБРАБОТКА КНОПКИ СКОРОСТНОГО ЗАВЕРШЕНИЯ (SPEED-UP)
    container.querySelectorAll('.bb-speedup-btn').forEach(btn => {
        btn.onclick = () => {
            const instanceId = btn.dataset.id;
            btn.disabled = true; // Защита от спам-кликов по сети
            sendSocket('bounty', 'speedUpMission', { instanceId });
        };
    });

    // В) ОБРАБОТКА КНОПКИ РЕРОЛЛА ДОСКИ ЗА АЛМАЗЫ
    const rerollBtn = container.querySelector('#bb-btn-reroll');
    if (rerollBtn) {
        rerollBtn.onclick = () => {
            sendSocket('bounty', 'refreshBoard', { isPaidReroll: true });
        };
    }

    // Г) ЖИВОЙ ТАЙМЕР ЭКСПЕДИЦИЙ
    const countdownNodes = container.querySelectorAll('.bb-countdown');
    if (countdownNodes.length > 0) {
        bountyIntervalTimer = setInterval(() => {
            const now = Date.now();
            let activeTimersCount = 0;

            countdownNodes.forEach(node => {
                const endTimestamp = Number(node.dataset.end) || 0;
                const msLeft = endTimestamp - now;

                if (msLeft <= 0) {
                    const instanceId = node.dataset.id;
                    const parentDiv = node.parentElement;
                    if (parentDiv) {
                        parentDiv.innerHTML = `
                            <button class="bb-action-btn" data-action="claim" data-id="${instanceId}" style="background:linear-gradient(135deg, #4ecca3, #2b9371); border:none; color:#12122c; padding:6px 14px; font-size:11px; font-weight:bold; border-radius:4px; cursor:pointer; pointer-events:auto;">
                                ${t('bb_claim')}
                            </button>
                        `;
                        const newBtn = parentDiv.querySelector('.bb-action-btn');
                        if (newBtn) {
                            newBtn.onclick = () => {
                                sendSocket('bounty', 'claimReward', { instanceId });
                            };
                        }
                    }
                } else {
                    activeTimersCount++;
                    const hrs = Math.floor(msLeft / 3600000);
                    const mins = Math.floor((msLeft % 3600000) / 60000);
                    const secs = Math.floor((msLeft % 60000) / 1000);
                    node.innerText = `⏳ ${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

                    // Обновляем циферку стоимости на кнопке спидапа рядом
                    const speedUpBtn = node.nextElementSibling;
                    if (speedUpBtn && speedUpBtn.classList.contains('bb-speedup-btn')) {
                        const currentCost = Math.max(5, Math.ceil(msLeft / 600000));
                        speedUpBtn.innerHTML = `⚡ ${currentCost} 💎`;
                    }
                }
            });

            if (activeTimersCount === 0) {
                clearInterval(bountyIntervalTimer);
            }
        }, 1000);
    }
}

// Экспортируем деструктор для зачистки интервала при смене Game.gameState
export function destroyBountyScreen() {
    if (bountyIntervalTimer) {
        clearInterval(bountyIntervalTimer);
        bountyIntervalTimer = null;
    }
}


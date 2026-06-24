import { t, locObj } from '../../shared.js';
import { Game } from '../../stateManager.js';

let CompanionSpeechInterval = null;

export function getGameLauncherHTML(gameId, url = '') {
    const prototype = Game.config.catalog?.games?.[gameId];
    if (!prototype) return '';
    // embed_url: "https://mtwtech.onrender.com/games/slots5x3char?partnerId=demo_mtwtech&mode=real&fullscreen=true&hidePlayer=true",

    let gameUrl = url || prototype.embed_url || '';

    // ИСПРАВЛЕНО: Читаем настройки глобально из ui.landscape для экрана screen_game
    const orientation = Game.config.orientation || 'landscape';
    const screenGameMeta = Game.config?.ui?.[orientation]?.find(w => w.id === 'screen_game') || {};
    const cs = screenGameMeta.companion_stream || { enabled: false };

    const iframeHTML = `
        <iframe src="${gameUrl}" 
                style="flex: 1; height: 100%; border: none; background: #000; pointer-events: auto;" 
                allow="autoplay; fullscreen; gamepad" 
                sandbox="allow-scripts allow-same-origin allow-forms">
        </iframe>
    `;

    // Если компаньон глобально выключен в ui.landscape — отдаем чистый iframe
    if (!cs.enabled) {
        return `
            <div class="game-launcher-inner" style="width:100%; height:100%; display:flex; flex-direction:column; background:#000; border-radius:inherit; overflow:hidden; box-sizing:border-box;">
                ${iframeHTML}
            </div>
        `;
    }

    // Определение активного компаньона игрока из профиля
    const activeHeroInstance = Game.player.heroes?.find(h => h.instance_id === Game.player.active_home_hero);
    const heroProto = Game.config.catalog?.heroes?.[activeHeroInstance?.hero_id];

    let heroImageSrc = 'https://picsum.photos';
    if (heroProto) {
        heroImageSrc = heroProto.image || '';
        if (activeHeroInstance.active_skin && heroProto.skins) {
            const currentSkin = heroProto.skins.find(s => s.skin_id === activeHeroInstance.active_skin);
            if (currentSkin && currentSkin.image) heroImageSrc = currentSkin.image;
        }
    }

    // Внутри gameLauncher.js -> функция getGameLauncherHTML()
// Заменяем разметку переменной companionHTML на этот идеальный вариант:

    const companionHTML = `
        <div class="launcher-companion-sidebar" style="width: ${cs.width || '25%'}; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; background: #111; border-right: 1px solid #333; border-left: 1px solid #333; box-sizing: border-box; position: relative; padding-bottom: 20px; flex-shrink: 0; user-select: none;">
            
            <!-- ИСПРАВЛЕНО: Бабл выталкивается СВЕРХУ-СПРАВА за границы блока персонажа прямо на игру -->
            <div class="companion-bubble" style="position: absolute; top: 10%; left: 75%; transform: translateX(10px); width: 160px; background: ${cs.bubble_color || 'rgba(20, 20, 20, 0.95)'}; border: 1px solid #ffcc00; border-radius: 8px; padding: 10px 15px; box-sizing: border-box; transition: opacity 0.3s ease; opacity: 1; z-index: 100; box-shadow: 4px 4px 15px rgba(0,0,0,0.6);">
                <p class="companion-bubble-text" style="margin: 0; font-size: 11px; color: ${cs.bubble_text_color || '#fff'}; line-height: 1.4; text-align: left; font-family: sans-serif;">
                    ${cs.phrases_loc_keys?.length > 0 ? t(cs.phrases_loc_keys[0]) : ''}
                </p>
                
                <!-- ИСПРАВЛЕНО: Хвостик бабла перенесен на ЛЕВУЮ ГРАНЬ, СТРОГО ПО ЦЕНТРУ ВЫСОТЫ -->
                <div style="position: absolute; left: -6px; top: 50%; transform: translateY(-50%) rotate(45deg); width: 10px; height: 10px; background: ${cs.bubble_color || 'rgba(20, 20, 20, 0.95)'}; border-left: 1px solid #ffcc00; border-bottom: 1px solid #ffcc00;"></div>
            </div>
    
            <!-- Арт Бога -->
            <div style="width: 100%; height: 100%; background-image: url('${heroImageSrc}'); background-size: contain; background-repeat: no-repeat; background-position: center bottom;"></div>
        </div>
    `.replace(/\s+/g, ' ');


    const layoutContent = cs.position === 'right' ? `${iframeHTML}${companionHTML}` : `${companionHTML}${iframeHTML}`;

    return `
        <div class="game-launcher-inner" style="width:100%; height:100%; display:flex; flex-direction:row; background:#000; border-radius:inherit; overflow:hidden; box-sizing:border-box;">
            ${layoutContent}
        </div>
    `;
}

export async function initGameLauncherScreen(container, gameId, updateUiCallback) {
    if (CompanionSpeechInterval) clearInterval(CompanionSpeechInterval);

    const prototype = Game.config.catalog?.games?.[gameId];
    if (!prototype) return '';

    console.log(prototype);

    console.log(gameId.player.partnerId.player.sessionId);

    const res = await fetch(`https://mtw-gw.onrender.com/api/game/${prototype.slug}/launch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            partnerId: Game.player.partnerId,
            sessionId: Game.player.sessionId,
            theme: "dark",
            isDemo: false,
        })
    });

    const data = await res.json();

    if(!data || data.error) {
        return;
    }

    const renderNode = document.createElement('div');
    renderNode.className = 'game-launcher-overlay-wrapper';
    renderNode.style.cssText = 'position:absolute; top:0; left:0; width:100%; height:100%; z-index:20; background:#000; box-sizing:border-box; border-radius:inherit;';
    renderNode.innerHTML = getGameLauncherHTML(gameId, data.iframeUrl);

    const systemBackBtn = container.querySelector('[data-ui-action="go_back"]') || container.querySelector('#btn_back');
    let originalBackAction = null;

    if (systemBackBtn) {
        originalBackAction = systemBackBtn.onclick;
        systemBackBtn.onclick = (e) => {
            e.stopPropagation();
            if (CompanionSpeechInterval) {
                clearInterval(CompanionSpeechInterval);
                CompanionSpeechInterval = null;
            }
            systemBackBtn.onclick = originalBackAction;
            renderNode.remove();
        };
    }

    const contentContainer = container.querySelector('.screen-content') || container;
    contentContainer.appendChild(renderNode);

    // --- ТАЙМЕР РЕПЛИК НА ОСНОВЕ ГЛОБАЛЬНОГО ЭКРАНА SCREEN_GAME ---
    const orientation = Game.config.orientation || 'landscape';
    const screenGameMeta = Game.config?.ui?.[orientation]?.find(w => w.id === 'screen_game') || {};
    const cs = screenGameMeta.companion_stream;

    if (cs && cs.enabled && cs.phrases_loc_keys?.length > 0) {
        const bubbleTextNode = renderNode.querySelector('.companion-bubble-text');
        const bubbleNode = renderNode.querySelector('.companion-bubble');

        if (bubbleTextNode && bubbleNode) {
            CompanionSpeechInterval = setInterval(() => {
                bubbleNode.style.opacity = '0';

                setTimeout(() => {
                    const randomIndex = Math.floor(Math.random() * cs.phrases_loc_keys.length);
                    const nextPhraseKey = cs.phrases_loc_keys[randomIndex];

                    bubbleTextNode.innerHTML = t(nextPhraseKey);
                    bubbleNode.style.opacity = '1';
                }, 300);

            }, 5000);
        }
    }
}
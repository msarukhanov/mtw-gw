import { t, API_URL, headers } from './shared.js';
import {Game} from "./stateManager.js";
import {sendSocket} from "./socket.js";

export const DialogManager = {
    currentScene: null,
    currentStepIndex: 0,
    onCompleteCallback: null,

    typewriterTimer: null,
    isTextFullyDisplayed: false,

    async trigger(triggerId, onComplete = null) {
        const sceneConfig = Game.config?.dialogs?.[triggerId];
        if (!sceneConfig) {
            if (onComplete) onComplete();
            return;
        }

        const viewedDialogs = Game.player.viewed_dialogs || [];

        if (viewedDialogs.includes(triggerId)) {
            if (onComplete) onComplete();
            return;
        }

        this.currentScene = sceneConfig;
        this.currentStepIndex = 0;

        this.onCompleteCallback = async () => {
            try {
                if (!Game.player.viewed_dialogs) Game.player.viewed_dialogs = [];
                Game.player.viewed_dialogs.push(triggerId);

                // const res = await fetch(`${API_URL}/game/dialog/save`, {
                //     method: 'POST',
                //     headers,
                //     body: JSON.stringify({ dialog_id: triggerId })
                // });

                sendSocket('game', 'saveDialog', {dialogId: triggerId});

                const data = await res.json();
                if (res.ok && !data.error) {
                    Game.player = {...Game.player,...data.game_data};
                    if (data.resources) Game.player.resources = data.resources;
                    if (data.combat_power) Game.player.combat_power = data.combat_power;
                }
            } catch (err) {
                console.error("Ошибка сохранения диалога на бэкенде:", err);
            }

            if (onComplete) onComplete();
        };

        this.render();
    },

    render() {
        if (this.typewriterTimer) clearInterval(this.typewriterTimer);
        this.isTextFullyDisplayed = false;

        const oldDialog = document.getElementById('game-dialog-overlay');
        if (oldDialog) oldDialog.remove();

        const orientationType = screen.orientation.type;
        const isLandscape = orientationType.includes('landscape');

        const ws = this.currentScene.window_settings || {};
        const step = this.currentScene.steps[this.currentStepIndex];

        const speakerName = t(step.speaker_loc_key);
        const textContent = t(step.text_loc_key);
        const hintText = ws.hint_loc_key ? t(ws.hint_loc_key) : '';

        const isFullscreen = ws.display_type === 'fullscreen';

        const sizes = isLandscape ? `
            top: 0; left: 0; width: 100dvw; height: 100dvh;
        ` : `
            top: 50%; left: 50%; width: 100dvh; height: 100dvw;
            transform: translate(-50%, -50%) rotate(90deg); transform-origin: center;
        `;

        let overlayStyle = `
            position: fixed; ${sizes}
            background: ${ws.bg_image ? (ws.bg_image.includes('url') ? ws.bg_image : `url('${ws.bg_image}')`) : (ws.backgroundColor || 'transparent')};
            background-size: cover; background-position: center; z-index: 200; box-sizing: border-box;
        `;

        if (!isFullscreen) {
            overlayStyle = `
                position: fixed; top: 0; left: 0; width: 100dvw; height: 100dvh;
                background: transparent; z-index: 150; pointer-events: none; box-sizing: border-box;
            `;
        }

        const boxStyle = `
            position: absolute; pointer-events: auto;
            top: ${ws.box_top || 'unset'}; bottom: ${ws.box_bottom || 'unset'};
            left: ${ws.box_left || 'unset'}; right: ${ws.box_right || 'unset'};
            width: ${ws.box_width || 'auto'}; height: ${ws.box_height || 'auto'};
            padding: ${ws.box_padding || '15px'};
            background-color: ${ws.box_backgroundColor || 'rgba(0,0,0,0.9)'};
            border: ${ws.box_border || 'none'}; border-radius: ${ws.box_borderRadius || '0px'};
            box-shadow: ${ws.box_shadow || 'none'}; display: flex; gap: 15px; box-sizing: border-box;
        `;

        const speakerStyle = `color: ${ws.speaker_color || '#ffcc00'}; font-size: ${ws.speaker_size || '14px'}; font-weight: bold; text-transform: uppercase;`;
        const textStyle = `color: ${ws.text_color || '#fff'}; font-size: ${ws.text_size || '12px'}; line-height: 1.5; margin: 0;`;
        const hintStyle = `align-self: flex-end; color: ${ws.hint_color || '#666'}; font-size: ${ws.hint_size || '10px'}; margin-top: 5px;`;

        const avatarHTML = step.avatar
            ? `<img src="${step.avatar}" style="width: 64px; height: 64px; object-fit: contain; border-radius: 4px; flex-shrink: 0; background: rgba(255,255,255,0.02);">`
            : '';

        const dialogHTML = `
            <div id="game-dialog-overlay" style="${overlayStyle.replace(/\s+/g, ' ')}">
                <div class="dialog-box-node" style="${boxStyle.replace(/\s+/g, ' ')} cursor: pointer;">
                    ${avatarHTML}
                    <div style="flex: 1; display: flex; flex-direction: column; gap: 4px; font-family: sans-serif; min-width: 0;">
                        <span style="${speakerStyle}">${speakerName}</span>
                        <!-- ИСПРАВЛЕНО: Даем параграфу класс для точечного поиска печатной машинки -->
                        <p class="typewriter-text" style="${textStyle}"></p>
                        ${hintText ? `<span style="${hintStyle}">${hintText}</span>` : ''}
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', dialogHTML);

        // --- ЛОГИКА ПЕЧАТНОЙ МАШИНКИ ---
        const textNode = document.getElementById('game-dialog-overlay').querySelector('.typewriter-text');
        let currentLetterIdx = 0;

        this.typewriterTimer = setInterval(() => {
            textNode.innerHTML += textContent.charAt(currentLetterIdx);
            currentLetterIdx++;

            if (currentLetterIdx >= textContent.length) {
                clearInterval(this.typewriterTimer);
                this.isTextFullyDisplayed = true;
            }
        }, 25); // Скорость печати букв (25мс — идеальный темп для чтения)

        // --- ЛОГИКА УМНОГО КЛИКА НА БОКС ---
        document.getElementById('game-dialog-overlay').querySelector('.dialog-box-node').onclick = (e) => {
            e.stopPropagation();

            if (!this.isTextFullyDisplayed) {
                // Если текст еще печатается — прерываем таймер и вываливаем строку целиком
                clearInterval(this.typewriterTimer);
                textNode.innerHTML = textContent;
                this.isTextFullyDisplayed = true;
            } else {
                // Если текст уже напечатан — клик идет на следующий шаг сценария
                this.nextStep();
            }
        };
    },

    nextStep() {
        this.currentStepIndex++;

        // Если в массиве steps еще есть реплики — рендерим следующий шаг
        if (this.currentStepIndex < this.currentScene.steps.length) {
            this.render();
        } else {
            // Если сцена полностью закончилась — вычищаем оверлей и фиксируем прогресс
            const overlay = document.getElementById('game-dialog-overlay');
            if (overlay) overlay.remove();

            if (this.typewriterTimer) clearInterval(this.typewriterTimer);

            if (this.onCompleteCallback) {
                this.onCompleteCallback();
            }
        }
    }
};

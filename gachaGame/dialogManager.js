// dialogManager.js
import { t } from './shared.js';

export const DialogManager = {
    currentScene: null,
    currentStepIndex: 0,
    onCompleteCallback: null,

    /**
     * Главный триггер запуска диалоговой сцены
     */
    trigger(triggerId, Game, onComplete = null) {
        const sceneConfig = Game.config?.dialogs?.[triggerId];
        if (!sceneConfig) {
            if (onComplete) onComplete();
            return;
        }

        if (!Game.player.viewed_dialogs) {
            Game.player.viewed_dialogs = [];
        }

        // Защита от повторного показа
        if (Game.player.viewed_dialogs.includes(triggerId)) {
            if (onComplete) onComplete();
            return;
        }

        this.currentScene = sceneConfig;
        this.currentStepIndex = 0;
        this.onCompleteCallback = () => {
            Game.player.viewed_dialogs.push(triggerId);
            if (onComplete) onComplete();
        };

        this.render(Game);
    },

    /**
     * Рендеринг текущей реплики на основе визуальных настроек сцены
     */
    render(Game) {
        const oldDialog = document.getElementById('game-dialog-overlay');
        if (oldDialog) oldDialog.remove();

        const orientationType = screen.orientation.type;   // e.g., "portrait-primary"
        const orientationAngle = screen.orientation.angle; // e.g., 0, 90, 180, 270
        const isLandscape =  orientationType.includes('landscape');
        const isPortrait =  orientationType.includes('portrait');

        const ws = this.currentScene.window_settings || {};
        const step = this.currentScene.steps[this.currentStepIndex];

        const speakerName = t(step.speaker_loc_key, Game);
        const textContent = t(step.text_loc_key, Game);
        const hintText = ws.hint_loc_key ? t(ws.hint_loc_key, Game) : '';

        const isFullscreen = ws.display_type === 'fullscreen';

        const sizes = isLandscape ? `
            top: 0; 
            left: 0;
            width: 100vw;
            height: 100vh;
        ` : `
            top: 50%;
            left: 50%;
            width: 100vh;
            height: 100vw;
            transform: translate(-50%, -50%) rotate(90deg);
            transform-origin: center;
        `;

        let overlayStyle = `
            position: fixed;
            ${sizes}
            background: ${ws.bg_image ? (ws.bg_image.includes('url') ? ws.bg_image : `url('${ws.bg_image}')`) : (ws.backgroundColor || 'transparent')};
            background-size: cover;
            background-position: center;
            z-index: 200;
            box-sizing: border-box;
        `;

        if (!isFullscreen) {
            // Если это помощник (helper), внешний слой схлопывается в прозрачную маску, пропускающую клики мимо себя,
            // кроме самого диалогового окна
            overlayStyle = `
                position: fixed;
                top: 0; left: 0;
                width: 100vw; height: 100vh;
                background: transparent;
                z-index: 150;
                pointer-events: none;
                box-sizing: border-box;
            `;
        }

        // Сборка стилей диалогового бокса (Box) на основе процентных/calc параметров B2B-клиента
        const boxStyle = `
            position: absolute;
            pointer-events: auto;
            top: ${ws.box_top || 'unset'};
            bottom: ${ws.box_bottom || 'unset'};
            left: ${ws.box_left || 'unset'};
            right: ${ws.box_right || 'unset'};
            width: ${ws.box_width || 'auto'};
            height: ${ws.box_height || 'auto'};
            padding: ${ws.box_padding || '15px'};
            background-color: ${ws.box_backgroundColor || 'rgba(0,0,0,0.9)'};
            border: ${ws.box_border || 'none'};
            border-radius: ${ws.box_borderRadius || '0px'};
            box-shadow: ${ws.box_shadow || 'none'};
            display: flex;
            gap: 15px;
            box-sizing: border-box;
        `;

        // Стили внутренних текстов из конфига
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
                        <p style="${textStyle}">${textContent}</p>
                        ${hintText ? `<span style="${hintStyle}">${hintText}</span>` : ''}
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', dialogHTML);

        // Вешаем событие клика на бокс для продвижения по сценарию
        document.getElementById('game-dialog-overlay').querySelector('.dialog-box-node').onclick = (e) => {
            e.stopPropagation();
            this.nextStep(Game);
        };
    },

    /**
     * Перелистывание реплик
     */
    nextStep(Game) {
        this.currentStepIndex++;

        if (this.currentStepIndex < this.currentScene.steps.length) {
            this.render(Game);
        } else {
            document.getElementById('game-dialog-overlay').remove();
            if (this.onCompleteCallback) this.onCompleteCallback();
        }
    }
};

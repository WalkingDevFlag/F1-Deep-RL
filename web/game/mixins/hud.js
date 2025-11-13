import { openEditorModal } from '../editorModal.js';

export function applyHudMixin(Game) {
    Game.prototype.setupUI = function setupUI() {
        if (this.uiElements) {
            if (this.uiElements.hudCard && this.uiElements.hudCard.element instanceof HTMLElement) {
                const { element } = this.uiElements.hudCard;
                if (element.parentElement) {
                    element.parentElement.removeChild(element);
                }
            }
            if (this.uiElements.lapCard && this.uiElements.lapCard.element instanceof HTMLElement) {
                const { element } = this.uiElements.lapCard;
                if (element.parentElement) {
                    element.parentElement.removeChild(element);
                }
            }
            if (this.uiElements.dock && this.uiElements.dock.detachOnReset && this.uiElements.dock.element instanceof HTMLElement) {
                const dockElement = this.uiElements.dock.element;
                if (dockElement.parentElement) {
                    dockElement.parentElement.removeChild(dockElement);
                }
            }
        }

        if (!window.UIKit) {
            console.warn('UIKit module not loaded; skipping HUD setup.');
            this.uiElements = {};
            return;
        }

        if (typeof this.initializeNeuralOverlay === 'function') {
            this.initializeNeuralOverlay();
        }

        const sensorsEnabled = this.car ? this.car.sensorsEnabled : true;
        const cameraName = this.camera ? this.camera.getModeName() : "God's Eye View";
        const { createCard, createStatRow, createToggleRow, createDock, createDockButton } = window.UIKit;

        const createSvgIcon = (segments = []) => {
            const NS = 'http://www.w3.org/2000/svg';
            const svg = document.createElementNS(NS, 'svg');
            svg.setAttribute('viewBox', '0 0 24 24');
            svg.setAttribute('aria-hidden', 'true');
            svg.setAttribute('focusable', 'false');
            svg.setAttribute('fill', 'none');
            svg.setAttribute('stroke', 'currentColor');
            svg.setAttribute('stroke-width', '1.8');
            svg.setAttribute('stroke-linecap', 'round');
            svg.setAttribute('stroke-linejoin', 'round');

            segments.forEach((segment) => {
                const tag = segment.tag || 'path';
                const attrs = segment.attrs || { d: segment.d || segment };
                const element = document.createElementNS(NS, tag);
                Object.entries(attrs).forEach(([key, value]) => {
                    element.setAttribute(key, value);
                });
                svg.appendChild(element);
            });

            return svg;
        };

        const homeIcon = createSvgIcon([
            { d: 'M3 11l9-7 9 7' },
            { d: 'M5 10v10h14V10' },
            { d: 'M9 21V12h6v9' }
        ]);

        const levelEditorIcon = createSvgIcon([
            { d: 'M4 4h6v6H4z' },
            { d: 'M14 4h6v6h-6z' },
            { d: 'M4 14h6v6H4z' },
            { d: 'M18.5 13.5l-5 5V21h2.5l5-5z' }
        ]);

        const hudCard = createCard({ title: 'Driver Console', overlay: true });
        hudCard.element.setAttribute('aria-label', 'Driver control panel');

        const fpsRow = createStatRow({ label: 'FPS', value: '0' });
        const cameraRow = createStatRow({ label: '[C] Camera', value: cameraName });
        const sensorsRow = createToggleRow({
            label: 'Sensors',
            initial: sensorsEnabled,
            onToggle: (enabled) => {
                if (this.car) {
                    this.car.setSensorsEnabled(enabled);
                }
            }
        });
        const nnRow = createToggleRow({
            label: 'Neural Net',
            initial: this.neuralNetworkVisible,
            onToggle: (enabled) => {
                if (typeof this.setNeuralNetworkVisible === 'function') {
                    this.setNeuralNetworkVisible(enabled);
                } else {
                    this.neuralNetworkVisible = enabled;
                }
            }
        });
        const wallsRow = createToggleRow({
            label: 'Walls',
            initial: this.renderer ? this.renderer.showWalls : false,
            onToggle: (enabled) => {
                if (this.renderer) {
                    this.renderer.setShowWalls(enabled);
                }
            }
        });
        const checkpointsRow = createToggleRow({
            label: 'Checkpoints',
            initial: this.renderer ? this.renderer.showCheckpoints : false,
            onToggle: (enabled) => {
                if (this.renderer) {
                    this.renderer.setShowCheckpoints(enabled);
                }
            }
        });
        const startFinishRow = createToggleRow({
            label: 'Start/Finish',
            initial: this.renderer ? this.renderer.showStartFinish : false,
            onToggle: (enabled) => {
                if (this.renderer) {
                    this.renderer.setShowStartFinish(enabled);
                }
            }
        });

        hudCard.addMany([fpsRow, cameraRow, sensorsRow, nnRow, wallsRow, checkpointsRow, startFinishRow]);
        if (document.body) {
            document.body.appendChild(hudCard.element);
        }

        const trackName = this.trackMeta ? this.trackMeta.name : 'Unknown Track';
        const lapCard = createCard({ title: `${trackName}`, classNames: ['ui-card--top-right'] });
        lapCard.element.setAttribute('aria-label', 'Lap timing information');

        const lapTimeRow = createStatRow({ label: 'Lap Time', value: '00:00:000' });
        const lapCountRow = createStatRow({ label: 'Laps', value: '0' });

        lapCard.addMany([lapTimeRow, lapCountRow]);
        if (document.body) {
            document.body.appendChild(lapCard.element);
        }

        let dockElementRef = null;
        let homeButtonRef = null;
        let levelEditorButtonRef = null;
        let dockShouldDetach = false;

        const staticDock = document.getElementById('main-dock');
        if (staticDock) {
            dockElementRef = staticDock;
            dockShouldDetach = false;
            homeButtonRef = staticDock.querySelector('[data-dock-action="home"]');
            levelEditorButtonRef = staticDock.querySelector('[data-dock-action="editor"]');

            if (homeButtonRef) {
                homeButtonRef.onclick = (event) => {
                    event.preventDefault();
                    window.location.href = '/';
                };
            }

            if (levelEditorButtonRef) {
                levelEditorButtonRef.onclick = (event) => {
                    event.preventDefault();
                    openEditorModal();
                };
            }
        } else {
            const dock = createDock({ label: 'Simulator dock' });
            const homeButton = createDockButton({
                label: 'Home',
                tooltip: 'Go to dashboard',
                icon: homeIcon,
                onClick: () => {
                    window.location.href = '/';
                }
            });
            const levelEditorButton = createDockButton({
                label: 'Level Editor',
                tooltip: 'Open Level Editor',
                icon: levelEditorIcon,
                onClick: () => {
                    openEditorModal();
                }
            });

            dock.addMany([homeButton, levelEditorButton]);
            if (document.body) {
                document.body.appendChild(dock.element);
            }

            dockElementRef = dock.element;
            homeButtonRef = homeButton.element;
            levelEditorButtonRef = levelEditorButton.element;
            dockShouldDetach = true;
        }

        this.uiElements = {
            hudCard,
            fpsRow,
            cameraRow,
            sensorsRow,
            nnRow,
            wallsRow,
            checkpointsRow,
            startFinishRow,
            lapCard,
            lapTimeRow,
            lapCountRow,
            dock: {
                element: dockElementRef,
                homeButton: homeButtonRef,
                levelEditorButton: levelEditorButtonRef,
                detachOnReset: dockShouldDetach
            }
        };

        if (this.trainingController) {
            this.trainingController.attachUI();
        }

        this.updateHUD();
    };

    Game.prototype.updateHUD = function updateHUD() {
        if (!this.uiElements) {
            return;
        }

        if (this.uiElements.fpsRow && typeof this.uiElements.fpsRow.setValue === 'function' && this.renderer) {
            this.uiElements.fpsRow.setValue(this.renderer.fps);
        }

        if (this.uiElements.cameraRow && typeof this.uiElements.cameraRow.setValue === 'function' && this.camera) {
            this.uiElements.cameraRow.setValue(this.camera.getModeName());
        }

        const sensorsEnabled = this.car ? this.car.sensorsEnabled : true;
        if (this.uiElements.sensorsRow && typeof this.uiElements.sensorsRow.setChecked === 'function') {
            const currentSensorsState = typeof this.uiElements.sensorsRow.getChecked === 'function'
                ? this.uiElements.sensorsRow.getChecked()
                : null;
            if (currentSensorsState !== sensorsEnabled) {
                this.uiElements.sensorsRow.setChecked(sensorsEnabled, { silent: true });
            }
        }

        if (this.uiElements.nnRow && typeof this.uiElements.nnRow.setChecked === 'function') {
            const currentNNState = typeof this.uiElements.nnRow.getChecked === 'function'
                ? this.uiElements.nnRow.getChecked()
                : null;
            if (currentNNState !== this.neuralNetworkVisible) {
                this.uiElements.nnRow.setChecked(this.neuralNetworkVisible, { silent: true });
            }
        }

        if (this.uiElements.wallsRow && typeof this.uiElements.wallsRow.setChecked === 'function' && this.renderer) {
            const currentWallsState = typeof this.uiElements.wallsRow.getChecked === 'function'
                ? this.uiElements.wallsRow.getChecked()
                : null;
            const rendererWallsState = this.renderer.showWalls;
            if (currentWallsState !== rendererWallsState) {
                this.uiElements.wallsRow.setChecked(rendererWallsState, { silent: true });
            }
        }

        if (this.uiElements.checkpointsRow && typeof this.uiElements.checkpointsRow.setChecked === 'function' && this.renderer) {
            const currentCheckpointsState = typeof this.uiElements.checkpointsRow.getChecked === 'function'
                ? this.uiElements.checkpointsRow.getChecked()
                : null;
            const rendererCheckpointsState = this.renderer.showCheckpoints;
            if (currentCheckpointsState !== rendererCheckpointsState) {
                this.uiElements.checkpointsRow.setChecked(rendererCheckpointsState, { silent: true });
            }
        }

        if (this.uiElements.startFinishRow && typeof this.uiElements.startFinishRow.setChecked === 'function' && this.renderer) {
            const currentStartFinishState = typeof this.uiElements.startFinishRow.getChecked === 'function'
                ? this.uiElements.startFinishRow.getChecked()
                : null;
            const rendererStartFinishState = this.renderer.showStartFinish;
            if (currentStartFinishState !== rendererStartFinishState) {
                this.uiElements.startFinishRow.setChecked(rendererStartFinishState, { silent: true });
            }
        }

        if (this.uiElements.lapTimeRow && typeof this.uiElements.lapTimeRow.setValue === 'function') {
            // Check if training is paused and use frozen time
            if (this.trainingController && this.trainingController.isPaused && this.trainingController.pausedElapsedLapTime !== undefined) {
                const formattedTime = this.formatLapTime(this.trainingController.pausedElapsedLapTime);
                this.uiElements.lapTimeRow.setValue(formattedTime);
            } else if (this.lapStartTime !== null) {
                const lapTimeMs = performance.now() - this.lapStartTime;
                const formattedTime = this.formatLapTime(lapTimeMs);
                this.uiElements.lapTimeRow.setValue(formattedTime);
            } else if (this.collisionTime !== null) {
                const formattedTime = this.formatLapTime(this.collisionTime);
                this.uiElements.lapTimeRow.setValue(formattedTime);
            } else {
                this.uiElements.lapTimeRow.setValue('00:00:000');
            }
        }

        if (this.uiElements.lapCountRow && typeof this.uiElements.lapCountRow.setValue === 'function') {
            this.uiElements.lapCountRow.setValue(this.lapCount.toString());
        }
    };

    Game.prototype.formatLapTime = function formatLapTime(ms) {
        const totalSeconds = Math.floor(ms / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        const milliseconds = Math.floor(ms % 1000);

        return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}:${milliseconds.toString().padStart(3, '0')}`;
    };
}

import { applyInitializationMixin } from './mixins/init.js';
import { applyEventMixin } from './mixins/events.js';
import { applyHudMixin } from './mixins/hud.js';
import { applyLapTimingMixin } from './mixins/lapTiming.js';
import { applyLoopMixin } from './mixins/loop.js';
import { applyManualRewardMixin } from './mixins/manualReward.js';
import { applyNeuralOverlayMixin } from './mixins/neuralOverlay.js';

class Game {
    constructor() {
        this.canvas = document.getElementById('canvas');
        if (!this.canvas) {
            throw new Error('Canvas element with id "canvas" not found.');
        }

        this.ctx = this.canvas.getContext('2d');
        this.assetLoader = new window.AssetLoader();
        this.renderer = null;
        this.car = null;
        this.track = null;
        this.camera = null;
        this.controls = new window.Controls();
        this.offscreenCanvas = document.createElement('canvas');
        this.offscreenCtx = this.offscreenCanvas.getContext('2d', { willReadFrequently: true });
        this.trackImg = null;
        this.carImg = null;
        this.trackMeta = null;
        this.collisionResetTimeout = null;
        this.lastFrameTime = performance.now();
        this.deltaTime = 0;
        this.neuralNetworkVisible = false;
        this.neuralOverlay = null;
        this.uiElements = {};

        this.lapCount = 0;
        this.lapStartTime = null;
        this.currentLapTime = 0;
        this.carHasStartedMoving = false;
        this.collisionTime = null;
        this.lastCarPosition = { x: 0, y: 0 };
        this.hasPassedStartLine = false;
        this.pendingLapDisqualification = false;
        this.lastLapTimeMs = null;
        this.lapStatsDirty = false;
        this.lapStatsFlushHandle = null;
        this.lapStatsLastPersistTime = 0;
        this.lapStatsUnloadHandlerRegistered = false;
        this._lapStatsUnloadHandler = null;
        this.lapStats = typeof this.loadLapStats === 'function' ? this.loadLapStats() : { tracks: {} };

        this.trainingController = typeof window.TrainingController === 'function'
            ? new window.TrainingController(this)
            : null;

        this.initializeManualRewardTracking();

        this.loop = this.loop.bind(this);
        this.initializeNeuralOverlay();
    }
}

applyInitializationMixin(Game);
applyEventMixin(Game);
applyNeuralOverlayMixin(Game);
applyManualRewardMixin(Game);
applyHudMixin(Game);
applyLapTimingMixin(Game);
applyLoopMixin(Game);

export default Game;

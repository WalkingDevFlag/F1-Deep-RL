// Main game logic and loop

class Game {
    constructor() {
        this.canvas = document.getElementById('canvas');
        this.ctx = this.canvas.getContext('2d');
        this.assetLoader = new AssetLoader();
        this.renderer = null;
        this.car = null;
        this.track = null;
        this.camera = null;
        this.controls = new Controls();
        this.offscreenCanvas = document.createElement('canvas');
        this.offscreenCtx = this.offscreenCanvas.getContext('2d', { willReadFrequently: true });
        this.trackImg = null;
        this.carImg = null;
        this.collisionResetTimeout = null;
        this.lastFrameTime = performance.now();
        this.deltaTime = 0;
        this.neuralNetworkVisible = true;
        this.uiElements = {};
    }

    async init() {
        try {
            // Load assets
            const { trackImg, carImg } = await this.assetLoader.loadAssets();
            this.trackImg = trackImg;
            this.carImg = carImg;

            // Setup canvas
            this.canvas.width = window.innerWidth;
            this.canvas.height = window.innerHeight;

            // Setup offscreen canvas for collision detection
            this.offscreenCanvas.width = this.trackImg.width;
            this.offscreenCanvas.height = this.trackImg.height;
            this.offscreenCtx.drawImage(this.trackImg, 0, 0);

            // Initialize car with track image and offscreen context
            this.car = new Car(32, 16, 32, 16, this.trackImg, this.offscreenCtx);
            this.car.setCarImage(this.carImg); // Set actual car dimensions based on image
            
            // Initialize track with ACTUAL car dimensions
            this.track = new Track(this.trackImg, this.offscreenCtx, this.car.actualWidth, this.car.actualHeight);
            const spawnPoint = this.track.initialize();
            
            this.car.reset(spawnPoint);

            // Initialize camera
            this.camera = new Camera(this.canvas.width, this.canvas.height, this.trackImg.width, this.trackImg.height);

            // Setup renderer
            this.renderer = new Renderer(this.canvas, this.ctx);
            this.setupUI();

            // Start game loop
            this.setupEventListeners();
            this.loop();
        } catch (error) {
            console.error('Failed to initialize game:', error);
        }
    }

    setupEventListeners() {
        document.addEventListener('keydown', (e) => {
            if (e.code === 'KeyR') {
                this.resetCar();
            }
            if (e.code === 'KeyC') {
                this.camera.toggleMode();
            }
        });

        window.addEventListener('resize', () => {
            this.canvas.width = window.innerWidth;
            this.canvas.height = window.innerHeight;
            if (this.camera) {
                this.camera.setCanvasSize(this.canvas.width, this.canvas.height);
            }
        });
    }

    setupUI() {
        if (this.uiElements && this.uiElements.hudCard && this.uiElements.hudCard.element instanceof HTMLElement) {
            const { element } = this.uiElements.hudCard;
            if (element.parentElement) {
                element.parentElement.removeChild(element);
            }
        }

        if (!window.UIKit) {
            console.warn('UIKit module not loaded; skipping HUD setup.');
            this.uiElements = {};
            return;
        }

        const sensorsEnabled = this.car ? this.car.sensorsEnabled : true;
        const cameraName = this.camera ? this.camera.getModeName() : "God's Eye View";

    // Compose the HUD card and its controls using the shared UI kit.
        const { createCard, createStatRow, createToggleRow } = window.UIKit;

        const hudCard = createCard({ title: 'Driver Console', overlay: true });
        hudCard.element.setAttribute('aria-label', 'Driver control panel');

        const fpsRow = createStatRow({ label: 'FPS', value: '0' });
        const cameraRow = createStatRow({ label: 'Camera', value: cameraName });
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
                this.neuralNetworkVisible = enabled;
            }
        });

        hudCard.addMany([fpsRow, cameraRow, sensorsRow, nnRow]);
        if (document.body) {
            document.body.appendChild(hudCard.element);
        }

        this.uiElements = {
            hudCard,
            fpsRow,
            cameraRow,
            sensorsRow,
            nnRow
        };

        this.updateHUD();
    }

    updateHUD() {
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
    }

    resetCar() {
        const spawnPoint = this.track.getSpawnPoint();
        this.car.reset(spawnPoint);
        if (this.collisionResetTimeout) {
            clearTimeout(this.collisionResetTimeout);
            this.collisionResetTimeout = null;
        }
    }

    update() {
        // Calculate delta time (in seconds)
        const currentTime = performance.now();
        this.deltaTime = (currentTime - this.lastFrameTime) / 1000;
        this.lastFrameTime = currentTime;
        
        // Get keyboard input
        const keys = this.controls.getKeys();

        // Update car with physics and collision
        const trackBorders = this.track.getBorders();
        this.car.update(keys, this.trackImg, this.offscreenCtx, trackBorders, this.deltaTime);

        // Update camera
        this.camera.update(this.car);

        // Handle collision auto-reset
        if (this.car.damaged && !this.collisionResetTimeout) {
            console.log('Collision detected! Press R to reset.');
            this.collisionResetTimeout = setTimeout(() => {
                if (this.car.damaged) {
                    this.resetCar();
                }
            }, 1500); // Auto-reset after 1.5 seconds
        }

        if (!this.car.damaged && this.collisionResetTimeout) {
            clearTimeout(this.collisionResetTimeout);
            this.collisionResetTimeout = null;
        }
    }

    draw() {
        this.renderer.drawFrame(this.trackImg, this.car, this.carImg, this.camera);
    }

    loop = () => {
        this.update();
        this.draw();
        this.updateHUD();
        requestAnimationFrame(this.loop);
    }
}

// Start game when page loads
window.addEventListener('load', () => {
    const game = new Game();
    game.init();
});

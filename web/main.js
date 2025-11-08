// Main game logic and loop

class Game {
    constructor() {
        this.canvas = document.getElementById('canvas');
        this.ctx = this.canvas.getContext('2d');
        this.assetLoader = new AssetLoader();
        this.renderer = null;
        this.car = null;
        this.track = null;
        this.controls = new Controls();
        this.offscreenCanvas = document.createElement('canvas');
        this.offscreenCtx = this.offscreenCanvas.getContext('2d', { willReadFrequently: true });
        this.trackImg = null;
        this.carImg = null;
        this.collisionResetTimeout = null;
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
            const scaleX = this.canvas.width / this.trackImg.width;
            const scaleY = this.canvas.height / this.trackImg.height;

            // Setup offscreen canvas for collision detection
            this.offscreenCanvas.width = this.trackImg.width;
            this.offscreenCanvas.height = this.trackImg.height;
            this.offscreenCtx.drawImage(this.trackImg, 0, 0);

            // Initialize track
            this.track = new Track(this.trackImg, this.offscreenCtx, 32, 16);
            const spawnPoint = this.track.initialize();

            // Initialize car with track image and offscreen context
            this.car = new Car(32, 16, 32, 16, this.trackImg, this.offscreenCtx);
            this.car.reset(spawnPoint);

            // Setup renderer
            this.renderer = new Renderer(this.canvas, this.ctx);
            this.renderer.setScale(scaleX, scaleY);

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
        });

        window.addEventListener('resize', () => {
            this.canvas.width = window.innerWidth;
            this.canvas.height = window.innerHeight;
            const scaleX = this.canvas.width / this.trackImg.width;
            const scaleY = this.canvas.height / this.trackImg.height;
            this.renderer.setScale(scaleX, scaleY);
        });
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
        // Get keyboard input
        const keys = this.controls.getKeys();

        // Update car with physics and collision
        this.car.update(keys, this.trackImg, this.offscreenCtx);

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
        this.renderer.drawFrame(this.trackImg, this.car, this.carImg);
    }

    loop = () => {
        this.update();
        this.draw();
        requestAnimationFrame(this.loop);
    }
}

// Start game when page loads
window.addEventListener('load', () => {
    const game = new Game();
    game.init();
});

export function applyInitializationMixin(Game) {
    Game.prototype.init = async function init() {
        try {
            const assets = await this.assetLoader.loadAssets();
            this.trackImg = assets.trackImg;
            this.carImg = assets.carImg;
            this.trackMeta = assets.trackMeta;

            this.canvas.width = window.innerWidth;
            this.canvas.height = window.innerHeight;

            this.offscreenCanvas.width = this.trackImg.width;
            this.offscreenCanvas.height = this.trackImg.height;
            this.offscreenCtx.drawImage(this.trackImg, 0, 0);

            this.car = new window.Car(32, 16, 32, 16, this.trackImg, this.offscreenCtx);
            this.car.setCarImage(this.carImg);

            this.track = new window.Track(
                this.trackImg,
                this.offscreenCtx,
                this.car.actualWidth,
                this.car.actualHeight,
                this.trackMeta
            );
            const spawnPoint = await this.track.initialize();
            this.car.reset(spawnPoint);

            if (typeof this.onManualTrackReady === 'function') {
                this.onManualTrackReady();
            }

            if (this.trainingController) {
                this.trainingController.onTrackReady();
            }

            this.camera = new window.Camera(
                this.canvas.width,
                this.canvas.height,
                this.trackImg.width,
                this.trackImg.height
            );

            this.renderer = new window.Renderer(this.canvas, this.ctx);
            this.setupUI();
            this.setupEventListeners();
            this.loop();
        } catch (error) {
            console.error('Failed to initialize game:', error);
        }
    };
}

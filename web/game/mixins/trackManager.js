export function applyTrackManagerMixin(Game) {
    Game.prototype.loadTrackById = async function loadTrackById(trackId, options = {}) {
        if (!trackId) {
            throw new Error('Track ID is required');
        }

        if (this._pendingTrackLoad === trackId) {
            return this.trackMeta;
        }

        if (this._pendingTrackLoad) {
            console.warn('Another track load is already in progress.');
            return this.trackMeta;
        }

        this._pendingTrackLoad = trackId;
        const { suppressUIRefresh = false } = options;

        const previousSensorsEnabled = this.car ? this.car.sensorsEnabled : true;
        const previousNeuralOverlayState = this.neuralNetworkVisible;

        try {
            const trackMeta = await fetchTrackMeta(trackId);
            const trackImg = await loadImage(`/tracks/${trackMeta.id}/${trackMeta.canonical}`);

            this.trackMeta = trackMeta;
            this.trackImg = trackImg;
            if (this.assetLoader) {
                this.assetLoader.trackMeta = trackMeta;
                this.assetLoader.trackImg = trackImg;
            }

            if (!this.offscreenCanvas || !this.offscreenCtx) {
                this.offscreenCanvas = document.createElement('canvas');
                this.offscreenCtx = this.offscreenCanvas.getContext('2d', { willReadFrequently: true });
            }

            this.offscreenCanvas.width = trackImg.width;
            this.offscreenCanvas.height = trackImg.height;
            this.offscreenCtx.clearRect(0, 0, trackImg.width, trackImg.height);
            this.offscreenCtx.drawImage(trackImg, 0, 0);

            const carImg = this.assetLoader && typeof this.assetLoader.getCarImage === 'function'
                ? this.assetLoader.getCarImage()
                : null;

            if (carImg) {
                await ensureImageReady(carImg);
            }

            const car = new window.Car(32, 16, 32, 16, trackImg, this.offscreenCtx);
            if (carImg) {
                car.setCarImage(carImg);
            }
            car.setSensorsEnabled(previousSensorsEnabled);
            this.car = car;

            this.track = new window.Track(
                trackImg,
                this.offscreenCtx,
                this.car.actualWidth,
                this.car.actualHeight,
                trackMeta
            );

            await this.track.initialize();
            this.resetCar();

            this.lapCount = 0;
            this.hasPassedStartLine = false;
            this.lastLapTimeMs = null;
            if (typeof this.ensureTrackStats === 'function') {
                this.ensureTrackStats();
            }

            updateCameraForTrack(this.camera, trackImg);

            if (this.renderer) {
                this.renderer.wallPathCache = new WeakMap();
            }

            this.lastFrameTime = performance.now();
            this.deltaTime = 0;
            this.neuralNetworkVisible = previousNeuralOverlayState;

            if (typeof this.onManualTrackReady === 'function') {
                this.onManualTrackReady();
            }

            if (this.trainingController) {
                this.trainingController.onTrackReady();
            }

            if (!suppressUIRefresh) {
                this.setupUI();
            }

            this._pendingTrackLoad = null;
            return trackMeta;
        } catch (error) {
            this._pendingTrackLoad = null;
            console.error('Failed to load track:', error);
            throw error;
        }
    };
}

async function fetchTrackMeta(trackId) {
    const response = await fetch(`/tracks/load/${encodeURIComponent(trackId)}`);
    if (!response.ok) {
        throw new Error(`Failed to fetch track metadata (${response.status})`);
    }
    const meta = await response.json();
    if (!meta || !meta.id || !meta.canonical) {
        throw new Error('Track metadata is incomplete.');
    }
    return meta;
}

function loadImage(src) {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error(`Failed to load image: ${src}`));
        image.src = src;
    });
}

function ensureImageReady(image) {
    if (image.complete && image.naturalWidth > 0) {
        return Promise.resolve(image);
    }
    return new Promise((resolve, reject) => {
        image.addEventListener('load', () => resolve(image), { once: true });
        image.addEventListener('error', () => reject(new Error('Failed to reload car image.')), { once: true });
    });
}

function updateCameraForTrack(camera, trackImg) {
    if (!camera || !trackImg) {
        return;
    }

    camera.trackWidth = trackImg.width;
    camera.trackHeight = trackImg.height;

    if (typeof camera.calculateGodsEyeView === 'function') {
        camera.calculateGodsEyeView();
    }

    if (camera.currentMode === camera.modes.GODS_EYE) {
        camera.worldX = trackImg.width / 2;
        camera.worldY = trackImg.height / 2;
        camera.targetWorldX = camera.worldX;
        camera.targetWorldY = camera.worldY;
        camera.zoom = camera.godsEyeZoom;
        camera.targetZoom = camera.godsEyeZoom;
        camera.rotation = 0;
        camera.targetRotation = 0;
    }
}

// Asset loader for images

class AssetLoader {
    constructor() {
        this.trackImg = new Image();
        this.carImg = new Image();
        this.loadComplete = false;
    }

    loadAssets() {
        return new Promise((resolve, reject) => {
            let loadedCount = 0;
            const totalAssets = 2;

            this.trackImg.onload = () => {
                console.log('Track image loaded');
                loadedCount++;
                if (loadedCount === totalAssets) {
                    this.loadComplete = true;
                    resolve({ trackImg: this.trackImg, carImg: this.carImg });
                }
            };

            this.carImg.onload = () => {
                console.log('Car image loaded');
                loadedCount++;
                if (loadedCount === totalAssets) {
                    this.loadComplete = true;
                    resolve({ trackImg: this.trackImg, carImg: this.carImg });
                }
            };

            this.trackImg.onerror = () => {
                console.error('Track image failed to load');
                reject('Track image load failed');
            };

            this.carImg.onerror = () => {
                console.error('Car image failed to load');
                reject('Car image load failed');
            };

            // Set image sources
            this.trackImg.src = '/tracks/Albert_Park_Circuit_Melbourne_Track_Transparent.png';
            this.carImg.src = '/cars/car.png';
        });
    }

    getTrackImage() {
        return this.trackImg;
    }

    getCarImage() {
        return this.carImg;
    }
}

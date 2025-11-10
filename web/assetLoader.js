// Asset loader for images

class AssetLoader {
    constructor() {
        this.trackImg = new Image();
        this.carImg = new Image();
        this.trackMeta = null;
        this.loadComplete = false;
    }

    async loadAssets() {
        return new Promise(async (resolve, reject) => {
            try {
                // Get default track
                const defaultTrack = await this.getDefaultTrack();
                this.trackMeta = defaultTrack;

                let loadedCount = 0;
                const totalAssets = 2;

                this.trackImg.onload = () => {
                    console.log('Track image loaded:', this.trackMeta.canonical);
                    loadedCount++;
                    if (loadedCount === totalAssets) {
                        this.loadComplete = true;
                        resolve({ trackImg: this.trackImg, carImg: this.carImg, trackMeta: this.trackMeta });
                    }
                };

                this.carImg.onload = () => {
                    console.log('Car image loaded');
                    loadedCount++;
                    if (loadedCount === totalAssets) {
                        this.loadComplete = true;
                        resolve({ trackImg: this.trackImg, carImg: this.carImg, trackMeta: this.trackMeta });
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
                this.trackImg.src = `/tracks/${this.trackMeta.id}/${this.trackMeta.canonical}`;
                this.carImg.src = '/cars/car.png';
            } catch (error) {
                reject(error);
            }
        });
    }

    async getDefaultTrack() {
        try {
            const response = await fetch('/tracks/list');
            const tracks = await response.json();
            
            if (tracks.length === 0) {
                throw new Error('No tracks available');
            }
            
            // Sort tracks alphabetically by name and pick first
            tracks.sort((a, b) => a.name.localeCompare(b.name));
            return tracks[0];
        } catch (error) {
            console.error('Failed to get default track:', error);
            // Fallback to hardcoded legacy track
            return {
                id: 'albert_park_circuit_melbourne_track_transparent',
                name: 'Albert Park Circuit Melbourne Track Transparent',
                canonical: 'canonical.png'
            };
        }
    }

    getTrackImage() {
        return this.trackImg;
    }

    getCarImage() {
        return this.carImg;
    }

    getTrackMeta() {
        return this.trackMeta;
    }
}

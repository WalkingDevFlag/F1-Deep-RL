// Track spawn point management

class Track {
    constructor(trackImg, offscreenCtx, carWidth, carHeight) {
        this.trackImg = trackImg;
        this.offscreenCtx = offscreenCtx;
        this.carWidth = carWidth;
        this.carHeight = carHeight;
        this.spawnPoint = { x: 400, y: 300, angle: 0 };
    }

    findSafeSpawnPoint() {
        const imageData = this.offscreenCtx.getImageData(0, 0, this.trackImg.width, this.trackImg.height);
        const centerX = Math.floor(this.trackImg.width / 2);
        const centerY = Math.floor(this.trackImg.height / 2);
        
        // Helper to check if entire car fits at position
        const isCarSafe = (testX, testY) => {
            const buffer = 5; // Extra safety margin
            for (let dx = -this.carWidth / 2 - buffer; dx <= this.carWidth / 2 + buffer; dx += 3) {
                for (let dy = -this.carHeight / 2 - buffer; dy <= this.carHeight / 2 + buffer; dy += 3) {
                    const px = Math.floor(testX + dx);
                    const py = Math.floor(testY + dy);
                    
                    // Out of bounds check
                    if (px < 0 || px >= this.trackImg.width || py < 0 || py >= this.trackImg.height) {
                        return false;
                    }
                    
                    const idx = (py * this.trackImg.width + px) * 4;
                    // Off track (transparent area)
                    if (imageData.data[idx + 3] === 0) {
                        return false;
                    }
                }
            }
            return true;
        };
        
        // First try center
        if (isCarSafe(centerX, centerY)) {
            console.log('Spawn: Center position is safe');
            return { x: centerX, y: centerY, angle: Math.PI }; // Face downward
        }
        
        // Search in expanding circles
        for (let radius = 100; radius < Math.max(this.trackImg.width, this.trackImg.height) / 2; radius += 20) {
            for (let angle = 0; angle < Math.PI * 2; angle += 0.2) {
                const testX = Math.floor(centerX + Math.cos(angle) * radius);
                const testY = Math.floor(centerY + Math.sin(angle) * radius);
                
                if (isCarSafe(testX, testY)) {
                    console.log('Spawn: Found safe position at', testX, testY);
                    return { x: testX, y: testY, angle: Math.PI }; // Face downward
                }
            }
        }
        
        // Fallback: scan entire track
        console.warn('Spawn: Scanning entire track for safe position...');
        for (let y = 50; y < this.trackImg.height - 50; y += 30) {
            for (let x = 50; x < this.trackImg.width - 50; x += 30) {
                if (isCarSafe(x, y)) {
                    console.log('Spawn: Found safe position at', x, y, '(fallback scan)');
                    return { x, y, angle: Math.PI };
                }
            }
        }
        
        // Last resort
        console.error('Spawn: No safe position found! Using center anyway.');
        return { x: centerX, y: centerY, angle: Math.PI };
    }

    initialize() {
        this.spawnPoint = this.findSafeSpawnPoint();
        console.log('Found spawn point:', this.spawnPoint);
        return this.spawnPoint;
    }

    getSpawnPoint() {
        return this.spawnPoint;
    }
}

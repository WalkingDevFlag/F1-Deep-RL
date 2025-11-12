// Track spawn point management

class Track {
    constructor(trackImg, offscreenCtx, carWidth, carHeight, trackMeta) {
        this.trackImg = trackImg;
        this.offscreenCtx = offscreenCtx;
        this.carWidth = carWidth;
        this.carHeight = carHeight;
        this.trackMeta = trackMeta;
        this.spawnPoint = { x: 400, y: 300, angle: 0 };
        this.borders = [];
        this.checkpoints = [];
        this.walls = [];
        this.startLine = null;
        this.geometryLoaded = false;
        this._alphaMask = null;
    }

    invalidateAlphaMask() {
        this._alphaMask = null;
    }

    ensureAlphaMask() {
        if (!this.offscreenCtx || !this.trackImg) {
            return null;
        }

        const width = this.trackImg.width;
        const height = this.trackImg.height;

        if (this._alphaMask && this._alphaMask.width === width && this._alphaMask.height === height) {
            return this._alphaMask;
        }

        const imageData = this.offscreenCtx.getImageData(0, 0, width, height);
        const alpha = new Uint8Array(width * height);
        const source = imageData.data;

        for (let i = 0, j = 3; i < alpha.length; i += 1, j += 4) {
            alpha[i] = source[j];
        }

        this._alphaMask = { data: alpha, width, height };
        return this._alphaMask;
    }

    isPixelOnTrack(px, py) {
        const mask = this.ensureAlphaMask();
        if (!mask) {
            return false;
        }

        const { data, width, height } = mask;
        const x = Math.floor(px);
        const y = Math.floor(py);

        if (x < 0 || x >= width || y < 0 || y >= height) {
            return false;
        }

        const idx = y * width + x;
        return data[idx] > 0;
    }

    extractBorders() {
        // Extract track borders from the image
        const mask = this.ensureAlphaMask();
        if (!mask) {
            console.warn('extractBorders: alpha mask unavailable');
            return [];
        }

        const borders = [];
        const step = 5; // Sample every 5 pixels for performance
        const { data, width, height } = mask;
        
        // Scan the image and find border pixels (transition from track to non-track)
        for (let y = 0; y < height; y += step) {
            for (let x = 0; x < width; x += step) {
                const idx = y * width + x;
                const isOnTrack = data[idx] > 0;
                
                if (isOnTrack) {
                    // Check neighbors to see if we're at a border
                    const neighbors = [
                        { dx: step, dy: 0 },
                        { dx: 0, dy: step },
                        { dx: -step, dy: 0 },
                        { dx: 0, dy: -step }
                    ];
                    
                    for (const { dx, dy } of neighbors) {
                        const nx = x + dx;
                        const ny = y + dy;
                        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                            const nIdx = ny * width + nx;
                            const neighborOnTrack = data[nIdx] > 0;
                            
                            if (!neighborOnTrack) {
                                // This is a border pixel - create a small line segment
                                borders.push([
                                    { x: x, y: y },
                                    { x: nx, y: ny }
                                ]);
                            }
                        }
                    }
                }
            }
        }
        
        console.log(`Extracted ${borders.length} border segments`);
        this.borders = borders;
        return borders;
    }

    findSafeSpawnPoint() {
        const mask = this.ensureAlphaMask();
        if (!mask) {
            console.warn('findSafeSpawnPoint: alpha mask unavailable, using center fallback');
            return {
                x: Math.floor(this.trackImg.width / 2),
                y: Math.floor(this.trackImg.height / 2),
                angle: 0
            };
        }

        const { data, width, height } = mask;
        const centerX = Math.floor(width / 2);
        const centerY = Math.floor(height / 2);

        const isOpaque = (px, py) => {
            if (px < 0 || px >= width || py < 0 || py >= height) {
                return false;
            }

            const idx = py * width + px;
            return data[idx] > 0;
        };
        
        // Helper to check if entire car fits at position with given angle
        const isCarSafe = (testX, testY, testAngle = 0) => {
            const buffer = 10; // Extra safety margin
            const halfW = this.carWidth / 2;
            const halfH = this.carHeight / 2;
            
            // Check all four corners of the rotated car
            const corners = [
                { x: -halfW, y: -halfH },
                { x: halfW, y: -halfH },
                { x: halfW, y: halfH },
                { x: -halfW, y: halfH }
            ];
            
            // Check each corner and points along edges
            for (const corner of corners) {
                // Rotate corner
                const rotatedX = testX + corner.x * Math.cos(testAngle) - corner.y * Math.sin(testAngle);
                const rotatedY = testY + corner.x * Math.sin(testAngle) + corner.y * Math.cos(testAngle);
                
                // Check the corner with buffer in all directions
                for (let bx = -buffer; bx <= buffer; bx += 5) {
                    for (let by = -buffer; by <= buffer; by += 5) {
                        const px = Math.floor(rotatedX + bx);
                        const py = Math.floor(rotatedY + by);
                        
                        // Out of bounds check
                        if (!isOpaque(px, py)) {
                            return false;
                        }
                    }
                }
            }
            
            // Also check points along the perimeter
            for (let i = 0; i < corners.length; i++) {
                const start = corners[i];
                const end = corners[(i + 1) % corners.length];
                
                // Check 10 points along each edge
                for (let t = 0; t <= 1; t += 0.1) {
                    const edgeX = start.x + (end.x - start.x) * t;
                    const edgeY = start.y + (end.y - start.y) * t;
                    
                    const rotatedX = testX + edgeX * Math.cos(testAngle) - edgeY * Math.sin(testAngle);
                    const rotatedY = testY + edgeX * Math.sin(testAngle) + edgeY * Math.cos(testAngle);
                    
                    const px = Math.floor(rotatedX);
                    const py = Math.floor(rotatedY);
                    
                    if (!isOpaque(px, py)) {
                        return false;
                    }
                }
            }
            
            return true;
        };
        
        // First try center with different angles
        const testAngles = [0, Math.PI / 2, Math.PI, 3 * Math.PI / 2];
        for (const testAngle of testAngles) {
            if (isCarSafe(centerX, centerY, testAngle)) {
                console.log('Spawn: Center position is safe at angle', testAngle);
                return { x: centerX, y: centerY, angle: testAngle };
            }
        }
        
        // Search in expanding circles
        for (let radius = 50; radius < Math.max(width, height) / 2; radius += 30) {
            for (let angle = 0; angle < Math.PI * 2; angle += 0.3) {
                const testX = Math.floor(centerX + Math.cos(angle) * radius);
                const testY = Math.floor(centerY + Math.sin(angle) * radius);
                
                for (const testAngle of testAngles) {
                    if (isCarSafe(testX, testY, testAngle)) {
                        console.log('Spawn: Found safe position at', testX, testY, 'angle', testAngle);
                        return { x: testX, y: testY, angle: testAngle };
                    }
                }
            }
        }
        
        // Fallback: scan entire track
        console.warn('Spawn: Scanning entire track for safe position...');
        for (let y = 100; y < height - 100; y += 40) {
            for (let x = 100; x < width - 100; x += 40) {
                for (const testAngle of testAngles) {
                    if (isCarSafe(x, y, testAngle)) {
                        console.log('Spawn: Found safe position at', x, y, 'angle', testAngle, '(fallback scan)');
                        return { x, y, angle: testAngle };
                    }
                }
            }
        }
        
        // Last resort
        console.error('Spawn: No safe position found! Using center anyway.');
        return { x: centerX, y: centerY, angle: 0 };
    }

    async initialize() {
        // Try to load geometry.json first
        const geometryLoaded = await this.loadGeometry();
        
        if (!geometryLoaded) {
            // Fallback to border extraction
            console.log('Geometry not found, extracting borders from image...');
            this.extractBorders();
            this.spawnPoint = this.findSafeSpawnPoint();
        }
        
        console.log('Track initialized. Geometry loaded:', this.geometryLoaded);
        console.log('Found spawn point:', this.spawnPoint);
        return this.spawnPoint;
    }

    async loadGeometry() {
        if (!this.trackMeta || !this.trackMeta.id) {
            return false;
        }

        try {
            const response = await fetch(`/tracks/${this.trackMeta.id}/geometry`);
            if (!response.ok) {
                if (response.status === 404) {
                    console.log('No geometry.json found for track:', this.trackMeta.id);
                } else {
                    console.warn('Failed to load geometry:', response.status);
                }
                return false;
            }

            const geometry = await response.json();
            
            // Validate geometry structure
            if (!this.validateGeometry(geometry)) {
                console.warn('Invalid geometry structure, falling back to extraction');
                return false;
            }

            // Apply geometry
            this.applyGeometry(geometry);
            this.geometryLoaded = true;
            console.log('Loaded geometry from geometry.json');
            return true;
            
        } catch (error) {
            console.error('Error loading geometry:', error);
            return false;
        }
    }

    validateGeometry(geometry) {
        if (!geometry || typeof geometry !== 'object') return false;
        if (!geometry.walls || !Array.isArray(geometry.walls)) return false;
        if (!geometry.checkpoints || !Array.isArray(geometry.checkpoints)) return false;
        if (!geometry.spawn || typeof geometry.spawn !== 'object') return false;
        return true;
    }

    applyGeometry(geometry) {
        // Convert geometry walls to borders format expected by car physics
        this.borders = [];
        this.walls = geometry.walls;
        
        // Convert walls to borders (flatten polylines into line segments)
        for (const wall of geometry.walls) {
            if (wall.polyline && Array.isArray(wall.polyline)) {
                for (let i = 0; i < wall.polyline.length - 1; i++) {
                    const p1 = wall.polyline[i];
                    const p2 = wall.polyline[i + 1];
                    this.borders.push([p1, p2]);
                }
            }
        }

        // Set checkpoints
        this.checkpoints = geometry.checkpoints;

        // Set start/finish line
        if (geometry.startLine) {
            this.startLine = geometry.startLine;
        }

        // Set spawn point
        this.spawnPoint = {
            x: geometry.spawn.x,
            y: geometry.spawn.y,
            angle: geometry.spawn.angle || 0
        };

        console.log(`Applied geometry: ${this.borders.length} border segments, ${this.checkpoints.length} checkpoints, startLine: ${this.startLine ? 'yes' : 'no'}`);
    }

    getSpawnPoint() {
        return this.spawnPoint;
    }

    getBorders() {
        return this.borders;
    }

    getWalls() {
        return this.walls;
    }

    getCheckpoints() {
        return this.checkpoints;
    }

    getStartLine() {
        return this.startLine;
    }

    isGeometryLoaded() {
        return this.geometryLoaded;
    }
}

if (typeof window !== 'undefined') {
    window.Track = Track;
}

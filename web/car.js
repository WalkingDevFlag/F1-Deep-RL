// Car object and physics

class Car {
    constructor(x, y, width, height, trackImg, offscreenCtx) {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this.angle = 0;
        this.speed = 0;
        this.acceleration = 0.5;
        this.maxSpeed = 24;
        this.friction = 0.95;
        this.damaged = false;
        this.polygon = [];
        this.sensor = null;
        this.sensorsEnabled = true;
        this.trackImg = trackImg;
        this.offscreenCtx = offscreenCtx;
        this.carImgScale = 0.4; // The scale factor used when drawing the car image
        this.actualWidth = width;
        this.actualHeight = height;
        this.carPolygon = []; // Will be set when car image is loaded
        
        // Cache track image data once for fast collision detection
        this.trackImageData = offscreenCtx.getImageData(0, 0, trackImg.width, trackImg.height);
        this.trackData = this.trackImageData.data;
        this.trackWidth = trackImg.width;
        this.trackHeight = trackImg.height;
    }
    
    setCarImage(carImg) {
        // Update the actual dimensions based on the car image
        if (carImg && carImg.complete && carImg.naturalWidth > 0) {
            this.actualWidth = carImg.width * this.carImgScale;
            this.actualHeight = carImg.height * this.carImgScale;
            this.carPolygon = this.extractCarPolygon(carImg);
            console.log(`Car actual dimensions: ${this.actualWidth} x ${this.actualHeight}`);
        }
    }

    extractCarPolygon(carImg) {
        // Create a temporary canvas to analyze the image
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = carImg.naturalWidth;
        canvas.height = carImg.naturalHeight;
        ctx.drawImage(carImg, 0, 0);
        
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        
        // Find all boundary pixels (non-transparent pixels adjacent to transparent ones)
        const boundaryPixels = [];
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        
        for (let y = 0; y < canvas.height; y++) {
            for (let x = 0; x < canvas.width; x++) {
                const index = (y * canvas.width + x) * 4;
                if (data[index + 3] > 0) { // non-transparent pixel
                    // Check if it's a boundary pixel
                    let isBoundary = false;
                    for (let dy = -1; dy <= 1 && !isBoundary; dy++) {
                        for (let dx = -1; dx <= 1 && !isBoundary; dx++) {
                            if (dx === 0 && dy === 0) continue;
                            const nx = x + dx;
                            const ny = y + dy;
                            if (nx < 0 || ny < 0 || nx >= canvas.width || ny >= canvas.height) {
                                isBoundary = true;
                            } else {
                                const nindex = (ny * canvas.width + nx) * 4;
                                if (data[nindex + 3] === 0) {
                                    isBoundary = true;
                                }
                            }
                        }
                    }
                    if (isBoundary) {
                        boundaryPixels.push({ x: x - centerX, y: y - centerY });
                    }
                }
            }
        }
        
        // Sort boundary pixels by angle from center for proper polygon ordering
        boundaryPixels.sort((a, b) => {
            const angleA = Math.atan2(a.y, a.x);
            const angleB = Math.atan2(b.y, b.x);
            return angleA - angleB;
        });
        
        // Scale the polygon to match the drawing scale
        const scale = this.carImgScale;
        return boundaryPixels.map(p => ({
            x: p.x * scale,
            y: p.y * scale
        }));
    }

    createPolygon() {
        // Use the pre-computed car polygon if available, otherwise fall back to rectangle
        if (this.carPolygon && this.carPolygon.length > 0) {
            // Rotate the car polygon around the car center
            return this.carPolygon.map(point => {
                const rotatedX = this.x + point.x * Math.cos(this.angle) - point.y * Math.sin(this.angle);
                const rotatedY = this.y + point.x * Math.sin(this.angle) + point.y * Math.cos(this.angle);
                return { x: rotatedX, y: rotatedY };
            });
        } else {
            // Fallback to rectangle if no car polygon
            const points = [];
            const halfW = this.actualWidth / 2;
            const halfH = this.actualHeight / 2;
            
            const corners = [
                { x: -halfW, y: -halfH },
                { x: halfW, y: -halfH },
                { x: halfW, y: halfH },
                { x: -halfW, y: halfH }
            ];
            
            for (const corner of corners) {
                const rotatedX = this.x + corner.x * Math.cos(this.angle) - corner.y * Math.sin(this.angle);
                const rotatedY = this.y + corner.x * Math.sin(this.angle) + corner.y * Math.cos(this.angle);
                points.push({ x: rotatedX, y: rotatedY });
            }
            
            return points;
        }
    }

    assessDamage(trackBorders) {
        // Check every single pixel along the perimeter of the car polygon
        // Using cached track data for 100x+ faster performance
        for (let i = 0; i < this.polygon.length; i++) {
            const start = this.polygon[i];
            const end = this.polygon[(i + 1) % this.polygon.length];
            
            // Calculate the distance between points
            const dx = end.x - start.x;
            const dy = end.y - start.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            // Check every pixel along this edge
            const steps = Math.ceil(distance) + 1;
            for (let step = 0; step <= steps; step++) {
                const t = step / steps;
                const x = Math.floor(start.x + dx * t);
                const y = Math.floor(start.y + dy * t);
                
                // Check bounds
                if (x < 0 || y < 0 || x >= this.trackWidth || y >= this.trackHeight) {
                    return true;
                }
                
                // Check if pixel is off track (transparent) using cached data
                // Direct array access is 100x+ faster than getImageData()
                const index = (y * this.trackWidth + x) * 4;
                if (this.trackData[index + 3] === 0) {
                    return true;
                }
            }
        }
        
        return false;
    }

    update(keys, trackImg, offscreenCtx, trackBorders, deltaTime = 0.016) {
        if (!this.damaged) {
            const frameScale = Math.max(deltaTime, 0) * 60;

            // Handle acceleration and deceleration
            if (keys['KeyW'] || keys['ArrowUp']) {
                this.speed = Math.min(this.maxSpeed, this.speed + this.acceleration * frameScale);
            } else {
                const frictionFactor = Math.pow(this.friction, frameScale);
                this.speed *= Number.isFinite(frictionFactor) ? frictionFactor : this.friction;
            }

            // Handle reverse (slower acceleration)
            if (keys['KeyS'] || keys['ArrowDown']) {
                this.speed = Math.max(-this.maxSpeed / 2, this.speed - (this.acceleration / 2) * frameScale);
            }

            // Apply turning (reduce speed slightly when turning)
            let turnSpeed = this.speed;
            if ((keys['KeyA'] || keys['ArrowLeft']) || (keys['KeyD'] || keys['ArrowRight'])) {
                const turnDamping = Math.pow(0.9, frameScale);
                turnSpeed *= Number.isFinite(turnDamping) ? turnDamping : 0.9;
            }

            // Calculate movement using delta time (frameScale normalises to 60 FPS baseline)
            const displacement = turnSpeed * frameScale;
            const moveX = Math.cos(this.angle) * displacement;
            const moveY = Math.sin(this.angle) * displacement;
            
            // Handle turning (rotate angle based on delta time)
            // 1.2 radians per second for slower, more controlled turning
            if (keys['KeyA'] || keys['ArrowLeft']) {
                this.angle -= 1.4 * deltaTime;
            }
            if (keys['KeyD'] || keys['ArrowRight']) {
                this.angle += 1.4 * deltaTime;
            }

            // Move car
            this.x += moveX;
            this.y += moveY;

            // Clamp to bounds
            this.x = Math.max(this.width, Math.min(trackImg.width - this.width, this.x));
            this.y = Math.max(this.height, Math.min(trackImg.height - this.height, this.y));

            // Update polygon
            this.polygon = this.createPolygon();
            
            // Check collision
            this.damaged = this.assessDamage(trackBorders);
        }
        
        // Update sensors
        if (this.sensor && this.sensorsEnabled) {
            this.sensor.update();
        }
    }

    draw(ctx, carImg) {
        // Draw sensor rays first (behind the car)
        if (this.sensor && this.sensorsEnabled) {
            // Apply filter to sensors when car is damaged
            if (this.damaged) {
                ctx.globalAlpha = 0.5;
                ctx.filter = 'grayscale(100%)';
            }
            this.sensor.draw(ctx);
            if (this.damaged) {
                ctx.globalAlpha = 1;
                ctx.filter = 'none';
            }
        }

        // Draw car image
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);
        ctx.filter = this.damaged ? 'grayscale(100%)' : 'none';
        
        if (carImg.complete && carImg.naturalWidth > 0) {
            ctx.drawImage(carImg, -(carImg.width / 2) * this.carImgScale, -(carImg.height / 2) * this.carImgScale, carImg.width * this.carImgScale, carImg.height * this.carImgScale);
        } else {
            ctx.fillStyle = this.damaged ? 'gray' : 'red';
            ctx.fillRect(-this.width / 2, -this.height / 2, this.width, this.height);
        }
        ctx.restore();
    }

    setSensorsEnabled(enabled) {
        this.sensorsEnabled = enabled;
        if (enabled) {
            this.sensor = new Sensor(this);
        } else {
            this.sensor = null;
        }
    }

    reset(spawnPoint) {
        this.x = spawnPoint.x;
        this.y = spawnPoint.y;
        this.angle = spawnPoint.angle;
        this.speed = 0;
        this.damaged = false;
        this.polygon = this.createPolygon();
        if (this.sensorsEnabled) {
            this.sensor = new Sensor(this);
        } else {
            this.sensor = null;
        }
        console.log('Car reset to spawn point:', spawnPoint);
    }

    getState() {
        const offsets = this.sensor ? this.sensor.getNormalizedOffsets() : [];
        return {
            offsets,
            speed: this.speed / this.maxSpeed, // Normalize speed to -1 to 1
            damage: this.damaged ? 1 : 0,
            heading: this.angle / Math.PI // Normalize angle to -1 to 1
        };
    }
}

if (typeof window !== 'undefined') {
    window.Car = Car;
}

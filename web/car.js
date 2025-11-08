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
        this.maxSpeed = 8;
        this.friction = 0.95;
        this.damaged = false;
        this.polygon = [];
        this.sensor = null;
        this.trackImg = trackImg;
        this.offscreenCtx = offscreenCtx;
        this.carImgScale = 0.4; // The scale factor used when drawing the car image
        this.actualWidth = width;
        this.actualHeight = height;
        this.carPolygon = []; // Will be set when car image is loaded
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
                if (x < 0 || y < 0 || x >= this.trackImg.width || y >= this.trackImg.height) {
                    return true;
                }
                
                // Check if pixel is off track (transparent)
                const pixel = this.offscreenCtx.getImageData(x, y, 1, 1).data;
                if (pixel[3] === 0) {
                    return true;
                }
            }
        }
        
        return false;
    }

    update(keys, trackImg, offscreenCtx, trackBorders) {
        if (!this.damaged) {
            // Handle acceleration and deceleration
            if (keys['KeyW'] || keys['ArrowUp']) {
                this.speed = Math.min(this.maxSpeed, this.speed + this.acceleration);
            } else {
                this.speed *= this.friction;
            }
            
            // Handle reverse (slower acceleration)
            if (keys['KeyS'] || keys['ArrowDown']) {
                this.speed = Math.max(-this.maxSpeed / 2, this.speed - this.acceleration / 2);
            }
            
            // Apply turning (reduce speed slightly when turning)
            let turnSpeed = this.speed;
            if ((keys['KeyA'] || keys['ArrowLeft']) || (keys['KeyD'] || keys['ArrowRight'])) {
                turnSpeed *= 0.9; // Slight speed reduction when turning
            }
            
            // Calculate movement
            let moveX = Math.cos(this.angle) * turnSpeed;
            let moveY = Math.sin(this.angle) * turnSpeed;
            
            // Handle turning
            if (keys['KeyA'] || keys['ArrowLeft']) {
                this.angle -= 0.05;
            }
            if (keys['KeyD'] || keys['ArrowRight']) {
                this.angle += 0.05;
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
        if (this.sensor) {
            this.sensor.update();
        }
    }

    draw(ctx, carImg, scaleX, scaleY) {
        // Draw sensor rays first (behind the car)
        if (this.sensor) {
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

        // Calculate actual car image dimensions
        const actualCarWidth = carImg.complete && carImg.naturalWidth > 0 ? carImg.width * 0.4 : this.width;
        const actualCarHeight = carImg.complete && carImg.naturalWidth > 0 ? carImg.height * 0.4 : this.height;

        // Draw car polygon (for debugging)
        if (this.polygon.length > 0) {
            ctx.fillStyle = this.damaged ? "rgba(255, 0, 0, 0.3)" : "rgba(0, 255, 0, 0.2)";
            ctx.beginPath();
            ctx.moveTo(this.polygon[0].x, this.polygon[0].y);
            for (let i = 1; i < this.polygon.length; i++) {
                ctx.lineTo(this.polygon[i].x, this.polygon[i].y);
            }
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = this.damaged ? "darkred" : "lime";
            ctx.lineWidth = 3;
            ctx.stroke();
            
            // Draw all sample points being checked
            for (let i = 0; i < this.polygon.length; i++) {
                const start = this.polygon[i];
                const end = this.polygon[(i + 1) % this.polygon.length];
                
                const dx = end.x - start.x;
                const dy = end.y - start.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                const steps = Math.ceil(distance) + 1;
                
                for (let step = 0; step <= steps; step += 2) { // Show every 2nd point
                    const t = step / steps;
                    const x = start.x + dx * t;
                    const y = start.y + dy * t;
                    
                    ctx.fillStyle = this.damaged ? "red" : "yellow";
                    ctx.beginPath();
                    ctx.arc(x, y, 1.5, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
        }
        
        // Draw car image
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);
        ctx.filter = this.damaged ? 'grayscale(100%)' : 'none';
        
        // Draw a red outline around the actual car image dimensions for debugging
        ctx.strokeStyle = "rgba(255, 0, 255, 0.5)";
        ctx.lineWidth = 2;
        ctx.strokeRect(-actualCarWidth / 2, -actualCarHeight / 2, actualCarWidth, actualCarHeight);
        
        if (carImg.complete && carImg.naturalWidth > 0) {
            ctx.drawImage(carImg, -(carImg.width / 2) * 0.4, -(carImg.height / 2) * 0.4, carImg.width * 0.4, carImg.height * 0.4);
        } else {
            ctx.fillStyle = this.damaged ? 'gray' : 'red';
            ctx.fillRect(-this.width / 2, -this.height / 2, this.width, this.height);
        }
        ctx.restore();
    }

    reset(spawnPoint) {
        this.x = spawnPoint.x;
        this.y = spawnPoint.y;
        this.angle = spawnPoint.angle;
        this.speed = 0;
        this.damaged = false;
        this.polygon = this.createPolygon();
        this.sensor = new Sensor(this);
        console.log('Car reset to spawn point:', spawnPoint);
    }
}

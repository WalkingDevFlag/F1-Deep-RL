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
    }
    
    setCarImage(carImg) {
        // Update the actual dimensions based on the car image
        if (carImg && carImg.complete && carImg.naturalWidth > 0) {
            this.actualWidth = carImg.width * this.carImgScale;
            this.actualHeight = carImg.height * this.carImgScale;
            console.log(`Car actual dimensions: ${this.actualWidth} x ${this.actualHeight}`);
        }
    }

    createPolygon() {
        // Create car rectangle corners using ACTUAL rendered dimensions
        const points = [];
        const halfW = this.actualWidth / 2;
        const halfH = this.actualHeight / 2;
        
        // Base corners (unrotated)
        const corners = [
            { x: -halfW, y: -halfH }, // top-left
            { x: halfW, y: -halfH },  // top-right
            { x: halfW, y: halfH },   // bottom-right
            { x: -halfW, y: halfH }   // bottom-left
        ];
        
        // Rotate each corner around car center
        for (const corner of corners) {
            const rotatedX = this.x + corner.x * Math.cos(this.angle) - corner.y * Math.sin(this.angle);
            const rotatedY = this.y + corner.x * Math.sin(this.angle) + corner.y * Math.cos(this.angle);
            points.push({ x: rotatedX, y: rotatedY });
        }
        
        return points;
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
            // Simple controls - move in direction of angle
            let moveX = 0;
            let moveY = 0;
            
            if (keys['KeyW'] || keys['ArrowUp']) {
                moveX = Math.cos(this.angle) * 3;
                moveY = Math.sin(this.angle) * 3;
            }
            if (keys['KeyS'] || keys['ArrowDown']) {
                moveX = -Math.cos(this.angle) * 2;
                moveY = -Math.sin(this.angle) * 2;
            }
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

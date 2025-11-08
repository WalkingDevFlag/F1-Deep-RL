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
    }

    createPolygon() {
        // Create car rectangle corners
        const points = [];
        const halfW = this.width / 2;
        const halfH = this.height / 2;
        
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

    assessDamage() {
        for (let i = 0; i < this.polygon.length; i++) {
            const point = this.polygon[i];
            const px = Math.floor(point.x);
            const py = Math.floor(point.y);
            if (px < 0 || py < 0 || px >= this.trackImg.width || py >= this.trackImg.height) {
                return true;
            }
            const pixel = this.offscreenCtx.getImageData(px, py, 1, 1).data;
            if (pixel[3] === 0) { // off track
                return true;
            }
        }
        return false;
    }

    update(keys, trackImg, offscreenCtx) {
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
            this.damaged = this.assessDamage();
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

        // Draw car polygon (for debugging)
        if (this.polygon.length > 0) {
            ctx.fillStyle = this.damaged ? "rgba(128, 128, 128, 0.3)" : "rgba(0, 255, 0, 0.2)";
            ctx.beginPath();
            ctx.moveTo(this.polygon[0].x, this.polygon[0].y);
            for (let i = 1; i < this.polygon.length; i++) {
                ctx.lineTo(this.polygon[i].x, this.polygon[i].y);
            }
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = this.damaged ? "darkred" : "green";
            ctx.lineWidth = 2;
            ctx.stroke();
        }
        
        // Draw car image
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);
        ctx.filter = this.damaged ? 'grayscale(100%)' : 'none';
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

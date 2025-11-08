// Main game renderer

class Renderer {
    constructor(canvas, ctx) {
        this.canvas = canvas;
        this.ctx = ctx;
        this.scaleX = 1;
        this.scaleY = 1;
    }

    setScale(scaleX, scaleY) {
        this.scaleX = scaleX;
        this.scaleY = scaleY;
    }

    drawFrame(trackImg, car, carImg) {
        this.ctx.save();
        this.ctx.scale(this.scaleX, this.scaleY);
        
        // Draw background
        this.ctx.fillStyle = '#ffffff';
        this.ctx.fillRect(0, 0, trackImg.width, trackImg.height);
        
        // Draw track
        this.ctx.drawImage(trackImg, 0, 0);
        
        // Draw car (which includes sensors)
        car.draw(this.ctx, carImg, this.scaleX, this.scaleY);
        
        // Draw HUD info
        this.drawHUD(car);
        
        this.ctx.restore();
    }

    drawHUD(car) {
        // Draw sensor info display
        if (car.sensor && car.sensor.readings) {
            this.ctx.save();
            this.ctx.font = '12px Arial';
            this.ctx.fillStyle = car.damaged ? '#ff4444' : '#00ff00';
            
            let yOffset = 20;
            this.ctx.fillText(`Sensors: ${car.sensor.rayCount} (180° spread)`, 10, yOffset);
            yOffset += 20;
            
            // Find closest obstacle
            let closestDistance = Infinity;
            let closestIndex = -1;
            let closestRayLength = 0;
            
            car.sensor.readings.forEach((reading, index) => {
                if (reading) {
                    const distance = Math.sqrt(
                        Math.pow(reading.x - car.x, 2) + 
                        Math.pow(reading.y - car.y, 2)
                    );
                    // Calculate actual ray length for this sensor
                    const ray = car.sensor.rays[index];
                    const rayLength = Math.hypot(ray[1].x - ray[0].x, ray[1].y - ray[0].y);
                    
                    if (distance < closestDistance) {
                        closestDistance = distance;
                        closestIndex = index;
                        closestRayLength = rayLength;
                    }
                }
            });
            
            if (closestIndex >= 0) {
                const percentage = ((closestRayLength - closestDistance) / closestRayLength * 100).toFixed(0);
                this.ctx.fillText(`Closest obstacle: ${percentage}% (${closestIndex + 1})`, 10, yOffset);
            } else {
                this.ctx.fillText('No obstacles detected', 10, yOffset);
            }
            
            this.ctx.restore();
        }
        
        // Draw status
        this.ctx.save();
        this.ctx.font = 'bold 16px Arial';
        this.ctx.fillStyle = car.damaged ? '#ff0000' : '#00ff00';
        this.ctx.fillText(car.damaged ? 'DAMAGED - Press R to Reset' : 'OK', 10, this.canvas.height - 20);
        this.ctx.restore();
    }
}

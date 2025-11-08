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
            this.ctx.fillText(`Sensors: ${car.sensor.rayCount}`, 10, yOffset);
            yOffset += 20;
            
            car.sensor.readings.forEach((reading, index) => {
                const distance = reading ? 
                    Math.sqrt(
                        Math.pow(reading.x - car.x, 2) + 
                        Math.pow(reading.y - car.y, 2)
                    ) : car.sensor.rayLength;
                
                const percentage = ((car.sensor.rayLength - distance) / car.sensor.rayLength * 100).toFixed(0);
                this.ctx.fillText(`Ray ${index + 1}: ${percentage}%`, 10, yOffset);
                yOffset += 15;
            });
            
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

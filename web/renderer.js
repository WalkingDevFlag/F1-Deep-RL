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
        // Draw status
        this.ctx.save();
        this.ctx.font = 'bold 16px Arial';
        this.ctx.fillStyle = car.damaged ? '#ff0000' : '#00ff00';
        this.ctx.fillText(car.damaged ? 'DAMAGED - Press R to Reset' : 'OK', 10, this.canvas.height - 20);
        this.ctx.restore();
    }
}

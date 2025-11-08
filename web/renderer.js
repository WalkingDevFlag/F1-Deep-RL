// Main game renderer

class Renderer {
    constructor(canvas, ctx) {
        this.canvas = canvas;
        this.ctx = ctx;
    }

    drawFrame(trackImg, car, carImg, camera) {
        // Clear canvas
        this.ctx.fillStyle = '#1a1a1a';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Apply camera transformation
        camera.applyTransform(this.ctx, car);
        
        // Draw background
        this.ctx.fillStyle = '#ffffff';
        this.ctx.fillRect(0, 0, trackImg.width, trackImg.height);
        
        // Draw track
        this.ctx.drawImage(trackImg, 0, 0);
        
        // Draw car (which includes sensors)
        car.draw(this.ctx, carImg);
        
        // Restore transformation
        camera.restoreTransform(this.ctx);
        
        // Draw HUD info (outside camera transform)
        this.drawHUD(car, camera);
    }

    drawHUD(car, camera) {
        this.ctx.save();
        
        // Draw status
        this.ctx.font = 'bold 16px Arial';
        this.ctx.fillStyle = car.damaged ? '#ff0000' : '#00ff00';
        this.ctx.fillText(car.damaged ? 'DAMAGED - Press R to Reset' : 'OK', 10, this.canvas.height - 20);
        
        // Draw camera mode
        this.ctx.fillStyle = '#ffffff';
        this.ctx.fillText(`Camera: ${camera.getModeName()} (Press C to toggle)`, 10, 30);
        
        // Draw speed
        this.ctx.fillText(`Speed: ${Math.abs(car.speed).toFixed(1)}`, 10, 55);
        
        this.ctx.restore();
    }
}

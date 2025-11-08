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
        // HUD removed
    }
}

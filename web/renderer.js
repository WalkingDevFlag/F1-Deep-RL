// Main game renderer

class Renderer {
    constructor(canvas, ctx) {
        this.canvas = canvas;
        this.ctx = ctx;
        // FPS measurement
        this.fps = 0;
        this.frames = 0;
        this.lastTime = performance.now();
    }

    drawFrame(trackImg, car, carImg, camera) {
        // Calculate FPS
        const now = performance.now();
        this.frames++;
        if (now - this.lastTime >= 1000) {
            this.fps = Math.round((this.frames * 1000) / (now - this.lastTime));
            this.frames = 0;
            this.lastTime = now;
        }
        
        // Clear canvas with white
        this.ctx.fillStyle = '#ffffff';
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
        
        // Draw FPS
        this.ctx.font = 'bold 16px Arial';
        this.ctx.fillStyle = '#000000';
        this.ctx.fillText(`FPS: ${this.fps}`, 10, 30);
        
        this.ctx.restore();
    }
}

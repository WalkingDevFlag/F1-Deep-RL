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
        
        // Clear canvas with white (single clearRect is most efficient)
        this.ctx.fillStyle = '#ffffff';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Apply camera transformation
        camera.applyTransform(this.ctx, car);
        
        // Draw track (no need for background fill, track image covers everything)
        this.ctx.drawImage(trackImg, 0, 0);
        
        // Draw car (which includes sensors)
        car.draw(this.ctx, carImg);
        
        // Restore transformation
        camera.restoreTransform(this.ctx);
        
        // Draw HUD info (outside camera transform)
        this.drawHUD(car, camera);
    }

    drawHUD(car, camera) {
        // HUD is handled by the DOM overlay in index.html.
    }
}

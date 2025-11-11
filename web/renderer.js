// Main game renderer

class Renderer {
    constructor(canvas, ctx) {
        this.canvas = canvas;
        this.ctx = ctx;
        // FPS measurement
        this.fps = 0;
        this.frames = 0;
        this.lastTime = performance.now();
        // Wall rendering toggle (default OFF for performance)
        this.showWalls = false;
        // Checkpoint rendering toggle (default OFF for performance)
        this.showCheckpoints = false;
        // Start/Finish line rendering toggle (default OFF for performance)
        this.showStartFinish = false;
    }

    drawFrame(trackImg, car, carImg, camera, track = null) {
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
        
        // Draw walls if enabled
        if (this.showWalls && track) {
            this.drawWalls(track);
        }
        
        // Draw checkpoints if enabled
        if (this.showCheckpoints && track) {
            this.drawCheckpoints(track);
        }
        
        // Draw start/finish line if enabled
        if (this.showStartFinish && track) {
            this.drawStartFinish(track);
        }
        
        // Draw car (which includes sensors)
        car.draw(this.ctx, carImg);
        
        // Restore transformation
        camera.restoreTransform(this.ctx);
        
        // Draw HUD info (outside camera transform)
        this.drawHUD(car, camera);
    }

    drawWalls(track) {
        const walls = track.getWalls();
        if (!walls || walls.length === 0) return;

        this.ctx.save();
        this.ctx.strokeStyle = 'rgba(255, 0, 0, 0.5)'; // Semi-transparent red
        this.ctx.lineWidth = 1.5;
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';

        // Batch all walls into a single path for better performance
        this.ctx.beginPath();
        
        for (const wall of walls) {
            if (wall.polyline && Array.isArray(wall.polyline) && wall.polyline.length >= 2) {
                this.ctx.moveTo(wall.polyline[0][0], wall.polyline[0][1]);
                
                for (let i = 1; i < wall.polyline.length; i++) {
                    this.ctx.lineTo(wall.polyline[i][0], wall.polyline[i][1]);
                }
            }
        }
        
        // Single stroke call for all walls
        this.ctx.stroke();
        this.ctx.restore();
    }

    drawCheckpoints(track) {
        const checkpoints = track.getCheckpoints();
        if (!checkpoints || checkpoints.length === 0) return;

        this.ctx.save();
        this.ctx.strokeStyle = 'rgba(0, 128, 0, 0.7)'; // Semi-transparent green
        this.ctx.lineWidth = 2;
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';

        for (const checkpoint of checkpoints) {
            this.ctx.save();
            this.ctx.translate(checkpoint.x, checkpoint.y);
            this.ctx.rotate(checkpoint.angle);

            // Draw rectangle outline
            this.ctx.strokeRect(-checkpoint.width / 2, -checkpoint.height / 2, checkpoint.width, checkpoint.height);

            // Draw checkpoint ID label
            this.ctx.fillStyle = 'rgba(0, 128, 0, 0.9)';
            this.ctx.font = '14px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.fillText(checkpoint.id.toString(), 0, -checkpoint.height / 2 - 8);

            this.ctx.restore();
        }

        this.ctx.restore();
    }

    drawStartFinish(track) {
        const startLine = track.getStartLine();
        if (!startLine) return;

        this.ctx.save();
        this.ctx.strokeStyle = 'rgba(255, 165, 0, 0.8)'; // Semi-transparent orange
        this.ctx.lineWidth = 3;
        this.ctx.lineCap = 'round';

        // Draw the start/finish line
        this.ctx.beginPath();
        this.ctx.moveTo(startLine.x1, startLine.y1);
        this.ctx.lineTo(startLine.x2, startLine.y2);
        this.ctx.stroke();

        // Draw a small label
        const midX = (startLine.x1 + startLine.x2) / 2;
        const midY = (startLine.y1 + startLine.y2) / 2;
        this.ctx.fillStyle = 'rgba(255, 165, 0, 0.9)';
        this.ctx.font = '12px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('S/F', midX, midY - 8);

        this.ctx.restore();
    }

    setShowWalls(show) {
        this.showWalls = Boolean(show);
    }

    setShowCheckpoints(show) {
        this.showCheckpoints = Boolean(show);
    }

    setShowStartFinish(show) {
        this.showStartFinish = Boolean(show);
    }

    drawHUD(car, camera) {
        // HUD is handled by the DOM overlay in index.html.
    }
}

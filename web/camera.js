// Camera system for different view modes

class Camera {
    constructor(canvasWidth, canvasHeight, trackWidth, trackHeight) {
        this.canvasWidth = canvasWidth;
        this.canvasHeight = canvasHeight;
        this.trackWidth = trackWidth;
        this.trackHeight = trackHeight;
        
        // Camera modes
        this.modes = {
            GODS_EYE: 'gods_eye',
            CAR_CAM: 'car_cam'
        };
        this.currentMode = this.modes.GODS_EYE;
        
        // Current camera state
        this.x = 0;
        this.y = 0;
        this.zoom = 1;
        this.rotation = 0;
        
        // Target camera state (for smooth transitions)
        this.targetX = 0;
        this.targetY = 0;
        this.targetZoom = 1;
        this.targetRotation = 0;
        
        // Smooth transition speed (0-1, higher = faster)
        this.lerpSpeed = 0.08;
        
        // Car cam settings
        this.carCamZoom = 3.5; // How much to zoom in for car cam
        this.carCamOffsetY = -50; // Offset to center car nicely in view
        
        // Initialize God's Eye view
        this.calculateGodsEyeView();
    }
    
    calculateGodsEyeView() {
        // Center the track and fit it to canvas
        const scaleX = this.canvasWidth / this.trackWidth;
        const scaleY = this.canvasHeight / this.trackHeight;
        this.godsEyeZoom = Math.min(scaleX, scaleY);
        this.godsEyeX = this.canvasWidth / 2;
        this.godsEyeY = this.canvasHeight / 2;
    }
    
    setCanvasSize(width, height) {
        this.canvasWidth = width;
        this.canvasHeight = height;
        this.calculateGodsEyeView();
        if (this.currentMode === this.modes.GODS_EYE) {
            this.targetX = this.godsEyeX;
            this.targetY = this.godsEyeY;
            this.targetZoom = this.godsEyeZoom;
        }
    }
    
    toggleMode() {
        if (this.currentMode === this.modes.GODS_EYE) {
            this.currentMode = this.modes.CAR_CAM;
        } else {
            this.currentMode = this.modes.GODS_EYE;
            // Reset rotation when going back to God's Eye
            this.targetRotation = 0;
        }
    }
    
    update(car) {
        // Update target based on current mode
        if (this.currentMode === this.modes.CAR_CAM) {
            // Follow car position
            this.targetX = this.canvasWidth / 2;
            this.targetY = this.canvasHeight / 2 + this.carCamOffsetY;
            this.targetZoom = this.godsEyeZoom * this.carCamZoom;
            // Rotate camera to keep car pointing up (inverted)
            this.targetRotation = -car.angle - Math.PI / 2;
        } else {
            // God's Eye view
            this.targetX = this.godsEyeX;
            this.targetY = this.godsEyeY;
            this.targetZoom = this.godsEyeZoom;
            this.targetRotation = 0;
        }
        
        // Smooth interpolation (lerp) to target
        this.x += (this.targetX - this.x) * this.lerpSpeed;
        this.y += (this.targetY - this.y) * this.lerpSpeed;
        this.zoom += (this.targetZoom - this.zoom) * this.lerpSpeed;
        
        // Handle rotation wrapping for shortest path
        let rotationDiff = this.targetRotation - this.rotation;
        // Normalize to -PI to PI range
        while (rotationDiff > Math.PI) rotationDiff -= 2 * Math.PI;
        while (rotationDiff < -Math.PI) rotationDiff += 2 * Math.PI;
        this.rotation += rotationDiff * this.lerpSpeed;
    }
    
    // Apply camera transformation to canvas context
    applyTransform(ctx, car) {
        ctx.save();
        
        // Move to camera center
        ctx.translate(this.x, this.y);
        
        // Apply rotation
        ctx.rotate(this.rotation);
        
        // Apply zoom
        ctx.scale(this.zoom, this.zoom);
        
        // In car cam mode, translate to follow car
        if (this.currentMode === this.modes.CAR_CAM) {
            ctx.translate(-car.x, -car.y);
        } else {
            // In God's Eye mode, center the track
            ctx.translate(-this.trackWidth / 2, -this.trackHeight / 2);
        }
    }
    
    // Restore canvas context after drawing
    restoreTransform(ctx) {
        ctx.restore();
    }
    
    // Get current mode as string for UI display
    getModeName() {
        return this.currentMode === this.modes.GODS_EYE ? "God's Eye View" : "Car Camera";
    }
}

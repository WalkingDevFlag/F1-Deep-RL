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
        
        // Current camera state (in world space)
        this.worldX = 0;
        this.worldY = 0;
        this.zoom = 1;
        this.rotation = 0;
        
        // Target camera state (for smooth transitions)
        this.targetWorldX = 0;
        this.targetWorldY = 0;
        this.targetZoom = 1;
        this.targetRotation = 0;
        
        // Smooth transition speed (0-1, higher = faster)
        this.lerpSpeed = 0.08;
        
        // Car cam settings
        this.carCamZoom = 3.5; // How much to zoom in for car cam
        this.carCamOffsetY = -50; // Offset to center car nicely in view
        
        // Initialize God's Eye view
        this.calculateGodsEyeView();
        this.worldX = this.trackWidth / 2;
        this.worldY = this.trackHeight / 2;
        this.targetWorldX = this.worldX;
        this.targetWorldY = this.worldY;
        this.zoom = this.godsEyeZoom;
        this.targetZoom = this.godsEyeZoom;
    }
    
    calculateGodsEyeView() {
        // Center the track and fit it to canvas
        const scaleX = this.canvasWidth / this.trackWidth;
        const scaleY = this.canvasHeight / this.trackHeight;
        this.godsEyeZoom = Math.min(scaleX, scaleY);
    }
    
    setCanvasSize(width, height) {
        this.canvasWidth = width;
        this.canvasHeight = height;
        this.calculateGodsEyeView();
        if (this.currentMode === this.modes.GODS_EYE) {
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
        
        // Immediately update targets on toggle to start lerp immediately
        this.updateTargets();
    }
    
    updateTargets() {
        // This will be called with the car position in update()
        // But we can call it early on toggle to reduce first frame lag
    }
    
    update(car) {
        // Update target based on current mode
        if (this.currentMode === this.modes.CAR_CAM) {
            // Follow car position in world space
            this.targetWorldX = car.x;
            this.targetWorldY = car.y;
            this.targetZoom = this.godsEyeZoom * this.carCamZoom;
            // Rotate camera to keep car pointing up (inverted)
            this.targetRotation = -car.angle - Math.PI / 2;
        } else {
            // God's Eye view - center on track
            this.targetWorldX = this.trackWidth / 2;
            this.targetWorldY = this.trackHeight / 2;
            this.targetZoom = this.godsEyeZoom;
            this.targetRotation = 0;
        }
        
        // Smooth interpolation (lerp) to target
        this.worldX += (this.targetWorldX - this.worldX) * this.lerpSpeed;
        this.worldY += (this.targetWorldY - this.worldY) * this.lerpSpeed;
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
        
        // Move to screen center
        ctx.translate(this.canvasWidth / 2, this.canvasHeight / 2);
        
        // Apply rotation
        ctx.rotate(this.rotation);
        
        // Apply zoom
        ctx.scale(this.zoom, this.zoom);
        
        // Translate to focus point in world space
        ctx.translate(-this.worldX, -this.worldY);
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

export function applyLoopMixin(Game) {
    Game.prototype.update = function update() {
        const currentTime = performance.now();
        this.deltaTime = (currentTime - this.lastFrameTime) / 1000;
        this.lastFrameTime = currentTime;

        let keys = this.controls.getKeys();
        if (this.trainingController && this.trainingController.isActive()) {
            keys = this.trainingController.getControlKeys(keys);
        }

        const trackBorders = this.track.getBorders();
        this.car.update(keys, this.trackImg, this.offscreenCtx, trackBorders, this.deltaTime);

        if (this.trainingController) {
            this.trainingController.handleFrame({ deltaTime: this.deltaTime });
        }

        if (typeof this.updateManualReward === 'function') {
            this.updateManualReward(this.deltaTime);
        }

        if (this.car.damaged && !this.collisionResetTimeout) {
            console.log('Collision detected! Press R to reset. Auto-reset in 1.5s.');
            this.carHasStartedMoving = false;
            if (this.lapStartTime !== null) {
                this.collisionTime = performance.now() - this.lapStartTime;
                this.lapStartTime = null;
            }
            this.collisionResetTimeout = setTimeout(() => {
                if (this.car.damaged) {
                    this.resetCar();
                }
            }, 1500);
        }

        if (!this.carHasStartedMoving && !this.car.damaged && this.car && Math.abs(this.car.speed) > 0.1) {
            this.carHasStartedMoving = true;
            this.lapStartTime = performance.now();
            console.log('Lap timer started - car is moving!');
        }

        this.camera.update(this.car);

        if (!this.car.damaged && this.track && this.track.getStartLine()) {
            this.checkLapCompletion();
        }

        if (!this.car.damaged && this.collisionResetTimeout) {
            clearTimeout(this.collisionResetTimeout);
            this.collisionResetTimeout = null;
        }
    };

    Game.prototype.draw = function draw() {
        if (this.renderer) {
            this.renderer.drawFrame(this.trackImg, this.car, this.carImg, this.camera, this.track);
        }
    };

    Game.prototype.loop = function loop() {
        this.update();
        this.draw();
        this.updateHUD();
        requestAnimationFrame(this.loop);
    };
}

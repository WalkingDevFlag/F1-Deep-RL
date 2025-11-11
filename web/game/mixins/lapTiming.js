export function applyLapTimingMixin(Game) {
    Game.prototype.resetCar = function resetCar() {
        const spawnPoint = this.track.getSpawnPoint();
        this.car.reset(spawnPoint);
        if (this.collisionResetTimeout) {
            clearTimeout(this.collisionResetTimeout);
            this.collisionResetTimeout = null;
        }

        this.lapStartTime = null;
        this.carHasStartedMoving = false;
        this.collisionTime = null;
        this.lastCarPosition = { x: this.car.x, y: this.car.y };

        if (this.trainingController) {
            this.trainingController.onGameReset();
        }
    };

    Game.prototype.checkLapCompletion = function checkLapCompletion() {
        const startLine = this.track.getStartLine();
        if (!startLine) {
            return;
        }

        const carX = this.car.x;
        const carY = this.car.y;
        const lastX = this.lastCarPosition.x;
        const lastY = this.lastCarPosition.y;

        const crossed = this.lineSegmentIntersect(
            lastX,
            lastY,
            carX,
            carY,
            startLine.x1,
            startLine.y1,
            startLine.x2,
            startLine.y2
        );

        if (crossed && this.carHasStartedMoving) {
            if (this.car.speed > 0) {
                this.completeLap();
            } else {
                console.log('Crossed finish line in reverse - lap not counted');
            }
        }

        this.lastCarPosition.x = carX;
        this.lastCarPosition.y = carY;
    };

    Game.prototype.normalizeAngle = function normalizeAngle(angle) {
        let normalized = angle;
        while (normalized > Math.PI) {
            normalized -= 2 * Math.PI;
        }
        while (normalized < -Math.PI) {
            normalized += 2 * Math.PI;
        }
        return normalized;
    };

    Game.prototype.lineSegmentIntersect = function lineSegmentIntersect(x1, y1, x2, y2, x3, y3, x4, y4) {
        const denom = (y4 - y3) * (x2 - x1) - (x4 - x3) * (y2 - y1);
        if (denom === 0) {
            return false;
        }

        const ua = ((x4 - x3) * (y1 - y3) - (y4 - y3) * (x1 - x3)) / denom;
        const ub = ((x2 - x1) * (y1 - y3) - (y2 - y1) * (x1 - x3)) / denom;

        return ua >= 0 && ua <= 1 && ub >= 0 && ub <= 1;
    };

    Game.prototype.completeLap = function completeLap() {
        this.lapCount += 1;
        this.lapStartTime = performance.now();
        this.carHasStartedMoving = true;
        console.log(`Lap ${this.lapCount} completed!`);
    };
}

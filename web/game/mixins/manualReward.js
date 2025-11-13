export function applyManualRewardMixin(Game) {
    Game.prototype.initializeManualRewardTracking = function initializeManualRewardTracking() {
        const now = typeof performance !== 'undefined' && typeof performance.now === 'function'
            ? performance.now()
            : Date.now();

        this.manualReward = {
            total: 0,
            current: 0,
            prevLapCount: this.lapCount || 0,
            prevProgressWithinLap: 0,
            prevDamaged: false,
            prevSteeringAngle: 0,
            checkpointState: {
                total: 0,
                totalCleared: 0,
                nextIndex: 0,
                distanceNorm: 1,
                progressWithinLap: 0
            },
            collisionSinceLastLap: false,
            justReset: true,
            lastUpdate: now
        };
    };

    Game.prototype.onManualTrackReady = function onManualTrackReady() {
        if (!this.manualReward) {
            this.initializeManualRewardTracking();
        }

        const checkpoints = this.track && typeof this.track.getCheckpoints === 'function'
            ? this.track.getCheckpoints() || []
            : [];
        const total = Array.isArray(checkpoints) ? checkpoints.length : 0;

        const state = this.manualReward.checkpointState;
        state.total = total;
        state.totalCleared = 0;
        state.nextIndex = 0;
        state.distanceNorm = 1;
        state.progressWithinLap = 0;

        this.manualReward.total = 0;
        this.manualReward.current = 0;
        this.manualReward.prevProgressWithinLap = 0;
        this.manualReward.prevLapCount = this.lapCount || 0;
        this.manualReward.prevDamaged = this.car ? !!this.car.damaged : false;
        this.manualReward.prevSteeringAngle = this.car ? this.car.angle || 0 : 0;
        this.manualReward.collisionSinceLastLap = false;
        this.manualReward.justReset = true;
    };

    Game.prototype.resetManualReward = function resetManualReward() {
        if (!this.manualReward) {
            this.initializeManualRewardTracking();
        }

        this.manualReward.total = 0;
        this.manualReward.current = 0;
        this.manualReward.prevLapCount = this.lapCount || 0;
        this.manualReward.prevProgressWithinLap = 0;
        this.manualReward.prevDamaged = this.car ? !!this.car.damaged : false;
        this.manualReward.prevSteeringAngle = this.car ? this.car.angle || 0 : 0;
        this.manualReward.collisionSinceLastLap = false;
        this.manualReward.justReset = true;

        const state = this.manualReward.checkpointState;
        state.totalCleared = 0;
        state.nextIndex = 0;
        state.distanceNorm = 1;
        state.progressWithinLap = 0;
    };

    Game.prototype.updateManualReward = function updateManualReward(deltaTime) {
        if (!this.manualReward) {
            this.initializeManualRewardTracking();
        }

        if (this.trainingController && typeof this.trainingController.isActive === 'function' && this.trainingController.isActive()) {
            this.manualReward.justReset = true;
            this.manualReward.current = 0;
            return;
        }

        if (!this.car || !this.track) {
            return;
        }

        const tracker = this.manualReward;
        const metrics = this.computeManualCheckpointMetrics();

        if (tracker.justReset) {
            tracker.prevProgressWithinLap = metrics.progressWithinLap || 0;
            tracker.prevLapCount = this.lapCount || 0;
            tracker.prevDamaged = this.car ? !!this.car.damaged : false;
            tracker.prevSteeringAngle = this.car ? this.car.angle || 0 : 0;
            tracker.current = 0;
            tracker.justReset = false;
            return;
        }

        const dt = typeof deltaTime === 'number' && deltaTime > 0 ? deltaTime : 0.016;

        let reward = 0;
        reward += metrics.checkpointReward;
        reward += this.computeManualProgressDelta(metrics.progressWithinLap);
        reward += this.computeManualLapReward();
        reward += this.computeManualSpeedReward(dt);
        reward += this.computeManualSmoothDrivingReward(dt);
        reward += this.computeManualCollisionPenalty();

        tracker.current = reward;
        tracker.total += reward;
        tracker.prevDamaged = this.car ? !!this.car.damaged : false;
    };

    Game.prototype.computeManualCheckpointMetrics = function computeManualCheckpointMetrics() {
        const tracker = this.manualReward;
        const checkpoints = this.track && typeof this.track.getCheckpoints === 'function'
            ? this.track.getCheckpoints() || []
            : [];
        const total = Array.isArray(checkpoints) ? checkpoints.length : 0;
        tracker.checkpointState.total = total;

        if (!total || !this.car) {
            tracker.checkpointState.distanceNorm = 1;
            tracker.checkpointState.progressWithinLap = 0;
            return {
                checkpointReward: 0,
                progressWithinLap: 0,
                nextCheckpointIndex: 0
            };
        }

        const state = tracker.checkpointState;
        const nextIndex = state.nextIndex % total;
        const checkpoint = checkpoints[nextIndex];
        if (!checkpoint) {
            state.distanceNorm = 1;
            return {
                checkpointReward: 0,
                progressWithinLap: state.progressWithinLap,
                nextCheckpointIndex: nextIndex
            };
        }

        const dx = this.car.x - checkpoint.x;
        const dy = this.car.y - checkpoint.y;
        const distance = Math.hypot(dx, dy);
        const captureRadius = checkpoint.radius || 180;
        const farRadius = captureRadius * 3;
        const distanceNorm = Math.min(distance / farRadius, 1);
        const progressWithinLap = total > 0
            ? ((state.totalCleared % total) + (1 - distanceNorm)) / total
            : 0;

        let checkpointReward = 0;
        if (distance <= captureRadius) {
            checkpointReward = 11;
            state.totalCleared += 1;
            state.nextIndex = (nextIndex + 1) % total;
        } else {
            state.nextIndex = nextIndex;
        }

        state.distanceNorm = distanceNorm;
        state.progressWithinLap = progressWithinLap % 1;

        return {
            checkpointReward,
            progressWithinLap: state.progressWithinLap,
            nextCheckpointIndex: state.nextIndex
        };
    };

    Game.prototype.computeManualProgressDelta = function computeManualProgressDelta(progressWithinLap) {
        const tracker = this.manualReward;
        if (typeof progressWithinLap !== 'number' || Number.isNaN(progressWithinLap)) {
            return 0;
        }

        const delta = progressWithinLap - tracker.prevProgressWithinLap;
        let reward = 0;

        if (delta > 0) {
            reward += delta * 22;
        } else if (delta < 0) {
            if ((this.lapCount || 0) > tracker.prevLapCount) {
                reward += 0;
            } else {
                reward += delta * 5;
            }
        }

        tracker.prevProgressWithinLap = Math.max(0, progressWithinLap);
        return reward;
    };

    Game.prototype.computeManualLapReward = function computeManualLapReward() {
        const tracker = this.manualReward;
        const currentLap = this.lapCount || 0;
        if (currentLap > tracker.prevLapCount) {
            const delta = currentLap - tracker.prevLapCount;
            tracker.prevLapCount = currentLap;
            tracker.prevProgressWithinLap = 0;

            const state = tracker.checkpointState;
            state.totalCleared = 0;
            state.nextIndex = 0;
            state.distanceNorm = 1;
            state.progressWithinLap = 0;

            let reward = delta * 55;
            if (!tracker.collisionSinceLastLap) {
                reward += 22;
            }
            tracker.collisionSinceLastLap = false;
            return reward;
        }
        return 0;
    };

    Game.prototype.computeManualSpeedReward = function computeManualSpeedReward(deltaTime) {
        const car = this.car;
        if (!car) {
            return 0;
        }

        const dt = typeof deltaTime === 'number' && deltaTime > 0 ? deltaTime : 0.016;
        const speed = car.speed || 0;
        const maxSpeed = car.maxSpeed || 1;
        const forward = Math.max(0, speed / maxSpeed);
        const speedReward = forward * 5.5 * dt;
        const timePenalty = -0.5 * dt;
        return speedReward + timePenalty;
    };

    Game.prototype.computeManualSmoothDrivingReward = function computeManualSmoothDrivingReward(deltaTime) {
        const car = this.car;
        const tracker = this.manualReward;
        const dt = typeof deltaTime === 'number' && deltaTime > 0 ? deltaTime : 0.016;

        if (!car) {
            tracker.prevSteeringAngle = null;
            return 0;
        }

        const angle = car.angle || 0;
        if (tracker.prevSteeringAngle === null || tracker.prevSteeringAngle === undefined) {
            tracker.prevSteeringAngle = angle;
            return 0;
        }

        const angularVelocity = Math.abs(angle - tracker.prevSteeringAngle) / dt;
        tracker.prevSteeringAngle = angle;
        const steadyTolerance = 0.6;
        const smoothness = Math.max(0, steadyTolerance - angularVelocity);
        return smoothness * 4.4 * dt;
    };

    Game.prototype.computeManualCollisionPenalty = function computeManualCollisionPenalty() {
        const tracker = this.manualReward;
        if (this.car && this.car.damaged && !tracker.prevDamaged) {
            tracker.collisionSinceLastLap = true;
            return -20;
        }
        return 0;
    };
}

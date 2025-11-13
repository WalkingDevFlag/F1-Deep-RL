const MANUAL_POLICY_LABELS = {
    forwardSpeed: 'Forward speed reward',
    clearance: 'Clearance reward',
    headingStability: 'Heading stability reward',
    progress: 'Progress reward',
    checkpoint: 'Checkpoint capture reward',
    lapCompletion: 'Lap completion bonus',
    timePenalty: 'Time penalty',
    collisionPenalty: 'Collision penalty',
    steeringPenalty: 'Steering-change penalty',
    reversePenalty: 'Reverse-speed penalty',
    stuckPenalty: 'Stuck/off-track penalty'
};

const MANUAL_POLICY_KEYS = Object.keys(MANUAL_POLICY_LABELS);

const createManualPolicyState = () => MANUAL_POLICY_KEYS.reduce((accumulator, key) => {
    accumulator[key] = false;
    return accumulator;
}, {});

const createManualContributionState = () => MANUAL_POLICY_KEYS.reduce((accumulator, key) => {
    accumulator[key] = 0;
    return accumulator;
}, {});

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
            policyImplemented: createManualPolicyState(),
            contributions: createManualContributionState(),
            policyCheckElapsed: 0,
            policyWarned: false,
            frozen: false,
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
        this.manualReward.policyImplemented = createManualPolicyState();
        this.manualReward.contributions = createManualContributionState();
        this.manualReward.policyCheckElapsed = 0;
        this.manualReward.policyWarned = false;
        this.manualReward.frozen = false;

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

        const tracker = this.manualReward;

        if (this.trainingController && typeof this.trainingController.isActive === 'function' && this.trainingController.isActive()) {
            tracker.justReset = true;
            tracker.current = 0;
            tracker.frozen = false;
            return;
        }

        if (!this.car || !this.track) {
            return;
        }

        if (tracker.frozen) {
            return;
        }

        const contributions = tracker.contributions || createManualContributionState();
        tracker.contributions = contributions;
        MANUAL_POLICY_KEYS.forEach((key) => {
            contributions[key] = 0;
        });

        const policyImplemented = tracker.policyImplemented || createManualPolicyState();
        tracker.policyImplemented = policyImplemented;

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

        contributions.checkpoint = metrics.checkpointReward;
        policyImplemented.checkpoint = true;
        reward += contributions.checkpoint;

        const progressReward = this.computeManualProgressDelta(metrics.progressWithinLap);
        contributions.progress = progressReward;
        policyImplemented.progress = true;
        reward += progressReward;

        const lapReward = this.computeManualLapReward();
        contributions.lapCompletion = lapReward;
        policyImplemented.lapCompletion = true;
        reward += lapReward;

        const clearanceResult = this.computeManualClearanceReward();
        contributions.clearance = clearanceResult.value;
        if (clearanceResult.hasData) {
            policyImplemented.clearance = true;
        }
        reward += clearanceResult.value;

        const speedComponents = this.computeManualSpeedReward(dt);
        contributions.forwardSpeed = speedComponents.forward;
        contributions.timePenalty = speedComponents.timePenalty;
        contributions.reversePenalty = speedComponents.reversePenalty;
        policyImplemented.forwardSpeed = true;
        policyImplemented.timePenalty = true;
        if (Math.abs(speedComponents.reversePenalty) > 1e-6) {
            policyImplemented.reversePenalty = true;
        }
        reward += speedComponents.forward + speedComponents.timePenalty + speedComponents.reversePenalty;

        const headingReward = this.computeManualSmoothDrivingReward(dt);
        contributions.headingStability = headingReward;
        policyImplemented.headingStability = true;
        reward += headingReward;

        const collisionPenalty = this.computeManualCollisionPenalty();
        contributions.collisionPenalty = collisionPenalty;
        policyImplemented.collisionPenalty = true;
        reward += collisionPenalty;

        tracker.current = reward;
        tracker.total += reward;
        tracker.prevDamaged = this.car ? !!this.car.damaged : false;

        if (this.car && this.car.damaged) {
            tracker.frozen = true;
        }

        tracker.policyCheckElapsed += dt;
        if (!tracker.policyWarned && tracker.policyCheckElapsed >= 5) {
            const missingPolicies = [];
            MANUAL_POLICY_KEYS.forEach((key) => {
                if (!policyImplemented[key]) {
                    missingPolicies.push(MANUAL_POLICY_LABELS[key]);
                }
            });

            if (missingPolicies.length > 0) {
                console.warn('Manual episode reward missing policies:', missingPolicies.join(', '));
            }

            tracker.policyWarned = true;
        }
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

    Game.prototype.computeManualClearanceReward = function computeManualClearanceReward() {
        const result = {
            value: 0,
            hasData: false
        };

        const car = this.car;
        if (!car || !car.sensor || !Array.isArray(car.sensor.readings)) {
            return result;
        }

        const readings = car.sensor.readings;
        if (!readings.length) {
            return result;
        }

        let sum = 0;
        let count = 0;
        readings.forEach((reading) => {
            if (reading && typeof reading.offset === 'number') {
                const offset = Math.min(Math.max(reading.offset, 0), 1);
                sum += 1 - offset;
                count += 1;
            }
        });

        if (count === 0) {
            return result;
        }

        result.hasData = true;
        const averageClearance = sum / count;
        result.value = averageClearance * 2.2;
        return result;
    };

    Game.prototype.computeManualSpeedReward = function computeManualSpeedReward(deltaTime) {
        const car = this.car;
        if (!car) {
            return {
                forward: 0,
                timePenalty: 0,
                reversePenalty: 0
            };
        }

        const dt = typeof deltaTime === 'number' && deltaTime > 0 ? deltaTime : 0.016;
        const speed = car.speed || 0;
        const maxSpeed = car.maxSpeed || 1;
        const forward = Math.max(0, speed / Math.max(maxSpeed, 1));
        const speedReward = forward * 5.5 * dt;
        const timePenalty = -0.5 * dt;

        // Reverse penalty not yet implemented (tracked separately)
        const reversePenalty = 0;

        return {
            forward: speedReward,
            timePenalty,
            reversePenalty
        };
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

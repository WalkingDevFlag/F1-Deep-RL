const MANUAL_POLICY_LABELS = {
    checkpoint: 'Checkpoint capture reward',
    progress: 'Progress reward',
    lapCompletion: 'Lap completion bonus',
    forwardSpeed: 'Forward speed reward',
    timePenalty: 'Time penalty',
    reversePenalty: 'Reverse-speed penalty',
    headingStability: 'Heading stability reward',
    collisionPenalty: 'Collision penalty',
    stalledPenalty: 'Idle/stall penalty',
    spawnPenalty: 'Spawn camping penalty'
};

const MANUAL_POLICY_KEYS = Object.keys(MANUAL_POLICY_LABELS);
const DEFAULT_DT = 0.016;

const SPEED_CONFIG = {
    forwardScale: 1.0,
    timePenaltyScale: -0.02,
    reversePenaltyScale: -1.0
};

const INACTIVITY_CONFIG = {
    speedThreshold: 2,
    progressThreshold: 0.0005,
    idleGracePeriod: 1.5,
    idlePenaltyRate: 0.2,
    spawnRadius: 320,
    spawnGracePeriod: 4,
    spawnPenaltyRate: 0.5,
    spawnProgressExit: 0.02,
    postResetGracePeriod: 1.5
};

const createManualPolicyState = () => MANUAL_POLICY_KEYS.reduce((accumulator, key) => {
    accumulator[key] = false;
    return accumulator;
}, {});

const createManualContributionState = () => MANUAL_POLICY_KEYS.reduce((accumulator, key) => {
    accumulator[key] = 0;
    return accumulator;
}, {});

const createInactivityState = () => ({
    idleDuration: 0,
    spawnDuration: 0,
    hasClearedSpawn: false,
    postResetDelay: INACTIVITY_CONFIG.postResetGracePeriod
});

const resolveDeltaTime = (deltaTime) => {
    if (typeof deltaTime === 'number' && Number.isFinite(deltaTime) && deltaTime > 0) {
        return deltaTime;
    }
    return DEFAULT_DT;
};

export function applyManualRewardMixin(Game) {
    Game.prototype.initializeManualRewardTracking = function initializeManualRewardTracking() {
        this.manualReward = {
            total: 0,
            current: 0,
            prevLapCount: this.lapCount || 0,
            prevProgressWithinLap: 0,
            prevDamaged: this.car ? !!this.car.damaged : false,
            prevSteeringAngle: this.car ? this.car.angle || 0 : 0,
            checkpointState: {
                total: 0,
                totalCleared: 0,
                nextIndex: 0,
                distanceNorm: 1,
                progressWithinLap: 0
            },
            collisionSinceLastLap: false,
            justReset: true,
            frozen: false,
            policyImplemented: createManualPolicyState(),
            contributions: createManualContributionState(),
            policyCheckElapsed: 0,
            policyWarned: false,
            spawnPoint: null,
            inactivity: createInactivityState()
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
        this.manualReward.frozen = false;
        this.manualReward.policyImplemented = createManualPolicyState();
        this.manualReward.contributions = createManualContributionState();
        this.manualReward.policyCheckElapsed = 0;
        this.manualReward.policyWarned = false;

        const spawn = this.track && typeof this.track.getSpawnPoint === 'function'
            ? this.track.getSpawnPoint()
            : null;
        this.manualReward.spawnPoint = spawn
            ? { x: spawn.x, y: spawn.y }
            : null;
        this.manualReward.inactivity = createInactivityState();
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
        this.manualReward.frozen = false;
        this.manualReward.policyImplemented = createManualPolicyState();
        this.manualReward.contributions = createManualContributionState();
        this.manualReward.policyCheckElapsed = 0;
        this.manualReward.policyWarned = false;

        const state = this.manualReward.checkpointState;
        state.totalCleared = 0;
        state.nextIndex = 0;
        state.distanceNorm = 1;
        state.progressWithinLap = 0;

        const spawn = this.track && typeof this.track.getSpawnPoint === 'function'
            ? this.track.getSpawnPoint()
            : null;
        this.manualReward.spawnPoint = spawn
            ? { x: spawn.x, y: spawn.y }
            : null;
        this.manualReward.inactivity = createInactivityState();
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

        const dt = resolveDeltaTime(deltaTime);

        const contributions = tracker.contributions || createManualContributionState();
        tracker.contributions = contributions;
        MANUAL_POLICY_KEYS.forEach((key) => {
            contributions[key] = 0;
        });

        const policyImplemented = tracker.policyImplemented || createManualPolicyState();
        tracker.policyImplemented = policyImplemented;

        const metrics = this.computeManualCheckpointMetrics();
        const previousProgress = tracker.prevProgressWithinLap;
        const progressDelta = metrics.progressWithinLap - previousProgress;

        if (tracker.justReset) {
            tracker.prevProgressWithinLap = metrics.progressWithinLap || 0;
            tracker.prevLapCount = this.lapCount || 0;
            tracker.prevDamaged = this.car ? !!this.car.damaged : false;
            tracker.prevSteeringAngle = this.car ? this.car.angle || 0 : 0;
            tracker.current = 0;
            tracker.justReset = false;
            tracker.inactivity = createInactivityState();
            return;
        }

        let reward = 0;

        const checkpointReward = metrics.checkpointReward;
        contributions.checkpoint = checkpointReward;
        policyImplemented.checkpoint = true;
        reward += checkpointReward;

        const progressReward = this.computeManualProgressDelta(metrics.progressWithinLap);
        contributions.progress = progressReward;
        policyImplemented.progress = true;
        reward += progressReward;

        const lapReward = this.computeManualLapReward();
        contributions.lapCompletion = lapReward;
        policyImplemented.lapCompletion = true;
        reward += lapReward;

        const speedComponents = this.computeManualSpeedComponents(dt);
        contributions.forwardSpeed = speedComponents.forward;
        contributions.timePenalty = speedComponents.timePenalty;
        contributions.reversePenalty = speedComponents.reversePenalty;
        policyImplemented.forwardSpeed = true;
        policyImplemented.timePenalty = true;
        policyImplemented.reversePenalty = true;
        reward += speedComponents.forward + speedComponents.timePenalty + speedComponents.reversePenalty;

        const headingReward = this.computeManualSmoothDrivingReward(dt);
        contributions.headingStability = headingReward;
        policyImplemented.headingStability = true;
        reward += headingReward;

        const collisionPenalty = this.computeManualCollisionPenalty();
        contributions.collisionPenalty = collisionPenalty;
        policyImplemented.collisionPenalty = true;
        reward += collisionPenalty;

        const inactivityPenalty = this.computeManualInactivityPenalty({
            deltaTime: dt,
            progressDelta,
            progressWithinLap: metrics.progressWithinLap
        });
        contributions.stalledPenalty = inactivityPenalty.stalledPenalty;
        policyImplemented.stalledPenalty = true;
        reward += inactivityPenalty.stalledPenalty;

        contributions.spawnPenalty = inactivityPenalty.spawnPenalty;
        policyImplemented.spawnPenalty = true;
        reward += inactivityPenalty.spawnPenalty;

        tracker.current = reward;
        tracker.total += reward;
        tracker.prevDamaged = this.car ? !!this.car.damaged : false;

        if (this.car && this.car.damaged) {
            tracker.frozen = true;
        }

        tracker.policyCheckElapsed += dt;
        if (!tracker.policyWarned && tracker.policyCheckElapsed >= 5) {
            const missingPolicies = MANUAL_POLICY_KEYS.filter((key) => !policyImplemented[key])
                .map((key) => MANUAL_POLICY_LABELS[key]);
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
        const state = tracker.checkpointState;
        state.total = total;

        if (!total || !this.car) {
            state.distanceNorm = 1;
            state.progressWithinLap = 0;
            return {
                checkpointReward: 0,
                distanceNorm: 1,
                progressWithinLap: 0,
                nextCheckpointIndex: 0
            };
        }

        const nextIndex = state.nextIndex % total;
        const checkpoint = checkpoints[nextIndex];
        if (!checkpoint) {
            state.distanceNorm = 1;
            return {
                checkpointReward: 0,
                distanceNorm: 1,
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
        const progressWithinLap = ((state.totalCleared % total) + (1 - distanceNorm)) / total;

        let checkpointReward = 0;
        if (distance <= captureRadius) {
            checkpointReward = 1.0;
            state.totalCleared += 1;
            state.nextIndex = (nextIndex + 1) % total;
        } else {
            state.nextIndex = nextIndex;
        }

        state.distanceNorm = distanceNorm;
        state.progressWithinLap = progressWithinLap % 1;

        return {
            checkpointReward,
            distanceNorm,
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
            reward += delta * 5.0;
        } else if (delta < 0) {
            if ((this.lapCount || 0) > tracker.prevLapCount) {
                reward += 0;
            } else {
                reward += delta * 1.5;
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

            let reward = delta * 10;
            if (!tracker.collisionSinceLastLap) {
                reward += 2;
            }
            tracker.collisionSinceLastLap = false;
            return reward;
        }
        return 0;
    };

    Game.prototype.computeManualSpeedComponents = function computeManualSpeedComponents(dt) {
        const car = this.car;
        if (!car) {
            return { forward: 0, timePenalty: 0, reversePenalty: 0 };
        }

        const delta = resolveDeltaTime(dt);
        const speed = car.speed || 0;
        const maxSpeed = car.maxSpeed || 1;
        const forwardRatio = Math.max(0, speed / Math.max(maxSpeed, 1));
        const forward = forwardRatio * SPEED_CONFIG.forwardScale * delta;
        const timePenalty = SPEED_CONFIG.timePenaltyScale * delta;
        const reverseRatio = Math.max(0, -speed / Math.max(maxSpeed, 1));
        const reversePenalty = reverseRatio * SPEED_CONFIG.reversePenaltyScale * delta;

        return { forward, timePenalty, reversePenalty };
    };

    Game.prototype.computeManualSmoothDrivingReward = function computeManualSmoothDrivingReward(deltaTime) {
        const car = this.car;
        const tracker = this.manualReward;
        const dt = resolveDeltaTime(deltaTime);

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
            return -5;
        }
        return 0;
    };

    Game.prototype.computeManualInactivityPenalty = function computeManualInactivityPenalty({ deltaTime, progressDelta, progressWithinLap }) {
        const tracker = this.manualReward;
        const inactivity = tracker.inactivity || createInactivityState();
        tracker.inactivity = inactivity;

        const dt = resolveDeltaTime(deltaTime);

        if (dt <= 0) {
            return { stalledPenalty: 0, spawnPenalty: 0 };
        }

        if (inactivity.postResetDelay > 0) {
            inactivity.postResetDelay = Math.max(0, inactivity.postResetDelay - dt);
            return { stalledPenalty: 0, spawnPenalty: 0 };
        }

        const car = this.car;
        if (!car) {
            inactivity.idleDuration = 0;
            inactivity.spawnDuration = 0;
            return { stalledPenalty: 0, spawnPenalty: 0 };
        }

        const speed = Math.abs(car.speed || 0);
        const absProgressDelta = Math.abs(progressDelta || 0);
        const moving = speed > INACTIVITY_CONFIG.speedThreshold;
        const makingProgress = absProgressDelta > INACTIVITY_CONFIG.progressThreshold;

        let stalledPenalty = 0;
        if (!moving && !makingProgress) {
            inactivity.idleDuration += dt;
            if (inactivity.idleDuration > INACTIVITY_CONFIG.idleGracePeriod) {
                stalledPenalty += -INACTIVITY_CONFIG.idlePenaltyRate * dt;
            }
        } else {
            inactivity.idleDuration = 0;
        }

        const spawnPoint = tracker.spawnPoint;
        let inSpawnRadius = false;
        if (spawnPoint) {
            const dx = (car.x || 0) - spawnPoint.x;
            const dy = (car.y || 0) - spawnPoint.y;
            const distance = Math.hypot(dx, dy);
            inSpawnRadius = distance <= INACTIVITY_CONFIG.spawnRadius;

            if (!inactivity.hasClearedSpawn && (progressWithinLap > INACTIVITY_CONFIG.spawnProgressExit || distance > INACTIVITY_CONFIG.spawnRadius * 1.25)) {
                inactivity.hasClearedSpawn = true;
            }
        }

        let spawnPenalty = 0;
        if (inSpawnRadius) {
            inactivity.spawnDuration += dt;
            if (inactivity.spawnDuration > INACTIVITY_CONFIG.spawnGracePeriod) {
                spawnPenalty += -INACTIVITY_CONFIG.spawnPenaltyRate * dt;
            }
        } else {
            inactivity.spawnDuration = 0;
        }

        const maxFramePenalty = -Math.max(INACTIVITY_CONFIG.idlePenaltyRate, INACTIVITY_CONFIG.spawnPenaltyRate) * dt * 1.5;
        const combined = stalledPenalty + spawnPenalty;
        if (combined < maxFramePenalty) {
            const scale = maxFramePenalty / Math.min(-1e-6, combined);
            stalledPenalty *= scale;
            spawnPenalty *= scale;
        }

        return {
            stalledPenalty,
            spawnPenalty
        };
    };
}

(function (global) {
    const DEFAULT_DT = 0.016;
    const CONSOLE_METHODS = ['log', 'info', 'warn', 'error'];
    const CLIENT_LOG_ENDPOINT = '/training/client-log';

    const attachConsoleMirroring = () => {
        if (!global || global.__trainingConsoleMirrored) {
            return;
        }

        const consoleRef = global.console;
        if (!consoleRef) {
            return;
        }

        const serialiseArgument = (value) => {
            if (typeof value === 'string') {
                return value;
            }
            try {
                return JSON.stringify(value);
            } catch (error) {
                return String(value);
            }
        };

        const sendToServer = (level, args) => {
            try {
                const payload = {
                    level,
                    messages: args.map(serialiseArgument),
                    timestamp: Date.now(),
                };
                if (typeof global.fetch === 'function') {
                    global.fetch(CLIENT_LOG_ENDPOINT, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload),
                        keepalive: true,
                    }).catch(() => {});
                }
            } catch (error) {
                // Swallow log transport errors
            }
        };

        CONSOLE_METHODS.forEach((method) => {
            const original = consoleRef[method];
            if (typeof original !== 'function') {
                return;
            }
            consoleRef[method] = function patchedConsoleMethod(...args) {
                original.apply(consoleRef, args);
                sendToServer(method, args);
            };
        });

        global.__trainingConsoleMirrored = true;
    };

    attachConsoleMirroring();

    const resolveDeltaTime = (deltaTime) => {
        if (typeof deltaTime === 'number' && Number.isFinite(deltaTime) && deltaTime > 0) {
            return deltaTime;
        }
        return DEFAULT_DT;
    };

    const SPEED_CONFIG = {
        forwardScale: 5.5,
        timePenaltyScale: -0.5,
        reversePenaltyScale: -6
    };

    const INACTIVITY_CONFIG = {
        speedThreshold: 2,
        progressThreshold: 0.0005,
        idleGracePeriod: 1.5,
        idlePenaltyRate: 4,
        spawnRadius: 320,
        spawnGracePeriod: 4,
        spawnPenaltyRate: 6,
        spawnProgressExit: 0.02,
        postResetGracePeriod: 1.5
    };

    const createInactivityState = () => ({
        idleDuration: 0,
        spawnDuration: 0,
        hasClearedSpawn: false,
        postResetDelay: INACTIVITY_CONFIG.postResetGracePeriod
    });

    class TrainingController {
        constructor(game) {
            this.game = game;
            this.enabled = false;
            this.agentOptions = {};
            this.selectedAgent = 'DQN';
            this.sampleQueue = [];
            this.inFlight = false;
            this.currentAction = 0;
            this.previousStateVector = null;
            this.resetFlag = false;
            this.stateSize = 19;
            this.actionSize = 7;
            this.prevLapCount = 0;
            this.prevProgressWithinLap = 0;
            this.prevDamaged = false;
            this.pendingAutoReset = false;
            this.statusMessage = 'Idle';
            this.ui = { card: null, select: null, button: null, status: null, statsCard: null, timeElapsed: null, resetCount: null, episodeReward: null, pauseButton: null };
            this.checkpointState = {
                total: 0,
                nextIndex: 0,
                totalCleared: 0,
                distanceNorm: 1,
                progressWithinLap: 0,
            };
            this.prevSteeringAngle = null;
            this.collisionSinceLastLap = false;
            this._agentsLoaded = false;
            // Stats tracking
            this.trainingStartTime = null;
            this.resetCount = 0;
            this.currentReward = 0;
            this.totalReward = 0;
            this.isPaused = false;
            this.pauseStartTime = null;
            this.pausedElapsedTrainingTime = 0;
            this.pausedElapsedLapTime = 0;
            this.spawnPoint = null;
            this.inactivityState = createInactivityState();
            this.currentEpsilon = 0.0;
            this.currentSteps = 0;
        }

        async attachUI() {
            if (!global.UIKit || this.ui.card) {
                return;
            }
            await this.ensureAgentsLoaded();
            const { createCard } = global.UIKit;

            // Control Card
            const card = createCard({ title: 'Training Control', overlay: true, classNames: ['training-card'] });

            const agentField = document.createElement('label');
            agentField.className = 'training-card__field';

            const agentLabel = document.createElement('span');
            agentLabel.className = 'training-card__label';
            agentLabel.textContent = 'Agent';

            const select = document.createElement('select');
            select.className = 'training-card__select';

            Object.entries(this.agentOptions).forEach(([key, meta]) => {
                const option = document.createElement('option');
                option.value = key;
                option.textContent = meta && meta.label ? meta.label : key;
                select.appendChild(option);
            });

            if (select.options.length === 0) {
                const option = document.createElement('option');
                option.value = 'DQN';
                option.textContent = 'DQN';
                select.appendChild(option);
                this.agentOptions = { DQN: { label: 'DQN' } };
            }

            if (this.selectedAgent in this.agentOptions) {
                select.value = this.selectedAgent;
            }

            select.addEventListener('change', (event) => {
                this.selectedAgent = event.target.value;
            });

            agentField.appendChild(agentLabel);
            agentField.appendChild(select);

            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'training-card__button';
            button.textContent = 'Start Training';
            button.addEventListener('click', () => {
                if (this.enabled) {
                    this.stopTraining();
                } else {
                    this.startTraining();
                }
            });

            const status = document.createElement('div');
            status.className = 'training-card__status';
            status.textContent = this.statusMessage;

            card.add(agentField);
            card.add(button);
            card.add(status);

            document.body.appendChild(card.element);

            // Stats Card
            const statsCard = createCard({ title: 'Training Stats', overlay: true, classNames: ['training-stats-card'] });

            const timeElapsedRow = this.createStatRow('Time Elapsed', '00:00:00');
            const resetCountRow = this.createStatRow('Reset Count', '0');
            const episodeRewardRow = this.createStatRow('Episode Reward', '0.00');
            const epsilonRow = this.createStatRow('Epsilon', '0.00');
            const stepsRow = this.createStatRow('Steps', '0');

            const pauseButton = document.createElement('button');
            pauseButton.type = 'button';
            pauseButton.className = 'training-card__button training-card__button--secondary';
            pauseButton.textContent = 'Pause';
            pauseButton.disabled = true;
            pauseButton.addEventListener('click', () => {
                this.togglePause();
            });

            statsCard.add(timeElapsedRow);
            statsCard.add(resetCountRow);
            statsCard.add(episodeRewardRow);
            statsCard.add(epsilonRow);
            statsCard.add(stepsRow);
            statsCard.add(pauseButton);

            document.body.appendChild(statsCard.element);

            this.ui = {
                card, select, button, status,
                statsCard, timeElapsed: timeElapsedRow, resetCount: resetCountRow, episodeReward: episodeRewardRow, epsilon: epsilonRow, steps: stepsRow, pauseButton
            };
            this.updateUIState();
        }

        createStatRow(label, initialValue) {
            const row = document.createElement('div');
            row.className = 'ui-row ui-row--stat';

            const labelEl = document.createElement('span');
            labelEl.className = 'ui-row__label';
            labelEl.textContent = label;

            const valueEl = document.createElement('span');
            valueEl.className = 'ui-row__value';
            valueEl.textContent = initialValue;

            row.appendChild(labelEl);
            row.appendChild(valueEl);

            // Add a setValue method to the row
            row.setValue = (value) => {
                valueEl.textContent = value;
            };

            return row;
        }

        togglePause() {
            if (!this.enabled) return;
            this.isPaused = !this.isPaused;
            if (this.isPaused) {
                // Pausing: freeze elapsed times
                if (this.trainingStartTime) {
                    this.pausedElapsedTrainingTime = performance.now() - this.trainingStartTime;
                }
                if (this.game && this.game.lapStartTime !== null) {
                    this.pausedElapsedLapTime = performance.now() - this.game.lapStartTime;
                }
            } else {
                // Resuming: adjust start times so they produce the frozen elapsed values
                if (this.trainingStartTime) {
                    this.trainingStartTime = performance.now() - this.pausedElapsedTrainingTime;
                }
                if (this.game) {
                    this.game.lapStartTime = performance.now() - this.pausedElapsedLapTime;
                }
            }
            this.updateStatus(this.isPaused ? 'Paused' : 'Running');
            this.updateUIState();
        }

        async ensureAgentsLoaded() {
            if (this._agentsLoaded) {
                return;
            }
            try {
                const response = await fetch('/training/agents');
                if (response.ok) {
                    const payload = await response.json();
                    this.agentOptions = payload.agents || { DQN: { label: 'DQN' } };
                    if (payload.config) {
                        if (typeof payload.config.state_size === 'number') {
                            this.stateSize = payload.config.state_size;
                        }
                        if (typeof payload.config.action_size === 'number') {
                            this.actionSize = payload.config.action_size;
                        }
                    }
                } else {
                    this.agentOptions = { DQN: { label: 'DQN' } };
                }
            } catch (error) {
                console.error('Failed to fetch training agents', error);
                this.agentOptions = { DQN: { label: 'DQN' } };
            }
            this._agentsLoaded = true;
        }

        updateUIState() {
            if (this.ui.button) {
                this.ui.button.textContent = this.enabled ? 'Stop Training' : 'Start Training';
                this.ui.button.disabled = this.ui.button.classList.contains('training-card__button--busy');
            }
            if (this.ui.select) {
                this.ui.select.disabled = this.enabled;
                if (this.selectedAgent in this.agentOptions) {
                    this.ui.select.value = this.selectedAgent;
                }
            }
            if (this.ui.status) {
                this.ui.status.textContent = this.statusMessage;
            }
            if (this.ui.pauseButton) {
                this.ui.pauseButton.disabled = !this.enabled;
                this.ui.pauseButton.textContent = this.isPaused ? 'Resume' : 'Pause';
            }
        }

        setUIBusy(isBusy) {
            if (this.ui.button) {
                if (isBusy) {
                    this.ui.button.classList.add('training-card__button--busy');
                } else {
                    this.ui.button.classList.remove('training-card__button--busy');
                }
                this.ui.button.disabled = isBusy;
            }
            if (this.ui.select && !this.enabled) {
                this.ui.select.disabled = isBusy;
            }
        }

        updateStatus(message) {
            this.statusMessage = message;
            if (this.ui.status) {
                this.ui.status.textContent = message;
            }
        }

        async startTraining() {
            await this.ensureAgentsLoaded();
            this.setUIBusy(true);
            this.updateStatus('Starting…');
            try {
                const response = await fetch('/training/start', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ agent: this.selectedAgent }),
                });
                if (!response.ok) {
                    const payload = await response.json().catch(() => ({}));
                    throw new Error(payload.error || 'Server rejected start request');
                }
                await response.json().catch(() => ({}));
                this.enabled = true;
                this.sampleQueue = [];
                this.inFlight = false;
                this.currentAction = 0;
                this.previousStateVector = null;
                this.resetFlag = true;
                this.prevLapCount = this.game.lapCount || 0;
                this.prevProgressWithinLap = 0;
                this.prevDamaged = this.game.car ? this.game.car.damaged : false;
                this.prevSteeringAngle = this.game.car ? this.game.car.angle || 0 : 0;
                this.collisionSinceLastLap = false;
                this.checkpointState.totalCleared = 0;
                this.checkpointState.nextIndex = 0;
                this.checkpointState.distanceNorm = 1;
                this.checkpointState.progressWithinLap = 0;
                // Initialize stats
                this.trainingStartTime = performance.now();
                this.resetCount = 0;
                this.currentReward = 0;
                this.totalReward = 0;
                this.isPaused = false;
                this.pausedElapsedTrainingTime = 0;
                this.pausedElapsedLapTime = 0;
                this.currentEpsilon = 0.0;
                this.currentSteps = 0;
                this.inactivityState = createInactivityState();
                this.updateStatus('Running');
            } catch (error) {
                console.error('Failed to start training', error);
                this.updateStatus('Error');
                alert(`Failed to start training: ${error.message}`);
                this.enabled = false;
            } finally {
                this.setUIBusy(false);
                this.updateUIState();
            }
        }

        async stopTraining() {
            this.setUIBusy(true);
            this.updateStatus('Stopping…');
            try {
                const response = await fetch('/training/stop', { method: 'POST' });
                if (!response.ok) {
                    const payload = await response.json().catch(() => ({}));
                    throw new Error(payload.error || 'Server rejected stop request');
                }
                await response.json().catch(() => ({}));
            } catch (error) {
                console.error('Failed to stop training', error);
                alert(`Failed to stop training: ${error.message}`);
            } finally {
                this.enabled = false;
                this.sampleQueue = [];
                this.inFlight = false;
                this.currentAction = 0;
                this.previousStateVector = null;
                this.resetFlag = false;
                this.prevSteeringAngle = null;
                this.collisionSinceLastLap = false;
                // Reset stats
                this.trainingStartTime = null;
                this.resetCount = 0;
                this.currentReward = 0;
                this.totalReward = 0;
                this.isPaused = false;
                this.pausedElapsedTrainingTime = 0;
                this.pausedElapsedLapTime = 0;
                this.currentEpsilon = 0.0;
                this.currentSteps = 0;
                this.inactivityState = createInactivityState();
                this.updateStatus('Idle');
                this.setUIBusy(false);
                this.updateUIState();
                if (this.game && typeof this.game.clearNeuralSnapshot === 'function') {
                    this.game.clearNeuralSnapshot();
                }
            }
        }

        isActive() {
            return this.enabled;
        }

        getControlKeys(fallbackKeys = {}) {
            if (!this.enabled || this.isPaused) {
                return fallbackKeys;
            }
            const keys = {
                KeyW: false,
                KeyA: false,
                KeyS: false,
                KeyD: false,
                ArrowUp: false,
                ArrowLeft: false,
                ArrowDown: false,
                ArrowRight: false,
            };
            const mapping = {
                0: [],
                1: ['KeyW', 'ArrowUp'],
                2: ['KeyW', 'ArrowUp', 'KeyA', 'ArrowLeft'],
                3: ['KeyW', 'ArrowUp', 'KeyD', 'ArrowRight'],
                4: ['KeyS', 'ArrowDown'],
                5: ['KeyS', 'ArrowDown', 'KeyA', 'ArrowLeft'],
                6: ['KeyS', 'ArrowDown', 'KeyD', 'ArrowRight'],
            };
            const codes = mapping[this.currentAction] || [];
            codes.forEach((code) => {
                keys[code] = true;
            });
            return keys;
        }

        handleFrame({ deltaTime }) {
            if (!this.enabled || !this.game || !this.game.car || this.isPaused) {
                return;
            }

            const checkpointMetrics = this.computeCheckpointMetrics();
            const previousProgress = this.prevProgressWithinLap;
            const progressDelta = checkpointMetrics.progressWithinLap - previousProgress;
            const stateVector = this.buildStateVector();
            if (!stateVector || stateVector.length !== this.stateSize) {
                return;
            }

            const prevState = this.previousStateVector;
            const prevAction = prevState ? this.currentAction : null;
            let reward = 0;

            if (prevState) {
                reward += checkpointMetrics.checkpointReward;
                reward += this.computeProgressDelta(checkpointMetrics.progressWithinLap);
                reward += this.computeLapReward();
                reward += this.computeSpeedReward(deltaTime);
                reward += this.computeSmoothDrivingReward(deltaTime);
                reward += this.computeCollisionPenalty();
                reward += this.computeInactivityPenalty({
                    deltaTime,
                    progressDelta,
                    progressWithinLap: checkpointMetrics.progressWithinLap
                });
            }

            // Update current reward
            this.currentReward = reward;
            this.totalReward += reward;

            const done = !!this.game.car.damaged;
            const sample = {
                state: stateVector,
                prev_state: prevState,
                prev_action: prevAction,
                reward: prevState ? reward : 0,
                done,
                reset: this.resetFlag,
                metadata: {
                    lapCount: this.game.lapCount || 0,
                    lapTimeMs: this.currentLapTimeMs(),
                    checkpointIndex: checkpointMetrics.nextCheckpointIndex,
                },
            };

            this.enqueueSample(sample);

            if (done && !this.pendingAutoReset) {
                this.scheduleAutoReset();
            }

            if (!done) {
                this.previousStateVector = stateVector;
            } else {
                this.previousStateVector = null;
            }

            this.resetFlag = false;
            this.prevDamaged = this.game.car.damaged;

            // Update UI stats
            this.updateStatsDisplay();
        }

        enqueueSample(sample) {
            this.sampleQueue.push(sample);
            this.drainQueue();
        }

        drainQueue() {
            if (this.inFlight || this.sampleQueue.length === 0) {
                return;
            }
            const nextSample = this.sampleQueue.shift();
            if (!nextSample) {
                return;
            }
            this.inFlight = true;
            this.sendSample(nextSample)
                .catch((error) => {
                    console.error('Training step failed', error);
                    this.updateStatus('Error');
                })
                .finally(() => {
                    this.inFlight = false;
                    this.drainQueue();
                });
        }

        async sendSample(sample) {
            const payload = {
                agent: this.selectedAgent,
                state: Array.from(sample.state),
                reward: sample.reward,
                done: sample.done,
                reset: sample.reset,
                metadata: sample.metadata,
            };
            if (sample.prev_state) {
                payload.prev_state = Array.from(sample.prev_state);
            }
            if (typeof sample.prev_action === 'number') {
                payload.prev_action = sample.prev_action;
            }
            const wantsSnapshot = this.game && typeof this.game.shouldRequestNeuralSnapshot === 'function'
                ? this.game.shouldRequestNeuralSnapshot()
                : false;
            payload.include_snapshot = wantsSnapshot;

            const response = await fetch('/training/step', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                const message = await response.json().catch(() => ({}));
                throw new Error(message.error || `HTTP ${response.status}`);
            }

            const data = await response.json().catch(() => ({}));

            if (typeof data.action === 'number') {
                this.currentAction = data.action;
            }

            // Update stats from server response
            if (typeof data.epsilon === 'number') {
                this.currentEpsilon = data.epsilon;
            }
            if (typeof data.total_steps === 'number') {
                this.currentSteps = data.total_steps;
            }

            if (wantsSnapshot && data && typeof data.network_snapshot === 'object') {
                if (this.game && typeof this.game.handleNeuralSnapshot === 'function') {
                    this.game.handleNeuralSnapshot(data.network_snapshot);
                }
            } else if (wantsSnapshot && this.game && typeof this.game.markNeuralSnapshotStale === 'function') {
                this.game.markNeuralSnapshotStale();
            }

            if (data.running === false && this.enabled) {
                this.enabled = false;
                this.sampleQueue = [];
                this.previousStateVector = null;
                this.updateStatus('Idle');
                this.updateUIState();
                if (this.game && typeof this.game.clearNeuralSnapshot === 'function') {
                    this.game.clearNeuralSnapshot();
                }
            } else if (data.running) {
                this.updateStatus('Running');
            }
        }

        computeCheckpointMetrics() {
            const track = this.game.track;
            const checkpoints = track && typeof track.getCheckpoints === 'function'
                ? track.getCheckpoints() || []
                : [];
            const total = Array.isArray(checkpoints) ? checkpoints.length : 0;
            this.checkpointState.total = total;

            if (!total || !this.game.car) {
                this.checkpointState.distanceNorm = 1;
                this.checkpointState.progressWithinLap = 0;
                return {
                    checkpointReward: 0,
                    distanceNorm: 1,
                    progressWithinLap: 0,
                    nextCheckpointIndex: 0,
                };
            }

            const nextIndex = this.checkpointState.nextIndex % total;
            const checkpoint = checkpoints[nextIndex];
            const dx = this.game.car.x - checkpoint.x;
            const dy = this.game.car.y - checkpoint.y;
            const distance = Math.hypot(dx, dy);
            const captureRadius = checkpoint.radius || 180;
            const farRadius = captureRadius * 3;
            const distanceNorm = Math.min(distance / farRadius, 1);
            const progressWithinLap = ((this.checkpointState.totalCleared % total) + (1 - distanceNorm)) / total;
            let checkpointReward = 0;

            if (distance <= captureRadius) {
                checkpointReward = 11;
                this.checkpointState.totalCleared += 1;
                this.checkpointState.nextIndex = (nextIndex + 1) % total;
            } else {
                this.checkpointState.nextIndex = nextIndex;
            }

            this.checkpointState.distanceNorm = distanceNorm;
            this.checkpointState.progressWithinLap = progressWithinLap % 1;

            return {
                checkpointReward,
                distanceNorm,
                progressWithinLap: this.checkpointState.progressWithinLap,
                nextCheckpointIndex: this.checkpointState.nextIndex,
            };
        }

        computeProgressDelta(progressWithinLap) {
            if (typeof progressWithinLap !== 'number') {
                return 0;
            }
            const delta = progressWithinLap - this.prevProgressWithinLap;
            let reward = 0;
            if (delta > 0) {
                reward += delta * 22;
            } else if (delta < -0.5 && this.resetFlag) {
                reward += 0;
            } else if (delta < 0) {
                if (this.game && this.game.lapCount > this.prevLapCount) {
                    reward += 0;
                } else {
                    reward += delta * 5;
                }
            }
            this.prevProgressWithinLap = Math.max(0, progressWithinLap);
            return reward;
        }

        computeLapReward() {
            const currentLap = this.game.lapCount || 0;
            if (currentLap > this.prevLapCount) {
                const delta = currentLap - this.prevLapCount;
                this.prevLapCount = currentLap;
                this.prevProgressWithinLap = 0;
                this.checkpointState.totalCleared = 0;
                this.checkpointState.nextIndex = 0;
                this.checkpointState.distanceNorm = 1;
                this.checkpointState.progressWithinLap = 0;
                let reward = delta * 55;
                if (!this.collisionSinceLastLap) {
                    reward += 22;
                }
                this.collisionSinceLastLap = false;
                return reward;
            }
            return 0;
        }

        computeSpeedReward(deltaTime) {
            const car = this.game.car;
            if (!car) {
                this.prevSteeringAngle = null;
                return 0;
            }
            const dt = resolveDeltaTime(deltaTime);
            const speed = car.speed || 0;
            const maxSpeed = car.maxSpeed || 1;
            const forwardRatio = Math.max(0, speed / Math.max(maxSpeed, 1));
            const speedReward = forwardRatio * SPEED_CONFIG.forwardScale * dt;
            const timePenalty = SPEED_CONFIG.timePenaltyScale * dt;
            const reverseRatio = Math.max(0, -speed / Math.max(maxSpeed, 1));
            const reversePenalty = reverseRatio * SPEED_CONFIG.reversePenaltyScale * dt;
            return speedReward + timePenalty + reversePenalty;
        }

        computeSmoothDrivingReward(deltaTime) {
            const car = this.game.car;
            const dt = typeof deltaTime === 'number' && deltaTime > 0 ? deltaTime : 0.016;
            if (!car) {
                this.prevSteeringAngle = null;
                return 0;
            }
            const angle = car.angle || 0;
            if (this.prevSteeringAngle === null) {
                this.prevSteeringAngle = angle;
                return 0;
            }
            const angularVelocity = Math.abs(angle - this.prevSteeringAngle) / dt;
            this.prevSteeringAngle = angle;
            const steadyTolerance = 0.6;
            const smoothness = Math.max(0, steadyTolerance - angularVelocity);
            return smoothness * 4.4 * dt;
        }

        computeCollisionPenalty() {
            if (this.game.car && this.game.car.damaged && !this.prevDamaged) {
                this.collisionSinceLastLap = true;
                return -20;
            }
            return 0;
        }

        computeInactivityPenalty({ deltaTime, progressDelta, progressWithinLap }) {
            const car = this.game.car;
            if (!car) {
                this.inactivityState = createInactivityState();
                return 0;
            }

            const dt = resolveDeltaTime(deltaTime);
            if (dt <= 0) {
                return 0;
            }

            const inactivity = this.inactivityState || createInactivityState();
            this.inactivityState = inactivity;

            if (inactivity.postResetDelay > 0) {
                inactivity.postResetDelay = Math.max(0, inactivity.postResetDelay - dt);
                return 0;
            }

            const speed = Math.abs(car.speed || 0);
            const absProgressDelta = Math.abs(progressDelta || 0);
            const moving = speed > INACTIVITY_CONFIG.speedThreshold;
            const makingProgress = absProgressDelta > INACTIVITY_CONFIG.progressThreshold;

            let penalty = 0;

            if (moving || makingProgress) {
                inactivity.idleDuration = 0;
            } else {
                inactivity.idleDuration += dt;
                if (inactivity.idleDuration > INACTIVITY_CONFIG.idleGracePeriod) {
                    penalty += -INACTIVITY_CONFIG.idlePenaltyRate * dt;
                }
            }

            const spawnPoint = this.spawnPoint;
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

            const idleNearSpawn = inSpawnRadius && !moving && !makingProgress;

            if (idleNearSpawn) {
                inactivity.spawnDuration += dt;
                if (inactivity.spawnDuration > INACTIVITY_CONFIG.spawnGracePeriod) {
                    penalty += -INACTIVITY_CONFIG.spawnPenaltyRate * dt;
                }
            } else {
                inactivity.spawnDuration = 0;
            }

            return penalty;
        }

        buildStateVector() {
            const car = this.game.car;
            if (!car) {
                return null;
            }

            const readings = car.sensor && Array.isArray(car.sensor.readings)
                ? car.sensor.readings
                : [];
            const expectedSensors = 11;
            const sensorValues = [];

            for (let i = 0; i < expectedSensors; i += 1) {
                const reading = readings[i];
                const offset = reading && typeof reading.offset === 'number'
                    ? Math.min(Math.max(reading.offset, 0), 1)
                    : 1;
                sensorValues.push(1 - offset);
            }

            const speed = car.speed || 0;
            const maxSpeed = car.maxSpeed || 1;
            const normalisedSpeed = (Math.max(-maxSpeed, Math.min(maxSpeed, speed)) / maxSpeed + 1) / 2;

            const distanceNorm = this.checkpointState.distanceNorm ?? 1;
            const progressWithinLap = this.checkpointState.progressWithinLap ?? 0;

            const lapTimeMs = this.currentLapTimeMs();
            const lapTimeNorm = Math.min(lapTimeMs / 120000, 1);
            const lapCountNorm = Math.min((this.game.lapCount || 0) / 10, 1);
            const collisionFlag = this.game.car.damaged ? 1 : 0;

            const state = [
                ...sensorValues,
                normalisedSpeed,
                Math.sin(car.angle || 0),
                Math.cos(car.angle || 0),
                progressWithinLap,
                distanceNorm,
                lapTimeNorm,
                lapCountNorm,
                collisionFlag,
            ];

            return Float32Array.from(state);
        }

        currentLapTimeMs() {
            if (this.game.lapStartTime !== null) {
                return performance.now() - this.game.lapStartTime;
            }
            if (typeof this.game.collisionTime === 'number') {
                return this.game.collisionTime;
            }
            return 0;
        }

        updateStatsDisplay() {
            if (!this.ui.timeElapsed || !this.ui.resetCount || !this.ui.episodeReward || !this.ui.epsilon || !this.ui.steps) {
                return;
            }

            // Update time elapsed
            if (this.trainingStartTime) {
                const elapsed = performance.now() - this.trainingStartTime;
                const seconds = Math.floor(elapsed / 1000);
                const minutes = Math.floor(seconds / 60);
                const hours = Math.floor(minutes / 60);
                const displaySeconds = seconds % 60;
                const displayMinutes = minutes % 60;
                const timeString = `${hours.toString().padStart(2, '0')}:${displayMinutes.toString().padStart(2, '0')}:${displaySeconds.toString().padStart(2, '0')}`;
                this.ui.timeElapsed.setValue(timeString);
            }

            // Update reset count
            this.ui.resetCount.setValue(this.resetCount.toString());

            // Update episode reward (running total for the current episode)
            this.ui.episodeReward.setValue(this.totalReward.toFixed(2));

            // Update epsilon
            this.ui.epsilon.setValue(this.currentEpsilon.toFixed(3));

            // Update steps
            this.ui.steps.setValue(this.currentSteps.toString());
        }

        scheduleAutoReset() {
            this.pendingAutoReset = true;
            this.resetCount++; // Increment reset count
            window.setTimeout(() => {
                this.game.resetCar();
                this.pendingAutoReset = false;
            }, 200);
        }

        onTrackReady() {
            const track = this.game.track;
            const checkpoints = track && typeof track.getCheckpoints === 'function'
                ? track.getCheckpoints() || []
                : [];
            this.checkpointState.total = Array.isArray(checkpoints) ? checkpoints.length : 0;
            this.checkpointState.totalCleared = 0;
            this.checkpointState.nextIndex = 0;
            this.checkpointState.distanceNorm = 1;
            this.checkpointState.progressWithinLap = 0;
            const spawn = track && typeof track.getSpawnPoint === 'function'
                ? track.getSpawnPoint()
                : null;
            this.spawnPoint = spawn ? { x: spawn.x, y: spawn.y } : null;
            this.inactivityState = createInactivityState();
        }

        onGameReset() {
            this.prevDamaged = false;
            this.prevSteeringAngle = this.game.car ? this.game.car.angle || 0 : 0;
            this.collisionSinceLastLap = false;
            if (this.enabled) {
                this.resetFlag = true;
                this.previousStateVector = null;
                this.prevProgressWithinLap = 0;
                this.checkpointState.totalCleared = 0;
                this.checkpointState.nextIndex = 0;
                this.checkpointState.distanceNorm = 1;
                this.checkpointState.progressWithinLap = 0;
                this.currentReward = 0;
                this.totalReward = 0;
                this.updateStatsDisplay();
            }
            this.inactivityState = createInactivityState();
        }
    }

    global.TrainingController = TrainingController;
})(window);

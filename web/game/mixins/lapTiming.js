const FORWARD_SPEED_THRESHOLD = 0.1;
const REVERSE_SPEED_THRESHOLD = -0.1;
const MIN_REALISTIC_LAP_MS = 2000;
const TRACK_BASELINE_AVERAGES_MS = {
    albert_park_circuit_melbourne_track_transparent: 28000
};
const LAP_STATS_DEBOUNCE_MS = 750;
const LAP_STATS_MIN_FLUSH_INTERVAL_MS = 5000;
const LAP_STATS_IDLE_TIMEOUT_MS = 1000;

const getNow = () => {
    if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
        return performance.now();
    }
    return Date.now();
};

export function applyLapTimingMixin(Game) {
    Game.prototype.loadLapStats = function loadLapStats() {
        let tracks = {};

        if (typeof window !== 'undefined' && window.localStorage) {
            try {
                const stored = window.localStorage.getItem('lapStats');
                if (stored) {
                    const parsed = JSON.parse(stored);
                    if (parsed && typeof parsed === 'object' && typeof parsed.tracks === 'object') {
                        tracks = parsed.tracks;
                    }
                }
            } catch (error) {
                console.warn('Failed to load lap stats:', error);
            }
        }

        this.registerLapStatsUnloadHandler();
        return { tracks };
    };

    Game.prototype.registerLapStatsUnloadHandler = function registerLapStatsUnloadHandler() {
        if (typeof window === 'undefined' || this.lapStatsUnloadHandlerRegistered) {
            return;
        }

        if (!this._lapStatsUnloadHandler) {
            this._lapStatsUnloadHandler = () => {
                this.saveLapStats({ immediate: true });
            };
        }

        window.addEventListener('beforeunload', this._lapStatsUnloadHandler);
        window.addEventListener('pagehide', this._lapStatsUnloadHandler);
        this.lapStatsUnloadHandlerRegistered = true;
    };

    Game.prototype.cancelLapStatsFlush = function cancelLapStatsFlush() {
        if (!this.lapStatsFlushHandle || typeof window === 'undefined') {
            return;
        }

        if (this.lapStatsFlushHandle.type === 'timeout') {
            window.clearTimeout(this.lapStatsFlushHandle.handle);
        } else if (this.lapStatsFlushHandle.type === 'idle' && typeof window.cancelIdleCallback === 'function') {
            window.cancelIdleCallback(this.lapStatsFlushHandle.handle);
        }

        this.lapStatsFlushHandle = null;
    };

    Game.prototype.writeLapStatsToStorage = function writeLapStatsToStorage() {
        if (!this.lapStatsDirty) {
            return;
        }

        if (typeof window === 'undefined' || !window.localStorage) {
            this.lapStatsDirty = false;
            return;
        }

        try {
            const tracks = this.lapStats && this.lapStats.tracks ? this.lapStats.tracks : {};
            window.localStorage.setItem('lapStats', JSON.stringify({ tracks }));
            this.lapStatsDirty = false;
            this.lapStatsLastPersistTime = getNow();
        } catch (error) {
            console.warn('Failed to save lap stats:', error);
        }
    };

    Game.prototype.scheduleLapStatsFlush = function scheduleLapStatsFlush() {
        if (typeof window === 'undefined' || !this.lapStatsDirty) {
            return;
        }

        this.registerLapStatsUnloadHandler();

        let delay = LAP_STATS_DEBOUNCE_MS;
        if (this.lapStatsLastPersistTime > 0) {
            const elapsed = getNow() - this.lapStatsLastPersistTime;
            if (elapsed < LAP_STATS_MIN_FLUSH_INTERVAL_MS) {
                delay = Math.max(LAP_STATS_MIN_FLUSH_INTERVAL_MS - elapsed, LAP_STATS_DEBOUNCE_MS);
            }
        }

        if (this.lapStatsFlushHandle) {
            this.cancelLapStatsFlush();
        }

        const fire = () => {
            this.lapStatsFlushHandle = null;
            if (!this.lapStatsDirty) {
                return;
            }
            this.writeLapStatsToStorage();
        };

        if (typeof window.requestIdleCallback === 'function') {
            const handle = window.requestIdleCallback(() => fire(), { timeout: delay + LAP_STATS_IDLE_TIMEOUT_MS });
            this.lapStatsFlushHandle = { type: 'idle', handle };
        } else {
            const handle = window.setTimeout(fire, delay);
            this.lapStatsFlushHandle = { type: 'timeout', handle };
        }
    };

    Game.prototype.saveLapStats = function saveLapStats(options = {}) {
        const immediate = options && options.immediate;

        if (immediate) {
            this.cancelLapStatsFlush();
            if (!this.lapStatsDirty) {
                return;
            }

            this.writeLapStatsToStorage();
            return;
        }

        this.lapStatsDirty = true;
        this.scheduleLapStatsFlush();
    };

    Game.prototype.ensureTrackStats = function ensureTrackStats() {
        if (!this.trackMeta || !this.trackMeta.id) {
            return null;
        }

        if (!this.lapStats || typeof this.lapStats !== 'object') {
            this.lapStats = { tracks: {} };
        }

        if (!this.lapStats.tracks || typeof this.lapStats.tracks !== 'object') {
            this.lapStats.tracks = {};
        }

        const trackId = this.trackMeta.id;

        if (!this.lapStats.tracks[trackId]) {
            this.lapStats.tracks[trackId] = {
                id: trackId,
                name: this.trackMeta.name || trackId,
                count: 0,
                totalMs: 0,
                lastLapMs: null,
                baselineMs: TRACK_BASELINE_AVERAGES_MS[trackId] || null
            };
        }

        return this.lapStats.tracks[trackId];
    };

    Game.prototype.getTrackAverageMs = function getTrackAverageMs() {
        const stats = this.ensureTrackStats();
        if (!stats) {
            return null;
        }

        if (stats.count > 0 && stats.totalMs > 0) {
            return stats.totalMs / stats.count;
        }

        if (stats.baselineMs !== undefined && stats.baselineMs !== null) {
            return stats.baselineMs;
        }

        return null;
    };

    Game.prototype.recordLapTime = function recordLapTime(lapDurationMs) {
        const stats = this.ensureTrackStats();
        if (!stats) {
            return;
        }

        stats.count += 1;
        stats.totalMs += lapDurationMs;
        stats.lastLapMs = lapDurationMs;
        this.lastLapTimeMs = lapDurationMs;
        this.saveLapStats();
    };

    Game.prototype.evaluateLapAttempt = function evaluateLapAttempt(lapDurationMs, reverseDisqualified) {
        if (reverseDisqualified) {
            return { reject: true, reason: 'reverse-crossing disarm' };
        }

        if (lapDurationMs === null) {
            return { reject: true, reason: 'lap timing not armed' };
        }

        if (lapDurationMs < MIN_REALISTIC_LAP_MS) {
            return { reject: true, reason: 'lap time below minimum threshold' };
        }

        const averageMs = this.getTrackAverageMs();
        if (averageMs && lapDurationMs < averageMs / 2) {
            return { reject: true, reason: 'lap time below half of track average' };
        }

        return { reject: false, reason: null };
    };

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
        this.pendingLapDisqualification = false;

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
            const now = performance.now();

            if (this.car.speed < REVERSE_SPEED_THRESHOLD) {
                this.pendingLapDisqualification = true;
                console.log('Crossed finish line in reverse - lap disarmed');
            } else if (this.car.speed > FORWARD_SPEED_THRESHOLD) {
                const lapDurationMs = this.lapStartTime !== null ? now - this.lapStartTime : null;
                const evaluation = this.evaluateLapAttempt(lapDurationMs, this.pendingLapDisqualification);
                this.pendingLapDisqualification = false;
                this.lapStartTime = now;

                if (!evaluation.reject) {
                    this.completeLap(lapDurationMs);
                } else if (evaluation.reason && evaluation.reason !== 'lap timing not armed') {
                    console.log(`Lap ignored: ${evaluation.reason}`);
                }
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

    Game.prototype.completeLap = function completeLap(lapDurationMs) {
        this.lapCount += 1;
        this.carHasStartedMoving = true;

        if (typeof lapDurationMs === 'number') {
            this.recordLapTime(lapDurationMs);
            const seconds = (lapDurationMs / 1000).toFixed(3);
            console.log(`Lap ${this.lapCount} completed in ${seconds}s`);
        } else {
            console.log(`Lap ${this.lapCount} completed!`);
        }
    };
}

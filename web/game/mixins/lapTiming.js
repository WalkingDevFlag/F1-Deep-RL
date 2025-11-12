const FORWARD_SPEED_THRESHOLD = 0.1;
const REVERSE_SPEED_THRESHOLD = -0.1;
const MIN_REALISTIC_LAP_MS = 2000;
const TRACK_BASELINE_AVERAGES_MS = {
    albert_park_circuit_melbourne_track_transparent: 28000
};

export function applyLapTimingMixin(Game) {
    Game.prototype.loadLapStats = function loadLapStats() {
        if (typeof window === 'undefined' || !window.localStorage) {
            return { tracks: {} };
        }

        try {
            const stored = window.localStorage.getItem('lapStats');
            if (!stored) {
                return { tracks: {} };
            }

            const parsed = JSON.parse(stored);
            if (!parsed || typeof parsed !== 'object' || typeof parsed.tracks !== 'object') {
                return { tracks: {} };
            }

            return { tracks: parsed.tracks };
        } catch (error) {
            console.warn('Failed to load lap stats:', error);
            return { tracks: {} };
        }
    };

    Game.prototype.saveLapStats = function saveLapStats() {
        if (typeof window === 'undefined' || !window.localStorage) {
            return;
        }

        try {
            const tracks = this.lapStats && this.lapStats.tracks ? this.lapStats.tracks : {};
            window.localStorage.setItem('lapStats', JSON.stringify({ tracks }));
        } catch (error) {
            console.warn('Failed to save lap stats:', error);
        }
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

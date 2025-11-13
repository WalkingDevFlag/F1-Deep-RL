import { NeuralNetworkOverlay } from '../nnOverlay.js';

export function applyNeuralOverlayMixin(Game) {
    Game.prototype.initializeNeuralOverlay = function initializeNeuralOverlay() {
        if (this.neuralOverlay) {
            return;
        }
        this.neuralOverlay = new NeuralNetworkOverlay();
        if (document.body) {
            this.neuralOverlay.attach(document.body);
        }
        this.neuralOverlay.setVisible(Boolean(this.neuralNetworkVisible));
    };

    Game.prototype.setNeuralNetworkVisible = function setNeuralNetworkVisible(visible) {
        this.neuralNetworkVisible = Boolean(visible);
        if (!this.neuralOverlay) {
            this.initializeNeuralOverlay();
        }
        if (this.neuralOverlay) {
            this.neuralOverlay.setVisible(this.neuralNetworkVisible);
            if (!this.neuralNetworkVisible) {
                this.neuralOverlay.markStale();
            }
        }
    };

    Game.prototype.shouldRequestNeuralSnapshot = function shouldRequestNeuralSnapshot() {
        if (!this.neuralNetworkVisible) {
            return false;
        }
        if (!this.neuralOverlay) {
            this.initializeNeuralOverlay();
        }
        return this.neuralOverlay ? this.neuralOverlay.isVisible() : false;
    };

    Game.prototype.handleNeuralSnapshot = function handleNeuralSnapshot(snapshot) {
        if (!this.neuralOverlay) {
            this.initializeNeuralOverlay();
        }
        if (this.neuralOverlay && this.neuralNetworkVisible) {
            this.neuralOverlay.updateSnapshot(snapshot);
        }
    };

    Game.prototype.markNeuralSnapshotStale = function markNeuralSnapshotStale() {
        if (this.neuralOverlay) {
            this.neuralOverlay.markStale();
        }
    };

    Game.prototype.clearNeuralSnapshot = function clearNeuralSnapshot() {
        if (this.neuralOverlay) {
            this.neuralOverlay.clearSnapshot();
        }
    };
}

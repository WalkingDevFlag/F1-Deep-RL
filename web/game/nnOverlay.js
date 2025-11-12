const COLORS = {
    overlayTint: 'rgba(12, 16, 24, 0.82)',
    node: {
        negative: { r: 87, g: 164, b: 255 },
        neutral: { r: 200, g: 206, b: 216 },
        positive: { r: 255, g: 170, b: 96 },
    },
    weight: {
        negative: { r: 78, g: 148, b: 255 },
        positive: { r: 255, g: 156, b: 86 },
    },
    outline: 'rgba(255, 255, 255, 0.12)',
};

function clamp(value, min, max) {
    if (value < min) {
        return min;
    }
    if (value > max) {
        return max;
    }
    return value;
}

function mixChannel(a, b, t) {
    return Math.round(a + (b - a) * t);
}

function blendColor(from, to, t) {
    return {
        r: mixChannel(from.r, to.r, t),
        g: mixChannel(from.g, to.g, t),
        b: mixChannel(from.b, to.b, t),
    };
}

function colorToRgba(color, alpha) {
    return `rgba(${color.r}, ${color.g}, ${color.b}, ${alpha})`;
}

function cloneMatrix(matrix) {
    return matrix.map((row) => row.slice());
}

export class NeuralNetworkOverlay {
    constructor(options = {}) {
        this.visible = false;
        this.stale = true;
        this.container = document.createElement('div');
        this.container.className = 'nn-overlay';

        this.canvas = document.createElement('canvas');
        this.canvas.className = 'nn-overlay__canvas';
        this.ctx = this.canvas.getContext('2d');

        this.placeholder = document.createElement('div');
        this.placeholder.className = 'nn-overlay__placeholder';
        this.placeholder.textContent = options.placeholderText || 'Waiting for neural data…';

        this.container.appendChild(this.canvas);
        this.container.appendChild(this.placeholder);

        this.devicePixelRatio = window.devicePixelRatio || 1;
        this.smoothingDuration = options.smoothingDuration || 180;
        this.maxFrameInterval = options.maxFrameInterval || 34;

        this.targetSnapshot = null;
        this.currentSnapshot = null;
        this.weightTarget = 1;
        this.weightScale = 1;
        this.nodeLayout = null;

        this.lastFrameTime = performance.now();
        this.lastDrawTime = 0;

        this.render = this.render.bind(this);
        this.animationHandle = null;

        this.resizeObserver = null;
        if (typeof ResizeObserver === 'function') {
            this.resizeObserver = new ResizeObserver(() => this.handleResize());
        }

        this.observing = false;

        this.handleResize();
        this.ensureAnimation();
    }

    attach(parent) {
        if (!parent) {
            return;
        }
        if (this.container.parentElement !== parent) {
            parent.appendChild(this.container);
        }
        if (this.resizeObserver && !this.observing) {
            this.resizeObserver.observe(this.container);
            this.observing = true;
        }
        this.handleResize();
        this.ensureAnimation();
    }

    detach() {
        if (this.resizeObserver && this.observing) {
            this.resizeObserver.unobserve(this.container);
            this.observing = false;
        }
        if (this.container.parentElement) {
            this.container.parentElement.removeChild(this.container);
        }
    }

    destroy() {
        if (this.animationHandle) {
            cancelAnimationFrame(this.animationHandle);
            this.animationHandle = null;
        }
        this.detach();
    }

    isVisible() {
        return this.visible && this.container.isConnected;
    }

    setVisible(visible) {
        this.visible = Boolean(visible);
        if (this.visible) {
            this.container.classList.add('nn-overlay--visible');
            this.placeholder.hidden = !!this.currentSnapshot;
            this.ensureAnimation();
        } else {
            this.container.classList.remove('nn-overlay--visible');
        }
    }

    updateSnapshot(rawSnapshot) {
        const snapshot = this.normalizeSnapshot(rawSnapshot);
        if (!snapshot) {
            this.markStale();
            return;
        }

        this.placeholder.hidden = true;
        this.stale = false;
        this.targetSnapshot = snapshot;
        this.weightTarget = snapshot.maxWeight || 1;
        if (!this.currentSnapshot || !this.structuresMatch(this.currentSnapshot, snapshot)) {
            this.currentSnapshot = this.cloneSnapshot(snapshot);
            this.weightScale = snapshot.maxWeight || 1;
        }
        this.nodeLayout = null;
        this.ensureAnimation();
    }

    markStale() {
        this.stale = true;
        if (!this.currentSnapshot) {
            this.placeholder.hidden = false;
            this.placeholder.textContent = 'Waiting for neural data…';
        }
    }

    clearSnapshot() {
        this.targetSnapshot = null;
        this.currentSnapshot = null;
        this.weightTarget = 1;
        this.weightScale = 1;
        this.nodeLayout = null;
        this.stale = true;
        this.placeholder.hidden = false;
        this.placeholder.textContent = 'Waiting for neural data…';
        this.clearCanvas();
    }

    shouldDraw() {
        return this.visible && this.container.isConnected && this.currentSnapshot && this.targetSnapshot;
    }

    ensureAnimation() {
        if (this.animationHandle == null) {
            this.animationHandle = requestAnimationFrame(this.render);
        }
    }

    render(timestamp) {
        this.animationHandle = requestAnimationFrame(this.render);
        const now = timestamp || performance.now();
        const delta = now - this.lastFrameTime;
        this.lastFrameTime = now;

        if (!this.shouldDraw()) {
            return;
        }
        if (now - this.lastDrawTime < this.maxFrameInterval) {
            return;
        }

        this.interpolateSnapshot(delta);
        this.draw(now);
        this.lastDrawTime = now;
    }

    interpolateSnapshot(delta) {
        if (!this.currentSnapshot || !this.targetSnapshot) {
            return;
        }
        const smoothing = clamp(delta / this.smoothingDuration, 0, 1);
        const layers = this.currentSnapshot.activations.length;
        for (let layerIndex = 0; layerIndex < layers; layerIndex += 1) {
            const currentLayer = this.currentSnapshot.activations[layerIndex];
            const targetLayer = this.targetSnapshot.activations[layerIndex];
            for (let nodeIndex = 0; nodeIndex < currentLayer.length; nodeIndex += 1) {
                const current = currentLayer[nodeIndex];
                const target = targetLayer[nodeIndex];
                currentLayer[nodeIndex] = current + (target - current) * smoothing;
            }
        }

        for (let i = 0; i < this.currentSnapshot.weights.length; i += 1) {
            const currentMatrix = this.currentSnapshot.weights[i];
            const targetMatrix = this.targetSnapshot.weights[i];
            for (let source = 0; source < currentMatrix.length; source += 1) {
                const currentRow = currentMatrix[source];
                const targetRow = targetMatrix[source];
                for (let dest = 0; dest < currentRow.length; dest += 1) {
                    const current = currentRow[dest];
                    const target = targetRow[dest];
                    currentRow[dest] = current + (target - current) * smoothing;
                }
            }
        }

        const targetWeight = this.weightTarget || 1;
        this.weightScale = this.weightScale + (targetWeight - this.weightScale) * smoothing;
    }

    draw(time) {
        const width = this.canvas.width;
        const height = this.canvas.height;
        if (!width || !height) {
            return;
        }

        const cssWidth = width / this.devicePixelRatio;
        const cssHeight = height / this.devicePixelRatio;

        this.ctx.save();
        this.ctx.setTransform(this.devicePixelRatio, 0, 0, this.devicePixelRatio, 0, 0);
        this.ctx.clearRect(0, 0, cssWidth, cssHeight);

        const snapshot = this.currentSnapshot;
        const layout = this.nodeLayout || this.computeLayout(cssWidth, cssHeight, snapshot.layers);
        this.nodeLayout = layout;

        this.drawConnections(layout, snapshot, cssWidth, cssHeight);
        this.drawNodes(layout, snapshot, time);

        this.ctx.restore();
    }

    drawConnections(layout, snapshot) {
        const weights = snapshot.weights;
        const layers = snapshot.layers;
        const weightScale = this.weightScale || 1;

        for (let layerIndex = 0; layerIndex < weights.length; layerIndex += 1) {
            const matrix = weights[layerIndex];
            const fromNodes = layout[layerIndex];
            const toNodes = layout[layerIndex + 1];

            for (let source = 0; source < matrix.length; source += 1) {
                const sourcePoint = fromNodes[source];
                if (!sourcePoint) {
                    continue;
                }
                const row = matrix[source];
                for (let dest = 0; dest < row.length; dest += 1) {
                    const weight = row[dest];
                    const magnitude = Math.abs(weight) / weightScale;
                    if (magnitude < 0.015) {
                        continue;
                    }
                    const targetPoint = toNodes[dest];
                    if (!targetPoint) {
                        continue;
                    }
                    const limited = clamp(magnitude, 0, 1);
                    const color = weight >= 0 ? COLORS.weight.positive : COLORS.weight.negative;
                    const alpha = 0.18 + limited * 0.55;
                    const width = 0.6 + limited * 1.9;

                    this.ctx.strokeStyle = colorToRgba(color, alpha);
                    this.ctx.lineWidth = width;
                    this.ctx.beginPath();
                    this.ctx.moveTo(sourcePoint.x, sourcePoint.y);
                    this.ctx.lineTo(targetPoint.x, targetPoint.y);
                    this.ctx.stroke();
                }
            }
        }
    }

    drawNodes(layout, snapshot, time) {
        const activations = snapshot.activations;
        for (let layerIndex = 0; layerIndex < layout.length; layerIndex += 1) {
            const nodes = layout[layerIndex];
            const layerActivations = activations[layerIndex];
            for (let nodeIndex = 0; nodeIndex < nodes.length; nodeIndex += 1) {
                const point = nodes[nodeIndex];
                const value = layerActivations[nodeIndex] || 0;
                const magnitude = clamp(Math.abs(value), 0, 1.4);
                const baseRadius = layerIndex === 0 ? 5 : 6;
                const radius = baseRadius + magnitude * 2.4;
                const pulse = 1 + Math.sin((time / 220) + (layerIndex * 0.6) + (nodeIndex * 0.35)) * 0.08;
                const glowRadius = radius * (1.6 + magnitude * 0.35) * pulse;

                const glowColor = value >= 0
                    ? blendColor(COLORS.node.neutral, COLORS.node.positive, clamp(magnitude, 0, 1))
                    : blendColor(COLORS.node.negative, COLORS.node.neutral, clamp(magnitude, 0, 1));

                this.ctx.fillStyle = colorToRgba(glowColor, 0.1 + clamp(magnitude, 0, 1) * 0.14);
                this.ctx.beginPath();
                this.ctx.arc(point.x, point.y, glowRadius, 0, Math.PI * 2);
                this.ctx.fill();

                const nodeColor = value >= 0
                    ? colorToRgba(
                        blendColor(COLORS.node.neutral, COLORS.node.positive, clamp(magnitude, 0, 1)),
                        0.92
                    )
                    : colorToRgba(
                        blendColor(COLORS.node.negative, COLORS.node.neutral, clamp(magnitude, 0, 1)),
                        0.92
                    );

                this.ctx.fillStyle = nodeColor;
                this.ctx.beginPath();
                this.ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
                this.ctx.fill();

                this.ctx.strokeStyle = COLORS.outline;
                this.ctx.lineWidth = 1;
                this.ctx.beginPath();
                this.ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
                this.ctx.stroke();
            }
        }
    }

    computeLayout(width, height, layers) {
        const paddingX = 28;
        const paddingY = 28;
        const usableWidth = Math.max(width - paddingX * 2, 40);
        const usableHeight = Math.max(height - paddingY * 2, 40);
        const layerCount = layers.length;
        const columnSpacing = layerCount > 1 ? usableWidth / (layerCount - 1) : 0;

        const layout = [];
        for (let layerIndex = 0; layerIndex < layerCount; layerIndex += 1) {
            const nodes = layers[layerIndex];
            const column = [];
            const x = paddingX + columnSpacing * layerIndex;
            if (nodes <= 1) {
                column.push({ x, y: height / 2 });
            } else {
                const step = usableHeight / (nodes - 1);
                for (let nodeIndex = 0; nodeIndex < nodes; nodeIndex += 1) {
                    const y = paddingY + step * nodeIndex;
                    column.push({ x, y });
                }
            }
            layout.push(column);
        }
        return layout;
    }

    normalizeSnapshot(raw) {
        if (!raw || typeof raw !== 'object') {
            return null;
        }
        const rawLayers = Array.isArray(raw.layers) ? raw.layers : [];
        if (rawLayers.length < 2) {
            return null;
        }
        const layers = rawLayers.map((value) => {
            const numeric = Number(value);
            return Number.isFinite(numeric) && numeric > 0 ? Math.floor(numeric) : 0;
        });
        if (layers.some((value) => value <= 0)) {
            return null;
        }

        const rawActivations = Array.isArray(raw.activations) ? raw.activations : [];
        if (rawActivations.length !== layers.length) {
            return null;
        }
        const activations = [];
        for (let layerIndex = 0; layerIndex < layers.length; layerIndex += 1) {
            const layer = rawActivations[layerIndex];
            if (!Array.isArray(layer) || layer.length !== layers[layerIndex]) {
                return null;
            }
            const cleaned = layer.map((value) => {
                const numeric = Number(value);
                if (!Number.isFinite(numeric)) {
                    return 0;
                }
                return numeric;
            });
            activations.push(cleaned);
        }

        const rawWeights = Array.isArray(raw.weights) ? raw.weights : [];
        if (rawWeights.length !== layers.length - 1) {
            return null;
        }
        const weights = [];
        let maxWeight = 0;
        for (let layerIndex = 0; layerIndex < rawWeights.length; layerIndex += 1) {
            const matrix = rawWeights[layerIndex];
            if (!Array.isArray(matrix) || matrix.length !== layers[layerIndex]) {
                return null;
            }
            const rows = [];
            for (let source = 0; source < matrix.length; source += 1) {
                const rawRow = matrix[source];
                if (!Array.isArray(rawRow) || rawRow.length !== layers[layerIndex + 1]) {
                    return null;
                }
                const cleaned = rawRow.map((value) => {
                    const numeric = Number(value);
                    if (!Number.isFinite(numeric)) {
                        return 0;
                    }
                    const absolute = Math.abs(numeric);
                    if (absolute > maxWeight) {
                        maxWeight = absolute;
                    }
                    return numeric;
                });
                rows.push(cleaned);
            }
            weights.push(rows);
        }

        const fallbackWeight = Number(raw.max_weight ?? raw.maxWeight ?? maxWeight);
        if (Number.isFinite(fallbackWeight) && fallbackWeight > maxWeight) {
            maxWeight = fallbackWeight;
        }
        maxWeight = maxWeight || 1;

        return {
            layers,
            activations,
            weights,
            maxWeight,
        };
    }

    structuresMatch(left, right) {
        if (!left || !right) {
            return false;
        }
        if (left.layers.length !== right.layers.length) {
            return false;
        }
        for (let index = 0; index < left.layers.length; index += 1) {
            if (left.layers[index] !== right.layers[index]) {
                return false;
            }
        }
        return true;
    }

    cloneSnapshot(snapshot) {
        return {
            layers: snapshot.layers.slice(),
            activations: snapshot.activations.map((layer) => layer.slice()),
            weights: snapshot.weights.map((matrix) => cloneMatrix(matrix)),
            maxWeight: snapshot.maxWeight,
        };
    }

    clearCanvas() {
        if (!this.ctx) {
            return;
        }
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }

    handleResize() {
        if (!this.container.isConnected) {
            return;
        }
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;
        if (!width || !height) {
            return;
        }
        const dpr = window.devicePixelRatio || 1;
        this.devicePixelRatio = dpr;
        this.canvas.width = Math.round(width * dpr);
        this.canvas.height = Math.round(height * dpr);
        this.canvas.style.width = `${width}px`;
        this.canvas.style.height = `${height}px`;
        this.nodeLayout = null;
    }
}

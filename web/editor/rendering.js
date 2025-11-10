import { ARROW_SIZE, HANDLE_SIZE } from './constants.js';

export function applyRenderingMixin(LevelEditor) {
    LevelEditor.prototype.render = function render() {
        if (!this.ctx || !this.canvas) {
            return;
        }

        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        if (this.trackImage) {
            this.ctx.save();
            this.ctx.translate(this.panX, this.panY);
            this.ctx.scale(this.zoom, this.zoom);
            this.ctx.drawImage(this.trackImage, 0, 0);
            this.drawStartFinish();

            if (this.currentTool === 'start-finish' && this.toolDragging) {
                this.drawStartFinishPreview();
            }

            this.drawWalls();
            this.renderCheckpoints();

            if (this.currentTool === 'checkpoint' && this.toolDragging) {
                this.drawCheckpointPreview();
            }

            this.ctx.restore();
        } else {
            this.ctx.fillStyle = '#666';
            this.ctx.font = '24px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.fillText('No base image found for this track', this.canvas.width / 2, this.canvas.height / 2);
        }
    };

    LevelEditor.prototype.drawStartFinish = function drawStartFinish() {
        if (!this.editorState.startLine || !this.editorState.uiToggles.showStartFinish) {
            return;
        }

        const { x1, y1, x2, y2 } = this.editorState.startLine;
        const { x, y, angle } = this.editorState.spawn;

        this.ctx.strokeStyle = this.editorState.selectedObject === 'startLine' ? '#00ff00' : 'green';
        this.ctx.lineWidth = 3;
        this.ctx.lineCap = 'round';
        this.ctx.beginPath();
        this.ctx.moveTo(x1, y1);
        this.ctx.lineTo(x2, y2);
        this.ctx.stroke();

        this.ctx.fillStyle = 'green';
        this.ctx.save();
        this.ctx.translate(x, y);
        this.ctx.rotate(angle);
        this.ctx.beginPath();
        this.ctx.moveTo(0, -ARROW_SIZE / 2);
        this.ctx.lineTo(ARROW_SIZE, 0);
        this.ctx.lineTo(0, ARROW_SIZE / 2);
        this.ctx.closePath();
        this.ctx.fill();
        this.ctx.restore();

        this.drawHandles(x1, y1, x2, y2);
    };

    LevelEditor.prototype.drawStartFinishPreview = function drawStartFinishPreview() {
        this.ctx.strokeStyle = 'rgba(0, 255, 0, 0.5)';
        this.ctx.lineWidth = 3;
        this.ctx.lineCap = 'round';
        this.ctx.beginPath();
        this.ctx.moveTo(this.dragStartX, this.dragStartY);
        this.ctx.lineTo(this.dragEndX, this.dragEndY);
        this.ctx.stroke();
    };

    LevelEditor.prototype.drawHandles = function drawHandles(x1, y1, x2, y2) {
        const size = HANDLE_SIZE;
        this.ctx.fillStyle = 'white';
        this.ctx.strokeStyle = this.editorState.selectedObject === 'startLine' ? '#00ff00' : 'green';
        this.ctx.lineWidth = 2;

        this.ctx.beginPath();
        this.ctx.rect(x1 - size / 2, y1 - size / 2, size, size);
        this.ctx.fill();
        this.ctx.stroke();

        this.ctx.beginPath();
        this.ctx.rect(x2 - size / 2, y2 - size / 2, size, size);
        this.ctx.fill();
        this.ctx.stroke();
    };

    LevelEditor.prototype.drawWalls = function drawWalls() {
        if (!this.editorState.walls || this.editorState.walls.length === 0 || !this.editorState.uiToggles.showWalls) {
            return;
        }

        this.ctx.strokeStyle = 'red';
        this.ctx.lineWidth = 1;
        this.ctx.beginPath();

        for (const wall of this.editorState.walls) {
            let points;
            if (wall.polyline) {
                // Loaded geometry format: object with polyline
                points = wall.polyline;
            } else if (Array.isArray(wall) && wall.length >= 2) {
                // Extracted borders format: array of points
                points = wall;
            } else {
                continue; // Skip invalid walls
            }

            if (points.length < 2) continue;

            this.ctx.moveTo(points[0].x, points[0].y);
            for (let i = 1; i < points.length; i++) {
                this.ctx.lineTo(points[i].x, points[i].y);
            }
        }

        this.ctx.stroke();
    };

    LevelEditor.prototype.drawPlaceholders = function drawPlaceholders(x, y, width, height) {
        this.ctx.strokeStyle = 'red';
        this.ctx.lineWidth = 3;
        this.ctx.strokeRect(x + 20, y + 20, width - 40, height - 40);
        this.ctx.fillStyle = 'red';
        this.ctx.font = '14px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('Road Boundary (Placeholder)', x + width / 2, y + height - 10);
    };
}

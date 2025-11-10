import {
    MIN_START_LINE_LENGTH,
    DEFAULT_START_LINE_LENGTH,
    HANDLE_SIZE,
    LINE_HIT_THRESHOLD
} from './constants.js';

export function applyStartFinishMixin(LevelEditor) {
    LevelEditor.prototype.getHitAt = function getHitAt(worldX, worldY) {
        if (!this.editorState.startLine) {
            return null;
        }

        const { x1, y1, x2, y2 } = this.editorState.startLine;
        const handleRadius = (HANDLE_SIZE / this.zoom) / 2;

        const distToStart = Math.hypot(worldX - x1, worldY - y1);
        if (distToStart <= handleRadius) {
            return { type: 'handle', which: 'start' };
        }

        const distToEnd = Math.hypot(worldX - x2, worldY - y2);
        if (distToEnd <= handleRadius) {
            return { type: 'handle', which: 'end' };
        }

        const lineLength = Math.hypot(x2 - x1, y2 - y1);
        if (lineLength === 0) {
            return null;
        }

        const dx = x2 - x1;
        const dy = y2 - y1;
        const px = worldX - x1;
        const py = worldY - y1;
        const dot = px * dx + py * dy;
        const proj = dot / (lineLength * lineLength);
        const clampedProj = Math.max(0, Math.min(1, proj));
        const closestX = x1 + clampedProj * dx;
        const closestY = y1 + clampedProj * dy;
        const distToLine = Math.hypot(worldX - closestX, worldY - closestY);
        const threshold = LINE_HIT_THRESHOLD / this.zoom;

        if (distToLine <= threshold) {
            return { type: 'line' };
        }

        // Check walls
        if (this.editorState.walls) {
            for (let i = 0; i < this.editorState.walls.length; i++) {
                const wall = this.editorState.walls[i];
                let segments = [];

                if (wall.polyline) {
                    // Loaded geometry: polyline array
                    const points = wall.polyline;
                    for (let j = 0; j < points.length - 1; j++) {
                        segments.push([points[j], points[j + 1]]);
                    }
                } else if (Array.isArray(wall) && wall.length >= 2) {
                    // Extracted borders: single segment
                    segments.push(wall);
                }

                for (const segment of segments) {
                    const wx1 = segment[0].x;
                    const wy1 = segment[0].y;
                    const wx2 = segment[1].x;
                    const wy2 = segment[1].y;

                    const wallLength = Math.hypot(wx2 - wx1, wy2 - wy1);
                    if (wallLength === 0) {
                        continue;
                    }

                    const wdx = wx2 - wx1;
                    const wdy = wy2 - wy1;
                    const wpx = worldX - wx1;
                    const wpy = worldY - wy1;
                    const wdot = wpx * wdx + wpy * wdy;
                    const wproj = wdot / (wallLength * wallLength);
                    const wclampedProj = Math.max(0, Math.min(1, wproj));
                    const wclosestX = wx1 + wclampedProj * wdx;
                    const wclosestY = wy1 + wclampedProj * wdy;
                    const distToWall = Math.hypot(worldX - wclosestX, worldY - wclosestY);

                    if (distToWall <= threshold) {
                        return { type: 'wall', index: i };
                    }
                }
            }
        }

        return null;
    };

    LevelEditor.prototype.placeStartFinish = function placeStartFinish(x1, y1, x2, y2) {
        const dx = x2 - x1;
        const dy = y2 - y1;
        const length = Math.hypot(dx, dy);

        let finalX1 = x1;
        let finalY1 = y1;
        let finalX2 = x2;
        let finalY2 = y2;

        if (length < MIN_START_LINE_LENGTH) {
            const centerX = (x1 + x2) / 2;
            const centerY = (y1 + y2) / 2;
            finalX1 = centerX - DEFAULT_START_LINE_LENGTH / 2;
            finalY1 = centerY;
            finalX2 = centerX + DEFAULT_START_LINE_LENGTH / 2;
            finalY2 = centerY;
        }

        if (this.trackImage) {
            finalX1 = Math.max(0, Math.min(this.trackImage.width, finalX1));
            finalY1 = Math.max(0, Math.min(this.trackImage.height, finalY1));
            finalX2 = Math.max(0, Math.min(this.trackImage.width, finalX2));
            finalY2 = Math.max(0, Math.min(this.trackImage.height, finalY2));
        }

        if (this.editorState.startLine) {
            if (!confirm('Replace existing Start/Finish?')) {
                return;
            }
        }

        const startLineObj = {
            id: 'startline',
            x1: finalX1,
            y1: finalY1,
            x2: finalX2,
            y2: finalY2,
            angle: Math.atan2(finalY2 - finalY1, finalX2 - finalX1)
        };

        const spawnObj = this.computeSpawnFromLine(finalX1, finalY1, finalX2, finalY2);
        this.setStartFinish(startLineObj, spawnObj, { pushUndo: true });
    };

    LevelEditor.prototype.computeSpawnFromLine = function computeSpawnFromLine(x1, y1, x2, y2) {
        const cx = (x1 + x2) / 2;
        const cy = (y1 + y2) / 2;
        const angle = Math.atan2(y2 - y1, x2 - x1);
        const spawnAngle = angle + Math.PI / 2;
        return { x: cx, y: cy, angle: spawnAngle };
    };

    LevelEditor.prototype.setStartFinish = function setStartFinish(startLineObj, spawnObj, opts = {}) {
        const prevStart = this.editorState.startLine;
        const prevSpawn = this.editorState.spawn;

        this.editorState.startLine = startLineObj;
        this.editorState.spawn = spawnObj;

        if (this.currentMeta) {
            this.updateTrackLabel(this.currentMeta.name || 'Unknown Track');
        } else if (this.trackNameEl) {
            this.updateTrackLabel('Unknown Track');
        }

        if (opts.pushUndo) {
            this.pushAction({
                do: () => this.setStartFinish(startLineObj, spawnObj, { pushUndo: false }),
                undo: () => this.setStartFinish(prevStart, prevSpawn, { pushUndo: false }),
                description: 'Place Start/Finish'
            });
            this.markUnsavedChanges();
        }

        this.render();
    };

    LevelEditor.prototype.removeStartFinish = function removeStartFinish() {
        const prevStart = this.editorState.startLine;
        const prevSpawn = this.editorState.spawn;

        this.editorState.startLine = null;
        this.editorState.spawn = null;

        this.pushAction({
            do: () => this.setStartFinish(null, null, { pushUndo: false }),
            undo: () => this.setStartFinish(prevStart, prevSpawn, { pushUndo: false }),
            description: 'Remove Start/Finish'
        });

        this.render();
    };

    LevelEditor.prototype.pushAction = function pushAction(action) {
        this.undoStack.push(action);
        this.redoStack = [];
    };

    LevelEditor.prototype.undo = function undo() {
        if (!this.undoStack.length) {
            return;
        }
        const action = this.undoStack.pop();
        action.undo();
        this.redoStack.push(action);
    };

    LevelEditor.prototype.redo = function redo() {
        if (!this.redoStack.length) {
            return;
        }
        const action = this.redoStack.pop();
        action.do();
        this.undoStack.push(action);
    };

    LevelEditor.prototype.deleteSelectedObject = function deleteSelectedObject() {
        if (this.editorState.selectedObject === 'startLine') {
            if (confirm('Delete selected Start/Finish line?')) {
                this.removeStartFinish();
                this.editorState.selectedObject = null;
            }
        }
    };

    LevelEditor.prototype.flipStartDirection = function flipStartDirection() {
        if (!this.editorState.startLine) {
            return;
        }

        const prevStart = { ...this.editorState.startLine };
        const prevSpawn = { ...this.editorState.spawn };

        const nextStart = {
            ...this.editorState.startLine,
            x1: this.editorState.startLine.x2,
            y1: this.editorState.startLine.y2,
            x2: this.editorState.startLine.x1,
            y2: this.editorState.startLine.y1
        };
        nextStart.angle = Math.atan2(nextStart.y2 - nextStart.y1, nextStart.x2 - nextStart.x1);

        const nextSpawn = this.computeSpawnFromLine(nextStart.x1, nextStart.y1, nextStart.x2, nextStart.y2);

        this.setStartFinish(nextStart, nextSpawn, { pushUndo: false });

        this.pushAction({
            do: () => this.setStartFinish(nextStart, nextSpawn, { pushUndo: false }),
            undo: () => this.setStartFinish(prevStart, prevSpawn, { pushUndo: false }),
            description: 'Flip start direction'
        });

        this.render();
    };
}

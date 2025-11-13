import {
    DEFAULT_CHECKPOINT_WIDTH,
    DEFAULT_CHECKPOINT_HEIGHT,
    MIN_CHECKPOINT_SIZE,
    CHECKPOINT_HANDLE_SIZE,
    CHECKPOINT_HIT_THRESHOLD
} from './constants.js';

export function applyCheckpointsMixin(LevelEditor) {
    const OPPOSITE_HANDLES = {
        nw: 'se',
        ne: 'sw',
        sw: 'ne',
        se: 'nw',
        n: 's',
        s: 'n',
        e: 'w',
        w: 'e'
    };

    const handlePositionLocal = (width, height, handleId) => {
        const halfWidth = width / 2;
        const halfHeight = height / 2;
        switch (handleId) {
            case 'nw':
                return { x: -halfWidth, y: -halfHeight };
            case 'ne':
                return { x: halfWidth, y: -halfHeight };
            case 'sw':
                return { x: -halfWidth, y: halfHeight };
            case 'se':
                return { x: halfWidth, y: halfHeight };
            case 'n':
                return { x: 0, y: -halfHeight };
            case 's':
                return { x: 0, y: halfHeight };
            case 'e':
                return { x: halfWidth, y: 0 };
            case 'w':
                return { x: -halfWidth, y: 0 };
            case 'rotate':
                return { x: 0, y: -halfHeight - 20 };
            default:
                return { x: 0, y: 0 };
        }
    };

    // Initialize clipboard for checkpoints
    LevelEditor.prototype.checkpointClipboard = null;

    LevelEditor.prototype.activateCheckpointTool = function activateCheckpointTool() {
        this.activateTool('checkpoint');
    };

    LevelEditor.prototype.getNextCheckpointId = function getNextCheckpointId() {
        const existingIds = this.editorState.checkpoints.map(cp => cp.id);
        let counter = 1;
        while (existingIds.includes(`CP${counter}`)) {
            counter++;
        }
        return `CP${counter}`;
    };

    LevelEditor.prototype.createCheckpoint = function createCheckpoint(x, y, width = DEFAULT_CHECKPOINT_WIDTH, height = DEFAULT_CHECKPOINT_HEIGHT, angle = 0) {
        const checkpoint = {
            id: this.getNextCheckpointId(),
            x: Math.round(x),
            y: Math.round(y),
            width: Math.round(width),
            height: Math.round(height),
            angle: angle,
            radius: 0,
            meta: {
                note: '',
                createdAt: new Date().toISOString()
            }
        };

        const prevCheckpoints = [...this.editorState.checkpoints];
        this.editorState.checkpoints.push(checkpoint);
        this.editorState.selectedCheckpoints = [checkpoint.id]; // Select the new checkpoint

        this.pushAction({
            do: () => {
                this.editorState.checkpoints = [...prevCheckpoints, checkpoint];
                this.render();
            },
            undo: () => {
                this.editorState.checkpoints = prevCheckpoints;
                this.render();
            },
            description: `Create checkpoint ${checkpoint.id}`
        });

        this.markUnsavedChanges();
        this.showToast(`Checkpoint ${checkpoint.id} created`, 'success');
        this.render();
        this.updateCheckpointsCard();
        return checkpoint;
    };

    LevelEditor.prototype.moveCheckpoint = function moveCheckpoint(id, dx, dy) {
        const checkpoint = this.editorState.checkpoints.find(cp => cp.id === id);
        if (!checkpoint) return;

        const prevX = checkpoint.x;
        const prevY = checkpoint.y;
        checkpoint.x = Math.round(checkpoint.x + dx);
        checkpoint.y = Math.round(checkpoint.y + dy);

        this.pushAction({
            do: () => {
                checkpoint.x = Math.round(prevX + dx);
                checkpoint.y = Math.round(prevY + dy);
                this.render();
            },
            undo: () => {
                checkpoint.x = prevX;
                checkpoint.y = prevY;
                this.render();
            },
            description: `Move checkpoint ${id}`
        });

        this.markUnsavedChanges();
        this.render();
        this.updateCheckpointsCard();
    };

    LevelEditor.prototype.resizeCheckpoint = function resizeCheckpoint(id, handleId, newX, newY) {
        const checkpoint = this.editorState.checkpoints.find(cp => cp.id === id);
        if (!checkpoint) return;

        const prevWidth = checkpoint.width;
        const prevHeight = checkpoint.height;
        const prevX = checkpoint.x;
        const prevY = checkpoint.y;
        const prevAngle = checkpoint.angle;

        if (handleId === 'rotate') {
            // Handle rotation keeps radius constant, points towards drag position
            const dx = newX - checkpoint.x;
            const dy = newY - checkpoint.y;
            checkpoint.angle = Math.atan2(dy, dx);
        } else {
            const theta = checkpoint.angle;
            const cosTheta = Math.cos(theta);
            const sinTheta = Math.sin(theta);

            // Convert pointer to local coordinates relative to checkpoint center
            const localNewX = (newX - checkpoint.x) * cosTheta + (newY - checkpoint.y) * sinTheta;
            const localNewY = -(newX - checkpoint.x) * sinTheta + (newY - checkpoint.y) * cosTheta;

            const oppositeHandle = OPPOSITE_HANDLES[handleId];
            if (!oppositeHandle) {
                return;
            }

            const anchorLocal = handlePositionLocal(checkpoint.width, checkpoint.height, oppositeHandle);
            const currentHandleLocal = handlePositionLocal(checkpoint.width, checkpoint.height, handleId);

            let handleLocal = { x: localNewX, y: localNewY };
            const affectsWidth = /[we]/.test(handleId);
            const affectsHeight = /[ns]/.test(handleId);

            // Restrict movement for edge handles to their axis
            if (!affectsWidth) {
                handleLocal.x = anchorLocal.x;
            }
            if (!affectsHeight) {
                handleLocal.y = anchorLocal.y;
            }

            const minSize = MIN_CHECKPOINT_SIZE;

            if (affectsWidth) {
                const direction = Math.sign(currentHandleLocal.x - anchorLocal.x) || 1;
                if (direction >= 0) {
                    handleLocal.x = Math.max(anchorLocal.x + minSize, handleLocal.x);
                } else {
                    handleLocal.x = Math.min(anchorLocal.x - minSize, handleLocal.x);
                }
            }

            if (affectsHeight) {
                const direction = Math.sign(currentHandleLocal.y - anchorLocal.y) || 1;
                if (direction >= 0) {
                    handleLocal.y = Math.max(anchorLocal.y + minSize, handleLocal.y);
                } else {
                    handleLocal.y = Math.min(anchorLocal.y - minSize, handleLocal.y);
                }
            }

            const newWidth = affectsWidth ? Math.abs(handleLocal.x - anchorLocal.x) : checkpoint.width;
            const newHeight = affectsHeight ? Math.abs(handleLocal.y - anchorLocal.y) : checkpoint.height;

            const centerLocalX = affectsWidth ? (handleLocal.x + anchorLocal.x) / 2 : 0;
            const centerLocalY = affectsHeight ? (handleLocal.y + anchorLocal.y) / 2 : 0;

            const newCenterWorldX = checkpoint.x + centerLocalX * cosTheta - centerLocalY * sinTheta;
            const newCenterWorldY = checkpoint.y + centerLocalX * sinTheta + centerLocalY * cosTheta;

            checkpoint.width = Math.round(newWidth);
            checkpoint.height = Math.round(newHeight);
            checkpoint.x = Math.round(newCenterWorldX);
            checkpoint.y = Math.round(newCenterWorldY);
        }

        // Don't push action here - it's pushed in onMouseUp
        this.render();
    };

    LevelEditor.prototype.showCheckpointDeletionModal = function showCheckpointDeletionModal(checkpointIds) {
        this.ensureEditorOverlayStyles();

        let modal = document.getElementById('checkpoint-deletion-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'checkpoint-deletion-modal';
            modal.className = 'editor-modal';
            modal.setAttribute('role', 'dialog');
            modal.setAttribute('aria-modal', 'true');
            modal.setAttribute('aria-labelledby', 'checkpoint-deletion-title');
            modal.setAttribute('aria-describedby', 'checkpoint-deletion-description');
            modal.setAttribute('aria-hidden', 'true');
            modal.setAttribute('hidden', '');
            document.body.appendChild(modal);
        }

        const count = checkpointIds.length;
        const message = count === 1
            ? `Are you sure you want to <strong>delete</strong> this checkpoint?`
            : `Are you sure you want to <strong>delete</strong> ${count} checkpoints?`;

        const content = document.createElement('section');
        content.className = 'ui-card editor-modal__content';
        content.setAttribute('role', 'document');
        content.setAttribute('tabindex', '-1');

        const closeButton = document.createElement('button');
        closeButton.type = 'button';
        closeButton.className = 'editor-modal__close';
        closeButton.setAttribute('aria-label', 'Close deletion confirmation');
        closeButton.innerHTML = '&times;';
        closeButton.onclick = () => {
            this.hideCheckpointDeletionModal();
        };

        const title = document.createElement('h2');
        title.className = 'ui-card__title';
        title.id = 'checkpoint-deletion-title';
        title.textContent = 'Confirm Deletion';

        const body = document.createElement('div');
        body.className = 'ui-card__body';

        const lead = document.createElement('p');
        lead.className = 'editor-modal__lead';
        lead.id = 'checkpoint-deletion-description';
        lead.innerHTML = message;

        const actions = document.createElement('div');
        actions.className = 'editor-modal__actions';

        const confirmButton = document.createElement('button');
        confirmButton.type = 'button';
        confirmButton.className = 'editor-modal__action';
        confirmButton.textContent = 'Confirm';
        confirmButton.onclick = () => {
            this.hideCheckpointDeletionModal();
            this.confirmDeleteCheckpoints(checkpointIds);
        };

        const cancelButton = document.createElement('button');
        cancelButton.type = 'button';
        cancelButton.className = 'editor-modal__action editor-modal__action--secondary';
        cancelButton.textContent = 'Cancel';
        cancelButton.onclick = () => {
            this.hideCheckpointDeletionModal();
        };

        actions.appendChild(confirmButton);
        actions.appendChild(cancelButton);

        body.appendChild(lead);
        body.appendChild(actions);

        content.appendChild(closeButton);
        content.appendChild(title);
        content.appendChild(body);

        modal.textContent = '';
        modal.appendChild(content);
        modal.classList.add('is-open');
        modal.removeAttribute('hidden');
        modal.setAttribute('aria-hidden', 'false');
    };

    LevelEditor.prototype.hideCheckpointDeletionModal = function hideCheckpointDeletionModal() {
        const modal = document.getElementById('checkpoint-deletion-modal');
        if (modal) {
            modal.classList.remove('is-open');
            modal.setAttribute('aria-hidden', 'true');
            modal.setAttribute('hidden', '');
        }
    };

    LevelEditor.prototype.confirmDeleteCheckpoints = function confirmDeleteCheckpoints(checkpointIds) {
        const prevCheckpoints = [...this.editorState.checkpoints];
        const deletedCheckpoints = [];

        for (const id of checkpointIds) {
            const index = this.editorState.checkpoints.findIndex(cp => cp.id === id);
            if (index !== -1) {
                const checkpoint = this.editorState.checkpoints.splice(index, 1)[0];
                deletedCheckpoints.push(checkpoint);

                // Remove from selection
                const selIndex = this.editorState.selectedCheckpoints.indexOf(id);
                if (selIndex > -1) {
                    this.editorState.selectedCheckpoints.splice(selIndex, 1);
                }
            }
        }

        if (deletedCheckpoints.length > 0) {
            this.pushAction({
                do: () => {
                    this.editorState.checkpoints = prevCheckpoints.filter(cp => !checkpointIds.includes(cp.id));
                    this.editorState.selectedCheckpoints = this.editorState.selectedCheckpoints.filter(id => !checkpointIds.includes(id));
                    this.render();
                    this.updateCheckpointsCard();
                },
                undo: () => {
                    this.editorState.checkpoints = prevCheckpoints;
                    this.render();
                    this.updateCheckpointsCard();
                },
                description: `Delete ${deletedCheckpoints.length} checkpoint(s)`
            });

            this.markUnsavedChanges();
            this.showToast(`${deletedCheckpoints.length} checkpoint(s) deleted`, 'info');
            this.render();
            this.updateCheckpointsCard();
        }
    };

    LevelEditor.prototype.deleteCheckpoint = function deleteCheckpoint(id) {
        this.showCheckpointDeletionModal([id]);
    };

    LevelEditor.prototype.deleteSelectedCheckpoints = function deleteSelectedCheckpoints() {
        if (this.editorState.selectedCheckpoints.length === 0) {
            this.showToast('No checkpoints selected to delete', 'info');
            return;
        }
        this.showCheckpointDeletionModal([...this.editorState.selectedCheckpoints]);
    };

    LevelEditor.prototype.hitTestCheckpoint = function hitTestCheckpoint(worldX, worldY) {
        if (!this.editorState.uiToggles.showCheckpoints) return null;

        for (const checkpoint of this.editorState.checkpoints) {
            const cos = Math.cos(-checkpoint.angle);
            const sin = Math.sin(-checkpoint.angle);
            const localX = (worldX - checkpoint.x) * cos - (worldY - checkpoint.y) * sin;
            const localY = (worldX - checkpoint.x) * sin + (worldY - checkpoint.y) * cos;

            const halfWidth = checkpoint.width / 2;
            const halfHeight = checkpoint.height / 2;

            if (Math.abs(localX) <= halfWidth + CHECKPOINT_HIT_THRESHOLD / this.zoom &&
                Math.abs(localY) <= halfHeight + CHECKPOINT_HIT_THRESHOLD / this.zoom) {
                return { type: 'checkpoint', id: checkpoint.id };
            }
        }
        return null;
    };

    LevelEditor.prototype.hitTestCheckpointHandles = function hitTestCheckpointHandles(screenX, screenY) {
        if (!this.editorState.uiToggles.showCheckpoints || this.editorState.selectedCheckpoints.length === 0) return null;

        const worldX = (screenX - this.panX) / this.zoom;
        const worldY = (screenY - this.panY) / this.zoom;

        // For simplicity, assume single selection for handles (can extend later)
        const selectedId = this.editorState.selectedCheckpoints[0];
        const checkpoint = this.editorState.checkpoints.find(cp => cp.id === selectedId);
        if (!checkpoint) return null;

        const handleSize = CHECKPOINT_HANDLE_SIZE;
        const handleRadius = (handleSize / this.zoom) * 1.5; // Make handles easier to grab
        const cos = Math.cos(-checkpoint.angle);
        const sin = Math.sin(-checkpoint.angle);
        const localX = (worldX - checkpoint.x) * cos - (worldY - checkpoint.y) * sin;
        const localY = (worldX - checkpoint.x) * sin + (worldY - checkpoint.y) * cos;

        const halfWidth = checkpoint.width / 2;
        const halfHeight = checkpoint.height / 2;

        const handles = [
            { id: 'rotate', x: 0, y: -halfHeight - 20 },  // Check rotate first for priority
            { id: 'nw', x: -halfWidth, y: -halfHeight },
            { id: 'ne', x: halfWidth, y: -halfHeight },
            { id: 'sw', x: -halfWidth, y: halfHeight },
            { id: 'se', x: halfWidth, y: halfHeight },
            { id: 'n', x: 0, y: -halfHeight },
            { id: 's', x: 0, y: halfHeight },
            { id: 'w', x: -halfWidth, y: 0 },
            { id: 'e', x: halfWidth, y: 0 }
        ];

        for (const handle of handles) {
            const dist = Math.hypot(localX - handle.x, localY - handle.y);
            if (dist <= handleRadius) {
                return { cpId: checkpoint.id, handleId: handle.id };
            }
        }

        return null;
    };

    LevelEditor.prototype.renderCheckpoints = function renderCheckpoints() {
        if (!this.editorState.uiToggles.showCheckpoints) return;

        for (const checkpoint of this.editorState.checkpoints) {
            this.ctx.save();
            this.ctx.translate(checkpoint.x, checkpoint.y);
            this.ctx.rotate(checkpoint.angle);

            // Draw rectangle
            this.ctx.strokeStyle = this.editorState.selectedCheckpoints.includes(checkpoint.id) ? '#00ff00' : '#008000';
            this.ctx.lineWidth = 2;
            this.ctx.strokeRect(-checkpoint.width / 2, -checkpoint.height / 2, checkpoint.width, checkpoint.height);

            // Draw fill if selected
            if (this.editorState.selectedCheckpoints.includes(checkpoint.id)) {
                this.ctx.fillStyle = 'rgba(0, 255, 0, 0.1)';
                this.ctx.fillRect(-checkpoint.width / 2, -checkpoint.height / 2, checkpoint.width, checkpoint.height);
            }

            // Draw ID label
            this.ctx.fillStyle = '#008000';
            this.ctx.font = '12px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.fillText(checkpoint.id, 0, -checkpoint.height / 2 - 5);

            this.ctx.restore();

            // Draw handles if selected
            if (this.editorState.selectedCheckpoints.includes(checkpoint.id)) {
                this.drawCheckpointHandles(checkpoint);
            }
        }
    };

    LevelEditor.prototype.drawCheckpointHandles = function drawCheckpointHandles(checkpoint) {
        const handleSize = CHECKPOINT_HANDLE_SIZE;
        const halfWidth = checkpoint.width / 2;
        const halfHeight = checkpoint.height / 2;

        this.ctx.save();
        this.ctx.translate(checkpoint.x, checkpoint.y);
        this.ctx.rotate(checkpoint.angle);

        this.ctx.fillStyle = 'white';
        this.ctx.strokeStyle = '#00ff00';
        this.ctx.lineWidth = 1;

        const handles = [
            { x: -halfWidth, y: -halfHeight },
            { x: halfWidth, y: -halfHeight },
            { x: -halfWidth, y: halfHeight },
            { x: halfWidth, y: halfHeight },
            { x: 0, y: -halfHeight },
            { x: 0, y: halfHeight },
            { x: -halfWidth, y: 0 },
            { x: halfWidth, y: 0 }
        ];

        for (const handle of handles) {
            this.ctx.beginPath();
            this.ctx.rect(handle.x - handleSize / 2, handle.y - handleSize / 2, handleSize, handleSize);
            this.ctx.fill();
            this.ctx.stroke();
        }

        // Draw rotate handle above the rectangle
        this.ctx.beginPath();
        this.ctx.arc(0, -halfHeight - 20, handleSize / 2, 0, 2 * Math.PI);
        this.ctx.fill();
        this.ctx.stroke();

        // Draw rotation line
        this.ctx.beginPath();
        this.ctx.moveTo(0, -halfHeight);
        this.ctx.lineTo(0, -halfHeight - 15);
        this.ctx.stroke();

        this.ctx.restore();
    };

    LevelEditor.prototype.drawCheckpointPreview = function drawCheckpointPreview() {
        const x1 = Math.min(this.dragStartX, this.dragEndX);
        const y1 = Math.min(this.dragStartY, this.dragEndY);
        const x2 = Math.max(this.dragStartX, this.dragEndX);
        const y2 = Math.max(this.dragStartY, this.dragEndY);
        const width = x2 - x1;
        const height = y2 - y1;

        this.ctx.strokeStyle = 'rgba(0, 255, 0, 0.5)';
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(x1, y1, width, height);

        this.ctx.fillStyle = 'rgba(0, 255, 0, 0.1)';
        this.ctx.fillRect(x1, y1, width, height);
    };

    LevelEditor.prototype.onCanvasMouseDown_Checkpoint = function onCanvasMouseDown_Checkpoint(e) {
        const worldX = (e.offsetX - this.panX) / this.zoom;
        const worldY = (e.offsetY - this.panY) / this.zoom;

        // Check for handle interaction first
        const handleHit = this.hitTestCheckpointHandles(e.offsetX, e.offsetY);
        if (handleHit) {
            this.selectedHandle = handleHit.handleId;
            this.isDraggingHandle = true;
            this.draggingCheckpointId = handleHit.cpId;
            this.dragInitialState = {
                checkpoint: { ...this.editorState.checkpoints.find(cp => cp.id === handleHit.cpId) }
            };
            this.canvas.style.cursor = 'grabbing';
            return;
        }

        // Check for checkpoint selection
        const checkpointHit = this.hitTestCheckpoint(worldX, worldY);
        if (checkpointHit) {
            if (e.shiftKey) {
                // Toggle multi-select
                const index = this.editorState.selectedCheckpoints.indexOf(checkpointHit.id);
                if (index > -1) {
                    this.editorState.selectedCheckpoints.splice(index, 1);
                } else {
                    this.editorState.selectedCheckpoints.push(checkpointHit.id);
                }
            } else {
                // Single select
                this.editorState.selectedCheckpoints = [checkpointHit.id];
            }
            this.editorState.selectedObject = null; // Clear other selections
            this.isDraggingCheckpoint = true;
            this.dragStartX = worldX;
            this.dragStartY = worldY;
            this.dragInitialCheckpoints = this.editorState.selectedCheckpoints.map(id => 
                ({ ...this.editorState.checkpoints.find(cp => cp.id === id) })
            );
            this.canvas.style.cursor = 'grabbing';
            this.render();
            return;
        }

        // Clear selection when clicking empty space
        if (!e.shiftKey) {
            this.editorState.selectedCheckpoints = [];
        }

        // Start drawing new checkpoint
        this.toolDragging = true;
        this.dragStartX = worldX;
        this.dragStartY = worldY;
        this.dragEndX = worldX;
        this.dragEndY = worldY;
    };

    LevelEditor.prototype.onCanvasMouseMove_Checkpoint = function onCanvasMouseMove_Checkpoint(e) {
        const worldX = (e.offsetX - this.panX) / this.zoom;
        const worldY = (e.offsetY - this.panY) / this.zoom;

        if (this.isDraggingHandle && this.selectedHandle) {
            if (this.selectedHandle === 'rotate') {
                // Handle rotation - point towards the drag position
                const checkpoint = this.editorState.checkpoints.find(cp => cp.id === this.draggingCheckpointId);
                if (checkpoint) {
                    const dx = worldX - checkpoint.x;
                    const dy = worldY - checkpoint.y;
                    checkpoint.angle = Math.atan2(dy, dx) + Math.PI / 2; // Add 90° so up is 0°
                    this.render();
                }
            } else {
                this.resizeCheckpoint(this.draggingCheckpointId, this.selectedHandle, worldX, worldY);
            }
        } else if (this.isDraggingCheckpoint) {
            const dx = worldX - this.dragStartX;
            const dy = worldY - this.dragStartY;
            for (let i = 0; i < this.editorState.selectedCheckpoints.length; i++) {
                const id = this.editorState.selectedCheckpoints[i];
                const checkpoint = this.editorState.checkpoints.find(cp => cp.id === id);
                if (checkpoint) {
                    checkpoint.x = Math.round(this.dragInitialCheckpoints[i].x + dx);
                    checkpoint.y = Math.round(this.dragInitialCheckpoints[i].y + dy);
                }
            }
            this.render();
        } else if (this.toolDragging) {
            this.dragEndX = worldX;
            this.dragEndY = worldY;
            this.render();
        } else {
            // Update cursor
            const handleHit = this.hitTestCheckpointHandles(e.offsetX, e.offsetY);
            if (handleHit) {
                if (handleHit.handleId === 'rotate') {
                    this.canvas.style.cursor = 'grab';
                } else if (handleHit.handleId === 'nw' || handleHit.handleId === 'se') {
                    this.canvas.style.cursor = 'nwse-resize';
                } else if (handleHit.handleId === 'ne' || handleHit.handleId === 'sw') {
                    this.canvas.style.cursor = 'nesw-resize';
                } else if (handleHit.handleId === 'n' || handleHit.handleId === 's') {
                    this.canvas.style.cursor = 'ns-resize';
                } else if (handleHit.handleId === 'w' || handleHit.handleId === 'e') {
                    this.canvas.style.cursor = 'ew-resize';
                } else {
                    this.canvas.style.cursor = 'grab';
                }
            } else {
                const checkpointHit = this.hitTestCheckpoint(worldX, worldY);
                if (checkpointHit) {
                    this.canvas.style.cursor = 'move';
                } else {
                    this.canvas.style.cursor = 'crosshair';
                }
            }
        }
    };

    LevelEditor.prototype.onCanvasMouseUp_Checkpoint = function onCanvasMouseUp_Checkpoint() {
        if (this.isDraggingHandle) {
            this.isDraggingHandle = false;
            const checkpoint = this.editorState.checkpoints.find(cp => cp.id === this.draggingCheckpointId);
            if (checkpoint) {
                const initial = this.dragInitialState.checkpoint;
                const finalState = { ...checkpoint };
                const handleLabel = this.selectedHandle === 'rotate' ? 'Rotate' : 'Resize';

                this.pushAction({
                    do: () => {
                        Object.assign(checkpoint, finalState);
                        this.render();
                        this.updateCheckpointsCard();
                    },
                    undo: () => {
                        Object.assign(checkpoint, initial);
                        this.render();
                        this.updateCheckpointsCard();
                    },
                    description: `${handleLabel} checkpoint ${checkpoint.id}`
                });
                this.markUnsavedChanges();
            }

            this.selectedHandle = null;
            this.draggingCheckpointId = null;
            this.dragInitialState = null;
            this.canvas.style.cursor = 'crosshair';
        } else if (this.isDraggingCheckpoint) {
            this.isDraggingCheckpoint = false;
            const checkpointIds = [...this.editorState.selectedCheckpoints];
            const finalCheckpoints = checkpointIds.map(id => ({ ...this.editorState.checkpoints.find(cp => cp.id === id) }));
            const initial = this.dragInitialCheckpoints;

            this.pushAction({
                do: () => {
                    for (let i = 0; i < checkpointIds.length; i++) {
                        const checkpoint = this.editorState.checkpoints.find(cp => cp.id === checkpointIds[i]);
                        if (checkpoint) {
                            checkpoint.x = finalCheckpoints[i].x;
                            checkpoint.y = finalCheckpoints[i].y;
                        }
                    }
                    this.render();
                },
                undo: () => {
                    for (let i = 0; i < checkpointIds.length; i++) {
                        const checkpoint = this.editorState.checkpoints.find(cp => cp.id === checkpointIds[i]);
                        if (checkpoint) {
                            checkpoint.x = initial[i].x;
                            checkpoint.y = initial[i].y;
                        }
                    }
                    this.render();
                },
                description: `Move ${checkpointIds.length} checkpoint(s)`
            });
            this.markUnsavedChanges();

            this.canvas.style.cursor = 'crosshair';
            this.dragInitialCheckpoints = null;
        } else if (this.toolDragging) {
            this.toolDragging = false;
            const width = Math.abs(this.dragEndX - this.dragStartX);
            const height = Math.abs(this.dragEndY - this.dragStartY);

            if (width >= MIN_CHECKPOINT_SIZE && height >= MIN_CHECKPOINT_SIZE) {
                const centerX = (this.dragStartX + this.dragEndX) / 2;
                const centerY = (this.dragStartY + this.dragEndY) / 2;
                this.createCheckpoint(centerX, centerY, width, height);
            } else {
                // Click to create default size
                this.createCheckpoint(this.dragStartX, this.dragStartY);
            }
        }
    };
}
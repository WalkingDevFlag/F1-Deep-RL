export function applyInteractionMixin(LevelEditor) {
    LevelEditor.prototype.setupEventListeners = function setupEventListeners() {
        if (this.exitBtn) {
            this.exitBtn.addEventListener('click', () => {
                this.hideEditor();
            });
        }

        if (this.dock) {
            const buttons = this.dock.querySelectorAll('.ui-dock__button[data-tool]');
            buttons.forEach((button) => {
                button.addEventListener('click', (e) => {
                    const tool = e.currentTarget.getAttribute('data-tool');
                    if (tool === 'undo') {
                        this.undo();
                    } else if (tool === 'redo') {
                        this.redo();
                    } else if (tool === 'pan') {
                        this.togglePanMode();
                    } else {
                        this.activateTool(tool);
                    }
                });
            });
        }

        document.addEventListener('keydown', (e) => {
            if (e.key.toLowerCase() === 's' && !e.ctrlKey && !e.metaKey) {
                e.preventDefault();
                this.activateTool('start-finish');
            } else if (e.key.toLowerCase() === 'p' && !e.ctrlKey && !e.metaKey) {
                e.preventDefault();
                this.togglePanMode();
            } else if (e.key === ' ') {
                e.preventDefault();
                this.spaceHeld = true;
                this.setInteractionMode('pan');
            } else if (e.key === 'Escape') {
                this.cancelCurrentTool();
            } else if (e.key === 'Delete' && this.editorState.selectedObject) {
                this.deleteSelectedObject();
            } else if (e.key.toLowerCase() === 'f' && this.editorState.selectedObject === 'startLine') {
                this.flipStartDirection();
            } else if (e.ctrlKey && e.key === 'z') {
                e.preventDefault();
                this.undo();
            } else if (e.ctrlKey && e.key === 'y') {
                e.preventDefault();
                this.redo();
            }
        });

        document.addEventListener('keyup', (e) => {
            if (e.key === ' ') {
                this.spaceHeld = false;
                this.restorePreviousMode();
            }
        });

        this.canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            this.handleZoom(e);
        });

        this.canvas.addEventListener('mousedown', (e) => {
            this.handleMouseDown(e);
        });

        this.canvas.addEventListener('mousemove', (e) => {
            this.handleMouseMove(e);
        });

        this.canvas.addEventListener('mouseup', () => {
            this.handleMouseUp();
        });

        this.canvas.addEventListener('mouseleave', () => {
            this.handleMouseUp();
        });
    };

    LevelEditor.prototype.activateTool = function activateTool(toolName) {
        if (this.currentTool) {
            this.deactivateTool(this.currentTool);
        }

        this.currentTool = toolName;
        const button = this.dock ? this.dock.querySelector(`[data-tool="${toolName}"]`) : null;
        if (button) {
            button.classList.add('is-active');
            button.disabled = false;
        }

        if (toolName === 'pan') {
            this.setInteractionMode('pan');
        } else {
            this.setInteractionMode('tool');
            this.canvas.style.cursor = 'crosshair';
        }

        this.toolDragging = false;
        this.selectedHandle = null;
        this.isDraggingHandle = false;
        this.dragInitialState = null;
        this.editorState.selectedObject = null;
    };

    LevelEditor.prototype.deactivateTool = function deactivateTool(toolName) {
        const button = this.dock ? this.dock.querySelector(`[data-tool="${toolName}"]`) : null;
        if (button) {
            button.classList.remove('is-active');
        }
        this.currentTool = null;
    };

    LevelEditor.prototype.cancelCurrentTool = function cancelCurrentTool() {
        if (this.currentTool === 'start-finish') {
            this.toolDragging = false;
            this.render();
        }
        this.selectedHandle = null;
        this.isDraggingHandle = false;
        this.dragInitialState = null;
        this.editorState.selectedObject = null;
        this.activateTool('select');
    };

    LevelEditor.prototype.handleZoom = function handleZoom(e) {
        const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
        const mouseX = e.offsetX;
        const mouseY = e.offsetY;
        const worldX = (mouseX - this.panX) / this.zoom;
        const worldY = (mouseY - this.panY) / this.zoom;

        this.zoom *= zoomFactor;
        this.zoom = Math.max(0.1, Math.min(5, this.zoom));
        this.panX = mouseX - worldX * this.zoom;
        this.panY = mouseY - worldY * this.zoom;
        this.render();
    };

    LevelEditor.prototype.handleMouseDown = function handleMouseDown(e) {
        const worldX = (e.offsetX - this.panX) / this.zoom;
        const worldY = (e.offsetY - this.panY) / this.zoom;

        if (this.currentInteractionMode === 'pan') {
            this.isDragging = true;
            this.lastMouseX = e.offsetX;
            this.lastMouseY = e.offsetY;
            this.canvas.style.cursor = 'grabbing';
            return;
        }

        if (this.currentTool === 'start-finish') {
            this.toolDragging = true;
            this.dragStartX = worldX;
            this.dragStartY = worldY;
            this.dragEndX = worldX;
            this.dragEndY = worldY;
        } else if (this.currentTool === 'select' || this.currentTool === 'delete') {
            const hit = this.getHitAt(worldX, worldY);
            if (hit) {
                if (hit.type === 'handle') {
                    this.selectedHandle = hit.which;
                    this.isDraggingHandle = true;
                    this.dragInitialState = {
                        startLine: { ...this.editorState.startLine },
                        spawn: { ...this.editorState.spawn }
                    };
                    this.canvas.style.cursor = 'grabbing';
                } else if (hit.type === 'line') {
                    this.editorState.selectedObject = 'startLine';
                    if (this.currentTool === 'delete') {
                        if (confirm('Delete Start/Finish line?')) {
                            this.removeStartFinish();
                            this.editorState.selectedObject = null;
                        }
                    }
                }
                this.render();
                return;
            }
            this.editorState.selectedObject = null;
            this.render();
        } else if (this.editorState.startLine) {
            const hit = this.getHitAt(worldX, worldY);
            if (hit) {
                if (hit.type === 'handle') {
                    this.selectedHandle = hit.which;
                    this.isDraggingHandle = true;
                    this.dragInitialState = {
                        startLine: { ...this.editorState.startLine },
                        spawn: { ...this.editorState.spawn }
                    };
                    this.canvas.style.cursor = 'grabbing';
                } else if (hit.type === 'line') {
                    this.editorState.selectedObject = 'startLine';
                    this.render();
                }
                return;
            }
        }

        if (!this.isDraggingHandle && !this.toolDragging) {
            this.isDragging = true;
            this.lastMouseX = e.offsetX;
            this.lastMouseY = e.offsetY;
            this.canvas.style.cursor = 'grabbing';
        }
    };

    LevelEditor.prototype.handleMouseMove = function handleMouseMove(e) {
        const worldX = (e.offsetX - this.panX) / this.zoom;
        const worldY = (e.offsetY - this.panY) / this.zoom;

        if (this.currentInteractionMode === 'pan' && this.isDragging) {
            const deltaX = e.offsetX - this.lastMouseX;
            const deltaY = e.offsetY - this.lastMouseY;
            this.panX += deltaX;
            this.panY += deltaY;
            this.lastMouseX = e.offsetX;
            this.lastMouseY = e.offsetY;
            this.render();
            return;
        }

        if (this.currentTool === 'start-finish' && this.toolDragging) {
            this.dragEndX = worldX;
            this.dragEndY = worldY;
            this.render();
        } else if (this.isDraggingHandle && this.selectedHandle && this.editorState.startLine) {
            const clampedX = this.trackImage ? Math.max(0, Math.min(this.trackImage.width, worldX)) : worldX;
            const clampedY = this.trackImage ? Math.max(0, Math.min(this.trackImage.height, worldY)) : worldY;
            const line = { ...this.editorState.startLine };
            if (this.selectedHandle === 'start') {
                line.x1 = clampedX;
                line.y1 = clampedY;
            } else if (this.selectedHandle === 'end') {
                line.x2 = clampedX;
                line.y2 = clampedY;
            }
            line.angle = Math.atan2(line.y2 - line.y1, line.x2 - line.x1);
            const spawn = this.computeSpawnFromLine(line.x1, line.y1, line.x2, line.y2);
            this.setStartFinish(line, spawn, { pushUndo: false });
        } else if (this.isDragging) {
            const deltaX = e.offsetX - this.lastMouseX;
            const deltaY = e.offsetY - this.lastMouseY;
            this.panX += deltaX;
            this.panY += deltaY;
            this.lastMouseX = e.offsetX;
            this.lastMouseY = e.offsetY;
            this.render();
        }

        if (!this.isDragging && !this.isDraggingHandle && !this.toolDragging && this.currentInteractionMode !== 'pan') {
            const hit = this.getHitAt(worldX, worldY);
            if (hit) {
                if (hit.type === 'handle') {
                    this.canvas.style.cursor = 'grab';
                } else if (hit.type === 'line') {
                    this.canvas.style.cursor = 'pointer';
                }
            } else {
                this.canvas.style.cursor = 'grab';
            }
        }
    };

    LevelEditor.prototype.handleMouseUp = function handleMouseUp() {
        if (this.currentTool === 'start-finish' && this.toolDragging) {
            this.toolDragging = false;
            this.placeStartFinish(this.dragStartX, this.dragStartY, this.dragEndX, this.dragEndY);
        } else if (this.isDraggingHandle) {
            this.isDraggingHandle = false;
            const handle = this.selectedHandle;
            this.selectedHandle = null;
            this.canvas.style.cursor = 'grab';
            if (this.dragInitialState) {
                const finalLine = this.editorState.startLine;
                const finalSpawn = this.editorState.spawn;
                const initial = this.dragInitialState;
                this.pushAction({
                    do: () => this.setStartFinish(finalLine, finalSpawn, { pushUndo: false }),
                    undo: () => this.setStartFinish(initial.startLine, initial.spawn, { pushUndo: false }),
                    description: `Move Start/Finish ${handle} handle`
                });
                this.dragInitialState = null;
            }
        } else {
            this.isDragging = false;
            this.canvas.style.cursor = 'grab';
        }
    };

    LevelEditor.prototype.togglePanMode = function togglePanMode() {
        const nextMode = this.currentInteractionMode === 'pan' ? 'tool' : 'pan';
        this.setInteractionMode(nextMode);
    };

    LevelEditor.prototype.setInteractionMode = function setInteractionMode(mode) {
        this.currentInteractionMode = mode;
        const panBtn = this.dock ? this.dock.querySelector('[data-tool="pan"]') : null;
        if (mode === 'pan') {
            if (panBtn) {
                panBtn.classList.add('is-active');
            }
            this.canvas.style.cursor = 'grab';
            if (this.currentTool && this.currentTool !== 'pan') {
                this.deactivateTool(this.currentTool);
            }
        } else {
            if (panBtn) {
                panBtn.classList.remove('is-active');
            }
            this.canvas.style.cursor = 'default';
        }
        this.render();
    };

    LevelEditor.prototype.restorePreviousMode = function restorePreviousMode() {
        this.setInteractionMode('tool');
    };
}

export function applyPersistenceMixin(LevelEditor) {
    LevelEditor.prototype.serializeGeometry = function serializeGeometry(options = {}) {
        const {
            author = 'Unknown',
            notes = '',
            source = 'editor-v1'
        } = options;

        if (!this.currentMeta) {
            throw new Error('No track loaded');
        }

        // Build geometry object
        const geometry = {
            version: 1,
            trackId: this.currentMeta.id,
            createdAt: this.currentMeta.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            spawn: this.editorState.spawn ? {
                x: Math.round(this.editorState.spawn.x),
                y: Math.round(this.editorState.spawn.y),
                angle: this.editorState.spawn.angle
            } : null,
            checkpoints: this.editorState.checkpoints.map((cp, index) => ({
                id: cp.id || `CP${index + 1}`,
                x: Math.round(cp.x),
                y: Math.round(cp.y),
                width: Math.round(cp.width),
                height: Math.round(cp.height),
                angle: cp.angle || 0,
                radius: cp.radius || 0
            })),
            walls: this.editorState.walls.map((wall, index) => ({
                id: wall.id || `wall_${index + 1}`,
                polyline: wall.polyline ? wall.polyline.map(point => [
                    Math.round(point.x),
                    Math.round(point.y)
                ]) : wall.map(point => [
                    Math.round(point.x),
                    Math.round(point.y)
                ])
            })),
            meta: {
                author,
                notes,
                source,
                name: this.currentMeta.name || 'Unknown Track'
            }
        };

        // Add startLine if it exists
        if (this.editorState.startLine) {
            geometry.startLine = {
                x1: Math.round(this.editorState.startLine.x1),
                y1: Math.round(this.editorState.startLine.y1),
                x2: Math.round(this.editorState.startLine.x2),
                y2: Math.round(this.editorState.startLine.y2),
                angle: this.editorState.startLine.angle
            };
        }

        return geometry;
    };

    LevelEditor.prototype.saveGeometry = async function saveGeometry() {
        if (!this.currentMeta) {
            this.showToast('No track loaded', 'error');
            return;
        }

        // Check if offline
        if (!this.isOnline) {
            this.storePendingSave();
            this.showToast('Offline - save queued', 'info');
            return;
        }

        // Disable editing and show saving overlay
        this.setSavingState(true);

        try {
            // Serialize geometry
            const geometry = this.serializeGeometry({
                author: 'Editor User', // Could be made configurable
                notes: '',
                source: 'editor-v1'
            });

            // Add previous updatedAt for concurrency control
            if (this.currentMeta.geometry) {
                geometry.prevUpdatedAt = this.currentMeta.geometry.updatedAt;
            }

            // Send to server
            const response = await fetch(`/tracks/${this.currentMeta.id}/geometry`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(geometry)
            });

            const result = await response.json();

            if (response.ok) {
                // Success
                this.currentMeta.geometry = geometry;
                this.currentMeta.updatedAt = result.updatedAt;
                this.showToast(`Saved at ${new Date(result.updatedAt).toLocaleTimeString()}`, 'success');

                // Clear draft and mark as saved
                this.clearDraft(this.currentMeta.id);
                this.hasUnsavedChanges = false;

                // Update undo stack base
                this.undoStack = [];
                this.redoStack = [];

            } else if (response.status === 409) {
                // Conflict
                this.showToast('Track changed on server. Please reload.', 'error');
                // Could show modal to resolve conflict
            } else {
                // Other error
                this.showToast(result.error || 'Save failed', 'error');
            }
        } catch (error) {
            console.error('Save failed:', error);
            // If network error, treat as offline
            if (!navigator.onLine) {
                this.isOnline = false;
                this.storePendingSave();
                this.showToast('Offline - save queued', 'info');
            } else {
                this.showToast('Save failed - check connection', 'error');
            }
        } finally {
            this.setSavingState(false);
        }
    };

    LevelEditor.prototype.setSavingState = function setSavingState(saving) {
        const saveButton = this.dock ? this.dock.querySelector('[data-tool="save"]') : null;
        if (saveButton) {
            saveButton.disabled = saving;

            const label = saveButton.querySelector('.ui-dock__label');
            if (label) {
                label.textContent = saving ? 'Saving...' : 'Save';
            }

            const tooltip = saveButton.querySelector('.ui-dock__tooltip');
            if (tooltip) {
                tooltip.textContent = saving ? 'Saving...' : 'Save';
            }
        }

        // Disable other tools during save
        const otherButtons = this.dock ? this.dock.querySelectorAll('.ui-dock__button[data-tool]:not([data-tool="save"])') : [];
        otherButtons.forEach(button => {
            button.disabled = saving;
        });

        // Show overlay
        if (saving) {
            this.showSavingOverlay();
        } else {
            this.hideSavingOverlay();
        }
    };

    LevelEditor.prototype.showSavingOverlay = function showSavingOverlay() {
        let overlay = document.getElementById('saving-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'saving-overlay';
            overlay.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.5);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 10000;
                color: white;
                font-size: 24px;
            `;
            overlay.innerHTML = '<div>Saving...</div>';
            document.body.appendChild(overlay);
        }
        overlay.style.display = 'flex';
    };

    LevelEditor.prototype.hideSavingOverlay = function hideSavingOverlay() {
        const overlay = document.getElementById('saving-overlay');
        if (overlay) {
            overlay.style.display = 'none';
        }
    };

    LevelEditor.prototype.showToast = function showToast(message, type = 'info') {
        // Simple toast implementation
        let toast = document.getElementById('editor-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'editor-toast';
            toast.style.cssText = `
                position: fixed;
                bottom: 20px;
                right: 20px;
                padding: 10px 20px;
                border-radius: 4px;
                color: white;
                font-weight: bold;
                z-index: 10001;
                transition: opacity 0.3s;
            `;
            document.body.appendChild(toast);
        }

        toast.textContent = message;
        toast.style.backgroundColor = type === 'error' ? '#e74c3c' : type === 'success' ? '#27ae60' : '#3498db';
        toast.style.opacity = '1';

        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.parentNode.removeChild(toast);
                }
            }, 300);
        }, 3000);
    };

    LevelEditor.prototype.startAutoSave = function startAutoSave() {
        this.stopAutoSave(); // Clear any existing interval
        this.autoSaveInterval = setInterval(() => {
            if (this.hasUnsavedChanges && this.currentMeta) {
                this.saveDraft();
            }
        }, 30000); // Save every 30 seconds
    };

    LevelEditor.prototype.stopAutoSave = function stopAutoSave() {
        if (this.autoSaveInterval) {
            clearInterval(this.autoSaveInterval);
            this.autoSaveInterval = null;
        }
    };

    LevelEditor.prototype.saveDraft = function saveDraft() {
        if (!this.currentMeta) return;

        try {
            const draft = {
                timestamp: new Date().toISOString(),
                geometry: this.serializeGeometry(),
                trackId: this.currentMeta.id
            };
            localStorage.setItem(`editor_draft_${this.currentMeta.id}`, JSON.stringify(draft));
        } catch (error) {
            console.warn('Failed to save draft:', error);
        }
    };

    LevelEditor.prototype.loadDraft = function loadDraft(trackId) {
        try {
            const draftKey = `editor_draft_${trackId}`;
            const draftData = localStorage.getItem(draftKey);
            if (draftData) {
                const draft = JSON.parse(draftData);
                return draft;
            }
        } catch (error) {
            console.warn('Failed to load draft:', error);
        }
        return null;
    };

    LevelEditor.prototype.clearDraft = function clearDraft(trackId) {
        try {
            localStorage.removeItem(`editor_draft_${trackId}`);
        } catch (error) {
            console.warn('Failed to clear draft:', error);
        }
    };

    LevelEditor.prototype.checkForDraft = async function checkForDraft() {
        if (!this.currentMeta) return;

        const draft = this.loadDraft(this.currentMeta.id);
        if (!draft) return;

        // Check if geometry exists on server
        let serverGeometry = null;
        try {
            const response = await fetch(`/tracks/${this.currentMeta.id}/geometry`);
            if (response.ok) {
                serverGeometry = await response.json();
            }
        } catch (error) {
            console.warn('Failed to fetch server geometry:', error);
        }

        // Compare draft with server geometry
        const draftChanged = !serverGeometry || draft.timestamp > (serverGeometry.updatedAt || '0');

        if (draftChanged) {
            const restore = confirm(`Found unsaved draft from ${new Date(draft.timestamp).toLocaleString()}. Restore it?`);
            if (restore) {
                // Load draft geometry into editor state
                this.loadGeometryIntoEditor(draft.geometry);
                this.hasUnsavedChanges = true;
            } else {
                // Clear the draft
                this.clearDraft(this.currentMeta.id);
            }
        }
    };

    LevelEditor.prototype.markUnsavedChanges = function markUnsavedChanges() {
        this.hasUnsavedChanges = true;
    };

    LevelEditor.prototype.storePendingSave = function storePendingSave() {
        if (!this.currentMeta) return;

        this.pendingSave = {
            trackId: this.currentMeta.id,
            geometry: this.serializeGeometry(),
            timestamp: new Date().toISOString()
        };

        try {
            localStorage.setItem('pending_save', JSON.stringify(this.pendingSave));
        } catch (error) {
            console.warn('Failed to store pending save:', error);
        }
    };

    LevelEditor.prototype.retryPendingSave = function retryPendingSave() {
        try {
            const pendingData = localStorage.getItem('pending_save');
            if (pendingData) {
                const pending = JSON.parse(pendingData);
                if (pending.trackId === this.currentMeta?.id) {
                    this.pendingSave = pending;
                    localStorage.removeItem('pending_save');
                    this.showToast('Retrying pending save...', 'info');
                    // Retry the save
                    this.performSave(pending.geometry);
                }
            }
        } catch (error) {
            console.warn('Failed to retry pending save:', error);
        }
    };

    LevelEditor.prototype.performSave = async function performSave(geometry) {
        this.setSavingState(true);

        try {
            const response = await fetch(`/tracks/${geometry.trackId}/geometry`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(geometry)
            });

            const result = await response.json();

            if (response.ok) {
                this.currentMeta.geometry = geometry;
                this.currentMeta.updatedAt = result.updatedAt;
                this.showToast(`Saved at ${new Date(result.updatedAt).toLocaleTimeString()}`, 'success');
                this.clearDraft(geometry.trackId);
                this.hasUnsavedChanges = false;
                this.pendingSave = null;
                this.undoStack = [];
                this.redoStack = [];
            } else {
                // Re-queue on failure
                this.storePendingSave();
                this.showToast(result.error || 'Save failed', 'error');
            }
        } catch (error) {
            // Re-queue on network error
            this.storePendingSave();
            this.showToast('Save failed - will retry when online', 'error');
        } finally {
            this.setSavingState(false);
        }
    };
}

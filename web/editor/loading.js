export function applyLoadingMixin(LevelEditor) {
    LevelEditor.prototype.loadFromURL = function loadFromURL() {
        const params = new URLSearchParams(window.location.search);
        const trackId = params.get('track');
        if (trackId) {
            console.log('Loading track from URL:', trackId);
            this.loadTrackById(trackId);
        } else {
            console.warn('No track ID in URL');
        }
    };

    LevelEditor.prototype.loadTrackById = async function loadTrackById(trackId) {
        try {
            // Show loading overlay
            this.showLoadingOverlay();

            // First, try to fetch geometry.json
            let geometry = null;
            let meta = null;
            let imageUrl = null;

            try {
                const geometryResponse = await fetch(`/tracks/${trackId}/geometry`);
                if (geometryResponse.ok) {
                    geometry = await geometryResponse.json();
                    console.log('Loaded geometry:', geometry);
                }
            } catch (error) {
                console.warn('Failed to fetch geometry:', error);
            }

            // Fetch meta (always needed for some info)
            try {
                const metaResponse = await fetch(`/tracks/load/${trackId}`);
                if (metaResponse.ok) {
                    meta = await metaResponse.json();
                } else {
                    throw new Error('Track not found');
                }
            } catch (error) {
                console.error('Failed to load track meta:', error);
                this.hideLoadingOverlay();
                this.showToast('Failed to load track metadata', 'error');
                return;
            }

            // Resolve base image path
            imageUrl = this.resolveBaseImagePath(trackId, geometry, meta);

            // Load image
            let image = null;
            if (imageUrl) {
                try {
                    image = await this.loadImage(imageUrl);
                } catch (error) {
                    console.warn('Failed to load base image:', error);
                    this.showToast('Base image not found — create or upload one.', 'warning');
                }
            }

            // Apply to editor
            this.applyGeometryToEditor(geometry, image, meta);

            // Hide loading overlay
            this.hideLoadingOverlay();

            // Show success message
            if (geometry) {
                this.showToast('Track loaded with geometry', 'success');
            } else {
                this.showToast('Track loaded (image only)', 'info');
            }

        } catch (error) {
            console.error('Failed to load track:', error);
            this.hideLoadingOverlay();
            this.showToast('Failed to load track — check server.', 'error');
        }
    };

    LevelEditor.prototype.loadGeometryFromFile = async function loadGeometryFromFile(file) {
        try {
            const text = await file.text();
            const data = JSON.parse(text);

            // Check if this is a geometry.json or meta.json
            let geometry = null;
            let meta = null;

            if (data.trackId && data.walls) {
                // This is a geometry.json
                geometry = data;
                // Try to create minimal meta
                meta = {
                    id: data.trackId,
                    name: data.meta?.name || 'Loaded Track',
                    author: data.meta?.author || 'Unknown',
                    createdAt: data.createdAt,
                    geometry: 'geometry.json'
                };
            } else if (data.id && data.name) {
                // This is a meta.json
                meta = data;
                // If it has geometry reference, we might need to load it, but for now assume not
            } else {
                throw new Error('Invalid JSON format');
            }

            // If geometry has image reference, try to load it
            let image = null;
            if (geometry && geometry.imagePath) {
                try {
                    image = await this.loadImage(geometry.imagePath);
                } catch (error) {
                    console.warn('Failed to load image from geometry:', error);
                }
            }

            // Apply to editor
            this.applyGeometryToEditor(geometry, image, meta);

        } catch (error) {
            console.error('Failed to load geometry from file:', error);
            this.showToast('Failed to load track file. Please ensure it\'s a valid JSON file.', 'error');
        }
    };

    LevelEditor.prototype.resolveBaseImagePath = function resolveBaseImagePath(trackId, geometry, meta) {
        const baseUrl = `/tracks/${trackId}`;

        // Priority order for image path
        let candidates = [];

        // 1. If geometry contains imagePath or meta.canonical
        if (geometry && geometry.meta && geometry.meta.canonical) {
            candidates.push(`${baseUrl}/${geometry.meta.canonical}`);
        }
        if (geometry && geometry.imagePath) {
            candidates.push(geometry.imagePath);
        }

        // 2. From meta
        if (meta && meta.canonical) {
            candidates.push(`${baseUrl}/${meta.canonical}`);
        }

        // 3. Fallbacks
        candidates.push(`${baseUrl}/canonical.png`);
        candidates.push(`${baseUrl}/original.png`);
        candidates.push(`${baseUrl}/original.jpg`);
        candidates.push(`${baseUrl}/original.jpeg`);
        candidates.push(`${baseUrl}/original.svg`);

        // Return first candidate (they will be tried in order)
        return candidates[0] || null;
    };

    LevelEditor.prototype.applyGeometryToEditor = async function applyGeometryToEditor(geometry, image, meta) {
        // Set current meta
        this.currentMeta = meta;
        this.trackImage = image;

        // Update track label
        const baseName = meta?.name || 'Unknown Track';
        this.updateTrackLabel(baseName);

        // Initialize editor state
        if (geometry) {
            // Load from geometry
            this.editorState.trackId = geometry.trackId || meta.id;
            this.editorState.createdAt = geometry.createdAt || new Date().toISOString();
            this.editorState.updatedAt = geometry.updatedAt || new Date().toISOString();
            this.editorState.startLine = geometry.startLine || null;
            this.editorState.spawn = geometry.spawn || null;
            this.editorState.checkpoints = geometry.checkpoints || [];
            this.editorState.walls = geometry.walls ? geometry.walls.map(wall => ({
                id: wall.id,
                polyline: wall.polyline.map(point => ({ x: point[0], y: point[1] }))
            })) : [];
            this.editorState.meta = geometry.meta || {};
            this.editorState.dirty = false;
        } else {
            // Empty geometry
            this.editorState.trackId = meta.id;
            this.editorState.createdAt = new Date().toISOString();
            this.editorState.updatedAt = new Date().toISOString();
            this.editorState.startLine = null;
            this.editorState.spawn = null;
            this.editorState.checkpoints = [];
            this.editorState.walls = [];
            this.editorState.meta = {};
            this.editorState.dirty = false;
        }

        // Reset undo/redo stacks
        this.undoStack = [];
        this.redoStack = [];
        this.editorState.selectedCheckpoints = [];

        // Initialize view and show editor
        this.initializeView();
        this.render();
        this.showEditor();

        // Update checkpoints card with loaded data
        this.updateCheckpointsCard();

        // Check for drafts
        this.checkForDraft();
    };

    LevelEditor.prototype.initializeView = function initializeView() {
        if (this.trackImage && this.canvas) {
            this.panX = (this.canvas.width - this.trackImage.width) / 2;
            this.panY = (this.canvas.height - this.trackImage.height) / 2;
            this.zoom = 1;
        }
    };

    LevelEditor.prototype.loadImage = function loadImage(url) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = url;
        });
    };

    LevelEditor.prototype.showLoadingOverlay = function showLoadingOverlay() {
        let overlay = document.getElementById('loading-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'loading-overlay';
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
            overlay.innerHTML = '<div>Loading track…</div>';
            document.body.appendChild(overlay);
        }
        overlay.style.display = 'flex';
    };

    LevelEditor.prototype.hideLoadingOverlay = function hideLoadingOverlay() {
        const overlay = document.getElementById('loading-overlay');
        if (overlay) {
            overlay.style.display = 'none';
        }
    };

    LevelEditor.prototype.loadGeometryIntoEditor = function loadGeometryIntoEditor(geometry) {
        // Load geometry data into editorState
        if (geometry.spawn) {
            this.editorState.spawn = { ...geometry.spawn };
        }
        if (geometry.startLine) {
            this.editorState.startLine = { ...geometry.startLine };
        }
        if (geometry.checkpoints) {
            this.editorState.checkpoints = geometry.checkpoints.map(cp => ({ ...cp }));
        }
        if (geometry.walls) {
            this.editorState.walls = geometry.walls.map(wall => ({
                id: wall.id,
                polyline: wall.polyline.map(point => ({ x: point[0], y: point[1] }))
            }));
        }
        this.render();
        this.updateCheckpointsCard();
    };
}

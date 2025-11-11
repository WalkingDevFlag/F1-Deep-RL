// Editor modal helpers
let editorModalEscListener = null;
let editorModalReturnFocus = null;

function openEditorModal() {
    const modal = document.getElementById('editor-modal');
    const dock = document.getElementById('editor-dock');
    const editorButton = document.querySelector('[data-dock-action="editor"]');

    if (!modal) {
        console.warn('Editor modal element not found.');
        return;
    }

    if (!modal.hidden && modal.classList.contains('is-open')) {
        return;
    }

    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
    editorModalReturnFocus = editorButton instanceof HTMLElement ? editorButton : null;
    // Ensure we show the root view every time the modal opens
    hideUploadPanel();
    requestAnimationFrame(() => {
        modal.classList.add('is-open');
        const primaryButton = modal.querySelector('[data-editor-action]');
        if (primaryButton instanceof HTMLElement) {
            primaryButton.focus({ preventScroll: true });
        } else {
            const modalPanel = modal.querySelector('.editor-modal__content');
            if (modalPanel instanceof HTMLElement) {
                modalPanel.focus({ preventScroll: true });
            }
        }
    });

    if (dock) {
        dock.hidden = false;
        dock.setAttribute('aria-hidden', 'false');
        requestAnimationFrame(() => {
            dock.classList.add('is-visible');
        });
    }

    if (editorButton) {
        editorButton.classList.add('is-active');
    }

    if (!editorModalEscListener) {
        editorModalEscListener = (event) => {
            if (event.key === 'Escape') {
                closeEditorModal();
            }
        };
        document.addEventListener('keydown', editorModalEscListener);
    }
}

function closeEditorModal() {
    const modal = document.getElementById('editor-modal');
    const dock = document.getElementById('editor-dock');
    const editorButton = document.querySelector('[data-dock-action="editor"]');

    if (!modal || modal.hidden) {
        return;
    }

    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
    modal.addEventListener('transitionend', () => {
        modal.hidden = true;
    }, { once: true });
    window.setTimeout(() => {
        if (!modal.hidden) {
            modal.hidden = true;
        }
    }, 320);

    if (dock) {
        dock.classList.remove('is-visible');
        dock.setAttribute('aria-hidden', 'true');
        dock.addEventListener('transitionend', () => {
            dock.hidden = true;
        }, { once: true });
        window.setTimeout(() => {
            if (!dock.hidden) {
                dock.hidden = true;
            }
        }, 340);
    }

    if (editorButton) {
        editorButton.classList.remove('is-active');
    }

    if (editorModalEscListener) {
        document.removeEventListener('keydown', editorModalEscListener);
        editorModalEscListener = null;
    }

    if (editorModalReturnFocus && typeof editorModalReturnFocus.focus === 'function') {
        editorModalReturnFocus.focus({ preventScroll: true });
    }
    editorModalReturnFocus = null;
}

function initializeEditorModal() {
    const modal = document.getElementById('editor-modal');
    if (!modal) {
        return;
    }

    const content = modal.querySelector('.editor-modal__content');
    if (!content) return;

    // store initial modal root so we can restore it later
    if (!originalModalContent) {
        originalModalContent = content.innerHTML;
    }

    // keep clicks inside the content from accidentally bubbling
    content.addEventListener('click', (event) => {
        event.stopPropagation();
    });

    attachModalRootHandlers(modal);
}

// Upload panel state
let originalModalContent = null;
let currentPreviewFile = null;
let previewCanvas = null;
let previewMessage = null;

function attachModalRootHandlers(modal) {
    if (!modal) {
        return;
    }
    const content = modal.querySelector('.editor-modal__content');
    if (!content) {
        return;
    }

    const closeButtons = content.querySelectorAll('[data-editor-close]');
    closeButtons.forEach((button) => {
        if (!button.dataset.listenerAttached) {
            button.addEventListener('click', (event) => {
                event.preventDefault();
                closeEditorModal();
            });
            button.dataset.listenerAttached = 'true';
        }
    });

    const loadButton = content.querySelector('[data-editor-action="load"]');
    if (loadButton && !loadButton.dataset.listenerAttached) {
        loadButton.addEventListener('click', () => {
            showLoadPanel();
        });
        loadButton.dataset.listenerAttached = 'true';
    }

    const uploadButton = content.querySelector('[data-editor-action="upload"]');
    if (uploadButton && !uploadButton.dataset.listenerAttached) {
        uploadButton.addEventListener('click', (event) => {
            event.preventDefault();
            showUploadPanel();
        });
        uploadButton.dataset.listenerAttached = 'true';
    }
}

function showLoadPanel() {
    const modal = document.getElementById('editor-modal');
    if (!modal) return;

    const content = modal.querySelector('.editor-modal__content');
    if (!content) return;

    // Mark modal as showing load UI
    modal.classList.add('is-loading');

    // Create load form
    const loadForm = document.createElement('div');
    loadForm.className = 'editor-load__form';

    loadForm.innerHTML = `
        <button type="button" class="editor-modal__close" aria-label="Close editor modal" data-editor-close>&times;</button>
        <h2 class="ui-card__title">Load Existing Track</h2>
        <div class="ui-card__body">
            <div class="editor-load__list" id="track-list">
                <div class="editor-load__loading">Loading tracks...</div>
            </div>
        </div>
    `;

    content.innerHTML = '';
    content.appendChild(loadForm);

    // Get elements
    const trackList = document.getElementById('track-list');

    const closeButtons = loadForm.querySelectorAll('[data-editor-close]');
    closeButtons.forEach((button) => {
        button.addEventListener('click', (event) => {
            event.preventDefault();
            closeEditorModal();
        });
    });

    // Fetch tracks list
    fetch('/tracks/list')
        .then(response => response.json())
        .then(tracks => {
            if (tracks.length === 0) {
                trackList.innerHTML = '<div class="editor-load__empty">No tracks found. Upload one first!</div>';
                return;
            }
            
            const listHtml = tracks.map(track => `
                <button type="button" class="editor-load__item" data-track-id="${track.id}">
                    <div class="editor-load__name">${track.name}</div>
                    <div class="editor-load__author">by ${track.author}</div>
                </button>
            `).join('');
            
            trackList.innerHTML = listHtml;
            
            // Add click handlers
            trackList.querySelectorAll('.editor-load__item').forEach(button => {
                button.addEventListener('click', () => {
                    const trackId = button.dataset.trackId;
                    loadTrack(trackId);
                });
            });
        })
        .catch(error => {
            console.error('Failed to load tracks:', error);
            trackList.innerHTML = '<div class="editor-load__error">Failed to load tracks. Try again later.</div>';
        });
}

function loadTrack(trackId) {
    fetch(`/tracks/load/${trackId}`)
        .then(response => response.json())
        .then(meta => {
            if (meta.error) {
                alert('Error loading track: ' + meta.error);
                return;
            }
            // Call initEditorWith (placeholder)
            initEditorWith(meta);
            closeEditorModal();
        })
        .catch(error => {
            console.error('Failed to load track:', error);
            alert('Failed to load track. Try again later.');
        });
}

function showUploadPanel() {
    const modal = document.getElementById('editor-modal');
    if (!modal) return;

    const content = modal.querySelector('.editor-modal__content');
    if (!content) return;

    // Mark modal as showing upload UI (used by CSS)
    modal.classList.add('is-uploading');

    // Create upload form
    const uploadForm = document.createElement('div');
    uploadForm.className = 'editor-upload__form';

    uploadForm.innerHTML = `
        <button type="button" class="editor-modal__close" aria-label="Close editor modal" data-editor-close>&times;</button>
        <h2 class="ui-card__title">Upload New Track</h2>
        <div class="ui-card__body">
            <div class="editor-upload__fields">
                <label class="editor-upload__field">
                    <span class="editor-upload__label">Track Name</span>
                    <input type="text" class="editor-upload__input" id="track-name" placeholder="Enter track name">
                </label>
                <label class="editor-upload__field">
                    <span class="editor-upload__label">Author</span>
                    <input type="text" class="editor-upload__input" id="track-author" placeholder="Enter author name">
                </label>
                <label class="editor-upload__field">
                    <span class="editor-upload__label">Track Image</span>
                    <input type="file" class="editor-upload__input" id="track-file" accept="image/*">
                </label>
                <label class="editor-upload__field">
                    <span class="editor-upload__label">Cover Image (Optional)</span>
                    <input type="file" class="editor-upload__input" id="cover-file" accept="image/*">
                </label>
            </div>
            <div class="editor-upload__preview">
                <canvas id="preview-canvas" class="editor-upload__canvas" width="200" height="200"></canvas>
                <div id="preview-message" class="editor-upload__message"></div>
            </div>
            <div class="editor-upload__actions">
                <button type="button" class="editor-modal__action editor-modal__action--primary" id="upload-btn" disabled>Upload</button>
                <button type="button" class="editor-modal__action editor-modal__action--secondary" id="cancel-upload-btn">Cancel</button>
            </div>
        </div>
    `;

    content.innerHTML = '';
    content.appendChild(uploadForm);

    // Get elements
    const trackFileInput = document.getElementById('track-file');
    const uploadBtn = document.getElementById('upload-btn');
    const cancelBtn = document.getElementById('cancel-upload-btn');
    previewCanvas = document.getElementById('preview-canvas');
    previewMessage = document.getElementById('preview-message');

    const closeButtons = uploadForm.querySelectorAll('[data-editor-close]');
    closeButtons.forEach((button) => {
        button.addEventListener('click', (event) => {
            event.preventDefault();
            closeEditorModal();
        });
    });

    // Event listeners
    trackFileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            currentPreviewFile = file;
            uploadBtn.disabled = false;
            validatePreview(file);
        } else {
            currentPreviewFile = null;
            uploadBtn.disabled = true;
            clearPreview();
        }
    });

    uploadBtn.addEventListener('click', () => {
        const name = document.getElementById('track-name').value.trim();
        const author = document.getElementById('track-author').value.trim();
        const file = currentPreviewFile;
        const cover = document.getElementById('cover-file').files[0];
        
        if (!name || !file) {
            alert('Please enter a track name and select a file.');
            return;
        }
        
        uploadBtn.disabled = true;
        uploadBtn.textContent = 'Uploading...';
        
        const formData = new FormData();
        formData.append('name', name);
        formData.append('author', author);
        formData.append('file', file);
        if (cover) {
            formData.append('cover', cover);
        }
        
        fetch('/tracks/upload', {
            method: 'POST',
            body: formData
        })
        .then(response => response.json())
        .then(result => {
            if (result.error) {
                alert('Upload failed: ' + result.error);
                uploadBtn.disabled = false;
                uploadBtn.textContent = 'Upload';
                return;
            }
            // Success - navigate to editor
            window.location.href = `editor.html?track=${result.meta.id}`;
        })
        .catch(error => {
            console.error('Upload error:', error);
            alert('Upload failed. Please try again.');
            uploadBtn.disabled = false;
            uploadBtn.textContent = 'Upload';
        });
    });

    cancelBtn.addEventListener('click', () => {
        hideUploadPanel();
    });
}

function hideUploadPanel() {
    const modal = document.getElementById('editor-modal');
    if (!modal || !originalModalContent) return;

    const content = modal.querySelector('.editor-modal__content');
    if (content) {
        content.innerHTML = originalModalContent;
        // Re-attach event listeners
        attachModalRootHandlers(modal);
    }
    // clear upload-specific state and CSS hook
    modal.classList.remove('is-uploading');
    currentPreviewFile = null;
    previewCanvas = null;
    previewMessage = null;
}

function clearPreview() {
    if (previewCanvas) {
        const ctx = previewCanvas.getContext('2d');
        ctx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
    }
    if (previewMessage) {
        previewMessage.textContent = '';
    }
}

function validatePreview(file) {
    if (!file || !previewCanvas || !previewMessage) return;

    const img = new Image();
    img.onload = () => {
        const ctx = previewCanvas.getContext('2d');
        const canvas = document.createElement('canvas');
        const offCtx = canvas.getContext('2d');
        canvas.width = img.width;
        canvas.height = img.height;
        offCtx.drawImage(img, 0, 0);

        // Check transparency
        let hasTransparency = false;
        if (file.type === 'image/jpeg') {
            hasTransparency = true; // JPG doesn't support alpha, but warn
        } else {
            // Sample border pixels
            const imageData = offCtx.getImageData(0, 0, canvas.width, canvas.height);
            const data = imageData.data;
            // Check top and bottom rows, left and right columns
            for (let x = 0; x < canvas.width; x++) {
                // Top row
                const topIndex = (x * 4) + 3;
                if (data[topIndex] < 255) hasTransparency = true;
                // Bottom row
                const bottomIndex = ((canvas.height - 1) * canvas.width * 4) + (x * 4) + 3;
                if (data[bottomIndex] < 255) hasTransparency = true;
            }
            for (let y = 0; y < canvas.height; y++) {
                // Left column
                const leftIndex = (y * canvas.width * 4) + 3;
                if (data[leftIndex] < 255) hasTransparency = true;
                // Right column
                const rightIndex = (y * canvas.width * 4) + ((canvas.width - 1) * 4) + 3;
                if (data[rightIndex] < 255) hasTransparency = true;
            }
        }

        // Draw preview
        ctx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
        const scale = Math.min(previewCanvas.width / img.width, previewCanvas.height / img.height);
        const x = (previewCanvas.width - img.width * scale) / 2;
        const y = (previewCanvas.height - img.height * scale) / 2;
        ctx.drawImage(img, x, y, img.width * scale, img.height * scale);

        // Set message
        if (file.type === 'image/jpeg') {
            previewMessage.textContent = '⚠️ JPG detected - transparency not supported';
            previewMessage.className = 'editor-upload__message editor-upload__message--warning';
        } else if (hasTransparency) {
            previewMessage.textContent = '⚠️ Transparency detected on borders';
            previewMessage.className = 'editor-upload__message editor-upload__message--warning';
        } else {
            previewMessage.textContent = '✅ Looks good';
            previewMessage.className = 'editor-upload__message editor-upload__message--success';
        }
    };
    img.src = URL.createObjectURL(file);
}

function autoMaskPreview(file) {
    if (!file || !previewCanvas || !previewMessage) return;

    const img = new Image();
    img.onload = () => {
        const ctx = previewCanvas.getContext('2d');
        const canvas = document.createElement('canvas');
        const offCtx = canvas.getContext('2d');
        canvas.width = img.width;
        canvas.height = img.height;
        offCtx.drawImage(img, 0, 0);

        // Get image data
        const imageData = offCtx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;

        // Convert to grayscale and threshold
        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            const gray = (r + g + b) / 3;
            const threshold = 128; // Simple threshold
            const alpha = gray > threshold ? 255 : 0;
            data[i] = 255; // White
            data[i + 1] = 255;
            data[i + 2] = 255;
            data[i + 3] = alpha;
        }

        offCtx.putImageData(imageData, 0, 0);

        // Draw checkerboard background
        ctx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
        const squareSize = 10;
        for (let y = 0; y < previewCanvas.height; y += squareSize) {
            for (let x = 0; x < previewCanvas.width; x += squareSize) {
                ctx.fillStyle = (x / squareSize + y / squareSize) % 2 === 0 ? '#cccccc' : '#ffffff';
                ctx.fillRect(x, y, squareSize, squareSize);
            }
        }

        // Draw masked image
        const scale = Math.min(previewCanvas.width / img.width, previewCanvas.height / img.height);
        const x = (previewCanvas.width - img.width * scale) / 2;
        const y = (previewCanvas.height - img.height * scale) / 2;
        ctx.drawImage(canvas, x, y, img.width * scale, img.height * scale);

        // Update message
        previewMessage.textContent = '✅ Auto-masked applied';
        previewMessage.className = 'editor-upload__message editor-upload__message--success';
    };
    img.src = URL.createObjectURL(file);
}

function showLoadPanel() {
    const modal = document.getElementById('editor-modal');
    if (!modal) return;

    const content = modal.querySelector('.editor-modal__content');
    if (!content) return;

    // Mark modal as showing load UI
    modal.classList.add('is-loading');

    // Create load form
    const loadForm = document.createElement('div');
    loadForm.className = 'editor-load__form';

    loadForm.innerHTML = `
        <button type="button" class="editor-modal__close" aria-label="Close editor modal" data-editor-close>&times;</button>
        <h2 class="ui-card__title">Load Existing Track</h2>
        <div class="ui-card__body">
            <div class="editor-load__list" id="track-list">
                <div class="editor-load__loading">Loading tracks...</div>
            </div>
        </div>
    `;

    content.innerHTML = '';
    content.appendChild(loadForm);

    // Get elements
    const trackList = document.getElementById('track-list');

    const closeButtons = loadForm.querySelectorAll('[data-editor-close]');
    closeButtons.forEach((button) => {
        button.addEventListener('click', (event) => {
            event.preventDefault();
            closeEditorModal();
        });
    });

    // Fetch tracks list
    fetch('/tracks/list')
        .then(response => response.json())
        .then(tracks => {
            if (tracks.length === 0) {
                trackList.innerHTML = '<div class="editor-load__empty">No tracks found. Upload one first!</div>';
                return;
            }
            
            const listHtml = tracks.map(track => `
                <button type="button" class="editor-load__item" data-track-id="${track.id}">
                    <div class="editor-load__name">${track.name}</div>
                    <div class="editor-load__author">by ${track.author}</div>
                </button>
            `).join('');
            
            trackList.innerHTML = listHtml;
            
            // Add click handlers
            trackList.querySelectorAll('.editor-load__item').forEach(button => {
                button.addEventListener('click', () => {
                    const trackId = button.dataset.trackId;
                    loadTrack(trackId);
                });
            });
        })
        .catch(error => {
            console.error('Failed to load tracks:', error);
            trackList.innerHTML = '<div class="editor-load__error">Failed to load tracks. Try again later.</div>';
        });
}

function loadTrack(trackId) {
    // Navigate to editor with track ID
    window.location.href = `editor.html?track=${trackId}`;
}

// Main game logic and loop

class Game {
    constructor() {
        this.canvas = document.getElementById('canvas');
        this.ctx = this.canvas.getContext('2d');
        this.assetLoader = new AssetLoader();
        this.renderer = null;
        this.car = null;
        this.track = null;
        this.camera = null;
        this.controls = new Controls();
        this.offscreenCanvas = document.createElement('canvas');
        this.offscreenCtx = this.offscreenCanvas.getContext('2d', { willReadFrequently: true });
        this.trackImg = null;
        this.carImg = null;
        this.collisionResetTimeout = null;
        this.lastFrameTime = performance.now();
        this.deltaTime = 0;
        this.neuralNetworkVisible = true;
        this.uiElements = {};
        
        // Lap timing
        this.lapCount = 0;
        this.lapStartTime = null; // Start as null, will be set when car moves
        this.currentLapTime = 0;
        this.carHasStartedMoving = false;
        this.collisionTime = null; // Store time when collision occurred
        this.lastCarPosition = { x: 0, y: 0 }; // Store last position for line crossing detection
        this.hasPassedStartLine = false; // Track if car has passed start line

        this.trainingController = typeof window.TrainingController === 'function'
            ? new window.TrainingController(this)
            : null;
    }

    async init() {
        try {
            // Load assets
            const { trackImg, carImg, trackMeta } = await this.assetLoader.loadAssets();
            this.trackImg = trackImg;
            this.carImg = carImg;
            this.trackMeta = trackMeta;

            // Setup canvas
            this.canvas.width = window.innerWidth;
            this.canvas.height = window.innerHeight;

            // Setup offscreen canvas for collision detection
            this.offscreenCanvas.width = this.trackImg.width;
            this.offscreenCanvas.height = this.trackImg.height;
            this.offscreenCtx.drawImage(this.trackImg, 0, 0);

            // Initialize car with track image and offscreen context
            this.car = new Car(32, 16, 32, 16, this.trackImg, this.offscreenCtx);
            this.car.setCarImage(this.carImg); // Set actual car dimensions based on image
            
            // Initialize track with ACTUAL car dimensions and track meta
            this.track = new Track(this.trackImg, this.offscreenCtx, this.car.actualWidth, this.car.actualHeight, this.trackMeta);
            const spawnPoint = await this.track.initialize();
            
            this.car.reset(spawnPoint);

            if (this.trainingController) {
                this.trainingController.onTrackReady();
            }

            // Initialize camera
            this.camera = new Camera(this.canvas.width, this.canvas.height, this.trackImg.width, this.trackImg.height);

            // Setup renderer
            this.renderer = new Renderer(this.canvas, this.ctx);
            this.setupUI();

            // Start game loop
            this.setupEventListeners();
            this.loop();
        } catch (error) {
            console.error('Failed to initialize game:', error);
        }
    }

    setupEventListeners() {
        document.addEventListener('keydown', (e) => {
            if (e.code === 'KeyR') {
                this.resetCar();
            }
            if (e.code === 'KeyC') {
                this.camera.toggleMode();
            }
        });

        window.addEventListener('resize', () => {
            this.canvas.width = window.innerWidth;
            this.canvas.height = window.innerHeight;
            if (this.camera) {
                this.camera.setCanvasSize(this.canvas.width, this.canvas.height);
            }
        });
    }

    setupUI() {
        if (this.uiElements) {
            if (this.uiElements.hudCard && this.uiElements.hudCard.element instanceof HTMLElement) {
                const { element } = this.uiElements.hudCard;
                if (element.parentElement) {
                    element.parentElement.removeChild(element);
                }
            }
            if (this.uiElements.lapCard && this.uiElements.lapCard.element instanceof HTMLElement) {
                const { element } = this.uiElements.lapCard;
                if (element.parentElement) {
                    element.parentElement.removeChild(element);
                }
            }
            if (this.uiElements.dock
                && this.uiElements.dock.detachOnReset
                && this.uiElements.dock.element instanceof HTMLElement) {
                const dockElement = this.uiElements.dock.element;
                if (dockElement.parentElement) {
                    dockElement.parentElement.removeChild(dockElement);
                }
            }
        }

        if (!window.UIKit) {
            console.warn('UIKit module not loaded; skipping HUD setup.');
            this.uiElements = {};
            return;
        }

        const sensorsEnabled = this.car ? this.car.sensorsEnabled : true;
        const cameraName = this.camera ? this.camera.getModeName() : "God's Eye View";

        const createSvgIcon = (segments = []) => {
            const NS = 'http://www.w3.org/2000/svg';
            const svg = document.createElementNS(NS, 'svg');
            svg.setAttribute('viewBox', '0 0 24 24');
            svg.setAttribute('aria-hidden', 'true');
            svg.setAttribute('focusable', 'false');
            svg.setAttribute('fill', 'none');
            svg.setAttribute('stroke', 'currentColor');
            svg.setAttribute('stroke-width', '1.8');
            svg.setAttribute('stroke-linecap', 'round');
            svg.setAttribute('stroke-linejoin', 'round');

            segments.forEach((segment) => {
                const tag = segment.tag || 'path';
                const attrs = segment.attrs || { d: segment.d || segment };
                const element = document.createElementNS(NS, tag);
                Object.entries(attrs).forEach(([key, value]) => {
                    element.setAttribute(key, value);
                });
                svg.appendChild(element);
            });

            return svg;
        };

        const homeIcon = createSvgIcon([
            { d: 'M3 11l9-7 9 7' },
            { d: 'M5 10v10h14V10' },
            { d: 'M9 21V12h6v9' }
        ]);

        const levelEditorIcon = createSvgIcon([
            { d: 'M4 4h6v6H4z' },
            { d: 'M14 4h6v6h-6z' },
            { d: 'M4 14h6v6H4z' },
            { d: 'M18.5 13.5l-5 5V21h2.5l5-5z' }
        ]);

        // Compose the HUD card and its controls using the shared UI kit.
        const { createCard, createStatRow, createToggleRow, createDock, createDockButton } = window.UIKit;

        const hudCard = createCard({ title: 'Driver Console', overlay: true });
        hudCard.element.setAttribute('aria-label', 'Driver control panel');

        const fpsRow = createStatRow({ label: 'FPS', value: '0' });
        const cameraRow = createStatRow({ label: 'Camera', value: cameraName });
        const sensorsRow = createToggleRow({
            label: 'Sensors',
            initial: sensorsEnabled,
            onToggle: (enabled) => {
                if (this.car) {
                    this.car.setSensorsEnabled(enabled);
                }
            }
        });
        const nnRow = createToggleRow({
            label: 'Neural Net',
            initial: this.neuralNetworkVisible,
            onToggle: (enabled) => {
                this.neuralNetworkVisible = enabled;
            }
        });
        const wallsRow = createToggleRow({
            label: 'Walls',
            initial: this.renderer ? this.renderer.showWalls : false,
            onToggle: (enabled) => {
                if (this.renderer) {
                    this.renderer.setShowWalls(enabled);
                }
            }
        });
        const checkpointsRow = createToggleRow({
            label: 'Checkpoints',
            initial: this.renderer ? this.renderer.showCheckpoints : false,
            onToggle: (enabled) => {
                if (this.renderer) {
                    this.renderer.setShowCheckpoints(enabled);
                }
            }
        });
        const startFinishRow = createToggleRow({
            label: 'Start/Finish',
            initial: this.renderer ? this.renderer.showStartFinish : false,
            onToggle: (enabled) => {
                if (this.renderer) {
                    this.renderer.setShowStartFinish(enabled);
                }
            }
        });

        hudCard.addMany([fpsRow, cameraRow, sensorsRow, nnRow, wallsRow, checkpointsRow, startFinishRow]);
        if (document.body) {
            document.body.appendChild(hudCard.element);
        }

        // Create Lap Timer Card
        const trackName = this.trackMeta ? this.trackMeta.name : 'Unknown Track';
        const lapCard = createCard({ title: `${trackName}`, classNames: ['ui-card--top-right'] });
        lapCard.element.setAttribute('aria-label', 'Lap timing information');

        const lapTimeRow = createStatRow({ label: 'Lap Time', value: '00:00:000' });
        const lapCountRow = createStatRow({ label: 'Laps', value: '0' });

        lapCard.addMany([lapTimeRow, lapCountRow]);
        if (document.body) {
            document.body.appendChild(lapCard.element);
        }

        let dockElementRef = null;
        let homeButtonRef = null;
        let levelEditorButtonRef = null;
        let dockShouldDetach = false;

        const staticDock = document.getElementById('main-dock');
        if (staticDock) {
            dockElementRef = staticDock;
            dockShouldDetach = false;
            homeButtonRef = staticDock.querySelector('[data-dock-action="home"]');
            levelEditorButtonRef = staticDock.querySelector('[data-dock-action="editor"]');

            if (homeButtonRef) {
                homeButtonRef.onclick = (event) => {
                    event.preventDefault();
                    window.location.href = '/';
                };
            }

            if (levelEditorButtonRef) {
                levelEditorButtonRef.onclick = (event) => {
                    event.preventDefault();
                    openEditorModal();
                };
            }
        } else {
            const dock = createDock({ label: 'Simulator dock' });
            const homeButton = createDockButton({
                label: 'Home',
                tooltip: 'Go to dashboard',
                icon: homeIcon,
                onClick: () => {
                    window.location.href = '/';
                }
            });
            const levelEditorButton = createDockButton({
                label: 'Level Editor',
                tooltip: 'Open Level Editor',
                icon: levelEditorIcon,
                onClick: () => {
                    openEditorModal();
                }
            });

            dock.addMany([homeButton, levelEditorButton]);
            if (document.body) {
                document.body.appendChild(dock.element);
            }

            dockElementRef = dock.element;
            homeButtonRef = homeButton.element;
            levelEditorButtonRef = levelEditorButton.element;
            dockShouldDetach = true;
        }

        this.uiElements = {
            hudCard,
            fpsRow,
            cameraRow,
            sensorsRow,
            nnRow,
            wallsRow,
            checkpointsRow,
            startFinishRow,
            lapCard,
            lapTimeRow,
            lapCountRow,
            dock: {
                element: dockElementRef,
                homeButton: homeButtonRef,
                levelEditorButton: levelEditorButtonRef,
                detachOnReset: dockShouldDetach,
            },
        };

        if (this.trainingController) {
            this.trainingController.attachUI();
        }

        this.updateHUD();
    }

    updateHUD() {
        if (!this.uiElements) {
            return;
        }

        if (this.uiElements.fpsRow && typeof this.uiElements.fpsRow.setValue === 'function' && this.renderer) {
            this.uiElements.fpsRow.setValue(this.renderer.fps);
        }

        if (this.uiElements.cameraRow && typeof this.uiElements.cameraRow.setValue === 'function' && this.camera) {
            this.uiElements.cameraRow.setValue(this.camera.getModeName());
        }

        const sensorsEnabled = this.car ? this.car.sensorsEnabled : true;
        if (this.uiElements.sensorsRow && typeof this.uiElements.sensorsRow.setChecked === 'function') {
            const currentSensorsState = typeof this.uiElements.sensorsRow.getChecked === 'function'
                ? this.uiElements.sensorsRow.getChecked()
                : null;
            if (currentSensorsState !== sensorsEnabled) {
                this.uiElements.sensorsRow.setChecked(sensorsEnabled, { silent: true });
            }
        }

        if (this.uiElements.nnRow && typeof this.uiElements.nnRow.setChecked === 'function') {
            const currentNNState = typeof this.uiElements.nnRow.getChecked === 'function'
                ? this.uiElements.nnRow.getChecked()
                : null;
            if (currentNNState !== this.neuralNetworkVisible) {
                this.uiElements.nnRow.setChecked(this.neuralNetworkVisible, { silent: true });
            }
        }

        if (this.uiElements.wallsRow && typeof this.uiElements.wallsRow.setChecked === 'function' && this.renderer) {
            const currentWallsState = typeof this.uiElements.wallsRow.getChecked === 'function'
                ? this.uiElements.wallsRow.getChecked()
                : null;
            const rendererWallsState = this.renderer.showWalls;
            if (currentWallsState !== rendererWallsState) {
                this.uiElements.wallsRow.setChecked(rendererWallsState, { silent: true });
            }
        }

        if (this.uiElements.checkpointsRow && typeof this.uiElements.checkpointsRow.setChecked === 'function' && this.renderer) {
            const currentCheckpointsState = typeof this.uiElements.checkpointsRow.getChecked === 'function'
                ? this.uiElements.checkpointsRow.getChecked()
                : null;
            const rendererCheckpointsState = this.renderer.showCheckpoints;
            if (currentCheckpointsState !== rendererCheckpointsState) {
                this.uiElements.checkpointsRow.setChecked(rendererCheckpointsState, { silent: true });
            }
        }

        if (this.uiElements.startFinishRow && typeof this.uiElements.startFinishRow.setChecked === 'function' && this.renderer) {
            const currentStartFinishState = typeof this.uiElements.startFinishRow.getChecked === 'function'
                ? this.uiElements.startFinishRow.getChecked()
                : null;
            const rendererStartFinishState = this.renderer.showStartFinish;
            if (currentStartFinishState !== rendererStartFinishState) {
                this.uiElements.startFinishRow.setChecked(rendererStartFinishState, { silent: true });
            }
        }

        // Update lap timer
        if (this.uiElements.lapTimeRow && typeof this.uiElements.lapTimeRow.setValue === 'function') {
            if (this.lapStartTime !== null) {
                const lapTimeMs = performance.now() - this.lapStartTime;
                const formattedTime = this.formatLapTime(lapTimeMs);
                this.uiElements.lapTimeRow.setValue(formattedTime);
            } else if (this.collisionTime !== null) {
                // Show frozen time from collision
                const formattedTime = this.formatLapTime(this.collisionTime);
                this.uiElements.lapTimeRow.setValue(formattedTime);
            } else {
                this.uiElements.lapTimeRow.setValue('00:00:000');
            }
        }

        // Update lap count
        if (this.uiElements.lapCountRow && typeof this.uiElements.lapCountRow.setValue === 'function') {
            this.uiElements.lapCountRow.setValue(this.lapCount.toString());
        }
    }

    formatLapTime(ms) {
        const totalSeconds = Math.floor(ms / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        const milliseconds = Math.floor((ms % 1000));

        return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}:${milliseconds.toString().padStart(3, '0')}`;
    }

    resetCar() {
        const spawnPoint = this.track.getSpawnPoint();
        this.car.reset(spawnPoint);
        if (this.collisionResetTimeout) {
            clearTimeout(this.collisionResetTimeout);
            this.collisionResetTimeout = null;
        }
        
        // Reset lap timer state on reset - timer will start again when car moves
        this.lapStartTime = null;
        this.carHasStartedMoving = false;
        this.collisionTime = null; // Clear collision time
        this.lastCarPosition = { x: this.car.x, y: this.car.y }; // Reset position tracking
        console.log('Car reset - lap timer will start when car moves again');

        if (this.trainingController) {
            this.trainingController.onGameReset();
        }
    }

    checkLapCompletion() {
        const startLine = this.track.getStartLine();
        if (!startLine) return;

        const carX = this.car.x;
        const carY = this.car.y;
        const lastX = this.lastCarPosition.x;
        const lastY = this.lastCarPosition.y;

        // Check if car crossed the start/finish line
        const crossed = this.lineSegmentIntersect(
            lastX, lastY, carX, carY,
            startLine.x1, startLine.y1, startLine.x2, startLine.y2
        );

        if (crossed && this.carHasStartedMoving) {
            // Only count lap if car is moving forward (positive speed)
            // This prevents reverse laps from counting
            if (this.car.speed > 0) {
                this.completeLap();
            } else {
                console.log('Crossed finish line in reverse - lap not counted');
            }
        }

        // Update last position
        this.lastCarPosition.x = carX;
        this.lastCarPosition.y = carY;
    }

    normalizeAngle(angle) {
        // Normalize angle to [-π, π]
        while (angle > Math.PI) angle -= 2 * Math.PI;
        while (angle < -Math.PI) angle += 2 * Math.PI;
        return angle;
    }

    lineSegmentIntersect(x1, y1, x2, y2, x3, y3, x4, y4) {
        // Check if line segment (x1,y1)-(x2,y2) intersects with (x3,y3)-(x4,y4)
        const denom = (y4 - y3) * (x2 - x1) - (x4 - x3) * (y2 - y1);
        if (denom === 0) return false;

        const ua = ((x4 - x3) * (y1 - y3) - (y4 - y3) * (x1 - x3)) / denom;
        const ub = ((x2 - x1) * (y1 - y3) - (y2 - y1) * (x1 - x3)) / denom;

        return (ua >= 0 && ua <= 1 && ub >= 0 && ub <= 1);
    }

    completeLap() {
        // Increment lap count and reset timer
        this.lapCount++;
        this.lapStartTime = performance.now();
        this.carHasStartedMoving = true; // Ensure timer is running
        console.log(`Lap ${this.lapCount} completed!`);
    }

    update() {
        // Calculate delta time (in seconds)
        const currentTime = performance.now();
        this.deltaTime = (currentTime - this.lastFrameTime) / 1000;
        this.lastFrameTime = currentTime;
        
        // Get keyboard input
        let keys = this.controls.getKeys();
        if (this.trainingController && this.trainingController.isActive()) {
            keys = this.trainingController.getControlKeys(keys);
        }

        // Update car with physics and collision
        const trackBorders = this.track.getBorders();
        this.car.update(keys, this.trackImg, this.offscreenCtx, trackBorders, this.deltaTime);

        if (this.trainingController) {
            this.trainingController.handleFrame({ deltaTime: this.deltaTime });
        }

        // Handle collision auto-reset FIRST
        if (this.car.damaged && !this.collisionResetTimeout) {
            console.log('Collision detected! Press R to reset. Auto-reset in 1.5s.');
            // Stop the lap timer on collision and freeze the time
            this.carHasStartedMoving = false;
            if (this.lapStartTime !== null) {
                this.collisionTime = performance.now() - this.lapStartTime;
                this.lapStartTime = null; // Clear lapStartTime so timer stops counting
            }
            this.collisionResetTimeout = setTimeout(() => {
                if (this.car.damaged) {
                    this.resetCar();
                }
            }, 1500); // Auto-reset after 1.5 seconds
        }

        // Start lap timer when car first moves (only if not damaged)
        if (!this.carHasStartedMoving && !this.car.damaged && this.car && Math.abs(this.car.speed) > 0.1) {
            this.carHasStartedMoving = true;
            this.lapStartTime = performance.now();
            console.log('Lap timer started - car is moving!');
        }

        // Update camera
        this.camera.update(this.car);

        // Check for lap completion (start/finish line crossing)
        if (!this.car.damaged && this.track && this.track.getStartLine()) {
            this.checkLapCompletion();
        }

        if (!this.car.damaged && this.collisionResetTimeout) {
            clearTimeout(this.collisionResetTimeout);
            this.collisionResetTimeout = null;
        }
    }

    draw() {
        this.renderer.drawFrame(this.trackImg, this.car, this.carImg, this.camera, this.track);
    }

    loop = () => {
        this.update();
        this.draw();
        this.updateHUD();
        requestAnimationFrame(this.loop);
    }
}

window.addEventListener('DOMContentLoaded', () => {
    initializeEditorModal();
});

// Start game when page loads
window.addEventListener('load', () => {
    const game = new Game();
    game.init();
});

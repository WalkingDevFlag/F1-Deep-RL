// Level Editor Module
class LevelEditor {
    constructor() {
        this.container = document.getElementById('level-editor');
        this.canvas = document.getElementById('editor-canvas');
        this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
        this.trackNameEl = document.getElementById('editor-track-name');
        this.exitBtn = document.getElementById('editor-exit-btn');
        this.currentMeta = null;
        this.trackImage = null;

        // Pan and zoom properties
        this.zoom = 1;
        this.panX = 0;
        this.panY = 0;
        this.isDragging = false;
        this.lastMouseX = 0;
        this.lastMouseY = 0;

        console.log('LevelEditor constructor, container:', this.container);
        console.log('canvas:', this.canvas);
        console.log('trackNameEl:', this.trackNameEl);
        console.log('exitBtn:', this.exitBtn);

        this.setupEventListeners();
        this.loadFromURL();
    }

    loadFromURL() {
        // Get track ID from URL params
        const params = new URLSearchParams(window.location.search);
        const trackId = params.get('track');
        
        if (trackId) {
            console.log('Loading track from URL:', trackId);
            this.loadTrackById(trackId);
        } else {
            console.warn('No track ID in URL');
        }
    }

    async loadTrackById(trackId) {
        try {
            const response = await fetch(`/tracks/load/${trackId}`);
            const meta = await response.json();
            
            if (meta.error) {
                alert('Error loading track: ' + meta.error);
                return;
            }
            
            await this.initEditorWith(meta);
        } catch (error) {
            console.error('Failed to load track:', error);
            alert('Failed to load track. Try again later.');
        }
    }

    setupEventListeners() {
        if (this.exitBtn) {
            this.exitBtn.addEventListener('click', () => {
                this.hideEditor();
            });
        }

        // Mouse wheel for zooming
        this.canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            this.handleZoom(e);
        });

        // Mouse events for panning
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
    }

    handleZoom(e) {
        const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
        const mouseX = e.offsetX;
        const mouseY = e.offsetY;

        // Calculate zoom center in world coordinates
        const worldX = (mouseX - this.panX) / this.zoom;
        const worldY = (mouseY - this.panY) / this.zoom;

        // Apply zoom
        this.zoom *= zoomFactor;

        // Clamp zoom to reasonable limits
        this.zoom = Math.max(0.1, Math.min(5, this.zoom));

        // Adjust pan to keep zoom center at mouse position
        this.panX = mouseX - worldX * this.zoom;
        this.panY = mouseY - worldY * this.zoom;

        this.render();
    }

    handleMouseDown(e) {
        this.isDragging = true;
        this.lastMouseX = e.offsetX;
        this.lastMouseY = e.offsetY;
        this.canvas.style.cursor = 'grabbing';
    }

    handleMouseMove(e) {
        if (this.isDragging) {
            const deltaX = e.offsetX - this.lastMouseX;
            const deltaY = e.offsetY - this.lastMouseY;

            this.panX += deltaX;
            this.panY += deltaY;

            this.lastMouseX = e.offsetX;
            this.lastMouseY = e.offsetY;

            this.render();
        }
    }

    handleMouseUp() {
        this.isDragging = false;
        this.canvas.style.cursor = 'grab';
    }

    async initEditorWith(meta) {
        console.log('LevelEditor.initEditorWith called with meta:', meta);
        if (!this.container) {
            console.error('Editor container not found');
            return;
        }
        if (!this.canvas) {
            console.error('Editor canvas not found');
            return;
        }
        this.currentMeta = meta;
        this.trackNameEl.textContent = meta.name || 'Unknown Track';

        // Load the base image using fallback logic
        await this.loadBaseImage(meta);

        // Initialize pan to center the track
        this.initializeView();

        // Render the editor
        this.render();

        // Show the editor
        this.showEditor();
    }

    async loadGeometryFromFile(file) {
        try {
            const text = await file.text();
            const meta = JSON.parse(text);
            await this.initEditorWith(meta);
        } catch (error) {
            console.error('Failed to load geometry from file:', error);
            alert('Failed to load track file. Please ensure it\'s a valid JSON file.');
        }
    }

    async loadBaseImage(meta) {
        const baseUrl = '/tracks';
        const trackFolder = meta.id ? `${baseUrl}/${meta.id}` : baseUrl;

        // Fallback order: geometry.json -> canonical.png -> original.*
        let imageUrl = null;

        // 1. Try geometry.json (if it has embedded image)
        if (meta.geometry && meta.geometry.image) {
            imageUrl = meta.geometry.image;
        } else {
            // 2. Try canonical.png
            try {
                const response = await fetch(`${trackFolder}/canonical.png`);
                if (response.ok) {
                    imageUrl = `${trackFolder}/canonical.png`;
                }
            } catch (e) {
                // Continue to next fallback
            }

            // 3. Try original.* (png, jpg, svg, webp)
            if (!imageUrl) {
                const extensions = ['png', 'jpg', 'jpeg', 'svg', 'webp'];
                for (const ext of extensions) {
                    try {
                        const response = await fetch(`${trackFolder}/original.${ext}`);
                        if (response.ok) {
                            imageUrl = `${trackFolder}/original.${ext}`;
                            break;
                        }
                    } catch (e) {
                        // Continue
                    }
                }
            }
        }

        if (imageUrl) {
            try {
                this.trackImage = await this.loadImage(imageUrl);
            } catch (error) {
                console.warn('Failed to load base image:', error);
                this.trackImage = null;
            }
        } else {
            console.warn('No base image found for track');
            this.trackImage = null;
        }
    }

    initializeView() {
        if (this.trackImage && this.canvas) {
            // Center the track in the full-screen canvas initially
            this.panX = (this.canvas.width - this.trackImage.width) / 2;
            this.panY = (this.canvas.height - this.trackImage.height) / 2;
            this.zoom = 1;
        }
    }

    loadImage(url) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = url;
        });
    }

    render() {
        // Clear canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        if (this.trackImage) {
            // Save context for transformations
            this.ctx.save();

            // Apply zoom and pan transformations
            this.ctx.translate(this.panX, this.panY);
            this.ctx.scale(this.zoom, this.zoom);

            // Draw the track image at original size
            this.ctx.drawImage(this.trackImage, 0, 0);

            // Restore context
            this.ctx.restore();

            // Draw simple placeholders
            // this.drawPlaceholders(drawX, drawY, drawWidth, drawHeight);
        } else {
            // No image loaded, show message
            this.ctx.fillStyle = '#666';
            this.ctx.font = '24px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.fillText('No base image found for this track', this.canvas.width / 2, this.canvas.height / 2);
        }
    }

    drawPlaceholders(x, y, width, height) {
        // Draw a simple red rectangle as placeholder for road boundary
        this.ctx.strokeStyle = 'red';
        this.ctx.lineWidth = 3;
        this.ctx.strokeRect(x + 20, y + 20, width - 40, height - 40);

        // Add some text labels
        this.ctx.fillStyle = 'red';
        this.ctx.font = '14px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('Road Boundary (Placeholder)', x + width / 2, y + height - 10);
    }

    showEditor() {
        console.log('LevelEditor.showEditor called');
        
        // Set canvas size to full screen
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        console.log('Canvas size set to', this.canvas.width, this.canvas.height);

        // Initialize view if we have a track loaded
        if (this.trackImage) {
            this.initializeView();
        }

        // Set cursor style for panning
        this.canvas.style.cursor = 'grab';

        // Show editor
        if (this.container) {
            this.container.hidden = false;
            console.log('Editor container shown');
        }

        // Re-render after showing
        setTimeout(() => this.render(), 100);
    }

    hideEditor() {
        // Navigate back to main page
        window.location.href = 'index.html';
    }
}

// Global instance
const levelEditor = new LevelEditor();

// Exported functions
function initEditorWith(meta) {
    levelEditor.initEditorWith(meta);
}

function loadGeometryFromFile(file) {
    levelEditor.loadGeometryFromFile(file);
}

function showEditor() {
    levelEditor.showEditor();
}

function hideEditor() {
    levelEditor.hideEditor();
}

// Make functions available globally
window.LevelEditor = {
    initEditorWith,
    loadGeometryFromFile,
    showEditor,
    hideEditor
};
import { applyHudMixin } from './editor/hud.js';
import { applyInteractionMixin } from './editor/interaction.js';
import { applyLoadingMixin } from './editor/loading.js';
import { applyPersistenceMixin } from './editor/persistence.js';
import { applyRenderingMixin } from './editor/rendering.js';
import { applyStartFinishMixin } from './editor/startFinish.js';
import { applyCheckpointsMixin } from './editor/checkpoints.js';

class LevelEditor {
	constructor() {
		this.container = document.getElementById('level-editor');
		this.canvas = document.getElementById('editor-canvas');
		this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
		this.dock = document.getElementById('level-editor-dock');
		this.hudCardContainer = document.getElementById('editorHudCard');
		this.currentMeta = null;
		this.trackImage = null;

		this.editorState = {
			startLine: null,
			spawn: null,
			selectedObject: null,
			selectedCheckpoints: [],
			walls: [],
			checkpoints: [],
			uiToggles: {
				showCheckpoints: true,
				showStartFinish: true,
				showWalls: true
			}
		};

		this.currentTool = null;
		this.currentInteractionMode = 'tool';
		this.undoStack = [];
		this.redoStack = [];

		this.zoom = 1;
		this.panX = 0;
		this.panY = 0;
		this.isDragging = false;
		this.lastMouseX = 0;
		this.lastMouseY = 0;

		this.toolDragging = false;
		this.dragStartX = 0;
		this.dragStartY = 0;
		this.dragEndX = 0;
		this.dragEndY = 0;
		this.draggingHandle = null;
		this.spaceHeld = false;

		this.selectedHandle = null;
		this.isDraggingHandle = false;
		this.dragInitialState = null;

		this.isDraggingCheckpoint = false;
		this.draggingCheckpointId = null;
		this.draggingHandleId = null;

		this.autoSaveInterval = null;
		this.hasUnsavedChanges = false;
		this.isOnline = navigator.onLine;
		this.pendingSave = null;

		this.isTitleEditing = false;
		this._titleEditOriginalName = '';
	}

	initialize() {
		if (!this.container || !this.canvas) {
			// Not on the editor page, skip initialization
			return;
		}
		this.createHUD();
		this.setupEventListeners();
		this.loadFromURL();
	}

	// Loading workflow helpers are mixed in via applyLoadingMixin (see editor/loading.js).

	extractBorders() {
		if (!this.trackImage) {
			console.warn('No track image to extract borders from');
			this.editorState.walls = [];
			return;
		}

		// Create offscreen canvas to get image data
		const offscreenCanvas = document.createElement('canvas');
		const offscreenCtx = offscreenCanvas.getContext('2d');
		offscreenCanvas.width = this.trackImage.width;
		offscreenCanvas.height = this.trackImage.height;
		offscreenCtx.drawImage(this.trackImage, 0, 0);

		const imageData = offscreenCtx.getImageData(0, 0, this.trackImage.width, this.trackImage.height);
		const borders = [];
		const step = 5; // Sample every 5 pixels for performance

		// Scan the image and find border pixels (transition from track to non-track)
		for (let y = 0; y < this.trackImage.height; y += step) {
			for (let x = 0; x < this.trackImage.width; x += step) {
				const idx = (y * this.trackImage.width + x) * 4;
				const isOnTrack = imageData.data[idx + 3] > 0;

				if (isOnTrack) {
					// Check neighbors to see if we're at a border
					const neighbors = [
						{ dx: step, dy: 0 },
						{ dx: 0, dy: step },
						{ dx: -step, dy: 0 },
						{ dx: 0, dy: -step }
					];

					for (const { dx, dy } of neighbors) {
						const nx = x + dx;
						const ny = y + dy;
						if (nx >= 0 && nx < this.trackImage.width && ny >= 0 && ny < this.trackImage.height) {
							const nIdx = (ny * this.trackImage.width + nx) * 4;
							const neighborOnTrack = imageData.data[nIdx + 3] > 0;

							if (!neighborOnTrack) {
								// This is a border pixel - create a small line segment
								borders.push([
									{ x: x, y: y },
									{ x: nx, y: ny }
								]);
							}
						}
					}
				}
			}
		}

		console.log(`Extracted ${borders.length} border segments`);
		this.editorState.walls = borders;
	}

	showEditor() {
		if (!this.canvas) {
			return;
		}

		this.canvas.width = window.innerWidth;
		this.canvas.height = window.innerHeight;

		if (this.trackImage) {
			this.initializeView();
		}

		        const implementedTools = ['pan', 'select', 'wall', 'start-finish', 'checkpoint', 'delete', 'undo', 'redo', 'save'];
		if (this.dock) {
			implementedTools.forEach((tool) => {
				const button = this.dock.querySelector(`[data-tool="${tool}"]`);
				if (button) {
					button.disabled = false;
				}
			});
		}

		this.canvas.style.cursor = 'grab';

		if (this.container) {
			this.container.hidden = false;
		}

		// Start auto-save
		this.startAutoSave();

		setTimeout(() => this.render(), 100);
	}

	hideEditor() {
		window.location.href = 'index.html';
	}

	// Persistence helpers (save, auto-save, drafts, toasts) are mixed in via applyPersistenceMixin (see editor/persistence.js).

	async extractWalls() {
		console.log('Starting wall extraction...');
		this.setWallExtractionState(true);
		
		// Use setTimeout to allow the UI to update before the blocking operation
		await new Promise(resolve => setTimeout(resolve, 50));
		
		try {
			this.extractBorders();
			this.render();
			console.log('Wall extraction completed');
		} catch (error) {
			console.error('Error during wall extraction:', error);
		} finally {
			this.setWallExtractionState(false);
		}
	}

	setWallExtractionState(extracting) {
		const wallButton = this.dock ? this.dock.querySelector('[data-tool="wall"]') : null;
		if (wallButton) {
			wallButton.disabled = extracting;
		}

		// Disable all other tools during wall extraction
		const otherButtons = this.dock ? this.dock.querySelectorAll('.ui-dock__button[data-tool]:not([data-tool="wall"])') : [];
		otherButtons.forEach(button => {
			button.disabled = extracting;
		});

		// Show overlay
		if (extracting) {
			this.showWallExtractionOverlay();
		} else {
			this.hideWallExtractionOverlay();
		}
	}

	// showLoadingOverlay and hideLoadingOverlay are provided via applyLoadingMixin.

	showWallExtractionOverlay() {
		if (typeof this.ensureEditorOverlayStyles === 'function') {
			this.ensureEditorOverlayStyles();
		}

		let overlay = document.getElementById('wall-extraction-overlay');
		if (!overlay) {
			overlay = document.createElement('div');
			overlay.id = 'wall-extraction-overlay';
			overlay.style.cssText = `
				position: fixed;
				top: 0;
				left: 0;
				width: 100%;
				height: 100%;
				display: flex;
				align-items: center;
				justify-content: center;
				background: rgba(0, 0, 0, 0.7);
				z-index: 10000;
				flex-direction: column;
			`;
			document.body.appendChild(overlay);
		}

		const label = this.createOverlayLabel ?
			this.createOverlayLabel('Extracting walls…', { duration: '3.2s' }) :
			(() => {
				const fallback = document.createElement('div');
				fallback.textContent = 'Extracting walls…';
				fallback.style.color = '#fff';
				fallback.style.fontSize = '20px';
				fallback.style.fontWeight = '700';
				fallback.style.letterSpacing = '0.12em';
				fallback.style.textTransform = 'uppercase';
				fallback.style.textAlign = 'center';
				return fallback;
			})();

		overlay.textContent = '';
		overlay.appendChild(label);
		overlay.style.display = 'flex';
	}

	hideWallExtractionOverlay() {
		const overlay = document.getElementById('wall-extraction-overlay');
		if (overlay) {
			overlay.style.display = 'none';
		}
	}

	// loadGeometryIntoEditor is provided via applyLoadingMixin.
}

applyHudMixin(LevelEditor);
applyStartFinishMixin(LevelEditor);
applyRenderingMixin(LevelEditor);
applyInteractionMixin(LevelEditor);
applyLoadingMixin(LevelEditor);
applyPersistenceMixin(LevelEditor);
applyCheckpointsMixin(LevelEditor);

const levelEditor = new LevelEditor();
levelEditor.initialize();

export function initEditorWith(meta) {
	// For backward compatibility, if meta has id, treat as track load
	if (meta && meta.id) {
		levelEditor.loadTrackById(meta.id);
	} else {
		// Fallback to old behavior
		levelEditor.applyGeometryToEditor(null, null, meta);
	}
}

export function loadGeometryFromFile(file) {
	levelEditor.loadGeometryFromFile(file);
}

export function showEditor() {
	levelEditor.showEditor();
}

export function hideEditor() {
	levelEditor.hideEditor();
}

window.LevelEditor = {
	initEditorWith,
	loadGeometryFromFile,
	showEditor,
	hideEditor
};

window.initEditorWith = initEditorWith;
window.loadGeometryFromFile = loadGeometryFromFile;
window.showEditor = showEditor;
window.hideEditor = hideEditor;

export default levelEditor;

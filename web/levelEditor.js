import { applyHudMixin } from './editor/hud.js';
import { applyInteractionMixin } from './editor/interaction.js';
import { applyRenderingMixin } from './editor/rendering.js';
import { applyStartFinishMixin } from './editor/startFinish.js';

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

		this.autoSaveInterval = null;
		this.hasUnsavedChanges = false;
		this.isOnline = navigator.onLine;
		this.pendingSave = null;
	}

	initialize() {
		this.createHUD();
		this.setupEventListeners();
		this.loadFromURL();
	}

	loadFromURL() {
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

	async initEditorWith(meta) {
		console.log('LevelEditor.initEditorWith called with meta:', meta);
		if (!this.container) {
			console.error('Editor container not found');
			return;
		}
		if (!this.canvas || !this.ctx) {
			console.error('Editor canvas not ready');
			return;
		}

		this.currentMeta = meta;
		const baseName = meta?.name || 'Unknown Track';
		this.updateTrackLabel(baseName);

		await this.loadBaseImage(meta);
		this.initializeView();
		this.render();
		this.showEditor();

		// Check for drafts after loading
		this.checkForDraft();
	}

	async loadBaseImage(meta) {
		const baseUrl = '/tracks';
		const trackFolder = meta.id ? `${baseUrl}/${meta.id}` : baseUrl;
		let imageUrl = null;

		if (meta.geometry && meta.geometry.image) {
			imageUrl = meta.geometry.image;
		} else {
			try {
				const response = await fetch(`${trackFolder}/canonical.png`);
				if (response.ok) {
					imageUrl = `${trackFolder}/canonical.png`;
				}
			} catch (error) {
				// Continue searching
			}

			if (!imageUrl) {
				const extensions = ['png', 'jpg', 'jpeg', 'svg', 'webp'];
				for (const ext of extensions) {
					try {
						const response = await fetch(`${trackFolder}/original.${ext}`);
						if (response.ok) {
							imageUrl = `${trackFolder}/original.${ext}`;
							break;
						}
					} catch (error) {
						// Continue searching
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

		const implementedTools = ['pan', 'select', 'wall', 'start-finish', 'delete', 'undo', 'redo', 'save'];
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

	serializeGeometry(options = {}) {
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
				angle: cp.angle,
				radius: cp.radius || 20
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
				source
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
	}

	async saveGeometry() {
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
	}

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

	showWallExtractionOverlay() {
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
				background: rgba(0, 0, 0, 0.5);
				display: flex;
				align-items: center;
				justify-content: center;
				z-index: 10000;
				color: white;
				font-size: 24px;
			`;
			overlay.innerHTML = '<div>Adding Walls...</div>';
			document.body.appendChild(overlay);
		}
		overlay.style.display = 'flex';
	}

	hideWallExtractionOverlay() {
		const overlay = document.getElementById('wall-extraction-overlay');
		if (overlay) {
			overlay.style.display = 'none';
		}
	}

	setSavingState(saving) {
		const saveButton = this.dock ? this.dock.querySelector('[data-tool="save"]') : null;
		if (saveButton) {
			saveButton.disabled = saving;
			saveButton.textContent = saving ? 'Saving...' : 'Save';
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
	}

	showSavingOverlay() {
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
	}

	hideSavingOverlay() {
		const overlay = document.getElementById('saving-overlay');
		if (overlay) {
			overlay.style.display = 'none';
		}
	}

	showToast(message, type = 'info') {
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
	}

	startAutoSave() {
		this.stopAutoSave(); // Clear any existing interval
		this.autoSaveInterval = setInterval(() => {
			if (this.hasUnsavedChanges && this.currentMeta) {
				this.saveDraft();
			}
		}, 30000); // Save every 30 seconds
	}

	stopAutoSave() {
		if (this.autoSaveInterval) {
			clearInterval(this.autoSaveInterval);
			this.autoSaveInterval = null;
		}
	}

	saveDraft() {
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
	}

	loadDraft(trackId) {
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
	}

	clearDraft(trackId) {
		try {
			localStorage.removeItem(`editor_draft_${trackId}`);
		} catch (error) {
			console.warn('Failed to clear draft:', error);
		}
	}

	async checkForDraft() {
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
	}

	loadGeometryIntoEditor(geometry) {
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
	}

	markUnsavedChanges() {
		this.hasUnsavedChanges = true;
	}

	storePendingSave() {
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
	}

	retryPendingSave() {
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
	}

	async performSave(geometry) {
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
	}
}

applyHudMixin(LevelEditor);
applyStartFinishMixin(LevelEditor);
applyRenderingMixin(LevelEditor);
applyInteractionMixin(LevelEditor);

const levelEditor = new LevelEditor();
levelEditor.initialize();

export function initEditorWith(meta) {
	levelEditor.initEditorWith(meta);
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

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
			uiToggles: {
				showCheckpoints: true,
				showStartFinish: true
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

	showEditor() {
		if (!this.canvas) {
			return;
		}

		this.canvas.width = window.innerWidth;
		this.canvas.height = window.innerHeight;

		if (this.trackImage) {
			this.initializeView();
		}

		const implementedTools = ['pan', 'select', 'start-finish', 'delete', 'undo', 'redo'];
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

		setTimeout(() => this.render(), 100);
	}

	hideEditor() {
		window.location.href = 'index.html';
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

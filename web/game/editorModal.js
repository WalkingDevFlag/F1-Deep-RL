const modalState = {
    escListener: null,
    returnFocus: null,
    originalContent: null,
    currentPreviewFile: null,
    previewCanvas: null,
    previewMessage: null
};

function getModalElements() {
    const modal = document.getElementById('editor-modal');
    const dock = document.getElementById('editor-dock');
    const editorButton = document.querySelector('[data-dock-action="editor"]');
    return { modal, dock, editorButton };
}

export function openEditorModal() {
    const { modal, dock, editorButton } = getModalElements();
    if (!modal) {
        console.warn('Editor modal element not found.');
        return;
    }

    if (!modal.hidden && modal.classList.contains('is-open')) {
        return;
    }

    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
    modalState.returnFocus = editorButton instanceof HTMLElement ? editorButton : null;
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

    if (!modalState.escListener) {
        modalState.escListener = (event) => {
            if (event.key === 'Escape') {
                closeEditorModal();
            }
        };
        document.addEventListener('keydown', modalState.escListener);
    }
}

export function closeEditorModal() {
    const { modal, dock, editorButton } = getModalElements();
    if (!modal || modal.hidden) {
        return;
    }

    hideUploadPanel();

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

    if (modalState.escListener) {
        document.removeEventListener('keydown', modalState.escListener);
        modalState.escListener = null;
    }

    if (modalState.returnFocus && typeof modalState.returnFocus.focus === 'function') {
        modalState.returnFocus.focus({ preventScroll: true });
    }

    modalState.returnFocus = null;
}

export function initializeEditorModal() {
    const modal = document.getElementById('editor-modal');
    if (!modal) {
        return;
    }

    const content = modal.querySelector('.editor-modal__content');
    if (!content) {
        return;
    }

    if (!modalState.originalContent) {
        modalState.originalContent = content.innerHTML;
    }

    content.addEventListener('click', (event) => {
        event.stopPropagation();
    });

    attachModalRootHandlers(modal);
}

function attachModalRootHandlers(modal) {
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
    if (!modal) {
        return;
    }

    const content = modal.querySelector('.editor-modal__content');
    if (!content) {
        return;
    }

    modal.classList.add('is-loading');

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

    const trackList = document.getElementById('track-list');
    const closeButtons = loadForm.querySelectorAll('[data-editor-close]');
    closeButtons.forEach((button) => {
        button.addEventListener('click', (event) => {
            event.preventDefault();
            closeEditorModal();
        });
    });

    fetch('/tracks/list')
        .then((response) => response.json())
        .then((tracks) => {
            if (!Array.isArray(tracks) || tracks.length === 0) {
                trackList.innerHTML = '<div class="editor-load__empty">No tracks found. Upload one first!</div>';
                return;
            }

            const listHtml = tracks.map((track) => `
                <button type="button" class="editor-load__item" data-track-id="${track.id}">
                    <div class="editor-load__name">${track.name}</div>
                    <div class="editor-load__author">by ${track.author}</div>
                </button>
            `).join('');

            trackList.innerHTML = listHtml;
            trackList.querySelectorAll('.editor-load__item').forEach((button) => {
                button.addEventListener('click', () => {
                    const trackId = button.dataset.trackId;
                    if (trackId) {
                        loadTrack(trackId);
                    }
                });
            });
        })
        .catch((error) => {
            console.error('Failed to load tracks:', error);
            trackList.innerHTML = '<div class="editor-load__error">Failed to load tracks. Try again later.</div>';
        });
}

function loadTrack(trackId) {
    window.location.href = `editor.html?track=${trackId}`;
}

function showUploadPanel() {
    const modal = document.getElementById('editor-modal');
    if (!modal || !modalState.originalContent) {
        return;
    }

    const content = modal.querySelector('.editor-modal__content');
    if (!content) {
        return;
    }

    modal.classList.add('is-uploading');

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

    const trackFileInput = document.getElementById('track-file');
    const uploadBtn = document.getElementById('upload-btn');
    const cancelBtn = document.getElementById('cancel-upload-btn');
    modalState.previewCanvas = document.getElementById('preview-canvas');
    modalState.previewMessage = document.getElementById('preview-message');

    const closeButtons = uploadForm.querySelectorAll('[data-editor-close]');
    closeButtons.forEach((button) => {
        button.addEventListener('click', (event) => {
            event.preventDefault();
            closeEditorModal();
        });
    });

    trackFileInput.addEventListener('change', (event) => {
        const file = event.target.files ? event.target.files[0] : null;
        if (file) {
            modalState.currentPreviewFile = file;
            uploadBtn.disabled = false;
            validatePreview(file);
        } else {
            modalState.currentPreviewFile = null;
            uploadBtn.disabled = true;
            clearPreview();
        }
    });

    uploadBtn.addEventListener('click', () => {
        const nameInput = document.getElementById('track-name');
        const authorInput = document.getElementById('track-author');
        const coverInput = document.getElementById('cover-file');

        const name = nameInput instanceof HTMLInputElement ? nameInput.value.trim() : '';
        const author = authorInput instanceof HTMLInputElement ? authorInput.value.trim() : '';
        const file = modalState.currentPreviewFile;
        const cover = coverInput && coverInput.files ? coverInput.files[0] : null;

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
            .then((response) => response.json())
            .then((result) => {
                if (result.error) {
                    alert('Upload failed: ' + result.error);
                    uploadBtn.disabled = false;
                    uploadBtn.textContent = 'Upload';
                    return;
                }
                window.location.href = `editor.html?track=${result.meta.id}`;
            })
            .catch((error) => {
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
    if (!modal || !modalState.originalContent) {
        return;
    }

    const content = modal.querySelector('.editor-modal__content');
    if (content) {
        content.innerHTML = modalState.originalContent;
        attachModalRootHandlers(modal);
    }

    modal.classList.remove('is-uploading', 'is-loading');
    modalState.currentPreviewFile = null;
    modalState.previewCanvas = null;
    modalState.previewMessage = null;
}

function clearPreview() {
    if (modalState.previewCanvas) {
        const ctx = modalState.previewCanvas.getContext('2d');
        if (ctx) {
            ctx.clearRect(0, 0, modalState.previewCanvas.width, modalState.previewCanvas.height);
        }
    }

    if (modalState.previewMessage) {
        modalState.previewMessage.textContent = '';
        modalState.previewMessage.className = 'editor-upload__message';
    }
}

function validatePreview(file) {
    if (!file || !modalState.previewCanvas || !modalState.previewMessage) {
        return;
    }

    const img = new Image();
    img.onload = () => {
        const ctx = modalState.previewCanvas ? modalState.previewCanvas.getContext('2d') : null;
        if (!ctx) {
            return;
        }

        const offscreenCanvas = document.createElement('canvas');
        const offCtx = offscreenCanvas.getContext('2d');
        offscreenCanvas.width = img.width;
        offscreenCanvas.height = img.height;
        offCtx.drawImage(img, 0, 0);

        let hasTransparency = false;
        if (file.type === 'image/jpeg') {
            hasTransparency = true;
        } else {
            const imageData = offCtx.getImageData(0, 0, offscreenCanvas.width, offscreenCanvas.height);
            const data = imageData.data;
            for (let x = 0; x < offscreenCanvas.width; x++) {
                const topIndex = (x * 4) + 3;
                const bottomIndex = ((offscreenCanvas.height - 1) * offscreenCanvas.width * 4) + (x * 4) + 3;
                if (data[topIndex] < 255 || data[bottomIndex] < 255) {
                    hasTransparency = true;
                    break;
                }
            }
            if (!hasTransparency) {
                for (let y = 0; y < offscreenCanvas.height; y++) {
                    const leftIndex = (y * offscreenCanvas.width * 4) + 3;
                    const rightIndex = (y * offscreenCanvas.width * 4) + ((offscreenCanvas.width - 1) * 4) + 3;
                    if (data[leftIndex] < 255 || data[rightIndex] < 255) {
                        hasTransparency = true;
                        break;
                    }
                }
            }
        }

        ctx.clearRect(0, 0, modalState.previewCanvas.width, modalState.previewCanvas.height);
        const scale = Math.min(modalState.previewCanvas.width / img.width, modalState.previewCanvas.height / img.height);
        const x = (modalState.previewCanvas.width - img.width * scale) / 2;
        const y = (modalState.previewCanvas.height - img.height * scale) / 2;
        ctx.drawImage(img, x, y, img.width * scale, img.height * scale);

        if (file.type === 'image/jpeg') {
            modalState.previewMessage.textContent = '⚠️ JPG detected - transparency not supported';
            modalState.previewMessage.className = 'editor-upload__message editor-upload__message--warning';
        } else if (hasTransparency) {
            modalState.previewMessage.textContent = '⚠️ Transparency detected on borders';
            modalState.previewMessage.className = 'editor-upload__message editor-upload__message--warning';
        } else {
            modalState.previewMessage.textContent = '✅ Looks good';
            modalState.previewMessage.className = 'editor-upload__message editor-upload__message--success';
        }
    };
    img.src = URL.createObjectURL(file);
}

function autoMaskPreview(file) {
    if (!file || !modalState.previewCanvas || !modalState.previewMessage) {
        return;
    }

    const img = new Image();
    img.onload = () => {
        const ctx = modalState.previewCanvas ? modalState.previewCanvas.getContext('2d') : null;
        if (!ctx) {
            return;
        }

        const offscreenCanvas = document.createElement('canvas');
        const offCtx = offscreenCanvas.getContext('2d');
        offscreenCanvas.width = img.width;
        offscreenCanvas.height = img.height;
        offCtx.drawImage(img, 0, 0);

        const imageData = offCtx.getImageData(0, 0, offscreenCanvas.width, offscreenCanvas.height);
        const data = imageData.data;

        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            const gray = (r + g + b) / 3;
            const alpha = gray > 128 ? 255 : 0;
            data[i] = 255;
            data[i + 1] = 255;
            data[i + 2] = 255;
            data[i + 3] = alpha;
        }

        offCtx.putImageData(imageData, 0, 0);

        ctx.clearRect(0, 0, modalState.previewCanvas.width, modalState.previewCanvas.height);
        const squareSize = 10;
        for (let y = 0; y < modalState.previewCanvas.height; y += squareSize) {
            for (let x = 0; x < modalState.previewCanvas.width; x += squareSize) {
                ctx.fillStyle = (x / squareSize + y / squareSize) % 2 === 0 ? '#cccccc' : '#ffffff';
                ctx.fillRect(x, y, squareSize, squareSize);
            }
        }

        const scale = Math.min(modalState.previewCanvas.width / img.width, modalState.previewCanvas.height / img.height);
        const x = (modalState.previewCanvas.width - img.width * scale) / 2;
        const y = (modalState.previewCanvas.height - img.height * scale) / 2;
        ctx.drawImage(offscreenCanvas, x, y, img.width * scale, img.height * scale);

        modalState.previewMessage.textContent = '✅ Auto-masked applied';
        modalState.previewMessage.className = 'editor-upload__message editor-upload__message--success';
    };
    img.src = URL.createObjectURL(file);
}

if (typeof window !== 'undefined') {
    window.openEditorModal = openEditorModal;
    window.closeEditorModal = closeEditorModal;
    window.EditorModal = {
        open: openEditorModal,
        close: closeEditorModal,
        initialize: initializeEditorModal,
        hideUploadPanel
    };
}

export { hideUploadPanel, validatePreview, clearPreview, autoMaskPreview };

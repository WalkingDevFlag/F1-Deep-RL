export function applyHudMixin(LevelEditor) {
    LevelEditor.prototype.createHUD = function createHUD() {
    if (!this.header && this.container) {
        const header = document.createElement('div');
        header.className = 'editor-header';

        const titleEl = document.createElement('span');
        titleEl.className = 'editor-header__title ui-card__title';
        titleEl.textContent = 'Level Editor';
    titleEl.tabIndex = 0;

        titleEl.addEventListener('click', () => {
            this.startTitleEditing();
        });

        titleEl.addEventListener('keydown', (event) => {
            this.handleTitleKeydown(event);
        });

        titleEl.addEventListener('blur', () => {
            this.handleTitleBlur();
        }, true);

        titleEl.addEventListener('paste', (event) => {
            this.handleTitlePaste(event);
        });

        const exitButton = document.createElement('button');
        exitButton.type = 'button';
        exitButton.className = 'editor-header__button';
        exitButton.id = 'editor-exit-btn';
        exitButton.setAttribute('aria-label', 'Exit editor');
        exitButton.textContent = 'Exit Editor';

        header.append(titleEl, exitButton);
        this.container.appendChild(header);

        this.header = header;
        this.headerTitleEl = titleEl;
        this.exitBtn = exitButton;
    } else if (this.header) {
        this.headerTitleEl = this.header.querySelector('.editor-header__title');
        this.exitBtn = this.header.querySelector('#editor-exit-btn');
    }

    if (!window.UIKit || !this.hudCardContainer) {
        return;
    }

    const { createCard, createToggleRow } = window.UIKit;

    this.hudCardContainer.innerHTML = '';

    const hudCard = createCard({ title: 'HUD', overlay: true });
    hudCard.element.classList.add('editor-hud-card');
    hudCard.element.setAttribute('aria-label', 'Editor HUD');

    const trackNameRow = document.createElement('div');
    trackNameRow.className = 'ui-row';
    trackNameRow.style.fontWeight = '600';
    trackNameRow.style.fontSize = '15px';
    trackNameRow.id = 'editor-track-name';
    trackNameRow.textContent = 'Unknown Track';

    const checkpointsToggle = createToggleRow({
        label: 'Checkpoints',
        initial: this.editorState.uiToggles.showCheckpoints,
        onToggle: (checked) => {
        this.editorState.uiToggles.showCheckpoints = checked;
        this.render();
        }
    });

    const startFinishToggle = createToggleRow({
        label: 'Start/Finish',
        initial: this.editorState.uiToggles.showStartFinish,
        onToggle: (checked) => {
        this.editorState.uiToggles.showStartFinish = checked;
        this.render();
        }
    });

    const wallsToggle = createToggleRow({
        label: 'Walls',
        initial: this.editorState.uiToggles.showWalls,
        onToggle: (checked) => {
        this.editorState.uiToggles.showWalls = checked;
        this.render();
        }
    });

    hudCard.addMany([trackNameRow, checkpointsToggle, startFinishToggle, wallsToggle]);
    this.hudCardContainer.appendChild(hudCard.element);

    this.trackNameEl = trackNameRow;
    };

    LevelEditor.prototype.updateTrackLabel = function updateTrackLabel(baseName) {
        const suffix = this.editorState.startLine ? ' — start ready' : '';
        if (this.trackNameEl) {
            this.trackNameEl.textContent = `Editing: ${baseName}${suffix}`;
        }

    if (this.headerTitleEl) {
        this.headerTitleEl.textContent = baseName;
    }
    };

    LevelEditor.prototype.startTitleEditing = function startTitleEditing() {
        if (this.isTitleEditing || !this.headerTitleEl) {
            return;
        }

        if (!this.currentMeta) {
            this.currentMeta = {};
        }

        const currentName = this.currentMeta.name || this.headerTitleEl.textContent || 'Untitled Track';

        this.isTitleEditing = true;
        this._titleEditOriginalName = currentName;

        this.headerTitleEl.setAttribute('contenteditable', 'true');
        this.headerTitleEl.setAttribute('role', 'textbox');
        this.headerTitleEl.setAttribute('aria-label', 'Track name (editing)');
        this.headerTitleEl.setAttribute('spellcheck', 'false');
        this.headerTitleEl.style.outline = 'none';
        this.headerTitleEl.style.caretColor = 'inherit';
        this.headerTitleEl.textContent = currentName;

        const selection = window.getSelection();
        if (selection) {
            const range = document.createRange();
            range.selectNodeContents(this.headerTitleEl);
            selection.removeAllRanges();
            selection.addRange(range);
        }

        this.headerTitleEl.focus();
    };

    LevelEditor.prototype.handleTitleKeydown = function handleTitleKeydown(event) {
        if (!this.headerTitleEl) return;

        if (!this.isTitleEditing) {
            if (event.key === 'Enter' || event.key === 'F2') {
                event.preventDefault();
                this.startTitleEditing();
            }
            return;
        }

        if (event.key === 'Enter') {
            event.preventDefault();
            this.finishTitleEditing(true);
        } else if (event.key === 'Escape') {
            event.preventDefault();
            this.finishTitleEditing(false);
        }
    };

    LevelEditor.prototype.handleTitleBlur = function handleTitleBlur() {
        if (this.isTitleEditing) {
            this.finishTitleEditing(true);
        }
    };

    LevelEditor.prototype.handleTitlePaste = function handleTitlePaste(event) {
        if (!this.isTitleEditing) {
            return;
        }

        event.preventDefault();
        const clipboardData = event.clipboardData || window.clipboardData;
        if (!clipboardData) {
            return;
        }

        const text = clipboardData.getData('text/plain');
        const sanitized = this.sanitizeTrackName(text);

        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) {
            return;
        }

        selection.deleteFromDocument();
        selection.getRangeAt(0).insertNode(document.createTextNode(sanitized));
        selection.collapseToEnd();
    };

    LevelEditor.prototype.finishTitleEditing = function finishTitleEditing(confirmChange) {
        if (!this.isTitleEditing || !this.headerTitleEl) {
            return;
        }

        const titleEl = this.headerTitleEl;
        let finalName = this._titleEditOriginalName || '';

        if (confirmChange) {
            const newName = this.sanitizeTrackName(titleEl.textContent);
            if (newName) {
                finalName = newName;
            }
        }

        this.isTitleEditing = false;
        this._titleEditOriginalName = '';

        titleEl.removeAttribute('contenteditable');
        titleEl.removeAttribute('role');
        titleEl.removeAttribute('aria-label');
        titleEl.removeAttribute('spellcheck');
        titleEl.style.outline = '';

        if (confirmChange) {
            if (!this.currentMeta) {
                this.currentMeta = {};
            }
            if (finalName && this.currentMeta.name !== finalName) {
                this.currentMeta.name = finalName;
                this.markUnsavedChanges();
            }
        }

        this.updateTrackLabel(this.currentMeta?.name || finalName || 'Unknown Track');
    };

    LevelEditor.prototype.sanitizeTrackName = function sanitizeTrackName(raw) {
        if (!raw) {
            return '';
        }
        return raw.replace(/[\t\n\r]+/g, ' ').replace(/\s+/g, ' ').trim();
    };
}

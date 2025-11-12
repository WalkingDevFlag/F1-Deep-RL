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

    // Create Checkpoints Card
    this.createCheckpointsCard();
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

    LevelEditor.prototype.createCheckpointsCard = function createCheckpointsCard() {
        if (!window.UIKit || !this.container) {
            return;
        }

        const { createCard } = window.UIKit;

        // Create checkpoints card
        const checkpointsCard = createCard({ title: 'Checkpoints' });
        checkpointsCard.element.classList.add('ui-card--bottom-right');
        checkpointsCard.element.setAttribute('aria-label', 'Checkpoints Manager');

        // Create checkpoints list container
        const checkpointsList = document.createElement('div');
        checkpointsList.className = 'checkpoints-list';
        checkpointsList.style.display = 'flex';
        checkpointsList.style.flexDirection = 'column';
        checkpointsList.style.gap = '8px';
        checkpointsList.style.maxHeight = '300px';
        checkpointsList.style.overflowY = 'auto';

        checkpointsCard.body.appendChild(checkpointsList);
        this.container.appendChild(checkpointsCard.element);
        this.checkpointsCard = checkpointsCard.element;
        this.checkpointsList = checkpointsList;

        // Initial render
        this.updateCheckpointsCard();
    };

    LevelEditor.prototype.updateCheckpointsCard = function updateCheckpointsCard() {
        if (!this.checkpointsList) return;

        this.checkpointsList.innerHTML = '';

        if (this.editorState.checkpoints.length === 0) {
            const emptyMessage = document.createElement('div');
            emptyMessage.className = 'ui-row';
            emptyMessage.style.fontSize = '13px';
            emptyMessage.style.color = 'var(--hud-muted)';
            emptyMessage.style.fontStyle = 'italic';
            emptyMessage.style.textAlign = 'center';
            emptyMessage.style.padding = '20px 0';
            emptyMessage.textContent = 'No checkpoints yet';
            this.checkpointsList.appendChild(emptyMessage);
            return;
        }

        // Sort checkpoints by ID for consistent ordering
        const sortedCheckpoints = [...this.editorState.checkpoints].sort((a, b) => {
            const aNum = parseInt(a.id.replace('CP', '')) || 0;
            const bNum = parseInt(b.id.replace('CP', '')) || 0;
            return aNum - bNum;
        });

        sortedCheckpoints.forEach((checkpoint, index) => {
            const checkpointRow = document.createElement('div');
            checkpointRow.className = 'checkpoint-row';
            checkpointRow.style.display = 'flex';
            checkpointRow.style.alignItems = 'center';
            checkpointRow.style.gap = '8px';
            checkpointRow.style.padding = '8px 12px';
            checkpointRow.style.borderRadius = '6px';
            checkpointRow.style.backgroundColor = this.editorState.selectedCheckpoints.includes(checkpoint.id) ?
                'rgba(45, 140, 240, 0.1)' : 'var(--hud-surface)';
            checkpointRow.style.border = this.editorState.selectedCheckpoints.includes(checkpoint.id) ?
                '1px solid var(--hud-accent)' : '1px solid var(--hud-border)';
            checkpointRow.style.cursor = 'pointer';
            checkpointRow.style.transition = 'all 0.2s ease';

            // Checkpoint number input
            const numberInput = document.createElement('input');
            numberInput.type = 'number';
            numberInput.min = '1';
            numberInput.max = '999';
            numberInput.value = parseInt(checkpoint.id.replace('CP', '')) || (index + 1);
            numberInput.className = 'checkpoint-number';
            numberInput.style.width = '50px';
            numberInput.style.padding = '4px 6px';
            numberInput.style.border = '1px solid var(--hud-border)';
            numberInput.style.borderRadius = '3px';
            numberInput.style.backgroundColor = 'var(--hud-bg)';
            numberInput.style.color = 'var(--hud-text)';
            numberInput.style.fontSize = '12px';
            numberInput.style.fontWeight = '600';
            numberInput.style.textAlign = 'center';

            // Name input
            const nameInput = document.createElement('input');
            nameInput.type = 'text';
            nameInput.value = checkpoint.meta?.note || checkpoint.id;
            nameInput.placeholder = checkpoint.id;
            nameInput.className = 'checkpoint-name';
            nameInput.style.flex = '1';
            nameInput.style.padding = '4px 8px';
            nameInput.style.border = '1px solid var(--hud-border)';
            nameInput.style.borderRadius = '3px';
            nameInput.style.backgroundColor = 'var(--hud-bg)';
            nameInput.style.color = 'var(--hud-text)';
            nameInput.style.fontSize = '13px';
            nameInput.style.fontWeight = '500';

            // Event handlers
            checkpointRow.addEventListener('click', (e) => {
                if (e.target === numberInput || e.target === nameInput) return;

                // Toggle selection
                if (e.shiftKey) {
                    const currentIndex = this.editorState.selectedCheckpoints.indexOf(checkpoint.id);
                    if (currentIndex > -1) {
                        this.editorState.selectedCheckpoints.splice(currentIndex, 1);
                    } else {
                        this.editorState.selectedCheckpoints.push(checkpoint.id);
                    }
                } else {
                    this.editorState.selectedCheckpoints = [checkpoint.id];
                }
                this.updateCheckpointsCard();
                this.render();
            });

            numberInput.addEventListener('change', (e) => {
                const newNumber = parseInt(e.target.value);
                if (newNumber && newNumber > 0 && newNumber < 1000) {
                    this.renumberCheckpoint(checkpoint.id, newNumber);
                } else {
                    e.target.value = parseInt(checkpoint.id.replace('CP', '')) || (index + 1);
                }
            });

            numberInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.target.blur();
                }
            });

            nameInput.addEventListener('change', (e) => {
                this.renameCheckpoint(checkpoint.id, e.target.value.trim());
            });

            nameInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.target.blur();
                }
            });

            checkpointRow.appendChild(numberInput);
            checkpointRow.appendChild(nameInput);
            this.checkpointsList.appendChild(checkpointRow);
        });
    };

    LevelEditor.prototype.renameCheckpoint = function renameCheckpoint(id, newName) {
        const checkpoint = this.editorState.checkpoints.find(cp => cp.id === id);
        if (!checkpoint) return;

        if (!checkpoint.meta) checkpoint.meta = {};
        checkpoint.meta.note = newName;
        this.markUnsavedChanges();
        this.updateCheckpointsCard();
    };

    LevelEditor.prototype.renumberCheckpoint = function renumberCheckpoint(id, newNumber) {
        const checkpoint = this.editorState.checkpoints.find(cp => cp.id === id);
        if (!checkpoint) return;

        const newId = `CP${newNumber}`;

        // Check if the new ID already exists
        if (this.editorState.checkpoints.some(cp => cp.id === newId && cp.id !== id)) {
            this.showToast(`Checkpoint ${newId} already exists`, 'error');
            this.updateCheckpointsCard(); // Reset the input
            return;
        }

        const oldId = checkpoint.id;
        checkpoint.id = newId;

        // Update selection if this checkpoint was selected
        const selIndex = this.editorState.selectedCheckpoints.indexOf(oldId);
        if (selIndex > -1) {
            this.editorState.selectedCheckpoints[selIndex] = newId;
        }

        this.markUnsavedChanges();
        this.showToast(`Renamed ${oldId} to ${newId}`, 'success');
        this.updateCheckpointsCard();
        this.render(); // Update the rendered checkpoint labels
    };
}



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
        checkpointsList.style.overflowX = 'hidden';
        checkpointsList.style.width = '100%';
        checkpointsList.style.boxSizing = 'border-box';
        // Hide scroll bar but keep scrolling functionality
        checkpointsList.style.scrollbarWidth = 'none'; // Firefox
        checkpointsList.style.msOverflowStyle = 'none'; // IE/Edge
        // WebKit browsers (Chrome, Safari, newer Edge)
        const webkitScrollbarStyle = document.createElement('style');
        webkitScrollbarStyle.textContent = `
            .checkpoints-list::-webkit-scrollbar {
                display: none;
            }
        `;
        document.head.appendChild(webkitScrollbarStyle);

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
            const checkpointButton = document.createElement('button');
            checkpointButton.type = 'button';
            checkpointButton.className = 'checkpoint-button';
            checkpointButton.textContent = checkpoint.id;
            checkpointButton.style.display = 'flex';
            checkpointButton.style.alignItems = 'center';
            checkpointButton.style.justifyContent = 'center';
            checkpointButton.style.width = '100%';
            checkpointButton.style.padding = '12px 16px';
            checkpointButton.style.fontSize = '15px';
            checkpointButton.style.borderRadius = '8px';
            checkpointButton.style.border = '2px solid var(--hud-border)';
            checkpointButton.style.backgroundColor = this.editorState.selectedCheckpoints.includes(checkpoint.id) ?
                'var(--hud-accent)' : 'var(--hud-surface)';
            checkpointButton.style.color = this.editorState.selectedCheckpoints.includes(checkpoint.id) ?
                '#ffffff' : 'var(--hud-text)';
            checkpointButton.style.fontWeight = '600';
            checkpointButton.style.cursor = 'pointer';
            checkpointButton.style.transition = 'transform 0.2s ease, box-shadow 0.2s ease, background-color 0.2s ease';
            checkpointButton.style.boxShadow = 'var(--hud-shadow)';
            checkpointButton.style.position = 'relative';

            // Create 3 dots menu
            const dotsMenu = document.createElement('div');
            dotsMenu.className = 'checkpoint-dots-menu';
            dotsMenu.textContent = '⋮';
            dotsMenu.style.position = 'absolute';
            dotsMenu.style.top = '8px';
            dotsMenu.style.right = '12px';
            dotsMenu.style.fontSize = '16px';
            dotsMenu.style.fontWeight = '700';
            dotsMenu.style.color = this.editorState.selectedCheckpoints.includes(checkpoint.id) ?
                '#ffffff' : 'var(--hud-text)';
            dotsMenu.style.opacity = '0';
            dotsMenu.style.transition = 'opacity 0.2s ease';
            dotsMenu.style.cursor = 'pointer';
            dotsMenu.style.userSelect = 'none';
            dotsMenu.style.pointerEvents = 'auto';

            // Show dots on button hover
            checkpointButton.addEventListener('mouseenter', () => {
                if (!this.editorState.selectedCheckpoints.includes(checkpoint.id)) {
                    checkpointButton.style.transform = 'translate(-3px, -3px)';
                    checkpointButton.style.boxShadow = 'none';
                }
                dotsMenu.style.opacity = '1';
            });

            checkpointButton.addEventListener('mouseleave', () => {
                if (!this.editorState.selectedCheckpoints.includes(checkpoint.id)) {
                    checkpointButton.style.transform = 'none';
                    checkpointButton.style.boxShadow = 'var(--hud-shadow)';
                }
                dotsMenu.style.opacity = '0';
            });

            // Make draggable
            checkpointButton.draggable = true;
            checkpointButton.dataset.checkpointId = checkpoint.id;

            // Drag and drop event handlers
            checkpointButton.addEventListener('dragstart', (e) => {
                e.dataTransfer.setData('text/plain', checkpoint.id);
                e.dataTransfer.effectAllowed = 'move';
                checkpointButton.style.opacity = '0.5';
            });

            checkpointButton.addEventListener('dragend', (e) => {
                checkpointButton.style.opacity = '1';
            });

            checkpointButton.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
            });

            checkpointButton.addEventListener('drop', (e) => {
                e.preventDefault();
                const draggedId = e.dataTransfer.getData('text/plain');
                const targetId = checkpoint.id;

                if (draggedId !== targetId) {
                    this.reorderCheckpoints(draggedId, targetId);
                }
            });

            checkpointButton.addEventListener('focus', () => {
                if (!this.editorState.selectedCheckpoints.includes(checkpoint.id)) {
                    checkpointButton.style.transform = 'translate(-3px, -3px)';
                    checkpointButton.style.boxShadow = 'none';
                }
            });

            checkpointButton.addEventListener('blur', () => {
                if (!this.editorState.selectedCheckpoints.includes(checkpoint.id)) {
                    checkpointButton.style.transform = 'none';
                    checkpointButton.style.boxShadow = 'var(--hud-shadow)';
                }
            });

            // Click handler - toggle selection
            checkpointButton.addEventListener('click', (e) => {
                e.stopPropagation();

                // Don't select if clicking on dots menu
                if (e.target === dotsMenu) return;

                if (e.shiftKey) {
                    // Multi-select with shift
                    const currentIndex = this.editorState.selectedCheckpoints.indexOf(checkpoint.id);
                    if (currentIndex > -1) {
                        this.editorState.selectedCheckpoints.splice(currentIndex, 1);
                    } else {
                        this.editorState.selectedCheckpoints.push(checkpoint.id);
                    }
                } else {
                    // Single select - toggle
                    if (this.editorState.selectedCheckpoints.includes(checkpoint.id)) {
                        // If already selected, deselect it
                        this.editorState.selectedCheckpoints = [];
                    } else {
                        // Select only this one
                        this.editorState.selectedCheckpoints = [checkpoint.id];
                    }
                }
                this.updateCheckpointsCard();
                this.render();
            });

            // Dots menu click handler
            dotsMenu.addEventListener('click', (e) => {
                e.stopPropagation();
                // For now, just show a simple alert - can be expanded later
                alert(`Options for ${checkpoint.id}`);
            });

            checkpointButton.appendChild(dotsMenu);
            this.checkpointsList.appendChild(checkpointButton);
        });
    };

    LevelEditor.prototype.reorderCheckpoints = function reorderCheckpoints(draggedId, targetId) {
        const draggedIndex = this.editorState.checkpoints.findIndex(cp => cp.id === draggedId);
        const targetIndex = this.editorState.checkpoints.findIndex(cp => cp.id === targetId);

        if (draggedIndex === -1 || targetIndex === -1) return;

        // Remove dragged checkpoint and insert at new position
        const [draggedCheckpoint] = this.editorState.checkpoints.splice(draggedIndex, 1);
        this.editorState.checkpoints.splice(targetIndex, 0, draggedCheckpoint);

        // Renumber all checkpoints sequentially
        this.editorState.checkpoints.forEach((checkpoint, index) => {
            const oldId = checkpoint.id;
            const newId = `CP${index + 1}`;
            checkpoint.id = newId;

            // Update selection if this checkpoint was selected
            const selIndex = this.editorState.selectedCheckpoints.indexOf(oldId);
            if (selIndex > -1) {
                this.editorState.selectedCheckpoints[selIndex] = newId;
            }
        });

        this.markUnsavedChanges();
        this.updateCheckpointsCard();
        this.render();
    };
}



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

        const styleId = 'checkpoints-card-style';
        if (!document.getElementById(styleId)) {
            const styleEl = document.createElement('style');
            styleEl.id = styleId;
            styleEl.textContent = `
                .checkpoints-list {
                    scrollbar-width: none;
                    -ms-overflow-style: none;
                }

                .checkpoints-list::-webkit-scrollbar {
                    display: none;
                }

                .checkpoint-button {
                    will-change: transform;
                }

                .checkpoint-button--animate-up {
                    animation: checkpointMoveUp 400ms cubic-bezier(0.34, 1.56, 0.64, 1), checkpointGlow 600ms ease-out;
                }

                .checkpoint-button--animate-down {
                    animation: checkpointMoveDown 400ms cubic-bezier(0.34, 1.56, 0.64, 1), checkpointGlow 600ms ease-out;
                }

                .checkpoint-button--drag-over {
                    outline: 2px dashed var(--hud-accent);
                    outline-offset: 4px;
                }

                .checkpoint-button--dragging {
                    opacity: 0.85;
                }

                .checkpoint-button[data-drag-state='idle'] .checkpoint-dots-menu,
                .checkpoint-dots-menu {
                    cursor: grab;
                }

                .checkpoint-button[data-drag-state='dragging'] .checkpoint-dots-menu {
                    cursor: grabbing;
                }

                .checkpoint-dots-menu {
                    touch-action: none;
                }

                @keyframes checkpointMoveUp {
                    0% {
                        transform: translateY(0);
                    }
                    20% {
                        transform: translateY(18px);
                    }
                    40% {
                        transform: translateY(-8px);
                    }
                    60% {
                        transform: translateY(12px);
                    }
                    80% {
                        transform: translateY(-4px);
                    }
                    100% {
                        transform: translateY(0);
                    }
                }

                @keyframes checkpointMoveDown {
                    0% {
                        transform: translateY(0);
                    }
                    20% {
                        transform: translateY(-18px);
                    }
                    40% {
                        transform: translateY(8px);
                    }
                    60% {
                        transform: translateY(-12px);
                    }
                    80% {
                        transform: translateY(4px);
                    }
                    100% {
                        transform: translateY(0);
                    }
                }

                @keyframes checkpointGlow {
                    0% {
                        box-shadow: var(--hud-shadow);
                    }
                    20% {
                        box-shadow: 0 0 0 0 rgba(45, 140, 240, 0.6), var(--hud-shadow);
                    }
                    50% {
                        box-shadow: 0 0 0 8px rgba(45, 140, 240, 0), var(--hud-shadow);
                    }
                    100% {
                        box-shadow: var(--hud-shadow);
                    }
                }
            `;
            document.head.appendChild(styleEl);
        }

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
            checkpointButton.dataset.checkpointId = checkpoint.id;
            checkpointButton.dataset.dragState = 'idle';
            checkpointButton.dataset.dragIndex = String(index);

            const label = document.createElement('span');
            label.className = 'checkpoint-label';
            label.textContent = checkpoint.id;
            label.style.pointerEvents = 'none';
            checkpointButton.appendChild(label);

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
            dotsMenu.style.cursor = 'grab';
            dotsMenu.style.userSelect = 'none';
            dotsMenu.style.pointerEvents = 'auto';
            dotsMenu.dataset.dragHandle = 'true';
            dotsMenu.title = 'Drag to reorder checkpoint';

            const showDots = () => {
                dotsMenu.style.opacity = '1';
            };

            const hideDots = () => {
                dotsMenu.style.opacity = '0';
            };

            // Show dots on button hover
            checkpointButton.addEventListener('mouseenter', () => {
                if (!this.editorState.selectedCheckpoints.includes(checkpoint.id)) {
                    checkpointButton.style.transform = 'translate(-3px, -3px)';
                    checkpointButton.style.boxShadow = 'none';
                }
                showDots();
            });

            checkpointButton.addEventListener('mouseleave', () => {
                if (!this.editorState.selectedCheckpoints.includes(checkpoint.id)) {
                    checkpointButton.style.transform = 'none';
                    checkpointButton.style.boxShadow = 'var(--hud-shadow)';
                }
                hideDots();
            });

            checkpointButton.addEventListener('focus', () => {
                if (!this.editorState.selectedCheckpoints.includes(checkpoint.id)) {
                    checkpointButton.style.transform = 'translate(-3px, -3px)';
                    checkpointButton.style.boxShadow = 'none';
                }
                showDots();
            });

            checkpointButton.addEventListener('blur', () => {
                if (!this.editorState.selectedCheckpoints.includes(checkpoint.id)) {
                    checkpointButton.style.transform = 'none';
                    checkpointButton.style.boxShadow = 'var(--hud-shadow)';
                }
                hideDots();
            });

            // Click handler - toggle selection
            checkpointButton.addEventListener('click', (e) => {
                e.stopPropagation();

                if (checkpointButton.dataset.dragState === 'dragging') {
                    return;
                }

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

            checkpointButton.appendChild(dotsMenu);
            this.checkpointsList.appendChild(checkpointButton);
        });
        this.ensureCheckpointDragHandlers();
    };

    LevelEditor.prototype.ensureCheckpointDragHandlers = function ensureCheckpointDragHandlers() {
        if (!this.checkpointsList) {
            return;
        }

        if (!this._boundCheckpointPointerDown) {
            this._boundCheckpointPointerDown = this.handleCheckpointPointerDown.bind(this);
            this._boundCheckpointPointerMove = this.handleCheckpointPointerMove.bind(this);
            this._boundCheckpointPointerUp = this.handleCheckpointPointerUp.bind(this);
        }

        if (this._checkpointDragList !== this.checkpointsList) {
            if (this._checkpointDragList) {
                this._checkpointDragList.removeEventListener('pointerdown', this._boundCheckpointPointerDown);
            }
            this._checkpointDragList = this.checkpointsList;
            this._checkpointDragList.addEventListener('pointerdown', this._boundCheckpointPointerDown);
        }
    };

    LevelEditor.prototype.handleCheckpointPointerDown = function handleCheckpointPointerDown(event) {
        if (!this.checkpointsList) {
            return;
        }

        if (event.button !== undefined && event.button !== 0 && event.pointerType !== 'touch') {
            return;
        }

        const dragHandle = event.target.closest('.checkpoint-dots-menu');
        if (!dragHandle) {
            return;
        }

        const checkpointButton = dragHandle.closest('.checkpoint-button');
        if (!checkpointButton) {
            return;
        }

        if (checkpointButton.dataset.dragState === 'dragging') {
            return;
        }

        event.preventDefault();

        const pointerId = event.pointerId;
        if (pointerId !== undefined && checkpointButton.setPointerCapture) {
            try {
                checkpointButton.setPointerCapture(pointerId);
            } catch (captureError) {
                // Ignore pointer capture errors (e.g., on unsupported devices)
            }
        }

        this._checkpointDragState = {
            pointerId,
            container: this.checkpointsList,
            draggedItem: checkpointButton,
            startX: event.clientX,
            startY: event.clientY,
            lastX: event.clientX,
            lastY: event.clientY,
            isActive: false,
            items: [],
            idleItems: [],
            itemsGap: 0,
            prevRect: null,
            draggedHeight: 0,
            pointerOffsetX: 0,
            pointerOffsetY: 0
        };

        window.addEventListener('pointermove', this._boundCheckpointPointerMove, { passive: false });
        window.addEventListener('pointerup', this._boundCheckpointPointerUp);
        window.addEventListener('pointercancel', this._boundCheckpointPointerUp);
    };

    LevelEditor.prototype.handleCheckpointPointerMove = function handleCheckpointPointerMove(event) {
        const state = this._checkpointDragState;
        if (!state) {
            return;
        }

        if (state.pointerId !== undefined && event.pointerId !== state.pointerId) {
            return;
        }

        if (!state.isActive) {
            const dx = event.clientX - state.startX;
            const dy = event.clientY - state.startY;
            if (Math.abs(dx) < 3 && Math.abs(dy) < 3) {
                return;
            }
            this.startCheckpointDragInteraction(state);
        }

        if (!state.isActive) {
            return;
        }

        event.preventDefault();

        const clientX = event.clientX;
        const clientY = event.clientY;

        state.lastX = clientX;
        state.lastY = clientY;

        const offsetX = clientX - state.startX;
        const offsetY = clientY - state.startY;

        state.pointerOffsetX = offsetX;
        state.pointerOffsetY = offsetY;

        state.draggedItem.style.transform = `translate(${offsetX}px, ${offsetY}px)`;

        this.updateCheckpointDragIdleItems(state);
    };

    LevelEditor.prototype.handleCheckpointPointerUp = function handleCheckpointPointerUp(event) {
        const state = this._checkpointDragState;
        if (!state) {
            return;
        }

        if (state.pointerId !== undefined && event.pointerId !== state.pointerId) {
            return;
        }

        if (state.draggedItem && state.pointerId !== undefined && state.draggedItem.releasePointerCapture) {
            try {
                state.draggedItem.releasePointerCapture(state.pointerId);
            } catch (releaseError) {
                // Ignore release errors
            }
        }

        window.removeEventListener('pointermove', this._boundCheckpointPointerMove);
        window.removeEventListener('pointerup', this._boundCheckpointPointerUp);
        window.removeEventListener('pointercancel', this._boundCheckpointPointerUp);

        if (state.isActive) {
            this.finalizeCheckpointDrag(state, event);
        } else {
            this.resetCheckpointDragState(state);
        }
    };

    LevelEditor.prototype.startCheckpointDragInteraction = function startCheckpointDragInteraction(state) {
        if (!state || state.isActive) {
            return;
        }

        state.isActive = true;

        const items = Array.from(state.container.querySelectorAll('.checkpoint-button'));
        state.items = items;
        state.idleItems = items.filter(item => item !== state.draggedItem);
        const draggedIndex = items.indexOf(state.draggedItem);
        state.draggedIndex = draggedIndex;

        items.forEach((item, index) => {
            item.dataset.dragIndex = String(index);
            if (item !== state.draggedItem) {
                item.dataset.dragState = 'idle';
                item.style.transition = 'transform 0.2s ease';
            }
        });

        state.draggedItem.dataset.dragState = 'dragging';
        state.draggedItem.classList.add('checkpoint-button--dragging');
        state.draggedItem.style.transition = 'none';
        state.draggedItem.style.zIndex = '30';

        state.idleItems.forEach(item => {
            const itemIndex = items.indexOf(item);
            if (itemIndex < draggedIndex) {
                item.dataset.dragIsAbove = 'true';
            } else {
                item.removeAttribute('data-drag-is-above');
            }
            item.removeAttribute('data-drag-is-toggled');
        });

        const rect = state.draggedItem.getBoundingClientRect();
        state.prevRect = rect;
        state.draggedHeight = rect.height;
        state.itemsGap = this.computeCheckpointItemsGap(state);

        this.lockCheckpointScroll();
    };

    LevelEditor.prototype.updateCheckpointDragIdleItems = function updateCheckpointDragIdleItems(state) {
        if (!state || !state.isActive) {
            return;
        }

        const draggedRect = state.draggedItem.getBoundingClientRect();
        const draggedCenterY = draggedRect.top + draggedRect.height / 2;

        state.idleItems.forEach(item => {
            const itemRect = item.getBoundingClientRect();
            const itemCenterY = itemRect.top + itemRect.height / 2;
            const isAbove = item.hasAttribute('data-drag-is-above');
            const shouldToggle = isAbove ? draggedCenterY <= itemCenterY : draggedCenterY >= itemCenterY;

            if (shouldToggle) {
                if (!item.hasAttribute('data-drag-is-toggled')) {
                    item.dataset.dragIsToggled = 'true';
                    const direction = isAbove ? 1 : -1;
                    const translate = direction * (state.draggedHeight + state.itemsGap);
                    item.style.transform = `translateY(${translate}px)`;
                }
            } else if (item.hasAttribute('data-drag-is-toggled')) {
                item.removeAttribute('data-drag-is-toggled');
                item.style.transform = 'translateY(0px)';
            }
        });
    };

    LevelEditor.prototype.finalizeCheckpointDrag = function finalizeCheckpointDrag(state, event) {
        if (!state || !state.isActive) {
            return;
        }

        const reordered = new Array(state.items.length);

        state.items.forEach((item, index) => {
            if (item === state.draggedItem) {
                return;
            }

            if (!item.hasAttribute('data-drag-is-toggled')) {
                reordered[index] = item;
                return;
            }

            const isAbove = item.hasAttribute('data-drag-is-above');
            const newIndex = isAbove ? index + 1 : index - 1;
            reordered[newIndex] = item;
        });

        for (let index = 0; index < reordered.length; index += 1) {
            if (!reordered[index]) {
                reordered[index] = state.draggedItem;
            }
        }

        reordered.forEach(item => {
            state.container.appendChild(item);
        });

        // Reset idle item transforms so they slide into their final positions
        state.idleItems.forEach(item => {
            item.style.transition = 'transform 0.2s ease';
            item.style.transform = 'translateY(0px)';
            item.removeAttribute('data-drag-is-toggled');
            item.removeAttribute('data-drag-is-above');
        });

        const idMap = this.applyCheckpointOrderFromElements(reordered);

        reordered.forEach(item => {
            const oldId = item.dataset.checkpointId;
            const newId = idMap.get(oldId) || oldId;
            if (newId !== oldId) {
                item.dataset.checkpointId = newId;
                const labelEl = item.querySelector('.checkpoint-label');
                if (labelEl) {
                    labelEl.textContent = newId;
                }
            }
        });

        const pointerClientX = event.clientX ?? state.lastX;
        const pointerClientY = event.clientY ?? state.lastY;
        const offsetX = (pointerClientX ?? state.startX) - state.startX;
        const offsetY = (pointerClientY ?? state.startY) - state.startY;

        state.draggedItem.style.transition = 'none';

        requestAnimationFrame(() => {
            const rect = state.draggedItem.getBoundingClientRect();
            const yDiff = state.prevRect.top - rect.top;
            const xDiff = state.prevRect.left - rect.left;

            state.draggedItem.style.transform = `translate(${offsetX + xDiff}px, ${offsetY + yDiff}px)`;

            requestAnimationFrame(() => {
                state.draggedItem.style.transition = 'transform 0.26s cubic-bezier(0.34, 1.56, 0.64, 1)';
                state.draggedItem.style.transform = 'translate(0px, 0px)';
                state.draggedItem.addEventListener('transitionend', () => {
                    this.resetCheckpointDragState(state);
                    this.updateCheckpointsCard();
                }, { once: true });
            });
        });

        this.unlockCheckpointScroll();
        this.render();
    };

    LevelEditor.prototype.computeCheckpointItemsGap = function computeCheckpointItemsGap(state) {
        if (!state || state.idleItems.length <= 1) {
            return 0;
        }

        const firstRect = state.idleItems[0].getBoundingClientRect();
        const secondRect = state.idleItems[1].getBoundingClientRect();
        return Math.abs(firstRect.bottom - secondRect.top);
    };

    LevelEditor.prototype.applyCheckpointOrderFromElements = function applyCheckpointOrderFromElements(elements) {
        const idToCheckpoint = new Map(this.editorState.checkpoints.map(cp => [cp.id, cp]));
        const orderedCheckpoints = [];

        elements.forEach(el => {
            const checkpointId = el.dataset.checkpointId;
            const checkpoint = idToCheckpoint.get(checkpointId);
            if (checkpoint) {
                orderedCheckpoints.push(checkpoint);
            }
        });

        if (orderedCheckpoints.length !== elements.length) {
            return new Map(elements.map(el => {
                const checkpointId = el.dataset.checkpointId;
                return [checkpointId, checkpointId];
            }));
        }

        const idMap = new Map();
        orderedCheckpoints.forEach((checkpoint, index) => {
            const oldId = checkpoint.id;
            const newId = `CP${index + 1}`;
            idMap.set(oldId, newId);
        });

        orderedCheckpoints.forEach(checkpoint => {
            const newId = idMap.get(checkpoint.id);
            if (newId) {
                checkpoint.id = newId;
            }
        });

        this.editorState.checkpoints = orderedCheckpoints;
        this.editorState.selectedCheckpoints = this.editorState.selectedCheckpoints
            .map(id => idMap.get(id) || id)
            .filter((id, index, arr) => id && arr.indexOf(id) === index);

        this.markUnsavedChanges();

        return idMap;
    };

    LevelEditor.prototype.resetCheckpointDragState = function resetCheckpointDragState(state) {
        const dragState = state || this._checkpointDragState;
        if (!dragState) {
            return;
        }

        if (dragState.draggedItem) {
            dragState.draggedItem.classList.remove('checkpoint-button--dragging');
            dragState.draggedItem.dataset.dragState = 'idle';
            dragState.draggedItem.style.transition = 'transform 0.2s ease, box-shadow 0.2s ease, background-color 0.2s ease';
            dragState.draggedItem.style.transform = 'translate(0px, 0px)';
            dragState.draggedItem.style.zIndex = '';
            delete dragState.draggedItem.dataset.dragIndex;
        }

        (dragState.idleItems || []).forEach(item => {
            item.removeAttribute('data-drag-is-above');
            item.removeAttribute('data-drag-is-toggled');
            item.dataset.dragState = 'idle';
            item.style.transform = 'translateY(0px)';
            item.style.transition = 'transform 0.2s ease, box-shadow 0.2s ease, background-color 0.2s ease';
            delete item.dataset.dragIndex;
        });

        this.unlockCheckpointScroll();

        this._checkpointDragState = null;
    };

    LevelEditor.prototype.lockCheckpointScroll = function lockCheckpointScroll() {
        if (this._checkpointScrollLocked) {
            return;
        }

        this._checkpointScrollLocked = true;
        this._checkpointScrollLockStyles = {
            overflow: document.body.style.overflow,
            touchAction: document.body.style.touchAction,
            userSelect: document.body.style.userSelect
        };

        document.body.style.overflow = 'hidden';
        document.body.style.touchAction = 'none';
        document.body.style.userSelect = 'none';
    };

    LevelEditor.prototype.unlockCheckpointScroll = function unlockCheckpointScroll() {
        if (!this._checkpointScrollLocked) {
            return;
        }

        const styles = this._checkpointScrollLockStyles || {};
        document.body.style.overflow = styles.overflow || '';
        document.body.style.touchAction = styles.touchAction || '';
        document.body.style.userSelect = styles.userSelect || '';

        this._checkpointScrollLocked = false;
        this._checkpointScrollLockStyles = null;
    };
}



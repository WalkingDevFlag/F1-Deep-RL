export function applyHudMixin(LevelEditor) {
    LevelEditor.prototype.createHUD = function createHUD() {
    if (!this.header && this.container) {
        const header = document.createElement('div');
        header.className = 'editor-header';

        const titleEl = document.createElement('span');
        titleEl.className = 'editor-header__title ui-card__title';
        titleEl.textContent = 'Level Editor';

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
    trackNameRow.style.cursor = 'pointer';
    trackNameRow.title = 'Click to rename track';

    // Make track name editable
    trackNameRow.addEventListener('click', () => {
        this.makeTrackNameEditable(trackNameRow);
    });

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
        const headerSuffix = this.editorState.startLine ? ' (start ready)' : '';
        this.headerTitleEl.textContent = `${baseName}${headerSuffix}`;
    }
    };

    LevelEditor.prototype.makeTrackNameEditable = function makeTrackNameEditable(trackNameElement) {
        if (!this.currentMeta) {
            this.showToast('No track loaded', 'warning');
            return;
        }

        const currentName = this.currentMeta.name || 'Unknown Track';
        const input = document.createElement('input');
        input.type = 'text';
        input.value = currentName;
        input.className = 'ui-row';
        input.style.fontWeight = '600';
        input.style.fontSize = '15px';
        input.style.border = '2px solid var(--hud-accent)';
        input.style.borderRadius = '4px';
        input.style.padding = '2px 4px';
        input.style.background = 'var(--hud-surface)';
        input.style.color = 'var(--hud-text)';
        input.style.width = '100%';
        input.style.boxSizing = 'border-box';

        // Replace the text with input
        const parent = trackNameElement.parentNode;
        parent.replaceChild(input, trackNameElement);

        input.focus();
        input.select();

        const finishEditing = () => {
            const newName = input.value.trim();
            if (newName && newName !== currentName) {
                // Update the track name
                this.currentMeta.name = newName;
                this.updateTrackLabel(newName);
                this.markUnsavedChanges();
                this.showToast('Track renamed', 'success');
            } else {
                // Restore original name if empty or unchanged
                this.updateTrackLabel(currentName);
            }
            // Replace input back with text element
            parent.replaceChild(trackNameElement, input);
        };

        input.addEventListener('blur', finishEditing);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                finishEditing();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                // Cancel editing - restore original
                this.updateTrackLabel(currentName);
                parent.replaceChild(trackNameElement, input);
            }
        });
    };
}

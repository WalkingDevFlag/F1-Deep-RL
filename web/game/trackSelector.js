const state = {
    modal: null,
    content: null,
    list: null,
    errorBanner: null,
    escListener: null,
    returnFocus: null,
    initialized: false
};

export function initializeTrackSelector() {
    if (!state.modal) {
        state.modal = document.getElementById('track-selector-modal');
        if (!state.modal) {
            return;
        }
    }

    if (!state.content) {
        state.content = state.modal.querySelector('.editor-modal__content');
    }

    if (!state.list) {
        state.list = state.modal.querySelector('[data-track-selector-list]');
    }

    if (!state.errorBanner) {
        state.errorBanner = state.modal.querySelector('[data-track-selector-error]');
    }

    if (!state.initialized) {
        attachModalHandlers();
        state.initialized = true;
    }

    attachOpenButtonHandlers();
}

export function openTrackSelectorModal(options = {}) {
    initializeTrackSelector();
    if (!state.modal) {
        return;
    }

    if (!state.modal.hidden && state.modal.classList.contains('is-open')) {
        return;
    }

    const { returnFocus = null } = options;
    state.returnFocus = returnFocus instanceof HTMLElement ? returnFocus : null;

    clearError();
    renderLoadingState();

    state.modal.hidden = false;
    state.modal.setAttribute('aria-hidden', 'false');

    requestAnimationFrame(() => {
        state.modal.classList.add('is-open');
        if (state.content instanceof HTMLElement) {
            state.content.focus({ preventScroll: true });
        }
    });

    if (!state.escListener) {
        state.escListener = (event) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                closeTrackSelectorModal();
            }
        };
        document.addEventListener('keydown', state.escListener);
    }

    fetchTrackList();
}

export function closeTrackSelectorModal() {
    if (!state.modal || state.modal.hidden) {
        return;
    }

    state.modal.classList.remove('is-open');
    state.modal.setAttribute('aria-hidden', 'true');

    const hide = () => {
        state.modal.hidden = true;
    };

    state.modal.addEventListener('transitionend', hide, { once: true });
    window.setTimeout(() => {
        if (!state.modal.hidden) {
            hide();
        }
    }, 320);

    if (state.escListener) {
        document.removeEventListener('keydown', state.escListener);
        state.escListener = null;
    }

    if (state.returnFocus && typeof state.returnFocus.focus === 'function') {
        state.returnFocus.focus({ preventScroll: true });
    }
    state.returnFocus = null;
}

function attachModalHandlers() {
    if (!state.modal) {
        return;
    }

    state.modal.addEventListener('click', (event) => {
        if (event.target === state.modal) {
            closeTrackSelectorModal();
        }
    });

    if (state.content) {
        state.content.addEventListener('click', (event) => {
            event.stopPropagation();
        });
    }

    const closeButtons = state.modal.querySelectorAll('[data-track-selector-close]');
    closeButtons.forEach((button) => {
        if (!button.dataset.trackSelectorBound) {
            button.addEventListener('click', (event) => {
                event.preventDefault();
                closeTrackSelectorModal();
            });
            button.dataset.trackSelectorBound = 'true';
        }
    });
}

function attachOpenButtonHandlers() {
    const buttons = document.querySelectorAll('[data-dock-action="select-track"]');
    buttons.forEach((button) => {
        if (!button.dataset.trackSelectorBound) {
            button.addEventListener('click', (event) => {
                event.preventDefault();
                openTrackSelectorModal({ returnFocus: button });
            });
            button.dataset.trackSelectorBound = 'true';
        }
    });
}

async function fetchTrackList() {
    if (!state.list) {
        return;
    }

    try {
        clearError();
        const response = await fetch('/tracks/list');
        if (!response.ok) {
            throw new Error(`Request failed with status ${response.status}`);
        }

        const tracks = await response.json();
        if (!Array.isArray(tracks) || tracks.length === 0) {
            renderEmptyState();
            return;
        }

        tracks.sort((a, b) => {
            const nameA = (a && a.name ? a.name : a.id || '').toLowerCase();
            const nameB = (b && b.name ? b.name : b.id || '').toLowerCase();
            return nameA.localeCompare(nameB);
        });

        renderTrackList(tracks);
    } catch (error) {
        console.error('Failed to fetch track list:', error);
        renderErrorState('Failed to load tracks. Try again later.');
    }
}

function renderLoadingState() {
    if (!state.list) {
        return;
    }
    state.list.innerHTML = '<div class="editor-load__loading">Loading tracks...</div>';
}

function renderEmptyState() {
    if (!state.list) {
        return;
    }
    state.list.innerHTML = '<div class="editor-load__empty">No tracks found. Upload one first!</div>';
}

function renderErrorState(message) {
    if (!state.list) {
        return;
    }
    state.list.innerHTML = `<div class="editor-load__error">${escapeHtml(message)}</div>`;
}

function renderTrackList(tracks) {
    if (!state.list) {
        return;
    }

    state.list.innerHTML = '';
    const fragment = document.createDocumentFragment();
    const currentTrackId = window.game && window.game.trackMeta ? window.game.trackMeta.id : null;

    tracks.forEach((track) => {
        if (!track || !track.id) {
            return;
        }

        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'editor-load__item';
        button.dataset.trackId = track.id;

        const nameEl = document.createElement('div');
        nameEl.className = 'editor-load__name';
        nameEl.textContent = track.name || track.id;

        const authorEl = document.createElement('div');
        authorEl.className = 'editor-load__author';
        const authorName = track.author ? `by ${track.author}` : 'Unknown author';
        authorEl.textContent = authorName;

        button.append(nameEl, authorEl);

        if (track.id === currentTrackId) {
            button.classList.add('is-active');
            button.setAttribute('aria-current', 'true');
            nameEl.textContent = `${nameEl.textContent} (Current)`;
        }

        button.addEventListener('click', () => {
            handleTrackSelection(button, track, nameEl);
        });

        fragment.appendChild(button);
    });

    if (!fragment.childNodes.length) {
        renderEmptyState();
        return;
    }

    state.list.appendChild(fragment);
}

function handleTrackSelection(button, track, nameEl) {
    if (!button || !track || !track.id) {
        return;
    }

    if (button.dataset.loading === 'true') {
        return;
    }

    if (!window.game || typeof window.game.loadTrackById !== 'function') {
        showError('Simulator is still loading. Try again in a moment.');
        return;
    }

    clearError();

    const originalLabel = nameEl ? nameEl.textContent : button.textContent;
    button.dataset.loading = 'true';
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    if (nameEl) {
        nameEl.textContent = `${track.name || track.id} (Loading…)`;
    }

    window.game.loadTrackById(track.id)
        .then(() => {
            closeTrackSelectorModal();
        })
        .catch((error) => {
            console.error('Failed to load selected track:', error);
            if (nameEl) {
                nameEl.textContent = originalLabel;
            }
            button.disabled = false;
            button.removeAttribute('aria-busy');
            delete button.dataset.loading;
            showError(`Failed to load track. ${error && error.message ? error.message : ''}`.trim());
        });
}

function clearError() {
    if (!state.errorBanner) {
        return;
    }
    state.errorBanner.textContent = '';
    state.errorBanner.hidden = true;
}

function showError(message) {
    if (!state.errorBanner) {
        return;
    }
    state.errorBanner.textContent = message;
    state.errorBanner.hidden = false;
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

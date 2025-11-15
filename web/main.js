import Game from './game/game.js';
import { initializeEditorModal } from './game/editorModal.js';
import { initializeTrackSelector } from './game/trackSelector.js';

window.addEventListener('DOMContentLoaded', () => {
    initializeEditorModal();
    initializeTrackSelector();
});

window.addEventListener('load', () => {
    const game = new Game();
    game.init();
    window.game = game;
});

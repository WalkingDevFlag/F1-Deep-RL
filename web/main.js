import Game from './game/game.js';
import { initializeEditorModal } from './game/editorModal.js';

window.addEventListener('DOMContentLoaded', () => {
    initializeEditorModal();
});

window.addEventListener('load', () => {
    const game = new Game();
    game.init();
    window.game = game;
});

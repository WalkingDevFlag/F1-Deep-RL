export function applyEventMixin(Game) {
    Game.prototype.setupEventListeners = function setupEventListeners() {
        document.addEventListener('keydown', (event) => {
            if (event.code === 'KeyR') {
                this.resetCar();
            }
            if (event.code === 'KeyC' && this.camera) {
                this.camera.toggleMode();
            }
        });

        window.addEventListener('resize', () => {
            this.canvas.width = window.innerWidth;
            this.canvas.height = window.innerHeight;
            if (this.camera) {
                this.camera.setCanvasSize(this.canvas.width, this.canvas.height);
            }
        });
    };
}

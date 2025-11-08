// Controls handler

class Controls {
    constructor() {
        this.keys = {};
        this.setupEventListeners();
    }

    setupEventListeners() {
        document.addEventListener('keydown', (e) => {
            this.keys[e.code] = true;
        });

        document.addEventListener('keyup', (e) => {
            this.keys[e.code] = false;
        });
    }

    getKeys() {
        return this.keys;
    }

    isReset() {
        return this.keys['KeyR'];
    }

    clearResetFlag() {
        this.keys['KeyR'] = false;
    }
}

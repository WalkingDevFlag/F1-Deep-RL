(function (global) {
    const existing = global.UIKit || {};

    function toClassList(value) {
        if (!value) {
            return [];
        }
        if (Array.isArray(value)) {
            return value.filter(Boolean);
        }
        if (typeof value === 'string') {
            return value.split(' ').map((token) => token.trim()).filter(Boolean);
        }
        return [];
    }

    existing.utils = Object.assign({}, existing.utils, { toClassList });

    global.UIKit = existing;
})(window);

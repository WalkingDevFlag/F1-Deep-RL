(function (global) {
    // Aggregate module to ensure UIKit base is initialised and provide a single import point.
    const UIKit = global.UIKit || {};

    if (!UIKit.utils || typeof UIKit.utils.toClassList !== 'function') {
        throw new Error('UIKit utils are not available. Load ui/base.js before ui/ui.js');
    }

    global.UIKit = UIKit;
})(window);

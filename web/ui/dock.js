(function (global) {
    const UIKit = global.UIKit || {};
    const { toClassList } = (UIKit.utils) || {};

    if (typeof toClassList !== 'function') {
        throw new Error('UIKit.utils.toClassList is not defined. Load base.js before dock.js');
    }

    function createDock(options = {}) {
        const { classNames = [], label = 'Simulator dock', align = 'bottom' } = options;
        const dock = document.createElement('nav');
        dock.className = 'ui-dock';
        dock.dataset.align = align;
        dock.setAttribute('role', 'toolbar');
        dock.setAttribute('aria-label', label);
        toClassList(classNames).forEach((cls) => dock.classList.add(cls));

        const itemsContainer = document.createElement('div');
        itemsContainer.className = 'ui-dock__items';
        dock.appendChild(itemsContainer);

        function add(item) {
            if (!item) {
                return;
            }
            const element = item && item.element instanceof Element ? item.element : item;
            if (element instanceof Element) {
                itemsContainer.appendChild(element);
            }
        }

        function addMany(items = []) {
            items.forEach((item) => add(item));
        }

        function clear() {
            itemsContainer.innerHTML = '';
        }

        return {
            element: dock,
            container: itemsContainer,
            add,
            addMany,
            clear,
        };
    }

    UIKit.createDock = createDock;

    global.UIKit = UIKit;
})(window);

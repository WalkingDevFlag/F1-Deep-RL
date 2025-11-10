(function (global) {
    const UIKit = global.UIKit || {};
    const { toClassList } = UIKit.utils || {};

    if (typeof toClassList !== 'function') {
        throw new Error('UIKit.utils.toClassList is not defined. Load base.js first.');
    }

    function createCard(options = {}) {
        const { title = '', overlay = false, classNames = [] } = options;
        const card = document.createElement('section');
        card.className = 'ui-card';
        if (overlay) {
            card.classList.add('ui-card--overlay');
        }
        toClassList(classNames).forEach((cls) => card.classList.add(cls));

        if (title) {
            const heading = document.createElement('h2');
            heading.className = 'ui-card__title';
            heading.textContent = title;
            card.appendChild(heading);
        }

        const body = document.createElement('div');
        body.className = 'ui-card__body';
        card.appendChild(body);

        function add(item) {
            if (!item) {
                return;
            }
            const element = item && item.element instanceof Element ? item.element : item;
            if (element instanceof Element) {
                body.appendChild(element);
            }
        }

        function addMany(items = []) {
            items.forEach((item) => add(item));
        }

        return {
            element: card,
            body,
            add,
            addMany,
        };
    }

    UIKit.createCard = createCard;

    global.UIKit = UIKit;
})(window);

(function (global) {
    const UIKit = global.UIKit || {};
    const { toClassList } = (UIKit.utils) || {};

    if (typeof toClassList !== 'function') {
        throw new Error('UIKit.utils.toClassList is not defined. Load base.js before dock-button.js');
    }

    function createDockButton(options = {}) {
        const {
            label = '',
            tooltip = label,
            icon = null,
            onClick,
            classNames = [],
        } = options;

        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'ui-dock__button';
        button.setAttribute('aria-label', tooltip || label || 'Dock control');
        toClassList(classNames).forEach((cls) => button.classList.add(cls));

        const iconContainer = document.createElement('span');
        iconContainer.className = 'ui-dock__icon';
        if (icon instanceof Element) {
            iconContainer.appendChild(icon);
        } else if (typeof icon === 'string') {
            iconContainer.innerHTML = icon;
        } else if (typeof icon === 'function') {
            const generated = icon();
            if (generated instanceof Element) {
                iconContainer.appendChild(generated);
            }
        }

        const tooltipEl = document.createElement('span');
        tooltipEl.className = 'ui-dock__tooltip';
        tooltipEl.textContent = tooltip || label;

        button.append(iconContainer, tooltipEl);

        if (typeof onClick === 'function') {
            button.addEventListener('click', (event) => {
                event.preventDefault();
                onClick();
            });
        }

        function setTooltip(nextTooltip) {
            const resolved = nextTooltip || label || 'Dock control';
            tooltipEl.textContent = resolved;
            button.setAttribute('aria-label', resolved);
        }

        function setIcon(nextIcon) {
            iconContainer.innerHTML = '';
            if (nextIcon instanceof Element) {
                iconContainer.appendChild(nextIcon);
            } else if (typeof nextIcon === 'string') {
                iconContainer.innerHTML = nextIcon;
            }
        }

        return {
            element: button,
            iconEl: iconContainer,
            tooltipEl,
            setTooltip,
            setIcon,
        };
    }

    UIKit.createDockButton = createDockButton;

    global.UIKit = UIKit;
})(window);

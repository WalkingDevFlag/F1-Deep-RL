(function (global) {
    // Lightweight UI helper utilities for composing HUD controls.
    const UIKit = {};

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

    UIKit.createCard = function createCard(options = {}) {
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
    };

    UIKit.createStatRow = function createStatRow(options = {}) {
        const { label = '', value = '' } = options;
        const row = document.createElement('div');
        row.className = 'ui-row ui-row--stat';

        const labelEl = document.createElement('span');
        labelEl.className = 'ui-row__label';
        labelEl.textContent = label;

        const valueEl = document.createElement('span');
        valueEl.className = 'ui-row__value';
        valueEl.textContent = value;

        row.append(labelEl, valueEl);

        function setValue(nextValue) {
            valueEl.textContent = `${nextValue}`;
        }

        return {
            element: row,
            labelEl,
            valueEl,
            setValue,
        };
    };

    UIKit.createToggleRow = function createToggleRow(options = {}) {
        const { label = '', initial = true, onToggle } = options;

        const row = document.createElement('div');
        row.className = 'ui-row ui-row--toggle';

        const labelEl = document.createElement('span');
        labelEl.className = 'ui-row__label';
        labelEl.textContent = label;

        const container = document.createElement('div');
        container.className = 'ui-toggle__container';

        const statusEl = document.createElement('span');
        statusEl.className = 'ui-toggle__status';

        const switchEl = document.createElement('label');
        switchEl.className = 'ui-switch';
        if (label) {
            switchEl.setAttribute('aria-label', `Toggle ${label}`);
        }

        const inputEl = document.createElement('input');
        inputEl.type = 'checkbox';
        inputEl.className = 'ui-toggle';

        const sliderEl = document.createElement('span');
        sliderEl.className = 'ui-slider';

        switchEl.append(inputEl, sliderEl);
        container.append(statusEl, switchEl);
        row.append(labelEl, container);

        function updateStatus(checked) {
            statusEl.textContent = checked ? 'On' : 'Off';
        }

        function setChecked(checked, optionsSet = {}) {
            const normalized = Boolean(checked);
            const silent = Boolean(optionsSet.silent);
            const previous = inputEl.checked;
            inputEl.checked = normalized;
            updateStatus(normalized);
            if (!silent && previous !== normalized && typeof onToggle === 'function') {
                onToggle(normalized);
            }
        }

        inputEl.addEventListener('change', () => {
            const normalized = inputEl.checked;
            updateStatus(normalized);
            if (typeof onToggle === 'function') {
                onToggle(normalized);
            }
        });

        setChecked(initial, { silent: true });

        return {
            element: row,
            inputEl,
            statusEl,
            setChecked,
            getChecked: () => inputEl.checked,
        };
    };

    global.UIKit = UIKit;
})(window);

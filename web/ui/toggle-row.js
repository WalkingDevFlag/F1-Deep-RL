(function (global) {
    const UIKit = global.UIKit || {};

    function createToggleRow(options = {}) {
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
    }

    UIKit.createToggleRow = createToggleRow;

    global.UIKit = UIKit;
})(window);

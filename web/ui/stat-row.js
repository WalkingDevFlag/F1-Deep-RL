(function (global) {
    const UIKit = global.UIKit || {};

    function createStatRow(options = {}) {
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
    }

    UIKit.createStatRow = createStatRow;

    global.UIKit = UIKit;
})(window);

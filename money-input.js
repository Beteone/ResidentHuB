/* Explicitly marked money fields only. Stored values stay numeric. */
(function (global) {
    function parse(value) {
        if (typeof value === 'number') return value;
        var raw = String(value == null ? '' : value).replace(/\./g, '').replace(',', '.');
        return raw === '' ? 0 : Number(raw);
    }
    function format(value) {
        var parts = String(value).replace(/\./g, '').split(',');
        var whole = parts[0].replace(/[^\d-]/g, '');
        return whole.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + (parts.length > 1 ? ',' + parts[1].replace(/\D/g, '') : '');
    }
    function decorate(input) {
        if (input.dataset.moneyReady) return;
        input.dataset.moneyReady = '1';
        input.type = 'text'; input.inputMode = 'decimal';
        if (!/^\d{1,3}(\.\d{3})+(,\d*)?$/.test(input.value)) input.value = format(input.value.replace('.', ','));
    }
    function scan(root) {
        if (root.matches && root.matches('input[data-money]')) decorate(root);
        if (root.querySelectorAll) root.querySelectorAll('input[data-money]').forEach(decorate);
    }
    function inputEvent(event) {
        var input = event.target;
        if (!input.matches('input[data-money]') || event.isComposing) return;
        var before = input.value.slice(0, input.selectionStart).replace(/\./g, '').length;
        input.value = format(input.value);
        var pos = 0, count = 0;
        while (pos < input.value.length && count < before) { if (input.value[pos] !== '.') count++; pos++; }
        input.setSelectionRange(pos, pos);
        var number = parse(input.value);
        input.setCustomValidity(!Number.isFinite(number) || number < 0 ? 'Số tiền phải là số không âm.' : '');
    }
    global.RHMoney = { parse: parse, format: format, scan: scan };
    if (global.document) {
        document.addEventListener('beforeinput', function (event) {
            var input = event.target;
            if (!input.matches('input[data-money]') || input.selectionStart !== input.selectionEnd) return;
            var pos = input.selectionStart, backward = event.inputType === 'deleteContentBackward';
            if ((backward && input.value[pos - 1] === '.') || (event.inputType === 'deleteContentForward' && input.value[pos] === '.')) {
                event.preventDefault();
                var from = backward ? pos - 2 : pos, to = backward ? pos : pos + 2;
                input.value = input.value.slice(0, from) + input.value.slice(to);
                input.setSelectionRange(Math.max(0, from), Math.max(0, from));
                input.dispatchEvent(new Event('input', { bubbles:true }));
            }
        }, true);
        document.addEventListener('input', inputEvent, true);
        document.addEventListener('DOMContentLoaded', function () {
            scan(document);
            new MutationObserver(function (records) { records.forEach(function (r) { r.addedNodes.forEach(scan); }); }).observe(document.body, { childList:true, subtree:true });
        });
    }
})(window);

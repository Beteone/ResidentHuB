/*
 * ResidentHub - shared searchable dropdown (RHSelect).
 * One component for every "pick a record" field (Người quản lý, Tòa nhà, Căn hộ,
 * Hồ sơ cư dân...). Options are never hard-coded: the caller passes an
 * options() function that reads the live data stores, and it is re-read every
 * time the dropdown opens, so edits made elsewhere (another tab, another
 * module) show up without re-creating the field.
 *
 *   var field = RHSelect.create(containerEl, {
 *       inputId: 'bfManager',                 // hidden <input> holding the value
 *       options: function () { return [{ value, label, sub, keywords }] },
 *       value: 'u-1',
 *       placeholder: 'Chọn người quản lý',
 *       searchPlaceholder: 'Tìm theo tên, email...',
 *       clearable: true,
 *       theme: 'light' | 'dark',
 *       onChange: function (value, option) {}
 *   });
 *   field.getValue() / setValue(v) / setDisabled(b) / refresh() / destroy()
 */
(function (global) {
    var STYLE_ID = 'rhSelectStyles';
    var openInstance = null;

    var CSS = [
        // contain:inline-size — a long selected label must never widen the
        // surrounding grid/flex column; it ellipsizes instead.
        '.rh-ss{contain:inline-size;min-width:0;position:relative;width:100%;font:inherit}',
        '.rh-ss-trigger{align-items:center;background:#fff;border:1px solid var(--line,#e4eaf2);border-radius:8px;color:#10213c;cursor:pointer;display:flex;font:inherit;gap:.5rem;min-height:42px;padding:.45rem .6rem .45rem .75rem;text-align:left;width:100%}',
        '.rh-ss-trigger:focus-visible,.rh-ss.open .rh-ss-trigger{border-color:#1683ff;box-shadow:0 0 0 3px rgba(22,131,255,.12);outline:none}',
        '.rh-ss.disabled .rh-ss-trigger{background:#f8fafc;color:#94a3b8;cursor:not-allowed}',
        '.rh-ss-value{flex:1;min-width:0}',
        '.rh-ss-label{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
        '.rh-ss-sub{color:#94a3b8;display:block;font-size:.75rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
        '.rh-ss-placeholder{color:#94a3b8}',
        '.rh-ss-icon{align-items:center;border-radius:6px;color:#94a3b8;display:inline-flex;flex:0 0 auto;height:24px;justify-content:center;width:24px}',
        '.rh-ss-clear:hover{background:#f1f5f9;color:#ef4444}',
        '.rh-ss-chevron{transition:transform .15s ease}.rh-ss.open .rh-ss-chevron{transform:rotate(180deg)}',
        '.rh-ss-panel{background:#fff;border:1px solid #d6e4f3;border-radius:12px;box-shadow:0 18px 40px rgba(11,36,71,.16);display:none;left:0;margin-top:6px;overflow:hidden;position:absolute;right:0;top:100%;z-index:400}',
        '.rh-ss.up .rh-ss-panel{bottom:100%;margin:0 0 6px;top:auto}',
        '.rh-ss.open .rh-ss-panel{display:block}',
        '.rh-ss-search{border-bottom:1px solid #edf2f7;padding:.5rem;position:relative}',
        '.rh-ss-search svg{color:#94a3b8;left:1.05rem;pointer-events:none;position:absolute;top:50%;transform:translateY(-50%)}',
        '.rh-ss-search input{background:#f5f8fc;border:1px solid transparent;border-radius:8px;color:#10213c;font:inherit;font-size:.88rem;height:36px;outline:none;padding:0 .75rem 0 2.1rem;width:100%}',
        '.rh-ss-search input:focus{background:#fff;border-color:#1683ff}',
        '.rh-ss-list{list-style:none;margin:0;max-height:240px;overflow-y:auto;padding:.3rem;overscroll-behavior:contain}',
        '.rh-ss-option{border-radius:8px;cursor:pointer;padding:.5rem .65rem}',
        '.rh-ss-option.active{background:#eaf3ff}',
        '.rh-ss-option.selected .rh-ss-label{color:#0d65d5;font-weight:700}',
        '.rh-ss-option mark{background:#fff1b8;border-radius:2px;color:inherit;padding:0}',
        '.rh-ss-empty{color:#94a3b8;font-size:.85rem;padding:1rem .75rem;text-align:center}',
        '.rh-ss-count{border-top:1px solid #edf2f7;color:#94a3b8;font-size:.72rem;padding:.35rem .75rem}',
        /* dark variant — the landing-page signup modal */
        '.rh-ss--dark .rh-ss-trigger{background:rgba(255,255,255,.07);border-color:rgba(255,255,255,.15);color:#fff;min-height:44px}',
        '.rh-ss--dark .rh-ss-trigger:focus-visible,.rh-ss--dark.open .rh-ss-trigger{border-color:#00b4d8;box-shadow:0 0 0 3px rgba(0,180,216,.12)}',
        '.rh-ss--dark.disabled .rh-ss-trigger{background:rgba(255,255,255,.03);color:#6b7a90}',
        '.rh-ss--dark .rh-ss-placeholder,.rh-ss--dark .rh-ss-sub,.rh-ss--dark .rh-ss-icon{color:#8d99ae}',
        '.rh-ss--dark .rh-ss-clear:hover{background:rgba(255,255,255,.08);color:#fca5a5}',
        '.rh-ss--dark .rh-ss-panel{background:#1c2541;border-color:rgba(255,255,255,.14);box-shadow:0 18px 40px rgba(0,0,0,.4)}',
        '.rh-ss--dark .rh-ss-search,.rh-ss--dark .rh-ss-count{border-color:rgba(255,255,255,.08)}',
        '.rh-ss--dark .rh-ss-search input{background:rgba(255,255,255,.06);color:#fff}',
        '.rh-ss--dark .rh-ss-search input:focus{background:rgba(255,255,255,.1);border-color:#00b4d8}',
        '.rh-ss--dark .rh-ss-option{color:#e2e8f0}',
        '.rh-ss--dark .rh-ss-option.active{background:rgba(0,180,216,.16)}',
        '.rh-ss--dark .rh-ss-option.selected .rh-ss-label{color:#5fd4ec}',
        '.rh-ss--dark .rh-ss-option mark{background:rgba(255,214,102,.3)}',
        '.rh-ss--dark .rh-ss-empty,.rh-ss--dark .rh-ss-count{color:#8d99ae}'
    ].join('\n');

    var ICON_CHEVRON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>';
    var ICON_CLEAR = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>';
    var ICON_SEARCH = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>';

    function ensureStyles() {
        if (document.getElementById(STYLE_ID)) return;
        var style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = CSS;
        document.head.appendChild(style);
    }

    function escapeHtml(str) {
        return String(str == null ? '' : str).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    // Accent-insensitive so "hoa" finds "Hoà"/"Hòa" and "duc" finds "Đức".
    function fold(str) {
        return String(str == null ? '' : str).normalize('NFD').replace(/[̀-ͯ]/g, '')
            .replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
    }

    // Highlights the first match of the query in text. Folding keeps a 1:1
    // character mapping for Vietnamese after NFC re-composition, so indexes
    // from the folded string line up with the original.
    function highlight(text, query) {
        text = String(text == null ? '' : text);
        if (!query) return escapeHtml(text);
        var composed = text.normalize('NFC');
        var folded = Array.prototype.map.call(composed, function (ch) { return fold(ch).charAt(0) || ch; }).join('');
        var idx = folded.indexOf(query);
        if (idx === -1) return escapeHtml(composed);
        return escapeHtml(composed.slice(0, idx)) + '<mark>' + escapeHtml(composed.slice(idx, idx + query.length)) + '</mark>' + escapeHtml(composed.slice(idx + query.length));
    }

    function create(container, config) {
        ensureStyles();
        var cfg = Object.assign({
            placeholder: '— Chọn —',
            searchPlaceholder: 'Tìm kiếm...',
            emptyText: 'Không tìm thấy kết quả',
            noOptionsText: 'Chưa có dữ liệu',
            clearable: true,
            disabled: false,
            theme: 'light',
            value: ''
        }, config || {});

        var value = cfg.value || '';
        var disabled = !!cfg.disabled;
        var cache = [];          // options as of the last read
        var filtered = [];
        var activeIndex = -1;

        var root = document.createElement('div');
        root.className = 'rh-ss' + (cfg.theme === 'dark' ? ' rh-ss--dark' : '');
        root.innerHTML =
            '<input type="hidden"' + (cfg.inputId ? ' id="' + escapeHtml(cfg.inputId) + '"' : '') + (cfg.name ? ' name="' + escapeHtml(cfg.name) + '"' : '') + '>' +
            '<button type="button" class="rh-ss-trigger" aria-haspopup="listbox" aria-expanded="false"' + (cfg.ariaLabel ? ' aria-label="' + escapeHtml(cfg.ariaLabel) + '"' : '') + '>' +
            '<span class="rh-ss-value"></span>' +
            '<span class="rh-ss-icon rh-ss-clear" role="button" aria-label="Xoá lựa chọn" title="Xoá lựa chọn" style="display:none">' + ICON_CLEAR + '</span>' +
            '<span class="rh-ss-icon rh-ss-chevron">' + ICON_CHEVRON + '</span>' +
            '</button>' +
            '<div class="rh-ss-panel">' +
            '<div class="rh-ss-search">' + ICON_SEARCH + '<input type="text" autocomplete="off" spellcheck="false" placeholder="' + escapeHtml(cfg.searchPlaceholder) + '"></div>' +
            '<ul class="rh-ss-list" role="listbox"></ul>' +
            '<div class="rh-ss-count" style="display:none"></div>' +
            '</div>';
        container.innerHTML = '';
        container.appendChild(root);

        var hidden = root.querySelector('input[type=hidden]');
        var trigger = root.querySelector('.rh-ss-trigger');
        var valueEl = root.querySelector('.rh-ss-value');
        var clearEl = root.querySelector('.rh-ss-clear');
        var searchEl = root.querySelector('.rh-ss-search input');
        var listEl = root.querySelector('.rh-ss-list');
        var countEl = root.querySelector('.rh-ss-count');

        function readOptions() {
            var raw = typeof cfg.options === 'function' ? cfg.options() : (cfg.options || []);
            cache = (raw || []).map(function (o) {
                return {
                    value: String(o.value),
                    label: o.label == null ? '' : String(o.label),
                    sub: o.sub == null ? '' : String(o.sub),
                    data: o.data,
                    haystack: fold([o.label, o.sub].concat(o.keywords || []).join(' '))
                };
            });
            return cache;
        }

        function findOption(v) {
            for (var i = 0; i < cache.length; i++) if (cache[i].value === v) return cache[i];
            return null;
        }

        function renderValue() {
            var opt = value ? findOption(value) : null;
            hidden.value = value;
            if (opt) {
                valueEl.innerHTML = '<span class="rh-ss-label">' + escapeHtml(opt.label) + '</span>' + (opt.sub ? '<span class="rh-ss-sub">' + escapeHtml(opt.sub) + '</span>' : '');
            } else {
                valueEl.innerHTML = '<span class="rh-ss-label rh-ss-placeholder">' + escapeHtml(cfg.placeholder) + '</span>';
            }
            clearEl.style.display = (cfg.clearable && value && !disabled) ? '' : 'none';
            root.classList.toggle('disabled', disabled);
            trigger.disabled = disabled;
        }

        function renderList() {
            var q = fold(searchEl.value.trim());
            filtered = q ? cache.filter(function (o) { return o.haystack.indexOf(q) !== -1; }) : cache.slice();
            if (!filtered.length) {
                listEl.innerHTML = '<li class="rh-ss-empty">' + escapeHtml(cache.length ? cfg.emptyText : cfg.noOptionsText) + '</li>';
                countEl.style.display = 'none';
                activeIndex = -1;
                return;
            }
            if (activeIndex >= filtered.length || activeIndex < 0) {
                var sel = filtered.map(function (o) { return o.value; }).indexOf(value);
                activeIndex = sel === -1 ? 0 : sel;
            }
            listEl.innerHTML = filtered.map(function (o, i) {
                return '<li class="rh-ss-option' + (i === activeIndex ? ' active' : '') + (o.value === value ? ' selected' : '') + '" role="option" aria-selected="' + (o.value === value) + '" data-index="' + i + '">' +
                    '<span class="rh-ss-label">' + highlight(o.label, q) + '</span>' +
                    (o.sub ? '<span class="rh-ss-sub">' + highlight(o.sub, q) + '</span>' : '') +
                    '</li>';
            }).join('');
            countEl.textContent = q ? filtered.length + ' / ' + cache.length + ' kết quả' : cache.length + ' lựa chọn';
            countEl.style.display = cache.length > 6 ? '' : 'none';
        }

        function scrollActiveIntoView() {
            var el = listEl.querySelector('.rh-ss-option.active');
            if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
        }

        function setActive(i) {
            if (!filtered.length) return;
            activeIndex = (i + filtered.length) % filtered.length;
            Array.prototype.forEach.call(listEl.querySelectorAll('.rh-ss-option'), function (el) {
                el.classList.toggle('active', Number(el.getAttribute('data-index')) === activeIndex);
            });
            scrollActiveIntoView();
        }

        function open() {
            if (disabled || root.classList.contains('open')) return;
            if (openInstance && openInstance !== api) openInstance.close();
            openInstance = api;
            readOptions();
            searchEl.value = '';
            activeIndex = -1;
            renderList();
            // Open upward when the field sits near the bottom of the viewport.
            var rect = trigger.getBoundingClientRect();
            var below = (global.innerHeight || document.documentElement.clientHeight) - rect.bottom;
            root.classList.toggle('up', below < 320 && rect.top > below);
            root.classList.add('open');
            trigger.setAttribute('aria-expanded', 'true');
            searchEl.focus();
            scrollActiveIntoView();
        }

        function close(focusTrigger) {
            if (!root.classList.contains('open')) return;
            root.classList.remove('open');
            trigger.setAttribute('aria-expanded', 'false');
            if (openInstance === api) openInstance = null;
            if (focusTrigger) trigger.focus();
        }

        function commit(v, silent) {
            v = v == null ? '' : String(v);
            var changed = v !== value;
            value = v;
            renderValue();
            if (changed && !silent && typeof cfg.onChange === 'function') cfg.onChange(value, findOption(value));
        }

        trigger.addEventListener('click', function (ev) {
            if (ev.target.closest('.rh-ss-clear')) {
                ev.preventDefault();
                commit('');
                close();
                return;
            }
            root.classList.contains('open') ? close() : open();
        });
        trigger.addEventListener('keydown', function (ev) {
            if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') { ev.preventDefault(); open(); }
        });
        searchEl.addEventListener('input', function () { activeIndex = 0; renderList(); listEl.scrollTop = 0; });
        searchEl.addEventListener('keydown', function (ev) {
            if (ev.key === 'ArrowDown') { ev.preventDefault(); setActive(activeIndex + 1); }
            else if (ev.key === 'ArrowUp') { ev.preventDefault(); setActive(activeIndex - 1); }
            else if (ev.key === 'Enter') {
                ev.preventDefault();
                if (filtered[activeIndex]) { commit(filtered[activeIndex].value); close(true); }
            } else if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); close(true); }
            else if (ev.key === 'Tab') close();
        });
        listEl.addEventListener('mousedown', function (ev) { ev.preventDefault(); }); // keep focus in search
        listEl.addEventListener('click', function (ev) {
            var li = ev.target.closest('.rh-ss-option');
            if (!li) return;
            var opt = filtered[Number(li.getAttribute('data-index'))];
            if (opt) { commit(opt.value); close(true); }
        });

        var api = {
            element: root,
            getValue: function () { return value; },
            getOption: function () { return value ? findOption(value) : null; },
            setValue: function (v, silent) { readOptions(); commit(v, silent !== false); },
            setDisabled: function (b) { disabled = !!b; if (disabled) close(); renderValue(); },
            // Re-reads options (e.g. after the source data changed). A selected
            // value that no longer exists is dropped and reported via onChange.
            refresh: function () {
                readOptions();
                if (value && !findOption(value)) commit('');
                else renderValue();
                if (root.classList.contains('open')) renderList();
            },
            open: open,
            close: close,
            destroy: function () { close(); if (root.parentNode) root.parentNode.removeChild(root); }
        };

        readOptions();
        if (value && !findOption(value)) value = '';
        renderValue();
        return api;
    }

    // One document-level listener closes whichever dropdown is open when the
    // user clicks anywhere outside it.
    document.addEventListener('mousedown', function (ev) {
        if (openInstance && !openInstance.element.contains(ev.target)) openInstance.close();
    });

    global.RHSelect = { create: create, fold: fold };
})(window);

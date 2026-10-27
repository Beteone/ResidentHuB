(function (global) {
    var media = global.matchMedia ? global.matchMedia('(prefers-color-scheme: dark)') : null;
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = new URL('theme.css', document.currentScript.src).href;
    link.dataset.residenthubTheme = 'true';
    document.head.appendChild(link);

    function settings() {
        if (global.RH && typeof global.RH.getCurrentUserSettings === 'function') {
            var current = global.RH.getCurrentUserSettings();
            if (current && global.RH.getSession && global.RH.getSession()) return current;
        }
        try {
            var stored = JSON.parse(localStorage.getItem('residenthub_theme_v1') || '{}');
            return {
                theme: ['light', 'dark', 'system'].indexOf(stored.theme) !== -1 ? stored.theme : 'light',
                density: ['comfortable', 'compact'].indexOf(stored.density) !== -1 ? stored.density : 'comfortable',
                fontSize: ['small', 'medium', 'large'].indexOf(stored.fontSize) !== -1 ? stored.fontSize : 'medium',
                accentColor: ['blue', 'green', 'purple', 'orange', 'red', 'teal'].indexOf(stored.accentColor) !== -1 ? stored.accentColor : 'blue'
            };
        } catch (error) {
            return { theme: 'light', density: 'comfortable', fontSize: 'medium', accentColor: 'blue' };
        }
    }

    function apply() {
        var preference = settings();
        var dark = preference.theme === 'dark' || (preference.theme === 'system' && media && media.matches);
        document.documentElement.dataset.theme = dark ? 'dark' : 'light';
        document.documentElement.dataset.density = preference.density === 'compact' ? 'compact' : 'comfortable';
        document.documentElement.dataset.fontSize = ['small', 'medium', 'large'].indexOf(preference.fontSize) !== -1 ? preference.fontSize : 'medium';
        document.documentElement.dataset.accent = ['blue', 'green', 'purple', 'orange', 'red', 'teal'].indexOf(preference.accentColor) !== -1 ? preference.accentColor : 'blue';
        document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
    }

    global.RHTheme = { apply: apply };
    apply();
    if (media) {
        var onSystemThemeChange = function () {
            if (settings().theme === 'system') apply();
        };
        if (media.addEventListener) media.addEventListener('change', onSystemThemeChange);
        else if (media.addListener) media.addListener(onSystemThemeChange);
    }
    global.addEventListener('residenthub:preferences-changed', apply);
    global.addEventListener('storage', function (event) {
        if (event.key === 'residenthub_users' || event.key === 'residenthub_theme_v1') apply();
    });
})(window);

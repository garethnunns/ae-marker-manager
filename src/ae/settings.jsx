// Panel settings and memory banks, kept in After Effects' own preferences
// (app.settings), so they last between sessions and projects.

MM.settings = (function () {
    var SECTION = 'Marker Manager';

    function get(key, fallback) {
        try {
            if (app.settings.haveSetting(SECTION, key)) {
                return app.settings.getSetting(SECTION, key);
            }
        } catch (e) {}
        return fallback;
    }

    function set(key, value) {
        try {
            app.settings.saveSetting(SECTION, key, String(value));
        } catch (e) {}
    }

    function getBool(key, fallback) {
        var v = get(key, null);
        return v === null ? fallback : v === 'true';
    }

    function getNumber(key, fallback) {
        var v = parseFloat(get(key, ''));
        return isNaN(v) ? fallback : v;
    }

    function getObject(key) {
        var v = get(key, '');
        if (v === '') {
            return null;
        }
        try {
            return MM.serial.parse(v);
        } catch (e) {
            return null;
        }
    }

    function setObject(key, value) {
        set(key, value === null ? '' : MM.serial.stringify(value));
    }

    return {
        get: get,
        set: set,
        getBool: getBool,
        getNumber: getNumber,
        getObject: getObject,
        setObject: setObject
    };
})();

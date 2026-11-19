// Small helpers that ExtendScript (ES3) doesn't have built in. Everything in
// src/core is plain ES3 with no After Effects dependency, so the same code
// runs in AE and under Node for the tests.

MM.util = (function () {
    function trim(s) {
        return String(s).replace(/^[\s\uFEFF\xA0]+|[\s\uFEFF\xA0]+$/g, '');
    }

    function indexOf(arr, value) {
        for (var i = 0; i < arr.length; i++) {
            if (arr[i] === value) {
                return i;
            }
        }
        return -1;
    }

    function pad(n, width) {
        var s = String(n);
        while (s.length < width) {
            s = '0' + s;
        }
        return s;
    }

    function isNumber(n) {
        return typeof n === 'number' && !isNaN(n) && isFinite(n);
    }

    // Shallow copy of a plain object, nested `params` copied too so edits to
    // one marker's parameters never leak into another's.
    function copy(obj) {
        var out = {};
        for (var k in obj) {
            if (obj.hasOwnProperty(k)) {
                out[k] = obj[k];
            }
        }
        if (obj.params) {
            out.params = {};
            for (var p in obj.params) {
                if (obj.params.hasOwnProperty(p)) {
                    out.params[p] = obj.params[p];
                }
            }
        }
        return out;
    }

    // Stable sort (ES3's Array.sort isn't guaranteed stable).
    function sortBy(arr, keyFn) {
        var wrapped = [];
        for (var i = 0; i < arr.length; i++) {
            wrapped.push({ v: arr[i], k: keyFn(arr[i]), i: i });
        }
        wrapped.sort(function (a, b) {
            if (a.k < b.k) { return -1; }
            if (a.k > b.k) { return 1; }
            return a.i - b.i;
        });
        var out = [];
        for (var j = 0; j < wrapped.length; j++) {
            out.push(wrapped[j].v);
        }
        return out;
    }

    return {
        trim: trim,
        indexOf: indexOf,
        pad: pad,
        isNumber: isNumber,
        copy: copy,
        sortBy: sortBy
    };
})();

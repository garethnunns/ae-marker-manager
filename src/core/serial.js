// A small JSON writer and reader. ExtendScript has no JSON object, and
// eval-ing saved text would run whatever is in it, so the memory banks and
// settings go through this instead: plain objects, arrays, strings, numbers,
// booleans and null.

MM.serial = (function () {
    function quoteString(s) {
        var out = '"';
        for (var i = 0; i < s.length; i++) {
            var c = s.charAt(i);
            var code = s.charCodeAt(i);
            if (c === '"') { out += '\\"'; }
            else if (c === '\\') { out += '\\\\'; }
            else if (c === '\n') { out += '\\n'; }
            else if (c === '\r') { out += '\\r'; }
            else if (c === '\t') { out += '\\t'; }
            else if (code < 0x20) { out += '\\u' + MM.util.pad(code.toString(16), 4); }
            else { out += c; }
        }
        return out + '"';
    }

    function stringify(v) {
        if (v === null || v === undefined) {
            return 'null';
        }
        var t = typeof v;
        if (t === 'number') {
            return MM.util.isNumber(v) ? String(v) : 'null';
        }
        if (t === 'boolean') {
            return v ? 'true' : 'false';
        }
        if (t === 'string') {
            return quoteString(v);
        }
        if (Object.prototype.toString.call(v) === '[object Array]') {
            var items = [];
            for (var i = 0; i < v.length; i++) {
                items.push(stringify(v[i]));
            }
            return '[' + items.join(',') + ']';
        }
        var parts = [];
        for (var k in v) {
            if (v.hasOwnProperty(k) && typeof v[k] !== 'function') {
                parts.push(quoteString(k) + ':' + stringify(v[k]));
            }
        }
        return '{' + parts.join(',') + '}';
    }

    function parse(text) {
        var s = String(text);
        var i = 0;

        function fail(msg) {
            throw new Error('Couldn\'t read the saved data (' + msg + ' at ' + i + ').');
        }
        function ws() {
            while (i < s.length && /\s/.test(s.charAt(i))) {
                i++;
            }
        }
        function value() {
            ws();
            var c = s.charAt(i);
            if (c === '{') { return obj(); }
            if (c === '[') { return arr(); }
            if (c === '"') { return str(); }
            if (s.substring(i, i + 4) === 'true') { i += 4; return true; }
            if (s.substring(i, i + 5) === 'false') { i += 5; return false; }
            if (s.substring(i, i + 4) === 'null') { i += 4; return null; }
            var m = /^-?\d+(\.\d+)?([eE][+\-]?\d+)?/.exec(s.substring(i));
            if (m) {
                i += m[0].length;
                return parseFloat(m[0]);
            }
            return fail('unexpected "' + c + '"');
        }
        function str() {
            i++;
            var out = '';
            while (i < s.length) {
                var c = s.charAt(i);
                if (c === '"') {
                    i++;
                    return out;
                }
                if (c === '\\') {
                    var n = s.charAt(i + 1);
                    if (n === 'n') { out += '\n'; }
                    else if (n === 'r') { out += '\r'; }
                    else if (n === 't') { out += '\t'; }
                    else if (n === 'u') {
                        out += String.fromCharCode(parseInt(s.substring(i + 2, i + 6), 16));
                        i += 4;
                    } else { out += n; }
                    i += 2;
                    continue;
                }
                out += c;
                i++;
            }
            return fail('unterminated string');
        }
        function arr() {
            i++;
            var out = [];
            ws();
            if (s.charAt(i) === ']') {
                i++;
                return out;
            }
            while (true) {
                out.push(value());
                ws();
                var c = s.charAt(i++);
                if (c === ']') { return out; }
                if (c !== ',') { fail('expected , or ]'); }
            }
        }
        function obj() {
            i++;
            var out = {};
            ws();
            if (s.charAt(i) === '}') {
                i++;
                return out;
            }
            while (true) {
                ws();
                if (s.charAt(i) !== '"') { fail('expected a key'); }
                var k = str();
                ws();
                if (s.charAt(i++) !== ':') { fail('expected :'); }
                out[k] = value();
                ws();
                var c = s.charAt(i++);
                if (c === '}') { return out; }
                if (c !== ',') { fail('expected , or }'); }
            }
        }

        var result = value();
        ws();
        if (i < s.length) {
            fail('unexpected text after the end');
        }
        return result;
    }

    return {
        stringify: stringify,
        parse: parse
    };
})();

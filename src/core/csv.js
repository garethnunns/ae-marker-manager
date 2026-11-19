// A small CSV reader and writer: quoted fields, doubled quotes, CRLF, a byte
// order mark, and comma, semicolon or tab separators (guessed from the first
// line when not given).

MM.csv = (function () {
    function guessDelimiter(text) {
        var counts = { ',': 0, ';': 0, '\t': 0 };
        var inQuotes = false;
        for (var i = 0; i < text.length; i++) {
            var c = text.charAt(i);
            if (c === '"') {
                inQuotes = !inQuotes;
            } else if (!inQuotes) {
                if (c === '\n' || c === '\r') {
                    break;
                }
                if (counts.hasOwnProperty(c)) {
                    counts[c]++;
                }
            }
        }
        var best = ',';
        if (counts['\t'] > counts[best]) { best = '\t'; }
        if (counts[';'] > counts[best]) { best = ';'; }
        return best;
    }

    function parse(text, delimiter) {
        var s = String(text);
        if (s.charCodeAt(0) === 0xFEFF) {
            s = s.substring(1);
        }
        var d = delimiter || guessDelimiter(s);
        var rows = [];
        var row = [];
        var field = '';
        var inQuotes = false;
        var i = 0;
        var n = s.length;

        while (i < n) {
            var c = s.charAt(i);
            if (inQuotes) {
                if (c === '"') {
                    if (s.charAt(i + 1) === '"') {
                        field += '"';
                        i += 2;
                        continue;
                    }
                    inQuotes = false;
                } else {
                    field += c;
                }
                i++;
                continue;
            }
            if (c === '"') {
                inQuotes = true;
            } else if (c === d) {
                row.push(field);
                field = '';
            } else if (c === '\r' || c === '\n') {
                row.push(field);
                rows.push(row);
                row = [];
                field = '';
                if (c === '\r' && s.charAt(i + 1) === '\n') {
                    i++;
                }
            } else {
                field += c;
            }
            i++;
        }
        if (field !== '' || row.length > 0) {
            row.push(field);
            rows.push(row);
        }

        // Drop rows that are entirely empty (blank lines).
        var out = [];
        for (var r = 0; r < rows.length; r++) {
            var empty = true;
            for (var k = 0; k < rows[r].length; k++) {
                if (MM.util.trim(rows[r][k]) !== '') {
                    empty = false;
                    break;
                }
            }
            if (!empty) {
                out.push(rows[r]);
            }
        }
        return out;
    }

    function quote(value) {
        var s = value === undefined || value === null ? '' : String(value);
        if (/[",\r\n]/.test(s)) {
            return '"' + s.replace(/"/g, '""') + '"';
        }
        return s;
    }

    function stringify(rows) {
        var lines = [];
        for (var r = 0; r < rows.length; r++) {
            var cells = [];
            for (var c = 0; c < rows[r].length; c++) {
                cells.push(quote(rows[r][c]));
            }
            lines.push(cells.join(','));
        }
        return lines.join('\r\n') + '\r\n';
    }

    return {
        guessDelimiter: guessDelimiter,
        parse: parse,
        stringify: stringify
    };
})();

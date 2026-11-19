// Files and the network: reading a CSV file, writing one, and asking
// Reaper's web interface for its markers over a socket.

MM.io = (function () {
    // After Effects only lets scripts write files and use the network with
    // Settings > Scripting & Expressions > "Allow Scripts to Write Files and
    // Access Network" on.
    function requireAccess() {
        var allowed = true;
        try {
            allowed = app.preferences.getPrefAsLong('Main Pref Section', 'Pref_SCRIPTING_FILE_NETWORK_SECURITY') === 1;
        } catch (e) {}
        if (!allowed) {
            throw new Error('Turn on "Allow Scripts to Write Files and Access Network" in After Effects\' ' +
                'Settings > Scripting & Expressions, then try again.');
        }
    }

    function readText(file) {
        file.encoding = 'UTF-8';
        if (!file.open('r')) {
            throw new Error('Couldn\'t open ' + file.displayName + '.');
        }
        try {
            return file.read();
        } finally {
            file.close();
        }
    }

    function chooseCsv() {
        return File.openDialog('Choose a CSV file of markers', function (f) {
            return f instanceof Folder || /\.(csv|txt|tsv)$/i.test(f.name);
        }, false);
    }

    function saveCsv(defaultName, text) {
        requireAccess();
        var file = File.saveDialog('Save the markers as CSV', 'CSV:*.csv');
        if (!file) {
            return null;
        }
        if (!/\.csv$/i.test(file.name)) {
            file = new File(file.fsName + '.csv');
        }
        file.encoding = 'UTF-8';
        file.lineFeed = 'Windows';
        if (!file.open('w')) {
            throw new Error('Couldn\'t write ' + file.displayName + '.');
        }
        try {
            file.write(text);
        } finally {
            file.close();
        }
        return file;
    }

    // The raw text of Reaper's answer to /_/MARKER;REGION;TRANSPORT.
    function fetchReaper(host, port) {
        requireAccess();
        var where = host + ':' + port;
        var socket = new Socket();
        socket.timeout = 2;
        if (!socket.open(where, 'UTF-8')) {
            throw new Error('Couldn\'t reach Reaper at ' + where + '. Check Reaper is open with its web interface ' +
                'turned on (Preferences > Control/OSC/Web), on this address and port.');
        }
        var raw = '';
        try {
            socket.write(MM.reaper.buildRequest(host, port));
            var started = new Date().getTime();
            while (!socket.eof && socket.connected) {
                raw += socket.read(65536);
                if (new Date().getTime() - started > 5000) {
                    break;
                }
            }
        } finally {
            socket.close();
        }
        var response;
        try {
            response = MM.reaper.parseResponse(raw);
        } catch (e) {
            throw new Error('Something answered at ' + where + ', but not Reaper\'s web interface. Check the port.');
        }
        if (response.status >= 400) {
            throw new Error('Reaper answered with an error (HTTP ' + response.status + ').');
        }
        return response.body;
    }

    return {
        readText: readText,
        chooseCsv: chooseCsv,
        saveCsv: saveCsv,
        fetchReaper: fetchReaper
    };
})();

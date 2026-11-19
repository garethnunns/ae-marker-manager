// Turns the rows of a CSV file into markers. Reads Reaper's region/marker
// manager export (#, Name, Start, End, Length, with M1/R1 ids) and simpler
// files with a time column and a name column, under the usual names for
// each column. Without a header row, the first column is the time and the
// second the name.

MM.table = (function () {
    var trim = MM.util.trim;

    var ALIASES = {
        id: ['#', 'id', 'index', 'number', 'no', 'marker#'],
        time: ['time', 'start', 'in', 'position', 'pos', 'starttime', 'timecode', 'tc', 'markertime'],
        end: ['end', 'out', 'endtime', 'outpoint'],
        duration: ['duration', 'length', 'len', 'dur'],
        comment: ['name', 'comment', 'marker', 'markername', 'title', 'text', 'description'],
        chapter: ['chapter'],
        url: ['url', 'link'],
        frameTarget: ['frametarget', 'target'],
        cuePointName: ['cuepointname', 'cuepoint'],
        eventCuePoint: ['eventcuepoint', 'event'],
        label: ['label', 'labelcolor', 'labelcolour'],
        color: ['color', 'colour'],
        protectedRegion: ['protected', 'protectedregion'],
        paramName: ['paramname', 'parametername'],
        paramValue: ['paramvalue', 'parametervalue']
    };

    function normalise(header) {
        return trim(header).toLowerCase().replace(/[^a-z0-9#]/g, '');
    }

    function columnFor(header) {
        var h = normalise(header);
        for (var key in ALIASES) {
            if (ALIASES.hasOwnProperty(key) && MM.util.indexOf(ALIASES[key], h) !== -1) {
                return key;
            }
        }
        return null;
    }

    // { columns: {key: index}, hasHeader }
    function detectColumns(firstRow) {
        var columns = {};
        var found = 0;
        for (var i = 0; i < firstRow.length; i++) {
            var key = columnFor(firstRow[i]);
            if (key && !columns.hasOwnProperty(key)) {
                columns[key] = i;
                found++;
            }
        }
        if (found > 0 && columns.hasOwnProperty('time')) {
            return { columns: columns, hasHeader: true };
        }
        return { columns: { time: 0, comment: 1 }, hasHeader: false };
    }

    function truthy(s) {
        return /^(1|true|yes|y|on)$/i.test(trim(s));
    }

    // opts: { format: 'auto'|'timecode'|'clock'|'seconds'|'frames'|'samples',
    //         fps, sampleRate }
    // Returns { markers, warnings, error }.
    function toMarkers(rows, opts) {
        opts = opts || {};
        if (!rows || rows.length === 0) {
            return { markers: [], warnings: [], error: 'The file is empty.' };
        }
        var detected = detectColumns(rows[0]);
        var cols = detected.columns;
        var markers = [];
        var warnings = [];
        var beats = 0;
        var timeOpts = { fps: opts.fps, sampleRate: opts.sampleRate };

        function cell(row, key) {
            return cols.hasOwnProperty(key) && cols[key] < row.length ? trim(row[cols[key]]) : '';
        }

        for (var r = detected.hasHeader ? 1 : 0; r < rows.length; r++) {
            var row = rows[r];
            var rowNo = r + 1;
            var timeText = cell(row, 'time');
            if (timeText === '') {
                warnings.push('Row ' + rowNo + ' has no time, so it was skipped.');
                continue;
            }
            var t;
            try {
                t = MM.time.parse(timeText, opts.format || 'auto', timeOpts);
            } catch (e) {
                if (MM.time.detectFormat(timeText) === 'beats') {
                    beats++;
                }
                warnings.push('Row ' + rowNo + ': ' + e.message);
                continue;
            }

            var m = MM.markers.create({ time: t, comment: cell(row, 'comment') });

            var durationText = cell(row, 'duration');
            var endText = cell(row, 'end');
            try {
                if (endText !== '') {
                    m.duration = Math.max(0, MM.time.parse(endText, opts.format || 'auto', timeOpts) - t);
                } else if (durationText !== '') {
                    m.duration = Math.max(0, MM.time.parse(durationText, opts.format || 'auto', timeOpts));
                }
            } catch (e2) {
                warnings.push('Row ' + rowNo + ': couldn\'t read its end or length, so it has none.');
            }

            m.chapter = cell(row, 'chapter');
            m.url = cell(row, 'url');
            m.frameTarget = cell(row, 'frameTarget');
            m.cuePointName = cell(row, 'cuePointName');
            m.eventCuePoint = truthy(cell(row, 'eventCuePoint'));
            m.protectedRegion = truthy(cell(row, 'protectedRegion'));
            var label = parseInt(cell(row, 'label'), 10);
            if (label >= 0 && label <= 16) {
                m.label = label;
            }
            var pName = cell(row, 'paramName');
            if (pName !== '') {
                m.params[pName] = cell(row, 'paramValue');
            }
            var id = cell(row, 'id');
            m.sourceId = id !== '' ? id : 'row' + rowNo;

            markers.push(m);
        }

        var error = null;
        if (markers.length === 0) {
            error = beats > 0
                ? 'The times are in measures and beats, which can\'t be read without the tempo. ' +
                  'In Reaper, set the ruler to timecode or minutes:seconds before exporting.'
                : 'No markers could be read from the file.';
        }
        return { markers: MM.util.sortBy(markers, function (x) { return x.time; }), warnings: warnings, error: error };
    }

    // Rows for a CSV file of markers, in Reaper's layout. timeFn turns
    // seconds into the text to write.
    function fromMarkers(markers, timeFn) {
        var rows = [['#', 'Name', 'Start', 'End', 'Length']];
        var m = 0;
        var r = 0;
        for (var i = 0; i < markers.length; i++) {
            var mk = markers[i];
            if (mk.duration > 0) {
                r++;
                rows.push(['R' + r, mk.comment, timeFn(mk.time), timeFn(mk.time + mk.duration), timeFn(mk.duration, true)]);
            } else {
                m++;
                rows.push(['M' + m, mk.comment, timeFn(mk.time), '', '']);
            }
        }
        return rows;
    }

    return {
        detectColumns: detectColumns,
        toMarkers: toMarkers,
        fromMarkers: fromMarkers
    };
})();

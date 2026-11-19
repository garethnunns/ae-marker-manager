// Reading markers and regions from Reaper's built-in Web Browser Interface
// (Reaper: Preferences > Control/OSC/Web > Add > Web browser interface).
// Nothing has to run inside Reaper. One request asks for all of it:
//
//   GET /_/MARKER;REGION;TRANSPORT
//
// and the answer is tab-separated lines:
//
//   MARKER_LIST
//   MARKER  name  id  position  [colour]
//   MARKER_LIST_END
//   REGION_LIST
//   REGION  name  id  start  end  [colour]
//   REGION_LIST_END
//   TRANSPORT  playstate  position  repeat  position_string  position_beats
//
// Positions are seconds from the start of Reaper's timeline, without its
// project start time. position_string is the playhead as Reaper shows it,
// which does include it, so comparing the two gives the start time when the
// ruler shows timecode or minutes:seconds.
//
// The HTTP here is hand-written for ExtendScript's Socket (src/ae/reaper.jsx),
// asking the server to close the connection so the body is simply the rest.

MM.reaper = (function () {
    var COMMAND = 'MARKER;REGION;TRANSPORT';

    function buildRequest(host, port, path) {
        return 'GET ' + (path || '/_/' + COMMAND) + ' HTTP/1.1\r\n' +
            'Host: ' + host + ':' + port + '\r\n' +
            'Connection: close\r\n' +
            '\r\n';
    }

    // { status, body }, or throws if it isn't HTTP.
    function parseResponse(raw) {
        var s = String(raw);
        var end = s.indexOf('\r\n\r\n');
        var sepLength = 4;
        if (end === -1) {
            end = s.indexOf('\n\n');
            sepLength = 2;
        }
        if (end === -1) {
            throw new Error('not an HTTP response');
        }
        var statusLine = s.substring(0, end).split(/\r?\n/)[0];
        var m = /^HTTP\/\d\.\d\s+(\d{3})/.exec(statusLine);
        if (!m) {
            throw new Error('not an HTTP response');
        }
        return { status: parseInt(m[1], 10), body: s.substring(end + sepLength) };
    }

    // { markers: [...], regions: [...], transport: {positionSeconds, positionString} | null }
    function parseBody(body) {
        var markers = [];
        var regions = [];
        var transport = null;
        var lines = String(body).split('\n');
        for (var i = 0; i < lines.length; i++) {
            var line = lines[i].replace(/\r$/, '');
            if (line === '') {
                continue;
            }
            var p = line.split('\t');
            if (p[0] === 'MARKER' && p.length >= 4) {
                var pos = parseFloat(p[3]);
                if (!isNaN(pos)) {
                    markers.push({ name: p[1], id: p[2], position: pos, color: p.length > 4 ? p[4] : '' });
                }
            } else if (p[0] === 'REGION' && p.length >= 5) {
                var start = parseFloat(p[3]);
                var end = parseFloat(p[4]);
                if (!isNaN(start) && !isNaN(end)) {
                    regions.push({ name: p[1], id: p[2], start: start, end: end, color: p.length > 5 ? p[5] : '' });
                }
            } else if (p[0] === 'TRANSPORT' && p.length >= 5) {
                transport = { positionSeconds: parseFloat(p[2]), positionString: p[4] };
            }
        }
        return { markers: markers, regions: regions, transport: transport };
    }

    // Reaper's project start time in seconds, or null when the ruler shows
    // something it can't be worked out from (measures and beats, samples).
    function startOffset(transport, fps) {
        if (!transport) {
            return null;
        }
        var shown = MM.util.trim(transport.positionString);
        var format = MM.time.detectFormat(shown);
        var displayed;
        try {
            if (format === 'timecode') {
                displayed = MM.time.timecodeToSeconds(shown, fps);
            } else if (format === 'clock' || format === 'seconds') {
                displayed = MM.time.parse(shown, format);
            } else {
                return null;
            }
        } catch (e) {
            return null;
        }
        return displayed - transport.positionSeconds;
    }

    // Marker data from what Reaper sent. Each keeps Reaper's id (M3, R2) as
    // its sourceId, which importing again uses to replace it.
    function toMarkers(parsed, opts) {
        opts = opts || {};
        var out = [];
        var i;
        if (opts.markers !== false) {
            for (i = 0; i < parsed.markers.length; i++) {
                var mk = parsed.markers[i];
                out.push(MM.markers.create({ time: mk.position, comment: mk.name, sourceId: 'M' + mk.id }));
            }
        }
        if (opts.regions !== false) {
            for (i = 0; i < parsed.regions.length; i++) {
                var rg = parsed.regions[i];
                out.push(MM.markers.create({
                    time: rg.start,
                    duration: Math.max(0, rg.end - rg.start),
                    comment: rg.name,
                    sourceId: 'R' + rg.id
                }));
            }
        }
        return MM.util.sortBy(out, function (m) { return m.time; });
    }

    return {
        COMMAND: COMMAND,
        buildRequest: buildRequest,
        parseResponse: parseResponse,
        parseBody: parseBody,
        startOffset: startOffset,
        toMarkers: toMarkers
    };
})();

// Time parsing and formatting: SMPTE timecode (drop and non-drop), clock
// times (H:MM:SS.mmm), seconds, frames and samples.
//
// Timecode at a fractional rate (23.976, 29.97, 59.94) counts frames at the
// nominal rate (24, 30, 60) and converts frames to seconds at the real one,
// as After Effects does.

MM.time = (function () {
    var trim = MM.util.trim;
    var pad = MM.util.pad;

    function nominalRate(fps) {
        return Math.round(fps);
    }

    function isDropFrameRate(fps) {
        return Math.abs(fps - 29.97) < 0.01 || Math.abs(fps - 59.94) < 0.01;
    }

    // Frames dropped each minute (except every tenth): 2 at 29.97, 4 at 59.94.
    function dropCount(fps) {
        return Math.round(fps * 0.0666666);
    }

    function requireRate(fps) {
        if (!MM.util.isNumber(fps) || fps <= 0) {
            throw new Error('The frame rate must be greater than 0 (got ' + fps + ').');
        }
    }

    function framesToTimecode(frames, fps, dropFrame) {
        requireRate(fps);
        var nominal = nominalRate(fps);
        var negative = frames < 0;
        var f = Math.abs(Math.round(frames));
        var drop = dropFrame && isDropFrameRate(fps);

        if (drop) {
            var d = dropCount(fps);
            var per10 = Math.round(fps * 600);
            var perMin = nominal * 60 - d;
            var tens = Math.floor(f / per10);
            var rem = f % per10;
            f += d * 9 * tens;
            if (rem > d) {
                f += d * Math.floor((rem - d) / perMin);
            }
        }

        var ff = f % nominal;
        var totalSeconds = Math.floor(f / nominal);
        var ss = totalSeconds % 60;
        var mm = Math.floor(totalSeconds / 60) % 60;
        var hh = Math.floor(totalSeconds / 3600);
        var sep = drop ? ';' : ':';
        return (negative ? '-' : '') + pad(hh, 2) + ':' + pad(mm, 2) + ':' + pad(ss, 2) + sep + pad(ff, 2);
    }

    // Accepts HH:MM:SS:FF, and the shorter forms After Effects does
    // (MM:SS:FF, SS:FF). A ';' anywhere marks it as drop frame.
    function timecodeToFrames(str, fps) {
        requireRate(fps);
        var s = trim(str);
        var negative = false;
        if (s.charAt(0) === '-') {
            negative = true;
            s = s.substring(1);
        }
        var drop = s.indexOf(';') !== -1 && isDropFrameRate(fps);
        var parts = s.split(/[:;]/);
        if (parts.length < 2 || parts.length > 4) {
            throw new Error('"' + str + '" isn\'t a timecode.');
        }
        while (parts.length < 4) {
            parts.unshift('0');
        }
        var n = [];
        for (var i = 0; i < 4; i++) {
            if (!/^\d+$/.test(parts[i])) {
                throw new Error('"' + str + '" isn\'t a timecode.');
            }
            n.push(parseInt(parts[i], 10));
        }
        var nominal = nominalRate(fps);
        var frames = ((n[0] * 3600 + n[1] * 60 + n[2]) * nominal) + n[3];
        if (drop) {
            var totalMinutes = n[0] * 60 + n[1];
            frames -= dropCount(fps) * (totalMinutes - Math.floor(totalMinutes / 10));
        }
        return negative ? -frames : frames;
    }

    function timecodeToSeconds(str, fps) {
        return timecodeToFrames(str, fps) / fps;
    }

    function secondsToTimecode(seconds, fps, dropFrame) {
        return framesToTimecode(Math.round(seconds * fps), fps, dropFrame);
    }

    // H:MM:SS.mmm, M:SS.mmm or SS.mmm.
    function clockToSeconds(str) {
        var s = trim(str);
        var negative = false;
        if (s.charAt(0) === '-') {
            negative = true;
            s = s.substring(1);
        }
        var parts = s.split(':');
        if (parts.length > 3) {
            throw new Error('"' + str + '" isn\'t a time.');
        }
        var total = 0;
        for (var i = 0; i < parts.length; i++) {
            var isLast = i === parts.length - 1;
            var re = isLast ? /^\d+(\.\d*)?$|^\.\d+$/ : /^\d+$/;
            if (!re.test(parts[i])) {
                throw new Error('"' + str + '" isn\'t a time.');
            }
            total = total * 60 + parseFloat(parts[i]);
        }
        return negative ? -total : total;
    }

    function secondsToClock(seconds) {
        var negative = seconds < 0;
        var ms = Math.round(Math.abs(seconds) * 1000);
        var h = Math.floor(ms / 3600000);
        var m = Math.floor(ms / 60000) % 60;
        var s = Math.floor(ms / 1000) % 60;
        var rest = ms % 1000;
        return (negative ? '-' : '') + h + ':' + pad(m, 2) + ':' + pad(s, 2) + '.' + pad(rest, 3);
    }

    // What a time string looks like: 'timecode', 'clock', 'seconds',
    // 'beats' (Reaper's measures.beats, which can't be converted without the
    // tempo map) or null.
    function detectFormat(str) {
        var s = trim(str).replace(/^-/, '');
        if (s === '') {
            return null;
        }
        if (/^\d+([:;]\d+){3}$/.test(s)) {
            return 'timecode';
        }
        if (/^\d+(:\d+){1,2}(\.\d*)?$/.test(s)) {
            return 'clock';
        }
        if (/^\d+\.\d+\.\d+$/.test(s)) {
            return 'beats';
        }
        if (/^\d+(\.\d*)?$|^\.\d+$/.test(s)) {
            return 'seconds';
        }
        return null;
    }

    // Reads a time in the given format ('auto', 'timecode', 'clock',
    // 'seconds', 'frames' or 'samples') and returns seconds.
    function parse(str, format, opts) {
        opts = opts || {};
        var s = trim(str);
        var f = format || 'auto';
        if (f === 'auto') {
            f = detectFormat(s);
            if (f === null) {
                throw new Error('"' + str + '" isn\'t a time.');
            }
        }
        switch (f) {
        case 'timecode':
            return timecodeToSeconds(s, opts.fps);
        case 'clock':
            return clockToSeconds(s);
        case 'seconds':
            if (!/^-?(\d+(\.\d*)?|\.\d+)$/.test(s)) {
                throw new Error('"' + str + '" isn\'t a number of seconds.');
            }
            return parseFloat(s);
        case 'frames':
            requireRate(opts.fps);
            if (!/^-?\d+(\.\d*)?$/.test(s)) {
                throw new Error('"' + str + '" isn\'t a number of frames.');
            }
            return parseFloat(s) / opts.fps;
        case 'samples':
            if (!MM.util.isNumber(opts.sampleRate) || opts.sampleRate <= 0) {
                throw new Error('The sample rate must be greater than 0.');
            }
            if (!/^-?\d+$/.test(s)) {
                throw new Error('"' + str + '" isn\'t a number of samples.');
            }
            return parseInt(s, 10) / opts.sampleRate;
        case 'beats':
            throw new Error('"' + str + '" is in measures and beats, which can\'t be read without the tempo. ' +
                'In Reaper, set the ruler to timecode or minutes:seconds before exporting.');
        default:
            throw new Error('Unknown time format "' + f + '".');
        }
    }

    function quantise(seconds, fps) {
        requireRate(fps);
        return Math.round(seconds * fps) / fps;
    }

    return {
        isDropFrameRate: isDropFrameRate,
        framesToTimecode: framesToTimecode,
        timecodeToFrames: timecodeToFrames,
        timecodeToSeconds: timecodeToSeconds,
        secondsToTimecode: secondsToTimecode,
        clockToSeconds: clockToSeconds,
        secondsToClock: secondsToClock,
        detectFormat: detectFormat,
        parse: parse,
        quantise: quantise
    };
})();

// Builds the marker trigger expression: a keyframed property plays its
// animation (first keyframe to last) from each marker, instead of at the
// times it was keyframed. One set of keyframes can then be repeated across a
// whole comp by adding markers.

MM.trigger = (function () {
    var HEADER = '// Marker Manager trigger';

    function literal(s) {
        return '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r?\n/g, ' ') + '"';
    }

    function num(n) {
        return MM.util.isNumber(n) ? String(n) : '0';
    }

    // opts:
    //   source:   'layer' (the property's own layer), 'comp', or 'other'
    //   layerName: the layer whose markers to use, for 'other'
    //   filter:   only markers whose name contains this ('' for all)
    //   delay:    frames after each marker to start
    //   duration: frames the animation lasts (0 keeps it as keyframed)
    //   fit:      stretch to each marker's own duration, when it has one
    //   reverse:  play the keyframes backwards
    function build(opts) {
        opts = opts || {};
        var src;
        if (opts.source === 'comp') {
            src = 'thisComp.marker';
        } else if (opts.source === 'other') {
            src = 'thisComp.layer(' + literal(opts.layerName || '') + ').marker';
        } else {
            src = 'thisLayer.marker';
        }
        var lines = [
            HEADER + ' (settings below can be changed here)',
            'var src = ' + src + ';',
            'var filter = ' + literal(opts.filter || '') + ';',
            'var delayFrames = ' + num(opts.delay) + ';',
            'var durationFrames = ' + num(opts.duration) + ';',
            'var fitToMarker = ' + (opts.fit ? 'true' : 'false') + ';',
            'var reverse = ' + (opts.reverse ? 'true' : 'false') + ';',
            '',
            'var out = value;',
            'if (numKeys > 1) {',
            '    var k0 = key(1).time;',
            '    var len = key(numKeys).time - k0;',
            '    var delay = delayFrames * thisComp.frameDuration;',
            '    var start = null, markerDur = 0;',
            '    for (var i = src.numKeys; i >= 1; i--) {',
            '        var m = src.key(i);',
            '        if (m.time + delay <= time && (filter === "" || m.comment.indexOf(filter) !== -1)) {',
            '            start = m.time + delay;',
            '            markerDur = m.duration;',
            '            break;',
            '        }',
            '    }',
            '    if (start === null) {',
            '        out = valueAtTime(reverse ? k0 + len : k0);',
            '    } else {',
            '        var span = (fitToMarker && markerDur > 0) ? markerDur :',
            '            (durationFrames > 0 ? durationFrames * thisComp.frameDuration : len);',
            '        var p = span > 0 ? Math.min(Math.max((time - start) / span, 0), 1) : 1;',
            '        if (reverse) { p = 1 - p; }',
            '        out = valueAtTime(k0 + p * len);',
            '    }',
            '}',
            'out;'
        ];
        return lines.join('\n');
    }

    // Whether an expression is one this builds (so Remove only takes those).
    function isTrigger(expression) {
        return String(expression).indexOf(HEADER) === 0;
    }

    return {
        build: build,
        isTrigger: isTrigger
    };
})();

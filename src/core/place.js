// Where imported markers go in the comp.
//
//   'timecode'   at the comp timecode they say (01:00:10:00 lands at
//                01:00:10:00 on a comp starting at 01:00:00:00)
//   'start'      from the start of the comp (0 is its first frame)
//   'playhead'   from the playhead
//   'first'      the first one at the playhead, the rest after it as spaced

MM.place = (function () {
    // ctx: { displayStart, playhead, offset } - offset is added first (the
    // Reaper project start time, for live imports).
    function apply(markers, mode, ctx) {
        ctx = ctx || {};
        var offset = ctx.offset || 0;
        var shift;
        if (mode === 'timecode') {
            shift = offset - (ctx.displayStart || 0);
        } else if (mode === 'playhead') {
            shift = offset + (ctx.playhead || 0);
        } else if (mode === 'first') {
            var earliest = null;
            for (var i = 0; i < markers.length; i++) {
                if (earliest === null || markers[i].time < earliest) {
                    earliest = markers[i].time;
                }
            }
            shift = (ctx.playhead || 0) - (earliest === null ? 0 : earliest);
        } else {
            shift = offset;
        }
        var out = [];
        var before = 0;
        for (var j = 0; j < markers.length; j++) {
            var m = MM.util.copy(markers[j]);
            m.time = m.time + shift;
            if (ctx.fps && ctx.quantise) {
                var end = m.time + m.duration;
                m.time = MM.time.quantise(m.time, ctx.fps);
                m.duration = m.duration > 0 ? Math.max(0, MM.time.quantise(end, ctx.fps) - m.time) : 0;
            }
            if (m.time < 0) {
                before++;
                continue;
            }
            out.push(m);
        }
        return { markers: out, skipped: before };
    }

    return { apply: apply };
})();

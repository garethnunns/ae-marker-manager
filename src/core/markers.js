// Marker data and the operations on it, with no After Effects in sight: a
// marker is a plain object (see create), and every operation takes a list of
// them and says what should change. src/ae/markers.jsx reads them from and
// writes them back to After Effects.
//
// Operations work on a range of time (the work area, the whole comp, or
// everything before or after the playhead). A marker is "in" the range when
// its start is. With split markers on, a marker with a duration is also in the range
// when only its end is, and then only that end moves.

MM.markers = (function () {
    var copy = MM.util.copy;

    // Times within this of a range's edge count as inside it, so a marker
    // sitting exactly on the work area's last frame isn't missed to rounding.
    var TOLERANCE = 1e-4;

    function create(props) {
        var m = {
            time: 0,
            duration: 0,
            comment: '',
            chapter: '',
            url: '',
            frameTarget: '',
            cuePointName: '',
            eventCuePoint: false,
            label: 0,
            protectedRegion: false,
            params: {}
        };
        if (props) {
            for (var k in props) {
                if (props.hasOwnProperty(k) && props[k] !== undefined) {
                    m[k] = props[k];
                }
            }
        }
        return copy(m);
    }

    function range(start, end) {
        return { start: start, end: end };
    }

    function within(t, r) {
        return t >= r.start - TOLERANCE && t <= r.end + TOLERANCE;
    }

    // Which parts of a marker are in the range: { start, end, any }.
    function hit(m, r, opts) {
        opts = opts || {};
        if (m.protectedRegion && !opts.includeProtected) {
            return { start: false, end: false, any: false };
        }
        var s = within(m.time, r);
        var e = m.duration > 0 && within(m.time + m.duration, r);
        if (!opts.split) {
            return { start: s, end: s, any: s };
        }
        return { start: s, end: e, any: s || e };
    }

    // Indices of the markers whose start is in the range (what copy, cut and
    // delete act on).
    function select(list, r, opts) {
        var out = [];
        for (var i = 0; i < list.length; i++) {
            var h = hit(list[i], r, { includeProtected: opts && opts.includeProtected });
            if (h.start) {
                out.push(i);
            }
        }
        return out;
    }

    function moveOne(m, delta, h, split) {
        var out = copy(m);
        if (!split || m.duration <= 0 || (h.start && h.end)) {
            out.time = m.time + delta;
            return out;
        }
        var end = m.time + m.duration;
        if (h.start) {
            // Only the start moves: the end stays put.
            out.time = Math.min(m.time + delta, end);
            out.duration = end - out.time;
        } else {
            out.duration = Math.max(0, m.duration + delta);
        }
        return out;
    }

    // Moves the markers in the range by delta seconds. Returns
    // { changes: [{ index, before, after }], error } and changes nothing
    // (an error instead) if any marker would land before the start (0).
    function shift(list, delta, r, opts) {
        opts = opts || {};
        var changes = [];
        var early = 0;
        for (var i = 0; i < list.length; i++) {
            var h = hit(list[i], r, opts);
            if (!h.any) {
                continue;
            }
            var after = moveOne(list[i], delta, h, opts.split);
            if (after.time < -TOLERANCE) {
                early++;
            }
            changes.push({ index: i, before: list[i], after: after });
        }
        if (early > 0) {
            return {
                changes: [],
                error: early + (early === 1 ? ' marker' : ' markers') + ' would go before the start of the comp.'
            };
        }
        return { changes: changes, error: null };
    }

    // Moves the markers in the range together so the earliest one starts at
    // `time`, keeping the gaps between them.
    function moveTo(list, time, r, opts) {
        var idx = select(list, r, opts);
        if (idx.length === 0) {
            return { changes: [], error: null };
        }
        var earliest = list[idx[0]].time;
        for (var i = 1; i < idx.length; i++) {
            earliest = Math.min(earliest, list[idx[i]].time);
        }
        // Whole markers only: moving to a time is about where they start.
        var o = { includeProtected: opts && opts.includeProtected, split: false };
        return shift(list, time - earliest, r, o);
    }

    // Snaps the markers in the range (start and end) to the nearest frame.
    function quantise(list, fps, r, opts) {
        var changes = [];
        var idx = select(list, r, opts);
        for (var i = 0; i < idx.length; i++) {
            var m = list[idx[i]];
            var after = copy(m);
            after.time = MM.time.quantise(m.time, fps);
            if (m.duration > 0) {
                after.duration = Math.max(0, MM.time.quantise(m.time + m.duration, fps) - after.time);
            }
            if (Math.abs(after.time - m.time) > 1e-9 || Math.abs(after.duration - m.duration) > 1e-9) {
                changes.push({ index: idx[i], before: m, after: after });
            }
        }
        return { changes: changes, error: null };
    }

    // A clipboard: copies of the markers and the time they're measured from
    // (the earliest), so they can be pasted where they were or elsewhere.
    function toClip(markers) {
        var out = [];
        var ref = null;
        for (var i = 0; i < markers.length; i++) {
            out.push(copy(markers[i]));
            if (ref === null || markers[i].time < ref) {
                ref = markers[i].time;
            }
        }
        return { ref: ref === null ? 0 : ref, markers: MM.util.sortBy(out, function (m) { return m.time; }) };
    }

    // The clipboard's markers, at their own times, or moved so the earliest
    // is at `at`.
    function fromClip(clip, at) {
        var offset = (at === null || at === undefined) ? 0 : at - clip.ref;
        var out = [];
        for (var i = 0; i < clip.markers.length; i++) {
            var m = copy(clip.markers[i]);
            m.time = m.time + offset;
            out.push(m);
        }
        return out;
    }

    // Copies of markers that are at the same time as another one in the list
    // are dropped (a property can only hold one marker at each time), keeping
    // the first.
    function dedupe(markers, fps) {
        var seen = {};
        var out = [];
        for (var i = 0; i < markers.length; i++) {
            var key = String(Math.round(markers[i].time * (fps || 1000)));
            if (!seen[key]) {
                seen[key] = true;
                out.push(markers[i]);
            }
        }
        return out;
    }

    return {
        create: create,
        range: range,
        hit: hit,
        select: select,
        shift: shift,
        moveTo: moveTo,
        quantise: quantise,
        toClip: toClip,
        fromClip: fromClip,
        dedupe: dedupe
    };
})();

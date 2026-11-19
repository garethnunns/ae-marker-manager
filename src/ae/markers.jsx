// Everything that touches After Effects' markers. Each action reads the
// markers it needs into plain data (src/core/markers.js), works out what
// should change there, and writes it back in one undo step.
//
// Which markers: the target is the selected layers' markers, or the comp's
// when no layer is selected ('auto'), or always one or the other. The range
// is the work area, the whole comp, or everything before or after the
// playhead.

MM.ae = (function () {
    var SOURCE_KEY = 'sourceId';
    var GUIDE_TAG = 'marker-manager:comp-markers';

    function activeComp() {
        var item = app.project ? app.project.activeItem : null;
        return (item && item instanceof CompItem) ? item : null;
    }

    function requireComp() {
        var comp = activeComp();
        if (!comp) {
            throw new Error('Open a composition first.');
        }
        return comp;
    }

    function undoable(name, fn) {
        app.beginUndoGroup('Marker Manager: ' + name);
        try {
            return fn();
        } finally {
            app.endUndoGroup();
        }
    }

    function plural(n, one, many) {
        return n + ' ' + (n === 1 ? one : (many || one + 's'));
    }

    // ---- Reading and writing ------------------------------------------

    function readMarker(prop, keyIndex) {
        var v = prop.keyValue(keyIndex);
        var m = MM.markers.create({
            time: prop.keyTime(keyIndex),
            duration: v.duration,
            comment: v.comment,
            chapter: v.chapter,
            url: v.url,
            frameTarget: v.frameTarget,
            cuePointName: v.cuePointName,
            eventCuePoint: v.eventCuePoint
        });
        try { m.label = v.label; } catch (e1) {}
        try { m.protectedRegion = v.protectedRegion; } catch (e2) {}
        try {
            var params = v.getParameters();
            for (var k in params) {
                if (params.hasOwnProperty(k)) {
                    if (k === SOURCE_KEY) {
                        m.sourceId = params[k];
                    } else {
                        m.params[k] = params[k];
                    }
                }
            }
        } catch (e3) {}
        return m;
    }

    function toMarkerValue(m) {
        var v = new MarkerValue(m.comment || '', m.chapter || '', m.url || '', m.frameTarget || '', m.cuePointName || '');
        v.duration = Math.max(0, m.duration || 0);
        v.eventCuePoint = !!m.eventCuePoint;
        try { v.label = m.label || 0; } catch (e1) {}
        try { v.protectedRegion = !!m.protectedRegion; } catch (e2) {}
        var params = {};
        var any = false;
        var own = m.params || {};
        for (var k in own) {
            if (own.hasOwnProperty(k)) {
                params[k] = String(own[k]);
                any = true;
            }
        }
        if (m.sourceId) {
            params[SOURCE_KEY] = String(m.sourceId);
            any = true;
        }
        if (any) {
            v.setParameters(params);
        }
        return v;
    }

    function readAll(prop) {
        var out = [];
        for (var i = 1; i <= prop.numKeys; i++) {
            out.push(readMarker(prop, i));
        }
        return out;
    }

    // Removes the markers at these (0-based) indices of what readAll gave.
    function removeIndices(prop, indices) {
        var sorted = indices.slice(0).sort(function (a, b) { return b - a; });
        for (var i = 0; i < sorted.length; i++) {
            prop.removeKey(sorted[i] + 1);
        }
    }

    // Writes markers; returns how many landed on an existing marker and so
    // replaced it (a property holds one marker at each time).
    function writeAll(prop, markers, fps) {
        var replaced = 0;
        var half = 0.5 / fps;
        for (var i = 0; i < markers.length; i++) {
            var t = markers[i].time;
            if (prop.numKeys > 0) {
                var near = prop.nearestKeyIndex(t);
                if (Math.abs(prop.keyTime(near) - t) < half) {
                    replaced++;
                    prop.removeKey(near);
                }
            }
            prop.setValueAtTime(t, toMarkerValue(markers[i]));
        }
        return replaced;
    }

    function applyChanges(prop, changes, fps) {
        var indices = [];
        var afters = [];
        for (var i = 0; i < changes.length; i++) {
            indices.push(changes[i].index);
            afters.push(changes[i].after);
        }
        removeIndices(prop, indices);
        return writeAll(prop, afters, fps);
    }

    // ---- Where -----------------------------------------------------------

    // [{ name, prop }] for the target: 'auto', 'comp' or 'layers'.
    function targets(comp, mode) {
        var layers = comp.selectedLayers;
        if (mode === 'comp' || (mode !== 'layers' && layers.length === 0)) {
            return [{ name: 'comp', prop: comp.markerProperty }];
        }
        if (layers.length === 0) {
            throw new Error('Select the layers whose markers to use.');
        }
        var out = [];
        for (var i = 0; i < layers.length; i++) {
            out.push({ name: layers[i].name, prop: layers[i].property('ADBE Marker') });
        }
        return out;
    }

    function rangeFor(comp, mode) {
        var BIG = 1e7;
        if (mode === 'comp') {
            return MM.markers.range(-BIG, BIG);
        }
        if (mode === 'after') {
            return MM.markers.range(comp.time, BIG);
        }
        if (mode === 'before') {
            return MM.markers.range(-BIG, comp.time);
        }
        return MM.markers.range(comp.workAreaStart, comp.workAreaStart + comp.workAreaDuration);
    }

    function describeTargets(list) {
        if (list.length === 1 && list[0].name === 'comp') {
            return 'the comp';
        }
        return plural(list.length, 'layer');
    }

    function replacedNote(n) {
        return n > 0 ? ' (' + plural(n, 'marker') + ' already there replaced)' : '';
    }

    // ---- Actions ---------------------------------------------------------
    // o: { target, range, split, includeProtected } plus what each needs.
    // Each returns a short message for the status line.

    function count(o) {
        var comp = activeComp();
        if (!comp) {
            return 'No composition open.';
        }
        var list;
        try {
            list = targets(comp, o.target);
        } catch (e) {
            return e.message;
        }
        var r = rangeFor(comp, o.range);
        var n = 0;
        for (var i = 0; i < list.length; i++) {
            var markers = readAll(list[i].prop);
            for (var j = 0; j < markers.length; j++) {
                if (MM.markers.hit(markers[j], r, o).any) {
                    n++;
                }
            }
        }
        return plural(n, 'marker') + ' in range on ' + describeTargets(list) + '.';
    }

    function runChanges(name, o, planFn) {
        var comp = requireComp();
        var list = targets(comp, o.target);
        var r = rangeFor(comp, o.range);
        var plans = [];
        var total = 0;
        // Work it all out first, so an error leaves everything as it was.
        for (var i = 0; i < list.length; i++) {
            var plan = planFn(readAll(list[i].prop), r, comp);
            if (plan.error) {
                throw new Error(plan.error);
            }
            plans.push(plan);
            total += plan.changes.length;
        }
        if (total === 0) {
            return 'No markers in range on ' + describeTargets(list) + '.';
        }
        var replaced = 0;
        undoable(name, function () {
            for (var j = 0; j < list.length; j++) {
                replaced += applyChanges(list[j].prop, plans[j].changes, comp.frameRate);
            }
        });
        return name + ': ' + plural(total, 'marker') + ' on ' + describeTargets(list) + replacedNote(replaced) + '.';
    }

    function move(o, frames) {
        var comp = requireComp();
        var delta = frames * comp.frameDuration;
        return runChanges('Move', o, function (markers, r) {
            return MM.markers.shift(markers, delta, r, o);
        });
    }

    // Moves the markers in range, on all targets together, so the earliest
    // starts at the playhead.
    function moveToPlayhead(o) {
        var comp = requireComp();
        var list = targets(comp, o.target);
        var r = rangeFor(comp, o.range);
        var earliest = null;
        for (var i = 0; i < list.length; i++) {
            var markers = readAll(list[i].prop);
            var idx = MM.markers.select(markers, r, o);
            for (var j = 0; j < idx.length; j++) {
                var t = markers[idx[j]].time;
                if (earliest === null || t < earliest) {
                    earliest = t;
                }
            }
        }
        if (earliest === null) {
            return 'No markers in range on ' + describeTargets(list) + '.';
        }
        var delta = comp.time - earliest;
        var whole = { includeProtected: o.includeProtected, split: false };
        return runChanges('Move to playhead', o, function (markers, rr) {
            return MM.markers.shift(markers, delta, rr, whole);
        });
    }

    function quantise(o) {
        var comp = requireComp();
        return runChanges('Snap to frames', o, function (markers, r) {
            return MM.markers.quantise(markers, comp.frameRate, r, o);
        });
    }

    function remove(o) {
        var comp = requireComp();
        var list = targets(comp, o.target);
        var r = rangeFor(comp, o.range);
        var total = 0;
        undoable('Delete', function () {
            for (var i = 0; i < list.length; i++) {
                var idx = MM.markers.select(readAll(list[i].prop), r, o);
                removeIndices(list[i].prop, idx);
                total += idx.length;
            }
        });
        return 'Deleted ' + plural(total, 'marker') + ' from ' + describeTargets(list) + '.';
    }

    // The markers in range, from every target, as a clipboard. Markers at
    // the same time on different layers are only taken once.
    function collect(o) {
        var comp = requireComp();
        var list = targets(comp, o.target);
        var r = rangeFor(comp, o.range);
        var found = [];
        for (var i = 0; i < list.length; i++) {
            var markers = readAll(list[i].prop);
            var idx = MM.markers.select(markers, r, o);
            for (var j = 0; j < idx.length; j++) {
                found.push(markers[idx[j]]);
            }
        }
        found = MM.util.sortBy(found, function (m) { return m.time; });
        return { clip: MM.markers.toClip(MM.markers.dedupe(found, comp.frameRate)), list: list };
    }

    function copy(o, cut) {
        var c = collect(o);
        if (c.clip.markers.length === 0) {
            return { clip: null, message: 'No markers in range on ' + describeTargets(c.list) + '.' };
        }
        if (cut) {
            remove(o);
        }
        return {
            clip: c.clip,
            message: (cut ? 'Cut ' : 'Copied ') + plural(c.clip.markers.length, 'marker') + ' from ' + describeTargets(c.list) + '.'
        };
    }

    // o.atPlayhead: the earliest goes to the playhead (else original times).
    // o.clearRange: delete the markers in range first.
    function paste(o, clip) {
        if (!clip || clip.markers.length === 0) {
            return 'Nothing to paste.';
        }
        var comp = requireComp();
        var list = targets(comp, o.target);
        var markers = MM.markers.fromClip(clip, o.atPlayhead ? comp.time : null);
        var kept = [];
        for (var i = 0; i < markers.length; i++) {
            if (markers[i].time >= 0) {
                kept.push(markers[i]);
            }
        }
        var replaced = 0;
        undoable('Paste', function () {
            var r = rangeFor(comp, o.range);
            for (var j = 0; j < list.length; j++) {
                if (o.clearRange) {
                    removeIndices(list[j].prop, MM.markers.select(readAll(list[j].prop), r, o));
                }
                replaced += writeAll(list[j].prop, kept, comp.frameRate);
            }
        });
        var skipped = markers.length - kept.length;
        return 'Pasted ' + plural(kept.length, 'marker') + ' to ' + describeTargets(list) + replacedNote(replaced) +
            (skipped > 0 ? '; ' + skipped + ' would have been before the start, so left out' : '') + '.';
    }

    // ---- Work area -------------------------------------------------------

    function saveWorkArea() {
        var comp = requireComp();
        return { start: comp.workAreaStart, duration: comp.workAreaDuration, comp: comp.name };
    }

    function applyWorkArea(saved) {
        if (!saved) {
            return 'No work area saved yet.';
        }
        var comp = requireComp();
        var start = Math.max(0, Math.min(saved.start, comp.duration - comp.frameDuration));
        var duration = Math.max(comp.frameDuration, Math.min(saved.duration, comp.duration - start));
        undoable('Apply work area', function () {
            comp.workAreaStart = start;
            comp.workAreaDuration = duration;
        });
        return 'Work area set from ' + saved.comp + '.';
    }

    // ---- Comp markers guide layer ---------------------------------------
    // A guide layer carrying a copy of the comp markers, so J and K (which
    // only jump between layer markers) can jump between them.

    function findGuide(comp) {
        for (var i = 1; i <= comp.numLayers; i++) {
            if (comp.layer(i).comment === GUIDE_TAG) {
                return comp.layer(i);
            }
        }
        return null;
    }

    function guideLayer() {
        var comp = requireComp();
        var markers = readAll(comp.markerProperty);
        var made = false;
        undoable('Comp markers layer', function () {
            var layer = findGuide(comp);
            if (!layer) {
                layer = comp.layers.addNull(comp.duration);
                layer.name = 'Comp Markers';
                layer.comment = GUIDE_TAG;
                layer.guideLayer = true;
                layer.label = 0;
                made = true;
            }
            layer.startTime = 0;
            layer.inPoint = 0;
            layer.outPoint = comp.duration;
            var prop = layer.property('ADBE Marker');
            while (prop.numKeys > 0) {
                prop.removeKey(prop.numKeys);
            }
            writeAll(prop, markers, comp.frameRate);
        });
        return (made ? 'Made' : 'Updated') + ' the Comp Markers layer with ' + plural(markers.length, 'marker') + '.';
    }

    // ---- Triggers ----------------------------------------------------------

    function keyedProperties(comp) {
        var props = comp.selectedProperties;
        var out = [];
        for (var i = 0; i < props.length; i++) {
            var p = props[i];
            if (p.propertyType === PropertyType.PROPERTY && p.canSetExpression) {
                out.push(p);
            }
        }
        return out;
    }

    function applyTrigger(opts) {
        var comp = requireComp();
        var props = keyedProperties(comp);
        if (props.length === 0) {
            throw new Error('Select the keyframed properties to trigger (in the timeline).');
        }
        var text = MM.trigger.build(opts);
        var few = 0;
        undoable('Add trigger', function () {
            for (var i = 0; i < props.length; i++) {
                props[i].expression = text;
                props[i].expressionEnabled = true;
                if (props[i].numKeys < 2) {
                    few++;
                }
            }
        });
        return 'Trigger added to ' + plural(props.length, 'property', 'properties') +
            (few > 0 ? '; ' + few + ' need at least two keyframes to animate' : '') + '.';
    }

    function removeTrigger() {
        var comp = requireComp();
        var props = keyedProperties(comp);
        var n = 0;
        undoable('Remove trigger', function () {
            for (var i = 0; i < props.length; i++) {
                if (MM.trigger.isTrigger(props[i].expression)) {
                    props[i].expression = '';
                    n++;
                }
            }
        });
        return 'Trigger removed from ' + plural(n, 'property', 'properties') + '.';
    }

    // ---- Import and export -------------------------------------------------

    // existing: 'keep' (add alongside), 'imported' (replace what was
    // imported before, recognised by its source id), or 'all'.
    function importMarkers(markers, o) {
        var comp = requireComp();
        var list = targets(comp, o.target);
        var replaced = 0;
        var removed = 0;
        undoable('Import', function () {
            for (var i = 0; i < list.length; i++) {
                var prop = list[i].prop;
                if (o.existing === 'all' || o.existing === 'imported') {
                    var current = readAll(prop);
                    var idx = [];
                    for (var j = 0; j < current.length; j++) {
                        if (o.existing === 'all' || current[j].sourceId) {
                            idx.push(j);
                        }
                    }
                    removeIndices(prop, idx);
                    removed += idx.length;
                }
                replaced += writeAll(prop, markers, comp.frameRate);
            }
        });
        return 'Imported ' + plural(markers.length, 'marker') + ' to ' + describeTargets(list) +
            (removed > 0 ? ', replacing ' + removed : '') + replacedNote(replaced) + '.';
    }

    function exportMarkers(o) {
        var c = collect(o);
        return c.clip.markers;
    }

    function compInfo() {
        var comp = activeComp();
        if (!comp) {
            return null;
        }
        return { fps: comp.frameRate, displayStart: comp.displayStartTime, playhead: comp.time, name: comp.name };
    }

    return {
        activeComp: activeComp,
        compInfo: compInfo,
        count: count,
        move: move,
        moveToPlayhead: moveToPlayhead,
        quantise: quantise,
        remove: remove,
        copy: copy,
        paste: paste,
        saveWorkArea: saveWorkArea,
        applyWorkArea: applyWorkArea,
        guideLayer: guideLayer,
        applyTrigger: applyTrigger,
        removeTrigger: removeTrigger,
        importMarkers: importMarkers,
        exportMarkers: exportMarkers,
        // For the tests run inside After Effects.
        readAll: readAll,
        writeAll: writeAll
    };
})();

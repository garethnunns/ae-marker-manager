// Runs the built panel's actions inside After Effects, on a comp made for
// it and deleted afterwards: npm run test:ae (scripts/run-in-ae.mjs).
// Returns a summary line, "PASS ..." or "FAIL ...", then one line per
// failure.

(function () {
    var here = File($.fileName).parent;
    var dist = new File(here.parent.parent.fsName + '/dist/Marker Manager.jsx');
    var failures = [];
    var passed = 0;

    function check(name, ok, detail) {
        if (ok) {
            passed++;
        } else {
            failures.push(name + (detail !== undefined ? ' (' + detail + ')' : ''));
        }
    }
    function near(a, b) {
        return Math.abs(a - b) < 1e-4;
    }
    function times(prop) {
        var out = [];
        for (var i = 1; i <= prop.numKeys; i++) {
            out.push(Math.round(prop.keyTime(i) * 1000) / 1000);
        }
        return out.join(',');
    }

    $.global.MARKER_MANAGER_NO_UI = true;
    $.evalFile(dist);
    $.global.MARKER_MANAGER_NO_UI = false;
    var MM = $.global.MarkerManager;

    var comp = app.project.items.addComp('Marker Manager test', 1920, 1080, 1, 60, 25);
    try {
        comp.openInViewer();
        var cm = comp.markerProperty;
        function reset(list) {
            while (cm.numKeys > 0) {
                cm.removeKey(1);
            }
            MM.ae.writeAll(cm, list, 25);
        }
        function mk(t, extra) {
            var props = { time: t, comment: 'm' + t };
            extra = extra || {};
            for (var k in extra) {
                if (extra.hasOwnProperty(k)) {
                    props[k] = extra[k];
                }
            }
            return MM.markers.create(props);
        }
        var compOpts = { target: 'comp', range: 'workarea', split: false, includeProtected: true };

        check('the comp is active', MM.ae.activeComp() === comp);

        // Move within the work area.
        reset([mk(1), mk(2), mk(3), mk(10)]);
        comp.workAreaStart = 1.5;
        comp.workAreaDuration = 4;
        MM.ae.move(compOpts, 5);
        check('moves only the markers in the work area', times(cm) === '1,2.2,3.2,10', times(cm));
        MM.ae.move(compOpts, -5);
        check('moves back', times(cm) === '1,2,3,10', times(cm));

        // Names, durations and parameters survive a move.
        reset([mk(2, { duration: 1, chapter: 'c', url: 'u', label: 3, params: { k: 'v' }, sourceId: 'M7' })]);
        MM.ae.move(compOpts, 25);
        var read = MM.ae.readAll(cm)[0];
        check('keeps the marker\'s fields when moving',
            near(read.time, 3) && read.comment === 'm2' && near(read.duration, 1) && read.chapter === 'c' &&
            read.url === 'u' && read.label === 3 && read.params.k === 'v' && read.sourceId === 'M7',
            read.time + ' ' + read.comment + ' ' + read.duration + ' ' + read.label + ' ' + read.sourceId);

        // Split markers: only the start (in range) moves.
        reset([mk(4, { duration: 3 })]);
        MM.ae.move({ target: 'comp', range: 'workarea', split: true, includeProtected: true }, 10);
        read = MM.ae.readAll(cm)[0];
        check('split marker: start moves, end stays', near(read.time, 4.4) && near(read.duration, 2.6),
            read.time + ' / ' + read.duration);

        // Protected regions.
        reset([mk(2, { duration: 1, protectedRegion: true })]);
        MM.ae.move({ target: 'comp', range: 'workarea', split: false, includeProtected: false }, 5);
        check('leaves protected regions when asked', times(cm) === '2', times(cm));

        // Refuses to go before 0.
        reset([mk(0.1)]);
        var refused = false;
        try {
            MM.ae.move({ target: 'comp', range: 'comp', split: false, includeProtected: true }, -10);
        } catch (e) {
            refused = /before the start/.test(e.message);
        }
        check('refuses to move before the start', refused && times(cm) === '0.1', times(cm));

        // To the playhead, whole comp.
        reset([mk(1), mk(3)]);
        comp.time = 20;
        MM.ae.moveToPlayhead({ target: 'comp', range: 'comp', split: false, includeProtected: true });
        check('moves to the playhead keeping the gaps', times(cm) === '20,22', times(cm));

        // Before the playhead.
        reset([mk(1), mk(3), mk(30)]);
        comp.time = 10;
        MM.ae.move({ target: 'comp', range: 'before', split: false, includeProtected: true }, 25);
        check('moves only the markers before the playhead', times(cm) === '2,4,30', times(cm));

        // Snap to frames.
        reset([mk(1.01)]);
        MM.ae.quantise({ target: 'comp', range: 'comp', split: false, includeProtected: true });
        check('snaps to frames', times(cm) === '1', times(cm));

        // Copy from the comp, paste to two layers at the playhead.
        reset([mk(2), mk(3)]);
        var copied = MM.ae.copy(compOpts, false);
        check('copies', copied.clip && copied.clip.markers.length === 2);
        var a = comp.layers.addNull(60);
        var b = comp.layers.addNull(60);
        a.selected = true;
        b.selected = true;
        comp.time = 10;
        MM.ae.paste({ target: 'auto', range: 'workarea', atPlayhead: true, clearRange: false, includeProtected: true },
            copied.clip);
        check('pastes to each selected layer at the playhead',
            times(a.property('ADBE Marker')) === '10,11' && times(b.property('ADBE Marker')) === '10,11',
            times(a.property('ADBE Marker')) + ' / ' + times(b.property('ADBE Marker')));
        check('the comp markers are left alone', times(cm) === '2,3', times(cm));

        // Cut from the layers, paste back at original times with clear.
        var layerOpts = { target: 'layers', range: 'comp', split: false, includeProtected: true };
        var cut = MM.ae.copy(layerOpts, true);
        check('cut takes one copy of markers at the same time', cut.clip.markers.length === 2);
        check('cut removes them', a.property('ADBE Marker').numKeys === 0 && b.property('ADBE Marker').numKeys === 0);
        a.selected = false;
        b.selected = false;
        MM.ae.paste({ target: 'comp', range: 'comp', atPlayhead: false, clearRange: true, includeProtected: true },
            cut.clip);
        check('paste with clear replaces what was there', times(cm) === '10,11', times(cm));

        // Delete in the work area only.
        reset([mk(1), mk(2), mk(3), mk(10)]);
        MM.ae.remove(compOpts);
        check('deletes only in the work area', times(cm) === '1,10', times(cm));

        // Banks survive the settings round trip.
        MM.settings.setObject('testBank', copied.clip);
        var bank = MM.settings.getObject('testBank');
        check('banks are kept in the settings', bank && bank.markers.length === 2 && bank.markers[0].comment === 'm2');
        MM.settings.set('testBank', '');

        // Work area.
        comp.workAreaStart = 4;
        comp.workAreaDuration = 2;
        var saved = MM.ae.saveWorkArea();
        comp.workAreaStart = 0;
        comp.workAreaDuration = 60;
        MM.ae.applyWorkArea(saved);
        check('saves and applies the work area', near(comp.workAreaStart, 4) && near(comp.workAreaDuration, 2));

        // Comp markers guide layer, made then updated.
        reset([mk(1), mk(5)]);
        MM.ae.guideLayer();
        reset([mk(1), mk(5), mk(7)]);
        MM.ae.guideLayer();
        var guides = 0;
        var guide = null;
        for (var i = 1; i <= comp.numLayers; i++) {
            if (comp.layer(i).name === 'Comp Markers') {
                guides++;
                guide = comp.layer(i);
            }
        }
        check('one guide layer, updated', guides === 1 && guide.guideLayer && times(guide.property('ADBE Marker')) === '1,5,7',
            guides + ' ' + (guide ? times(guide.property('ADBE Marker')) : ''));

        // Trigger expression on keyframed opacity.
        var solid = comp.layers.addSolid([1, 0, 0], 'Trigger test', 100, 100, 1, 60);
        var opacity = solid.property('ADBE Transform Group').property('ADBE Opacity');
        opacity.setValueAtTime(0, 0);
        opacity.setValueAtTime(1, 100);
        var sm = solid.property('ADBE Marker');
        sm.setValueAtTime(10, new MarkerValue('go'));
        for (var j = 1; j <= comp.numLayers; j++) {
            comp.layer(j).selected = false;
        }
        opacity.selected = true;
        MM.ae.applyTrigger({ source: 'layer' });
        check('the trigger expression has no errors', opacity.expressionError === '', opacity.expressionError);
        check('trigger holds the start before the marker', near(opacity.valueAtTime(5, false), 0), opacity.valueAtTime(5, false));
        check('trigger plays from the marker', near(opacity.valueAtTime(10.5, false), 50), opacity.valueAtTime(10.5, false));
        check('trigger holds the end after', near(opacity.valueAtTime(30, false), 100), opacity.valueAtTime(30, false));
        MM.ae.removeTrigger();
        check('removes the trigger', opacity.expression === '');

        // Import, then import again replacing what was imported.
        reset([mk(30)]);
        var imported = [MM.markers.create({ time: 1, comment: 'A', sourceId: 'M1' }),
            MM.markers.create({ time: 2, duration: 1, comment: 'B', sourceId: 'R1' })];
        var importOpts = { target: 'comp', range: 'comp', existing: 'imported' };
        MM.ae.importMarkers(imported, importOpts);
        MM.ae.importMarkers([MM.markers.create({ time: 4, comment: 'A2', sourceId: 'M1' })], importOpts);
        check('importing again replaces what was imported and keeps the rest', times(cm) === '4,30', times(cm));

        // The panel builds (as a floating window, closed again straight away).
        var built = false;
        try {
            var win = MM.ui.build(null);
            built = win instanceof Window && win.children.length > 0;
            win.close();
        } catch (e2) {
            failures.push('the panel builds (' + e2.message + ' line ' + e2.line + ')');
        }
        check('the panel builds', built);
    } catch (e) {
        failures.push('stopped: ' + e.message + ' (line ' + e.line + ')');
    } finally {
        comp.remove();
    }

    var summary = (failures.length === 0 ? 'PASS ' : 'FAIL ') + passed + ' passed, ' + failures.length + ' failed';
    var result = [summary].concat(failures).join('\n');
    // scripts/run-in-ae.mjs reads the result from this file, or from here
    // when scripts aren't allowed to write files.
    $.global.MARKER_MANAGER_LAST = result;
    if ($.global.MARKER_MANAGER_RESULT) {
        var out = new File($.global.MARKER_MANAGER_RESULT);
        out.encoding = 'UTF-8';
        if (out.open('w')) {
            out.write(result);
            out.close();
        }
    }
    return result;
})();

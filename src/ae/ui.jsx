// The panel: dockable when installed in ScriptUI Panels, a floating window
// when run from File > Scripts. Tabs: Move, Copy, Animate, Import, Export.
// Kept compact: a docked panel can't scroll, so anything taller than its
// frame is cut off.
//
// Moving with a modifier held: Shift moves ten times as far, Alt (Option)
// moves the other way.

MM.ui = (function () {
    var S = MM.settings;
    var CLIP_KEY = '__markerManagerClipboard';
    var BANKS = 5;

    var TARGETS = [['auto', 'Auto'], ['comp', 'Comp'], ['layers', 'Selected layers']];
    var RANGES = [['workarea', 'Work area'], ['comp', 'Whole comp'], ['before', 'Before playhead'], ['after', 'After playhead']];
    var UNITS = [['frames', 'frames'], ['seconds', 'seconds']];
    var SOURCES = [['layer', 'Its layer\'s markers'], ['comp', 'Comp markers'], ['other', 'Another layer']];
    var FORMATS = [['auto', 'Times: auto'], ['timecode', 'Timecode'], ['clock', 'Minutes:seconds'],
        ['seconds', 'Seconds'], ['frames', 'Frames'], ['samples', 'Samples']];
    var PLACES = [['timecode', 'At their timecode'], ['start', 'From the comp\'s start'],
        ['playhead', 'From the playhead'], ['first', 'First one at the playhead']];
    var EXISTING = [['imported', 'Replace imported'], ['keep', 'Keep all'], ['all', 'Replace all']];
    var EXPORT_FORMATS = [['timecode', 'Timecode'], ['clock', 'Minutes:seconds'], ['seconds', 'Seconds']];

    // ---- Small builders -----------------------------------------------------

    function group(parent, orientation) {
        var g = parent.add('group');
        g.orientation = orientation || 'row';
        g.alignChildren = ['left', 'center'];
        g.spacing = 6;
        g.margins = 0;
        return g;
    }

    // A bold line of text above a few rows: lighter than a framed panel,
    // which matters as a docked panel can't scroll.
    function heading(parent, text) {
        var t = parent.add('statictext', undefined, text);
        try {
            t.graphics.font = ScriptUI.newFont(t.graphics.font.name, 'BOLD', t.graphics.font.size);
        } catch (e) {}
        return t;
    }

    function label(parent, text, width) {
        var t = parent.add('statictext', undefined, text);
        if (width) {
            t.preferredSize.width = width;
        }
        return t;
    }

    function button(parent, text, tip, onClick) {
        var b = parent.add('button', undefined, text);
        b.helpTip = tip;
        b.onClick = onClick;
        return b;
    }

    function check(parent, text, tip, key, fallback) {
        var c = parent.add('checkbox', undefined, text);
        c.helpTip = tip;
        c.value = S.getBool(key, fallback);
        c.onClick = function () { S.set(key, c.value); };
        return c;
    }

    // A drop-down of [value, label] pairs, remembered under key.
    function choice(parent, items, tip, key, fallback) {
        var labels = [];
        for (var i = 0; i < items.length; i++) {
            labels.push(items[i][1]);
        }
        var d = parent.add('dropdownlist', undefined, labels);
        d.helpTip = tip;
        var saved = S.get(key, fallback);
        d.selection = 0;
        for (var j = 0; j < items.length; j++) {
            if (items[j][0] === saved) {
                d.selection = j;
            }
        }
        d.pick = function () {
            return d.selection ? items[d.selection.index][0] : items[0][0];
        };
        d.onChange = function () { S.set(key, d.pick()); };
        return d;
    }

    function field(parent, text, tip, key, width) {
        var e = parent.add('edittext', undefined, S.get(key, text));
        e.helpTip = tip;
        e.preferredSize.width = width || 60;
        e.onChange = function () { S.set(key, e.text); };
        return e;
    }

    function keyState() {
        try {
            var k = ScriptUI.environment.keyboardState;
            return { shift: k.shiftKey, alt: k.altKey };
        } catch (e) {
            return { shift: false, alt: false };
        }
    }

    // The height a column of controls needs: its children's preferred
    // heights, the spacing between them and its margins.
    function contentHeight(container) {
        var m = container.margins;
        var h = (m.length ? m[1] + m[3] : 2 * m) + container.spacing * Math.max(0, container.children.length - 1);
        for (var i = 0; i < container.children.length; i++) {
            h += container.children[i].preferredSize.height;
        }
        return Math.ceil(h);
    }

    // ---- The panel ------------------------------------------------------------

    function build(thisObj) {
        var win = (thisObj instanceof Panel)
            ? thisObj
            : new Window('palette', 'Marker Manager', undefined, { resizeable: true });
        win.orientation = 'column';
        win.alignChildren = ['fill', 'top'];
        win.spacing = 4;
        win.margins = 6;

        var status;
        function say(text) {
            status.text = text;
        }
        // Runs an action, showing what it said or the error it hit.
        function run(fn) {
            return function () {
                try {
                    var message = fn();
                    if (message) {
                        say(message);
                    }
                } catch (e) {
                    say(e.message);
                    alert(e.message, 'Marker Manager');
                }
            };
        }

        // Which markers: shared by every tab. Kept to two rows, as a docked
        // panel can't scroll.
        var gWhere = group(win);
        label(gWhere, 'Source');
        var target = choice(gWhere, TARGETS,
            'Whose markers to use. Auto uses the selected layers, or the comp\'s with none selected.',
            'target', 'auto');
        label(gWhere, 'Region');
        var rangeList = choice(gWhere, RANGES, 'Which of their markers: those starting in this time.', 'range', 'workarea');
        var gFlags = group(win);
        var split = check(gFlags, 'Split markers',
            'Markers with a duration move each end separately: only the ends in range move.', 'split', false);
        var prot = check(gFlags, 'Protected regions',
            'Include protected region markers. Off leaves them where they are.', 'protected', true);

        function opts(extra) {
            var o = {
                target: target.pick(),
                range: rangeList.pick(),
                split: split.value,
                includeProtected: prot.value
            };
            // ExtendScript throws on for-in over undefined.
            extra = extra || {};
            for (var k in extra) {
                if (extra.hasOwnProperty(k)) {
                    o[k] = extra[k];
                }
            }
            return o;
        }

        // Tabs, made from radio buttons over a stack rather than a
        // tabbedpanel: a docked panel is given the height it asks for, and a
        // tabbedpanel on macOS asks for no more than its row of tabs, so
        // everything under them was cut off. A stack asks for its tallest page.
        var gNav = group(win);
        gNav.spacing = 10;
        // What the last action did (how many markers moved, or why none
        // did), under the tabs so it's always in view: a docked panel shorter
        // than its pages cuts off what's below them. Empty until then.
        status = win.add('statictext', undefined, ' ', { truncate: 'end' });
        status.alignment = ['fill', 'top'];
        status.helpTip = 'What the last action did. Marker Manager ' + MM.VERSION + '.';
        var stack = win.add('group');
        stack.orientation = 'stack';
        stack.alignment = ['fill', 'top'];
        stack.alignChildren = ['fill', 'top'];
        var pages = [];
        function show(index) {
            for (var i = 0; i < pages.length; i++) {
                pages[i].page.visible = i === index;
                pages[i].radio.value = i === index;
            }
            S.set('tab', index);
        }
        function tab(name) {
            var index = pages.length;
            var radio = gNav.add('radiobutton', undefined, name);
            radio.onClick = function () { show(index); };
            var page = stack.add('group');
            page.orientation = 'column';
            page.alignChildren = ['left', 'top'];
            page.spacing = 4;
            page.margins = [0, 4, 0, 0];
            pages.push({ radio: radio, page: page });
            return page;
        }

        // -- Move --
        var tMove = tab('Move');
        function moveBy(direction) {
            return run(function () {
                var n = parseFloat(amount.text);
                if (isNaN(n) || n <= 0) {
                    throw new Error('Enter how far to move them, more than 0.');
                }
                var comp = MM.ae.activeComp();
                if (!comp) {
                    throw new Error('Open a composition first.');
                }
                var keys = keyState();
                var frames = unit.pick() === 'seconds' ? n * comp.frameRate : n;
                frames = frames * direction * (keys.shift ? 10 : 1) * (keys.alt ? -1 : 1);
                return MM.ae.move(opts(), frames);
            });
        }
        var gArrows = group(tMove);
        var bBack10 = button(gArrows, '\u25C0\u25C0', 'Earlier, ten times as far.', moveBy(-10));
        var bBack = button(gArrows, '\u25C0', 'Earlier (Shift: ten times as far, Alt: later).', moveBy(-1));
        var amount = field(gArrows, '1', 'How far each click moves them.', 'amount', 36);
        var unit = choice(gArrows, UNITS, 'Frames or seconds.', 'unit', 'frames');
        var bOn = button(gArrows, '\u25B6', 'Later (Shift: ten times as far, Alt: earlier).', moveBy(1));
        var bOn10 = button(gArrows, '\u25B6\u25B6', 'Later, ten times as far.', moveBy(10));
        bBack.preferredSize.width = bOn.preferredSize.width = 30;
        bBack10.preferredSize.width = bOn10.preferredSize.width = 38;

        var gMoveMore = group(tMove);
        button(gMoveMore, 'To playhead', 'Moves them together so the first starts at the playhead.',
            run(function () { return MM.ae.moveToPlayhead(opts()); }));
        button(gMoveMore, 'Snap', 'Moves any that are between frames onto the nearest one.',
            run(function () { return MM.ae.quantise(opts()); }));
        button(gMoveMore, 'Delete', 'Deletes them.',
            run(function () { return MM.ae.remove(opts()); }));
        button(gMoveMore, 'Count', 'Says how many markers are in range.',
            run(function () { return MM.ae.count(opts()); }));

        var gWork = group(tMove);
        label(gWork, 'Work area');
        button(gWork, 'Save', 'Remembers this comp\'s work area, to put back here or on another comp.',
            run(function () {
                var w = MM.ae.saveWorkArea();
                S.setObject('workArea', w);
                return 'Work area saved from ' + w.comp + '.';
            }));
        button(gWork, 'Apply', 'Sets this comp\'s work area to the saved one.',
            run(function () { return MM.ae.applyWorkArea(S.getObject('workArea')); }));
        button(gWork, 'Comp markers layer', 'Makes (or brings up to date) a guide layer with a copy of the comp ' +
            'markers, so J and K jump between them.', run(function () { return MM.ae.guideLayer(); }));

        // -- Copy --
        var tCopy = tab('Copy');
        function getClip() {
            return $.global[CLIP_KEY] || null;
        }
        function setClip(clip) {
            $.global[CLIP_KEY] = clip;
        }
        function copyAction(cut) {
            return run(function () {
                var r = MM.ae.copy(opts(), cut);
                if (r.clip) {
                    setClip(r.clip);
                }
                return r.message;
            });
        }
        var atPlayhead, clearRange;
        function pasteOpts() {
            return opts({ atPlayhead: atPlayhead.value, clearRange: clearRange.value });
        }
        var gCopy = group(tCopy);
        button(gCopy, 'Copy', 'Copies them, from every layer they\'re on.', copyAction(false));
        button(gCopy, 'Cut', 'Copies them and deletes them.', copyAction(true));
        button(gCopy, 'Paste', 'Pastes what was copied onto the selected layers, or the comp.',
            run(function () { return MM.ae.paste(pasteOpts(), getClip()); }));
        var gPasteOpts = group(tCopy);
        atPlayhead = check(gPasteOpts, 'At playhead',
            'The first goes at the playhead and the rest follow as spaced. Off pastes them at their own times.',
            'atPlayhead', false);
        clearRange = check(gPasteOpts, 'Clear range first',
            'Deletes the markers in range on each layer (or the comp) before pasting.', 'clearRange', false);

        heading(tCopy, 'Memory banks (kept between sessions)');
        function bankKey(n) {
            return 'bank' + n;
        }
        var recallButtons = [];
        function showBanks() {
            for (var i = 0; i < recallButtons.length; i++) {
                var bk = S.getObject(bankKey(i + 1));
                recallButtons[i].helpTip = bk
                    ? 'Pastes bank ' + (i + 1) + ': ' + bk.markers.length + ' marker' + (bk.markers.length === 1 ? '' : 's') + '.'
                    : 'Bank ' + (i + 1) + ' is empty.';
            }
        }
        function storeBank(n) {
            return run(function () {
                var clip = getClip();
                if (!clip) {
                    throw new Error('Copy some markers first, then store them.');
                }
                S.setObject(bankKey(n), clip);
                showBanks();
                return 'Stored ' + clip.markers.length + ' in bank ' + n + '.';
            });
        }
        function recallBank(n) {
            return run(function () {
                var clip = S.getObject(bankKey(n));
                if (!clip) {
                    throw new Error('Bank ' + n + ' is empty.');
                }
                return MM.ae.paste(pasteOpts(), clip);
            });
        }
        var gStore = group(tCopy);
        label(gStore, 'Store', 36);
        var gRecall = group(tCopy);
        label(gRecall, 'Paste', 36);
        for (var b = 1; b <= BANKS; b++) {
            var sb = button(gStore, String(b), 'Stores what was copied in bank ' + b + '.', storeBank(b));
            var rb = button(gRecall, String(b), '', recallBank(b));
            sb.preferredSize.width = rb.preferredSize.width = 30;
            recallButtons.push(rb);
        }
        showBanks();

        // -- Animate --
        var tAnim = tab('Animate');
        var gSource = group(tAnim);
        label(gSource, 'From', 44);
        var source = choice(gSource, SOURCES, 'Which markers start the selected properties\' keyframes.',
            'trigSource', 'layer');
        var layerName = field(gSource, '', 'The layer whose markers to use, for "Another layer".', 'trigLayer', 90);
        var gFilter = group(tAnim);
        label(gFilter, 'Named', 44);
        var filter = field(gFilter, '', 'Only markers whose name contains this. Empty for all of them.',
            'trigFilter', 90);
        label(gFilter, 'Delay');
        var delay = field(gFilter, '0', 'Frames after each marker to start.', 'trigDelay', 30);
        label(gFilter, 'Length');
        var duration = field(gFilter, '0', 'Frames the animation takes. 0 keeps it as keyframed.', 'trigDuration', 30);
        var gTrigFlags = group(tAnim);
        var fit = check(gTrigFlags, 'Fit to marker duration',
            'Markers with a duration stretch the animation to fit it.', 'trigFit', false);
        var reverse = check(gTrigFlags, 'Reverse', 'Plays the keyframes backwards.', 'trigReverse', false);
        function syncLayerField() {
            layerName.enabled = source.pick() === 'other';
        }
        var sourceChanged = source.onChange;
        source.onChange = function () {
            sourceChanged();
            syncLayerField();
        };
        syncLayerField();
        var gTrig = group(tAnim);
        button(gTrig, 'Add trigger', 'Plays the selected properties\' keyframes from each marker.',
            run(function () {
                return MM.ae.applyTrigger({
                    source: source.pick(),
                    layerName: layerName.text,
                    filter: filter.text,
                    delay: parseFloat(delay.text) || 0,
                    duration: parseFloat(duration.text) || 0,
                    fit: fit.value,
                    reverse: reverse.value
                });
            }));
        button(gTrig, 'Remove trigger', 'Takes the trigger expression off the selected properties.',
            run(function () { return MM.ae.removeTrigger(); }));

        // -- Import --
        var tImport = tab('Import');
        function rate(text, comp) {
            var n = parseFloat(text);
            return isNaN(n) || n <= 0 ? comp.fps : n;
        }
        var gPlace = group(tImport);
        label(gPlace, 'Place', 44);
        var place = choice(gPlace, PLACES, 'Where the markers go.', 'place', 'timecode');
        var importQuantise = check(gPlace, 'Snap', 'Puts each marker on the nearest frame.', 'importQuantise', true);
        var gExisting = group(tImport);
        label(gExisting, 'Existing', 44);
        var existing = choice(gExisting, EXISTING, 'What happens to markers already there.', 'existing', 'imported');

        function importThese(markers, offset, warnings) {
            var info = MM.ae.compInfo();
            var placed = MM.place.apply(markers, place.pick(), {
                displayStart: info.displayStart,
                playhead: info.playhead,
                offset: offset,
                fps: info.fps,
                quantise: importQuantise.value
            });
            if (placed.markers.length === 0) {
                throw new Error('Every marker would land before the comp\'s start. Try another Place.');
            }
            var message = MM.ae.importMarkers(placed.markers, opts({ existing: existing.pick() }));
            var notes = [];
            if (placed.skipped > 0) {
                notes.push(placed.skipped + ' before the comp\'s start left out');
            }
            if (warnings && warnings.length > 0) {
                notes.push(warnings.length + ' rows skipped');
            }
            return message + (notes.length ? ' (' + notes.join('; ') + ')' : '');
        }

        heading(tImport, 'CSV file');
        var gCsv = group(tImport);
        var format = choice(gCsv, FORMATS, 'How the times in the file are written.', 'csvFormat', 'auto');
        label(gCsv, 'fps');
        var csvFps = field(gCsv, '', 'The file\'s frame rate, for timecode and frames. Empty uses the comp\'s.',
            'csvFps', 36);
        label(gCsv, 'Hz');
        var sampleRate = field(gCsv, '48000', 'Sample rate, for times in samples.', 'sampleRate', 46);
        button(tImport, 'Import CSV\u2026', 'Chooses a CSV file and imports its markers.', run(function () {
            var info = MM.ae.compInfo();
            if (!info) {
                throw new Error('Open a composition first.');
            }
            var file = MM.io.chooseCsv();
            if (!file) {
                return null;
            }
            var rows = MM.csv.parse(MM.io.readText(file));
            var result = MM.table.toMarkers(rows, {
                format: format.pick(),
                fps: rate(csvFps.text, info),
                sampleRate: parseFloat(sampleRate.text)
            });
            if (result.error) {
                throw new Error(result.error);
            }
            if (result.warnings.length > 0) {
                $.writeln('Marker Manager: ' + result.warnings.join('\n'));
            }
            return importThese(result.markers, 0, result.warnings);
        }));

        heading(tImport, 'Reaper');
        var gHost = group(tImport);
        var host = field(gHost, '127.0.0.1', 'Where Reaper is running (127.0.0.1 for this computer).', 'reaperHost', 90);
        label(gHost, ':');
        var port = field(gHost, '8080', 'The port of Reaper\'s web interface.', 'reaperPort', 40);
        label(gHost, 'fps');
        var reaperFps = field(gHost, '', 'Reaper\'s project frame rate, to read its project start time. ' +
            'Empty uses the comp\'s.', 'reaperFps', 36);
        var gReaper = group(tImport);
        var rMarkers = check(gReaper, 'Markers', 'Import Reaper\'s markers.', 'reaperMarkers', true);
        var rRegions = check(gReaper, 'Regions', 'Import Reaper\'s regions, as markers with a duration.',
            'reaperRegions', true);
        button(gReaper, 'Pull from Reaper', 'Reads the markers from Reaper now and imports them.', run(function () {
            var info = MM.ae.compInfo();
            if (!info) {
                throw new Error('Open a composition first.');
            }
            var parsed = MM.reaper.parseBody(MM.io.fetchReaper(MM.util.trim(host.text), MM.util.trim(port.text)));
            var markers = MM.reaper.toMarkers(parsed, { markers: rMarkers.value, regions: rRegions.value });
            if (markers.length === 0) {
                throw new Error('Reaper has no markers or regions to import.');
            }
            var offset = 0;
            if (place.pick() === 'timecode') {
                offset = MM.reaper.startOffset(parsed.transport, rate(reaperFps.text, info));
                if (offset === null) {
                    say('Couldn\'t read Reaper\'s project start time (set its ruler to timecode); using 0.');
                    offset = 0;
                }
            }
            return importThese(markers, offset, null);
        }));

        // -- Export --
        var tExport = tab('Export');
        label(tExport, 'Saves the markers in range as a CSV file, laid out as Reaper\'s.');
        var gExport = group(tExport);
        label(gExport, 'Times');
        var exportFormat = choice(gExport, EXPORT_FORMATS, 'How times are written.', 'exportFormat', 'timecode');
        button(gExport, 'Export CSV\u2026', 'Saves the markers in range as a CSV file.',
            run(function () {
                var info = MM.ae.compInfo();
                if (!info) {
                    throw new Error('Open a composition first.');
                }
                var markers = MM.ae.exportMarkers(opts());
                if (markers.length === 0) {
                    throw new Error('No markers in range to export.');
                }
                var fmt = exportFormat.pick();
                var rows = MM.table.fromMarkers(markers, function (t, isLength) {
                    var shown = isLength ? t : t + info.displayStart;
                    if (fmt === 'seconds') {
                        return String(Math.round(shown * 1000) / 1000);
                    }
                    if (fmt === 'clock') {
                        return MM.time.secondsToClock(shown);
                    }
                    return MM.time.secondsToTimecode(shown, info.fps, MM.time.isDropFrameRate(info.fps));
                });
                var file = MM.io.saveCsv(info.name + ' markers.csv', MM.csv.stringify(rows));
                return file ? 'Exported ' + markers.length + ' markers to ' + file.displayName + '.' : null;
            }));

        var lastTab = parseInt(S.get('tab', '0'), 10);
        show(lastTab >= 0 && lastTab < pages.length ? lastTab : 0);


        win.onResizing = win.onResize = function () {
            this.layout.resize();
        };
        win.layout.layout(true);
        if (!(win instanceof Window)) {
            // Docked in a stacked group, After Effects shares the column's
            // height between the open panels and cuts off what doesn't fit,
            // unless the panel says how tall it has to be.
            win.minimumSize = [220, contentHeight(win)];
            win.layout.layout(true);
        }
        if (win instanceof Window) {
            win.center();
            win.show();
        }
        return win;
    }

    return { build: build };
})();

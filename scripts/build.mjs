// Joins the source into one script, dist/Marker Manager.jsx: what goes in
// After Effects' ScriptUI Panels folder (or runs from File > Scripts).
//
// Loaded with $.global.MARKER_MANAGER_NO_UI set, it builds no panel and
// leaves its code at $.global.MarkerManager instead (the tests in
// tests/ae use that).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { CORE, AE, OUT } from './files.mjs';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));

const parts = [...CORE, ...AE].map(
  (f) => `// ---- ${f} ----\n${readFileSync(f, 'utf8').trim()}\n`,
);

const script = `// Marker Manager ${pkg.version}
// Move, copy and paste After Effects markers in bulk, trigger animation from
// them, and import them from CSV files and Reaper.
// ${pkg.homepage}
// MIT License - see LICENSE in the repository.

(function (thisObj) {
var MM = { VERSION: '${pkg.version}' };

${parts.join('\n')}
if ($.global.MARKER_MANAGER_NO_UI) {
    $.global.MarkerManager = MM;
    return;
}
// The development loader (npm run install:dev) runs this file with
// $.evalFile, so it passes its panel over here.
var host = $.global.MARKER_MANAGER_HOST;
$.global.MARKER_MANAGER_HOST = null;
MM.ui.build(host || thisObj);
})(this);
`;

// ExtendScript reads a script without a byte order mark in the system's
// encoding, so anything outside ASCII is escaped in the source instead.
if (/[^\x00-\x7f]/.test(script)) {
  const line = script.split('\n').findIndex((l) => /[^\x00-\x7f]/.test(l)) + 1;
  console.error(`Non-ASCII character in the built script (line ${line}); escape it (\\u....).`);
  process.exit(1);
}

mkdirSync('dist', { recursive: true });
writeFileSync(OUT, script);
console.log(`Built ${OUT} (${script.length} bytes)`);

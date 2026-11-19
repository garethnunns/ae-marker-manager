// Runs a test script in the After Effects that's open (macOS, through
// AppleScript) and prints what it found. The script writes its result to
// the file named in $.global.MARKER_MANAGER_RESULT, as DoScript doesn't
// reliably hand a script's result back. Fails unless it starts PASS.
// Pick the app with AE_APP="Adobe After Effects 2026".
//
// Without After Effects' "Allow Scripts to Write Files and Access Network"
// it reads the result back a character at a time instead, which is slower.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const script = resolve(process.argv[2] || 'tests/ae/smoke.jsx');

function running() {
  const names = execFileSync('osascript', ['-e',
    'tell application "System Events" to get name of every application process whose name contains "After Effects"'],
  { encoding: 'utf8' }).trim();
  return names ? names.split(', ') : [];
}

let app = process.env.AE_APP;
if (!app) {
  const open = running().filter((n) => !/Render Engine/.test(n));
  if (open.length === 0) {
    console.error('After Effects isn\'t open. Open it (with a project it\'s fine to add a test comp to) and try again.');
    process.exit(1);
  }
  app = open[0];
}

const resultFile = join(mkdtempSync(join(tmpdir(), 'marker-manager-')), 'result.txt');
const js = `$.global.MARKER_MANAGER_RESULT = ${JSON.stringify(resultFile)}; ` +
  `$.evalFile(new File(${JSON.stringify(script)}));`;
function doScript(code, timeout = 20) {
  const as = `with timeout of ${timeout} seconds\ntell application "${app}" to DoScript ${JSON.stringify(code)}\nend timeout`;
  return execFileSync('osascript', ['-e', as], { encoding: 'utf8', timeout: (timeout + 30) * 1000 }).trim();
}

doScript(js, 120);

let out;
if (existsSync(resultFile)) {
  out = readFileSync(resultFile, 'utf8').trim();
  rmSync(resultFile);
} else {
  // Without "Allow Scripts to Write Files and Access Network" the script
  // can't write the file. DoScript only hands back numbers, so read the
  // result it left in $.global a character code at a time.
  const length = Number(doScript('$.global.MARKER_MANAGER_LAST ? $.global.MARKER_MANAGER_LAST.length : -1'));
  if (!(length > 0)) {
    console.error(`${app} ran the script but left no result: look for an error dialog in After Effects.`);
    process.exit(1);
  }
  const codes = [];
  for (let i = 0; i < length; i += 1) {
    codes.push(Number(doScript(`$.global.MARKER_MANAGER_LAST.charCodeAt(${i})`)));
  }
  out = String.fromCharCode(...codes).trim();
}
console.log(`${app}:\n${out}`);
if (!/^PASS/.test(out)) {
  process.exit(1);
}

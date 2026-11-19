// Copies the built panel into After Effects' ScriptUI Panels folder, so it
// shows in the Window menu after a restart. Goes in the newest After Effects
// installed, or the one named: npm run install:ae -- "Adobe After Effects 2026".
// That folder belongs to the system, so this may ask for your password.
import { existsSync, readdirSync, copyFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { OUT } from './files.mjs';

const apps = process.platform === 'win32' ? 'C:\\Program Files\\Adobe' : '/Applications';
const wanted = process.argv[2];
const found = readdirSync(apps)
  .filter((n) => /^Adobe After Effects/.test(n) && (!wanted || n === wanted))
  .sort();
if (found.length === 0) {
  console.error(wanted ? `No ${wanted} in ${apps}.` : `No After Effects found in ${apps}.`);
  process.exit(1);
}
// Released versions sort after (Beta); take the newest release.
const app = found.filter((n) => !/Beta/.test(n)).pop() || found.pop();
const panels = process.platform === 'win32'
  ? join(apps, app, 'Support Files', 'Scripts', 'ScriptUI Panels')
  : join(apps, app, 'Scripts', 'ScriptUI Panels');
if (!existsSync(panels)) {
  console.error(`${panels} doesn't exist.`);
  process.exit(1);
}
const dest = join(panels, 'Marker Manager.jsx');
try {
  copyFileSync(OUT, dest);
} catch (e) {
  if (process.platform === 'win32' || e.code !== 'EACCES') {
    throw e;
  }
  execFileSync('sudo', ['cp', OUT, dest], { stdio: 'inherit' });
}
console.log(`Installed in ${dest}. Restart ${app}, then open it from Window > Marker Manager.jsx.`);

// Installs a small loader in After Effects' ScriptUI Panels folder that runs
// dist/Marker Manager.jsx from this repository. Once it's in, a change only
// needs npm run build and the panel closed and opened again (Window >
// Marker Manager (dev).jsx), with no copying or password. The folder belongs
// to the system, so installing the loader may ask for your password once.
import { writeFileSync, readdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { OUT } from './files.mjs';

const apps = '/Applications';
const wanted = process.argv[2];
const found = readdirSync(apps).filter((n) => /^Adobe After Effects/.test(n) && (!wanted || n === wanted)).sort();
const app = found.filter((n) => !/Beta/.test(n)).pop() || found.pop();
if (!app) {
  console.error('No After Effects found.');
  process.exit(1);
}
const panels = join(apps, app, 'Scripts', 'ScriptUI Panels');
if (!existsSync(panels)) {
  console.error(`${panels} doesn't exist.`);
  process.exit(1);
}
const loader = `// Marker Manager development loader: runs the build in the repository.
$.global.MARKER_MANAGER_HOST = this;
$.evalFile(new File(${JSON.stringify(resolve(OUT))}));
`;
const tmp = join(tmpdir(), 'Marker Manager (dev).jsx');
writeFileSync(tmp, loader);
const dest = join(panels, 'Marker Manager (dev).jsx');
execFileSync('sudo', ['cp', tmp, dest], { stdio: 'inherit' });
console.log(`Installed ${dest}. Restart ${app} once, then open Window > Marker Manager (dev).jsx.`);

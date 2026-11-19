// Loads src/core, as the built script does, and returns its MM object. Core
// is plain ES3, so it runs the same here as in After Effects. Each file runs
// as a function of MM in this realm (not a vm context), so the arrays it
// makes compare equal to the tests' own.
import { readFileSync } from 'node:fs';
import { CORE } from '../scripts/files.mjs';

export function loadCore() {
  const MM = {};
  for (const file of CORE) {
    new Function('MM', `${readFileSync(file, 'utf8')}\n//# sourceURL=${file}`)(MM);
  }
  return MM;
}

// ExtendScript is ES3: no let/const, arrow functions, trailing commas in
// literals, getters, or reserved words as property names. Every source file
// and the built script must parse as ES3.
import { readFileSync } from 'node:fs';
import { parse } from 'acorn';
import { CORE, AE, OUT } from './files.mjs';

let failed = false;
for (const file of [...CORE, ...AE, OUT, 'tests/ae/smoke.jsx']) {
  try {
    parse(readFileSync(file, 'utf8'), { ecmaVersion: 3, allowReserved: false });
  } catch (e) {
    failed = true;
    console.error(`${file}: ${e.message}`);
  }
}
if (failed) {
  process.exit(1);
}
console.log('All scripts are ES3.');

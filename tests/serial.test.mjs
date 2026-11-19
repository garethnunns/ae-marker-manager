import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadCore } from './load.mjs';

const { serial } = loadCore();
const plain = (x) => JSON.parse(JSON.stringify(x));

test('round trips what the banks and settings hold', () => {
  const value = { ref: 1.5, markers: [{ time: 1.5, comment: 'Line\n"two"\t\\', eventCuePoint: false, params: {} }], none: null };
  const text = serial.stringify(value);
  assert.deepEqual(JSON.parse(text), value, 'writes JSON');
  assert.deepEqual(plain(serial.parse(text)), value, 'reads it back');
  assert.deepEqual(plain(serial.parse(JSON.stringify(value))), value, 'reads JSON from elsewhere');
});

test('refuses anything that is not JSON, rather than running it', () => {
  assert.throws(() => serial.parse('alert(1)'), /Couldn't read/);
  assert.throws(() => serial.parse('{"a":1} trailing'), /Couldn't read/);
});

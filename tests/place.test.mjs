import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadCore } from './load.mjs';

const { place, markers } = loadCore();
const list = [markers.create({ time: 3610 }), markers.create({ time: 3612, duration: 1 })];
const times = (r) => r.markers.map((m) => m.time);

test('at their timecode, against the comp start timecode', () => {
  assert.deepEqual(times(place.apply(list, 'timecode', { displayStart: 3600 })), [10, 12]);
});

test('timecode adds the Reaper offset first', () => {
  const raw = [markers.create({ time: 10 })];
  assert.deepEqual(times(place.apply(raw, 'timecode', { displayStart: 3600, offset: 3600 })), [10]);
});

test('from the playhead and first at the playhead', () => {
  const short = [markers.create({ time: 1 }), markers.create({ time: 3 })];
  assert.deepEqual(times(place.apply(short, 'playhead', { playhead: 5 })), [6, 8]);
  assert.deepEqual(times(place.apply(short, 'first', { playhead: 5 })), [5, 7]);
});

test('anything before the comp start is left out and counted', () => {
  const r = place.apply(list, 'timecode', { displayStart: 3611 });
  assert.deepEqual(times(r), [1]);
  assert.equal(r.skipped, 1);
});

test('quantises start and end', () => {
  const r = place.apply([markers.create({ time: 1.03, duration: 1 })], 'start', { fps: 25, quantise: true });
  assert.ok(Math.abs(r.markers[0].time - 1.04) < 1e-9);
  assert.ok(Math.abs(r.markers[0].duration - 1) < 1e-9);
});

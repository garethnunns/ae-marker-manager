import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadCore } from './load.mjs';

const { markers } = loadCore();
const m = (time, extra = {}) => markers.create({ time, ...extra });
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} is not ${b}`);
const workArea = markers.range(2, 5);

test('moves every marker starting in the range, and nothing else', () => {
  const list = [m(1), m(2), m(3.5), m(5), m(6)];
  const r = markers.shift(list, 0.5, workArea, {});
  assert.equal(r.error, null);
  assert.deepEqual(r.changes.map((c) => c.index), [1, 2, 3]);
  assert.deepEqual(r.changes.map((c) => c.after.time), [2.5, 4, 5.5]);
  assert.equal(list[1].time, 2, 'the list it was given is left alone');
});

test('refuses to move markers before the start, moving none', () => {
  const r = markers.shift([m(0.2), m(3)], -0.5, markers.range(0, 10), {});
  assert.equal(r.changes.length, 0);
  assert.match(r.error, /1 marker would go before the start/);
});

test('protected regions stay put unless included', () => {
  const list = [m(3, { duration: 1, protectedRegion: true })];
  assert.equal(markers.shift(list, 1, workArea, {}).changes.length, 0);
  assert.equal(markers.shift(list, 1, workArea, { includeProtected: true }).changes.length, 1);
});

test('without split markers, a duration marker moves whole with its start', () => {
  const list = [m(4, { duration: 3 }), m(0, { duration: 3 })];
  const r = markers.shift(list, 1, workArea, {});
  assert.equal(r.changes.length, 1, 'the one ending in range but starting before it stays');
  close(r.changes[0].after.time, 5);
  close(r.changes[0].after.duration, 3);
});

test('split markers: only the end in range moves', () => {
  const list = [m(1, { duration: 2 })]; // 1 to 3, only the end is in 2-5
  const r = markers.shift(list, 1, workArea, { split: true });
  close(r.changes[0].after.time, 1);
  close(r.changes[0].after.duration, 3);
});

test('split markers: only the start in range moves, the end stays', () => {
  const list = [m(4, { duration: 3 })]; // 4 to 7
  const r = markers.shift(list, 1, workArea, { split: true });
  close(r.changes[0].after.time, 5);
  close(r.changes[0].after.duration, 2);
});

test('split markers: a start pushed past its end stops there', () => {
  const r = markers.shift([m(4, { duration: 3 })], 5, workArea, { split: true });
  close(r.changes[0].after.time, 7);
  close(r.changes[0].after.duration, 0);
});

test('split markers: both ends in range moves it whole', () => {
  const r = markers.shift([m(2.5, { duration: 1 })], 1, workArea, { split: true });
  close(r.changes[0].after.time, 3.5);
  close(r.changes[0].after.duration, 1);
});

test('the range edges are inclusive, allowing for rounding', () => {
  const r = markers.shift([m(5.00001), m(1.99999)], 1, workArea, {});
  assert.equal(r.changes.length, 2);
});

test('move to a time keeps the spacing', () => {
  const r = markers.moveTo([m(3), m(4.5), m(9)], 10, workArea, {});
  assert.deepEqual(r.changes.map((c) => c.after.time), [10, 11.5]);
});

test('quantise snaps start and end, and leaves what is on a frame', () => {
  const r = markers.quantise([m(2.03, { duration: 1.01 }), m(3)], 25, workArea, {});
  assert.equal(r.changes.length, 1);
  close(r.changes[0].after.time, 2.04);
  close(r.changes[0].after.duration, 1.0);
});

test('clipboard pastes at original times or from a new start', () => {
  const clip = markers.toClip([m(4, { comment: 'b' }), m(2, { comment: 'a' })]);
  assert.equal(clip.ref, 2);
  assert.deepEqual(markers.fromClip(clip, null).map((x) => x.time), [2, 4]);
  assert.deepEqual(markers.fromClip(clip, 10).map((x) => [x.time, x.comment]), [[10, 'a'], [12, 'b']]);
});

test('dedupe keeps one marker per frame', () => {
  assert.equal(markers.dedupe([m(1), m(1.001), m(2)], 25).length, 2);
});

test('create copies params rather than sharing them', () => {
  const params = { a: '1' };
  const x = markers.create({ params });
  x.params.a = '2';
  assert.equal(params.a, '1');
});

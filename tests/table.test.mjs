import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadCore } from './load.mjs';

const { csv, table, time } = loadCore();
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} is not ${b}`);
const read = (text, opts = { fps: 25 }) => table.toMarkers(csv.parse(text), opts);

test("Reaper's region/marker export, in timecode", () => {
  const r = read([
    '#,Name,Start,End,Length',
    'M1,Intro,00:00:01:00,,',
    'R1,Verse,00:00:05:00,00:00:15:00,00:00:10:00',
    'M2,"Drop, big",00:00:20:12,,',
  ].join('\r\n'));
  assert.equal(r.error, null);
  assert.deepEqual(r.markers.map((x) => [x.sourceId, x.comment]), [['M1', 'Intro'], ['R1', 'Verse'], ['M2', 'Drop, big']]);
  close(r.markers[1].time, 5);
  close(r.markers[1].duration, 10);
  close(r.markers[2].time, 20.48);
  assert.equal(r.markers[0].duration, 0);
});

test("Reaper's export in minutes:seconds", () => {
  const r = read('#,Name,Start,End,Length\nR1,A,0:05.000,0:07.500,0:02.500\n');
  close(r.markers[0].time, 5);
  close(r.markers[0].duration, 2.5);
});

test('measures and beats explain how to fix the export', () => {
  const r = read('#,Name,Start,End,Length\nM1,A,1.1.00,,\nM2,B,3.1.00,,\n');
  assert.equal(r.markers.length, 0);
  assert.match(r.error, /set the ruler to timecode/);
});

test('other column names, and comp marker fields', () => {
  const r = read('Marker Name,In,Duration,Chapter,URL,Comment\nA,2.5,1,Ch1,http://x,ignored\n', { format: 'seconds' });
  const mk = r.markers[0];
  assert.equal(mk.comment, 'A');
  close(mk.time, 2.5);
  close(mk.duration, 1);
  assert.equal(mk.chapter, 'Ch1');
  assert.equal(mk.url, 'http://x');
});

test('without a header: time then name', () => {
  const r = read('00:00:01:00,One\n00:00:02:00,Two\n');
  assert.deepEqual(r.markers.map((x) => x.comment), ['One', 'Two']);
  assert.equal(r.markers[0].sourceId, 'row1');
});

test('frames, with the rate given', () => {
  const r = read('time,name\n48,A\n', { format: 'frames', fps: 24 });
  close(r.markers[0].time, 2);
});

test('bad rows are skipped and said so', () => {
  const r = read('#,Name,Start\nM1,A,00:00:01:00\nM2,B,soon\nM3,C,\n');
  assert.equal(r.markers.length, 1);
  assert.equal(r.warnings.length, 2);
});

test('sorted by time, whatever order the file has', () => {
  const r = read('time,name\n5,B\n1,A\n', { format: 'seconds' });
  assert.deepEqual(r.markers.map((x) => x.comment), ['A', 'B']);
});

test('writes rows Reaper-style and reads them back', () => {
  const r = read('#,Name,Start,End,Length\nM1,A,00:00:01:00,,\nR1,B,00:00:02:00,00:00:04:00,00:00:02:00\n');
  const rows = table.fromMarkers(r.markers, (t) => time.secondsToTimecode(t, 25));
  assert.deepEqual(JSON.parse(JSON.stringify(rows)), [
    ['#', 'Name', 'Start', 'End', 'Length'],
    ['M1', 'A', '00:00:01:00', '', ''],
    ['R1', 'B', '00:00:02:00', '00:00:04:00', '00:00:02:00'],
  ]);
});

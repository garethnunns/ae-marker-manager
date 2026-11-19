import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadCore } from './load.mjs';

const { time } = loadCore();
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} is not ${b}`);

test('timecode round trips at whole rates', () => {
  assert.equal(time.secondsToTimecode(3661.48, 25), '01:01:01:12');
  close(time.timecodeToSeconds('01:01:01:12', 25), 3661.48);
  assert.equal(time.framesToTimecode(-25, 25), '-00:00:01:00');
});

test('short timecode fills from the right, as After Effects does', () => {
  close(time.timecodeToSeconds('1:00', 25), 1);
  close(time.timecodeToSeconds('01:00:00', 25), 60);
});

test('non-drop 29.97 counts at 30 and converts at 29.97', () => {
  close(time.timecodeToSeconds('00:01:00:00', 29.97), 1800 / 29.97);
});

test('drop frame 29.97 skips two frame numbers a minute, except every tenth', () => {
  assert.equal(time.framesToTimecode(1800, 29.97, true), '00:01:00;02');
  assert.equal(time.timecodeToFrames('00:01:00;02', 29.97), 1800);
  assert.equal(time.framesToTimecode(17982, 29.97, true), '00:10:00;00');
  assert.equal(time.timecodeToFrames('00:10:00;00', 29.97), 17982);
  for (const f of [0, 1, 1799, 1800, 1801, 3597, 3598, 17981, 17982, 107892]) {
    assert.equal(time.timecodeToFrames(time.framesToTimecode(f, 29.97, true), 29.97), f);
  }
});

test('drop frame 59.94 drops four', () => {
  assert.equal(time.framesToTimecode(3600, 59.94, true), '00:01:00;04');
  assert.equal(time.timecodeToFrames('00:01:00;04', 59.94), 3600);
});

test('clock times', () => {
  close(time.clockToSeconds('1:02.500'), 62.5);
  close(time.clockToSeconds('1:00:00.25'), 3600.25);
  assert.equal(time.secondsToClock(3725.5), '1:02:05.500');
});

test('detects what a time looks like', () => {
  assert.equal(time.detectFormat('00:00:01:00'), 'timecode');
  assert.equal(time.detectFormat('00:00:01;00'), 'timecode');
  assert.equal(time.detectFormat('0:01.000'), 'clock');
  assert.equal(time.detectFormat('12.5'), 'seconds');
  assert.equal(time.detectFormat('3.1.00'), 'beats');
  assert.equal(time.detectFormat('banana'), null);
});

test('parse in each format', () => {
  close(time.parse('00:00:02:12', 'auto', { fps: 25 }), 2.48);
  close(time.parse('48', 'frames', { fps: 24 }), 2);
  close(time.parse('96000', 'samples', { sampleRate: 48000 }), 2);
  close(time.parse('2.5', 'seconds'), 2.5);
  assert.throws(() => time.parse('3.1.00', 'auto'), /measures and beats/);
  assert.throws(() => time.parse('00:00:01:00', 'timecode', { fps: 0 }), /frame rate/);
});

test('quantise snaps to the nearest frame', () => {
  close(time.quantise(1.03, 25), 1.04);
});

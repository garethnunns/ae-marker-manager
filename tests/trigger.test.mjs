import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadCore } from './load.mjs';

const { trigger } = loadCore();

// Runs a trigger expression the way After Effects would, with a property
// keyframed from k0 to k1 (its value is the time it's sampled at, so the
// result says where in the animation it is), and markers at the given times.
function evaluate(expr, { time, markers, keys = [1, 2], comp = markers, frameDuration = 0.04 }) {
  const markerGroup = (list) => ({
    numKeys: list.length,
    key: (i) => ({ time: list[i - 1].time, duration: list[i - 1].duration || 0, comment: list[i - 1].comment || '' }),
  });
  const fn = new Function('thisLayer', 'thisComp', 'time', 'numKeys', 'key', 'value', 'valueAtTime',
    `${expr.replace(/\nout;$/, '\nreturn out;')}`);
  return fn(
    { marker: markerGroup(markers) },
    { marker: markerGroup(comp), frameDuration, layer: () => ({ marker: markerGroup(comp) }) },
    time, keys.length, (i) => ({ time: keys[i - 1] }), 'static', (t) => t,
  );
}

test('plays the keyframes from the latest marker', () => {
  const expr = trigger.build({});
  assert.equal(evaluate(expr, { time: 10.5, markers: [{ time: 5 }, { time: 10 }] }), 1.5);
  assert.equal(evaluate(expr, { time: 20, markers: [{ time: 10 }] }), 2, 'holds the last keyframe after');
  assert.equal(evaluate(expr, { time: 2, markers: [{ time: 5 }] }), 1, 'holds the first before any marker');
});

test('delay, duration and reverse', () => {
  const markers = [{ time: 10 }];
  assert.equal(evaluate(trigger.build({ delay: 25 }), { time: 11.5, markers }), 1.5);
  assert.equal(evaluate(trigger.build({ duration: 50 }), { time: 11, markers }), 1.5);
  assert.equal(evaluate(trigger.build({ reverse: true }), { time: 10.25, markers }), 1.75);
});

test('fits to a marker with a duration', () => {
  assert.equal(evaluate(trigger.build({ fit: true }), { time: 11, markers: [{ time: 10, duration: 4 }] }), 1.25);
});

test('only markers whose name matches', () => {
  const markers = [{ time: 5, comment: 'hit' }, { time: 10, comment: 'other' }];
  assert.equal(evaluate(trigger.build({ filter: 'hit' }), { time: 10.5, markers }), 2);
});

test('comp markers and other layers', () => {
  assert.match(trigger.build({ source: 'comp' }), /var src = thisComp\.marker;/);
  assert.match(trigger.build({ source: 'other', layerName: 'Beat "A"' }), /thisComp\.layer\("Beat \\"A\\""\)\.marker/);
  assert.equal(evaluate(trigger.build({ source: 'comp' }), { time: 10.5, markers: [], comp: [{ time: 10 }] }), 1.5);
});

test('knows its own expressions', () => {
  assert.ok(trigger.isTrigger(trigger.build({})));
  assert.ok(!trigger.isTrigger('wiggle(2, 10)'));
});

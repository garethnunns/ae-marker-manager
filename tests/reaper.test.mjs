import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadCore } from './load.mjs';

const { reaper } = loadCore();
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} is not ${b}`);

const BODY = [
  'MARKER_LIST',
  'MARKER\tIntro\t1\t1.5\t16576606',
  'MARKER\tDrop\t2\t20',
  'MARKER\tbroken\t3\tsoon',
  'MARKER_LIST_END',
  'REGION_LIST',
  'REGION\tVerse\t1\t5\t15\t0',
  'REGION_LIST_END',
  'TRANSPORT\t0\t10.000000\t0\t01:00:10:00\t6.1.00',
  '',
].join('\n');

test('asks for markers, regions and the transport in one request', () => {
  const req = reaper.buildRequest('127.0.0.1', 8080);
  assert.match(req, /^GET \/_\/MARKER;REGION;TRANSPORT HTTP\/1\.1\r\n/);
  assert.match(req, /Connection: close\r\n\r\n$/);
});

test('reads the HTTP answer', () => {
  const r = reaper.parseResponse('HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\n\r\n' + BODY);
  assert.equal(r.status, 200);
  assert.equal(r.body, BODY);
  assert.throws(() => reaper.parseResponse('SSH-2.0-OpenSSH'), /not an HTTP/);
});

test('reads markers, regions and transport, skipping bad lines', () => {
  const p = reaper.parseBody(BODY);
  assert.equal(p.markers.length, 2);
  assert.equal(p.markers[0].name, 'Intro');
  close(p.regions[0].end, 15);
  close(p.transport.positionSeconds, 10);
});

test('works out the project start time from the transport', () => {
  const p = reaper.parseBody(BODY);
  close(reaper.startOffset(p.transport, 25), 3600);
  close(reaper.startOffset({ positionSeconds: 2, positionString: '1:02.000' }, 25), 60);
  assert.equal(reaper.startOffset({ positionSeconds: 2, positionString: '2.1.00' }, 25), null);
  assert.equal(reaper.startOffset(null, 25), null);
});

test('markers and regions become markers, with Reaper ids', () => {
  const list = reaper.toMarkers(reaper.parseBody(BODY));
  assert.deepEqual(list.map((x) => [x.sourceId, x.time, x.duration]), [['M1', 1.5, 0], ['R1', 5, 10], ['M2', 20, 0]]);
  assert.equal(reaper.toMarkers(reaper.parseBody(BODY), { regions: false }).length, 2);
});

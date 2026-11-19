import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadCore } from './load.mjs';

const { csv } = loadCore();
const plain = (x) => JSON.parse(JSON.stringify(x));

test('quoted fields, doubled quotes, CRLF and a byte order mark', () => {
  const rows = csv.parse('﻿#,Name\r\nM1,"Verse, one"\r\nM2,"Say ""hi"""\r\n\r\n');
  assert.deepEqual(plain(rows), [['#', 'Name'], ['M1', 'Verse, one'], ['M2', 'Say "hi"']]);
});

test('newlines inside quotes stay in the field', () => {
  assert.deepEqual(plain(csv.parse('a,"b\nc"\n')), [['a', 'b\nc']]);
});

test('guesses semicolons and tabs', () => {
  assert.deepEqual(plain(csv.parse('a;b\n1;2')), [['a', 'b'], ['1', '2']]);
  assert.deepEqual(plain(csv.parse('a\tb\n1\t2')), [['a', 'b'], ['1', '2']]);
});

test('writes what it reads', () => {
  const rows = [['#', 'Name'], ['M1', 'Verse, "one"']];
  assert.deepEqual(plain(csv.parse(csv.stringify(rows))), rows);
});

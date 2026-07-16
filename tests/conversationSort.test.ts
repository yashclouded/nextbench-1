/**
 * Unit test for the inbox sort key (pending-serverTimestamp reorder fix).
 * Run: npm --prefix tests run test:unit
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { sortMillis } from '../src/lib/conversationSort.ts';

const ts = (ms: number) => ({ toMillis: () => ms });

test('resolved updatedAt sorts by its millis', () => {
  assert.equal(sortMillis({ updatedAt: ts(1000) }), 1000);
  assert.equal(sortMillis({ updatedAt: ts(0) }), 0);
});

test('missing updatedAt without a pending write is oldest (0)', () => {
  assert.equal(sortMillis({ updatedAt: null }), 0);
  assert.equal(sortMillis({}), 0);
});

test('pending local write with unresolved updatedAt sorts newest', () => {
  // The just-sent room: updatedAt reads null locally, but _pendingWrite is set.
  assert.equal(sortMillis({ updatedAt: null, _pendingWrite: true }), Number.MAX_SAFE_INTEGER);
  assert.equal(sortMillis({ _pendingWrite: true }), Number.MAX_SAFE_INTEGER);
});

test('pending write that ALSO has a resolved timestamp uses the timestamp', () => {
  // Once the server timestamp resolves it should sort by real time, not stay pinned.
  assert.equal(sortMillis({ updatedAt: ts(5000), _pendingWrite: true }), 5000);
});

test('a just-sent room outranks an older resolved room', () => {
  const justSent = { updatedAt: null, _pendingWrite: true };
  const older = { updatedAt: ts(9_999_999) };
  // desc sort: justSent should come first (larger key).
  assert.ok(sortMillis(justSent) > sortMillis(older));
});

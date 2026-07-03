/**
 * Unit tests for the pure Stories navigation logic.
 *
 * Run: npm --prefix tests run test:nav
 * (uses tsx so node --test can import the TypeScript source directly)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { advance, rewind, jumpAuthor, clampCursor } from '../src/lib/storyNavigation.ts';

// Tray: author A has 2 stories, B has 1, C has 3.
const authors = [{ storyCount: 2 }, { storyCount: 1 }, { storyCount: 3 }];

test('advance within an author', () => {
  assert.deepEqual(advance({ authorIndex: 0, storyIndex: 0 }, authors), { authorIndex: 0, storyIndex: 1 });
});

test('advance crosses to the next author at the last story', () => {
  assert.deepEqual(advance({ authorIndex: 0, storyIndex: 1 }, authors), { authorIndex: 1, storyIndex: 0 });
});

test('advance past the final story returns null (close)', () => {
  assert.equal(advance({ authorIndex: 2, storyIndex: 2 }, authors), null);
});

test('rewind within an author', () => {
  assert.deepEqual(rewind({ authorIndex: 2, storyIndex: 2 }, authors), { authorIndex: 2, storyIndex: 1 });
});

test('rewind crosses to the previous author LAST story', () => {
  assert.deepEqual(rewind({ authorIndex: 2, storyIndex: 0 }, authors), { authorIndex: 1, storyIndex: 0 }); // B has 1 story
  assert.deepEqual(rewind({ authorIndex: 1, storyIndex: 0 }, authors), { authorIndex: 0, storyIndex: 1 }); // A last index 1
});

test('rewind at the very start clamps (never closes)', () => {
  assert.deepEqual(rewind({ authorIndex: 0, storyIndex: 0 }, authors), { authorIndex: 0, storyIndex: 0 });
});

test('jumpAuthor forward and backward', () => {
  assert.deepEqual(jumpAuthor({ authorIndex: 0, storyIndex: 1 }, authors, 1), { authorIndex: 1, storyIndex: 0 });
  assert.deepEqual(jumpAuthor({ authorIndex: 2, storyIndex: 2 }, authors, -1), { authorIndex: 1, storyIndex: 0 });
});

test('jumpAuthor forward past the last author returns null; backward clamps', () => {
  assert.equal(jumpAuthor({ authorIndex: 2, storyIndex: 0 }, authors, 1), null);
  assert.deepEqual(jumpAuthor({ authorIndex: 0, storyIndex: 0 }, authors, -1), { authorIndex: 0, storyIndex: 0 });
});

test('empty tray: advance null, rewind stays at origin', () => {
  assert.equal(advance({ authorIndex: 0, storyIndex: 0 }, []), null);
  assert.deepEqual(rewind({ authorIndex: 0, storyIndex: 0 }, []), { authorIndex: 0, storyIndex: 0 });
});

test('clampCursor pulls a stale cursor back into range', () => {
  assert.deepEqual(clampCursor({ authorIndex: 9, storyIndex: 9 }, authors), { authorIndex: 2, storyIndex: 2 });
  assert.deepEqual(clampCursor({ authorIndex: -1, storyIndex: -1 }, authors), { authorIndex: 0, storyIndex: 0 });
});

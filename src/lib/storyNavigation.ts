/**
 * Pure navigation logic for the Stories viewer — no React, no Firestore, no DOM.
 *
 * The viewer holds a cursor `(authorIndex, storyIndex)` into an ordered tray. Every
 * transition (tap, auto-advance, swipe) goes through these functions so the boundary
 * behaviour (crossing between authors, closing at the end, clamping at the start) lives
 * in one unit-tested place.
 *
 * Design: docs/superpowers/specs/2026-07-02-stories-viewer-design.md
 */

export interface Cursor {
  authorIndex: number;
  storyIndex: number;
}

/** The only thing navigation needs from each author: how many stories they have. */
export interface NavAuthor {
  storyCount: number;
}

/**
 * The result of a navigation step: the next cursor, or `null` meaning "no next story —
 * the viewer should close". (A plain `Cursor | null` rather than a discriminated union so
 * it narrows correctly even with this project's non-strict `tsconfig`.)
 */
export type NavStep = Cursor | null;

function author(authors: NavAuthor[], i: number): NavAuthor | undefined {
  return authors[i];
}

/** Clamp a possibly-stale cursor back into range (defensive; e.g. after a refetch). */
export function clampCursor(cursor: Cursor, authors: NavAuthor[]): Cursor {
  if (authors.length === 0) return { authorIndex: 0, storyIndex: 0 };
  const authorIndex = Math.min(Math.max(cursor.authorIndex, 0), authors.length - 1);
  const count = Math.max(authors[authorIndex].storyCount, 1);
  const storyIndex = Math.min(Math.max(cursor.storyIndex, 0), count - 1);
  return { authorIndex, storyIndex };
}

/**
 * Next story. Past an author's last story → next author's first. Past the last author's
 * last story → `null` (the viewer should close).
 */
export function advance(cursor: Cursor, authors: NavAuthor[]): NavStep {
  const cur = author(authors, cursor.authorIndex);
  if (!cur) return null;

  if (cursor.storyIndex + 1 < cur.storyCount) {
    return { authorIndex: cursor.authorIndex, storyIndex: cursor.storyIndex + 1 };
  }
  if (cursor.authorIndex + 1 < authors.length) {
    return { authorIndex: cursor.authorIndex + 1, storyIndex: 0 };
  }
  return null;
}

/**
 * Previous story. Before an author's first story → previous author's LAST story. Before
 * the very first story → clamp (stay put; never closes → always returns a cursor).
 */
export function rewind(cursor: Cursor, authors: NavAuthor[]): Cursor {
  if (authors.length === 0) return { authorIndex: 0, storyIndex: 0 };

  if (cursor.storyIndex - 1 >= 0) {
    return { authorIndex: cursor.authorIndex, storyIndex: cursor.storyIndex - 1 };
  }
  if (cursor.authorIndex - 1 >= 0) {
    const prev = authors[cursor.authorIndex - 1];
    return { authorIndex: cursor.authorIndex - 1, storyIndex: Math.max(prev.storyCount - 1, 0) };
  }
  return { authorIndex: 0, storyIndex: 0 };
}

/**
 * Jump a whole author (swipe left/right). Forward past the last author → `null` (close).
 * Backward before the first author → clamp to the first author's first story.
 */
export function jumpAuthor(cursor: Cursor, authors: NavAuthor[], dir: 1 | -1): NavStep {
  if (authors.length === 0) return null;

  const next = cursor.authorIndex + dir;
  if (next >= authors.length) return null;
  if (next < 0) return { authorIndex: 0, storyIndex: 0 };
  return { authorIndex: next, storyIndex: 0 };
}

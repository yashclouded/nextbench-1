/**
 * Firestore security-rules unit tests for the Stories foundation.
 *
 * Run from the repo root (boots the Firestore emulator, which injects
 * FIRESTORE_EMULATOR_HOST that initializeTestEnvironment auto-detects):
 *
 *   cd tests && npm install
 *   npm --prefix tests test
 *
 * Or directly:
 *   firebase emulators:exec --project demo-nextbench --only firestore "node --test tests/stories.rules.test.mjs"
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import test, { before, after, beforeEach } from 'node:test';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import {
  doc,
  collection,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RULES = readFileSync(join(__dirname, '..', 'firestore.rules'), 'utf8');

const HOUR = 60 * 60 * 1000;
let testEnv;

// ── helpers ──────────────────────────────────────────────
const verified = (uid) => testEnv.authenticatedContext(uid, { email_verified: true });
const unverified = (uid) => testEnv.authenticatedContext(uid); // no email_verified claim

function storyData(authorId, { ageMs = HOUR, privacy = 'public', status = 'active', withDuration = false } = {}) {
  const createdAt = Timestamp.fromMillis(Date.now() - ageMs);
  const base = {
    authorId,
    authorUsername: 'tester',
    authorPhotoURL: null,
    mediaType: 'image',
    mediaUrl: 'https://example.com/m.jpg',
    mediaPath: `stories/${authorId}/s/media.jpg`,
    posterUrl: null,
    posterPath: null,
    width: 1080,
    height: 1920,
    layers: [],
    privacy,
    status,
    createdAt,
    expiresAt: Timestamp.fromMillis(createdAt.toMillis() + 24 * HOUR),
  };
  if (withDuration) base.durationMs = 5000;
  return base;
}

/** Payload for a rules-validated create (createdAt must equal request.time). */
function createPayload(authorId, overrides = {}) {
  return {
    authorId,
    authorUsername: 'tester',
    authorPhotoURL: null,
    mediaType: 'image',
    mediaUrl: 'https://example.com/m.jpg',
    mediaPath: `stories/${authorId}/s/media.jpg`,
    posterUrl: null,
    posterPath: null,
    width: 1080,
    height: 1920,
    layers: [],
    privacy: 'public',
    status: 'active',
    createdAt: serverTimestamp(),
    expiresAt: Timestamp.fromMillis(Date.now() + 24 * HOUR),
    ...overrides,
  };
}

async function seed(fn) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await fn(ctx.firestore());
  });
}

// ── lifecycle ────────────────────────────────────────────
before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-nextbench',
    firestore: { rules: RULES },
  });
});

after(async () => {
  if (testEnv) await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

// ── visibility ───────────────────────────────────────────
test('public active story is readable by any signed-in user', async () => {
  await seed((db) => setDoc(doc(db, 'stories', 'pub'), storyData('alice')));
  await assertSucceeds(getDoc(doc(verified('bob').firestore(), 'stories', 'pub')));
});

test('expired story is hidden from others but visible to its owner (archive)', async () => {
  await seed((db) => setDoc(doc(db, 'stories', 'old'), storyData('alice', { ageMs: 25 * HOUR })));
  await assertFails(getDoc(doc(verified('bob').firestore(), 'stories', 'old')));
  await assertSucceeds(getDoc(doc(verified('alice').firestore(), 'stories', 'old')));
});

test('removed story is hidden from others even if recent', async () => {
  await seed((db) => setDoc(doc(db, 'stories', 'rm'), storyData('alice', { status: 'removed' })));
  await assertFails(getDoc(doc(verified('bob').firestore(), 'stories', 'rm')));
});

test('followers-tier story needs a follow edge', async () => {
  await seed((db) => setDoc(doc(db, 'stories', 'foll'), storyData('alice', { privacy: 'followers' })));
  await assertFails(getDoc(doc(verified('bob').firestore(), 'stories', 'foll')));

  await seed((db) =>
    setDoc(doc(db, 'follow_edges', 'bob_alice'), {
      followerId: 'bob',
      followingId: 'alice',
      createdAt: serverTimestamp(),
    }),
  );
  await assertSucceeds(getDoc(doc(verified('bob').firestore(), 'stories', 'foll')));
});

test('blocked user cannot read even a public story', async () => {
  await seed(async (db) => {
    await setDoc(doc(db, 'stories', 'pub'), storyData('alice'));
    await setDoc(doc(db, 'blocks', 'alice_bob'), {
      blockerId: 'alice',
      blockedId: 'bob',
      createdAt: serverTimestamp(),
    });
  });
  await assertFails(getDoc(doc(verified('bob').firestore(), 'stories', 'pub')));
});

// ── create ───────────────────────────────────────────────
test('verified author can create a valid story', async () => {
  await assertSucceeds(setDoc(doc(verified('alice').firestore(), 'stories', 's1'), createPayload('alice')));
});

test('cannot create a story for another user', async () => {
  await assertFails(setDoc(doc(verified('bob').firestore(), 'stories', 's2'), createPayload('alice')));
});

test('unverified user cannot create a story', async () => {
  await assertFails(setDoc(doc(unverified('alice').firestore(), 'stories', 's3'), createPayload('alice')));
});

test('create with an unknown field is rejected', async () => {
  await assertFails(
    setDoc(doc(verified('alice').firestore(), 'stories', 's4'), createPayload('alice', { evil: true })),
  );
});

// ── views ────────────────────────────────────────────────
test('a viewer can record a view, and re-recording only bumps lastViewedAt', async () => {
  await seed((db) => setDoc(doc(db, 'stories', 'pub'), storyData('alice')));
  const bobDb = verified('bob').firestore();
  const vRef = doc(bobDb, 'stories', 'pub', 'views', 'bob');
  await assertSucceeds(
    setDoc(vRef, { viewerId: 'bob', firstViewedAt: serverTimestamp(), lastViewedAt: serverTimestamp() }),
  );
  await assertSucceeds(updateDoc(vRef, { lastViewedAt: serverTimestamp() }));
});

test('a viewer cannot write a view doc keyed to someone else', async () => {
  await seed((db) => setDoc(doc(db, 'stories', 'pub'), storyData('alice')));
  const bobDb = verified('bob').firestore();
  await assertFails(
    setDoc(doc(bobDb, 'stories', 'pub', 'views', 'carol'), {
      viewerId: 'carol',
      firstViewedAt: serverTimestamp(),
      lastViewedAt: serverTimestamp(),
    }),
  );
});

test('the owner does not record self-views', async () => {
  await seed((db) => setDoc(doc(db, 'stories', 'pub'), storyData('alice')));
  const aliceDb = verified('alice').firestore();
  await assertFails(
    setDoc(doc(aliceDb, 'stories', 'pub', 'views', 'alice'), {
      viewerId: 'alice',
      firstViewedAt: serverTimestamp(),
      lastViewedAt: serverTimestamp(),
    }),
  );
});

test('only the owner can list viewers', async () => {
  await seed(async (db) => {
    await setDoc(doc(db, 'stories', 'pub'), storyData('alice'));
    await setDoc(doc(db, 'stories', 'pub', 'views', 'bob'), {
      viewerId: 'bob',
      firstViewedAt: serverTimestamp(),
      lastViewedAt: serverTimestamp(),
    });
  });
  await assertSucceeds(getDocs(collection(verified('alice').firestore(), 'stories', 'pub', 'views')));
  await assertFails(getDocs(collection(verified('bob').firestore(), 'stories', 'pub', 'views')));
});

// ── follow_edges ─────────────────────────────────────────
test('clients cannot write follow_edges, but a party can read them', async () => {
  await seed((db) =>
    setDoc(doc(db, 'follow_edges', 'bob_alice'), {
      followerId: 'bob',
      followingId: 'alice',
      createdAt: serverTimestamp(),
    }),
  );
  await assertSucceeds(getDoc(doc(verified('bob').firestore(), 'follow_edges', 'bob_alice')));
  await assertFails(getDoc(doc(verified('carol').firestore(), 'follow_edges', 'bob_alice')));
  await assertFails(
    setDoc(doc(verified('bob').firestore(), 'follow_edges', 'bob_carol'), {
      followerId: 'bob',
      followingId: 'carol',
      createdAt: serverTimestamp(),
    }),
  );
});

// ── storySeen (private) ──────────────────────────────────
test('storySeen is owner-only', async () => {
  const ref = (db) => doc(db, 'users', 'alice', 'private', 'storySeen');
  await assertSucceeds(
    setDoc(ref(verified('alice').firestore()), { seen: { bob: { lastSeenAt: serverTimestamp(), lastSeenStoryId: 's1' } } }),
  );
  await assertFails(
    setDoc(ref(verified('bob').firestore()), { seen: { x: { lastSeenAt: serverTimestamp(), lastSeenStoryId: 's1' } } }),
  );
});

/**
 * Firestore security-rules unit tests for per-user conversation state
 * (Chat Phase 3 — mute/archive/pin/unread/delete on clubs and chatRooms).
 *
 * Verifies that a member may toggle their own per-user array fields WITHOUT
 * bumping `updatedAt` (which would reorder every member's inbox — the Phase 1
 * markAsRead bug), and may not smuggle other fields into the same write.
 *
 * Run from the repo root:
 *   npm --prefix tests test
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
  setDoc,
  updateDoc,
  serverTimestamp,
  arrayUnion,
  Timestamp,
} from 'firebase/firestore';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RULES = readFileSync(join(__dirname, '..', 'firestore.rules'), 'utf8');

let testEnv;

const verified = (uid) => testEnv.authenticatedContext(uid, { email_verified: true });

// Fixed timestamp so seeded docs have a concrete updatedAt we can leave
// unchanged (serverTimestamp on seed would still be a concrete value, but a
// literal keeps the "unchanged" assertion unambiguous).
const SEED_TS = Timestamp.fromDate(new Date('2026-07-01T00:00:00Z'));

function clubData({
  leadId = 'alice',
  coLeadIds = [],
  memberIds = ['alice', 'bob'],
} = {}) {
  return {
    name: 'Chess Club',
    description: 'd',
    type: 'public',
    inviteCode: 'ABC123',
    leadId,
    coLeadIds,
    memberIds,
    settings: {
      hideMembersAbove50: false,
      onlyLeadsCanPost: false,
      slowMode: 0,
      muteNotifications: false,
    },
    memberCount: memberIds.length,
    createdAt: SEED_TS,
    updatedAt: SEED_TS,
  };
}

function chatRoomData({ participants = ['alice', 'bob'] } = {}) {
  return {
    participants,
    lastMessage: 'hi',
    lastSenderId: 'alice',
    updatedAt: SEED_TS,
  };
}

async function seed(fn) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await fn(ctx.firestore());
  });
}

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

// ── clubs: member per-user state (updatedAt unchanged) ───
test('club member can mute self without bumping updatedAt', async () => {
  await seed((db) => setDoc(doc(db, 'clubs', 'c1'), clubData()));
  await assertSucceeds(
    updateDoc(doc(verified('bob').firestore(), 'clubs', 'c1'), { mutedBy: arrayUnion('bob') })
  );
});

test('club member can archive self', async () => {
  await seed((db) => setDoc(doc(db, 'clubs', 'c1'), clubData()));
  await assertSucceeds(
    updateDoc(doc(verified('bob').firestore(), 'clubs', 'c1'), { archivedBy: arrayUnion('bob') })
  );
});

test('club member can pin self', async () => {
  await seed((db) => setDoc(doc(db, 'clubs', 'c1'), clubData()));
  await assertSucceeds(
    updateDoc(doc(verified('bob').firestore(), 'clubs', 'c1'), { pinnedBy: arrayUnion('bob') })
  );
});

test('club member can soft-delete self', async () => {
  await seed((db) => setDoc(doc(db, 'clubs', 'c1'), clubData()));
  await assertSucceeds(
    updateDoc(doc(verified('bob').firestore(), 'clubs', 'c1'), { deletedBy: arrayUnion('bob') })
  );
});

test('club member can toggle their own unread flag', async () => {
  await seed((db) => setDoc(doc(db, 'clubs', 'c1'), clubData()));
  await assertSucceeds(
    updateDoc(doc(verified('bob').firestore(), 'clubs', 'c1'), { unreadBy: arrayUnion('bob') })
  );
});

// ── clubs: reorder guard ─────────────────────────────────
test('club member per-user write that also bumps updatedAt is rejected', async () => {
  await seed((db) => setDoc(doc(db, 'clubs', 'c1'), clubData()));
  await assertFails(
    updateDoc(doc(verified('bob').firestore(), 'clubs', 'c1'), {
      mutedBy: arrayUnion('bob'),
      updatedAt: serverTimestamp(),
    })
  );
});

// ── clubs: field-scope guard ─────────────────────────────
test('club member per-user write that also touches name is rejected', async () => {
  await seed((db) => setDoc(doc(db, 'clubs', 'c1'), clubData()));
  await assertFails(
    updateDoc(doc(verified('bob').firestore(), 'clubs', 'c1'), {
      mutedBy: arrayUnion('bob'),
      name: 'Hacked Club',
    })
  );
});

// ── clubs: membership guard ──────────────────────────────
test('non-member cannot write mutedBy on a club', async () => {
  await seed((db) => setDoc(doc(db, 'clubs', 'c1'), clubData({ memberIds: ['alice', 'bob'] })));
  await assertFails(
    updateDoc(doc(verified('mallory').firestore(), 'clubs', 'c1'), { mutedBy: arrayUnion('mallory') })
  );
});

// ── chatRooms: participant per-user state ────────────────
test('chatRooms participant can archive self', async () => {
  await seed((db) => setDoc(doc(db, 'chatRooms', 'r1'), chatRoomData()));
  await assertSucceeds(
    updateDoc(doc(verified('bob').firestore(), 'chatRooms', 'r1'), { archivedBy: arrayUnion('bob') })
  );
});

test('chatRooms participant can mute + pin + soft-delete self', async () => {
  await seed((db) => setDoc(doc(db, 'chatRooms', 'r1'), chatRoomData()));
  await assertSucceeds(
    updateDoc(doc(verified('bob').firestore(), 'chatRooms', 'r1'), {
      mutedBy: arrayUnion('bob'),
      pinnedBy: arrayUnion('bob'),
      deletedBy: arrayUnion('bob'),
    })
  );
});

test('non-participant cannot write archivedBy on a chatRoom', async () => {
  await seed((db) => setDoc(doc(db, 'chatRooms', 'r1'), chatRoomData({ participants: ['alice', 'bob'] })));
  await assertFails(
    updateDoc(doc(verified('mallory').firestore(), 'chatRooms', 'r1'), { archivedBy: arrayUnion('mallory') })
  );
});

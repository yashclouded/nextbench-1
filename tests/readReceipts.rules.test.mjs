/**
 * Firestore rules tests for Phase 5 realtime social layer:
 *   - readBy read receipts on messages (any member may arrayUnion self)
 *   - typingUsers on the room/club doc (member may write only that field)
 *
 * Run from repo root: npm --prefix tests test
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
const SEED_TS = Timestamp.fromDate(new Date('2026-07-01T00:00:00Z'));

function clubData({ memberIds = ['alice', 'bob'] } = {}) {
  return {
    name: 'Chess Club', description: 'd', type: 'public', inviteCode: 'ABC123',
    leadId: 'alice', coLeadIds: [], memberIds,
    settings: { hideMembersAbove50: false, onlyLeadsCanPost: false, slowMode: 0, muteNotifications: false },
    memberCount: memberIds.length, createdAt: SEED_TS, updatedAt: SEED_TS,
  };
}

async function seed(fn) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => { await fn(ctx.firestore()); });
}

before(async () => {
  testEnv = await initializeTestEnvironment({ projectId: 'demo-nextbench', firestore: { rules: RULES } });
});
after(async () => { if (testEnv) await testEnv.cleanup(); });
beforeEach(async () => { await testEnv.clearFirestore(); });

// ── readBy on DM messages ────────────────────────────────
test('DM participant can add self to a message readBy', async () => {
  await seed(async (db) => {
    await setDoc(doc(db, 'chatRooms', 'r1'), { participants: ['alice', 'bob'], updatedAt: SEED_TS });
    await setDoc(doc(db, 'chatRooms', 'r1', 'messages', 'm1'), { senderId: 'alice', text: 'hi', createdAt: SEED_TS });
  });
  await assertSucceeds(
    updateDoc(doc(verified('bob').firestore(), 'chatRooms', 'r1', 'messages', 'm1'), { readBy: arrayUnion('bob') })
  );
});

test('non-participant cannot add to a DM message readBy', async () => {
  await seed(async (db) => {
    await setDoc(doc(db, 'chatRooms', 'r1'), { participants: ['alice', 'bob'], updatedAt: SEED_TS });
    await setDoc(doc(db, 'chatRooms', 'r1', 'messages', 'm1'), { senderId: 'alice', text: 'hi', createdAt: SEED_TS });
  });
  await assertFails(
    updateDoc(doc(verified('mallory').firestore(), 'chatRooms', 'r1', 'messages', 'm1'), { readBy: arrayUnion('mallory') })
  );
});

test('readBy write that also edits text is rejected', async () => {
  await seed(async (db) => {
    await setDoc(doc(db, 'chatRooms', 'r1'), { participants: ['alice', 'bob'], updatedAt: SEED_TS });
    await setDoc(doc(db, 'chatRooms', 'r1', 'messages', 'm1'), { senderId: 'alice', text: 'hi', createdAt: SEED_TS });
  });
  await assertFails(
    updateDoc(doc(verified('bob').firestore(), 'chatRooms', 'r1', 'messages', 'm1'), { readBy: arrayUnion('bob'), text: 'hacked' })
  );
});

// ── readBy on club messages ──────────────────────────────
test('club member can add self to a message readBy', async () => {
  await seed(async (db) => {
    await setDoc(doc(db, 'clubs', 'c1'), clubData());
    await setDoc(doc(db, 'clubs', 'c1', 'messages', 'm1'), { senderId: 'alice', text: 'hi', createdAt: SEED_TS });
  });
  await assertSucceeds(
    updateDoc(doc(verified('bob').firestore(), 'clubs', 'c1', 'messages', 'm1'), { readBy: arrayUnion('bob') })
  );
});

test('non-member cannot add to a club message readBy', async () => {
  await seed(async (db) => {
    await setDoc(doc(db, 'clubs', 'c1'), clubData({ memberIds: ['alice', 'bob'] }));
    await setDoc(doc(db, 'clubs', 'c1', 'messages', 'm1'), { senderId: 'alice', text: 'hi', createdAt: SEED_TS });
  });
  await assertFails(
    updateDoc(doc(verified('mallory').firestore(), 'clubs', 'c1', 'messages', 'm1'), { readBy: arrayUnion('mallory') })
  );
});

// ── typingUsers on the room/club doc ─────────────────────
test('DM participant can write typingUsers on the room doc', async () => {
  await seed((db) => setDoc(doc(db, 'chatRooms', 'r1'), { participants: ['alice', 'bob'], updatedAt: SEED_TS }));
  await assertSucceeds(
    updateDoc(doc(verified('bob').firestore(), 'chatRooms', 'r1'), { 'typingUsers.bob': serverTimestamp() })
  );
});

test('club member can write typingUsers without bumping updatedAt', async () => {
  await seed((db) => setDoc(doc(db, 'clubs', 'c1'), clubData()));
  await assertSucceeds(
    updateDoc(doc(verified('bob').firestore(), 'clubs', 'c1'), { 'typingUsers.bob': serverTimestamp() })
  );
});

test('club typingUsers write that also bumps updatedAt is rejected', async () => {
  await seed((db) => setDoc(doc(db, 'clubs', 'c1'), clubData()));
  await assertFails(
    updateDoc(doc(verified('bob').firestore(), 'clubs', 'c1'), { 'typingUsers.bob': serverTimestamp(), updatedAt: serverTimestamp() })
  );
});

test('non-member cannot write typingUsers on a club', async () => {
  await seed((db) => setDoc(doc(db, 'clubs', 'c1'), clubData({ memberIds: ['alice', 'bob'] })));
  await assertFails(
    updateDoc(doc(verified('mallory').firestore(), 'clubs', 'c1'), { 'typingUsers.mallory': serverTimestamp() })
  );
});

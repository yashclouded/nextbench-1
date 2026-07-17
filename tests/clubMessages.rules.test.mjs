/**
 * Firestore security-rules unit tests for club message posting (Phase 1
 * club bugs A + D of the chat overhaul — onlyLeadsCanPost enforcement and
 * isValidMessage parity, including the image-as-object regression).
 *
 * Run from the repo root (boots the Firestore emulator, which injects
 * FIRESTORE_EMULATOR_HOST that initializeTestEnvironment auto-detects):
 *
 *   npm --prefix tests test
 *
 * Or directly:
 *   firebase emulators:exec --project demo-nextbench --only firestore "node --test tests/clubMessages.rules.test.mjs"
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
  setDoc,
  addDoc,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RULES = readFileSync(join(__dirname, '..', 'firestore.rules'), 'utf8');

let testEnv;

const verified = (uid) => testEnv.authenticatedContext(uid, { email_verified: true });

function clubData({
  leadId = 'alice',
  coLeadIds = [],
  memberIds = ['alice', 'bob'],
  onlyLeadsCanPost = false,
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
      onlyLeadsCanPost,
      slowMode: 0,
      muteNotifications: false,
    },
    memberCount: memberIds.length,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
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

// ── onlyLeadsCanPost enforcement (Bug A) ─────────────────
test('lead can post when onlyLeadsCanPost is true', async () => {
  await seed((db) => setDoc(doc(db, 'clubs', 'c1'), clubData({ onlyLeadsCanPost: true })));
  await assertSucceeds(
    addDoc(collection(verified('alice').firestore(), 'clubs', 'c1', 'messages'), {
      senderId: 'alice',
      text: 'hi',
      createdAt: serverTimestamp(),
    })
  );
});

test('co-lead can post when onlyLeadsCanPost is true', async () => {
  await seed((db) =>
    setDoc(
      doc(db, 'clubs', 'c1'),
      clubData({ coLeadIds: ['carol'], memberIds: ['alice', 'bob', 'carol'], onlyLeadsCanPost: true })
    )
  );
  await assertSucceeds(
    addDoc(collection(verified('carol').firestore(), 'clubs', 'c1', 'messages'), {
      senderId: 'carol',
      text: 'hi',
      createdAt: serverTimestamp(),
    })
  );
});

test('regular member cannot post when onlyLeadsCanPost is true', async () => {
  await seed((db) => setDoc(doc(db, 'clubs', 'c1'), clubData({ onlyLeadsCanPost: true })));
  await assertFails(
    addDoc(collection(verified('bob').firestore(), 'clubs', 'c1', 'messages'), {
      senderId: 'bob',
      text: 'hi',
      createdAt: serverTimestamp(),
    })
  );
});

test('regular member can post when onlyLeadsCanPost is false', async () => {
  await seed((db) => setDoc(doc(db, 'clubs', 'c1'), clubData({ onlyLeadsCanPost: false })));
  await assertSucceeds(
    addDoc(collection(verified('bob').firestore(), 'clubs', 'c1', 'messages'), {
      senderId: 'bob',
      text: 'hi',
      createdAt: serverTimestamp(),
    })
  );
});

test('non-member cannot post regardless of onlyLeadsCanPost', async () => {
  await seed((db) => setDoc(doc(db, 'clubs', 'c1'), clubData({ onlyLeadsCanPost: false })));
  await assertFails(
    addDoc(collection(verified('mallory').firestore(), 'clubs', 'c1', 'messages'), {
      senderId: 'mallory',
      text: 'hi',
      createdAt: serverTimestamp(),
    })
  );
});

// ── isValidMessage parity (Bug D) ────────────────────────
test('club message with no text/image/audio/sharedPost/postId is rejected', async () => {
  await seed((db) => setDoc(doc(db, 'clubs', 'c1'), clubData()));
  await assertFails(
    addDoc(collection(verified('alice').firestore(), 'clubs', 'c1', 'messages'), {
      senderId: 'alice',
      createdAt: serverTimestamp(),
    })
  );
});

test('club message with text over 2000 chars is rejected', async () => {
  await seed((db) => setDoc(doc(db, 'clubs', 'c1'), clubData()));
  await assertFails(
    addDoc(collection(verified('alice').firestore(), 'clubs', 'c1', 'messages'), {
      senderId: 'alice',
      text: 'x'.repeat(2001),
      createdAt: serverTimestamp(),
    })
  );
});

// ── image-shape regression (image is a {url,w,h} map, not a string) ──
test('club message with an {url,w,h} image object is accepted', async () => {
  await seed((db) => setDoc(doc(db, 'clubs', 'c1'), clubData()));
  await assertSucceeds(
    addDoc(collection(verified('alice').firestore(), 'clubs', 'c1', 'messages'), {
      senderId: 'alice',
      image: { url: 'https://example.com/i.jpg', w: 800, h: 600 },
      createdAt: serverTimestamp(),
    })
  );
});

test('DM message with an {url,w,h} image object is accepted (regression)', async () => {
  await seed((db) =>
    setDoc(doc(db, 'chatRooms', 'r1'), {
      participants: ['alice', 'bob'],
      updatedAt: serverTimestamp(),
    })
  );
  await assertSucceeds(
    addDoc(collection(verified('alice').firestore(), 'chatRooms', 'r1', 'messages'), {
      senderId: 'alice',
      image: { url: 'https://example.com/i.jpg', w: 800, h: 600 },
      createdAt: serverTimestamp(),
    })
  );
});

test('message with an image object missing url is rejected', async () => {
  await seed((db) => setDoc(doc(db, 'clubs', 'c1'), clubData()));
  await assertFails(
    addDoc(collection(verified('alice').firestore(), 'clubs', 'c1', 'messages'), {
      senderId: 'alice',
      image: { w: 800, h: 600 },
      createdAt: serverTimestamp(),
    })
  );
});

// ── video messages (Phase 4) ─────────────────────────────
test('club video message with a {url,poster,w,h,duration} video is accepted', async () => {
  await seed((db) => setDoc(doc(db, 'clubs', 'c1'), clubData()));
  await assertSucceeds(
    addDoc(collection(verified('alice').firestore(), 'clubs', 'c1', 'messages'), {
      senderId: 'alice',
      type: 'video',
      video: { url: 'https://example.com/v.mp4', poster: 'https://example.com/p.jpg', w: 720, h: 1280, duration: 12 },
      createdAt: serverTimestamp(),
    })
  );
});

test('DM video message is accepted (regression)', async () => {
  await seed((db) =>
    setDoc(doc(db, 'chatRooms', 'r1'), { participants: ['alice', 'bob'], updatedAt: serverTimestamp() })
  );
  await assertSucceeds(
    addDoc(collection(verified('alice').firestore(), 'chatRooms', 'r1', 'messages'), {
      senderId: 'alice',
      type: 'video',
      video: { url: 'https://example.com/v.mp4' },
      createdAt: serverTimestamp(),
    })
  );
});

test('video message missing video.url is rejected', async () => {
  await seed((db) => setDoc(doc(db, 'clubs', 'c1'), clubData()));
  await assertFails(
    addDoc(collection(verified('alice').firestore(), 'clubs', 'c1', 'messages'), {
      senderId: 'alice',
      type: 'video',
      video: { poster: 'https://example.com/p.jpg' },
      createdAt: serverTimestamp(),
    })
  );
});

test('message with a bad type is rejected', async () => {
  await seed((db) => setDoc(doc(db, 'clubs', 'c1'), clubData()));
  await assertFails(
    addDoc(collection(verified('alice').firestore(), 'clubs', 'c1', 'messages'), {
      senderId: 'alice',
      text: 'hi',
      type: 'malware',
      createdAt: serverTimestamp(),
    })
  );
});

// ── forwarded messages (Phase 4) ─────────────────────────
test('forwarded message with forwardedFrom map is accepted', async () => {
  await seed((db) => setDoc(doc(db, 'clubs', 'c1'), clubData()));
  await assertSucceeds(
    addDoc(collection(verified('alice').firestore(), 'clubs', 'c1', 'messages'), {
      senderId: 'alice',
      text: 'forwarded text',
      forwardedFrom: { senderId: 'carol', senderName: 'Carol' },
      createdAt: serverTimestamp(),
    })
  );
});

test('forwardedFrom missing senderId is rejected', async () => {
  await seed((db) => setDoc(doc(db, 'clubs', 'c1'), clubData()));
  await assertFails(
    addDoc(collection(verified('alice').firestore(), 'clubs', 'c1', 'messages'), {
      senderId: 'alice',
      text: 'forwarded text',
      forwardedFrom: { senderName: 'Carol' },
      createdAt: serverTimestamp(),
    })
  );
});

// ── delete-for-everyone clears video/audio media (Phase 4 review fix) ──
test('sender can clear video+audioUrl on delete-for-everyone', async () => {
  await seed(async (db) => {
    await setDoc(doc(db, 'clubs', 'c1'), clubData());
    await setDoc(doc(db, 'clubs', 'c1', 'messages', 'm1'), {
      senderId: 'alice', type: 'video',
      video: { url: 'https://example.com/v.mp4', poster: 'https://example.com/p.jpg' },
      audioUrl: 'https://example.com/a.webm',
      createdAt: serverTimestamp(),
    });
  });
  await assertSucceeds(
    updateDoc(doc(verified('alice').firestore(), 'clubs', 'c1', 'messages', 'm1'), {
      isDeletedForEveryone: true, text: '', image: '', video: null, audioUrl: '',
    })
  );
});

test('non-sender cannot delete-for-everyone (clear media)', async () => {
  await seed(async (db) => {
    await setDoc(doc(db, 'clubs', 'c1'), clubData());
    await setDoc(doc(db, 'clubs', 'c1', 'messages', 'm1'), {
      senderId: 'alice', type: 'video',
      video: { url: 'https://example.com/v.mp4' },
      createdAt: serverTimestamp(),
    });
  });
  await assertFails(
    updateDoc(doc(verified('bob').firestore(), 'clubs', 'c1', 'messages', 'm1'), {
      isDeletedForEveryone: true, text: '', image: '', video: null, audioUrl: '',
    })
  );
});

// ── file/document messages ───────────────────────────────
test('club file message with {url,name,size,mime,pages} is accepted', async () => {
  await seed((db) => setDoc(doc(db, 'clubs', 'c1'), clubData()));
  await assertSucceeds(
    addDoc(collection(verified('alice').firestore(), 'clubs', 'c1', 'messages'), {
      senderId: 'alice',
      type: 'file',
      file: { url: 'https://example.com/doc.pdf', name: 'doc.pdf', size: 12345, mime: 'application/pdf', pages: 3 },
      createdAt: serverTimestamp(),
    })
  );
});

test('DM file message is accepted (regression)', async () => {
  await seed((db) =>
    setDoc(doc(db, 'chatRooms', 'r1'), { participants: ['alice', 'bob'], updatedAt: serverTimestamp() })
  );
  await assertSucceeds(
    addDoc(collection(verified('alice').firestore(), 'chatRooms', 'r1', 'messages'), {
      senderId: 'alice',
      type: 'file',
      file: { url: 'https://example.com/notes.zip', name: 'notes.zip' },
      createdAt: serverTimestamp(),
    })
  );
});

test('file message missing file.name is rejected', async () => {
  await seed((db) => setDoc(doc(db, 'clubs', 'c1'), clubData()));
  await assertFails(
    addDoc(collection(verified('alice').firestore(), 'clubs', 'c1', 'messages'), {
      senderId: 'alice',
      type: 'file',
      file: { url: 'https://example.com/doc.pdf' },
      createdAt: serverTimestamp(),
    })
  );
});


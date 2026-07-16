/**
 * Firestore security-rules tests for the linkPreviews cache (Chat Phase 4).
 *
 * The getLinkPreview Cloud Function (admin SDK, bypasses rules) is the only
 * writer; clients may only `get` a cached preview by its url-hash id.
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
import { doc, getDoc, setDoc, updateDoc, collection, getDocs } from 'firebase/firestore';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RULES = readFileSync(join(__dirname, '..', 'firestore.rules'), 'utf8');

let testEnv;

const verified = (uid) => testEnv.authenticatedContext(uid, { email_verified: true });

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

test('signed-in user can get a cached link preview', async () => {
  await seed((db) => setDoc(doc(db, 'linkPreviews', 'abc123'), {
    url: 'https://example.com', title: 'Example', status: 'ok',
  }));
  await assertSucceeds(getDoc(doc(verified('alice').firestore(), 'linkPreviews', 'abc123')));
});

test('unauthenticated user cannot get a cached link preview', async () => {
  await seed((db) => setDoc(doc(db, 'linkPreviews', 'abc123'), {
    url: 'https://example.com', title: 'Example', status: 'ok',
  }));
  await assertFails(getDoc(doc(testEnv.unauthenticatedContext().firestore(), 'linkPreviews', 'abc123')));
});

test('client cannot create a link preview', async () => {
  await assertFails(
    setDoc(doc(verified('alice').firestore(), 'linkPreviews', 'abc123'), {
      url: 'https://evil.com', title: 'Spoofed', status: 'ok',
    })
  );
});

test('client cannot update a cached link preview', async () => {
  await seed((db) => setDoc(doc(db, 'linkPreviews', 'abc123'), {
    url: 'https://example.com', title: 'Example', status: 'ok',
  }));
  await assertFails(
    updateDoc(doc(verified('alice').firestore(), 'linkPreviews', 'abc123'), { title: 'Hacked' })
  );
});

test('client cannot list link previews', async () => {
  await seed((db) => setDoc(doc(db, 'linkPreviews', 'abc123'), {
    url: 'https://example.com', title: 'Example', status: 'ok',
  }));
  await assertFails(getDocs(collection(verified('alice').firestore(), 'linkPreviews')));
});

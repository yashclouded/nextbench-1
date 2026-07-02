#!/usr/bin/env node
/**
 * Seed demo stories for Phase 2 (row + viewer) QA. Writes via the Admin SDK, so it
 * bypasses security rules — intended for a dev/emulator project only.
 *
 * Usage (against the emulator):
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node scripts/seed-stories.mjs <authorUid> [authorUid2 ...]
 *
 * Usage (against a real dev project, ADC):
 *   node scripts/seed-stories.mjs <authorUid>
 *
 * Each author gets 2 active image stories (one with a text layer) plus 1 already-expired
 * story (to exercise the archive/expiry path).
 */

import admin from 'firebase-admin';

const authorUids = process.argv.slice(2);
if (authorUids.length === 0) {
  console.error('Provide at least one author uid: node scripts/seed-stories.mjs <uid> [uid2 ...]');
  process.exit(1);
}

admin.initializeApp({
  projectId: process.env.FIREBASE_PROJECT_ID || 'nextbench-a11ed',
});
const db = admin.firestore();

const HOUR = 60 * 60 * 1000;
const SAMPLE_IMG = 'https://picsum.photos/1080/1920';

function ts(msFromNow) {
  return admin.firestore.Timestamp.fromMillis(Date.now() + msFromNow);
}

function storyDoc({ authorId, ageMs, withText, index }) {
  const createdAt = ts(-ageMs);
  return {
    authorId,
    authorUsername: `user_${authorId.slice(0, 5)}`,
    authorPhotoURL: null,
    mediaType: 'image',
    mediaUrl: `${SAMPLE_IMG}?sig=${authorId}-${index}`,
    mediaPath: `stories/${authorId}/seed-${index}/media.jpg`,
    posterUrl: null,
    posterPath: null,
    width: 1080,
    height: 1920,
    layers: withText
      ? [
          {
            id: 'txt1',
            type: 'text',
            x: 0.5,
            y: 0.4,
            rotation: 0,
            scale: 1,
            z: 1,
            text: 'Hello Stories 👋',
            fontFamily: 'Inter',
            color: '#ffffff',
            backgroundColor: null,
            align: 'center',
            fontSize: 0.08,
          },
        ]
      : [],
    privacy: 'public',
    status: 'active',
    createdAt,
    expiresAt: admin.firestore.Timestamp.fromMillis(createdAt.toMillis() + 24 * HOUR),
  };
}

async function seed() {
  let count = 0;
  for (const authorId of authorUids) {
    const docs = [
      storyDoc({ authorId, ageMs: 2 * HOUR, withText: false, index: 0 }),
      storyDoc({ authorId, ageMs: 1 * HOUR, withText: true, index: 1 }),
      storyDoc({ authorId, ageMs: 26 * HOUR, withText: false, index: 2 }), // expired → archive
    ];
    for (const d of docs) {
      await db.collection('stories').add(d);
      count++;
    }
    console.log(`Seeded 3 stories for ${authorId} (2 active, 1 expired).`);
  }
  console.log(`Done. Wrote ${count} stories.`);
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});

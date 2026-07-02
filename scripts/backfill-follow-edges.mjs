#!/usr/bin/env node
/**
 * One-shot backfill: create deterministic `follow_edges/{followerId}_{followingId}`
 * docs for every existing `follows` doc, so security rules can exists()-check follow
 * relationships (used by the Stories followers/closeFriends tiers).
 *
 * Idempotent — safe to run multiple times.
 *
 * Usage (ADC, after `firebase login`):
 *   node scripts/backfill-follow-edges.mjs
 *
 * Or with a service account:
 *   GOOGLE_APPLICATION_CREDENTIALS=path/to/serviceAccount.json node scripts/backfill-follow-edges.mjs
 */

import admin from 'firebase-admin';

admin.initializeApp({
  projectId: process.env.FIREBASE_PROJECT_ID || 'nextbench-a11ed',
});

const db = admin.firestore();

async function backfill() {
  const snap = await db.collection('follows').get();
  console.log(`Found ${snap.size} follow docs.`);

  let batch = db.batch();
  let inBatch = 0;
  let written = 0;

  for (const doc of snap.docs) {
    const { followerId, followingId, createdAt } = doc.data();
    if (!followerId || !followingId) continue;

    const edgeRef = db.collection('follow_edges').doc(`${followerId}_${followingId}`);
    batch.set(edgeRef, {
      followerId,
      followingId,
      createdAt: createdAt ?? admin.firestore.FieldValue.serverTimestamp(),
    });
    inBatch++;
    written++;

    // Firestore batches cap at 500 writes.
    if (inBatch >= 450) {
      await batch.commit();
      batch = db.batch();
      inBatch = 0;
      console.log(`  …committed ${written} edges`);
    }
  }

  if (inBatch > 0) await batch.commit();
  console.log(`Backfill complete. Wrote ${written} follow_edges.`);
}

backfill().catch((err) => {
  console.error('Backfill failed:', err);
  process.exit(1);
});

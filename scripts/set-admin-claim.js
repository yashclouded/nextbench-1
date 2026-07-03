#!/usr/bin/env node
/**
 * One-shot script: backfill the `admin: true` custom claim for users whose
 * Firestore document has isAdmin: true but whose auth token is missing the
 * claim (happens when isAdmin was set before the onUserUpdated trigger existed).
 *
 * Usage:
 *   GOOGLE_APPLICATION_CREDENTIALS=path/to/serviceAccount.json node scripts/set-admin-claim.js
 *
 * Or with firebase-admin Application Default Credentials (after `firebase login`):
 *   node scripts/set-admin-claim.js
 */

const admin = require('firebase-admin');

// Initialise with ADC — works if you've run `firebase login` or have
// GOOGLE_APPLICATION_CREDENTIALS set.  Project ID is read from the ADC or
// can be overridden via FIREBASE_PROJECT_ID.
admin.initializeApp({
  projectId: process.env.FIREBASE_PROJECT_ID || 'nextbench-a11ed',
});

const db = admin.firestore();
const auth = admin.auth();

async function backfillAdminClaims() {
  console.log('Scanning users collection for isAdmin: true…');

  const snap = await db.collection('users').where('isAdmin', '==', true).get();

  if (snap.empty) {
    console.log('No admin users found in Firestore.');
    return;
  }

  for (const docSnap of snap.docs) {
    const uid = docSnap.id;
    const data = docSnap.data();

    // Fetch current claims
    const userRecord = await auth.getUser(uid);
    const currentClaims = userRecord.customClaims || {};

    if (currentClaims.admin === true) {
      console.log(`✓ ${uid} (${data.email || data.name}) already has admin claim — skipping`);
      continue;
    }

    await auth.setCustomUserClaims(uid, { ...currentClaims, admin: true });
    console.log(`✔ Set admin claim for ${uid} (${data.email || data.name})`);
  }

  console.log('\nDone. Affected users must sign out and back in (or wait up to 1 h) for the new token to take effect.');
}

backfillAdminClaims().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});

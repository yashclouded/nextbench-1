import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import {
  initializeFirestore,
  persistentLocalCache,
  memoryLocalCache,
} from 'firebase/firestore';

import { getFunctions } from 'firebase/functions';
import { getMessaging, isSupported } from 'firebase/messaging';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
};

const firestoreDbId = import.meta.env.VITE_FIREBASE_FIRESTORE_DB || '(default)';

const app = initializeApp(firebaseConfig);

// Enable persistent local cache — data survives page refreshes and tab switches.
// This eliminates cold-start latency: the app renders from cache instantly while
// syncing with the server in the background.
//
// IMPORTANT: iOS Safari (private browsing, WKWebView, older versions) may block
// IndexedDB access which causes persistentMultipleTabManager to throw.
// We gracefully fall back to memory-only cache so the app still works.
function createFirestore() {
  try {
    return initializeFirestore(app, {
      // Using persistentSingleTabManager (default) is much more stable than multiple tab manager
      // and prevents the "Unexpected state (ID: b815)" corruption errors in production.
      localCache: persistentLocalCache(),
    }, firestoreDbId);
  } catch (e) {
    console.warn('[Firebase] Persistent cache unavailable, falling back to memory cache:', e);
    return initializeFirestore(app, {
      localCache: memoryLocalCache(),
    }, firestoreDbId);
  }
}

export const db = createFirestore();

export const auth = getAuth(app);
export const functions = getFunctions(app);
export const storage = getStorage(app);

// Initialize Messaging only if supported by the browser.
// We keep the `messaging` export for backward compat (non-critical reads)
// and provide an async getter `getMessagingInstance()` that callers MUST
// use when they need the messaging object to be ready (e.g. before getToken).
export let messaging: any = null;
const _messagingReady = isSupported().then((supported) => {
  if (supported) {
    messaging = getMessaging(app);
  }
}).catch(console.error);

export async function getMessagingInstance() {
  await _messagingReady;
  return messaging;
}

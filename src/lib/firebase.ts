import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
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

// Use memory cache by default for instant startup — no IndexedDB blocking.
// IndexedDB initialization (persistentLocalCache) can take 5-20 seconds on
// first visit, slow devices, or Safari private mode, causing the white screen.
function createFirestore() {
  try {
    return initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    }, firestoreDbId);
  } catch (e) {
    console.warn('[Firebase] Persistent cache initialization failed, falling back to memory cache:', e);
    try {
      return initializeFirestore(app, { localCache: memoryLocalCache() }, firestoreDbId);
    } catch (err) {
      console.warn('[Firebase] Firestore fallback initialization failed:', err);
      throw err;
    }
  }
}

export const db = createFirestore();

export const auth = getAuth(app);
export const functions = getFunctions(app);
// Guard storage initialization — only available when storageBucket env var is set.
let _storage: ReturnType<typeof getStorage> | null = null;
try {
  if (firebaseConfig.storageBucket) {
    _storage = getStorage(app);
  } else {
    console.warn('[Firebase] VITE_FIREBASE_STORAGE_BUCKET is not set. Video uploads will be disabled.');
  }
} catch (e) {
  console.warn('[Firebase] Storage initialization failed:', e);
}
export const storage = _storage;

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

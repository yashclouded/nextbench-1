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

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
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
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
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

// Initialize Messaging only if supported by the browser
export let messaging: any = null;
isSupported().then((supported) => {
  if (supported) {
    messaging = getMessaging(app);
  }
}).catch(console.error);

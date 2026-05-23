import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
};

const firestoreDbId = import.meta.env.VITE_FIREBASE_FIRESTORE_DB || '(default)';

const app = initializeApp(firebaseConfig);

// Enable persistent local cache — data survives page refreshes and tab switches.
// This eliminates cold-start latency: the app renders from cache instantly while
// syncing with the server in the background.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
}, firestoreDbId);

export const auth = getAuth(app);

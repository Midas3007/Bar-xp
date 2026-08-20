import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, type Auth } from 'firebase/auth';
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from 'firebase/firestore';

/**
 * Firebase bootstrap.
 *
 * Config comes from Vite env vars (see `.env.example`). When the config is
 * absent the app renders a setup screen instead of crashing on import — this
 * keeps `npm run dev` useful on a fresh clone before any keys exist.
 */

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const REQUIRED_KEYS = ['apiKey', 'authDomain', 'projectId', 'appId'] as const;

export const missingFirebaseKeys: string[] = REQUIRED_KEYS.filter(
  (key) => !config[key] || String(config[key]).startsWith('your-'),
).map((key) => `VITE_FIREBASE_${key.replace(/([A-Z])/g, '_$1').toUpperCase()}`);

export const isFirebaseConfigured = missingFirebaseKeys.length === 0;

let app: FirebaseApp | null = null;
let authInstance: Auth | null = null;
let dbInstance: Firestore | null = null;

if (isFirebaseConfigured) {
  app = initializeApp(config);
  authInstance = getAuth(app);
  try {
    // IndexedDB-backed cache: the gym is where the signal dies, and a logged
    // session must not depend on having one. It buys offline reads, offline
    // queries, and offline writes that replay automatically on reconnect.
    // `persistentMultipleTabManager` lets two open tabs share the cache instead
    // of one of them failing to acquire the lease.
    dbInstance = initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });
  } catch (error) {
    // Private browsing and some embedded webviews have no usable IndexedDB.
    console.warn('[firebase] persistent cache unavailable, falling back to memory', error);
    dbInstance = getFirestore(app);
  }
}

/**
 * Accessors that throw a clear error rather than returning null.
 * Call sites are only reachable once `isFirebaseConfigured` is true.
 */
export function getAuthOrThrow(): Auth {
  if (!authInstance) throw new Error('Firebase Auth is not configured. Check your .env file.');
  return authInstance;
}

export function getDbOrThrow(): Firestore {
  if (!dbInstance) throw new Error('Firestore is not configured. Check your .env file.');
  return dbInstance;
}

export const auth = authInstance;
export const db = dbInstance;

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

/** Firestore collection names, in one place. */
export const COLLECTIONS = {
  users: 'users',
  workouts: 'workouts',
  statsHistory: 'stats_history',
  publicProfiles: 'public_profiles',
} as const;

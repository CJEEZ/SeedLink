import { getApp, getApps, initializeApp, type FirebaseOptions } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getDatabase, type Database } from 'firebase/database';
import { getStorage, type FirebaseStorage } from 'firebase/storage';

const PLACEHOLDER_VALUES = ['replace-with-valid-web-api-key', 'your-firebase-web-api-key', 'your-api-key'];

export function isFirebaseConfigPlaceholder(value?: string): boolean {
  if (!value) return true;

  const normalizedValue = value.trim();
  if (!normalizedValue) return true;

  return PLACEHOLDER_VALUES.some((placeholder) => normalizedValue.toLowerCase().includes(placeholder.toLowerCase()));
}

export function getFirebaseConfig(env: Record<string, string | undefined> = import.meta.env): FirebaseOptions {
  const apiKey = env.VITE_FIREBASE_API_KEY?.trim();
  const config: FirebaseOptions = {
    apiKey: apiKey ?? '',
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN ?? 'seedlink-43161.firebaseapp.com',
    databaseURL: env.VITE_FIREBASE_DATABASE_URL ?? 'https://seedlink-43161-default-rtdb.asia-southeast1.firebasedatabase.app',
    projectId: env.VITE_FIREBASE_PROJECT_ID ?? 'seedlink-43161',
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET ?? 'seedlink-43161.firebasestorage.app',
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? '236165136451',
    appId: env.VITE_FIREBASE_APP_ID ?? '1:236165136451:web:262d7b7e5868393af114f6',
  };

  if (isFirebaseConfigPlaceholder(apiKey)) {
    throw new Error(
      'SeedLink is missing a valid Firebase Web API key. Add VITE_FIREBASE_API_KEY to .env.local using the value from Firebase Console → Project settings → Your apps.'
    );
  }

  return config;
}

const firebaseConfigError = 'SeedLink Firebase is not configured. Add the real Firebase Web API key to .env.local and restart the app.';

export const firebaseConfig = (() => {
  try {
    return getFirebaseConfig(import.meta.env);
  } catch (error) {
    console.error((error as Error).message || firebaseConfigError);
    return undefined;
  }
})();

export const app = firebaseConfig ? (getApps().length ? getApp() : initializeApp(firebaseConfig)) : undefined;
export const database: Database | null = app ? getDatabase(app) : null;
export const auth: Auth | null = app ? getAuth(app) : null;
export const storage: FirebaseStorage | null = app ? getStorage(app) : null;

export function getConfiguredAuth(): Auth {
  if (!auth) {
    throw new Error(firebaseConfigError);
  }

  return auth;
}

export function getConfiguredDatabase(): Database {
  if (!database) {
    throw new Error(firebaseConfigError);
  }

  return database;
}
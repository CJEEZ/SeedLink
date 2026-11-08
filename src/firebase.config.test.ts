import { describe, expect, test } from 'vitest';
import { getFirebaseConfig, isFirebaseConfigPlaceholder } from './firebase';

describe('firebase config validation', () => {
  test('rejects placeholder API keys', () => {
    expect(isFirebaseConfigPlaceholder('replace-with-valid-web-api-key')).toBe(true);
    expect(() => getFirebaseConfig({
      VITE_FIREBASE_API_KEY: 'replace-with-valid-web-api-key',
      VITE_FIREBASE_AUTH_DOMAIN: 'seedlink-43161.firebaseapp.com',
      VITE_FIREBASE_DATABASE_URL: 'https://seedlink-43161-default-rtdb.asia-southeast1.firebasedatabase.app',
      VITE_FIREBASE_PROJECT_ID: 'seedlink-43161',
      VITE_FIREBASE_STORAGE_BUCKET: 'seedlink-43161.firebasestorage.app',
      VITE_FIREBASE_MESSAGING_SENDER_ID: '236165136451',
      VITE_FIREBASE_APP_ID: '1:236165136451:web:262d7b7e5868393af114f6',
    })).toThrow(/valid Firebase Web API key/i);
  });

  test('accepts a real Firebase configuration', () => {
    const config = getFirebaseConfig({
      VITE_FIREBASE_API_KEY: 'AIzaTest1234567890',
      VITE_FIREBASE_AUTH_DOMAIN: 'seedlink-43161.firebaseapp.com',
      VITE_FIREBASE_DATABASE_URL: 'https://seedlink-43161-default-rtdb.asia-southeast1.firebasedatabase.app',
      VITE_FIREBASE_PROJECT_ID: 'seedlink-43161',
      VITE_FIREBASE_STORAGE_BUCKET: 'seedlink-43161.firebasestorage.app',
      VITE_FIREBASE_MESSAGING_SENDER_ID: '236165136451',
      VITE_FIREBASE_APP_ID: '1:236165136451:web:262d7b7e5868393af114f6',
    });

    expect(config.apiKey).toBe('AIzaTest1234567890');
    expect(config.projectId).toBe('seedlink-43161');
  });
});

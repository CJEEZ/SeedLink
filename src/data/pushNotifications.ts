import { Capacitor } from '@capacitor/core';
import { PushNotifications, type PushNotificationSchema } from '@capacitor/push-notifications';
import { get, ref, remove, set, type Database } from 'firebase/database';
import { deleteToken, getMessaging, getToken, isSupported, onMessage } from 'firebase/messaging';
import { app, firebaseConfig, firebaseVapidKey } from '../firebase';

type PushPlatform = 'android' | 'web';

const DEVICE_ID_KEY = 'seedlink-push-device-id';

function getDeviceId(): string {
  const existingId = localStorage.getItem(DEVICE_ID_KEY);
  if (existingId) return existingId;

  const deviceId = crypto.randomUUID();
  localStorage.setItem(DEVICE_ID_KEY, deviceId);
  return deviceId;
}

export function getPushDeviceReference(database: Database, uid: string) {
  return ref(database, `pushTokens/${uid}/${getDeviceId()}`);
}

async function getWebPushToken(): Promise<string> {
  if (!app || !(await isSupported())) {
    throw new Error('Push notifications are not supported in this browser.');
  }
  if (!firebaseVapidKey) {
    throw new Error('Web push needs a VAPID public key. Set VITE_FIREBASE_VAPID_KEY from Firebase Console → Project settings → Cloud Messaging.');
  }
  if (!firebaseConfig || !('serviceWorker' in navigator) || !('Notification' in window)) {
    throw new Error('This browser cannot receive push notifications.');
  }
  if (!window.isSecureContext) {
    throw new Error('Web push requires HTTPS, or localhost for development.');
  }

  const permission = Notification.permission === 'granted'
    ? 'granted'
    : await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Allow browser notifications to receive request updates.');

  const serviceWorkerUrl = new URL('firebase-messaging-sw.js', document.baseURI);
  for (const [key, value] of Object.entries(firebaseConfig)) {
    if (value) serviceWorkerUrl.searchParams.set(key, String(value));
  }
  const registration = await navigator.serviceWorker.register(serviceWorkerUrl.href, {
    scope: import.meta.env.BASE_URL,
  });
  const token = await getToken(getMessaging(app), {
    vapidKey: firebaseVapidKey,
    serviceWorkerRegistration: registration,
  });
  if (!token) throw new Error('Firebase did not return a web push token.');
  return token;
}

async function getAndroidPushToken(): Promise<string> {
  let resolveToken!: (token: string) => void;
  let rejectToken!: (error: Error) => void;
  const tokenPromise = new Promise<string>((resolve, reject) => {
    resolveToken = resolve;
    rejectToken = reject;
  });
  const registrationListener = await PushNotifications.addListener('registration', (token) => resolveToken(token.value));
  const errorListener = await PushNotifications.addListener('registrationError', (event) => {
    rejectToken(new Error(event.error || 'Android push registration failed.'));
  });

  try {
    let permission = await PushNotifications.checkPermissions();
    if (permission.receive !== 'granted') permission = await PushNotifications.requestPermissions();
    if (permission.receive !== 'granted') throw new Error('Allow notifications in Android settings.');
    await PushNotifications.createChannel({
      id: 'seedlink-updates',
      name: 'SeedLink updates',
      description: 'Updates about farmer seed requests',
      importance: 4,
      vibration: true,
    });
    await PushNotifications.register();
    return await Promise.race([
      tokenPromise,
      new Promise<never>((_, reject) => {
        window.setTimeout(() => reject(new Error('Android push registration timed out.')), 15000);
      }),
    ]);
  } finally {
    await registrationListener.remove();
    await errorListener.remove();
  }
}

export async function enablePushNotifications(database: Database, uid: string): Promise<void> {
  const platform = Capacitor.getPlatform();
  if (platform !== 'web' && platform !== 'android') {
    throw new Error('Push notifications are available on web and Android.');
  }
  const token = platform === 'android' ? await getAndroidPushToken() : await getWebPushToken();
  await set(getPushDeviceReference(database, uid), {
    token,
    platform: platform as PushPlatform,
    updatedAt: Date.now(),
  });
}

export async function disablePushNotifications(database: Database, uid: string): Promise<void> {
  const tokenRef = getPushDeviceReference(database, uid);
  const platform = Capacitor.getPlatform();
  if (platform === 'android') {
    await PushNotifications.unregister();
  } else if (platform === 'web' && app && firebaseVapidKey && await isSupported()) {
    if ((await get(tokenRef)).exists()) {
      await deleteToken(getMessaging(app));
      const registration = await navigator.serviceWorker.getRegistration(import.meta.env.BASE_URL);
      if (registration) await registration.unregister();
    }
  }
  await remove(tokenRef);
}

export function listenForForegroundPush(
  onNotification: (notification: { title: string; body: string }) => void,
): () => void {
  if (Capacitor.getPlatform() === 'android') {
    let active = true;
    let removeListener: (() => Promise<void>) | undefined;
    void PushNotifications.addListener('pushNotificationReceived', (notification: PushNotificationSchema) => {
      onNotification({
        title: notification.title || 'SeedLink request update',
        body: notification.body || 'Your request status has changed.',
      });
    }).then((listener) => {
      if (!active) {
        void listener.remove();
        return;
      }
      removeListener = () => listener.remove();
    }).catch((error: unknown) => console.error('Could not listen for Android push notifications.', error));

    return () => {
      active = false;
      void removeListener?.();
    };
  }

  let active = true;
  let unsubscribe: (() => void) | undefined;
  if (app) {
    void isSupported().then((supported) => {
      if (active && supported) {
        unsubscribe = onMessage(getMessaging(app), (payload) => {
          onNotification({
            title: payload.notification?.title || 'SeedLink request update',
            body: payload.notification?.body || 'Your request status has changed.',
          });
        });
      }
    }).catch((error: unknown) => console.error('Could not listen for web push notifications.', error));
  }

  return () => {
    active = false;
    unsubscribe?.();
  };
}

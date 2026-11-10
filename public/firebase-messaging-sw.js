importScripts(
  'https://www.gstatic.com/firebasejs/12.19.0/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/12.19.0/firebase-messaging-compat.js',
);

const firebaseConfig = Object.fromEntries(new URL(self.location.href).searchParams.entries());
firebase.initializeApp(firebaseConfig);

const messaging = firebase.messaging();
const appBase = new URL('.', self.location.href);

messaging.onBackgroundMessage((payload) => {
  self.registration.showNotification(
    payload.notification?.title || 'SeedLink request update',
    {
      body: payload.notification?.body || 'Your request status has changed.',
      icon: new URL('favicon.png', appBase).href,
      data: { link: new URL('home', appBase).href },
    },
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(self.clients.openWindow(new URL('home', appBase).href));
});

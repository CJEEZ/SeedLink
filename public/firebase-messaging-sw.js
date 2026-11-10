importScripts(
  'https://www.gstatic.com/firebasejs/12.19.0/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/12.19.0/firebase-messaging-compat.js',
);

const firebaseConfig = Object.fromEntries(new URL(self.location.href).searchParams.entries());
firebase.initializeApp(firebaseConfig);

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  self.registration.showNotification(
    payload.notification?.title || 'SeedLink request update',
    {
      body: payload.notification?.body || 'Your request status has changed.',
      icon: '/favicon.ico',
      data: { link: '/home' },
    },
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(self.clients.openWindow(new URL('/home', self.location.origin).href));
});

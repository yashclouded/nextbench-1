importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyB7EBZmmkdOqePROf0UoJNfrNwbaRwpFdY',
  authDomain: 'nextbench-a11ed.firebaseapp.com',
  projectId: 'nextbench-a11ed',
  messagingSenderId: '14134258818',
  appId: '1:14134258818:web:74ce98ecdef47ab383589b'
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
  const notificationTitle = payload.notification?.title || 'Nextbench Notification';
  const notificationOptions = {
    body: payload.notification?.body || 'You have a new message.',
    icon: '/logo.png'
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

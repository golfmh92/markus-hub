// Loom — Service Worker for Push Notifications

self.addEventListener('push', function(event) {
  const data = event.data ? event.data.json() : {};
  const title = data.title || 'Loom';
  const options = {
    body: data.body || '',
    icon: 'icon-192.png',
    badge: 'icon-192.png',
    tag: data.tag || 'loom-notification',
    data: { url: data.url || './' },
    actions: data.actions || [],
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  const url = event.notification.data?.url || './';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      for (const client of clientList) {
        if ('focus' in client) return client.focus();
      }
      return clients.openWindow(url);
    })
  );
});

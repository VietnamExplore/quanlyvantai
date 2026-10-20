/* Service worker – app lái xe Vietnam Explore Driver bản web (iPhone: thêm vào Màn hình chính).
 * Nhận thông báo đẩy từ máy chủ: hiện thông báo, đặt số đỏ trên biểu tượng app (số chưa đọc);
 * bấm vào thông báo thì mở app tới chuyến liên quan. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let d = {};
  try {
    d = event.data ? event.data.json() : {};
  } catch {
    d = { title: 'Vietnam Explore Driver', body: event.data ? event.data.text() : '' };
  }
  const base = self.registration.scope;
  const tasks = [
    self.registration.showNotification(d.title || 'Vietnam Explore Driver', {
      body: d.body || '',
      icon: `${base}icon-192.png`,
      badge: `${base}icon-192.png`,
      tag: d.tripId ? `trip-${d.tripId}` : undefined,
      renotify: !!d.tripId,
      data: { tripId: d.tripId ?? null, url: base },
    }),
  ];
  // Số đỏ trên biểu tượng app (iOS 16.4+ khi đã thêm vào Màn hình chính)
  if (typeof d.badge === 'number' && self.navigator && 'setAppBadge' in self.navigator) {
    tasks.push((d.badge > 0 ? self.navigator.setAppBadge(d.badge) : self.navigator.clearAppBadge()).catch(() => undefined));
  }
  event.waitUntil(Promise.all(tasks));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const { tripId, url } = event.notification.data || {};
  event.waitUntil(
    (async () => {
      const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const open = list.find((c) => c.url.startsWith(self.registration.scope));
      if (open) {
        await open.focus();
        open.postMessage({ type: 'open-notification', tripId });
        return;
      }
      await self.clients.openWindow(tripId ? `${url}?trip=${tripId}` : url);
    })(),
  );
});

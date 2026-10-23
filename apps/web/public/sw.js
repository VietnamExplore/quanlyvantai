/* Service worker – phần mềm điều hành Vietnam Explore (web văn phòng và cổng nhà xe).
 * Nhận thông báo đẩy từ máy chủ: hiện thông báo, đặt số đỏ trên biểu tượng app (số chưa đọc);
 * bấm vào thông báo thì mở phần mềm tới trang liên quan. Không xử lý tải trang (không cache). */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let d = {};
  try {
    d = event.data ? event.data.json() : {};
  } catch {
    d = { title: 'Vietnam Explore', body: event.data ? event.data.text() : '' };
  }
  const tasks = [
    self.registration.showNotification(d.title || 'Vietnam Explore', {
      body: d.body || '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: d.tripId ? `trip-${d.tripId}` : undefined,
      renotify: !!d.tripId,
      data: { link: d.link || null, tripId: d.tripId ?? null },
    }),
  ];
  // Số đỏ trên biểu tượng app (iPhone: iOS 16.4+ khi đã thêm vào Màn hình chính)
  if (typeof d.badge === 'number' && self.navigator && 'setAppBadge' in self.navigator) {
    tasks.push((d.badge > 0 ? self.navigator.setAppBadge(d.badge) : self.navigator.clearAppBadge()).catch(() => undefined));
  }
  event.waitUntil(Promise.all(tasks));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const { link } = event.notification.data || {};
  const url = new URL(link || '/', self.location.origin).href;
  event.waitUntil(
    (async () => {
      const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      // Cửa sổ phần mềm đang mở (không phải app lái xe /laixe): chuyển tới trang của thông báo
      const open = list.find((c) => c.url.startsWith(self.location.origin) && !new URL(c.url).pathname.startsWith('/laixe'));
      if (open) {
        await open.focus();
        open.postMessage({ type: 'open-link', link: link || null });
        return;
      }
      await self.clients.openWindow(url);
    })(),
  );
});

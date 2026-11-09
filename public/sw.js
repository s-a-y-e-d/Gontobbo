/* Push only: authenticated pages and study data are never cached here. */
const ACCOUNT_KEY = "activeAccount";

function accountStore(mode, operation) {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open("gontobbo-push", 1);
    open.onupgradeneeded = () => open.result.createObjectStore("settings");
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const transaction = db.transaction("settings", mode);
      const request = operation(transaction.objectStore("settings"));
      transaction.oncomplete = () => { const result = request.result; db.close(); resolve(result); };
      transaction.onerror = () => { db.close(); reject(transaction.error); };
      transaction.onabort = () => { db.close(); reject(transaction.error); };
    };
  });
}

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));

self.addEventListener("message", event => {
  if (event.origin && event.origin !== self.location.origin) return;
  if (event.data?.type !== "SET_ACTIVE_ACCOUNT") return;
  const accountId = typeof event.data.accountId === "string" ? event.data.accountId : null;
  event.waitUntil((async () => {
    await accountStore("readwrite", store => store.put(accountId, ACCOUNT_KEY));
    const notifications = await self.registration.getNotifications();
    notifications.filter(n => n.data?.accountId !== accountId).forEach(n => n.close());
    event.ports?.[0]?.postMessage({ ok: true });
  })());
});

self.addEventListener("push", event => {
  event.waitUntil((async () => {
    let payload;
    try { payload = event.data?.json(); } catch { return; }
    if (!payload || typeof payload.title !== "string" || typeof payload.body !== "string" ||
        typeof payload.accountId !== "string" || typeof payload.expiresAt !== "number" || payload.expiresAt < Date.now()) return;
    const accountId = await accountStore("readonly", store => store.get(ACCOUNT_KEY));
    if (accountId !== payload.accountId) return;
    await self.registration.showNotification(payload.title, {
      body: payload.body, icon: "/pwa/icon-192.png", badge: "/pwa/icon-192.png",
      tag: payload.tag, renotify: false,
      data: { ...payload, url: "/revision" },
      actions: payload.snoozeUrl ? [
        { action: "open", title: "রিভিশন খুলুন" },
        { action: "snooze", title: "১ ঘণ্টা পরে" },
      ] : [],
    });
  })());
});

self.addEventListener("notificationclick", event => {
  const data = event.notification.data;
  event.notification.close();
  event.waitUntil((async () => {
    const accountId = await accountStore("readonly", store => store.get(ACCOUNT_KEY));
    if (!data || data.accountId !== accountId) return;
    if (event.action === "snooze" && data.snoozeUrl) {
      try {
        const url = new URL(data.snoozeUrl);
        if (url.protocol !== "https:" || !url.hostname.endsWith(".convex.site") ||
            url.pathname !== "/revision-reminder/snooze") throw new Error("Invalid snooze URL");
        const response = await fetch(url.href, { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deviceId: data.deviceId, deliveryId: data.deliveryId, token: data.snoozeToken }) });
        if (!response.ok) throw new Error("Could not snooze");
        return;
      } catch {
        // Opening Settings gives a visible retry path when the device is offline
        // or the browser cannot complete the background snooze request.
        await openApp("/settings?section=notifications");
        return;
      }
    }
    await openApp("/revision");
  })());
});

async function openApp(path) {
  const target = new URL(path, self.location.origin).href;
  const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  for (const client of clients) {
    if (new URL(client.url).origin === self.location.origin && "focus" in client) {
      await client.navigate(target);
      await client.focus();
      return;
    }
  }
  await self.clients.openWindow(target);
}

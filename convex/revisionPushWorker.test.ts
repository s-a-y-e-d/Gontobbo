// @vitest-environment node
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, test, vi } from "vitest";

function worker() {
  const listeners: Record<string, (event: Record<string, unknown>) => void> = {};
  const values = new Map<string, unknown>();
  const showNotification = vi.fn().mockResolvedValue(undefined);
  const openWindow = vi.fn().mockResolvedValue(undefined);
  const fetch = vi.fn().mockResolvedValue({ ok: true });
  const self = {
    location: { origin: "https://gontobbo.example" },
    addEventListener: (name: string, listener: (event: Record<string, unknown>) => void) => { listeners[name] = listener; },
    registration: { getNotifications: vi.fn().mockResolvedValue([]), showNotification },
    clients: { claim: vi.fn(), matchAll: vi.fn().mockResolvedValue([]), openWindow },
    skipWaiting: vi.fn(),
  };
  const indexedDB = { open: () => {
    const request: { result?: unknown; onsuccess?: () => void } = {};
    request.result = {
      close: () => {}, transaction: () => {
        const transaction: { oncomplete?: () => void; objectStore?: () => unknown } = {};
        transaction.objectStore = () => ({
          get: (key: string) => { const result = { result: values.get(key) }; queueMicrotask(() => transaction.oncomplete?.()); return result; },
          put: (value: unknown, key: string) => { values.set(key, value); const result = { result: key }; queueMicrotask(() => transaction.oncomplete?.()); return result; },
        });
        return transaction;
      },
    };
    queueMicrotask(() => request.onsuccess?.()); return request;
  } };
  runInNewContext(readFileSync(new URL("../public/sw.js", import.meta.url), "utf8"), { self, indexedDB, URL, Date, fetch });
  async function dispatch(name: string, fields: Record<string, unknown>) {
    let work = Promise.resolve();
    listeners[name]({ ...fields, waitUntil: (promise: Promise<void>) => { work = promise; } });
    await work;
  }
  const bind = (accountId: string | null) => dispatch("message", { origin: self.location.origin, data: { type: "SET_ACTIVE_ACCOUNT", accountId } });
  const payload = { accountId: "alice", title: "Revision", body: "Two due", expiresAt: Date.now() + 3600000,
    tag: "unique-daily-tag", snoozeUrl: "https://example.convex.site/revision-reminder/snooze",
    deviceId: "device", deliveryId: "delivery", snoozeToken: "token" };
  return { listeners, dispatch, bind, payload, showNotification, openWindow, fetch };
}

describe("push service worker account and navigation boundaries", () => {
  test("shows notifications for the bound account and clears delivery access on sign-out", async () => {
    const w = worker(); await w.bind("alice");
    await w.dispatch("push", { data: { json: () => w.payload } });
    expect(w.showNotification).toHaveBeenCalledTimes(1);
    expect(w.showNotification.mock.calls[0][1].tag).toBe("unique-daily-tag");
    await w.bind(null);
    await w.dispatch("push", { data: { json: () => w.payload } });
    expect(w.showNotification).toHaveBeenCalledTimes(1);
  });
  test("a different account and an expired payload never expose study details", async () => {
    const w = worker(); await w.bind("bob");
    await w.dispatch("push", { data: { json: () => w.payload } });
    await w.bind("alice");
    await w.dispatch("push", { data: { json: () => ({ ...w.payload, expiresAt: Date.now() - 1 }) } });
    expect(w.showNotification).not.toHaveBeenCalled();
  });
  test("snooze works in the background and opens settings if the request fails", async () => {
    const w = worker(); await w.bind("alice");
    const notification = { data: w.payload, close: vi.fn() };
    await w.dispatch("notificationclick", { notification, action: "snooze" });
    expect(w.fetch).toHaveBeenCalledTimes(1); expect(w.openWindow).not.toHaveBeenCalled();
    w.fetch.mockRejectedValueOnce(new Error("Offline"));
    await w.dispatch("notificationclick", { notification, action: "snooze" });
    expect(w.openWindow).toHaveBeenCalledWith("https://gontobbo.example/settings?section=notifications");
  });
  test("notification clicks always open the local revision page and pages are never cached", async () => {
    const w = worker(); await w.bind("alice");
    await w.dispatch("notificationclick", { notification: { data: { ...w.payload, url: "https://evil.example" }, close: vi.fn() }, action: "open" });
    expect(w.openWindow).toHaveBeenCalledWith("https://gontobbo.example/revision");
    expect(w.listeners.fetch).toBeUndefined();
  });
});

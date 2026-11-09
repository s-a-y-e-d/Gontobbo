"use client";

import { useEffect } from "react";
import { useAuth } from "@clerk/nextjs";

export async function bindPushAccount(registration: ServiceWorkerRegistration, accountId: string | null) {
  const worker = registration.active;
  if (!worker) throw new Error("Notification worker is not ready.");
  await new Promise<void>((resolve, reject) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => { channel.port1.close(); reject(new Error("Notification setup timed out.")); }, 5000);
    channel.port1.onmessage = () => { clearTimeout(timer); channel.port1.close(); resolve(); };
    worker.postMessage({ type: "SET_ACTIVE_ACCOUNT", accountId }, [channel.port2]);
  });
}

// Keep this outside AuthGate so signing out also clears the service worker's
// account binding and removes notifications from the previous account.
export default function PushAccountBinding() {
  const { isLoaded, userId } = useAuth();
  useEffect(() => {
    if (!isLoaded || !("serviceWorker" in navigator)) return;
    let disposed = false;
    void navigator.serviceWorker.getRegistration("/").then(async registration => {
      if (!disposed && registration?.active) await bindPushAccount(registration, userId ?? null);
    }).catch(() => { /* Settings exposes permission and connection errors. */ });
    return () => { disposed = true; };
  }, [isLoaded, userId]);
  return null;
}

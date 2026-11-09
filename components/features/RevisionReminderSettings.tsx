"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useAuth } from "@clerk/nextjs";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useSnapshotQuery } from "./useSnapshotQuery";
import { bindPushAccount } from "./PushAccountBinding";

const button = "rounded-full border border-border-medium bg-pure-white px-4 py-2 text-sm font-semibold text-on-surface transition-colors hover:bg-gray-100 dark:bg-pure-white dark:hover:bg-surface-container focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-green dark:focus-visible:outline-brand-green active:opacity-80 dark:active:opacity-80 disabled:cursor-not-allowed disabled:opacity-50 dark:disabled:opacity-50";
const input = "rounded-full border border-border-medium bg-pure-white px-3 py-2 text-sm text-on-surface outline-none focus-visible:ring-2 focus-visible:ring-brand-green dark:bg-pure-white dark:text-on-surface dark:focus-visible:ring-brand-green disabled:opacity-50 dark:disabled:opacity-50";

function subscribeViewport(callback: () => void) {
  const media = window.matchMedia("(min-width: 1024px)");
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}
const desktopSnapshot = () => window.matchMedia("(min-width: 1024px)").matches;
const serverSnapshot = () => false;

function timeString(minutes: number) {
  if (!Number.isFinite(minutes)) return "";
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}
function timeMinutes(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}
function formatTime(timestamp: number) {
  return new Intl.DateTimeFormat("bn-BD", { timeZone: "Asia/Dhaka", dateStyle: "medium", timeStyle: "short" }).format(timestamp);
}
function publicKeyBytes(key: string): Uint8Array<ArrayBuffer> {
  const decoded = atob(key.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(key.length / 4) * 4, "="));
  return Uint8Array.from(decoded, c => c.charCodeAt(0));
}
function newToken() {
  return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function friendlyError(caught: unknown) {
  const message = caught instanceof Error ? caught.message : "";
  if (/rate limit/i.test(message)) return "খুব দ্রুত কয়েকবার অনুরোধ হয়েছে। একটু পরে আবার চেষ্টা করুন।";
  if (/configuration|configured/i.test(message)) return "পুশ সার্ভিস প্রস্তুত হয়নি। একটু পরে আবার চেষ্টা করুন।";
  if (/^[\u0980-\u09ff]/.test(message)) return message;
  return "কাজটি করা যায়নি। সংযোগ ও নোটিফিকেশনের অনুমতি দেখে আবার চেষ্টা করুন।";
}

function Toggle({ checked, onChange, disabled, children }: {
  checked: boolean; onChange: (checked: boolean) => void; disabled: boolean; children: React.ReactNode;
}) {
  return <label className="flex items-center justify-between gap-4 py-2 text-sm text-on-surface dark:text-on-surface">
    {children}
    <input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} disabled={disabled}
      className="h-5 w-5 shrink-0 accent-brand-green hover:opacity-80 dark:hover:opacity-80 active:opacity-70 dark:active:opacity-70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-green dark:focus-visible:outline-brand-green disabled:opacity-50 dark:disabled:opacity-50" />
  </label>;
}

export default function RevisionReminderSettings({ mobile = false }: { mobile?: boolean }) {
  const isDesktop = useSyncExternalStore(subscribeViewport, desktopSnapshot, serverSnapshot);
  const visible = mobile ? !isDesktop : isDesktop;
  const { userId } = useAuth();
  const { data, error, refresh } = useSnapshotQuery(api.revisionReminders.getSettings, visible ? {} : "skip");
  const save = useMutation(api.revisionReminders.savePreferences);
  const register = useMutation(api.revisionReminders.registerDevice);
  const remove = useMutation(api.revisionReminders.removeDevice);
  const test = useMutation(api.revisionReminders.sendTest);
  const snooze = useMutation(api.revisionReminders.snooze);
  const cancelSnooze = useMutation(api.revisionReminders.cancelSnooze);
  const [draft, setDraft] = useState<{ enabled: boolean; morningMinutes: number; eveningEnabled: boolean; eveningMinutes: number; showDetails: boolean } | null>(null);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("default");
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [deviceName, setDeviceName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!visible) return;
    const check = () => {
      setPermission(window.isSecureContext && "Notification" in window && "serviceWorker" in navigator && "PushManager" in window
        ? Notification.permission : "unsupported");
      try { setDeviceId(localStorage.getItem(`revision-push-device:${userId}`)); } catch { /* Storage can be blocked. */ }
    };
    check();
    window.addEventListener("focus", check);
    return () => window.removeEventListener("focus", check);
  }, [visible, userId]);

  if (!visible) return null;
  const prefs = draft ?? (data ? { enabled: data.enabled, morningMinutes: data.morningMinutes,
    eveningEnabled: data.eveningEnabled, eveningMinutes: data.eveningMinutes, showDetails: data.showDetails } : null);
  const update = (patch: Partial<NonNullable<typeof prefs>>) => { if (prefs) setDraft({ ...prefs, ...patch }); };
  const currentDevice = data?.devices.find(device => device.id === deviceId);
  const validTimes = prefs && Number.isInteger(prefs.morningMinutes) && prefs.morningMinutes >= 0 && prefs.morningMinutes < 1440 &&
    Number.isInteger(prefs.eveningMinutes) && prefs.eveningMinutes >= 0 && prefs.eveningMinutes < 1440;

  async function run(action: () => Promise<void>) {
    setBusy(true); setMessage(""); setFailed(false);
    try {
      await action();
      const refreshed = await refresh();
      if (!refreshed) throw new Error("সেটিংস আবার লোড করা যায়নি। রিফ্রেশ করুন।");
    } catch (caught) {
      setFailed(true);
      setMessage(friendlyError(caught));
    } finally { setBusy(false); }
  }

  async function connectDevice() {
    if (!data?.publicKey || !userId || !prefs) return;
    // Request permission directly from this click, before unrelated async work.
    const granted = await Notification.requestPermission();
    setPermission(granted);
    if (granted !== "granted") throw new Error("ব্রাউজারের Site settings থেকে Notifications অনুমতি দিন।");
    await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
    const ready = await navigator.serviceWorker.ready;
    await bindPushAccount(ready, userId);
    let subscription = await ready.pushManager.getSubscription();
    const key = publicKeyBytes(data.publicKey);
    if (subscription?.options.applicationServerKey &&
        btoa(String.fromCharCode(...new Uint8Array(subscription.options.applicationServerKey))) !==
        btoa(String.fromCharCode(...key))) {
      await subscription.unsubscribe();
      subscription = null;
    }
    subscription ??= await ready.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
    const serialized = subscription.toJSON();
    if (!serialized.endpoint || !serialized.keys?.p256dh || !serialized.keys.auth) throw new Error("পুশ সাবস্ক্রিপশন তৈরি করা যায়নি।");
    const id = await register({ endpoint: serialized.endpoint, p256dh: serialized.keys.p256dh, auth: serialized.keys.auth,
      deviceName: deviceName.trim() || (/Android/i.test(navigator.userAgent) ? "Android" : /iPhone|iPad/i.test(navigator.userAgent) ? "iPhone / iPad" : "Computer"),
      snoozeToken: newToken() });
    setDeviceId(id);
    try { localStorage.setItem(`revision-push-device:${userId}`, id); } catch { /* Subscription is still registered. */ }
    await save({ ...prefs, enabled: true });
    setDraft(null);
    setMessage("ডিভাইস যুক্ত হয়েছে। টেস্ট নোটিফিকেশন পাঠিয়ে দেখুন।");
  }

  async function disconnect(id: Id<"revisionPushDevices">) {
    // Server removal first ensures pushes stop even if browser cleanup fails.
    await remove({ deviceId: id });
    if (id === deviceId) {
      setDeviceId(null);
      try { localStorage.removeItem(`revision-push-device:${userId}`); } catch { /* Ignore unavailable local storage. */ }
      const registration = await navigator.serviceWorker?.getRegistration("/");
      const subscription = await registration?.pushManager.getSubscription();
      await subscription?.unsubscribe();
    }
    setDraft(null); setMessage("ডিভাইস সরানো হয়েছে।");
  }

  const body = <div className="space-y-5 p-4 sm:p-5">
    {error ? <p role="alert" className="text-sm text-error-red dark:text-error-red">নোটিফিকেশন সেটিংস লোড করা যায়নি। <button className={button} onClick={() => void refresh()}>আবার চেষ্টা</button></p> : null}
    {!data && !error ? <p role="status" className="text-sm text-gray-500 dark:text-gray-500">সেটিংস লোড হচ্ছে…</p> : null}
    {data && prefs ? <>
      {!data.configured ? <p role="status" className="rounded-xl border border-border-medium bg-surface-container p-3 text-sm text-on-surface dark:bg-surface-container dark:text-on-surface">পুশ সার্ভিস এখনো প্রস্তুত হয়নি। প্রস্তুত হলে এখানে ডিভাইস যুক্ত করতে পারবেন।</p> : null}
      <div className="space-y-3">
        <Toggle checked={prefs.enabled} onChange={enabled => update({ enabled })} disabled={busy || !data.configured || !data.devices.length}>রিভিশন রিমাইন্ডার</Toggle>
        <label className="flex flex-wrap items-center justify-between gap-3 text-sm text-on-surface dark:text-on-surface">রিভিশন রিমাইন্ডারের সময়
          <input aria-label="রিভিশন রিমাইন্ডারের সময়" type="time" value={timeString(prefs.morningMinutes)} disabled={busy}
            onChange={event => update({ morningMinutes: timeMinutes(event.target.value) })} className={input} /></label>
        <Toggle checked={prefs.eveningEnabled} onChange={eveningEnabled => update({ eveningEnabled })} disabled={busy}>রিভিশন বাকি থাকলে দ্বিতীয় রিমাইন্ডার দিন</Toggle>
        {prefs.eveningEnabled ? <label className="flex flex-wrap items-center justify-between gap-3 text-sm text-on-surface dark:text-on-surface">দ্বিতীয় রিমাইন্ডারের সময়
          <input aria-label="দ্বিতীয় রিমাইন্ডারের সময়" type="time" value={timeString(prefs.eveningMinutes)} disabled={busy}
            onChange={event => update({ eveningMinutes: timeMinutes(event.target.value) })} className={input} /></label> : null}
        <p className="text-xs leading-5 text-gray-500 dark:text-gray-500">সব সময় ঢাকা অনুযায়ী। আজকের ও বকেয়া রিভিশন একসাথে দেখাবে। কাজ না থাকলে নোটিফিকেশন আসবে না। ডিভাইস অফলাইন থাকলে পৌঁছাতে দেরি হতে পারে।</p>
        <Toggle checked={prefs.showDetails} onChange={showDetails => update({ showDetails })} disabled={busy}>লক স্ক্রিনে বিষয় ও কনসেপ্টের নাম দেখান</Toggle>
        <p className="text-xs text-gray-500 dark:text-gray-500">বন্ধ থাকলে শুধু রিভিশনের সংখ্যা দেখাবে।</p>
        {!validTimes ? <p role="alert" className="text-sm text-error-red dark:text-error-red">রিমাইন্ডারের জন্য সঠিক সময় দিন (০০:০০–২৩:৫৯)।</p> : null}
        <button className={button} disabled={busy || !draft || !validTimes} onClick={() => void run(async () => {
          await save(prefs); setDraft(null); setMessage("রিমাইন্ডার সেটিংস সেভ হয়েছে।");
        })}>{busy ? "কাজ হচ্ছে…" : "পরিবর্তন সেভ করুন"}</button>
      </div>
      <div className="space-y-3 border-t border-border-subtle pt-4">
        <p className="text-sm font-semibold text-on-surface dark:text-on-surface">এই ডিভাইস</p>
        <p className="text-sm text-gray-500 dark:text-gray-500">{permission === "unsupported" ? "এই ব্রাউজারে পুশ পাওয়া যাচ্ছে না। সমর্থিত ব্রাউজার ব্যবহার করুন। iPhone/iPad-এ আগে অ্যাপটি Home Screen-এ যোগ করুন।" : permission === "denied" ? "অনুমতি বন্ধ আছে। ব্রাউজারের Site settings → Notifications থেকে চালু করুন।" : currentDevice && permission === "granted" ? "ডিভাইস যুক্ত আছে।" : "নোটিফিকেশন পেতে এই ডিভাইসে অনুমতি দিন।"}</p>
        <label className="block text-sm text-on-surface dark:text-on-surface">ডিভাইসের নাম
          <input maxLength={80} value={deviceName} onChange={event => setDeviceName(event.target.value)} placeholder={currentDevice?.name ?? "যেমন: আমার ফোন"} className={`${input} mt-2 w-full`} disabled={busy} /></label>
        <div className="flex flex-wrap gap-2">
          <button className={button} disabled={busy || !data.configured || permission === "unsupported" || permission === "denied"}
            onClick={() => void run(connectDevice)}>{currentDevice ? "ডিভাইস আবার যুক্ত করুন" : "এই ডিভাইসে চালু করুন"}</button>
          {currentDevice ? <button className={button} disabled={busy || permission !== "granted"} onClick={() => void run(async () => {
            await test({ deviceId: currentDevice.id }); setMessage("টেস্ট পাঠানোর অনুরোধ হয়েছে। ডেলিভারি অবস্থা রিফ্রেশ করে দেখুন।");
          })}>টেস্ট নোটিফিকেশন</button> : null}
        </div>
      </div>
      {data.enabled ? <div className="space-y-3 border-t border-border-subtle pt-4">
        {data.nextReminderAt ? <p className="text-sm text-gray-500 dark:text-gray-500">পরবর্তী নিয়মিত রিমাইন্ডার: {formatTime(data.nextReminderAt)}</p> : null}
        {data.snoozedUntil ? <p className="text-sm text-gray-500 dark:text-gray-500">স্নুজ করা আছে: {formatTime(data.snoozedUntil)} পর্যন্ত</p> : null}
        <button className={button} disabled={busy} onClick={() => void run(async () => {
          if (data.snoozedUntil) await cancelSnooze({}); else await snooze({});
          setMessage(data.snoozedUntil ? "স্নুজ বাতিল হয়েছে।" : "রিমাইন্ডার ১ ঘণ্টা পরে আসবে, যদি রিভিশন বাকি থাকে।");
        })}>{data.snoozedUntil ? "স্নুজ বাতিল করুন" : "১ ঘণ্টা স্নুজ করুন"}</button>
      </div> : null}
      <div className="space-y-3 border-t border-border-subtle pt-4">
        <p className="text-sm font-semibold text-on-surface dark:text-on-surface">যুক্ত ডিভাইস ({data.devices.length}/10)</p>
        {data.devices.length === 0 ? <p className="text-sm text-gray-500 dark:text-gray-500">এখনো কোনো ডিভাইস যুক্ত নেই।</p> : data.devices.map(device => <div key={device.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border-subtle p-3">
          <div className="min-w-0 text-sm text-on-surface dark:text-on-surface"><p className="break-words font-medium">{device.name}{device.id === deviceId ? " · এই ডিভাইস" : ""}</p>
            {device.lastSuccessAt ? <p className="text-xs text-gray-500 dark:text-gray-500">শেষ পাঠানো: {formatTime(device.lastSuccessAt)}</p> : null}
            {device.lastError ? <p className="text-xs text-error-red dark:text-error-red">{device.lastError}</p> : null}</div>
          <button className={button} aria-label={`${device.name} সরান`} disabled={busy} onClick={() => void run(() => disconnect(device.id))}>সরান</button>
        </div>)}
      </div>
      <details className="border-t border-border-subtle pt-4">
        <summary className="cursor-pointer rounded-lg py-2 text-sm font-semibold text-on-surface hover:bg-gray-100 dark:text-on-surface dark:hover:bg-surface-container focus-visible:outline-2 focus-visible:outline-brand-green dark:focus-visible:outline-brand-green">সাম্প্রতিক ডেলিভারি</summary>
        <p className="py-2 text-xs text-gray-500 dark:text-gray-500">“পাঠানো হয়েছে” অর্থ পুশ সার্ভিস গ্রহণ করেছে। ডিভাইসে দেখা নিশ্চিত করে না।</p>
        {data.history.length ? data.history.map(item => <div key={item.id} className="border-t border-border-subtle py-2 text-sm text-gray-500 dark:text-gray-500">
          <p>{formatTime(item.scheduledAt)} · {({ morning: "রিভিশন রিমাইন্ডার", evening: "দ্বিতীয় রিমাইন্ডার", snooze: "স্নুজ", test: "টেস্ট" })[item.kind]} · {({ queued: "অপেক্ষায়", sent: "পাঠানো হয়েছে", skipped: "প্রয়োজন হয়নি", failed: "পাঠানো যায়নি" } as Record<string, string>)[item.status]}</p>
          {item.error ? <p className="text-error-red dark:text-error-red">{item.error}</p> : null}
        </div>) : <p className="text-sm text-gray-500 dark:text-gray-500">এখনো কোনো ডেলিভারি নেই।</p>}
      </details>
      <button className={button} disabled={busy} onClick={() => void refresh()}>ডেলিভারি অবস্থা রিফ্রেশ করুন</button>
    </> : null}
    {message ? <p role={failed ? "alert" : "status"} className={`rounded-xl border border-border-subtle p-3 text-sm ${failed ? "text-error-red dark:text-error-red" : "text-on-surface dark:text-on-surface"}`}>{message}</p> : null}
  </div>;
  const heading = <div><h2 className="font-card-title text-lg text-on-surface dark:text-on-surface">রিভিশন নোটিফিকেশন</h2><p className="mt-1 text-sm text-gray-500 dark:text-gray-500">আপনার ঠিক করা সময়ে আজকের ও বকেয়া রিভিশন মনে করাবে।</p></div>;
  return mobile ? <details className="overflow-hidden rounded-2xl border border-border-subtle bg-pure-white dark:bg-pure-white"><summary className="cursor-pointer p-4 hover:bg-gray-100 dark:hover:bg-surface-container focus-visible:outline-2 focus-visible:outline-brand-green dark:focus-visible:outline-brand-green">{heading}</summary>{body}</details>
    : <section className="overflow-hidden rounded-2xl border border-border-subtle bg-pure-white dark:bg-pure-white"><div className="border-b border-border-subtle p-5">{heading}</div>{body}</section>;
}

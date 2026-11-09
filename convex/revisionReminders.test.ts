/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { beforeEach, afterEach, describe, expect, test, vi } from "vitest";
import workpoolTest from "@convex-dev/workpool/test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import type { Id } from "./_generated/dataModel";
import { DAY_MS, dhakaDay, nextReminderTime, validateReminderTimes } from "./revisionReminderSchedule";
import { validatePushEndpoint } from "./revisionReminders";

const { sendNotification } = vi.hoisted(() => ({ sendNotification: vi.fn() }));
vi.mock("web-push", () => ({ default: { sendNotification } }));
const modules = import.meta.glob("./**/*.ts");
const NOW = Date.UTC(2026, 10, 4, 1, 30); // 07:30 Dhaka
const preferences = { enabled: true, morningMinutes: 480, eveningEnabled: true, eveningMinutes: 1140, showDetails: false };
const subscription = { endpoint: "https://fcm.googleapis.com/fcm/send/test-device", p256dh: "B".repeat(87),
  auth: "A".repeat(22), snoozeToken: "C".repeat(43), deviceName: "My phone" };

beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(NOW); sendNotification.mockReset(); sendNotification.mockResolvedValue({ statusCode: 201 });
  vi.stubEnv("VAPID_PUBLIC_KEY", "public-test-key"); vi.stubEnv("VAPID_PRIVATE_KEY", "private-test-key");
  vi.stubEnv("VAPID_SUBJECT", "https://example.com"); vi.stubEnv("CONVEX_SITE_URL", "https://example.convex.site");
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllEnvs(); });

async function fixture() {
  const base = convexTest(schema, modules);
  workpoolTest.register(base, "revisionPushPool"); rateLimiterTest.register(base);
  const t = base.withIdentity({ subject: "alice", tokenIdentifier: "test|alice" });
  const { userId } = await t.mutation(api.auth.ensureCurrentUser, {});
  const deviceId = await t.mutation(api.revisionReminders.registerDevice, subscription);
  await t.mutation(api.revisionReminders.savePreferences, preferences);
  const prefs = await t.run(ctx => ctx.db.query("revisionReminderPreferences").withIndex("by_userId", q => q.eq("userId", userId)).unique());
  return { t, base, userId, deviceId, prefs: prefs! };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;

async function addConcepts(f: Fixture, count = 1) {
  return f.t.run(async ctx => {
    const subjectId = await ctx.db.insert("subjects", { userId: f.userId, name: "Physics", slug: "physics", order: 0,
      chapterTrackers: [], conceptTrackers: [{ key: "book", label: "Book", avgMinutes: 30 }] });
    const chapterId = await ctx.db.insert("chapters", { userId: f.userId, subjectId, name: "Motion", slug: "motion", order: 0, inNextTerm: true });
    const conceptIds: Id<"concepts">[] = [];
    for (let i = 0; i < count; i++) conceptIds.push(await ctx.db.insert("concepts", { userId: f.userId, chapterId,
      name: `Velocity ${i}`, order: i, nextReviewAt: dhakaDay(NOW) }));
    return { chapterId, conceptIds, subjectId };
  });
}

async function queuedDelivery(f: Fixture, kind: "morning" | "test" = "morning") {
  return f.t.run(ctx => ctx.db.insert("revisionReminderDeliveries", { userId: f.userId, deviceId: f.deviceId,
    generation: f.prefs.generation, kind, key: `test:${kind}`, scheduledAt: Date.now(), status: "queued" }));
}

describe("Dhaka reminder schedule", () => {
  test("8 AM is 02:00 UTC and 7 PM is 13:00 UTC", () => {
    expect(nextReminderTime(NOW, 480)).toBe(Date.UTC(2026, 10, 4, 2));
    expect(nextReminderTime(NOW, 1140)).toBe(Date.UTC(2026, 10, 4, 13));
    expect(nextReminderTime(Date.UTC(2026, 10, 4, 2), 480)).toBe(Date.UTC(2026, 10, 5, 2));
    expect(dhakaDay(Date.UTC(2026, 10, 3, 18))).toBe(Date.UTC(2026, 10, 3, 18));
    expect(nextReminderTime(NOW, 480) + DAY_MS).toBe(Date.UTC(2026, 10, 5, 2));
  });
  test("rejects invalid times rather than scheduling broken jobs", () => {
    for (const args of [[1440, 1140], [480, -1], [NaN, 1140], [-1, 1140], [480, 1440], [480.5, 1140]]) {
      expect(() => validateReminderTimes(...args as [number, number])).toThrow();
    }
  });
  test("both reminders accept any time of day, in either order or at the same time", () => {
    for (const args of [[0, 1439], [1439, 0], [1200, 600], [720, 720], [480, 600]]) {
      expect(() => validateReminderTimes(...args as [number, number])).not.toThrow();
    }
  });
});

describe("notification preferences and access", () => {
  test("rejects untrusted network endpoints", () => {
    for (const endpoint of ["http://127.0.0.1/a", "https://fcm.googleapis.com.evil.example/a", "https://example.com/a",
      "https://user:pass@fcm.googleapis.com/a", "https://fcm.googleapis.com:8080/a"]) {
      expect(() => validatePushEndpoint(endpoint)).toThrow();
    }
    expect(() => validatePushEndpoint(subscription.endpoint)).not.toThrow();
  });
  test("returns only safe device metadata and scopes reads and writes to the signed-in account", async () => {
    const f = await fixture();
    const settings = await f.t.query(api.revisionReminders.getSettings, {});
    expect(settings.morningMinutes).toBe(480); expect(settings.eveningMinutes).toBe(1140);
    expect(settings.devices).toHaveLength(1);
    expect(JSON.stringify(settings.devices)).not.toContain(subscription.auth);
    expect(JSON.stringify(settings.devices)).not.toContain(subscription.endpoint);
    expect(JSON.stringify(settings.devices)).not.toContain(subscription.snoozeToken);
    const other = f.base.withIdentity({ subject: "bob", tokenIdentifier: "test|bob" });
    await other.mutation(api.auth.ensureCurrentUser, {});
    expect((await other.query(api.revisionReminders.getSettings, {})).devices).toHaveLength(0);
    await expect(other.mutation(api.revisionReminders.removeDevice, { deviceId: f.deviceId })).rejects.toThrow("Device not found");
    await expect(other.mutation(api.revisionReminders.sendTest, { deviceId: f.deviceId })).rejects.toThrow("Device not found");
    await expect(f.base.query(api.revisionReminders.getSettings, {})).rejects.toThrow("Not authenticated");
  });
  test("settings changes invalidate queued deliveries and cancel the previous schedule", async () => {
    const f = await fixture(); const deliveryId = await queuedDelivery(f);
    await f.t.mutation(api.revisionReminders.savePreferences, { ...preferences, enabled: false });
    expect(await f.t.query(internal.revisionReminders.deliveryContext, { deliveryId, now: NOW })).toBeNull();
    const state = await f.t.run(ctx => ctx.db.system.get(f.prefs.scheduledJobId!));
    expect(state?.state.kind).toBe("canceled");
  });
  test("removing the last device turns off reminders", async () => {
    const f = await fixture(); await f.t.mutation(api.revisionReminders.removeDevice, { deviceId: f.deviceId });
    const settings = await f.t.query(api.revisionReminders.getSettings, {});
    expect(settings.enabled).toBe(false); expect(settings.nextReminderAt).toBeNull();
  });
  test("test pushes have a server-enforced rate limit", async () => {
    const f = await fixture();
    for (let i = 0; i < 3; i++) await f.t.mutation(api.revisionReminders.sendTest, { deviceId: f.deviceId });
    await expect(f.t.mutation(api.revisionReminders.sendTest, { deviceId: f.deviceId })).rejects.toThrow();
  });
});

describe("scheduled delivery and snooze", () => {
  test("a daytime second reminder and nighttime first reminder schedule chronologically", async () => {
    const f = await fixture();
    await f.t.mutation(api.revisionReminders.savePreferences, {
      ...preferences, morningMinutes: 1200, eveningMinutes: 600,
    });
    const prefs = (await f.t.run(ctx => ctx.db.get(f.prefs._id)))!;
    expect(prefs.nextReminderAt).toBe(Date.UTC(2026, 10, 4, 4)); // 10 AM Dhaka
    vi.setSystemTime(prefs.nextReminderAt!);
    await f.t.mutation(internal.revisionReminders.runScheduled, { preferenceId: prefs._id,
      generation: prefs.generation, kind: "evening", scheduledAt: prefs.nextReminderAt! });
    expect((await f.t.query(api.revisionReminders.getSettings, {})).nextReminderAt)
      .toBe(Date.UTC(2026, 10, 4, 14)); // 8 PM Dhaka
    vi.setSystemTime(Date.UTC(2026, 10, 4, 14));
    await f.t.mutation(internal.revisionReminders.runScheduled, { preferenceId: prefs._id,
      generation: prefs.generation, kind: "morning", scheduledAt: Date.now() });
    expect((await f.t.query(api.revisionReminders.getSettings, {})).nextReminderAt)
      .toBe(Date.UTC(2026, 10, 5, 4));
  });
  test("matching reminder times send one notification and schedule the next day", async () => {
    const f = await fixture();
    await f.t.mutation(api.revisionReminders.savePreferences, {
      ...preferences, morningMinutes: 0, eveningMinutes: 0,
    });
    const prefs = (await f.t.run(ctx => ctx.db.get(f.prefs._id)))!;
    vi.setSystemTime(prefs.nextReminderAt!);
    await f.t.mutation(internal.revisionReminders.runScheduled, { preferenceId: prefs._id,
      generation: prefs.generation, kind: "morning", scheduledAt: prefs.nextReminderAt! });
    const settings = await f.t.query(api.revisionReminders.getSettings, {});
    expect(settings.history).toHaveLength(1);
    expect(settings.nextReminderAt).toBe(prefs.nextReminderAt! + DAY_MS);
  });
  test("a morning job schedules the evening job and cannot create duplicate deliveries", async () => {
    const f = await fixture(); vi.setSystemTime(Date.UTC(2026, 10, 4, 2));
    const args = { preferenceId: f.prefs._id, generation: f.prefs.generation, kind: "morning" as const, scheduledAt: f.prefs.nextReminderAt! };
    await f.t.mutation(internal.revisionReminders.runScheduled, args);
    await f.t.mutation(internal.revisionReminders.runScheduled, args);
    const settings = await f.t.query(api.revisionReminders.getSettings, {});
    expect(settings.history).toHaveLength(1);
    expect(settings.nextReminderAt).toBe(Date.UTC(2026, 10, 4, 13));
  });
  test("disabling the follow-up schedules the following morning", async () => {
    const f = await fixture();
    await f.t.mutation(api.revisionReminders.savePreferences, { ...preferences, eveningEnabled: false });
    const prefs = await f.t.run(ctx => ctx.db.get(f.prefs._id));
    vi.setSystemTime(Date.UTC(2026, 10, 4, 2));
    await f.t.mutation(internal.revisionReminders.runScheduled, { preferenceId: prefs!._id,
      generation: prefs!.generation, kind: "morning", scheduledAt: prefs!.nextReminderAt! });
    expect((await f.t.query(api.revisionReminders.getSettings, {})).nextReminderAt).toBe(Date.UTC(2026, 10, 5, 2));
  });
  test("snooze suppresses scheduled pushes, validates its token, and preserves review dates", async () => {
    const f = await fixture(); const { conceptIds } = await addConcepts(f);
    const deliveryId = await queuedDelivery(f);
    expect(await f.t.mutation(internal.revisionReminders.snoozeFromPush, { deviceId: f.deviceId, deliveryId, token: "X".repeat(43) })).toBe(false);
    expect(await f.t.mutation(internal.revisionReminders.snoozeFromPush, { deviceId: f.deviceId, deliveryId, token: subscription.snoozeToken })).toBe(true);
    expect((await f.t.query(api.revisionReminders.getSettings, {})).snoozedUntil).toBe(NOW + 3_600_000);
    expect(await f.t.query(internal.revisionReminders.deliveryContext, { deliveryId, now: NOW })).toBeNull();
    expect((await f.t.run(ctx => ctx.db.get(conceptIds[0])))?.nextReviewAt).toBe(dhakaDay(NOW));
    await f.t.mutation(api.revisionReminders.cancelSnooze, {});
    expect((await f.t.query(api.revisionReminders.getSettings, {})).snoozedUntil).toBeNull();
  });
});

describe("due queue and external push", () => {
  test("paginates the complete due queue, excludes paused/out-of-term/future reviews, and protects names by default", async () => {
    const f = await fixture(); const { chapterId, subjectId, conceptIds } = await addConcepts(f, 205);
    await f.t.run(async ctx => {
      await ctx.db.patch(conceptIds[0], { nextReviewAt: 0 });
      await ctx.db.insert("concepts", { userId: f.userId, chapterId, name: "Future", order: 300, nextReviewAt: dhakaDay(NOW) + DAY_MS });
      await ctx.db.insert("concepts", { userId: f.userId, chapterId, name: "Not scheduled", order: 301 });
      for (const excluded of ["paused", "out-of-term"]) {
        const id = await ctx.db.insert("chapters", { userId: f.userId, subjectId, name: excluded, slug: excluded, order: 1,
          inNextTerm: excluded !== "out-of-term", revisionEnabled: excluded !== "paused" });
        await ctx.db.insert("concepts", { userId: f.userId, chapterId: id, name: excluded, order: 0, nextReviewAt: dhakaDay(NOW) });
      }
    });
    const deliveryId = await queuedDelivery(f);
    await f.t.action(internal.revisionPush.send, { deliveryId });
    expect(sendNotification).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(sendNotification.mock.calls[0][1]);
    expect(payload.body).toContain("২০৪"); expect(payload.body).toContain("১");
    expect(payload.body).not.toContain("Velocity"); expect(payload.accountId).toBe("alice");
    expect((await f.t.run(ctx => ctx.db.get(deliveryId)))?.status).toBe("sent");
    await f.t.action(internal.revisionPush.send, { deliveryId });
    expect(sendNotification).toHaveBeenCalledTimes(1);
  });
  test("rechecks the queue and sends nothing after reviews are completed or rescheduled", async () => {
    const f = await fixture(); const { conceptIds } = await addConcepts(f);
    const deliveryId = await queuedDelivery(f);
    await f.t.run(ctx => ctx.db.patch(conceptIds[0], { nextReviewAt: dhakaDay(NOW) + DAY_MS }));
    await f.t.action(internal.revisionPush.send, { deliveryId });
    expect(sendNotification).not.toHaveBeenCalled();
    expect((await f.t.run(ctx => ctx.db.get(deliveryId)))?.status).toBe("skipped");
  });
  test("a test push works even without due reviews and expired subscriptions are removed", async () => {
    const f = await fixture(); const deliveryId = await queuedDelivery(f, "test");
    sendNotification.mockRejectedValueOnce({ statusCode: 410 });
    await f.t.action(internal.revisionPush.send, { deliveryId });
    expect(await f.t.run(ctx => ctx.db.get(f.deviceId))).toBeNull();
    expect((await f.t.run(ctx => ctx.db.get(deliveryId)))?.status).toBe("failed");
    expect((await f.t.query(api.revisionReminders.getSettings, {})).enabled).toBe(false);
  });
  test("provider overloads remain retryable and a successful retry records delivery", async () => {
    const f = await fixture(); const deliveryId = await queuedDelivery(f, "test");
    sendNotification.mockRejectedValueOnce({ statusCode: 429 });
    await expect(f.t.action(internal.revisionPush.send, { deliveryId })).rejects.toThrow("temporarily unavailable");
    expect((await f.t.run(ctx => ctx.db.get(deliveryId)))?.status).toBe("queued");
    await f.t.action(internal.revisionPush.send, { deliveryId });
    expect((await f.t.run(ctx => ctx.db.get(deliveryId)))?.status).toBe("sent");
  });
  test("legacy rows are read only for the designated legacy owner", async () => {
    const f = await fixture(); const { chapterId } = await addConcepts(f);
    await f.t.run(ctx => ctx.db.insert("concepts", { chapterId, name: "Legacy", order: 2, nextReviewAt: dhakaDay(NOW) }));
    const args = { userId: f.userId, legacy: true, now: NOW, paginationOpts: { numItems: 100, cursor: null } };
    expect((await f.t.query(internal.revisionReminders.duePage, args)).today).toBe(0);
    await f.t.run(ctx => ctx.db.patch(f.userId, { legacyWorkspaceOwner: true }));
    expect((await f.t.query(internal.revisionReminders.duePage, args)).today).toBe(1);
  });
  test("account switching on the same browser invalidates the previous account's queued push", async () => {
    const f = await fixture(); const deliveryId = await queuedDelivery(f);
    const other = f.base.withIdentity({ subject: "bob", tokenIdentifier: "test|bob" });
    await other.mutation(api.auth.ensureCurrentUser, {});
    await expect(other.mutation(api.revisionReminders.registerDevice, { ...subscription, auth: "D".repeat(22) }))
      .rejects.toThrow("belongs to another account");
    await other.mutation(api.revisionReminders.registerDevice, subscription);
    expect(await f.t.query(internal.revisionReminders.deliveryContext, { deliveryId, now: NOW })).toBeNull();
    expect((await other.query(api.revisionReminders.getSettings, {})).devices).toHaveLength(1);
  });
});

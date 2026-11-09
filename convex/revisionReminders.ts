import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { RateLimiter, MINUTE } from "@convex-dev/rate-limiter";
import { Workpool } from "@convex-dev/workpool";
import { components, internal } from "./_generated/api";
import { query, mutation, internalQuery, internalMutation, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireCurrentUser, canAccessOwnedDocument } from "./auth";
import { DAY_MS, dhakaDay, nextReminderTime, validateReminderTimes } from "./revisionReminderSchedule";

const kind = v.union(v.literal("morning"), v.literal("evening"), v.literal("snooze"), v.literal("test"));
const preferencesArgs = {
  enabled: v.boolean(), morningMinutes: v.number(), eveningEnabled: v.boolean(),
  eveningMinutes: v.number(), showDetails: v.boolean(),
};
const defaults = { enabled: false, morningMinutes: 480, eveningEnabled: true, eveningMinutes: 1140, showDetails: false };
const pushPool = new Workpool(components.revisionPushPool, { maxParallelism: 4 });
const limiter = new RateLimiter(components.rateLimiter, {
  testPush: { kind: "token bucket", rate: 3, period: MINUTE, capacity: 3 },
  subscribe: { kind: "token bucket", rate: 10, period: MINUTE, capacity: 10 },
  snooze: { kind: "token bucket", rate: 3, period: MINUTE, capacity: 3 },
});

function configured() {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && (process.env.VAPID_SUBJECT || process.env.CONVEX_SITE_URL));
}

async function getPreferences(ctx: Pick<QueryCtx, "db">, userId: Id<"users">) {
  return ctx.db.query("revisionReminderPreferences").withIndex("by_userId", q => q.eq("userId", userId)).unique();
}

async function cancelJob(ctx: MutationCtx, id?: Id<"_scheduled_functions">) {
  if (!id) return;
  const job = await ctx.db.system.get(id);
  if (job?.state.kind === "pending") await ctx.scheduler.cancel(id);
}

async function scheduleNext(ctx: MutationCtx, prefs: Doc<"revisionReminderPreferences">) {
  const now = Date.now();
  const morning = nextReminderTime(now, prefs.morningMinutes);
  const evening = prefs.eveningEnabled ? nextReminderTime(now, prefs.eveningMinutes) : Infinity;
  const at = Math.min(morning, evening);
  const scheduledJobId = await ctx.scheduler.runAt(at, internal.revisionReminders.runScheduled, {
    preferenceId: prefs._id, generation: prefs.generation,
    kind: morning <= evening ? "morning" : "evening", scheduledAt: at,
  });
  await ctx.db.patch(prefs._id, { scheduledJobId, nextReminderAt: at });
}

async function disable(ctx: MutationCtx, prefs: Doc<"revisionReminderPreferences">) {
  await cancelJob(ctx, prefs.scheduledJobId);
  await cancelJob(ctx, prefs.snoozeJobId);
  await ctx.db.patch(prefs._id, { enabled: false, generation: prefs.generation + 1,
    scheduledJobId: undefined, snoozeJobId: undefined, nextReminderAt: undefined, snoozedUntil: undefined });
}

export function validatePushEndpoint(endpoint: string) {
  let url: URL;
  try { url = new URL(endpoint); } catch { throw new Error("Invalid push endpoint"); }
  const host = url.hostname;
  const allowed = host === "fcm.googleapis.com" || host === "updates.push.services.mozilla.com" ||
    host === "web.push.apple.com" || host.endsWith(".notify.windows.com");
  if (!allowed || url.protocol !== "https:" || url.port || url.username || url.password || endpoint.length > 2048) {
    throw new Error("Unsupported push provider");
  }
}

export const getSettings = query({
  args: {},
  returns: v.object({
    ...preferencesArgs, configured: v.boolean(), publicKey: v.union(v.string(), v.null()),
    nextReminderAt: v.union(v.number(), v.null()), snoozedUntil: v.union(v.number(), v.null()),
    devices: v.array(v.object({ id: v.id("revisionPushDevices"), name: v.string(), createdAt: v.number(),
      lastSuccessAt: v.union(v.number(), v.null()), lastError: v.union(v.string(), v.null()) })),
    history: v.array(v.object({ id: v.id("revisionReminderDeliveries"), kind, scheduledAt: v.number(),
      status: v.union(v.literal("queued"), v.literal("sent"), v.literal("skipped"), v.literal("failed")), error: v.union(v.string(), v.null()) })),
  }),
  handler: async ctx => {
    const user = await requireCurrentUser(ctx);
    const [prefs, devices, history] = await Promise.all([
      getPreferences(ctx, user._id),
      ctx.db.query("revisionPushDevices").withIndex("by_userId", q => q.eq("userId", user._id)).take(10),
      ctx.db.query("revisionReminderDeliveries").withIndex("by_userId", q => q.eq("userId", user._id)).order("desc").take(10),
    ]);
    return {
      enabled: prefs?.enabled ?? defaults.enabled, morningMinutes: prefs?.morningMinutes ?? 480,
      eveningEnabled: prefs?.eveningEnabled ?? true, eveningMinutes: prefs?.eveningMinutes ?? 1140,
      showDetails: prefs?.showDetails ?? false, configured: configured(),
      publicKey: configured() ? process.env.VAPID_PUBLIC_KEY! : null,
      nextReminderAt: prefs?.nextReminderAt ?? null, snoozedUntil: prefs?.snoozedUntil ?? null,
      devices: devices.map(d => ({ id: d._id, name: d.deviceName, createdAt: d.createdAt,
        lastSuccessAt: d.lastSuccessAt ?? null, lastError: d.lastError ?? null })),
      history: history.map(d => ({ id: d._id, kind: d.kind, scheduledAt: d.scheduledAt, status: d.status, error: d.error ?? null })),
    };
  },
});

export const savePreferences = mutation({
  args: preferencesArgs, returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    validateReminderTimes(args.morningMinutes, args.eveningMinutes);
    if (args.enabled) {
      if (!configured()) throw new Error("Push delivery is not configured yet.");
      const device = await ctx.db.query("revisionPushDevices").withIndex("by_userId", q => q.eq("userId", user._id)).first();
      if (!device) throw new Error("Enable notifications on a device first.");
    }
    const previous = await getPreferences(ctx, user._id);
    if (previous) {
      await cancelJob(ctx, previous.scheduledJobId);
      await cancelJob(ctx, previous.snoozeJobId);
    }
    const fields = { ...args, generation: (previous?.generation ?? 0) + 1,
      scheduledJobId: undefined, snoozeJobId: undefined, snoozedUntil: undefined, nextReminderAt: undefined };
    const id = previous?._id ?? await ctx.db.insert("revisionReminderPreferences", { userId: user._id, ...fields });
    if (previous) await ctx.db.patch(id, fields);
    const prefs = await ctx.db.get(id);
    if (prefs?.enabled) await scheduleNext(ctx, prefs);
    return null;
  },
});

export const registerDevice = mutation({
  args: { endpoint: v.string(), p256dh: v.string(), auth: v.string(), deviceName: v.string(), snoozeToken: v.string() },
  returns: v.id("revisionPushDevices"),
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    await limiter.limit(ctx, "subscribe", { key: user._id, throws: true });
    if (!configured()) throw new Error("Push delivery is not configured yet.");
    validatePushEndpoint(args.endpoint);
    if (!/^[A-Za-z0-9_-]{87}$/.test(args.p256dh) || !/^[A-Za-z0-9_-]{22}$/.test(args.auth) ||
        !/^[A-Za-z0-9_-]{43}$/.test(args.snoozeToken) || !args.deviceName.trim() || args.deviceName.length > 80) {
      throw new Error("Invalid push subscription");
    }
    const existing = await ctx.db.query("revisionPushDevices").withIndex("by_endpoint", q => q.eq("endpoint", args.endpoint)).unique();
    if (existing && existing.userId !== user._id && (existing.auth !== args.auth || existing.p256dh !== args.p256dh)) {
      throw new Error("This subscription belongs to another account.");
    }
    const devices = await ctx.db.query("revisionPushDevices").withIndex("by_userId", q => q.eq("userId", user._id)).take(10);
    if ((!existing || existing.userId !== user._id) && devices.length >= 10) throw new Error("Remove an old device before adding another.");
    const fields = { ...args, deviceName: args.deviceName.trim(), userId: user._id, updatedAt: Date.now(), lastError: undefined };
    if (existing) {
      await ctx.db.patch(existing._id, fields);
      return existing._id;
    }
    return ctx.db.insert("revisionPushDevices", { ...fields, createdAt: Date.now() });
  },
});

export const removeDevice = mutation({
  args: { deviceId: v.id("revisionPushDevices") }, returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    const device = await ctx.db.get(args.deviceId);
    if (!device || device.userId !== user._id) throw new Error("Device not found");
    await ctx.db.delete(device._id);
    const remaining = await ctx.db.query("revisionPushDevices").withIndex("by_userId", q => q.eq("userId", user._id)).first();
    const prefs = await getPreferences(ctx, user._id);
    if (!remaining && prefs) await disable(ctx, prefs);
    return null;
  },
});

async function enqueueDelivery(ctx: MutationCtx, prefs: Doc<"revisionReminderPreferences">,
  device: Doc<"revisionPushDevices">, deliveryKind: "morning" | "evening" | "snooze" | "test", at: number) {
  const key = `${device._id}:${deliveryKind}:${deliveryKind === "test" || deliveryKind === "snooze" ? at : dhakaDay(at)}`;
  const duplicate = await ctx.db.query("revisionReminderDeliveries")
    .withIndex("by_userId_and_key", q => q.eq("userId", prefs.userId).eq("key", key)).unique();
  if (duplicate) return;
  const deliveryId = await ctx.db.insert("revisionReminderDeliveries", { userId: prefs.userId, deviceId: device._id,
    key, generation: prefs.generation, kind: deliveryKind, scheduledAt: at, status: "queued" });
  await pushPool.enqueueAction(ctx, internal.revisionPush.send, { deliveryId }, {
    retry: { maxAttempts: 3, initialBackoffMs: 30_000, base: 2 },
    onComplete: internal.revisionReminders.deliveryCompleted, context: { deliveryId },
  });
}

export const runScheduled = internalMutation({
  args: { preferenceId: v.id("revisionReminderPreferences"), generation: v.number(),
    kind: v.union(v.literal("morning"), v.literal("evening"), v.literal("snooze")), scheduledAt: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const prefs = await ctx.db.get(args.preferenceId);
    if (!prefs?.enabled || prefs.generation !== args.generation) return null;
    if (args.kind === "snooze" && prefs.snoozedUntil !== args.scheduledAt) return null;
    // An old job must not start a second daily schedule chain.
    if (args.kind !== "snooze" && prefs.nextReminderAt !== args.scheduledAt) return null;
    const devices = await ctx.db.query("revisionPushDevices").withIndex("by_userId", q => q.eq("userId", prefs.userId)).take(10);
    if (!devices.length || !(await ctx.db.get(prefs.userId))) { await disable(ctx, prefs); return null; }
    if (args.kind !== "snooze") await scheduleNext(ctx, prefs);
    else await ctx.db.patch(prefs._id, { snoozedUntil: undefined, snoozeJobId: undefined });
    if (Date.now() - args.scheduledAt > 2 * 60 * MINUTE || (prefs.snoozedUntil ?? 0) > Date.now()) return null;
    for (const device of devices) await enqueueDelivery(ctx, prefs, device, args.kind, args.scheduledAt);
    return null;
  },
});

export const sendTest = mutation({
  args: { deviceId: v.id("revisionPushDevices") }, returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    await limiter.limit(ctx, "testPush", { key: user._id, throws: true });
    if (!configured()) throw new Error("Push delivery is not configured yet.");
    const device = await ctx.db.get(args.deviceId);
    if (!device || device.userId !== user._id) throw new Error("Device not found");
    let prefs = await getPreferences(ctx, user._id);
    if (!prefs) {
      const id = await ctx.db.insert("revisionReminderPreferences", { userId: user._id, ...defaults, generation: 0 });
      prefs = (await ctx.db.get(id))!;
    }
    await enqueueDelivery(ctx, prefs, device, "test", Date.now());
    return null;
  },
});

async function snoozeForUser(ctx: MutationCtx, prefs: Doc<"revisionReminderPreferences">) {
  await limiter.limit(ctx, "snooze", { key: prefs.userId, throws: true });
  await cancelJob(ctx, prefs.snoozeJobId);
  const at = Date.now() + 60 * MINUTE;
  const job = await ctx.scheduler.runAt(at, internal.revisionReminders.runScheduled, {
    preferenceId: prefs._id, generation: prefs.generation, kind: "snooze", scheduledAt: at,
  });
  await ctx.db.patch(prefs._id, { snoozedUntil: at, snoozeJobId: job });
}

export const snooze = mutation({
  args: {}, returns: v.null(),
  handler: async ctx => {
    const user = await requireCurrentUser(ctx);
    const prefs = await getPreferences(ctx, user._id);
    if (!prefs?.enabled) throw new Error("Enable reminders first.");
    await snoozeForUser(ctx, prefs);
    return null;
  },
});

export const snoozeFromPush = internalMutation({
  args: { deviceId: v.id("revisionPushDevices"), token: v.string(), deliveryId: v.id("revisionReminderDeliveries") },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const device = await ctx.db.get(args.deviceId);
    const delivery = await ctx.db.get(args.deliveryId);
    if (!device || device.snoozeToken !== args.token || !delivery || delivery.deviceId !== device._id ||
        delivery.userId !== device.userId || delivery.kind === "test" || Date.now() - delivery.scheduledAt > DAY_MS) return false;
    const prefs = await getPreferences(ctx, device.userId);
    if (!prefs?.enabled || prefs.generation !== delivery.generation) return false;
    await snoozeForUser(ctx, prefs);
    return true;
  },
});

export const cancelSnooze = mutation({
  args: {}, returns: v.null(),
  handler: async ctx => {
    const user = await requireCurrentUser(ctx);
    const prefs = await getPreferences(ctx, user._id);
    if (prefs) {
      await cancelJob(ctx, prefs.snoozeJobId);
      await ctx.db.patch(prefs._id, { snoozedUntil: undefined, snoozeJobId: undefined });
    }
    return null;
  },
});

export const deliveryContext = internalQuery({
  args: { deliveryId: v.id("revisionReminderDeliveries"), now: v.number() },
  returns: v.union(v.null(), v.object({
    endpoint: v.string(), p256dh: v.string(), auth: v.string(), snoozeToken: v.string(),
    accountId: v.string(), userId: v.id("users"), deviceId: v.id("revisionPushDevices"),
    showDetails: v.boolean(), includeLegacy: v.boolean(), kind, key: v.string(),
  })),
  handler: async (ctx, args) => {
    const delivery = await ctx.db.get(args.deliveryId);
    if (!delivery || delivery.status !== "queued" || args.now - delivery.scheduledAt > 2 * 60 * MINUTE) return null;
    if ((delivery.kind === "morning" || delivery.kind === "evening") && dhakaDay(args.now) !== dhakaDay(delivery.scheduledAt)) return null;
    const [device, prefs, user] = await Promise.all([
      ctx.db.get(delivery.deviceId), getPreferences(ctx, delivery.userId), ctx.db.get(delivery.userId),
    ]);
    if (!device || !user || device.userId !== user._id) return null;
    if (delivery.kind !== "test" && (!prefs?.enabled || prefs.generation !== delivery.generation ||
        (prefs.snoozedUntil ?? 0) > args.now)) return null;
    return { endpoint: device.endpoint, p256dh: device.p256dh, auth: device.auth, snoozeToken: device.snoozeToken,
      accountId: user.clerkUserId, userId: user._id, deviceId: device._id,
      showDetails: prefs?.showDetails ?? false, includeLegacy: user.legacyWorkspaceOwner === true,
      kind: delivery.kind, key: delivery.key };
  },
});

// Existing legacy owners still have undefined-userId concepts. Reuse precisely
// that compatibility scope; new users never read legacy rows.
export const duePage = internalQuery({
  args: { userId: v.id("users"), legacy: v.boolean(), now: v.number(), paginationOpts: paginationOptsValidator },
  returns: v.object({ overdue: v.number(), today: v.number(), names: v.array(v.string()), isDone: v.boolean(), continueCursor: v.string() }),
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user || (args.legacy && !user.legacyWorkspaceOwner)) return { overdue: 0, today: 0, names: [], isDone: true, continueCursor: "" };
    const start = dhakaDay(args.now);
    const page = await ctx.db.query("concepts").withIndex("by_userId_and_nextReviewAt", q =>
      q.eq("userId", args.legacy ? undefined : user._id).gt("nextReviewAt", undefined).lt("nextReviewAt", start + DAY_MS))
      .paginate(args.paginationOpts);
    const chapters = new Map<Id<"chapters">, Doc<"chapters"> | null>();
    const subjects = new Map<Id<"subjects">, Doc<"subjects"> | null>();
    let overdue = 0, today = 0;
    const names: string[] = [];
    for (const concept of page.page) {
      if (!chapters.has(concept.chapterId)) chapters.set(concept.chapterId, await ctx.db.get(concept.chapterId));
      const chapter = chapters.get(concept.chapterId);
      if (!chapter || !canAccessOwnedDocument(user, chapter) || !chapter.inNextTerm || chapter.revisionEnabled === false) continue;
      if (!subjects.has(chapter.subjectId)) subjects.set(chapter.subjectId, await ctx.db.get(chapter.subjectId));
      const subject = subjects.get(chapter.subjectId);
      if (!subject || !canAccessOwnedDocument(user, subject)) continue;
      if (concept.nextReviewAt! < start) overdue++; else today++;
      if (names.length < 3) names.push(`${subject.name}: ${concept.name}`.slice(0, 100));
    }
    return { overdue, today, names, isDone: page.isDone, continueCursor: page.continueCursor };
  },
});

export const finishDelivery = internalMutation({
  args: { deliveryId: v.id("revisionReminderDeliveries"), status: v.union(v.literal("sent"), v.literal("skipped"), v.literal("failed")),
    error: v.optional(v.string()), expiredDevice: v.optional(v.boolean()) }, returns: v.null(),
  handler: async (ctx, args) => {
    const delivery = await ctx.db.get(args.deliveryId);
    if (!delivery || delivery.status !== "queued") return null;
    await ctx.db.patch(delivery._id, { status: args.status, completedAt: Date.now(), error: args.error });
    const device = await ctx.db.get(delivery.deviceId);
    if (device?.userId === delivery.userId) {
      if (args.expiredDevice) {
        await ctx.db.delete(device._id);
        const remaining = await ctx.db.query("revisionPushDevices")
          .withIndex("by_userId", q => q.eq("userId", delivery.userId)).first();
        const prefs = await getPreferences(ctx, delivery.userId);
        if (!remaining && prefs) await disable(ctx, prefs);
      }
      else if (args.status === "sent") await ctx.db.patch(device._id, { lastSuccessAt: Date.now(), lastError: undefined });
      else if (args.error) await ctx.db.patch(device._id, { lastError: args.error });
    }
    return null;
  },
});

export const deliveryCompleted = pushPool.defineOnComplete({
  context: v.object({ deliveryId: v.id("revisionReminderDeliveries") }),
  handler: async (ctx, { context, result }) => {
    if (result.kind !== "success") {
      await ctx.runMutation(internal.revisionReminders.finishDelivery, {
        deliveryId: context.deliveryId, status: "failed", error: "পাঠানো যায়নি। টেস্ট নোটিফিকেশন দিয়ে আবার দেখুন।",
      });
    }
  },
});

export const cleanup = internalMutation({
  args: {}, returns: v.null(),
  handler: async ctx => {
    const old = await ctx.db.query("revisionReminderDeliveries").withIndex("by_scheduledAt", q => q.lt("scheduledAt", Date.now() - 30 * DAY_MS)).take(100);
    for (const row of old) await ctx.db.delete(row._id);
    if (old.length === 100) await ctx.scheduler.runAfter(0, internal.revisionReminders.cleanup, {});
    return null;
  },
});

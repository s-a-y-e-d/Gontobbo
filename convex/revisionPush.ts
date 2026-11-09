"use node";

import webpush from "web-push";
import { createHash } from "node:crypto";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";

export const send = internalAction({
  args: { deliveryId: v.id("revisionReminderDeliveries") }, returns: v.null(),
  handler: async (ctx, { deliveryId }) => {
    const now = Date.now();
    const context = await ctx.runQuery(internal.revisionReminders.deliveryContext, { deliveryId, now });
    if (!context) {
      await ctx.runMutation(internal.revisionReminders.finishDelivery, { deliveryId, status: "skipped" });
      return null;
    }
    let today = 0, overdue = 0;
    const names: string[] = [];
    if (context.kind !== "test") {
      for (const legacy of context.includeLegacy ? [false, true] : [false]) {
        let cursor: string | null = null;
        do {
          const page: { today: number; overdue: number; names: string[]; isDone: boolean; continueCursor: string } =
            await ctx.runQuery(internal.revisionReminders.duePage, {
              userId: context.userId, legacy, now,
              paginationOpts: { numItems: 100, cursor, maximumRowsRead: 100, maximumBytesRead: 1_000_000 },
            });
          today += page.today;
          overdue += page.overdue;
          names.push(...page.names.slice(0, Math.max(0, 3 - names.length)));
          cursor = page.isDone ? null : page.continueCursor;
        } while (cursor !== null);
      }
      if (today + overdue === 0) {
        await ctx.runMutation(internal.revisionReminders.finishDelivery, { deliveryId, status: "skipped" });
        return null;
      }
    }
    // Recheck opt-out, account reassignment, snooze, and remote device removal
    // after the paginated queue read and immediately before external delivery.
    const current = await ctx.runQuery(internal.revisionReminders.deliveryContext, { deliveryId, now: Date.now() });
    if (!current) {
      await ctx.runMutation(internal.revisionReminders.finishDelivery, { deliveryId, status: "skipped" });
      return null;
    }
    const publicKey = process.env.VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    const subject = process.env.VAPID_SUBJECT || process.env.CONVEX_SITE_URL;
    if (!publicKey || !privateKey || !subject) {
      await ctx.runMutation(internal.revisionReminders.finishDelivery, {
        deliveryId, status: "failed", error: "পুশ সার্ভিস কনফিগার করা হয়নি।",
      });
      return null;
    }
    const isTest = current.kind === "test";
    const count = new Intl.NumberFormat("bn-BD");
    const body = isTest ? "রিভিশন রিমাইন্ডার এই ডিভাইসে পৌঁছেছে।" :
      `আজকের ${count.format(today)}টি ও বকেয়া ${count.format(overdue)}টি রিভিশন বাকি।` +
      (current.showDetails && names.length ? ` ${names.join(" · ")}` : " রিভিশন পেজ খুলে শুরু করুন।");
    const tag = createHash("sha256").update(current.key).digest("base64url").slice(0, 32);
    try {
      await webpush.sendNotification({ endpoint: current.endpoint, keys: { p256dh: current.p256dh, auth: current.auth } },
        JSON.stringify({ title: isTest ? "গন্তব্য — টেস্ট নোটিফিকেশন" : "গন্তব্য — রিভিশনের সময়",
          body, tag, accountId: current.accountId, url: "/revision", deliveryId, deviceId: current.deviceId,
          snoozeToken: current.snoozeToken,
          snoozeUrl: isTest ? null : `${process.env.CONVEX_SITE_URL}/revision-reminder/snooze`,
          expiresAt: now + 2 * 60 * 60 * 1000 }), {
          vapidDetails: { subject, publicKey, privateKey }, TTL: 2 * 60 * 60,
          urgency: "normal", topic: tag, timeout: 15_000,
        });
    } catch (error: unknown) {
      const status = typeof error === "object" && error !== null && "statusCode" in error ? Number(error.statusCode) : 0;
      if (status === 429 || status >= 500) throw new Error(`Push provider temporarily unavailable (${status})`);
      // A network timeout has an ambiguous outcome. Avoid retrying it and
      // potentially notifying twice after a successful but unacknowledged send.
      await ctx.runMutation(internal.revisionReminders.finishDelivery, { deliveryId, status: "failed",
        expiredDevice: status === 404 || status === 410,
        error: status === 404 || status === 410 ? "ডিভাইসের অনুমতি মেয়াদোত্তীর্ণ। আবার চালু করুন।" :
          "নোটিফিকেশন পাঠানো যায়নি। ডিভাইস ও পুশ কনফিগারেশন যাচাই করুন।" });
      return null;
    }
    await ctx.runMutation(internal.revisionReminders.finishDelivery, { deliveryId, status: "sent" });
    return null;
  },
});

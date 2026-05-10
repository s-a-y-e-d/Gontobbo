import { v } from "convex/values";
import { internal } from "./_generated/api";
import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import {
  assertCanAccessOwnedDocument,
  isLegacyWorkspaceOwner,
  requireCurrentUser,
  type CurrentUser,
} from "./auth";

const DASHBOARD_STATS_MIGRATION_KEY = "dashboard_study_item_stats_backfill";
const BACKFILL_BATCH_SIZE = 32;
const MISSING_COMPLETION_DAY_BUCKET = 0;

type StatsAccess = {
  userId: Id<"users">;
  includeLegacy: boolean;
};

function getDhakaDayBucket(timestamp: number) {
  const dhakaOffset = 6 * 60 * 60 * 1000;
  const dhakaTime = new Date(timestamp + dhakaOffset);
  dhakaTime.setUTCHours(0, 0, 0, 0);
  return dhakaTime.getTime() - dhakaOffset;
}

function getMigrationKey(userId: Id<"users">) {
  return `${DASHBOARD_STATS_MIGRATION_KEY}:${userId}`;
}

function canUseDocument(access: StatsAccess, doc: { userId?: Id<"users"> }) {
  return doc.userId === access.userId || (doc.userId === undefined && access.includeLegacy);
}

function getCompletionDayBucket(item: Pick<Doc<"studyItems">, "lastStudiedAt">) {
  return item.lastStudiedAt === undefined
    ? MISSING_COMPLETION_DAY_BUCKET
    : getDhakaDayBucket(item.lastStudiedAt);
}

async function getChapterStat(
  ctx: Pick<MutationCtx, "db"> | Pick<QueryCtx, "db">,
  userId: Id<"users">,
  chapterId: Id<"chapters">,
) {
  return await ctx.db
    .query("studyItemChapterStats")
    .withIndex("by_userId_and_chapterId", (q) =>
      q.eq("userId", userId).eq("chapterId", chapterId),
    )
    .unique();
}

async function getCompletionDayStat(
  ctx: Pick<MutationCtx, "db">,
  args: {
    userId: Id<"users">;
    chapterId: Id<"chapters">;
    dayBucket: number;
  },
) {
  return await ctx.db
    .query("studyItemCompletionDayStats")
    .withIndex("by_userId_and_chapterId_and_dayBucket", (q) =>
      q
        .eq("userId", args.userId)
        .eq("chapterId", args.chapterId)
        .eq("dayBucket", args.dayBucket),
    )
    .unique();
}

async function incrementChapterStat(
  ctx: Pick<MutationCtx, "db">,
  args: {
    userId: Id<"users">;
    subjectId: Id<"subjects">;
    chapterId: Id<"chapters">;
    totalDelta: number;
    completedDelta: number;
  },
) {
  const existing = await getChapterStat(ctx, args.userId, args.chapterId);
  const now = Date.now();

  if (!existing) {
    const totalItems = Math.max(0, args.totalDelta);
    const completedItems = Math.max(0, args.completedDelta);
    if (totalItems === 0 && completedItems === 0) {
      return;
    }
    await ctx.db.insert("studyItemChapterStats", {
      userId: args.userId,
      subjectId: args.subjectId,
      chapterId: args.chapterId,
      totalItems,
      completedItems,
      updatedAt: now,
    });
    return;
  }

  await ctx.db.patch(existing._id, {
    subjectId: args.subjectId,
    totalItems: Math.max(0, existing.totalItems + args.totalDelta),
    completedItems: Math.max(0, existing.completedItems + args.completedDelta),
    updatedAt: now,
  });
}

async function incrementCompletionDayStat(
  ctx: Pick<MutationCtx, "db">,
  args: {
    userId: Id<"users">;
    subjectId: Id<"subjects">;
    chapterId: Id<"chapters">;
    dayBucket: number;
    completedDelta: number;
  },
) {
  if (args.completedDelta === 0) {
    return;
  }

  const existing = await getCompletionDayStat(ctx, args);
  const now = Date.now();

  if (!existing) {
    if (args.completedDelta <= 0) {
      return;
    }
    await ctx.db.insert("studyItemCompletionDayStats", {
      userId: args.userId,
      subjectId: args.subjectId,
      chapterId: args.chapterId,
      dayBucket: args.dayBucket,
      completedCount: args.completedDelta,
      updatedAt: now,
    });
    return;
  }

  const completedCount = existing.completedCount + args.completedDelta;
  if (completedCount <= 0) {
    await ctx.db.delete(existing._id);
    return;
  }

  await ctx.db.patch(existing._id, {
    subjectId: args.subjectId,
    completedCount,
    updatedAt: now,
  });
}

export async function recordStudyItemCreatedInStats(
  ctx: MutationCtx,
  currentUser: CurrentUser,
  item: Doc<"studyItems">,
) {
  await incrementChapterStat(ctx, {
    userId: currentUser._id,
    subjectId: item.subjectId,
    chapterId: item.chapterId,
    totalDelta: 1,
    completedDelta: item.isCompleted ? 1 : 0,
  });

  if (item.isCompleted) {
    await incrementCompletionDayStat(ctx, {
      userId: currentUser._id,
      subjectId: item.subjectId,
      chapterId: item.chapterId,
      dayBucket: getCompletionDayBucket(item),
      completedDelta: 1,
    });
  }
}

export async function recordStudyItemCompletionInStats(
  ctx: MutationCtx,
  currentUser: CurrentUser,
  item: Doc<"studyItems">,
  completedDelta: 1 | -1,
) {
  await incrementChapterStat(ctx, {
    userId: currentUser._id,
    subjectId: item.subjectId,
    chapterId: item.chapterId,
    totalDelta: 0,
    completedDelta,
  });

  await incrementCompletionDayStat(ctx, {
    userId: currentUser._id,
    subjectId: item.subjectId,
    chapterId: item.chapterId,
    dayBucket: getCompletionDayBucket(item),
    completedDelta,
  });
}

export async function deleteStudyItemStatsForChapter(
  ctx: MutationCtx,
  userId: Id<"users">,
  chapterId: Id<"chapters">,
) {
  const chapterStat = await getChapterStat(ctx, userId, chapterId);
  if (chapterStat) {
    await ctx.db.delete(chapterStat._id);
  }

  const dayStats = await ctx.db
    .query("studyItemCompletionDayStats")
    .withIndex("by_userId_and_chapterId_and_dayBucket", (q) =>
      q.eq("userId", userId).eq("chapterId", chapterId),
    )
    .collect();
  for (const dayStat of dayStats) {
    await ctx.db.delete(dayStat._id);
  }
}

export async function rebuildStudyItemStatsForChapter(
  ctx: MutationCtx,
  currentUser: CurrentUser,
  chapterId: Id<"chapters">,
) {
  const chapter = await ctx.db.get(chapterId);
  if (!chapter) {
    await deleteStudyItemStatsForChapter(ctx, currentUser._id, chapterId);
    return;
  }

  assertCanAccessOwnedDocument(currentUser, chapter);
  const access = {
    userId: currentUser._id,
    includeLegacy: isLegacyWorkspaceOwner(currentUser),
  };
  await rebuildStudyItemStatsForChapterAccess(ctx, access, chapter);
}

async function rebuildStudyItemStatsForChapterAccess(
  ctx: MutationCtx,
  access: StatsAccess,
  chapter: Doc<"chapters">,
) {
  await deleteStudyItemStatsForChapter(ctx, access.userId, chapter._id);

  const studyItems = (
    await ctx.db
      .query("studyItems")
      .withIndex("by_chapter", (q) => q.eq("chapterId", chapter._id))
      .collect()
  ).filter((item) => canUseDocument(access, item));

  if (studyItems.length === 0) {
    return;
  }

  const completedItems = studyItems.filter((item) => item.isCompleted);
  const now = Date.now();
  await ctx.db.insert("studyItemChapterStats", {
    userId: access.userId,
    subjectId: chapter.subjectId,
    chapterId: chapter._id,
    totalItems: studyItems.length,
    completedItems: completedItems.length,
    updatedAt: now,
  });

  const completedByDay = new Map<number, number>();
  for (const item of completedItems) {
    const dayBucket = getCompletionDayBucket(item);
    completedByDay.set(dayBucket, (completedByDay.get(dayBucket) ?? 0) + 1);
  }

  for (const [dayBucket, completedCount] of completedByDay) {
    await ctx.db.insert("studyItemCompletionDayStats", {
      userId: access.userId,
      subjectId: chapter.subjectId,
      chapterId: chapter._id,
      dayBucket,
      completedCount,
      updatedAt: now,
    });
  }
}

export async function getDashboardStudyItemStatsMigrationStatus(
  ctx: QueryCtx,
  userId: Id<"users">,
) {
  const status = await ctx.db
    .query("dashboardStudyItemStatsMigrations")
    .withIndex("by_key", (q) => q.eq("key", getMigrationKey(userId)))
    .unique();

  if (status?.ownerUserId !== userId) {
    return null;
  }

  return status;
}

export async function getDashboardStudyItemChapterStats(
  ctx: QueryCtx,
  currentUser: CurrentUser,
) {
  return await ctx.db
    .query("studyItemChapterStats")
    .withIndex("by_userId", (q) => q.eq("userId", currentUser._id))
    .collect();
}

export async function getDashboardCompletionDayStats(
  ctx: QueryCtx,
  args: {
    userId: Id<"users">;
    startDate: number;
    endDate: number;
  },
) {
  const rangedStats = await ctx.db
    .query("studyItemCompletionDayStats")
    .withIndex("by_userId_and_dayBucket", (q) =>
      q
        .eq("userId", args.userId)
        .gte("dayBucket", args.startDate)
        .lte("dayBucket", args.endDate),
    )
    .collect();

  const missingDateStats = await ctx.db
    .query("studyItemCompletionDayStats")
    .withIndex("by_userId_and_dayBucket", (q) =>
      q.eq("userId", args.userId).eq("dayBucket", MISSING_COMPLETION_DAY_BUCKET),
    )
    .collect();

  return [...missingDateStats, ...rangedStats];
}

async function upsertMigrationStatus(
  ctx: MutationCtx,
  fields: {
    status: "idle" | "running" | "completed" | "failed";
    ownerUserId: Id<"users">;
    includeLegacy: boolean;
    processedChapters: number;
    lastCursor?: string;
    lastError?: string;
  },
) {
  const existing = await ctx.db
    .query("dashboardStudyItemStatsMigrations")
    .withIndex("by_key", (q) =>
      q.eq("key", getMigrationKey(fields.ownerUserId)),
    )
    .unique();

  if (existing) {
    await ctx.db.patch(existing._id, {
      ...fields,
      updatedAt: Date.now(),
    });
    return;
  }

  await ctx.db.insert("dashboardStudyItemStatsMigrations", {
    key: getMigrationKey(fields.ownerUserId),
    updatedAt: Date.now(),
    ...fields,
  });
}

export const getDashboardStudyItemStatsBackfillStatus = query({
  args: {},
  handler: async (ctx) => {
    const currentUser = await requireCurrentUser(ctx);
    const status = await getDashboardStudyItemStatsMigrationStatus(
      ctx,
      currentUser._id,
    );

    return {
      status: status?.status ?? "idle",
      processedChapters: status?.processedChapters ?? 0,
      lastError: status?.lastError,
      updatedAt: status?.updatedAt,
    };
  },
});

export const startDashboardStudyItemStatsBackfill = mutation({
  args: {},
  handler: async (ctx) => {
    const currentUser = await requireCurrentUser(ctx);
    if (currentUser.role !== "owner") {
      throw new Error("Only owners can run this backfill");
    }
    const includeLegacy = isLegacyWorkspaceOwner(currentUser);

    await upsertMigrationStatus(ctx, {
      status: "running",
      ownerUserId: currentUser._id,
      includeLegacy,
      processedChapters: 0,
      lastCursor: undefined,
      lastError: undefined,
    });

    await ctx.scheduler.runAfter(
      0,
      internal.dashboardStudyItemStats.runDashboardStudyItemStatsBackfillBatch,
      {
        ownerUserId: currentUser._id,
        includeLegacy,
        cursor: null,
        processedChapters: 0,
      },
    );

    return null;
  },
});

export const runDashboardStudyItemStatsBackfillBatch = internalMutation({
  args: {
    ownerUserId: v.id("users"),
    includeLegacy: v.boolean(),
    cursor: v.union(v.string(), v.null()),
    processedChapters: v.number(),
  },
  handler: async (ctx, args) => {
    try {
      const page = await ctx.db.query("chapters").order("asc").paginate({
        numItems: BACKFILL_BATCH_SIZE,
        cursor: args.cursor,
      });
      const access = {
        userId: args.ownerUserId,
        includeLegacy: args.includeLegacy,
      };
      let processedChapters = args.processedChapters;

      for (const chapter of page.page) {
        if (canUseDocument(access, chapter)) {
          await rebuildStudyItemStatsForChapterAccess(ctx, access, chapter);
          processedChapters += 1;
        }
      }

      if (page.isDone) {
        await upsertMigrationStatus(ctx, {
          status: "completed",
          ownerUserId: args.ownerUserId,
          includeLegacy: args.includeLegacy,
          processedChapters,
          lastCursor: undefined,
          lastError: undefined,
        });
        return null;
      }

      await upsertMigrationStatus(ctx, {
        status: "running",
        ownerUserId: args.ownerUserId,
        includeLegacy: args.includeLegacy,
        processedChapters,
        lastCursor: page.continueCursor,
        lastError: undefined,
      });
      await ctx.scheduler.runAfter(
        0,
        internal.dashboardStudyItemStats.runDashboardStudyItemStatsBackfillBatch,
        {
          ownerUserId: args.ownerUserId,
          includeLegacy: args.includeLegacy,
          cursor: page.continueCursor,
          processedChapters,
        },
      );
      return null;
    } catch (error) {
      await upsertMigrationStatus(ctx, {
        status: "failed",
        ownerUserId: args.ownerUserId,
        includeLegacy: args.includeLegacy,
        processedChapters: args.processedChapters,
        lastCursor: args.cursor ?? undefined,
        lastError: error instanceof Error ? error.message : "Unknown error",
      });
      throw error;
    }
  },
});

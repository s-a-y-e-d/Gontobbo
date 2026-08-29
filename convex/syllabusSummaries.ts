import { v } from "convex/values";
import { internal } from "./_generated/api";
import {
  internalMutation,
  mutation,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { rebuildStudyItemStatsForChapter } from "./dashboardStudyItemStats";
import {
  assertCanAccessOwnedDocument,
  isLegacyWorkspaceOwner,
  requireCurrentUser,
  type CurrentUser,
} from "./auth";
import {
  getRequiredTrackerKeys,
  summarizeRequiredStudyItems,
} from "./trackerRequirements";

const SYLLABUS_SUMMARY_MIGRATION_KEY = "syllabus_summary_backfill";
const BACKFILL_BATCH_SIZE = 24;
const TRACKER_CONFIG_REBUILD_BATCH_SIZE = 24;

type SummaryAccess = {
  userId: Id<"users">;
  includeLegacy: boolean;
};

type ChapterSummaryRebuildOptions = {
  /**
   * Tracker-config rebuilds refresh chapter stats separately so completion-day
   * stats are rebuilt as well. Avoid replacing the same chapter stat twice.
   */
  skipChapterStatsRebuild?: boolean;
};

function canUseDocument(access: SummaryAccess, doc: { userId?: Id<"users"> }) {
  return doc.userId === access.userId || (doc.userId === undefined && access.includeLegacy);
}

function getMigrationKey(userId: Id<"users">) {
  return `${SYLLABUS_SUMMARY_MIGRATION_KEY}:${userId}`;
}

function getSubjectLazyKey(userId: Id<"users">, subjectId: Id<"subjects">) {
  return `subject:${userId}:${subjectId}`;
}

function getChapterLazyKey(userId: Id<"users">, chapterId: Id<"chapters">) {
  return `chapter:${userId}:${chapterId}`;
}

async function getTrackerConfigRebuild(
  ctx: Pick<QueryCtx, "db"> | Pick<MutationCtx, "db">,
  userId: Id<"users">,
  subjectId: Id<"subjects">,
) {
  return await ctx.db
    .query("trackerConfigRebuilds")
    .withIndex("by_userId_and_subjectId", (q) =>
      q.eq("userId", userId).eq("subjectId", subjectId),
    )
    .unique();
}

export async function getTrackerConfigRebuildStatus(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  subjectId: Id<"subjects">,
) {
  return await getTrackerConfigRebuild(ctx, userId, subjectId);
}

async function upsertTrackerConfigRebuild(
  ctx: MutationCtx,
  fields: {
    userId: Id<"users">;
    subjectId: Id<"subjects">;
    version: number;
    status: "running" | "completed" | "failed";
    processedChapters: number;
    lastCursor?: string;
    lastError?: string;
  },
) {
  const existing = await getTrackerConfigRebuild(
    ctx,
    fields.userId,
    fields.subjectId,
  );
  if (existing) {
    await ctx.db.patch(existing._id, { ...fields, updatedAt: Date.now() });
    return existing._id;
  }

  return await ctx.db.insert("trackerConfigRebuilds", {
    ...fields,
    updatedAt: Date.now(),
  });
}

/** Queue a bounded rebuild after a subject tracker configuration edit. */
export async function startTrackerConfigRebuild(
  ctx: MutationCtx,
  currentUser: CurrentUser,
  subjectId: Id<"subjects">,
) {
  const existing = await getTrackerConfigRebuild(
    ctx,
    currentUser._id,
    subjectId,
  );
  const version = (existing?.version ?? 0) + 1;
  const includeLegacy = isLegacyWorkspaceOwner(currentUser);

  await upsertTrackerConfigRebuild(ctx, {
    userId: currentUser._id,
    subjectId,
    version,
    status: "running",
    processedChapters: 0,
    lastCursor: undefined,
    lastError: undefined,
  });

  await ctx.scheduler.runAfter(
    0,
    internal.syllabusSummaries.runTrackerConfigRebuildBatch,
    {
      ownerUserId: currentUser._id,
      subjectId,
      includeLegacy,
      cursor: null,
      processedChapters: 0,
      version,
    },
  );
}

async function getCellForStudyItem(
  ctx: Pick<MutationCtx, "db">,
  userId: Id<"users">,
  studyItemId: Id<"studyItems">,
) {
  return await ctx.db
    .query("syllabusStudyItemCells")
    .withIndex("by_userId_and_studyItemId", (q) =>
      q.eq("userId", userId).eq("studyItemId", studyItemId),
    )
    .unique();
}

export async function upsertSyllabusStudyItemCell(
  ctx: MutationCtx,
  currentUser: CurrentUser,
  studyItemId: Id<"studyItems">,
) {
  const studyItem = await ctx.db.get(studyItemId);
  const existing = await getCellForStudyItem(ctx, currentUser._id, studyItemId);

  if (!studyItem) {
    if (existing) await ctx.db.delete(existing._id);
    return;
  }

  assertCanAccessOwnedDocument(currentUser, studyItem);
  const nextCell = {
    userId: currentUser._id,
    subjectId: studyItem.subjectId,
    chapterId: studyItem.chapterId,
    conceptId: studyItem.conceptId,
    studyItemId,
    trackerKey: studyItem.type,
    isCompleted: studyItem.isCompleted,
    completionScore: studyItem.completionScore,
    updatedAt: Date.now(),
  };

  if (existing) {
    const hasChanged =
      existing.subjectId !== nextCell.subjectId ||
      existing.chapterId !== nextCell.chapterId ||
      existing.conceptId !== nextCell.conceptId ||
      existing.trackerKey !== nextCell.trackerKey ||
      existing.isCompleted !== nextCell.isCompleted ||
      existing.completionScore !== nextCell.completionScore;

    if (hasChanged) {
      await ctx.db.patch(existing._id, nextCell);
    }
    return;
  }

  await ctx.db.insert("syllabusStudyItemCells", nextCell);
}

export async function deleteSyllabusStudyItemCellForStudyItem(
  ctx: MutationCtx,
  userId: Id<"users">,
  studyItemId: Id<"studyItems">,
) {
  const existing = await getCellForStudyItem(ctx, userId, studyItemId);
  if (existing) {
    await ctx.db.delete(existing._id);
  }
}

export async function deleteSyllabusSummariesForConcept(
  ctx: MutationCtx,
  userId: Id<"users">,
  conceptId: Id<"concepts">,
) {
  await deleteConceptStat(ctx, userId, conceptId);
  const cells = await ctx.db
    .query("syllabusStudyItemCells")
    .withIndex("by_userId_and_conceptId", (q) =>
      q.eq("userId", userId).eq("conceptId", conceptId),
    )
    .collect();
  for (const cell of cells) {
    await ctx.db.delete(cell._id);
  }
}

export async function deleteSyllabusSummariesForChapter(
  ctx: MutationCtx,
  userId: Id<"users">,
  chapterId: Id<"chapters">,
) {
  await deleteChapterStat(ctx, userId, chapterId);
  const conceptStats = await ctx.db
    .query("studyItemConceptStats")
    .withIndex("by_userId_and_chapterId", (q) =>
      q.eq("userId", userId).eq("chapterId", chapterId),
    )
    .collect();
  for (const stat of conceptStats) {
    await ctx.db.delete(stat._id);
  }

  const cells = await ctx.db
    .query("syllabusStudyItemCells")
    .withIndex("by_userId_and_chapterId", (q) =>
      q.eq("userId", userId).eq("chapterId", chapterId),
    )
    .collect();
  for (const cell of cells) {
    await ctx.db.delete(cell._id);
  }
}

async function deleteConceptStat(
  ctx: Pick<MutationCtx, "db">,
  userId: Id<"users">,
  conceptId: Id<"concepts">,
) {
  const existing = await ctx.db
    .query("studyItemConceptStats")
    .withIndex("by_userId_and_conceptId", (q) =>
      q.eq("userId", userId).eq("conceptId", conceptId),
    )
    .unique();
  if (existing) {
    await ctx.db.delete(existing._id);
  }
}

async function deleteChapterStat(
  ctx: Pick<MutationCtx, "db">,
  userId: Id<"users">,
  chapterId: Id<"chapters">,
) {
  const existing = await ctx.db
    .query("studyItemChapterStats")
    .withIndex("by_userId_and_chapterId", (q) =>
      q.eq("userId", userId).eq("chapterId", chapterId),
    )
    .unique();
  if (existing) {
    await ctx.db.delete(existing._id);
  }
}

async function getStudyItemsForChapterAccess(
  ctx: Pick<MutationCtx, "db">,
  access: SummaryAccess,
  chapterId: Id<"chapters">,
) {
  return (
    await ctx.db
      .query("studyItems")
      .withIndex("by_chapter", (q) => q.eq("chapterId", chapterId))
      .collect()
  ).filter((item) => canUseDocument(access, item));
}

async function getStudyItemsForConceptAccess(
  ctx: Pick<MutationCtx, "db">,
  access: SummaryAccess,
  conceptId: Id<"concepts">,
) {
  return (
    await ctx.db
      .query("studyItems")
      .withIndex("by_concept", (q) => q.eq("conceptId", conceptId))
      .collect()
  ).filter((item) => canUseDocument(access, item));
}

async function rebuildConceptStatsForAccess(
  ctx: MutationCtx,
  access: SummaryAccess,
  concept: Doc<"concepts">,
  chapter: Doc<"chapters">,
  subject: Doc<"subjects">,
) {
  await deleteConceptStat(ctx, access.userId, concept._id);
  const studyItems = await getStudyItemsForConceptAccess(ctx, access, concept._id);
  if (studyItems.length === 0) return;

  const required = summarizeRequiredStudyItems(subject, studyItems);

  await ctx.db.insert("studyItemConceptStats", {
    userId: access.userId,
    subjectId: chapter.subjectId,
    chapterId: concept.chapterId,
    conceptId: concept._id,
    totalItems: studyItems.length,
    completedItems: studyItems.filter((item) => item.isCompleted).length,
    requiredTotalItems: required.total,
    requiredCompletedItems: required.completed,
    updatedAt: Date.now(),
  });
}

async function rebuildChapterStatsForAccess(
  ctx: MutationCtx,
  access: SummaryAccess,
  chapter: Doc<"chapters">,
  subject: Doc<"subjects">,
) {
  await deleteChapterStat(ctx, access.userId, chapter._id);
  const studyItems = await getStudyItemsForChapterAccess(ctx, access, chapter._id);
  if (studyItems.length === 0) return;

  const required = summarizeRequiredStudyItems(subject, studyItems);

  await ctx.db.insert("studyItemChapterStats", {
    userId: access.userId,
    subjectId: chapter.subjectId,
    chapterId: chapter._id,
    totalItems: studyItems.length,
    completedItems: studyItems.filter((item) => item.isCompleted).length,
    requiredTotalItems: required.total,
    requiredCompletedItems: required.completed,
    updatedAt: Date.now(),
  });
}

async function rebuildCellsForChapterAccess(
  ctx: MutationCtx,
  access: SummaryAccess,
  chapterId: Id<"chapters">,
) {
  const studyItems = await getStudyItemsForChapterAccess(ctx, access, chapterId);
  const currentUser = {
    _id: access.userId,
    legacyWorkspaceOwner: access.includeLegacy,
  } as CurrentUser;

  for (const studyItem of studyItems) {
    await upsertSyllabusStudyItemCell(ctx, currentUser, studyItem._id);
  }
}

export async function rebuildSyllabusSummariesForChapter(
  ctx: MutationCtx,
  currentUser: CurrentUser,
  chapterId: Id<"chapters">,
  options: ChapterSummaryRebuildOptions = {},
) {
  const chapter = await ctx.db.get(chapterId);
  if (!chapter) {
    await deleteChapterStat(ctx, currentUser._id, chapterId);
    return;
  }

  assertCanAccessOwnedDocument(currentUser, chapter);
  const subject = await ctx.db.get(chapter.subjectId);
  if (!subject) {
    await deleteChapterStat(ctx, currentUser._id, chapterId);
    return;
  }
  assertCanAccessOwnedDocument(currentUser, subject);
  const access = {
    userId: currentUser._id,
    includeLegacy: isLegacyWorkspaceOwner(currentUser),
  };

  if (!options.skipChapterStatsRebuild) {
    await rebuildChapterStatsForAccess(ctx, access, chapter, subject);
  }
  await rebuildCellsForChapterAccess(ctx, access, chapterId);

  const concepts = (
    await ctx.db
      .query("concepts")
      .withIndex("by_chapter", (q) => q.eq("chapterId", chapterId))
      .collect()
  ).filter((concept) => canUseDocument(access, concept));

  for (const concept of concepts) {
    await rebuildConceptStatsForAccess(ctx, access, concept, chapter, subject);
  }
}

export async function rebuildSyllabusSummariesForConcept(
  ctx: MutationCtx,
  currentUser: CurrentUser,
  conceptId: Id<"concepts">,
) {
  const concept = await ctx.db.get(conceptId);
  if (!concept) {
    await deleteConceptStat(ctx, currentUser._id, conceptId);
    return;
  }

  assertCanAccessOwnedDocument(currentUser, concept);
  const chapter = await ctx.db.get(concept.chapterId);
  if (!chapter) {
    await deleteConceptStat(ctx, currentUser._id, conceptId);
    return;
  }
  const subject = await ctx.db.get(chapter.subjectId);
  if (!subject) {
    await deleteConceptStat(ctx, currentUser._id, conceptId);
    return;
  }
  assertCanAccessOwnedDocument(currentUser, subject);
  await rebuildConceptStatsForAccess(
    ctx,
    {
      userId: currentUser._id,
      includeLegacy: isLegacyWorkspaceOwner(currentUser),
    },
    concept,
    chapter,
    subject,
  );
}

async function upsertLazyStatus(
  ctx: MutationCtx,
  fields: {
    key: string;
    userId: Id<"users">;
    scope: "subject" | "chapter";
    subjectId?: Id<"subjects">;
    chapterId?: Id<"chapters">;
    status: "needed" | "completed";
  },
) {
  const existing = await ctx.db
    .query("syllabusLazyCreationStatuses")
    .withIndex("by_key", (q) => q.eq("key", fields.key))
    .unique();

  if (existing) {
    await ctx.db.patch(existing._id, {
      ...fields,
      updatedAt: Date.now(),
    });
    return;
  }

  await ctx.db.insert("syllabusLazyCreationStatuses", {
    ...fields,
    updatedAt: Date.now(),
  });
}

export async function getSubjectLazyCreationStatus(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  subjectId: Id<"subjects">,
) {
  return await ctx.db
    .query("syllabusLazyCreationStatuses")
    .withIndex("by_key", (q) => q.eq("key", getSubjectLazyKey(userId, subjectId)))
    .unique();
}

export async function getChapterLazyCreationStatus(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  chapterId: Id<"chapters">,
) {
  return await ctx.db
    .query("syllabusLazyCreationStatuses")
    .withIndex("by_key", (q) => q.eq("key", getChapterLazyKey(userId, chapterId)))
    .unique();
}

export async function markSubjectStudyItemsEnsured(
  ctx: MutationCtx,
  userId: Id<"users">,
  subjectId: Id<"subjects">,
) {
  await upsertLazyStatus(ctx, {
    key: getSubjectLazyKey(userId, subjectId),
    userId,
    scope: "subject",
    subjectId,
    status: "completed",
  });
}

export async function markChapterStudyItemsEnsured(
  ctx: MutationCtx,
  userId: Id<"users">,
  chapterId: Id<"chapters">,
) {
  await upsertLazyStatus(ctx, {
    key: getChapterLazyKey(userId, chapterId),
    userId,
    scope: "chapter",
    chapterId,
    status: "completed",
  });
}

export async function invalidateSubjectStudyItemEnsureStatus(
  ctx: MutationCtx,
  userId: Id<"users">,
  subjectId: Id<"subjects">,
) {
  await upsertLazyStatus(ctx, {
    key: getSubjectLazyKey(userId, subjectId),
    userId,
    scope: "subject",
    subjectId,
    status: "needed",
  });
}

export async function invalidateChapterStudyItemEnsureStatus(
  ctx: MutationCtx,
  userId: Id<"users">,
  chapterId: Id<"chapters">,
) {
  await upsertLazyStatus(ctx, {
    key: getChapterLazyKey(userId, chapterId),
    userId,
    scope: "chapter",
    chapterId,
    status: "needed",
  });
}

export async function getSyllabusSummaryMigrationStatus(
  ctx: QueryCtx,
  userId: Id<"users">,
) {
  return await ctx.db
    .query("syllabusSummaryMigrations")
    .withIndex("by_key", (q) => q.eq("key", getMigrationKey(userId)))
    .unique();
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
    .query("syllabusSummaryMigrations")
    .withIndex("by_key", (q) => q.eq("key", getMigrationKey(fields.ownerUserId)))
    .unique();

  if (existing) {
    await ctx.db.patch(existing._id, { ...fields, updatedAt: Date.now() });
    return;
  }

  await ctx.db.insert("syllabusSummaryMigrations", {
    key: getMigrationKey(fields.ownerUserId),
    updatedAt: Date.now(),
    ...fields,
  });
}

export const startSyllabusSummaryBackfill = mutation({
  args: {},
  handler: async (ctx) => {
    const currentUser = await requireCurrentUser(ctx);
    const existing = await getSyllabusSummaryMigrationStatus(ctx, currentUser._id);
    if (existing?.status === "running" || existing?.status === "completed") {
      return null;
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
      internal.syllabusSummaries.runSyllabusSummaryBackfillBatch,
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

export const runSyllabusSummaryBackfillBatch = internalMutation({
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
        if (!canUseDocument(access, chapter)) continue;
        const subject = await ctx.db.get(chapter.subjectId);
        if (!subject || !canUseDocument(access, subject)) {
          continue;
        }
        await rebuildChapterStatsForAccess(ctx, access, chapter, subject);
        await rebuildCellsForChapterAccess(ctx, access, chapter._id);

        const concepts = (
          await ctx.db
            .query("concepts")
            .withIndex("by_chapter", (q) => q.eq("chapterId", chapter._id))
            .collect()
        ).filter((concept) => canUseDocument(access, concept));
        for (const concept of concepts) {
          await rebuildConceptStatsForAccess(ctx, access, concept, chapter, subject);
        }

        processedChapters += 1;
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
        internal.syllabusSummaries.runSyllabusSummaryBackfillBatch,
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

async function reconcileInitialConceptReviewsForChapter(
  ctx: MutationCtx,
  access: SummaryAccess,
  chapter: Doc<"chapters">,
  subject: Doc<"subjects">,
) {
  const requiredTrackerCount = getRequiredTrackerKeys(subject, "concept").size;
  if (requiredTrackerCount === 0) {
    return;
  }

  const concepts = (
    await ctx.db
      .query("concepts")
      .withIndex("by_chapter", (q) => q.eq("chapterId", chapter._id))
      .collect()
  ).filter((concept) => canUseDocument(access, concept));

  for (const concept of concepts) {
    if (concept.nextReviewAt !== undefined) {
      continue;
    }
    const studyItems = await getStudyItemsForConceptAccess(ctx, access, concept._id);
    const required = summarizeRequiredStudyItems(subject, studyItems);
    if (
      required.total < requiredTrackerCount ||
      required.completed !== required.total
    ) {
      continue;
    }

    await ctx.db.patch(concept._id, {
      repetitionLevel: 0,
      nextReviewAt: Date.now() + 86400000,
    });
  }
}

/** Rebuild one subject's derived required-only stats in bounded batches. */
export const runTrackerConfigRebuildBatch = internalMutation({
  args: {
    ownerUserId: v.id("users"),
    subjectId: v.id("subjects"),
    includeLegacy: v.boolean(),
    cursor: v.union(v.string(), v.null()),
    processedChapters: v.number(),
    version: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const status = await getTrackerConfigRebuild(
      ctx,
      args.ownerUserId,
      args.subjectId,
    );
    if (!status || status.version !== args.version) {
      return null;
    }

    try {
      const subject = await ctx.db.get(args.subjectId);
      if (!subject || !canUseDocument({
        userId: args.ownerUserId,
        includeLegacy: args.includeLegacy,
      }, subject)) {
        await upsertTrackerConfigRebuild(ctx, {
          userId: args.ownerUserId,
          subjectId: args.subjectId,
          version: args.version,
          status: "completed",
          processedChapters: args.processedChapters,
          lastCursor: undefined,
          lastError: undefined,
        });
        return null;
      }

      const page = await ctx.db
        .query("chapters")
        .withIndex("by_subject", (q) => q.eq("subjectId", args.subjectId))
        .order("asc")
        .paginate({
          numItems: TRACKER_CONFIG_REBUILD_BATCH_SIZE,
          cursor: args.cursor,
        });
      const access = {
        userId: args.ownerUserId,
        includeLegacy: args.includeLegacy,
      };
      const currentUser = {
        _id: args.ownerUserId,
        legacyWorkspaceOwner: args.includeLegacy,
      } as CurrentUser;
      let processedChapters = args.processedChapters;

      for (const chapter of page.page) {
        if (!canUseDocument(access, chapter)) {
          continue;
        }
        await rebuildStudyItemStatsForChapter(ctx, currentUser, chapter._id);
        await rebuildSyllabusSummariesForChapter(
          ctx,
          currentUser,
          chapter._id,
          { skipChapterStatsRebuild: true },
        );
        await reconcileInitialConceptReviewsForChapter(ctx, access, chapter, subject);
        processedChapters += 1;
      }

      if (page.isDone) {
        await upsertTrackerConfigRebuild(ctx, {
          userId: args.ownerUserId,
          subjectId: args.subjectId,
          version: args.version,
          status: "completed",
          processedChapters,
          lastCursor: undefined,
          lastError: undefined,
        });
        return null;
      }

      await upsertTrackerConfigRebuild(ctx, {
        userId: args.ownerUserId,
        subjectId: args.subjectId,
        version: args.version,
        status: "running",
        processedChapters,
        lastCursor: page.continueCursor,
        lastError: undefined,
      });
      await ctx.scheduler.runAfter(
        0,
        internal.syllabusSummaries.runTrackerConfigRebuildBatch,
        {
          ownerUserId: args.ownerUserId,
          subjectId: args.subjectId,
          includeLegacy: args.includeLegacy,
          cursor: page.continueCursor,
          processedChapters,
          version: args.version,
        },
      );
      return null;
    } catch (error) {
      await upsertTrackerConfigRebuild(ctx, {
        userId: args.ownerUserId,
        subjectId: args.subjectId,
        version: args.version,
        status: "failed",
        processedChapters: args.processedChapters,
        lastCursor: args.cursor ?? undefined,
        lastError: error instanceof Error ? error.message : "Unknown error",
      });
      throw error;
    }
  },
});

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
  buildStudyItemSearchArtifacts,
} from "./studyItemSearch";
import {
  assertCanAccessOwnedDocument,
  isLegacyWorkspaceOwner,
  requireCurrentUser,
  type CurrentUser,
} from "./auth";

const TODO_SEARCH_DIGEST_MIGRATION_KEY = "todo_study_item_search_digest_backfill";
const BACKFILL_BATCH_SIZE = 64;

type DigestAccess = {
  userId: Id<"users">;
  includeLegacy: boolean;
};

function getMigrationKey(userId: Id<"users">) {
  return `${TODO_SEARCH_DIGEST_MIGRATION_KEY}:${userId}`;
}

function canUseDocument(access: DigestAccess, doc: { userId?: Id<"users"> }) {
  return doc.userId === access.userId || (doc.userId === undefined && access.includeLegacy);
}

function getTrackerLabel(
  subject: Doc<"subjects">,
  studyItem: Doc<"studyItems">,
) {
  const trackers = studyItem.conceptId
    ? subject.conceptTrackers
    : subject.chapterTrackers;
  return trackers.find((tracker) => tracker.key === studyItem.type)?.label ?? "";
}

async function getDigestForStudyItem(
  ctx: Pick<MutationCtx, "db">,
  userId: Id<"users">,
  studyItemId: Id<"studyItems">,
) {
  return await ctx.db
    .query("todoStudyItemSearchDigests")
    .withIndex("by_userId_and_studyItemId", (q) =>
      q.eq("userId", userId).eq("studyItemId", studyItemId),
    )
    .unique();
}

async function buildDigestFields(
  ctx: Pick<MutationCtx, "db">,
  studyItem: Doc<"studyItems">,
) {
  const [subject, chapter, concept] = await Promise.all([
    ctx.db.get(studyItem.subjectId),
    ctx.db.get(studyItem.chapterId),
    studyItem.conceptId ? ctx.db.get(studyItem.conceptId) : Promise.resolve(null),
  ]);

  if (!subject || !chapter) {
    return null;
  }

  const trackerLabel = getTrackerLabel(subject, studyItem);
  if (!trackerLabel) {
    return null;
  }

  const baseName = studyItem.conceptId ? concept?.name : chapter.name;
  if (!baseName) {
    return null;
  }

  const searchArtifacts = buildStudyItemSearchArtifacts({
    baseName,
    trackerLabel,
    subjectName: subject.name,
    chapterName: chapter.name,
    conceptName: concept?.name,
    title: studyItem.title,
  });

  return {
    subjectId: studyItem.subjectId,
    chapterId: studyItem.chapterId,
    conceptId: studyItem.conceptId,
    searchText: searchArtifacts.searchText,
    title: studyItem.title,
    subjectName: subject.name,
    chapterName: chapter.name,
    conceptName: concept?.name,
    subjectColor: subject.color,
    estimatedMinutes: studyItem.estimatedMinutes,
    isCompleted: studyItem.isCompleted,
  };
}

export async function upsertTodoStudyItemSearchDigest(
  ctx: MutationCtx,
  currentUser: CurrentUser,
  studyItemId: Id<"studyItems">,
) {
  const studyItem = await ctx.db.get(studyItemId);
  const existing = await getDigestForStudyItem(ctx, currentUser._id, studyItemId);

  if (!studyItem) {
    if (existing) {
      await ctx.db.delete(existing._id);
    }
    return;
  }

  assertCanAccessOwnedDocument(currentUser, studyItem);
  const digestFields = await buildDigestFields(ctx, studyItem);
  if (!digestFields) {
    if (existing) {
      await ctx.db.delete(existing._id);
    }
    return;
  }

  const nextDigest = {
    userId: currentUser._id,
    studyItemId,
    ...digestFields,
    updatedAt: Date.now(),
  };

  if (existing) {
    await ctx.db.patch(existing._id, nextDigest);
    return;
  }

  await ctx.db.insert("todoStudyItemSearchDigests", nextDigest);
}

export async function deleteTodoStudyItemSearchDigestForStudyItem(
  ctx: MutationCtx,
  userId: Id<"users">,
  studyItemId: Id<"studyItems">,
) {
  const existing = await getDigestForStudyItem(ctx, userId, studyItemId);
  if (existing) {
    await ctx.db.delete(existing._id);
  }
}

export async function getTodoStudyItemSearchDigestMigrationStatus(
  ctx: QueryCtx,
  userId: Id<"users">,
) {
  return await ctx.db
    .query("todoStudyItemSearchDigestMigrations")
    .withIndex("by_key", (q) => q.eq("key", getMigrationKey(userId)))
    .unique();
}

async function upsertMigrationStatus(
  ctx: MutationCtx,
  fields: {
    status: "idle" | "running" | "completed" | "failed";
    ownerUserId: Id<"users">;
    includeLegacy: boolean;
    processedItems: number;
    lastCursor?: string;
    lastError?: string;
  },
) {
  const existing = await ctx.db
    .query("todoStudyItemSearchDigestMigrations")
    .withIndex("by_key", (q) => q.eq("key", getMigrationKey(fields.ownerUserId)))
    .unique();

  if (existing) {
    await ctx.db.patch(existing._id, {
      ...fields,
      updatedAt: Date.now(),
    });
    return;
  }

  await ctx.db.insert("todoStudyItemSearchDigestMigrations", {
    key: getMigrationKey(fields.ownerUserId),
    updatedAt: Date.now(),
    ...fields,
  });
}

export const getTodoStudyItemSearchDigestBackfillStatus = query({
  args: {},
  handler: async (ctx) => {
    const currentUser = await requireCurrentUser(ctx);
    const status = await getTodoStudyItemSearchDigestMigrationStatus(
      ctx,
      currentUser._id,
    );

    return {
      status: status?.status ?? "idle",
      processedItems: status?.processedItems ?? 0,
      lastError: status?.lastError,
      updatedAt: status?.updatedAt,
    };
  },
});

export const startTodoStudyItemSearchDigestBackfill = mutation({
  args: {},
  handler: async (ctx) => {
    const currentUser = await requireCurrentUser(ctx);
    const existingStatus = await getTodoStudyItemSearchDigestMigrationStatus(
      ctx,
      currentUser._id,
    );

    if (
      existingStatus?.status === "running" ||
      existingStatus?.status === "completed"
    ) {
      return null;
    }

    const includeLegacy = isLegacyWorkspaceOwner(currentUser);
    await upsertMigrationStatus(ctx, {
      status: "running",
      ownerUserId: currentUser._id,
      includeLegacy,
      processedItems: 0,
      lastCursor: undefined,
      lastError: undefined,
    });

    await ctx.scheduler.runAfter(
      0,
      internal.todoStudyItemSearchDigests.runTodoStudyItemSearchDigestBackfillBatch,
      {
        ownerUserId: currentUser._id,
        includeLegacy,
        cursor: null,
        processedItems: 0,
      },
    );

    return null;
  },
});

export const runTodoStudyItemSearchDigestBackfillBatch = internalMutation({
  args: {
    ownerUserId: v.id("users"),
    includeLegacy: v.boolean(),
    cursor: v.union(v.string(), v.null()),
    processedItems: v.number(),
  },
  handler: async (ctx, args) => {
    try {
      const page = await ctx.db.query("studyItems").order("asc").paginate({
        numItems: BACKFILL_BATCH_SIZE,
        cursor: args.cursor,
      });
      const access = {
        userId: args.ownerUserId,
        includeLegacy: args.includeLegacy,
      };
      let processedItems = args.processedItems;

      for (const studyItem of page.page) {
        if (!canUseDocument(access, studyItem)) {
          continue;
        }

        const currentUser = {
          _id: args.ownerUserId,
          legacyWorkspaceOwner: args.includeLegacy,
        } as CurrentUser;
        await upsertTodoStudyItemSearchDigest(ctx, currentUser, studyItem._id);
        processedItems += 1;
      }

      if (page.isDone) {
        await upsertMigrationStatus(ctx, {
          status: "completed",
          ownerUserId: args.ownerUserId,
          includeLegacy: args.includeLegacy,
          processedItems,
          lastCursor: undefined,
          lastError: undefined,
        });
        return null;
      }

      await upsertMigrationStatus(ctx, {
        status: "running",
        ownerUserId: args.ownerUserId,
        includeLegacy: args.includeLegacy,
        processedItems,
        lastCursor: page.continueCursor,
        lastError: undefined,
      });
      await ctx.scheduler.runAfter(
        0,
        internal.todoStudyItemSearchDigests.runTodoStudyItemSearchDigestBackfillBatch,
        {
          ownerUserId: args.ownerUserId,
          includeLegacy: args.includeLegacy,
          cursor: page.continueCursor,
          processedItems,
        },
      );
      return null;
    } catch (error) {
      await upsertMigrationStatus(ctx, {
        status: "failed",
        ownerUserId: args.ownerUserId,
        includeLegacy: args.includeLegacy,
        processedItems: args.processedItems,
        lastCursor: args.cursor ?? undefined,
        lastError: error instanceof Error ? error.message : "Unknown error",
      });
      throw error;
    }
  },
});

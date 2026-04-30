import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
} from "./_generated/server";
import { v } from "convex/values";
import {
  isLegacyWorkspaceOwner,
  requireCurrentUser,
} from "./auth";

const OWNERSHIP_MIGRATION_KEY = "user_ownership_backfill";
const OWNERSHIP_BATCH_SIZE = 64;
const OWNED_TABLES = [
  "subjects",
  "chapters",
  "concepts",
  "studyItems",
  "studyLogs",
  "plannerSessions",
  "plannerSuggestions",
  "plannerSubjectPreferences",
  "weeklyTargets",
  "coachingProgress",
  "todoTasks",
  "settings",
] as const;

type OwnedTableName = (typeof OWNED_TABLES)[number];

type MigrationStatusFields = {
  status: "idle" | "running" | "completed" | "failed";
  ownerUserId?: Id<"users">;
  processedDocs: number;
  lastTable?: string;
  lastCursor?: string;
  lastError?: string;
};

async function processTableBatch(
  ctx: Pick<MutationCtx, "db">,
  tableName: OwnedTableName,
  ownerUserId: Id<"users">,
  cursor: string | null,
) {
  switch (tableName) {
    case "subjects": {
      const page = await ctx.db.query("subjects").order("asc").paginate({
        numItems: OWNERSHIP_BATCH_SIZE,
        cursor,
      });
      let patchedCount = 0;
      for (const doc of page.page) {
        if (doc.userId === undefined) {
          await ctx.db.patch(doc._id, { userId: ownerUserId });
          patchedCount += 1;
        }
      }
      return { isDone: page.isDone, continueCursor: page.continueCursor, patchedCount };
    }
    case "chapters": {
      const page = await ctx.db.query("chapters").order("asc").paginate({
        numItems: OWNERSHIP_BATCH_SIZE,
        cursor,
      });
      let patchedCount = 0;
      for (const doc of page.page) {
        if (doc.userId === undefined) {
          await ctx.db.patch(doc._id, { userId: ownerUserId });
          patchedCount += 1;
        }
      }
      return { isDone: page.isDone, continueCursor: page.continueCursor, patchedCount };
    }
    case "concepts": {
      const page = await ctx.db.query("concepts").order("asc").paginate({
        numItems: OWNERSHIP_BATCH_SIZE,
        cursor,
      });
      let patchedCount = 0;
      for (const doc of page.page) {
        if (doc.userId === undefined) {
          await ctx.db.patch(doc._id, { userId: ownerUserId });
          patchedCount += 1;
        }
      }
      return { isDone: page.isDone, continueCursor: page.continueCursor, patchedCount };
    }
    case "studyItems": {
      const page = await ctx.db.query("studyItems").order("asc").paginate({
        numItems: OWNERSHIP_BATCH_SIZE,
        cursor,
      });
      let patchedCount = 0;
      for (const doc of page.page) {
        if (doc.userId === undefined) {
          await ctx.db.patch(doc._id, { userId: ownerUserId });
          patchedCount += 1;
        }
      }
      return { isDone: page.isDone, continueCursor: page.continueCursor, patchedCount };
    }
    case "studyLogs": {
      const page = await ctx.db.query("studyLogs").order("asc").paginate({
        numItems: OWNERSHIP_BATCH_SIZE,
        cursor,
      });
      let patchedCount = 0;
      for (const doc of page.page) {
        if (doc.userId === undefined) {
          await ctx.db.patch(doc._id, { userId: ownerUserId });
          patchedCount += 1;
        }
      }
      return { isDone: page.isDone, continueCursor: page.continueCursor, patchedCount };
    }
    case "plannerSessions": {
      const page = await ctx.db.query("plannerSessions").order("asc").paginate({
        numItems: OWNERSHIP_BATCH_SIZE,
        cursor,
      });
      let patchedCount = 0;
      for (const doc of page.page) {
        if (doc.userId === undefined) {
          await ctx.db.patch(doc._id, { userId: ownerUserId });
          patchedCount += 1;
        }
      }
      return { isDone: page.isDone, continueCursor: page.continueCursor, patchedCount };
    }
    case "plannerSuggestions": {
      const page = await ctx.db.query("plannerSuggestions").order("asc").paginate({
        numItems: OWNERSHIP_BATCH_SIZE,
        cursor,
      });
      let patchedCount = 0;
      for (const doc of page.page) {
        if (doc.userId === undefined) {
          await ctx.db.patch(doc._id, { userId: ownerUserId });
          patchedCount += 1;
        }
      }
      return { isDone: page.isDone, continueCursor: page.continueCursor, patchedCount };
    }
    case "plannerSubjectPreferences": {
      const page = await ctx.db.query("plannerSubjectPreferences").order("asc").paginate({
        numItems: OWNERSHIP_BATCH_SIZE,
        cursor,
      });
      let patchedCount = 0;
      for (const doc of page.page) {
        if (doc.userId === undefined) {
          await ctx.db.patch(doc._id, { userId: ownerUserId });
          patchedCount += 1;
        }
      }
      return { isDone: page.isDone, continueCursor: page.continueCursor, patchedCount };
    }
    case "weeklyTargets": {
      const page = await ctx.db.query("weeklyTargets").order("asc").paginate({
        numItems: OWNERSHIP_BATCH_SIZE,
        cursor,
      });
      let patchedCount = 0;
      for (const doc of page.page) {
        if (doc.userId === undefined) {
          await ctx.db.patch(doc._id, { userId: ownerUserId });
          patchedCount += 1;
        }
      }
      return { isDone: page.isDone, continueCursor: page.continueCursor, patchedCount };
    }
    case "coachingProgress": {
      const page = await ctx.db.query("coachingProgress").order("asc").paginate({
        numItems: OWNERSHIP_BATCH_SIZE,
        cursor,
      });
      let patchedCount = 0;
      for (const doc of page.page) {
        if (doc.userId === undefined) {
          await ctx.db.patch(doc._id, { userId: ownerUserId });
          patchedCount += 1;
        }
      }
      return { isDone: page.isDone, continueCursor: page.continueCursor, patchedCount };
    }
    case "todoTasks": {
      const page = await ctx.db.query("todoTasks").order("asc").paginate({
        numItems: OWNERSHIP_BATCH_SIZE,
        cursor,
      });
      let patchedCount = 0;
      for (const doc of page.page) {
        if (doc.userId === undefined) {
          await ctx.db.patch(doc._id, { userId: ownerUserId });
          patchedCount += 1;
        }
      }
      return { isDone: page.isDone, continueCursor: page.continueCursor, patchedCount };
    }
    case "settings": {
      const page = await ctx.db.query("settings").order("asc").paginate({
        numItems: OWNERSHIP_BATCH_SIZE,
        cursor,
      });
      let patchedCount = 0;
      for (const doc of page.page) {
        if (doc.userId === undefined) {
          await ctx.db.patch(doc._id, { userId: ownerUserId });
          patchedCount += 1;
        }
      }
      return { isDone: page.isDone, continueCursor: page.continueCursor, patchedCount };
    }
  }
}

export const getUserOwnershipMigrationStatus = query({
  args: {},
  handler: async (ctx) => {
    const currentUser = await requireCurrentUser(ctx);
    const status = await ctx.db
      .query("ownershipMigrations")
      .withIndex("by_key", (q) => q.eq("key", OWNERSHIP_MIGRATION_KEY))
      .unique();

    return {
      canRun: isLegacyWorkspaceOwner(currentUser),
      status: status?.status ?? "idle",
      processedDocs: status?.processedDocs ?? 0,
      lastTable: status?.lastTable,
      ownerUserId: status?.ownerUserId,
    };
  },
});

export const startUserOwnershipBackfill = mutation({
  args: {},
  handler: async (ctx) => {
    async function upsertMigrationStatus(fields: MigrationStatusFields) {
      const existing = await ctx.db
        .query("ownershipMigrations")
        .withIndex("by_key", (q) => q.eq("key", OWNERSHIP_MIGRATION_KEY))
        .unique();

      if (existing) {
        await ctx.db.patch(existing._id, {
          ...fields,
          updatedAt: Date.now(),
        });
        return existing._id;
      }

      return await ctx.db.insert("ownershipMigrations", {
        key: OWNERSHIP_MIGRATION_KEY,
        updatedAt: Date.now(),
        ...fields,
      });
    }

    const currentUser = await requireCurrentUser(ctx);
    if (!isLegacyWorkspaceOwner(currentUser)) {
      throw new Error("Only the legacy workspace owner can run this migration");
    }

    await upsertMigrationStatus({
      status: "running",
      ownerUserId: currentUser._id,
      processedDocs: 0,
      lastTable: OWNED_TABLES[0],
      lastCursor: undefined,
      lastError: undefined,
    });

    await ctx.scheduler.runAfter(
      0,
      internal.ownershipMigration.runUserOwnershipBackfillBatch,
      {
        ownerUserId: currentUser._id,
        tableIndex: 0,
        cursor: null,
        processedDocs: 0,
      },
    );

    return null;
  },
});

export const runUserOwnershipBackfillBatch = internalMutation({
  args: {
    ownerUserId: v.id("users"),
    tableIndex: v.number(),
    cursor: v.union(v.string(), v.null()),
    processedDocs: v.number(),
  },
  handler: async (ctx, args) => {
    async function upsertMigrationStatus(fields: MigrationStatusFields) {
      const existing = await ctx.db
        .query("ownershipMigrations")
        .withIndex("by_key", (q) => q.eq("key", OWNERSHIP_MIGRATION_KEY))
        .unique();

      if (existing) {
        await ctx.db.patch(existing._id, {
          ...fields,
          updatedAt: Date.now(),
        });
        return existing._id;
      }

      return await ctx.db.insert("ownershipMigrations", {
        key: OWNERSHIP_MIGRATION_KEY,
        updatedAt: Date.now(),
        ...fields,
      });
    }

    const tableName = OWNED_TABLES[args.tableIndex];
    if (!tableName) {
      await upsertMigrationStatus({
        status: "completed",
        ownerUserId: args.ownerUserId,
        processedDocs: args.processedDocs,
        lastTable: undefined,
        lastCursor: undefined,
        lastError: undefined,
      });
      return null;
    }

    try {
      const page = await processTableBatch(
        ctx,
        tableName,
        args.ownerUserId,
        args.cursor,
      );
      const processedDocs = args.processedDocs + page.patchedCount;

      if (page.isDone) {
        const nextTableIndex = args.tableIndex + 1;
        if (nextTableIndex >= OWNED_TABLES.length) {
          await upsertMigrationStatus({
            status: "completed",
            ownerUserId: args.ownerUserId,
            processedDocs,
            lastTable: tableName,
            lastCursor: undefined,
            lastError: undefined,
          });
          return null;
        }

        await upsertMigrationStatus({
          status: "running",
          ownerUserId: args.ownerUserId,
          processedDocs,
          lastTable: OWNED_TABLES[nextTableIndex],
          lastCursor: undefined,
          lastError: undefined,
        });
        await ctx.scheduler.runAfter(
          0,
          internal.ownershipMigration.runUserOwnershipBackfillBatch,
          {
            ownerUserId: args.ownerUserId,
            tableIndex: nextTableIndex,
            cursor: null,
            processedDocs,
          },
        );
        return null;
      }

      await upsertMigrationStatus({
        status: "running",
        ownerUserId: args.ownerUserId,
        processedDocs,
        lastTable: tableName,
        lastCursor: page.continueCursor,
        lastError: undefined,
      });
      await ctx.scheduler.runAfter(
        0,
        internal.ownershipMigration.runUserOwnershipBackfillBatch,
        {
          ownerUserId: args.ownerUserId,
          tableIndex: args.tableIndex,
          cursor: page.continueCursor,
          processedDocs,
        },
      );
      return null;
    } catch (error) {
      await upsertMigrationStatus({
        status: "failed",
        ownerUserId: args.ownerUserId,
        processedDocs: args.processedDocs,
        lastTable: tableName,
        lastCursor: args.cursor ?? undefined,
        lastError: error instanceof Error ? error.message : "Unknown migration error",
      });
      throw error;
    }
  },
});

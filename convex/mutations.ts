import { mutation, type MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { v } from "convex/values";
import {
  buildStudyItemSearchArtifacts,
  STUDY_ITEM_SEARCH_TEXT_VERSION,
} from "./studyItemSearch";

const TODO_DURATION_MINUTES = Array.from({ length: 16 }, (_, index) => (index + 1) * 15);
const STUDY_ITEM_SEARCH_VERSION_SETTING_KEY = "study_item_search_text_version";
const STUDY_ITEM_SEARCH_BACKFILL_BATCH_SIZE = 64;

function buildStudyItemTitle(baseName: string, trackerLabel: string) {
  return `${baseName} — ${trackerLabel}`;
}

function buildStudyItemSearchText(args: {
  title: string;
  subjectName: string;
  chapterName: string;
  conceptName?: string;
}) {
  return [
    args.title,
    args.subjectName,
    args.chapterName,
    args.conceptName,
  ]
    .filter((value): value is string => Boolean(value && value.trim()))
    .join(" ");
}

function getTrackerForStudyItem(
  subject: Doc<"subjects">,
  item: Doc<"studyItems">,
) {
  const trackers = item.conceptId
    ? subject.conceptTrackers
    : subject.chapterTrackers;
  return trackers.find((tracker) => tracker.key === item.type) ?? null;
}

async function removeTodoTasksForStudyItem(
  ctx: MutationCtx,
  studyItemId: Id<"studyItems">,
) {
  const todoTasks = await ctx.db
    .query("todoTasks")
    .withIndex("by_studyItemId", (q) => q.eq("studyItemId", studyItemId))
    .collect();

  for (const todoTask of todoTasks) {
    await ctx.db.delete(todoTask._id);
  }
}

async function syncStudyItemPresentation(
  ctx: MutationCtx,
  studyItemId: Id<"studyItems">,
) {
  const item = await ctx.db.get(studyItemId);
  if (!item) return;

  const [subject, chapter, concept] = await Promise.all([
    ctx.db.get(item.subjectId),
    ctx.db.get(item.chapterId),
    item.conceptId ? ctx.db.get(item.conceptId) : Promise.resolve(null),
  ]);

  if (!subject || !chapter) return;

  const tracker = getTrackerForStudyItem(subject, item);
  if (!tracker) return;

  const baseName = item.conceptId
    ? concept?.name
    : chapter.name;

  if (!baseName) return;

  const title = buildStudyItemTitle(baseName, tracker.label);
  const legacySearchText = buildStudyItemSearchText({
    title,
    subjectName: subject.name,
    chapterName: chapter.name,
    conceptName: concept?.name,
  });
  const searchText =
    buildStudyItemSearchArtifacts({
      baseName,
      trackerLabel: tracker.label,
      subjectName: subject.name,
      chapterName: chapter.name,
      conceptName: concept?.name,
      title,
    }).searchText || legacySearchText;

  if (item.title !== title || item.searchText !== searchText) {
    await ctx.db.patch(item._id, {
      title,
      searchText,
    });
  }
}

async function syncStudyItemsBySubject(
  ctx: MutationCtx,
  subjectId: Id<"subjects">,
) {
  const studyItems = await ctx.db
    .query("studyItems")
    .withIndex("by_subject", (q) => q.eq("subjectId", subjectId))
    .collect();

  for (const item of studyItems) {
    await syncStudyItemPresentation(ctx, item._id);
  }
}

async function syncStudyItemsByChapter(
  ctx: MutationCtx,
  chapterId: Id<"chapters">,
) {
  const studyItems = await ctx.db
    .query("studyItems")
    .withIndex("by_chapter", (q) => q.eq("chapterId", chapterId))
    .collect();

  for (const item of studyItems) {
    await syncStudyItemPresentation(ctx, item._id);
  }
}

// ── Create a subject ─────────────────────────────────────────────
// ... (rest of the file)
export const createSubject = mutation({
  args: {
    name: v.string(),
    slug: v.optional(v.string()),
    color: v.optional(v.string()),
    icon: v.optional(v.string()),
    chapterTrackers: v.array(
      v.object({
        key: v.string(),
        label: v.string(),
        avgMinutes: v.number(),
      })
    ),
    conceptTrackers: v.array(
      v.object({
        key: v.string(),
        label: v.string(),
        avgMinutes: v.number(),
      })
    ),
    examWeight: v.optional(v.number()),
    order: v.number(),
  },
  handler: async (ctx, args) => {
    const { slug, ...rest } = args;
    const subjectId = await ctx.db.insert("subjects", {
      ...rest,
      slug: slug || "", // Placeholder
    });
    
    if (!slug) {
      await ctx.db.patch(subjectId, { slug: subjectId });
    }
    
    return subjectId;
  },
});

// ── Update a subject ─────────────────────────────────────────────
// Updates subject metadata and tracker configs
// Deletes orphaned studyItems when trackers are removed
export const updateSubject = mutation({
  args: {
    subjectId: v.id("subjects"),
    name: v.optional(v.string()),
    slug: v.optional(v.string()),
    icon: v.optional(v.string()),
    color: v.optional(v.string()),
    chapterTrackers: v.optional(v.array(v.object({
      key: v.string(),
      label: v.string(),
      avgMinutes: v.number(),
    }))),
    conceptTrackers: v.optional(v.array(v.object({
      key: v.string(),
      label: v.string(),
      avgMinutes: v.number(),
    }))),
  },
  handler: async (ctx, args) => {
    const { subjectId, ...updates } = args;

    const oldSubject = await ctx.db.get(subjectId);
    if (!oldSubject) throw new Error("Subject not found");

    if (updates.chapterTrackers) {
      const newKeys = new Set(updates.chapterTrackers.map(t => t.key));
      const removedKeys = oldSubject.chapterTrackers.filter(t => !newKeys.has(t.key)).map(t => t.key);

      for (const key of removedKeys) {
        const studyItems = await ctx.db.query("studyItems")
          .withIndex("by_subject", q => q.eq("subjectId", subjectId))
          .filter(q => q.eq(q.field("type"), key))
          .collect();

        for (const item of studyItems) {
          // Delete logs for this item
          const logs = await ctx.db.query("studyLogs")
            .withIndex("by_studyItemId_and_loggedAt", q => q.eq("studyItemId", item._id))
            .collect();
          for (const log of logs) await ctx.db.delete(log._id);

          await removeTodoTasksForStudyItem(ctx, item._id);
          await ctx.db.delete(item._id);
        }
      }
    }

    if (updates.conceptTrackers) {
      const newKeys = new Set(updates.conceptTrackers.map(t => t.key));
      const removedKeys = oldSubject.conceptTrackers.filter(t => !newKeys.has(t.key)).map(t => t.key);

      for (const key of removedKeys) {
        const studyItems = await ctx.db.query("studyItems")
          .withIndex("by_subject", q => q.eq("subjectId", subjectId))
          .filter(q => q.eq(q.field("type"), key))
          .collect();

        for (const item of studyItems) {
          // Delete logs for this item
          const logs = await ctx.db.query("studyLogs")
            .withIndex("by_studyItemId_and_loggedAt", q => q.eq("studyItemId", item._id))
            .collect();
          for (const log of logs) await ctx.db.delete(log._id);

          await removeTodoTasksForStudyItem(ctx, item._id);
          await ctx.db.delete(item._id);
        }
      }
    }

    await ctx.db.patch(subjectId, updates);
    await syncStudyItemsBySubject(ctx, subjectId);
  },
});

// ── Update study log minutes ────────────────────────────────────
export const updateStudyLogMinutes = mutation({
  args: {
    logId: v.id("studyLogs"),
    minutesSpent: v.number(),
  },
  handler: async (ctx, args) => {
    const log = await ctx.db.get(args.logId);
    if (!log) throw new Error("Log not found");
    if (!log.isEditable) throw new Error("This log is not editable");

    // Only allow study_item_completed and concept_review
    if (log.eventType === "study_item_uncompleted") {
      throw new Error("Cannot edit uncompletion logs");
    }

    // Validate minutes
    if (args.minutesSpent < 1 || args.minutesSpent > 600 || !Number.isFinite(args.minutesSpent)) {
      throw new Error("Minutes must be between 1 and 600");
    }

    await ctx.db.patch(args.logId, {
      minutesSpent: args.minutesSpent,
      minutesSource: "user_edited",
      editedAt: Date.now(),
    });
  },
});

// ── Toggle chapter inNextTerm ────────────────────────────────────
export const toggleChapterInNextTerm = mutation({
  args: { chapterId: v.id("chapters") },
  handler: async (ctx, args) => {
    const chapter = await ctx.db.get(args.chapterId);
    if (!chapter) throw new Error("Chapter not found");
    await ctx.db.patch(args.chapterId, {
      inNextTerm: !chapter.inNextTerm,
    });
  },
});

// ── Create a chapter ─────────────────────────────────────────────
export const createChapter = mutation({
  args: {
    subjectId: v.id("subjects"),
    name: v.string(),
    slug: v.optional(v.string()),
    order: v.number(),
    inNextTerm: v.boolean(),
    priorityBoost: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { slug, ...rest } = args;
    const chapterId = await ctx.db.insert("chapters", {
      ...rest,
      slug: slug || "", // Placeholder
    });

    if (!slug) {
      await ctx.db.patch(chapterId, { slug: chapterId });
    }

    return chapterId;
  },
});

// ── Update a chapter ─────────────────────────────────────────────
export const updateChapter = mutation({
  args: {
    chapterId: v.id("chapters"),
    name: v.string(),
    slug: v.optional(v.string()),
    order: v.number(),
    inNextTerm: v.boolean(),
    priorityBoost: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { chapterId, ...updates } = args;
    await ctx.db.patch(chapterId, updates);
    await syncStudyItemsByChapter(ctx, chapterId);
  },
});

// ── Delete a chapter ─────────────────────────────────────────────
export const deleteChapter = mutation({
  args: { chapterId: v.id("chapters") },
  handler: async (ctx, args) => {
    // Also delete associated concepts and studyItems
    const concepts = await ctx.db
      .query("concepts")
      .withIndex("by_chapter", (q) => q.eq("chapterId", args.chapterId))
      .collect();
    
    for (const concept of concepts) {
      const studyItems = await ctx.db
        .query("studyItems")
        .withIndex("by_concept", (q) => q.eq("conceptId", concept._id))
        .collect();
      for (const item of studyItems) {
        // Delete logs for this item
        const logs = await ctx.db.query("studyLogs")
          .withIndex("by_studyItemId_and_loggedAt", q => q.eq("studyItemId", item._id))
          .collect();
        for (const log of logs) await ctx.db.delete(log._id);

        await removeTodoTasksForStudyItem(ctx, item._id);
        await ctx.db.delete(item._id);
      }

      // Delete revision logs for this concept
      const revisionLogs = await ctx.db.query("studyLogs")
        .withIndex("by_conceptId_and_loggedAt", q => q.eq("conceptId", concept._id))
        .collect();
      for (const log of revisionLogs) await ctx.db.delete(log._id);

      await ctx.db.delete(concept._id);
    }

    const chapterItems = await ctx.db
      .query("studyItems")
      .withIndex("by_chapter", (q) => q.eq("chapterId", args.chapterId))
      .collect();
    for (const item of chapterItems) {
      // Delete logs for this item
      const logs = await ctx.db.query("studyLogs")
        .withIndex("by_studyItemId_and_loggedAt", q => q.eq("studyItemId", item._id))
        .collect();
      for (const log of logs) await ctx.db.delete(log._id);

      await removeTodoTasksForStudyItem(ctx, item._id);
      await ctx.db.delete(item._id);
    }

    await ctx.db.delete(args.chapterId);
  },
});

// ── Create a concept ─────────────────────────────────────────────
export const createConcept = mutation({
  args: {
    chapterId: v.id("chapters"),
    name: v.string(),
    order: v.number(),
    difficulty: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("concepts", args);
  },
});

// ── Update a concept ─────────────────────────────────────────────
export const updateConcept = mutation({
  args: {
    conceptId: v.id("concepts"),
    name: v.string(),
    order: v.number(),
    difficulty: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { conceptId, ...updates } = args;
    
    // Update the concept itself
    await ctx.db.patch(conceptId, updates);

    // Also update titles of associated studyItems to keep them in sync
    // Pattern: "${concept.name} — ${tracker.label}"
    const concept = await ctx.db.get(conceptId);
    if (!concept) return;

    const chapter = await ctx.db.get(concept.chapterId);
    if (!chapter) return;

    const subject = await ctx.db.get(chapter.subjectId);
    if (!subject) return;

    const studyItems = await ctx.db
      .query("studyItems")
      .withIndex("by_concept", (q) => q.eq("conceptId", conceptId))
      .collect();

    for (const item of studyItems) {
      const tracker = subject.conceptTrackers.find((t) => t.key === item.type);
      if (!tracker) continue;
      await syncStudyItemPresentation(ctx, item._id);
    }
  },
});

// ── Delete a concept ─────────────────────────────────────────────
export const deleteConcept = mutation({
  args: { conceptId: v.id("concepts") },
  handler: async (ctx, args) => {
    // Delete associated studyItems first and their logs
    const studyItems = await ctx.db
      .query("studyItems")
      .withIndex("by_concept", (q) => q.eq("conceptId", args.conceptId))
      .collect();
    
    for (const item of studyItems) {
      const logs = await ctx.db.query("studyLogs")
        .withIndex("by_studyItemId_and_loggedAt", q => q.eq("studyItemId", item._id))
        .collect();
      for (const log of logs) await ctx.db.delete(log._id);
      await removeTodoTasksForStudyItem(ctx, item._id);
      await ctx.db.delete(item._id);
    }

    // Delete revision logs for this concept
    const revisionLogs = await ctx.db.query("studyLogs")
      .withIndex("by_conceptId_and_loggedAt", q => q.eq("conceptId", args.conceptId))
      .collect();
    for (const log of revisionLogs) await ctx.db.delete(log._id);

    await ctx.db.delete(args.conceptId);
  },
});

// ── Reset all studyItems and concept revisions for a chapter ──────
export const resetChapterProgress = mutation({
  args: { chapterId: v.id("chapters") },
  handler: async (ctx, args) => {
    // 1. Reset all studyItems for this chapter
    const studyItems = await ctx.db
      .query("studyItems")
      .withIndex("by_chapter", (q) => q.eq("chapterId", args.chapterId))
      .collect();

    for (const item of studyItems) {
      // Delete logs for this item
      const logs = await ctx.db.query("studyLogs")
        .withIndex("by_studyItemId_and_loggedAt", q => q.eq("studyItemId", item._id))
        .collect();
      for (const log of logs) await ctx.db.delete(log._id);

      await ctx.db.patch(item._id, {
        isCompleted: false,
        completionScore: undefined,
        lastStudiedAt: undefined,
        nextReviewAt: undefined,
        repetitionLevel: undefined,
        easeFactor: undefined,
        weaknessScore: undefined,
      });
    }

    // 2. Reset all concepts for this chapter (SR fields) and delete their logs
    const concepts = await ctx.db
      .query("concepts")
      .withIndex("by_chapter", (q) => q.eq("chapterId", args.chapterId))
      .collect();

    for (const concept of concepts) {
      // Delete revision logs for this concept
      const revisionLogs = await ctx.db.query("studyLogs")
        .withIndex("by_conceptId_and_loggedAt", q => q.eq("conceptId", concept._id))
        .collect();
      for (const log of revisionLogs) await ctx.db.delete(log._id);

      await ctx.db.patch(concept._id, {
        reviewCount: undefined,
        lastReviewedAt: undefined,
        nextReviewAt: undefined,
        repetitionLevel: undefined,
      });
    }
  },
});

// ── Ensure chapter-level studyItems exist (lazy creation) ────────
// Called when user first visits a subject page
export const ensureChapterStudyItems = mutation({
  args: { subjectId: v.id("subjects") },
  handler: async (ctx, args) => {
    const subject = await ctx.db.get(args.subjectId);
    if (!subject) throw new Error("Subject not found");

    const chapters = await ctx.db
      .query("chapters")
      .withIndex("by_subject", (q) => q.eq("subjectId", args.subjectId))
      .collect();

    for (const chapter of chapters) {
      // Get existing chapter-level studyItems
      const existingItems = await ctx.db
        .query("studyItems")
        .withIndex("by_chapter", (q) => q.eq("chapterId", chapter._id))
        .collect();

      const existingChapterItems = existingItems.filter(
        (si) => si.conceptId === undefined
      );

      for (const tracker of subject.chapterTrackers) {
        const alreadyExists = existingChapterItems.some(
          (si) => si.type === tracker.key
        );

        if (!alreadyExists) {
          const title = buildStudyItemTitle(chapter.name, tracker.label);
          const legacySearchText = buildStudyItemSearchText({
            title,
            subjectName: subject.name,
            chapterName: chapter.name,
          });
          const searchText =
            buildStudyItemSearchArtifacts({
              baseName: chapter.name,
              trackerLabel: tracker.label,
              subjectName: subject.name,
              chapterName: chapter.name,
              title,
            }).searchText || legacySearchText;
          await ctx.db.insert("studyItems", {
            subjectId: args.subjectId,
            chapterId: chapter._id,
            type: tracker.key,
            title,
            searchText,
            estimatedMinutes: tracker.avgMinutes,
            isCompleted: false,
          });
        } else {
          const existingItem = existingChapterItems.find(
            (si) => si.type === tracker.key,
          );
          if (existingItem) {
            await syncStudyItemPresentation(ctx, existingItem._id);
          }
        }
      }
    }
  },
});

// ── Ensure concept-level studyItems exist (lazy creation) ────────
// Called when user first visits a chapter page
export const ensureConceptStudyItems = mutation({
  args: { chapterId: v.id("chapters") },
  handler: async (ctx, args) => {
    const chapter = await ctx.db.get(args.chapterId);
    if (!chapter) throw new Error("Chapter not found");

    const subject = await ctx.db.get(chapter.subjectId);
    if (!subject) throw new Error("Subject not found");

    const concepts = await ctx.db
      .query("concepts")
      .withIndex("by_chapter", (q) => q.eq("chapterId", args.chapterId))
      .collect();

    for (const concept of concepts) {
      const existingItems = await ctx.db
        .query("studyItems")
        .withIndex("by_concept", (q) => q.eq("conceptId", concept._id))
        .collect();

      for (const tracker of subject.conceptTrackers) {
        const alreadyExists = existingItems.some(
          (si) => si.type === tracker.key
        );

        if (!alreadyExists) {
          const title = buildStudyItemTitle(concept.name, tracker.label);
          const legacySearchText = buildStudyItemSearchText({
            title,
            subjectName: subject.name,
            chapterName: chapter.name,
            conceptName: concept.name,
          });
          const searchText =
            buildStudyItemSearchArtifacts({
              baseName: concept.name,
              trackerLabel: tracker.label,
              subjectName: subject.name,
              chapterName: chapter.name,
              conceptName: concept.name,
              title,
            }).searchText || legacySearchText;
          await ctx.db.insert("studyItems", {
            subjectId: subject._id,
            chapterId: args.chapterId,
            conceptId: concept._id,
            type: tracker.key,
            title,
            searchText,
            estimatedMinutes: tracker.avgMinutes,
            isCompleted: false,
          });
        } else {
          const existingItem = existingItems.find((si) => si.type === tracker.key);
          if (existingItem) {
            await syncStudyItemPresentation(ctx, existingItem._id);
          }
        }
      }
    }
  },
});

// ── Fix subjects with non-ASCII tracker keys ────────────────────
export const fixInvalidTrackerKeys = mutation({
  args: {},
  handler: async (ctx) => {
    type TrackerConfig = {
      key: string;
      label: string;
      avgMinutes: number;
    };

    type TrackerWithOldKey = TrackerConfig & {
      oldKey?: string;
    };

    const stripOldKey = (tracker: TrackerWithOldKey): TrackerConfig => ({
      key: tracker.key,
      label: tracker.label,
      avgMinutes: tracker.avgMinutes,
    });

    const subjects = await ctx.db.query("subjects").collect();
    for (const subject of subjects) {
      let changed = false;
      
      const updateTrackers = (trackers: TrackerConfig[]): TrackerWithOldKey[] => {
        const resultKeys = new Set<string>();
        return trackers.map((t) => {
          const sanitizedKey = t.key.replace(/[^\x00-\x7F]/g, "") || "tracker";
          let finalKey = sanitizedKey;
          let counter = 1;
          
          if (finalKey !== t.key || resultKeys.has(finalKey)) {
            changed = true;
            while (resultKeys.has(finalKey)) {
              finalKey = `${sanitizedKey}-${counter}`;
              counter++;
            }
          }
          
          resultKeys.add(finalKey);
          if (finalKey !== t.key) {
            return { ...t, key: finalKey, oldKey: t.key };
          }
          return t;
        });
      };

      const chapterTrackersWithOld = updateTrackers(subject.chapterTrackers);
      const conceptTrackersWithOld = updateTrackers(subject.conceptTrackers);

      if (changed) {
        // Update studyItems first
        const studyItems = await ctx.db
          .query("studyItems")
          .withIndex("by_subject", (q) => q.eq("subjectId", subject._id))
          .collect();

        for (const item of studyItems) {
          const matched = [...chapterTrackersWithOld, ...conceptTrackersWithOld].find(
            (t) => t.oldKey === item.type
          );
          if (matched) {
            await ctx.db.patch(item._id, { type: matched.key });
          }
        }

        // Update subject trackers (removing the temporary oldKey)
        await ctx.db.patch(subject._id, {
          chapterTrackers: chapterTrackersWithOld.map(stripOldKey),
          conceptTrackers: conceptTrackersWithOld.map(stripOldKey),
        });
        await syncStudyItemsBySubject(ctx, subject._id);
      }
    }
  },
});

function getDhakaDayBucket(timestamp: number) {
  // Dhaka is UTC+6
  const dhakaOffset = 6 * 60 * 60 * 1000;
  const dhakaTime = new Date(timestamp + dhakaOffset);
  dhakaTime.setUTCHours(0, 0, 0, 0);
  return dhakaTime.getTime() - dhakaOffset;
}

export const backfillStudyItemSearchText = mutation({
  args: {
    cursor: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const currentVersionSetting = await ctx.db
      .query("settings")
      .withIndex("by_key", (q) => q.eq("key", STUDY_ITEM_SEARCH_VERSION_SETTING_KEY))
      .unique();

    if (
      !args.cursor &&
      currentVersionSetting?.value === STUDY_ITEM_SEARCH_TEXT_VERSION
    ) {
      return {
        syncedCount: 0,
        continueCursor: null,
        isDone: true,
      };
    }

    const page = await ctx.db
      .query("studyItems")
      .order("asc")
      .paginate({
        numItems: STUDY_ITEM_SEARCH_BACKFILL_BATCH_SIZE,
        cursor: args.cursor ?? null,
      });

    for (const item of page.page) {
      await syncStudyItemPresentation(ctx, item._id);
    }

    if (page.isDone) {
      if (currentVersionSetting) {
        await ctx.db.patch(currentVersionSetting._id, {
          value: STUDY_ITEM_SEARCH_TEXT_VERSION,
        });
      } else {
        await ctx.db.insert("settings", {
          key: STUDY_ITEM_SEARCH_VERSION_SETTING_KEY,
          value: STUDY_ITEM_SEARCH_TEXT_VERSION,
        });
      }
    }

    return {
      syncedCount: page.page.length,
      continueCursor: page.isDone ? null : page.continueCursor,
      isDone: page.isDone,
    };
  },
});

export const createTodoTask = mutation({
  args: {
    date: v.number(),
    studyItemId: v.id("studyItems"),
    startTimeMinutes: v.number(),
    durationMinutes: v.number(),
    source: v.union(v.literal("manual"), v.literal("ai_accepted")),
  },
  handler: async (ctx, args) => {
    if (!Number.isInteger(args.date) || getDhakaDayBucket(args.date) !== args.date) {
      throw new Error("Date must be a valid Dhaka day bucket");
    }

    if (
      !Number.isInteger(args.startTimeMinutes) ||
      args.startTimeMinutes < 0 ||
      args.startTimeMinutes > 1439 ||
      args.startTimeMinutes % 15 !== 0
    ) {
      throw new Error("Start time must be in 15-minute steps");
    }

    if (!TODO_DURATION_MINUTES.includes(args.durationMinutes)) {
      throw new Error("Duration must be one of the preset values");
    }

    if (args.startTimeMinutes + args.durationMinutes > 1440) {
      throw new Error("Todo task must end within the selected day");
    }

    const studyItem = await ctx.db.get(args.studyItemId);
    if (!studyItem) {
      throw new Error("Study item not found");
    }

    if (studyItem.isCompleted) {
      throw new Error("Completed study items cannot be scheduled");
    }

    const existingTodoTask = await ctx.db
      .query("todoTasks")
      .withIndex("by_date_and_studyItemId", (q) =>
        q.eq("date", args.date).eq("studyItemId", args.studyItemId),
      )
      .unique();

    if (existingTodoTask) {
      throw new Error("This study item is already scheduled for that day");
    }

    return await ctx.db.insert("todoTasks", args);
  },
});

// ── Toggle a studyItem completion ────────────────────────────────
export const toggleStudyItemCompletion = mutation({
  args: { studyItemId: v.id("studyItems") },
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.studyItemId);
    if (!item) throw new Error("StudyItem not found");
    
    const newIsCompleted = !item.isCompleted;
    const now = Date.now();
    const dayBucket = getDhakaDayBucket(now);

    await ctx.db.patch(args.studyItemId, {
      isCompleted: newIsCompleted,
      lastStudiedAt: now,
    });

    if (newIsCompleted) {
      // Fetch ancestry for logging
      const subject = await ctx.db.get(item.subjectId);
      const chapter = await ctx.db.get(item.chapterId);
      const concept = item.conceptId ? await ctx.db.get(item.conceptId) : null;

      if (!subject || !chapter) throw new Error("Incomplete ancestry for studyItem");

      // Insert 'completed' Log
      await ctx.db.insert("studyLogs", {
        eventType: "study_item_completed",
        loggedAt: now,
        dayBucket,
        subjectId: item.subjectId,
        chapterId: item.chapterId,
        conceptId: item.conceptId,
        studyItemId: item._id,
        trackerType: item.type,
        minutesSpent: item.estimatedMinutes,
        originalMinutesSpent: item.estimatedMinutes,
        minutesSource: "estimated_tracker",
        isEditable: true,
        titleSnapshot: item.title,
        subjectNameSnapshot: subject.name,
        chapterNameSnapshot: chapter.name,
        conceptNameSnapshot: concept?.name,
      });

      // Auto-unlock logic for Concepts
      if (item.conceptId) {
        const conceptItems = await ctx.db
          .query("studyItems")
          .withIndex("by_concept", (q) => q.eq("conceptId", item.conceptId))
          .collect();
        
        const allDone = conceptItems.every(si => si.isCompleted);
        
        if (allDone) {
          const conceptRecord = await ctx.db.get(item.conceptId);
          if (conceptRecord && conceptRecord.nextReviewAt === undefined) {
            await ctx.db.patch(item.conceptId, {
              repetitionLevel: 0,
              nextReviewAt: Date.now() + 86400000, // 1 day
            });
          }
        }
      }
    } else {
      // Unchecked: Delete all logs related to this study item
      const logs = await ctx.db
        .query("studyLogs")
        .withIndex("by_studyItemId_and_loggedAt", (q) => q.eq("studyItemId", args.studyItemId))
        .collect();
      
      for (const log of logs) {
        await ctx.db.delete(log._id);
      }
    }
  },
});

// ── Review a concept (Spaced Repetition) ─────────────────────────
export const reviewConcept = mutation({
  args: {
    conceptId: v.id("concepts"),
    rating: v.union(v.literal("hard"), v.literal("medium"), v.literal("easy")),
  },
  handler: async (ctx, args) => {
    const concept = await ctx.db.get(args.conceptId);
    if (!concept) throw new Error("Concept not found");

    let level = concept.repetitionLevel ?? 0;
    
    if (args.rating === "hard") {
      level = Math.max(0, level - 1);
    } else if (args.rating === "medium") {
      level += 1;
    } else if (args.rating === "easy") {
      level += 2;
    }

    // Bound level to [0, 5]
    level = Math.min(Math.max(0, level), 5);
    
    const intervals = [1, 3, 7, 14, 30, 60]; // days
    const daysToAdd = intervals[level];
    
    const now = Date.now();
    await ctx.db.patch(args.conceptId, {
      repetitionLevel: level,
      nextReviewAt: now + (daysToAdd * 86400000),
      lastReviewedAt: now,
      reviewCount: (concept.reviewCount || 0) + 1,
    });

    // Logging
    const chapter = await ctx.db.get(concept.chapterId);
    if (!chapter) throw new Error("Chapter not found for concept");
    const subject = await ctx.db.get(chapter.subjectId);
    if (!subject) throw new Error("Subject not found for chapter");

    const settings = await ctx.db
      .query("settings")
      .withIndex("by_key", (q) => q.eq("key", "defaultRevisionMinutes"))
      .unique();
    const defaultRevisionMinutes = (settings?.value as number) ?? 10;

    await ctx.db.insert("studyLogs", {
      eventType: "concept_review",
      loggedAt: now,
      dayBucket: getDhakaDayBucket(now),
      subjectId: chapter.subjectId,
      chapterId: concept.chapterId,
      conceptId: concept._id,
      minutesSpent: defaultRevisionMinutes,
      originalMinutesSpent: defaultRevisionMinutes,
      minutesSource: "default_revision",
      rating: args.rating,
      isEditable: true,
      titleSnapshot: concept.name,
      subjectNameSnapshot: subject.name,
      chapterNameSnapshot: chapter.name,
      conceptNameSnapshot: concept.name,
    });
  },
});

// ── Reset concept progress ───────────────────────────────────────
export const resetConceptProgress = mutation({
  args: { conceptId: v.id("concepts") },
  handler: async (ctx, args) => {
    // 1. Reset Concept SR fields
    await ctx.db.patch(args.conceptId, {
      reviewCount: undefined,
      lastReviewedAt: undefined,
      nextReviewAt: undefined,
      repetitionLevel: undefined,
    });

    // 2. Reset associated StudyItems and delete their logs
    const studyItems = await ctx.db
      .query("studyItems")
      .withIndex("by_concept", (q) => q.eq("conceptId", args.conceptId))
      .collect();

    for (const item of studyItems) {
      // Delete logs for this item
      const logs = await ctx.db.query("studyLogs")
        .withIndex("by_studyItemId_and_loggedAt", q => q.eq("studyItemId", item._id))
        .collect();
      for (const log of logs) await ctx.db.delete(log._id);

      await ctx.db.patch(item._id, {
        isCompleted: false,
        completionScore: undefined,
        lastStudiedAt: undefined,
        nextReviewAt: undefined,
        repetitionLevel: undefined,
        easeFactor: undefined,
        weaknessScore: undefined,
      });
    }

    // 3. Delete revision logs for this concept
    const revisionLogs = await ctx.db.query("studyLogs")
      .withIndex("by_conceptId_and_loggedAt", q => q.eq("conceptId", args.conceptId))
      .collect();
    for (const log of revisionLogs) await ctx.db.delete(log._id);
  },
});

// ── Reschedule a concept review ──────────────────────────────────
export const rescheduleConceptReview = mutation({
  args: {
    conceptId: v.id("concepts"),
    newNextReviewAt: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.conceptId, {
      nextReviewAt: args.newNextReviewAt,
    });
  },
});

// ── MIGRATION: Clear old data & seed fresh ───────────────────────
// Clears all old-schema documents and seeds Chemistry with 5 chapters.
// Run once from the Convex dashboard or a temporary button.
export const migrateAndSeed = mutation({
  args: {},
  handler: async (ctx) => {
    // 1. Delete all studyItems
    const studyItems = await ctx.db.query("studyItems").take(500);
    for (const item of studyItems) {
      await ctx.db.delete(item._id);
    }

    // 2. Delete all concepts
    const concepts = await ctx.db.query("concepts").take(500);
    for (const concept of concepts) {
      await ctx.db.delete(concept._id);
    }

    // 3. Delete all chapters
    const chapters = await ctx.db.query("chapters").take(500);
    for (const chapter of chapters) {
      await ctx.db.delete(chapter._id);
    }

    // 4. Delete all subjects (old schema-incompatible docs)
    const subjects = await ctx.db.query("subjects").take(500);
    for (const subject of subjects) {
      await ctx.db.delete(subject._id);
    }

    // 5. Delete all studyLogs
    const logs = await ctx.db.query("studyLogs").take(500);
    for (const log of logs) {
      await ctx.db.delete(log._id);
    }

    // 6. Delete all plannerSessions
    const sessions = await ctx.db.query("plannerSessions").take(500);
    for (const session of sessions) {
      await ctx.db.delete(session._id);
    }

    // 7. Delete all todoTasks
    const todoTasks = await ctx.db.query("todoTasks").take(500);
    for (const todoTask of todoTasks) {
      await ctx.db.delete(todoTask._id);
    }

    // 8. Seed Settings
    await ctx.db.insert("settings", {
      key: "defaultRevisionMinutes",
      value: 15,
    });

    // ── Seed Chemistry ─────────────────────────────────────────
    const chemId = await ctx.db.insert("subjects", {
      name: "Chemistry",
      slug: "chemistry",
      icon: "science",
      color: "green",
      order: 1,
      chapterTrackers: [
        { key: "mcq", label: "MCQ", avgMinutes: 30 },
        { key: "board", label: "বোর্ড প্রশ্ন", avgMinutes: 45 },
      ],
      conceptTrackers: [
        { key: "class", label: "ক্লাস নোট", avgMinutes: 20 },
        { key: "book", label: "বই", avgMinutes: 25 },
      ],
    });

    await ctx.db.insert("chapters", {
      subjectId: chemId,
      name: "অধ্যায় ১: ল্যাবরেটরির নিরাপদ ব্যবহার",
      slug: "safe-use-of-laboratory",
      order: 1,
      inNextTerm: false,
    });

    await ctx.db.insert("chapters", {
      subjectId: chemId,
      name: "অধ্যায় ২: গুণগত রসায়ন",
      slug: "qualitative-chemistry",
      order: 2,
      inNextTerm: false,
    });

    await ctx.db.insert("chapters", {
      subjectId: chemId,
      name: "অধ্যায় ৩: মৌলের পর্যায়বৃত্ত ধর্ম ও রাসায়নিক বন্ধন",
      slug: "periodic-properties-and-bonding",
      order: 3,
      inNextTerm: false,
    });

    await ctx.db.insert("chapters", {
      subjectId: chemId,
      name: "অধ্যায় ৪: রাসায়নিক পরিবর্তন",
      slug: "chemical-change",
      order: 4,
      inNextTerm: true,
    });

    await ctx.db.insert("chapters", {
      subjectId: chemId,
      name: "অধ্যায় ৫: কর্মমুখী রসায়ন",
      slug: "vocational-chemistry",
      order: 5,
      inNextTerm: true,
    });

    return chemId;
  },
});
// ── Seed Chemistry Concepts ─────────────────────────────────────
export const seedChemistryConcepts = mutation({
  args: {},
  handler: async (ctx) => {
    const chemistry = await ctx.db
      .query("subjects")
      .withIndex("by_slug", (q) => q.eq("slug", "chemistry"))
      .unique();

    if (!chemistry) throw new Error("Chemistry subject not found. Run migrateAndSeed first.");

    const chapters = await ctx.db
      .query("chapters")
      .withIndex("by_subject", (q) => q.eq("subjectId", chemistry._id))
      .collect();

    const conceptData: Record<string, string[]> = {
      "safe-use-of-laboratory": [
        "ল্যাবরেটরির ব্যবহার বিধি",
        "ল্যাবরেটরিতে ব্যালেন্স ব্যবহার ও পরিমাণ কৌশল",
        "ল্যাবরেটরিতে বিভিন্ন পরীক্ষায় তাপ দেওয়ার কৌশল, বিশ্লেষণ পদ্ধতি ও হ্যাজার্ড সিম্বল",
      ],
      "qualitative-chemistry": [
        "পরমাণু ও পরমাণু মডেল",
        "কোয়ান্টাম সংখ্যা ও ইলেকট্রন বিন্যাস",
        "তড়িৎ চুম্বকীয় বর্ণালি",
        "দ্রাব্যতা, দ্রাব্যতা নীতি ও দ্রাব্যতা গুণফল",
        "শিখা পরীক্ষা ও আয়ন শনাক্তকরণ",
      ],
      "periodic-properties-and-bonding": [
        "পর্যায় সারণি ও বিভিন্ন মৌলের অবস্থান",
        "মৌলের পর্যায়বৃত্ত ধর্ম",
        "রাসায়নিক বন্ধন",
      ],
      "chemical-change": [
        "রাসায়নিক বিক্রিয়া, বিক্রিয়ার হার ও সক্রিয়ণ শক্তি",
        "রাসায়নিক সাম্যাবস্থা",
        "আয়নিক গুণফল, বাফার দ্রবণ, pH",
        "বিক্রিয়া তাপ",
      ],
      "vocational-chemistry": [
        "খাদ্য নিরাপত্তা ও খাদ্য সংরক্ষণ",
        "সাসপেনশন ও কোয়াগুলেশন",
        "টয়লেট্রিজ ও পারফিউমারি",
        "ভিনেগার ও ভিনেগারের ক্রিয়া কৌশল",
      ],
    };

    for (const chapter of chapters) {
      const concepts = conceptData[chapter.slug];
      if (concepts) {
        // Clear existing concepts for this chapter to avoid duplicates if re-run
        const existingConcepts = await ctx.db
          .query("concepts")
          .withIndex("by_chapter", (q) => q.eq("chapterId", chapter._id))
          .collect();
        for (const ec of existingConcepts) {
          await ctx.db.delete(ec._id);
        }

        // Insert new concepts
        for (let i = 0; i < concepts.length; i++) {
          await ctx.db.insert("concepts", {
            chapterId: chapter._id,
            name: concepts[i],
            order: i + 1,
          });
        }
      }
    }
  },
});


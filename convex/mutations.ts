import { mutation, type MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { v } from "convex/values";
import {
  buildStudyItemSearchArtifacts,
  STUDY_ITEM_SEARCH_TEXT_VERSION,
} from "./studyItemSearch";
import {
  buildPlannerCandidateIdentity,
  buildPlannerSelection,
  PLANNER_SUGGESTION_KIND,
  ruleBasedPlannerCommentParser,
  type PlannerCandidate,
} from "./planner";
import {
  assertCanAccessOwnedDocument,
  filterOwnedDocuments,
  requireCurrentUser,
  type CurrentUser,
} from "./auth";

const TODO_DURATION_MINUTES = Array.from({ length: 48 }, (_, index) => (index + 1) * 15);
const STUDY_ITEM_SEARCH_VERSION_SETTING_KEY = "study_item_search_text_version";
const STUDY_ITEM_SEARCH_BACKFILL_BATCH_SIZE = 64;
const requireCurrentOwner = requireCurrentUser;

async function getOwnedSubjectOrThrow(
  ctx: MutationCtx,
  currentUser: CurrentUser,
  subjectId: Id<"subjects">,
) {
  const subject = await ctx.db.get(subjectId);
  if (!subject) {
    throw new Error("Subject not found");
  }
  assertCanAccessOwnedDocument(currentUser, subject);
  return subject;
}

async function getOwnedChapterOrThrow(
  ctx: MutationCtx,
  currentUser: CurrentUser,
  chapterId: Id<"chapters">,
) {
  const chapter = await ctx.db.get(chapterId);
  if (!chapter) {
    throw new Error("Chapter not found");
  }
  assertCanAccessOwnedDocument(currentUser, chapter);
  return chapter;
}

async function getOwnedConceptOrThrow(
  ctx: MutationCtx,
  currentUser: CurrentUser,
  conceptId: Id<"concepts">,
) {
  const concept = await ctx.db.get(conceptId);
  if (!concept) {
    throw new Error("Concept not found");
  }
  assertCanAccessOwnedDocument(currentUser, concept);
  return concept;
}

async function getOwnedStudyItemOrThrow(
  ctx: MutationCtx,
  currentUser: CurrentUser,
  studyItemId: Id<"studyItems">,
) {
  const studyItem = await ctx.db.get(studyItemId);
  if (!studyItem) {
    throw new Error("StudyItem not found");
  }
  assertCanAccessOwnedDocument(currentUser, studyItem);
  return studyItem;
}

async function getOwnedStudyLogOrThrow(
  ctx: MutationCtx,
  currentUser: CurrentUser,
  logId: Id<"studyLogs">,
) {
  const log = await ctx.db.get(logId);
  if (!log) {
    throw new Error("Log not found");
  }
  assertCanAccessOwnedDocument(currentUser, log);
  return log;
}

async function getOwnedPlannerSuggestionOrThrow(
  ctx: MutationCtx,
  currentUser: CurrentUser,
  suggestionId: Id<"plannerSuggestions">,
) {
  const suggestion = await ctx.db.get(suggestionId);
  if (!suggestion) {
    throw new Error("Suggestion not found");
  }
  assertCanAccessOwnedDocument(currentUser, suggestion);
  return suggestion;
}

async function getOwnedTodoTaskOrThrow(
  ctx: MutationCtx,
  currentUser: CurrentUser,
  todoTaskId: Id<"todoTasks">,
) {
  const todoTask = await ctx.db.get(todoTaskId);
  if (!todoTask) {
    throw new Error("Todo task not found");
  }
  assertCanAccessOwnedDocument(currentUser, todoTask);
  return todoTask;
}

async function getOwnedWeeklyTargetOrThrow(
  ctx: MutationCtx,
  currentUser: CurrentUser,
  weeklyTargetId: Id<"weeklyTargets">,
) {
  const weeklyTarget = await ctx.db.get(weeklyTargetId);
  if (!weeklyTarget) {
    throw new Error("Weekly target not found");
  }
  assertCanAccessOwnedDocument(currentUser, weeklyTarget);
  return weeklyTarget;
}

async function getOwnedSettingByKey(
  ctx: MutationCtx,
  currentUser: CurrentUser,
  key: string,
) {
  const settings = filterOwnedDocuments(
    currentUser,
    await ctx.db
      .query("settings")
      .withIndex("by_key", (q) => q.eq("key", key))
      .collect(),
  );
  return settings[0] ?? null;
}

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
  currentUser: CurrentUser,
  studyItemId: Id<"studyItems">,
) {
  const todoTasks = filterOwnedDocuments(currentUser, await ctx.db
    .query("todoTasks")
    .withIndex("by_studyItemId", (q) => q.eq("studyItemId", studyItemId))
    .collect());

  for (const todoTask of todoTasks) {
    await ctx.db.delete(todoTask._id);
  }
}

async function removeTodoTasksForConcept(
  ctx: MutationCtx,
  currentUser: CurrentUser,
  conceptId: Id<"concepts">,
) {
  const todoTasks = filterOwnedDocuments(currentUser, await ctx.db
    .query("todoTasks")
    .withIndex("by_conceptId", (q) => q.eq("conceptId", conceptId))
    .collect());

  for (const todoTask of todoTasks) {
    await ctx.db.delete(todoTask._id);
  }
}

async function getNextTodoSortOrder(
  ctx: MutationCtx,
  currentUser: CurrentUser,
  date: number,
) {
  const todoTasks = filterOwnedDocuments(currentUser, await ctx.db
    .query("todoTasks")
    .withIndex("by_date", (q) => q.eq("date", date))
    .collect());

  return (
    todoTasks.reduce((max, todoTask) => {
      const sortOrder =
        todoTask.sortOrder ??
        (todoTask.startTimeMinutes !== undefined
          ? todoTask.startTimeMinutes
          : todoTask._creationTime);
      return Math.max(max, sortOrder);
    }, -1) + 1
  );
}

function validateTodoSchedule(args: {
  startTimeMinutes?: number;
  durationMinutes: number;
}) {
  if (!TODO_DURATION_MINUTES.includes(args.durationMinutes)) {
    throw new Error("Duration must be one of the preset values");
  }

  if (args.startTimeMinutes === undefined) {
    return;
  }

  if (
    !Number.isInteger(args.startTimeMinutes) ||
    args.startTimeMinutes < 0 ||
    args.startTimeMinutes > 1439 ||
    args.startTimeMinutes % 15 !== 0
  ) {
    throw new Error("Start time must be in 15-minute steps");
  }

  if (args.startTimeMinutes + args.durationMinutes > 1440) {
    throw new Error("Todo task must end within the selected day");
  }
}

function normalizeCustomTodoTitle(title: string) {
  const normalizedTitle = title.replace(/\s+/g, " ").trim();
  if (normalizedTitle.length === 0) {
    throw new Error("Custom todo title is required");
  }

  return normalizedTitle;
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

async function ensureChapterStudyItemsForSubject(
  ctx: MutationCtx,
  currentUser: CurrentUser,
  subjectId: Id<"subjects">,
) {
  const subject = await getOwnedSubjectOrThrow(ctx, currentUser, subjectId);

  const chapters = filterOwnedDocuments(currentUser, await ctx.db
    .query("chapters")
    .withIndex("by_subject", (q) => q.eq("subjectId", subjectId))
    .collect());

  for (const chapter of chapters) {
    const existingItems = filterOwnedDocuments(currentUser, await ctx.db
      .query("studyItems")
      .withIndex("by_chapter", (q) => q.eq("chapterId", chapter._id))
      .collect());

    const existingChapterItems = existingItems.filter(
      (studyItem) => studyItem.conceptId === undefined,
    );

    for (const tracker of subject.chapterTrackers) {
      const existingItem = existingChapterItems.find(
        (studyItem) => studyItem.type === tracker.key,
      );

      if (!existingItem) {
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
          userId: currentUser._id,
          subjectId,
          chapterId: chapter._id,
          type: tracker.key,
          title,
          searchText,
          estimatedMinutes: tracker.avgMinutes,
          isCompleted: false,
        });
      } else {
        await syncStudyItemPresentation(ctx, existingItem._id);
      }
    }
  }
}

async function ensureConceptStudyItemsForChapter(
  ctx: MutationCtx,
  currentUser: CurrentUser,
  chapterId: Id<"chapters">,
) {
  const chapter = await getOwnedChapterOrThrow(ctx, currentUser, chapterId);
  const subject = await getOwnedSubjectOrThrow(ctx, currentUser, chapter.subjectId);

  const concepts = filterOwnedDocuments(currentUser, await ctx.db
    .query("concepts")
    .withIndex("by_chapter", (q) => q.eq("chapterId", chapterId))
    .collect());

  for (const concept of concepts) {
    const existingItems = filterOwnedDocuments(currentUser, await ctx.db
      .query("studyItems")
      .withIndex("by_concept", (q) => q.eq("conceptId", concept._id))
      .collect());

    for (const tracker of subject.conceptTrackers) {
      const existingItem = existingItems.find(
        (studyItem) => studyItem.type === tracker.key,
      );

      if (!existingItem) {
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
          userId: currentUser._id,
          subjectId: subject._id,
          chapterId,
          conceptId: concept._id,
          type: tracker.key,
          title,
          searchText,
          estimatedMinutes: tracker.avgMinutes,
          isCompleted: false,
        });
      } else {
        await syncStudyItemPresentation(ctx, existingItem._id);
      }
    }
  }
}

async function ensurePlannerStudyItems(
  ctx: MutationCtx,
  currentUser: CurrentUser,
) {
  const chapters = filterOwnedDocuments(currentUser, await ctx.db.query("chapters").collect());
  const nextTermChapters = chapters.filter((chapter) => chapter.inNextTerm);
  const subjectIds = new Set(nextTermChapters.map((chapter) => chapter.subjectId));

  for (const subjectId of subjectIds) {
    await ensureChapterStudyItemsForSubject(ctx, currentUser, subjectId);
  }

  for (const chapter of nextTermChapters) {
    await ensureConceptStudyItemsForChapter(ctx, currentUser, chapter._id);
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
    const currentUser = await requireCurrentUser(ctx);
    const { slug, ...rest } = args;
    if (slug) {
      const existingSubject = await ctx.db
        .query("subjects")
        .withIndex("by_userId_and_slug", (q) =>
          q.eq("userId", currentUser._id).eq("slug", slug),
        )
        .unique();
      if (existingSubject) {
        throw new Error("A subject with this slug already exists");
      }
    }
    const subjectId = await ctx.db.insert("subjects", {
      userId: currentUser._id,
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
    examWeight: v.optional(v.number()),
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
    const currentUser = await requireCurrentUser(ctx);
    const { subjectId, ...updates } = args;

    const oldSubject = await getOwnedSubjectOrThrow(ctx, currentUser, subjectId);

    if (updates.slug && updates.slug !== oldSubject.slug) {
      const conflictingSubject = await ctx.db
        .query("subjects")
        .withIndex("by_userId_and_slug", (q) =>
          q.eq("userId", currentUser._id).eq("slug", updates.slug!),
        )
        .unique();
      if (conflictingSubject && conflictingSubject._id !== subjectId) {
        throw new Error("A subject with this slug already exists");
      }
    }

    if (updates.chapterTrackers) {
      const newKeys = new Set(updates.chapterTrackers.map(t => t.key));
      const removedKeys = oldSubject.chapterTrackers.filter(t => !newKeys.has(t.key)).map(t => t.key);

      for (const key of removedKeys) {
        const studyItems = filterOwnedDocuments(
          currentUser,
          await ctx.db.query("studyItems")
            .withIndex("by_subject", q => q.eq("subjectId", subjectId))
            .collect(),
        ).filter((item) => item.type === key);

        for (const item of studyItems) {
          // Delete logs for this item
          const logs = await ctx.db.query("studyLogs")
            .withIndex("by_studyItemId_and_loggedAt", q => q.eq("studyItemId", item._id))
            .collect();
          for (const log of logs) await ctx.db.delete(log._id);

          await removeTodoTasksForStudyItem(ctx, currentUser, item._id);
          await ctx.db.delete(item._id);
        }
      }
    }

    if (updates.conceptTrackers) {
      const newKeys = new Set(updates.conceptTrackers.map(t => t.key));
      const removedKeys = oldSubject.conceptTrackers.filter(t => !newKeys.has(t.key)).map(t => t.key);

      for (const key of removedKeys) {
        const studyItems = filterOwnedDocuments(
          currentUser,
          await ctx.db.query("studyItems")
            .withIndex("by_subject", q => q.eq("subjectId", subjectId))
            .collect(),
        ).filter((item) => item.type === key);

        for (const item of studyItems) {
          // Delete logs for this item
          const logs = await ctx.db.query("studyLogs")
            .withIndex("by_studyItemId_and_loggedAt", q => q.eq("studyItemId", item._id))
            .collect();
          for (const log of logs) await ctx.db.delete(log._id);

          await removeTodoTasksForStudyItem(ctx, currentUser, item._id);
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
    const currentUser = await requireCurrentUser(ctx);
    const log = await getOwnedStudyLogOrThrow(ctx, currentUser, args.logId);
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
    const currentUser = await requireCurrentUser(ctx);
    const chapter = await getOwnedChapterOrThrow(ctx, currentUser, args.chapterId);
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
    const currentUser = await requireCurrentUser(ctx);
    await getOwnedSubjectOrThrow(ctx, currentUser, args.subjectId);
    const { slug, ...rest } = args;
    if (slug) {
      const siblingChapters = filterOwnedDocuments(
        currentUser,
        await ctx.db
          .query("chapters")
          .withIndex("by_subject", (q) => q.eq("subjectId", args.subjectId))
          .collect(),
      );
      if (siblingChapters.some((chapter) => chapter.slug === slug)) {
        throw new Error("A chapter with this slug already exists");
      }
    }
    const chapterId = await ctx.db.insert("chapters", {
      userId: currentUser._id,
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
    const currentUser = await requireCurrentUser(ctx);
    const { chapterId, ...updates } = args;
    const existingChapter = await getOwnedChapterOrThrow(ctx, currentUser, chapterId);
    if (updates.slug && updates.slug !== existingChapter.slug) {
      const siblingChapters = filterOwnedDocuments(
        currentUser,
        await ctx.db
          .query("chapters")
          .withIndex("by_subject", (q) => q.eq("subjectId", existingChapter.subjectId))
          .collect(),
      );
      if (
        siblingChapters.some(
          (chapter) => chapter.slug === updates.slug && chapter._id !== chapterId,
        )
      ) {
        throw new Error("A chapter with this slug already exists");
      }
    }
    await ctx.db.patch(chapterId, updates);
    await syncStudyItemsByChapter(ctx, chapterId);
  },
});

// ── Delete a chapter ─────────────────────────────────────────────
export const deleteChapter = mutation({
  args: { chapterId: v.id("chapters") },
  handler: async (ctx, args) => {
    const currentUser = await requireCurrentUser(ctx);
    await getOwnedChapterOrThrow(ctx, currentUser, args.chapterId);
    // Also delete associated concepts and studyItems
    const concepts = filterOwnedDocuments(currentUser, await ctx.db
      .query("concepts")
      .withIndex("by_chapter", (q) => q.eq("chapterId", args.chapterId))
      .collect());
    
    for (const concept of concepts) {
      const studyItems = filterOwnedDocuments(currentUser, await ctx.db
        .query("studyItems")
        .withIndex("by_concept", (q) => q.eq("conceptId", concept._id))
        .collect());
      for (const item of studyItems) {
        // Delete logs for this item
        const logs = await ctx.db.query("studyLogs")
          .withIndex("by_studyItemId_and_loggedAt", q => q.eq("studyItemId", item._id))
          .collect();
        for (const log of logs) await ctx.db.delete(log._id);

        await removeTodoTasksForStudyItem(ctx, currentUser, item._id);
        await ctx.db.delete(item._id);
      }

      // Delete revision logs for this concept
      const revisionLogs = await ctx.db.query("studyLogs")
        .withIndex("by_conceptId_and_loggedAt", q => q.eq("conceptId", concept._id))
        .collect();
      for (const log of revisionLogs) await ctx.db.delete(log._id);
      await removeTodoTasksForConcept(ctx, currentUser, concept._id);

      const conceptWeeklyTarget = await ctx.db
        .query("weeklyTargets")
        .withIndex("by_conceptId", (q) => q.eq("conceptId", concept._id))
        .unique();
      if (conceptWeeklyTarget) {
        await ctx.db.delete(conceptWeeklyTarget._id);
      }

      await ctx.db.delete(concept._id);
    }

    const chapterWeeklyTargets = await ctx.db
      .query("weeklyTargets")
      .withIndex("by_chapterId", (q) => q.eq("chapterId", args.chapterId))
      .collect();
    for (const chapterWeeklyTarget of chapterWeeklyTargets) {
      await ctx.db.delete(chapterWeeklyTarget._id);
    }

    const coachingProgress = await ctx.db
      .query("coachingProgress")
      .withIndex("by_chapterId", (q) => q.eq("chapterId", args.chapterId))
      .unique();
    if (coachingProgress) {
      await ctx.db.delete(coachingProgress._id);
    }

    const chapterItems = filterOwnedDocuments(currentUser, await ctx.db
      .query("studyItems")
      .withIndex("by_chapter", (q) => q.eq("chapterId", args.chapterId))
      .collect());
    for (const item of chapterItems) {
      // Delete logs for this item
      const logs = await ctx.db.query("studyLogs")
        .withIndex("by_studyItemId_and_loggedAt", q => q.eq("studyItemId", item._id))
        .collect();
      for (const log of logs) await ctx.db.delete(log._id);

      await removeTodoTasksForStudyItem(ctx, currentUser, item._id);
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
    const currentUser = await requireCurrentUser(ctx);
    await getOwnedChapterOrThrow(ctx, currentUser, args.chapterId);
    return await ctx.db.insert("concepts", {
      userId: currentUser._id,
      ...args,
    });
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
    const currentUser = await requireCurrentUser(ctx);
    const { conceptId, ...updates } = args;
    await getOwnedConceptOrThrow(ctx, currentUser, conceptId);
    
    // Update the concept itself
    await ctx.db.patch(conceptId, updates);

    // Also update titles of associated studyItems to keep them in sync
    // Pattern: "${concept.name} — ${tracker.label}"
    const concept = await getOwnedConceptOrThrow(ctx, currentUser, conceptId);
    const chapter = await getOwnedChapterOrThrow(ctx, currentUser, concept.chapterId);
    const subject = await getOwnedSubjectOrThrow(ctx, currentUser, chapter.subjectId);

    const studyItems = filterOwnedDocuments(currentUser, await ctx.db
      .query("studyItems")
      .withIndex("by_concept", (q) => q.eq("conceptId", conceptId))
      .collect());

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
    const currentUser = await requireCurrentUser(ctx);
    await getOwnedConceptOrThrow(ctx, currentUser, args.conceptId);
    // Delete associated studyItems first and their logs
    const studyItems = filterOwnedDocuments(currentUser, await ctx.db
      .query("studyItems")
      .withIndex("by_concept", (q) => q.eq("conceptId", args.conceptId))
      .collect());
    
    for (const item of studyItems) {
      const logs = await ctx.db.query("studyLogs")
        .withIndex("by_studyItemId_and_loggedAt", q => q.eq("studyItemId", item._id))
        .collect();
      for (const log of logs) await ctx.db.delete(log._id);
      await removeTodoTasksForStudyItem(ctx, currentUser, item._id);
      await ctx.db.delete(item._id);
    }

    // Delete revision logs for this concept
    const revisionLogs = await ctx.db.query("studyLogs")
      .withIndex("by_conceptId_and_loggedAt", q => q.eq("conceptId", args.conceptId))
      .collect();
    for (const log of revisionLogs) await ctx.db.delete(log._id);
    await removeTodoTasksForConcept(ctx, currentUser, args.conceptId);

    const weeklyTarget = await ctx.db
      .query("weeklyTargets")
      .withIndex("by_conceptId", (q) => q.eq("conceptId", args.conceptId))
      .unique();
    if (weeklyTarget) {
      await ctx.db.delete(weeklyTarget._id);
    }

    await ctx.db.delete(args.conceptId);
  },
});

// ── Reset all studyItems and concept revisions for a chapter ──────
export const resetChapterProgress = mutation({
  args: { chapterId: v.id("chapters") },
  handler: async (ctx, args) => {
    const currentUser = await requireCurrentUser(ctx);
    await getOwnedChapterOrThrow(ctx, currentUser, args.chapterId);
    // 1. Reset all studyItems for this chapter
    const studyItems = filterOwnedDocuments(currentUser, await ctx.db
      .query("studyItems")
      .withIndex("by_chapter", (q) => q.eq("chapterId", args.chapterId))
      .collect());

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
    const concepts = filterOwnedDocuments(currentUser, await ctx.db
      .query("concepts")
      .withIndex("by_chapter", (q) => q.eq("chapterId", args.chapterId))
      .collect());

    for (const concept of concepts) {
      // Delete revision logs for this concept
      const revisionLogs = await ctx.db.query("studyLogs")
        .withIndex("by_conceptId_and_loggedAt", q => q.eq("conceptId", concept._id))
        .collect();
      for (const log of revisionLogs) await ctx.db.delete(log._id);
      await removeTodoTasksForConcept(ctx, currentUser, concept._id);

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
    const currentUser = await requireCurrentUser(ctx);
    return await ensureChapterStudyItemsForSubject(ctx, currentUser, args.subjectId);
  },
});

// ── Ensure concept-level studyItems exist (lazy creation) ────────
// Called when user first visits a chapter page
export const ensureConceptStudyItems = mutation({
  args: { chapterId: v.id("chapters") },
  handler: async (ctx, args) => {
    const currentUser = await requireCurrentUser(ctx);
    return await ensureConceptStudyItemsForChapter(ctx, currentUser, args.chapterId);
  },
});

// ── Fix subjects with non-ASCII tracker keys ────────────────────
export const fixInvalidTrackerKeys = mutation({
  args: {},
  handler: async (ctx) => {
    await requireCurrentOwner(ctx);
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
    const currentUser = await requireCurrentUser(ctx);
    const currentVersionSetting = await getOwnedSettingByKey(
      ctx,
      currentUser,
      STUDY_ITEM_SEARCH_VERSION_SETTING_KEY,
    );

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

    for (const item of filterOwnedDocuments(currentUser, page.page)) {
      await syncStudyItemPresentation(ctx, item._id);
    }

    if (page.isDone) {
      if (currentVersionSetting) {
        await ctx.db.patch(currentVersionSetting._id, {
          value: STUDY_ITEM_SEARCH_TEXT_VERSION,
        });
      } else {
        await ctx.db.insert("settings", {
          userId: currentUser._id,
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
    startTimeMinutes: v.optional(v.number()),
    durationMinutes: v.number(),
    source: v.union(v.literal("manual"), v.literal("ai_accepted")),
  },
  handler: async (ctx, args) => {
    const currentUser = await requireCurrentUser(ctx);
    if (!Number.isInteger(args.date) || getDhakaDayBucket(args.date) !== args.date) {
      throw new Error("Date must be a valid Dhaka day bucket");
    }

    validateTodoSchedule(args);

    const studyItem = await getOwnedStudyItemOrThrow(ctx, currentUser, args.studyItemId);

    if (studyItem.isCompleted) {
      throw new Error("Completed study items cannot be scheduled");
    }

    const existingTodoTask = filterOwnedDocuments(currentUser, await ctx.db
      .query("todoTasks")
      .withIndex("by_date_and_studyItemId", (q) =>
        q.eq("date", args.date).eq("studyItemId", args.studyItemId),
      )
      .collect())[0] ?? null;

    if (existingTodoTask) {
      throw new Error("This study item is already scheduled for that day");
    }

    return await ctx.db.insert("todoTasks", {
      userId: currentUser._id,
      ...args,
      kind: PLANNER_SUGGESTION_KIND.studyItem,
      sortOrder:
        args.startTimeMinutes ?? await getNextTodoSortOrder(ctx, currentUser, args.date),
    });
  },
});

export const createCustomTodoTask = mutation({
  args: {
    date: v.number(),
    title: v.string(),
    startTimeMinutes: v.optional(v.number()),
    durationMinutes: v.number(),
  },
  handler: async (ctx, args) => {
    const currentUser = await requireCurrentUser(ctx);
    if (!Number.isInteger(args.date) || getDhakaDayBucket(args.date) !== args.date) {
      throw new Error("Date must be a valid Dhaka day bucket");
    }

    validateTodoSchedule(args);
    const customTitle = normalizeCustomTodoTitle(args.title);

    return await ctx.db.insert("todoTasks", {
      userId: currentUser._id,
      date: args.date,
      kind: "custom",
      customTitle,
      isCompleted: false,
      startTimeMinutes: args.startTimeMinutes,
      durationMinutes: args.durationMinutes,
      source: "manual",
      sortOrder:
        args.startTimeMinutes ?? await getNextTodoSortOrder(ctx, currentUser, args.date),
    });
  },
});

export const updateTodoTaskSchedule = mutation({
  args: {
    todoTaskId: v.id("todoTasks"),
    startTimeMinutes: v.optional(v.number()),
    durationMinutes: v.number(),
  },
  handler: async (ctx, args) => {
    const currentUser = await requireCurrentUser(ctx);
    const todoTask = await getOwnedTodoTaskOrThrow(
      ctx,
      currentUser,
      args.todoTaskId,
    );

    validateTodoSchedule(args);

    await ctx.db.patch(todoTask._id, {
      startTimeMinutes: args.startTimeMinutes,
      durationMinutes: args.durationMinutes,
      sortOrder:
        args.startTimeMinutes ??
        todoTask.sortOrder ??
        await getNextTodoSortOrder(ctx, currentUser, todoTask.date),
    });

    return null;
  },
});

export const updateCustomTodoTask = mutation({
  args: {
    todoTaskId: v.id("todoTasks"),
    title: v.string(),
    startTimeMinutes: v.optional(v.number()),
    durationMinutes: v.number(),
  },
  handler: async (ctx, args) => {
    const currentUser = await requireCurrentUser(ctx);
    const todoTask = await getOwnedTodoTaskOrThrow(
      ctx,
      currentUser,
      args.todoTaskId,
    );

    if (todoTask.kind !== "custom") {
      throw new Error("Only custom todo tasks can update their title");
    }

    validateTodoSchedule(args);
    const customTitle = normalizeCustomTodoTitle(args.title);

    await ctx.db.patch(todoTask._id, {
      customTitle,
      startTimeMinutes: args.startTimeMinutes,
      durationMinutes: args.durationMinutes,
      sortOrder:
        args.startTimeMinutes ??
        todoTask.sortOrder ??
        await getNextTodoSortOrder(ctx, currentUser, todoTask.date),
    });

    return null;
  },
});

export const toggleCustomTodoTaskCompletion = mutation({
  args: {
    todoTaskId: v.id("todoTasks"),
  },
  handler: async (ctx, args) => {
    const currentUser = await requireCurrentUser(ctx);
    const todoTask = await getOwnedTodoTaskOrThrow(
      ctx,
      currentUser,
      args.todoTaskId,
    );

    if (todoTask.kind !== "custom") {
      throw new Error("Only custom todo tasks can be toggled here");
    }

    await ctx.db.patch(todoTask._id, {
      isCompleted: !(todoTask.isCompleted ?? false),
    });

    return null;
  },
});

export const deleteTodoTask = mutation({
  args: {
    todoTaskId: v.id("todoTasks"),
  },
  handler: async (ctx, args) => {
    const currentUser = await requireCurrentUser(ctx);
    const todoTask = await getOwnedTodoTaskOrThrow(
      ctx,
      currentUser,
      args.todoTaskId,
    );

    await ctx.db.delete(todoTask._id);

    return null;
  },
});

export const setPlannerSubjectPriority = mutation({
  args: {
    subjectId: v.id("subjects"),
    priority: v.union(v.literal("normal"), v.literal("important")),
  },
  handler: async (ctx, args) => {
    const currentUser = await requireCurrentUser(ctx);
    const subject = await getOwnedSubjectOrThrow(ctx, currentUser, args.subjectId);

    const existingPreference = filterOwnedDocuments(currentUser, await ctx.db
      .query("plannerSubjectPreferences")
      .withIndex("by_subjectId", (q) => q.eq("subjectId", args.subjectId))
      .collect())[0] ?? null;

    if (args.priority === "normal") {
      if (existingPreference) {
        await ctx.db.delete(existingPreference._id);
      }
      return null;
    }

    if (existingPreference) {
      await ctx.db.patch(existingPreference._id, { priority: args.priority });
      return existingPreference._id;
    }

    return await ctx.db.insert("plannerSubjectPreferences", {
      userId: currentUser._id,
      ...args,
    });
  },
});

export const setCoachingChapterProgress = mutation({
  args: {
    chapterId: v.id("chapters"),
    status: v.union(
      v.literal("not_started"),
      v.literal("running"),
      v.literal("finished"),
    ),
  },
  handler: async (ctx, args) => {
    const currentUser = await requireCurrentUser(ctx);
    const chapter = await getOwnedChapterOrThrow(ctx, currentUser, args.chapterId);

    const existingProgress = filterOwnedDocuments(currentUser, await ctx.db
      .query("coachingProgress")
      .withIndex("by_chapterId", (q) => q.eq("chapterId", args.chapterId))
      .collect())[0] ?? null;

    if (args.status === "not_started") {
      if (existingProgress) {
        await ctx.db.delete(existingProgress._id);
      }
      return null;
    }

    if (existingProgress) {
      await ctx.db.patch(existingProgress._id, { status: args.status });
      return existingProgress._id;
    }

    return await ctx.db.insert("coachingProgress", {
      userId: currentUser._id,
      ...args,
    });
  },
});

export const addWeeklyTarget = mutation({
  args: {
    kind: v.union(v.literal("chapter"), v.literal("concept")),
    chapterId: v.id("chapters"),
    conceptId: v.optional(v.id("concepts")),
  },
  handler: async (ctx, args) => {
    const currentUser = await requireCurrentUser(ctx);
    const chapter = await getOwnedChapterOrThrow(ctx, currentUser, args.chapterId);

    if (args.kind === "chapter") {
      const existingTargets = filterOwnedDocuments(currentUser, await ctx.db
        .query("weeklyTargets")
        .withIndex("by_chapterId", (q) => q.eq("chapterId", args.chapterId))
        .collect());
      const existingChapterTarget = existingTargets.find(
        (target) => target.kind === "chapter",
      );
      if (existingChapterTarget) {
        return existingChapterTarget._id;
      }

      return await ctx.db.insert("weeklyTargets", {
        userId: currentUser._id,
        kind: "chapter",
        subjectId: chapter.subjectId,
        chapterId: chapter._id,
      });
    }

    if (!args.conceptId) {
      throw new Error("Concept target requires a concept");
    }

    const concept = await getOwnedConceptOrThrow(ctx, currentUser, args.conceptId);
    if (concept.chapterId !== chapter._id) {
      throw new Error("Concept not found");
    }

    const existingTarget = filterOwnedDocuments(currentUser, await ctx.db
      .query("weeklyTargets")
      .withIndex("by_conceptId", (q) => q.eq("conceptId", args.conceptId))
      .collect())[0] ?? null;

    if (existingTarget) {
      return existingTarget._id;
    }

    return await ctx.db.insert("weeklyTargets", {
      userId: currentUser._id,
      kind: "concept",
      subjectId: chapter.subjectId,
      chapterId: chapter._id,
      conceptId: concept._id,
    });
  },
});

export const removeWeeklyTarget = mutation({
  args: { weeklyTargetId: v.id("weeklyTargets") },
  handler: async (ctx, args) => {
    const currentUser = await requireCurrentUser(ctx);
    await getOwnedWeeklyTargetOrThrow(ctx, currentUser, args.weeklyTargetId);
    await ctx.db.delete(args.weeklyTargetId);
  },
});

export const setDefaultRevisionMinutes = mutation({
  args: {
    minutes: v.number(),
  },
  handler: async (ctx, args) => {
    const currentUser = await requireCurrentUser(ctx);
    if (
      !Number.isInteger(args.minutes) ||
      args.minutes < 1 ||
      args.minutes > 600
    ) {
      throw new Error("Default revision minutes must be an integer from 1 to 600");
    }

    const existingSetting = await getOwnedSettingByKey(
      ctx,
      currentUser,
      "defaultRevisionMinutes",
    );

    if (existingSetting) {
      await ctx.db.patch(existingSetting._id, { value: args.minutes });
      return existingSetting._id;
    }

    return await ctx.db.insert("settings", {
      userId: currentUser._id,
      key: "defaultRevisionMinutes",
      value: args.minutes,
    });
  },
});

export const setDashboardTermDates = mutation({
  args: {
    termStartDate: v.number(),
    nextTermExamDate: v.number(),
  },
  handler: async (ctx, args) => {
    const currentUser = await requireCurrentUser(ctx);
    if (
      !Number.isInteger(args.termStartDate) ||
      getDhakaDayBucket(args.termStartDate) !== args.termStartDate
    ) {
      throw new Error("Term start date must be a valid Dhaka day bucket");
    }

    if (
      !Number.isInteger(args.nextTermExamDate) ||
      getDhakaDayBucket(args.nextTermExamDate) !== args.nextTermExamDate
    ) {
      throw new Error("Next-term exam date must be a valid Dhaka day bucket");
    }

    if (args.termStartDate >= args.nextTermExamDate) {
      throw new Error("Term start date must be before the next-term exam date");
    }

    const [existingTermStartDate, existingNextTermExamDate] = await Promise.all([
      getOwnedSettingByKey(ctx, currentUser, "termStartDate"),
      getOwnedSettingByKey(ctx, currentUser, "nextTermExamDate"),
    ]);

    if (existingTermStartDate) {
      await ctx.db.patch(existingTermStartDate._id, {
        value: args.termStartDate,
      });
    } else {
      await ctx.db.insert("settings", {
        userId: currentUser._id,
        key: "termStartDate",
        value: args.termStartDate,
      });
    }

    if (existingNextTermExamDate) {
      await ctx.db.patch(existingNextTermExamDate._id, {
        value: args.nextTermExamDate,
      });
      return existingNextTermExamDate._id;
    }

    return await ctx.db.insert("settings", {
      userId: currentUser._id,
      key: "nextTermExamDate",
      value: args.nextTermExamDate,
    });
  },
});

export const generatePlannerSuggestions = mutation({
  args: {
    date: v.number(),
    availableMinutes: v.number(),
    comment: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const currentUser = await requireCurrentUser(ctx);
    if (!Number.isInteger(args.date) || getDhakaDayBucket(args.date) !== args.date) {
      throw new Error("Date must be a valid Dhaka day bucket");
    }

    if (!Number.isFinite(args.availableMinutes) || args.availableMinutes <= 0) {
      throw new Error("Available minutes must be greater than zero");
    }

    await ensurePlannerStudyItems(ctx, currentUser);

    const [
      subjects,
      chapters,
      concepts,
      studyItems,
      plannerPreferences,
      weeklyTargets,
      coachingStatuses,
      todoTasks,
      existingSession,
      settings,
    ] = await Promise.all([
      filterOwnedDocuments(currentUser, await ctx.db.query("subjects").collect()),
      filterOwnedDocuments(currentUser, await ctx.db.query("chapters").collect()),
      filterOwnedDocuments(currentUser, await ctx.db.query("concepts").collect()),
      filterOwnedDocuments(currentUser, await ctx.db.query("studyItems").collect()),
      filterOwnedDocuments(currentUser, await ctx.db.query("plannerSubjectPreferences").collect()),
      filterOwnedDocuments(currentUser, await ctx.db.query("weeklyTargets").collect()),
      filterOwnedDocuments(currentUser, await ctx.db.query("coachingProgress").collect()),
      filterOwnedDocuments(currentUser, await ctx.db.query("todoTasks").withIndex("by_date", (q) => q.eq("date", args.date)).collect()),
      filterOwnedDocuments(currentUser, await ctx.db.query("plannerSessions").withIndex("by_date", (q) => q.eq("date", args.date)).collect())[0] ?? null,
      getOwnedSettingByKey(ctx, currentUser, "defaultRevisionMinutes"),
    ]);

    const defaultRevisionMinutes = (settings?.value as number) ?? 15;
    const nextTermChapters = chapters.filter((chapter) => chapter.inNextTerm);
    const nextTermChapterIds = new Set(nextTermChapters.map((chapter) => chapter._id));

    const chapterById = new Map(chapters.map((chapter) => [chapter._id, chapter]));
    const subjectById = new Map(subjects.map((subject) => [subject._id, subject]));
    const conceptsById = new Map(concepts.map((concept) => [concept._id, concept]));

    const studyItemsByChapter = new Map<Id<"chapters">, Doc<"studyItems">[]>();
    const studyItemsByConcept = new Map<Id<"concepts">, Doc<"studyItems">[]>();

    for (const studyItem of studyItems) {
      const chapterItems = studyItemsByChapter.get(studyItem.chapterId) ?? [];
      chapterItems.push(studyItem);
      studyItemsByChapter.set(studyItem.chapterId, chapterItems);

      if (studyItem.conceptId) {
        const conceptItems = studyItemsByConcept.get(studyItem.conceptId) ?? [];
        conceptItems.push(studyItem);
        studyItemsByConcept.set(studyItem.conceptId, conceptItems);
      }
    }

    const nextTermCompletionBySubject = new Map<Id<"subjects">, number>();
    for (const subject of subjects) {
      const subjectNextTermChapters = nextTermChapters.filter(
        (chapter) => chapter.subjectId === subject._id,
      );
      const subjectStudyItems = subjectNextTermChapters.flatMap(
        (chapter) => studyItemsByChapter.get(chapter._id) ?? [],
      );
      const completedCount = subjectStudyItems.filter((item) => item.isCompleted).length;
      nextTermCompletionBySubject.set(
        subject._id,
        subjectStudyItems.length === 0 ? 0 : completedCount / subjectStudyItems.length,
      );
    }

    const importantSubjectIds = new Set(
      plannerPreferences
        .filter((preference) => preference.priority === "important")
        .map((preference) => preference.subjectId),
    );

    const coachingStatusByChapter = new Map(
      coachingStatuses.map((status) => [status.chapterId, status.status]),
    );

    const activeChapterTargetIds = new Set<Id<"chapters">>();
    const activeConceptTargetIds = new Set<Id<"concepts">>();

    for (const weeklyTarget of weeklyTargets) {
      if (!nextTermChapterIds.has(weeklyTarget.chapterId)) {
        continue;
      }

      if (weeklyTarget.kind === "chapter") {
        const chapterItems = studyItemsByChapter.get(weeklyTarget.chapterId) ?? [];
        const isComplete =
          chapterItems.length > 0 && chapterItems.every((studyItem) => studyItem.isCompleted);
        if (!isComplete) {
          activeChapterTargetIds.add(weeklyTarget.chapterId);
        }
        continue;
      }

      if (!weeklyTarget.conceptId) {
        continue;
      }

      const conceptItems = studyItemsByConcept.get(weeklyTarget.conceptId) ?? [];
      const isComplete =
        conceptItems.length > 0 && conceptItems.every((studyItem) => studyItem.isCompleted);
      if (!isComplete) {
        activeConceptTargetIds.add(weeklyTarget.conceptId);
      }
    }

    const parsedComment = ruleBasedPlannerCommentParser.parse({
      comment: args.comment ?? "",
      subjects: subjects.map((subject) => ({
        _id: subject._id,
        name: subject.name,
        slug: subject.slug,
      })),
      chapters: nextTermChapters.map((chapter) => ({
        _id: chapter._id,
        name: chapter.name,
        slug: chapter.slug,
      })),
    });

    const preferredSubjectIds = new Set(parsedComment.preferredSubjectIds);
    const examChapterIds = new Set(parsedComment.examChapterIds);
    const endOfDay = args.date + 86400000 - 1;

    const existingSuggestions = existingSession
      ? await ctx.db
          .query("plannerSuggestions")
          .withIndex("by_sessionId_and_rankOrder", (q) =>
            q.eq("sessionId", existingSession._id),
          )
          .collect()
      : [];

    const blockedIdentities = new Set<string>();
    for (const suggestion of existingSuggestions) {
      blockedIdentities.add(
        buildPlannerCandidateIdentity({
          kind: suggestion.kind,
          studyItemId: suggestion.studyItemId,
          conceptId: suggestion.conceptId,
        }),
      );
    }

    for (const todoTask of todoTasks) {
      const todoTaskKind = todoTask.kind ?? PLANNER_SUGGESTION_KIND.studyItem;
      if (todoTaskKind === "custom") {
        continue;
      }

      blockedIdentities.add(
        buildPlannerCandidateIdentity({
          kind: todoTaskKind,
          studyItemId: todoTask.studyItemId,
          conceptId: todoTask.conceptId,
        }),
      );
    }

    const candidates: PlannerCandidate[] = [];

    for (const concept of concepts) {
      const chapter = chapterById.get(concept.chapterId);
      if (!chapter || !nextTermChapterIds.has(chapter._id)) {
        continue;
      }

      const subject = subjectById.get(chapter.subjectId);
      if (!subject) {
        continue;
      }

      if (concept.nextReviewAt === undefined || concept.nextReviewAt > endOfDay) {
        continue;
      }

      const identity = buildPlannerCandidateIdentity({
        kind: PLANNER_SUGGESTION_KIND.conceptReview,
        conceptId: concept._id,
      });

      if (blockedIdentities.has(identity)) {
        continue;
      }

      const isOverdue = concept.nextReviewAt < args.date;
      const completionPressure =
        (1 - (nextTermCompletionBySubject.get(subject._id) ?? 0)) * 400;

      candidates.push({
        identity,
        kind: PLANNER_SUGGESTION_KIND.conceptReview,
        conceptId: concept._id,
        title: `${concept.name} - Revision`,
        subjectId: subject._id,
        subjectName: subject.name,
        subjectColor: subject.color,
        chapterId: chapter._id,
        chapterName: chapter.name,
        conceptName: concept.name,
        durationMinutes: defaultRevisionMinutes,
        score:
          10000 +
          (isOverdue ? 250 : 0) +
          (activeConceptTargetIds.has(concept._id) ? 5000 : 0) +
          (examChapterIds.has(chapter._id) ? 3500 : 0) +
          (preferredSubjectIds.has(subject._id) ? 900 : 0) +
          (importantSubjectIds.has(subject._id) ? 700 : 0) +
          completionPressure,
        isRevision: true,
        isPreferredSubject: preferredSubjectIds.has(subject._id),
        isExamMatch: examChapterIds.has(chapter._id),
      });
    }

    for (const chapter of nextTermChapters) {
      const subject = subjectById.get(chapter.subjectId);
      if (!subject) {
        continue;
      }

      const chapterStudyItems = studyItemsByChapter.get(chapter._id) ?? [];
      const chapterConceptItems = chapterStudyItems.filter(
        (studyItem) => studyItem.conceptId !== undefined,
      );
      const chapterLevelItems = chapterStudyItems.filter(
        (studyItem) => studyItem.conceptId === undefined,
      );
      const hasUnfinishedConceptItem = chapterConceptItems.some(
        (studyItem) => !studyItem.isCompleted,
      );
      const chapterHasProgress = chapterStudyItems.some((studyItem) => studyItem.isCompleted);
      const chapterHasPending = chapterStudyItems.some((studyItem) => !studyItem.isCompleted);
      const chapterInProgress = chapterHasProgress && chapterHasPending;

      for (const studyItem of chapterStudyItems) {
        if (studyItem.isCompleted) {
          continue;
        }

        if (studyItem.conceptId === undefined && hasUnfinishedConceptItem) {
          continue;
        }

        const identity = buildPlannerCandidateIdentity({
          kind: PLANNER_SUGGESTION_KIND.studyItem,
          studyItemId: studyItem._id,
        });

        if (blockedIdentities.has(identity)) {
          continue;
        }

        const concept = studyItem.conceptId
          ? conceptsById.get(studyItem.conceptId)
          : null;
        const conceptStudyItems = studyItem.conceptId
          ? studyItemsByConcept.get(studyItem.conceptId) ?? []
          : [];
        const conceptHasProgress = conceptStudyItems.some(
          (conceptItem) => conceptItem.isCompleted,
        );
        const conceptHasPending = conceptStudyItems.some(
          (conceptItem) => !conceptItem.isCompleted,
        );
        const conceptInProgress = conceptHasProgress && conceptHasPending;
        const coachingStatus = coachingStatusByChapter.get(chapter._id);
        const completionPressure =
          (1 - (nextTermCompletionBySubject.get(subject._id) ?? 0)) * 400;

        const score =
          (studyItem.conceptId && activeConceptTargetIds.has(studyItem.conceptId)
            ? 5000
            : activeChapterTargetIds.has(chapter._id)
              ? 5000
              : 0) +
          (examChapterIds.has(chapter._id) ? 3500 : 0) +
          (conceptInProgress ? 2500 : 0) +
          (chapterInProgress ? 2000 : 0) +
          (coachingStatus === "running" ? 1800 : 0) +
          (coachingStatus === "finished" ? 1200 : 0) +
          (preferredSubjectIds.has(subject._id) ? 900 : 0) +
          (importantSubjectIds.has(subject._id) ? 700 : 0) +
          ((chapter.priorityBoost ?? 0) * 50) +
          completionPressure;

        candidates.push({
          identity,
          kind: PLANNER_SUGGESTION_KIND.studyItem,
          studyItemId: studyItem._id,
          title: studyItem.title,
          subjectId: subject._id,
          subjectName: subject.name,
          subjectColor: subject.color,
          chapterId: chapter._id,
          chapterName: chapter.name,
          conceptName: concept?.name,
          durationMinutes: studyItem.estimatedMinutes,
          score,
          isRevision: false,
          isPreferredSubject: preferredSubjectIds.has(subject._id),
          isExamMatch: examChapterIds.has(chapter._id),
        });
      }

      // Suppress unused local arrays for future tuning clarity.
      void chapterLevelItems;
    }

    const selection = buildPlannerSelection({
      candidates,
      availableMinutes: args.availableMinutes,
      preferredSubjectIds: Array.from(preferredSubjectIds),
      examChapterIds: Array.from(examChapterIds),
    });

    const generationRound = (existingSession?.generationCount ?? 0) + 1;
    const now = Date.now();
    const sessionId = existingSession
      ? existingSession._id
      : await ctx.db.insert("plannerSessions", {
          userId: currentUser._id,
          date: args.date,
          latestGeneratedAt: now,
          generationCount: generationRound,
          latestAvailableMinutes: Math.floor(args.availableMinutes),
          latestComment: args.comment?.trim() || undefined,
        });

    if (existingSession) {
      await ctx.db.patch(existingSession._id, {
        latestGeneratedAt: now,
        generationCount: generationRound,
        latestAvailableMinutes: Math.floor(args.availableMinutes),
        latestComment: args.comment?.trim() || undefined,
      });
    }

    let nextRankOrder = existingSuggestions.length;
    for (const candidate of selection.selected) {
      await ctx.db.insert("plannerSuggestions", {
        userId: currentUser._id,
        sessionId,
        date: args.date,
        kind: candidate.kind,
        studyItemId: candidate.studyItemId,
        conceptId: candidate.conceptId,
        durationMinutes: candidate.durationMinutes,
        rankOrder: nextRankOrder,
        generationRound,
        titleSnapshot: candidate.title,
        subjectNameSnapshot: candidate.subjectName,
        chapterNameSnapshot: candidate.chapterName,
        conceptNameSnapshot: candidate.conceptName,
        subjectColorSnapshot: candidate.subjectColor,
      });
      nextRankOrder += 1;
    }

    return {
      appendedCount: selection.selected.length,
      usedMinutes: selection.usedMinutes,
    };
  },
});

export const acceptPlannerSuggestion = mutation({
  args: {
    suggestionId: v.id("plannerSuggestions"),
  },
  handler: async (ctx, args) => {
    const currentUser = await requireCurrentUser(ctx);
    const suggestion = await getOwnedPlannerSuggestionOrThrow(
      ctx,
      currentUser,
      args.suggestionId,
    );

    if (suggestion.acceptedAt) {
      throw new Error("Suggestion already accepted");
    }

    const sortOrder = await getNextTodoSortOrder(ctx, currentUser, suggestion.date);

    if (suggestion.kind === PLANNER_SUGGESTION_KIND.studyItem) {
      if (!suggestion.studyItemId) {
        throw new Error("Study item suggestion is invalid");
      }

      const studyItem = await getOwnedStudyItemOrThrow(
        ctx,
        currentUser,
        suggestion.studyItemId,
      );
      if (studyItem.isCompleted) {
        throw new Error("Study item is no longer available");
      }

      const existingTodoTask = filterOwnedDocuments(currentUser, await ctx.db
        .query("todoTasks")
        .withIndex("by_date_and_studyItemId", (q) =>
          q.eq("date", suggestion.date).eq("studyItemId", suggestion.studyItemId),
        )
        .collect())[0] ?? null;

      if (existingTodoTask) {
        throw new Error("This study item is already in Todo for that day");
      }

      await ctx.db.insert("todoTasks", {
        userId: currentUser._id,
        date: suggestion.date,
        kind: PLANNER_SUGGESTION_KIND.studyItem,
        studyItemId: suggestion.studyItemId,
        durationMinutes: suggestion.durationMinutes,
        source: "ai_accepted",
        sortOrder,
      });
    } else {
      if (!suggestion.conceptId) {
        throw new Error("Revision suggestion is invalid");
      }

      await getOwnedConceptOrThrow(ctx, currentUser, suggestion.conceptId);

      const existingTodoTask = filterOwnedDocuments(currentUser, await ctx.db
        .query("todoTasks")
        .withIndex("by_date_and_conceptId", (q) =>
          q.eq("date", suggestion.date).eq("conceptId", suggestion.conceptId),
        )
        .collect())[0] ?? null;

      if (existingTodoTask) {
        throw new Error("This revision is already in Todo for that day");
      }

      await ctx.db.insert("todoTasks", {
        userId: currentUser._id,
        date: suggestion.date,
        kind: PLANNER_SUGGESTION_KIND.conceptReview,
        conceptId: suggestion.conceptId,
        durationMinutes: suggestion.durationMinutes,
        source: "ai_accepted",
        sortOrder,
      });
    }

    await ctx.db.patch(suggestion._id, {
      acceptedAt: Date.now(),
    });

    return null;
  },
});

export const dismissPlannerSuggestion = mutation({
  args: {
    suggestionId: v.id("plannerSuggestions"),
  },
  handler: async (ctx, args) => {
    const currentUser = await requireCurrentUser(ctx);
    const suggestion = await getOwnedPlannerSuggestionOrThrow(
      ctx,
      currentUser,
      args.suggestionId,
    );

    if (suggestion.acceptedAt) {
      throw new Error("Accepted suggestions cannot be removed");
    }

    await ctx.db.delete(args.suggestionId);
    return null;
  },
});

// ?????? Toggle a studyItem completion ????????????????????????????????????????????????????????????????????????????????????????????????
export const toggleStudyItemCompletion = mutation({
  args: { studyItemId: v.id("studyItems") },
  handler: async (ctx, args) => {
    const currentUser = await requireCurrentUser(ctx);
    const item = await getOwnedStudyItemOrThrow(ctx, currentUser, args.studyItemId);
    
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
        userId: currentUser._id,
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
        const scopedConceptItems = filterOwnedDocuments(currentUser, conceptItems);
        
        const allDone = scopedConceptItems.every(si => si.isCompleted);
        
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
    const currentUser = await requireCurrentUser(ctx);
    const concept = await getOwnedConceptOrThrow(ctx, currentUser, args.conceptId);

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
    const chapter = await getOwnedChapterOrThrow(ctx, currentUser, concept.chapterId);
    const subject = await getOwnedSubjectOrThrow(ctx, currentUser, chapter.subjectId);

    const settings = await getOwnedSettingByKey(
      ctx,
      currentUser,
      "defaultRevisionMinutes",
    );
    const defaultRevisionMinutes = (settings?.value as number) ?? 10;

    await ctx.db.insert("studyLogs", {
      userId: currentUser._id,
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
    const currentUser = await requireCurrentUser(ctx);
    await getOwnedConceptOrThrow(ctx, currentUser, args.conceptId);
    // 1. Reset Concept SR fields
    await ctx.db.patch(args.conceptId, {
      reviewCount: undefined,
      lastReviewedAt: undefined,
      nextReviewAt: undefined,
      repetitionLevel: undefined,
    });

    // 2. Reset associated StudyItems and delete their logs
    const studyItems = filterOwnedDocuments(currentUser, await ctx.db
      .query("studyItems")
      .withIndex("by_concept", (q) => q.eq("conceptId", args.conceptId))
      .collect());

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
    await removeTodoTasksForConcept(ctx, currentUser, args.conceptId);
  },
});

// ── Reschedule a concept review ──────────────────────────────────
export const rescheduleConceptReview = mutation({
  args: {
    conceptId: v.id("concepts"),
    newNextReviewAt: v.number(),
  },
  handler: async (ctx, args) => {
    const currentUser = await requireCurrentUser(ctx);
    await getOwnedConceptOrThrow(ctx, currentUser, args.conceptId);
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
    await requireCurrentOwner(ctx);
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

    // 7. Delete all plannerSuggestions
    const suggestions = await ctx.db.query("plannerSuggestions").take(500);
    for (const suggestion of suggestions) {
      await ctx.db.delete(suggestion._id);
    }

    // 8. Delete all planner subject preferences
    const plannerSubjectPreferences = await ctx.db
      .query("plannerSubjectPreferences")
      .take(500);
    for (const preference of plannerSubjectPreferences) {
      await ctx.db.delete(preference._id);
    }

    // 9. Delete all weekly targets
    const weeklyTargets = await ctx.db.query("weeklyTargets").take(500);
    for (const weeklyTarget of weeklyTargets) {
      await ctx.db.delete(weeklyTarget._id);
    }

    // 10. Delete all coaching progress rows
    const coachingProgress = await ctx.db.query("coachingProgress").take(500);
    for (const progress of coachingProgress) {
      await ctx.db.delete(progress._id);
    }

    // 11. Delete all todoTasks
    const todoTasks = await ctx.db.query("todoTasks").take(500);
    for (const todoTask of todoTasks) {
      await ctx.db.delete(todoTask._id);
    }

    // 12. Delete all settings
    const settings = await ctx.db.query("settings").take(500);
    for (const setting of settings) {
      await ctx.db.delete(setting._id);
    }

    // 13. Seed Settings
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
    await requireCurrentOwner(ctx);
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


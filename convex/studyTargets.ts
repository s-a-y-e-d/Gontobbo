import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import {
  assertCanAccessOwnedDocument,
  isLegacyWorkspaceOwner,
  requireCurrentUser,
  type CurrentUser,
} from "./auth";
import { ensureConceptStudyItemsForChapter } from "./mutations";

const DAY_MS = 86_400_000;
const MAX_SUBJECTS = 64;
const MAX_CHAPTERS = 400;
const MAX_TARGET_CHAPTERS = 20;
const MAX_CONCEPTS_PER_CHAPTER = 100;
const MAX_CONCEPT_TRACKERS = 8;
const MAX_TARGET_TASKS = 1_000;
const MAX_LAZY_CREATED_ITEMS = 240;
const MAX_EXISTING_TODOS = 2_000;
const MAX_TODOS_PER_DAY = 2_000;
const MAX_TARGET_DAYS = 366;

const selectionChapterValidator = v.object({
  _id: v.id("chapters"),
  name: v.string(),
  order: v.number(),
  inNextTerm: v.boolean(),
});

const selectionSubjectValidator = v.object({
  _id: v.id("subjects"),
  name: v.string(),
  color: v.optional(v.string()),
  chapters: v.array(selectionChapterValidator),
});

const targetChapterProgressValidator = v.object({
  chapterId: v.id("chapters"),
  chapterName: v.string(),
  subjectId: v.id("subjects"),
  subjectName: v.string(),
  subjectColor: v.optional(v.string()),
  order: v.number(),
  totalConcepts: v.number(),
  completedConcepts: v.number(),
  totalTrackerItems: v.number(),
  completedTrackerItems: v.number(),
  progressPercent: v.number(),
});

const activeTargetValidator = v.object({
  _id: v.id("studyTargets"),
  title: v.string(),
  startDate: v.number(),
  endDate: v.number(),
  createdAt: v.number(),
  updatedAt: v.number(),
  scheduledTaskCount: v.number(),
  scheduledMinutes: v.number(),
  totalTrackerItems: v.number(),
  completedTrackerItems: v.number(),
  remainingTrackerItems: v.number(),
  progressPercent: v.number(),
  remainingDays: v.number(),
  requiredTasksPerDay: v.number(),
  todayTaskCount: v.number(),
  todayTaskCountIsLimited: v.boolean(),
  paceStatus: v.union(
    v.literal("not_started"),
    v.literal("ahead"),
    v.literal("on_track"),
    v.literal("behind"),
    v.literal("deadline_passed"),
    v.literal("completed"),
  ),
  chapters: v.array(targetChapterProgressValidator),
});

type DatabaseCtx = QueryCtx | MutationCtx;

type TargetCandidate = {
  studyItem: Doc<"studyItems">;
  durationMinutes: number;
  subjectOrder: number;
  chapterSelectionOrder: number;
  conceptOrder: number;
  trackerOrder: number;
};

function getDhakaDayBucket(timestamp: number) {
  const dhakaOffset = 6 * 60 * 60 * 1_000;
  const dhakaTime = new Date(timestamp + dhakaOffset);
  dhakaTime.setUTCHours(0, 0, 0, 0);
  return dhakaTime.getTime() - dhakaOffset;
}

function validateDayBucket(value: number, fieldName: string) {
  if (!Number.isFinite(value) || getDhakaDayBucket(value) !== value) {
    throw new Error(`${fieldName} must be a Dhaka day boundary`);
  }
}

function validateDateRange(startDate: number, endDate: number) {
  validateDayBucket(startDate, "Start date");
  validateDayBucket(endDate, "End date");

  if (endDate < startDate) {
    throw new Error("End date must be on or after the start date");
  }

  const dayCount = Math.floor((endDate - startDate) / DAY_MS) + 1;
  if (dayCount > MAX_TARGET_DAYS) {
    throw new Error(`A study target can span at most ${MAX_TARGET_DAYS} days`);
  }
}

function normalizeTitle(title: string) {
  const normalized = title.trim().replace(/\s+/g, " ");
  if (normalized.length < 2 || normalized.length > 80) {
    throw new Error("Target title must be between 2 and 80 characters");
  }
  return normalized;
}

function assertWithinLimit<T>(items: T[], limit: number, message: string) {
  if (items.length > limit) {
    throw new Error(message);
  }
  return items;
}

async function getActiveTarget(ctx: DatabaseCtx, userId: Id<"users">) {
  return await ctx.db
    .query("studyTargets")
    .withIndex("by_userId_and_status", (q) =>
      q.eq("userId", userId).eq("status", "active"),
    )
    .unique();
}

async function getAccessibleSubjects(
  ctx: DatabaseCtx,
  currentUser: CurrentUser,
) {
  const owned = await ctx.db
    .query("subjects")
    .withIndex("by_userId", (q) => q.eq("userId", currentUser._id))
    .take(MAX_SUBJECTS + 1);
  assertWithinLimit(owned, MAX_SUBJECTS, "Too many subjects to load");

  if (!isLegacyWorkspaceOwner(currentUser)) {
    return owned;
  }

  const legacy = await ctx.db
    .query("subjects")
    .withIndex("by_userId", (q) => q.eq("userId", undefined))
    .take(MAX_SUBJECTS + 1);
  assertWithinLimit(
    [...owned, ...legacy],
    MAX_SUBJECTS,
    "Too many subjects to load",
  );
  return [...owned, ...legacy];
}

async function getAccessibleChapters(
  ctx: DatabaseCtx,
  currentUser: CurrentUser,
) {
  const owned = await ctx.db
    .query("chapters")
    .withIndex("by_userId", (q) => q.eq("userId", currentUser._id))
    .take(MAX_CHAPTERS + 1);
  assertWithinLimit(owned, MAX_CHAPTERS, "Too many chapters to load");

  if (!isLegacyWorkspaceOwner(currentUser)) {
    return owned;
  }

  const legacy = await ctx.db
    .query("chapters")
    .withIndex("by_userId", (q) => q.eq("userId", undefined))
    .take(MAX_CHAPTERS + 1);
  assertWithinLimit(
    [...owned, ...legacy],
    MAX_CHAPTERS,
    "Too many chapters to load",
  );
  return [...owned, ...legacy];
}

async function getAccessibleConceptsForChapter(
  ctx: DatabaseCtx,
  currentUser: CurrentUser,
  chapterId: Id<"chapters">,
) {
  const owned = await ctx.db
    .query("concepts")
    .withIndex("by_userId_and_chapterId", (q) =>
      q.eq("userId", currentUser._id).eq("chapterId", chapterId),
    )
    .take(MAX_CONCEPTS_PER_CHAPTER + 1);

  if (!isLegacyWorkspaceOwner(currentUser)) {
    return assertWithinLimit(
      owned,
      MAX_CONCEPTS_PER_CHAPTER,
      "A selected chapter has too many concepts",
    );
  }

  const legacy = await ctx.db
    .query("concepts")
    .withIndex("by_userId_and_chapterId", (q) =>
      q.eq("userId", undefined).eq("chapterId", chapterId),
    )
    .take(MAX_CONCEPTS_PER_CHAPTER + 1);
  return assertWithinLimit(
    [...owned, ...legacy],
    MAX_CONCEPTS_PER_CHAPTER,
    "A selected chapter has too many concepts",
  );
}

async function getAccessibleStudyItemsForChapter(
  ctx: MutationCtx,
  currentUser: CurrentUser,
  chapterId: Id<"chapters">,
) {
  const owned = await ctx.db
    .query("studyItems")
    .withIndex("by_userId_and_chapterId", (q) =>
      q.eq("userId", currentUser._id).eq("chapterId", chapterId),
    )
    .take(MAX_TARGET_TASKS + 1);

  if (!isLegacyWorkspaceOwner(currentUser)) {
    return owned;
  }

  const legacy = await ctx.db
    .query("studyItems")
    .withIndex("by_userId_and_chapterId", (q) =>
      q.eq("userId", undefined).eq("chapterId", chapterId),
    )
    .take(MAX_TARGET_TASKS + 1);
  return [...owned, ...legacy];
}

async function getTargetChapters(
  ctx: DatabaseCtx,
  userId: Id<"users">,
  studyTargetId: Id<"studyTargets">,
) {
  const rows = await ctx.db
    .query("studyTargetChapters")
    .withIndex("by_userId_and_studyTargetId", (q) =>
      q.eq("userId", userId).eq("studyTargetId", studyTargetId),
    )
    .take(MAX_TARGET_CHAPTERS + 1);
  return assertWithinLimit(
    rows,
    MAX_TARGET_CHAPTERS,
    "This target contains too many chapters",
  ).sort((left, right) => left.order - right.order);
}

async function buildTargetCandidates(
  ctx: MutationCtx,
  currentUser: CurrentUser,
  chapterIds: Id<"chapters">[],
) {
  const candidates: TargetCandidate[] = [];
  let lazyCreatedItemBudget = 0;

  for (const [chapterSelectionOrder, chapterId] of chapterIds.entries()) {
    const chapter = await ctx.db.get(chapterId);
    if (!chapter) {
      throw new Error("Selected chapter not found");
    }
    assertCanAccessOwnedDocument(currentUser, chapter);

    const subject = await ctx.db.get(chapter.subjectId);
    if (!subject) {
      throw new Error("Selected chapter subject not found");
    }
    assertCanAccessOwnedDocument(currentUser, subject);

    if (subject.conceptTrackers.length > MAX_CONCEPT_TRACKERS) {
      throw new Error(
        `A target supports at most ${MAX_CONCEPT_TRACKERS} concept trackers per subject`,
      );
    }

    const [concepts, existingStudyItems] = await Promise.all([
      getAccessibleConceptsForChapter(ctx, currentUser, chapterId),
      getAccessibleStudyItemsForChapter(ctx, currentUser, chapterId),
    ]);
    const existingConceptItemKeys = new Set(
      existingStudyItems
        .filter((studyItem) => studyItem.conceptId)
        .map((studyItem) => `${studyItem.conceptId}:${studyItem.type}`),
    );
    const missingConceptItems = concepts.reduce(
      (total, concept) =>
        total +
        subject.conceptTrackers.filter(
          (tracker) =>
            !existingConceptItemKeys.has(`${concept._id}:${tracker.key}`),
        ).length,
      0,
    );
    lazyCreatedItemBudget += missingConceptItems;
    if (lazyCreatedItemBudget > MAX_LAZY_CREATED_ITEMS) {
      throw new Error(
        `A target can create at most ${MAX_LAZY_CREATED_ITEMS} missing concept Items at once. Open the selected chapters first, then try again.`,
      );
    }

    await ensureConceptStudyItemsForChapter(ctx, currentUser, chapterId);
    const studyItems = await getAccessibleStudyItemsForChapter(
      ctx,
      currentUser,
      chapterId,
    );
    const conceptOrderById = new Map(
      concepts.map((concept) => [concept._id, concept.order]),
    );
    const trackerOrderByKey = new Map(
      subject.conceptTrackers.map((tracker, index) => [tracker.key, index]),
    );

    for (const studyItem of studyItems) {
      if (!studyItem.conceptId || studyItem.isCompleted) {
        continue;
      }
      candidates.push({
        studyItem,
        durationMinutes: Math.max(1, Math.round(studyItem.estimatedMinutes)),
        subjectOrder: subject.order,
        chapterSelectionOrder,
        conceptOrder: conceptOrderById.get(studyItem.conceptId) ?? 0,
        trackerOrder: trackerOrderByKey.get(studyItem.type) ?? 0,
      });
      if (candidates.length > MAX_TARGET_TASKS) {
        throw new Error(
          `A target can schedule at most ${MAX_TARGET_TASKS} unfinished tasks`,
        );
      }
    }
  }

  return candidates.sort((left, right) =>
    left.subjectOrder - right.subjectOrder ||
    left.chapterSelectionOrder - right.chapterSelectionOrder ||
    left.conceptOrder - right.conceptOrder ||
    left.trackerOrder - right.trackerOrder ||
    left.studyItem._creationTime - right.studyItem._creationTime,
  );
}

async function getOwnedTodoTasksForRange(
  ctx: MutationCtx,
  userId: Id<"users">,
  startDate: number,
  endDate: number,
) {
  const tasks = await ctx.db
    .query("todoTasks")
    .withIndex("by_userId_and_date", (q) =>
      q.eq("userId", userId).gte("date", startDate).lte("date", endDate),
    )
    .take(MAX_EXISTING_TODOS + 1);
  return assertWithinLimit(
    tasks,
    MAX_EXISTING_TODOS,
    "Too many existing Todo tasks in this date range",
  );
}

async function getOwnedTodoTasks(
  ctx: MutationCtx,
  userId: Id<"users">,
) {
  const tasks = await ctx.db
    .query("todoTasks")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .take(MAX_EXISTING_TODOS + 1);
  return assertWithinLimit(
    tasks,
    MAX_EXISTING_TODOS,
    "Too many Todo tasks to extend this target safely",
  );
}

function buildDayBuckets(startDate: number, endDate: number) {
  return Array.from(
    { length: Math.floor((endDate - startDate) / DAY_MS) + 1 },
    (_, index) => startDate + index * DAY_MS,
  );
}

function assignCandidatesToDates(
  candidates: TargetCandidate[],
  startDate: number,
  endDate: number,
  existingTodos: Doc<"todoTasks">[],
) {
  const dates = buildDayBuckets(startDate, endDate);
  const loadByDate = new Map(dates.map((date) => [date, 0]));
  const sortOrderByDate = new Map(dates.map((date) => [date, 0]));

  for (const todo of existingTodos) {
    if (!loadByDate.has(todo.date)) {
      continue;
    }
    loadByDate.set(todo.date, (loadByDate.get(todo.date) ?? 0) + todo.durationMinutes);
    sortOrderByDate.set(
      todo.date,
      Math.max(sortOrderByDate.get(todo.date) ?? 0, todo.sortOrder ?? 0),
    );
  }

  return candidates.map((candidate) => {
    let selectedDate = dates[0]!;
    for (const date of dates) {
      const selectedLoad = loadByDate.get(selectedDate) ?? 0;
      const dateLoad = loadByDate.get(date) ?? 0;
      if (dateLoad < selectedLoad) {
        selectedDate = date;
      }
    }

    loadByDate.set(
      selectedDate,
      (loadByDate.get(selectedDate) ?? 0) + candidate.durationMinutes,
    );
    const sortOrder = (sortOrderByDate.get(selectedDate) ?? 0) + 1;
    sortOrderByDate.set(selectedDate, sortOrder);

    return { candidate, date: selectedDate, sortOrder };
  });
}

async function scheduleTargetTodos(
  ctx: MutationCtx,
  currentUser: CurrentUser,
  studyTargetId: Id<"studyTargets">,
  candidates: TargetCandidate[],
  startDate: number,
  endDate: number,
) {
  const existingTodos = await getOwnedTodoTasksForRange(
    ctx,
    currentUser._id,
    startDate,
    endDate,
  );
  const existingByStudyItemId = new Map<Id<"studyItems">, Doc<"todoTasks">>();
  for (const todo of existingTodos) {
    if (todo.studyItemId && !existingByStudyItemId.has(todo.studyItemId)) {
      existingByStudyItemId.set(todo.studyItemId, todo);
    }
  }

  const unscheduled: TargetCandidate[] = [];
  let linkedCount = 0;
  for (const candidate of candidates) {
    const existing = existingByStudyItemId.get(candidate.studyItem._id);
    if (!existing) {
      unscheduled.push(candidate);
      continue;
    }
    if (existing.studyTargetId !== studyTargetId) {
      await ctx.db.patch(existing._id, { studyTargetId });
    }
    linkedCount += 1;
  }

  const assignments = assignCandidatesToDates(
    unscheduled,
    startDate,
    endDate,
    existingTodos,
  );
  for (const assignment of assignments) {
    await ctx.db.insert("todoTasks", {
      userId: currentUser._id,
      date: assignment.date,
      kind: "study_item",
      studyItemId: assignment.candidate.studyItem._id,
      durationMinutes: assignment.candidate.durationMinutes,
      sortOrder: assignment.sortOrder,
      source: "target",
      studyTargetId,
    });
  }

  return {
    createdCount: assignments.length,
    linkedCount,
    scheduledTaskCount: candidates.length,
    scheduledMinutes: candidates.reduce(
      (total, candidate) => total + candidate.durationMinutes,
      0,
    ),
  };
}

export const getStudyTargetPageData = query({
  args: { today: v.number() },
  returns: v.object({
    target: v.union(v.null(), activeTargetValidator),
    selectionSubjects: v.array(selectionSubjectValidator),
  }),
  handler: async (ctx, args) => {
    const currentUser = await requireCurrentUser(ctx);
    const target = await getActiveTarget(ctx, currentUser._id);

    if (!target) {
      const [subjects, chapters] = await Promise.all([
        getAccessibleSubjects(ctx, currentUser),
        getAccessibleChapters(ctx, currentUser),
      ]);
      const chaptersBySubject = new Map<Id<"subjects">, Doc<"chapters">[]>();
      for (const chapter of chapters) {
        const current = chaptersBySubject.get(chapter.subjectId) ?? [];
        current.push(chapter);
        chaptersBySubject.set(chapter.subjectId, current);
      }

      return {
        target: null,
        selectionSubjects: subjects
          .sort((left, right) => left.order - right.order)
          .map((subject) => ({
            _id: subject._id,
            name: subject.name,
            color: subject.color,
            chapters: (chaptersBySubject.get(subject._id) ?? [])
              .sort((left, right) => left.order - right.order)
              .map((chapter) => ({
                _id: chapter._id,
                name: chapter.name,
                order: chapter.order,
                inNextTerm: chapter.inNextTerm,
              })),
          }))
          .filter((subject) => subject.chapters.length > 0),
      };
    }

    const targetChapterRows = await getTargetChapters(
      ctx,
      currentUser._id,
      target._id,
    );
    const chapters = (
      await Promise.all(
        targetChapterRows.map(async (targetChapter) => {
          const [chapter, subject, conceptStats] = await Promise.all([
            ctx.db.get(targetChapter.chapterId),
            ctx.db.get(targetChapter.subjectId),
            ctx.db
              .query("studyItemConceptStats")
              .withIndex("by_userId_and_chapterId", (q) =>
                q
                  .eq("userId", currentUser._id)
                  .eq("chapterId", targetChapter.chapterId),
              )
              .take(MAX_CONCEPTS_PER_CHAPTER + 1),
          ]);
          assertWithinLimit(
            conceptStats,
            MAX_CONCEPTS_PER_CHAPTER,
            "A target chapter has too many concept summaries",
          );
          if (!chapter || !subject) {
            return null;
          }

          const totalTrackerItems = conceptStats.reduce(
            (total, stat) => total + stat.totalItems,
            0,
          );
          const completedTrackerItems = conceptStats.reduce(
            (total, stat) => total + stat.completedItems,
            0,
          );
          const completedConcepts = conceptStats.filter(
            (stat) =>
              stat.totalItems > 0 && stat.completedItems === stat.totalItems,
          ).length;

          return {
            chapterId: chapter._id,
            chapterName: chapter.name,
            subjectId: subject._id,
            subjectName: subject.name,
            subjectColor: subject.color,
            order: targetChapter.order,
            totalConcepts: conceptStats.length,
            completedConcepts,
            totalTrackerItems,
            completedTrackerItems,
            progressPercent:
              totalTrackerItems === 0
                ? 0
                : Math.round((completedTrackerItems / totalTrackerItems) * 100),
          };
        }),
      )
    ).filter((chapter): chapter is NonNullable<typeof chapter> => chapter !== null);

    const totalTrackerItems = chapters.reduce(
      (total, chapter) => total + chapter.totalTrackerItems,
      0,
    );
    const completedTrackerItems = chapters.reduce(
      (total, chapter) => total + chapter.completedTrackerItems,
      0,
    );
    const remainingTrackerItems = Math.max(
      0,
      totalTrackerItems - completedTrackerItems,
    );
    const remainingStart = Math.max(args.today, target.startDate);
    const remainingDays =
      remainingStart > target.endDate
        ? 0
        : Math.floor((target.endDate - remainingStart) / DAY_MS) + 1;
    const elapsedDays =
      args.today < target.startDate
        ? 0
        : Math.min(
            Math.floor((args.today - target.startDate) / DAY_MS) + 1,
            Math.floor((target.endDate - target.startDate) / DAY_MS) + 1,
          );
    const totalDays = Math.floor((target.endDate - target.startDate) / DAY_MS) + 1;
    const expectedCompleted =
      totalDays === 0 ? 0 : (totalTrackerItems * elapsedDays) / totalDays;

    let paceStatus:
      | "not_started"
      | "ahead"
      | "on_track"
      | "behind"
      | "deadline_passed"
      | "completed";
    if (totalTrackerItems > 0 && completedTrackerItems >= totalTrackerItems) {
      paceStatus = "completed";
    } else if (args.today > target.endDate) {
      paceStatus = "deadline_passed";
    } else if (args.today < target.startDate) {
      paceStatus = "not_started";
    } else if (completedTrackerItems + 1 < expectedCompleted) {
      paceStatus = "behind";
    } else if (completedTrackerItems > expectedCompleted + 1) {
      paceStatus = "ahead";
    } else {
      paceStatus = "on_track";
    }

    const todayTasks = await ctx.db
      .query("todoTasks")
      .withIndex("by_userId_and_date", (q) =>
        q.eq("userId", currentUser._id).eq("date", args.today),
      )
      .take(MAX_TODOS_PER_DAY + 1);
    assertWithinLimit(
      todayTasks,
      MAX_TODOS_PER_DAY,
      "Too many Todo tasks on this day to load target progress safely",
    );
    const todayTargetTasks = todayTasks.filter(
      (todo) => todo.studyTargetId === target._id,
    );

    return {
      target: {
        _id: target._id,
        title: target.title,
        startDate: target.startDate,
        endDate: target.endDate,
        createdAt: target.createdAt,
        updatedAt: target.updatedAt,
        scheduledTaskCount: target.scheduledTaskCount,
        scheduledMinutes: target.scheduledMinutes,
        totalTrackerItems,
        completedTrackerItems,
        remainingTrackerItems,
        progressPercent:
          totalTrackerItems === 0
            ? 0
            : Math.round((completedTrackerItems / totalTrackerItems) * 100),
        remainingDays,
        requiredTasksPerDay:
          remainingDays === 0
            ? remainingTrackerItems
            : Math.ceil(remainingTrackerItems / remainingDays),
        todayTaskCount: Math.min(todayTargetTasks.length, 100),
        todayTaskCountIsLimited: todayTargetTasks.length > 100,
        paceStatus,
        chapters,
      },
      selectionSubjects: [],
    };
  },
});

export const createStudyTarget = mutation({
  args: {
    title: v.string(),
    startDate: v.number(),
    endDate: v.number(),
    chapterIds: v.array(v.id("chapters")),
  },
  returns: v.object({
    studyTargetId: v.id("studyTargets"),
    createdTodoCount: v.number(),
    linkedTodoCount: v.number(),
    scheduledTaskCount: v.number(),
  }),
  handler: async (ctx, args) => {
    const currentUser = await requireCurrentUser(ctx);
    const title = normalizeTitle(args.title);
    validateDateRange(args.startDate, args.endDate);

    const chapterIds = [...new Set(args.chapterIds)];
    if (chapterIds.length === 0 || chapterIds.length > MAX_TARGET_CHAPTERS) {
      throw new Error(
        `Select between 1 and ${MAX_TARGET_CHAPTERS} chapters for the target`,
      );
    }
    if (await getActiveTarget(ctx, currentUser._id)) {
      throw new Error("Only one active study target is allowed");
    }

    const candidates = await buildTargetCandidates(ctx, currentUser, chapterIds);
    const now = Date.now();
    const studyTargetId = await ctx.db.insert("studyTargets", {
      userId: currentUser._id,
      title,
      startDate: args.startDate,
      endDate: args.endDate,
      status: "active",
      scheduledTaskCount: 0,
      scheduledMinutes: 0,
      createdAt: now,
      updatedAt: now,
    });

    for (const [order, chapterId] of chapterIds.entries()) {
      const chapter = await ctx.db.get(chapterId);
      if (!chapter) {
        throw new Error("Selected chapter not found");
      }
      assertCanAccessOwnedDocument(currentUser, chapter);
      await ctx.db.insert("studyTargetChapters", {
        userId: currentUser._id,
        studyTargetId,
        subjectId: chapter.subjectId,
        chapterId,
        order,
      });
    }

    const schedule = await scheduleTargetTodos(
      ctx,
      currentUser,
      studyTargetId,
      candidates,
      args.startDate,
      args.endDate,
    );
    await ctx.db.patch(studyTargetId, {
      scheduledTaskCount: schedule.scheduledTaskCount,
      scheduledMinutes: schedule.scheduledMinutes,
      updatedAt: Date.now(),
    });

    return {
      studyTargetId,
      createdTodoCount: schedule.createdCount,
      linkedTodoCount: schedule.linkedCount,
      scheduledTaskCount: schedule.scheduledTaskCount,
    };
  },
});

export const extendStudyTarget = mutation({
  args: {
    endDate: v.number(),
    today: v.number(),
  },
  returns: v.object({
    createdTodoCount: v.number(),
    linkedTodoCount: v.number(),
    scheduledTaskCount: v.number(),
  }),
  handler: async (ctx, args) => {
    const currentUser = await requireCurrentUser(ctx);
    validateDayBucket(args.today, "Today");
    const target = await getActiveTarget(ctx, currentUser._id);
    if (!target) {
      throw new Error("No active study target found");
    }
    validateDateRange(target.startDate, args.endDate);
    if (args.endDate <= target.endDate) {
      throw new Error("Choose a date after the current target end date");
    }

    const targetChapterRows = await getTargetChapters(
      ctx,
      currentUser._id,
      target._id,
    );
    const targetTodos = (await getOwnedTodoTasks(ctx, currentUser._id)).filter(
      (todo) => todo.studyTargetId === target._id,
    );

    for (const todo of targetTodos) {
      if (todo.source !== "target") {
        continue;
      }
      const studyItem = todo.studyItemId
        ? await ctx.db.get(todo.studyItemId)
        : null;
      if (!studyItem || !studyItem.isCompleted) {
        await ctx.db.delete(todo._id);
      }
    }

    const chapterIds = targetChapterRows.map((row) => row.chapterId);
    const candidates = await buildTargetCandidates(ctx, currentUser, chapterIds);
    const planningStartDate = Math.max(args.today, target.startDate);
    const schedule = await scheduleTargetTodos(
      ctx,
      currentUser,
      target._id,
      candidates,
      planningStartDate,
      args.endDate,
    );

    await ctx.db.patch(target._id, {
      endDate: args.endDate,
      scheduledTaskCount: schedule.scheduledTaskCount,
      scheduledMinutes: schedule.scheduledMinutes,
      updatedAt: Date.now(),
    });

    return {
      createdTodoCount: schedule.createdCount,
      linkedTodoCount: schedule.linkedCount,
      scheduledTaskCount: schedule.scheduledTaskCount,
    };
  },
});

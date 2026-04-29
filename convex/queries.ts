import { query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import {
  buildStudyItemSearchArtifacts,
  normalizeStudyItemSearchQuery,
  scoreStudyItemSearchMatch,
} from "./studyItemSearch";

function getTrackerLabel(
  subject: Doc<"subjects">,
  studyItem: Doc<"studyItems">,
) {
  const trackers = studyItem.conceptId
    ? subject.conceptTrackers
    : subject.chapterTrackers;
  return trackers.find((tracker) => tracker.key === studyItem.type)?.label ?? "";
}

// ── List study logs feed ─────────────────────────────────────────
export const getStudyLogsFeed = query({
  args: {
    paginationOpts: paginationOptsValidator,
    subjectId: v.optional(v.id("subjects")),
    eventType: v.optional(v.union(
      v.literal("study_item_completed"),
      v.literal("study_item_uncompleted"),
      v.literal("concept_review")
    )),
    editableOnly: v.optional(v.boolean()),
    dayBucket: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let q;

    // Choose best index based on provided filters
    if (args.subjectId && args.eventType) {
      q = ctx.db.query("studyLogs").withIndex("by_subjectId_and_eventType_and_loggedAt", (q) =>
        q.eq("subjectId", args.subjectId!).eq("eventType", args.eventType!)
      );
    } else if (args.subjectId) {
      q = ctx.db.query("studyLogs").withIndex("by_subjectId_and_loggedAt", (q) =>
        q.eq("subjectId", args.subjectId!)
      );
    } else if (args.eventType) {
      q = ctx.db.query("studyLogs").withIndex("by_eventType_and_loggedAt", (q) =>
        q.eq("eventType", args.eventType!)
      );
    } else if (args.dayBucket) {
      q = ctx.db.query("studyLogs").withIndex("by_dayBucket", (q) =>
        q.eq("dayBucket", args.dayBucket!)
      );
    } else if (args.editableOnly) {
      q = ctx.db.query("studyLogs").withIndex("by_isEditable_and_loggedAt", (q) =>
        q.eq("isEditable", true)
      );
    } else {
      q = ctx.db.query("studyLogs").withIndex("by_loggedAt");
    }

    // Apply remaining filters in-query (better for pagination than in-memory)
    if (args.editableOnly && !args.editableOnly) { // already indexed
    } else if (args.editableOnly) {
      q = q.filter((q) => q.eq(q.field("isEditable"), true));
    }

    if (args.eventType && args.subjectId) { // already indexed
    } else if (args.eventType) {
      // already indexed unless dayBucket or editableOnly was chosen
      q = q.filter((q) => q.eq(q.field("eventType"), args.eventType));
    }

    return await q.order("desc").paginate(args.paginationOpts);
  },
});

// ── Get subjects for logs filter ─────────────────────────────────
export const getStudyLogSubjectsFilterData = query({
  args: {},
  handler: async (ctx) => {
    const subjects = await ctx.db.query("subjects").collect();
    return subjects.map(s => ({
      _id: s._id,
      name: s.name,
    }));
  },
});

// ── List all subjects (ordered) ──────────────────────────────────
export const getSubjects = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("subjects").collect();
  },
});

// ── Get a subject by slug ────────────────────────────────────────
export const getSubjectBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("subjects")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();
  },
});

// ── Get subject by ID ────────────────────────────────────────────
export const getSubjectDetails = query({
  args: { subjectId: v.id("subjects") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.subjectId);
  },
});

// ── Chapters for a subject ───────────────────────────────────────
export const getChaptersBySubject = query({
  args: { subjectId: v.id("subjects") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("chapters")
      .withIndex("by_subject", (q) => q.eq("subjectId", args.subjectId))
      .collect();
  },
});

// ── Concepts for a chapter ───────────────────────────────────────
export const getConceptsByChapter = query({
  args: { chapterId: v.id("chapters") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("concepts")
      .withIndex("by_chapter", (q) => q.eq("chapterId", args.chapterId))
      .collect();
  },
});

// ── StudyItems for a chapter (chapter-level only: no conceptId) ──
export const getChapterStudyItems = query({
  args: { chapterId: v.id("chapters") },
  handler: async (ctx, args) => {
    const items = await ctx.db
      .query("studyItems")
      .withIndex("by_chapter", (q) => q.eq("chapterId", args.chapterId))
      .collect();
    // Return only chapter-level items (conceptId is undefined)
    return items.filter((item) => item.conceptId === undefined);
  },
});

// ── StudyItems for a concept ─────────────────────────────────────
export const getConceptStudyItems = query({
  args: { conceptId: v.id("concepts") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("studyItems")
      .withIndex("by_concept", (q) => q.eq("conceptId", args.conceptId))
      .collect();
  },
});

// ── Full subject page data ───────────────────────────────────────
// Returns subject + chapters + all studyItems + concept counts
// Used by /subjects/[slug] page
export const getSubjectPageData = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const subject = await ctx.db
      .query("subjects")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();

    if (!subject) return null;

    const chapters = await ctx.db
      .query("chapters")
      .withIndex("by_subject", (q) => q.eq("subjectId", subject._id))
      .collect();

    // Sort chapters by order
    chapters.sort((a, b) => a.order - b.order);

    // For each chapter, get studyItems + concept count
    const chaptersWithData = await Promise.all(
      chapters.map(async (chapter) => {
        // All studyItems for this chapter (both chapter-level and concept-level)
        const allStudyItems = await ctx.db
          .query("studyItems")
          .withIndex("by_chapter", (q) => q.eq("chapterId", chapter._id))
          .collect();

        // Chapter-level items (no conceptId)
        const chapterLevelItems = allStudyItems.filter(
          (si) => si.conceptId === undefined
        );

        // Concept-level items (has conceptId)
        const conceptLevelItems = allStudyItems.filter(
          (si) => si.conceptId !== undefined
        );

        // Count concepts for this chapter
        const concepts = await ctx.db
          .query("concepts")
          .withIndex("by_chapter", (q) => q.eq("chapterId", chapter._id))
          .collect();

        // Concept completion: a concept is "done" when all its studyItems are completed
        const conceptTrackerCount = subject.conceptTrackers.length;
        let completedConceptCount = 0;
        if (conceptTrackerCount > 0) {
          for (const concept of concepts) {
            const conceptItems = conceptLevelItems.filter(
              (si) => si.conceptId === concept._id
            );
            const allDone =
              conceptItems.length >= conceptTrackerCount &&
              conceptItems.every((si) => si.isCompleted);
            if (allDone) completedConceptCount++;
          }
        }

        // Build tracker data: for each chapterTracker key, find matching studyItem
        const trackerData = subject.chapterTrackers.map((tracker) => {
          const matchingItem = chapterLevelItems.find(
            (si) => si.type === tracker.key
          );
          return {
            key: tracker.key,
            isCompleted: matchingItem?.isCompleted ?? false,
            score: matchingItem?.completionScore ?? undefined,
            studyItemId: matchingItem?._id,
          };
        });

        // Overall chapter status
        const totalItems = chapterLevelItems.length + conceptLevelItems.length;
        const completedItems =
          chapterLevelItems.filter((si) => si.isCompleted).length +
          conceptLevelItems.filter((si) => si.isCompleted).length;

        let status: "NOT_STARTED" | "IN_PROGRESS" | "READY" = "NOT_STARTED";
        if (totalItems > 0 && completedItems === totalItems) {
          status = "READY";
        } else if (completedItems > 0) {
          status = "IN_PROGRESS";
        }

        return {
          ...chapter,
          totalConcepts: concepts.length,
          completedConcepts: completedConceptCount,
          trackerData,
          status,
          totalItems,
          completedItems,
        };
      })
    );

    // Overall subject progress
    const totalAllItems = chaptersWithData.reduce((sum, ch) => sum + ch.totalItems, 0);
    const completedAllItems = chaptersWithData.reduce((sum, ch) => sum + ch.completedItems, 0);
    const progressPercentage = totalAllItems === 0 ? 0 : Math.round((completedAllItems / totalAllItems) * 100);

    return {
      subject,
      chapters: chaptersWithData,
      progressPercentage,
      totalItems: totalAllItems,
      completedItems: completedAllItems,
    };
  },
});

// ── Subjects with aggregated stats (for home page grid) ──────────
export const getSubjectsWithStats = query({
  args: {},
  handler: async (ctx) => {
    const subjects = await ctx.db.query("subjects").collect();

    const subjectsWithStats = await Promise.all(
      subjects.map(async (subject) => {
        const chapters = await ctx.db
          .query("chapters")
          .withIndex("by_subject", (q) => q.eq("subjectId", subject._id))
          .collect();

        let totalItems = 0;
        let completedItems = 0;
        let completedChaptersCount = 0;

        for (const chapter of chapters) {
          const studyItems = await ctx.db
            .query("studyItems")
            .withIndex("by_chapter", (q) => q.eq("chapterId", chapter._id))
            .collect();

          const chapterTotal = studyItems.length;
          const chapterCompleted = studyItems.filter((si) => si.isCompleted).length;

          totalItems += chapterTotal;
          completedItems += chapterCompleted;

          if (chapterTotal > 0 && chapterCompleted === chapterTotal) {
            completedChaptersCount++;
          }
        }

        const tasksPending = totalItems - completedItems;
        const progressPercentage =
          totalItems === 0 ? 0 : Math.round((completedItems / totalItems) * 100);

        return {
          ...subject,
          stats: {
            totalChapters: chapters.length,
            completedChapters: completedChaptersCount,
            tasksPending,
            progressPercentage,
          },
        };
      })
    );

    return subjectsWithStats;
  },
});

function getDhakaDayBucket(timestamp: number) {
  // Dhaka is UTC+6
  const dhakaOffset = 6 * 60 * 60 * 1000;
  const dhakaTime = new Date(timestamp + dhakaOffset);
  dhakaTime.setUTCHours(0, 0, 0, 0);
  return dhakaTime.getTime() - dhakaOffset;
}

const DAY_MS = 86400000;


// ── Reviews Dashboard Data ──────────────────────────────────────
export const getReviewsDashboardData = query({
  args: {
    now: v.number(),
    subjectId: v.optional(v.id("subjects")),
  },
  handler: async (ctx, args) => {
    // 1. Get all concepts with nextReviewAt
    let concepts = await ctx.db.query("concepts").collect();

    // Filter by subject if provided
    if (args.subjectId) {
      const chapters = await ctx.db
        .query("chapters")
        .withIndex("by_subject", (q) => q.eq("subjectId", args.subjectId!))
        .collect();
      const chapterIds = new Set(chapters.map((c) => c._id));
      concepts = concepts.filter((c) => chapterIds.has(c.chapterId));
    }

    const startOfToday = getDhakaDayBucket(args.now);
    const endOfToday = startOfToday + 86400000 - 1;

    // Get completed today count from studyLogs
    const completedTodayLogs = await ctx.db
      .query("studyLogs")
      .withIndex("by_dayBucket", (q) => q.eq("dayBucket", startOfToday))
      .filter((q) => q.eq(q.field("eventType"), "concept_review"))
      .collect();

    // Enrich concepts with subject/chapter info
    const enrichedConcepts = await Promise.all(
      concepts
        .filter((c) => c.nextReviewAt !== undefined)
        .map(async (concept) => {
          const chapter = await ctx.db.get(concept.chapterId);
          const subject = chapter ? await ctx.db.get(chapter.subjectId) : null;
          return {
            ...concept,
            chapterName: chapter?.name ?? "Unknown",
            subjectName: subject?.name ?? "Unknown",
            subjectColor: subject?.color ?? "gray",
            subjectIcon: subject?.icon ?? "menu_book",
          };
        })
    );

    const overdue = enrichedConcepts
      .filter((c) => c.nextReviewAt! < startOfToday)
      .sort((a, b) => a.nextReviewAt! - b.nextReviewAt!);

    const dueToday = enrichedConcepts
      .filter((c) => c.nextReviewAt! >= startOfToday && c.nextReviewAt! <= endOfToday)
      .sort((a, b) => a.nextReviewAt! - b.nextReviewAt!);

    const upcoming = enrichedConcepts
      .filter((c) => c.nextReviewAt! > endOfToday && c.nextReviewAt! <= args.now + 7 * 86400000)
      .sort((a, b) => a.nextReviewAt! - b.nextReviewAt!);

    return {
      stats: {
        overdueCount: overdue.length,
        dueTodayCount: dueToday.length,
        upcomingCount: upcoming.length,
        completedTodayCount: completedTodayLogs.length,
      },
      overdue,
      dueToday,
      upcoming,
    };
  },
});

// ── Get all subjects for filters ─────────────────────────────────
export const getTodoAgenda = query({
  args: {
    startDate: v.number(),
    days: v.number(),
  },
  handler: async (ctx, args) => {
    const clampedDays = Math.max(1, Math.min(args.days, 31));
    const endDate = args.startDate + (clampedDays - 1) * DAY_MS;

    const todoTasks = await ctx.db
      .query("todoTasks")
      .withIndex("by_date_and_startTimeMinutes", (q) =>
        q.gte("date", args.startDate).lte("date", endDate)
      )
      .collect();

    type TodoAgendaQueryTask = (typeof todoTasks)[number] & {
      minutes: number;
      title: string;
      todoTaskId: string;
    };

    const tasksByDate = new Map<number, TodoAgendaQueryTask[]>();
    for (const todoTask of todoTasks) {
      const current = tasksByDate.get(todoTask.date) ?? [];
      current.push({
        ...todoTask,
        minutes: todoTask.durationMinutes,
        title: "",
        todoTaskId: todoTask._id,
      });
      tasksByDate.set(todoTask.date, current);
    }

    const days = await Promise.all(
      Array.from({ length: clampedDays }, async (_, index) => {
        const date = args.startDate + index * DAY_MS;
        const dayTasks = tasksByDate.get(date) ?? [];

        if (dayTasks.length === 0) {
          return {
            date,
            tasks: [],
          };
        }

        const tasks = await Promise.all(
          dayTasks.map(async (task) => {
            if (!task.studyItemId) {
              return null;
            }

            const currentStudyItem = await ctx.db.get(task.studyItemId);
            if (!currentStudyItem) {
              return null;
            }

            const [currentSubject, currentChapter] = await Promise.all([
              ctx.db.get(currentStudyItem.subjectId),
              ctx.db.get(currentStudyItem.chapterId),
            ]);

            if (!currentSubject || !currentChapter) {
              return null;
            }

            return {
              id: task.todoTaskId,
              studyItemId: currentStudyItem._id,
              title: currentStudyItem.title,
              isCompleted: currentStudyItem.isCompleted,
              subjectName: currentSubject.name,
              chapterName: currentChapter.name,
              subjectColor: currentSubject.color ?? "gray",
              startTimeMinutes: task.startTimeMinutes,
              durationMinutes: task.durationMinutes,
              source: task.source,
            };

            /*
            if (!studyItem) {
              return {
                id: task.studyItemId,
                title: normalizePlannerTitle(task.title),
                subjectName: "অজানা বিষয়",
                chapterName: "অজানা অধ্যায়",
                subjectColor: "gray",
                minutes: task.minutes,
                isFallback: true,
              };
            }

            const [subject, chapter, concept] = await Promise.all([
              ctx.db.get(studyItem.subjectId),
              ctx.db.get(studyItem.chapterId),
              studyItem.conceptId
                ? ctx.db.get(studyItem.conceptId)
                : Promise.resolve(null),
            ]);
            const isConceptLevel = Boolean(studyItem.conceptId);

            const trackerLabel = getTrackerLabel(
              subject
                ? {
                    chapterTrackers: subject.chapterTrackers,
                    conceptTrackers: subject.conceptTrackers,
                  }
                : null,
              studyItem.type,
              isConceptLevel
            );

            const title =
              isConceptLevel && concept && trackerLabel
                ? `${concept.name} - ${trackerLabel}`
                : !isConceptLevel && chapter && trackerLabel
                  ? `${chapter.name} - ${trackerLabel}`
                  : normalizePlannerTitle(task.title);

            return {
              id: studyItem._id,
              title,
              subjectName: subject?.name ?? "অজানা বিষয়",
              chapterName: chapter?.name ?? "অজানা অধ্যায়",
              subjectColor: subject?.color ?? "gray",
              minutes: task.minutes,
              isFallback: false,
            };
            */
          })
        );

        return {
          date,
          tasks: tasks.filter(
            (
              task,
            ): task is NonNullable<(typeof tasks)[number]> => task !== null,
          ),
        };
      })
    );

    return {
      startDate: args.startDate,
      days,
    };
  },
});

export const searchStudyItemsForTodo = query({
  args: {
    date: v.number(),
    searchText: v.string(),
  },
  handler: async (ctx, args) => {
    const normalizedSearchText = normalizeStudyItemSearchQuery(args.searchText);
    if (normalizedSearchText.length === 0) {
      return [];
    }

    const scheduledTasks = await ctx.db
      .query("todoTasks")
      .withIndex("by_date_and_startTimeMinutes", (q) => q.eq("date", args.date))
      .collect();

    const scheduledStudyItemIds = new Set(
      scheduledTasks.map((todoTask) => todoTask.studyItemId),
    );

    const matchingStudyItems = await ctx.db
      .query("studyItems")
      .withSearchIndex("search_searchText", (q) =>
        q.search("searchText", normalizedSearchText).eq("isCompleted", false)
      )
      .take(36);

    const fallbackStudyItems =
      matchingStudyItems.length >= 12
        ? []
        : await ctx.db
            .query("studyItems")
            .withIndex("by_isCompleted", (q) => q.eq("isCompleted", false))
            .take(200);

    const candidateStudyItems = new Map<string, Doc<"studyItems">>();

    for (const studyItem of [...matchingStudyItems, ...fallbackStudyItems]) {
      if (scheduledStudyItemIds.has(studyItem._id)) {
        continue;
      }

      candidateStudyItems.set(studyItem._id, studyItem);
    }

    const rankedResults = await Promise.all(
      Array.from(candidateStudyItems.values()).map(async (studyItem) => {
        const [subject, chapter, concept] = await Promise.all([
          ctx.db.get(studyItem.subjectId),
          ctx.db.get(studyItem.chapterId),
          studyItem.conceptId
            ? ctx.db.get(studyItem.conceptId)
            : Promise.resolve(null),
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
        const score = scoreStudyItemSearchMatch({
          query: normalizedSearchText,
          titleAliases: searchArtifacts.titleAliases,
          contextAliases: searchArtifacts.contextAliases,
        });

        if (score === 0) {
          return null;
        }

        return {
          _id: studyItem._id,
          title: studyItem.title,
          subjectName: subject.name,
          chapterName: chapter.name,
          conceptName: concept?.name,
          subjectColor: subject.color ?? "gray",
          estimatedMinutes: studyItem.estimatedMinutes,
          score,
        };
      }),
    );

    return rankedResults
      .filter(
        (
          result,
        ): result is NonNullable<(typeof rankedResults)[number]> => result !== null,
      )
      .sort((left, right) => {
        if (right.score !== left.score) {
          return right.score - left.score;
        }

        return left.title.localeCompare(right.title);
      })
      .slice(0, 12)
      .map((result) => ({
        _id: result._id,
        title: result.title,
        subjectName: result.subjectName,
        chapterName: result.chapterName,
        conceptName: result.conceptName,
        subjectColor: result.subjectColor,
        estimatedMinutes: result.estimatedMinutes,
      }));
  },
});

export const getSubjectsForFilter = query({
  args: {},
  handler: async (ctx) => {
    const subjects = await ctx.db.query("subjects").collect();
    return subjects.map((s) => ({
      _id: s._id,
      name: s.name,
      color: s.color,
      icon: s.icon,
    }));
  },
});

// ── Count studyItems by type ─────────────────────────────────────
export const countStudyItemsByType = query({
  args: { subjectId: v.id("subjects"), type: v.string() },
  handler: async (ctx, args) => {
    const items = await ctx.db
      .query("studyItems")
      .withIndex("by_subject", (q) => q.eq("subjectId", args.subjectId))
      .filter((q) => q.eq(q.field("type"), args.type))
      .collect();
    return items.length;
  },
});
// ── Full chapter page data ───────────────────────────────────────
// Returns subject + chapter + concepts with studyItems
// Used by /subjects/[slug]/[chapterSlug] page
export const getChapterPageData = query({
  args: { subjectSlug: v.string(), chapterSlug: v.string() },
  handler: async (ctx, args) => {
    const subject = await ctx.db
      .query("subjects")
      .withIndex("by_slug", (q) => q.eq("slug", args.subjectSlug))
      .unique();

    if (!subject) return null;

    const chapter = await ctx.db
      .query("chapters")
      .withIndex("by_subject_slug", (q) =>
        q.eq("subjectId", subject._id).eq("slug", args.chapterSlug)
      )
      .unique();

    if (!chapter) return null;

    const concepts = await ctx.db
      .query("concepts")
      .withIndex("by_chapter", (q) => q.eq("chapterId", chapter._id))
      .collect();

    // Sort concepts by order
    concepts.sort((a, b) => a.order - b.order);

    const conceptsWithData = await Promise.all(
      concepts.map(async (concept) => {
        const studyItems = await ctx.db
          .query("studyItems")
          .withIndex("by_concept", (q) => q.eq("conceptId", concept._id))
          .collect();

        // Build tracker data
        const trackerData = subject.conceptTrackers.map((tracker) => {
          const matchingItem = studyItems.find((si) => si.type === tracker.key);
          return {
            key: tracker.key,
            isCompleted: matchingItem?.isCompleted ?? false,
            score: matchingItem?.completionScore ?? undefined,
            studyItemId: matchingItem?._id,
          };
        });

        // Concept status
        const totalItems = subject.conceptTrackers.length;
        const completedItems = studyItems.filter((si) => si.isCompleted).length;
        let status: "NOT_STARTED" | "IN_PROGRESS" | "READY" = "NOT_STARTED";
        if (totalItems > 0 && completedItems === totalItems) {
          status = "READY";
        } else if (completedItems > 0) {
          status = "IN_PROGRESS";
        }

        return {
          ...concept,
          trackerData,
          status,
          totalItems,
          completedItems,
        };
      })
    );

    // Chapter progress
    const totalAllItems = conceptsWithData.reduce((sum, c) => sum + c.totalItems, 0);
    const completedAllItems = conceptsWithData.reduce((sum, c) => sum + c.completedItems, 0);
    const progressPercentage = totalAllItems === 0 ? 0 : Math.round((completedAllItems / totalAllItems) * 100);

    return {
      subject,
      chapter,
      concepts: conceptsWithData,
      progressPercentage,
    };
  },
});

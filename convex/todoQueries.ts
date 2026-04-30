import { query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { v } from "convex/values";
import {
  filterOwnedDocuments,
  requireCurrentUser,
} from "./auth";
import {
  buildStudyItemSearchArtifacts,
  normalizeStudyItemSearchQuery,
  scoreStudyItemSearchMatch,
} from "./studyItemSearch";

const DAY_MS = 86400000;

function getDhakaDayBucket(timestamp: number) {
  const dhakaOffset = 6 * 60 * 60 * 1000;
  const dhakaTime = new Date(timestamp + dhakaOffset);
  dhakaTime.setUTCHours(0, 0, 0, 0);
  return dhakaTime.getTime() - dhakaOffset;
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

export const getTodoAgenda = query({
  args: {
    startDate: v.number(),
    days: v.number(),
  },
  handler: async (ctx, args) => {
    const currentUser = await requireCurrentUser(ctx);
    const clampedDays = Math.max(1, Math.min(args.days, 31));
    const endDate = args.startDate + (clampedDays - 1) * DAY_MS;

    const todoTasks = filterOwnedDocuments(
      currentUser,
      await ctx.db
        .query("todoTasks")
        .withIndex("by_date", (q) =>
          q.gte("date", args.startDate).lte("date", endDate),
        )
        .collect(),
    );

    const tasksByDate = new Map<number, typeof todoTasks>();
    for (const todoTask of todoTasks) {
      const current = tasksByDate.get(todoTask.date) ?? [];
      current.push(todoTask);
      tasksByDate.set(todoTask.date, current);
    }

    const days = await Promise.all(
      Array.from({ length: clampedDays }, async (_, index) => {
        const date = args.startDate + index * DAY_MS;
        const dayTasks = tasksByDate.get(date) ?? [];

        const hydratedTasks = await Promise.all(
          dayTasks.map(async (todoTask) => {
            const kind = todoTask.kind ?? "study_item";

            if (kind === "concept_review") {
              if (!todoTask.conceptId) {
                return null;
              }

              const concept = await ctx.db.get(todoTask.conceptId);
              if (!concept || !filterOwnedDocuments(currentUser, [concept]).length) {
                return null;
              }

              const chapter = await ctx.db.get(concept.chapterId);
              if (!chapter) {
                return null;
              }

              const subject = await ctx.db.get(chapter.subjectId);
              if (!subject) {
                return null;
              }

              return {
                id: todoTask._id,
                kind: "concept_review" as const,
                conceptId: concept._id,
                title: `${concept.name} - Revision`,
                isCompleted:
                  concept.lastReviewedAt !== undefined &&
                  getDhakaDayBucket(concept.lastReviewedAt) === todoTask.date,
                subjectName: subject.name,
                chapterName: chapter.name,
                conceptName: concept.name,
                subjectColor: subject.color ?? "gray",
                startTimeMinutes: todoTask.startTimeMinutes,
                durationMinutes: todoTask.durationMinutes,
                source: todoTask.source,
                sortOrder:
                  todoTask.sortOrder ??
                  todoTask.startTimeMinutes ??
                  todoTask._creationTime,
              };
            }

            if (!todoTask.studyItemId) {
              return null;
            }

            const studyItem = await ctx.db.get(todoTask.studyItemId);
            if (!studyItem || !filterOwnedDocuments(currentUser, [studyItem]).length) {
              return null;
            }

            const [subject, chapter] = await Promise.all([
              ctx.db.get(studyItem.subjectId),
              ctx.db.get(studyItem.chapterId),
            ]);

            if (!subject || !chapter) {
              return null;
            }

            return {
              id: todoTask._id,
              kind: "study_item" as const,
              studyItemId: studyItem._id,
              title: studyItem.title,
              isCompleted: studyItem.isCompleted,
              subjectName: subject.name,
              chapterName: chapter.name,
              conceptName: undefined,
              subjectColor: subject.color ?? "gray",
              startTimeMinutes: todoTask.startTimeMinutes,
              durationMinutes: todoTask.durationMinutes,
              source: todoTask.source,
              sortOrder:
                todoTask.sortOrder ??
                todoTask.startTimeMinutes ??
                todoTask._creationTime,
            };
          }),
        );

        const validTasks = hydratedTasks.filter(
          (
            task,
          ): task is NonNullable<(typeof hydratedTasks)[number]> => task !== null,
        );

        return {
          date,
          scheduledTasks: validTasks
            .filter((task) => task.startTimeMinutes !== undefined)
            .sort((a, b) => (a.startTimeMinutes ?? 0) - (b.startTimeMinutes ?? 0)),
          unscheduledTasks: validTasks
            .filter((task) => task.startTimeMinutes === undefined)
            .sort((a, b) => a.sortOrder - b.sortOrder),
        };
      }),
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
    const currentUser = await requireCurrentUser(ctx);
    const normalizedSearchText = normalizeStudyItemSearchQuery(args.searchText);
    if (normalizedSearchText.length === 0) {
      return [];
    }

    const todoTasks = filterOwnedDocuments(
      currentUser,
      await ctx.db
        .query("todoTasks")
        .withIndex("by_date", (q) => q.eq("date", args.date))
        .collect(),
    );

    const scheduledStudyItemIds = new Set(
      todoTasks
        .map((todoTask) => todoTask.studyItemId)
        .filter((studyItemId): studyItemId is Doc<"studyItems">["_id"] =>
          studyItemId !== undefined,
        ),
    );

    const matchingStudyItems = await ctx.db
      .query("studyItems")
      .withSearchIndex("search_searchText", (q) =>
        q
          .search("searchText", normalizedSearchText)
          .eq("userId", currentUser._id)
          .eq("isCompleted", false),
      )
      .take(36);

    const fallbackStudyItems = filterOwnedDocuments(
      currentUser,
      await ctx.db
        .query("studyItems")
        .withIndex("by_isCompleted", (q) => q.eq("isCompleted", false))
        .take(200),
    );

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

import { query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { v } from "convex/values";
import {
  filterOwnedDocuments,
  isLegacyWorkspaceOwner,
  requireCurrentUser,
} from "./auth";
import {
  buildStudyItemSearchArtifacts,
  normalizeStudyItemSearchQuery,
  scoreStudyItemSearchMatch,
} from "./studyItemSearch";
import { getTodoStudyItemSearchDigestMigrationStatus } from "./todoStudyItemSearchDigests";

const DAY_MS = 86400000;
const TODO_SEARCH_RESULT_LIMIT = 12;
const TODO_SEARCH_INDEX_LIMIT = 36;
const TODO_SEARCH_FALLBACK_LIMIT = 60;

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

    const todoTasks = currentUser.legacyWorkspaceOwner
      ? filterOwnedDocuments(
          currentUser,
          await ctx.db
            .query("todoTasks")
            .withIndex("by_date", (q) =>
              q.gte("date", args.startDate).lte("date", endDate),
            )
            .collect(),
        )
      : await ctx.db
          .query("todoTasks")
          .withIndex("by_userId_and_date", (q) =>
            q
              .eq("userId", currentUser._id)
              .gte("date", args.startDate)
              .lte("date", endDate),
          )
          .collect();

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

            if (kind === "custom") {
              if (!todoTask.customTitle) {
                return null;
              }

              return {
                id: todoTask._id,
                kind: "custom" as const,
                title: todoTask.customTitle,
                isCompleted: todoTask.isCompleted ?? false,
                subjectName: undefined,
                chapterName: undefined,
                conceptName: undefined,
                subjectColor: todoTask.customColor ?? "gray",
                customColor: todoTask.customColor ?? "gray",
                startTimeMinutes: todoTask.startTimeMinutes,
                durationMinutes: todoTask.durationMinutes,
                source: todoTask.source,
                sortOrder:
                  todoTask.sortOrder ??
                  todoTask.startTimeMinutes ??
                  todoTask._creationTime,
              };
            }

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

            return {
              id: todoTask._id,
              kind: "study_item" as const,
              studyItemId: studyItem._id,
              title: studyItem.title,
              isCompleted: studyItem.isCompleted,
              subjectName: subject.name,
              chapterName: chapter.name,
              conceptName: concept?.name,
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
          tasks: validTasks.sort((a, b) => {
            const aHasStartTime = a.startTimeMinutes !== undefined;
            const bHasStartTime = b.startTimeMinutes !== undefined;

            if (aHasStartTime && bHasStartTime) {
              return (a.startTimeMinutes ?? 0) - (b.startTimeMinutes ?? 0);
            }

            if (aHasStartTime) {
              return -1;
            }

            if (bHasStartTime) {
              return 1;
            }

            return a.sortOrder - b.sortOrder;
          }),
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
    if (normalizedSearchText.length < 2) {
      return [];
    }

    const todoTasks = isLegacyWorkspaceOwner(currentUser)
      ? filterOwnedDocuments(
          currentUser,
          await ctx.db
            .query("todoTasks")
            .withIndex("by_date", (q) => q.eq("date", args.date))
            .collect(),
        )
      : await ctx.db
          .query("todoTasks")
          .withIndex("by_userId_and_date", (q) =>
            q.eq("userId", currentUser._id).eq("date", args.date),
          )
          .collect();

    const scheduledStudyItemIds = new Set(
      todoTasks
        .map((todoTask) => todoTask.studyItemId)
        .filter((studyItemId): studyItemId is Doc<"studyItems">["_id"] =>
          studyItemId !== undefined,
        ),
    );

    const digestStatus = await getTodoStudyItemSearchDigestMigrationStatus(
      ctx,
      currentUser._id,
    );

    if (digestStatus?.status === "completed") {
      const matchingDigests = await ctx.db
        .query("todoStudyItemSearchDigests")
        .withSearchIndex("search_searchText", (q) =>
          q
            .search("searchText", normalizedSearchText)
            .eq("userId", currentUser._id)
            .eq("isCompleted", false),
        )
        .take(TODO_SEARCH_INDEX_LIMIT);

      return matchingDigests
        .filter((digest) => !scheduledStudyItemIds.has(digest.studyItemId))
        .map((digest) => {
          const score = scoreStudyItemSearchMatch({
            query: normalizedSearchText,
            titleAliases: [digest.title, digest.searchText],
            contextAliases: [
              digest.subjectName,
              digest.chapterName,
              digest.conceptName ?? "",
            ],
          });

          return {
            _id: digest.studyItemId,
            title: digest.title,
            subjectName: digest.subjectName,
            chapterName: digest.chapterName,
            conceptName: digest.conceptName,
            subjectColor: digest.subjectColor ?? "gray",
            estimatedMinutes: digest.estimatedMinutes,
            score,
          };
        })
        .filter((result) => result.score > 0)
        .sort((left, right) => {
          if (right.score !== left.score) {
            return right.score - left.score;
          }

          return left.title.localeCompare(right.title);
        })
        .slice(0, TODO_SEARCH_RESULT_LIMIT)
        .map((result) => ({
          _id: result._id,
          title: result.title,
          subjectName: result.subjectName,
          chapterName: result.chapterName,
          conceptName: result.conceptName,
          subjectColor: result.subjectColor,
          estimatedMinutes: result.estimatedMinutes,
        }));
    }

    const matchingStudyItems = await ctx.db
      .query("studyItems")
      .withSearchIndex("search_searchText", (q) =>
        q
          .search("searchText", normalizedSearchText)
          .eq("userId", currentUser._id)
          .eq("isCompleted", false),
      )
      .take(TODO_SEARCH_INDEX_LIMIT);

    const fallbackStudyItems =
      matchingStudyItems.length >= TODO_SEARCH_INDEX_LIMIT
        ? []
        : isLegacyWorkspaceOwner(currentUser)
          ? filterOwnedDocuments(
              currentUser,
              await ctx.db
                .query("studyItems")
                .withIndex("by_isCompleted", (q) => q.eq("isCompleted", false))
                .take(TODO_SEARCH_FALLBACK_LIMIT),
            )
          : await ctx.db
              .query("studyItems")
              .withIndex("by_userId_and_isCompleted", (q) =>
                q.eq("userId", currentUser._id).eq("isCompleted", false),
              )
              .take(TODO_SEARCH_FALLBACK_LIMIT);

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
      .slice(0, TODO_SEARCH_RESULT_LIMIT)
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

export const searchConceptReviewsForTodo = query({
  args: {
    date: v.number(),
    searchText: v.string(),
  },
  handler: async (ctx, args) => {
    const currentUser = await requireCurrentUser(ctx);
    const normalizedSearchText = normalizeStudyItemSearchQuery(args.searchText);
    if (normalizedSearchText.length < 2) {
      return [];
    }

    const defaultRevisionMinutesSetting = isLegacyWorkspaceOwner(currentUser)
      ? filterOwnedDocuments(
          currentUser,
          await ctx.db
            .query("settings")
            .withIndex("by_key", (q) => q.eq("key", "defaultRevisionMinutes"))
            .collect(),
        )[0]
      : await ctx.db
          .query("settings")
          .withIndex("by_userId_and_key", (q) =>
            q.eq("userId", currentUser._id).eq("key", "defaultRevisionMinutes"),
          )
          .unique();
    const defaultRevisionMinutes =
      typeof defaultRevisionMinutesSetting?.value === "number"
        ? defaultRevisionMinutesSetting.value
        : 15;

    const todoTasks = isLegacyWorkspaceOwner(currentUser)
      ? filterOwnedDocuments(
          currentUser,
          await ctx.db
            .query("todoTasks")
            .withIndex("by_date", (q) => q.eq("date", args.date))
            .collect(),
        )
      : await ctx.db
          .query("todoTasks")
          .withIndex("by_userId_and_date", (q) =>
            q.eq("userId", currentUser._id).eq("date", args.date),
          )
          .collect();

    const scheduledConceptIds = new Set(
      todoTasks
        .map((todoTask) => todoTask.conceptId)
        .filter((conceptId): conceptId is Doc<"concepts">["_id"] =>
          conceptId !== undefined,
        ),
    );

    const concepts = currentUser.legacyWorkspaceOwner
      ? filterOwnedDocuments(currentUser, [
          ...(await ctx.db
            .query("concepts")
            .withIndex("by_userId_and_nextReviewAt", (q) =>
              q.eq("userId", currentUser._id).gte("nextReviewAt", 0),
            )
            .take(120)),
          ...(await ctx.db
            .query("concepts")
            .withIndex("by_userId_and_nextReviewAt", (q) =>
              q.eq("userId", undefined).gte("nextReviewAt", 0),
            )
            .take(120)),
        ])
      : await ctx.db
          .query("concepts")
          .withIndex("by_userId_and_nextReviewAt", (q) =>
            q.eq("userId", currentUser._id).gte("nextReviewAt", 0),
          )
          .take(120);

    const rankedResults = await Promise.all(
      concepts
        .filter(
          (concept) =>
            concept.nextReviewAt !== undefined &&
            !scheduledConceptIds.has(concept._id),
        )
        .map(async (concept) => {
          const nextReviewAt = concept.nextReviewAt;
          if (nextReviewAt === undefined) {
            return null;
          }

          const chapter = await ctx.db.get(concept.chapterId);
          const subject = chapter ? await ctx.db.get(chapter.subjectId) : null;

          if (!chapter || !subject) {
            return null;
          }

          const searchArtifacts = buildStudyItemSearchArtifacts({
            baseName: concept.name,
            trackerLabel: "Revision",
            subjectName: subject.name,
            chapterName: chapter.name,
            conceptName: concept.name,
            title: `${concept.name} - Revision`,
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
            _id: concept._id,
            title: `${concept.name} - Revision`,
            conceptName: concept.name,
            subjectName: subject.name,
            chapterName: chapter.name,
            subjectColor: subject.color ?? "gray",
            nextReviewAt,
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
      .slice(0, TODO_SEARCH_RESULT_LIMIT)
      .map((result) => ({
        _id: result._id,
        title: result.title,
        conceptName: result.conceptName,
        subjectName: result.subjectName,
        chapterName: result.chapterName,
        subjectColor: result.subjectColor,
        nextReviewAt: result.nextReviewAt,
        estimatedMinutes: defaultRevisionMinutes,
      }));
  },
});

import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { query, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import {
  assertCanAccessOwnedDocument,
  filterOwnedDocuments,
  isLegacyWorkspaceOwner,
  requireCurrentUser,
  type CurrentUser,
} from "./auth";
import {
  getChapterLazyCreationStatus,
  getSubjectLazyCreationStatus,
  getSyllabusSummaryMigrationStatus,
} from "./syllabusSummaries";

function paginateResults<T>(
  items: T[],
  paginationOpts: { cursor: string | null; numItems: number },
) {
  const startIndex = paginationOpts.cursor
    ? Number.parseInt(paginationOpts.cursor, 10)
    : 0;
  const safeStartIndex =
    Number.isFinite(startIndex) && startIndex >= 0 ? startIndex : 0;
  const page = items.slice(
    safeStartIndex,
    safeStartIndex + paginationOpts.numItems,
  );
  const nextIndex = safeStartIndex + page.length;

  return {
    page,
    isDone: nextIndex >= items.length,
    continueCursor: String(nextIndex),
  };
}

async function getSubjectBySlugForUser(
  ctx: QueryCtx,
  currentUser: CurrentUser,
  slug: string,
) {
  const ownedSubject = await ctx.db
    .query("subjects")
    .withIndex("by_userId_and_slug", (q) =>
      q.eq("userId", currentUser._id).eq("slug", slug),
    )
    .unique();

  if (ownedSubject) {
    return ownedSubject;
  }

  if (!isLegacyWorkspaceOwner(currentUser)) {
    return null;
  }

  const legacySubject = await ctx.db
    .query("subjects")
    .withIndex("by_slug", (q) => q.eq("slug", slug))
    .unique();

  if (!legacySubject || legacySubject.userId !== undefined) {
    return null;
  }

  return legacySubject;
}

function getDhakaDayBucket(timestamp: number) {
  const dhakaOffset = 6 * 60 * 60 * 1000;
  const dhakaTime = new Date(timestamp + dhakaOffset);
  dhakaTime.setUTCHours(0, 0, 0, 0);
  return dhakaTime.getTime() - dhakaOffset;
}

async function getOwnedSubjects(ctx: QueryCtx, currentUser: CurrentUser) {
  const ownedSubjects = await ctx.db
    .query("subjects")
    .withIndex("by_userId", (q) => q.eq("userId", currentUser._id))
    .collect();

  if (!isLegacyWorkspaceOwner(currentUser)) {
    return ownedSubjects;
  }

  const legacySubjects = await ctx.db
    .query("subjects")
    .withIndex("by_userId", (q) => q.eq("userId", undefined))
    .collect();

  return [...ownedSubjects, ...legacySubjects];
}

async function getOwnedChaptersForSubject(
  ctx: QueryCtx,
  currentUser: CurrentUser,
  subjectId: Id<"subjects">,
) {
  if (isLegacyWorkspaceOwner(currentUser)) {
    return filterOwnedDocuments(
      currentUser,
      await ctx.db
        .query("chapters")
        .withIndex("by_subject", (q) => q.eq("subjectId", subjectId))
        .collect(),
    );
  }

  return await ctx.db
    .query("chapters")
    .withIndex("by_userId_and_subjectId", (q) =>
      q.eq("userId", currentUser._id).eq("subjectId", subjectId),
    )
    .collect();
}

async function getOwnedStudyItemsForChapter(
  ctx: QueryCtx,
  currentUser: CurrentUser,
  chapterId: Id<"chapters">,
) {
  if (isLegacyWorkspaceOwner(currentUser)) {
    return filterOwnedDocuments(
      currentUser,
      await ctx.db
        .query("studyItems")
        .withIndex("by_chapter", (q) => q.eq("chapterId", chapterId))
        .collect(),
    );
  }

  return await ctx.db
    .query("studyItems")
    .withIndex("by_userId_and_chapterId", (q) =>
      q.eq("userId", currentUser._id).eq("chapterId", chapterId),
    )
    .collect();
}

async function getOwnedStudyItemsForSubject(
  ctx: QueryCtx,
  currentUser: CurrentUser,
  subjectId: Id<"subjects">,
) {
  if (isLegacyWorkspaceOwner(currentUser)) {
    return filterOwnedDocuments(
      currentUser,
      await ctx.db
        .query("studyItems")
        .withIndex("by_subject", (q) => q.eq("subjectId", subjectId))
        .collect(),
    );
  }

  return await ctx.db
    .query("studyItems")
    .withIndex("by_userId_and_subjectId", (q) =>
      q.eq("userId", currentUser._id).eq("subjectId", subjectId),
    )
    .collect();
}

async function getOwnedStudyItemsForConcept(
  ctx: QueryCtx,
  currentUser: CurrentUser,
  conceptId: Id<"concepts">,
) {
  if (isLegacyWorkspaceOwner(currentUser)) {
    return filterOwnedDocuments(
      currentUser,
      await ctx.db
        .query("studyItems")
        .withIndex("by_concept", (q) => q.eq("conceptId", conceptId))
        .collect(),
    );
  }

  return await ctx.db
    .query("studyItems")
    .withIndex("by_userId_and_conceptId", (q) =>
      q.eq("userId", currentUser._id).eq("conceptId", conceptId),
    )
    .collect();
}

async function getOwnedConceptsForChapter(
  ctx: QueryCtx,
  currentUser: CurrentUser,
  chapterId: Id<"chapters">,
) {
  if (isLegacyWorkspaceOwner(currentUser)) {
    return filterOwnedDocuments(
      currentUser,
      await ctx.db
        .query("concepts")
        .withIndex("by_chapter", (q) => q.eq("chapterId", chapterId))
        .collect(),
    );
  }

  return await ctx.db
    .query("concepts")
    .withIndex("by_userId_and_chapterId", (q) =>
      q.eq("userId", currentUser._id).eq("chapterId", chapterId),
    )
    .collect();
}

async function getOwnedConcepts(ctx: QueryCtx, currentUser: CurrentUser) {
  const ownedConcepts = await ctx.db
    .query("concepts")
    .withIndex("by_userId", (q) => q.eq("userId", currentUser._id))
    .collect();

  if (!isLegacyWorkspaceOwner(currentUser)) {
    return ownedConcepts;
  }

  const legacyConcepts = await ctx.db
    .query("concepts")
    .withIndex("by_userId", (q) => q.eq("userId", undefined))
    .collect();

  return [...ownedConcepts, ...legacyConcepts];
}

export const getStudyLogsFeed = query({
  args: {
    paginationOpts: paginationOptsValidator,
    subjectId: v.optional(v.id("subjects")),
    eventType: v.optional(
      v.union(
        v.literal("study_item_completed"),
        v.literal("study_item_uncompleted"),
        v.literal("concept_review"),
      ),
    ),
    editableOnly: v.optional(v.boolean()),
    dayBucket: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const currentUser = await requireCurrentUser(ctx);

    if (args.subjectId) {
      const subject = await ctx.db.get(args.subjectId);
      if (!subject) {
        return paginateResults([], args.paginationOpts);
      }
      assertCanAccessOwnedDocument(currentUser, subject);
    }

    if (!isLegacyWorkspaceOwner(currentUser)) {
      if (
        args.subjectId &&
        args.eventType &&
        !args.editableOnly &&
        args.dayBucket === undefined
      ) {
        return await ctx.db
          .query("studyLogs")
          .withIndex("by_userId_and_subjectId_and_eventType_and_loggedAt", (q) =>
            q
              .eq("userId", currentUser._id)
              .eq("subjectId", args.subjectId!)
              .eq("eventType", args.eventType!),
          )
          .order("desc")
          .paginate(args.paginationOpts);
      }

      if (args.subjectId && !args.eventType && !args.editableOnly && args.dayBucket === undefined) {
        return await ctx.db
          .query("studyLogs")
          .withIndex("by_userId_and_subjectId_and_loggedAt", (q) =>
            q.eq("userId", currentUser._id).eq("subjectId", args.subjectId!),
          )
          .order("desc")
          .paginate(args.paginationOpts);
      }

      if (!args.subjectId && args.eventType && !args.editableOnly && args.dayBucket === undefined) {
        return await ctx.db
          .query("studyLogs")
          .withIndex("by_userId_and_eventType_and_loggedAt", (q) =>
            q.eq("userId", currentUser._id).eq("eventType", args.eventType!),
          )
          .order("desc")
          .paginate(args.paginationOpts);
      }

      if (!args.subjectId && !args.eventType && args.editableOnly && args.dayBucket === undefined) {
        return await ctx.db
          .query("studyLogs")
          .withIndex("by_userId_and_isEditable_and_loggedAt", (q) =>
            q.eq("userId", currentUser._id).eq("isEditable", true),
          )
          .order("desc")
          .paginate(args.paginationOpts);
      }

      if (
        !args.subjectId &&
        !args.eventType &&
        !args.editableOnly &&
        args.dayBucket !== undefined
      ) {
        return await ctx.db
          .query("studyLogs")
          .withIndex("by_userId_and_dayBucket", (q) =>
            q.eq("userId", currentUser._id).eq("dayBucket", args.dayBucket!),
          )
          .order("desc")
          .paginate(args.paginationOpts);
      }

      if (
        !args.subjectId &&
        !args.eventType &&
        !args.editableOnly &&
        args.dayBucket === undefined
      ) {
        return await ctx.db
          .query("studyLogs")
          .withIndex("by_userId_and_loggedAt", (q) =>
            q.eq("userId", currentUser._id),
          )
          .order("desc")
          .paginate(args.paginationOpts);
      }
    }

    const baseLogs = isLegacyWorkspaceOwner(currentUser)
      ? [
          ...(await ctx.db
            .query("studyLogs")
            .withIndex("by_userId_and_loggedAt", (q) =>
              q.eq("userId", currentUser._id),
            )
            .order("desc")
            .collect()),
          ...(await ctx.db
            .query("studyLogs")
            .withIndex("by_userId_and_loggedAt", (q) =>
              q.eq("userId", undefined),
            )
            .order("desc")
            .collect()),
        ]
      : await ctx.db
          .query("studyLogs")
          .withIndex("by_userId_and_loggedAt", (q) =>
            q.eq("userId", currentUser._id),
          )
          .order("desc")
          .collect();

    const studyLogs = baseLogs
      .filter((log) => (args.subjectId ? log.subjectId === args.subjectId : true))
      .filter((log) => (args.eventType ? log.eventType === args.eventType : true))
      .filter((log) => (args.editableOnly ? log.isEditable : true))
      .filter((log) =>
        args.dayBucket !== undefined ? log.dayBucket === args.dayBucket : true,
      )
      .sort((left, right) => right.loggedAt - left.loggedAt);

    return paginateResults(studyLogs, args.paginationOpts);
  },
});

export const getStudyLogSubjectsFilterData = query({
  args: {},
  handler: async (ctx) => {
    const currentUser = await requireCurrentUser(ctx);
    const subjects = await getOwnedSubjects(ctx, currentUser);

    return subjects.map((subject) => ({
      _id: subject._id,
      name: subject.name,
    }));
  },
});

export const getChapterStudyItems = query({
  args: { chapterId: v.id("chapters") },
  handler: async (ctx, args) => {
    const currentUser = await requireCurrentUser(ctx);
    const chapter = await ctx.db.get(args.chapterId);
    if (!chapter) {
      return [];
    }
    assertCanAccessOwnedDocument(currentUser, chapter);

    const studyItems = await getOwnedStudyItemsForChapter(
      ctx,
      currentUser,
      args.chapterId,
    );

    return studyItems.filter((studyItem) => studyItem.conceptId === undefined);
  },
});

export const getSubjectPageData = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const currentUser = await requireCurrentUser(ctx);
    const subject = await getSubjectBySlugForUser(ctx, currentUser, args.slug);

    if (!subject) {
      return null;
    }

    const chapters = (
      await getOwnedChaptersForSubject(ctx, currentUser, subject._id)
    ).sort((left, right) => left.order - right.order);

    const summaryStatus = await getSyllabusSummaryMigrationStatus(
      ctx,
      currentUser._id,
    );
    const lazyStatus = await getSubjectLazyCreationStatus(
      ctx,
      currentUser._id,
      subject._id,
    );
    const needsSummaryBackfill = summaryStatus?.status !== "completed";
    const needsEnsureChapterStudyItems =
      subject.chapterTrackers.length > 0 && lazyStatus?.status !== "completed";

    const buildFallback = async () => {
      return await Promise.all(
        chapters.map(async (chapter) => {
          const chapterStudyItems = await getOwnedStudyItemsForChapter(
            ctx,
            currentUser,
            chapter._id,
          );
          const chapterLevelItems = chapterStudyItems.filter(
            (studyItem) => studyItem.conceptId === undefined,
          );
          const conceptLevelItems = chapterStudyItems.filter(
            (studyItem) => studyItem.conceptId !== undefined,
          );
          const concepts = await getOwnedConceptsForChapter(
            ctx,
            currentUser,
            chapter._id,
          );

          let completedConceptCount = 0;
          if (subject.conceptTrackers.length > 0) {
            for (const concept of concepts) {
              const conceptItems = conceptLevelItems.filter(
                (studyItem) => studyItem.conceptId === concept._id,
              );
              const allDone =
                conceptItems.length >= subject.conceptTrackers.length &&
                conceptItems.every((studyItem) => studyItem.isCompleted);
              if (allDone) {
                completedConceptCount += 1;
              }
            }
          }

          const trackerData = subject.chapterTrackers.map((tracker) => {
            const matchingItem = chapterLevelItems.find(
              (studyItem) => studyItem.type === tracker.key,
            );
            return {
              key: tracker.key,
              isCompleted: matchingItem?.isCompleted ?? false,
              score: matchingItem?.completionScore ?? undefined,
              studyItemId: matchingItem?._id,
            };
          });

          const totalItems = chapterStudyItems.length;
          const completedItems = chapterStudyItems.filter(
            (studyItem) => studyItem.isCompleted,
          ).length;

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
        }),
      );
    };

    let chaptersWithData: Array<
      Doc<"chapters"> & {
        totalConcepts: number;
        completedConcepts: number;
        trackerData: Array<{
          key: string;
          isCompleted: boolean;
          score?: number;
          studyItemId?: Id<"studyItems">;
        }>;
        status: "NOT_STARTED" | "IN_PROGRESS" | "READY";
        totalItems: number;
        completedItems: number;
      }
    >;

    if (needsSummaryBackfill) {
      chaptersWithData = await buildFallback();
    } else {
      const [cells, chapterStats, conceptsBySubject, conceptStats] =
        await Promise.all([
          ctx.db
            .query("syllabusStudyItemCells")
            .withIndex("by_userId_and_subjectId", (q) =>
              q.eq("userId", currentUser._id).eq("subjectId", subject._id),
            )
            .collect(),
          ctx.db
            .query("studyItemChapterStats")
            .withIndex("by_userId_and_subjectId", (q) =>
              q.eq("userId", currentUser._id).eq("subjectId", subject._id),
            )
            .collect(),
          Promise.all(
            chapters.map(async (chapter) => ({
              chapterId: chapter._id,
              concepts: await getOwnedConceptsForChapter(
                ctx,
                currentUser,
                chapter._id,
              ),
            })),
          ),
          ctx.db
            .query("studyItemConceptStats")
            .withIndex("by_userId_and_subjectId", (q) =>
              q.eq("userId", currentUser._id).eq("subjectId", subject._id),
            )
            .collect(),
        ]);

      const cellByChapterAndTracker = new Map<string, (typeof cells)[number]>();
      for (const cell of cells) {
        if (cell.conceptId === undefined) {
          cellByChapterAndTracker.set(`${cell.chapterId}:${cell.trackerKey}`, cell);
        }
      }
      const chapterStatByChapter = new Map(
        chapterStats.map((stat) => [stat.chapterId, stat]),
      );
      const conceptsByChapter = new Map(
        conceptsBySubject.map((entry) => [entry.chapterId, entry.concepts]),
      );
      const conceptStatByConcept = new Map(
        conceptStats.map((stat) => [stat.conceptId, stat]),
      );

      let hasMissingSummary = false;
      chaptersWithData = chapters.map((chapter) => {
        const stat = chapterStatByChapter.get(chapter._id);
        const concepts = conceptsByChapter.get(chapter._id) ?? [];
        const trackerData = subject.chapterTrackers.map((tracker) => {
          const cell = cellByChapterAndTracker.get(`${chapter._id}:${tracker.key}`);
          if (!cell) {
            hasMissingSummary = true;
          }
          return {
            key: tracker.key,
            isCompleted: cell?.isCompleted ?? false,
            score: cell?.completionScore ?? undefined,
            studyItemId: cell?.studyItemId,
          };
        });

        let completedConceptCount = 0;
        if (subject.conceptTrackers.length > 0) {
          for (const concept of concepts) {
            const conceptStat = conceptStatByConcept.get(concept._id);
            if (!conceptStat) {
              hasMissingSummary = true;
              continue;
            }
            if (
              conceptStat.totalItems >= subject.conceptTrackers.length &&
              conceptStat.completedItems === conceptStat.totalItems
            ) {
              completedConceptCount += 1;
            }
          }
        }

        if (!stat && (subject.chapterTrackers.length > 0 || subject.conceptTrackers.length > 0)) {
          hasMissingSummary = true;
        }

        const totalItems = stat?.totalItems ?? 0;
        const completedItems = stat?.completedItems ?? 0;
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
      });

      if (hasMissingSummary) {
        chaptersWithData = await buildFallback();
      }
    }

    const totalItems = chaptersWithData.reduce(
      (sum, chapter) => sum + chapter.totalItems,
      0,
    );
    const completedItems = chaptersWithData.reduce(
      (sum, chapter) => sum + chapter.completedItems,
      0,
    );

    return {
      subject,
      chapters: chaptersWithData,
      progressPercentage:
        totalItems === 0 ? 0 : Math.round((completedItems / totalItems) * 100),
      totalItems,
      completedItems,
      needsSummaryBackfill,
      needsEnsureChapterStudyItems,
    };
  },
});

export const getSubjectsWithStats = query({
  args: {},
  handler: async (ctx) => {
    const currentUser = await requireCurrentUser(ctx);
    const subjects = await getOwnedSubjects(ctx, currentUser);
    const summaryStatus = await getSyllabusSummaryMigrationStatus(
      ctx,
      currentUser._id,
    );

    const buildFallbackSubject = async (subject: Doc<"subjects">) => {
      const chapters = await getOwnedChaptersForSubject(
        ctx,
        currentUser,
        subject._id,
      );

      let totalItems = 0;
      let completedItems = 0;
      let completedChapters = 0;

      for (const chapter of chapters) {
        const studyItems = await getOwnedStudyItemsForChapter(
          ctx,
          currentUser,
          chapter._id,
        );

        totalItems += studyItems.length;
        completedItems += studyItems.filter((studyItem) => studyItem.isCompleted).length;

        if (
          studyItems.length > 0 &&
          studyItems.every((studyItem) => studyItem.isCompleted)
        ) {
          completedChapters += 1;
        }
      }

      return {
        ...subject,
        stats: {
          totalChapters: chapters.length,
          completedChapters,
          tasksPending: totalItems - completedItems,
          progressPercentage:
            totalItems === 0 ? 0 : Math.round((completedItems / totalItems) * 100),
        },
      };
    };

    if (summaryStatus?.status !== "completed") {
      return await Promise.all(subjects.map(buildFallbackSubject));
    }

    const [chaptersBySubject, chapterStatsBySubject] = await Promise.all([
      Promise.all(
        subjects.map(async (subject) => ({
          subjectId: subject._id,
          chapters: await getOwnedChaptersForSubject(ctx, currentUser, subject._id),
        })),
      ),
      ctx.db
        .query("studyItemChapterStats")
        .withIndex("by_userId", (q) => q.eq("userId", currentUser._id))
        .collect(),
    ]);

    const chaptersBySubjectId = new Map(
      chaptersBySubject.map((entry) => [entry.subjectId, entry.chapters]),
    );
    const statsBySubjectId = new Map<Id<"subjects">, typeof chapterStatsBySubject>();
    for (const stat of chapterStatsBySubject) {
      const existing = statsBySubjectId.get(stat.subjectId) ?? [];
      existing.push(stat);
      statsBySubjectId.set(stat.subjectId, existing);
    }

    return await Promise.all(
      subjects.map(async (subject) => {
        const chapters = chaptersBySubjectId.get(subject._id) ?? [];
        const chapterStats = statsBySubjectId.get(subject._id) ?? [];
        const statChapterIds = new Set(chapterStats.map((stat) => stat.chapterId));
        const hasMissingStats = chapters.some((chapter) => !statChapterIds.has(chapter._id));

        if (hasMissingStats) {
          return await buildFallbackSubject(subject);
        }

        const totalItems = chapterStats.reduce((sum, stat) => sum + stat.totalItems, 0);
        const completedItems = chapterStats.reduce(
          (sum, stat) => sum + stat.completedItems,
          0,
        );
        const completedChapters = chapterStats.filter(
          (stat) => stat.totalItems > 0 && stat.completedItems === stat.totalItems,
        ).length;

        return {
          ...subject,
          stats: {
            totalChapters: chapters.length,
            completedChapters,
            tasksPending: totalItems - completedItems,
            progressPercentage:
              totalItems === 0 ? 0 : Math.round((completedItems / totalItems) * 100),
          },
        };
      }),
    );
  },
});

export const getReviewsDashboardData = query({
  args: {
    now: v.number(),
    subjectId: v.optional(v.id("subjects")),
  },
  handler: async (ctx, args) => {
    const currentUser = await requireCurrentUser(ctx);
    const startOfToday = getDhakaDayBucket(args.now);
    const endOfToday = startOfToday + 86400000 - 1;
    const upcomingEnd = args.now + 7 * 86400000;
    let subjectChapterIds: Set<Id<"chapters">> | null = null;

    if (args.subjectId) {
      const subjectId = args.subjectId;
      const subject = await ctx.db.get(args.subjectId);
      if (!subject) {
        return {
          stats: {
            overdueCount: 0,
            dueTodayCount: 0,
            upcomingCount: 0,
            completedTodayCount: 0,
          },
          overdue: [],
          dueToday: [],
          upcoming: [],
        };
      }
      assertCanAccessOwnedDocument(currentUser, subject);
      const chapters = await getOwnedChaptersForSubject(
        ctx,
        currentUser,
        subjectId,
      );
      subjectChapterIds = new Set(chapters.map((chapter) => chapter._id));
    }

    const concepts = isLegacyWorkspaceOwner(currentUser)
      ? await getOwnedConcepts(ctx, currentUser)
      : [
          ...(await ctx.db
            .query("concepts")
            .withIndex("by_userId_and_nextReviewAt", (q) =>
              q
                .eq("userId", currentUser._id)
                .lt("nextReviewAt", startOfToday),
            )
            .collect()),
          ...(await ctx.db
            .query("concepts")
            .withIndex("by_userId_and_nextReviewAt", (q) =>
              q
                .eq("userId", currentUser._id)
                .gte("nextReviewAt", startOfToday)
                .lte("nextReviewAt", endOfToday),
            )
            .collect()),
          ...(await ctx.db
            .query("concepts")
            .withIndex("by_userId_and_nextReviewAt", (q) =>
              q
                .eq("userId", currentUser._id)
                .gt("nextReviewAt", endOfToday)
                .lte("nextReviewAt", upcomingEnd),
            )
            .collect()),
        ];

    const filteredConcepts =
      subjectChapterIds === null
        ? concepts
        : concepts.filter((concept) => subjectChapterIds.has(concept.chapterId));

    const completedTodayLogs = (
      isLegacyWorkspaceOwner(currentUser)
        ? [
            ...(await ctx.db
              .query("studyLogs")
              .withIndex("by_userId_and_dayBucket", (q) =>
                q.eq("userId", currentUser._id).eq("dayBucket", startOfToday),
              )
              .collect()),
            ...(await ctx.db
              .query("studyLogs")
              .withIndex("by_userId_and_dayBucket", (q) =>
                q.eq("userId", undefined).eq("dayBucket", startOfToday),
              )
              .collect()),
          ]
        : await ctx.db
            .query("studyLogs")
            .withIndex("by_userId_and_dayBucket", (q) =>
              q.eq("userId", currentUser._id).eq("dayBucket", startOfToday),
            )
            .collect()
    ).filter((log) => log.eventType === "concept_review");

    const enrichedConcepts = await Promise.all(
      filteredConcepts
        .filter((concept) => concept.nextReviewAt !== undefined)
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
        }),
    );

    const overdue = enrichedConcepts
      .filter((concept) => concept.nextReviewAt! < startOfToday)
      .sort((left, right) => left.nextReviewAt! - right.nextReviewAt!);
    const dueToday = enrichedConcepts
      .filter(
        (concept) =>
          concept.nextReviewAt! >= startOfToday &&
          concept.nextReviewAt! <= endOfToday,
      )
      .sort((left, right) => left.nextReviewAt! - right.nextReviewAt!);
    const upcoming = enrichedConcepts
      .filter(
        (concept) =>
          concept.nextReviewAt! > endOfToday &&
          concept.nextReviewAt! <= args.now + 7 * 86400000,
      )
      .sort((left, right) => left.nextReviewAt! - right.nextReviewAt!);

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

export const getSubjectsForFilter = query({
  args: {},
  handler: async (ctx) => {
    const currentUser = await requireCurrentUser(ctx);
    const subjects = await getOwnedSubjects(ctx, currentUser);

    return subjects.map((subject) => ({
      _id: subject._id,
      name: subject.name,
      color: subject.color,
      icon: subject.icon,
    }));
  },
});

export const countStudyItemsByType = query({
  args: { subjectId: v.id("subjects"), type: v.string() },
  handler: async (ctx, args) => {
    const currentUser = await requireCurrentUser(ctx);
    const subject = await ctx.db.get(args.subjectId);
    if (!subject) {
      return 0;
    }
    assertCanAccessOwnedDocument(currentUser, subject);

    const studyItems = await getOwnedStudyItemsForSubject(
      ctx,
      currentUser,
      args.subjectId,
    );

    return studyItems.filter((studyItem) => studyItem.type === args.type).length;
  },
});

export const getChapterPageData = query({
  args: { subjectSlug: v.string(), chapterSlug: v.string() },
  handler: async (ctx, args) => {
    const currentUser = await requireCurrentUser(ctx);
    const subject = await getSubjectBySlugForUser(ctx, currentUser, args.subjectSlug);

    if (!subject) {
      return null;
    }

    const chapters = await getOwnedChaptersForSubject(
      ctx,
      currentUser,
      subject._id,
    );
    const chapter =
      chapters.find((entry) => entry.slug === args.chapterSlug) ?? null;

    if (!chapter) {
      return null;
    }

    const concepts = (
      await getOwnedConceptsForChapter(ctx, currentUser, chapter._id)
    ).sort((left, right) => left.order - right.order);

    const summaryStatus = await getSyllabusSummaryMigrationStatus(
      ctx,
      currentUser._id,
    );
    const lazyStatus = await getChapterLazyCreationStatus(
      ctx,
      currentUser._id,
      chapter._id,
    );
    const needsSummaryBackfill = summaryStatus?.status !== "completed";
    const needsEnsureConceptStudyItems =
      subject.conceptTrackers.length > 0 && lazyStatus?.status !== "completed";

    const buildFallback = async () => {
      return await Promise.all(
        concepts.map(async (concept) => {
          const studyItems = await getOwnedStudyItemsForConcept(
            ctx,
            currentUser,
            concept._id,
          );

          const trackerData = subject.conceptTrackers.map((tracker) => {
            const matchingItem = studyItems.find(
              (studyItem) => studyItem.type === tracker.key,
            );
            return {
              key: tracker.key,
              isCompleted: matchingItem?.isCompleted ?? false,
              score: matchingItem?.completionScore ?? undefined,
              studyItemId: matchingItem?._id,
            };
          });

          const totalItems = subject.conceptTrackers.length;
          const completedItems = studyItems.filter(
            (studyItem) => studyItem.isCompleted,
          ).length;

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
        }),
      );
    };

    let conceptsWithData: Array<
      Doc<"concepts"> & {
        trackerData: Array<{
          key: string;
          isCompleted: boolean;
          score?: number;
          studyItemId?: Id<"studyItems">;
        }>;
        status: "NOT_STARTED" | "IN_PROGRESS" | "READY";
        totalItems: number;
        completedItems: number;
      }
    >;

    if (needsSummaryBackfill) {
      conceptsWithData = await buildFallback();
    } else {
      const [cells, conceptStats] = await Promise.all([
        ctx.db
          .query("syllabusStudyItemCells")
          .withIndex("by_userId_and_chapterId", (q) =>
            q.eq("userId", currentUser._id).eq("chapterId", chapter._id),
          )
          .collect(),
        ctx.db
          .query("studyItemConceptStats")
          .withIndex("by_userId_and_chapterId", (q) =>
            q.eq("userId", currentUser._id).eq("chapterId", chapter._id),
          )
          .collect(),
      ]);

      const cellByConceptAndTracker = new Map<string, (typeof cells)[number]>();
      for (const cell of cells) {
        if (cell.conceptId !== undefined) {
          cellByConceptAndTracker.set(`${cell.conceptId}:${cell.trackerKey}`, cell);
        }
      }
      const statByConcept = new Map(
        conceptStats.map((stat) => [stat.conceptId, stat]),
      );

      let hasMissingSummary = false;
      conceptsWithData = concepts.map((concept) => {
        const trackerData = subject.conceptTrackers.map((tracker) => {
          const cell = cellByConceptAndTracker.get(`${concept._id}:${tracker.key}`);
          if (!cell) {
            hasMissingSummary = true;
          }
          return {
            key: tracker.key,
            isCompleted: cell?.isCompleted ?? false,
            score: cell?.completionScore ?? undefined,
            studyItemId: cell?.studyItemId,
          };
        });
        const stat = statByConcept.get(concept._id);
        if (!stat && subject.conceptTrackers.length > 0) {
          hasMissingSummary = true;
        }
        const totalItems = stat?.totalItems ?? subject.conceptTrackers.length;
        const completedItems = stat?.completedItems ?? 0;

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
      });

      if (hasMissingSummary) {
        conceptsWithData = await buildFallback();
      }
    }

    const totalItems = conceptsWithData.reduce(
      (sum, concept) => sum + concept.totalItems,
      0,
    );
    const completedItems = conceptsWithData.reduce(
      (sum, concept) => sum + concept.completedItems,
      0,
    );

    return {
      subject,
      chapter,
      concepts: conceptsWithData,
      progressPercentage:
        totalItems === 0 ? 0 : Math.round((completedItems / totalItems) * 100),
      needsSummaryBackfill,
      needsEnsureConceptStudyItems,
    };
  },
});

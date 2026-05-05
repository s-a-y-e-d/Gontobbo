import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { query, type QueryCtx } from "./_generated/server";
import {
  assertCanAccessOwnedDocument,
  filterOwnedDocuments,
  isLegacyWorkspaceOwner,
  requireCurrentUser,
  type CurrentUser,
} from "./auth";

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

    const studyLogs = filterOwnedDocuments(
      currentUser,
      await ctx.db.query("studyLogs").collect(),
    )
      .filter((log) => (args.subjectId ? log.subjectId === args.subjectId : true))
      .filter((log) => (args.eventType ? log.eventType === args.eventType : true))
      .filter((log) => (args.editableOnly ? log.isEditable : true))
      .filter((log) => (args.dayBucket !== undefined ? log.dayBucket === args.dayBucket : true))
      .sort((left, right) => right.loggedAt - left.loggedAt);

    return paginateResults(studyLogs, args.paginationOpts);
  },
});

export const getStudyLogSubjectsFilterData = query({
  args: {},
  handler: async (ctx) => {
    const currentUser = await requireCurrentUser(ctx);
    const subjects = filterOwnedDocuments(
      currentUser,
      await ctx.db.query("subjects").collect(),
    );

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

    const studyItems = filterOwnedDocuments(
      currentUser,
      await ctx.db
        .query("studyItems")
        .withIndex("by_chapter", (q) => q.eq("chapterId", args.chapterId))
        .collect(),
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

    const chapters = filterOwnedDocuments(
      currentUser,
      await ctx.db
        .query("chapters")
        .withIndex("by_subject", (q) => q.eq("subjectId", subject._id))
        .collect(),
    ).sort((left, right) => left.order - right.order);

    const chaptersWithData = await Promise.all(
      chapters.map(async (chapter) => {
        const chapterStudyItems = filterOwnedDocuments(
          currentUser,
          await ctx.db
            .query("studyItems")
            .withIndex("by_chapter", (q) => q.eq("chapterId", chapter._id))
            .collect(),
        );
        const chapterLevelItems = chapterStudyItems.filter(
          (studyItem) => studyItem.conceptId === undefined,
        );
        const conceptLevelItems = chapterStudyItems.filter(
          (studyItem) => studyItem.conceptId !== undefined,
        );
        const concepts = filterOwnedDocuments(
          currentUser,
          await ctx.db
            .query("concepts")
            .withIndex("by_chapter", (q) => q.eq("chapterId", chapter._id))
            .collect(),
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
    };
  },
});

export const getSubjectsWithStats = query({
  args: {},
  handler: async (ctx) => {
    const currentUser = await requireCurrentUser(ctx);
    const subjects = filterOwnedDocuments(
      currentUser,
      await ctx.db.query("subjects").collect(),
    );

    return await Promise.all(
      subjects.map(async (subject) => {
        const chapters = filterOwnedDocuments(
          currentUser,
          await ctx.db
            .query("chapters")
            .withIndex("by_subject", (q) => q.eq("subjectId", subject._id))
            .collect(),
        );

        let totalItems = 0;
        let completedItems = 0;
        let completedChapters = 0;

        for (const chapter of chapters) {
          const studyItems = filterOwnedDocuments(
            currentUser,
            await ctx.db
              .query("studyItems")
              .withIndex("by_chapter", (q) => q.eq("chapterId", chapter._id))
              .collect(),
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
    let concepts = filterOwnedDocuments(
      currentUser,
      await ctx.db.query("concepts").collect(),
    );

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
      const chapters = filterOwnedDocuments(
        currentUser,
        await ctx.db
          .query("chapters")
          .withIndex("by_subject", (q) => q.eq("subjectId", subjectId))
          .collect(),
      );
      const chapterIds = new Set(chapters.map((chapter) => chapter._id));
      concepts = concepts.filter((concept) => chapterIds.has(concept.chapterId));
    }

    const startOfToday = getDhakaDayBucket(args.now);
    const endOfToday = startOfToday + 86400000 - 1;
    const completedTodayLogs = filterOwnedDocuments(
      currentUser,
      await ctx.db
        .query("studyLogs")
        .withIndex("by_dayBucket", (q) => q.eq("dayBucket", startOfToday))
        .filter((q) => q.eq(q.field("eventType"), "concept_review"))
        .collect(),
    );

    const enrichedConcepts = await Promise.all(
      concepts
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
    const subjects = filterOwnedDocuments(
      currentUser,
      await ctx.db.query("subjects").collect(),
    );

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

    const studyItems = filterOwnedDocuments(
      currentUser,
      await ctx.db
        .query("studyItems")
        .withIndex("by_subject", (q) => q.eq("subjectId", args.subjectId))
        .collect(),
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

    const chapters = filterOwnedDocuments(
      currentUser,
      await ctx.db
        .query("chapters")
        .withIndex("by_subject", (q) => q.eq("subjectId", subject._id))
        .collect(),
    );
    const chapter =
      chapters.find((entry) => entry.slug === args.chapterSlug) ?? null;

    if (!chapter) {
      return null;
    }

    const concepts = filterOwnedDocuments(
      currentUser,
      await ctx.db
        .query("concepts")
        .withIndex("by_chapter", (q) => q.eq("chapterId", chapter._id))
        .collect(),
    ).sort((left, right) => left.order - right.order);

    const conceptsWithData = await Promise.all(
      concepts.map(async (concept) => {
        const studyItems = filterOwnedDocuments(
          currentUser,
          await ctx.db
            .query("studyItems")
            .withIndex("by_concept", (q) => q.eq("conceptId", concept._id))
            .collect(),
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
    };
  },
});

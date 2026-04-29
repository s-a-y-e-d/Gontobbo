import { query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { v } from "convex/values";

function getDhakaDayBucket(timestamp: number) {
  const dhakaOffset = 6 * 60 * 60 * 1000;
  const dhakaTime = new Date(timestamp + dhakaOffset);
  dhakaTime.setUTCHours(0, 0, 0, 0);
  return dhakaTime.getTime() - dhakaOffset;
}

function isConceptTargetComplete(
  conceptId: Id<"concepts">,
  studyItemsByConcept: Map<Id<"concepts">, Doc<"studyItems">[]>,
) {
  const conceptItems = studyItemsByConcept.get(conceptId) ?? [];
  return conceptItems.length > 0 && conceptItems.every((studyItem) => studyItem.isCompleted);
}

function isChapterTargetComplete(
  chapterId: Id<"chapters">,
  studyItemsByChapter: Map<Id<"chapters">, Doc<"studyItems">[]>,
) {
  const chapterItems = studyItemsByChapter.get(chapterId) ?? [];
  return chapterItems.length > 0 && chapterItems.every((studyItem) => studyItem.isCompleted);
}

export const getPlannerPageData = query({
  args: {
    date: v.number(),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("plannerSessions")
      .withIndex("by_date", (q) => q.eq("date", args.date))
      .unique();

    const suggestions = await ctx.db
      .query("plannerSuggestions")
      .withIndex("by_date_and_rankOrder", (q) => q.eq("date", args.date))
      .collect();

    const enrichedSuggestions = await Promise.all(
      suggestions.map(async (suggestion) => {
        if (suggestion.kind === "concept_review") {
          const concept = suggestion.conceptId
            ? await ctx.db.get(suggestion.conceptId)
            : null;
          const completed =
            concept?.lastReviewedAt !== undefined &&
            getDhakaDayBucket(concept.lastReviewedAt) === args.date;

          return {
            _id: suggestion._id,
            kind: suggestion.kind,
            title: suggestion.titleSnapshot,
            subjectName: suggestion.subjectNameSnapshot,
            chapterName: suggestion.chapterNameSnapshot,
            conceptName: suggestion.conceptNameSnapshot,
            subjectColor: suggestion.subjectColorSnapshot,
            durationMinutes: suggestion.durationMinutes,
            generationRound: suggestion.generationRound,
            acceptedAt: suggestion.acceptedAt,
            isAccepted: suggestion.acceptedAt !== undefined,
            isCompleted: completed,
            isAvailable: Boolean(concept),
          };
        }

        const studyItem = suggestion.studyItemId
          ? await ctx.db.get(suggestion.studyItemId)
          : null;

        return {
          _id: suggestion._id,
          kind: suggestion.kind,
          title: studyItem?.title ?? suggestion.titleSnapshot,
          subjectName: suggestion.subjectNameSnapshot,
          chapterName: suggestion.chapterNameSnapshot,
          conceptName: suggestion.conceptNameSnapshot,
          subjectColor: suggestion.subjectColorSnapshot,
          durationMinutes: suggestion.durationMinutes,
          generationRound: suggestion.generationRound,
          acceptedAt: suggestion.acceptedAt,
          isAccepted: suggestion.acceptedAt !== undefined,
          isCompleted: studyItem?.isCompleted ?? false,
          isAvailable: Boolean(studyItem),
        };
      }),
    );

    return {
      session: session
        ? {
            _id: session._id,
            latestGeneratedAt: session.latestGeneratedAt,
            latestAvailableMinutes: session.latestAvailableMinutes,
            latestComment: session.latestComment,
            generationCount: session.generationCount ?? 0,
          }
        : null,
      suggestions: enrichedSuggestions,
    };
  },
});

export const getPlannerSettingsData = query({
  args: {},
  handler: async (ctx) => {
    const [subjects, chapters, concepts, studyItems, plannerPreferences, weeklyTargets, coachingStatuses] =
      await Promise.all([
        ctx.db.query("subjects").collect(),
        ctx.db.query("chapters").collect(),
        ctx.db.query("concepts").collect(),
        ctx.db.query("studyItems").collect(),
        ctx.db.query("plannerSubjectPreferences").collect(),
        ctx.db.query("weeklyTargets").collect(),
        ctx.db.query("coachingProgress").collect(),
      ]);

    subjects.sort((a, b) => a.order - b.order);
    chapters.sort((a, b) => a.order - b.order);
    concepts.sort((a, b) => a.order - b.order);

    const subjectPriorityById = new Map(
      plannerPreferences.map((preference) => [preference.subjectId, preference.priority]),
    );
    const coachingStatusByChapter = new Map(
      coachingStatuses.map((status) => [status.chapterId, status.status]),
    );

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

    const chapterTargetsById = new Map<Id<"chapters">, Doc<"weeklyTargets">>();
    const conceptTargetsById = new Map<Id<"concepts">, Doc<"weeklyTargets">>();

    for (const weeklyTarget of weeklyTargets) {
      if (weeklyTarget.kind === "chapter") {
        chapterTargetsById.set(weeklyTarget.chapterId, weeklyTarget);
      } else if (weeklyTarget.conceptId) {
        conceptTargetsById.set(weeklyTarget.conceptId, weeklyTarget);
      }
    }

    return subjects.map((subject) => {
      const subjectChapters = chapters
        .filter((chapter) => chapter.subjectId === subject._id && chapter.inNextTerm)
        .map((chapter) => {
          const chapterConcepts = concepts
            .filter((concept) => concept.chapterId === chapter._id)
            .map((concept) => {
              const weeklyTarget = conceptTargetsById.get(concept._id) ?? null;
              const isComplete = isConceptTargetComplete(
                concept._id,
                studyItemsByConcept,
              );

              return {
                _id: concept._id,
                name: concept.name,
                order: concept.order,
                weeklyTargetId: weeklyTarget?._id ?? null,
                isWeeklyTarget: weeklyTarget !== null,
                isTargetComplete: weeklyTarget ? isComplete : false,
              };
            });

          const weeklyTarget = chapterTargetsById.get(chapter._id) ?? null;
          const isChapterComplete = isChapterTargetComplete(
            chapter._id,
            studyItemsByChapter,
          );

          return {
            _id: chapter._id,
            name: chapter.name,
            order: chapter.order,
            coachingStatus: coachingStatusByChapter.get(chapter._id) ?? "not_started",
            weeklyTargetId: weeklyTarget?._id ?? null,
            isWeeklyTarget: weeklyTarget !== null,
            isTargetComplete: weeklyTarget ? isChapterComplete : false,
            concepts: chapterConcepts,
          };
        });

      return {
        _id: subject._id,
        name: subject.name,
        color: subject.color,
        icon: subject.icon,
        priority: subjectPriorityById.get(subject._id) ?? "normal",
        chapters: subjectChapters,
      };
    });
  },
});

import { query, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { v } from "convex/values";
import {
  filterOwnedDocuments,
  isLegacyWorkspaceOwner,
  requireCurrentUser,
  type CurrentUser,
} from "./auth";
import {
  DASHBOARD_COMPONENT_KEYS,
  getDashboardComponentSettingKey,
  resolveDashboardComponentVisibility,
} from "./dashboardComponents";

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

async function getNumberSettingValue(
  ctx: QueryCtx,
  currentUser: CurrentUser,
  key: string,
) {
  const ownedSetting = await ctx.db
    .query("settings")
    .withIndex("by_userId_and_key", (q) =>
      q.eq("userId", currentUser._id).eq("key", key),
    )
    .unique();

  if (typeof ownedSetting?.value === "number") {
    return ownedSetting.value;
  }

  if (!isLegacyWorkspaceOwner(currentUser)) {
    return undefined;
  }

  const legacySetting = await ctx.db
    .query("settings")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();

  if (
    legacySetting &&
    legacySetting.userId === undefined &&
    typeof legacySetting.value === "number"
  ) {
    return legacySetting.value;
  }

  return undefined;
}

async function getDashboardComponentSettings(
  ctx: QueryCtx,
  currentUser: CurrentUser,
) {
  const settingKeys = DASHBOARD_COMPONENT_KEYS.map((key) =>
    getDashboardComponentSettingKey(key),
  );
  const ownedSettings = await Promise.all(
    settingKeys.map((key) =>
      ctx.db
        .query("settings")
        .withIndex("by_userId_and_key", (q) =>
          q.eq("userId", currentUser._id).eq("key", key),
        )
        .unique(),
    ),
  );

  if (!isLegacyWorkspaceOwner(currentUser)) {
    return ownedSettings.filter((setting) => setting !== null);
  }

  const legacySettings = await Promise.all(
    settingKeys.map(async (key) => {
      const settings = await ctx.db
        .query("settings")
        .withIndex("by_key", (q) => q.eq("key", key))
        .collect();
      return settings.find((setting) => setting.userId === undefined) ?? null;
    }),
  );

  return [...ownedSettings, ...legacySettings].filter(
    (setting) => setting !== null,
  );
}

async function getPlannerSubjects(ctx: QueryCtx, currentUser: CurrentUser) {
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

async function getPlannerChapters(ctx: QueryCtx, currentUser: CurrentUser) {
  const ownedChapters = await ctx.db
    .query("chapters")
    .withIndex("by_userId", (q) => q.eq("userId", currentUser._id))
    .collect();

  if (!isLegacyWorkspaceOwner(currentUser)) {
    return ownedChapters;
  }

  const legacyChapters = await ctx.db
    .query("chapters")
    .withIndex("by_userId", (q) => q.eq("userId", undefined))
    .collect();

  return [...ownedChapters, ...legacyChapters];
}

async function getPlannerConcepts(ctx: QueryCtx, currentUser: CurrentUser) {
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

async function getPlannerStudyItems(ctx: QueryCtx, currentUser: CurrentUser) {
  const ownedStudyItems = await ctx.db
    .query("studyItems")
    .withIndex("by_userId", (q) => q.eq("userId", currentUser._id))
    .collect();

  if (!isLegacyWorkspaceOwner(currentUser)) {
    return ownedStudyItems;
  }

  const legacyStudyItems = await ctx.db
    .query("studyItems")
    .withIndex("by_userId", (q) => q.eq("userId", undefined))
    .collect();

  return [...ownedStudyItems, ...legacyStudyItems];
}

async function getPlannerPreferences(ctx: QueryCtx, currentUser: CurrentUser) {
  const ownedPreferences = await ctx.db
    .query("plannerSubjectPreferences")
    .withIndex("by_userId", (q) => q.eq("userId", currentUser._id))
    .collect();

  if (!isLegacyWorkspaceOwner(currentUser)) {
    return ownedPreferences;
  }

  const legacyPreferences = await ctx.db
    .query("plannerSubjectPreferences")
    .withIndex("by_userId", (q) => q.eq("userId", undefined))
    .collect();

  return [...ownedPreferences, ...legacyPreferences];
}

async function getPlannerWeeklyTargets(ctx: QueryCtx, currentUser: CurrentUser) {
  const ownedTargets = await ctx.db
    .query("weeklyTargets")
    .withIndex("by_userId", (q) => q.eq("userId", currentUser._id))
    .collect();

  if (!isLegacyWorkspaceOwner(currentUser)) {
    return ownedTargets;
  }

  const legacyTargets = await ctx.db
    .query("weeklyTargets")
    .withIndex("by_userId", (q) => q.eq("userId", undefined))
    .collect();

  return [...ownedTargets, ...legacyTargets];
}

async function getPlannerCoachingStatuses(
  ctx: QueryCtx,
  currentUser: CurrentUser,
) {
  const ownedStatuses = await ctx.db
    .query("coachingProgress")
    .withIndex("by_userId", (q) => q.eq("userId", currentUser._id))
    .collect();

  if (!isLegacyWorkspaceOwner(currentUser)) {
    return ownedStatuses;
  }

  const legacyStatuses = await ctx.db
    .query("coachingProgress")
    .withIndex("by_userId", (q) => q.eq("userId", undefined))
    .collect();

  return [...ownedStatuses, ...legacyStatuses];
}

async function getPlannerSettingsSubjects(ctx: QueryCtx, currentUser: CurrentUser) {
  const [subjects, chapters, concepts, studyItems, plannerPreferences, weeklyTargets, coachingStatuses] =
    await Promise.all([
      getPlannerSubjects(ctx, currentUser),
      getPlannerChapters(ctx, currentUser),
      getPlannerConcepts(ctx, currentUser),
      getPlannerStudyItems(ctx, currentUser),
      getPlannerPreferences(ctx, currentUser),
      getPlannerWeeklyTargets(ctx, currentUser),
      getPlannerCoachingStatuses(ctx, currentUser),
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
      chapterTrackers: subject.chapterTrackers,
      conceptTrackers: subject.conceptTrackers,
      priority: subjectPriorityById.get(subject._id) ?? "normal",
      chapters: subjectChapters,
    };
  });
}

export const getPlannerPageData = query({
  args: {
    date: v.number(),
  },
  handler: async (ctx, args) => {
    const currentUser = await requireCurrentUser(ctx);
    const [sessions, suggestions] = await Promise.all([
      filterOwnedDocuments(
        currentUser,
        await ctx.db
          .query("plannerSessions")
          .withIndex("by_date", (q) => q.eq("date", args.date))
          .collect(),
      ),
      filterOwnedDocuments(
        currentUser,
        await ctx.db
          .query("plannerSuggestions")
          .withIndex("by_date_and_rankOrder", (q) => q.eq("date", args.date))
          .collect(),
      ),
    ]);

    const session = sessions[0] ?? null;

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
    const currentUser = await requireCurrentUser(ctx);
    return await getPlannerSettingsSubjects(ctx, currentUser);
  },
});

export const getSettingsPageData = query({
  args: {},
  handler: async (ctx) => {
    const currentUser = await requireCurrentUser(ctx);
    const [
      subjects,
      defaultRevisionMinutes,
      termStartDate,
      nextTermExamDate,
      dashboardComponentSettings,
    ] = await Promise.all([
      getPlannerSettingsSubjects(ctx, currentUser),
      getNumberSettingValue(ctx, currentUser, "defaultRevisionMinutes"),
      getNumberSettingValue(ctx, currentUser, "termStartDate"),
      getNumberSettingValue(ctx, currentUser, "nextTermExamDate"),
      getDashboardComponentSettings(ctx, currentUser),
    ]);

    return {
      subjects,
      classLevel: currentUser.classLevel ?? null,
      defaultRevisionMinutes: defaultRevisionMinutes ?? 15,
      termStartDate,
      nextTermExamDate,
      dashboardComponentVisibility: resolveDashboardComponentVisibility(
        dashboardComponentSettings,
      ),
    };
  },
});

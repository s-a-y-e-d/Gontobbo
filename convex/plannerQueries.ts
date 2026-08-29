import { query, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { v } from "convex/values";
import {
  DEFAULT_REVISION_INTERVAL_DAYS,
  DEFAULT_REVISION_RATING_LEVEL_CHANGES,
  REVISION_INTERVAL_SETTING_KEYS,
  REVISION_LEVEL_COUNT,
  REVISION_RATING_SETTING_KEYS,
} from "./revisionAlgorithm";
import {
  isLegacyWorkspaceOwner,
  requireCurrentUser,
  type CurrentUser,
} from "./auth";
import {
  DASHBOARD_COMPONENT_KEYS,
  getDashboardComponentSettingKey,
  resolveDashboardComponentVisibility,
} from "./dashboardComponents";
import {
  getRequiredTrackerKeys,
  summarizeRequiredStudyItems,
} from "./trackerRequirements";
import { getTrackerConfigRebuildStatus } from "./syllabusSummaries";

function getDhakaDayBucket(timestamp: number) {
  const dhakaOffset = 6 * 60 * 60 * 1000;
  const dhakaTime = new Date(timestamp + dhakaOffset);
  dhakaTime.setUTCHours(0, 0, 0, 0);
  return dhakaTime.getTime() - dhakaOffset;
}

function isConceptTargetComplete(
  conceptId: Id<"concepts">,
  subject: Doc<"subjects">,
  conceptStatsById: Map<Id<"concepts">, Doc<"studyItemConceptStats">>,
) {
  const stat = conceptStatsById.get(conceptId);
  const requiredCount = getRequiredTrackerKeys(subject, "concept").size;
  return Boolean(
    stat &&
      requiredCount > 0 &&
      (stat.requiredTotalItems ?? 0) >= requiredCount &&
      stat.requiredCompletedItems === stat.requiredTotalItems,
  );
}

function isChapterTargetComplete(
  chapterId: Id<"chapters">,
  subject: Doc<"subjects">,
  conceptCount: number,
  chapterStatsById: Map<Id<"chapters">, Doc<"studyItemChapterStats">>,
) {
  const stat = chapterStatsById.get(chapterId);
  const requiredCount =
    getRequiredTrackerKeys(subject, "chapter").size +
    conceptCount * getRequiredTrackerKeys(subject, "concept").size;
  return Boolean(
    stat &&
      requiredCount > 0 &&
      (stat.requiredTotalItems ?? 0) >= requiredCount &&
      stat.requiredCompletedItems === stat.requiredTotalItems,
  );
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
    .withIndex("by_userId_and_key", (q) =>
      q.eq("userId", undefined).eq("key", key),
    )
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
    settingKeys.map((key) =>
      ctx.db
        .query("settings")
        .withIndex("by_userId_and_key", (q) =>
          q.eq("userId", undefined).eq("key", key),
        )
        .unique(),
    ),
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

async function getPlannerChapterStats(ctx: QueryCtx, currentUser: CurrentUser) {
  return await ctx.db
    .query("studyItemChapterStats")
    .withIndex("by_userId", (q) => q.eq("userId", currentUser._id))
    .collect();
}

async function getPlannerConceptStats(ctx: QueryCtx, currentUser: CurrentUser) {
  return await ctx.db
    .query("studyItemConceptStats")
    .withIndex("by_userId", (q) => q.eq("userId", currentUser._id))
    .collect();
}

async function isChapterTargetCompleteFallback(
  ctx: QueryCtx,
  currentUser: CurrentUser,
  chapterId: Id<"chapters">,
  subject: Doc<"subjects">,
  conceptCount: number,
) {
  const ownedItems = await ctx.db
    .query("studyItems")
    .withIndex("by_userId_and_chapterId", (q) =>
      q.eq("userId", currentUser._id).eq("chapterId", chapterId),
    )
    .collect();
  const legacyItems = isLegacyWorkspaceOwner(currentUser)
    ? await ctx.db
        .query("studyItems")
        .withIndex("by_userId_and_chapterId", (q) =>
          q.eq("userId", undefined).eq("chapterId", chapterId),
        )
        .collect()
    : [];
  const studyItems = [...ownedItems, ...legacyItems];
  const required = summarizeRequiredStudyItems(subject, studyItems);
  const requiredCount =
    getRequiredTrackerKeys(subject, "chapter").size +
    conceptCount * getRequiredTrackerKeys(subject, "concept").size;
  return (
    requiredCount > 0 &&
    required.total >= requiredCount &&
    required.completed === required.total
  );
}

async function isConceptTargetCompleteFallback(
  ctx: QueryCtx,
  currentUser: CurrentUser,
  conceptId: Id<"concepts">,
  subject: Doc<"subjects">,
) {
  const ownedItems = await ctx.db
    .query("studyItems")
    .withIndex("by_userId_and_conceptId", (q) =>
      q.eq("userId", currentUser._id).eq("conceptId", conceptId),
    )
    .collect();
  const legacyItems = isLegacyWorkspaceOwner(currentUser)
    ? await ctx.db
        .query("studyItems")
        .withIndex("by_userId_and_conceptId", (q) =>
          q.eq("userId", undefined).eq("conceptId", conceptId),
        )
        .collect()
    : [];
  const studyItems = [...ownedItems, ...legacyItems];
  const required = summarizeRequiredStudyItems(subject, studyItems);
  const requiredCount = getRequiredTrackerKeys(subject, "concept").size;
  return (
    requiredCount > 0 &&
    required.total >= requiredCount &&
    required.completed === required.total
  );
}

async function getPlannerSettingsSubjects(ctx: QueryCtx, currentUser: CurrentUser) {
  const [
    subjects,
    chapters,
    concepts,
    plannerPreferences,
    weeklyTargets,
    coachingStatuses,
    chapterStats,
    conceptStats,
  ] =
    await Promise.all([
      getPlannerSubjects(ctx, currentUser),
      getPlannerChapters(ctx, currentUser),
      getPlannerConcepts(ctx, currentUser),
      getPlannerPreferences(ctx, currentUser),
      getPlannerWeeklyTargets(ctx, currentUser),
      getPlannerCoachingStatuses(ctx, currentUser),
      getPlannerChapterStats(ctx, currentUser),
      getPlannerConceptStats(ctx, currentUser),
    ]);

  const trackerRebuildStatuses = await Promise.all(
    subjects.map((subject) =>
      getTrackerConfigRebuildStatus(ctx, currentUser._id, subject._id),
    ),
  );

  subjects.sort((a, b) => a.order - b.order);
  chapters.sort((a, b) => a.order - b.order);
  concepts.sort((a, b) => a.order - b.order);

  const subjectPriorityById = new Map(
    plannerPreferences.map((preference) => [preference.subjectId, preference.priority]),
  );
  const coachingStatusByChapter = new Map(
    coachingStatuses.map((status) => [status.chapterId, status.status]),
  );

  const chapterStatsById = new Map(
    chapterStats.map((stat) => [stat.chapterId, stat]),
  );
  const conceptStatsById = new Map(
    conceptStats.map((stat) => [stat.conceptId, stat]),
  );
  const trackerRebuildBySubjectId = new Map(
    subjects.map((subject, index) => [subject._id, trackerRebuildStatuses[index]]),
  );

  const chapterTargetsById = new Map<Id<"chapters">, Doc<"weeklyTargets">>();
  const conceptTargetsById = new Map<Id<"concepts">, Doc<"weeklyTargets">>();

  for (const weeklyTarget of weeklyTargets) {
    if (weeklyTarget.kind === "chapter") {
      chapterTargetsById.set(weeklyTarget.chapterId, weeklyTarget);
    } else if (weeklyTarget.conceptId) {
      conceptTargetsById.set(weeklyTarget.conceptId, weeklyTarget);
    }
  }

  return await Promise.all(subjects.map(async (subject) => {
    const subjectChapters = await Promise.all(chapters
      .filter((chapter) => chapter.subjectId === subject._id && chapter.inNextTerm)
      .map(async (chapter) => {
        const chapterConcepts = await Promise.all(concepts
          .filter((concept) => concept.chapterId === chapter._id)
          .map(async (concept) => {
            const weeklyTarget = conceptTargetsById.get(concept._id) ?? null;
            const trackerRebuild = trackerRebuildBySubjectId.get(subject._id);
            const isComplete = weeklyTarget
              ? (() => {
                  const stat = conceptStatsById.get(concept._id);
                  return stat &&
                    (trackerRebuild === null || trackerRebuild?.status === "completed") &&
                    stat.requiredTotalItems !== undefined &&
                    stat.requiredCompletedItems !== undefined
                    ? isConceptTargetComplete(concept._id, subject, conceptStatsById)
                    : undefined;
                })() ??
                (await isConceptTargetCompleteFallback(
                  ctx,
                  currentUser,
                  concept._id,
                  subject,
                ))
              : false;

            return {
              _id: concept._id,
              name: concept.name,
              order: concept.order,
              weeklyTargetId: weeklyTarget?._id ?? null,
              isWeeklyTarget: weeklyTarget !== null,
              isTargetComplete: weeklyTarget ? isComplete : false,
            };
          }));

        const weeklyTarget = chapterTargetsById.get(chapter._id) ?? null;
        const trackerRebuild = trackerRebuildBySubjectId.get(subject._id);
        const isChapterComplete = weeklyTarget
          ? (() => {
              const stat = chapterStatsById.get(chapter._id);
              return stat &&
                (trackerRebuild === null || trackerRebuild?.status === "completed") &&
                stat.requiredTotalItems !== undefined &&
                stat.requiredCompletedItems !== undefined
                ? isChapterTargetComplete(
                    chapter._id,
                    subject,
                    chapterConcepts.length,
                    chapterStatsById,
                  )
                : undefined;
            })() ??
            (await isChapterTargetCompleteFallback(
              ctx,
              currentUser,
              chapter._id,
              subject,
              chapterConcepts.length,
            ))
          : false;

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
      }));

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
  }));
}

async function getPlannerSessionForDate(
  ctx: QueryCtx,
  currentUser: CurrentUser,
  date: number,
) {
  const ownedSession = await ctx.db
    .query("plannerSessions")
    .withIndex("by_userId_and_date", (q) =>
      q.eq("userId", currentUser._id).eq("date", date),
    )
    .unique();

  if (ownedSession || !isLegacyWorkspaceOwner(currentUser)) {
    return ownedSession;
  }

  return await ctx.db
    .query("plannerSessions")
    .withIndex("by_userId_and_date", (q) =>
      q.eq("userId", undefined).eq("date", date),
    )
    .unique();
}

async function getPlannerSuggestionsForDate(
  ctx: QueryCtx,
  currentUser: CurrentUser,
  date: number,
) {
  const ownedSuggestions = await ctx.db
    .query("plannerSuggestions")
    .withIndex("by_userId_and_date_and_rankOrder", (q) =>
      q.eq("userId", currentUser._id).eq("date", date),
    )
    .collect();

  if (!isLegacyWorkspaceOwner(currentUser)) {
    return ownedSuggestions;
  }

  const legacySuggestions = await ctx.db
    .query("plannerSuggestions")
    .withIndex("by_userId_and_date_and_rankOrder", (q) =>
      q.eq("userId", undefined).eq("date", date),
    )
    .collect();

  return [...ownedSuggestions, ...legacySuggestions].sort(
    (a, b) => a.rankOrder - b.rankOrder,
  );
}

export const getPlannerPageData = query({
  args: {
    date: v.number(),
  },
  handler: async (ctx, args) => {
    const currentUser = await requireCurrentUser(ctx);
    const [session, suggestions] = await Promise.all([
      getPlannerSessionForDate(ctx, currentUser, args.date),
      getPlannerSuggestionsForDate(ctx, currentUser, args.date),
    ]);

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
      revisionAlgorithmSettings,
    ] = await Promise.all([
      getPlannerSettingsSubjects(ctx, currentUser),
      getNumberSettingValue(ctx, currentUser, "defaultRevisionMinutes"),
      getNumberSettingValue(ctx, currentUser, "termStartDate"),
      getNumberSettingValue(ctx, currentUser, "nextTermExamDate"),
      getDashboardComponentSettings(ctx, currentUser),
      Promise.all([
        ...REVISION_INTERVAL_SETTING_KEYS.map((key) =>
          getNumberSettingValue(ctx, currentUser, key),
        ),
        ...Object.values(REVISION_RATING_SETTING_KEYS).map((key) =>
          getNumberSettingValue(ctx, currentUser, key),
        ),
      ]),
    ]);

    const intervalDays = DEFAULT_REVISION_INTERVAL_DAYS.map(
      (defaultDays, level) => revisionAlgorithmSettings[level] ?? defaultDays,
    );
    const ratingLevelChanges = {
      hard:
        revisionAlgorithmSettings[REVISION_LEVEL_COUNT] ??
        DEFAULT_REVISION_RATING_LEVEL_CHANGES.hard,
      medium:
        revisionAlgorithmSettings[REVISION_LEVEL_COUNT + 1] ??
        DEFAULT_REVISION_RATING_LEVEL_CHANGES.medium,
      easy:
        revisionAlgorithmSettings[REVISION_LEVEL_COUNT + 2] ??
        DEFAULT_REVISION_RATING_LEVEL_CHANGES.easy,
    };

    return {
      subjects,
      classLevel: currentUser.classLevel ?? null,
      defaultRevisionMinutes: defaultRevisionMinutes ?? 15,
      termStartDate,
      nextTermExamDate,
      dashboardComponentVisibility: resolveDashboardComponentVisibility(
        dashboardComponentSettings,
      ),
      revisionAlgorithm: { intervalDays, ratingLevelChanges },
    };
  },
});

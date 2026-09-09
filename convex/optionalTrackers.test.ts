/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const DAY_MS = 86_400_000;

function getDhakaDayBucket(timestamp: number) {
  const dhakaOffset = 6 * 60 * 60 * 1_000;
  const dhakaTime = new Date(timestamp + dhakaOffset);
  dhakaTime.setUTCHours(0, 0, 0, 0);
  return dhakaTime.getTime() - dhakaOffset;
}

async function createAuthenticatedContext(identitySuffix: string) {
  const t = convexTest(schema, modules).withIdentity({
    subject: `optional-trackers-${identitySuffix}`,
    tokenIdentifier: `test|optional-trackers-${identitySuffix}`,
    name: `optional-trackers-${identitySuffix}`,
  });
  await t.mutation(api.auth.ensureCurrentUser, {});
  return t;
}

async function createFixture(identitySuffix: string, conceptTrackers = [
  { key: "book", label: "Book", avgMinutes: 30 },
  { key: "notes", label: "Notes", avgMinutes: 20, isOptional: true },
]) {
  const t = await createAuthenticatedContext(identitySuffix);
  const subjectId = await t.mutation(api.mutations.createSubject, {
    name: "Physics",
    slug: `physics-optional-${identitySuffix}`,
    order: 1,
    chapterTrackers: [
      { key: "mcq", label: "MCQ", avgMinutes: 30 },
      { key: "board", label: "Board", avgMinutes: 45, isOptional: true },
    ],
    conceptTrackers,
  });
  const chapterId = await t.mutation(api.mutations.createChapter, {
    subjectId,
    name: "Motion",
    slug: "motion",
    order: 1,
    inNextTerm: true,
  });
  const conceptId = await t.mutation(api.mutations.createConcept, {
    chapterId,
    name: "Velocity",
    order: 1,
  });

  await t.mutation(api.mutations.ensureChapterStudyItems, { subjectId });
  await t.mutation(api.mutations.ensureConceptStudyItems, { chapterId });

  const studyItems = await t.run(async (ctx) =>
    ctx.db
      .query("studyItems")
      .withIndex("by_chapter", (q) => q.eq("chapterId", chapterId))
      .collect(),
  );

  return { t, subjectId, chapterId, conceptId, studyItems };
}

async function updateSubjectAndFinishRebuild(
  t: Awaited<ReturnType<typeof createAuthenticatedContext>>,
  subjectId: Id<"subjects">,
  conceptTrackers: Array<{
    key: string;
    label: string;
    avgMinutes: number;
    isOptional?: boolean;
  }>,
) {
  vi.useFakeTimers();
  try {
    await t.mutation(api.mutations.updateSubject, {
      subjectId,
      conceptTrackers,
    });
    await t.finishAllScheduledFunctions(() => {
      vi.runAllTimers();
    });
  } finally {
    vi.useRealTimers();
  }
}

function getItem(
  studyItems: Array<{ _id: Id<"studyItems">; type: string; conceptId?: Id<"concepts"> }>,
  type: string,
  conceptId?: Id<"concepts">,
) {
  return studyItems.find(
    (item) => item.type === type && item.conceptId === conceptId,
  )!;
}

describe("optional tracker categories", () => {
  test.each([undefined, 7])("uses Level 1 for new completions (configured days: %s) and preserves existing dates", async (days) => {
    const { t, conceptId, studyItems } = await createFixture(`initial-${days}`);
    if (days !== undefined) {
      await t.mutation(api.mutations.setRevisionAlgorithm, {
        intervalDays: [days, 15, 30, 60, 90, 120],
        ratingLevelChanges: { hard: -1, medium: 1, easy: 2 },
      });
    }
    const item = getItem(studyItems, "book", conceptId);
    const before = Date.now();
    await t.mutation(api.mutations.toggleStudyItemCompletion, { studyItemId: item._id });
    const after = Date.now();
    const concept = await t.run((ctx) => ctx.db.get(conceptId));
    expect(concept?.repetitionLevel).toBe(0);
    expect(concept?.nextReviewAt).toBeGreaterThanOrEqual(before + (days ?? 1) * DAY_MS);
    expect(concept?.nextReviewAt).toBeLessThanOrEqual(after + (days ?? 1) * DAY_MS);

    await t.mutation(api.mutations.setRevisionAlgorithm, {
      intervalDays: [14, 15, 30, 60, 90, 120],
      ratingLevelChanges: { hard: -1, medium: 1, easy: 2 },
    });
    await t.mutation(api.mutations.toggleStudyItemCompletion, { studyItemId: item._id });
    await t.mutation(api.mutations.toggleStudyItemCompletion, { studyItemId: item._id });
    const repeated = await t.run((ctx) => ctx.db.get(conceptId));
    expect(repeated?.nextReviewAt).toBe(concept?.nextReviewAt);
  });

  test("excludes optional completions from formal progress and revision while keeping Study Volume activity", async () => {
    const { t, subjectId, conceptId, studyItems } = await createFixture("progress");
    const today = getDhakaDayBucket(Date.now());

    const optionalChapter = getItem(studyItems, "board");
    const optionalConcept = getItem(studyItems, "notes", conceptId);
    const requiredChapter = getItem(studyItems, "mcq");
    const requiredConcept = getItem(studyItems, "book", conceptId);

    await t.mutation(api.mutations.toggleStudyItemCompletion, {
      studyItemId: optionalChapter._id,
    });
    await t.mutation(api.mutations.toggleStudyItemCompletion, {
      studyItemId: optionalConcept._id,
    });

    const afterOptional = await t.query(api.queries.getSubjectPageData, {
      slug: "physics-optional-progress",
    });
    const afterOptionalChapter = await t.query(api.queries.getChapterPageData, {
      subjectSlug: "physics-optional-progress",
      chapterSlug: "motion",
    });
    const afterOptionalConcept = await t.run((ctx) => ctx.db.get(conceptId));

    expect(afterOptional?.totalItems).toBe(2);
    expect(afterOptional?.completedItems).toBe(0);
    expect(afterOptional?.chapters[0]).toMatchObject({
      totalItems: 2,
      completedItems: 0,
      status: "NOT_STARTED",
    });
    expect(afterOptionalChapter?.concepts[0]).toMatchObject({
      totalItems: 1,
      completedItems: 0,
      status: "NOT_STARTED",
    });
    expect(afterOptionalConcept?.nextReviewAt).toBeUndefined();

    await t.mutation(api.mutations.setDashboardComponentVisibility, {
      componentKey: "studyVolume",
      isVisible: true,
    });
    await t.mutation(api.mutations.setDashboardComponentVisibility, {
      componentKey: "progressionRate",
      isVisible: true,
    });
    await t.mutation(api.mutations.updateSubject, {
      subjectId,
      examWeight: 100,
    });
    await t.mutation(api.mutations.setDashboardComponentVisibility, {
      componentKey: "effortWeightage",
      isVisible: true,
    });
    await t.mutation(api.mutations.setDashboardTermDates, {
      termStartDate: today,
      nextTermExamDate: today + 7 * DAY_MS,
    });

    const dashboardAfterOptional = await t.query(
      api.dashboardQueries.getDashboardPageData,
      { today },
    );
    expect(dashboardAfterOptional.completion?.nextTerm).toMatchObject({
      totalItems: 2,
      completedItems: 0,
      progressPercentage: 0,
    });
    expect(dashboardAfterOptional.studyVolume).toMatchObject({
      totalActivities: 2,
      activeDays: 1,
    });
    expect(
      dashboardAfterOptional.effortWeightage?.subjects.find(
        (subject) => subject.name === "Physics",
      ),
    ).toMatchObject({
      studyMinutes: 0,
      studyShare: 0,
    });
    expect(
      dashboardAfterOptional.studyVolume?.days.find((day) => day.date === today)
        ?.activityCount,
    ).toBe(2);

    await t.mutation(api.mutations.toggleStudyItemCompletion, {
      studyItemId: requiredChapter._id,
    });
    await t.mutation(api.mutations.toggleStudyItemCompletion, {
      studyItemId: requiredConcept._id,
    });

    const afterRequired = await t.query(api.queries.getSubjectPageData, {
      slug: "physics-optional-progress",
    });
    const afterRequiredConcept = await t.run((ctx) => ctx.db.get(conceptId));
    expect(afterRequired?.totalItems).toBe(2);
    expect(afterRequired?.completedItems).toBe(2);
    expect(afterRequired?.progressPercentage).toBe(100);
    expect(afterRequiredConcept?.nextReviewAt).toBeDefined();
  });

  test("reclassifies existing marks on config changes and preserves revision state", async () => {
    const { t, subjectId, conceptId, studyItems } =
      await createFixture("reclassify", [
        { key: "book", label: "Book", avgMinutes: 30, isOptional: true },
      ]);
    const optionalConcept = getItem(studyItems, "book", conceptId);

    await t.mutation(api.mutations.toggleStudyItemCompletion, {
      studyItemId: optionalConcept._id,
    });
    const beforeRequired = await t.run((ctx) => ctx.db.get(conceptId));
    expect(beforeRequired?.nextReviewAt).toBeUndefined();

    await updateSubjectAndFinishRebuild(t, subjectId, [
      { key: "book", label: "Book", avgMinutes: 30 },
    ]);

    const requiredPage = await t.query(api.queries.getChapterPageData, {
      subjectSlug: "physics-optional-reclassify",
      chapterSlug: "motion",
    });
    const afterRequired = await t.run((ctx) => ctx.db.get(conceptId));
    expect(requiredPage?.concepts[0]).toMatchObject({
      totalItems: 1,
      completedItems: 1,
      status: "READY",
    });
    expect(afterRequired?.nextReviewAt).toBeDefined();

    const scheduledReviewAt = afterRequired?.nextReviewAt;
    await updateSubjectAndFinishRebuild(t, subjectId, [
      { key: "book", label: "Book", avgMinutes: 30, isOptional: true },
    ]);

    const optionalPage = await t.query(api.queries.getChapterPageData, {
      subjectSlug: "physics-optional-reclassify",
      chapterSlug: "motion",
    });
    const afterOptional = await t.run((ctx) => ctx.db.get(conceptId));
    expect(optionalPage?.concepts[0]).toMatchObject({
      totalItems: 0,
      completedItems: 0,
      status: "NOT_STARTED",
    });
    expect(afterOptional?.nextReviewAt).toBe(scheduledReviewAt);
  });

  test("uses live tracker semantics while a config rebuild is pending", async () => {
    const { t, subjectId } = await createFixture("fallback", [
      { key: "book", label: "Book", avgMinutes: 30, isOptional: true },
    ]);

    const studyItems = await t.run(async (ctx) =>
      ctx.db.query("studyItems").collect(),
    );
    const optionalConcept = studyItems.find(
      (item) => item.type === "book" && item.conceptId !== undefined,
    );
    expect(optionalConcept).toBeDefined();
    await t.mutation(api.mutations.toggleStudyItemCompletion, {
      studyItemId: optionalConcept!._id,
    });

    vi.useFakeTimers();
    try {
      await t.mutation(api.mutations.updateSubject, {
        subjectId,
        conceptTrackers: [{ key: "book", label: "Book", avgMinutes: 30 }],
      });

      const immediate = await t.query(api.queries.getChapterPageData, {
        subjectSlug: "physics-optional-fallback",
        chapterSlug: "motion",
      });
      expect(immediate?.concepts[0]).toMatchObject({
        totalItems: 1,
        completedItems: 1,
        status: "READY",
      });

      await t.finishAllScheduledFunctions(() => {
        vi.runAllTimers();
      });
    } finally {
      vi.useRealTimers();
    }
  });

  test("keeps optional work selectable in Study Targets without counting it as target progress", async () => {
    const { t, chapterId, conceptId, studyItems } =
      await createFixture("target");
    const today = getDhakaDayBucket(Date.now());

    const result = await t.mutation(api.studyTargets.createStudyTarget, {
      title: "Finish Motion",
      startDate: today,
      endDate: today + DAY_MS,
      chapterIds: [chapterId],
    });
    expect(result.scheduledTaskCount).toBe(2);

    const optionalConcept = getItem(studyItems, "notes", conceptId);
    const requiredConcept = getItem(studyItems, "book", conceptId);
    const pageBefore = await t.query(api.studyTargets.getStudyTargetPageData, {
      today,
    });
    expect(pageBefore.target).toMatchObject({
      totalTrackerItems: 1,
      completedTrackerItems: 0,
      progressPercent: 0,
    });

    await t.mutation(api.mutations.toggleStudyItemCompletion, {
      studyItemId: optionalConcept._id,
    });
    const pageAfterOptional = await t.query(
      api.studyTargets.getStudyTargetPageData,
      { today },
    );
    expect(pageAfterOptional.target).toMatchObject({
      totalTrackerItems: 1,
      completedTrackerItems: 0,
      progressPercent: 0,
    });

    await t.mutation(api.mutations.toggleStudyItemCompletion, {
      studyItemId: requiredConcept._id,
    });
    const pageAfterRequired = await t.query(
      api.studyTargets.getStudyTargetPageData,
      { today },
    );
    expect(pageAfterRequired.target).toMatchObject({
      totalTrackerItems: 1,
      completedTrackerItems: 1,
      progressPercent: 100,
    });
  });
});

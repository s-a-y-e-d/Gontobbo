/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import {
  DEFAULT_DASHBOARD_COMPONENT_VISIBILITY,
  type DashboardComponentKey,
} from "./dashboardComponents";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

async function createAuthenticatedTestContext(subject = "dashboard-owner") {
  const t = convexTest(schema, modules).withIdentity({
    subject,
    tokenIdentifier: `test|${subject}`,
    name: subject,
  });
  await t.mutation(api.auth.ensureCurrentUser, {});
  return t;
}

function getDhakaDayBucket(timestamp: number) {
  const dhakaOffset = 6 * 60 * 60 * 1000;
  const dhakaTime = new Date(timestamp + dhakaOffset);
  dhakaTime.setUTCHours(0, 0, 0, 0);
  return dhakaTime.getTime() - dhakaOffset;
}

async function showDashboardComponents(
  t: Awaited<ReturnType<typeof createAuthenticatedTestContext>>,
  componentKeys: DashboardComponentKey[],
) {
  for (const componentKey of componentKeys) {
    await t.mutation(api.mutations.setDashboardComponentVisibility, {
      componentKey,
      isVisible: true,
    });
  }
}

describe("dashboard", () => {
  test("stores and returns term dates through settings queries", async () => {
    const t = await createAuthenticatedTestContext();
    const termStartDate = Date.UTC(2026, 0, 1) - 6 * 60 * 60 * 1000;
    const nextTermExamDate = Date.UTC(2026, 5, 1) - 6 * 60 * 60 * 1000;

    const beforeSave = await t.query(api.plannerQueries.getSettingsPageData, {});
    expect(beforeSave.termStartDate).toBeUndefined();
    expect(beforeSave.nextTermExamDate).toBeUndefined();

    await t.mutation(api.mutations.setDashboardTermDates, {
      termStartDate,
      nextTermExamDate,
    });

    const afterSave = await t.query(api.plannerQueries.getSettingsPageData, {});
    expect(afterSave.termStartDate).toBe(termStartDate);
    expect(afterSave.nextTermExamDate).toBe(nextTermExamDate);
  });

  test("uses minimal dashboard component visibility by default", async () => {
    const t = await createAuthenticatedTestContext("dashboard-default-components");
    const settings = await t.query(api.plannerQueries.getSettingsPageData, {});
    const dashboard = await t.query(api.dashboardQueries.getDashboardPageData, {
      today: getDhakaDayBucket(Date.now()),
    });

    expect(settings.dashboardComponentVisibility).toEqual(
      DEFAULT_DASHBOARD_COMPONENT_VISIBILITY,
    );
    expect(dashboard.componentVisibility).toEqual(
      DEFAULT_DASHBOARD_COMPONENT_VISIBILITY,
    );
    expect(dashboard.today).not.toBeNull();
    expect(dashboard.completion).not.toBeNull();
    expect(dashboard.urgency).toBeNull();
    expect(dashboard.progression).toBeNull();
    expect(dashboard.studyVolume).toBeNull();
    expect(dashboard.todoCompletion).toBeNull();
    expect(dashboard.subjectProgress).toBeNull();
    expect(dashboard.effortWeightage).toBeNull();
  });

  test("stores dashboard component visibility settings", async () => {
    const t = await createAuthenticatedTestContext("dashboard-component-settings");

    await t.mutation(api.mutations.setDashboardComponentVisibility, {
      componentKey: "studyVolume",
      isVisible: true,
    });
    await t.mutation(api.mutations.setDashboardComponentVisibility, {
      componentKey: "todayTodo",
      isVisible: false,
    });
    await t.mutation(api.mutations.setDashboardComponentVisibility, {
      componentKey: "todoCompletion",
      isVisible: true,
    });

    const settings = await t.query(api.plannerQueries.getSettingsPageData, {});
    const dashboard = await t.query(api.dashboardQueries.getDashboardPageData, {
      today: getDhakaDayBucket(Date.now()),
    });

    expect(settings.dashboardComponentVisibility.studyVolume).toBe(true);
    expect(settings.dashboardComponentVisibility.todayTodo).toBe(false);
    expect(settings.dashboardComponentVisibility.todoCompletion).toBe(true);
    expect(dashboard.componentVisibility.studyVolume).toBe(true);
    expect(dashboard.componentVisibility.todoCompletion).toBe(true);
    expect(dashboard.today).toBeNull();
    expect(dashboard.studyVolume).not.toBeNull();
    expect(dashboard.todoCompletion).not.toBeNull();
  });

  test("rejects invalid dashboard component keys", async () => {
    const t = await createAuthenticatedTestContext("dashboard-invalid-component");

    await expect(
      t.mutation(api.mutations.setDashboardComponentVisibility, {
        componentKey: "unknown" as "todayTodo",
        isVisible: true,
      }),
    ).rejects.toThrow();
  });

  test("rejects inverted term dates", async () => {
    const t = await createAuthenticatedTestContext("dashboard-dates");
    const termStartDate = Date.UTC(2026, 5, 1) - 6 * 60 * 60 * 1000;
    const nextTermExamDate = Date.UTC(2026, 0, 1) - 6 * 60 * 60 * 1000;

    await expect(
      t.mutation(api.mutations.setDashboardTermDates, {
        termStartDate,
        nextTermExamDate,
      }),
    ).rejects.toThrow("Term start date must be before the next-term exam date");
  });

  test("computes todo completion by day, week, and month", async () => {
    const t = await createAuthenticatedTestContext("dashboard-todo-completion");
    const today = getDhakaDayBucket(Date.UTC(2026, 4, 14, 12));
    const weekStart = today - 3 * 86400000;
    const monthStart = getDhakaDayBucket(Date.UTC(2026, 4, 1, 12));
    const previousMonthDay = monthStart - 86400000;

    const subjectId = await t.mutation(api.mutations.createSubject, {
      name: "Physics",
      slug: "physics-todo-completion",
      color: "blue",
      order: 1,
      chapterTrackers: [{ key: "mcq", label: "MCQ", avgMinutes: 30 }],
      conceptTrackers: [],
    });
    const chapterId = await t.mutation(api.mutations.createChapter, {
      subjectId,
      name: "Motion",
      order: 1,
      inNextTerm: true,
    });
    await t.mutation(api.mutations.ensureChapterStudyItems, { subjectId });
    const [studyItem] = await t.query(api.queries.getChapterStudyItems, {
      chapterId,
    });

    await t.mutation(api.mutations.createTodoTask, {
      date: today,
      studyItemId: studyItem!._id,
      durationMinutes: 30,
      source: "manual",
    });
    await t.mutation(api.mutations.toggleStudyItemCompletion, {
      studyItemId: studyItem!._id,
    });

    await t.mutation(api.mutations.createCustomTodoTask, {
      date: today - 86400000,
      title: "Mock test",
      durationMinutes: 30,
    });
    const weeklyCustomId = await t.mutation(api.mutations.createCustomTodoTask, {
      date: weekStart,
      title: "Formula revise",
      durationMinutes: 30,
    });
    await t.mutation(api.mutations.toggleCustomTodoTaskCompletion, {
      todoTaskId: weeklyCustomId,
    });
    await t.mutation(api.mutations.createCustomTodoTask, {
      date: monthStart,
      title: "Month task",
      durationMinutes: 30,
    });
    await t.mutation(api.mutations.createCustomTodoTask, {
      date: previousMonthDay,
      title: "Old task",
      durationMinutes: 30,
    });
    await showDashboardComponents(t, ["todoCompletion"]);

    const dashboard = await t.query(api.dashboardQueries.getDashboardPageData, {
      today,
    });

    expect(dashboard.todoCompletion!.day).toMatchObject({
      completedCount: 1,
      totalCount: 1,
      progressPercentage: 100,
    });
    expect(dashboard.todoCompletion!.week).toMatchObject({
      completedCount: 2,
      totalCount: 3,
      progressPercentage: 67,
    });
    expect(dashboard.todoCompletion!.month).toMatchObject({
      completedCount: 2,
      totalCount: 4,
      progressPercentage: 50,
    });
  });

  test("includes week tasks outside the current month", async () => {
    const t = await createAuthenticatedTestContext("dashboard-todo-week-boundary");
    const today = getDhakaDayBucket(Date.UTC(2026, 3, 1, 12));
    const previousMonthWeekDay = today - 86400000;
    const currentMonthDay = today + 86400000;

    const previousTaskId = await t.mutation(api.mutations.createCustomTodoTask, {
      date: previousMonthWeekDay,
      title: "Previous month week task",
      durationMinutes: 30,
    });
    await t.mutation(api.mutations.toggleCustomTodoTaskCompletion, {
      todoTaskId: previousTaskId,
    });
    await t.mutation(api.mutations.createCustomTodoTask, {
      date: currentMonthDay,
      title: "Current month week task",
      durationMinutes: 30,
    });
    await showDashboardComponents(t, ["todoCompletion"]);

    const dashboard = await t.query(api.dashboardQueries.getDashboardPageData, {
      today,
    });

    expect(dashboard.todoCompletion!.day).toMatchObject({
      completedCount: 0,
      totalCount: 0,
      progressPercentage: 0,
    });
    expect(dashboard.todoCompletion!.week).toMatchObject({
      completedCount: 1,
      totalCount: 2,
      progressPercentage: 50,
    });
    expect(dashboard.todoCompletion!.month).toMatchObject({
      completedCount: 0,
      totalCount: 1,
      progressPercentage: 0,
    });
  });

  test("counts custom, study item, and concept review todo completion", async () => {
    const t = await createAuthenticatedTestContext("dashboard-todo-kinds");
    const today = getDhakaDayBucket(Date.UTC(2026, 4, 14, 12));

    const subjectId = await t.mutation(api.mutations.createSubject, {
      name: "Physics",
      slug: "physics-todo-kinds",
      color: "blue",
      order: 1,
      chapterTrackers: [{ key: "mcq", label: "MCQ", avgMinutes: 30 }],
      conceptTrackers: [],
    });
    const chapterId = await t.mutation(api.mutations.createChapter, {
      subjectId,
      name: "Motion",
      order: 1,
      inNextTerm: true,
    });
    const conceptId = await t.mutation(api.mutations.createConcept, {
      chapterId,
      name: "Velocity",
      order: 1,
    });
    await t.mutation(api.mutations.ensureChapterStudyItems, { subjectId });
    const [studyItem] = await t.query(api.queries.getChapterStudyItems, {
      chapterId,
    });
    const customTaskId = await t.mutation(api.mutations.createCustomTodoTask, {
      date: today,
      title: "Custom task",
      durationMinutes: 30,
    });

    await t.mutation(api.mutations.createTodoTask, {
      date: today,
      studyItemId: studyItem!._id,
      durationMinutes: 30,
      source: "manual",
    });
    await t.mutation(api.mutations.toggleStudyItemCompletion, {
      studyItemId: studyItem!._id,
    });
    await t.mutation(api.mutations.toggleCustomTodoTaskCompletion, {
      todoTaskId: customTaskId,
    });
    await t.run(async (ctx) => {
      const user = await ctx.db.query("users").unique();
      await ctx.db.patch(conceptId, { lastReviewedAt: today + 12 * 60 * 60 * 1000 });
      await ctx.db.insert("todoTasks", {
        userId: user!._id,
        date: today,
        kind: "concept_review",
        conceptId,
        durationMinutes: 15,
        source: "manual",
        sortOrder: 3,
      });
    });
    await showDashboardComponents(t, ["todoCompletion"]);

    const dashboard = await t.query(api.dashboardQueries.getDashboardPageData, {
      today,
    });

    expect(dashboard.todoCompletion!.day).toMatchObject({
      completedCount: 3,
      totalCount: 3,
      progressPercentage: 100,
    });
  });

  test("returns zero todo completion for empty periods", async () => {
    const t = await createAuthenticatedTestContext("dashboard-todo-empty");
    await showDashboardComponents(t, ["todoCompletion"]);

    const dashboard = await t.query(api.dashboardQueries.getDashboardPageData, {
      today: getDhakaDayBucket(Date.UTC(2026, 4, 14, 12)),
    });

    expect(dashboard.todoCompletion!.day).toMatchObject({
      completedCount: 0,
      totalCount: 0,
      progressPercentage: 0,
    });
    expect(dashboard.todoCompletion!.week.totalCount).toBe(0);
    expect(dashboard.todoCompletion!.month.totalCount).toBe(0);
  });

  test("computes next-term progress, overall progress, and subject progress separately", async () => {
    const t = await createAuthenticatedTestContext("dashboard-progress");
    const today = getDhakaDayBucket(Date.now());
    const termStartDate = today - 20 * 86400000;
    const nextTermExamDate = today + 40 * 86400000;

    const subjectId = await t.mutation(api.mutations.createSubject, {
      name: "Physics",
      slug: "physics",
      color: "blue",
      order: 1,
      chapterTrackers: [
        { key: "mcq", label: "MCQ", avgMinutes: 30 },
        { key: "board", label: "Board", avgMinutes: 45 },
      ],
      conceptTrackers: [],
    });

    const nextTermChapterId = await t.mutation(api.mutations.createChapter, {
      subjectId,
      name: "Motion",
      order: 1,
      inNextTerm: true,
    });

    const oldChapterId = await t.mutation(api.mutations.createChapter, {
      subjectId,
      name: "Heat",
      order: 2,
      inNextTerm: false,
    });

    await t.mutation(api.mutations.ensureChapterStudyItems, { subjectId });

    const nextTermItems = await t.query(api.queries.getChapterStudyItems, {
      chapterId: nextTermChapterId,
    });
    const oldChapterItems = await t.query(api.queries.getChapterStudyItems, {
      chapterId: oldChapterId,
    });

    await t.mutation(api.mutations.toggleStudyItemCompletion, {
      studyItemId: nextTermItems[0]!._id,
    });
    await t.mutation(api.mutations.toggleStudyItemCompletion, {
      studyItemId: oldChapterItems[0]!._id,
    });

    await t.mutation(api.mutations.setDashboardTermDates, {
      termStartDate,
      nextTermExamDate,
    });
    await showDashboardComponents(t, [
      "progressionRate",
      "studyVolume",
      "subjectProgress",
    ]);

    const dashboard = await t.query(api.dashboardQueries.getDashboardPageData, {
      today,
    });

    expect(dashboard.completion!.nextTerm).toMatchObject({
      completedItems: 1,
      totalItems: 2,
      progressPercentage: 50,
    });
    expect(dashboard.completion!.allSyllabus).toMatchObject({
      completedItems: 2,
      totalItems: 4,
      progressPercentage: 50,
    });
    expect(dashboard.subjectProgress).toEqual([
      expect.objectContaining({
        name: "Physics",
        completedItems: 1,
        totalItems: 2,
        progressPercentage: 50,
      }),
    ]);
    expect(dashboard.termDates.isConfigured).toBe(true);
    expect(dashboard.urgency).not.toBeNull();
    expect(dashboard.pace).not.toBeNull();
    expect(dashboard.progression?.points.length).toBeGreaterThan(0);
    expect(dashboard.studyVolume!.days).toHaveLength(90);
  });

  test("counts study item completions and concept reviews in study volume", async () => {
    const t = await createAuthenticatedTestContext("dashboard-study-volume");
    const today = getDhakaDayBucket(Date.now());

    const subjectId = await t.mutation(api.mutations.createSubject, {
      name: "Physics",
      slug: "physics-volume",
      color: "blue",
      order: 1,
      chapterTrackers: [{ key: "mcq", label: "MCQ", avgMinutes: 30 }],
      conceptTrackers: [{ key: "book", label: "Book", avgMinutes: 30 }],
    });

    const chapterId = await t.mutation(api.mutations.createChapter, {
      subjectId,
      name: "Motion",
      order: 1,
      inNextTerm: true,
    });

    const conceptId = await t.mutation(api.mutations.createConcept, {
      chapterId,
      name: "Velocity",
      order: 1,
    });

    await t.mutation(api.mutations.ensureChapterStudyItems, { subjectId });
    const chapterItems = await t.query(api.queries.getChapterStudyItems, {
      chapterId,
    });

    await t.mutation(api.mutations.toggleStudyItemCompletion, {
      studyItemId: chapterItems[0]!._id,
    });
    await t.mutation(api.mutations.reviewConcept, {
      conceptId,
      rating: "medium",
    });
    await showDashboardComponents(t, ["studyVolume"]);

    const dashboard = await t.query(api.dashboardQueries.getDashboardPageData, {
      today,
    });
    const todayVolume = dashboard.studyVolume!.days.find((day) => day.date === today);

    expect(dashboard.studyVolume!.totalActivities).toBe(2);
    expect(dashboard.studyVolume!.activeDays).toBe(1);
    expect(todayVolume).toMatchObject({
      activityCount: 2,
      intensity: 2,
    });
  });

  test("sorts subject progress high to low", async () => {
    const t = await createAuthenticatedTestContext("dashboard-subject-sort");

    const highSubjectId = await t.mutation(api.mutations.createSubject, {
      name: "High",
      slug: "high",
      color: "green",
      order: 1,
      chapterTrackers: [{ key: "mcq", label: "MCQ", avgMinutes: 30 }],
      conceptTrackers: [{ key: "book", label: "Book", avgMinutes: 30 }],
    });
    const lowSubjectId = await t.mutation(api.mutations.createSubject, {
      name: "Low",
      slug: "low",
      color: "red",
      order: 2,
      chapterTrackers: [{ key: "mcq", label: "MCQ", avgMinutes: 30 }],
      conceptTrackers: [{ key: "book", label: "Book", avgMinutes: 30 }],
    });

    await t.mutation(api.mutations.createChapter, {
      subjectId: highSubjectId,
      name: "Done",
      order: 1,
      inNextTerm: true,
    });
    await t.mutation(api.mutations.createChapter, {
      subjectId: lowSubjectId,
      name: "Todo",
      order: 1,
      inNextTerm: true,
    });
    await t.mutation(api.mutations.ensureChapterStudyItems, { subjectId: highSubjectId });
    await t.mutation(api.mutations.ensureChapterStudyItems, { subjectId: lowSubjectId });

    const highPage = await t.query(api.queries.getSubjectPageData, { slug: "high" });
    const highItems = await t.query(api.queries.getChapterStudyItems, {
      chapterId: highPage!.chapters[0]!._id,
    });
    await t.mutation(api.mutations.toggleStudyItemCompletion, {
      studyItemId: highItems[0]!._id,
    });
    await showDashboardComponents(t, ["subjectProgress"]);

    const dashboard = await t.query(api.dashboardQueries.getDashboardPageData, {
      today: getDhakaDayBucket(Date.now()),
    });

    expect(dashboard.subjectProgress!.map((subject) => subject.name)).toEqual([
      "High",
      "Low",
    ]);
  });

  test("computes effort against configured subject weights", async () => {
    const t = await createAuthenticatedTestContext("dashboard-effort-weight");

    const physicsId = await t.mutation(api.mutations.createSubject, {
      name: "Physics",
      slug: "physics-effort",
      color: "blue",
      order: 1,
      examWeight: 30,
      chapterTrackers: [{ key: "mcq", label: "MCQ", avgMinutes: 30 }],
      conceptTrackers: [{ key: "book", label: "Book", avgMinutes: 30 }],
    });
    const chemistryId = await t.mutation(api.mutations.createSubject, {
      name: "Chemistry",
      slug: "chemistry-effort",
      color: "green",
      order: 2,
      examWeight: 70,
      chapterTrackers: [{ key: "mcq", label: "MCQ", avgMinutes: 30 }],
      conceptTrackers: [{ key: "book", label: "Book", avgMinutes: 30 }],
    });

    await t.mutation(api.mutations.createChapter, {
      subjectId: physicsId,
      name: "Motion",
      order: 1,
      inNextTerm: true,
    });
    await t.mutation(api.mutations.createChapter, {
      subjectId: chemistryId,
      name: "Atom",
      order: 1,
      inNextTerm: true,
    });
    await t.mutation(api.mutations.ensureChapterStudyItems, { subjectId: physicsId });
    await t.mutation(api.mutations.ensureChapterStudyItems, { subjectId: chemistryId });

    const physics = await t.query(api.queries.getSubjectPageData, {
      slug: "physics-effort",
    });
    const chemistry = await t.query(api.queries.getSubjectPageData, {
      slug: "chemistry-effort",
    });
    const physicsItems = await t.query(api.queries.getChapterStudyItems, {
      chapterId: physics!.chapters[0]!._id,
    });
    const chemistryItems = await t.query(api.queries.getChapterStudyItems, {
      chapterId: chemistry!.chapters[0]!._id,
    });

    await t.mutation(api.mutations.toggleStudyItemCompletion, {
      studyItemId: physicsItems[0]!._id,
    });
    await t.mutation(api.mutations.toggleStudyItemCompletion, {
      studyItemId: chemistryItems[0]!._id,
    });
    await showDashboardComponents(t, ["effortWeightage"]);

    const dashboard = await t.query(api.dashboardQueries.getDashboardPageData, {
      today: getDhakaDayBucket(Date.now()),
    });
    const chemistryEffort = dashboard.effortWeightage!.subjects.find(
      (subject) => subject.name === "Chemistry",
    );

    expect(dashboard.effortWeightage!.hasConfiguredWeights).toBe(true);
    expect(chemistryEffort).toMatchObject({
      studyShare: 50,
      weightShare: 70,
      isUnderStudied: true,
    });
  });

  test("maintains chapter and daily stats while toggling study item completion", async () => {
    const t = await createAuthenticatedTestContext("dashboard-summary-toggle");

    const subjectId = await t.mutation(api.mutations.createSubject, {
      name: "Physics",
      slug: "physics-summary-toggle",
      color: "blue",
      order: 1,
      chapterTrackers: [{ key: "mcq", label: "MCQ", avgMinutes: 30 }],
      conceptTrackers: [],
    });
    const chapterId = await t.mutation(api.mutations.createChapter, {
      subjectId,
      name: "Motion",
      order: 1,
      inNextTerm: true,
    });

    await t.mutation(api.mutations.ensureChapterStudyItems, { subjectId });
    const [item] = await t.query(api.queries.getChapterStudyItems, { chapterId });

    let stats = await t.run(async (ctx) => {
      return await ctx.db.query("studyItemChapterStats").collect();
    });
    expect(stats).toMatchObject([{ totalItems: 1, completedItems: 0 }]);

    await t.mutation(api.mutations.toggleStudyItemCompletion, {
      studyItemId: item!._id,
    });

    stats = await t.run(async (ctx) => {
      return await ctx.db.query("studyItemChapterStats").collect();
    });
    let dayStats = await t.run(async (ctx) => {
      return await ctx.db.query("studyItemCompletionDayStats").collect();
    });
    expect(stats).toMatchObject([{ totalItems: 1, completedItems: 1 }]);
    expect(dayStats).toMatchObject([{ completedCount: 1 }]);

    await t.mutation(api.mutations.toggleStudyItemCompletion, {
      studyItemId: item!._id,
    });

    stats = await t.run(async (ctx) => {
      return await ctx.db.query("studyItemChapterStats").collect();
    });
    dayStats = await t.run(async (ctx) => {
      return await ctx.db.query("studyItemCompletionDayStats").collect();
    });
    expect(stats).toMatchObject([{ totalItems: 1, completedItems: 0 }]);
    expect(dayStats).toEqual([]);
  });

  test("reset and delete paths rebuild or remove dashboard stats", async () => {
    const t = await createAuthenticatedTestContext("dashboard-summary-reset");

    const subjectId = await t.mutation(api.mutations.createSubject, {
      name: "Physics",
      slug: "physics-summary-reset",
      color: "blue",
      order: 1,
      chapterTrackers: [{ key: "mcq", label: "MCQ", avgMinutes: 30 }],
      conceptTrackers: [],
    });
    const chapterId = await t.mutation(api.mutations.createChapter, {
      subjectId,
      name: "Motion",
      order: 1,
      inNextTerm: true,
    });
    await t.mutation(api.mutations.ensureChapterStudyItems, { subjectId });
    const [item] = await t.query(api.queries.getChapterStudyItems, { chapterId });
    await t.mutation(api.mutations.toggleStudyItemCompletion, {
      studyItemId: item!._id,
    });

    await t.mutation(api.mutations.resetChapterProgress, { chapterId });
    let stats = await t.run(async (ctx) => {
      return await ctx.db.query("studyItemChapterStats").collect();
    });
    let dayStats = await t.run(async (ctx) => {
      return await ctx.db.query("studyItemCompletionDayStats").collect();
    });
    expect(stats).toMatchObject([{ totalItems: 1, completedItems: 0 }]);
    expect(dayStats).toEqual([]);

    await t.mutation(api.mutations.deleteChapter, { chapterId });
    stats = await t.run(async (ctx) => {
      return await ctx.db.query("studyItemChapterStats").collect();
    });
    dayStats = await t.run(async (ctx) => {
      return await ctx.db.query("studyItemCompletionDayStats").collect();
    });
    expect(stats).toEqual([]);
    expect(dayStats).toEqual([]);
  });

  test("dashboard falls back when summary rows are missing", async () => {
    const t = await createAuthenticatedTestContext("dashboard-summary-fallback");
    const today = getDhakaDayBucket(Date.now());

    const subjectId = await t.mutation(api.mutations.createSubject, {
      name: "Physics",
      slug: "physics-summary-fallback",
      color: "blue",
      order: 1,
      chapterTrackers: [{ key: "mcq", label: "MCQ", avgMinutes: 30 }],
      conceptTrackers: [],
    });
    const chapterId = await t.mutation(api.mutations.createChapter, {
      subjectId,
      name: "Motion",
      order: 1,
      inNextTerm: true,
    });
    await t.mutation(api.mutations.ensureChapterStudyItems, { subjectId });
    const [item] = await t.query(api.queries.getChapterStudyItems, { chapterId });
    await t.mutation(api.mutations.toggleStudyItemCompletion, {
      studyItemId: item!._id,
    });

    await t.run(async (ctx) => {
      const chapterStats = await ctx.db.query("studyItemChapterStats").collect();
      for (const stat of chapterStats) await ctx.db.delete(stat._id);
      const dayStats = await ctx.db.query("studyItemCompletionDayStats").collect();
      for (const stat of dayStats) await ctx.db.delete(stat._id);
    });

    const dashboard = await t.query(api.dashboardQueries.getDashboardPageData, {
      today,
    });

    expect(dashboard.completion!.nextTerm).toMatchObject({
      completedItems: 1,
      totalItems: 1,
      progressPercentage: 100,
    });
  });

  test("manual backfill creates summary rows for existing legacy study items", async () => {
    vi.useFakeTimers();
    try {
      const t = convexTest(schema, modules);
      const identity = {
        subject: "dashboard-summary-backfill",
        tokenIdentifier: "test|dashboard-summary-backfill",
        name: "dashboard-summary-backfill",
      };
      const now = Date.now();

      await t.run(async (ctx) => {
        await ctx.db.insert("users", {
          tokenIdentifier: identity.tokenIdentifier,
          clerkUserId: identity.subject,
          role: "owner",
          name: identity.name,
        });
        const subjectId = await ctx.db.insert("subjects", {
          name: "Legacy Physics",
          slug: "legacy-physics-summary",
          order: 1,
          chapterTrackers: [{ key: "mcq", label: "MCQ", avgMinutes: 30 }],
          conceptTrackers: [],
        });
        const chapterId = await ctx.db.insert("chapters", {
          subjectId,
          name: "Motion",
          slug: "motion",
          order: 1,
          inNextTerm: true,
        });
        await ctx.db.insert("studyItems", {
          subjectId,
          chapterId,
          type: "mcq",
          title: "Motion - MCQ",
          estimatedMinutes: 30,
          isCompleted: true,
          lastStudiedAt: now,
        });
      });

      const owner = t.withIdentity(identity);
      await owner.mutation(api.auth.ensureCurrentUser, {});
      await owner.mutation(
        api.dashboardStudyItemStats.startDashboardStudyItemStatsBackfill,
        {},
      );
      await t.finishAllScheduledFunctions(() => {
        vi.runAllTimers();
      });

      const status = await owner.query(
        api.dashboardStudyItemStats.getDashboardStudyItemStatsBackfillStatus,
        {},
      );
      const stats = await t.run(async (ctx) => {
        return await ctx.db.query("studyItemChapterStats").collect();
      });
      const dayStats = await t.run(async (ctx) => {
        return await ctx.db.query("studyItemCompletionDayStats").collect();
      });
      const dashboard = await owner.query(api.dashboardQueries.getDashboardPageData, {
        today: getDhakaDayBucket(Date.now()),
      });

      expect(status.status).toBe("completed");
      expect(stats).toMatchObject([{ totalItems: 1, completedItems: 1 }]);
      expect(dayStats).toMatchObject([{ completedCount: 1 }]);
      expect(dashboard.completion!.nextTerm).toMatchObject({
        totalItems: 1,
        completedItems: 1,
        progressPercentage: 100,
      });
    } finally {
      vi.useRealTimers();
    }
  });
});

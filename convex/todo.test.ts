/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

async function createAuthenticatedTestContext(subject: string) {
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

async function createStudyItemFixture(subject: string) {
  const t = await createAuthenticatedTestContext(subject);
  const date = getDhakaDayBucket(Date.now());

  const subjectId = await t.mutation(api.mutations.createSubject, {
    name: "Physics",
    slug: `physics-${subject}`,
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

  await t.mutation(api.mutations.ensureChapterStudyItems, { subjectId });

  const studyItems = await t.query(api.queries.getChapterStudyItems, {
    chapterId,
  });
  const studyItemId = studyItems[0]!._id;

  return { t, date, subjectId, chapterId, studyItemId };
}

async function markTodoSearchDigestBackfillCompleted(
  t: Awaited<ReturnType<typeof createAuthenticatedTestContext>>,
) {
  return await t.run(async (ctx) => {
    const users = await ctx.db.query("users").collect();
    const user = users[0]!;
    const key = `todo_study_item_search_digest_backfill:${user._id}`;
    const existing = await ctx.db
      .query("todoStudyItemSearchDigestMigrations")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        status: "completed",
        processedItems: 0,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("todoStudyItemSearchDigestMigrations", {
        key,
        status: "completed",
        ownerUserId: user._id,
        includeLegacy: user.legacyWorkspaceOwner === true,
        processedItems: 0,
        updatedAt: Date.now(),
      });
    }

    return user._id;
  });
}

async function createRevisionFixture(subject: string) {
  const t = await createAuthenticatedTestContext(subject);
  const date = getDhakaDayBucket(Date.now());

  const subjectId = await t.mutation(api.mutations.createSubject, {
    name: "Physics",
    slug: `physics-revision-${subject}`,
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

  await t.mutation(api.mutations.rescheduleConceptReview, {
    conceptId,
    newNextReviewAt: date,
  });

  return { t, date, conceptId };
}

async function createConceptTodoFixture(subject: string) {
  const t = await createAuthenticatedTestContext(subject);
  const date = getDhakaDayBucket(Date.now());

  const subjectId = await t.mutation(api.mutations.createSubject, {
    name: "Physics",
    slug: `physics-concept-todo-${subject}`,
    order: 1,
    chapterTrackers: [{ key: "mcq", label: "MCQ", avgMinutes: 30 }],
    conceptTrackers: [
      { key: "class", label: "Class", avgMinutes: 20 },
      { key: "book", label: "Book", avgMinutes: 25 },
      { key: "practice", label: "Practice", avgMinutes: 35 },
    ],
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

  await t.mutation(api.mutations.ensureConceptStudyItems, { chapterId });

  const pageData = await t.query(api.queries.getChapterPageData, {
    subjectSlug: `physics-concept-todo-${subject}`,
    chapterSlug: "motion",
  });
  const concept = pageData?.concepts.find((entry) => entry._id === conceptId);
  const studyItemIds = concept?.trackerData.map((tracker) => tracker.studyItemId) ?? [];

  return {
    t,
    date,
    conceptId,
    studyItemIds: studyItemIds as Id<"studyItems">[],
  };
}

describe("todo", () => {
  test("creates a manual todo with a start time", async () => {
    const { t, date, studyItemId } = await createStudyItemFixture("todo-timed");

    await t.mutation(api.mutations.createTodoTask, {
      date,
      studyItemId,
      startTimeMinutes: 9 * 60,
      durationMinutes: 30,
      source: "manual",
    });

    const agenda = await t.query(api.todoQueries.getTodoAgenda, {
      startDate: date,
      days: 1,
    });

    expect(agenda.days[0]?.tasks).toEqual([
      expect.objectContaining({
        studyItemId,
        startTimeMinutes: 9 * 60,
        durationMinutes: 30,
        source: "manual",
      }),
    ]);
  });

  test("creates a manual todo without a start time", async () => {
    const { t, date, studyItemId } = await createStudyItemFixture("todo-untimed");

    await t.mutation(api.mutations.createTodoTask, {
      date,
      studyItemId,
      durationMinutes: 45,
      source: "manual",
    });

    const agenda = await t.query(api.todoQueries.getTodoAgenda, {
      startDate: date,
      days: 1,
    });

    expect(agenda.days[0]?.tasks).toEqual([
      expect.objectContaining({
        studyItemId,
        durationMinutes: 45,
      }),
    ]);
    expect(agenda.days[0]?.tasks[0]).not.toHaveProperty("startTimeMinutes");
  });

  test("rejects invalid todo start times", async () => {
    const { t, date, studyItemId } = await createStudyItemFixture("todo-invalid-time");

    await expect(
      t.mutation(api.mutations.createTodoTask, {
        date,
        studyItemId,
        startTimeMinutes: 9 * 60 + 5,
        durationMinutes: 30,
        source: "manual",
      }),
    ).rejects.toThrow("Start time must be in 15-minute steps");
  });

  test("rejects timed todos that cross the selected day", async () => {
    const { t, date, studyItemId } = await createStudyItemFixture("todo-cross-day");

    await expect(
      t.mutation(api.mutations.createTodoTask, {
        date,
        studyItemId,
        startTimeMinutes: 23 * 60 + 45,
        durationMinutes: 30,
        source: "manual",
      }),
    ).rejects.toThrow("Todo task must end within the selected day");
  });

  test("accepts 12-hour todo durations", async () => {
    const { t, date, studyItemId } = await createStudyItemFixture("todo-long-duration");

    await t.mutation(api.mutations.createTodoTask, {
      date,
      studyItemId,
      durationMinutes: 720,
      source: "manual",
    });

    const agenda = await t.query(api.todoQueries.getTodoAgenda, {
      startDate: date,
      days: 1,
    });

    expect(agenda.days[0]?.tasks[0]).toMatchObject({
      studyItemId,
      durationMinutes: 720,
    });
  });

  test("adds incomplete concept study items to today's todo", async () => {
    const { t, date, conceptId, studyItemIds } =
      await createConceptTodoFixture("bulk-add");

    expect(studyItemIds).toHaveLength(3);

    const result = await t.mutation(
      api.mutations.addConceptStudyItemsToTodayTodo,
      { conceptId },
    );

    expect(result).toMatchObject({
      date,
      addedCount: 3,
      skippedScheduledCount: 0,
      skippedCompletedCount: 0,
    });

    const agenda = await t.query(api.todoQueries.getTodoAgenda, {
      startDate: date,
      days: 1,
    });

    expect(agenda.days[0]?.tasks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          studyItemId: studyItemIds[0],
          durationMinutes: 20,
          source: "manual",
        }),
        expect.objectContaining({
          studyItemId: studyItemIds[1],
          durationMinutes: 25,
          source: "manual",
        }),
        expect.objectContaining({
          studyItemId: studyItemIds[2],
          durationMinutes: 35,
          source: "manual",
        }),
      ]),
    );
    expect(agenda.days[0]?.tasks.every((task) => task.startTimeMinutes === undefined))
      .toBe(true);
  });

  test("skips completed and already scheduled concept study items", async () => {
    const { t, date, conceptId, studyItemIds } =
      await createConceptTodoFixture("bulk-skip");

    expect(studyItemIds).toHaveLength(3);

    await t.mutation(api.mutations.toggleStudyItemCompletion, {
      studyItemId: studyItemIds[0]!,
    });
    await t.mutation(api.mutations.createTodoTask, {
      date,
      studyItemId: studyItemIds[1]!,
      durationMinutes: 45,
      source: "manual",
    });

    const firstResult = await t.mutation(
      api.mutations.addConceptStudyItemsToTodayTodo,
      { conceptId },
    );

    expect(firstResult).toMatchObject({
      date,
      addedCount: 1,
      skippedScheduledCount: 1,
      skippedCompletedCount: 1,
    });

    const secondResult = await t.mutation(
      api.mutations.addConceptStudyItemsToTodayTodo,
      { conceptId },
    );

    expect(secondResult).toMatchObject({
      date,
      addedCount: 0,
      skippedScheduledCount: 2,
      skippedCompletedCount: 1,
    });

    const agenda = await t.query(api.todoQueries.getTodoAgenda, {
      startDate: date,
      days: 1,
    });

    expect(agenda.days[0]?.tasks).toHaveLength(2);
    expect(agenda.days[0]?.tasks.some((task) => task.studyItemId === studyItemIds[0]))
      .toBe(false);
    expect(agenda.days[0]?.tasks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ studyItemId: studyItemIds[1] }),
        expect.objectContaining({ studyItemId: studyItemIds[2] }),
      ]),
    );
  });

  test("creates a custom todo with a start time", async () => {
    const t = await createAuthenticatedTestContext("todo-custom-timed");
    const date = getDhakaDayBucket(Date.now());

    await t.mutation(api.mutations.createCustomTodoTask, {
      date,
      title: "Going to school",
      startTimeMinutes: 7 * 60,
      durationMinutes: 45,
    });

    const agenda = await t.query(api.todoQueries.getTodoAgenda, {
      startDate: date,
      days: 1,
    });

    expect(agenda.days[0]?.tasks).toEqual([
      expect.objectContaining({
        kind: "custom",
        title: "Going to school",
        isCompleted: false,
        startTimeMinutes: 7 * 60,
        durationMinutes: 45,
        source: "manual",
      }),
    ]);
    expect(agenda.days[0]?.tasks[0]).not.toHaveProperty("studyItemId");
  });

  test("creates a custom todo with a color", async () => {
    const t = await createAuthenticatedTestContext("todo-custom-color");
    const date = getDhakaDayBucket(Date.now());

    await t.mutation(api.mutations.createCustomTodoTask, {
      date,
      title: "Sleep",
      durationMinutes: 60,
      customColor: "blue",
    });

    const agenda = await t.query(api.todoQueries.getTodoAgenda, {
      startDate: date,
      days: 1,
    });

    expect(agenda.days[0]?.tasks[0]).toMatchObject({
      kind: "custom",
      customColor: "blue",
      subjectColor: "blue",
    });
  });

  test("defaults custom todo color to gray in agenda data", async () => {
    const t = await createAuthenticatedTestContext("todo-custom-color-default");
    const date = getDhakaDayBucket(Date.now());

    await t.mutation(api.mutations.createCustomTodoTask, {
      date,
      title: "Pack bag",
      durationMinutes: 15,
    });

    const agenda = await t.query(api.todoQueries.getTodoAgenda, {
      startDate: date,
      days: 1,
    });

    expect(agenda.days[0]?.tasks[0]).toMatchObject({
      customColor: "gray",
      subjectColor: "gray",
    });
  });

  test("rejects blank custom todo titles", async () => {
    const t = await createAuthenticatedTestContext("todo-custom-blank");
    const date = getDhakaDayBucket(Date.now());

    await expect(
      t.mutation(api.mutations.createCustomTodoTask, {
        date,
        title: "   ",
        durationMinutes: 15,
      }),
    ).rejects.toThrow("Custom todo title is required");
  });

  test("toggles custom todo completion without changing study progress", async () => {
    const { t, date, chapterId } = await createStudyItemFixture("todo-custom-toggle");
    const todoTaskId = await t.mutation(api.mutations.createCustomTodoTask, {
      date,
      title: "Sleep",
      durationMinutes: 60,
    });

    await t.mutation(api.mutations.toggleCustomTodoTaskCompletion, {
      todoTaskId: todoTaskId as Id<"todoTasks">,
    });

    const agenda = await t.query(api.todoQueries.getTodoAgenda, {
      startDate: date,
      days: 1,
    });
    const studyItems = await t.query(api.queries.getChapterStudyItems, {
      chapterId,
    });
    const studyLogs = await t.query(api.queries.getStudyLogsFeed, {
      paginationOpts: { numItems: 10, cursor: null },
    });

    expect(agenda.days[0]?.tasks[0]).toMatchObject({
      id: todoTaskId,
      kind: "custom",
      isCompleted: true,
    });
    expect(studyItems.every((item) => !item.isCompleted)).toBe(true);
    expect(studyLogs.page).toEqual([]);
  });

  test("paginates study logs with subject and event filters", async () => {
    const t = await createAuthenticatedTestContext("todo-log-pagination");

    const physicsId = await t.mutation(api.mutations.createSubject, {
      name: "Physics",
      slug: "physics-log-pagination",
      order: 1,
      chapterTrackers: [
        { key: "mcq", label: "MCQ", avgMinutes: 30 },
        { key: "board", label: "Board", avgMinutes: 45 },
      ],
      conceptTrackers: [{ key: "book", label: "Book", avgMinutes: 30 }],
    });
    const chemistryId = await t.mutation(api.mutations.createSubject, {
      name: "Chemistry",
      slug: "chemistry-log-pagination",
      order: 2,
      chapterTrackers: [{ key: "mcq", label: "MCQ", avgMinutes: 30 }],
      conceptTrackers: [{ key: "book", label: "Book", avgMinutes: 30 }],
    });

    const physicsChapterId = await t.mutation(api.mutations.createChapter, {
      subjectId: physicsId,
      name: "Motion",
      order: 1,
      inNextTerm: true,
    });
    const chemistryChapterId = await t.mutation(api.mutations.createChapter, {
      subjectId: chemistryId,
      name: "Atom",
      order: 1,
      inNextTerm: true,
    });

    await t.mutation(api.mutations.ensureChapterStudyItems, { subjectId: physicsId });
    await t.mutation(api.mutations.ensureChapterStudyItems, { subjectId: chemistryId });

    const physicsItems = await t.query(api.queries.getChapterStudyItems, {
      chapterId: physicsChapterId,
    });
    const chemistryItems = await t.query(api.queries.getChapterStudyItems, {
      chapterId: chemistryChapterId,
    });

    await t.mutation(api.mutations.toggleStudyItemCompletion, {
      studyItemId: physicsItems[0]!._id,
    });
    await t.mutation(api.mutations.toggleStudyItemCompletion, {
      studyItemId: physicsItems[1]!._id,
    });
    await t.mutation(api.mutations.toggleStudyItemCompletion, {
      studyItemId: chemistryItems[0]!._id,
    });

    const firstPage = await t.query(api.queries.getStudyLogsFeed, {
      paginationOpts: { numItems: 1, cursor: null },
      subjectId: physicsId,
    });
    const secondPage = await t.query(api.queries.getStudyLogsFeed, {
      paginationOpts: { numItems: 10, cursor: firstPage.continueCursor },
      subjectId: physicsId,
    });
    const completedPhysicsLogs = await t.query(api.queries.getStudyLogsFeed, {
      paginationOpts: { numItems: 10, cursor: null },
      subjectId: physicsId,
      eventType: "study_item_completed",
    });

    expect(firstPage.page).toHaveLength(1);
    expect(firstPage.isDone).toBe(false);
    expect(secondPage.page).toHaveLength(1);
    expect([...firstPage.page, ...secondPage.page]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          subjectId: physicsId,
          eventType: "study_item_completed",
        }),
        expect.objectContaining({
          subjectId: physicsId,
          eventType: "study_item_completed",
        }),
      ]),
    );
    expect(completedPhysicsLogs.page).toEqual([
      expect.objectContaining({
        subjectId: physicsId,
        eventType: "study_item_completed",
      }),
      expect.objectContaining({
        subjectId: physicsId,
        eventType: "study_item_completed",
      }),
    ]);
  });

  test("updates a custom todo title and schedule", async () => {
    const t = await createAuthenticatedTestContext("todo-custom-update");
    const date = getDhakaDayBucket(Date.now());
    const todoTaskId = await t.mutation(api.mutations.createCustomTodoTask, {
      date,
      title: "School",
      durationMinutes: 30,
    });

    await t.mutation(api.mutations.updateCustomTodoTask, {
      todoTaskId: todoTaskId as Id<"todoTasks">,
      title: "Going to school",
      startTimeMinutes: 8 * 60,
      durationMinutes: 90,
      customColor: "amber",
    });

    const agenda = await t.query(api.todoQueries.getTodoAgenda, {
      startDate: date,
      days: 1,
    });

    expect(agenda.days[0]?.tasks[0]).toMatchObject({
      id: todoTaskId,
      kind: "custom",
      title: "Going to school",
      startTimeMinutes: 8 * 60,
      durationMinutes: 90,
      customColor: "amber",
    });
  });

  test("dashboard excludes custom todos and keeps study stats study-only", async () => {
    const { t, date } = await createStudyItemFixture("todo-custom-dashboard");

    await t.mutation(api.mutations.createCustomTodoTask, {
      date,
      title: "Pack bag",
      durationMinutes: 15,
    });
    await t.mutation(api.mutations.setDashboardComponentVisibility, {
      componentKey: "studyVolume",
      isVisible: true,
    });

    const dashboard = await t.query(api.dashboardQueries.getDashboardPageData, {
      today: date,
    });

    expect(dashboard.today!.totalCount).toBe(0);
    expect(dashboard.today!.completedCount).toBe(0);
    expect(dashboard.today!.tasks).toEqual([]);
    expect(dashboard.completion!.allSyllabus.completedItems).toBe(0);
    expect(dashboard.studyVolume!.totalActivities).toBe(0);
  });

  test("dashboard still includes study item todos", async () => {
    const { t, date, studyItemId } = await createStudyItemFixture("todo-study-dashboard");

    await t.mutation(api.mutations.createTodoTask, {
      date,
      studyItemId,
      durationMinutes: 30,
      source: "manual",
    });

    const dashboard = await t.query(api.dashboardQueries.getDashboardPageData, {
      today: date,
    });

    expect(dashboard.today!.totalCount).toBe(1);
    expect(dashboard.today!.tasks).toEqual([
      expect.objectContaining({
        kind: "study_item",
        studyItemId,
        durationMinutes: 30,
      }),
    ]);
  });

  test("rejects todo durations outside the presets", async () => {
    const { t, date, studyItemId } = await createStudyItemFixture("todo-invalid-duration");

    await expect(
      t.mutation(api.mutations.createTodoTask, {
        date,
        studyItemId,
        durationMinutes: 735,
        source: "manual",
      }),
    ).rejects.toThrow("Duration must be one of the preset values");
  });

  test("updates an untimed todo to timed", async () => {
    const { t, date, studyItemId } = await createStudyItemFixture("todo-update-timed");

    const todoTaskId = await t.mutation(api.mutations.createTodoTask, {
      date,
      studyItemId,
      durationMinutes: 30,
      source: "manual",
    });

    await t.mutation(api.mutations.updateTodoTaskSchedule, {
      todoTaskId: todoTaskId as Id<"todoTasks">,
      startTimeMinutes: 10 * 60,
      durationMinutes: 60,
    });

    const agenda = await t.query(api.todoQueries.getTodoAgenda, {
      startDate: date,
      days: 1,
    });

    expect(agenda.days[0]?.tasks[0]).toMatchObject({
      id: todoTaskId,
      startTimeMinutes: 10 * 60,
      durationMinutes: 60,
    });
  });

  test("moves a todo to another day and time", async () => {
    const { t, date, studyItemId } = await createStudyItemFixture("todo-move-day");
    const nextDate = date + 86400000;

    const todoTaskId = await t.mutation(api.mutations.createTodoTask, {
      date,
      studyItemId,
      durationMinutes: 30,
      source: "manual",
    });

    await t.mutation(api.mutations.updateTodoTaskSchedule, {
      todoTaskId: todoTaskId as Id<"todoTasks">,
      date: nextDate,
      startTimeMinutes: 14 * 60,
      durationMinutes: 60,
    });

    const agenda = await t.query(api.todoQueries.getTodoAgenda, {
      startDate: date,
      days: 2,
    });

    expect(agenda.days[0]?.tasks).toEqual([]);
    expect(agenda.days[1]?.tasks[0]).toMatchObject({
      id: todoTaskId,
      studyItemId,
      startTimeMinutes: 14 * 60,
      durationMinutes: 60,
    });
  });

  test("rejects moving a study item todo onto a duplicate day", async () => {
    const { t, date, studyItemId } = await createStudyItemFixture("todo-move-duplicate");
    const nextDate = date + 86400000;

    const todoTaskId = await t.mutation(api.mutations.createTodoTask, {
      date,
      studyItemId,
      durationMinutes: 30,
      source: "manual",
    });
    await t.mutation(api.mutations.createTodoTask, {
      date: nextDate,
      studyItemId,
      durationMinutes: 45,
      source: "manual",
    });

    await expect(
      t.mutation(api.mutations.updateTodoTaskSchedule, {
        todoTaskId: todoTaskId as Id<"todoTasks">,
        date: nextDate,
        startTimeMinutes: 8 * 60,
        durationMinutes: 30,
      }),
    ).rejects.toThrow("This study item is already scheduled for that day");
  });

  test("updates a timed todo to untimed", async () => {
    const { t, date, studyItemId } = await createStudyItemFixture("todo-update-untimed");

    const todoTaskId = await t.mutation(api.mutations.createTodoTask, {
      date,
      studyItemId,
      startTimeMinutes: 10 * 60,
      durationMinutes: 30,
      source: "manual",
    });

    await t.mutation(api.mutations.updateTodoTaskSchedule, {
      todoTaskId: todoTaskId as Id<"todoTasks">,
      durationMinutes: 45,
    });

    const agenda = await t.query(api.todoQueries.getTodoAgenda, {
      startDate: date,
      days: 1,
    });

    expect(agenda.days[0]?.tasks[0]).toMatchObject({
      id: todoTaskId,
      durationMinutes: 45,
    });
    expect(agenda.days[0]?.tasks[0]).not.toHaveProperty("startTimeMinutes");
  });

  test("updates completed todo schedule without changing completion", async () => {
    const { t, date, studyItemId } = await createStudyItemFixture("todo-completed-edit");

    const todoTaskId = await t.mutation(api.mutations.createTodoTask, {
      date,
      studyItemId,
      startTimeMinutes: 8 * 60,
      durationMinutes: 30,
      source: "manual",
    });

    await t.mutation(api.mutations.toggleStudyItemCompletion, { studyItemId });
    await t.mutation(api.mutations.updateTodoTaskSchedule, {
      todoTaskId: todoTaskId as Id<"todoTasks">,
      startTimeMinutes: 9 * 60,
      durationMinutes: 60,
    });

    const agenda = await t.query(api.todoQueries.getTodoAgenda, {
      startDate: date,
      days: 1,
    });

    expect(agenda.days[0]?.tasks[0]).toMatchObject({
      id: todoTaskId,
      isCompleted: true,
      startTimeMinutes: 9 * 60,
      durationMinutes: 60,
    });
  });

  test("deletes only the todo and leaves study item state unchanged", async () => {
    const { t, date, chapterId, studyItemId } = await createStudyItemFixture("todo-delete");

    const todoTaskId = await t.mutation(api.mutations.createTodoTask, {
      date,
      studyItemId,
      durationMinutes: 30,
      source: "manual",
    });

    await t.mutation(api.mutations.deleteTodoTask, {
      todoTaskId: todoTaskId as Id<"todoTasks">,
    });

    const agenda = await t.query(api.todoQueries.getTodoAgenda, {
      startDate: date,
      days: 1,
    });
    const studyItems = await t.query(api.queries.getChapterStudyItems, {
      chapterId,
    });
    const studyItem = studyItems.find((item) => item._id === studyItemId);

    expect(agenda.days[0]?.tasks).toEqual([]);
    expect(studyItem?.isCompleted).toBe(false);
  });

  test("searches scheduled revision concepts by concept, chapter, and subject", async () => {
    const { t, date, conceptId } = await createRevisionFixture("todo-revision-search");

    for (const searchText of ["Velocity", "Motion", "Physics"]) {
      const results = await t.query(api.todoQueries.searchConceptReviewsForTodo, {
        date,
        searchText,
      });

      expect(results).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            _id: conceptId,
            conceptName: "Velocity",
            chapterName: "Motion",
            subjectName: "Physics",
          }),
        ]),
      );
    }
  });

  test("searches study items with a two-character threshold", async () => {
    const { t, date, studyItemId } = await createStudyItemFixture(
      "todo-study-item-search",
    );

    const tooShortResults = await t.query(api.todoQueries.searchStudyItemsForTodo, {
      date,
      searchText: "m",
    });
    const englishResults = await t.query(api.todoQueries.searchStudyItemsForTodo, {
      date,
      searchText: "Motion",
    });

    expect(tooShortResults).toEqual([]);
    expect(englishResults).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          _id: studyItemId,
          subjectName: "Physics",
          chapterName: "Motion",
        }),
      ]),
    );
  });

  test("creates todo study item search digests during lazy item creation", async () => {
    const { t, studyItemId } = await createStudyItemFixture(
      "todo-search-digest-lazy",
    );

    const digests = await t.run(async (ctx) => {
      return await ctx.db.query("todoStudyItemSearchDigests").collect();
    });

    expect(digests).toEqual([
      expect.objectContaining({
        studyItemId,
        title: "Motion — MCQ",
        subjectName: "Physics",
        chapterName: "Motion",
        estimatedMinutes: 30,
        isCompleted: false,
      }),
    ]);
  });

  test("uses digest-backed study item search and hides scheduled items", async () => {
    const { t, date, studyItemId } = await createStudyItemFixture(
      "todo-search-digest-path",
    );
    await markTodoSearchDigestBackfillCompleted(t);

    const beforeScheduling = await t.query(api.todoQueries.searchStudyItemsForTodo, {
      date,
      searchText: "Motion",
    });
    expect(beforeScheduling).toEqual([
      expect.objectContaining({
        _id: studyItemId,
        title: "Motion — MCQ",
        subjectName: "Physics",
        chapterName: "Motion",
        subjectColor: "gray",
        estimatedMinutes: 30,
      }),
    ]);

    await t.mutation(api.mutations.createTodoTask, {
      date,
      studyItemId,
      durationMinutes: 30,
      source: "manual",
    });

    const afterScheduling = await t.query(api.todoQueries.searchStudyItemsForTodo, {
      date,
      searchText: "Motion",
    });
    expect(afterScheduling.some((result) => result._id === studyItemId)).toBe(false);
  });

  test("keeps digest completion state in sync with study item completion", async () => {
    const { t, date, studyItemId } = await createStudyItemFixture(
      "todo-search-digest-completion",
    );
    await markTodoSearchDigestBackfillCompleted(t);

    await t.mutation(api.mutations.toggleStudyItemCompletion, { studyItemId });

    let digests = await t.run(async (ctx) => {
      return await ctx.db.query("todoStudyItemSearchDigests").collect();
    });
    expect(digests[0]?.isCompleted).toBe(true);

    let results = await t.query(api.todoQueries.searchStudyItemsForTodo, {
      date,
      searchText: "Motion",
    });
    expect(results.some((result) => result._id === studyItemId)).toBe(false);

    await t.mutation(api.mutations.toggleStudyItemCompletion, { studyItemId });

    digests = await t.run(async (ctx) => {
      return await ctx.db.query("todoStudyItemSearchDigests").collect();
    });
    expect(digests[0]?.isCompleted).toBe(false);

    results = await t.query(api.todoQueries.searchStudyItemsForTodo, {
      date,
      searchText: "Motion",
    });
    expect(results.some((result) => result._id === studyItemId)).toBe(true);
  });

  test("updates digest display fields after subject and chapter edits", async () => {
    const { t, date, subjectId, chapterId, studyItemId } =
      await createStudyItemFixture("todo-search-digest-renames");
    await markTodoSearchDigestBackfillCompleted(t);

    await t.mutation(api.mutations.updateSubject, {
      subjectId,
      name: "Advanced Physics",
      color: "emerald",
    });
    await t.mutation(api.mutations.updateChapter, {
      chapterId,
      name: "Kinematics",
      slug: "kinematics",
      order: 1,
      inNextTerm: true,
    });

    const digests = await t.run(async (ctx) => {
      return await ctx.db.query("todoStudyItemSearchDigests").collect();
    });
    expect(digests).toEqual([
      expect.objectContaining({
        studyItemId,
        title: "Kinematics — MCQ",
        subjectName: "Advanced Physics",
        chapterName: "Kinematics",
        subjectColor: "emerald",
      }),
    ]);

    const results = await t.query(api.todoQueries.searchStudyItemsForTodo, {
      date,
      searchText: "Kinematics",
    });
    expect(results).toEqual([
      expect.objectContaining({
        _id: studyItemId,
        subjectName: "Advanced Physics",
        chapterName: "Kinematics",
        subjectColor: "emerald",
      }),
    ]);
  });

  test("updates and removes concept-level digest rows", async () => {
    const { t, date, conceptId, studyItemIds } =
      await createConceptTodoFixture("digest-concept-maintenance");
    await markTodoSearchDigestBackfillCompleted(t);

    await t.mutation(api.mutations.updateConcept, {
      conceptId,
      name: "Speed",
      order: 1,
    });

    let digests = await t.run(async (ctx) => {
      return await ctx.db.query("todoStudyItemSearchDigests").collect();
    });
    expect(digests).toHaveLength(3);
    expect(digests).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          studyItemId: studyItemIds[0],
          conceptName: "Speed",
          chapterName: "Motion",
        }),
      ]),
    );

    const results = await t.query(api.todoQueries.searchStudyItemsForTodo, {
      date,
      searchText: "Speed",
    });
    expect(results.map((result) => result._id)).toEqual(
      expect.arrayContaining(studyItemIds),
    );

    await t.mutation(api.mutations.deleteConcept, { conceptId });

    digests = await t.run(async (ctx) => {
      return await ctx.db.query("todoStudyItemSearchDigests").collect();
    });
    expect(digests).toEqual([]);
  });

  test("backfills todo search digests for existing legacy study items", async () => {
    vi.useFakeTimers();
    try {
      const t = convexTest(schema, modules);
      const identity = {
        subject: "todo-search-digest-legacy",
        tokenIdentifier: "test|todo-search-digest-legacy",
        name: "todo-search-digest-legacy",
      };

      await t.run(async (ctx) => {
        await ctx.db.insert("users", {
          tokenIdentifier: identity.tokenIdentifier,
          clerkUserId: identity.subject,
          role: "owner",
          legacyWorkspaceOwner: true,
          name: identity.name,
        });
        const subjectId = await ctx.db.insert("subjects", {
          name: "Legacy Physics",
          slug: "legacy-physics-todo-search",
          color: "blue",
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
          title: "Motion — MCQ",
          estimatedMinutes: 30,
          isCompleted: false,
        });
      });

      const owner = t.withIdentity(identity);
      await owner.mutation(api.auth.ensureCurrentUser, {});
      await owner.mutation(
        api.todoStudyItemSearchDigests.startTodoStudyItemSearchDigestBackfill,
        {},
      );
      await t.finishAllScheduledFunctions(() => {
        vi.runAllTimers();
      });

      const status = await owner.query(
        api.todoStudyItemSearchDigests.getTodoStudyItemSearchDigestBackfillStatus,
        {},
      );
      const digests = await t.run(async (ctx) => {
        return await ctx.db.query("todoStudyItemSearchDigests").collect();
      });

      expect(status.status).toBe("completed");
      expect(digests).toEqual([
        expect.objectContaining({
          subjectName: "Legacy Physics",
          chapterName: "Motion",
          title: "Motion — MCQ",
          isCompleted: false,
        }),
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  test("revision dashboard only includes overdue, today, and next seven day reviews", async () => {
    const t = await createAuthenticatedTestContext("todo-revision-dashboard-range");
    const date = getDhakaDayBucket(Date.now());
    const now = date + 12 * 60 * 60 * 1000;

    const subjectId = await t.mutation(api.mutations.createSubject, {
      name: "Physics",
      slug: "physics-revision-dashboard-range",
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

    const overdueId = await t.mutation(api.mutations.createConcept, {
      chapterId,
      name: "Overdue",
      order: 1,
    });
    const todayId = await t.mutation(api.mutations.createConcept, {
      chapterId,
      name: "Today",
      order: 2,
    });
    const upcomingId = await t.mutation(api.mutations.createConcept, {
      chapterId,
      name: "Upcoming",
      order: 3,
    });
    const farFutureId = await t.mutation(api.mutations.createConcept, {
      chapterId,
      name: "Far future",
      order: 4,
    });

    await t.mutation(api.mutations.rescheduleConceptReview, {
      conceptId: overdueId,
      newNextReviewAt: date - 86400000,
    });
    await t.mutation(api.mutations.rescheduleConceptReview, {
      conceptId: todayId,
      newNextReviewAt: date + 60 * 60 * 1000,
    });
    await t.mutation(api.mutations.rescheduleConceptReview, {
      conceptId: upcomingId,
      newNextReviewAt: date + 3 * 86400000,
    });
    await t.mutation(api.mutations.rescheduleConceptReview, {
      conceptId: farFutureId,
      newNextReviewAt: date + 12 * 86400000,
    });

    const dashboard = await t.query(api.queries.getReviewsDashboardData, {
      now,
    });

    expect(dashboard.stats).toMatchObject({
      overdueCount: 1,
      dueTodayCount: 1,
      upcomingCount: 1,
    });
    expect(dashboard.overdue.map((concept) => concept._id)).toEqual([overdueId]);
    expect(dashboard.dueToday.map((concept) => concept._id)).toEqual([todayId]);
    expect(dashboard.upcoming.map((concept) => concept._id)).toEqual([upcomingId]);
    expect(
      [...dashboard.overdue, ...dashboard.dueToday, ...dashboard.upcoming].some(
        (concept) => concept._id === farFutureId,
      ),
    ).toBe(false);
  });

  test("hides already scheduled revision concepts from todo search", async () => {
    const { t, date, conceptId } = await createRevisionFixture("todo-revision-duplicate-search");

    await t.mutation(api.mutations.createConceptReviewTodoTask, {
      date,
      conceptId,
      durationMinutes: 15,
      source: "manual",
    });

    const results = await t.query(api.todoQueries.searchConceptReviewsForTodo, {
      date,
      searchText: "Velocity",
    });

    expect(results.some((result) => result._id === conceptId)).toBe(false);
  });

  test("creates a manual revision todo", async () => {
    const { t, date, conceptId } = await createRevisionFixture("todo-revision-create");

    await t.mutation(api.mutations.createConceptReviewTodoTask, {
      date,
      conceptId,
      startTimeMinutes: 8 * 60,
      durationMinutes: 30,
      source: "manual",
    });

    const agenda = await t.query(api.todoQueries.getTodoAgenda, {
      startDate: date,
      days: 1,
    });

    expect(agenda.days[0]?.tasks).toEqual([
      expect.objectContaining({
        kind: "concept_review",
        conceptId,
        startTimeMinutes: 8 * 60,
        durationMinutes: 30,
        source: "manual",
      }),
    ]);
  });

  test("rejects duplicate revision todos on the same day", async () => {
    const { t, date, conceptId } = await createRevisionFixture("todo-revision-duplicate");

    await t.mutation(api.mutations.createConceptReviewTodoTask, {
      date,
      conceptId,
      durationMinutes: 15,
      source: "manual",
    });

    await expect(
      t.mutation(api.mutations.createConceptReviewTodoTask, {
        date,
        conceptId,
        durationMinutes: 15,
        source: "manual",
      }),
    ).rejects.toThrow("This revision is already scheduled for that day");
  });
});

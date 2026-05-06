/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
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

  return { t, date, chapterId, studyItemId };
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

    const dashboard = await t.query(api.dashboardQueries.getDashboardPageData, {});

    expect(dashboard.today.totalCount).toBe(0);
    expect(dashboard.today.completedCount).toBe(0);
    expect(dashboard.today.tasks).toEqual([]);
    expect(dashboard.completion.allSyllabus.completedItems).toBe(0);
    expect(dashboard.studyVolume.totalActivities).toBe(0);
  });

  test("dashboard still includes study item todos", async () => {
    const { t, date, studyItemId } = await createStudyItemFixture("todo-study-dashboard");

    await t.mutation(api.mutations.createTodoTask, {
      date,
      studyItemId,
      durationMinutes: 30,
      source: "manual",
    });

    const dashboard = await t.query(api.dashboardQueries.getDashboardPageData, {});

    expect(dashboard.today.totalCount).toBe(1);
    expect(dashboard.today.tasks).toEqual([
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
});

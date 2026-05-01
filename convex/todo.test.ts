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

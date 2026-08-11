/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const DAY_MS = 86_400_000;

function getDhakaDayBucket(timestamp: number) {
  const offset = 6 * 60 * 60 * 1_000;
  const date = new Date(timestamp + offset);
  date.setUTCHours(0, 0, 0, 0);
  return date.getTime() - offset;
}

async function createFixture(identitySuffix: string) {
  const identity = {
    subject: `target-${identitySuffix}`,
    tokenIdentifier: `test|target-${identitySuffix}`,
    name: `target-${identitySuffix}`,
  };
  const t = convexTest(schema, modules).withIdentity(identity);
  await t.mutation(api.auth.ensureCurrentUser, {});

  const physicsId = await t.mutation(api.mutations.createSubject, {
    name: "Physics",
    slug: `physics-target-${identitySuffix}`,
    order: 1,
    chapterTrackers: [{ key: "board", label: "Board", avgMinutes: 45 }],
    conceptTrackers: [
      { key: "class", label: "Class", avgMinutes: 30 },
      { key: "book", label: "Book", avgMinutes: 45 },
    ],
  });
  const motionId = await t.mutation(api.mutations.createChapter, {
    subjectId: physicsId,
    name: "Motion",
    slug: `motion-${identitySuffix}`,
    order: 1,
    inNextTerm: true,
  });
  await t.mutation(api.mutations.createConcept, {
    chapterId: motionId,
    name: "Velocity",
    order: 1,
  });

  const chemistryId = await t.mutation(api.mutations.createSubject, {
    name: "Chemistry",
    slug: `chemistry-target-${identitySuffix}`,
    order: 2,
    chapterTrackers: [{ key: "cq", label: "CQ", avgMinutes: 30 }],
    conceptTrackers: [
      { key: "class", label: "Class", avgMinutes: 20 },
      { key: "practice", label: "Practice", avgMinutes: 40 },
    ],
  });
  const moleId = await t.mutation(api.mutations.createChapter, {
    subjectId: chemistryId,
    name: "Mole Concept",
    slug: `mole-${identitySuffix}`,
    order: 1,
    inNextTerm: false,
  });
  await t.mutation(api.mutations.createConcept, {
    chapterId: moleId,
    name: "Molar mass",
    order: 1,
  });

  return { t, physicsId, chemistryId, motionId, moleId };
}

describe("study targets", () => {
  test("creates one multi-subject target and schedules only concept trackers", async () => {
    const { t, physicsId, chemistryId, motionId, moleId } =
      await createFixture("create");
    const today = getDhakaDayBucket(Date.now());

    await t.mutation(api.mutations.ensureChapterStudyItems, {
      subjectId: physicsId,
    });
    await t.mutation(api.mutations.ensureChapterStudyItems, {
      subjectId: chemistryId,
    });

    const result = await t.mutation(api.studyTargets.createStudyTarget, {
      title: "Finish science chapters",
      startDate: today,
      endDate: today + 2 * DAY_MS,
      chapterIds: [motionId, moleId],
    });

    expect(result).toMatchObject({
      createdTodoCount: 4,
      linkedTodoCount: 0,
      scheduledTaskCount: 4,
    });

    const targetStudyItems = await t.run(async (ctx) => {
      const allTodos = await ctx.db.query("todoTasks").collect();
      return await Promise.all(
        allTodos
          .filter((todo) => todo.studyTargetId === result.studyTargetId)
          .map((todo) => ctx.db.get(todo.studyItemId!)),
      );
    });

    const todos = await t.run(async (ctx) =>
      (await ctx.db.query("todoTasks").collect()).filter(
        (todo) => todo.studyTargetId === result.studyTargetId,
      ),
    );
    expect(todos).toHaveLength(4);
    expect(todos.every((todo) => todo.source === "target")).toBe(true);
    expect(targetStudyItems.every((item) => item?.conceptId !== undefined)).toBe(
      true,
    );

    const page = await t.query(api.studyTargets.getStudyTargetPageData, { today });
    expect(page.target).toMatchObject({
      title: "Finish science chapters",
      totalTrackerItems: 4,
      completedTrackerItems: 0,
      remainingTrackerItems: 4,
    });
    expect(page.target?.chapters.map((chapter) => chapter.chapterId)).toEqual([
      motionId,
      moleId,
    ]);

    await expect(
      t.mutation(api.studyTargets.createStudyTarget, {
        title: "Second target",
        startDate: today,
        endDate: today + DAY_MS,
        chapterIds: [motionId],
      }),
    ).rejects.toThrow("Only one active study target is allowed");
  });

  test("links an existing manual Todo instead of duplicating it", async () => {
    const { t, motionId } = await createFixture("link-manual");
    const today = getDhakaDayBucket(Date.now());
    await t.mutation(api.mutations.ensureConceptStudyItems, {
      chapterId: motionId,
    });
    const conceptItem = await t.run(async (ctx) => {
      const studyItems = await ctx.db
        .query("studyItems")
        .withIndex("by_chapter", (q) => q.eq("chapterId", motionId))
        .collect();
      return studyItems.find((item) => item.conceptId !== undefined)!;
    });

    const manualTodoId = await t.mutation(api.mutations.createTodoTask, {
      date: today,
      studyItemId: conceptItem._id,
      durationMinutes: conceptItem.estimatedMinutes,
      source: "manual",
    });
    const result = await t.mutation(api.studyTargets.createStudyTarget, {
      title: "Motion target",
      startDate: today,
      endDate: today + DAY_MS,
      chapterIds: [motionId],
    });

    expect(result).toMatchObject({ createdTodoCount: 1, linkedTodoCount: 1 });
    const manualTodo = await t.run((ctx) => ctx.db.get(manualTodoId));
    expect(manualTodo).toMatchObject({
      source: "manual",
      studyTargetId: result.studyTargetId,
    });
  });

  test("reflects completion and extends by replanning only unfinished target Todos", async () => {
    const { t, motionId } = await createFixture("extend");
    const today = getDhakaDayBucket(Date.now());
    const created = await t.mutation(api.studyTargets.createStudyTarget, {
      title: "Motion target",
      startDate: today,
      endDate: today + DAY_MS,
      chapterIds: [motionId],
    });
    const todosBefore = await t.run(async (ctx) =>
      (await ctx.db.query("todoTasks").collect()).filter(
        (todo) => todo.studyTargetId === created.studyTargetId,
      ),
    );
    const completedTodo = todosBefore[0]!;
    await t.mutation(api.mutations.toggleStudyItemCompletion, {
      studyItemId: completedTodo.studyItemId as Id<"studyItems">,
    });

    const progress = await t.query(api.studyTargets.getStudyTargetPageData, {
      today,
    });
    expect(progress.target).toMatchObject({
      completedTrackerItems: 1,
      remainingTrackerItems: 1,
      progressPercent: 50,
    });

    const newEndDate = today + 4 * DAY_MS;
    const extended = await t.mutation(api.studyTargets.extendStudyTarget, {
      endDate: newEndDate,
      today,
    });
    expect(extended).toMatchObject({ scheduledTaskCount: 1 });

    const todosAfter = await t.run(async (ctx) =>
      (await ctx.db.query("todoTasks").collect()).filter(
        (todo) => todo.studyTargetId === created.studyTargetId,
      ),
    );
    expect(todosAfter).toHaveLength(2);
    expect(todosAfter.some((todo) => todo._id === completedTodo._id)).toBe(true);
    expect(new Set(todosAfter.map((todo) => todo.studyItemId)).size).toBe(2);

    const page = await t.query(api.studyTargets.getStudyTargetPageData, { today });
    expect(page.target?.endDate).toBe(newEndDate);
  });

  test("archives an emptied target when its last selected chapter is deleted", async () => {
    const { t, motionId, moleId } = await createFixture("delete-chapter");
    const today = getDhakaDayBucket(Date.now());
    await t.mutation(api.studyTargets.createStudyTarget, {
      title: "Motion target",
      startDate: today,
      endDate: today + DAY_MS,
      chapterIds: [motionId],
    });

    await t.mutation(api.mutations.deleteChapter, { chapterId: motionId });

    const page = await t.query(api.studyTargets.getStudyTargetPageData, { today });
    expect(page.target).toBeNull();

    await expect(
      t.mutation(api.studyTargets.createStudyTarget, {
        title: "Chemistry target",
        startDate: today,
        endDate: today + DAY_MS,
        chapterIds: [moleId],
      }),
    ).resolves.toMatchObject({ scheduledTaskCount: 2 });
  });
});

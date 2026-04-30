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

type AuthenticatedTestContext = Awaited<
  ReturnType<typeof createAuthenticatedTestContext>
>;

function getDhakaDayBucket(timestamp: number) {
  const dhakaOffset = 6 * 60 * 60 * 1000;
  const dhakaTime = new Date(timestamp + dhakaOffset);
  dhakaTime.setUTCHours(0, 0, 0, 0);
  return dhakaTime.getTime() - dhakaOffset;
}

async function createSubjectWithNextTermChapter(args: {
  t: AuthenticatedTestContext;
  name: string;
  slug: string;
  color?: string;
  chapterTrackers: Array<{ key: string; label: string; avgMinutes: number }>;
  conceptTrackers: Array<{ key: string; label: string; avgMinutes: number }>;
  chapterName: string;
}) {
  const subjectId = await args.t.mutation(api.mutations.createSubject, {
    name: args.name,
    slug: args.slug,
    color: args.color,
    order: 1,
    chapterTrackers: args.chapterTrackers,
    conceptTrackers: args.conceptTrackers,
  });

  const chapterId = await args.t.mutation(api.mutations.createChapter, {
    subjectId,
    name: args.chapterName,
    order: 1,
    inNextTerm: true,
  });

  await args.t.mutation(api.mutations.ensureChapterStudyItems, { subjectId });

  return { subjectId, chapterId };
}

describe("planner", () => {
  test("hides chapter-level tasks until concept-level items are complete", async () => {
    const t = await createAuthenticatedTestContext("planner-hide-chapter");
    const date = getDhakaDayBucket(Date.now());

    const subjectId = await t.mutation(api.mutations.createSubject, {
      name: "Physics",
      slug: "physics",
      order: 1,
      chapterTrackers: [{ key: "mcq", label: "MCQ", avgMinutes: 30 }],
      conceptTrackers: [{ key: "book", label: "Book", avgMinutes: 20 }],
    });

    const chapterId = await t.mutation(api.mutations.createChapter, {
      subjectId,
      name: "Motion",
      order: 1,
      inNextTerm: true,
    });

    await t.mutation(api.mutations.createConcept, {
      chapterId,
      name: "Velocity",
      order: 1,
    });

    await t.mutation(api.mutations.ensureChapterStudyItems, { subjectId });
    await t.mutation(api.mutations.ensureConceptStudyItems, { chapterId });

    await t.mutation(api.mutations.generatePlannerSuggestions, {
      date,
      availableMinutes: 120,
    });

    const planner = await t.query(api.plannerQueries.getPlannerPageData, { date });

    expect(planner.suggestions.length).toBeGreaterThan(0);
    expect(planner.suggestions.every((suggestion) => suggestion.kind === "study_item")).toBe(
      true,
    );
    expect(
      planner.suggestions.some((suggestion) => suggestion.title.includes("Motion")),
    ).toBe(false);
    expect(
      planner.suggestions.some((suggestion) => suggestion.title.includes("Velocity")),
    ).toBe(true);
  });

  test("accepting a revision suggestion creates an unscheduled revision todo task", async () => {
    const t = await createAuthenticatedTestContext("planner-revision");
    const date = getDhakaDayBucket(Date.now());

    const subjectId = await t.mutation(api.mutations.createSubject, {
      name: "Chemistry",
      slug: "chemistry",
      order: 1,
      chapterTrackers: [{ key: "mcq", label: "MCQ", avgMinutes: 30 }],
      conceptTrackers: [{ key: "book", label: "Book", avgMinutes: 20 }],
    });

    const chapterId = await t.mutation(api.mutations.createChapter, {
      subjectId,
      name: "Atoms",
      order: 1,
      inNextTerm: true,
    });

    const conceptId = await t.mutation(api.mutations.createConcept, {
      chapterId,
      name: "Electron",
      order: 1,
    });

    await t.mutation(api.mutations.ensureChapterStudyItems, { subjectId });
    await t.mutation(api.mutations.ensureConceptStudyItems, { chapterId });
    await t.mutation(api.mutations.rescheduleConceptReview, {
      conceptId,
      newNextReviewAt: date,
    });

    await t.mutation(api.mutations.generatePlannerSuggestions, {
      date,
      availableMinutes: 30,
    });

    const planner = await t.query(api.plannerQueries.getPlannerPageData, { date });
    const revisionSuggestion = planner.suggestions.find(
      (suggestion) => suggestion.kind === "concept_review",
    );

    expect(revisionSuggestion).toBeTruthy();

    await t.mutation(api.mutations.acceptPlannerSuggestion, {
      suggestionId: revisionSuggestion!._id as Id<"plannerSuggestions">,
    });

    const todo = await t.query(api.todoQueries.getTodoAgenda, {
      startDate: date,
      days: 1,
    });

    expect(todo.days[0]?.unscheduledTasks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "concept_review",
          conceptId,
        }),
      ]),
    );
  });

  test("important subjects outrank slightly lower-completion normal subjects", async () => {
    const t = await createAuthenticatedTestContext("planner-priority");
    const date = getDhakaDayBucket(Date.now());

    const physics = await createSubjectWithNextTermChapter({
      t,
      name: "Physics",
      slug: "physics",
      color: "blue",
      chapterTrackers: [
        { key: "mcq", label: "MCQ", avgMinutes: 30 },
        { key: "board", label: "Board", avgMinutes: 30 },
      ],
      conceptTrackers: [],
      chapterName: "Force",
    });

    const chemistry = await createSubjectWithNextTermChapter({
      t,
      name: "Chemistry",
      slug: "chemistry",
      color: "green",
      chapterTrackers: [{ key: "mcq", label: "MCQ", avgMinutes: 30 }],
      conceptTrackers: [],
      chapterName: "Mole",
    });

    const physicsItems = await t.query(api.queries.getChapterStudyItems, {
      chapterId: physics.chapterId,
    });

    await t.mutation(api.mutations.toggleStudyItemCompletion, {
      studyItemId: physicsItems[0]!._id,
    });
    await t.mutation(api.mutations.setPlannerSubjectPriority, {
      subjectId: physics.subjectId,
      priority: "important",
    });

    await t.mutation(api.mutations.generatePlannerSuggestions, {
      date,
      availableMinutes: 30,
    });

    const planner = await t.query(api.plannerQueries.getPlannerPageData, { date });

    expect(planner.suggestions[0]?.subjectName).toBe("Physics");

    // Keep chemistry referenced so the fixture stays intentional.
    expect(chemistry.subjectId).toBeTruthy();
  });
});

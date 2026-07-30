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

  test("keeps concept study items together and follows concept order", async () => {
    const t = await createAuthenticatedTestContext("planner-concept-order");
    const date = getDhakaDayBucket(Date.now());

    const subjectId = await t.mutation(api.mutations.createSubject, {
      name: "Physics",
      slug: "physics",
      order: 1,
      chapterTrackers: [{ key: "mcq", label: "MCQ", avgMinutes: 30 }],
      conceptTrackers: [
        { key: "class", label: "Class", avgMinutes: 20 },
        { key: "book", label: "Book", avgMinutes: 20 },
      ],
    });

    const chapterId = await t.mutation(api.mutations.createChapter, {
      subjectId,
      name: "Motion",
      slug: "motion",
      order: 1,
      inNextTerm: true,
    });

    await t.mutation(api.mutations.createConcept, {
      chapterId,
      name: "Velocity",
      order: 1,
    });
    await t.mutation(api.mutations.createConcept, {
      chapterId,
      name: "Acceleration",
      order: 2,
    });

    await t.mutation(api.mutations.ensureChapterStudyItems, { subjectId });
    await t.mutation(api.mutations.ensureConceptStudyItems, { chapterId });

    await t.mutation(api.mutations.generatePlannerSuggestions, {
      date,
      availableMinutes: 80,
    });

    const firstPlanner = await t.query(api.plannerQueries.getPlannerPageData, {
      date,
    });
    const firstTitles = firstPlanner.suggestions.map((suggestion) => suggestion.title);

    expect(firstTitles).toEqual(
      expect.arrayContaining(["Velocity — Class", "Velocity — Book"]),
    );
    expect(firstTitles.some((title) => title.includes("Acceleration"))).toBe(false);

    const chapterData = await t.query(api.queries.getChapterPageData, {
      subjectSlug: "physics",
      chapterSlug: "motion",
    });
    const velocity = chapterData?.concepts.find(
      (concept) => concept.name === "Velocity",
    );

    for (const tracker of velocity?.trackerData ?? []) {
      await t.mutation(api.mutations.toggleStudyItemCompletion, {
        studyItemId: tracker.studyItemId!,
      });
    }

    await t.mutation(api.mutations.generatePlannerSuggestions, {
      date: date + 86400000,
      availableMinutes: 80,
    });

    const secondPlanner = await t.query(api.plannerQueries.getPlannerPageData, {
      date: date + 86400000,
    });
    const secondTitles = secondPlanner.suggestions.map(
      (suggestion) => suggestion.title,
    );

    expect(secondTitles).toEqual(
      expect.arrayContaining(["Acceleration — Class", "Acceleration — Book"]),
    );
  });

  test("accepting a revision suggestion creates a revision todo task", async () => {
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

    expect(todo.days[0]?.tasks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "concept_review",
          conceptId,
        }),
      ]),
    );
    expect(todo.days[0]?.tasks[0]).not.toHaveProperty("startTimeMinutes");
  });

  test("does not create automatic revision suggestions for paused chapters", async () => {
    const t = await createAuthenticatedTestContext("planner-paused-chapter-revision");
    const date = getDhakaDayBucket(Date.now());
    const { chapterId } = await createSubjectWithNextTermChapter({
      t,
      name: "Physics",
      slug: "paused-physics",
      chapterTrackers: [{ key: "mcq", label: "MCQ", avgMinutes: 30 }],
      conceptTrackers: [{ key: "book", label: "Book", avgMinutes: 20 }],
      chapterName: "Motion",
    });
    const conceptId = await t.mutation(api.mutations.createConcept, {
      chapterId,
      name: "Velocity",
      order: 1,
    });
    await t.mutation(api.mutations.ensureConceptStudyItems, { chapterId });
    await t.mutation(api.mutations.rescheduleConceptReview, {
      conceptId,
      newNextReviewAt: date,
    });
    await t.mutation(api.mutations.toggleChapterRevision, { chapterId });
    await t.mutation(api.mutations.generatePlannerSuggestions, {
      date,
      availableMinutes: 60,
    });

    const planner = await t.query(api.plannerQueries.getPlannerPageData, { date });
    expect(
      planner.suggestions.some(
        (suggestion) => suggestion.kind === "concept_review",
      ),
    ).toBe(false);
    expect(
      planner.suggestions.some(
        (suggestion) => suggestion.kind === "study_item",
      ),
    ).toBe(true);
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

  test("settings target completion uses summary stats and targeted fallback", async () => {
    const t = await createAuthenticatedTestContext("planner-settings-summary");

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
    const conceptId = await t.mutation(api.mutations.createConcept, {
      chapterId,
      name: "Velocity",
      order: 1,
    });

    await t.mutation(api.mutations.ensureChapterStudyItems, { subjectId });
    await t.mutation(api.mutations.ensureConceptStudyItems, { chapterId });
    await t.mutation(api.mutations.addWeeklyTarget, {
      kind: "chapter",
      chapterId,
    });
    await t.mutation(api.mutations.addWeeklyTarget, {
      kind: "concept",
      chapterId,
      conceptId,
    });

    const incomplete = await t.query(api.plannerQueries.getSettingsPageData, {});
    const incompleteChapter = incomplete.subjects[0]?.chapters[0];
    expect(incompleteChapter?.isTargetComplete).toBe(false);
    expect(incompleteChapter?.concepts[0]?.isTargetComplete).toBe(false);

    const studyItems = await t.run(async (ctx) => {
      return await ctx.db.query("studyItems").collect();
    });
    for (const studyItem of studyItems) {
      await t.mutation(api.mutations.toggleStudyItemCompletion, {
        studyItemId: studyItem._id,
      });
    }

    const completeFromSummaries = await t.query(
      api.plannerQueries.getSettingsPageData,
      {},
    );
    const summaryChapter = completeFromSummaries.subjects[0]?.chapters[0];
    expect(summaryChapter?.isTargetComplete).toBe(true);
    expect(summaryChapter?.concepts[0]?.isTargetComplete).toBe(true);

    await t.run(async (ctx) => {
      for (const stat of await ctx.db.query("studyItemChapterStats").collect()) {
        await ctx.db.delete(stat._id);
      }
      for (const stat of await ctx.db.query("studyItemConceptStats").collect()) {
        await ctx.db.delete(stat._id);
      }
    });

    const completeFromFallback = await t.query(
      api.plannerQueries.getSettingsPageData,
      {},
    );
    const fallbackChapter = completeFromFallback.subjects[0]?.chapters[0];
    expect(fallbackChapter?.isTargetComplete).toBe(true);
    expect(fallbackChapter?.concepts[0]?.isTargetComplete).toBe(true);
  });

  test("planner page data is isolated between non-legacy users", async () => {
    const base = convexTest(schema, modules);
    const firstIdentity = {
      subject: "planner-isolation-first",
      tokenIdentifier: "test|planner-isolation-first",
      name: "first",
    };
    const secondIdentity = {
      subject: "planner-isolation-second",
      tokenIdentifier: "test|planner-isolation-second",
      name: "second",
    };
    const first = base.withIdentity(firstIdentity);
    const second = base.withIdentity(secondIdentity);
    await first.mutation(api.auth.ensureCurrentUser, {});
    await second.mutation(api.auth.ensureCurrentUser, {});
    const date = getDhakaDayBucket(Date.now());

    const firstSubjectId = await first.mutation(api.mutations.createSubject, {
      name: "Physics",
      slug: "physics",
      order: 1,
      chapterTrackers: [{ key: "mcq", label: "MCQ", avgMinutes: 30 }],
      conceptTrackers: [],
    });
    await first.mutation(api.mutations.createChapter, {
      subjectId: firstSubjectId,
      name: "Motion",
      order: 1,
      inNextTerm: true,
    });
    await first.mutation(api.mutations.ensureChapterStudyItems, {
      subjectId: firstSubjectId,
    });
    await first.mutation(api.mutations.generatePlannerSuggestions, {
      date,
      availableMinutes: 30,
    });

    const firstPlanner = await first.query(api.plannerQueries.getPlannerPageData, {
      date,
    });
    const secondPlanner = await second.query(api.plannerQueries.getPlannerPageData, {
      date,
    });

    expect(firstPlanner.suggestions.length).toBeGreaterThan(0);
    expect(secondPlanner.session).toBeNull();
    expect(secondPlanner.suggestions).toEqual([]);
  });
});

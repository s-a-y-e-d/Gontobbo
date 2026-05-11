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

async function createSyllabusFixture(subject: string) {
  const t = await createAuthenticatedTestContext(subject);
  const subjectId = await t.mutation(api.mutations.createSubject, {
    name: "Physics",
    slug: `physics-${subject}`,
    order: 1,
    chapterTrackers: [{ key: "mcq", label: "MCQ", avgMinutes: 30 }],
    conceptTrackers: [{ key: "book", label: "Book", avgMinutes: 25 }],
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

  return { t, subjectId, chapterId, conceptId };
}

describe("syllabus summaries", () => {
  test("subject page falls back before summary backfill and uses ensured state after lazy creation", async () => {
    const { t, subjectId } = await createSyllabusFixture("subject-page");

    let pageData = await t.query(api.queries.getSubjectPageData, {
      slug: "physics-subject-page",
    });

    expect(pageData?.needsSummaryBackfill).toBe(true);
    expect(pageData?.needsEnsureChapterStudyItems).toBe(true);
    expect(pageData?.chapters[0]?.trackerData[0]).toMatchObject({
      key: "mcq",
      isCompleted: false,
    });

    await t.mutation(api.mutations.ensureChapterStudyItems, { subjectId });

    pageData = await t.query(api.queries.getSubjectPageData, {
      slug: "physics-subject-page",
    });
    const cells = await t.run(async (ctx) => {
      return await ctx.db.query("syllabusStudyItemCells").collect();
    });

    expect(pageData?.needsEnsureChapterStudyItems).toBe(false);
    expect(pageData?.chapters[0]?.trackerData[0]?.studyItemId).toBeDefined();
    expect(cells).toEqual([
      expect.objectContaining({
        trackerKey: "mcq",
        isCompleted: false,
      }),
    ]);
  });

  test("chapter page summaries track concept study item completion", async () => {
    const { t, chapterId } = await createSyllabusFixture("chapter-page");
    await t.mutation(api.mutations.ensureConceptStudyItems, { chapterId });

    const initialPageData = await t.query(api.queries.getChapterPageData, {
      subjectSlug: "physics-chapter-page",
      chapterSlug: "motion",
    });
    const studyItemId = initialPageData?.concepts[0]?.trackerData[0]
      ?.studyItemId as Id<"studyItems">;

    expect(initialPageData?.needsEnsureConceptStudyItems).toBe(false);
    expect(studyItemId).toBeDefined();

    await t.mutation(api.mutations.toggleStudyItemCompletion, { studyItemId });

    const [pageData, conceptStats, cells] = await Promise.all([
      t.query(api.queries.getChapterPageData, {
        subjectSlug: "physics-chapter-page",
        chapterSlug: "motion",
      }),
      t.run(async (ctx) => {
        return await ctx.db.query("studyItemConceptStats").collect();
      }),
      t.run(async (ctx) => {
        return await ctx.db.query("syllabusStudyItemCells").collect();
      }),
    ]);

    expect(pageData?.concepts[0]).toMatchObject({
      completedItems: 1,
      totalItems: 1,
      status: "READY",
    });
    expect(conceptStats).toEqual([
      expect.objectContaining({
        totalItems: 1,
        completedItems: 1,
      }),
    ]);
    expect(cells).toEqual([
      expect.objectContaining({
        trackerKey: "book",
        isCompleted: true,
      }),
    ]);
  });

  test("automatic syllabus summary backfill covers existing legacy rows", async () => {
    vi.useFakeTimers();
    try {
      const t = convexTest(schema, modules);
      const identity = {
        subject: "syllabus-summary-legacy",
        tokenIdentifier: "test|syllabus-summary-legacy",
        name: "syllabus-summary-legacy",
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
          slug: "legacy-physics-syllabus",
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
          isCompleted: true,
        });
      });

      const owner = t.withIdentity(identity);
      await owner.mutation(api.auth.ensureCurrentUser, {});
      await owner.mutation(api.syllabusSummaries.startSyllabusSummaryBackfill, {});
      await t.finishAllScheduledFunctions(() => {
        vi.runAllTimers();
      });

      const pageData = await owner.query(api.queries.getSubjectPageData, {
        slug: "legacy-physics-syllabus",
      });
      const [cells, chapterStats] = await Promise.all([
        t.run(async (ctx) => {
          return await ctx.db.query("syllabusStudyItemCells").collect();
        }),
        t.run(async (ctx) => {
          return await ctx.db.query("studyItemChapterStats").collect();
        }),
      ]);

      expect(pageData?.needsSummaryBackfill).toBe(false);
      expect(pageData?.chapters[0]).toMatchObject({
        completedItems: 1,
        totalItems: 1,
        status: "READY",
      });
      expect(cells).toEqual([
        expect.objectContaining({
          trackerKey: "mcq",
          isCompleted: true,
        }),
      ]);
      expect(chapterStats).toEqual([
        expect.objectContaining({
          totalItems: 1,
          completedItems: 1,
        }),
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  test("subjects overview uses summary stats after backfill", async () => {
    vi.useFakeTimers();
    try {
      const { t, subjectId } = await createSyllabusFixture("subjects-overview");
      await t.mutation(api.mutations.ensureChapterStudyItems, { subjectId });
      await t.mutation(api.syllabusSummaries.startSyllabusSummaryBackfill, {});
      await t.finishAllScheduledFunctions(() => {
        vi.runAllTimers();
      });

      const subjects = await t.query(api.queries.getSubjectsWithStats, {});

      expect(subjects).toEqual([
        expect.objectContaining({
          name: "Physics",
          stats: {
            totalChapters: 1,
            completedChapters: 0,
            tasksPending: 1,
            progressPercentage: 0,
          },
        }),
      ]);
    } finally {
      vi.useRealTimers();
    }
  });
});

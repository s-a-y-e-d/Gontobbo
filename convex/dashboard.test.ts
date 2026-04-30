/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
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

    const dashboard = await t.query(api.dashboardQueries.getDashboardPageData, {});

    expect(dashboard.completion.nextTerm).toMatchObject({
      completedItems: 1,
      totalItems: 2,
      progressPercentage: 50,
    });
    expect(dashboard.completion.allSyllabus).toMatchObject({
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
  });
});

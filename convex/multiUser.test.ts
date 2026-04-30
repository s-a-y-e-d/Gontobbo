/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

function createIdentity(subject: string) {
  return {
    subject,
    tokenIdentifier: `test|${subject}`,
    name: subject,
    email: `${subject}@example.com`,
  };
}

describe("multi-user workspaces", () => {
  test("a second user signs in to an empty private workspace", async () => {
    const t = convexTest(schema, modules);
    const owner = t.withIdentity(createIdentity("owner-empty"));
    const viewer = t.withIdentity(createIdentity("viewer-empty"));

    await owner.mutation(api.auth.ensureCurrentUser, {});
    await owner.mutation(api.mutations.createSubject, {
      name: "Owner Physics",
      slug: "physics",
      order: 1,
      chapterTrackers: [{ key: "mcq", label: "MCQ", avgMinutes: 30 }],
      conceptTrackers: [],
    });

    await viewer.mutation(api.auth.ensureCurrentUser, {});
    const viewerSubjects = await viewer.query(api.queries.getSubjectsWithStats, {});
    const viewerSettings = await viewer.query(api.plannerQueries.getSettingsPageData, {});

    expect(viewerSubjects).toEqual([]);
    expect(viewerSettings.subjects).toEqual([]);
    expect(viewerSettings.defaultRevisionMinutes).toBe(15);
  });

  test("different users can reuse the same subject slug without collisions", async () => {
    const t = convexTest(schema, modules);
    const owner = t.withIdentity(createIdentity("owner-slug"));
    const viewer = t.withIdentity(createIdentity("viewer-slug"));

    await owner.mutation(api.auth.ensureCurrentUser, {});
    await viewer.mutation(api.auth.ensureCurrentUser, {});

    await owner.mutation(api.mutations.createSubject, {
      name: "Owner Physics",
      slug: "physics",
      order: 1,
      chapterTrackers: [{ key: "mcq", label: "MCQ", avgMinutes: 30 }],
      conceptTrackers: [],
    });
    await viewer.mutation(api.mutations.createSubject, {
      name: "Viewer Physics",
      slug: "physics",
      order: 1,
      chapterTrackers: [{ key: "mcq", label: "MCQ", avgMinutes: 30 }],
      conceptTrackers: [],
    });

    const ownerPage = await owner.query(api.queries.getSubjectPageData, { slug: "physics" });
    const viewerPage = await viewer.query(api.queries.getSubjectPageData, { slug: "physics" });

    expect(ownerPage?.subject.name).toBe("Owner Physics");
    expect(viewerPage?.subject.name).toBe("Viewer Physics");
  });

  test("direct-id mutations reject cross-user access", async () => {
    const t = convexTest(schema, modules);
    const owner = t.withIdentity(createIdentity("owner-direct"));
    const viewer = t.withIdentity(createIdentity("viewer-direct"));

    await owner.mutation(api.auth.ensureCurrentUser, {});
    await viewer.mutation(api.auth.ensureCurrentUser, {});

    const subjectId = await owner.mutation(api.mutations.createSubject, {
      name: "Protected Physics",
      slug: "physics",
      order: 1,
      chapterTrackers: [{ key: "mcq", label: "MCQ", avgMinutes: 30 }],
      conceptTrackers: [],
    });
    const chapterId = await owner.mutation(api.mutations.createChapter, {
      subjectId,
      name: "Motion",
      order: 1,
      inNextTerm: true,
    });
    await owner.mutation(api.mutations.ensureChapterStudyItems, { subjectId });

    const ownerItems = await owner.query(api.queries.getChapterStudyItems, { chapterId });

    await expect(
      viewer.mutation(api.mutations.toggleStudyItemCompletion, {
        studyItemId: ownerItems[0]!._id,
      }),
    ).rejects.toThrow("Unauthorized");
  });

  test("legacy owner can see unmigrated rows and new users cannot", async () => {
    const t = convexTest(schema, modules);
    const ownerIdentity = createIdentity("legacy-owner");
    const viewerIdentity = createIdentity("legacy-viewer");

    await t.run(async (ctx) => {
      await ctx.db.insert("users", {
        tokenIdentifier: ownerIdentity.tokenIdentifier,
        clerkUserId: ownerIdentity.subject,
        role: "owner",
        name: ownerIdentity.name,
        email: ownerIdentity.email,
      });
      await ctx.db.insert("subjects", {
        name: "Legacy Physics",
        slug: "physics",
        order: 1,
        chapterTrackers: [{ key: "mcq", label: "MCQ", avgMinutes: 30 }],
        conceptTrackers: [],
      });
    });

    const owner = t.withIdentity(ownerIdentity);
    const viewer = t.withIdentity(viewerIdentity);

    await owner.mutation(api.auth.ensureCurrentUser, {});
    await viewer.mutation(api.auth.ensureCurrentUser, {});

    const ownerSubjects = await owner.query(api.queries.getSubjectsWithStats, {});
    const viewerSubjects = await viewer.query(api.queries.getSubjectsWithStats, {});

    expect(ownerSubjects).toHaveLength(1);
    expect(ownerSubjects[0]?.name).toBe("Legacy Physics");
    expect(viewerSubjects).toEqual([]);
  });

  test("ownership backfill assigns legacy rows to the legacy owner", async () => {
    vi.useFakeTimers();
    try {
      const t = convexTest(schema, modules);
      const ownerIdentity = createIdentity("backfill-owner");

      await t.run(async (ctx) => {
        await ctx.db.insert("users", {
          tokenIdentifier: ownerIdentity.tokenIdentifier,
          clerkUserId: ownerIdentity.subject,
          role: "owner",
          name: ownerIdentity.name,
          email: ownerIdentity.email,
        });
        await ctx.db.insert("subjects", {
          name: "Legacy Chemistry",
          slug: "chemistry",
          order: 1,
          chapterTrackers: [{ key: "mcq", label: "MCQ", avgMinutes: 30 }],
          conceptTrackers: [],
        });
      });

      const owner = t.withIdentity(ownerIdentity);
      await owner.mutation(api.auth.ensureCurrentUser, {});
      const currentUser = await owner.query(api.auth.getCurrentUser, {});

      await owner.mutation(api.ownershipMigration.startUserOwnershipBackfill, {});
      await t.finishAllScheduledFunctions(() => {
        vi.runAllTimers();
      });

      const status = await owner.query(
        api.ownershipMigration.getUserOwnershipMigrationStatus,
        {},
      );
      const subjects = await t.run(async (ctx) => {
        return await ctx.db.query("subjects").collect();
      });

      expect(status.status).toBe("completed");
      expect(subjects[0]?.userId).toBe(currentUser?._id);
    } finally {
      vi.useRealTimers();
    }
  });
});

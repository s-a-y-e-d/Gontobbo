/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
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

async function createOwner(subject = "ordering-owner") {
  const t = convexTest(schema, modules).withIdentity(createIdentity(subject));
  await t.mutation(api.auth.ensureCurrentUser, {});
  return t;
}

async function createSubject(t: Awaited<ReturnType<typeof createOwner>>) {
  return await t.mutation(api.mutations.createSubject, {
    name: "Physics",
    slug: "physics",
    order: 1,
    chapterTrackers: [{ key: "mcq", label: "MCQ", avgMinutes: 30 }],
    conceptTrackers: [{ key: "book", label: "Book", avgMinutes: 45 }],
  });
}

describe("row ordering", () => {
  test("full chapter reorder changes structural order only", async () => {
    const t = await createOwner();
    const subjectId = await createSubject(t);
    const firstId = await t.mutation(api.mutations.createChapter, {
      subjectId,
      name: "First",
      inNextTerm: true,
    });
    const secondId = await t.mutation(api.mutations.createChapter, {
      subjectId,
      name: "Second",
      inNextTerm: true,
    });
    const thirdId = await t.mutation(api.mutations.createChapter, {
      subjectId,
      name: "Third",
      inNextTerm: true,
    });

    await t.mutation(api.mutations.reorderChapters, {
      subjectId,
      chapterIds: [thirdId, firstId, secondId],
    });

    const page = await t.query(api.queries.getSubjectPageData, { slug: "physics" });
    expect(page?.chapters.map((chapter) => chapter.name)).toEqual([
      "Third",
      "First",
      "Second",
    ]);
    expect(page?.chapters.map((chapter) => chapter.order)).toEqual([1, 2, 3]);
    expect(
      page?.chapters
        .slice()
        .sort((left, right) => (left.nextTermOrder ?? 0) - (right.nextTermOrder ?? 0))
        .map((chapter) => chapter.name),
    ).toEqual(["First", "Second", "Third"]);
  });

  test("Next Term chapter reorder changes exam order only", async () => {
    const t = await createOwner("next-term-ordering-owner");
    const subjectId = await createSubject(t);
    const firstId = await t.mutation(api.mutations.createChapter, {
      subjectId,
      name: "First",
      inNextTerm: true,
    });
    const secondId = await t.mutation(api.mutations.createChapter, {
      subjectId,
      name: "Second",
      inNextTerm: true,
    });
    const thirdId = await t.mutation(api.mutations.createChapter, {
      subjectId,
      name: "Third",
      inNextTerm: true,
    });

    await t.mutation(api.mutations.reorderNextTermChapters, {
      subjectId,
      chapterIds: [thirdId, firstId, secondId],
    });

    const page = await t.query(api.queries.getSubjectPageData, { slug: "physics" });
    expect(page?.chapters.map((chapter) => chapter.name)).toEqual([
      "First",
      "Second",
      "Third",
    ]);
    expect(page?.chapters.map((chapter) => chapter.order)).toEqual([1, 2, 3]);
    expect(
      page?.chapters
        .slice()
        .sort((left, right) => (left.nextTermOrder ?? 0) - (right.nextTermOrder ?? 0))
        .map((chapter) => chapter.name),
    ).toEqual(["Third", "First", "Second"]);
  });

  test("sync subject list adds, deletes, reorders, and preserves moved subject progress", async () => {
    const t = await createOwner("subject-list-sync-owner");
    const physicsId = await createSubject(t);
    const chemistryId = await t.mutation(api.mutations.createSubject, {
      name: "Chemistry",
      slug: "chemistry",
      order: 2,
      chapterTrackers: [{ key: "mcq", label: "MCQ", avgMinutes: 30 }],
      conceptTrackers: [{ key: "book", label: "Book", avgMinutes: 45 }],
    });
    await t.mutation(api.mutations.createSubject, {
      name: "Biology",
      slug: "biology",
      order: 3,
      chapterTrackers: [{ key: "mcq", label: "MCQ", avgMinutes: 30 }],
      conceptTrackers: [{ key: "book", label: "Book", avgMinutes: 45 }],
    });

    const chemistryChapterId = await t.mutation(api.mutations.createChapter, {
      subjectId: chemistryId,
      name: "Atoms",
      inNextTerm: true,
    });
    await t.mutation(api.mutations.ensureChapterStudyItems, {
      subjectId: chemistryId,
    });

    const chemistryStudyItem = await t.run(async (ctx) => {
      return await ctx.db
        .query("studyItems")
        .withIndex("by_chapter", (q) => q.eq("chapterId", chemistryChapterId))
        .unique();
    });
    expect(chemistryStudyItem).not.toBeNull();
    await t.mutation(api.mutations.toggleStudyItemCompletion, {
      studyItemId: chemistryStudyItem!._id,
    });

    const addAndReorderResult = await t.mutation(api.mutations.syncSubjectList, {
      names: ["Chemistry", "Physics", "Biology", "Higher Math"],
    });

    expect(addAndReorderResult).toMatchObject({
      createdCount: 1,
      deletedCount: 0,
      renamedCount: 0,
    });

    let subjects = await t.query(api.queries.getSubjectsWithStats, {});
    expect(subjects.map((subject) => subject.name)).toEqual([
      "Chemistry",
      "Physics",
      "Biology",
      "Higher Math",
    ]);
    expect(subjects.map((subject) => subject.order)).toEqual([1, 2, 3, 4]);
    expect(subjects[0]?._id).toBe(chemistryId);
    expect(subjects[0]?.stats.completedChapters).toBe(1);
    expect(subjects[0]?.stats.progressPercentage).toBe(100);

    const deleteResult = await t.mutation(api.mutations.syncSubjectList, {
      names: ["Chemistry", "Higher Math"],
    });

    expect(deleteResult).toMatchObject({
      createdCount: 0,
      deletedCount: 2,
    });

    subjects = await t.query(api.queries.getSubjectsWithStats, {});
    expect(subjects.map((subject) => subject.name)).toEqual([
      "Chemistry",
      "Higher Math",
    ]);
    expect(subjects.map((subject) => subject.order)).toEqual([1, 2]);
    expect(subjects[0]?._id).toBe(chemistryId);
    expect(subjects[0]?.stats.completedChapters).toBe(1);

    const deletedPhysics = await t.run(async (ctx) => await ctx.db.get(physicsId));
    expect(deletedPhysics).toBeNull();

    const higherMath = subjects.find((subject) => subject.name === "Higher Math");
    expect(higherMath?.chapterTrackers.map((tracker) => tracker.key)).toEqual([
      "mcq",
      "board",
    ]);
    expect(higherMath?.conceptTrackers.map((tracker) => tracker.key)).toEqual([
      "class",
      "book",
    ]);
  });

  test("sync chapter list adds, deletes, reorders, and preserves moved chapter progress", async () => {
    const t = await createOwner("chapter-list-sync-owner");
    const subjectId = await createSubject(t);
    const firstId = await t.mutation(api.mutations.createChapter, {
      subjectId,
      name: "First",
      inNextTerm: true,
    });
    const secondId = await t.mutation(api.mutations.createChapter, {
      subjectId,
      name: "Second",
      inNextTerm: true,
    });
    const thirdId = await t.mutation(api.mutations.createChapter, {
      subjectId,
      name: "Third",
      inNextTerm: false,
    });

    await t.mutation(api.mutations.ensureChapterStudyItems, { subjectId });

    const secondStudyItem = await t.run(async (ctx) => {
      return await ctx.db
        .query("studyItems")
        .withIndex("by_chapter", (q) => q.eq("chapterId", secondId))
        .unique();
    });
    expect(secondStudyItem).not.toBeNull();
    await t.mutation(api.mutations.toggleStudyItemCompletion, {
      studyItemId: secondStudyItem!._id,
    });

    const addAndReorderResult = await t.mutation(api.mutations.syncChapterList, {
      subjectId,
      names: ["Second", "First", "Third", "Fourth"],
    });

    expect(addAndReorderResult).toMatchObject({
      createdCount: 1,
      deletedCount: 0,
      renamedCount: 0,
    });

    let page = await t.query(api.queries.getSubjectPageData, { slug: "physics" });
    expect(page?.chapters.map((chapter) => chapter.name)).toEqual([
      "Second",
      "First",
      "Third",
      "Fourth",
    ]);
    expect(page?.chapters.map((chapter) => chapter.order)).toEqual([1, 2, 3, 4]);
    expect(page?.chapters[0]?._id).toBe(secondId);
    expect(page?.chapters[0]?.completedItems).toBe(1);
    expect(page?.chapters[3]?.inNextTerm).toBe(false);

    const deleteResult = await t.mutation(api.mutations.syncChapterList, {
      subjectId,
      names: ["Second", "Fourth"],
    });

    expect(deleteResult).toMatchObject({
      createdCount: 0,
      deletedCount: 2,
    });

    page = await t.query(api.queries.getSubjectPageData, { slug: "physics" });
    expect(page?.chapters.map((chapter) => chapter.name)).toEqual([
      "Second",
      "Fourth",
    ]);
    expect(page?.chapters.map((chapter) => chapter.order)).toEqual([1, 2]);
    expect(page?.chapters[0]?._id).toBe(secondId);
    expect(page?.chapters[0]?.completedItems).toBe(1);
    expect(page?.chapters[0]?.nextTermOrder).toBe(1);

    const [deletedFirst, deletedThird] = await t.run(async (ctx) => {
      return await Promise.all([ctx.db.get(firstId), ctx.db.get(thirdId)]);
    });
    expect(deletedFirst).toBeNull();
    expect(deletedThird).toBeNull();
  });

  test("concept reorder and delete compact chapter-local concept order", async () => {
    const t = await createOwner("concept-ordering-owner");
    const subjectId = await createSubject(t);
    const chapterId = await t.mutation(api.mutations.createChapter, {
      subjectId,
      name: "Motion",
      inNextTerm: true,
    });
    const firstId = await t.mutation(api.mutations.createConcept, {
      chapterId,
      name: "First",
    });
    const secondId = await t.mutation(api.mutations.createConcept, {
      chapterId,
      name: "Second",
    });
    const thirdId = await t.mutation(api.mutations.createConcept, {
      chapterId,
      name: "Third",
    });

    await t.mutation(api.mutations.reorderConcepts, {
      chapterId,
      conceptIds: [thirdId, firstId, secondId],
    });

    let page = await t.query(api.queries.getChapterPageData, {
      subjectSlug: "physics",
      chapterSlug: chapterId,
    });
    expect(page?.concepts.map((concept) => concept.name)).toEqual([
      "Third",
      "First",
      "Second",
    ]);
    expect(page?.concepts.map((concept) => concept.order)).toEqual([1, 2, 3]);

    await t.mutation(api.mutations.deleteConcept, { conceptId: firstId });

    page = await t.query(api.queries.getChapterPageData, {
      subjectSlug: "physics",
      chapterSlug: chapterId,
    });
    expect(page?.concepts.map((concept) => concept.name)).toEqual(["Third", "Second"]);
    expect(page?.concepts.map((concept) => concept.order)).toEqual([1, 2]);
  });

  test("bulk concept rename updates ordered concepts and study item names", async () => {
    const t = await createOwner("concept-bulk-rename-owner");
    const subjectId = await createSubject(t);
    const chapterId = await t.mutation(api.mutations.createChapter, {
      subjectId,
      name: "Motion",
      inNextTerm: true,
    });
    const firstId = await t.mutation(api.mutations.createConcept, {
      chapterId,
      name: "First",
    });
    const secondId = await t.mutation(api.mutations.createConcept, {
      chapterId,
      name: "Second",
    });

    await t.mutation(api.mutations.ensureConceptStudyItems, { chapterId });

    const result = await t.mutation(api.mutations.bulkRenameConcepts, {
      chapterId,
      updates: [
        { conceptId: firstId, name: "Velocity" },
        { conceptId: secondId, name: "Acceleration" },
      ],
    });

    expect(result.updatedCount).toBe(2);

    const page = await t.query(api.queries.getChapterPageData, {
      subjectSlug: "physics",
      chapterSlug: chapterId,
    });
    expect(page?.concepts.map((concept) => concept.name)).toEqual([
      "Velocity",
      "Acceleration",
    ]);
    expect(page?.concepts.map((concept) => concept.order)).toEqual([1, 2]);

    const studyItems = await t.run(async (ctx) => {
      return await ctx.db
        .query("studyItems")
        .withIndex("by_chapter", (q) => q.eq("chapterId", chapterId))
        .collect();
    });
    expect(studyItems.map((item) => item.title)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Velocity"),
        expect.stringContaining("Acceleration"),
      ]),
    );
  });

  test("sync concept list adds, deletes, reorders, and preserves moved concept progress", async () => {
    const t = await createOwner("concept-list-sync-owner");
    const subjectId = await createSubject(t);
    const chapterId = await t.mutation(api.mutations.createChapter, {
      subjectId,
      name: "Motion",
      inNextTerm: true,
    });
    const firstId = await t.mutation(api.mutations.createConcept, {
      chapterId,
      name: "First",
    });
    const secondId = await t.mutation(api.mutations.createConcept, {
      chapterId,
      name: "Second",
    });

    await t.mutation(api.mutations.ensureConceptStudyItems, { chapterId });

    const secondStudyItem = await t.run(async (ctx) => {
      return await ctx.db
        .query("studyItems")
        .withIndex("by_concept", (q) => q.eq("conceptId", secondId))
        .unique();
    });
    expect(secondStudyItem).not.toBeNull();
    await t.mutation(api.mutations.toggleStudyItemCompletion, {
      studyItemId: secondStudyItem!._id,
    });

    const addAndReorderResult = await t.mutation(api.mutations.syncConceptList, {
      chapterId,
      names: ["Second", "First", "Third"],
    });

    expect(addAndReorderResult).toMatchObject({
      createdCount: 1,
      deletedCount: 0,
      renamedCount: 0,
    });

    let page = await t.query(api.queries.getChapterPageData, {
      subjectSlug: "physics",
      chapterSlug: chapterId,
    });
    expect(page?.concepts.map((concept) => concept.name)).toEqual([
      "Second",
      "First",
      "Third",
    ]);
    expect(page?.concepts.map((concept) => concept.order)).toEqual([1, 2, 3]);
    expect(page?.concepts[0]?._id).toBe(secondId);
    expect(page?.concepts[0]?.completedItems).toBe(1);

    const deleteResult = await t.mutation(api.mutations.syncConceptList, {
      chapterId,
      names: ["Second", "Third"],
    });

    expect(deleteResult).toMatchObject({
      createdCount: 0,
      deletedCount: 1,
    });

    page = await t.query(api.queries.getChapterPageData, {
      subjectSlug: "physics",
      chapterSlug: chapterId,
    });
    expect(page?.concepts.map((concept) => concept.name)).toEqual([
      "Second",
      "Third",
    ]);
    expect(page?.concepts.map((concept) => concept.order)).toEqual([1, 2]);
    expect(page?.concepts[0]?._id).toBe(secondId);
    expect(page?.concepts[0]?.completedItems).toBe(1);

    const deletedConcept = await t.run(async (ctx) => await ctx.db.get(firstId));
    expect(deletedConcept).toBeNull();
  });

  test("create, toggle, bulk Next Term, and delete append then compact orders", async () => {
    const t = await createOwner("append-compact-owner");
    const subjectId = await createSubject(t);
    const firstId = await t.mutation(api.mutations.createChapter, {
      subjectId,
      name: "First",
      inNextTerm: false,
    });
    const secondId = await t.mutation(api.mutations.createChapter, {
      subjectId,
      name: "Second",
      inNextTerm: true,
    });
    const thirdId = await t.mutation(api.mutations.createChapter, {
      subjectId,
      name: "Third",
      inNextTerm: false,
    });

    await t.mutation(api.mutations.toggleChapterInNextTerm, { chapterId: firstId });
    await t.mutation(api.mutations.setChaptersInNextTerm, {
      subjectId,
      chapterIds: [thirdId],
      inNextTerm: true,
    });

    let page = await t.query(api.queries.getSubjectPageData, { slug: "physics" });
    expect(
      page?.chapters
        .filter((chapter) => chapter.inNextTerm)
        .sort((left, right) => (left.nextTermOrder ?? 0) - (right.nextTermOrder ?? 0))
        .map((chapter) => chapter.name),
    ).toEqual(["Second", "First", "Third"]);

    await t.mutation(api.mutations.deleteChapter, { chapterId: secondId });

    page = await t.query(api.queries.getSubjectPageData, { slug: "physics" });
    expect(page?.chapters.map((chapter) => chapter.order)).toEqual([1, 2]);
    expect(
      page?.chapters
        .filter((chapter) => chapter.inNextTerm)
        .sort((left, right) => (left.nextTermOrder ?? 0) - (right.nextTermOrder ?? 0))
        .map((chapter) => [chapter.name, chapter.nextTermOrder]),
    ).toEqual([
      ["First", 1],
      ["Third", 2],
    ]);
  });

  test("reorder mutations reject unauthorized and cross-scope rows", async () => {
    const base = convexTest(schema, modules);
    const owner = base.withIdentity(createIdentity("owner"));
    const viewer = base.withIdentity(createIdentity("viewer"));
    await owner.mutation(api.auth.ensureCurrentUser, {});
    await viewer.mutation(api.auth.ensureCurrentUser, {});

    const subjectId = await owner.mutation(api.mutations.createSubject, {
      name: "Physics",
      slug: "physics",
      order: 1,
      chapterTrackers: [],
      conceptTrackers: [],
    });
    const otherSubjectId = await owner.mutation(api.mutations.createSubject, {
      name: "Chemistry",
      slug: "chemistry",
      order: 2,
      chapterTrackers: [],
      conceptTrackers: [],
    });
    const firstId = await owner.mutation(api.mutations.createChapter, {
      subjectId,
      name: "First",
      inNextTerm: true,
    });
    const secondId = await owner.mutation(api.mutations.createChapter, {
      subjectId,
      name: "Second",
      inNextTerm: true,
    });
    const otherId = await owner.mutation(api.mutations.createChapter, {
      subjectId: otherSubjectId,
      name: "Other",
      inNextTerm: true,
    });

    await expect(
      viewer.mutation(api.mutations.reorderChapters, {
        subjectId,
        chapterIds: [secondId, firstId],
      }),
    ).rejects.toThrow("Unauthorized");

    await expect(
      owner.mutation(api.mutations.reorderChapters, {
        subjectId,
        chapterIds: [otherId, firstId],
      }),
    ).rejects.toThrow("Reorder list must include every chapter in this subject");
  });
});

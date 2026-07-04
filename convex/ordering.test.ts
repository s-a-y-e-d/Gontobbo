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

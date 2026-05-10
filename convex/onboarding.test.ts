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

describe("HSC onboarding", () => {
  test("a new empty user requires onboarding", async () => {
    const t = convexTest(schema, modules).withIdentity(createIdentity("new-hsc-user"));

    await t.mutation(api.auth.ensureCurrentUser, {});

    const status = await t.query(api.onboarding.getOnboardingStatus, {});

    expect(status).toMatchObject({
      classLevel: null,
      onboardingCompletedAt: null,
      hasSubjects: false,
      requiresOnboarding: true,
    });
  });

  test("selecting HSC stores class and seeds ordered subjects and chapters", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-01T06:00:00.000Z"));

    try {
      const t = convexTest(schema, modules).withIdentity(createIdentity("seed-hsc-user"));

      await t.mutation(api.auth.ensureCurrentUser, {});
      const result = await t.mutation(api.onboarding.selectClassAndSeedSyllabus, {
        classLevel: "hsc",
      });

      const status = await t.query(api.onboarding.getOnboardingStatus, {});
      const subjects = await t.run(async (ctx) => {
        return await ctx.db.query("subjects").collect();
      });
      const chapters = await t.run(async (ctx) => {
        return await ctx.db.query("chapters").collect();
      });
      const concepts = await t.run(async (ctx) => {
        return await ctx.db.query("concepts").collect();
      });

      const physicsFirst = subjects.find((subject) => subject.slug === "physics-1");
      const biologyFirst = subjects.find((subject) => subject.slug === "biology-1");
      const chemistryFirst = subjects.find((subject) => subject.slug === "chemistry-1");
      const physicsFirstChapters = chapters
        .filter((chapter) => chapter.subjectId === physicsFirst?._id)
        .sort((left, right) => left.order - right.order);
      const biologyFirstChapters = chapters
        .filter((chapter) => chapter.subjectId === biologyFirst?._id)
        .sort((left, right) => left.order - right.order);
      const chemistryFirstChapters = chapters
        .filter((chapter) => chapter.subjectId === chemistryFirst?._id)
        .sort((left, right) => left.order - right.order);
      const nextTermOrdersBySubjectSlug = Object.fromEntries(
        subjects.map((subject) => [
          subject.slug,
          chapters
            .filter((chapter) => chapter.subjectId === subject._id && chapter.inNextTerm)
            .map((chapter) => chapter.order)
            .sort((left, right) => left - right),
        ]),
      );
      const vectorChapterConcepts = concepts
        .filter((concept) => concept.chapterId === physicsFirstChapters[1]?._id)
        .sort((left, right) => left.order - right.order);
      const chemistryChangeConcepts = concepts
        .filter((concept) => concept.chapterId === chemistryFirstChapters[3]?._id)
        .sort((left, right) => left.order - right.order);

      expect(result).toMatchObject({
        classLevel: "hsc",
        seededSubjectCount: 8,
      });
      expect(status.requiresOnboarding).toBe(false);
      expect(status.classLevel).toBe("hsc");
      expect(status.onboardingCompletedAt).toBe(Date.now());
      expect(subjects).toHaveLength(8);
      expect(concepts).toHaveLength(379);
      expect(subjects.map((subject) => subject.slug).sort()).toEqual([
        "biology-1",
        "biology-2",
        "chemistry-1",
        "chemistry-2",
        "higher-math-1",
        "higher-math-2",
        "physics-1",
        "physics-2",
      ]);
      expect(physicsFirst).toMatchObject({
        name: "পদার্থবিজ্ঞান প্রথম পত্র",
        icon: "rocket_launch",
        chapterTrackers: [
          { key: "mcq", label: "MCQ", avgMinutes: 30 },
          { key: "board", label: "বোর্ড", avgMinutes: 45 },
        ],
        conceptTrackers: [
          { key: "class", label: "ক্লাস", avgMinutes: 20 },
          { key: "book", label: "বই", avgMinutes: 25 },
        ],
      });
      expect(physicsFirstChapters.map((chapter) => chapter.name)).toEqual([
        "ভৌত জগৎ ও পরিমাপ",
        "ভেক্টর",
        "গতিবিদ্যা",
        "নিউটনিয়ান বলবিদ্যা",
        "কাজ, শক্তি ও ক্ষমতা",
        "মহাকর্ষ ও অভিকর্ষ",
        "পদার্থের গাঠনিক ধর্ম",
        "পর্যাবৃত্ত গতি",
        "তরঙ্গ",
        "আদর্শ গ্যাস ও গ্যাসের গতিতত্ত্ব",
      ]);
      expect(nextTermOrdersBySubjectSlug).toMatchObject({
        "physics-1": [6, 7, 8, 9, 10],
        "physics-2": [],
        "chemistry-1": [4, 5],
        "chemistry-2": [],
        "biology-1": [5, 6, 7, 8, 9, 10, 11, 12],
        "biology-2": [],
        "higher-math-1": [],
        "higher-math-2": [],
      });
      expect(physicsFirstChapters.map((chapter) => chapter.slug)).toEqual([
        "chapter-1",
        "chapter-2",
        "chapter-3",
        "chapter-4",
        "chapter-5",
        "chapter-6",
        "chapter-7",
        "chapter-8",
        "chapter-9",
        "chapter-10",
      ]);
      expect(vectorChapterConcepts.map((concept) => concept.name)).toEqual([
        "ভেক্টরের প্রকারভেদ ও আয়ত একক ভেক্টর দ্বারা ভেক্টরের প্রকাশ",
        "দুইটি ভেক্টরের লব্ধি",
        "ভেক্টরের উপাংশ",
        "নদী ও নৌকা",
        "ভেক্টর বিয়োগ ও আপেক্ষিক বেগ",
        "দুইয়ের অধিক ভেক্টরের লব্ধি",
        "ভেক্টরের ডট গুণন",
        "দিক কোসাইন",
        "ভেক্টরের ক্রস গুণন",
        "ভেক্টর ক্যালকুলাস",
      ]);
      expect(chemistryFirstChapters[3]?.name).toBe("রাসায়নিক পরিবর্তন");
      expect(chemistryChangeConcepts.map((concept) => concept.name)).toEqual([
        "বিক্রিয়ার হার (Rate of Reaction)",
        "লা-শাতেলিয়ারের নীতি (Le Chatelier's Principle)",
        "ভরক্রিয়ার সূত্র ও সাম্যাঙ্ক",
        "অম্ল-ক্ষার এবং pH (Acid-Base and pH)",
        "বাফার দ্রবণ ও বাফার দ্রবণের ক্রিয়াকৌশল",
        "তাপ রসায়ন (Thermochemistry)",
      ]);
      expect(biologyFirstChapters[6]?.name).toBe("নগ্নবীজী ও আবৃতবীজী");
      expect(biologyFirstChapters[11]?.name).toBe(
        "জীবের পরিবেশ, বিস্তার ও সংরক্ষণ",
      );
    } finally {
      vi.useRealTimers();
    }
  });

  test("selecting other completes onboarding without seeding data", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-02T06:00:00.000Z"));

    try {
      const t = convexTest(schema, modules).withIdentity(createIdentity("other-user"));

      await t.mutation(api.auth.ensureCurrentUser, {});
      const firstResult = await t.mutation(api.onboarding.selectClassAndSeedSyllabus, {
        classLevel: "other",
      });
      vi.setSystemTime(new Date("2026-05-03T06:00:00.000Z"));
      const secondResult = await t.mutation(api.onboarding.selectClassAndSeedSyllabus, {
        classLevel: "other",
      });

      const status = await t.query(api.onboarding.getOnboardingStatus, {});
      const counts = await t.run(async (ctx) => {
        return {
          subjects: (await ctx.db.query("subjects").collect()).length,
          chapters: (await ctx.db.query("chapters").collect()).length,
          concepts: (await ctx.db.query("concepts").collect()).length,
          studyItems: (await ctx.db.query("studyItems").collect()).length,
          studyLogs: (await ctx.db.query("studyLogs").collect()).length,
          weeklyTargets: (await ctx.db.query("weeklyTargets").collect()).length,
          plannerSessions: (await ctx.db.query("plannerSessions").collect()).length,
        };
      });

      expect(firstResult).toMatchObject({
        classLevel: "other",
        seededSubjectCount: 0,
      });
      expect(secondResult.onboardingCompletedAt).toBe(firstResult.onboardingCompletedAt);
      expect(status).toMatchObject({
        classLevel: "other",
        onboardingCompletedAt: firstResult.onboardingCompletedAt,
        hasSubjects: false,
        requiresOnboarding: false,
      });
      expect(counts).toEqual({
        subjects: 0,
        chapters: 0,
        concepts: 0,
        studyItems: 0,
        studyLogs: 0,
        weeklyTargets: 0,
        plannerSessions: 0,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  test("HSC seeding is idempotent", async () => {
    const t = convexTest(schema, modules).withIdentity(createIdentity("idempotent-hsc-user"));

    await t.mutation(api.auth.ensureCurrentUser, {});
    await t.mutation(api.onboarding.selectClassAndSeedSyllabus, { classLevel: "hsc" });
    await t.mutation(api.onboarding.selectClassAndSeedSyllabus, { classLevel: "hsc" });

    const counts = await t.run(async (ctx) => {
      const subjects = await ctx.db.query("subjects").collect();
      const chapters = await ctx.db.query("chapters").collect();
      return {
        subjects: subjects.length,
        chapters: chapters.length,
        concepts: (await ctx.db.query("concepts").collect()).length,
      };
    });

    expect(counts).toEqual({
      subjects: 8,
      chapters: 75,
      concepts: 379,
    });
  });

  test("syncing HSC appends missing concepts and keeps custom concepts", async () => {
    const t = convexTest(schema, modules).withIdentity(createIdentity("sync-existing-hsc-user"));

    await t.mutation(api.auth.ensureCurrentUser, {});
    await t.mutation(api.onboarding.selectClassAndSeedSyllabus, { classLevel: "hsc" });

    await t.run(async (ctx) => {
      const biology = await ctx.db
        .query("subjects")
        .withIndex("by_slug", (q) => q.eq("slug", "biology-1"))
        .unique();
      expect(biology).not.toBeNull();
      const chapter = await ctx.db
        .query("chapters")
        .withIndex("by_subject_slug", (q) =>
          q.eq("subjectId", biology!._id).eq("slug", "chapter-7"),
        )
        .unique();
      expect(chapter).not.toBeNull();
      await ctx.db.patch(chapter!._id, {
        name: "নগ্নবীজী ও আবৃতবীজী উদ্ভিদ",
      });
      const concepts = await ctx.db
        .query("concepts")
        .withIndex("by_chapter", (q) => q.eq("chapterId", chapter!._id))
        .collect();
      for (const concept of concepts) {
        await ctx.db.delete(concept._id);
      }
      await ctx.db.insert("concepts", {
        userId: biology!.userId,
        chapterId: chapter!._id,
        name: "নিজের যোগ করা টপিক",
        order: 1,
      });
    });

    await t.mutation(api.onboarding.syncHscSyllabusForCurrentUser, {});

    const result = await t.run(async (ctx) => {
      const biology = await ctx.db
        .query("subjects")
        .withIndex("by_slug", (q) => q.eq("slug", "biology-1"))
        .unique();
      const chapter = await ctx.db
        .query("chapters")
        .withIndex("by_subject_slug", (q) =>
          q.eq("subjectId", biology!._id).eq("slug", "chapter-7"),
        )
        .unique();
      const concepts = await ctx.db
        .query("concepts")
        .withIndex("by_chapter", (q) => q.eq("chapterId", chapter!._id))
        .collect();
      return {
        chapterName: chapter?.name,
        conceptNames: concepts
          .sort((left, right) => left.order - right.order)
          .map((concept) => concept.name),
      };
    });

    expect(result.chapterName).toBe("নগ্নবীজী ও আবৃতবীজী");
    expect(result.conceptNames).toEqual([
      "নিজের যোগ করা টপিক",
      "নগ্নবীজী উদ্ভিদ",
      "Cycas",
      "আবৃতবীজী উদ্ভিদ ও গোত্র পরিচিতি সংক্রান্ত কতিপয় সংজ্ঞা ও পুষ্পপ্রতীক",
      "একবীজপত্রী উদ্ভিদের গোত্র: Poaceae",
      "দ্বিবীজপত্রী উদ্ভিদের গোত্র: Malvaceae",
    ]);
  });

  test("a user with existing subjects skips onboarding", async () => {
    const t = convexTest(schema, modules).withIdentity(createIdentity("existing-subject-user"));

    await t.mutation(api.auth.ensureCurrentUser, {});
    await t.mutation(api.mutations.createSubject, {
      name: "Custom Physics",
      slug: "custom-physics",
      order: 1,
      chapterTrackers: [{ key: "mcq", label: "MCQ", avgMinutes: 30 }],
      conceptTrackers: [],
    });

    const status = await t.query(api.onboarding.getOnboardingStatus, {});

    expect(status).toMatchObject({
      hasSubjects: true,
      requiresOnboarding: false,
    });
  });

  test("different users receive private HSC data with reusable slugs", async () => {
    const t = convexTest(schema, modules);
    const first = t.withIdentity(createIdentity("first-hsc-user"));
    const second = t.withIdentity(createIdentity("second-hsc-user"));

    await first.mutation(api.auth.ensureCurrentUser, {});
    await second.mutation(api.auth.ensureCurrentUser, {});
    await first.mutation(api.onboarding.selectClassAndSeedSyllabus, { classLevel: "hsc" });
    await second.mutation(api.onboarding.selectClassAndSeedSyllabus, { classLevel: "hsc" });

    const firstSubjects = await first.query(api.queries.getSubjectsWithStats, {});
    const secondSubjects = await second.query(api.queries.getSubjectsWithStats, {});

    expect(firstSubjects).toHaveLength(8);
    expect(secondSubjects).toHaveLength(8);
    expect(firstSubjects.map((subject) => subject.slug).sort()).toEqual(
      secondSubjects.map((subject) => subject.slug).sort(),
    );
    expect(firstSubjects[0]?._id).not.toBe(secondSubjects[0]?._id);
  });

  test("other user with no subjects can import HSC later", async () => {
    const t = convexTest(schema, modules).withIdentity(createIdentity("other-import-user"));

    await t.mutation(api.auth.ensureCurrentUser, {});
    await t.mutation(api.onboarding.selectClassAndSeedSyllabus, { classLevel: "other" });

    const result = await t.mutation(api.onboarding.importHscSyllabusForCurrentUser, {});
    const status = await t.query(api.onboarding.getOnboardingStatus, {});
    const counts = await t.run(async (ctx) => {
      return {
        subjects: (await ctx.db.query("subjects").collect()).length,
        chapters: (await ctx.db.query("chapters").collect()).length,
        concepts: (await ctx.db.query("concepts").collect()).length,
      };
    });

    expect(result).toMatchObject({
      classLevel: "hsc",
      seededSubjectCount: 8,
    });
    expect(status.classLevel).toBe("hsc");
    expect(status.requiresOnboarding).toBe(false);
    expect(counts).toEqual({
      subjects: 8,
      chapters: 75,
      concepts: 379,
    });
  });

  test("other user with custom subjects cannot import HSC later", async () => {
    const t = convexTest(schema, modules).withIdentity(createIdentity("other-custom-user"));

    await t.mutation(api.auth.ensureCurrentUser, {});
    await t.mutation(api.onboarding.selectClassAndSeedSyllabus, { classLevel: "other" });
    await t.mutation(api.mutations.createSubject, {
      name: "Custom Physics",
      slug: "custom-physics",
      order: 1,
      chapterTrackers: [{ key: "mcq", label: "MCQ", avgMinutes: 30 }],
      conceptTrackers: [],
    });

    await expect(
      t.mutation(api.onboarding.importHscSyllabusForCurrentUser, {}),
    ).rejects.toThrow("custom subjects");

    const counts = await t.run(async (ctx) => {
      return {
        subjects: (await ctx.db.query("subjects").collect()).length,
        chapters: (await ctx.db.query("chapters").collect()).length,
        concepts: (await ctx.db.query("concepts").collect()).length,
      };
    });
    const status = await t.query(api.onboarding.getOnboardingStatus, {});

    expect(status.classLevel).toBe("other");
    expect(counts).toEqual({
      subjects: 1,
      chapters: 0,
      concepts: 0,
    });
  });

  test("non-other user cannot use the HSC import action", async () => {
    const t = convexTest(schema, modules).withIdentity(createIdentity("hsc-import-user"));

    await t.mutation(api.auth.ensureCurrentUser, {});
    await t.mutation(api.onboarding.selectClassAndSeedSyllabus, { classLevel: "hsc" });

    await expect(
      t.mutation(api.onboarding.importHscSyllabusForCurrentUser, {}),
    ).rejects.toThrow("Only users who selected other");
  });
});

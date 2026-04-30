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

      const physicsFirst = subjects.find((subject) => subject.slug === "physics-1");
      const biologyFirst = subjects.find((subject) => subject.slug === "biology-1");
      const physicsFirstChapters = chapters
        .filter((chapter) => chapter.subjectId === physicsFirst?._id)
        .sort((left, right) => left.order - right.order);
      const biologyFirstChapters = chapters
        .filter((chapter) => chapter.subjectId === biologyFirst?._id)
        .sort((left, right) => left.order - right.order);

      expect(result).toMatchObject({
        classLevel: "hsc",
        seededSubjectCount: 8,
      });
      expect(status.requiresOnboarding).toBe(false);
      expect(status.classLevel).toBe("hsc");
      expect(status.onboardingCompletedAt).toBe(Date.now());
      expect(subjects).toHaveLength(8);
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
        "নিউটনীয় বলবিদ্যা",
        "কাজ, শক্তি ও ক্ষমতা",
        "মহাকর্ষ ও অভিকর্ষ",
        "পদার্থের গাঠনিক ধর্ম",
        "পর্যাবৃত্ত গতি",
        "তরঙ্গ",
        "আদর্শ গ্যাস ও গ্যাসের গতিতত্ত্ব",
      ]);
      expect(physicsFirstChapters.every((chapter) => chapter.inNextTerm)).toBe(true);
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
      expect(biologyFirstChapters[11]?.name).toBe(
        "জীবের পরিবেশ, বিস্তার ও সংরক্ষণ",
      );
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
      };
    });

    expect(counts).toEqual({
      subjects: 8,
      chapters: 75,
    });
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
});

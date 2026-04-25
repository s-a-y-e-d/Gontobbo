import { mutation } from "./_generated/server";
import { v } from "convex/values";

// ── Create a subject ─────────────────────────────────────────────
export const createSubject = mutation({
  args: {
    name: v.string(),
    slug: v.string(),
    color: v.optional(v.string()),
    icon: v.optional(v.string()),
    chapterTrackers: v.array(
      v.object({
        key: v.string(),
        label: v.string(),
        avgMinutes: v.number(),
      })
    ),
    conceptTrackers: v.array(
      v.object({
        key: v.string(),
        label: v.string(),
        avgMinutes: v.number(),
      })
    ),
    examWeight: v.optional(v.number()),
    order: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("subjects", args);
  },
});

// ── Toggle chapter inNextTerm ────────────────────────────────────
export const toggleChapterInNextTerm = mutation({
  args: { chapterId: v.id("chapters") },
  handler: async (ctx, args) => {
    const chapter = await ctx.db.get(args.chapterId);
    if (!chapter) throw new Error("Chapter not found");
    await ctx.db.patch(args.chapterId, {
      inNextTerm: !chapter.inNextTerm,
    });
  },
});

// ── Reset all studyItems for a chapter ───────────────────────────
export const resetChapterProgress = mutation({
  args: { chapterId: v.id("chapters") },
  handler: async (ctx, args) => {
    const studyItems = await ctx.db
      .query("studyItems")
      .withIndex("by_chapter", (q) => q.eq("chapterId", args.chapterId))
      .take(500);

    for (const item of studyItems) {
      await ctx.db.patch(item._id, {
        isCompleted: false,
        completionScore: undefined,
        lastStudiedAt: undefined,
        nextReviewAt: undefined,
        repetitionLevel: undefined,
        weaknessScore: undefined,
      });
    }
  },
});

// ── Ensure chapter-level studyItems exist (lazy creation) ────────
// Called when user first visits a subject page
export const ensureChapterStudyItems = mutation({
  args: { subjectId: v.id("subjects") },
  handler: async (ctx, args) => {
    const subject = await ctx.db.get(args.subjectId);
    if (!subject) throw new Error("Subject not found");

    const chapters = await ctx.db
      .query("chapters")
      .withIndex("by_subject", (q) => q.eq("subjectId", args.subjectId))
      .collect();

    for (const chapter of chapters) {
      // Get existing chapter-level studyItems
      const existingItems = await ctx.db
        .query("studyItems")
        .withIndex("by_chapter", (q) => q.eq("chapterId", chapter._id))
        .collect();

      const existingChapterItems = existingItems.filter(
        (si) => si.conceptId === undefined
      );

      for (const tracker of subject.chapterTrackers) {
        const alreadyExists = existingChapterItems.some(
          (si) => si.type === tracker.key
        );

        if (!alreadyExists) {
          await ctx.db.insert("studyItems", {
            subjectId: args.subjectId,
            chapterId: chapter._id,
            type: tracker.key,
            title: `${chapter.name} — ${tracker.label}`,
            estimatedMinutes: tracker.avgMinutes,
            isCompleted: false,
          });
        }
      }
    }
  },
});

// ── Ensure concept-level studyItems exist (lazy creation) ────────
// Called when user first visits a chapter page
export const ensureConceptStudyItems = mutation({
  args: { chapterId: v.id("chapters") },
  handler: async (ctx, args) => {
    const chapter = await ctx.db.get(args.chapterId);
    if (!chapter) throw new Error("Chapter not found");

    const subject = await ctx.db.get(chapter.subjectId);
    if (!subject) throw new Error("Subject not found");

    const concepts = await ctx.db
      .query("concepts")
      .withIndex("by_chapter", (q) => q.eq("chapterId", args.chapterId))
      .collect();

    for (const concept of concepts) {
      const existingItems = await ctx.db
        .query("studyItems")
        .withIndex("by_concept", (q) => q.eq("conceptId", concept._id))
        .collect();

      for (const tracker of subject.conceptTrackers) {
        const alreadyExists = existingItems.some(
          (si) => si.type === tracker.key
        );

        if (!alreadyExists) {
          await ctx.db.insert("studyItems", {
            subjectId: subject._id,
            chapterId: args.chapterId,
            conceptId: concept._id,
            type: tracker.key,
            title: `${concept.name} — ${tracker.label}`,
            estimatedMinutes: tracker.avgMinutes,
            isCompleted: false,
          });
        }
      }
    }
  },
});

// ── Toggle a studyItem completion ────────────────────────────────
export const toggleStudyItemCompletion = mutation({
  args: { studyItemId: v.id("studyItems") },
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.studyItemId);
    if (!item) throw new Error("StudyItem not found");
    await ctx.db.patch(args.studyItemId, {
      isCompleted: !item.isCompleted,
      lastStudiedAt: Date.now(),
    });
  },
});

// ── MIGRATION: Clear old data & seed fresh ───────────────────────
// Clears all old-schema documents and seeds Chemistry with 5 chapters.
// Run once from the Convex dashboard or a temporary button.
export const migrateAndSeed = mutation({
  args: {},
  handler: async (ctx) => {
    // 1. Delete all studyItems
    const studyItems = await ctx.db.query("studyItems").take(500);
    for (const item of studyItems) {
      await ctx.db.delete(item._id);
    }

    // 2. Delete all concepts
    const concepts = await ctx.db.query("concepts").take(500);
    for (const concept of concepts) {
      await ctx.db.delete(concept._id);
    }

    // 3. Delete all chapters
    const chapters = await ctx.db.query("chapters").take(500);
    for (const chapter of chapters) {
      await ctx.db.delete(chapter._id);
    }

    // 4. Delete all subjects (old schema-incompatible docs)
    const subjects = await ctx.db.query("subjects").take(500);
    for (const subject of subjects) {
      await ctx.db.delete(subject._id);
    }

    // 5. Delete all studyLogs
    const logs = await ctx.db.query("studyLogs").take(500);
    for (const log of logs) {
      await ctx.db.delete(log._id);
    }

    // 6. Delete all plannerSessions
    const sessions = await ctx.db.query("plannerSessions").take(500);
    for (const session of sessions) {
      await ctx.db.delete(session._id);
    }

    // ── Seed Chemistry ─────────────────────────────────────────
    const chemId = await ctx.db.insert("subjects", {
      name: "Chemistry",
      slug: "chemistry",
      icon: "science",
      color: "green",
      order: 1,
      chapterTrackers: [
        { key: "mcq", label: "MCQ", avgMinutes: 30 },
        { key: "board", label: "বোর্ড প্রশ্ন", avgMinutes: 45 },
      ],
      conceptTrackers: [
        { key: "class", label: "ক্লাস নোট", avgMinutes: 20 },
        { key: "book", label: "বই", avgMinutes: 25 },
      ],
    });

    await ctx.db.insert("chapters", {
      subjectId: chemId,
      name: "অধ্যায় ১: ল্যাবরেটরির নিরাপদ ব্যবহার",
      slug: "safe-use-of-laboratory",
      order: 1,
      inNextTerm: false,
    });

    await ctx.db.insert("chapters", {
      subjectId: chemId,
      name: "অধ্যায় ২: গুণগত রসায়ন",
      slug: "qualitative-chemistry",
      order: 2,
      inNextTerm: false,
    });

    await ctx.db.insert("chapters", {
      subjectId: chemId,
      name: "অধ্যায় ৩: মৌলের পর্যায়বৃত্ত ধর্ম ও রাসায়নিক বন্ধন",
      slug: "periodic-properties-and-bonding",
      order: 3,
      inNextTerm: false,
    });

    await ctx.db.insert("chapters", {
      subjectId: chemId,
      name: "অধ্যায় ৪: রাসায়নিক পরিবর্তন",
      slug: "chemical-change",
      order: 4,
      inNextTerm: true,
    });

    await ctx.db.insert("chapters", {
      subjectId: chemId,
      name: "অধ্যায় ৫: কর্মমুখী রসায়ন",
      slug: "vocational-chemistry",
      order: 5,
      inNextTerm: true,
    });

    return chemId;
  },
});

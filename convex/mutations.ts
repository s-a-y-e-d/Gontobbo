import { mutation } from "./_generated/server";
import { v } from "convex/values";

// ── Create a subject ─────────────────────────────────────────────
// ... (rest of the file)
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

// ── Update a subject ─────────────────────────────────────────────
// Updates subject metadata and tracker configs
// Deletes orphaned studyItems when trackers are removed
export const updateSubject = mutation({
  args: {
    subjectId: v.id("subjects"),
    name: v.optional(v.string()),
    slug: v.optional(v.string()),
    icon: v.optional(v.string()),
    color: v.optional(v.string()),
    chapterTrackers: v.optional(v.array(v.object({
      key: v.string(),
      label: v.string(),
      avgMinutes: v.number(),
    }))),
    conceptTrackers: v.optional(v.array(v.object({
      key: v.string(),
      label: v.string(),
      avgMinutes: v.number(),
    }))),
  },
  handler: async (ctx, args) => {
    const { subjectId, ...updates } = args;

    const oldSubject = await ctx.db.get(subjectId);
    if (!oldSubject) throw new Error("Subject not found");

    if (updates.chapterTrackers) {
      const newKeys = new Set(updates.chapterTrackers.map(t => t.key));
      const removedKeys = oldSubject.chapterTrackers.filter(t => !newKeys.has(t.key)).map(t => t.key);

      for (const key of removedKeys) {
        const studyItems = await ctx.db.query("studyItems")
          .withIndex("by_subject", q => q.eq("subjectId", subjectId))
          .filter(q => q.eq(q.field("type"), key))
          .collect();

        for (const item of studyItems) {
          await ctx.db.delete(item._id);
        }
      }
    }

    if (updates.conceptTrackers) {
      const newKeys = new Set(updates.conceptTrackers.map(t => t.key));
      const removedKeys = oldSubject.conceptTrackers.filter(t => !newKeys.has(t.key)).map(t => t.key);

      for (const key of removedKeys) {
        const studyItems = await ctx.db.query("studyItems")
          .withIndex("by_subject", q => q.eq("subjectId", subjectId))
          .filter(q => q.eq(q.field("type"), key))
          .collect();

        for (const item of studyItems) {
          await ctx.db.delete(item._id);
        }
      }
    }

    await ctx.db.patch(subjectId, updates);
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

// ── Create a chapter ─────────────────────────────────────────────
export const createChapter = mutation({
  args: {
    subjectId: v.id("subjects"),
    name: v.string(),
    slug: v.string(),
    order: v.number(),
    inNextTerm: v.boolean(),
    priorityBoost: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("chapters", args);
  },
});

// ── Update a chapter ─────────────────────────────────────────────
export const updateChapter = mutation({
  args: {
    chapterId: v.id("chapters"),
    name: v.string(),
    slug: v.string(),
    order: v.number(),
    inNextTerm: v.boolean(),
    priorityBoost: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { chapterId, ...updates } = args;
    await ctx.db.patch(chapterId, updates);
  },
});

// ── Delete a chapter ─────────────────────────────────────────────
export const deleteChapter = mutation({
  args: { chapterId: v.id("chapters") },
  handler: async (ctx, args) => {
    // Also delete associated concepts and studyItems
    const concepts = await ctx.db
      .query("concepts")
      .withIndex("by_chapter", (q) => q.eq("chapterId", args.chapterId))
      .collect();
    
    for (const concept of concepts) {
      const studyItems = await ctx.db
        .query("studyItems")
        .withIndex("by_concept", (q) => q.eq("conceptId", concept._id))
        .collect();
      for (const item of studyItems) {
        await ctx.db.delete(item._id);
      }
      await ctx.db.delete(concept._id);
    }

    const chapterItems = await ctx.db
      .query("studyItems")
      .withIndex("by_chapter", (q) => q.eq("chapterId", args.chapterId))
      .collect();
    for (const item of chapterItems) {
      await ctx.db.delete(item._id);
    }

    await ctx.db.delete(args.chapterId);
  },
});

// ── Create a concept ─────────────────────────────────────────────
export const createConcept = mutation({
  args: {
    chapterId: v.id("chapters"),
    name: v.string(),
    order: v.number(),
    difficulty: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("concepts", args);
  },
});

// ── Update a concept ─────────────────────────────────────────────
export const updateConcept = mutation({
  args: {
    conceptId: v.id("concepts"),
    name: v.string(),
    order: v.number(),
    difficulty: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { conceptId, ...updates } = args;
    
    // Update the concept itself
    await ctx.db.patch(conceptId, updates);

    // Also update titles of associated studyItems to keep them in sync
    // Pattern: "${concept.name} — ${tracker.label}"
    const concept = await ctx.db.get(conceptId);
    if (!concept) return;

    const chapter = await ctx.db.get(concept.chapterId);
    if (!chapter) return;

    const subject = await ctx.db.get(chapter.subjectId);
    if (!subject) return;

    const studyItems = await ctx.db
      .query("studyItems")
      .withIndex("by_concept", (q) => q.eq("conceptId", conceptId))
      .collect();

    for (const item of studyItems) {
      const tracker = subject.conceptTrackers.find(t => t.key === item.type);
      if (tracker) {
        await ctx.db.patch(item._id, {
          title: `${concept.name} — ${tracker.label}`
        });
      }
    }
  },
});

// ── Delete a concept ─────────────────────────────────────────────
export const deleteConcept = mutation({
  args: { conceptId: v.id("concepts") },
  handler: async (ctx, args) => {
    // Delete associated studyItems first
    const studyItems = await ctx.db
      .query("studyItems")
      .withIndex("by_concept", (q) => q.eq("conceptId", args.conceptId))
      .collect();
    
    for (const item of studyItems) {
      await ctx.db.delete(item._id);
    }

    await ctx.db.delete(args.conceptId);
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
// ── Seed Chemistry Concepts ─────────────────────────────────────
export const seedChemistryConcepts = mutation({
  args: {},
  handler: async (ctx) => {
    const chemistry = await ctx.db
      .query("subjects")
      .withIndex("by_slug", (q) => q.eq("slug", "chemistry"))
      .unique();

    if (!chemistry) throw new Error("Chemistry subject not found. Run migrateAndSeed first.");

    const chapters = await ctx.db
      .query("chapters")
      .withIndex("by_subject", (q) => q.eq("subjectId", chemistry._id))
      .collect();

    const conceptData: Record<string, string[]> = {
      "safe-use-of-laboratory": [
        "ল্যাবরেটরির ব্যবহার বিধি",
        "ল্যাবরেটরিতে ব্যালেন্স ব্যবহার ও পরিমাণ কৌশল",
        "ল্যাবরেটরিতে বিভিন্ন পরীক্ষায় তাপ দেওয়ার কৌশল, বিশ্লেষণ পদ্ধতি ও হ্যাজার্ড সিম্বল",
      ],
      "qualitative-chemistry": [
        "পরমাণু ও পরমাণু মডেল",
        "কোয়ান্টাম সংখ্যা ও ইলেকট্রন বিন্যাস",
        "তড়িৎ চুম্বকীয় বর্ণালি",
        "দ্রাব্যতা, দ্রাব্যতা নীতি ও দ্রাব্যতা গুণফল",
        "শিখা পরীক্ষা ও আয়ন শনাক্তকরণ",
      ],
      "periodic-properties-and-bonding": [
        "পর্যায় সারণি ও বিভিন্ন মৌলের অবস্থান",
        "মৌলের পর্যায়বৃত্ত ধর্ম",
        "রাসায়নিক বন্ধন",
      ],
      "chemical-change": [
        "রাসায়নিক বিক্রিয়া, বিক্রিয়ার হার ও সক্রিয়ণ শক্তি",
        "রাসায়নিক সাম্যাবস্থা",
        "আয়নিক গুণফল, বাফার দ্রবণ, pH",
        "বিক্রিয়া তাপ",
      ],
      "vocational-chemistry": [
        "খাদ্য নিরাপত্তা ও খাদ্য সংরক্ষণ",
        "সাসপেনশন ও কোয়াগুলেশন",
        "টয়লেট্রিজ ও পারফিউমারি",
        "ভিনেগার ও ভিনেগারের ক্রিয়া কৌশল",
      ],
    };

    for (const chapter of chapters) {
      const concepts = conceptData[chapter.slug];
      if (concepts) {
        // Clear existing concepts for this chapter to avoid duplicates if re-run
        const existingConcepts = await ctx.db
          .query("concepts")
          .withIndex("by_chapter", (q) => q.eq("chapterId", chapter._id))
          .collect();
        for (const ec of existingConcepts) {
          await ctx.db.delete(ec._id);
        }

        // Insert new concepts
        for (let i = 0; i < concepts.length; i++) {
          await ctx.db.insert("concepts", {
            chapterId: chapter._id,
            name: concepts[i],
            order: i + 1,
          });
        }
      }
    }
  },
});


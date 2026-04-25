import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // ======================================
  // SUBJECTS — config + metadata only
  // ======================================
  subjects: defineTable({
    name: v.string(),
    slug: v.string(),
    color: v.optional(v.string()),
    icon: v.optional(v.string()),

    // Defines columns on the Subject Page (chapter rows)
    chapterTrackers: v.array(
      v.object({
        key: v.string(),       // e.g. "mcq", "board"
        label: v.string(),     // e.g. "MCQ", "বোর্ড"
        avgMinutes: v.number(),
      })
    ),

    // Defines columns on the Chapter Page (concept rows)
    conceptTrackers: v.array(
      v.object({
        key: v.string(),       // e.g. "class", "book"
        label: v.string(),     // e.g. "ক্লাস", "বই"
        avgMinutes: v.number(),
      })
    ),

    examWeight: v.optional(v.number()),
    order: v.number(),
  }).index("by_slug", ["slug"]),

  // ======================================
  // CHAPTERS — structural only, no progress
  // ======================================
  chapters: defineTable({
    subjectId: v.id("subjects"),
    name: v.string(),
    slug: v.string(),
    order: v.number(),
    inNextTerm: v.boolean(),
    priorityBoost: v.optional(v.number()),
  })
    .index("by_subject", ["subjectId"])
    .index("by_subject_slug", ["subjectId", "slug"]),

  // ======================================
  // CONCEPTS — structural only, no progress
  // ======================================
  concepts: defineTable({
    chapterId: v.id("chapters"),
    name: v.string(),
    order: v.number(),
    difficulty: v.optional(v.number()), // 1-5
  }).index("by_chapter", ["chapterId"]),

  // ======================================
  // STUDY ITEMS — single source of truth
  // ======================================
  // Chapter-level task: conceptId is absent
  // Concept-level task: conceptId is present
  studyItems: defineTable({
    subjectId: v.id("subjects"),
    chapterId: v.id("chapters"),
    conceptId: v.optional(v.id("concepts")),

    type: v.string(),          // matches a key from chapterTrackers or conceptTrackers
    title: v.string(),         // human-readable: "গতি — MCQ"

    estimatedMinutes: v.number(),
    isCompleted: v.boolean(),
    completionScore: v.optional(v.number()), // 1-5

    lastStudiedAt: v.optional(v.number()),   // unix ms
    nextReviewAt: v.optional(v.number()),    // unix ms
    repetitionLevel: v.optional(v.number()), // spaced repetition stage
    weaknessScore: v.optional(v.number()),   // 0-100
  })
    .index("by_subject", ["subjectId"])
    .index("by_chapter", ["chapterId"])
    .index("by_concept", ["conceptId"])
    .index("by_next_review", ["nextReviewAt"]),

  // ======================================
  // STUDY LOGS — immutable history
  // ======================================
  studyLogs: defineTable({
    studyItemId: v.id("studyItems"),
    date: v.number(),              // unix ms
    minutesSpent: v.number(),
    completed: v.boolean(),
    rating: v.optional(v.number()),
    note: v.optional(v.string()),
  })
    .index("by_item", ["studyItemId"])
    .index("by_date", ["date"]),

  // ======================================
  // DAILY AI PLANS
  // ======================================
  plannerSessions: defineTable({
    date: v.number(),              // unix ms (start of day)
    availableMinutes: v.number(),
    tasks: v.array(
      v.object({
        studyItemId: v.id("studyItems"),
        title: v.string(),
        minutes: v.number(),
      })
    ),
    completedMinutes: v.optional(v.number()),
  }).index("by_date", ["date"]),

  // ======================================
  // SETTINGS
  // ======================================
  settings: defineTable({
    key: v.string(),
    value: v.union(v.string(), v.number(), v.boolean()),
  }).index("by_key", ["key"]),
});

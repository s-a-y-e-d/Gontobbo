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

    // Spaced Repetition
    reviewCount: v.optional(v.number()),
    lastReviewedAt: v.optional(v.number()),
    nextReviewAt: v.optional(v.number()),
    repetitionLevel: v.optional(v.number()),
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
    easeFactor: v.optional(v.number()),      // SM-2 style ease factor
    weaknessScore: v.optional(v.number()),   // 0-100
  })
    .index("by_subject", ["subjectId"])
    .index("by_chapter", ["chapterId"])
    .index("by_concept", ["conceptId"])
    .index("by_next_review", ["nextReviewAt"]),

  // ======================================
  // STUDY LOGS — explicit event records
  // ======================================
  studyLogs: defineTable({
    eventType: v.union(
      v.literal("study_item_completed"),
      v.literal("study_item_uncompleted"),
      v.literal("concept_review")
    ),
    loggedAt: v.number(),           // unix ms
    dayBucket: v.number(),          // unix ms (start of day in Dhaka time)
    
    // Ancestry for filtering
    subjectId: v.id("subjects"),
    chapterId: v.id("chapters"),
    conceptId: v.optional(v.id("concepts")),
    studyItemId: v.optional(v.id("studyItems")),
    trackerType: v.optional(v.string()), // e.g. "mcq", "class"

    // Time tracking
    minutesSpent: v.number(),
    originalMinutesSpent: v.number(),
    minutesSource: v.union(
      v.literal("estimated_tracker"),
      v.literal("default_revision"),
      v.literal("user_edited")
    ),

    // Metadata
    rating: v.optional(v.union(v.literal("hard"), v.literal("medium"), v.literal("easy"))),
    isEditable: v.boolean(),
    editedAt: v.optional(v.number()),

    // Snapshots for durable display
    titleSnapshot: v.string(),
    subjectNameSnapshot: v.string(),
    chapterNameSnapshot: v.string(),
    conceptNameSnapshot: v.optional(v.string()),
  })
    .index("by_loggedAt", ["loggedAt"])
    .index("by_dayBucket", ["dayBucket"])
    .index("by_eventType_and_loggedAt", ["eventType", "loggedAt"])
    .index("by_isEditable_and_loggedAt", ["isEditable", "loggedAt"])
    .index("by_subjectId_and_loggedAt", ["subjectId", "loggedAt"])
    .index("by_subjectId_and_eventType_and_loggedAt", ["subjectId", "eventType", "loggedAt"])
    .index("by_studyItemId_and_loggedAt", ["studyItemId", "loggedAt"])
    .index("by_conceptId_and_loggedAt", ["conceptId", "loggedAt"]),

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

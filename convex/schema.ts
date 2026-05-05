import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    tokenIdentifier: v.string(),
    clerkUserId: v.string(),
    role: v.union(v.literal("owner"), v.literal("viewer")),
    legacyWorkspaceOwner: v.optional(v.boolean()),
    classLevel: v.optional(v.union(v.literal("hsc"), v.literal("other"))),
    onboardingCompletedAt: v.optional(v.number()),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
  })
    .index("by_tokenIdentifier", ["tokenIdentifier"])
    .index("by_clerkUserId", ["clerkUserId"]),

  // ======================================
  // SUBJECTS — config + metadata only
  // ======================================
  subjects: defineTable({
    userId: v.optional(v.id("users")),
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
  })
    .index("by_slug", ["slug"])
    .index("by_userId", ["userId"])
    .index("by_userId_and_slug", ["userId", "slug"]),

  // ======================================
  // CHAPTERS — structural only, no progress
  // ======================================
  chapters: defineTable({
    userId: v.optional(v.id("users")),
    subjectId: v.id("subjects"),
    name: v.string(),
    slug: v.string(),
    order: v.number(),
    inNextTerm: v.boolean(),
    priorityBoost: v.optional(v.number()),
  })
    .index("by_subject", ["subjectId"])
    .index("by_subject_slug", ["subjectId", "slug"])
    .index("by_userId", ["userId"])
    .index("by_userId_and_subjectId", ["userId", "subjectId"])
    .index("by_userId_and_subjectId_and_slug", ["userId", "subjectId", "slug"]),

  // ======================================
  // CONCEPTS — structural only, no progress
  // ======================================
  concepts: defineTable({
    userId: v.optional(v.id("users")),
    chapterId: v.id("chapters"),
    name: v.string(),
    order: v.number(),
    difficulty: v.optional(v.number()), // 1-5

    // Spaced Repetition
    reviewCount: v.optional(v.number()),
    lastReviewedAt: v.optional(v.number()),
    nextReviewAt: v.optional(v.number()),
    repetitionLevel: v.optional(v.number()),
  })
    .index("by_chapter", ["chapterId"])
    .index("by_userId", ["userId"])
    .index("by_userId_and_chapterId", ["userId", "chapterId"])
    .index("by_userId_and_nextReviewAt", ["userId", "nextReviewAt"]),


  // ======================================
  // STUDY ITEMS — single source of truth
  // ======================================
  // Chapter-level task: conceptId is absent
  // Concept-level task: conceptId is present
  studyItems: defineTable({
    userId: v.optional(v.id("users")),
    subjectId: v.id("subjects"),
    chapterId: v.id("chapters"),
    conceptId: v.optional(v.id("concepts")),

    type: v.string(),          // matches a key from chapterTrackers or conceptTrackers
    title: v.string(),         // human-readable: "গতি — MCQ"

    searchText: v.optional(v.string()),
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
    .index("by_isCompleted", ["isCompleted"])
    .index("by_next_review", ["nextReviewAt"])
    .index("by_userId", ["userId"])
    .index("by_userId_and_subjectId", ["userId", "subjectId"])
    .index("by_userId_and_chapterId", ["userId", "chapterId"])
    .index("by_userId_and_conceptId", ["userId", "conceptId"])
    .index("by_userId_and_isCompleted", ["userId", "isCompleted"])
    .index("by_userId_and_nextReviewAt", ["userId", "nextReviewAt"])
    .searchIndex("search_searchText", {
      searchField: "searchText",
      filterFields: ["userId", "isCompleted"],
    }),

  // ======================================
  // STUDY LOGS — explicit event records
  // ======================================
  studyLogs: defineTable({
    userId: v.optional(v.id("users")),
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
    .index("by_conceptId_and_loggedAt", ["conceptId", "loggedAt"])
    .index("by_userId_and_loggedAt", ["userId", "loggedAt"])
    .index("by_userId_and_dayBucket", ["userId", "dayBucket"])
    .index("by_userId_and_eventType_and_loggedAt", ["userId", "eventType", "loggedAt"])
    .index("by_userId_and_isEditable_and_loggedAt", ["userId", "isEditable", "loggedAt"])
    .index("by_userId_and_subjectId_and_loggedAt", ["userId", "subjectId", "loggedAt"])
    .index("by_userId_and_subjectId_and_eventType_and_loggedAt", ["userId", "subjectId", "eventType", "loggedAt"])
    .index("by_userId_and_studyItemId_and_loggedAt", ["userId", "studyItemId", "loggedAt"])
    .index("by_userId_and_conceptId_and_loggedAt", ["userId", "conceptId", "loggedAt"]),

  // ======================================
  // DAILY AI PLANS
  // ======================================
  plannerSessions: defineTable({
    userId: v.optional(v.id("users")),
    date: v.number(),              // unix ms (start of day)
    latestGeneratedAt: v.optional(v.number()),
    generationCount: v.optional(v.number()),
    latestAvailableMinutes: v.optional(v.number()),
    latestComment: v.optional(v.string()),

    // Legacy compatibility for older local data
    availableMinutes: v.optional(v.number()),
    tasks: v.optional(v.array(
      v.object({
        studyItemId: v.id("studyItems"),
        title: v.string(),
        minutes: v.number(),
      })
    )),
    completedMinutes: v.optional(v.number()),
  })
    .index("by_date", ["date"])
    .index("by_userId", ["userId"])
    .index("by_userId_and_date", ["userId", "date"]),

  plannerSuggestions: defineTable({
    userId: v.optional(v.id("users")),
    sessionId: v.id("plannerSessions"),
    date: v.number(),
    kind: v.union(v.literal("study_item"), v.literal("concept_review")),
    studyItemId: v.optional(v.id("studyItems")),
    conceptId: v.optional(v.id("concepts")),
    durationMinutes: v.number(),
    rankOrder: v.number(),
    generationRound: v.number(),
    titleSnapshot: v.string(),
    subjectNameSnapshot: v.string(),
    chapterNameSnapshot: v.string(),
    conceptNameSnapshot: v.optional(v.string()),
    subjectColorSnapshot: v.optional(v.string()),
    acceptedAt: v.optional(v.number()),
  })
    .index("by_date", ["date"])
    .index("by_date_and_rankOrder", ["date", "rankOrder"])
    .index("by_sessionId_and_rankOrder", ["sessionId", "rankOrder"])
    .index("by_userId", ["userId"])
    .index("by_userId_and_date", ["userId", "date"])
    .index("by_userId_and_date_and_rankOrder", ["userId", "date", "rankOrder"])
    .index("by_userId_and_sessionId_and_rankOrder", ["userId", "sessionId", "rankOrder"]),

  plannerSubjectPreferences: defineTable({
    userId: v.optional(v.id("users")),
    subjectId: v.id("subjects"),
    priority: v.union(v.literal("normal"), v.literal("important")),
  })
    .index("by_subjectId", ["subjectId"])
    .index("by_userId", ["userId"])
    .index("by_userId_and_subjectId", ["userId", "subjectId"]),

  weeklyTargets: defineTable({
    userId: v.optional(v.id("users")),
    kind: v.union(v.literal("chapter"), v.literal("concept")),
    subjectId: v.id("subjects"),
    chapterId: v.id("chapters"),
    conceptId: v.optional(v.id("concepts")),
  })
    .index("by_subjectId", ["subjectId"])
    .index("by_chapterId", ["chapterId"])
    .index("by_conceptId", ["conceptId"])
    .index("by_userId", ["userId"])
    .index("by_userId_and_subjectId", ["userId", "subjectId"])
    .index("by_userId_and_chapterId", ["userId", "chapterId"])
    .index("by_userId_and_conceptId", ["userId", "conceptId"]),

  coachingProgress: defineTable({
    userId: v.optional(v.id("users")),
    chapterId: v.id("chapters"),
    status: v.union(
      v.literal("not_started"),
      v.literal("running"),
      v.literal("finished"),
    ),
  })
    .index("by_chapterId", ["chapterId"])
    .index("by_userId", ["userId"])
    .index("by_userId_and_chapterId", ["userId", "chapterId"]),

  todoTasks: defineTable({
    userId: v.optional(v.id("users")),
    date: v.number(),              // unix ms (start of day in Dhaka)
    kind: v.optional(v.union(v.literal("study_item"), v.literal("concept_review"), v.literal("custom"))),
    studyItemId: v.optional(v.id("studyItems")),
    conceptId: v.optional(v.id("concepts")),
    customTitle: v.optional(v.string()),
    isCompleted: v.optional(v.boolean()),
    startTimeMinutes: v.optional(v.number()),  // minutes from local day start
    sortOrder: v.optional(v.number()),
    durationMinutes: v.number(),
    source: v.union(v.literal("manual"), v.literal("ai_accepted")),
  })
    .index("by_date", ["date"])
    .index("by_date_and_sortOrder", ["date", "sortOrder"])
    .index("by_date_and_startTimeMinutes", ["date", "startTimeMinutes"])
    .index("by_date_and_studyItemId", ["date", "studyItemId"])
    .index("by_date_and_conceptId", ["date", "conceptId"])
    .index("by_studyItemId", ["studyItemId"])
    .index("by_conceptId", ["conceptId"])
    .index("by_userId", ["userId"])
    .index("by_userId_and_date", ["userId", "date"])
    .index("by_userId_and_date_and_sortOrder", ["userId", "date", "sortOrder"])
    .index("by_userId_and_date_and_startTimeMinutes", ["userId", "date", "startTimeMinutes"])
    .index("by_userId_and_date_and_studyItemId", ["userId", "date", "studyItemId"])
    .index("by_userId_and_date_and_conceptId", ["userId", "date", "conceptId"])
    .index("by_userId_and_studyItemId", ["userId", "studyItemId"])
    .index("by_userId_and_conceptId", ["userId", "conceptId"]),

  ownershipMigrations: defineTable({
    key: v.string(),
    status: v.union(
      v.literal("idle"),
      v.literal("running"),
      v.literal("completed"),
      v.literal("failed"),
    ),
    ownerUserId: v.optional(v.id("users")),
    processedDocs: v.number(),
    lastTable: v.optional(v.string()),
    lastCursor: v.optional(v.string()),
    lastError: v.optional(v.string()),
    updatedAt: v.number(),
  }).index("by_key", ["key"]),

  // ======================================
  // SETTINGS
  // ======================================
  settings: defineTable({
    userId: v.optional(v.id("users")),
    key: v.string(),
    value: v.union(v.string(), v.number(), v.boolean()),
  })
    .index("by_key", ["key"])
    .index("by_userId", ["userId"])
    .index("by_userId_and_key", ["userId", "key"]),
});

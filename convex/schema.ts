import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  subjects: defineTable({
    name: v.string(),
    description: v.string(),
    icon: v.string(),
    colorTheme: v.string(),
    chapterTrackerConfig: v.array(
      v.object({
        id: v.string(),
        label: v.string(),
        type: v.string(),
      })
    ),
  }),

  chapters: defineTable({
    subjectId: v.id("subjects"),
    title: v.string(),
    order: v.number(),
    conceptTrackerConfig: v.array(
      v.object({
        id: v.string(),
        label: v.string(),
        type: v.string(),
      })
    ),
  }),

  concepts: defineTable({
    chapterId: v.id("chapters"),
    title: v.string(),
    order: v.number(),
  }),

  chapterProgress: defineTable({
    chapterId: v.id("chapters"),
    taskId: v.string(),
    status: v.union(v.boolean(), v.string()),
    lastReviewed: v.number(),
  }),

  conceptProgress: defineTable({
    conceptId: v.id("concepts"),
    taskId: v.string(),
    status: v.union(v.boolean(), v.string()),
    lastReviewed: v.number(),
  }),
});

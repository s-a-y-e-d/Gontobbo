import { mutation } from "./_generated/server";
import { v } from "convex/values";

export const updateChapterProgress = mutation({
  args: {
    chapterId: v.id("chapters"),
    taskId: v.string(),
    status: v.union(v.boolean(), v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("chapterProgress")
      .filter((q) => 
        q.and(
          q.eq(q.field("chapterId"), args.chapterId),
          q.eq(q.field("taskId"), args.taskId)
        )
      )
      .first();

    const lastReviewed = Date.now();

    if (existing) {
      await ctx.db.patch(existing._id, {
        status: args.status,
        lastReviewed,
      });
    } else {
      await ctx.db.insert("chapterProgress", {
        chapterId: args.chapterId,
        taskId: args.taskId,
        status: args.status,
        lastReviewed,
      });
    }
  },
});

export const updateConceptProgress = mutation({
  args: {
    conceptId: v.id("concepts"),
    taskId: v.string(),
    status: v.union(v.boolean(), v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("conceptProgress")
      .filter((q) => 
        q.and(
          q.eq(q.field("conceptId"), args.conceptId),
          q.eq(q.field("taskId"), args.taskId)
        )
      )
      .first();

    const lastReviewed = Date.now();

    if (existing) {
      await ctx.db.patch(existing._id, {
        status: args.status,
        lastReviewed,
      });
    } else {
      await ctx.db.insert("conceptProgress", {
        conceptId: args.conceptId,
        taskId: args.taskId,
        status: args.status,
        lastReviewed,
      });
    }
  },
});

export const seedData = mutation({
  args: {},
  handler: async (ctx) => {
    // Check if we already have subjects
    const existingSubjects = await ctx.db.query("subjects").collect();
    if (existingSubjects.length > 0) return;

    // Insert Physics
    const physicsId = await ctx.db.insert("subjects", {
      name: "Physics",
      description: "Advanced Mechanics",
      icon: "rocket_launch",
      colorTheme: "brand-green",
      chapterTrackerConfig: [
        { id: "mcq", label: "MCQ", type: "boolean" },
        { id: "cq", label: "Creative Qs", type: "boolean" },
      ],
    });

    // Insert Chemistry
    const chemistryId = await ctx.db.insert("subjects", {
      name: "Chemistry",
      description: "Organic Chem 101",
      icon: "science",
      colorTheme: "gray",
      chapterTrackerConfig: [
        { id: "mcq", label: "MCQ", type: "boolean" },
        { id: "board", label: "Board Qs", type: "boolean" },
      ],
    });

    // Add a chapter for Physics
    const motionId = await ctx.db.insert("chapters", {
      subjectId: physicsId,
      title: "Newtonian Mechanics",
      order: 1,
      conceptTrackerConfig: [
        { id: "class", label: "Class Notes", type: "boolean" },
        { id: "book", label: "Textbook", type: "boolean" },
      ],
    });

    // Add concepts for Physics Chapter
    await ctx.db.insert("concepts", {
      chapterId: motionId,
      title: "Newton's First Law",
      order: 1,
    });
    await ctx.db.insert("concepts", {
      chapterId: motionId,
      title: "Newton's Second Law",
      order: 2,
    });
  },
});

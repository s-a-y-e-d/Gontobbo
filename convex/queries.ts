import { query } from "./_generated/server";
import { v } from "convex/values";

export const getSubjects = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("subjects").collect();
  },
});

export const getSubjectDetails = query({
  args: { subjectId: v.id("subjects") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.subjectId);
  },
});

export const getChaptersBySubject = query({
  args: { subjectId: v.id("subjects") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("chapters")
      .filter((q) => q.eq(q.field("subjectId"), args.subjectId))
      .collect();
  },
});

export const getConceptsByChapter = query({
  args: { chapterId: v.id("chapters") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("concepts")
      .filter((q) => q.eq(q.field("chapterId"), args.chapterId))
      .collect();
  },
});

export const getChapterProgress = query({
  args: { chapterId: v.id("chapters") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("chapterProgress")
      .filter((q) => q.eq(q.field("chapterId"), args.chapterId))
      .collect();
  },
});

export const getConceptProgress = query({
  args: { conceptId: v.id("concepts") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("conceptProgress")
      .filter((q) => q.eq(q.field("conceptId"), args.conceptId))
      .collect();
  },
});

export const getSubjectsWithStats = query({
  args: {},
  handler: async (ctx) => {
    const subjects = await ctx.db.query("subjects").collect();
    
    const subjectsWithStats = await Promise.all(
      subjects.map(async (subject) => {
        const chapters = await ctx.db
          .query("chapters")
          .filter((q) => q.eq(q.field("subjectId"), subject._id))
          .collect();
        
        let totalTasks = 0;
        let completedTasks = 0;
        let completedChaptersCount = 0;

        for (const chapter of chapters) {
          const chapterTasks = subject.chapterTrackerConfig.length;
          totalTasks += chapterTasks;

          const chapterProgress = await ctx.db
            .query("chapterProgress")
            .filter((q) => q.eq(q.field("chapterId"), chapter._id))
            .collect();
          
          const completedChapterTasks = chapterProgress.filter(p => p.status === true || p.status === "true").length;
          completedTasks += completedChapterTasks;

          if (chapterTasks > 0 && completedChapterTasks === chapterTasks) {
            completedChaptersCount++;
          }

          const concepts = await ctx.db
            .query("concepts")
            .filter((q) => q.eq(q.field("chapterId"), chapter._id))
            .collect();
          
          const conceptTasks = chapter.conceptTrackerConfig.length;
          totalTasks += concepts.length * conceptTasks;

          for (const concept of concepts) {
            const conceptProgress = await ctx.db
              .query("conceptProgress")
              .filter((q) => q.eq(q.field("conceptId"), concept._id))
              .collect();
            
            completedTasks += conceptProgress.filter(p => p.status === true || p.status === "true").length;
          }
        }

        const tasksPending = totalTasks - completedTasks;
        const progressPercentage = totalTasks === 0 ? 0 : Math.round((completedTasks / totalTasks) * 100);

        return {
          ...subject,
          stats: {
            totalChapters: chapters.length,
            completedChapters: completedChaptersCount,
            tasksPending,
            progressPercentage,
          }
        };
      })
    );

    return subjectsWithStats;
  },
});

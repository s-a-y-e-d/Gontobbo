import { query } from "./_generated/server";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";

// ── List study logs feed ─────────────────────────────────────────
export const getStudyLogsFeed = query({
  args: {
    paginationOpts: paginationOptsValidator,
    subjectId: v.optional(v.id("subjects")),
    eventType: v.optional(v.union(
      v.literal("study_item_completed"),
      v.literal("study_item_uncompleted"),
      v.literal("concept_review")
    )),
    editableOnly: v.optional(v.boolean()),
    dayBucket: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let q = ctx.db.query("studyLogs");

    // Choose best index based on provided filters
    if (args.subjectId && args.eventType) {
      q = q.withIndex("by_subjectId_and_eventType_and_loggedAt", (q) =>
        q.eq("subjectId", args.subjectId!).eq("eventType", args.eventType!)
      );
    } else if (args.subjectId) {
      q = q.withIndex("by_subjectId_and_loggedAt", (q) =>
        q.eq("subjectId", args.subjectId!)
      );
    } else if (args.eventType) {
      q = q.withIndex("by_eventType_and_loggedAt", (q) =>
        q.eq("eventType", args.eventType!)
      );
    } else if (args.dayBucket) {
      q = q.withIndex("by_dayBucket", (q) =>
        q.eq("dayBucket", args.dayBucket!)
      );
    } else if (args.editableOnly) {
      q = q.withIndex("by_isEditable_and_loggedAt", (q) =>
        q.eq("isEditable", true)
      );
    } else {
      q = q.withIndex("by_loggedAt");
    }

    // Apply remaining filters in-query (better for pagination than in-memory)
    if (args.editableOnly && !args.editableOnly) { // already indexed
    } else if (args.editableOnly) {
      q = q.filter((q) => q.eq(q.field("isEditable"), true));
    }

    if (args.eventType && args.subjectId) { // already indexed
    } else if (args.eventType) {
      // already indexed unless dayBucket or editableOnly was chosen
      q = q.filter((q) => q.eq(q.field("eventType"), args.eventType));
    }

    return await q.order("desc").paginate(args.paginationOpts);
  },
});

// ── Get subjects for logs filter ─────────────────────────────────
export const getStudyLogSubjectsFilterData = query({
  args: {},
  handler: async (ctx) => {
    const subjects = await ctx.db.query("subjects").collect();
    return subjects.map(s => ({
      _id: s._id,
      name: s.name,
    }));
  },
});

// ── List all subjects (ordered) ──────────────────────────────────
export const getSubjects = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("subjects").collect();
  },
});

// ── Get a subject by slug ────────────────────────────────────────
export const getSubjectBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("subjects")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();
  },
});

// ── Get subject by ID ────────────────────────────────────────────
export const getSubjectDetails = query({
  args: { subjectId: v.id("subjects") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.subjectId);
  },
});

// ── Chapters for a subject ───────────────────────────────────────
export const getChaptersBySubject = query({
  args: { subjectId: v.id("subjects") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("chapters")
      .withIndex("by_subject", (q) => q.eq("subjectId", args.subjectId))
      .collect();
  },
});

// ── Concepts for a chapter ───────────────────────────────────────
export const getConceptsByChapter = query({
  args: { chapterId: v.id("chapters") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("concepts")
      .withIndex("by_chapter", (q) => q.eq("chapterId", args.chapterId))
      .collect();
  },
});

// ── StudyItems for a chapter (chapter-level only: no conceptId) ──
export const getChapterStudyItems = query({
  args: { chapterId: v.id("chapters") },
  handler: async (ctx, args) => {
    const items = await ctx.db
      .query("studyItems")
      .withIndex("by_chapter", (q) => q.eq("chapterId", args.chapterId))
      .collect();
    // Return only chapter-level items (conceptId is undefined)
    return items.filter((item) => item.conceptId === undefined);
  },
});

// ── StudyItems for a concept ─────────────────────────────────────
export const getConceptStudyItems = query({
  args: { conceptId: v.id("concepts") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("studyItems")
      .withIndex("by_concept", (q) => q.eq("conceptId", args.conceptId))
      .collect();
  },
});

// ── Full subject page data ───────────────────────────────────────
// Returns subject + chapters + all studyItems + concept counts
// Used by /subjects/[slug] page
export const getSubjectPageData = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const subject = await ctx.db
      .query("subjects")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();

    if (!subject) return null;

    const chapters = await ctx.db
      .query("chapters")
      .withIndex("by_subject", (q) => q.eq("subjectId", subject._id))
      .collect();

    // Sort chapters by order
    chapters.sort((a, b) => a.order - b.order);

    // For each chapter, get studyItems + concept count
    const chaptersWithData = await Promise.all(
      chapters.map(async (chapter) => {
        // All studyItems for this chapter (both chapter-level and concept-level)
        const allStudyItems = await ctx.db
          .query("studyItems")
          .withIndex("by_chapter", (q) => q.eq("chapterId", chapter._id))
          .collect();

        // Chapter-level items (no conceptId)
        const chapterLevelItems = allStudyItems.filter(
          (si) => si.conceptId === undefined
        );

        // Concept-level items (has conceptId)
        const conceptLevelItems = allStudyItems.filter(
          (si) => si.conceptId !== undefined
        );

        // Count concepts for this chapter
        const concepts = await ctx.db
          .query("concepts")
          .withIndex("by_chapter", (q) => q.eq("chapterId", chapter._id))
          .collect();

        // Concept completion: a concept is "done" when all its studyItems are completed
        const conceptTrackerCount = subject.conceptTrackers.length;
        let completedConceptCount = 0;
        if (conceptTrackerCount > 0) {
          for (const concept of concepts) {
            const conceptItems = conceptLevelItems.filter(
              (si) => si.conceptId === concept._id
            );
            const allDone =
              conceptItems.length >= conceptTrackerCount &&
              conceptItems.every((si) => si.isCompleted);
            if (allDone) completedConceptCount++;
          }
        }

        // Build tracker data: for each chapterTracker key, find matching studyItem
        const trackerData = subject.chapterTrackers.map((tracker) => {
          const matchingItem = chapterLevelItems.find(
            (si) => si.type === tracker.key
          );
          return {
            key: tracker.key,
            isCompleted: matchingItem?.isCompleted ?? false,
            score: matchingItem?.completionScore ?? undefined,
            studyItemId: matchingItem?._id,
          };
        });

        // Overall chapter status
        const totalItems = chapterLevelItems.length + conceptLevelItems.length;
        const completedItems =
          chapterLevelItems.filter((si) => si.isCompleted).length +
          conceptLevelItems.filter((si) => si.isCompleted).length;

        let status: "NOT_STARTED" | "IN_PROGRESS" | "READY" = "NOT_STARTED";
        if (totalItems > 0 && completedItems === totalItems) {
          status = "READY";
        } else if (completedItems > 0) {
          status = "IN_PROGRESS";
        }

        return {
          ...chapter,
          totalConcepts: concepts.length,
          completedConcepts: completedConceptCount,
          trackerData,
          status,
          totalItems,
          completedItems,
        };
      })
    );

    // Overall subject progress
    const totalAllItems = chaptersWithData.reduce((sum, ch) => sum + ch.totalItems, 0);
    const completedAllItems = chaptersWithData.reduce((sum, ch) => sum + ch.completedItems, 0);
    const progressPercentage = totalAllItems === 0 ? 0 : Math.round((completedAllItems / totalAllItems) * 100);

    return {
      subject,
      chapters: chaptersWithData,
      progressPercentage,
      totalItems: totalAllItems,
      completedItems: completedAllItems,
    };
  },
});

// ── Subjects with aggregated stats (for home page grid) ──────────
export const getSubjectsWithStats = query({
  args: {},
  handler: async (ctx) => {
    const subjects = await ctx.db.query("subjects").collect();

    const subjectsWithStats = await Promise.all(
      subjects.map(async (subject) => {
        const chapters = await ctx.db
          .query("chapters")
          .withIndex("by_subject", (q) => q.eq("subjectId", subject._id))
          .collect();

        let totalItems = 0;
        let completedItems = 0;
        let completedChaptersCount = 0;

        for (const chapter of chapters) {
          const studyItems = await ctx.db
            .query("studyItems")
            .withIndex("by_chapter", (q) => q.eq("chapterId", chapter._id))
            .collect();

          const chapterTotal = studyItems.length;
          const chapterCompleted = studyItems.filter((si) => si.isCompleted).length;

          totalItems += chapterTotal;
          completedItems += chapterCompleted;

          if (chapterTotal > 0 && chapterCompleted === chapterTotal) {
            completedChaptersCount++;
          }
        }

        const tasksPending = totalItems - completedItems;
        const progressPercentage =
          totalItems === 0 ? 0 : Math.round((completedItems / totalItems) * 100);

        return {
          ...subject,
          stats: {
            totalChapters: chapters.length,
            completedChapters: completedChaptersCount,
            tasksPending,
            progressPercentage,
          },
        };
      })
    );

    return subjectsWithStats;
  },
});

// ── Count studyItems by type ─────────────────────────────────────
export const countStudyItemsByType = query({
  args: { subjectId: v.id("subjects"), type: v.string() },
  handler: async (ctx, args) => {
    const items = await ctx.db
      .query("studyItems")
      .withIndex("by_subject", (q) => q.eq("subjectId", args.subjectId))
      .filter((q) => q.eq(q.field("type"), args.type))
      .collect();
    return items.length;
  },
});
// ── Full chapter page data ───────────────────────────────────────
// Returns subject + chapter + concepts with studyItems
// Used by /subjects/[slug]/[chapterSlug] page
export const getChapterPageData = query({
  args: { subjectSlug: v.string(), chapterSlug: v.string() },
  handler: async (ctx, args) => {
    const subject = await ctx.db
      .query("subjects")
      .withIndex("by_slug", (q) => q.eq("slug", args.subjectSlug))
      .unique();

    if (!subject) return null;

    const chapter = await ctx.db
      .query("chapters")
      .withIndex("by_subject_slug", (q) =>
        q.eq("subjectId", subject._id).eq("slug", args.chapterSlug)
      )
      .unique();

    if (!chapter) return null;

    const concepts = await ctx.db
      .query("concepts")
      .withIndex("by_chapter", (q) => q.eq("chapterId", chapter._id))
      .collect();

    // Sort concepts by order
    concepts.sort((a, b) => a.order - b.order);

    const conceptsWithData = await Promise.all(
      concepts.map(async (concept) => {
        const studyItems = await ctx.db
          .query("studyItems")
          .withIndex("by_concept", (q) => q.eq("conceptId", concept._id))
          .collect();

        // Build tracker data
        const trackerData = subject.conceptTrackers.map((tracker) => {
          const matchingItem = studyItems.find((si) => si.type === tracker.key);
          return {
            key: tracker.key,
            isCompleted: matchingItem?.isCompleted ?? false,
            score: matchingItem?.completionScore ?? undefined,
            studyItemId: matchingItem?._id,
          };
        });

        // Concept status
        const totalItems = subject.conceptTrackers.length;
        const completedItems = studyItems.filter((si) => si.isCompleted).length;
        let status: "NOT_STARTED" | "IN_PROGRESS" | "READY" = "NOT_STARTED";
        if (totalItems > 0 && completedItems === totalItems) {
          status = "READY";
        } else if (completedItems > 0) {
          status = "IN_PROGRESS";
        }

        return {
          ...concept,
          trackerData,
          status,
          totalItems,
          completedItems,
        };
      })
    );

    // Chapter progress
    const totalAllItems = conceptsWithData.reduce((sum, c) => sum + c.totalItems, 0);
    const completedAllItems = conceptsWithData.reduce((sum, c) => sum + c.completedItems, 0);
    const progressPercentage = totalAllItems === 0 ? 0 : Math.round((completedAllItems / totalAllItems) * 100);

    return {
      subject,
      chapter,
      concepts: conceptsWithData,
      progressPercentage,
    };
  },
});

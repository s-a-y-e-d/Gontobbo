import { query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { filterOwnedDocuments, requireCurrentUser } from "./auth";

const DAY_MS = 86400000;
const DASHBOARD_TODO_LIMIT = 5;
const TRACK_STATUS_TOLERANCE = 5;

type DashboardTodoItem = {
  id: Id<"todoTasks">;
  kind: "study_item" | "concept_review";
  title: string;
  subjectName: string;
  chapterName: string;
  subjectColor: string;
  durationMinutes: number;
  startTimeMinutes?: number;
  isCompleted: boolean;
  sortValue: number;
  isScheduled: boolean;
};

function getDhakaDayBucket(timestamp: number) {
  const dhakaOffset = 6 * 60 * 60 * 1000;
  const dhakaTime = new Date(timestamp + dhakaOffset);
  dhakaTime.setUTCHours(0, 0, 0, 0);
  return dhakaTime.getTime() - dhakaOffset;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getRoundedPercentage(completed: number, total: number) {
  if (total === 0) {
    return 0;
  }

  return Math.round((completed / total) * 100);
}

export const getDashboardPageData = query({
  args: {},
  handler: async (ctx) => {
    const currentUser = await requireCurrentUser(ctx);
    const today = getDhakaDayBucket(Date.now());

    const [
      subjects,
      chapters,
      concepts,
      studyItems,
      todayTodoTasks,
      settings,
    ] = await Promise.all([
      filterOwnedDocuments(currentUser, await ctx.db.query("subjects").collect()),
      filterOwnedDocuments(currentUser, await ctx.db.query("chapters").collect()),
      filterOwnedDocuments(currentUser, await ctx.db.query("concepts").collect()),
      filterOwnedDocuments(currentUser, await ctx.db.query("studyItems").collect()),
      filterOwnedDocuments(
        currentUser,
        await ctx.db
          .query("todoTasks")
          .withIndex("by_date", (q) => q.eq("date", today))
          .collect(),
      ),
      filterOwnedDocuments(currentUser, await ctx.db.query("settings").collect()),
    ]);

    const settingByKey = new Map(settings.map((setting) => [setting.key, setting]));
    const subjectById = new Map(subjects.map((subject) => [subject._id, subject]));
    const chapterById = new Map(chapters.map((chapter) => [chapter._id, chapter]));
    const conceptById = new Map(concepts.map((concept) => [concept._id, concept]));
    const studyItemById = new Map(studyItems.map((studyItem) => [studyItem._id, studyItem]));
    const nextTermChapterIds = new Set(
      chapters.filter((chapter) => chapter.inNextTerm).map((chapter) => chapter._id),
    );

    const allCompletedItems = studyItems.filter((item) => item.isCompleted).length;
    const nextTermStudyItems = studyItems.filter((item) =>
      nextTermChapterIds.has(item.chapterId),
    );
    const nextTermCompletedItems = nextTermStudyItems.filter(
      (item) => item.isCompleted,
    ).length;

    const subjectProgress = subjects
      .map((subject) => {
        const subjectItems = nextTermStudyItems.filter(
          (item) => item.subjectId === subject._id,
        );
        const completedItems = subjectItems.filter((item) => item.isCompleted).length;

        return {
          subjectId: subject._id,
          name: subject.name,
          color: subject.color ?? "gray",
          icon: subject.icon ?? "menu_book",
          totalItems: subjectItems.length,
          completedItems,
          progressPercentage: getRoundedPercentage(
            completedItems,
            subjectItems.length,
          ),
        };
      })
      .filter((subject) => subject.totalItems > 0)
      .sort((left, right) => {
        if (left.progressPercentage !== right.progressPercentage) {
          return left.progressPercentage - right.progressPercentage;
        }

        if (left.totalItems - left.completedItems !== right.totalItems - right.completedItems) {
          return (
            right.totalItems -
            right.completedItems -
            (left.totalItems - left.completedItems)
          );
        }

        return left.name.localeCompare(right.name);
      });

    const todoCandidates = todayTodoTasks.map((todoTask) => {
      if (todoTask.kind === "concept_review") {
        if (!todoTask.conceptId) {
          return null;
        }

        const concept = conceptById.get(todoTask.conceptId);
        if (!concept) {
          return null;
        }

        const chapter = chapterById.get(concept.chapterId);
        if (!chapter) {
          return null;
        }

        const subject = subjectById.get(chapter.subjectId);
        if (!subject) {
          return null;
        }

        return {
          id: todoTask._id,
          kind: "concept_review" as const,
          title: `${concept.name} - রিভিশন`,
          subjectName: subject.name,
          chapterName: chapter.name,
          subjectColor: subject.color ?? "gray",
          durationMinutes: todoTask.durationMinutes,
          startTimeMinutes: todoTask.startTimeMinutes,
          isCompleted:
            concept.lastReviewedAt !== undefined &&
            getDhakaDayBucket(concept.lastReviewedAt) === today,
          sortValue:
            todoTask.startTimeMinutes ??
            todoTask.sortOrder ??
            todoTask._creationTime,
          isScheduled: todoTask.startTimeMinutes !== undefined,
        };
      }

      if (!todoTask.studyItemId) {
        return null;
      }

      const studyItem = studyItemById.get(todoTask.studyItemId);
      if (!studyItem) {
        return null;
      }

      const chapter = chapterById.get(studyItem.chapterId);
      const subject = subjectById.get(studyItem.subjectId);
      if (!chapter || !subject) {
        return null;
      }

      return {
        id: todoTask._id,
        kind: "study_item" as const,
        title: studyItem.title,
        subjectName: subject.name,
        chapterName: chapter.name,
        subjectColor: subject.color ?? "gray",
        durationMinutes: todoTask.durationMinutes,
        startTimeMinutes: todoTask.startTimeMinutes,
        isCompleted: studyItem.isCompleted,
        sortValue:
          todoTask.startTimeMinutes ??
          todoTask.sortOrder ??
          todoTask._creationTime,
        isScheduled: todoTask.startTimeMinutes !== undefined,
      };
    });

    const todoItems: DashboardTodoItem[] = [];
    for (const item of todoCandidates) {
      if (item !== null) {
        todoItems.push(item);
      }
    }

    todoItems.sort((left, right) => {
      if (left.isScheduled !== right.isScheduled) {
        return left.isScheduled ? -1 : 1;
      }

      return left.sortValue - right.sortValue;
    });

    const termStartDateSetting = settingByKey.get("termStartDate");
    const nextTermExamDateSetting = settingByKey.get("nextTermExamDate");
    const termStartDate =
      typeof termStartDateSetting?.value === "number"
        ? termStartDateSetting.value
        : undefined;
    const nextTermExamDate =
      typeof nextTermExamDateSetting?.value === "number"
        ? nextTermExamDateSetting.value
        : undefined;
    const hasTermDates =
      termStartDate !== undefined && nextTermExamDate !== undefined;

    const nextTermProgressPercentage = getRoundedPercentage(
      nextTermCompletedItems,
      nextTermStudyItems.length,
    );

    const urgency =
      termStartDate === undefined || nextTermExamDate === undefined
        ? null
        : (() => {
            const totalWindow = Math.max(1, nextTermExamDate - termStartDate);
            const elapsedWindow = clamp(today - termStartDate, 0, totalWindow);
            const elapsedPercent = Math.round((elapsedWindow / totalWindow) * 100);
            const timeLeftPercent = 100 - elapsedPercent;
            const incompletionPercent = 100 - nextTermProgressPercentage;
            const gap = incompletionPercent - timeLeftPercent;
            const daysRemaining = Math.max(
              0,
              Math.ceil((nextTermExamDate - today) / DAY_MS),
            );
            const examPassed = today > nextTermExamDate;

            let status: "ahead" | "on_track" | "behind" | "overdue" = "on_track";
            if (examPassed) {
              status = "overdue";
            } else if (gap > TRACK_STATUS_TOLERANCE) {
              status = "behind";
            } else if (gap < -TRACK_STATUS_TOLERANCE) {
              status = "ahead";
            }

            return {
              elapsedPercent,
              timeLeftPercent,
              incompletionPercent,
              daysRemaining,
              examPassed,
              status,
            };
          })();

    const pace =
      termStartDate === undefined || nextTermExamDate === undefined
        ? null
        : (() => {
            const elapsedDays = Math.max(
              1,
              Math.ceil((today - termStartDate) / DAY_MS) + 1,
            );
            const remainingItems = Math.max(
              0,
              nextTermStudyItems.length - nextTermCompletedItems,
            );
            const actualItemsPerDay = nextTermCompletedItems / elapsedDays;
            const examPassed = today > nextTermExamDate;

            if (examPassed) {
              return {
                actualItemsPerDay,
                requiredItemsPerDay: null,
                elapsedDays,
                remainingDays: 0,
                completedItems: nextTermCompletedItems,
                remainingItems,
                examPassed: true,
              };
            }

            const remainingDays = Math.max(
              1,
              Math.ceil((nextTermExamDate - today) / DAY_MS),
            );

            return {
              actualItemsPerDay,
              requiredItemsPerDay: remainingItems / remainingDays,
              elapsedDays,
              remainingDays,
              completedItems: nextTermCompletedItems,
              remainingItems,
              examPassed: false,
            };
          })();

    return {
      today: {
        date: today,
        totalCount: todoItems.length,
        completedCount: todoItems.filter((item) => item.isCompleted).length,
        tasks: todoItems.slice(0, DASHBOARD_TODO_LIMIT).map((item) => ({
          id: item.id,
          kind: item.kind,
          title: item.title,
          subjectName: item.subjectName,
          chapterName: item.chapterName,
          subjectColor: item.subjectColor,
          durationMinutes: item.durationMinutes,
          startTimeMinutes: item.startTimeMinutes,
          isCompleted: item.isCompleted,
        })),
      },
      termDates: {
        termStartDate,
        nextTermExamDate,
        isConfigured: hasTermDates,
      },
      completion: {
        nextTerm: {
          completedItems: nextTermCompletedItems,
          totalItems: nextTermStudyItems.length,
          progressPercentage: nextTermProgressPercentage,
        },
        allSyllabus: {
          completedItems: allCompletedItems,
          totalItems: studyItems.length,
          progressPercentage: getRoundedPercentage(
            allCompletedItems,
            studyItems.length,
          ),
        },
      },
      urgency,
      pace,
      subjectProgress,
    };
  },
});

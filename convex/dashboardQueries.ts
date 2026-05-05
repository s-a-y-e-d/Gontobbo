import { query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { filterOwnedDocuments, requireCurrentUser } from "./auth";

const DAY_MS = 86400000;
const DASHBOARD_TODO_LIMIT = 5;
const TRACK_STATUS_TOLERANCE = 5;
const STUDY_VOLUME_DAYS = 90;
const EFFORT_UNDER_STUDIED_GAP = 10;
const MAX_PROGRESSION_CHART_POINTS = 120;

type DashboardTodoItem = {
  id: Id<"todoTasks">;
  kind: "study_item" | "concept_review";
  studyItemId?: Id<"studyItems">;
  conceptId?: Id<"concepts">;
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

function getHeatmapIntensity(activityCount: number) {
  if (activityCount >= 5) return 4;
  if (activityCount >= 3) return 3;
  if (activityCount >= 2) return 2;
  if (activityCount > 0) return 1;
  return 0;
}

function getCompletionDay(item: Doc<"studyItems">, termStartDate: number) {
  if (item.lastStudiedAt === undefined) {
    return termStartDate;
  }

  return Math.max(termStartDate, getDhakaDayBucket(item.lastStudiedAt));
}

export const getDashboardPageData = query({
  args: {},
  handler: async (ctx) => {
    const currentUser = await requireCurrentUser(ctx);
    const today = getDhakaDayBucket(Date.now());
    const recentStartDate = today - (STUDY_VOLUME_DAYS - 1) * DAY_MS;

    const [
      subjects,
      chapters,
      concepts,
      studyItems,
      todayTodoTasks,
      recentStudyLogs,
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
      filterOwnedDocuments(
        currentUser,
        await ctx.db
          .query("studyLogs")
          .withIndex("by_dayBucket", (q) =>
            q.gte("dayBucket", recentStartDate).lte("dayBucket", today),
          )
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
    const nextTermProgressPercentage = getRoundedPercentage(
      nextTermCompletedItems,
      nextTermStudyItems.length,
    );

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
          return right.progressPercentage - left.progressPercentage;
        }

        const leftRemaining = left.totalItems - left.completedItems;
        const rightRemaining = right.totalItems - right.completedItems;
        if (leftRemaining !== rightRemaining) {
          return leftRemaining - rightRemaining;
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
          conceptId: concept._id,
          title: `${concept.name} - Revision`,
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
        studyItemId: studyItem._id,
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

    const progression =
      termStartDate === undefined || nextTermExamDate === undefined
        ? null
        : (() => {
            const chartEndDate = clamp(
              today,
              termStartDate,
              Math.max(termStartDate, nextTermExamDate),
            );
            const elapsedDays = Math.max(
              0,
              Math.floor((chartEndDate - termStartDate) / DAY_MS),
            );
            const totalWindowDays = Math.max(
              1,
              Math.floor((nextTermExamDate - termStartDate) / DAY_MS),
            );
            const completionDays = nextTermStudyItems
              .filter((item) => item.isCompleted)
              .map((item) => getCompletionDay(item, termStartDate))
              .sort((left, right) => left - right);
            let completedCount = 0;

            const pointCount = Math.min(
              elapsedDays + 1,
              MAX_PROGRESSION_CHART_POINTS,
            );
            const dayIndexes =
              pointCount <= 1
                ? [0]
                : Array.from({ length: pointCount }, (_, index) =>
                    Math.round((elapsedDays * index) / (pointCount - 1)),
                  );

            const points = dayIndexes.map((dayIndex) => {
              const date = termStartDate + dayIndex * DAY_MS;
              while (
                completedCount < completionDays.length &&
                completionDays[completedCount] <= date
              ) {
                completedCount += 1;
              }

              return {
                date,
                actualPercentage: getRoundedPercentage(
                  completedCount,
                  nextTermStudyItems.length,
                ),
                requiredPercentage: clamp(
                  Math.round((dayIndex / totalWindowDays) * 100),
                  0,
                  100,
                ),
              };
            });

            return {
              points,
              currentActualPercentage:
                points[points.length - 1]?.actualPercentage ?? nextTermProgressPercentage,
              currentRequiredPercentage:
                points[points.length - 1]?.requiredPercentage ?? 0,
            };
          })();

    const activitiesByDay = new Map<number, number>();
    const minutesBySubjectId = new Map<Id<"subjects">, number>();
    let totalRecentMinutes = 0;
    let totalRecentActivities = 0;
    for (const log of recentStudyLogs) {
      if (
        log.eventType === "study_item_completed" ||
        log.eventType === "concept_review"
      ) {
        activitiesByDay.set(
          log.dayBucket,
          (activitiesByDay.get(log.dayBucket) ?? 0) + 1,
        );
        totalRecentActivities += 1;
      }
      minutesBySubjectId.set(
        log.subjectId,
        (minutesBySubjectId.get(log.subjectId) ?? 0) + log.minutesSpent,
      );
      totalRecentMinutes += log.minutesSpent;
    }

    const studyVolumeDays = Array.from({ length: STUDY_VOLUME_DAYS }, (_, index) => {
      const date = today - (STUDY_VOLUME_DAYS - 1 - index) * DAY_MS;
      const activityCount = activitiesByDay.get(date) ?? 0;
      return {
        date,
        activityCount,
        intensity: getHeatmapIntensity(activityCount),
      };
    });

    const configuredWeightSubjects = subjects.filter(
      (subject) => typeof subject.examWeight === "number" && subject.examWeight > 0,
    );
    const totalConfiguredWeight = configuredWeightSubjects.reduce(
      (sum, subject) => sum + (subject.examWeight ?? 0),
      0,
    );
    const effortWeightageSubjects =
      totalConfiguredWeight === 0
        ? []
        : configuredWeightSubjects
            .map((subject) => {
              const studyMinutes = minutesBySubjectId.get(subject._id) ?? 0;
              const studyShare =
                totalRecentMinutes === 0
                  ? 0
                  : (studyMinutes / totalRecentMinutes) * 100;
              const weightShare = ((subject.examWeight ?? 0) / totalConfiguredWeight) * 100;

              return {
                subjectId: subject._id,
                name: subject.name,
                color: subject.color ?? "gray",
                studyMinutes,
                studyShare: Math.round(studyShare),
                weightShare: Math.round(weightShare),
                isUnderStudied: weightShare - studyShare >= EFFORT_UNDER_STUDIED_GAP,
              };
            })
            .sort((left, right) => right.weightShare - left.weightShare);

    return {
      today: {
        date: today,
        totalCount: todoItems.length,
        completedCount: todoItems.filter((item) => item.isCompleted).length,
        tasks: todoItems.slice(0, DASHBOARD_TODO_LIMIT).map((item) => ({
          id: item.id,
          kind: item.kind,
          studyItemId: item.studyItemId,
          conceptId: item.conceptId,
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
      progression,
      studyVolume: {
        days: studyVolumeDays,
        totalActivities: totalRecentActivities,
        activeDays: studyVolumeDays.filter((day) => day.activityCount > 0).length,
      },
      effortWeightage: {
        subjects: effortWeightageSubjects,
        missingWeightCount: subjects.length - configuredWeightSubjects.length,
        hasConfiguredWeights: totalConfiguredWeight > 0,
      },
      subjectProgress,
    };
  },
});

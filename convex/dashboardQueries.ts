import { query, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { v } from "convex/values";
import {
  isLegacyWorkspaceOwner,
  requireCurrentUser,
  type CurrentUser,
} from "./auth";
import {
  DASHBOARD_COMPONENT_KEYS,
  getDashboardComponentSettingKey,
  resolveDashboardComponentVisibility,
} from "./dashboardComponents";
import {
  getDashboardCompletionDayStats,
  getDashboardStudyItemChapterStats,
  getDashboardStudyItemStatsMigrationStatus,
} from "./dashboardStudyItemStats";

const DAY_MS = 86400000;
const DASHBOARD_TODO_LIMIT = 5;
const TRACK_STATUS_TOLERANCE = 5;
const STUDY_VOLUME_DAYS = 90;
const EFFORT_UNDER_STUDIED_GAP = 10;
const MAX_PROGRESSION_CHART_POINTS = 120;

type DashboardTodoItem = {
  id: Id<"todoTasks">;
  kind: "study_item";
  studyItemId: Id<"studyItems">;
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

type TodoCompletionPeriod = "day" | "week" | "month";

function getDhakaDayBucket(timestamp: number) {
  const dhakaOffset = 6 * 60 * 60 * 1000;
  const dhakaTime = new Date(timestamp + dhakaOffset);
  dhakaTime.setUTCHours(0, 0, 0, 0);
  return dhakaTime.getTime() - dhakaOffset;
}

function getDhakaMonthStart(dayBucket: number) {
  const dhakaOffset = 6 * 60 * 60 * 1000;
  const dhakaDate = new Date(dayBucket + dhakaOffset);
  return (
    Date.UTC(dhakaDate.getUTCFullYear(), dhakaDate.getUTCMonth(), 1) -
    dhakaOffset
  );
}

function getTodoCompletionRanges(today: number) {
  const dhakaOffset = 6 * 60 * 60 * 1000;
  const dhakaDate = new Date(today + dhakaOffset);
  const daysSinceMonday = (dhakaDate.getUTCDay() + 6) % 7;
  const weekStart = today - daysSinceMonday * DAY_MS;
  const monthStart = getDhakaMonthStart(today);
  const nextMonthStart =
    Date.UTC(dhakaDate.getUTCFullYear(), dhakaDate.getUTCMonth() + 1, 1) -
    dhakaOffset;

  return {
    day: { startDate: today, endDate: today },
    week: { startDate: weekStart, endDate: weekStart + 6 * DAY_MS },
    month: { startDate: monthStart, endDate: nextMonthStart - DAY_MS },
  } satisfies Record<TodoCompletionPeriod, { startDate: number; endDate: number }>;
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

async function getDashboardSubjects(ctx: QueryCtx, currentUser: CurrentUser) {
  const ownedSubjects = await ctx.db
    .query("subjects")
    .withIndex("by_userId", (q) => q.eq("userId", currentUser._id))
    .collect();

  if (!isLegacyWorkspaceOwner(currentUser)) {
    return ownedSubjects;
  }

  const legacySubjects = await ctx.db
    .query("subjects")
    .withIndex("by_userId", (q) => q.eq("userId", undefined))
    .collect();

  return [...ownedSubjects, ...legacySubjects];
}

async function getDashboardChapters(ctx: QueryCtx, currentUser: CurrentUser) {
  const ownedChapters = await ctx.db
    .query("chapters")
    .withIndex("by_userId", (q) => q.eq("userId", currentUser._id))
    .collect();

  if (!isLegacyWorkspaceOwner(currentUser)) {
    return ownedChapters;
  }

  const legacyChapters = await ctx.db
    .query("chapters")
    .withIndex("by_userId", (q) => q.eq("userId", undefined))
    .collect();

  return [...ownedChapters, ...legacyChapters];
}

async function getDashboardStudyItems(ctx: QueryCtx, currentUser: CurrentUser) {
  const ownedStudyItems = await ctx.db
    .query("studyItems")
    .withIndex("by_userId", (q) => q.eq("userId", currentUser._id))
    .collect();

  if (!isLegacyWorkspaceOwner(currentUser)) {
    return ownedStudyItems;
  }

  const legacyStudyItems = await ctx.db
    .query("studyItems")
    .withIndex("by_userId", (q) => q.eq("userId", undefined))
    .collect();

  return [...ownedStudyItems, ...legacyStudyItems];
}

async function getDashboardStudyItemsByIds(
  ctx: QueryCtx,
  currentUser: CurrentUser,
  studyItemIds: Id<"studyItems">[],
) {
  const uniqueStudyItemIds = Array.from(new Set(studyItemIds));
  const studyItems: Doc<"studyItems">[] = [];

  for (const studyItemId of uniqueStudyItemIds) {
    const studyItem = await ctx.db.get(studyItemId);
    if (
      studyItem &&
      (studyItem.userId === currentUser._id ||
        (studyItem.userId === undefined && isLegacyWorkspaceOwner(currentUser)))
    ) {
      studyItems.push(studyItem);
    }
  }

  return studyItems;
}

async function getDashboardSettingsByKeys(
  ctx: QueryCtx,
  currentUser: CurrentUser,
  keys: string[],
) {
  const ownedSettings = await Promise.all(
    keys.map((key) =>
      ctx.db
        .query("settings")
        .withIndex("by_userId_and_key", (q) =>
          q.eq("userId", currentUser._id).eq("key", key),
        )
        .unique(),
    ),
  );

  if (!isLegacyWorkspaceOwner(currentUser)) {
    return ownedSettings.filter((setting) => setting !== null);
  }

  const legacySettings = await Promise.all(
    keys.map(async (key) => {
      const settings = await ctx.db
        .query("settings")
        .withIndex("by_key", (q) => q.eq("key", key))
        .collect();
      return settings.find((setting) => setting.userId === undefined) ?? null;
    }),
  );

  return [...ownedSettings, ...legacySettings].filter(
    (setting) => setting !== null,
  );
}

async function getDashboardTodoTasks(
  ctx: QueryCtx,
  currentUser: CurrentUser,
  date: number,
) {
  const ownedTodoTasks = await ctx.db
    .query("todoTasks")
    .withIndex("by_userId_and_date", (q) =>
      q.eq("userId", currentUser._id).eq("date", date),
    )
    .collect();

  if (!isLegacyWorkspaceOwner(currentUser)) {
    return ownedTodoTasks;
  }

  const legacyTodoTasks = await ctx.db
    .query("todoTasks")
    .withIndex("by_userId_and_date", (q) =>
      q.eq("userId", undefined).eq("date", date),
    )
    .collect();

  return [...ownedTodoTasks, ...legacyTodoTasks];
}

async function getDashboardTodoTasksForRange(
  ctx: QueryCtx,
  currentUser: CurrentUser,
  startDate: number,
  endDate: number,
) {
  const ownedTodoTasks = await ctx.db
    .query("todoTasks")
    .withIndex("by_userId_and_date", (q) =>
      q
        .eq("userId", currentUser._id)
        .gte("date", startDate)
        .lte("date", endDate),
    )
    .collect();

  if (!isLegacyWorkspaceOwner(currentUser)) {
    return ownedTodoTasks;
  }

  const legacyTodoTasks = await ctx.db
    .query("todoTasks")
    .withIndex("by_userId_and_date", (q) =>
      q
        .eq("userId", undefined)
        .gte("date", startDate)
        .lte("date", endDate),
    )
    .collect();

  return [...ownedTodoTasks, ...legacyTodoTasks];
}

async function getDashboardTodoCompletion(
  ctx: QueryCtx,
  currentUser: CurrentUser,
  today: number,
) {
  const ranges = getTodoCompletionRanges(today);
  const taskGroups = await Promise.all([
    getDashboardTodoTasksForRange(
      ctx,
      currentUser,
      ranges.week.startDate,
      ranges.week.endDate,
    ),
    getDashboardTodoTasksForRange(
      ctx,
      currentUser,
      ranges.month.startDate,
      ranges.month.endDate,
    ),
  ]);
  const todoTaskById = new Map<Id<"todoTasks">, Doc<"todoTasks">>();
  for (const taskGroup of taskGroups) {
    for (const task of taskGroup) {
      todoTaskById.set(task._id, task);
    }
  }
  const todoTasks = Array.from(todoTaskById.values());
  const studyItemIds = Array.from(
    new Set(
      todoTasks
        .map((task) => task.studyItemId)
        .filter((studyItemId): studyItemId is Id<"studyItems"> =>
          studyItemId !== undefined,
        ),
    ),
  );
  const conceptIds = Array.from(
    new Set(
      todoTasks
        .map((task) => task.conceptId)
        .filter((conceptId): conceptId is Id<"concepts"> =>
          conceptId !== undefined,
        ),
    ),
  );
  const [studyItems, concepts] = await Promise.all([
    Promise.all(studyItemIds.map((studyItemId) => ctx.db.get(studyItemId))),
    Promise.all(conceptIds.map((conceptId) => ctx.db.get(conceptId))),
  ]);
  const studyItemById = new Map(
    studyItems
      .filter((item): item is Doc<"studyItems"> => item !== null)
      .filter(
        (item) =>
          item.userId === currentUser._id ||
          (item.userId === undefined && isLegacyWorkspaceOwner(currentUser)),
      )
      .map((item) => [item._id, item]),
  );
  const conceptById = new Map(
    concepts
      .filter((concept): concept is Doc<"concepts"> => concept !== null)
      .filter(
        (concept) =>
          concept.userId === currentUser._id ||
          (concept.userId === undefined && isLegacyWorkspaceOwner(currentUser)),
      )
      .map((concept) => [concept._id, concept]),
  );

  const getTaskCompletion = (task: (typeof todoTasks)[number]) => {
    const taskKind = task.kind ?? "study_item";
    if (taskKind === "custom") {
      return task.isCompleted ?? false;
    }

    if (taskKind === "concept_review") {
      if (!task.conceptId) {
        return null;
      }
      const concept = conceptById.get(task.conceptId);
      if (!concept) {
        return null;
      }
      return (
        concept.lastReviewedAt !== undefined &&
        getDhakaDayBucket(concept.lastReviewedAt) === task.date
      );
    }

    if (!task.studyItemId) {
      return null;
    }
    const studyItem = studyItemById.get(task.studyItemId);
    return studyItem?.isCompleted ?? null;
  };

  return Object.fromEntries(
    (Object.entries(ranges) as Array<
      [TodoCompletionPeriod, { startDate: number; endDate: number }]
    >).map(([period, range]) => {
      let totalCount = 0;
      let completedCount = 0;

      for (const task of todoTasks) {
        if (task.date < range.startDate || task.date > range.endDate) {
          continue;
        }
        const isCompleted = getTaskCompletion(task);
        if (isCompleted === null) {
          continue;
        }
        totalCount += 1;
        if (isCompleted) {
          completedCount += 1;
        }
      }

      return [
        period,
        {
          startDate: range.startDate,
          endDate: range.endDate,
          totalCount,
          completedCount,
          progressPercentage: getRoundedPercentage(completedCount, totalCount),
        },
      ];
    }),
  ) as Record<
    TodoCompletionPeriod,
    {
      startDate: number;
      endDate: number;
      totalCount: number;
      completedCount: number;
      progressPercentage: number;
    }
  >;
}

async function getDashboardStudyLogs(
  ctx: QueryCtx,
  currentUser: CurrentUser,
  startDate: number,
  endDate: number,
) {
  const ownedStudyLogs = await ctx.db
    .query("studyLogs")
    .withIndex("by_userId_and_dayBucket", (q) =>
      q
        .eq("userId", currentUser._id)
        .gte("dayBucket", startDate)
        .lte("dayBucket", endDate),
    )
    .collect();

  if (!isLegacyWorkspaceOwner(currentUser)) {
    return ownedStudyLogs;
  }

  const legacyStudyLogs = await ctx.db
    .query("studyLogs")
    .withIndex("by_userId_and_dayBucket", (q) =>
      q
        .eq("userId", undefined)
        .gte("dayBucket", startDate)
        .lte("dayBucket", endDate),
    )
    .collect();

  return [...ownedStudyLogs, ...legacyStudyLogs];
}

export const getDashboardPageData = query({
  args: { today: v.number() },
  handler: async (ctx, args) => {
    const currentUser = await requireCurrentUser(ctx);
    const today = args.today;
    const recentStartDate = today - (STUDY_VOLUME_DAYS - 1) * DAY_MS;

    const settings = await getDashboardSettingsByKeys(ctx, currentUser, [
      "termStartDate",
      "nextTermExamDate",
      ...DASHBOARD_COMPONENT_KEYS.map((key) =>
        getDashboardComponentSettingKey(key),
      ),
    ]);
    const componentVisibility =
      resolveDashboardComponentVisibility(settings);
    const needsTodo = componentVisibility.todayTodo;
    const needsTodoCompletion = componentVisibility.todoCompletion;
    const needsWorkload =
      componentVisibility.syllabusCompletion ||
      componentVisibility.nextTermTime ||
      componentVisibility.progressionRate ||
      componentVisibility.subjectProgress;
    const needsStudyLogs =
      componentVisibility.studyVolume || componentVisibility.effortWeightage;
    const needsSubjects =
      needsTodo || needsWorkload || componentVisibility.effortWeightage;
    const needsChapters = needsTodo || needsWorkload;

    const [
      subjects,
      chapters,
      todayTodoTasks,
      todoCompletion,
      recentStudyLogs,
      summaryStats,
      summaryMigrationStatus,
    ] = await Promise.all([
      needsSubjects ? getDashboardSubjects(ctx, currentUser) : Promise.resolve([]),
      needsChapters ? getDashboardChapters(ctx, currentUser) : Promise.resolve([]),
      needsTodo
        ? getDashboardTodoTasks(ctx, currentUser, today)
        : Promise.resolve([]),
      needsTodoCompletion
        ? getDashboardTodoCompletion(ctx, currentUser, today)
        : Promise.resolve(null),
      needsStudyLogs
        ? getDashboardStudyLogs(ctx, currentUser, recentStartDate, today)
        : Promise.resolve([]),
      needsWorkload
        ? getDashboardStudyItemChapterStats(ctx, currentUser)
        : Promise.resolve([]),
      needsWorkload
        ? getDashboardStudyItemStatsMigrationStatus(ctx, currentUser._id)
        : Promise.resolve(null),
    ]);

    const settingByKey = new Map(settings.map((setting) => [setting.key, setting]));
    const subjectById = new Map(subjects.map((subject) => [subject._id, subject]));
    const chapterById = new Map(chapters.map((chapter) => [chapter._id, chapter]));
    const nextTermChapterIds = new Set(
      chapters.filter((chapter) => chapter.inNextTerm).map((chapter) => chapter._id),
    );
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

    const shouldUseSummaryStats = summaryMigrationStatus?.status === "completed";
    const fallbackStudyItems = !needsWorkload || shouldUseSummaryStats
      ? null
      : await getDashboardStudyItems(ctx, currentUser);
    const summaryStatByChapterId = new Map(
      summaryStats.map((stat) => [stat.chapterId, stat]),
    );

    const chapterCountStats = chapters.map((chapter) => {
      const summaryStat = summaryStatByChapterId.get(chapter._id);
      if (summaryStat) {
        return {
          chapterId: chapter._id,
          subjectId: chapter.subjectId,
          totalItems: summaryStat.totalItems,
          completedItems: summaryStat.completedItems,
        };
      }

      const chapterItems =
        fallbackStudyItems?.filter((item) => item.chapterId === chapter._id) ?? [];
      return {
        chapterId: chapter._id,
        subjectId: chapter.subjectId,
        totalItems: chapterItems.length,
        completedItems: chapterItems.filter((item) => item.isCompleted).length,
      };
    });

    const allTotalItems = chapterCountStats.reduce(
      (sum, stat) => sum + stat.totalItems,
      0,
    );
    const allCompletedItems = chapterCountStats.reduce(
      (sum, stat) => sum + stat.completedItems,
      0,
    );
    const nextTermStats = chapterCountStats.filter((stat) =>
      nextTermChapterIds.has(stat.chapterId),
    );
    const nextTermTotalItems = nextTermStats.reduce(
      (sum, stat) => sum + stat.totalItems,
      0,
    );
    const nextTermCompletedItems = nextTermStats.reduce(
      (sum, stat) => sum + stat.completedItems,
      0,
    );
    const nextTermProgressPercentage = getRoundedPercentage(
      nextTermCompletedItems,
      nextTermTotalItems,
    );

    const subjectProgress = componentVisibility.subjectProgress
      ? subjects
          .map((subject) => {
            const subjectStats = nextTermStats.filter(
              (stat) => stat.subjectId === subject._id,
            );
            const totalItems = subjectStats.reduce(
              (sum, stat) => sum + stat.totalItems,
              0,
            );
            const completedItems = subjectStats.reduce(
              (sum, stat) => sum + stat.completedItems,
              0,
            );

            return {
              subjectId: subject._id,
              name: subject.name,
              color: subject.color ?? "gray",
              icon: subject.icon ?? "menu_book",
              totalItems,
              completedItems,
              progressPercentage: getRoundedPercentage(
                completedItems,
                totalItems,
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
          })
      : null;

    const todoStudyItems = needsTodo
      ? await getDashboardStudyItemsByIds(
          ctx,
          currentUser,
          todayTodoTasks
            .map((todoTask) => todoTask.studyItemId)
            .filter((studyItemId): studyItemId is Id<"studyItems"> =>
              Boolean(studyItemId),
            ),
        )
      : [];
    const studyItemById = new Map(
      todoStudyItems.map((studyItem) => [studyItem._id, studyItem]),
    );

    const todoCandidates = todayTodoTasks.map((todoTask) => {
      if ((todoTask.kind ?? "study_item") !== "study_item" || !todoTask.studyItemId) {
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

    const urgency =
      !componentVisibility.nextTermTime ||
      termStartDate === undefined ||
      nextTermExamDate === undefined
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
      !componentVisibility.progressionRate ||
      termStartDate === undefined ||
      nextTermExamDate === undefined
        ? null
        : (() => {
            const elapsedDays = Math.max(
              1,
              Math.ceil((today - termStartDate) / DAY_MS) + 1,
            );
            const remainingItems = Math.max(
              0,
              nextTermTotalItems - nextTermCompletedItems,
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
      !componentVisibility.progressionRate ||
      termStartDate === undefined ||
      nextTermExamDate === undefined
        ? null
        : await (async () => {
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
            const completionDays: number[] = [];

            if (shouldUseSummaryStats) {
              const completionDayStats = await getDashboardCompletionDayStats(ctx, {
                userId: currentUser._id,
                startDate: termStartDate,
                endDate: chartEndDate,
              });

              for (const stat of completionDayStats) {
                if (!nextTermChapterIds.has(stat.chapterId)) {
                  continue;
                }
                const completionDay =
                  stat.dayBucket === 0
                    ? termStartDate
                    : Math.max(termStartDate, stat.dayBucket);
                for (let index = 0; index < stat.completedCount; index += 1) {
                  completionDays.push(completionDay);
                }
              }
            } else {
              for (const item of fallbackStudyItems ?? []) {
                if (item.isCompleted && nextTermChapterIds.has(item.chapterId)) {
                  completionDays.push(getCompletionDay(item, termStartDate));
                }
              }
            }

            completionDays.sort((left, right) => left - right);
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
                  nextTermTotalItems,
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
      componentVisibility,
      today: componentVisibility.todayTodo
        ? {
            date: today,
            totalCount: todoItems.length,
            completedCount: todoItems.filter((item) => item.isCompleted).length,
            tasks: todoItems.slice(0, DASHBOARD_TODO_LIMIT).map((item) => ({
              id: item.id,
              kind: item.kind,
              studyItemId: item.studyItemId,
              title: item.title,
              subjectName: item.subjectName,
              chapterName: item.chapterName,
              subjectColor: item.subjectColor,
              durationMinutes: item.durationMinutes,
              startTimeMinutes: item.startTimeMinutes,
              isCompleted: item.isCompleted,
            })),
          }
        : null,
      todoCompletion,
      termDates: {
        termStartDate,
        nextTermExamDate,
        isConfigured: hasTermDates,
      },
      completion:
        componentVisibility.syllabusCompletion ||
        componentVisibility.nextTermTime ||
        componentVisibility.progressionRate
          ? {
              nextTerm: {
                completedItems: nextTermCompletedItems,
                totalItems: nextTermTotalItems,
                progressPercentage: nextTermProgressPercentage,
              },
              allSyllabus: {
                completedItems: allCompletedItems,
                totalItems: allTotalItems,
                progressPercentage: getRoundedPercentage(
                  allCompletedItems,
                  allTotalItems,
                ),
              },
            }
          : null,
      urgency,
      pace,
      progression,
      studyVolume: componentVisibility.studyVolume
        ? {
            days: studyVolumeDays,
            totalActivities: totalRecentActivities,
            activeDays: studyVolumeDays.filter((day) => day.activityCount > 0).length,
          }
        : null,
      effortWeightage: componentVisibility.effortWeightage
        ? {
            subjects: effortWeightageSubjects,
            missingWeightCount: subjects.length - configuredWeightSubjects.length,
            hasConfiguredWeights: totalConfiguredWeight > 0,
          }
        : null,
      subjectProgress,
    };
  },
});

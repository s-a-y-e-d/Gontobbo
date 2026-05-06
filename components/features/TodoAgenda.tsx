"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import TodoAgendaAddTaskModal from "./TodoAgendaAddTaskModal";
import TodoCalendarView from "./TodoCalendarView";
import TodoAgendaDateStrip from "./TodoAgendaDateStrip";
import TodoAgendaDaySection from "./TodoAgendaDaySection";
import { TodoSkeleton } from "./LoadingSkeletons";
import { TodoAgendaDay } from "./todoAgendaTypes";
import {
  buildDayHeading,
  DAY_COUNT,
  DAY_MS,
  formatDayNumber,
  formatMonthLabel,
  formatShortWeekday,
  getDhakaDayBucket,
} from "./todoAgendaTime";

export default function TodoAgenda() {
  const [now] = useState(() => Date.now());
  const today = getDhakaDayBucket(now);
  const [rangeStartDate, setRangeStartDate] = useState(today);
  const [selectedDate, setSelectedDate] = useState(today);
  const [viewMode, setViewMode] = useState<"agenda" | "calendar">("agenda");
  const [calendarMode, setCalendarMode] = useState<"day" | "week">("week");
  const [isAddTaskModalOpen, setIsAddTaskModalOpen] = useState(false);
  const [addTaskDefaults, setAddTaskDefaults] = useState<{
    date: number;
    startTimeMinutes?: number;
    durationMinutes?: number;
  } | null>(null);
  const backfillStudyItemSearchText = useMutation(
    api.mutations.backfillStudyItemSearchText,
  );
  const agenda = useQuery(api.todoQueries.getTodoAgenda, {
    startDate: rangeStartDate,
    days: DAY_COUNT,
  });

  useEffect(() => {
    let isCancelled = false;

    const syncSearchTextInBatches = async (cursor: string | null = null) => {
      const result = await backfillStudyItemSearchText({ cursor });

      if (!isCancelled && !result.isDone) {
        await syncSearchTextInBatches(result.continueCursor);
      }
    };

    void syncSearchTextInBatches().catch((error) => {
      console.error("Failed to sync study item search text:", error);
    });

    return () => {
      isCancelled = true;
    };
  }, [backfillStudyItemSearchText]);

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("gontobbo:todo-view-mode", { detail: viewMode }),
    );

    return () => {
      window.dispatchEvent(
        new CustomEvent("gontobbo:todo-view-mode", { detail: "agenda" }),
      );
    };
  }, [viewMode]);

  if (!agenda) {
    return <TodoSkeleton />;
  }

  const days: TodoAgendaDay[] = agenda.days.map((day) => ({
    ...day,
    isToday: day.date === today,
    isSelected: day.date === selectedDate,
    dayNumber: formatDayNumber(day.date),
    shortWeekday: formatShortWeekday(day.date),
    heading: buildDayHeading(day.date, today),
  }));

  const selectedDay =
    days.find((day) => day.date === selectedDate) ?? days[0] ?? null;

  const handleGoToPreviousRange = () => {
    setRangeStartDate((current) => current - DAY_COUNT * DAY_MS);
    setSelectedDate((current) => current - DAY_COUNT * DAY_MS);
  };

  const handleGoToToday = () => {
    setRangeStartDate(today);
    setSelectedDate(today);
  };

  const handleGoToNextRange = () => {
    setRangeStartDate((current) => current + DAY_COUNT * DAY_MS);
    setSelectedDate((current) => current + DAY_COUNT * DAY_MS);
  };

  const openAddTaskModal = (defaults?: {
    date?: number;
    startTimeMinutes?: number;
    durationMinutes?: number;
  }) => {
    const date = defaults?.date ?? selectedDay?.date ?? selectedDate;
    setSelectedDate(date);
    setAddTaskDefaults({
      date,
      startTimeMinutes: defaults?.startTimeMinutes,
      durationMinutes: defaults?.durationMinutes,
    });
    setIsAddTaskModalOpen(true);
  };

  const addTaskDate = addTaskDefaults?.date ?? selectedDay?.date ?? selectedDate;
  const addTaskDay = days.find((day) => day.date === addTaskDate) ?? selectedDay;

  return (
    <div
      className={`mx-auto w-full ${
        viewMode === "agenda" ? "max-w-4xl" : "max-w-none"
      }`}
    >
      {viewMode === "agenda" ? (
        <TodoAgendaDateStrip
          days={days}
          monthLabel={formatMonthLabel(selectedDate)}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          onSelectDate={setSelectedDate}
          onGoToPreviousRange={handleGoToPreviousRange}
          onGoToToday={handleGoToToday}
          onGoToNextRange={handleGoToNextRange}
        />
      ) : null}

      <div className={viewMode === "calendar" ? "" : "pb-8"}>
        {viewMode === "agenda" && selectedDay ? (
          <TodoAgendaDaySection
            day={selectedDay}
            onAddTask={() => openAddTaskModal()}
          />
        ) : null}
        {viewMode === "calendar" ? (
          <TodoCalendarView
            days={days}
            monthLabel={formatMonthLabel(selectedDate)}
            selectedDate={selectedDate}
            mode={calendarMode}
            viewMode={viewMode}
            onModeChange={setCalendarMode}
            onViewModeChange={setViewMode}
            onSelectDate={setSelectedDate}
            onGoToPreviousRange={handleGoToPreviousRange}
            onGoToToday={handleGoToToday}
            onGoToNextRange={handleGoToNextRange}
            onCreateTask={(date, startTimeMinutes) =>
              openAddTaskModal({
                date,
                startTimeMinutes,
                durationMinutes: 60,
              })
            }
          />
        ) : null}
      </div>

      {addTaskDay ? (
        <TodoAgendaAddTaskModal
          key={`${addTaskDate}-${addTaskDefaults?.startTimeMinutes ?? "none"}-${isAddTaskModalOpen ? "open" : "closed"}`}
          isOpen={isAddTaskModalOpen}
          onClose={() => {
            setIsAddTaskModalOpen(false);
            setAddTaskDefaults(null);
          }}
          date={addTaskDate}
          dayHeading={addTaskDay.heading}
          initialStartTimeMinutes={addTaskDefaults?.startTimeMinutes}
          initialDurationMinutes={addTaskDefaults?.durationMinutes}
        />
      ) : null}
    </div>
  );
}

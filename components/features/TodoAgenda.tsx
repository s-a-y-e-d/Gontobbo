"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import TodoAgendaAddTaskModal from "./TodoAgendaAddTaskModal";
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
  const [isAddTaskModalOpen, setIsAddTaskModalOpen] = useState(false);
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

  return (
    <div className="mx-auto w-full max-w-4xl">
      <TodoAgendaDateStrip
        days={days}
        monthLabel={formatMonthLabel(selectedDate)}
        onSelectDate={setSelectedDate}
        onGoToPreviousRange={handleGoToPreviousRange}
        onGoToToday={handleGoToToday}
        onGoToNextRange={handleGoToNextRange}
      />

      <div className="pb-8">
        {selectedDay ? (
          <TodoAgendaDaySection
            day={selectedDay}
            onAddTask={() => setIsAddTaskModalOpen(true)}
          />
        ) : null}
      </div>

      {selectedDay ? (
        <TodoAgendaAddTaskModal
          key={`${selectedDay.date}-${isAddTaskModalOpen ? "open" : "closed"}`}
          isOpen={isAddTaskModalOpen}
          onClose={() => setIsAddTaskModalOpen(false)}
          date={selectedDay.date}
          dayHeading={selectedDay.heading}
        />
      ) : null}
    </div>
  );
}

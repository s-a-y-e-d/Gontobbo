"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import TodoAgendaEditTaskModal from "./TodoAgendaEditTaskModal";
import { getSubjectTheme } from "./subjectTheme";
import { TodoAgendaDay, TodoAgendaTask } from "./todoAgendaTypes";
import {
  formatClockTime,
  formatDayNumber,
  formatShortWeekday,
  formatTimeRangeLabel,
  getDhakaDayBucket,
} from "./todoAgendaTime";

type CalendarMode = "day" | "week";
type TodoViewMode = "agenda" | "calendar";

type TodoCalendarViewProps = {
  days: TodoAgendaDay[];
  monthLabel: string;
  selectedDate: number;
  mode: CalendarMode;
  viewMode: TodoViewMode;
  onModeChange: (mode: CalendarMode) => void;
  onViewModeChange: (mode: TodoViewMode) => void;
  onSelectDate: (date: number) => void;
  onGoToPreviousRange: () => void;
  onGoToToday: () => void;
  onGoToNextRange: () => void;
  onCreateTask: (
    date: number,
    startTimeMinutes: number,
    durationMinutes: number,
  ) => void;
};

type DragMode = "move" | "resize-start" | "resize-end";

type DragState = {
  task: TodoAgendaTask;
  mode: DragMode;
  pointerId: number;
  originX: number;
  originY: number;
  originalDate: number;
  originalStart: number;
  originalDuration: number;
  previewDate: number;
  previewStart: number;
  previewDuration: number;
  hasMoved: boolean;
};

type CreateSelectionState = {
  pointerId: number;
  originX: number;
  originY: number;
  date: number;
  anchorMinutes: number;
  previewStart: number;
  previewDuration: number;
  hasMoved: boolean;
};

type LaidOutTask = {
  task: TodoAgendaTask;
  lane: number;
  laneCount: number;
};

const HOUR_HEIGHT = 64;
const DAY_HEIGHT = HOUR_HEIGHT * 24;
const MIN_EVENT_HEIGHT = 28;
const SNAP_MINUTES = 15;
const DEFAULT_DROP_DURATION = 60;
const TIME_GUTTER_WIDTH = 72;
const DAY_COLUMN_MIN_WIDTH = 220;

export default function TodoCalendarView({
  days,
  monthLabel,
  selectedDate,
  mode,
  viewMode,
  onModeChange,
  onViewModeChange,
  onSelectDate,
  onGoToPreviousRange,
  onGoToToday,
  onGoToNextRange,
  onCreateTask,
}: TodoCalendarViewProps) {
  const visibleDays =
    mode === "day"
      ? days.filter((day) => day.date === selectedDate).slice(0, 1)
      : days;
  const calendarDays = visibleDays.length > 0 ? visibleDays : days.slice(0, 1);
  const gridTemplateColumns = `${TIME_GUTTER_WIDTH}px repeat(${calendarDays.length}, minmax(${DAY_COLUMN_MIN_WIDTH}px, 1fr))`;
  const calendarWidth =
    mode === "week"
      ? `${Math.max(calendarDays.length * DAY_COLUMN_MIN_WIDTH + TIME_GUTTER_WIDTH, 900)}px`
      : "100%";
  const timedGridRef = useRef<HTMLDivElement | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [editingTask, setEditingTask] = useState<TodoAgendaTask | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [createSelectionState, setCreateSelectionState] =
    useState<CreateSelectionState | null>(null);
  const [suppressClickUntil, setSuppressClickUntil] = useState(0);
  const updateTodoTaskSchedule = useMutation(api.mutations.updateTodoTaskSchedule);
  const updateCustomTodoTask = useMutation(api.mutations.updateCustomTodoTask);
  const today = getDhakaDayBucket(now);
  const currentTimeMinutes = getDhakaMinutes(now);

  const unscheduledTasksByDate = useMemo(() => {
    const tasksByDate = new Map<number, TodoAgendaTask[]>();
    for (const day of calendarDays) {
      tasksByDate.set(
        day.date,
        day.tasks.filter(
          (task) =>
            task.startTimeMinutes === undefined &&
            dragState?.task.id !== task.id,
        ),
      );
    }
    return tasksByDate;
  }, [calendarDays, dragState]);

  useEffect(() => {
    const intervalId = window.setInterval(() => setNow(Date.now()), 60000);
    return () => window.clearInterval(intervalId);
  }, []);

  const getPointerTarget = useCallback(
    (clientX: number, clientY: number) => {
      const rect = timedGridRef.current?.getBoundingClientRect();
      if (
        !rect ||
        clientX < rect.left ||
        clientX > rect.right ||
        clientY < rect.top ||
        clientY > rect.bottom
      ) {
        return null;
      }

      const dayWidth = rect.width / calendarDays.length;
      const dayIndex = Math.min(
        calendarDays.length - 1,
        Math.max(0, Math.floor((clientX - rect.left) / dayWidth)),
      );
      const day = calendarDays[dayIndex];
      if (!day) {
        return null;
      }

      const rawMinutes = ((clientY - rect.top) / HOUR_HEIGHT) * 60;
      return {
        date: day.date,
        startTimeMinutes: Math.min(1440, Math.max(0, snapMinutes(rawMinutes))),
      };
    },
    [calendarDays],
  );

  const saveDraggedTask = useCallback(
    async (state: DragState) => {
      if (state.task.kind === "custom") {
        await updateCustomTodoTask({
          todoTaskId: state.task.id as Id<"todoTasks">,
          title: state.task.title,
          date: state.previewDate,
          startTimeMinutes: state.previewStart,
          durationMinutes: state.previewDuration,
          customColor: state.task.customColor ?? "gray",
        });
        return;
      }

      await updateTodoTaskSchedule({
        todoTaskId: state.task.id as Id<"todoTasks">,
        date: state.previewDate,
        startTimeMinutes: state.previewStart,
        durationMinutes: state.previewDuration,
      });
    },
    [updateCustomTodoTask, updateTodoTaskSchedule],
  );

  useEffect(() => {
    if (!dragState) {
      return;
    }

    const getNextDragState = (event: PointerEvent): DragState => {
      if (event.pointerId !== dragState.pointerId) {
        return dragState;
      }

      const target = getPointerTarget(event.clientX, event.clientY);
      const deltaMinutes = snapMinutes(
        ((event.clientY - dragState.originY) / HOUR_HEIGHT) * 60,
      );
      const hasMoved =
        dragState.hasMoved ||
        Math.abs(event.clientX - dragState.originX) > 3 ||
        Math.abs(event.clientY - dragState.originY) > 3;

      if (dragState.mode === "resize-end") {
        return {
          ...dragState,
          hasMoved,
          previewDuration: clampDuration(
            snapMinutes(dragState.originalDuration + deltaMinutes),
            dragState.previewStart,
          ),
        };
      }

      if (dragState.mode === "resize-start") {
        const originalEnd = dragState.originalStart + dragState.originalDuration;
        const nextStart = Math.min(
          originalEnd - SNAP_MINUTES,
          Math.max(0, snapMinutes(dragState.originalStart + deltaMinutes)),
        );

        return {
          ...dragState,
          hasMoved,
          previewStart: nextStart,
          previewDuration: clampDuration(originalEnd - nextStart, nextStart),
        };
      }

      if (!target) {
        return { ...dragState, hasMoved };
      }

      const maxStart = 1440 - dragState.originalDuration;
      return {
        ...dragState,
        hasMoved,
        previewDate: target.date,
        previewStart: Math.min(maxStart, Math.max(0, target.startTimeMinutes)),
      };
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (event.pointerId !== dragState.pointerId) {
        return;
      }

      setDragState(getNextDragState(event));
    };

    const handlePointerUp = (event: PointerEvent) => {
      if (event.pointerId !== dragState.pointerId) {
        return;
      }

      const finalState = getNextDragState(event);
      setDragState(null);

      if (!finalState.hasMoved) {
        return;
      }

      setSuppressClickUntil(Date.now() + 250);
      void saveDraggedTask(finalState).catch((error) => {
        console.error("Failed to update todo from calendar:", error);
      });
    };

    document.addEventListener("pointermove", handlePointerMove);
    document.addEventListener("pointerup", handlePointerUp);
    document.addEventListener("pointercancel", handlePointerUp);
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor =
      dragState.mode === "move" ? "grabbing" : "ns-resize";
    document.body.style.userSelect = "none";

    return () => {
      document.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("pointerup", handlePointerUp);
      document.removeEventListener("pointercancel", handlePointerUp);
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
    };
  }, [dragState, getPointerTarget, saveDraggedTask]);

  useEffect(() => {
    if (!createSelectionState) {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      if (event.pointerId !== createSelectionState.pointerId) {
        return;
      }

      const target = getPointerTarget(event.clientX, event.clientY);
      const targetMinutes =
        target?.date === createSelectionState.date
          ? target.startTimeMinutes
          : getPointerMinutesInOriginDay(
              event.clientY,
              createSelectionState.originY,
              createSelectionState.anchorMinutes,
            );
      const range = buildCreateSelectionRange({
        anchorMinutes: createSelectionState.anchorMinutes,
        targetMinutes,
      });
      const hasMoved =
        createSelectionState.hasMoved ||
        Math.abs(event.clientX - createSelectionState.originX) > 3 ||
        Math.abs(event.clientY - createSelectionState.originY) > 3;

      setCreateSelectionState({
        ...createSelectionState,
        ...range,
        hasMoved,
      });
    };

    const handlePointerUp = (event: PointerEvent) => {
      if (event.pointerId !== createSelectionState.pointerId) {
        return;
      }

      const target = getPointerTarget(event.clientX, event.clientY);
      const targetMinutes =
        target?.date === createSelectionState.date
          ? target.startTimeMinutes
          : getPointerMinutesInOriginDay(
              event.clientY,
              createSelectionState.originY,
              createSelectionState.anchorMinutes,
            );
      const finalRange = buildCreateSelectionRange({
        anchorMinutes: createSelectionState.anchorMinutes,
        targetMinutes,
      });
      const finalState = {
        ...createSelectionState,
        ...finalRange,
        hasMoved:
          createSelectionState.hasMoved ||
          Math.abs(event.clientX - createSelectionState.originX) > 3 ||
          Math.abs(event.clientY - createSelectionState.originY) > 3,
      };
      setCreateSelectionState(null);
      setSuppressClickUntil(Date.now() + 250);

      onSelectDate(finalState.date);

      if (!finalState.hasMoved) {
        onCreateTask(
          finalState.date,
          Math.min(1440 - DEFAULT_DROP_DURATION, finalState.anchorMinutes),
          DEFAULT_DROP_DURATION,
        );
        return;
      }

      onCreateTask(
        finalState.date,
        finalState.previewStart,
        finalState.previewDuration,
      );
    };

    document.addEventListener("pointermove", handlePointerMove);
    document.addEventListener("pointerup", handlePointerUp);
    document.addEventListener("pointercancel", handlePointerUp);

    return () => {
      document.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("pointerup", handlePointerUp);
      document.removeEventListener("pointercancel", handlePointerUp);
    };
  }, [createSelectionState, getPointerTarget, onCreateTask, onSelectDate]);

  const startCreateSelection = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || Date.now() < suppressClickUntil) {
      return;
    }

    const target = getPointerTarget(event.clientX, event.clientY);
    if (!target) {
      return;
    }

    event.preventDefault();

    setCreateSelectionState({
      pointerId: event.pointerId,
      originX: event.clientX,
      originY: event.clientY,
      date: target.date,
      anchorMinutes: target.startTimeMinutes,
      ...buildCreateSelectionRange({
        anchorMinutes: target.startTimeMinutes,
        targetMinutes: target.startTimeMinutes + SNAP_MINUTES,
      }),
      hasMoved: false,
    });
  };

  const startDrag = (
    event: React.PointerEvent,
    task: TodoAgendaTask,
    date: number,
    dragMode: DragMode,
  ) => {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    const startTime = task.startTimeMinutes ?? 0;
    setDragState({
      task,
      mode: dragMode,
      pointerId: event.pointerId,
      originX: event.clientX,
      originY: event.clientY,
      originalDate: date,
      originalStart: startTime,
      originalDuration: task.durationMinutes,
      previewDate: date,
      previewStart: startTime,
      previewDuration: task.durationMinutes,
      hasMoved: false,
    });
  };

  const startUnscheduledDrag = (
    event: React.PointerEvent,
    task: TodoAgendaTask,
    date: number,
  ) => {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    setDragState({
      task,
      mode: "move",
      pointerId: event.pointerId,
      originX: event.clientX,
      originY: event.clientY,
      originalDate: date,
      originalStart: 0,
      originalDuration: task.durationMinutes || DEFAULT_DROP_DURATION,
      previewDate: date,
      previewStart: 0,
      previewDuration: task.durationMinutes || DEFAULT_DROP_DURATION,
      hasMoved: false,
    });
  };

  return (
    <section className="h-[calc(100vh-4.75rem)] bg-background md:h-screen">
      <div className="flex h-full flex-col bg-background">
        <CalendarToolbar
          monthLabel={monthLabel}
          calendarMode={mode}
          viewMode={viewMode}
          onCalendarModeChange={onModeChange}
          onViewModeChange={onViewModeChange}
          onGoToPreviousRange={onGoToPreviousRange}
          onGoToToday={onGoToToday}
          onGoToNextRange={onGoToNextRange}
        />

        <div className="min-h-0 flex-1 overflow-hidden border-t border-border-subtle bg-pure-white">
          <div className="h-full overflow-x-auto">
            <div
              className="flex h-full min-w-full flex-col"
              style={{ width: calendarWidth }}
            >
              <div className="overflow-y-hidden [scrollbar-gutter:stable]">
                <CalendarGridHeader
                  calendarDays={calendarDays}
                  selectedDate={selectedDate}
                  today={today}
                  gridTemplateColumns={gridTemplateColumns}
                  unscheduledTasksByDate={unscheduledTasksByDate}
                  onSelectDate={onSelectDate}
                  onModeChange={onModeChange}
                  onEdit={(task) => {
                    if (Date.now() >= suppressClickUntil) {
                      setEditingTask(task);
                    }
                  }}
                  onPointerDown={startUnscheduledDrag}
                />
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]">
                <div className="grid" style={{ gridTemplateColumns }}>
                  <TimeGutter />
                  <div
                    ref={timedGridRef}
                    role="presentation"
                    onPointerDown={startCreateSelection}
                    className="relative grid cursor-crosshair"
                    style={{
                      gridColumn: "2 / -1",
                      height: DAY_HEIGHT,
                      gridTemplateColumns: `repeat(${calendarDays.length}, minmax(${DAY_COLUMN_MIN_WIDTH}px, 1fr))`,
                    }}
                  >
                    {calendarDays.map((day) => (
                      <CalendarDayColumn
                        key={day.date}
                        day={day}
                        today={today}
                        currentTimeMinutes={currentTimeMinutes}
                        dragState={dragState}
                        createSelectionState={createSelectionState}
                        onEventClick={(task) => {
                          if (Date.now() >= suppressClickUntil) {
                            setEditingTask(task);
                          }
                        }}
                        onPointerDown={startDrag}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {editingTask ? (
        <TodoAgendaEditTaskModal
          isOpen={true}
          onClose={() => setEditingTask(null)}
          task={editingTask}
        />
      ) : null}
    </section>
  );
}

function CalendarToolbar({
  monthLabel,
  calendarMode,
  viewMode,
  onCalendarModeChange,
  onViewModeChange,
  onGoToPreviousRange,
  onGoToToday,
  onGoToNextRange,
}: {
  monthLabel: string;
  calendarMode: CalendarMode;
  viewMode: TodoViewMode;
  onCalendarModeChange: (mode: CalendarMode) => void;
  onViewModeChange: (mode: TodoViewMode) => void;
  onGoToPreviousRange: () => void;
  onGoToToday: () => void;
  onGoToNextRange: () => void;
}) {
  return (
    <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border-subtle bg-pure-white px-3 py-3 md:px-5">
      <div className="flex min-w-0 items-center gap-2">
        <div className="flex items-center rounded-full border border-border-subtle bg-pure-white p-1">
          <button
            type="button"
            onClick={onGoToPreviousRange}
            className="flex h-9 w-9 items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-gray-100 hover:text-on-surface"
            aria-label="আগের দিনগুলো"
          >
            <span className="material-symbols-outlined text-[18px]">
              chevron_left
            </span>
          </button>
          <button
            type="button"
            onClick={onGoToToday}
            className="rounded-full px-4 py-2 font-body text-sm font-medium text-on-surface transition-colors hover:bg-gray-100"
          >
            আজ
          </button>
          <button
            type="button"
            onClick={onGoToNextRange}
            className="flex h-9 w-9 items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-gray-100 hover:text-on-surface"
            aria-label="পরের দিনগুলো"
          >
            <span className="material-symbols-outlined text-[18px]">
              chevron_right
            </span>
          </button>
        </div>

        <h1 className="truncate px-2 font-card-title text-lg text-on-surface md:text-xl">
          {monthLabel}
        </h1>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <SegmentedControl
          items={[
            { value: "agenda", label: "Agenda" },
            { value: "calendar", label: "Calendar" },
          ]}
          value={viewMode}
          onChange={onViewModeChange}
        />
        <SegmentedControl
          items={[
            { value: "day", label: "Day" },
            { value: "week", label: "Week" },
          ]}
          value={calendarMode}
          onChange={onCalendarModeChange}
        />
      </div>
    </div>
  );
}

function SegmentedControl<TValue extends string>({
  items,
  value,
  onChange,
}: {
  items: Array<{ value: TValue; label: string }>;
  value: TValue;
  onChange: (value: TValue) => void;
}) {
  return (
    <div className="flex rounded-full border border-border-subtle bg-surface-container p-1">
      {items.map((item) => (
        <button
          key={item.value}
          type="button"
          onClick={() => onChange(item.value)}
          className={`rounded-full px-3 py-1.5 text-xs font-medium transition-all md:px-4 md:text-sm ${
            value === item.value
              ? "bg-on-surface text-pure-white shadow-sm"
              : "text-gray-500 hover:bg-pure-white hover:text-on-surface"
          }`}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

function CalendarGridHeader({
  calendarDays,
  selectedDate,
  today,
  gridTemplateColumns,
  unscheduledTasksByDate,
  onSelectDate,
  onModeChange,
  onEdit,
  onPointerDown,
}: {
  calendarDays: TodoAgendaDay[];
  selectedDate: number;
  today: number;
  gridTemplateColumns: string;
  unscheduledTasksByDate: Map<number, TodoAgendaTask[]>;
  onSelectDate: (date: number) => void;
  onModeChange: (mode: CalendarMode) => void;
  onEdit: (task: TodoAgendaTask) => void;
  onPointerDown: (
    event: React.PointerEvent,
    task: TodoAgendaTask,
    date: number,
  ) => void;
}) {
  return (
    <div className="sticky top-0 z-40 shrink-0 border-b border-border-medium bg-pure-white shadow-[0_1px_0_rgba(0,0,0,0.03)]">
      <div className="grid" style={{ gridTemplateColumns }}>
        <div className="border-r border-border-medium bg-pure-white" />
        {calendarDays.map((day) => (
          <button
            key={day.date}
            type="button"
            onClick={() => {
              onSelectDate(day.date);
              onModeChange("day");
            }}
            className={`border-r border-border-subtle px-2 py-3 text-center transition-colors hover:bg-gray-50 ${
              day.date === selectedDate ? "bg-brand-green/5" : ""
            }`}
          >
            <div
              className={`font-mono-code text-[10px] uppercase tracking-[0.18em] md:text-[11px] ${
                day.date === today ? "text-brand-green" : "text-gray-400"
              }`}
            >
              {formatShortWeekday(day.date)}
            </div>
            <div
              className={`mx-auto mt-1.5 flex h-10 w-10 items-center justify-center rounded-full font-card-title text-xl leading-none ${
                day.date === today
                  ? "bg-brand-green text-near-black"
                  : day.date === selectedDate
                    ? "bg-on-surface text-pure-white"
                    : "text-on-surface"
              }`}
            >
              {formatDayNumber(day.date)}
            </div>
          </button>
        ))}
      </div>

      <div className="grid min-h-12" style={{ gridTemplateColumns }}>
        <div className="flex items-start justify-end border-r border-border-medium px-2 py-2 font-mono-code text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-500">
          সময়হীন
        </div>
        {calendarDays.map((day) => (
          <div
            key={`${day.date}-unscheduled`}
            className="min-w-0 border-r border-border-subtle px-1.5 py-1.5"
          >
            <div className="flex max-h-24 flex-col gap-1 overflow-y-auto">
              {(unscheduledTasksByDate.get(day.date) ?? []).map((task) => (
                <UnscheduledTaskChip
                  key={`${day.date}-${task.id}`}
                  task={task}
                  date={day.date}
                  onEdit={onEdit}
                  onPointerDown={onPointerDown}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function UnscheduledTaskChip({
  task,
  date,
  onEdit,
  onPointerDown,
}: {
  task: TodoAgendaTask;
  date: number;
  onEdit: (task: TodoAgendaTask) => void;
  onPointerDown: (
    event: React.PointerEvent,
    task: TodoAgendaTask,
    date: number,
  ) => void;
}) {
  const theme = getSubjectTheme(task.subjectColor);

  return (
    <button
      type="button"
      onClick={() => onEdit(task)}
      onPointerDown={(event) => onPointerDown(event, task, date)}
      className={`group min-h-7 w-full overflow-hidden rounded-md border px-2 py-1 text-left transition-colors hover:bg-gray-50 ${
        task.isCompleted ? "opacity-55" : ""
      }`}
      style={{
        backgroundColor: `${theme.accentHex}18`,
        borderColor: `${theme.accentHex}55`,
      }}
    >
      <span className="flex min-w-0 items-center gap-1.5">
        <span
          className="h-2 w-2 shrink-0 rounded-full border border-pure-white"
          style={{ backgroundColor: theme.accentHex }}
        />
        <span className="truncate text-[12px] font-medium leading-tight text-on-surface">
          {task.title}
        </span>
      </span>
    </button>
  );
}

function TimeGutter() {
  return (
    <div
      className="relative border-r border-border-medium bg-pure-white"
      style={{ height: DAY_HEIGHT }}
    >
      {Array.from({ length: 24 }, (_, hour) => (
        <div
          key={hour}
          className={`absolute right-2 font-mono-code text-[11px] font-semibold text-gray-500 ${
            hour === 0 ? "translate-y-1" : "-translate-y-2"
          }`}
          style={{ top: hour * HOUR_HEIGHT }}
        >
          {formatClockTime(hour * 60)}
        </div>
      ))}
    </div>
  );
}

function CalendarDayColumn({
  day,
  today,
  currentTimeMinutes,
  dragState,
  createSelectionState,
  onEventClick,
  onPointerDown,
}: {
  day: TodoAgendaDay;
  today: number;
  currentTimeMinutes: number;
  dragState: DragState | null;
  createSelectionState: CreateSelectionState | null;
  onEventClick: (task: TodoAgendaTask) => void;
  onPointerDown: (
    event: React.PointerEvent,
    task: TodoAgendaTask,
    date: number,
    mode: DragMode,
  ) => void;
}) {
  const timedTasks = useMemo(
    () =>
      layoutTimedEvents(
        day.tasks.filter(
          (task) =>
            task.startTimeMinutes !== undefined &&
            dragState?.task.id !== task.id,
        ),
      ),
    [day.tasks, dragState],
  );
  const previewTask =
    dragState && dragState.previewDate === day.date
      ? {
          task: {
            ...dragState.task,
            startTimeMinutes: dragState.previewStart,
            durationMinutes: dragState.previewDuration,
          },
          lane: 0,
          laneCount: 1,
        }
      : null;
  const createPreview =
    createSelectionState && createSelectionState.date === day.date
      ? {
          startTimeMinutes: createSelectionState.previewStart,
          durationMinutes: createSelectionState.previewDuration,
        }
      : null;

  return (
    <div className="relative border-r border-border-subtle bg-pure-white">
      {Array.from({ length: 24 }, (_, hour) => (
        <div
          key={hour}
          className="absolute left-0 right-0 border-t border-border-medium"
          style={{ top: hour * HOUR_HEIGHT }}
        />
      ))}
      {day.date === today ? (
        <CurrentTimeIndicator currentTimeMinutes={currentTimeMinutes} />
      ) : null}
      {createPreview ? <CreateSelectionPreview selection={createPreview} /> : null}
      {[...timedTasks, ...(previewTask ? [previewTask] : [])].map((item) => (
        <CalendarEvent
          key={`${day.date}-${item.task.id}-${previewTask?.task.id === item.task.id ? "preview" : "real"}`}
          item={item}
          date={day.date}
          isPreview={previewTask?.task.id === item.task.id}
          onClick={onEventClick}
          onPointerDown={onPointerDown}
        />
      ))}
    </div>
  );
}

function CurrentTimeIndicator({
  currentTimeMinutes,
}: {
  currentTimeMinutes: number;
}) {
  return (
    <div
      className="pointer-events-none absolute left-0 right-0 z-30"
      style={{ top: (currentTimeMinutes / 60) * HOUR_HEIGHT }}
    >
      <span className="absolute left-0 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-green shadow-[0_0_0_4px_rgba(24,226,153,0.14)]" />
      <span className="block h-0.5 bg-brand-green shadow-[0_0_14px_rgba(24,226,153,0.55)]" />
    </div>
  );
}

function CreateSelectionPreview({
  selection,
}: {
  selection: {
    startTimeMinutes: number;
    durationMinutes: number;
  };
}) {
  return (
    <div
      className="pointer-events-none absolute z-20 rounded-lg border border-brand-green bg-brand-green/15 px-2 py-1.5 shadow-sm ring-2 ring-brand-green/30"
      style={{
        top: (selection.startTimeMinutes / 60) * HOUR_HEIGHT,
        height: Math.max(
          MIN_EVENT_HEIGHT,
          (selection.durationMinutes / 60) * HOUR_HEIGHT,
        ),
        left: 5,
        right: 5,
      }}
    >
      <span className="block truncate font-mono-code text-[10px] font-semibold uppercase tracking-[0.08em] text-brand-green-deep">
        {formatTimeRangeLabel(
          selection.startTimeMinutes,
          selection.durationMinutes,
        )}
      </span>
    </div>
  );
}

function CalendarEvent({
  item,
  date,
  isPreview,
  onClick,
  onPointerDown,
}: {
  item: LaidOutTask;
  date: number;
  isPreview: boolean;
  onClick: (task: TodoAgendaTask) => void;
  onPointerDown: (
    event: React.PointerEvent,
    task: TodoAgendaTask,
    date: number,
    mode: DragMode,
  ) => void;
}) {
  const { task, lane, laneCount } = item;
  const startTime = task.startTimeMinutes ?? 0;
  const theme = getSubjectTheme(task.subjectColor);
  const width = 100 / laneCount;
  const left = lane * width;

  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onClick(task);
      }}
      onPointerDown={(event) => {
        event.stopPropagation();
        onPointerDown(event, task, date, "move");
      }}
      className={`absolute overflow-hidden rounded-lg border px-2 py-1.5 text-left shadow-sm transition-opacity ${
        isPreview ? "opacity-70 ring-2 ring-brand-green" : "hover:opacity-90"
      } ${task.isCompleted ? "opacity-55" : ""}`}
      style={{
        top: (startTime / 60) * HOUR_HEIGHT,
        height: Math.max(MIN_EVENT_HEIGHT, (task.durationMinutes / 60) * HOUR_HEIGHT),
        left: `calc(${left}% + 5px)`,
        width: `calc(${width}% - 10px)`,
        backgroundColor: `${theme.accentHex}20`,
        borderColor: `${theme.accentHex}77`,
      }}
    >
      <span
        className="absolute bottom-1.5 left-1.5 top-1.5 w-1 rounded-full"
        style={{ backgroundColor: theme.accentHex }}
      />
      <span className="block truncate pl-2.5 text-[12px] font-semibold leading-tight text-on-surface">
        {task.title}
      </span>
      <span className="mt-0.5 block truncate pl-2.5 font-mono-code text-[10px] font-semibold uppercase tracking-[0.08em] text-gray-500">
        {formatTimeRangeLabel(startTime, task.durationMinutes)}
      </span>
      <span
        role="presentation"
        onPointerDown={(event) => {
          event.stopPropagation();
          onPointerDown(event, task, date, "resize-start");
        }}
        className="group/handle absolute inset-x-0 top-0 h-4 cursor-ns-resize"
        aria-hidden="true"
      >
        <span className="absolute left-1/2 top-1 h-1 w-10 -translate-x-1/2 rounded-full bg-on-surface/20 opacity-0 transition-opacity group-hover/handle:opacity-80" />
      </span>
      <span
        role="presentation"
        onPointerDown={(event) => {
          event.stopPropagation();
          onPointerDown(event, task, date, "resize-end");
        }}
        className="group/handle absolute inset-x-0 bottom-0 h-5 cursor-ns-resize"
        aria-hidden="true"
      >
        <span className="absolute bottom-1.5 left-1/2 h-1 w-10 -translate-x-1/2 rounded-full bg-on-surface/25 opacity-85 transition-opacity group-hover/handle:bg-on-surface/40" />
      </span>
    </button>
  );
}

export function layoutTimedEvents(tasks: TodoAgendaTask[]): LaidOutTask[] {
  const sortedTasks = [...tasks].sort((left, right) => {
    const startDiff = (left.startTimeMinutes ?? 0) - (right.startTimeMinutes ?? 0);
    return startDiff || right.durationMinutes - left.durationMinutes;
  });
  const result: LaidOutTask[] = [];
  let cluster: TodoAgendaTask[] = [];
  let clusterEnd = -1;

  const flushCluster = () => {
    if (cluster.length === 0) {
      return;
    }

    const laneEnds: number[] = [];
    const clusterLayouts: LaidOutTask[] = [];

    for (const task of cluster) {
      const start = task.startTimeMinutes ?? 0;
      const end = start + task.durationMinutes;
      let lane = laneEnds.findIndex((laneEnd) => laneEnd <= start);
      if (lane === -1) {
        lane = laneEnds.length;
      }
      laneEnds[lane] = end;
      clusterLayouts.push({ task, lane, laneCount: 1 });
    }

    const laneCount = Math.max(1, laneEnds.length);
    result.push(
      ...clusterLayouts.map((item) => ({
        ...item,
        laneCount,
      })),
    );
    cluster = [];
    clusterEnd = -1;
  };

  for (const task of sortedTasks) {
    const start = task.startTimeMinutes ?? 0;
    const end = start + task.durationMinutes;
    if (cluster.length > 0 && start >= clusterEnd) {
      flushCluster();
    }
    cluster.push(task);
    clusterEnd = Math.max(clusterEnd, end);
  }

  flushCluster();
  return result;
}

function snapMinutes(minutes: number) {
  return Math.round(minutes / SNAP_MINUTES) * SNAP_MINUTES;
}

function buildCreateSelectionRange({
  anchorMinutes,
  targetMinutes,
}: {
  anchorMinutes: number;
  targetMinutes: number;
}) {
  const normalizedAnchor = Math.min(1440, Math.max(0, snapMinutes(anchorMinutes)));
  const normalizedTarget = Math.min(1440, Math.max(0, snapMinutes(targetMinutes)));
  const rangeStart = Math.min(normalizedAnchor, normalizedTarget);
  const rangeEnd = Math.max(normalizedAnchor, normalizedTarget);
  const previewStart = Math.min(1440 - SNAP_MINUTES, rangeStart);

  return {
    previewStart,
    previewDuration: Math.min(
      1440 - previewStart,
      Math.max(SNAP_MINUTES, rangeEnd - rangeStart),
    ),
  };
}

function clampDuration(duration: number, startTimeMinutes: number) {
  return Math.min(1440 - startTimeMinutes, Math.max(SNAP_MINUTES, duration));
}

function getPointerMinutesInOriginDay(
  clientY: number,
  originY: number,
  anchorMinutes: number,
) {
  const deltaMinutes = ((clientY - originY) / HOUR_HEIGHT) * 60;
  return Math.min(1440, Math.max(0, snapMinutes(anchorMinutes + deltaMinutes)));
}

function getDhakaMinutes(timestamp: number) {
  const dhakaOffset = 6 * 60 * 60 * 1000;
  const dhakaTime = new Date(timestamp + dhakaOffset);
  return dhakaTime.getUTCHours() * 60 + dhakaTime.getUTCMinutes();
}

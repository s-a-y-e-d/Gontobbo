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
  formatDayMonth,
  formatDurationLabel,
  formatShortWeekday,
  formatTimeRangeLabel,
} from "./todoAgendaTime";

type CalendarMode = "day" | "week";

type TodoCalendarViewProps = {
  days: TodoAgendaDay[];
  selectedDate: number;
  mode: CalendarMode;
  onModeChange: (mode: CalendarMode) => void;
  onSelectDate: (date: number) => void;
  onCreateTask: (date: number, startTimeMinutes: number) => void;
};

type DragMode = "move" | "resize";

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
const DAY_COLUMN_MIN_WIDTH = 220;

export default function TodoCalendarView({
  days,
  selectedDate,
  mode,
  onModeChange,
  onSelectDate,
  onCreateTask,
}: TodoCalendarViewProps) {
  const visibleDays = mode === "day"
    ? days.filter((day) => day.date === selectedDate).slice(0, 1)
    : days;
  const calendarDays = visibleDays.length > 0 ? visibleDays : days.slice(0, 1);
  const timedGridRef = useRef<HTMLDivElement | null>(null);
  const [editingTask, setEditingTask] = useState<TodoAgendaTask | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [suppressClickUntil, setSuppressClickUntil] = useState(0);
  const updateTodoTaskSchedule = useMutation(api.mutations.updateTodoTaskSchedule);
  const updateCustomTodoTask = useMutation(api.mutations.updateCustomTodoTask);

  const unscheduledTasks = calendarDays.flatMap((day) =>
    day.tasks
      .filter((task) => task.startTimeMinutes === undefined)
      .map((task) => ({ task, date: day.date })),
  );

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
        startTimeMinutes: Math.min(1439, Math.max(0, snapMinutes(rawMinutes))),
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

    const handlePointerMove = (event: PointerEvent) => {
      if (event.pointerId !== dragState.pointerId) {
        return;
      }

      const target = getPointerTarget(event.clientX, event.clientY);
      const deltaMinutes = snapMinutes(
        ((event.clientY - dragState.originY) / HOUR_HEIGHT) * 60,
      );
      const hasMoved =
        dragState.hasMoved ||
        Math.abs(event.clientX - dragState.originX) > 3 ||
        Math.abs(event.clientY - dragState.originY) > 3;

      if (dragState.mode === "resize") {
        setDragState({
          ...dragState,
          hasMoved,
          previewDuration: clampDuration(
            snapMinutes(dragState.originalDuration + deltaMinutes),
            dragState.previewStart,
          ),
        });
        return;
      }

      if (!target) {
        setDragState({ ...dragState, hasMoved });
        return;
      }

      const maxStart = 1440 - dragState.originalDuration;
      setDragState({
        ...dragState,
        hasMoved,
        previewDate: target.date,
        previewStart: Math.min(maxStart, Math.max(0, target.startTimeMinutes)),
      });
    };

    const handlePointerUp = (event: PointerEvent) => {
      if (event.pointerId !== dragState.pointerId) {
        return;
      }

      const finalState = dragState;
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

    return () => {
      document.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("pointerup", handlePointerUp);
      document.removeEventListener("pointercancel", handlePointerUp);
    };
  }, [dragState, getPointerTarget, saveDraggedTask]);

  const handleGridClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (Date.now() < suppressClickUntil) {
      return;
    }

    const target = getPointerTarget(event.clientX, event.clientY);
    if (!target) {
      return;
    }

    onSelectDate(target.date);
    onCreateTask(target.date, Math.min(1380, target.startTimeMinutes));
  };

  const startDrag = (
    event: React.PointerEvent,
    task: TodoAgendaTask,
    date: number,
    dragMode: DragMode,
  ) => {
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
    <section className="pb-8">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-card-title text-xl text-on-surface">
            ক্যালেন্ডার
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            সময় ধরে টাস্ক সাজান, টেনে সরান, আর duration বদলান।
          </p>
        </div>
        <div className="flex rounded-full border border-border-subtle bg-pure-white p-1">
          {(["day", "week"] as const).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => onModeChange(item)}
              className={`rounded-full px-4 py-2 text-sm font-medium transition-all ${
                mode === item
                  ? "bg-on-surface text-pure-white shadow-sm"
                  : "text-gray-500 hover:text-on-surface"
              }`}
            >
              {item === "day" ? "Day" : "Week"}
            </button>
          ))}
        </div>
      </div>

      <UnscheduledRow
        tasks={unscheduledTasks}
        onPointerDown={startUnscheduledDrag}
        onEdit={(task) => {
          if (Date.now() >= suppressClickUntil) {
            setEditingTask(task);
          }
        }}
      />

      <div className="overflow-x-auto rounded-[32px] border border-border-subtle bg-pure-white">
        <div
          className="min-w-full"
          style={{
            width:
              mode === "week"
                ? `${Math.max(calendarDays.length * DAY_COLUMN_MIN_WIDTH + 64, 720)}px`
                : "100%",
          }}
        >
          <div
            className="grid border-b border-border-subtle bg-pure-white"
            style={{
              gridTemplateColumns: `64px repeat(${calendarDays.length}, minmax(${DAY_COLUMN_MIN_WIDTH}px, 1fr))`,
            }}
          >
            <div />
            {calendarDays.map((day) => (
              <button
                key={day.date}
                type="button"
                onClick={() => onSelectDate(day.date)}
                className={`border-l border-border-subtle px-4 py-3 text-left transition-colors hover:bg-gray-50 ${
                  day.date === selectedDate ? "bg-brand-green/5" : ""
                }`}
              >
                <div className="font-mono-code text-[11px] uppercase tracking-[0.18em] text-gray-400">
                  {formatShortWeekday(day.date)}
                </div>
                <div className="mt-1 font-card-title text-base text-on-surface">
                  {formatDayMonth(day.date)}
                </div>
              </button>
            ))}
          </div>

          <div className="grid" style={{ gridTemplateColumns: "64px 1fr" }}>
            <TimeGutter />
            <div
              ref={timedGridRef}
              role="presentation"
              onClick={handleGridClick}
              className="relative grid cursor-crosshair"
              style={{
                height: DAY_HEIGHT,
                gridTemplateColumns: `repeat(${calendarDays.length}, minmax(${DAY_COLUMN_MIN_WIDTH}px, 1fr))`,
              }}
            >
              {calendarDays.map((day) => (
                <CalendarDayColumn
                  key={day.date}
                  day={day}
                  dragState={dragState}
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

function UnscheduledRow({
  tasks,
  onPointerDown,
  onEdit,
}: {
  tasks: { task: TodoAgendaTask; date: number }[];
  onPointerDown: (
    event: React.PointerEvent,
    task: TodoAgendaTask,
    date: number,
  ) => void;
  onEdit: (task: TodoAgendaTask) => void;
}) {
  return (
    <div className="mb-4 rounded-[28px] border border-border-subtle bg-pure-white p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="font-label-uppercase text-label-uppercase text-gray-500">
          Unscheduled
        </p>
        <p className="text-xs text-gray-400">
          টাইমলাইনে টেনে নিলে সময় সেট হবে
        </p>
      </div>
      {tasks.length === 0 ? (
        <p className="rounded-2xl bg-surface-container px-4 py-3 text-sm text-gray-500">
          সময় ছাড়া কোনো টাস্ক নেই।
        </p>
      ) : (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {tasks.map(({ task, date }) => {
            const theme = getSubjectTheme(task.subjectColor);
            return (
              <button
                key={`${date}-${task.id}`}
                type="button"
                onClick={() => onEdit(task)}
                onPointerDown={(event) => onPointerDown(event, task, date)}
                className="min-w-52 rounded-2xl border border-border-subtle bg-pure-white px-3 py-3 text-left shadow-sm transition-transform hover:-translate-y-0.5"
                style={{ borderColor: `${theme.accentHex}55` }}
              >
                <span
                  className="mb-2 block h-1.5 w-10 rounded-full"
                  style={{ backgroundColor: theme.accentHex }}
                />
                <span className="line-clamp-2 text-sm font-medium text-on-surface">
                  {task.title}
                </span>
                <span className="mt-1 block text-xs text-gray-400">
                  {formatDurationLabel(task.durationMinutes)}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TimeGutter() {
  return (
    <div className="relative border-r border-border-subtle" style={{ height: DAY_HEIGHT }}>
      {Array.from({ length: 24 }, (_, hour) => (
        <div
          key={hour}
          className="absolute right-2 -translate-y-2 text-[11px] font-medium text-gray-400"
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
  dragState,
  onEventClick,
  onPointerDown,
}: {
  day: TodoAgendaDay;
  dragState: DragState | null;
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

  return (
    <div className="relative border-l border-border-subtle">
      {Array.from({ length: 24 }, (_, hour) => (
        <div
          key={hour}
          className="absolute left-0 right-0 border-t border-border-subtle"
          style={{ top: hour * HOUR_HEIGHT }}
        />
      ))}
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
      className={`absolute overflow-hidden rounded-2xl border px-2.5 py-2 text-left shadow-sm transition-opacity ${
        isPreview ? "opacity-70 ring-2 ring-brand-green" : "hover:opacity-90"
      } ${task.isCompleted ? "opacity-55" : ""}`}
      style={{
        top: (startTime / 60) * HOUR_HEIGHT,
        height: Math.max(MIN_EVENT_HEIGHT, (task.durationMinutes / 60) * HOUR_HEIGHT),
        left: `calc(${left}% + 4px)`,
        width: `calc(${width}% - 8px)`,
        backgroundColor: `${theme.accentHex}18`,
        borderColor: `${theme.accentHex}66`,
        color: theme.accentHex,
      }}
    >
      <span className="block truncate text-[12px] font-semibold leading-tight text-on-surface">
        {task.title}
      </span>
      <span className="mt-1 block truncate font-mono-code text-[10px] uppercase tracking-[0.08em]">
        {formatTimeRangeLabel(startTime, task.durationMinutes)}
      </span>
      <span
        role="presentation"
        onPointerDown={(event) => {
          event.stopPropagation();
          onPointerDown(event, task, date, "resize");
        }}
        className="absolute bottom-1 left-1/2 h-1.5 w-10 -translate-x-1/2 cursor-ns-resize rounded-full"
        style={{ backgroundColor: `${theme.accentHex}88` }}
      />
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

function clampDuration(duration: number, startTimeMinutes: number) {
  return Math.min(1440 - startTimeMinutes, Math.max(SNAP_MINUTES, duration));
}

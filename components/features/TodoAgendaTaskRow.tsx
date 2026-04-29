"use client";

import { useId } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { getSubjectTheme } from "./subjectTheme";
import { TodoAgendaTask } from "./todoAgendaTypes";
import {
  formatDurationLabel,
  formatTimeRangeLabel,
} from "./todoAgendaTime";

type TodoAgendaTaskRowProps = {
  task: TodoAgendaTask;
  isLast: boolean;
};

export default function TodoAgendaTaskRow({
  task,
  isLast,
}: TodoAgendaTaskRowProps) {
  const theme = getSubjectTheme(task.subjectColor);
  const checkboxId = useId();
  const toggleStudyItemCompletion = useMutation(
    api.mutations.toggleStudyItemCompletion,
  );

  return (
    <div
      className={`flex items-start gap-3 py-4 ${
        !isLast ? "border-b border-border-subtle" : ""
      }`}
    >
      <div className="checkbox-wrapper-46 mt-0.5 shrink-0">
        <input
          className="inp-cbx"
          id={checkboxId}
          type="checkbox"
          checked={task.isCompleted}
          onChange={() =>
            void toggleStudyItemCompletion({
              studyItemId: task.studyItemId as Id<"studyItems">,
            })
          }
        />
        <label className="cbx" htmlFor={checkboxId} aria-label={task.title}>
          <span>
            <svg width="12px" height="10px" viewBox="0 0 12 10">
              <polyline points="1.5 6 4.5 9 10.5 1"></polyline>
            </svg>
          </span>
        </label>
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p
            className={`truncate font-body text-[15px] md:text-body ${
              task.isCompleted
                ? "text-on-surface/55 line-through"
                : "text-on-surface"
            }`}
          >
            {task.title}
          </p>
          <span
            className={`rounded-full px-2.5 py-1 text-[11px] font-mono-code uppercase tracking-[0.14em] ${
              task.isCompleted
                ? "bg-surface-container/60 text-gray-400"
                : "bg-surface-container text-gray-500"
            }`}
          >
            {formatTimeRangeLabel(task.startTimeMinutes, task.durationMinutes)}
          </span>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs md:text-sm">
          <span
            className={task.isCompleted ? "font-medium opacity-55" : "font-medium"}
            style={{ color: theme.accentHex }}
          >
            {`${task.subjectName} • ${task.chapterName}`}
          </span>
          <span className={task.isCompleted ? "text-gray-400/80" : "text-gray-400"}>
            {formatDurationLabel(task.durationMinutes)}
          </span>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useId, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import ConceptReviewModal from "./ConceptReviewModal";
import TodoAgendaEditTaskModal from "./TodoAgendaEditTaskModal";
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
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const toggleStudyItemCompletion = useMutation(
    api.mutations.toggleStudyItemCompletion,
  );
  const toggleCustomTodoTaskCompletion = useMutation(
    api.mutations.toggleCustomTodoTaskCompletion,
  );
  const deleteTodoTask = useMutation(api.mutations.deleteTodoTask);

  const isStudyItemTask = task.kind === "study_item";
  const isCustomTask = task.kind === "custom";
  const isScheduled = task.startTimeMinutes !== undefined;
  const metadataText = task.conceptName
    ? `${task.subjectName} • ${task.chapterName} • ${task.conceptName}`
    : `${task.subjectName} • ${task.chapterName}`;

  const handleToggle = () => {
    if (isStudyItemTask) {
      void toggleStudyItemCompletion({
        studyItemId: task.studyItemId as Id<"studyItems">,
      });
      return;
    }

    if (isCustomTask) {
      void toggleCustomTodoTaskCompletion({
        todoTaskId: task.id as Id<"todoTasks">,
      });
      return;
    }

    setIsReviewModalOpen(true);
  };

  const handleDelete = () => {
    if (!window.confirm("এই টাস্কটি Todo থেকে সরিয়ে দেবেন?")) {
      return;
    }

    void deleteTodoTask({
      todoTaskId: task.id as Id<"todoTasks">,
    });
  };

  return (
    <>
      <div
        className={`flex items-start gap-3 py-4 ${
          !isLast ? "border-b border-border-subtle" : ""
        }`}
      >
        {isStudyItemTask ? (
          <div className="checkbox-wrapper-46 mt-0.5 shrink-0">
            <input
              className="inp-cbx"
              id={checkboxId}
              type="checkbox"
              checked={task.isCompleted}
              onChange={handleToggle}
            />
            <label className="cbx" htmlFor={checkboxId} aria-label={task.title}>
              <span>
                <svg width="12px" height="10px" viewBox="0 0 12 10">
                  <polyline points="1.5 6 4.5 9 10.5 1"></polyline>
                </svg>
              </span>
            </label>
          </div>
        ) : (
          <div className="checkbox-wrapper-46 mt-0.5 shrink-0">
            <input
              className="inp-cbx"
              id={checkboxId}
              type="checkbox"
              checked={task.isCompleted}
              onChange={handleToggle}
            />
            <label className="cbx" htmlFor={checkboxId} aria-label={task.title}>
              <span>
                <svg width="12px" height="10px" viewBox="0 0 12 10">
                  <polyline points="1.5 6 4.5 9 10.5 1"></polyline>
                </svg>
              </span>
            </label>
          </div>
        )}

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
            {isScheduled ? (
              <span
                className={`rounded-full border px-2.5 py-1 text-[11px] font-mono-code uppercase tracking-[0.14em] ${
                  task.isCompleted
                    ? "border-border-subtle bg-gray-100 text-gray-400 dark:border-white/10 dark:bg-white/[0.07] dark:text-neutral-500"
                    : "border-transparent bg-surface-container text-gray-500 dark:bg-white/[0.09] dark:text-gray-400"
                }`}
              >
                {formatTimeRangeLabel(
                  task.startTimeMinutes as number,
                  task.durationMinutes,
                )}
              </span>
            ) : null}
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs md:text-sm">
            <span
              className={task.isCompleted ? "font-medium opacity-55" : "font-medium"}
              style={{ color: theme.accentHex }}
            >
              {isCustomTask ? "নিজস্ব টাস্ক" : metadataText}
            </span>
            <span className={task.isCompleted ? "text-gray-400/80" : "text-gray-400"}>
              {formatDurationLabel(task.durationMinutes)}
            </span>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => setIsEditModalOpen(true)}
            className="flex h-9 w-9 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-100 hover:text-on-surface"
            aria-label="Edit todo"
          >
            <span className="material-symbols-outlined text-[18px]">edit</span>
          </button>
          <button
            type="button"
            onClick={handleDelete}
            className="flex h-9 w-9 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-[#fff4f2] hover:text-error-red"
            aria-label="Delete todo"
          >
            <span className="material-symbols-outlined text-[18px]">delete</span>
          </button>
        </div>
      </div>

      {!isStudyItemTask && task.conceptId ? (
        <ConceptReviewModal
          isOpen={isReviewModalOpen}
          onClose={() => setIsReviewModalOpen(false)}
          concept={{
            _id: task.conceptId as Id<"concepts">,
            name: task.conceptName ?? task.title,
          }}
        />
      ) : null}

      <TodoAgendaEditTaskModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        task={task}
      />
    </>
  );
}

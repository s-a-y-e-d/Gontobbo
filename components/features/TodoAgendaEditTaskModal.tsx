"use client";

import { useEffect, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import DurationPresetSelect from "./DurationPresetSelect";
import { TodoAgendaTask } from "./todoAgendaTypes";
import {
  formatTimeInputValue,
  parseTimeInputValue,
  roundToNearestQuarterHour,
} from "./todoAgendaTime";

type TodoAgendaEditTaskModalProps = {
  isOpen: boolean;
  onClose: () => void;
  task: TodoAgendaTask;
};

export default function TodoAgendaEditTaskModal({
  isOpen,
  onClose,
  task,
}: TodoAgendaEditTaskModalProps) {
  const updateTodoTaskSchedule = useMutation(api.mutations.updateTodoTaskSchedule);
  const [startTimeValue, setStartTimeValue] = useState(() =>
    task.startTimeMinutes === undefined
      ? ""
      : formatTimeInputValue(task.startTimeMinutes),
  );
  const [durationMinutes, setDurationMinutes] = useState(task.durationMinutes);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const maxDurationMinutes = getMaxDurationMinutes(startTimeValue);
  const isDurationPastSelectedDay =
    maxDurationMinutes !== null && durationMinutes > maxDurationMinutes;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener("keydown", handleKeyDown);
    }

    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  const handleStartTimeChange = (value: string) => {
    const parsedValue = parseTimeInputValue(value);
    if (parsedValue === null) {
      setStartTimeValue(value);
    } else {
      const normalizedStartTime = roundToNearestQuarterHour(parsedValue);
      setStartTimeValue(formatTimeInputValue(normalizedStartTime));

      if (durationMinutes > 1440 - normalizedStartTime) {
        setDurationMinutes(15);
      }
    }

    setErrorMessage(null);
  };

  const handleStartTimeBlur = () => {
    const parsedValue = parseTimeInputValue(startTimeValue);
    if (parsedValue !== null) {
      const normalizedStartTime = roundToNearestQuarterHour(parsedValue);
      setStartTimeValue(formatTimeInputValue(normalizedStartTime));

      if (durationMinutes > 1440 - normalizedStartTime) {
        setDurationMinutes(15);
      }
    }
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const parsedStartTime =
      startTimeValue.length === 0 ? undefined : parseTimeInputValue(startTimeValue);
    if (startTimeValue.length > 0 && parsedStartTime === null) {
      setErrorMessage("শুরুর সময় ঠিক করে দিন।");
      return;
    }

    let normalizedStartTime: number | undefined;
    if (typeof parsedStartTime === "number") {
      normalizedStartTime = roundToNearestQuarterHour(parsedStartTime);
      if (normalizedStartTime !== parsedStartTime) {
        setStartTimeValue(formatTimeInputValue(normalizedStartTime));
      }
    }

    if (
      normalizedStartTime !== undefined &&
      normalizedStartTime + durationMinutes > 1440
    ) {
      setErrorMessage("এই টাস্কটি নির্বাচিত দিনের বাইরে চলে যাবে।");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      await updateTodoTaskSchedule({
        todoTaskId: task.id as Id<"todoTasks">,
        startTimeMinutes: normalizedStartTime,
        durationMinutes,
      });
      onClose();
    } catch (error) {
      console.error("Failed to update todo task:", error);
      setErrorMessage("টাস্ক আপডেট করা যায়নি। আবার চেষ্টা করুন।");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-near-black/25 backdrop-blur-sm animate-in fade-in duration-300" />

      <div
        className="relative w-full max-w-lg rounded-[32px] bg-pure-white shadow-[0_24px_60px_rgba(0,0,0,0.12)] animate-in zoom-in-95 slide-in-from-bottom-4 duration-300"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border-subtle px-6 py-5 sm:px-8">
          <div className="min-w-0">
            <p className="font-mono-code text-[11px] uppercase tracking-[0.18em] text-gray-400">
              Todo
            </p>
            <h2 className="mt-2 font-section-heading text-[1.7rem] leading-tight tracking-[-0.04em] text-on-surface">
              টাস্ক এডিট করুন
            </h2>
            <p className="mt-2 truncate font-body text-sm text-gray-500">
              {task.title}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-100 hover:text-on-surface"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6 px-6 py-6 sm:px-8">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-2 block font-label-uppercase text-label-uppercase text-gray-500">
                শুরুর সময় (ঐচ্ছিক)
              </label>
              <input
                type="time"
                step={900}
                value={startTimeValue}
                onChange={(event) => handleStartTimeChange(event.target.value)}
                onBlur={handleStartTimeBlur}
                className="w-full rounded-full border border-border-medium bg-gray-50/60 px-4 py-3 font-body text-body text-on-surface outline-none transition-all focus:border-brand-green"
              />
            </div>

            <div>
              <label className="mb-2 block font-label-uppercase text-label-uppercase text-gray-500">
                সময়কাল
              </label>
              <DurationPresetSelect
                value={durationMinutes}
                onChange={(minutes) => {
                  setDurationMinutes(minutes);
                  setErrorMessage(null);
                }}
                className="w-full"
                disabledOptions={(minutes) =>
                  maxDurationMinutes !== null && minutes > maxDurationMinutes
                }
              />
            </div>
          </div>

          {errorMessage ? (
            <div className="rounded-[20px] border border-[#f1c2bc] bg-[#fff4f2] px-4 py-3 text-sm text-[#c54f41]">
              {errorMessage}
            </div>
          ) : null}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full px-6 py-3 font-label-uppercase text-label-uppercase text-gray-700 transition-colors hover:bg-gray-100"
            >
              বাতিল
            </button>
            <button
              type="submit"
              disabled={isSubmitting || isDurationPastSelectedDay}
              className="rounded-full bg-on-surface px-7 py-3 font-label-uppercase text-label-uppercase text-pure-white shadow-sm transition-all hover:bg-brand-green hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmitting ? "সেভ হচ্ছে..." : "সেভ করুন"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function getMaxDurationMinutes(startTimeValue: string) {
  const parsedStartTime = parseTimeInputValue(startTimeValue);
  if (parsedStartTime === null) {
    return null;
  }

  return 1440 - roundToNearestQuarterHour(parsedStartTime);
}

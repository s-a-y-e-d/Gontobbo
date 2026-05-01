"use client";

import { useDeferredValue, useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { getSubjectTheme } from "./subjectTheme";
import { TodoStudyItemSearchResult } from "./todoAgendaTypes";
import {
  formatDurationLabel,
  formatTimeInputValue,
  parseTimeInputValue,
  roundToNearestDuration,
  roundToNearestQuarterHour,
  TODO_DURATION_OPTIONS,
} from "./todoAgendaTime";

type TodoAgendaAddTaskModalProps = {
  isOpen: boolean;
  onClose: () => void;
  date: number;
  dayHeading: string;
};

export default function TodoAgendaAddTaskModal({
  isOpen,
  onClose,
  date,
  dayHeading,
}: TodoAgendaAddTaskModalProps) {
  const createTodoTask = useMutation(api.mutations.createTodoTask);
  const [searchText, setSearchText] = useState("");
  const deferredSearchText = useDeferredValue(searchText.trim());
  const [selectedStudyItem, setSelectedStudyItem] =
    useState<TodoStudyItemSearchResult | null>(null);
  const [startTimeValue, setStartTimeValue] = useState("");
  const [durationMinutes, setDurationMinutes] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const searchResults = useQuery(
    api.todoQueries.searchStudyItemsForTodo,
    isOpen && deferredSearchText.length > 0
      ? { date, searchText: deferredSearchText }
      : "skip",
  );
  const maxDurationMinutes = getMaxDurationMinutes(startTimeValue);

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

  if (!isOpen) return null;

  const canShowResults =
    selectedStudyItem === null && deferredSearchText.length > 0;
  const isDurationPastSelectedDay =
    durationMinutes !== null &&
    maxDurationMinutes !== null &&
    durationMinutes > maxDurationMinutes;

  const handleSelectStudyItem = (studyItem: TodoStudyItemSearchResult) => {
    const roundedDuration = roundToNearestDuration(studyItem.estimatedMinutes);

    setSelectedStudyItem(studyItem);
    setSearchText(studyItem.title);
    setDurationMinutes(
      maxDurationMinutes === null || roundedDuration <= maxDurationMinutes
        ? roundedDuration
        : null,
    );
    setErrorMessage(null);
  };

  const handleSearchTextChange = (value: string) => {
    setSearchText(value);
    setSelectedStudyItem(null);
    setErrorMessage(null);
  };

  const handleStartTimeChange = (value: string) => {
    const parsedValue = parseTimeInputValue(value);
    if (parsedValue === null) {
      setStartTimeValue(value);
    } else {
      const normalizedStartTime = roundToNearestQuarterHour(parsedValue);
      setStartTimeValue(formatTimeInputValue(normalizedStartTime));

      if (
        durationMinutes !== null &&
        durationMinutes > 1440 - normalizedStartTime
      ) {
        setDurationMinutes(null);
      }
    }
    setErrorMessage(null);
  };

  const handleStartTimeBlur = () => {
    const parsedValue = parseTimeInputValue(startTimeValue);
    if (parsedValue !== null) {
      const normalizedStartTime = roundToNearestQuarterHour(parsedValue);
      setStartTimeValue(formatTimeInputValue(normalizedStartTime));

      if (
        durationMinutes !== null &&
        durationMinutes > 1440 - normalizedStartTime
      ) {
        setDurationMinutes(null);
      }
    }
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!selectedStudyItem) {
      setErrorMessage("একটি স্টাডি আইটেম সিলেক্ট করুন।");
      return;
    }

    const parsedStartTime = parseTimeInputValue(startTimeValue);
    if (parsedStartTime === null) {
      setErrorMessage("শুরুর সময় দিন।");
      return;
    }

    const normalizedStartTime = roundToNearestQuarterHour(parsedStartTime);
    if (normalizedStartTime !== parsedStartTime) {
      setStartTimeValue(formatTimeInputValue(normalizedStartTime));
    }

    if (durationMinutes === null) {
      setErrorMessage("সময়কাল সিলেক্ট করুন।");
      return;
    }

    if (normalizedStartTime + durationMinutes > 1440) {
      setErrorMessage("এই টাস্কটি নির্বাচিত দিনের বাইরে চলে যাবে।");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      await createTodoTask({
        date,
        studyItemId: selectedStudyItem._id as Id<"studyItems">,
        startTimeMinutes: normalizedStartTime,
        durationMinutes,
        source: "manual",
      });
      onClose();
    } catch (error) {
      console.error("Failed to create todo task:", error);
      setErrorMessage("টাস্ক যোগ করা যায়নি। আবার চেষ্টা করুন।");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-near-black/25 backdrop-blur-sm animate-in fade-in duration-300" />

      <div
        className="relative w-full max-w-xl rounded-[32px] bg-pure-white shadow-[0_24px_60px_rgba(0,0,0,0.12)] animate-in zoom-in-95 slide-in-from-bottom-4 duration-300"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border-subtle px-6 py-5 sm:px-8">
          <div>
            <p className="font-mono-code text-[11px] uppercase tracking-[0.18em] text-gray-400">
              {dayHeading}
            </p>
            <h2 className="mt-2 font-section-heading text-[1.7rem] leading-tight tracking-[-0.04em] text-on-surface">
              টাস্ক যোগ করুন
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-100 hover:text-on-surface"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6 px-6 py-6 sm:px-8">
          <div className="relative">
            <label className="mb-2 block font-label-uppercase text-label-uppercase text-gray-500">
              টাস্ক
            </label>
            <input
              type="text"
              value={searchText}
              onChange={(event) => handleSearchTextChange(event.target.value)}
              className="w-full rounded-full border border-border-medium bg-gray-50/60 px-4 py-3 font-body text-body text-on-surface outline-none transition-all focus:border-brand-green"
              placeholder="স্টাডি আইটেম খুঁজুন..."
              autoComplete="off"
            />

            {selectedStudyItem ? (
              <SelectedStudyItemCard studyItem={selectedStudyItem} />
            ) : null}

            {canShowResults ? (
              <div className="absolute left-0 right-0 top-full z-20 mt-2 overflow-hidden rounded-[24px] border border-border-subtle bg-pure-white shadow-[0_18px_50px_rgba(0,0,0,0.08)]">
                {searchResults === undefined ? (
                  <div className="px-4 py-4 text-sm text-gray-500">
                    খোঁজা হচ্ছে...
                  </div>
                ) : searchResults.length === 0 ? (
                  <div className="px-4 py-4 text-sm text-gray-500">
                    কোনো অসম্পূর্ণ স্টাডি আইটেম পাওয়া যায়নি।
                  </div>
                ) : (
                  <div className="max-h-72 overflow-y-auto py-2">
                    {searchResults.map((studyItem) => (
                      <button
                        key={studyItem._id}
                        type="button"
                        onClick={() => handleSelectStudyItem(studyItem)}
                        className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-gray-50"
                      >
                        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-green-light text-brand-green-deep">
                          <span className="material-symbols-outlined text-[18px]">
                            task_alt
                          </span>
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-body text-[15px] text-on-surface">
                            {studyItem.title}
                          </span>
                          <span className="mt-1 block text-xs text-gray-500">
                            {`${studyItem.subjectName} • ${studyItem.chapterName}`}
                          </span>
                          <span className="mt-1 block text-[11px] text-gray-400">
                            ডিফল্ট সময়: {formatDurationLabel(studyItem.estimatedMinutes)}
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : null}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-2 block font-label-uppercase text-label-uppercase text-gray-500">
                শুরুর সময়
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
              <select
                value={durationMinutes === null ? "" : String(durationMinutes)}
                onChange={(event) => {
                  const nextValue = Number(event.target.value);
                  setDurationMinutes(Number.isFinite(nextValue) ? nextValue : null);
                  setErrorMessage(null);
                }}
                className="w-full rounded-full border border-border-medium bg-gray-50/60 px-4 py-3 font-body text-body text-on-surface outline-none transition-all focus:border-brand-green"
              >
                <option value="">সময়কাল বেছে নিন</option>
                {TODO_DURATION_OPTIONS.map((minutes) => (
                  <option
                    key={minutes}
                    value={minutes}
                    disabled={
                      maxDurationMinutes !== null && minutes > maxDurationMinutes
                    }
                  >
                    {formatDurationLabel(minutes)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {selectedStudyItem && durationMinutes !== null ? (
            <div className="rounded-[24px] border border-border-subtle bg-surface-container px-4 py-3 text-sm text-gray-600">
              <span className="font-medium text-on-surface">
                ডিফল্ট সময়:
              </span>{" "}
              {formatDurationLabel(selectedStudyItem.estimatedMinutes)}
              <span className="mx-2 text-gray-300">•</span>
              <span className="font-medium text-on-surface">
                সিলেক্টেড:
              </span>{" "}
              {formatDurationLabel(durationMinutes)}
            </div>
          ) : null}

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
              disabled={
                isSubmitting ||
                !selectedStudyItem ||
                durationMinutes === null ||
                isDurationPastSelectedDay ||
                startTimeValue.length === 0
              }
              className="rounded-full bg-on-surface px-7 py-3 font-label-uppercase text-label-uppercase text-pure-white shadow-sm transition-all hover:bg-brand-green hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmitting ? "যোগ হচ্ছে..." : "টাস্ক যোগ করুন"}
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

function SelectedStudyItemCard({
  studyItem,
}: {
  studyItem: TodoStudyItemSearchResult;
}) {
  const theme = getSubjectTheme(studyItem.subjectColor);

  return (
    <div className="mt-3 rounded-[24px] border border-border-subtle bg-surface-container px-4 py-4">
      <div className="flex items-start gap-3">
        <span
          className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
          style={{ backgroundColor: `${theme.accentHex}18`, color: theme.accentHex }}
        >
          <span className="material-symbols-outlined text-[18px]">task_alt</span>
        </span>

        <div className="min-w-0">
          <p className="truncate font-body text-[15px] text-on-surface">
            {studyItem.title}
          </p>
          <p className="mt-1 text-xs text-gray-500">
            {`${studyItem.subjectName} • ${studyItem.chapterName}`}
          </p>
          <p className="mt-1 text-[11px] text-gray-400">
            ডিফল্ট সময়: {formatDurationLabel(studyItem.estimatedMinutes)}
          </p>
        </div>
      </div>
    </div>
  );
}

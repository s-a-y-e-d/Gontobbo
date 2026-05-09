"use client";

import { useDeferredValue, useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useToast } from "@/components/ui/Toast";
import DurationPresetSelect from "./DurationPresetSelect";
import TodoColorPicker from "./TodoColorPicker";
import { getSubjectTheme } from "./subjectTheme";
import type { SubjectColor } from "./subjectTheme";
import {
  TodoConceptReviewSearchResult,
  TodoStudyItemSearchResult,
} from "./todoAgendaTypes";
import {
  formatDurationLabel,
  formatTimeInputValue,
  parseTimeInputValue,
  roundToNearestDuration,
  roundToNearestQuarterHour,
} from "./todoAgendaTime";

type TodoAgendaAddTaskModalProps = {
  isOpen: boolean;
  onClose: () => void;
  date: number;
  dayHeading: string;
  initialStartTimeMinutes?: number;
  initialDurationMinutes?: number;
};

export default function TodoAgendaAddTaskModal({
  isOpen,
  onClose,
  date,
  dayHeading,
  initialStartTimeMinutes,
  initialDurationMinutes,
}: TodoAgendaAddTaskModalProps) {
  const createTodoTask = useMutation(api.mutations.createTodoTask);
  const createConceptReviewTodoTask = useMutation(
    api.mutations.createConceptReviewTodoTask,
  );
  const createCustomTodoTask = useMutation(api.mutations.createCustomTodoTask);
  const toast = useToast();
  const [taskMode, setTaskMode] =
    useState<"study_item" | "concept_review" | "custom">("study_item");
  const [searchText, setSearchText] = useState("");
  const [customTitle, setCustomTitle] = useState("");
  const deferredSearchText = useDeferredValue(searchText.trim());
  const [selectedStudyItem, setSelectedStudyItem] =
    useState<TodoStudyItemSearchResult | null>(null);
  const [selectedConceptReview, setSelectedConceptReview] =
    useState<TodoConceptReviewSearchResult | null>(null);
  const [startTimeValue, setStartTimeValue] = useState(() =>
    initialStartTimeMinutes === undefined
      ? ""
      : formatTimeInputValue(initialStartTimeMinutes),
  );
  const [durationMinutes, setDurationMinutes] = useState<number | null>(
    initialDurationMinutes ?? null,
  );
  const [customColor, setCustomColor] = useState<SubjectColor>("gray");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const searchResults = useQuery(
    api.todoQueries.searchStudyItemsForTodo,
    isOpen && taskMode === "study_item" && deferredSearchText.length > 0
      ? { date, searchText: deferredSearchText }
      : "skip",
  );
  const revisionSearchResults = useQuery(
    api.todoQueries.searchConceptReviewsForTodo,
    isOpen && taskMode === "concept_review" && deferredSearchText.length > 0
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
    taskMode === "study_item" &&
    selectedStudyItem === null &&
    deferredSearchText.length > 0;
  const canShowRevisionResults =
    taskMode === "concept_review" &&
    selectedConceptReview === null &&
    deferredSearchText.length > 0;
  const normalizedCustomTitle = customTitle.trim();
  const isDurationPastSelectedDay =
    durationMinutes !== null &&
    maxDurationMinutes !== null &&
    durationMinutes > maxDurationMinutes;
  const canSubmit =
    !isSubmitting &&
    durationMinutes !== null &&
    !isDurationPastSelectedDay &&
    (taskMode === "study_item"
      ? selectedStudyItem !== null
      : taskMode === "concept_review"
        ? selectedConceptReview !== null
        : normalizedCustomTitle.length > 0);

  const handleTaskModeChange = (mode: "study_item" | "concept_review" | "custom") => {
    setTaskMode(mode);
    setErrorMessage(null);

    if (mode === "custom") {
      setSearchText("");
      setSelectedStudyItem(null);
      setSelectedConceptReview(null);
      setDurationMinutes((current) => current ?? initialDurationMinutes ?? 15);
      return;
    }

    setCustomTitle("");
    if (mode === "study_item") {
      setSelectedConceptReview(null);
    } else {
      setSelectedStudyItem(null);
    }

    if (
      (mode === "study_item" && !selectedStudyItem) ||
      (mode === "concept_review" && !selectedConceptReview)
    ) {
      setDurationMinutes((current) => current ?? initialDurationMinutes ?? null);
    }
  };

  const handleSelectStudyItem = (studyItem: TodoStudyItemSearchResult) => {
    const roundedDuration = roundToNearestDuration(studyItem.estimatedMinutes);
    const selectedDuration = durationMinutes ?? initialDurationMinutes ?? roundedDuration;

    setSelectedStudyItem(studyItem);
    setSearchText(studyItem.title);
    setDurationMinutes(
      maxDurationMinutes === null || selectedDuration <= maxDurationMinutes
        ? selectedDuration
        : null,
    );
    setErrorMessage(null);
  };

  const handleSelectConceptReview = (conceptReview: TodoConceptReviewSearchResult) => {
    const roundedDuration = roundToNearestDuration(conceptReview.estimatedMinutes);
    const selectedDuration = durationMinutes ?? initialDurationMinutes ?? roundedDuration;

    setSelectedConceptReview(conceptReview);
    setSearchText(conceptReview.title);
    setDurationMinutes(
      maxDurationMinutes === null || selectedDuration <= maxDurationMinutes
        ? selectedDuration
        : null,
    );
    setErrorMessage(null);
  };

  const handleSearchTextChange = (value: string) => {
    setSearchText(value);
    setSelectedStudyItem(null);
    setSelectedConceptReview(null);
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

    if (taskMode === "study_item" && !selectedStudyItem) {
      setErrorMessage("একটি স্টাডি আইটেম সিলেক্ট করুন।");
      return;
    }

    if (taskMode === "concept_review" && !selectedConceptReview) {
      setErrorMessage("Select a revision task.");
      return;
    }

    if (taskMode === "custom" && normalizedCustomTitle.length === 0) {
      setErrorMessage("টাস্কের নাম লিখুন।");
      return;
    }

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

    if (durationMinutes === null) {
      setErrorMessage("সময়কাল সিলেক্ট করুন।");
      return;
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
      if (taskMode === "custom") {
        await createCustomTodoTask({
          date,
          title: normalizedCustomTitle,
          startTimeMinutes: normalizedStartTime,
          durationMinutes,
          customColor,
        });
      } else if (selectedStudyItem) {
        await createTodoTask({
          date,
          studyItemId: selectedStudyItem._id as Id<"studyItems">,
          startTimeMinutes: normalizedStartTime,
          durationMinutes,
          source: "manual",
        });
      } else if (selectedConceptReview) {
        await createConceptReviewTodoTask({
          date,
          conceptId: selectedConceptReview._id as Id<"concepts">,
          startTimeMinutes: normalizedStartTime,
          durationMinutes,
          source: "manual",
        });
      }
      toast.success("টাস্ক Todo-তে যোগ হয়েছে।");
      onClose();
    } catch (error) {
      console.error("Failed to create todo task:", error);
      toast.error("টাস্ক যোগ করা যায়নি। আবার চেষ্টা করুন।");
      setErrorMessage("টাস্ক যোগ করা যায়নি। আবার চেষ্টা করুন।");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[110] flex items-end justify-center p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-near-black/25 backdrop-blur-sm animate-in fade-in duration-300" />

      <div
        className="relative flex max-h-[100dvh] w-full flex-col overflow-hidden rounded-t-[28px] bg-pure-white shadow-[0_24px_60px_rgba(0,0,0,0.12)] animate-in slide-in-from-bottom-4 duration-300 sm:max-h-[calc(100dvh-3rem)] sm:max-w-2xl sm:rounded-[32px] sm:zoom-in-95"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="shrink-0 border-b border-border-subtle px-4 py-4 sm:px-8 sm:py-5">
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-gray-200 sm:hidden" />
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-mono-code text-[11px] uppercase tracking-[0.18em] text-gray-400">
                {dayHeading}
              </p>
              <h2 className="mt-1 font-section-heading text-[1.45rem] leading-tight tracking-[-0.02em] text-on-surface sm:mt-2 sm:text-[1.7rem]">
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
        </div>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-5 sm:space-y-6 sm:px-8 sm:py-6">
            <div className="grid grid-cols-3 rounded-full border border-border-subtle bg-surface-container p-1">
              <button
                type="button"
                onClick={() => handleTaskModeChange("study_item")}
                className={`min-w-0 rounded-full px-2 py-2.5 text-xs font-medium leading-tight transition-all sm:px-4 sm:text-sm ${taskMode === "study_item"
                    ? "bg-pure-white text-on-surface shadow-sm"
                    : "text-gray-500 hover:text-on-surface"
                  }`}
              >
                স্টাডি আইটেম
              </button>
              <button
                type="button"
                onClick={() => handleTaskModeChange("concept_review")}
                className={`min-w-0 rounded-full px-2 py-2.5 text-xs font-medium leading-tight transition-all sm:px-4 sm:text-sm ${taskMode === "concept_review"
                    ? "bg-pure-white text-on-surface shadow-sm"
                    : "text-gray-500 hover:text-on-surface"
                  }`}
              >
                Revision
              </button>
              <button
                type="button"
                onClick={() => handleTaskModeChange("custom")}
                className={`min-w-0 rounded-full px-2 py-2.5 text-xs font-medium leading-tight transition-all sm:px-4 sm:text-sm ${taskMode === "custom"
                    ? "bg-pure-white text-on-surface shadow-sm"
                    : "text-gray-500 hover:text-on-surface"
                  }`}
              >
                নিজস্ব টাস্ক
              </button>
            </div>

            <div className="relative">
              <label className="mb-2 block font-label-uppercase text-label-uppercase text-gray-500">
                টাস্ক
              </label>
              {taskMode === "study_item" ? (
                <>
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
                </>
              ) : taskMode === "concept_review" ? (
                <>
                  <input
                    type="text"
                    value={searchText}
                    onChange={(event) => handleSearchTextChange(event.target.value)}
                    className="w-full rounded-full border border-border-medium bg-gray-50/60 px-4 py-3 font-body text-body text-on-surface outline-none transition-all focus:border-brand-green"
                    placeholder="Search revision..."
                    autoComplete="off"
                  />

                  {selectedConceptReview ? (
                    <SelectedConceptReviewCard conceptReview={selectedConceptReview} />
                  ) : null}
                </>
              ) : (
                <input
                  type="text"
                  value={customTitle}
                  onChange={(event) => {
                    setCustomTitle(event.target.value);
                    setErrorMessage(null);
                  }}
                  className="w-full rounded-full border border-border-medium bg-gray-50/60 px-4 py-3 font-body text-body text-on-surface outline-none transition-all focus:border-brand-green"
                  placeholder="যেমন: স্কুলে যাওয়া, ঘুম, ব্যাগ গুছানো..."
                  autoComplete="off"
                />
              )}

              {canShowResults ? (
                <div className="mt-3 overflow-hidden rounded-[24px] border border-border-subtle bg-pure-white shadow-[0_18px_50px_rgba(0,0,0,0.08)]">
                  {searchResults === undefined ? (
                    <div className="px-4 py-4 text-sm text-gray-500">
                      খোঁজা হচ্ছে...
                    </div>
                  ) : searchResults.length === 0 ? (
                    <div className="px-4 py-4 text-sm text-gray-500">
                      কোনো অসম্পূর্ণ স্টাডি আইটেম পাওয়া যায়নি।
                    </div>
                  ) : (
                    <div className="max-h-[min(22rem,48dvh)] overflow-y-auto py-2">
                      {searchResults.map((studyItem) => (
                        <button
                          key={studyItem._id}
                          type="button"
                          onClick={() => handleSelectStudyItem(studyItem)}
                          className="flex w-full min-w-0 items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-gray-50"
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
                            <span className="mt-1 block truncate text-xs text-gray-500">
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

              {canShowRevisionResults ? (
                <div className="mt-3 overflow-hidden rounded-[24px] border border-border-subtle bg-pure-white shadow-[0_18px_50px_rgba(0,0,0,0.08)]">
                  {revisionSearchResults === undefined ? (
                    <div className="px-4 py-4 text-sm text-gray-500">
                      Searching...
                    </div>
                  ) : revisionSearchResults.length === 0 ? (
                    <div className="px-4 py-4 text-sm text-gray-500">
                      No scheduled revision found.
                    </div>
                  ) : (
                    <div className="max-h-[min(22rem,48dvh)] overflow-y-auto py-2">
                      {revisionSearchResults.map((conceptReview) => (
                        <button
                          key={conceptReview._id}
                          type="button"
                          onClick={() => handleSelectConceptReview(conceptReview)}
                          className="flex w-full min-w-0 items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-gray-50"
                        >
                          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-green-light text-brand-green-deep">
                            <span className="material-symbols-outlined text-[18px]">
                              history_edu
                            </span>
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-body text-[15px] text-on-surface">
                              {conceptReview.title}
                            </span>
                            <span className="mt-1 block truncate text-xs text-gray-500">
                              {`${conceptReview.subjectName} • ${conceptReview.chapterName}`}
                            </span>
                            <span className="mt-1 block text-[11px] text-gray-400">
                              {formatReviewDateLabel(conceptReview.nextReviewAt)}
                              <span className="mx-2 text-gray-300">•</span>
                              {formatDurationLabel(conceptReview.estimatedMinutes)}
                            </span>
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : null}
            </div>

            {taskMode === "custom" ? (
              <TodoColorPicker value={customColor} onChange={setCustomColor} />
            ) : null}

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
                  value={durationMinutes ?? 15}
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

            {taskMode !== "custom" &&
              (selectedStudyItem || selectedConceptReview) &&
              durationMinutes !== null ? (
              <div className="rounded-[24px] border border-border-subtle bg-surface-container px-4 py-3 text-sm text-gray-600">
                <span className="font-medium text-on-surface">
                  ডিফল্ট সময়:
                </span>{" "}
                {formatDurationLabel(
                  selectedStudyItem?.estimatedMinutes ??
                  selectedConceptReview?.estimatedMinutes ??
                  durationMinutes,
                )}
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
          </div>

          <div className="shrink-0 border-t border-border-subtle bg-pure-white px-4 py-4 sm:flex sm:justify-end sm:gap-3 sm:px-8">
            <button
              type="button"
              onClick={onClose}
              className="hidden rounded-full px-6 py-3 font-label-uppercase text-label-uppercase text-gray-700 transition-colors hover:bg-gray-100 sm:block"
            >
              বাতিল
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className="w-full rounded-full bg-on-surface px-7 py-3 font-label-uppercase text-label-uppercase text-pure-white shadow-sm transition-all hover:bg-brand-green hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
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

function formatReviewDateLabel(nextReviewAt: number) {
  const dayBucket = new Date(nextReviewAt).toLocaleDateString("bn-BD", {
    month: "short",
    day: "numeric",
  });

  return `Review: ${dayBucket}`;
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

function SelectedConceptReviewCard({
  conceptReview,
}: {
  conceptReview: TodoConceptReviewSearchResult;
}) {
  const theme = getSubjectTheme(conceptReview.subjectColor);

  return (
    <div className="mt-3 rounded-[24px] border border-border-subtle bg-surface-container px-4 py-4">
      <div className="flex items-start gap-3">
        <span
          className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
          style={{ backgroundColor: `${theme.accentHex}18`, color: theme.accentHex }}
        >
          <span className="material-symbols-outlined text-[18px]">history_edu</span>
        </span>

        <div className="min-w-0">
          <p className="truncate font-body text-[15px] text-on-surface">
            {conceptReview.title}
          </p>
          <p className="mt-1 text-xs text-gray-500">
            {`${conceptReview.subjectName} • ${conceptReview.chapterName}`}
          </p>
          <p className="mt-1 text-[11px] text-gray-400">
            {formatReviewDateLabel(conceptReview.nextReviewAt)}
            <span className="mx-2 text-gray-300">•</span>
            {formatDurationLabel(conceptReview.estimatedMinutes)}
          </p>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import {
  DAY_COUNT,
  DAY_MS,
  buildDayHeading,
  formatDayNumber,
  formatDurationLabel,
  formatMonthLabel,
  formatShortWeekday,
  getDhakaDayBucket,
} from "./todoAgendaTime";

type PlannerDay = {
  date: number;
  isToday: boolean;
  isSelected: boolean;
  dayNumber: string;
  shortWeekday: string;
};

type PlannerSessionInfo = {
  _id: string;
  latestGeneratedAt?: number;
  latestAvailableMinutes?: number;
  latestComment?: string;
  generationCount: number;
} | null;

export default function PlannerWorkspace() {
  const [now] = useState(() => Date.now());
  const today = getDhakaDayBucket(now);
  const [rangeStartDate, setRangeStartDate] = useState(today);
  const [selectedDate, setSelectedDate] = useState(today);
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);

  const plannerData = useQuery(api.plannerQueries.getPlannerPageData, {
    date: selectedDate,
  });
  const generatePlannerSuggestions = useMutation(
    api.mutations.generatePlannerSuggestions,
  );
  const acceptPlannerSuggestion = useMutation(
    api.mutations.acceptPlannerSuggestion,
  );
  const dismissPlannerSuggestion = useMutation(
    api.mutations.dismissPlannerSuggestion,
  );

  const days: PlannerDay[] = Array.from({ length: DAY_COUNT }, (_, index) => {
    const date = rangeStartDate + index * DAY_MS;
    return {
      date,
      isToday: date === today,
      isSelected: date === selectedDate,
      dayNumber: formatDayNumber(date),
      shortWeekday: formatShortWeekday(date),
    };
  });

  const selectedHeading = buildDayHeading(selectedDate, today);

  const handleGenerate = async (draft: {
    availableMinutes: string;
    comment: string;
  }) => {
    const parsedMinutes = Number(draft.availableMinutes);
    if (!Number.isFinite(parsedMinutes) || parsedMinutes <= 0) {
      setErrorMessage("পড়ার সময় মিনিটে লিখুন।");
      return;
    }

    setIsGenerating(true);
    setErrorMessage(null);
    setNoticeMessage(null);

    try {
      const result = await generatePlannerSuggestions({
        date: selectedDate,
        availableMinutes: parsedMinutes,
        comment: draft.comment.trim() || undefined,
      });

      setNoticeMessage(
        result.appendedCount > 0
          ? `${result.appendedCount}টি নতুন সাজেশন যোগ হয়েছে।`
          : "নতুন কোনো সাজেশন যোগ হয়নি।",
      );
    } catch (error) {
      console.error("Failed to generate planner suggestions:", error);
      setErrorMessage("প্ল্যান তৈরি করা যায়নি। আবার চেষ্টা করুন।");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleAcceptSuggestion = async (suggestionId: string) => {
    setErrorMessage(null);
    setNoticeMessage(null);

    try {
      await acceptPlannerSuggestion({
        suggestionId: suggestionId as Id<"plannerSuggestions">,
      });
      setNoticeMessage("টাস্কটি Todo-তে যোগ হয়েছে।");
    } catch (error) {
      console.error("Failed to accept planner suggestion:", error);
      setErrorMessage("সাজেশনটি Todo-তে যোগ করা যায়নি।");
    }
  };

  const handleDismissSuggestion = async (suggestionId: string) => {
    setErrorMessage(null);
    setNoticeMessage(null);

    try {
      await dismissPlannerSuggestion({
        suggestionId: suggestionId as Id<"plannerSuggestions">,
      });
      setNoticeMessage("সাজেশনটি তালিকা থেকে সরিয়ে দেওয়া হয়েছে।");
    } catch (error) {
      console.error("Failed to dismiss planner suggestion:", error);
      setErrorMessage("সাজেশন সরানো যায়নি।");
    }
  };

  return (
    <div className="space-y-8">
      <section className="rounded-[36px] border border-border-subtle bg-white p-6 shadow-[0_18px_60px_rgba(0,0,0,0.04)] dark:bg-pure-white dark:shadow-none md:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="font-mono-code text-[11px] uppercase tracking-[0.18em] text-brand-green">
              AI Planner
            </p>
            <h1 className="mt-3 font-section-heading text-[2rem] leading-tight tracking-[-0.04em] text-on-surface md:text-section-heading">
              আজকের পড়া সাজিয়ে নিন
            </h1>
            <p className="mt-3 max-w-2xl font-body text-sm text-gray-500 md:text-base">
              সময়, পছন্দ আর চলতি অগ্রগতির উপর ভিত্তি করে কাজ সাজিয়ে নিন।
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center rounded-full border border-border-subtle bg-pure-white p-1 dark:bg-surface-container">
              <button
                type="button"
                onClick={() => {
                  setRangeStartDate((current) => current - DAY_COUNT * DAY_MS);
                  setSelectedDate((current) => current - DAY_COUNT * DAY_MS);
                }}
                className="flex h-9 w-9 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-100 hover:text-on-surface"
              >
                <span className="material-symbols-outlined text-[18px]">
                  chevron_left
                </span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setRangeStartDate(today);
                  setSelectedDate(today);
                }}
                className="rounded-full px-4 py-2 font-body text-sm text-on-surface transition-colors hover:bg-gray-100"
              >
                আজ
              </button>
              <button
                type="button"
                onClick={() => {
                  setRangeStartDate((current) => current + DAY_COUNT * DAY_MS);
                  setSelectedDate((current) => current + DAY_COUNT * DAY_MS);
                }}
                className="flex h-9 w-9 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-100 hover:text-on-surface"
              >
                <span className="material-symbols-outlined text-[18px]">
                  chevron_right
                </span>
              </button>
            </div>
          </div>
        </div>

        <p className="mt-5 font-body text-sm text-gray-500 md:text-base">
          {formatMonthLabel(selectedDate)}
        </p>

        <div className="mt-5 grid grid-cols-7 gap-2">
          {days.map((day) => (
            <button
              type="button"
              key={day.date}
              onClick={() => setSelectedDate(day.date)}
              className={`rounded-2xl px-2 py-3 text-center transition-colors ${
                day.isSelected
                  ? "bg-on-surface text-pure-white shadow-[0_6px_20px_rgba(0,0,0,0.08)]"
                  : day.isToday
                    ? "bg-emerald-50 text-brand-green dark:bg-emerald-900/20"
                    : "text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-100"
              }`}
            >
              <div
                className={`font-mono-code text-[10px] uppercase tracking-[0.18em] md:text-[11px] ${
                  day.isSelected ? "text-pure-white/80" : "text-gray-400"
                }`}
              >
                {day.shortWeekday}
              </div>
              <div className="mt-1 font-card-title text-lg leading-none md:text-xl">
                {day.dayNumber}
              </div>
            </button>
          ))}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.05fr_1.35fr]">
        <PlannerComposerCard
          key={`${selectedDate}:${plannerData?.session?._id ?? "new"}:${plannerData?.session?.generationCount ?? 0}`}
          selectedHeading={selectedHeading}
          session={plannerData?.session ?? null}
          isGenerating={isGenerating}
          errorMessage={errorMessage}
          noticeMessage={noticeMessage}
          onGenerate={handleGenerate}
        />

        <div className="rounded-[32px] border border-border-subtle bg-white p-6 shadow-[0_18px_60px_rgba(0,0,0,0.04)] dark:bg-pure-white dark:shadow-none">
          <div className="flex items-start justify-between gap-4 border-b border-border-subtle pb-4">
            <div>
              <p className="font-mono-code text-[11px] uppercase tracking-[0.18em] text-gray-400">
                Suggestions
              </p>
              <h2 className="mt-2 font-card-title text-[1.45rem] text-on-surface">
                সাজেস্টেড টাস্ক
              </h2>
            </div>
            <span className="rounded-full bg-surface-container px-3 py-1 font-mono-code text-[11px] uppercase tracking-[0.18em] text-gray-500">
              {plannerData?.suggestions.length ?? 0} items
            </span>
          </div>

          <div className="mt-4 space-y-4">
            {plannerData === undefined ? (
              <div className="flex items-center justify-center py-24">
                <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-brand-green" />
              </div>
            ) : plannerData.suggestions.length === 0 ? (
              <div className="rounded-[28px] border border-dashed border-border-medium bg-surface-container px-6 py-12 text-center">
                <span className="material-symbols-outlined text-4xl text-gray-300">
                  psychology
                </span>
                <p className="mt-4 font-body text-sm text-gray-500 md:text-base">
                  এই দিনের জন্য এখনো কোনো সাজেশন নেই।
                </p>
              </div>
            ) : (
              plannerData.suggestions.map((suggestion, index) => (
                <PlannerSuggestionCard
                  key={`${suggestion._id}-${index}`}
                  suggestion={suggestion}
                  onAccept={() => void handleAcceptSuggestion(suggestion._id)}
                  onDismiss={() => void handleDismissSuggestion(suggestion._id)}
                />
              ))
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function PlannerComposerCard({
  selectedHeading,
  session,
  isGenerating,
  errorMessage,
  noticeMessage,
  onGenerate,
}: {
  selectedHeading: string;
  session: PlannerSessionInfo;
  isGenerating: boolean;
  errorMessage: string | null;
  noticeMessage: string | null;
  onGenerate: (draft: { availableMinutes: string; comment: string }) => void;
}) {
  const [availableMinutes, setAvailableMinutes] = useState(() =>
    String(session?.latestAvailableMinutes ?? 120),
  );
  const [comment, setComment] = useState(session?.latestComment ?? "");

  return (
    <div className="rounded-[32px] border border-border-subtle bg-white p-6 shadow-[0_18px_60px_rgba(0,0,0,0.04)] dark:bg-pure-white dark:shadow-none">
      <p className="font-mono-code text-[11px] uppercase tracking-[0.18em] text-gray-400">
        {selectedHeading}
      </p>
      <h2 className="mt-3 font-card-title text-[1.45rem] text-on-surface">
        প্ল্যানার ইনপুট
      </h2>

      <div className="mt-6 space-y-5">
        <div>
          <label className="mb-2 block font-label-uppercase text-label-uppercase text-gray-500">
            আজ কত মিনিট পড়বেন?
          </label>
          <input
            type="number"
            min={15}
            step={5}
            value={availableMinutes}
            onChange={(event) => setAvailableMinutes(event.target.value)}
            className="w-full rounded-full border border-border-medium bg-gray-50/60 px-4 py-3 font-body text-body text-on-surface outline-none transition-all focus:border-brand-green dark:bg-surface-container"
            placeholder="যেমন 120"
          />
        </div>

        <div>
          <label className="mb-2 block font-label-uppercase text-label-uppercase text-gray-500">
            মন্তব্য (ঐচ্ছিক)
          </label>
          <textarea
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            rows={5}
            className="w-full rounded-[24px] border border-border-medium bg-gray-50/60 px-4 py-3 font-body text-body text-on-surface outline-none transition-all focus:border-brand-green dark:bg-surface-container"
            placeholder="যেমন: আজ Physics-এ বেশি সময় দিতে চাই। অথবা, গতি অধ্যায়ে পরীক্ষা আছে।"
          />
        </div>

        {session ? (
          <div className="rounded-[24px] border border-border-subtle bg-surface-container px-4 py-4 text-sm text-gray-600">
            <p className="font-medium text-on-surface">
              আগের জেনারেশন: {session.generationCount} বার
            </p>
            {session.latestGeneratedAt ? (
              <p className="mt-1">
                শেষ আপডেট:{" "}
                {new Date(session.latestGeneratedAt).toLocaleString("bn-BD")}
              </p>
            ) : null}
          </div>
        ) : null}

        {errorMessage ? (
          <div className="rounded-[20px] border border-[#f1c2bc] bg-[#fff4f2] px-4 py-3 text-sm text-[#c54f41] dark:border-red-400/20 dark:bg-red-950/20 dark:text-red-200">
            {errorMessage}
          </div>
        ) : null}

        {noticeMessage ? (
          <div className="rounded-[20px] border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-brand-green-deep dark:border-emerald-300/15 dark:bg-emerald-950/20 dark:text-emerald-200">
            {noticeMessage}
          </div>
        ) : null}

        <button
          type="button"
          onClick={() => onGenerate({ availableMinutes, comment })}
          disabled={isGenerating}
          className="w-full rounded-full bg-on-surface px-7 py-3 font-label-uppercase text-label-uppercase text-pure-white shadow-sm transition-all hover:bg-brand-green hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isGenerating ? "প্ল্যান তৈরি হচ্ছে..." : "প্ল্যান তৈরি করুন"}
        </button>
      </div>
    </div>
  );
}

function PlannerSuggestionCard({
  suggestion,
  onAccept,
  onDismiss,
}: {
  suggestion: {
    _id: string;
    kind: "study_item" | "concept_review";
    title: string;
    subjectName: string;
    chapterName: string;
    conceptName?: string;
    subjectColor?: string;
    durationMinutes: number;
    generationRound: number;
    isAccepted: boolean;
    isCompleted: boolean;
    isAvailable: boolean;
  };
  onAccept: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="rounded-[28px] border border-border-subtle bg-white px-5 py-5 shadow-[0_12px_30px_rgba(0,0,0,0.03)] dark:bg-surface-container dark:shadow-none">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <h3 className="mt-3 font-sub-heading text-lg text-on-surface">
            {suggestion.title}
          </h3>
          <p className="mt-2 font-body text-sm text-gray-500">
            {suggestion.subjectName} • {suggestion.chapterName}
            {suggestion.conceptName ? ` • ${suggestion.conceptName}` : ""}
          </p>
          <p className="mt-2 font-mono-code text-[11px] uppercase tracking-[0.16em] text-gray-400">
            {formatDurationLabel(suggestion.durationMinutes)}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2 self-start">
          {!suggestion.isAccepted && !suggestion.isCompleted ? (
            <button
              type="button"
              onClick={onDismiss}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-border-subtle text-gray-400 transition-all hover:border-[#f1c2bc] hover:bg-[#fff4f2] hover:text-[#c54f41] dark:hover:border-red-400/20 dark:hover:bg-red-950/20 dark:hover:text-red-200"
              aria-label="Remove suggestion"
            >
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          ) : null}

          <button
            type="button"
            onClick={onAccept}
            disabled={
              suggestion.isAccepted || suggestion.isCompleted || !suggestion.isAvailable
            }
            className="rounded-full bg-on-surface px-5 py-2.5 font-label-uppercase text-label-uppercase text-pure-white transition-all hover:bg-brand-green disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400"
          >
            {suggestion.isCompleted
              ? "সম্পন্ন"
              : suggestion.isAccepted
                ? "Todo-তে আছে"
                : suggestion.isAvailable
                  ? "Todo-তে নিন"
                  : "Unavailable"}
          </button>
        </div>
      </div>
    </div>
  );
}

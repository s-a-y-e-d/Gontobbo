"use client";

import { SignInButton } from "@clerk/nextjs";
import {
  Authenticated,
  AuthLoading,
  Unauthenticated,
  useConvexAuth,
  useMutation,
  useQuery,
} from "convex/react";
import { startTransition, useEffect, useEffectEvent, useState } from "react";
import NavigationLayout from "@/components/features/NavigationLayout";
import { api } from "@/convex/_generated/api";
import { useTheme } from "@/components/ThemeProvider";
import { AuthLoadingSkeleton } from "./LoadingSkeletons";

type BootstrapState = "idle" | "bootstrapping" | "ready" | "error";
type OnboardingClassLevel = "hsc" | "other";
type TrackerConfig = {
  key: string;
  label: string;
  avgMinutes: number;
};
type HscChapterOption = {
  name: string;
  slug: string;
  order: number;
};
type HscSubjectOption = {
  name: string;
  slug: string;
  icon: string;
  color: string;
  chapters: HscChapterOption[];
};
type SelectedNextTermChapter = {
  subjectSlug: string;
  chapterSlug: string;
};
type OnboardingSetupPayload = {
  classLevel: OnboardingClassLevel;
  termStartDate: number;
  nextTermExamDate: number;
  chapterTrackers: TrackerConfig[];
  conceptTrackers: TrackerConfig[];
  selectedNextTermChapters: SelectedNextTermChapter[];
};

const DHAKA_OFFSET_MS = 6 * 60 * 60 * 1000;
const DEFAULT_TERM_LENGTH_MS = 120 * 24 * 60 * 60 * 1000;
const DEFAULT_CHAPTER_TRACKERS: TrackerConfig[] = [
  { key: "mcq", label: "MCQ", avgMinutes: 30 },
  { key: "board", label: "Board", avgMinutes: 45 },
  { key: "cq", label: "CQ", avgMinutes: 45 },
  { key: "model-test", label: "Model Test", avgMinutes: 60 },
];
const DEFAULT_CONCEPT_TRACKERS: TrackerConfig[] = [
  { key: "class", label: "Class", avgMinutes: 20 },
  { key: "book", label: "Book", avgMinutes: 25 },
  { key: "notes", label: "Notes", avgMinutes: 20 },
  { key: "revision", label: "Revision", avgMinutes: 15 },
];
const bnNumberFormatter = new Intl.NumberFormat("bn-BD");

function getDhakaDayBucket(timestamp: number) {
  const dhakaTime = new Date(timestamp + DHAKA_OFFSET_MS);
  dhakaTime.setUTCHours(0, 0, 0, 0);
  return dhakaTime.getTime() - DHAKA_OFFSET_MS;
}

function formatDateInputValue(timestamp: number) {
  const dhakaDate = new Date(timestamp + DHAKA_OFFSET_MS);
  const year = dhakaDate.getUTCFullYear();
  const month = String(dhakaDate.getUTCMonth() + 1).padStart(2, "0");
  const day = String(dhakaDate.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateInputValue(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return null;
  }
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) - DHAKA_OFFSET_MS;
}

function toTrackerKey(label: string, index: number) {
  const key = label
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .trim();
  return key || `tracker-${index + 1}`;
}

function normalizeTrackerDrafts(trackers: TrackerConfig[]) {
  const usedKeys = new Set<string>();
  return trackers.map((tracker, index) => {
    const baseKey = tracker.key.trim() || toTrackerKey(tracker.label, index);
    let key = baseKey;
    let counter = 2;
    while (usedKeys.has(key)) {
      key = `${baseKey}-${counter}`;
      counter += 1;
    }
    usedKeys.add(key);
    return {
      key,
      label: tracker.label.trim(),
      avgMinutes: Math.min(Math.max(Math.round(tracker.avgMinutes), 1), 600),
    };
  });
}

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  if (!mounted) {
    return null;
  }

  return (
    <button
      type="button"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
      className="fixed top-4 right-4 sm:top-6 sm:right-6 z-50 flex h-10 w-10 items-center justify-center rounded-full border border-border-subtle bg-white/80 dark:bg-slate-900/80 backdrop-blur-md text-slate-500 dark:text-slate-400 hover:text-brand-green dark:hover:text-brand-green shadow-[0_2px_8px_rgba(0,0,0,0.04)] dark:shadow-[0_4px_16px_rgba(0,0,0,0.2)] hover:scale-105 active:scale-95 cursor-pointer transition-all duration-200"
      aria-label="Toggle theme"
      title="Toggle theme"
    >
      <span className="material-symbols-outlined text-[20px] leading-none">
        {resolvedTheme === "dark" ? "light_mode" : "dark_mode"}
      </span>
    </button>
  );
}

function CenteredMessage({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative min-h-screen bg-background px-4 py-10 text-near-black flex items-center justify-center overflow-hidden">
      {/* Luminous floating ambient blurs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-[30%] -left-[20%] h-[70%] w-[70%] rounded-full bg-brand-green/15 blur-[120px] dark:bg-brand-green/5" />
        <div className="absolute -bottom-[30%] -right-[20%] h-[70%] w-[70%] rounded-full bg-brand-green/10 blur-[120px] dark:bg-brand-green/5" />
      </div>

      <div className="relative z-10 w-full max-w-md rounded-[32px] border border-border-subtle bg-white/80 backdrop-blur-xl p-8 text-center shadow-[0_8px_32px_rgba(0,0,0,0.02)] dark:shadow-[0_16px_48px_rgba(0,0,0,0.3)]">
        {children}
      </div>
    </main>
  );
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function OnboardingClassPicker({
  isSubmitting,
  onSubmit,
}: {
  isSubmitting: boolean;
  onSubmit: (classLevel: OnboardingClassLevel) => void;
}) {
  const [selectedClassLevel, setSelectedClassLevel] =
    useState<OnboardingClassLevel>("hsc");
  const options: Array<{
    value: OnboardingClassLevel;
    title: string;
    description: string;
    icon: string;
  }> = [
    {
      value: "hsc",
      title: "HSC সিলেবাস",
      description: "বিজ্ঞান বিভাগের বিষয় ও অধ্যায় তৈরি হবে",
      icon: "school",
    },
    {
      value: "other",
      title: "অন্যান্য",
      description: "খালি ওয়ার্কস্পেস দিয়ে শুরু করুন",
      icon: "edit_note",
    },
  ];

  return (
    <CenteredMessage>
      <div className="space-y-6 text-left">
        <div className="space-y-3 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-[20px] bg-brand-green-light dark:bg-brand-green/10 text-brand-green-deep dark:text-brand-green border border-brand-green/10 dark:border-brand-green/20 shadow-[0_4px_12px_rgba(24,226,153,0.15)] mb-3">
            <span className="material-symbols-outlined text-[30px] animate-pulse">explore</span>
          </div>

          <p className="font-mono-code text-[11px] uppercase tracking-[0.24em] text-brand-green-deep dark:text-brand-green font-bold">
            GONTOBBO ACADEMIC OS
          </p>
          <h1 className="text-3xl font-bold tracking-tight text-near-black">
            তুমি কী দিয়ে শুরু করতে চাও?
          </h1>
          <p className="text-xs leading-5 text-gray-500 dark:text-gray-400 max-w-sm mx-auto">
            HSC বেছে নিলে বিজ্ঞান বিভাগের সিলেবাস তৈরি হবে। অন্যান্য বেছে নিলে একদম খালি জায়গা থেকে নিজের বিষয় যোগ করতে পারবে।
          </p>
        </div>

        <div className="space-y-3">
          {options.map((option) => {
            const isSelected = selectedClassLevel === option.value;
            return (
              <button
                key={option.value}
                type="button"
                disabled={isSubmitting}
                onClick={() => setSelectedClassLevel(option.value)}
                className={`flex w-full items-center gap-4 rounded-[24px] border p-5 text-left transition-all duration-200 hover:scale-[1.01] active:scale-[0.99] cursor-pointer disabled:cursor-not-allowed disabled:opacity-70 ${
                  isSelected
                    ? "border-brand-green bg-brand-green-light/40 dark:bg-brand-green/10 ring-4 ring-brand-green/10"
                    : "border-border-subtle bg-pure-white hover:bg-gray-50/50 hover:border-border-medium"
                }`}
                aria-pressed={isSelected}
              >
                <span
                  className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl shadow-sm transition-colors ${
                    isSelected
                      ? "bg-pure-white text-brand-green-deep dark:bg-slate-900 dark:text-brand-green"
                      : "bg-slate-50 text-gray-500 dark:bg-slate-800 dark:text-gray-300"
                  }`}
                >
                  <span className="material-symbols-outlined text-[24px]">
                    {option.icon}
                  </span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-base font-bold text-near-black">
                    {option.title}
                  </span>
                  <span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">
                    {option.description}
                  </span>
                </span>
                <span
                  className={`material-symbols-outlined text-[24px] transition-colors ${
                    isSelected ? "text-brand-green-deep dark:text-brand-green" : "text-gray-300 dark:text-gray-600"
                  }`}
                >
                  {isSelected ? "check_circle" : "radio_button_unchecked"}
                </span>
              </button>
            );
          })}
        </div>

        <button
          type="button"
          disabled={isSubmitting}
          onClick={() => onSubmit(selectedClassLevel)}
          className="inline-flex w-full items-center justify-center rounded-full bg-near-black px-5 py-3 text-xs font-bold text-pure-white shadow-[0_2px_4px_rgba(0,0,0,0.06)] hover:bg-brand-green hover:text-near-black hover:scale-[1.01] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer transition-all duration-200"
        >
          {isSubmitting
            ? "সেটআপ হচ্ছে..."
            : selectedClassLevel === "hsc"
              ? "HSC দিয়ে শুরু করুন"
              : "অন্যান্য দিয়ে শুরু করুন"}
        </button>
      </div>
    </CenteredMessage>
  );
}

function OnboardingFlow({
  defaults,
  hscSubjects,
  isSubmitting,
  onSubmit,
}: {
  defaults?: {
    chapterTrackers: TrackerConfig[];
    conceptTrackers: TrackerConfig[];
  };
  hscSubjects: HscSubjectOption[];
  isSubmitting: boolean;
  onSubmit: (payload: OnboardingSetupPayload) => void;
}) {
  const [today] = useState(() => getDhakaDayBucket(Date.now()));
  const [step, setStep] = useState(0);
  const [classLevel, setClassLevel] = useState<OnboardingClassLevel>("hsc");
  const [termStartDate, setTermStartDate] = useState(formatDateInputValue(today));
  const [nextTermExamDate, setNextTermExamDate] = useState(
    formatDateInputValue(today + DEFAULT_TERM_LENGTH_MS),
  );
  const [chapterTrackers, setChapterTrackers] = useState<TrackerConfig[]>(
    defaults?.chapterTrackers ?? DEFAULT_CHAPTER_TRACKERS,
  );
  const [conceptTrackers, setConceptTrackers] = useState<TrackerConfig[]>(
    defaults?.conceptTrackers ?? DEFAULT_CONCEPT_TRACKERS,
  );
  const [selectedChapterKeys, setSelectedChapterKeys] = useState<Set<string>>(
    () => new Set(),
  );
  const [openSubjectSlug, setOpenSubjectSlug] = useState(
    () => hscSubjects[0]?.slug ?? "",
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const maxStep = classLevel === "hsc" ? 3 : 2;
  const parsedTermStartDate = parseDateInputValue(termStartDate);
  const parsedNextTermExamDate = parseDateInputValue(nextTermExamDate);
  const datesAreValid =
    parsedTermStartDate !== null &&
    parsedNextTermExamDate !== null &&
    parsedTermStartDate < parsedNextTermExamDate;
  const trackersAreValid =
    chapterTrackers.some((tracker) => tracker.label.trim()) &&
    conceptTrackers.some((tracker) => tracker.label.trim());
  const selectedNextTermChapterCount = selectedChapterKeys.size;

  const updateTracker = (
    scope: "chapter" | "concept",
    index: number,
    patch: Partial<TrackerConfig>,
  ) => {
    const setter = scope === "chapter" ? setChapterTrackers : setConceptTrackers;
    setter((current) =>
      current.map((tracker, trackerIndex) =>
        trackerIndex === index ? { ...tracker, ...patch } : tracker,
      ),
    );
  };

  const removeTracker = (scope: "chapter" | "concept", index: number) => {
    const setter = scope === "chapter" ? setChapterTrackers : setConceptTrackers;
    setter((current) => current.filter((_, trackerIndex) => trackerIndex !== index));
  };

  const addTracker = (scope: "chapter" | "concept") => {
    const setter = scope === "chapter" ? setChapterTrackers : setConceptTrackers;
    setter((current) => [
      ...current,
      { key: `tracker-${current.length + 1}`, label: "", avgMinutes: 30 },
    ]);
  };

  const getChapterKey = (subjectSlug: string, chapterSlug: string) =>
    `${subjectSlug}/${chapterSlug}`;

  const toggleChapter = (subjectSlug: string, chapterSlug: string) => {
    const key = getChapterKey(subjectSlug, chapterSlug);
    setSelectedChapterKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const getSelectedSubjectChapterCount = (subject: HscSubjectOption) =>
    subject.chapters.reduce(
      (count, chapter) =>
        selectedChapterKeys.has(getChapterKey(subject.slug, chapter.slug))
          ? count + 1
          : count,
      0,
    );

  const goNext = () => {
    setErrorMessage(null);
    if (step === 1 && !datesAreValid) {
      setErrorMessage("টার্ম শুরুর তারিখ পরীক্ষা তারিখের আগে হতে হবে।");
      return;
    }
    if (step === 2 && !trackersAreValid) {
      setErrorMessage("কমপক্ষে একটি chapter tracker এবং একটি concept tracker রাখুন।");
      return;
    }
    if (step === 3 && classLevel === "hsc" && selectedNextTermChapterCount === 0) {
      setErrorMessage("পরবর্তী পরীক্ষার জন্য কমপক্ষে একটি অধ্যায় বেছে নিন।");
      return;
    }
    setStep((current) => Math.min(current + 1, maxStep));
  };

  const finish = () => {
    if (!datesAreValid || parsedTermStartDate === null || parsedNextTermExamDate === null) {
      setErrorMessage("তারিখগুলো ঠিক করে দিন।");
      return;
    }
    const normalizedChapterTrackers = normalizeTrackerDrafts(
      chapterTrackers.filter((tracker) => tracker.label.trim()),
    );
    const normalizedConceptTrackers = normalizeTrackerDrafts(
      conceptTrackers.filter((tracker) => tracker.label.trim()),
    );
    if (normalizedChapterTrackers.length === 0 || normalizedConceptTrackers.length === 0) {
      setErrorMessage("কমপক্ষে একটি chapter tracker এবং একটি concept tracker রাখুন।");
      return;
    }
    if (classLevel === "hsc" && selectedNextTermChapterCount === 0) {
      setErrorMessage("পরবর্তী পরীক্ষার জন্য কমপক্ষে একটি অধ্যায় বেছে নিন।");
      return;
    }
    const selectedNextTermChapters = hscSubjects.flatMap((subject) =>
      subject.chapters
        .filter((chapter) =>
          selectedChapterKeys.has(getChapterKey(subject.slug, chapter.slug)),
        )
        .map((chapter) => ({
          subjectSlug: subject.slug,
          chapterSlug: chapter.slug,
        })),
    );
    onSubmit({
      classLevel,
      termStartDate: parsedTermStartDate,
      nextTermExamDate: parsedNextTermExamDate,
      chapterTrackers: normalizedChapterTrackers,
      conceptTrackers: normalizedConceptTrackers,
      selectedNextTermChapters:
        classLevel === "hsc" ? selectedNextTermChapters : [],
    });
  };

  return (
    <main className="relative min-h-screen bg-background px-3 py-4 text-near-black sm:px-4 sm:py-8 flex items-center justify-center overflow-hidden">
      {/* Luminous floating ambient blurs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-[40%] -left-[20%] h-[80%] w-[80%] rounded-full bg-brand-green/15 blur-[120px] dark:bg-brand-green/5" />
        <div className="absolute -bottom-[40%] -right-[20%] h-[80%] w-[80%] rounded-full bg-brand-green/10 blur-[120px] dark:bg-brand-green/5" />
      </div>

      <section className="relative z-10 mx-auto flex h-[min(680px,calc(100vh-2rem))] w-full max-w-2xl flex-col overflow-hidden rounded-[28px] border border-border-subtle bg-white/80 backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.02)] dark:shadow-[0_16px_48px_rgba(0,0,0,0.3)]">
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-6 text-left sm:px-8 sm:py-8 scrollbar-thin">
          <div className="text-center space-y-3 mb-6">
            {/* Pulsing Compass Emblem */}
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-[20px] bg-brand-green-light dark:bg-brand-green/10 text-brand-green-deep dark:text-brand-green border border-brand-green/10 dark:border-brand-green/20 shadow-[0_4px_12px_rgba(24,226,153,0.15)] mb-3">
              <span className="material-symbols-outlined text-[30px] animate-pulse">explore</span>
            </div>

            <p className="font-mono-code text-[11px] uppercase tracking-[0.24em] text-brand-green-deep dark:text-brand-green font-bold">
              SETUP {step + 1} OF {maxStep + 1}
            </p>
            <h1 className="text-3xl font-bold tracking-tight text-near-black">
              {step === 0
                ? "আপনার পড়ার ধরন"
                : step === 1
                  ? "টার্ম ও পরীক্ষা"
                  : step === 2
                    ? "ডিফল্ট ট্র্যাকার"
                    : "পরবর্তী পরীক্ষার সিলেবাস"}
            </h1>
            <p className="text-xs leading-5 text-gray-500 dark:text-gray-400 max-w-md mx-auto">
              {step === 0
                ? "শুরুতে আপনার ক্লাস ধরনটি বেছে নিন। এটি সিলেবাস লোড করতে সাহায্য করবে।"
                : step === 1
                  ? "টার্মের শুরুর তারিখ ও পরীক্ষার সম্ভাব্য সময় দিন। ড্যাশবোর্ড আপনার অগ্রগতি পরিমাপ করবে।"
                  : step === 2
                    ? "পড়াশোনার সময় ট্র্যাকিংয়ের ধরনগুলো নিচে দেওয়া হলো। আপনার পছন্দমতো পরিবর্তন করতে পারেন।"
                    : "যে অধ্যায়গুলো পরবর্তী পরীক্ষায় রয়েছে সেগুলো নির্বাচন করুন। বাকিগুলো ড্যাশবোর্ড থেকে পরে যোগ করতে পারবেন।"}
            </p>
          </div>

          {step === 0 ? (
            <div className="grid gap-3">
              {(["hsc", "other"] as const).map((value) => {
                const isSelected = classLevel === value;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setClassLevel(value)}
                    className={`flex w-full items-center gap-4 rounded-[24px] border p-5 text-left transition-all duration-200 hover:scale-[1.01] active:scale-[0.99] cursor-pointer disabled:cursor-not-allowed disabled:opacity-70 ${
                      isSelected
                        ? "border-brand-green bg-brand-green-light/40 dark:bg-brand-green/10 ring-4 ring-brand-green/10"
                        : "border-border-subtle bg-pure-white hover:bg-gray-50/50 hover:border-border-medium"
                    }`}
                  >
                    <span
                      className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl shadow-sm transition-colors ${
                        isSelected
                          ? "bg-pure-white text-brand-green-deep dark:bg-slate-900 dark:text-brand-green"
                          : "bg-slate-50 text-gray-500 dark:bg-slate-800 dark:text-gray-300"
                      }`}
                    >
                      <span className="material-symbols-outlined text-[24px]">
                        {value === "hsc" ? "school" : "edit_note"}
                      </span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-base font-bold text-near-black">
                        {value === "hsc" ? "HSC সিলেবাস" : "অন্যান্য / কাস্টম"}
                      </span>
                      <span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">
                        {value === "hsc"
                          ? "HSC বিজ্ঞান বিভাগের পদার্থ, রসায়ন, জীববিজ্ঞান ও গণিত সিলেবাস স্বয়ংক্রিয়ভাবে লোড হবে।"
                          : "একদম খালি ড্যাশবোর্ড দিয়ে শুরু করুন এবং আপনার নিজের পছন্দমতো বিষয় ও ট্র্যাকার তৈরি করুন।"}
                      </span>
                    </span>
                    <span
                      className={`material-symbols-outlined text-[24px] transition-colors ${
                        isSelected ? "text-brand-green-deep dark:text-brand-green" : "text-gray-300 dark:text-gray-600"
                      }`}
                    >
                      {isSelected ? "check_circle" : "radio_button_unchecked"}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : null}

          {step === 1 ? (
            <div className="grid gap-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <DateField label="টার্ম শুরু" value={termStartDate} onChange={setTermStartDate} />
                <DateField label="পরীক্ষার তারিখ" value={nextTermExamDate} onChange={setNextTermExamDate} />
              </div>

              {datesAreValid ? (
                <div className="flex items-center gap-3 rounded-2xl border border-brand-green/10 bg-brand-green-light dark:bg-brand-green/10 p-4 text-brand-green-deep dark:text-brand-green shadow-sm">
                  <span className="material-symbols-outlined text-[24px] shrink-0">schedule</span>
                  <div className="text-xs leading-5">
                    <span className="font-bold block mb-0.5">প্রস্তুতির নির্ধারিত সময়কাল:</span>
                    <span>
                      সর্বমোট{" "}
                      <span className="font-mono-code font-bold text-[14px] px-1 bg-brand-green/20 dark:bg-brand-green/30 rounded-md">
                        {bnNumberFormatter.format(Math.round((parsedNextTermExamDate! - parsedTermStartDate!) / (24 * 60 * 60 * 1000)))}
                      </span>{" "}
                      দিন (অর্থাৎ{" "}
                      <span className="font-mono-code font-bold text-[14px] px-1 bg-brand-green/20 dark:bg-brand-green/30 rounded-md">
                        {bnNumberFormatter.format(Math.floor(Math.round((parsedNextTermExamDate! - parsedTermStartDate!) / (24 * 60 * 60 * 1000)) / 7))}
                      </span>{" "}
                      সপ্তাহ{" "}
                      <span className="font-mono-code font-bold text-[14px] px-1 bg-brand-green/20 dark:bg-brand-green/30 rounded-md">
                        {bnNumberFormatter.format(Math.round((parsedNextTermExamDate! - parsedTermStartDate!) / (24 * 60 * 60 * 1000)) % 7)}
                      </span>{" "}
                      দিন)। এই সময় অনুযায়ী আপনার পড়ার দৈনিক লক্ষ্যমাত্রা হিসাব করা হবে।
                    </span>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3 rounded-2xl border border-error-red/10 bg-error-red/10 p-4 text-error-red">
                  <span className="material-symbols-outlined text-[24px] shrink-0">error</span>
                  <p className="text-xs font-semibold leading-5">
                    অনুগ্রহ করে একটি সঠিক তারিখের ব্যাপ্তি দিন। টার্ম শুরুর তারিখ অবশ্যই পরীক্ষার তারিখের পূর্বে হতে হবে।
                  </p>
                </div>
              )}
            </div>
          ) : null}

          {step === 2 ? (
            <div className="space-y-6">
              <TrackerEditor
                title="Chapter trackers"
                trackers={chapterTrackers}
                onAdd={() => addTracker("chapter")}
                onRemove={(index) => removeTracker("chapter", index)}
                onUpdate={(index, patch) => updateTracker("chapter", index, patch)}
              />
              <div className="border-t border-border-subtle" />
              <TrackerEditor
                title="Concept trackers"
                trackers={conceptTrackers}
                onAdd={() => addTracker("concept")}
                onRemove={(index) => removeTracker("concept", index)}
                onUpdate={(index, patch) => updateTracker("concept", index, patch)}
              />
            </div>
          ) : null}

          {step === 3 ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2 rounded-2xl border border-brand-green/10 bg-brand-green-light dark:bg-brand-green/10 px-4 py-3 text-sm font-semibold text-brand-green-deep dark:text-brand-green">
                <span className="material-symbols-outlined text-[20px]">check_box</span>
                <span>পরবর্তী পরীক্ষার জন্য <span className="font-mono-code text-base font-bold">{bnNumberFormatter.format(selectedNextTermChapterCount)}</span> টি অধ্যায় নির্বাচিত হয়েছে</span>
              </div>

              <div className="space-y-3">
                {hscSubjects.map((subject) => {
                  const isOpen = openSubjectSlug === subject.slug;
                  const selectedCount = getSelectedSubjectChapterCount(subject);
                  const styles = getSubjectStyles(subject.color);

                  return (
                    <div
                      key={subject.slug}
                      className={`overflow-hidden rounded-[22px] border ${
                        isOpen ? styles.border : "border-border-subtle"
                      } bg-pure-white transition-all duration-200 hover:border-brand-green/25`}
                    >
                      <button
                        type="button"
                        onClick={() =>
                          setOpenSubjectSlug((current) =>
                            current === subject.slug ? "" : subject.slug,
                          )
                        }
                        className="flex w-full items-center gap-3 px-5 py-4 text-left transition hover:bg-gray-50/30 active:scale-[0.99] active:bg-gray-50/60 cursor-pointer"
                        aria-expanded={isOpen}
                      >
                        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${styles.iconBg} ${styles.iconText}`}>
                          <span className="material-symbols-outlined text-[21px] leading-none">
                            {subject.icon}
                          </span>
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-bold text-near-black">
                            {subject.name}
                          </span>
                          <span className={`mt-1 block text-xs font-semibold ${styles.text}`}>
                            {bnNumberFormatter.format(selectedCount)}টি অধ্যায় সিলেক্ট করা হয়েছে
                          </span>
                        </span>
                        <span className="material-symbols-outlined text-[22px] leading-none text-gray-400">
                          {isOpen ? "expand_less" : "expand_more"}
                        </span>
                      </button>

                      {isOpen ? (
                        <div className="border-t border-border-subtle bg-slate-50/50 p-4 dark:bg-black/30">
                          <div className="grid gap-2 sm:grid-cols-2">
                            {subject.chapters.map((chapter) => {
                              const key = getChapterKey(subject.slug, chapter.slug);
                              const isSelected = selectedChapterKeys.has(key);
                              return (
                                <button
                                  key={chapter.slug}
                                  type="button"
                                  onClick={() => toggleChapter(subject.slug, chapter.slug)}
                                  className={`flex min-h-14 w-full items-center gap-3 rounded-[18px] border px-4 py-3 text-left transition-all hover:scale-[1.01] active:scale-[0.99] cursor-pointer ${
                                    isSelected
                                      ? "border-brand-green bg-pure-white ring-2 ring-brand-green/10"
                                      : "border-border-subtle bg-pure-white hover:border-brand-green/40 hover:bg-brand-green/5"
                                  }`}
                                >
                                  <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${isSelected ? "bg-brand-green-light text-brand-green-deep dark:bg-brand-green/20 dark:text-brand-green" : "bg-slate-50 text-gray-500"} text-xs font-bold`}>
                                    {bnNumberFormatter.format(chapter.order)}
                                  </span>
                                  <span className="min-w-0 flex-1 text-[13px] font-bold leading-5 text-near-black">
                                    {chapter.name}
                                  </span>
                                  <span
                                    className={`material-symbols-outlined text-[22px] leading-none transition-colors ${
                                      isSelected ? "text-brand-green-deep dark:text-brand-green" : "text-gray-300 dark:text-gray-600"
                                    }`}
                                  >
                                    {isSelected ? "check_box" : "check_box_outline_blank"}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          {errorMessage ? (
            <div className="flex items-center gap-3 rounded-2xl border border-error-red/10 bg-error-red/10 p-4 text-error-red">
              <span className="material-symbols-outlined text-[20px] shrink-0">error</span>
              <p className="text-xs font-semibold leading-5">
                {errorMessage}
              </p>
            </div>
          ) : null}

          <div className="sticky bottom-0 -mx-5 -mb-6 flex gap-3 border-t border-border-subtle bg-white/80 px-5 py-4 backdrop-blur-md sm:-mx-8 sm:-mb-8 sm:px-8">
            {step > 0 ? (
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => setStep((current) => Math.max(0, current - 1))}
                className="h-11 flex-1 rounded-full border border-border-medium bg-pure-white px-5 text-xs font-bold text-near-black hover:border-brand-green/50 hover:bg-brand-green-light/10 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer transition-all duration-200"
              >
                পিছনে যান
              </button>
            ) : null}
            <button
              type="button"
              disabled={isSubmitting}
              onClick={step === maxStep ? finish : goNext}
              className="h-11 flex-1 rounded-full bg-near-black px-5 text-xs font-bold text-pure-white shadow-[0_2px_4px_rgba(0,0,0,0.06)] hover:bg-brand-green hover:text-near-black hover:scale-[1.01] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer transition-all duration-200"
            >
              {isSubmitting ? "সেভ হচ্ছে..." : step === maxStep ? "শুরু করুন" : "পরবর্তী ধাপ"}
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}

function DateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
        {label}
      </span>
      <div className="relative flex items-center">
        <span className="material-symbols-outlined absolute left-4 text-[18px] text-gray-400 dark:text-gray-500 pointer-events-none">
          calendar_today
        </span>
        <input
          type="date"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-11 w-full rounded-full border border-border-medium bg-pure-white pl-11 pr-4 text-xs font-bold text-near-black outline-none transition-all focus:border-brand-green focus:ring-4 focus:ring-brand-green/10 hover:border-brand-green/40"
        />
      </div>
    </label>
  );
}

function TrackerEditor({
  title,
  trackers,
  onAdd,
  onRemove,
  onUpdate,
}: {
  title: string;
  trackers: TrackerConfig[];
  onAdd: () => void;
  onRemove: (index: number) => void;
  onUpdate: (index: number, patch: Partial<TrackerConfig>) => void;
}) {
  return (
    <div className="space-y-3.5">
      <div className="flex items-center justify-between gap-3 px-1">
        <p className="text-sm font-bold text-near-black">{title}</p>
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex items-center gap-1 rounded-full border border-border-medium hover:border-brand-green bg-pure-white px-3 py-1.5 text-xs font-bold text-near-black shadow-[0_1px_2px_rgba(0,0,0,0.02)] transition-all hover:bg-brand-green/5 cursor-pointer hover:scale-[1.02] active:scale-[0.98]"
        >
          <span className="material-symbols-outlined text-[16px]">add</span>
          যোগ করুন
        </button>
      </div>
      <div className="space-y-2">
        {trackers.map((tracker, index) => (
          <div key={`${tracker.key}-${index}`} className="grid grid-cols-[1fr_84px_38px] gap-2 items-center">
            <input
              type="text"
              value={tracker.label}
              onChange={(event) =>
                onUpdate(index, {
                  label: event.target.value,
                  key: toTrackerKey(event.target.value, index),
                })
              }
              className="h-10 min-w-0 rounded-full border border-border-medium bg-pure-white px-4 text-xs font-bold text-near-black outline-none focus:border-brand-green focus:ring-4 focus:ring-brand-green/10 transition-all hover:border-brand-green/40"
              placeholder="ট্র্যাকার নাম (যেমন: MCQ)"
            />
            <div className="relative flex items-center">
              <input
                type="number"
                min={1}
                max={600}
                value={tracker.avgMinutes}
                onChange={(event) =>
                  onUpdate(index, { avgMinutes: Number(event.target.value) })
                }
                className="h-10 w-full rounded-full border border-border-medium bg-pure-white pl-3 pr-6 text-center text-xs font-bold text-near-black outline-none focus:border-brand-green focus:ring-4 focus:ring-brand-green/10 transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none hover:border-brand-green/40"
              />
              <span className="absolute right-3 text-[10px] font-bold text-gray-400 dark:text-gray-500 pointer-events-none">m</span>
            </div>
            <button
              type="button"
              onClick={() => onRemove(index)}
              className="flex h-10 w-10 items-center justify-center rounded-full text-gray-400 hover:bg-error-red/10 hover:text-error-red dark:hover:bg-error-red/20 transition-all duration-200 cursor-pointer"
              aria-label={`Remove ${tracker.label}`}
            >
              <span className="material-symbols-outlined text-[18px]">delete</span>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function getSubjectStyles(color: string) {
  const styles: Record<
    string,
    {
      bg: string;
      text: string;
      border: string;
      iconBg: string;
      iconText: string;
    }
  > = {
    blue: {
      bg: "bg-blue-50/40 dark:bg-blue-900/10",
      text: "text-blue-700 dark:text-blue-300",
      border: "border-blue-500/20 dark:border-blue-500/10",
      iconBg: "bg-blue-100 dark:bg-blue-900/30",
      iconText: "text-blue-600 dark:text-blue-400",
    },
    indigo: {
      bg: "bg-indigo-50/40 dark:bg-indigo-900/10",
      text: "text-indigo-700 dark:text-indigo-300",
      border: "border-indigo-500/20 dark:border-indigo-500/10",
      iconBg: "bg-indigo-100 dark:bg-indigo-900/30",
      iconText: "text-indigo-600 dark:text-indigo-400",
    },
    green: {
      bg: "bg-emerald-50/40 dark:bg-emerald-900/10",
      text: "text-emerald-700 dark:text-emerald-300",
      border: "border-emerald-500/20 dark:border-emerald-500/10",
      iconBg: "bg-emerald-100 dark:bg-emerald-900/30",
      iconText: "text-emerald-600 dark:text-emerald-400",
    },
    teal: {
      bg: "bg-teal-50/40 dark:bg-teal-900/10",
      text: "text-teal-700 dark:text-teal-300",
      border: "border-teal-500/20 dark:border-teal-500/10",
      iconBg: "bg-teal-100 dark:bg-teal-900/30",
      iconText: "text-teal-600 dark:text-teal-400",
    },
    pink: {
      bg: "bg-pink-50/40 dark:bg-pink-900/10",
      text: "text-pink-700 dark:text-pink-300",
      border: "border-pink-500/20 dark:border-pink-500/10",
      iconBg: "bg-pink-100 dark:bg-pink-900/30",
      iconText: "text-pink-600 dark:text-pink-400",
    },
    red: {
      bg: "bg-red-50/40 dark:bg-red-900/10",
      text: "text-red-700 dark:text-red-300",
      border: "border-red-500/20 dark:border-red-500/10",
      iconBg: "bg-red-100 dark:bg-red-900/30",
      iconText: "text-red-600 dark:text-red-400",
    },
    amber: {
      bg: "bg-amber-50/40 dark:bg-amber-900/10",
      text: "text-amber-700 dark:text-amber-300",
      border: "border-amber-500/20 dark:border-amber-500/10",
      iconBg: "bg-amber-100 dark:bg-amber-900/30",
      iconText: "text-amber-600 dark:text-amber-400",
    },
    purple: {
      bg: "bg-purple-50/40 dark:bg-purple-900/10",
      text: "text-purple-700 dark:text-purple-300",
      border: "border-purple-500/20 dark:border-purple-500/10",
      iconBg: "bg-purple-100 dark:bg-purple-900/30",
      iconText: "text-purple-600 dark:text-purple-400",
    },
  };

  return (
    styles[color] ?? {
      bg: "bg-slate-50/40 dark:bg-slate-900/10",
      text: "text-slate-700 dark:text-slate-300",
      border: "border-slate-500/20 dark:border-slate-500/10",
      iconBg: "bg-slate-100 dark:bg-slate-800",
      iconText: "text-slate-600 dark:text-slate-400",
    }
  );
}

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useConvexAuth();
  const ensureCurrentUser = useMutation(api.auth.ensureCurrentUser);
  const completeOnboardingSetup = useMutation(
    api.onboarding.completeOnboardingSetup,
  );
  const [bootstrapState, setBootstrapState] =
    useState<BootstrapState>("idle");
  const [isCompletingOnboarding, setIsCompletingOnboarding] = useState(false);
  const onboardingStatus = useQuery(
    api.onboarding.getOnboardingStatus,
    bootstrapState === "ready" ? {} : "skip",
  );

  const showOnboardingToggle = !(
    bootstrapState === "ready" &&
    onboardingStatus !== undefined &&
    !onboardingStatus.requiresOnboarding
  );

  const bootstrapUser = useEffectEvent(async () => {
    startTransition(() => {
      setBootstrapState("bootstrapping");
    });

    try {
      await ensureCurrentUser();

      startTransition(() => {
        setBootstrapState("ready");
      });
    } catch {
      startTransition(() => {
        setBootstrapState("error");
      });
    }
  });

  const completeOnboarding = async (payload: OnboardingSetupPayload) => {
    startTransition(() => {
      setIsCompletingOnboarding(true);
    });

    try {
      await completeOnboardingSetup(payload);
    } catch {
      startTransition(() => {
        setBootstrapState("error");
      });
    } finally {
      startTransition(() => {
        setIsCompletingOnboarding(false);
      });
    }
  };

  useEffect(() => {
    if (!isAuthenticated) {
      startTransition(() => {
        setBootstrapState("idle");
      });
      return;
    }

    if (bootstrapState !== "idle") {
      return;
    }

    void bootstrapUser();
  }, [bootstrapState, isAuthenticated]);

  return (
    <>
      {showOnboardingToggle && <ThemeToggle />}
      <AuthLoading>
        <CenteredMessage>
          <AuthLoadingSkeleton />
        </CenteredMessage>
      </AuthLoading>

      <Unauthenticated>
        <CenteredMessage>
          <div className="space-y-6">
            {/* Pulsing Branding Icon */}
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-[20px] bg-brand-green-light dark:bg-brand-green/10 text-brand-green-deep dark:text-brand-green border border-brand-green/10 dark:border-brand-green/20 shadow-[0_4px_12px_rgba(24,226,153,0.15)] mb-2">
              <span className="material-symbols-outlined text-[30px] animate-pulse">explore</span>
            </div>

            <div className="space-y-2">
              <p className="font-mono-code text-[11px] uppercase tracking-[0.24em] text-brand-green-deep dark:text-brand-green font-bold">
                GONTOBBO
              </p>
              <h1 className="text-3xl font-bold tracking-tight text-near-black">
                আপনার অ্যাকাউন্টে সাইন ইন করুন
              </h1>
              <p className="text-xs leading-5 text-gray-500 dark:text-gray-400 max-w-sm mx-auto">
                আপনার পড়াশোনার গতিপথ, সিলেবাস ট্র্যাকিং ও দৈনিক লক্ষ্যের সাথে যুক্ত হতে অনুগ্রহ করে প্রবেশ করুন।
              </p>
            </div>

            <SignInButton mode="modal">
              <button className="inline-flex w-full items-center justify-center rounded-full bg-near-black text-pure-white hover:bg-brand-green hover:text-near-black font-bold h-12 px-6 text-sm transition-all hover:scale-[1.01] active:scale-[0.98] cursor-pointer shadow-[0_4px_12px_rgba(0,0,0,0.05)]">
                অ্যাকাউন্টে প্রবেশ করুন
              </button>
            </SignInButton>
          </div>
        </CenteredMessage>
      </Unauthenticated>

      <Authenticated>
        {bootstrapState === "ready" && onboardingStatus?.requiresOnboarding ? (
          <OnboardingFlow
            defaults={onboardingStatus.trackerDefaults}
            hscSubjects={onboardingStatus.hscSubjects}
            isSubmitting={isCompletingOnboarding}
            onSubmit={(payload) => {
              void completeOnboarding(payload);
            }}
          />
        ) : bootstrapState === "ready" && onboardingStatus !== undefined ? (
          <NavigationLayout>{children}</NavigationLayout>
        ) : (
          <CenteredMessage>
            {bootstrapState === "bootstrapping" || bootstrapState === "idle" ? (
              <AuthLoadingSkeleton />
            ) : (
              <div className="space-y-5">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-[20px] bg-error-red/10 text-error-red border border-error-red/10 shadow-[0_4px_12px_rgba(212,86,86,0.15)] mb-2">
                  <span className="material-symbols-outlined text-[30px]">error</span>
                </div>

                <div className="space-y-2">
                  <p className="font-mono-code text-[11px] uppercase tracking-[0.24em] text-error-red font-bold">
                    ERROR
                  </p>
                  <h1 className="text-2xl font-bold tracking-tight text-near-black">
                    অ্যাকাউন্ট প্রস্তুত করা যায়নি
                  </h1>
                  <p className="text-xs leading-5 text-gray-500 dark:text-gray-400 max-w-sm mx-auto">
                    সাইন ইন সফল হয়েছে, কিন্তু অ্যাপের ডেটা লোড করতে একটু সমস্যা হয়েছে। অনুগ্রহ করে আবার চেষ্টা করুন।
                  </p>
                </div>

                <button
                  className="inline-flex w-full items-center justify-center rounded-full bg-near-black text-pure-white hover:bg-brand-green hover:text-near-black font-bold h-12 px-6 text-sm transition-all hover:scale-[1.01] active:scale-[0.98] cursor-pointer shadow-[0_4px_12px_rgba(0,0,0,0.05)]"
                  onClick={() => {
                    startTransition(() => {
                      setBootstrapState("idle");
                    });
                  }}
                  type="button"
                >
                  আবার চেষ্টা করুন
                </button>
              </div>
            )}
          </CenteredMessage>
        )}
      </Authenticated>
    </>
  );
}

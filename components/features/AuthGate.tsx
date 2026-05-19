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
import { AuthLoadingSkeleton } from "./LoadingSkeletons";

type BootstrapState = "idle" | "bootstrapping" | "ready" | "error";
type OnboardingClassLevel = "hsc" | "other";
type TrackerConfig = {
  key: string;
  label: string;
  avgMinutes: number;
};
type HscSubjectOption = {
  name: string;
  slug: string;
  icon: string;
  color: string;
};
type OnboardingSetupPayload = {
  classLevel: OnboardingClassLevel;
  termStartDate: number;
  nextTermExamDate: number;
  chapterTrackers: TrackerConfig[];
  conceptTrackers: TrackerConfig[];
  importantSubjectSlugs: string[];
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

function CenteredMessage({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 text-slate-900 dark:bg-slate-950 dark:text-slate-50">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-md items-center justify-center">
        <div className="w-full rounded-[32px] border border-black/5 bg-white p-8 text-center shadow-sm dark:border-white/10 dark:bg-slate-900">
          {children}
        </div>
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
      title: "HSC",
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
          <p className="font-mono-code text-[11px] uppercase tracking-[0.22em] text-emerald-600">
            প্রথম সেটআপ
          </p>
          <h1 className="text-3xl font-bold text-slate-950 dark:text-slate-50">
            তুমি কী দিয়ে শুরু করতে চাও?
          </h1>
          <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">
            HSC বেছে নিলে প্রস্তুত সিলেবাস তৈরি হবে। অন্যান্য বেছে নিলে
            একদম খালি জায়গা থেকে নিজের বিষয় যোগ করতে পারবে।
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
                className={`flex w-full items-center gap-4 rounded-[28px] border p-5 text-left shadow-sm transition disabled:cursor-not-allowed disabled:opacity-70 ${
                  isSelected
                    ? "border-emerald-500 bg-emerald-50 ring-4 ring-emerald-500/10 hover:bg-emerald-100 dark:border-emerald-400/70 dark:bg-emerald-400/10"
                    : "border-black/5 bg-white hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:hover:bg-slate-800"
                }`}
                aria-pressed={isSelected}
              >
                <span
                  className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl shadow-sm dark:bg-slate-900 ${
                    isSelected
                      ? "bg-white text-emerald-600"
                      : "bg-slate-100 text-slate-500 dark:text-slate-300"
                  }`}
                >
                  <span className="material-symbols-outlined">
                    {option.icon}
                  </span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-lg font-bold text-slate-950 dark:text-slate-50">
                    {option.title}
                  </span>
                  <span className="mt-1 block text-sm text-slate-600 dark:text-slate-300">
                    {option.description}
                  </span>
                </span>
                <span
                  className={`material-symbols-outlined ${
                    isSelected ? "text-emerald-600" : "text-slate-300"
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
          className="inline-flex w-full items-center justify-center rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
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
  const [importantSubjectSlugs, setImportantSubjectSlugs] = useState<Set<string>>(
    () => new Set(["physics-1", "chemistry-1", "biology-1"]),
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
    onSubmit({
      classLevel,
      termStartDate: parsedTermStartDate,
      nextTermExamDate: parsedNextTermExamDate,
      chapterTrackers: normalizedChapterTrackers,
      conceptTrackers: normalizedConceptTrackers,
      importantSubjectSlugs:
        classLevel === "hsc" ? Array.from(importantSubjectSlugs) : [],
    });
  };

  return (
    <CenteredMessage>
      <div className="space-y-6 text-left">
        <div className="text-center">
          <p className="font-mono-code text-[11px] uppercase tracking-[0.22em] text-emerald-600">
            Setup {step + 1}/{maxStep + 1}
          </p>
          <h1 className="mt-3 text-3xl font-bold text-slate-950 dark:text-slate-50">
            {step === 0
              ? "আপনার পড়ার ধরন"
              : step === 1
                ? "টার্ম ও পরীক্ষা"
                : step === 2
                  ? "ডিফল্ট ট্র্যাকার"
                  : "Planner priority"}
          </h1>
        </div>

        {step === 0 ? (
          <div className="grid gap-3">
            {(["hsc", "other"] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setClassLevel(value)}
                className={`flex items-center gap-3 rounded-[24px] border p-4 text-left transition ${
                  classLevel === value
                    ? "border-emerald-500 bg-emerald-50 ring-4 ring-emerald-500/10"
                    : "border-black/5 bg-white hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900"
                }`}
              >
                <span className="material-symbols-outlined">
                  {value === "hsc" ? "school" : "edit_note"}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-bold">{value === "hsc" ? "HSC" : "Other"}</span>
                  <span className="text-sm text-slate-600 dark:text-slate-300">
                    {value === "hsc"
                      ? "HSC science syllabus তৈরি হবে।"
                      : "খালি workspace দিয়ে শুরু হবে।"}
                  </span>
                </span>
              </button>
            ))}
          </div>
        ) : null}

        {step === 1 ? (
          <div className="grid gap-4">
            <DateField label="Term start" value={termStartDate} onChange={setTermStartDate} />
            <DateField label="Exam date" value={nextTermExamDate} onChange={setNextTermExamDate} />
          </div>
        ) : null}

        {step === 2 ? (
          <div className="space-y-5">
            <TrackerEditor
              title="Chapter trackers"
              trackers={chapterTrackers}
              onAdd={() => addTracker("chapter")}
              onRemove={(index) => removeTracker("chapter", index)}
              onUpdate={(index, patch) => updateTracker("chapter", index, patch)}
            />
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
          <div className="grid max-h-[42vh] gap-2 overflow-y-auto pr-1">
            {hscSubjects.map((subject) => {
              const selected = importantSubjectSlugs.has(subject.slug);
              return (
                <button
                  key={subject.slug}
                  type="button"
                  onClick={() =>
                    setImportantSubjectSlugs((current) => {
                      const next = new Set(current);
                      if (next.has(subject.slug)) {
                        next.delete(subject.slug);
                      } else {
                        next.add(subject.slug);
                      }
                      return next;
                    })
                  }
                  className={`flex items-center gap-3 rounded-[20px] border px-4 py-3 text-left transition ${
                    selected
                      ? "border-emerald-500 bg-emerald-50"
                      : "border-black/5 bg-white hover:bg-slate-50"
                  }`}
                >
                  <span className="material-symbols-outlined text-[20px]">
                    {subject.icon}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                    {subject.name}
                  </span>
                  <span className="material-symbols-outlined text-[20px]">
                    {selected ? "check_circle" : "radio_button_unchecked"}
                  </span>
                </button>
              );
            })}
          </div>
        ) : null}

        {errorMessage ? (
          <div className="rounded-[18px] border border-[#f1c2bc] bg-[#fff4f2] px-4 py-3 text-sm text-[#c54f41]">
            {errorMessage}
          </div>
        ) : null}

        <div className="flex gap-3">
          {step > 0 ? (
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => setStep((current) => Math.max(0, current - 1))}
              className="h-11 flex-1 rounded-full border border-black/10 px-5 text-sm font-semibold"
            >
              Back
            </button>
          ) : null}
          <button
            type="button"
            disabled={isSubmitting}
            onClick={step === maxStep ? finish : goNext}
            className="h-11 flex-1 rounded-full bg-slate-950 px-5 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? "Saving..." : step === maxStep ? "Start" : "Next"}
          </button>
        </div>
      </div>
    </CenteredMessage>
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
      <span className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">
        {label}
      </span>
      <input
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 w-full rounded-full border border-black/10 bg-white px-4 text-sm outline-none transition focus:border-emerald-500 dark:border-white/10 dark:bg-slate-900"
      />
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
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-bold text-slate-950 dark:text-slate-50">{title}</p>
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex items-center gap-1 rounded-full border border-black/10 px-3 py-1.5 text-xs font-semibold"
        >
          <span className="material-symbols-outlined text-[16px]">add</span>
          Add
        </button>
      </div>
      <div className="space-y-2">
        {trackers.map((tracker, index) => (
          <div key={`${tracker.key}-${index}`} className="grid grid-cols-[1fr_88px_36px] gap-2">
            <input
              type="text"
              value={tracker.label}
              onChange={(event) =>
                onUpdate(index, {
                  label: event.target.value,
                  key: toTrackerKey(event.target.value, index),
                })
              }
              className="h-10 min-w-0 rounded-full border border-black/10 px-3 text-sm outline-none focus:border-emerald-500"
              placeholder="Label"
            />
            <input
              type="number"
              min={1}
              max={600}
              value={tracker.avgMinutes}
              onChange={(event) =>
                onUpdate(index, { avgMinutes: Number(event.target.value) })
              }
              className="h-10 rounded-full border border-black/10 px-3 text-sm outline-none focus:border-emerald-500"
            />
            <button
              type="button"
              onClick={() => onRemove(index)}
              className="flex h-10 w-10 items-center justify-center rounded-full text-slate-400 transition hover:bg-[#fff4f2] hover:text-[#c54f41]"
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
      <AuthLoading>
        <CenteredMessage>
          <AuthLoadingSkeleton />
        </CenteredMessage>
      </AuthLoading>

      <Unauthenticated>
        <CenteredMessage>
          <div className="space-y-5">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-emerald-600">
              Gontobbo
            </p>
            <h1 className="text-3xl font-bold">
              আপনার স্টাডি সিস্টেমে ঢুকুন
            </h1>
            <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">
              চালিয়ে যেতে আপনার অ্যাকাউন্টে সাইন ইন করুন।
            </p>
            <SignInButton mode="modal">
              <button className="inline-flex w-full items-center justify-center rounded-full bg-emerald-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-600">
                সাইন ইন
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
              <div className="space-y-3">
                <p className="text-sm font-semibold uppercase tracking-[0.24em] text-rose-600">
                  সমস্যা হয়েছে
                </p>
                <h1 className="text-2xl font-bold">
                  আপনার অ্যাকাউন্ট প্রস্তুত করা যায়নি
                </h1>
                <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">
                  সাইন ইন হয়েছে, কিন্তু অ্যাপ চালু করতে একটু সমস্যা হয়েছে।
                  আবার চেষ্টা করুন।
                </p>
                <button
                  className="inline-flex w-full items-center justify-center rounded-full bg-emerald-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-600"
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

"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import Skeleton from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { useSnapshotQuery } from "./useSnapshotQuery";

const DAY_MS = 86_400_000;

type PageData = FunctionReturnType<typeof api.studyTargets.getStudyTargetPageData>;
type ActiveTarget = NonNullable<PageData["target"]>;
type SelectionSubject = PageData["selectionSubjects"][number];
type TargetChapter = ActiveTarget["chapters"][number];

function getDhakaDayBucket(timestamp: number) {
  const offset = 6 * 60 * 60 * 1_000;
  const date = new Date(timestamp + offset);
  date.setUTCHours(0, 0, 0, 0);
  return date.getTime() - offset;
}

function toDateInput(dayBucket: number) {
  return new Date(dayBucket + 6 * 60 * 60 * 1_000).toISOString().slice(0, 10);
}

function fromDateInput(value: string) {
  return Date.parse(`${value}T00:00:00+06:00`);
}

function formatDate(dayBucket: number) {
  return new Intl.DateTimeFormat("bn-BD", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Dhaka",
  }).format(dayBucket);
}

function formatMinutes(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} মিনিট`;
  return rest === 0 ? `${hours} ঘণ্টা` : `${hours} ঘণ্টা ${rest} মিনিট`;
}

function errorMessage(error: unknown) {
  if (!(error instanceof Error)) return "কাজটি সম্পন্ন করা যায়নি।";
  return error.message.replace(/^.*?Uncaught Error:\s*/, "").split("\n")[0];
}

export default function StudyTargetWorkspace() {
  const [today] = useState(() => getDhakaDayBucket(Date.now()));
  const { data, error, isLoading, isRefreshing, refresh } = useSnapshotQuery(
    api.studyTargets.getStudyTargetPageData,
    { today },
  );

  if (isLoading || !data) return <TargetSkeleton />;

  if (error) {
    return (
      <div className="mx-auto max-w-2xl rounded-[28px] border border-red-200 bg-red-50 p-6 text-red-700 dark:border-red-400/20 dark:bg-red-950/30 dark:text-red-200">
        <p className="font-semibold">লক্ষ্যের তথ্য লোড করা যায়নি।</p>
        <button
          type="button"
          onClick={() => void refresh()}
          className="mt-4 min-h-11 rounded-full border border-red-300 px-5 text-sm font-semibold transition-colors hover:bg-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 dark:border-red-300/20 dark:hover:bg-red-900/40"
        >
          আবার চেষ্টা করুন
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl pb-8">
      {data.target ? (
        <TargetOverview
          key={`${data.target._id}-${data.target.updatedAt}`}
          target={data.target}
          today={today}
          isRefreshing={isRefreshing}
          onRefresh={refresh}
        />
      ) : (
        <CreateTargetForm
          subjects={data.selectionSubjects}
          today={today}
          onCreated={refresh}
        />
      )}
    </div>
  );
}

function CreateTargetForm({
  subjects,
  today,
  onCreated,
}: {
  subjects: SelectionSubject[];
  today: number;
  onCreated: () => Promise<PageData | undefined>;
}) {
  const toast = useToast();
  const createTarget = useMutation(api.studyTargets.createStudyTarget);
  const [title, setTitle] = useState("");
  const [startDate, setStartDate] = useState(toDateInput(today));
  const [endDate, setEndDate] = useState(toDateInput(today + 6 * DAY_MS));
  const [selected, setSelected] = useState<Set<Id<"chapters">>>(new Set());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const chapterCount = subjects.reduce((sum, subject) => sum + subject.chapters.length, 0);

  const toggleChapter = (chapterId: Id<"chapters">) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(chapterId)) next.delete(chapterId);
      else next.add(chapterId);
      return next;
    });
  };

  const toggleSubject = (subject: SelectionSubject) => {
    setSelected((current) => {
      const next = new Set(current);
      const allSelected = subject.chapters.every((chapter) => next.has(chapter._id));
      for (const chapter of subject.chapters) {
        if (allSelected) next.delete(chapter._id);
        else next.add(chapter._id);
      }
      return next;
    });
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!title.trim()) return toast.error("লক্ষ্যের একটি নাম দিন।");
    if (selected.size === 0) return toast.error("অন্তত একটি অধ্যায় নির্বাচন করুন।");

    const start = fromDateInput(startDate);
    const end = fromDateInput(endDate);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
      return toast.error("সঠিক তারিখের সীমা নির্বাচন করুন।");
    }

    setIsSubmitting(true);
    try {
      const result = await createTarget({
        title,
        startDate: start,
        endDate: end,
        chapterIds: Array.from(selected),
      });
      toast.success(
        `${result.createdTodoCount}টি Todo তৈরি হয়েছে${
          result.linkedTodoCount ? `, আগের ${result.linkedTodoCount}টি Todo যুক্ত হয়েছে` : ""
        }।`,
      );
      await onCreated();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-6">
      <header className="space-y-2">
        <p className="font-mono-code text-xs uppercase tracking-[0.18em] text-brand-green-deep dark:text-emerald-300">
          Study Target
        </p>
        <h1 className="font-heading text-3xl font-semibold tracking-tight text-on-surface md:text-4xl">
          নতুন লক্ষ্য তৈরি করুন
        </h1>
        <p className="max-w-2xl text-sm leading-6 text-gray-500 dark:text-gray-400 md:text-base">
          সময়সীমা ও অধ্যায় বেছে নিন। অসম্পূর্ণ concept Items দিন অনুযায়ী Todo-তে যোগ হবে।
        </p>
      </header>

      <section className="rounded-[28px] border border-border-subtle bg-pure-white p-5 dark:border-white/10 dark:bg-neutral-900 md:p-7">
        <div className="grid gap-5 md:grid-cols-2">
          <label className="md:col-span-2">
            <span className="mb-2 block text-sm font-semibold text-on-surface">লক্ষ্যের নাম</span>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={80}
              placeholder="যেমন: মাসিক পরীক্ষার আগে Physics ও Chemistry শেষ"
              className="min-h-12 w-full rounded-full border border-border-subtle bg-surface-container-low px-5 text-sm text-on-surface outline-none transition-colors placeholder:text-gray-400 hover:border-gray-300 focus-visible:border-brand-green focus-visible:ring-2 focus-visible:ring-brand-green/20 dark:border-white/10 dark:bg-white/[0.05] dark:hover:border-white/20"
            />
          </label>
          <DateField label="শুরু" value={startDate} min={toDateInput(today)} onChange={setStartDate} />
          <DateField label="শেষ" value={endDate} min={startDate} onChange={setEndDate} />
        </div>
      </section>

      <section className="rounded-[28px] border border-border-subtle bg-pure-white p-5 dark:border-white/10 dark:bg-neutral-900 md:p-7">
        <h2 className="font-heading text-xl font-semibold text-on-surface">অধ্যায় নির্বাচন</h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          {selected.size} / {chapterCount} অধ্যায় নির্বাচিত
        </p>

        {subjects.length === 0 ? (
          <div className="mt-6 rounded-[20px] border border-dashed border-border-subtle p-6 text-center text-sm text-gray-500 dark:border-white/10 dark:text-gray-400">
            আগে Subjects থেকে বিষয় ও অধ্যায় যোগ করুন।
          </div>
        ) : (
          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            {subjects.map((subject) => {
              const selectedCount = subject.chapters.filter((chapter) => selected.has(chapter._id)).length;
              const allSelected = selectedCount === subject.chapters.length;
              return (
                <div key={subject._id} className="overflow-hidden rounded-[22px] border border-border-subtle bg-surface-container-low dark:border-white/10 dark:bg-white/[0.035]">
                  <div className="flex items-center justify-between gap-3 border-b border-border-subtle px-4 py-3 dark:border-white/10">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: subject.color ?? "#18E299" }} />
                      <div className="min-w-0">
                        <h3 className="truncate font-semibold text-on-surface">{subject.name}</h3>
                        <p className="text-xs text-gray-500 dark:text-gray-400">{selectedCount}/{subject.chapters.length} নির্বাচিত</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleSubject(subject)}
                      className="min-h-11 rounded-full px-4 text-xs font-semibold text-brand-green-deep transition-colors hover:bg-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-green/40 active:bg-emerald-200 dark:text-emerald-300 dark:hover:bg-emerald-400/10 dark:active:bg-emerald-400/20"
                    >
                      {allSelected ? "সব বাদ দিন" : "সব নিন"}
                    </button>
                  </div>
                  <div className="divide-y divide-border-subtle dark:divide-white/10">
                    {subject.chapters.map((chapter) => {
                      const checked = selected.has(chapter._id);
                      return (
                        <label key={chapter._id} className={`flex min-h-12 cursor-pointer items-center gap-3 px-4 py-3 transition-colors focus-within:ring-2 focus-within:ring-inset focus-within:ring-brand-green/35 ${checked ? "bg-emerald-50/70 dark:bg-emerald-400/[0.07]" : "hover:bg-white dark:hover:bg-white/[0.05]"}`}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleChapter(chapter._id)}
                            className="h-5 w-5 rounded border-gray-300 accent-brand-green focus-visible:ring-2 focus-visible:ring-brand-green/40 dark:border-white/20 dark:bg-neutral-900"
                          />
                          <span className="min-w-0 flex-1 text-sm font-medium text-on-surface">{chapter.name}</span>
                          {chapter.inNextTerm ? (
                            <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-mono-code uppercase tracking-[0.1em] text-blue-700 dark:bg-blue-400/10 dark:text-blue-300">Next term</span>
                          ) : null}
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <div className="sticky bottom-24 z-20 flex items-center justify-between gap-4 rounded-[24px] border border-border-subtle bg-white/90 p-3 shadow-[0_16px_45px_rgba(15,23,42,0.10)] backdrop-blur dark:border-white/10 dark:bg-neutral-900/90 md:bottom-5">
        <p className="hidden pl-3 text-sm text-gray-500 dark:text-gray-400 sm:block">সংরক্ষণ করলে Todo স্বয়ংক্রিয়ভাবে তৈরি হবে।</p>
        <button
          type="submit"
          disabled={isSubmitting || !title.trim() || selected.size === 0 || subjects.length === 0}
          className="min-h-12 w-full rounded-full bg-brand-green px-6 text-sm font-bold text-slate-950 transition-all hover:bg-[#16d58f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-green focus-visible:ring-offset-2 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 dark:focus-visible:ring-offset-neutral-900 sm:w-auto"
        >
          {isSubmitting ? "Todo তৈরি হচ্ছে..." : "লক্ষ্য সংরক্ষণ করুন"}
        </button>
      </div>
    </form>
  );
}

function TargetOverview({
  target,
  today,
  isRefreshing,
  onRefresh,
}: {
  target: ActiveTarget;
  today: number;
  isRefreshing: boolean;
  onRefresh: () => Promise<PageData | undefined>;
}) {
  const toast = useToast();
  const extendTarget = useMutation(api.studyTargets.extendStudyTarget);
  const [newEndDate, setNewEndDate] = useState(toDateInput(target.endDate + DAY_MS));
  const [isExtending, setIsExtending] = useState(false);
  const groups = useMemo(() => groupChapters(target.chapters), [target.chapters]);
  const pace = paceLabels[target.paceStatus];

  const extend = async () => {
    const endDate = fromDateInput(newEndDate);
    if (!Number.isFinite(endDate) || endDate <= target.endDate) {
      return toast.error("বর্তমান শেষ তারিখের পরের একটি তারিখ বেছে নিন।");
    }
    setIsExtending(true);
    try {
      const result = await extendTarget({ endDate, today });
      toast.success(`সময়সীমা বেড়েছে; ${result.createdTodoCount}টি অসম্পূর্ণ Todo পুনরায় সাজানো হয়েছে।`);
      await onRefresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setIsExtending(false);
    }
  };

  return (
    <div className="space-y-6">
      <header className="rounded-[30px] border border-border-subtle bg-pure-white p-6 dark:border-white/10 dark:bg-neutral-900 md:p-8">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
          <div>
            <p className="font-mono-code text-xs uppercase tracking-[0.18em] text-brand-green-deep dark:text-emerald-300">Active Study Target</p>
            <h1 className="mt-2 font-heading text-3xl font-semibold tracking-tight text-on-surface md:text-4xl">{target.title}</h1>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{formatDate(target.startDate)} — {formatDate(target.endDate)}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${pace.className}`}>{pace.label}</span>
            <button
              type="button"
              onClick={() => void onRefresh()}
              disabled={isRefreshing}
              className="flex h-11 w-11 items-center justify-center rounded-full border border-border-subtle text-gray-500 transition-colors hover:bg-gray-50 hover:text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-green/40 active:bg-gray-100 disabled:opacity-50 dark:border-white/10 dark:hover:bg-white/[0.06] dark:active:bg-white/[0.10]"
              aria-label="লক্ষ্যের অগ্রগতি রিফ্রেশ করুন"
            >
              <span className={`material-symbols-outlined text-[20px] ${isRefreshing ? "animate-spin" : ""}`}>refresh</span>
            </button>
          </div>
        </div>
        <div className="mt-7">
          <div className="mb-2 flex justify-between text-sm">
            <span className="font-semibold text-on-surface">Concept Items progress</span>
            <span className="font-mono-code text-xs text-gray-500 dark:text-gray-400">{target.completedTrackerItems}/{target.totalTrackerItems}</span>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-gray-100 dark:bg-white/[0.08]" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={target.progressPercent}>
            <div className="h-full rounded-full bg-brand-green transition-[width] duration-500" style={{ width: `${target.progressPercent}%` }} />
          </div>
          <p className="mt-2 text-right font-heading text-2xl font-semibold text-on-surface">{target.progressPercent}%</p>
        </div>
      </header>

      {target.paceStatus === "deadline_passed" ? (
        <div className="flex gap-3 rounded-[24px] border border-amber-200 bg-amber-50 p-5 text-amber-950 dark:border-amber-400/20 dark:bg-amber-400/[0.08] dark:text-amber-100">
          <span className="material-symbols-outlined">event_busy</span>
          <div><p className="font-semibold">সময়সীমা শেষ হয়েছে, লক্ষ্য খোলা আছে।</p><p className="mt-1 text-sm opacity-80">নতুন তারিখ দিলে অসম্পূর্ণ target Todo আবার সাজানো হবে।</p></div>
        </div>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat icon="checklist" label="বাকি Items" value={String(target.remainingTrackerItems)} />
        <Stat icon="hourglass_top" label="বাকি দিন" value={String(target.remainingDays)} />
        <Stat icon="track_changes" label="প্রতিদিন প্রয়োজন" value={`${target.requiredTasksPerDay} Items`} />
        <Stat icon="event_available" label="আজকের target Todo" value={`${target.todayTaskCount}${target.todayTaskCountIsLimited ? "+" : ""}`} />
      </section>

      <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="rounded-[28px] border border-border-subtle bg-pure-white p-5 dark:border-white/10 dark:bg-neutral-900 md:p-7">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><h2 className="font-heading text-xl font-semibold text-on-surface">অধ্যায়ের অগ্রগতি</h2><p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Chapter-level Items completion-এর অংশ নয়।</p></div>
            <Link href="/todo" className="inline-flex min-h-11 items-center gap-2 rounded-full bg-brand-green px-5 text-sm font-bold text-slate-950 transition-colors hover:bg-[#16d58f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-green focus-visible:ring-offset-2 active:bg-[#12c783] dark:focus-visible:ring-offset-neutral-900">Todo খুলুন<span className="material-symbols-outlined text-[18px]">arrow_forward</span></Link>
          </div>
          <div className="mt-6 space-y-5">
            {groups.map((group) => (
              <div key={group.subjectId}>
                <div className="mb-2 flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: group.color ?? "#18E299" }} /><h3 className="text-sm font-semibold text-on-surface">{group.name}</h3></div>
                <div className="overflow-hidden rounded-[20px] border border-border-subtle dark:border-white/10">
                  {group.chapters.map((chapter, index) => (
                    <div key={chapter.chapterId} className={`p-4 ${index ? "border-t border-border-subtle dark:border-white/10" : ""}`}>
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0"><p className="truncate text-sm font-semibold text-on-surface">{chapter.chapterName}</p><p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{chapter.completedConcepts}/{chapter.totalConcepts} concept · {chapter.completedTrackerItems}/{chapter.totalTrackerItems} Items</p></div>
                        <span className="font-mono-code text-xs font-semibold text-gray-500 dark:text-gray-400">{chapter.progressPercent}%</span>
                      </div>
                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-white/[0.08]"><div className="h-full rounded-full bg-brand-green" style={{ width: `${chapter.progressPercent}%` }} /></div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <aside className="space-y-4">
          <div className="rounded-[28px] border border-border-subtle bg-pure-white p-5 dark:border-white/10 dark:bg-neutral-900">
            <h2 className="font-heading text-lg font-semibold text-on-surface">সময়সীমা বাড়ান</h2>
            <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">Completed Todo থাকবে; অসম্পূর্ণ target Todo নতুন তারিখে সাজানো হবে।</p>
            <DateField label="নতুন শেষ তারিখ" value={newEndDate} min={toDateInput(target.endDate + DAY_MS)} onChange={setNewEndDate} className="mt-5" />
            <button type="button" onClick={extend} disabled={isExtending} className="mt-3 min-h-12 w-full rounded-full border border-brand-green bg-emerald-50 px-5 text-sm font-bold text-brand-green-deep transition-colors hover:bg-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-green/40 active:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-emerald-400/10 dark:text-emerald-200 dark:hover:bg-emerald-400/15 dark:active:bg-emerald-400/20">{isExtending ? "পুনরায় সাজানো হচ্ছে..." : "সময়সীমা বাড়ান"}</button>
          </div>
          <div className="rounded-[24px] border border-border-subtle bg-surface-container-low p-5 dark:border-white/10 dark:bg-white/[0.035]">
            <p className="font-mono-code text-[11px] uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400">সর্বশেষ পরিকল্পনা</p>
            <p className="mt-2 text-sm font-semibold text-on-surface">{target.scheduledTaskCount} Todo · {formatMinutes(target.scheduledMinutes)}</p>
          </div>
        </aside>
      </section>
    </div>
  );
}

function DateField({ label, value, min, onChange, className = "" }: { label: string; value: string; min: string; onChange: (value: string) => void; className?: string }) {
  return (
    <label className={className}>
      <span className="mb-2 block text-sm font-semibold text-on-surface">{label}</span>
      <input type="date" value={value} min={min} onChange={(event) => onChange(event.target.value)} className="min-h-12 w-full rounded-full border border-border-subtle bg-surface-container-low px-5 text-sm text-on-surface outline-none transition-colors hover:border-gray-300 focus-visible:border-brand-green focus-visible:ring-2 focus-visible:ring-brand-green/20 dark:border-white/10 dark:bg-white/[0.05] dark:hover:border-white/20 dark:[color-scheme:dark]" />
    </label>
  );
}

function Stat({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="rounded-[24px] border border-border-subtle bg-pure-white p-5 dark:border-white/10 dark:bg-neutral-900">
      <span
        aria-hidden="true"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-emerald-200/70 bg-emerald-50 text-brand-green-deep dark:border-emerald-400/15 dark:bg-emerald-400/10 dark:text-emerald-300"
      >
        <span
          className="material-symbols-outlined select-none text-[22px] leading-none"
          style={{ fontVariationSettings: "'FILL' 0, 'wght' 500, 'GRAD' 0, 'opsz' 24" }}
        >
          {icon}
        </span>
      </span>
      <p className="mt-4 text-xs font-medium text-gray-500 dark:text-gray-400">{label}</p>
      <p className="mt-1 font-heading text-xl font-semibold text-on-surface">{value}</p>
    </div>
  );
}

function groupChapters(chapters: TargetChapter[]) {
  const groups = new Map<string, { subjectId: string; name: string; color?: string; chapters: TargetChapter[] }>();
  for (const chapter of chapters) {
    const group = groups.get(chapter.subjectId) ?? { subjectId: chapter.subjectId, name: chapter.subjectName, color: chapter.subjectColor, chapters: [] };
    group.chapters.push(chapter);
    groups.set(chapter.subjectId, group);
  }
  return Array.from(groups.values());
}

const paceLabels: Record<ActiveTarget["paceStatus"], { label: string; className: string }> = {
  not_started: { label: "শুরু হয়নি", className: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-400/20 dark:bg-blue-400/10 dark:text-blue-200" },
  ahead: { label: "এগিয়ে আছেন", className: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-200" },
  on_track: { label: "ঠিক পথে", className: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-200" },
  behind: { label: "পিছিয়ে আছেন", className: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200" },
  deadline_passed: { label: "সময়সীমা শেষ", className: "border-red-200 bg-red-50 text-red-700 dark:border-red-400/20 dark:bg-red-400/10 dark:text-red-200" },
  completed: { label: "সম্পন্ন", className: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-200" },
};

function TargetSkeleton() {
  return (
    <div className="mx-auto w-full max-w-6xl space-y-6" aria-hidden="true">
      <Skeleton className="h-10 w-52 rounded-full" />
      <Skeleton className="h-48 w-full rounded-[28px]" />
      <div className="grid gap-4 md:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-28 rounded-[24px]" />)}</div>
      <Skeleton className="h-80 w-full rounded-[28px]" />
    </div>
  );
}

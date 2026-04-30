"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { getSubjectTheme } from "./subjectTheme";
import {
  formatClockTime,
  formatDurationLabel,
} from "./todoAgendaTime";

const numberFormatter = new Intl.NumberFormat("bn-BD");
const decimalFormatter = new Intl.NumberFormat("bn-BD", {
  maximumFractionDigits: 1,
  minimumFractionDigits: 0,
});

function formatShortDate(date: number) {
  return new Intl.DateTimeFormat("bn-BD", {
    day: "numeric",
    month: "short",
    timeZone: "Asia/Dhaka",
  }).format(date);
}

function formatRateLabel(value: number) {
  return `${decimalFormatter.format(value)}/দিন`;
}

function getUrgencyLabel(status: "ahead" | "on_track" | "behind" | "overdue") {
  if (status === "ahead") {
    return "এগিয়ে";
  }

  if (status === "behind") {
    return "পিছিয়ে";
  }

  if (status === "overdue") {
    return "সময় পেরিয়েছে";
  }

  return "On track";
}

function getUrgencyTone(status: "ahead" | "on_track" | "behind" | "overdue") {
  if (status === "ahead") {
    return "bg-emerald-50 text-brand-green-deep";
  }

  if (status === "behind" || status === "overdue") {
    return "bg-[#fff4f2] text-[#c54f41]";
  }

  return "bg-surface-container text-on-surface";
}

export default function DashboardWorkspace() {
  const dashboard = useQuery(api.dashboardQueries.getDashboardPageData);

  if (dashboard === undefined) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-brand-green" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <TodoStrip
        totalCount={dashboard.today.totalCount}
        completedCount={dashboard.today.completedCount}
        tasks={dashboard.today.tasks}
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <SyllabusCompletionCard completion={dashboard.completion} />
        <NextTermTimeCard
          urgency={dashboard.urgency}
          termDates={dashboard.termDates}
          nextTermTotalItems={dashboard.completion.nextTerm.totalItems}
        />
        <ProgressionRateCard
          pace={dashboard.pace}
          termDates={dashboard.termDates}
          nextTermTotalItems={dashboard.completion.nextTerm.totalItems}
        />
        <SubjectProgressCard subjectProgress={dashboard.subjectProgress} />
      </div>
    </div>
  );
}

function DashboardCard({
  eyebrow,
  title,
  action,
  children,
}: {
  eyebrow: string;
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[30px] border border-border-subtle bg-white p-5 shadow-[0_14px_40px_rgba(0,0,0,0.03)] md:p-6">
      <div className="flex items-start justify-between gap-4 border-b border-border-subtle pb-4">
        <div>
          <p className="font-mono-code text-[11px] uppercase tracking-[0.18em] text-gray-400">
            {eyebrow}
          </p>
          <h2 className="mt-2 font-card-title text-[1.35rem] text-on-surface">
            {title}
          </h2>
        </div>
        {action}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function TodoStrip({
  totalCount,
  completedCount,
  tasks,
}: {
  totalCount: number;
  completedCount: number;
  tasks: Array<{
    id: string;
    kind: "study_item" | "concept_review";
    title: string;
    subjectName: string;
    chapterName: string;
    subjectColor: string;
    durationMinutes: number;
    startTimeMinutes?: number;
    isCompleted: boolean;
  }>;
}) {
  const hasTasks = totalCount > 0;

  return (
    <DashboardCard
      eyebrow="Today"
      title="আজকের Todo"
      action={
        <div className="flex items-center gap-2">
          <Link
            href="/todo"
            className="rounded-full border border-border-subtle px-3 py-2 text-sm font-medium text-on-surface transition-colors hover:bg-gray-100"
          >
            সব দেখুন
          </Link>
          {!hasTasks ? (
            <Link
              href="/planner"
              className="rounded-full bg-on-surface px-4 py-2 text-sm font-medium text-pure-white transition-colors hover:bg-brand-green"
            >
              Planner
            </Link>
          ) : null}
        </div>
      }
    >
      {!hasTasks ? (
        <div className="flex flex-col gap-3 rounded-[24px] border border-dashed border-border-medium bg-surface-container px-5 py-5 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-semibold text-on-surface">
              আজকের জন্য এখনো কোনো todo নেই
            </p>
            <p className="mt-1 text-sm text-gray-500">
              Planner থেকে আজকের কাজ বানিয়ে নিলে এই strip-এ দেখাবে।
            </p>
          </div>
          <div className="rounded-full bg-white px-3 py-1.5 text-xs font-mono-code uppercase tracking-[0.16em] text-gray-500">
            ০ task
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-sm text-gray-500">
            <span className="rounded-full bg-surface-container px-3 py-1 font-mono-code text-[11px] uppercase tracking-[0.16em] text-gray-500">
              {numberFormatter.format(completedCount)}/
              {numberFormatter.format(totalCount)} done
            </span>
            <span>
              আজকের তালিকা থেকে পরের {numberFormatter.format(tasks.length)}টা দেখানো হচ্ছে
            </span>
          </div>

          <div className="grid gap-3">
            {tasks.map((task) => {
              const theme = getSubjectTheme(task.subjectColor);

              return (
                <div
                  key={task.id}
                  className="flex flex-col gap-3 rounded-[22px] border border-border-subtle px-4 py-4 md:flex-row md:items-center md:justify-between"
                >
                  <div className="min-w-0 flex items-start gap-3">
                    <div
                      className="mt-0.5 h-10 w-10 shrink-0 rounded-2xl border border-border-subtle"
                      style={{ backgroundColor: `${theme.accentHex}12` }}
                    >
                      <div className="flex h-full items-center justify-center">
                        <span
                          className="material-symbols-outlined text-[18px]"
                          style={{ color: theme.accentHex }}
                        >
                          {task.kind === "concept_review" ? "history_edu" : "menu_book"}
                        </span>
                      </div>
                    </div>

                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-on-surface md:text-base">
                        {task.title}
                      </p>
                      <p className="mt-1 text-sm text-gray-500">
                        {task.subjectName} · {task.chapterName}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 md:justify-end">
                    <span className="rounded-full bg-surface-container px-3 py-1.5 text-xs font-mono-code uppercase tracking-[0.16em] text-gray-500">
                      {task.startTimeMinutes === undefined
                        ? "Unscheduled"
                        : formatClockTime(task.startTimeMinutes)}
                    </span>
                    <span className="rounded-full border border-border-subtle px-3 py-1.5 text-xs text-gray-500">
                      {formatDurationLabel(task.durationMinutes)}
                    </span>
                    <span
                      className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                        task.isCompleted
                          ? "bg-emerald-50 text-brand-green-deep"
                          : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {task.isCompleted ? "সম্পন্ন" : "বাকি"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </DashboardCard>
  );
}

function SyllabusCompletionCard({
  completion,
}: {
  completion: {
    nextTerm: {
      completedItems: number;
      totalItems: number;
      progressPercentage: number;
    };
    allSyllabus: {
      completedItems: number;
      totalItems: number;
      progressPercentage: number;
    };
  };
}) {
  return (
    <DashboardCard eyebrow="Completion" title="Syllabus Completion">
      <div className="grid gap-5 md:grid-cols-[180px_1fr] md:items-center">
        <ProgressRing
          percentage={completion.nextTerm.progressPercentage}
          label="Next term"
        />

        <div className="space-y-4">
          <MetricBlock
            label="Next term"
            value={`${numberFormatter.format(
              completion.nextTerm.completedItems,
            )}/${numberFormatter.format(completion.nextTerm.totalItems)}`}
            hint={`${numberFormatter.format(
              completion.nextTerm.progressPercentage,
            )}% complete`}
          />
          <MetricBlock
            label="All syllabus"
            value={`${numberFormatter.format(
              completion.allSyllabus.completedItems,
            )}/${numberFormatter.format(completion.allSyllabus.totalItems)}`}
            hint={`${numberFormatter.format(
              completion.allSyllabus.progressPercentage,
            )}% complete`}
          />
          {completion.nextTerm.totalItems === 0 ? (
            <p className="rounded-[20px] bg-surface-container px-4 py-3 text-sm text-gray-500">
              Next-term এ এখনো কোনো chapter select করা নেই।
            </p>
          ) : null}
        </div>
      </div>
    </DashboardCard>
  );
}

function NextTermTimeCard({
  urgency,
  termDates,
  nextTermTotalItems,
}: {
  urgency: {
    elapsedPercent: number;
    timeLeftPercent: number;
    incompletionPercent: number;
    daysRemaining: number;
    examPassed: boolean;
    status: "ahead" | "on_track" | "behind" | "overdue";
  } | null;
  termDates: {
    termStartDate?: number;
    nextTermExamDate?: number;
    isConfigured: boolean;
  };
  nextTermTotalItems: number;
}) {
  if (!termDates.isConfigured) {
    return (
      <SetupCard
        eyebrow="Timeline"
        title="Next Term Time"
        body="Countdown আর urgency দেখাতে Settings-এ term start date আর exam date দিন।"
      />
    );
  }

  if (nextTermTotalItems === 0 || urgency === null) {
    return (
      <DashboardCard eyebrow="Timeline" title="Next Term Time">
        <p className="rounded-[20px] bg-surface-container px-4 py-4 text-sm text-gray-500">
          Next-term chapter না থাকলে time comparison দেখানো যাবে না।
        </p>
      </DashboardCard>
    );
  }

  return (
    <DashboardCard
      eyebrow="Timeline"
      title="Next Term Time"
      action={
        <span
          className={`rounded-full px-3 py-1.5 text-xs font-semibold ${getUrgencyTone(
            urgency.status,
          )}`}
        >
          {getUrgencyLabel(urgency.status)}
        </span>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2 text-sm text-gray-500">
          <span>পরীক্ষা: {formatShortDate(termDates.nextTermExamDate!)}</span>
          <span className="h-1 w-1 rounded-full bg-gray-300" />
          <span>
            {urgency.examPassed
              ? "সময় পেরিয়ে গেছে"
              : `${numberFormatter.format(urgency.daysRemaining)} দিন বাকি`}
          </span>
        </div>

        <ComparisonBar
          label="Time left"
          value={urgency.timeLeftPercent}
          tone="bg-soft-blue"
        />
        <ComparisonBar
          label="Incomplete"
          value={urgency.incompletionPercent}
          tone={urgency.status === "behind" || urgency.status === "overdue" ? "bg-error-red" : "bg-brand-green"}
        />
      </div>
    </DashboardCard>
  );
}

function ProgressionRateCard({
  pace,
  termDates,
  nextTermTotalItems,
}: {
  pace: {
    actualItemsPerDay: number;
    requiredItemsPerDay: number | null;
    elapsedDays: number;
    remainingDays: number;
    completedItems: number;
    remainingItems: number;
    examPassed: boolean;
  } | null;
  termDates: {
    termStartDate?: number;
    nextTermExamDate?: number;
    isConfigured: boolean;
  };
  nextTermTotalItems: number;
}) {
  if (!termDates.isConfigured) {
    return (
      <SetupCard
        eyebrow="Pace"
        title="Progression Rate"
        body="এই chart actual pace আর required pace তুলনা করবে। আগে dashboard dates সেট করুন।"
      />
    );
  }

  if (nextTermTotalItems === 0 || pace === null) {
    return (
      <DashboardCard eyebrow="Pace" title="Progression Rate">
        <p className="rounded-[20px] bg-surface-container px-4 py-4 text-sm text-gray-500">
          Next-term workload ছাড়া pace chart meaningful হবে না।
        </p>
      </DashboardCard>
    );
  }

  const maxRate = Math.max(
    1,
    pace.actualItemsPerDay,
    pace.requiredItemsPerDay ?? 0,
  );

  return (
    <DashboardCard eyebrow="Pace" title="Progression Rate">
      <div className="space-y-4">
        <RateBar
          label="Actual pace"
          value={pace.actualItemsPerDay}
          maxValue={maxRate}
          tone="bg-brand-green"
        />
        <RateBar
          label={pace.examPassed ? "Required pace" : "Required pace"}
          value={pace.requiredItemsPerDay ?? 0}
          maxValue={maxRate}
          tone="bg-soft-blue"
          muted={pace.examPassed}
        />

        <div className="grid gap-3 text-sm text-gray-500 md:grid-cols-2">
          <div className="rounded-[20px] bg-surface-container px-4 py-3">
            {numberFormatter.format(pace.completedItems)} done ·{" "}
            {numberFormatter.format(pace.elapsedDays)} days tracked
          </div>
          <div className="rounded-[20px] bg-surface-container px-4 py-3">
            {pace.examPassed
              ? `${numberFormatter.format(pace.remainingItems)} item এখনো বাকি`
              : `${numberFormatter.format(pace.remainingItems)} item · ${numberFormatter.format(
                  pace.remainingDays,
                )} days left`}
          </div>
        </div>
      </div>
    </DashboardCard>
  );
}

function SubjectProgressCard({
  subjectProgress,
}: {
  subjectProgress: Array<{
    subjectId: string;
    name: string;
    color: string;
    icon: string;
    totalItems: number;
    completedItems: number;
    progressPercentage: number;
  }>;
}) {
  return (
    <DashboardCard eyebrow="Subjects" title="Subject Progress">
      {subjectProgress.length === 0 ? (
        <p className="rounded-[20px] bg-surface-container px-4 py-4 text-sm text-gray-500">
          Next-term subject progress দেখাতে আগে chapter গুলো next term-এ যোগ করুন।
        </p>
      ) : (
        <div className="space-y-4">
          {subjectProgress.map((subject) => {
            const theme = getSubjectTheme(subject.color);

            return (
              <div key={subject.subjectId} className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-on-surface md:text-base">
                      {subject.name}
                    </p>
                    <p className="text-sm text-gray-500">
                      {numberFormatter.format(subject.completedItems)}/
                      {numberFormatter.format(subject.totalItems)} items
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 font-mono-code text-[11px] uppercase tracking-[0.16em] ${theme.progressBadgeBg} ${theme.progressBadgeText}`}
                  >
                    {numberFormatter.format(subject.progressPercentage)}%
                  </span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-surface-container">
                  <div
                    className={`h-full rounded-full ${theme.progressBarBg}`}
                    style={{ width: `${subject.progressPercentage}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </DashboardCard>
  );
}

function SetupCard({
  eyebrow,
  title,
  body,
}: {
  eyebrow: string;
  title: string;
  body: string;
}) {
  return (
    <DashboardCard
      eyebrow={eyebrow}
      title={title}
      action={
        <Link
          href="/settings"
          className="rounded-full bg-on-surface px-4 py-2 text-sm font-medium text-pure-white transition-colors hover:bg-brand-green"
        >
          Settings
        </Link>
      }
    >
      <p className="rounded-[20px] bg-surface-container px-4 py-4 text-sm text-gray-500">
        {body}
      </p>
    </DashboardCard>
  );
}

function ProgressRing({
  percentage,
  label,
}: {
  percentage: number;
  label: string;
}) {
  const radius = 58;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset =
    circumference - (clampPercentage(percentage) / 100) * circumference;

  return (
    <div className="flex flex-col items-center justify-center rounded-[28px] bg-surface-container px-6 py-6">
      <svg className="h-36 w-36 -rotate-90" viewBox="0 0 140 140" aria-hidden>
        <circle
          cx="70"
          cy="70"
          r={radius}
          fill="none"
          stroke="rgba(0,0,0,0.08)"
          strokeWidth="10"
        />
        <circle
          cx="70"
          cy="70"
          r={radius}
          fill="none"
          stroke="#18E299"
          strokeLinecap="round"
          strokeWidth="10"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
        />
      </svg>
      <div className="-mt-24 text-center">
        <p className="font-section-heading text-3xl text-on-surface">
          {numberFormatter.format(percentage)}%
        </p>
        <p className="mt-1 text-sm text-gray-500">{label}</p>
      </div>
    </div>
  );
}

function MetricBlock({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-[22px] border border-border-subtle px-4 py-4">
      <p className="font-mono-code text-[11px] uppercase tracking-[0.16em] text-gray-400">
        {label}
      </p>
      <p className="mt-2 text-xl font-semibold text-on-surface">{value}</p>
      <p className="mt-1 text-sm text-gray-500">{hint}</p>
    </div>
  );
}

function ComparisonBar({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-4 text-sm">
        <span className="text-gray-500">{label}</span>
        <span className="font-semibold text-on-surface">
          {numberFormatter.format(value)}%
        </span>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-surface-container">
        <div
          className={`h-full rounded-full ${tone}`}
          style={{ width: `${clampPercentage(value)}%` }}
        />
      </div>
    </div>
  );
}

function RateBar({
  label,
  value,
  maxValue,
  tone,
  muted,
}: {
  label: string;
  value: number;
  maxValue: number;
  tone: string;
  muted?: boolean;
}) {
  const width = maxValue === 0 ? 0 : Math.min((value / maxValue) * 100, 100);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-4 text-sm">
        <span className="text-gray-500">{label}</span>
        <span className="font-semibold text-on-surface">
          {muted ? "Overdue" : formatRateLabel(value)}
        </span>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-surface-container">
        <div
          className={`h-full rounded-full ${muted ? "bg-gray-300" : tone}`}
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  );
}

function clampPercentage(value: number) {
  return Math.min(Math.max(value, 0), 100);
}

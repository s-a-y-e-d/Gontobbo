"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import ConceptReviewModal from "./ConceptReviewModal";
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

type DashboardTodoTask = {
  id: string;
  kind: "study_item" | "concept_review";
  studyItemId?: string;
  conceptId?: string;
  title: string;
  subjectName: string;
  chapterName: string;
  subjectColor: string;
  durationMinutes: number;
  startTimeMinutes?: number;
  isCompleted: boolean;
};

type ProgressionPoint = {
  date: number;
  actualPercentage: number;
  requiredPercentage: number;
};

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

function formatHoursLabel(minutes: number) {
  if (minutes < 60) {
    return `${numberFormatter.format(minutes)}মি`;
  }

  return `${decimalFormatter.format(minutes / 60)}ঘ`;
}

function getUrgencyLabel(status: "ahead" | "on_track" | "behind" | "overdue") {
  if (status === "ahead") return "এগিয়ে";
  if (status === "behind") return "পিছিয়ে";
  if (status === "overdue") return "সময় পেরিয়েছে";
  return "On track";
}

function getUrgencyTone(status: "ahead" | "on_track" | "behind" | "overdue") {
  if (status === "ahead") return "bg-emerald-50 text-brand-green-deep";
  if (status === "behind" || status === "overdue") return "bg-[#fff4f2] text-[#c54f41]";
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

      <div className="grid gap-5 lg:grid-cols-2 lg:items-start">
        <div className="space-y-5">
          <SyllabusCompletionCard completion={dashboard.completion} />
          <ProgressionRateCard
            pace={dashboard.pace}
            progression={dashboard.progression}
            termDates={dashboard.termDates}
            nextTermTotalItems={dashboard.completion.nextTerm.totalItems}
          />
          <StudyVolumeCard studyVolume={dashboard.studyVolume} />
        </div>

        <div className="space-y-5">
          <NextTermTimeCard
            urgency={dashboard.urgency}
            termDates={dashboard.termDates}
            nextTermTotalItems={dashboard.completion.nextTerm.totalItems}
          />
          <SubjectProgressCard subjectProgress={dashboard.subjectProgress} />
          <EffortWeightageCard effortWeightage={dashboard.effortWeightage} />
        </div>
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
        <div className="min-w-0">
          <p className="font-mono-code text-[11px] uppercase tracking-[0.18em] text-gray-400">
            {eyebrow}
          </p>
          <h2 className="mt-2 font-card-title text-[1.35rem] text-on-surface">
            {title}
          </h2>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
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
  tasks: DashboardTodoTask[];
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
              className="rounded-full bg-on-surface px-4 py-2 text-sm font-medium text-pure-white transition-colors hover:bg-brand-green hover:text-on-surface"
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
              Planner থেকে আজকের কাজ বানিয়ে নিলে এখানে দেখা যাবে।
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

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {tasks.map((task) => (
              <DashboardTodoCard key={task.id} task={task} />
            ))}
          </div>
        </div>
      )}
    </DashboardCard>
  );
}

function DashboardTodoCard({ task }: { task: DashboardTodoTask }) {
  const checkboxId = useId();
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const toggleStudyItemCompletion = useMutation(
    api.mutations.toggleStudyItemCompletion,
  );
  const theme = getSubjectTheme(task.subjectColor);
  const isStudyItemTask = task.kind === "study_item";

  const handleToggle = () => {
    if (isStudyItemTask && task.studyItemId) {
      void toggleStudyItemCompletion({
        studyItemId: task.studyItemId as Id<"studyItems">,
      });
      return;
    }

    if (task.conceptId) {
      setIsReviewModalOpen(true);
    }
  };

  return (
    <>
      <article
        className={`rounded-[22px] border px-4 py-4 transition-colors ${
          task.isCompleted
            ? "border-border-subtle bg-surface-container/60"
            : "border-border-subtle bg-white hover:border-border-medium"
        }`}
      >
        <div className="flex items-start gap-3">
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

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span
                className="material-symbols-outlined text-[18px]"
                style={{ color: theme.accentHex }}
              >
                {isStudyItemTask ? "menu_book" : "history_edu"}
              </span>
              <p
                className={`truncate text-sm font-semibold ${
                  task.isCompleted
                    ? "text-on-surface/55 line-through"
                    : "text-on-surface"
                }`}
              >
                {task.title}
              </p>
            </div>
            <p className="mt-2 line-clamp-2 text-xs text-gray-500">
              <span style={{ color: theme.accentHex }}>{task.subjectName}</span>
              <span className="text-gray-300"> · </span>
              {task.chapterName}
            </p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-surface-container px-3 py-1.5 text-xs font-mono-code uppercase tracking-[0.14em] text-gray-500">
            {task.startTimeMinutes === undefined
              ? "Planner"
              : formatClockTime(task.startTimeMinutes)}
          </span>
          <span className="rounded-full border border-border-subtle px-3 py-1.5 text-xs text-gray-500">
            {formatDurationLabel(task.durationMinutes)}
          </span>
        </div>
      </article>

      {!isStudyItemTask && task.conceptId ? (
        <ConceptReviewModal
          isOpen={isReviewModalOpen}
          onClose={() => setIsReviewModalOpen(false)}
          concept={{
            _id: task.conceptId as Id<"concepts">,
            name: task.title.replace(" - Revision", ""),
          }}
        />
      ) : null}
    </>
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
  progression,
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
  progression: {
    points: ProgressionPoint[];
    currentActualPercentage: number;
    currentRequiredPercentage: number;
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
        body="Actual pace আর required pace তুলনা করতে আগে dashboard dates সেট করুন।"
      />
    );
  }

  if (nextTermTotalItems === 0 || pace === null || progression === null) {
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
      <div className="space-y-5">
        <ProgressLineChart points={progression.points} />

        <div className="grid gap-3 text-sm md:grid-cols-2">
          <MetricPill
            label="Actual"
            value={`${numberFormatter.format(progression.currentActualPercentage)}%`}
            tone="bg-brand-green-light text-brand-green-deep"
          />
          <MetricPill
            label="Required"
            value={`${numberFormatter.format(progression.currentRequiredPercentage)}%`}
            tone="bg-blue-50 text-soft-blue"
          />
        </div>

        <RateBar
          label="Actual pace"
          value={pace.actualItemsPerDay}
          maxValue={maxRate}
          tone="bg-brand-green"
        />
        <RateBar
          label="Required pace"
          value={pace.requiredItemsPerDay ?? 0}
          maxValue={maxRate}
          tone="bg-soft-blue"
          muted={pace.examPassed}
        />
      </div>
    </DashboardCard>
  );
}

function StudyVolumeCard({
  studyVolume,
}: {
  studyVolume: {
    totalMinutes: number;
    activeDays: number;
    days: Array<{
      date: number;
      minutesSpent: number;
      intensity: number;
    }>;
  };
}) {
  return (
    <DashboardCard
      eyebrow="Consistency"
      title="Study Volume"
      action={
        <span className="rounded-full bg-surface-container px-3 py-1.5 text-xs font-mono-code uppercase tracking-[0.14em] text-gray-500">
          90 days
        </span>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 text-sm md:grid-cols-2">
          <MetricPill
            label="Total"
            value={formatHoursLabel(studyVolume.totalMinutes)}
            tone="bg-brand-green-light text-brand-green-deep"
          />
          <MetricPill
            label="Active days"
            value={numberFormatter.format(studyVolume.activeDays)}
            tone="bg-surface-container text-on-surface"
          />
        </div>

        <div className="overflow-x-auto pb-1">
          <div className="grid w-max grid-flow-col grid-rows-7 gap-1">
            {studyVolume.days.map((day) => (
              <div
                key={day.date}
                title={`${formatShortDate(day.date)} · ${formatHoursLabel(day.minutesSpent)}`}
                className={`h-3 w-3 rounded-[3px] ${getHeatmapColor(day.intensity)}`}
              />
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span>কম</span>
          {[0, 1, 2, 3, 4].map((intensity) => (
            <span
              key={intensity}
              className={`h-3 w-3 rounded-[3px] ${getHeatmapColor(intensity)}`}
            />
          ))}
          <span>বেশি</span>
        </div>
      </div>
    </DashboardCard>
  );
}

function EffortWeightageCard({
  effortWeightage,
}: {
  effortWeightage: {
    hasConfiguredWeights: boolean;
    missingWeightCount: number;
    subjects: Array<{
      subjectId: string;
      name: string;
      color: string;
      studyMinutes: number;
      studyShare: number;
      weightShare: number;
      isUnderStudied: boolean;
    }>;
  };
}) {
  if (!effortWeightage.hasConfiguredWeights) {
    return (
      <DashboardCard
        eyebrow="Efficiency"
        title="Effort vs Weightage"
        action={
          <Link
            href="/subjects"
            className="rounded-full bg-on-surface px-4 py-2 text-sm font-medium text-pure-white transition-colors hover:bg-brand-green hover:text-on-surface"
          >
            Subjects
          </Link>
        }
      >
        <p className="rounded-[20px] bg-surface-container px-4 py-4 text-sm text-gray-500">
          Subject edit করে exam weight সেট করলে effort আর importance তুলনা দেখা যাবে।
        </p>
      </DashboardCard>
    );
  }

  return (
    <DashboardCard eyebrow="Efficiency" title="Effort vs Weightage">
      <div className="space-y-4">
        {effortWeightage.missingWeightCount > 0 ? (
          <p className="rounded-[18px] bg-[#fff8ec] px-4 py-3 text-sm text-warm-amber">
            {numberFormatter.format(effortWeightage.missingWeightCount)}টি subject-এ weight set করা নেই।
          </p>
        ) : null}

        {effortWeightage.subjects.map((subject) => {
          const theme = getSubjectTheme(subject.color);

          return (
            <div key={subject.subjectId} className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-on-surface">
                    {subject.name}
                  </p>
                  <p className="text-xs text-gray-500">
                    {formatHoursLabel(subject.studyMinutes)} studied
                  </p>
                </div>
                {subject.isUnderStudied ? (
                  <span className="rounded-full bg-[#fff4f2] px-3 py-1 text-xs font-semibold text-[#c54f41]">
                    Red flag
                  </span>
                ) : null}
              </div>

              <GroupedShareBar
                label="Study"
                value={subject.studyShare}
                colorClass={theme.progressBarBg}
              />
              <GroupedShareBar
                label="Weight"
                value={subject.weightShare}
                colorClass={subject.isUnderStudied ? "bg-error-red" : "bg-soft-blue"}
              />
            </div>
          );
        })}
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
          className="rounded-full bg-on-surface px-4 py-2 text-sm font-medium text-pure-white transition-colors hover:bg-brand-green hover:text-on-surface"
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
    <div className="flex items-center justify-center rounded-[28px] bg-surface-container px-6 py-6">
      <div className="relative h-36 w-36">
        <svg className="h-full w-full -rotate-90" viewBox="0 0 140 140" aria-hidden>
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
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <p className="font-section-heading text-3xl text-on-surface">
            {numberFormatter.format(percentage)}%
          </p>
          <p className="mt-1 text-sm text-gray-500">{label}</p>
        </div>
      </div>
    </div>
  );
}

function ProgressLineChart({ points }: { points: ProgressionPoint[] }) {
  const width = 520;
  const height = 180;
  const padding = 18;
  const actualPath = buildLinePath(points, "actualPercentage", width, height, padding);
  const requiredPath = buildLinePath(points, "requiredPercentage", width, height, padding);

  return (
    <div className="rounded-[22px] border border-border-subtle bg-surface-container/40 px-3 py-3">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-44 w-full" aria-hidden>
        {[0, 25, 50, 75, 100].map((tick) => {
          const y = getChartY(tick, height, padding);
          return (
            <g key={tick}>
              <line
                x1={padding}
                x2={width - padding}
                y1={y}
                y2={y}
                stroke="rgba(0,0,0,0.06)"
              />
              <text x="0" y={y + 4} className="fill-gray-400 text-[10px]">
                {tick}
              </text>
            </g>
          );
        })}
        <path d={requiredPath} fill="none" stroke="#3772cf" strokeDasharray="7 7" strokeWidth="4" />
        <path d={actualPath} fill="none" stroke="#18E299" strokeLinecap="round" strokeLinejoin="round" strokeWidth="5" />
      </svg>
      <div className="flex flex-wrap items-center gap-4 px-1 text-xs text-gray-500">
        <span className="flex items-center gap-2">
          <span className="h-2 w-5 rounded-full bg-brand-green" />
          Actual
        </span>
        <span className="flex items-center gap-2">
          <span className="h-0.5 w-5 border-t-2 border-dashed border-soft-blue" />
          Required
        </span>
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

function MetricPill({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: string;
}) {
  return (
    <div className={`rounded-[20px] px-4 py-3 ${tone}`}>
      <p className="font-mono-code text-[10px] uppercase tracking-[0.14em] opacity-70">
        {label}
      </p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
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

function GroupedShareBar({
  label,
  value,
  colorClass,
}: {
  label: string;
  value: number;
  colorClass: string;
}) {
  return (
    <div className="grid grid-cols-[64px_1fr_42px] items-center gap-3 text-xs">
      <span className="font-mono-code uppercase tracking-[0.12em] text-gray-400">
        {label}
      </span>
      <div className="h-2.5 overflow-hidden rounded-full bg-surface-container">
        <div
          className={`h-full rounded-full ${colorClass}`}
          style={{ width: `${clampPercentage(value)}%` }}
        />
      </div>
      <span className="text-right font-semibold text-on-surface">
        {numberFormatter.format(value)}%
      </span>
    </div>
  );
}

function buildLinePath(
  points: ProgressionPoint[],
  key: "actualPercentage" | "requiredPercentage",
  width: number,
  height: number,
  padding: number,
) {
  if (points.length === 0) {
    return "";
  }

  const maxIndex = Math.max(points.length - 1, 1);
  return points
    .map((point, index) => {
      const x = padding + (index / maxIndex) * (width - padding * 2);
      const y = getChartY(point[key], height, padding);
      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

function getChartY(value: number, height: number, padding: number) {
  return height - padding - (clampPercentage(value) / 100) * (height - padding * 2);
}

function getHeatmapColor(intensity: number) {
  if (intensity >= 4) return "bg-brand-green-deep";
  if (intensity === 3) return "bg-brand-green";
  if (intensity === 2) return "bg-[#8cf2c7]";
  if (intensity === 1) return "bg-brand-green-light";
  return "bg-surface-container";
}

function clampPercentage(value: number) {
  return Math.min(Math.max(value, 0), 100);
}

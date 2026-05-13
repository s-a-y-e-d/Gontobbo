"use client";

import { useMemo, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import {
  DASHBOARD_COMPONENT_KEYS,
  DEFAULT_DASHBOARD_COMPONENT_VISIBILITY,
  type DashboardComponentKey,
  type DashboardComponentVisibility,
} from "@/convex/dashboardComponents";
import { useTheme } from "@/components/ThemeProvider";
import PwaInstallAction, {
  usePwaInstallPromptContext,
} from "@/components/features/PwaInstallAction";
import { SettingsPageSkeleton } from "./LoadingSkeletons";
import { getSubjectTheme } from "./subjectTheme";
import { useSnapshotQuery } from "./useSnapshotQuery";

type ThemeMode = "light" | "system" | "dark";
type CoachingStatus = "not_started" | "running" | "finished";
type SubjectPriority = "normal" | "important";

type TrackerConfig = {
  key: string;
  label: string;
  avgMinutes: number;
};

type SettingsConcept = {
  _id: Id<"concepts">;
  name: string;
  order: number;
  weeklyTargetId: Id<"weeklyTargets"> | null;
  isWeeklyTarget: boolean;
  isTargetComplete: boolean;
};

type SettingsChapter = {
  _id: Id<"chapters">;
  name: string;
  order: number;
  coachingStatus: CoachingStatus;
  weeklyTargetId: Id<"weeklyTargets"> | null;
  isWeeklyTarget: boolean;
  isTargetComplete: boolean;
  concepts: SettingsConcept[];
};

type SettingsSubject = {
  _id: Id<"subjects">;
  name: string;
  color?: string;
  icon?: string;
  chapterTrackers: TrackerConfig[];
  conceptTrackers: TrackerConfig[];
  priority: SubjectPriority;
  chapters: SettingsChapter[];
};

type SettingsPageData = {
  subjects: SettingsSubject[];
  classLevel: "hsc" | "other" | null;
  defaultRevisionMinutes: number;
  termStartDate?: number;
  nextTermExamDate?: number;
  dashboardComponentVisibility: DashboardComponentVisibility;
};

type SectionId =
  | "dashboard"
  | "planner"
  | "targets"
  | "coaching"
  | "appearance"
  | "revision"
  | "subjects"
  | "data"
  | "notifications"
  | "account"
  | "backup";

type NavItem = {
  id: SectionId;
  label: string;
  description: string;
  icon: string;
  disabled?: boolean;
};

type SettingsSectionOptions = {
  collapsible?: boolean;
  defaultOpen?: boolean;
};

const navItems: NavItem[] = [
  {
    id: "dashboard",
    label: "ড্যাশবোর্ড",
    description: "টার্ম ডেট ও টাইমলাইন",
    icon: "dashboard",
  },
  {
    id: "planner",
    label: "প্ল্যানার",
    description: "বিষয়ের অগ্রাধিকার",
    icon: "psychology",
  },
  {
    id: "targets",
    label: "সাপ্তাহিক টার্গেট",
    description: "চ্যাপ্টার ও কনসেপ্ট",
    icon: "flag",
  },
  {
    id: "coaching",
    label: "কোচিং অগ্রগতি",
    description: "স্কুল/কোচিং স্ট্যাটাস",
    icon: "school",
  },
  {
    id: "appearance",
    label: "দেখানোর ধরন",
    description: "থিম ও ডিসপ্লে",
    icon: "palette",
  },
  {
    id: "revision",
    label: "রিভিশন",
    description: "রিভিশন ডিফল্ট",
    icon: "history_edu",
  },
  {
    id: "subjects",
    label: "বিষয়",
    description: "ট্র্যাকার ওভারভিউ",
    icon: "auto_stories",
  },
  {
    id: "data",
    label: "তথ্য",
    description: "শীঘ্রই আসছে",
    icon: "database",
    disabled: true,
  },
  {
    id: "notifications",
    label: "নোটিফিকেশন",
    description: "শীঘ্রই আসছে",
    icon: "notifications",
    disabled: true,
  },
  {
    id: "account",
    label: "অ্যাকাউন্ট",
    description: "শীঘ্রই আসছে",
    icon: "account_circle",
    disabled: true,
  },
  {
    id: "backup",
    label: "ব্যাকআপ",
    description: "শীঘ্রই আসছে",
    icon: "cloud_sync",
    disabled: true,
  },
];

const coachingOptions: { value: CoachingStatus; label: string }[] = [
  { value: "not_started", label: "শুরু হয়নি" },
  { value: "running", label: "চলছে" },
  { value: "finished", label: "শেষ" },
];

const themeOptions: { value: ThemeMode; label: string }[] = [
  { value: "light", label: "লাইট" },
  { value: "system", label: "ডিভাইস অনুযায়ী" },
  { value: "dark", label: "ডার্ক" },
];

const dashboardComponentLabels: Record<
  DashboardComponentKey,
  { title: string; description: string }
> = {
  todayTodo: {
    title: "আজকের Todo",
    description: "আজকের কাজের ছোট তালিকা হোমে দেখাবে।",
  },
  todoCompletion: {
    title: "Todo Completion",
    description: "Day, week, month অনুযায়ী Todo completion donut দেখাবে।",
  },
  syllabusCompletion: {
    title: "Syllabus Completion",
    description: "Next term আর পুরো সিলেবাসের progress দেখাবে।",
  },
  nextTermTime: {
    title: "Next Term Time",
    description: "পরীক্ষা পর্যন্ত সময় আর urgency দেখাবে।",
  },
  progressionRate: {
    title: "Progression Rate",
    description: "Actual pace আর required pace চার্টে দেখাবে।",
  },
  studyVolume: {
    title: "Study Volume",
    description: "শেষ ৯০ দিনের activity heatmap দেখাবে।",
  },
  subjectProgress: {
    title: "Subject Progress",
    description: "প্রতি বিষয়ের next-term progress দেখাবে।",
  },
  effortWeightage: {
    title: "Effort vs Weightage",
    description: "পড়ার সময় আর exam weightage তুলনা করবে।",
  },
};

function SettingsNav({
  activeSection,
  onChange,
}: {
  activeSection: SectionId;
  onChange: (section: SectionId) => void;
}) {
  return (
    <aside className="hidden self-start rounded-2xl border border-border-subtle bg-white p-2 lg:sticky lg:top-24 lg:block">
      {navItems.map((item) => (
        <button
          key={item.id}
          type="button"
          disabled={item.disabled}
          onClick={() => onChange(item.id)}
          className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all ${
            activeSection === item.id
              ? "bg-gray-100 text-on-surface"
              : "text-gray-500 hover:bg-gray-100 hover:text-on-surface"
          } ${item.disabled ? "cursor-not-allowed opacity-45" : ""}`}
        >
          <span className="material-symbols-outlined text-[20px]">
            {item.icon}
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold">{item.label}</span>
            <span className="block truncate text-xs text-gray-500">
              {item.description}
            </span>
          </span>
        </button>
      ))}
    </aside>
  );
}

function SettingsSection({
  title,
  description,
  icon,
  children,
  collapsible = false,
  defaultOpen = false,
}: {
  title: string;
  description: string;
  icon?: string;
  children: React.ReactNode;
} & SettingsSectionOptions) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const shouldShowChildren = !collapsible || isOpen;
  const headerContent = (
    <div className="flex items-start gap-3">
      {icon ? (
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-on-surface">
          <span className="material-symbols-outlined text-[20px]">
            {icon}
          </span>
        </span>
      ) : null}
      <div className="min-w-0 flex-1">
        <h2 className="font-card-title text-lg leading-tight text-on-surface">
          {title}
        </h2>
        <p className="mt-1 text-sm leading-6 text-gray-500">
          {description}
        </p>
      </div>
      {collapsible ? (
        <span
          className={`material-symbols-outlined mt-1 text-[22px] text-gray-400 transition-transform ${
            isOpen ? "rotate-90" : ""
          }`}
          aria-hidden="true"
        >
          chevron_right
        </span>
      ) : null}
    </div>
  );

  return (
    <section className="overflow-hidden rounded-2xl border border-border-subtle bg-white">
      {collapsible ? (
        <button
          type="button"
          aria-expanded={isOpen}
          onClick={() => setIsOpen((current) => !current)}
          className={`w-full px-4 py-4 text-left transition-colors hover:bg-gray-100 sm:px-5 ${
            shouldShowChildren ? "border-b border-border-subtle" : ""
          }`}
        >
          {headerContent}
        </button>
      ) : (
        <div className="border-b border-border-subtle px-4 py-4 sm:px-5">
          {headerContent}
        </div>
      )}
      {shouldShowChildren ? (
        <div className="divide-y divide-border-subtle">{children}</div>
      ) : null}
    </section>
  );
}

function SettingsRow({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-on-surface">{title}</p>
        {description ? (
          <p className="mt-1 text-sm leading-6 text-gray-500">{description}</p>
        ) : null}
      </div>
      <div className="w-full shrink-0 sm:w-auto">{children}</div>
    </div>
  );
}

function Switch({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <div className="flex justify-end">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={onChange}
        className={`relative h-7 w-12 rounded-full border transition-all ${
          checked
            ? "border-brand-green bg-brand-green"
            : "border-border-medium bg-gray-100"
        } ${disabled ? "cursor-wait opacity-60" : ""}`}
      >
        <span
          className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow-sm transition-all ${
            checked ? "left-6" : "left-1"
          }`}
        />
      </button>
    </div>
  );
}

function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  disabled,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <div
      aria-label={label}
      className="flex w-full rounded-full border border-border-subtle bg-gray-100 p-1 sm:inline-flex sm:w-auto"
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          disabled={disabled}
          onClick={() => onChange(option.value)}
          className={`min-w-0 flex-1 whitespace-nowrap rounded-full px-2.5 py-1.5 text-xs font-semibold transition-all sm:flex-none sm:px-3 sm:text-sm ${
            value === option.value
              ? "bg-white text-on-surface shadow-[0_1px_2px_rgba(0,0,0,0.05)]"
              : "text-gray-500 hover:text-on-surface"
          } ${disabled ? "cursor-wait opacity-60" : ""}`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function TargetCheck({
  checked,
  complete,
  onClick,
  label,
}: {
  checked: boolean;
  complete: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border transition-all ${
        checked
          ? complete
            ? "border-brand-green bg-brand-green-light text-brand-green-deep"
            : "border-on-surface bg-on-surface text-pure-white"
          : "border-border-medium bg-white text-transparent hover:border-brand-green"
      }`}
      aria-label={label}
    >
      <span className="material-symbols-outlined text-[17px]">check</span>
    </button>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="mb-4 rounded-2xl border border-[#f1c2bc] bg-[#fff4f2] px-4 py-3 text-sm text-[#c54f41]">
      {message}
    </div>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-5 py-8 text-center text-sm text-gray-500">
      {children}
    </div>
  );
}

const DHAKA_OFFSET_MS = 6 * 60 * 60 * 1000;

function formatDateInputValue(timestamp?: number) {
  if (timestamp === undefined) {
    return "";
  }

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

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day)
  ) {
    return null;
  }

  return Date.UTC(year, month - 1, day) - DHAKA_OFFSET_MS;
}

export default function SettingsWorkspace() {
  const { data, refresh } = useSnapshotQuery(
    api.plannerQueries.getSettingsPageData,
    {},
  ) as {
    data: SettingsPageData | undefined;
    refresh: () => Promise<unknown>;
  };
  const setDashboardTermDates = useMutation(api.mutations.setDashboardTermDates);
  const setDashboardComponentVisibility = useMutation(
    api.mutations.setDashboardComponentVisibility,
  );
  const setPlannerSubjectPriority = useMutation(
    api.mutations.setPlannerSubjectPriority,
  );
  const setCoachingChapterProgress = useMutation(
    api.mutations.setCoachingChapterProgress,
  );
  const addWeeklyTarget = useMutation(api.mutations.addWeeklyTarget);
  const removeWeeklyTarget = useMutation(api.mutations.removeWeeklyTarget);
  const setDefaultRevisionMinutes = useMutation(
    api.mutations.setDefaultRevisionMinutes,
  );
  const importHscSyllabusForCurrentUser = useMutation(
    api.onboarding.importHscSyllabusForCurrentUser,
  );
  const { theme, setTheme } = useTheme();
  const [activeSection, setActiveSection] = useState<SectionId>("dashboard");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [revisionMinutesDraft, setRevisionMinutesDraft] = useState<string | null>(
    null,
  );
  const [termStartDateDraft, setTermStartDateDraft] = useState<string | null>(
    null,
  );
  const [nextTermExamDateDraft, setNextTermExamDateDraft] = useState<string | null>(
    null,
  );

  const summary = useMemo(() => {
    if (!data) {
      return {
        importantSubjects: 0,
        weeklyTargets: 0,
        runningCoaching: 0,
      };
    }

    return data.subjects.reduce(
      (acc, subject) => {
        if (subject.priority === "important") {
          acc.importantSubjects += 1;
        }

        for (const chapter of subject.chapters) {
          if (chapter.isWeeklyTarget) {
            acc.weeklyTargets += 1;
          }
          if (chapter.coachingStatus === "running") {
            acc.runningCoaching += 1;
          }
          acc.weeklyTargets += chapter.concepts.filter(
            (concept) => concept.isWeeklyTarget,
          ).length;
        }

        return acc;
      },
      { importantSubjects: 0, weeklyTargets: 0, runningCoaching: 0 },
    );
  }, [data]);

  if (data === undefined) {
    return <SettingsPageSkeleton />;
  }

  const revisionMinutes =
    revisionMinutesDraft ?? String(data.defaultRevisionMinutes);
  const termStartDate =
    termStartDateDraft ?? formatDateInputValue(data.termStartDate);
  const nextTermExamDate =
    nextTermExamDateDraft ?? formatDateInputValue(data.nextTermExamDate);
  const dashboardComponentVisibility =
    data.dashboardComponentVisibility ?? DEFAULT_DASHBOARD_COMPONENT_VISIBILITY;

  const runMutation = async (key: string, action: () => Promise<unknown>) => {
    setSavingKey(key);
    setErrorMessage(null);

    try {
      await action();
      await refresh();
    } catch (error) {
      console.error("Settings update failed:", error);
      if (error instanceof Error && error.message.includes("custom subjects")) {
        setErrorMessage(
          "HSC সিলেবাস ইমপোর্ট করতে হলে আগে কোনো কাস্টম বিষয় থাকা যাবে না।",
        );
        return;
      }
      setErrorMessage("সেটিংস আপডেট করা যায়নি। আবার চেষ্টা করুন।");
    } finally {
      setSavingKey(null);
    }
  };

  const handleSubjectPriority = (subject: SettingsSubject) => {
    void runMutation(`priority-${subject._id}`, () =>
      setPlannerSubjectPriority({
        subjectId: subject._id,
        priority: subject.priority === "important" ? "normal" : "important",
      }),
    );
  };

  const handleChapterTarget = (chapter: SettingsChapter) => {
    void runMutation(`chapter-target-${chapter._id}`, () => {
      if (chapter.isWeeklyTarget && chapter.weeklyTargetId) {
        return removeWeeklyTarget({ weeklyTargetId: chapter.weeklyTargetId });
      }

      return addWeeklyTarget({
        kind: "chapter",
        chapterId: chapter._id,
      });
    });
  };

  const handleConceptTarget = (
    chapter: SettingsChapter,
    concept: SettingsConcept,
  ) => {
    void runMutation(`concept-target-${concept._id}`, () => {
      if (concept.isWeeklyTarget && concept.weeklyTargetId) {
        return removeWeeklyTarget({ weeklyTargetId: concept.weeklyTargetId });
      }

      return addWeeklyTarget({
        kind: "concept",
        chapterId: chapter._id,
        conceptId: concept._id,
      });
    });
  };

  const handleCoachingStatus = (
    chapter: SettingsChapter,
    status: CoachingStatus,
  ) => {
    void runMutation(`coaching-${chapter._id}`, () =>
      setCoachingChapterProgress({
        chapterId: chapter._id,
        status,
      }),
    );
  };

  const handleSaveRevisionMinutes = () => {
    const minutes = Number(revisionMinutes);
    void runMutation("revision-minutes", () =>
      setDefaultRevisionMinutes({ minutes }),
    );
  };

  const handleImportHscSyllabus = () => {
    const shouldImport = window.confirm(
      "HSC সিলেবাস ইমপোর্ট করলে ৮টি বিষয় এবং তাদের অধ্যায়/কনসেপ্ট তৈরি হবে। চালিয়ে যাবেন?",
    );

    if (!shouldImport) {
      return;
    }

    void runMutation("import-hsc-syllabus", () =>
      importHscSyllabusForCurrentUser(),
    );
  };

  const handleSaveDashboardTermDates = () => {
    const parsedTermStartDate = parseDateInputValue(termStartDate);
    const parsedNextTermExamDate = parseDateInputValue(nextTermExamDate);

    if (parsedTermStartDate === null || parsedNextTermExamDate === null) {
      setErrorMessage("টার্ম শুরুর তারিখ আর পরীক্ষার তারিখ দুটোই দিন।");
      return;
    }

    if (parsedTermStartDate >= parsedNextTermExamDate) {
      setErrorMessage("টার্ম শুরুর তারিখ পরীক্ষার তারিখের আগে হতে হবে।");
      return;
    }

    void runMutation("dashboard-term-dates", () =>
      setDashboardTermDates({
        termStartDate: parsedTermStartDate,
        nextTermExamDate: parsedNextTermExamDate,
      }),
    );
  };

  const handleDashboardComponentVisibility = (
        componentKey: DashboardComponentKey,
  ) => {
    void runMutation(`dashboard-component-${componentKey}`, () =>
      setDashboardComponentVisibility({
        componentKey,
        isVisible: !dashboardComponentVisibility[componentKey],
      }),
    );
  };

  const renderSection = () => {
    if (activeSection === "dashboard") {
      return (
        <DashboardSettingsSection
          termStartDate={termStartDate}
          nextTermExamDate={nextTermExamDate}
          savedTermStartDate={data.termStartDate}
          savedNextTermExamDate={data.nextTermExamDate}
          componentVisibility={dashboardComponentVisibility}
          saving={savingKey === "dashboard-term-dates"}
          savingComponentKey={
            savingKey?.startsWith("dashboard-component-")
              ? (savingKey.replace(
                  "dashboard-component-",
                  "",
                ) as DashboardComponentKey)
              : null
          }
          onTermStartDateChange={setTermStartDateDraft}
          onNextTermExamDateChange={setNextTermExamDateDraft}
          onSave={handleSaveDashboardTermDates}
          onToggleComponent={handleDashboardComponentVisibility}
        />
      );
    }

    if (activeSection === "planner") {
      return (
        <PlannerSection
          subjects={data.subjects}
          savingKey={savingKey}
          onTogglePriority={handleSubjectPriority}
        />
      );
    }

    if (activeSection === "targets") {
      return (
        <TargetsSection
          subjects={data.subjects}
          onToggleChapter={handleChapterTarget}
          onToggleConcept={handleConceptTarget}
        />
      );
    }

    if (activeSection === "coaching") {
      return (
        <CoachingSection
          subjects={data.subjects}
          savingKey={savingKey}
          onChangeStatus={handleCoachingStatus}
        />
      );
    }

    if (activeSection === "appearance") {
      return (
        <AppearanceSection
          theme={theme}
          onThemeChange={(nextTheme) => setTheme(nextTheme)}
        />
      );
    }

    if (activeSection === "revision") {
      return (
        <RevisionSection
          minutes={revisionMinutes}
          savedMinutes={data.defaultRevisionMinutes}
          saving={savingKey === "revision-minutes"}
          onMinutesChange={setRevisionMinutesDraft}
          onSave={handleSaveRevisionMinutes}
        />
      );
    }

    if (activeSection === "subjects") {
      return (
        <SubjectsSection
          subjects={data.subjects}
          classLevel={data.classLevel}
          isImportingHsc={savingKey === "import-hsc-syllabus"}
          onImportHsc={handleImportHscSyllabus}
        />
      );
    }

    return <FutureSection item={navItems.find((item) => item.id === activeSection)} />;
  };

  const renderMobileSections = () => (
    <div className="space-y-4 lg:hidden">
      {errorMessage ? <ErrorBanner message={errorMessage} /> : null}
      <DashboardSettingsSection
        termStartDate={termStartDate}
        nextTermExamDate={nextTermExamDate}
        savedTermStartDate={data.termStartDate}
        savedNextTermExamDate={data.nextTermExamDate}
        componentVisibility={dashboardComponentVisibility}
        saving={savingKey === "dashboard-term-dates"}
        savingComponentKey={
          savingKey?.startsWith("dashboard-component-")
            ? (savingKey.replace(
                "dashboard-component-",
                "",
              ) as DashboardComponentKey)
            : null
        }
        onTermStartDateChange={setTermStartDateDraft}
        onNextTermExamDateChange={setNextTermExamDateDraft}
        onSave={handleSaveDashboardTermDates}
        onToggleComponent={handleDashboardComponentVisibility}
        sectionOptions={{ collapsible: true, defaultOpen: true }}
      />
      <PlannerSection
        subjects={data.subjects}
        savingKey={savingKey}
        onTogglePriority={handleSubjectPriority}
        sectionOptions={{ collapsible: true }}
      />
      <TargetsSection
        subjects={data.subjects}
        onToggleChapter={handleChapterTarget}
        onToggleConcept={handleConceptTarget}
        sectionOptions={{ collapsible: true }}
      />
      <CoachingSection
        subjects={data.subjects}
        savingKey={savingKey}
        onChangeStatus={handleCoachingStatus}
        sectionOptions={{ collapsible: true }}
      />
      <AppearanceSection
        theme={theme}
        onThemeChange={(nextTheme) => setTheme(nextTheme)}
        sectionOptions={{ collapsible: true }}
      />
      <RevisionSection
        minutes={revisionMinutes}
        savedMinutes={data.defaultRevisionMinutes}
        saving={savingKey === "revision-minutes"}
        onMinutesChange={setRevisionMinutesDraft}
        onSave={handleSaveRevisionMinutes}
        sectionOptions={{ collapsible: true }}
      />
      <SubjectsSection
        subjects={data.subjects}
        classLevel={data.classLevel}
        isImportingHsc={savingKey === "import-hsc-syllabus"}
        onImportHsc={handleImportHscSyllabus}
        sectionOptions={{ collapsible: true }}
      />
      <FutureSettingsSection sectionOptions={{ collapsible: true }} />
    </div>
  );

  return (
    <div className="max-w-full overflow-hidden space-y-6">
      <HeaderSummary
        importantSubjects={summary.importantSubjects}
        weeklyTargets={summary.weeklyTargets}
        runningCoaching={summary.runningCoaching}
      />

      {renderMobileSections()}

      <div className="hidden gap-5 lg:grid lg:grid-cols-[260px_1fr]">
        <SettingsNav activeSection={activeSection} onChange={setActiveSection} />
        <div className="min-w-0">
          {errorMessage ? <ErrorBanner message={errorMessage} /> : null}
          {renderSection()}
        </div>
      </div>
    </div>
  );
}

function DashboardSettingsSection({
  termStartDate,
  nextTermExamDate,
  savedTermStartDate,
  savedNextTermExamDate,
  componentVisibility,
  saving,
  savingComponentKey,
  onTermStartDateChange,
  onNextTermExamDateChange,
  onSave,
  onToggleComponent,
  sectionOptions,
}: {
  termStartDate: string;
  nextTermExamDate: string;
  savedTermStartDate?: number;
  savedNextTermExamDate?: number;
  componentVisibility: DashboardComponentVisibility;
  saving: boolean;
  savingComponentKey: DashboardComponentKey | null;
  onTermStartDateChange: (value: string) => void;
  onNextTermExamDateChange: (value: string) => void;
  onSave: () => void;
  onToggleComponent: (componentKey: DashboardComponentKey) => void;
  sectionOptions?: SettingsSectionOptions;
}) {
  const parsedTermStartDate = parseDateInputValue(termStartDate);
  const parsedNextTermExamDate = parseDateInputValue(nextTermExamDate);
  const hasBothDates =
    parsedTermStartDate !== null && parsedNextTermExamDate !== null;
  const hasValidRange =
    hasBothDates && parsedTermStartDate < parsedNextTermExamDate;
  const hasChanges =
    parsedTermStartDate !== savedTermStartDate ||
    parsedNextTermExamDate !== savedNextTermExamDate;

  return (
    <SettingsSection
      title="ড্যাশবোর্ড টাইমলাইন"
      description="হোম ড্যাশবোর্ডের countdown, urgency আর progression rate এই দুই তারিখ থেকে হিসাব করবে।"
      icon="dashboard"
      {...sectionOptions}
    >
      <SettingsRow
        title="টার্ম শুরুর তারিখ"
        description="এই তারিখ থেকে progress pace আর time-left comparison শুরু হবে।"
      >
        <input
          type="date"
          value={termStartDate}
          onChange={(event) => onTermStartDateChange(event.target.value)}
          className="h-10 w-full rounded-full border border-border-medium bg-white px-4 text-sm text-on-surface outline-none transition-all focus:border-brand-green sm:w-56"
        />
      </SettingsRow>
      <SettingsRow
        title="পরবর্তী টার্ম পরীক্ষার তারিখ"
        description="ড্যাশবোর্ড এই তারিখ ধরে remaining time আর required pace দেখাবে।"
      >
        <input
          type="date"
          value={nextTermExamDate}
          onChange={(event) => onNextTermExamDateChange(event.target.value)}
          className="h-10 w-full rounded-full border border-border-medium bg-white px-4 text-sm text-on-surface outline-none transition-all focus:border-brand-green sm:w-56"
        />
      </SettingsRow>
      <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <p className="text-sm text-gray-500">
          {hasBothDates
            ? hasValidRange
              ? "এই timeline ঠিক আছে। এখন ড্যাশবোর্ড urgency দেখাতে পারবে।"
              : "শুরুর তারিখ পরীক্ষার তারিখের আগে হতে হবে।"
            : "দুইটা তারিখই দিলে dashboard countdown live হবে।"}
        </p>
        <button
          type="button"
          disabled={!hasValidRange || !hasChanges || saving}
          onClick={onSave}
          className="h-10 rounded-full bg-on-surface px-5 text-sm font-semibold text-pure-white transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
        >
          {saving ? "Saving" : "Save"}
        </button>
      </div>
      <div className="px-4 py-4 sm:px-5">
        <div className="mb-3">
          <p className="text-sm font-semibold text-on-surface">
            ড্যাশবোর্ডে যা দেখাবেন
          </p>
          <p className="mt-1 text-sm leading-6 text-gray-500">
            আপনার দরকারি analytics আর components অন/অফ করুন।
          </p>
        </div>
        <div className="divide-y divide-border-subtle rounded-2xl border border-border-subtle">
          {DASHBOARD_COMPONENT_KEYS.map((componentKey) => {
            const label = dashboardComponentLabels[componentKey];
            return (
              <div
                key={componentKey}
                className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-on-surface">
                    {label.title}
                  </p>
                  <p className="mt-1 text-sm leading-6 text-gray-500">
                    {label.description}
                  </p>
                </div>
                <Switch
                  checked={componentVisibility[componentKey]}
                  disabled={savingComponentKey === componentKey}
                  label={`${label.title} dashboard visibility`}
                  onChange={() => onToggleComponent(componentKey)}
                />
              </div>
            );
          })}
        </div>
      </div>
    </SettingsSection>
  );
}

function HeaderSummary({
  importantSubjects,
  weeklyTargets,
  runningCoaching,
}: {
  importantSubjects: number;
  weeklyTargets: number;
  runningCoaching: number;
}) {
  return (
    <header className="rounded-2xl border border-border-subtle bg-white px-4 py-4 sm:px-5 sm:py-5">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="font-mono-code text-[10px] uppercase tracking-[0.16em] text-brand-green-deep sm:text-[11px]">
            Settings
          </p>
          <h1 className="mt-2 font-section-heading text-2xl font-bold leading-tight text-on-surface sm:text-3xl">
            সেটিংস
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-500">
            পড়াশোনার অপারেশন কন্ট্রোল করুন: প্ল্যানার, টার্গেট, কোচিং, থিম
            এবং রিভিশন ডিফল্ট।
          </p>
        </div>

        <div className="grid w-full grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] gap-1.5 text-center sm:gap-2 md:w-auto">
        <SummaryPill label="Important" mobileLabel="Imp" value={importantSubjects} />
        <SummaryPill label="Targets" mobileLabel="Target" value={weeklyTargets} />
        <SummaryPill label="Running" mobileLabel="Coach" value={runningCoaching} />
      </div>
      </div>
    </header>
  );
}

function SummaryPill({
  label,
  mobileLabel,
  value,
}: {
  label: string;
  mobileLabel: string;
  value: number;
}) {
  return (
    <div className="min-w-0 rounded-2xl border border-border-subtle px-2 py-2 sm:px-3">
      <div className="text-base font-bold text-on-surface">{value}</div>
      <div className="truncate text-[10px] font-semibold uppercase tracking-[0.08em] text-gray-500 sm:text-[11px] sm:tracking-[0.12em]">
        <span className="sm:hidden">{mobileLabel}</span>
        <span className="hidden sm:inline">{label}</span>
      </div>
    </div>
  );
}

function PlannerSection({
  subjects,
  savingKey,
  onTogglePriority,
  sectionOptions,
}: {
  subjects: SettingsSubject[];
  savingKey: string | null;
  onTogglePriority: (subject: SettingsSubject) => void;
  sectionOptions?: SettingsSectionOptions;
}) {
  return (
    <SettingsSection
      title="প্ল্যানার"
      description="AI Planner কোন বিষয়গুলোকে বেশি গুরুত্ব দেবে তা এখানে ঠিক করুন।"
      icon="psychology"
      {...sectionOptions}
    >
      {subjects.length === 0 ? (
        <EmptyState>এখনো কোনো বিষয় নেই।</EmptyState>
      ) : (
        subjects.map((subject) => (
          <SettingsRow
            key={subject._id}
            title={subject.name}
            description={
              subject.priority === "important"
                ? "এই বিষয়টি প্ল্যানারে বেশি অগ্রাধিকার পাবে।"
                : "সাধারণ অগ্রাধিকারে থাকবে।"
            }
          >
            <Switch
              checked={subject.priority === "important"}
              disabled={savingKey === `priority-${subject._id}`}
              label={`${subject.name} important priority`}
              onChange={() => onTogglePriority(subject)}
            />
          </SettingsRow>
        ))
      )}
    </SettingsSection>
  );
}

function TargetsSection({
  subjects,
  onToggleChapter,
  onToggleConcept,
  sectionOptions,
}: {
  subjects: SettingsSubject[];
  onToggleChapter: (chapter: SettingsChapter) => void;
  onToggleConcept: (chapter: SettingsChapter, concept: SettingsConcept) => void;
  sectionOptions?: SettingsSectionOptions;
}) {
  return (
    <SettingsSection
      title="সাপ্তাহিক টার্গেট"
      description="এই সপ্তাহে ফোকাস করার জন্য চ্যাপ্টার বা কনসেপ্ট বেছে নিন।"
      icon="flag"
      {...sectionOptions}
    >
      {subjects.length === 0 ? (
        <EmptyState>টার্গেট বানানোর মতো কোনো বিষয় নেই।</EmptyState>
      ) : (
        <div className="divide-y divide-border-subtle">
          {subjects.map((subject) => {
            const theme = getSubjectTheme(subject.color);
            return (
              <details key={subject._id} className="group">
                <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-4 sm:px-5">
                  <span
                    className={`flex h-9 w-9 items-center justify-center rounded-xl ${theme.iconBg} ${theme.iconColor}`}
                  >
                    <span className="material-symbols-outlined text-[19px]">
                      {subject.icon ?? "menu_book"}
                    </span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-on-surface">
                      {subject.name}
                    </span>
                    <span className="block text-xs text-gray-500">
                      {subject.chapters.length} next-term chapters
                    </span>
                  </span>
                  <span className="material-symbols-outlined text-[20px] text-gray-400 transition-transform group-open:rotate-90">
                    chevron_right
                  </span>
                </summary>

                <div className="pb-3">
                  {subject.chapters.length === 0 ? (
                    <div className="px-5 pb-4 pl-[68px] text-sm text-gray-500">
                      পরের টার্মের কোনো চ্যাপ্টার সেট করা নেই।
                    </div>
                  ) : (
                    subject.chapters.map((chapter) => (
                      <div key={chapter._id} className="px-3 py-2 sm:px-5">
                        <div className="flex items-start gap-3 rounded-xl px-2 py-2 hover:bg-gray-100">
                          <TargetCheck
                            checked={chapter.isWeeklyTarget}
                            complete={chapter.isTargetComplete}
                            label={`${chapter.name} weekly target`}
                            onClick={() => onToggleChapter(chapter)}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="break-words text-sm font-semibold text-on-surface">
                              {chapter.name}
                            </p>
                            {chapter.concepts.length > 0 ? (
                              <div className="mt-2 space-y-1.5 border-l border-border-subtle pl-3">
                                {chapter.concepts.map((concept) => (
                                  <div
                                    key={concept._id}
                                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-white"
                                  >
                                    <TargetCheck
                                      checked={concept.isWeeklyTarget}
                                      complete={concept.isTargetComplete}
                                      label={`${concept.name} weekly target`}
                                      onClick={() =>
                                        onToggleConcept(chapter, concept)
                                      }
                                    />
                                    <span className="min-w-0 flex-1 break-words text-sm text-gray-600">
                                      {concept.name}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </details>
            );
          })}
        </div>
      )}
    </SettingsSection>
  );
}

function CoachingSection({
  subjects,
  savingKey,
  onChangeStatus,
  sectionOptions,
}: {
  subjects: SettingsSubject[];
  savingKey: string | null;
  onChangeStatus: (chapter: SettingsChapter, status: CoachingStatus) => void;
  sectionOptions?: SettingsSectionOptions;
}) {
  const subjectsWithChapters = subjects.filter(
    (subject) => subject.chapters.length > 0,
  );

  return (
    <SettingsSection
      title="কোচিং অগ্রগতি"
      description="প্রতিটি চ্যাপ্টারের স্কুল/কোচিং স্ট্যাটাস আপডেট করুন।"
      icon="school"
      {...sectionOptions}
    >
      {subjectsWithChapters.length === 0 ? (
        <EmptyState>কোচিং ট্র্যাক করার মতো পরের টার্মের চ্যাপ্টার নেই।</EmptyState>
      ) : (
        <div className="divide-y divide-border-subtle">
          {subjectsWithChapters.map((subject) => {
            const theme = getSubjectTheme(subject.color);
            const counts: Record<CoachingStatus, number> = {
              not_started: 0,
              running: 0,
              finished: 0,
            };

            for (const chapter of subject.chapters) {
              counts[chapter.coachingStatus] += 1;
            }

            return (
              <details key={subject._id} className="group">
                <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-4 sm:px-5">
                  <span
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${theme.iconBg} ${theme.iconColor}`}
                  >
                    <span className="material-symbols-outlined text-[19px]">
                      {subject.icon ?? "menu_book"}
                    </span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-on-surface">
                      {subject.name}
                    </span>
                    <span className="mt-2 flex flex-wrap gap-1.5">
                      {coachingOptions.map((option) => (
                        <StatusCountPill
                          key={option.value}
                          label={option.label}
                          value={counts[option.value]}
                        />
                      ))}
                    </span>
                  </span>
                  <span
                    className="material-symbols-outlined text-[20px] text-gray-400 transition-transform group-open:rotate-90"
                    aria-hidden="true"
                  >
                    chevron_right
                  </span>
                </summary>

                <div className="divide-y divide-border-subtle border-t border-border-subtle">
                  {subject.chapters.map((chapter) => (
                    <SettingsRow
                      key={chapter._id}
                      title={chapter.name}
                      description={subject.name}
                    >
                      <SegmentedControl
                        value={chapter.coachingStatus}
                        options={coachingOptions}
                        label={`${chapter.name} coaching status`}
                        disabled={savingKey === `coaching-${chapter._id}`}
                        onChange={(status) => onChangeStatus(chapter, status)}
                      />
                    </SettingsRow>
                  ))}
                </div>
              </details>
            );
          })}
        </div>
      )}
    </SettingsSection>
  );
}

function StatusCountPill({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <span className="inline-flex items-center rounded-full border border-border-subtle bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-500">
      {label}: {value}
    </span>
  );
}

function AppearanceSection({
  theme,
  onThemeChange,
  sectionOptions,
}: {
  theme: ThemeMode;
  onThemeChange: (theme: ThemeMode) => void;
  sectionOptions?: SettingsSectionOptions;
}) {
  const pwaInstallPrompt = usePwaInstallPromptContext();

  return (
    <SettingsSection
      title="দেখানোর ধরন"
      description="অ্যাপের রঙ আপনার কাজের পরিবেশ অনুযায়ী রাখুন।"
      icon="palette"
      {...sectionOptions}
    >
      <SettingsRow
        title="থিম"
        description="লাইট, ডার্ক, বা ডিভাইসের সেটিং অনুসরণ করুন।"
      >
        <SegmentedControl
          value={theme}
          options={themeOptions}
          label="Theme mode"
          onChange={onThemeChange}
        />
      </SettingsRow>
      <SettingsRow
        title="অ্যাপ ইনস্টল"
        description="হোম স্ক্রিন থেকে গন্তব্য দ্রুত খুলতে Android-এ এই ওয়েব অ্যাপ ইনস্টল করুন।"
      >
        <PwaInstallAction {...pwaInstallPrompt} />
      </SettingsRow>
    </SettingsSection>
  );
}

function RevisionSection({
  minutes,
  savedMinutes,
  saving,
  onMinutesChange,
  onSave,
  sectionOptions,
}: {
  minutes: string;
  savedMinutes: number;
  saving: boolean;
  onMinutesChange: (value: string) => void;
  onSave: () => void;
  sectionOptions?: SettingsSectionOptions;
}) {
  const parsedMinutes = Number(minutes);
  const isValid =
    Number.isInteger(parsedMinutes) && parsedMinutes >= 1 && parsedMinutes <= 600;
  const hasChanges = isValid && parsedMinutes !== savedMinutes;

  return (
    <SettingsSection
      title="রিভিশন"
      description="রিভিশন লগে ডিফল্ট সময় কত মিনিট ধরা হবে তা ঠিক করুন।"
      icon="history_edu"
      {...sectionOptions}
    >
      <SettingsRow
        title="রিভিশনের সময়"
        description="কনসেপ্ট রিভিউ করলে এই সময়টি study log-এ বসবে।"
      >
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:flex-nowrap">
          <input
            type="number"
            min={1}
            max={600}
            value={minutes}
            onChange={(event) => onMinutesChange(event.target.value)}
            className="h-10 min-w-0 flex-1 rounded-full border border-border-medium bg-white px-4 text-sm text-on-surface outline-none transition-all focus:border-brand-green sm:w-24 sm:flex-none"
          />
          <button
            type="button"
            disabled={!hasChanges || saving}
            onClick={onSave}
            className="h-10 flex-1 rounded-full bg-on-surface px-4 text-sm font-semibold text-pure-white transition-opacity disabled:cursor-not-allowed disabled:opacity-40 sm:flex-none"
          >
            {saving ? "সেভ হচ্ছে" : "সেভ করুন"}
          </button>
        </div>
      </SettingsRow>
      {!isValid ? (
        <div className="px-5 pb-4 text-sm text-[#c54f41]">
          ১ থেকে ৬০০ মিনিটের মধ্যে পূর্ণ সংখ্যা দিন।
        </div>
      ) : null}
    </SettingsSection>
  );
}

function SubjectsSection({
  subjects,
  classLevel,
  isImportingHsc,
  onImportHsc,
  sectionOptions,
}: {
  subjects: SettingsSubject[];
  classLevel: "hsc" | "other" | null;
  isImportingHsc: boolean;
  onImportHsc: () => void;
  sectionOptions?: SettingsSectionOptions;
}) {
  return (
    <SettingsSection
      title="বিষয়"
      description="প্রতিটি বিষয়ের ট্র্যাকার কনফিগারেশন এক জায়গায় দেখুন।"
      icon="auto_stories"
      {...sectionOptions}
    >
      {classLevel === "other" ? (
        <SettingsRow
          title="HSC সিলেবাস ইমপোর্ট"
          description="শুধু খালি ওয়ার্কস্পেসে প্রস্তুত HSC বিষয়, অধ্যায় ও কনসেপ্ট যোগ করা যাবে।"
        >
          <button
            type="button"
            disabled={isImportingHsc}
            onClick={onImportHsc}
            className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-full bg-on-surface px-4 text-sm font-semibold text-pure-white transition-opacity disabled:cursor-wait disabled:opacity-50 sm:w-auto"
          >
            <span className="material-symbols-outlined text-[18px]">
              download
            </span>
            {isImportingHsc ? "ইমপোর্ট হচ্ছে" : "HSC ইমপোর্ট"}
          </button>
        </SettingsRow>
      ) : null}
      {subjects.length === 0 ? (
        <EmptyState>এখনো কোনো বিষয় নেই।</EmptyState>
      ) : (
        subjects.map((subject) => {
          const theme = getSubjectTheme(subject.color);
          return (
            <div key={subject._id} className="px-4 py-4 sm:px-5">
              <div className="flex items-center gap-3">
                <span
                  className={`flex h-9 w-9 items-center justify-center rounded-xl ${theme.iconBg} ${theme.iconColor}`}
                >
                  <span className="material-symbols-outlined text-[19px]">
                    {subject.icon ?? "menu_book"}
                  </span>
                </span>
                <div>
                  <p className="text-sm font-semibold text-on-surface">
                    {subject.name}
                  </p>
                  <p className="text-xs text-gray-500">
                    অধ্যায়ের কাজ {subject.chapterTrackers.length}টি,{" "}
                    কনসেপ্টের কাজ {subject.conceptTrackers.length}টি
                  </p>
                </div>
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <TrackerGroup title="অধ্যায়ের কাজ" items={subject.chapterTrackers} />
                <TrackerGroup title="কনসেপ্টের কাজ" items={subject.conceptTrackers} />
              </div>
            </div>
          );
        })
      )}
    </SettingsSection>
  );
}

function TrackerGroup({
  title,
  items,
}: {
  title: string;
  items: TrackerConfig[];
}) {
  return (
    <div className="rounded-xl border border-border-subtle p-3">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">
        {title}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {items.length === 0 ? (
          <span className="text-sm text-gray-500">কোনো ট্র্যাকার নেই</span>
        ) : (
          items.map((item) => (
            <span
              key={item.key}
              className="rounded-full border border-border-subtle bg-gray-100 px-3 py-1 text-xs text-gray-600"
            >
              {item.label} · {item.avgMinutes}m
            </span>
          ))
        )}
      </div>
    </div>
  );
}

function FutureSection({ item }: { item?: NavItem }) {
  return (
    <SettingsSection
      title={item?.label ?? "পরে আসছে"}
      description="এই সেটিংস সেকশন পরে যোগ করা হবে।"
      icon={item?.icon ?? "more_horiz"}
    >
      <EmptyState>
        এই অংশটি পরে যোগ করা হবে। এখন পড়াশোনার দরকারি সেটিংসগুলো চালু আছে।
      </EmptyState>
    </SettingsSection>
  );
}

function FutureSettingsSection({
  sectionOptions,
}: {
  sectionOptions?: SettingsSectionOptions;
}) {
  const futureItems = navItems.filter((item) => item.disabled);

  return (
    <SettingsSection
      title="আরও সেটিংস"
      description="এই অংশগুলো ভবিষ্যতে live করা হবে।"
      icon="more_horiz"
      {...sectionOptions}
    >
      {futureItems.map((item) => (
        <SettingsRow
          key={item.id}
          title={item.label}
          description={item.description}
        >
          <span className="inline-flex rounded-full border border-border-subtle bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-500">
            পরে আসছে
          </span>
        </SettingsRow>
      ))}
    </SettingsSection>
  );
}

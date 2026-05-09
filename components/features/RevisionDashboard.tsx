"use client";

import { useMemo, useState } from "react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import ConceptReviewModal from "./ConceptReviewModal";
import RescheduleModal from "./RescheduleModal";
import { RevisionSkeleton } from "./LoadingSkeletons";
import { getSubjectTheme } from "./subjectTheme";
import { useSnapshotQuery } from "./useSnapshotQuery";

type ReviewConcept = {
  _id: Id<"concepts">;
  name: string;
  reviewCount?: number;
  nextReviewAt?: number;
  repetitionLevel?: number;
  chapterName: string;
  subjectName: string;
  subjectColor?: string;
  subjectIcon?: string;
};

type ActiveModalState =
  | { type: "review"; concept: ReviewConcept }
  | { type: "reschedule"; concept: ReviewConcept }
  | null;

export default function RevisionDashboard() {
  const [selectedSubjectId, setSelectedSubjectId] = useState<Id<"subjects"> | "all">("all");
  const [activeModal, setActiveModal] = useState<ActiveModalState>(null);
  const [now] = useState(() => Date.now());
  const dashboardArgs = useMemo(
    () => ({
      now,
      subjectId: selectedSubjectId === "all" ? undefined : selectedSubjectId,
    }),
    [now, selectedSubjectId],
  );

  const { data: dashboardData, refresh: refreshReviews } = useSnapshotQuery(
    api.queries.getReviewsDashboardData,
    dashboardArgs,
  );
  const { data: subjects } = useSnapshotQuery(api.queries.getSubjectsForFilter, {});

  if (!dashboardData || !subjects) {
    return <RevisionSkeleton />;
  }

  const { overdue, dueToday, upcoming, stats } = dashboardData;
  const activeReviews = [...overdue, ...dueToday];

  const formatDate = (ts: number) =>
    new Date(ts).toLocaleDateString("bn-BD", {
      month: "short",
      day: "numeric",
    });

  return (
    <div className="space-y-10">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard
          label="বিগত (Overdue)"
          count={stats.overdueCount}
          color="bg-red-50 text-red-600"
          icon="history"
        />
        <StatCard
          label="আজকের লক্ষ্য"
          count={stats.dueTodayCount}
          color="bg-emerald-50 text-brand-green"
          icon="today"
        />
        <StatCard
          label="আসন্ন (৭ দিন)"
          count={stats.upcomingCount}
          color="bg-slate-100 text-slate-600"
          icon="event_upcoming"
        />
      </div>

      <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide">
        <FilterPill
          label="সব বিষয়"
          isActive={selectedSubjectId === "all"}
          onClick={() => {
            setActiveModal(null);
            setSelectedSubjectId("all");
          }}
        />
        {subjects.map((subject) => (
          <FilterPill
            key={subject._id}
            label={subject.name}
            isActive={selectedSubjectId === subject._id}
            onClick={() => {
              setActiveModal(null);
              setSelectedSubjectId(subject._id);
            }}
          />
        ))}
      </div>

      <section>
        <div className="flex justify-between items-end mb-6">
          <h2 className="font-section-heading text-xl text-on-surface">
            রিভিশন ফিড
          </h2>
          <span className="text-xs font-mono-code text-gray-400 uppercase tracking-widest">
            {activeReviews.length}টি পেন্ডিং
          </span>
        </div>

        {activeReviews.length === 0 ? (
          <div className="bg-white rounded-3xl border border-border-subtle p-12 text-center">
            <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="material-symbols-outlined text-brand-green text-3xl">
                task_alt
              </span>
            </div>
            <h3 className="text-lg font-sub-heading text-on-surface mb-2">
              আজকের সব রিভিশন সম্পন্ন!
            </h3>
            <p className="text-sm font-body text-gray-500">
              চমৎকার কাজ! নতুন কিছু শেখার সময় এখন।
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {activeReviews.map((concept) => (
              <ReviewItemCard
                key={concept._id}
                concept={concept}
                isOverdue={Boolean(
                  concept.nextReviewAt && concept.nextReviewAt < now - 86400000
                )}
                onReview={() => setActiveModal({ type: "review", concept })}
                onReschedule={() => setActiveModal({ type: "reschedule", concept })}
                formatDate={formatDate}
              />
            ))}
          </div>
        )}
      </section>

      {upcoming.length > 0 ? (
        <section className="opacity-60 grayscale hover:opacity-100 hover:grayscale-0 transition-all duration-300">
          <h2 className="font-section-heading text-lg text-on-surface mb-6">
            আসন্ন রিভিশন
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {upcoming.map((concept) => (
              <ReviewItemCard
                key={concept._id}
                concept={concept}
                isUpcoming
                onReview={() => setActiveModal({ type: "review", concept })}
                onReschedule={() => setActiveModal({ type: "reschedule", concept })}
                formatDate={formatDate}
              />
            ))}
          </div>
        </section>
      ) : null}

      {activeModal?.type === "review" ? (
        <ConceptReviewModal
          isOpen
          onClose={() => setActiveModal(null)}
          concept={activeModal.concept}
          onCompleted={refreshReviews}
        />
      ) : null}

      {activeModal?.type === "reschedule" ? (
        <RescheduleModal
          key={`${activeModal.concept._id}:${activeModal.concept.nextReviewAt ?? "none"}`}
          isOpen
          onClose={() => setActiveModal(null)}
          concept={activeModal.concept}
          onCompleted={refreshReviews}
        />
      ) : null}
    </div>
  );
}

function StatCard({
  label,
  count,
  color,
  icon,
}: {
  label: string;
  count: number;
  color: string;
  icon: string;
}) {
  return (
    <div className="bg-white rounded-2xl border border-border-subtle p-6 flex items-center justify-between shadow-[0_4px_12px_rgba(0,0,0,0.02)]">
      <div>
        <p className="text-xs font-mono-code text-gray-500 uppercase tracking-wider mb-1">
          {label}
        </p>
        <p className="text-3xl font-bold text-on-surface">{count}</p>
      </div>
      <div
        className={`w-12 h-12 rounded-2xl flex items-center justify-center ${color}`}
      >
        <span className="material-symbols-outlined">{icon}</span>
      </div>
    </div>
  );
}

function FilterPill({
  label,
  isActive,
  onClick,
}: {
  label: string;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-5 py-2.5 rounded-full text-sm font-medium whitespace-nowrap transition-all ${
        isActive
          ? "bg-on-surface text-pure-white shadow-md"
          : "bg-white border border-border-subtle text-slate-500 hover:border-border-medium"
      }`}
    >
      {label}
    </button>
  );
}

function ReviewItemCard({
  concept,
  isOverdue,
  isUpcoming,
  onReview,
  onReschedule,
  formatDate,
}: {
  concept: ReviewConcept;
  isOverdue?: boolean;
  isUpcoming?: boolean;
  onReview: () => void;
  onReschedule: () => void;
  formatDate: (ts: number) => string;
}) {
  const borderColor = getSubjectTheme(concept.subjectColor).accentHex;
  const upcomingLabel = concept.nextReviewAt
    ? `আসন্ন: ${formatDate(concept.nextReviewAt)}`
    : "আসন্ন";

  return (
    <div
      className="bg-white rounded-2xl border border-border-subtle p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 group hover:shadow-lg transition-all border-l-4"
      style={{ borderLeftColor: borderColor }}
    >
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-2xl bg-surface-container flex items-center justify-center shrink-0">
          <span className="material-symbols-outlined text-slate-400">
            {concept.subjectIcon ?? "menu_book"}
          </span>
        </div>

        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-mono-code text-gray-400 uppercase tracking-tighter">
              {concept.subjectName}
            </span>
            <span className="w-1 h-1 rounded-full bg-gray-200" />
            <span className="text-[10px] font-mono-code text-gray-400 uppercase tracking-tighter">
              {concept.chapterName}
            </span>
          </div>

          <h3 className="text-base font-sub-heading text-on-surface">
            {concept.name}
          </h3>

          <div className="flex items-center gap-2 mt-1">
            <span
              className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                isOverdue
                  ? "bg-red-100 text-red-600"
                  : isUpcoming
                    ? "bg-slate-100 text-slate-500"
                    : "bg-emerald-100 text-brand-green"
              }`}
            >
              {isOverdue ? "বিগত" : isUpcoming ? upcomingLabel : "আজকের"}
            </span>
            <span className="text-[10px] text-gray-400 font-mono-code">
              লেভেল: {concept.repetitionLevel ?? 0}
            </span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={onReschedule}
          className="w-10 h-10 rounded-full border border-border-subtle flex items-center justify-center text-slate-400 hover:bg-slate-50 hover:text-on-surface transition-all"
          title="রিশিডিউল"
        >
          <span className="material-symbols-outlined text-[20px]">
            calendar_month
          </span>
        </button>
        <button
          onClick={onReview}
          className="flex-1 md:flex-none px-6 py-2.5 bg-on-surface text-pure-white rounded-full text-sm font-label-uppercase hover:bg-brand-green transition-all shadow-sm flex items-center justify-center gap-2"
        >
          <span className="material-symbols-outlined text-sm">
            history_edu
          </span>
          রিভিশন শুরু করি
        </button>
      </div>
    </div>
  );
}

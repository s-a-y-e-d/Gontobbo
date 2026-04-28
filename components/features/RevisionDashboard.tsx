"use client";

import React, { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import ConceptReviewModal from "./ConceptReviewModal";
import RescheduleModal from "./RescheduleModal";

export default function RevisionDashboard() {
  const [selectedSubjectId, setSelectedSubjectId] = useState<Id<"subjects"> | "all">("all");
  const [reviewConcept, setReviewConcept] = useState<any>(null);
  const [rescheduleConcept, setRescheduleConcept] = useState<any>(null);

  const now = Date.now();
  const dashboardData = useQuery(api.queries.getReviewsDashboardData, {
    now,
    subjectId: selectedSubjectId === "all" ? undefined : selectedSubjectId,
  });

  const subjects = useQuery(api.queries.getSubjectsForFilter);

  if (!dashboardData || !subjects) {
    return (
      <div className="flex justify-center items-center py-24">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-green"></div>
      </div>
    );
  }

  const { overdue, dueToday, upcoming, stats } = dashboardData;
  const activeReviews = [...overdue, ...dueToday];

  const formatDate = (ts: number) => {
    return new Date(ts).toLocaleDateString("bn-BD", {
      month: "short",
      day: "numeric",
    });
  };

  return (
    <div className="space-y-10">
      {/* Stats Row */}
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

      {/* Subject Filter */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide">
        <FilterPill 
          label="সব বিষয়" 
          isActive={selectedSubjectId === "all"} 
          onClick={() => setSelectedSubjectId("all")} 
        />
        {subjects.map((subject) => (
          <FilterPill 
            key={subject._id}
            label={subject.name}
            isActive={selectedSubjectId === subject._id}
            onClick={() => setSelectedSubjectId(subject._id)}
          />
        ))}
      </div>

      {/* Active Feed */}
      <section>
        <div className="flex justify-between items-end mb-6">
          <h2 className="font-section-heading text-xl text-on-surface">রিভিশন ফিড</h2>
          <span className="text-xs font-mono-code text-gray-400 uppercase tracking-widest">
            {activeReviews.length}টি পেন্ডিং
          </span>
        </div>

        {activeReviews.length === 0 ? (
          <div className="bg-white rounded-3xl border border-border-subtle p-12 text-center">
            <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="material-symbols-outlined text-brand-green text-3xl">task_alt</span>
            </div>
            <h3 className="text-lg font-sub-heading text-on-surface mb-2">আজকের সব রিভিশন সম্পন্ন!</h3>
            <p className="text-sm font-body text-gray-500">চমৎকার কাজ! নতুন কিছু শেখার সময় এখন।</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {activeReviews.map((concept) => (
              <ReviewItemCard 
                key={concept._id}
                concept={concept}
                isOverdue={concept.nextReviewAt < now - 86400000} // Rough check for badge
                onReview={() => setReviewConcept(concept)}
                onReschedule={() => setRescheduleConcept(concept)}
                formatDate={formatDate}
              />
            ))}
          </div>
        )}
      </section>

      {/* Upcoming Section */}
      {upcoming.length > 0 && (
        <section className="opacity-60 grayscale hover:opacity-100 hover:grayscale-0 transition-all duration-300">
          <h2 className="font-section-heading text-lg text-on-surface mb-6">আসন্ন রিভিশন</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {upcoming.map((concept) => (
              <ReviewItemCard 
                key={concept._id}
                concept={concept}
                isUpcoming={true}
                onReview={() => setReviewConcept(concept)}
                onReschedule={() => setRescheduleConcept(concept)}
                formatDate={formatDate}
              />
            ))}
          </div>
        </section>
      )}

      {/* Modals */}
      {reviewConcept && (
        <ConceptReviewModal 
          isOpen={!!reviewConcept}
          onClose={() => setReviewConcept(null)}
          concept={reviewConcept}
        />
      )}

      {rescheduleConcept && (
        <RescheduleModal 
          isOpen={!!rescheduleConcept}
          onClose={() => setReviewConcept(null)}
          concept={rescheduleConcept}
        />
      )}
    </div>
  );
}

function StatCard({ label, count, color, icon }: { label: string; count: number; color: string; icon: string }) {
  return (
    <div className="bg-white rounded-2xl border border-border-subtle p-6 flex items-center justify-between shadow-[0_4px_12px_rgba(0,0,0,0.02)]">
      <div>
        <p className="text-xs font-mono-code text-gray-500 uppercase tracking-wider mb-1">{label}</p>
        <p className="text-3xl font-bold text-on-surface">{count}</p>
      </div>
      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${color}`}>
        <span className="material-symbols-outlined">{icon}</span>
      </div>
    </div>
  );
}

function FilterPill({ label, isActive, onClick }: { label: string; isActive: boolean; onClick: () => void }) {
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
  formatDate 
}: { 
  concept: any; 
  isOverdue?: boolean; 
  isUpcoming?: boolean;
  onReview: () => void;
  onReschedule: () => void;
  formatDate: (ts: number) => string;
}) {
  // Mapping subject color names to hex codes for the left border
  const borderColors: Record<string, string> = {
    green: "#10b981", // emerald-500
    emerald: "#10b981",
    blue: "#3b82f6", // blue-500
    purple: "#a855f7", // purple-500
    orange: "#f97316", // orange-500
    red: "#ef4444", // red-500
    pink: "#ec4899", // pink-500
    indigo: "#6366f1", // indigo-500
    rose: "#f43f5e", // rose-500
    amber: "#f59e0b", // amber-500
    violet: "#8b5cf6", // violet-500
  };

  const borderColor = borderColors[concept.subjectColor] || "#18E299"; // Fallback to brand green

  return (
    <div className="bg-white rounded-2xl border border-border-subtle p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 group hover:shadow-lg transition-all border-l-4" style={{ borderLeftColor: borderColor }}>
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-2xl bg-surface-container flex items-center justify-center shrink-0">
          <span className="material-symbols-outlined text-slate-400">{concept.subjectIcon}</span>
        </div>
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-mono-code text-gray-400 uppercase tracking-tighter">{concept.subjectName}</span>
            <span className="w-1 h-1 rounded-full bg-gray-200" />
            <span className="text-[10px] font-mono-code text-gray-400 uppercase tracking-tighter">{concept.chapterName}</span>
          </div>
          <h3 className="text-base font-sub-heading text-on-surface">{concept.name}</h3>
          <div className="flex items-center gap-2 mt-1">
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
              isOverdue ? "bg-red-100 text-red-600" : isUpcoming ? "bg-slate-100 text-slate-500" : "bg-emerald-100 text-brand-green"
            }`}>
              {isOverdue ? "বিগত" : isUpcoming ? `আসন্ন: ${formatDate(concept.nextReviewAt)}` : "আজকের"}
            </span>
            <span className="text-[10px] text-gray-400 font-mono-code">লেভেল: {concept.repetitionLevel ?? 0}</span>
          </div>
        </div>
      </div>
      
      <div className="flex items-center gap-2">
        <button 
          onClick={onReschedule}
          className="w-10 h-10 rounded-full border border-border-subtle flex items-center justify-center text-slate-400 hover:bg-slate-50 hover:text-on-surface transition-all"
          title="রিশিডিউল"
        >
          <span className="material-symbols-outlined text-[20px]">calendar_month</span>
        </button>
        <button 
          onClick={onReview}
          className="flex-1 md:flex-none px-6 py-2.5 bg-on-surface text-pure-white rounded-full text-sm font-label-uppercase hover:bg-brand-green transition-all shadow-sm flex items-center justify-center gap-2"
        >
          <span className="material-symbols-outlined text-sm">history_edu</span>
          রিভিশন শুরু করি
        </button>
      </div>
    </div>
  );
}

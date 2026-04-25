"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import SubjectGrid from "@/components/features/SubjectGrid";

export default function DashboardPage() {
  const subjects = useQuery(api.queries.getSubjectsWithStats);

  return (
    <div className="w-full">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-10 gap-4">
        <div>
          <h1 className="font-section-heading text-section-heading text-on-surface mb-2">Subjects</h1>
          <p className="font-body text-body text-gray-500">Track your progress across all your courses.</p>
        </div>
        <button className="bg-pure-white border border-border-medium rounded-full px-6 py-2.5 font-label-uppercase text-label-uppercase text-on-surface hover:opacity-90 transition-opacity flex items-center gap-2 shadow-[0_2px_8px_rgba(0,0,0,0.03)]">
          <span className="material-symbols-outlined text-sm">add</span>
          Add Subject
        </button>
      </div>

      {/* Subjects Grid */}
      {subjects === undefined ? (
        <div className="flex justify-center items-center py-24">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-green"></div>
        </div>
      ) : (
        <SubjectGrid subjects={subjects} />
      )}
    </div>
  );
}

"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import SubjectGrid from "./SubjectGrid";
import AddSubjectModal from "./AddSubjectModal";
import { SubjectsSkeleton } from "./LoadingSkeletons";

export default function SubjectsWorkspace() {
  const subjects = useQuery(api.queries.getSubjectsWithStats);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  return (
    <div className="w-full">
      <div className="mb-10 flex flex-col items-start justify-between gap-4 md:flex-row md:items-end">
        <div>
          <h1 className="mb-2 font-section-heading text-section-heading text-on-surface">
            বিষয়
          </h1>
          <p className="font-body text-body text-gray-500">
            সব বিষয়ের অগ্রগতি এক জায়গায় দেখুন।
          </p>
        </div>
        <button
          type="button"
          onClick={() => setIsAddModalOpen(true)}
          className="flex items-center gap-2 rounded-full border border-border-medium bg-pure-white px-6 py-2.5 font-label-uppercase text-label-uppercase text-on-surface shadow-[0_2px_8px_rgba(0,0,0,0.03)] transition-opacity hover:opacity-90"
        >
          <span className="material-symbols-outlined text-sm">add</span>
          বিষয় যোগ
        </button>
      </div>

      {subjects === undefined ? (
        <SubjectsSkeleton />
      ) : (
        <SubjectGrid subjects={subjects} />
      )}

      <AddSubjectModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
      />
    </div>
  );
}

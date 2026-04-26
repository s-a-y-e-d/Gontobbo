"use client";

import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import SubjectHeader from "@/components/features/SubjectHeader";
import ChapterTable from "@/components/features/ChapterTable";
import ChapterModal from "@/components/features/ChapterModal";

export default function SubjectPage() {
  const params = useParams();
  const slug = params.slug as string;
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  const data = useQuery(api.queries.getSubjectPageData, { slug });
  const ensureItems = useMutation(api.mutations.ensureChapterStudyItems);

  // Lazy creation: ensure studyItems exist on first visit
  useEffect(() => {
    if (data?.subject) {
      ensureItems({ subjectId: data.subject._id });
    }
  }, [data?.subject?._id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (data === undefined) {
    return (
      <div className="flex justify-center items-center py-24">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-green" />
      </div>
    );
  }

  if (data === null) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <span className="material-symbols-outlined text-5xl text-gray-300">error_outline</span>
        <p className="text-gray-500 font-body text-body">বিষয়টি খুঁজে পাওয়া যায়নি</p>
      </div>
    );
  }

  const { subject, chapters, progressPercentage } = data;

  const nextTermChapters = chapters.filter((ch) => ch.inNextTerm);
  const allChapters = chapters;
  const nextOrder = chapters.length > 0 ? Math.max(...chapters.map((c) => c.order)) + 1 : 1;

  return (
    <div className="w-full">
      {/* Subject Header */}
      <SubjectHeader
        name={subject.name}
        progressPercentage={progressPercentage}
      />

      <div className="flex justify-end mb-8 -mt-4">
        <button 
          onClick={() => setIsAddModalOpen(true)}
          className="flex items-center gap-2 px-6 py-2.5 bg-on-surface text-pure-white rounded-full font-label-uppercase text-label-uppercase hover:bg-brand-green transition-all shadow-sm hover:shadow-md"
        >
          <span className="material-symbols-outlined text-lg">add</span>
          নতুন অধ্যায় যোগ
        </button>
      </div>

      {/* Next Term Chapters Table */}
      <ChapterTable
        title="পরীক্ষার সিলেবাস"
        chapters={nextTermChapters}
        trackerConfigs={subject.chapterTrackers}
        subjectSlug={subject.slug}
      />

      {/* Full Syllabus Table */}
      <ChapterTable
        title="সম্পূর্ণ সিলেবাস"
        chapters={allChapters}
        trackerConfigs={subject.chapterTrackers}
        subjectSlug={subject.slug}
      />

      <ChapterModal 
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        subjectId={subject._id}
        suggestedOrder={nextOrder}
      />
    </div>
  );
}

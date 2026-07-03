"use client";

import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import SubjectHeader from "@/components/features/SubjectHeader";
import ChapterTable from "@/components/features/ChapterTable";
import ChapterModal from "@/components/features/ChapterModal";
import { SubjectDetailSkeleton } from "@/components/features/LoadingSkeletons";

export default function SubjectPage() {
  const params = useParams();
  const slug = params.slug as string;
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedChapterIds, setSelectedChapterIds] = useState<Set<Id<"chapters">>>(
    () => new Set(),
  );

  const data = useQuery(api.queries.getSubjectPageData, { slug });
  const ensureItems = useMutation(api.mutations.ensureChapterStudyItems);
  const startSyllabusSummaryBackfill = useMutation(
    api.syllabusSummaries.startSyllabusSummaryBackfill,
  );

  useEffect(() => {
    void startSyllabusSummaryBackfill({}).catch((error) => {
      console.error("Failed to start syllabus summary backfill:", error);
    });
  }, [startSyllabusSummaryBackfill]);

  // Lazy creation: ensure studyItems exist on first visit
  useEffect(() => {
    if (data?.subject && data.needsEnsureChapterStudyItems) {
      ensureItems({ subjectId: data.subject._id });
    }
  }, [data?.needsEnsureChapterStudyItems, data?.subject?._id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (data === undefined) {
    return <SubjectDetailSkeleton />;
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

  const enterSelectionMode = (chapterId: Id<"chapters">) => {
    setSelectionMode(true);
    setSelectedChapterIds(new Set([chapterId]));
  };

  const clearSelection = () => {
    setSelectionMode(false);
    setSelectedChapterIds(new Set());
  };

  const toggleChapterSelection = (chapterId: Id<"chapters">) => {
    setSelectedChapterIds((previous) => {
      const next = new Set(previous);
      if (next.has(chapterId)) {
        next.delete(chapterId);
      } else {
        next.add(chapterId);
      }
      return next;
    });
  };

  const toggleVisibleChapters = (
    chapterIds: Id<"chapters">[],
    shouldSelect: boolean,
  ) => {
    setSelectedChapterIds((previous) => {
      const next = new Set(previous);
      for (const chapterId of chapterIds) {
        if (shouldSelect) {
          next.add(chapterId);
        } else {
          next.delete(chapterId);
        }
      }
      return next;
    });
  };

  return (
    <div className="w-full">
      {/* Subject Header */}
      <SubjectHeader
        name={subject.name}
        progressPercentage={progressPercentage}
      />

      <div className="flex mb-8 md:-mt-4 md:justify-end">
        <button 
          onClick={() => setIsAddModalOpen(true)}
          className="flex w-full items-center justify-center gap-2 px-6 py-3 bg-on-surface text-pure-white rounded-full font-label-uppercase text-label-uppercase hover:bg-brand-green transition-all shadow-sm hover:shadow-md sm:w-auto sm:py-2.5"
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
        subjectId={subject._id}
        selectionMode={selectionMode}
        selectedChapterIds={selectedChapterIds}
        onToggleChapterSelection={toggleChapterSelection}
        onToggleVisibleChapters={toggleVisibleChapters}
        onEnterSelectionMode={enterSelectionMode}
        onClearSelection={clearSelection}
      />

      {/* Full Syllabus Table */}
      <ChapterTable
        title="সম্পূর্ণ সিলেবাস"
        chapters={allChapters}
        trackerConfigs={subject.chapterTrackers}
        subjectSlug={subject.slug}
        subjectId={subject._id}
        selectionMode={selectionMode}
        selectedChapterIds={selectedChapterIds}
        onToggleChapterSelection={toggleChapterSelection}
        onToggleVisibleChapters={toggleVisibleChapters}
        onEnterSelectionMode={enterSelectionMode}
        onClearSelection={clearSelection}
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

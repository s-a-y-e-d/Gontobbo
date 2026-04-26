"use client";

import React, { useEffect } from "react";
import { useParams } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import SubjectHeader from "@/components/features/SubjectHeader";
import ConceptTable from "@/components/features/ConceptTable";
import Link from "next/link";

export default function ChapterPage() {
  const params = useParams();
  const slug = params.slug as string;
  const chapterSlug = params.chapterSlug as string;

  const data = useQuery(api.queries.getChapterPageData, { 
    subjectSlug: slug, 
    chapterSlug: chapterSlug 
  });
  
  const ensureItems = useMutation(api.mutations.ensureConceptStudyItems);

  // Lazy creation: ensure studyItems exist on first visit
  useEffect(() => {
    if (data?.chapter) {
      ensureItems({ chapterId: data.chapter._id });
    }
  }, [data?.chapter?._id]); // eslint-disable-line react-hooks/exhaustive-deps

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
        <p className="text-gray-500 font-body text-body">অধ্যায়টি খুঁজে পাওয়া যায়নি</p>
        <Link 
          href={`/subjects/${slug}`}
          className="text-brand-green hover:underline font-body text-sm"
        >
          বিষয়ে ফিরে যান
        </Link>
      </div>
    );
  }

  const { subject, chapter, concepts, progressPercentage } = data;

  return (
    <div className="w-full">
      {/* Chapter Header (Reusing SubjectHeader for consistent UI) */}
      <SubjectHeader
        name={chapter.name}
        progressPercentage={progressPercentage}
      />

      {/* Concepts Table */}
      <ConceptTable
        title="কনসেপ্ট লিস্ট"
        concepts={concepts}
        trackerConfigs={subject.conceptTrackers}
        chapterId={chapter._id}
      />
      
      <div className="mt-8 flex justify-center">
        <Link
          href={`/subjects/${slug}`}
          className="flex items-center gap-2 px-6 py-2.5 rounded-full border border-border-subtle text-gray-500 hover:text-on-surface hover:bg-gray-50 transition-all font-body text-sm"
        >
          <span className="material-symbols-outlined text-lg">arrow_back</span>
          বিষয়ে ফিরে যান
        </Link>
      </div>
    </div>
  );
}

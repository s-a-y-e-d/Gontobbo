"use client";

import React, { useEffect, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useToast } from "@/components/ui/Toast";
import AddSubjectModal from "./AddSubjectModal";
import { SubjectsSkeleton } from "./LoadingSkeletons";
import SubjectGrid from "./SubjectGrid";
import type { SubjectCardProps } from "./SubjectCard";
import { useSnapshotQuery } from "./useSnapshotQuery";

type SubjectListEditModalProps = {
  isOpen: boolean;
  subjects: SubjectCardProps[];
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (names: string[]) => Promise<void>;
};

function stripListMarker(line: string) {
  return line
    .trim()
    .replace(/^[>*\-\s•]+/u, "")
    .replace(/^[\d০-৯]+[.)।:\-\s]+/u, "")
    .trim();
}

function SubjectListEditModal({
  isOpen,
  subjects,
  isSubmitting,
  onClose,
  onSubmit,
}: SubjectListEditModalProps) {
  const [value, setValue] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!isOpen) {
      return;
    }

    setValue(subjects.map((subject) => subject.name).join("\n"));
    setError(null);
  }, [isOpen, subjects]);

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isSubmitting) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener("keydown", handleKeyDown);
    }

    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isSubmitting, onClose]);

  if (!isOpen) {
    return null;
  }

  const parsedNames = value
    .split(/\r?\n/)
    .map(stripListMarker)
    .filter(Boolean);
  const existingNames = subjects.map((subject) => subject.name);
  const hasChanges =
    parsedNames.length !== existingNames.length ||
    parsedNames.some((name, index) => name !== existingNames[index]);
  const addedCount = Math.max(0, parsedNames.length - subjects.length);
  const deletedCount = Math.max(0, subjects.length - parsedNames.length);
  const matchedCount = Math.min(parsedNames.length, subjects.length);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (parsedNames.length === 0) {
      setError("কমপক্ষে একটি বিষয়ের নাম রাখুন।");
      return;
    }

    if (!hasChanges) {
      setError("লিস্টে কোনো পরিবর্তন হয়নি।");
      return;
    }

    try {
      await onSubmit(parsedNames);
    } catch (submitError) {
      console.error("Failed to update subject list:", submitError);
      setError("বিষয় লিস্ট আপডেট করা যায়নি। আবার চেষ্টা করুন।");
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={() => {
        if (!isSubmitting) {
          onClose();
        }
      }}
    >
      <form
        onSubmit={handleSubmit}
        className="flex max-h-[min(86vh,720px)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border-subtle bg-pure-white shadow-xl animate-in zoom-in-95 duration-200 dark:border-white/10 dark:bg-neutral-950"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border-subtle p-6 dark:border-white/10">
          <div>
            <h2 className="font-card-title text-card-title text-on-surface dark:text-neutral-50">
              বিষয় লিস্ট এডিট
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-gray-500 dark:text-neutral-400">
              প্রতি লাইনে একটি বিষয় রাখুন। নতুন লাইন যোগ করলে নতুন বিষয় হবে,
              লাইন মুছলে বিষয় মুছে যাবে।
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-100 hover:text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-green disabled:cursor-not-allowed disabled:opacity-50 dark:text-neutral-500 dark:hover:bg-white/[0.08] dark:hover:text-neutral-100"
            aria-label="বিষয় লিস্ট এডিট বন্ধ করুন"
          >
            <span className="material-symbols-outlined text-xl">close</span>
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-3 p-6">
          <textarea
            value={value}
            onChange={(event) => {
              setValue(event.target.value);
              setError(null);
            }}
            className="min-h-[320px] w-full flex-1 resize-none rounded-2xl border border-border-medium bg-gray-50/70 px-4 py-3 font-body text-sm leading-7 text-on-surface outline-none transition-colors placeholder:text-gray-400 focus:border-brand-green focus:bg-pure-white focus:ring-2 focus:ring-brand-green/20 disabled:cursor-wait disabled:opacity-70 dark:border-white/10 dark:bg-white/[0.04] dark:text-neutral-100 dark:placeholder:text-neutral-600 dark:focus:border-brand-green dark:focus:bg-neutral-950"
            placeholder="প্রতি লাইনে একটি বিষয়ের নাম লিখুন"
            disabled={isSubmitting}
            spellCheck={false}
          />

          <div className="flex flex-col gap-2 text-sm sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-gray-500 dark:text-neutral-400">
              সেভের পর {parsedNames.length}টি বিষয় থাকবে
            </p>
            <p className="text-sm text-gray-500 dark:text-neutral-400">
              {matchedCount}টি মিলবে, {addedCount}টি যোগ হবে, {deletedCount}টি
              মুছবে
            </p>
          </div>

          {error && (
            <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-error-red dark:border-red-400/20 dark:bg-red-950/30 dark:text-red-200">
              {error}
            </p>
          )}
        </div>

        <div className="flex flex-col-reverse gap-3 border-t border-border-subtle p-6 sm:flex-row sm:justify-end dark:border-white/10">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-full px-6 py-2.5 font-label-uppercase text-label-uppercase text-gray-700 transition-colors hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-green disabled:cursor-not-allowed disabled:opacity-50 dark:text-neutral-200 dark:hover:bg-white/[0.08]"
          >
            বাতিল
          </button>
          <button
            type="submit"
            disabled={isSubmitting || parsedNames.length === 0 || !hasChanges}
            className="rounded-full bg-on-surface px-8 py-2.5 font-label-uppercase text-label-uppercase text-pure-white shadow-sm transition-all hover:bg-brand-green hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-green focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-950 dark:hover:bg-brand-green dark:focus-visible:ring-offset-neutral-950"
          >
            {isSubmitting ? "আপডেট হচ্ছে..." : "লিস্ট আপডেট করুন"}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function SubjectsWorkspace() {
  const { data: subjects, refresh } = useSnapshotQuery(
    api.queries.getSubjectsWithStats,
    {},
  );
  const startSyllabusSummaryBackfill = useMutation(
    api.syllabusSummaries.startSyllabusSummaryBackfill,
  );
  const syncSubjectList = useMutation(api.mutations.syncSubjectList);
  const toast = useToast();
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isListEditOpen, setIsListEditOpen] = useState(false);
  const [isListEditSubmitting, setIsListEditSubmitting] = useState(false);

  useEffect(() => {
    void startSyllabusSummaryBackfill({}).catch((error) => {
      console.error("Failed to start syllabus summary backfill:", error);
    });
  }, [startSyllabusSummaryBackfill]);

  const subjectList = subjects ?? [];
  const hasSubjects = subjectList.length > 0;

  const handleListUpdate = async (names: string[]) => {
    setIsListEditSubmitting(true);
    try {
      const result = await syncSubjectList({ names });
      await refresh();
      setIsListEditOpen(false);

      const totalChanges =
        result.createdCount +
        result.deletedCount +
        result.renamedCount +
        result.reorderedCount;
      toast.success(
        totalChanges > 0
          ? `${totalChanges}টি পরিবর্তন সেভ হয়েছে।`
          : "বিষয় লিস্ট আপডেট হয়েছে।",
      );
    } finally {
      setIsListEditSubmitting(false);
    }
  };

  return (
    <div className="w-full">
      <div className="mb-10 flex flex-col items-start justify-between gap-4 md:flex-row md:items-end">
        <div>
          <h1 className="mb-2 font-section-heading text-section-heading text-on-surface dark:text-neutral-50">
            বিষয়
          </h1>
          <p className="font-body text-body text-gray-500 dark:text-neutral-400">
            সব বিষয়ের অগ্রগতি এক জায়গায় দেখুন।
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setIsListEditOpen(true)}
            disabled={!hasSubjects}
            className="flex items-center gap-2 rounded-full border border-border-medium bg-pure-white px-5 py-2.5 font-label-uppercase text-label-uppercase text-on-surface shadow-[0_2px_8px_rgba(0,0,0,0.03)] transition-colors hover:border-border-strong hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-green disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-white/[0.04] dark:text-neutral-100 dark:hover:border-white/20 dark:hover:bg-white/[0.08]"
          >
            <span className="material-symbols-outlined text-sm">edit_note</span>
            এডিট
          </button>
          <button
            type="button"
            onClick={() => setIsAddModalOpen(true)}
            className="flex items-center gap-2 rounded-full border border-border-medium bg-pure-white px-6 py-2.5 font-label-uppercase text-label-uppercase text-on-surface shadow-[0_2px_8px_rgba(0,0,0,0.03)] transition-colors hover:border-border-strong hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-green dark:border-white/10 dark:bg-white/[0.04] dark:text-neutral-100 dark:hover:border-white/20 dark:hover:bg-white/[0.08]"
          >
            <span className="material-symbols-outlined text-sm">add</span>
            বিষয় যোগ
          </button>
        </div>
      </div>

      {subjects === undefined ? (
        <SubjectsSkeleton />
      ) : (
        <SubjectGrid subjects={subjectList} />
      )}

      <AddSubjectModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onCreated={refresh}
      />
      <SubjectListEditModal
        isOpen={isListEditOpen}
        subjects={subjectList}
        isSubmitting={isListEditSubmitting}
        onClose={() => setIsListEditOpen(false)}
        onSubmit={handleListUpdate}
      />
    </div>
  );
}

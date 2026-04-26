"use client";

import React, { useState, useRef, useEffect } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useRouter } from "next/navigation";

type TrackerConfig = {
  key: string;
  label: string;
  avgMinutes: number;
};

type ChapterRowData = {
  _id: Id<"chapters">;
  subjectId: Id<"subjects">;
  name: string;
  slug: string;
  order: number;
  inNextTerm: boolean;
  totalConcepts: number;
  completedConcepts: number;
  trackerData: Record<string, { isCompleted: boolean; score?: number; studyItemId?: string }>;
  status: "NOT_STARTED" | "IN_PROGRESS" | "READY";
  totalItems: number;
  completedItems: number;
};

type ChapterTableProps = {
  title: string;
  chapters: ChapterRowData[];
  trackerConfigs: TrackerConfig[];
  subjectSlug: string;
  subjectId?: Id<"subjects">;
};

function StatusBadge({ status }: { status: "NOT_STARTED" | "IN_PROGRESS" | "READY" }) {
  const config = {
    NOT_STARTED: {
      label: "শুরু হয়নি",
      dotColor: "bg-gray-400",
      textColor: "text-gray-500",
    },
    IN_PROGRESS: {
      label: "চলমান",
      dotColor: "bg-warm-amber",
      textColor: "text-warm-amber",
    },
    READY: {
      label: "সম্পন্ন",
      dotColor: "bg-brand-green",
      textColor: "text-brand-green-deep",
    },
  };

  const c = config[status];

  return (
    <span className={`inline-flex items-center gap-1.5 font-mono-code text-mono-code uppercase ${c.textColor}`}>
      <span className={`w-2 h-2 rounded-full ${c.dotColor}`} />
      {c.label}
    </span>
  );
}

function ConceptBar({ completed, total }: { completed: number; total: number }) {
  if (total === 0) {
    return <span className="text-gray-400 font-mono-code text-mono-code">—</span>;
  }
  const pct = Math.round((completed / total) * 100);

  return (
    <div className="flex items-center gap-2.5 min-w-[100px]">
      <div className="flex-1 h-2 bg-surface-container rounded-full overflow-hidden max-w-[80px]">
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            pct === 100
              ? "bg-brand-green"
              : pct > 0
                ? "bg-warm-amber"
                : "bg-gray-300"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="font-mono-code text-mono-code text-gray-500 whitespace-nowrap">
        {completed}/{total}
      </span>
    </div>
  );
}

function TrackerCell({ isCompleted, studyItemId }: { isCompleted: boolean; studyItemId?: string }) {
  const toggle = useMutation(api.mutations.toggleStudyItemCompletion);
  const generatedId = React.useId();
  const id = `cbx-${studyItemId || generatedId}`;

  return (
    <div 
      className={`checkbox-wrapper-46 flex justify-center items-center ${!studyItemId ? "opacity-50 pointer-events-none" : ""}`}
    >
      <input 
        className="inp-cbx" 
        id={id} 
        type="checkbox" 
        checked={isCompleted}
        disabled={!studyItemId}
        onChange={() => {
          if (studyItemId) {
            toggle({ studyItemId: studyItemId as Id<"studyItems"> });
          }
        }}
      />
      <label className="cbx" htmlFor={id}>
        <span>
          <svg width="12px" height="10px" viewBox="0 0 12 10">
            <polyline points="1.5 6 4.5 9 10.5 1"></polyline>
          </svg>
        </span>
      </label>
    </div>
  );
}

function ActionMenu({
  chapterId,
  inNextTerm,
  subjectSlug,
  chapterSlug,
  onEdit,
  onDelete,
}: {
  chapterId: Id<"chapters">;
  inNextTerm: boolean;
  subjectSlug: string;
  chapterSlug: string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const toggleExam = useMutation(api.mutations.toggleChapterInNextTerm);
  const resetProgress = useMutation(api.mutations.resetChapterProgress);

  // Close menu on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
        setShowConfirm(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setOpen(!open);
          setShowConfirm(false);
        }}
        className="text-gray-400 hover:text-on-surface transition-colors p-1 rounded-lg hover:bg-gray-100"
      >
        <span className="material-symbols-outlined text-xl">more_horiz</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 bg-pure-white border border-border-subtle rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.08)] py-1.5 z-50 min-w-[220px] animate-in fade-in slide-in-from-top-1 duration-150">
          <button
            onClick={(e) => {
              e.stopPropagation();
              router.push(`/subjects/${subjectSlug}/${chapterSlug}`);
              setOpen(false);
            }}
            className="flex items-center gap-3 w-full px-4 py-2.5 text-left text-sm text-on-surface hover:bg-gray-100 transition-colors"
          >
            <span className="material-symbols-outlined text-lg text-gray-500">visibility</span>
            অধ্যায় দেখুন
          </button>
          
          <button
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
              setOpen(false);
            }}
            className="flex items-center gap-3 w-full px-4 py-2.5 text-left text-sm text-on-surface hover:bg-gray-100 transition-colors"
          >
            <span className="material-symbols-outlined text-lg text-gray-500">edit</span>
            এডিট করুন
          </button>

          <button
            onClick={async (e) => {
              e.stopPropagation();
              await toggleExam({ chapterId });
              setOpen(false);
            }}
            className="flex items-center gap-3 w-full px-4 py-2.5 text-left text-sm text-on-surface hover:bg-gray-100 transition-colors"
          >
            <span className="material-symbols-outlined text-lg text-gray-500">
              {inNextTerm ? "event_busy" : "event_available"}
            </span>
            {inNextTerm ? "পরীক্ষা থেকে বাদ" : "পরীক্ষায় যোগ"}
          </button>

          <div className="border-t border-border-subtle my-1" />

          {!showConfirm ? (
            <>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowConfirm(true);
                }}
                className="flex items-center gap-3 w-full px-4 py-2.5 text-left text-sm text-warm-amber hover:bg-amber-50 transition-colors"
              >
                <span className="material-symbols-outlined text-lg">restart_alt</span>
                প্রগ্রেস রিসেট
              </button>
              <button
                onClick={async (e) => {
                  e.stopPropagation();
                  if (confirm("আপনি কি নিশ্চিতভাবে এই অধ্যায়টি মুছতে চান? এর সকল কনসেপ্ট এবং প্রগ্রেস মুছে যাবে।")) {
                    await onDelete();
                  }
                  setOpen(false);
                }}
                className="flex items-center gap-3 w-full px-4 py-2.5 text-left text-sm text-error-red hover:bg-red-50 transition-colors"
              >
                <span className="material-symbols-outlined text-lg">delete</span>
                মুছে ফেলুন
              </button>
            </>
          ) : (
            <div className="px-4 py-2.5">
              <p className="text-xs text-gray-500 mb-2">নিশ্চিত? সব প্রগ্রেস মুছে যাবে।</p>
              <div className="flex gap-2">
                <button
                  onClick={async (e) => {
                    e.stopPropagation();
                    await resetProgress({ chapterId });
                    setOpen(false);
                    setShowConfirm(false);
                  }}
                  className="px-3 py-1.5 bg-error-red text-white text-xs rounded-full hover:opacity-90 transition-opacity"
                >
                  হ্যাঁ, রিসেট
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowConfirm(false);
                  }}
                  className="px-3 py-1.5 bg-gray-100 text-gray-700 text-xs rounded-full hover:bg-gray-200 transition-colors"
                >
                  বাতিল
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

import ChapterModal from "./ChapterModal";

export default function ChapterTable({
  title,
  chapters,
  trackerConfigs,
  subjectSlug,
  subjectId,
}: ChapterTableProps) {
  const router = useRouter();
  const [editingChapter, setEditingChapter] = useState<ChapterRowData | null>(null);
  const deleteChapter = useMutation(api.mutations.deleteChapter);

  if (chapters.length === 0) {
    return (
      <section className="mb-12">
        <h2 className="font-sub-heading text-sub-heading text-on-surface mb-6">{title}</h2>
        <div className="text-center py-12 text-gray-400 border border-border-subtle rounded-2xl bg-pure-white">
          কোনো অধ্যায় পাওয়া যায়নি
        </div>
      </section>
    );
  }

  const finalSubjectId = subjectId || chapters[0]?.subjectId;

  return (
    <section className="mb-12">
      <h2 className="font-sub-heading text-sub-heading text-on-surface mb-6">{title}</h2>
      <div className="bg-pure-white border border-border-subtle rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.02)]">
        <table className="w-full border-separate border-spacing-0">
          <thead>
            <tr className="border-b border-border-subtle">
              <th className="text-left py-3.5 px-5 font-mono-code text-mono-code text-gray-500 uppercase first:rounded-tl-2xl">
                অধ্যায়
              </th>
              <th className="text-center py-3.5 px-5 font-mono-code text-mono-code text-gray-500 uppercase">
                কনসেপ্ট
              </th>
              {trackerConfigs.map((t) => (
                <th
                  key={t.key}
                  className="text-center py-3.5 px-5 font-mono-code text-mono-code text-gray-500 uppercase"
                >
                  {t.label}
                </th>
              ))}
              <th className="text-center py-3.5 px-5 font-mono-code text-mono-code text-gray-500 uppercase">
                স্ট্যাটাস
              </th>
              <th className="text-right py-3.5 px-5 font-mono-code text-mono-code text-gray-500 uppercase last:rounded-tr-2xl">
                অ্যাকশন
              </th>
            </tr>
          </thead>
          <tbody>
            {chapters.map((chapter, idx) => (
              <tr
                key={chapter._id}
                className={`transition-colors hover:bg-surface-container/20 group ${
                  idx < chapters.length - 1 ? "border-b border-border-subtle" : ""
                }`}
              >
                <td className={`py-4 px-5 ${idx === chapters.length - 1 ? "rounded-bl-2xl" : ""}`}>
                  <div className="flex items-center gap-3">
                    <span className="font-mono-code text-mono-code text-gray-400 bg-surface-container w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0">
                      {String(chapter.order).length > 2 ? String(idx + 1).padStart(2, "0") : String(chapter.order).padStart(2, "0")}
                    </span>
                    <button
                      onClick={() => router.push(`/subjects/${subjectSlug}/${chapter.slug}`)}
                      className="font-body text-body text-on-surface leading-tight hover:text-brand-green transition-colors text-left"
                    >
                      {chapter.name}
                    </button>
                  </div>
                </td>
                <td className="py-4 px-5">
                  <div className="flex justify-center">
                    <ConceptBar
                      completed={chapter.completedConcepts}
                      total={chapter.totalConcepts}
                    />
                  </div>
                </td>
                {trackerConfigs.map((t) => (
                  <td key={t.key} className="py-4 px-5 text-center">
                    <TrackerCell
                      isCompleted={chapter.trackerData[t.key]?.isCompleted ?? false}
                      studyItemId={chapter.trackerData[t.key]?.studyItemId}
                    />
                  </td>
                ))}
                <td className="py-4 px-5 text-center">
                  <StatusBadge status={chapter.status} />
                </td>
                <td className={`py-4 px-5 text-right ${idx === chapters.length - 1 ? "rounded-br-2xl" : ""}`}>
                  <ActionMenu
                    chapterId={chapter._id}
                    inNextTerm={chapter.inNextTerm}
                    subjectSlug={subjectSlug}
                    chapterSlug={chapter.slug}
                    onEdit={() => setEditingChapter(chapter)}
                    onDelete={() => deleteChapter({ chapterId: chapter._id })}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editingChapter && (
        <ChapterModal
          isOpen={!!editingChapter}
          onClose={() => setEditingChapter(null)}
          subjectId={finalSubjectId}
          initialData={{
            _id: editingChapter._id,
            name: editingChapter.name,
            slug: editingChapter.slug,
            order: editingChapter.order,
            inNextTerm: editingChapter.inNextTerm,
          }}
        />
      )}
    </section>
  );
}

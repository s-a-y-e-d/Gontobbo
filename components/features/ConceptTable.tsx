"use client";

import React from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import ConceptModal from "./ConceptModal";
import ConceptReviewModal from "./ConceptReviewModal";

type TrackerConfig = {
  key: string;
  label: string;
  avgMinutes: number;
};

type ConceptRowData = {
  _id: Id<"concepts">;
  name: string;
  order: number;
  reviewCount?: number;
  nextReviewAt?: number;
  repetitionLevel?: number;
  trackerData: Array<{ key: string; isCompleted: boolean; score?: number; studyItemId?: string }>;
  status: "NOT_STARTED" | "IN_PROGRESS" | "READY";
  totalItems: number;
  completedItems: number;
};

type ConceptTableProps = {
  title: string;
  concepts: ConceptRowData[];
  trackerConfigs: TrackerConfig[];
  chapterId: Id<"chapters">;
};

function ActionMenu({
  onEdit,
  onDelete,
  onReset,
}: {
  onEdit: () => void;
  onDelete: () => void;
  onReset: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [showConfirm, setShowConfirm] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement>(null);

  // Close menu on outside click
  React.useEffect(() => {
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
        <div className="absolute right-0 top-full mt-1 bg-pure-white border border-border-subtle rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.08)] py-1.5 z-50 min-w-[200px] animate-in fade-in slide-in-from-top-1 duration-150">
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
                  if (confirm("আপনি কি নিশ্চিতভাবে এই কনসেপ্টটি মুছতে চান?")) {
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
                    onReset();
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

function RevisionButton({
  isUnlocked,
  isDue,
  onReview,
}: {
  isUnlocked: boolean;
  isDue: boolean;
  onReview: () => void;
}) {
  return (
    <button
      disabled={!isUnlocked}
      onClick={onReview}
      title={!isUnlocked ? "Complete all trackers first" : ""}
      className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
        !isUnlocked
          ? "bg-gray-100 text-gray-300 cursor-not-allowed"
          : isDue
            ? "bg-brand-green text-pure-white shadow-md hover:shadow-lg active:scale-95"
            : "bg-surface-container text-gray-400 hover:bg-gray-200"
      }`}
    >
      <span className="material-symbols-outlined text-xl">refresh</span>
    </button>
  );
}

function MobileConceptCard({
  concept,
  trackerConfigs,
  isUnlocked,
  isDue,
  onEdit,
  onDelete,
  onReset,
  onReview,
}: {
  concept: ConceptRowData;
  trackerConfigs: TrackerConfig[];
  isUnlocked: boolean;
  isDue: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onReset: () => void;
  onReview: () => void;
}) {
  return (
    <article className="rounded-[24px] border border-border-subtle bg-pure-white p-4 shadow-[0_2px_8px_rgba(0,0,0,0.02)]">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-surface-container font-mono-code text-mono-code text-gray-500">
          {String(concept.order).padStart(2, "0")}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-body text-[17px] font-semibold leading-snug text-on-surface break-words">
            {concept.name}
          </h3>
          <div className="mt-2">
            <StatusBadge status={concept.status} />
          </div>
        </div>
        <ActionMenu
          onEdit={onEdit}
          onDelete={onDelete}
          onReset={onReset}
        />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        {trackerConfigs.map((trackerConfig) => {
          const tracker = concept.trackerData.find((data) => data.key === trackerConfig.key);

          return (
            <div
              key={trackerConfig.key}
              className="flex min-h-12 items-center justify-between gap-3 rounded-2xl border border-border-subtle bg-pure-white px-3 py-2"
            >
              <span className="min-w-0 truncate font-mono-code text-mono-code uppercase text-gray-500">
                {trackerConfig.label}
              </span>
              <TrackerCell
                isCompleted={tracker?.isCompleted ?? false}
                studyItemId={tracker?.studyItemId}
              />
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-border-subtle bg-surface/50 p-3">
        <div className="min-w-0">
          <p className="font-mono-code text-mono-code uppercase text-gray-500">Revision</p>
          <p className="mt-0.5 text-sm text-gray-500">
            {!isUnlocked ? "Locked" : isDue ? "Due now" : "Ready"}
          </p>
        </div>
        <RevisionButton isUnlocked={isUnlocked} isDue={isDue} onReview={onReview} />
      </div>
    </article>
  );
}

export default function ConceptTable({
  title,
  concepts,
  trackerConfigs,
  chapterId,
}: ConceptTableProps) {
  const [isModalOpen, setIsModalOpen] = React.useState(false);
  const [editingConcept, setEditingConcept] = React.useState<ConceptRowData | null>(null);
  const [reviewingConcept, setReviewingConcept] = React.useState<ConceptRowData | null>(null);
  const [now] = React.useState(() => Date.now());
  
  const deleteConcept = useMutation(api.mutations.deleteConcept);
  const resetConcept = useMutation(api.mutations.resetConceptProgress);

  const nextOrder = concepts.length > 0 ? Math.max(...concepts.map((c) => c.order)) + 1 : 1;

  const handleEdit = (concept: ConceptRowData) => {
    setEditingConcept(concept);
    setIsModalOpen(true);
  };

  const handleAdd = () => {
    setEditingConcept(null);
    setIsModalOpen(true);
  };

  const handleReview = (concept: ConceptRowData) => {
    setReviewingConcept(concept);
  };

  if (concepts.length === 0) {
    return (
      <section className="mb-12">
        <div className="flex flex-col gap-3 mb-6 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="font-sub-heading text-[22px] leading-tight text-on-surface md:text-sub-heading">{title}</h2>
          <button 
            onClick={handleAdd}
            className="flex w-full items-center justify-center gap-2 px-4 py-3 bg-on-surface text-pure-white rounded-full font-label-uppercase text-xs hover:bg-brand-green transition-all shadow-sm sm:w-auto sm:py-2"
          >
            <span className="material-symbols-outlined text-base">add</span>
            নতুন কনসেপ্ট
          </button>
        </div>
        <div className="text-center py-12 px-4 text-gray-400 border border-border-subtle rounded-2xl bg-pure-white">
          কোনো কনসেপ্ট পাওয়া যায়নি
        </div>

        <ConceptModal 
          key={editingConcept?._id || "new"}
          isOpen={isModalOpen}
          onClose={() => {
            setIsModalOpen(false);
            setEditingConcept(null);
          }}
          chapterId={chapterId}
          suggestedOrder={nextOrder}
          initialData={editingConcept || undefined}
        />
      </section>
    );
  }

  return (
    <section className="mb-12">
      <div className="flex flex-col gap-3 mb-6 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="font-sub-heading text-[22px] leading-tight text-on-surface md:text-sub-heading">{title}</h2>
        <button 
          onClick={handleAdd}
          className="flex w-full items-center justify-center gap-2 px-4 py-3 bg-on-surface text-pure-white rounded-full font-label-uppercase text-xs hover:bg-brand-green transition-all shadow-sm sm:w-auto sm:py-2"
        >
          <span className="material-symbols-outlined text-base">add</span>
          নতুন কনসেপ্ট
        </button>
      </div>
      <div className="space-y-3 md:hidden">
        {concepts.map((concept) => {
          const isUnlocked = concept.completedItems === concept.totalItems && concept.totalItems > 0;
          const isDue = concept.nextReviewAt ? concept.nextReviewAt <= now : false;

          return (
            <MobileConceptCard
              key={concept._id}
              concept={concept}
              trackerConfigs={trackerConfigs}
              isUnlocked={isUnlocked}
              isDue={isDue}
              onEdit={() => handleEdit(concept)}
              onDelete={() => deleteConcept({ conceptId: concept._id })}
              onReset={() => resetConcept({ conceptId: concept._id })}
              onReview={() => handleReview(concept)}
            />
          );
        })}
      </div>
      <div className="hidden overflow-x-auto bg-pure-white border border-border-subtle rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.02)] md:block">
        <table className="w-full min-w-[720px] border-separate border-spacing-0">
          <thead>
            <tr className="border-b border-border-subtle">
              <th className="text-left py-3.5 px-5 font-mono-code text-mono-code text-gray-500 uppercase first:rounded-tl-2xl">
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
                রিভিশন
              </th>
              <th className="text-center py-3.5 px-5 font-mono-code text-mono-code text-gray-500 uppercase">
                স্ট্যাটাস
              </th>
              <th className="text-right py-3.5 px-5 font-mono-code text-mono-code text-gray-500 uppercase last:rounded-tr-2xl">
                অ্যাকশন
              </th>
            </tr>
          </thead>
          <tbody>
            {concepts.map((concept, idx) => {
              const isUnlocked = concept.completedItems === concept.totalItems && concept.totalItems > 0;
              const isDue = concept.nextReviewAt ? concept.nextReviewAt <= now : false;

              return (
                <tr
                  key={concept._id}
                  className={`transition-colors hover:bg-surface-container/20 ${
                    idx < concepts.length - 1 ? "border-b border-border-subtle" : ""
                  }`}
                >
                  <td className={`py-4 px-5 ${idx === concepts.length - 1 ? "rounded-bl-2xl" : ""}`}>
                    <div className="flex items-center gap-3">
                      <span className="font-mono-code text-mono-code text-gray-400 bg-surface-container w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0">
                        {String(concept.order).padStart(2, "0")}
                      </span>
                      <span className="font-body text-body text-on-surface leading-tight">
                        {concept.name}
                      </span>
                    </div>
                  </td>
                  {trackerConfigs.map((t) => {
                    const tracker = concept.trackerData.find((d) => d.key === t.key);
                    return (
                      <td key={t.key} className="py-4 px-5 text-center">
                        <TrackerCell
                          isCompleted={tracker?.isCompleted ?? false}
                          studyItemId={tracker?.studyItemId}
                        />
                      </td>
                    );
                  })}
                  <td className="py-4 px-5 text-center">
                    <div className="flex justify-center">
                      <button
                        disabled={!isUnlocked}
                        onClick={() => handleReview(concept)}
                        title={!isUnlocked ? "সবগুলো ট্র্যাকার শেষ করুন" : ""}
                        className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                          !isUnlocked
                            ? "bg-gray-100 text-gray-300 cursor-not-allowed"
                            : isDue
                              ? "bg-brand-green text-pure-white shadow-md hover:shadow-lg active:scale-95"
                              : "bg-surface-container text-gray-400 hover:bg-gray-200"
                        }`}
                      >
                        <span className="material-symbols-outlined text-xl">refresh</span>
                      </button>
                    </div>
                  </td>
                  <td className="py-4 px-5 text-center">
                    <StatusBadge status={concept.status} />
                  </td>
                  <td className={`py-4 px-5 text-right ${idx === concepts.length - 1 ? "rounded-br-2xl" : ""}`}>
                    <ActionMenu 
                      onEdit={() => handleEdit(concept)}
                      onDelete={() => deleteConcept({ conceptId: concept._id })}
                      onReset={() => resetConcept({ conceptId: concept._id })}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <ConceptModal 
        key={editingConcept?._id || "new"}
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingConcept(null);
        }}
        chapterId={chapterId}
        suggestedOrder={nextOrder}
        initialData={editingConcept || undefined}
      />

      {reviewingConcept && (
        <ConceptReviewModal
          isOpen={!!reviewingConcept}
          onClose={() => setReviewingConcept(null)}
          concept={reviewingConcept}
        />
      )}
    </section>
  );
}

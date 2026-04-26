"use client";

import React from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import ConceptModal from "./ConceptModal";

type TrackerConfig = {
  key: string;
  label: string;
  avgMinutes: number;
};

type ConceptRowData = {
  _id: Id<"concepts">;
  name: string;
  order: number;
  trackerData: Record<string, { isCompleted: boolean; score?: number; studyItemId?: string }>;
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
}: {
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement>(null);

  // Close menu on outside click
  React.useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
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
        }}
        className="text-gray-400 hover:text-on-surface transition-colors p-1 rounded-lg hover:bg-gray-100"
      >
        <span className="material-symbols-outlined text-xl">more_horiz</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 bg-pure-white border border-border-subtle rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.08)] py-1.5 z-50 min-w-[160px] animate-in fade-in slide-in-from-top-1 duration-150">
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

export default function ConceptTable({
  title,
  concepts,
  trackerConfigs,
  chapterId,
}: ConceptTableProps) {
  const [isModalOpen, setIsModalOpen] = React.useState(false);
  const [editingConcept, setEditingConcept] = React.useState<ConceptRowData | null>(null);
  const deleteConcept = useMutation(api.mutations.deleteConcept);

  const handleEdit = (concept: ConceptRowData) => {
    setEditingConcept(concept);
    setIsModalOpen(true);
  };

  const handleAdd = () => {
    setEditingConcept(null);
    setIsModalOpen(true);
  };

  if (concepts.length === 0) {
    return (
      <section className="mb-12">
        <div className="flex justify-between items-center mb-6">
          <h2 className="font-sub-heading text-sub-heading text-on-surface">{title}</h2>
          <button 
            onClick={handleAdd}
            className="flex items-center gap-2 px-4 py-2 bg-on-surface text-pure-white rounded-full font-label-uppercase text-xs hover:bg-brand-green transition-all shadow-sm"
          >
            <span className="material-symbols-outlined text-base">add</span>
            নতুন কনসেপ্ট
          </button>
        </div>
        <div className="text-center py-12 text-gray-400 border border-border-subtle rounded-2xl bg-pure-white">
          কোনো কনসেপ্ট পাওয়া যায়নি
        </div>

        <ConceptModal 
          isOpen={isModalOpen}
          onClose={() => {
            setIsModalOpen(false);
            setEditingConcept(null);
          }}
          chapterId={chapterId}
          initialData={editingConcept ? {
            _id: editingConcept._id,
            name: editingConcept.name,
            order: editingConcept.order,
            // Assuming difficulty might be in concept row data if we added it to query
            // but for now let's keep it simple.
          } : undefined}
        />
      </section>
    );
  }

  return (
    <section className="mb-12">
      <div className="flex justify-between items-center mb-6">
        <h2 className="font-sub-heading text-sub-heading text-on-surface">{title}</h2>
        <button 
          onClick={handleAdd}
          className="flex items-center gap-2 px-4 py-2 bg-on-surface text-pure-white rounded-full font-label-uppercase text-xs hover:bg-brand-green transition-all shadow-sm"
        >
          <span className="material-symbols-outlined text-base">add</span>
          নতুন কনসেপ্ট
        </button>
      </div>
      <div className="bg-pure-white border border-border-subtle rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.02)]">
        <table className="w-full border-separate border-spacing-0">
          <thead>
            <tr className="border-b border-border-subtle">
              <th className="text-left py-3.5 px-5 font-mono-code text-mono-code text-gray-500 uppercase first:rounded-tl-2xl">
                কনসেপ্ট
              </th>
              {trackerConfigs.map((t) => (
                <th
                  key={t.key}
                  className="text-left py-3.5 px-5 font-mono-code text-mono-code text-gray-500 uppercase text-center"
                >
                  {t.label}
                </th>
              ))}
              <th className="text-left py-3.5 px-5 font-mono-code text-mono-code text-gray-500 uppercase text-right">
                স্ট্যাটাস
              </th>
              <th className="text-right py-3.5 px-5 font-mono-code text-mono-code text-gray-500 uppercase last:rounded-tr-2xl">
                অ্যাকশন
              </th>
            </tr>
          </thead>
          <tbody>
            {concepts.map((concept, idx) => (
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
                {trackerConfigs.map((t) => (
                  <td key={t.key} className="py-4 px-5 text-center">
                    <TrackerCell
                      isCompleted={concept.trackerData[t.key]?.isCompleted ?? false}
                      studyItemId={concept.trackerData[t.key]?.studyItemId}
                    />
                  </td>
                ))}
                <td className="py-4 px-5 text-right">
                  <StatusBadge status={concept.status} />
                </td>
                <td className={`py-4 px-5 text-right ${idx === concepts.length - 1 ? "rounded-br-2xl" : ""}`}>
                  <ActionMenu 
                    onEdit={() => handleEdit(concept)}
                    onDelete={() => deleteConcept({ conceptId: concept._id })}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ConceptModal 
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingConcept(null);
        }}
        chapterId={chapterId}
        initialData={editingConcept ? {
          _id: editingConcept._id,
          name: editingConcept.name,
          order: editingConcept.order,
        } : undefined}
      />
    </section>
  );
}

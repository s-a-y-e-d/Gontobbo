"use client";

import React from "react";
import { createPortal } from "react-dom";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useToast } from "@/components/ui/Toast";
import ConceptModal from "./ConceptModal";
import ConceptReviewModal from "./ConceptReviewModal";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

type TrackerConfig = {
  key: string;
  label: string;
  avgMinutes: number;
  isOptional?: boolean;
};

type ConceptRowData = {
  _id: Id<"concepts">;
  name: string;
  order: number;
  reviewCount?: number;
  lastReviewedAt?: number;
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

type FloatingMenuPosition = {
  top: number;
  left: number;
  visibility: "hidden" | "visible";
};

type DragHandleProps = {
  attributes: React.HTMLAttributes<HTMLElement>;
  listeners?: React.HTMLAttributes<HTMLElement>;
  disabled?: boolean;
  revealOnHover?: boolean;
};

type BulkRenameConceptModalProps = {
  isOpen: boolean;
  concepts: ConceptRowData[];
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (names: string[]) => Promise<void>;
};

type BulkConceptAction = "delete" | "reset";

type BulkConceptActionDialogProps = {
  action: BulkConceptAction | null;
  conceptCount: number;
  isSubmitting: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
};

type AdvanceReadyConceptReviewsDialogProps = {
  isOpen: boolean;
  conceptCount: number;
  isSubmitting: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
};

function BulkConceptActionDialog({
  action,
  conceptCount,
  isSubmitting,
  onClose,
  onConfirm,
}: BulkConceptActionDialogProps) {
  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isSubmitting) {
        onClose();
      }
    };

    if (action) {
      document.addEventListener("keydown", handleKeyDown);
    }

    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [action, isSubmitting, onClose]);

  if (!action) {
    return null;
  }

  const isDelete = action === "delete";
  const formattedCount = new Intl.NumberFormat("bn-BD").format(conceptCount);
  const actionLabel = isDelete ? "মুছে ফেলুন" : "প্রগ্রেস রিসেট করুন";
  const description = isDelete
    ? "নির্বাচিত কনসেপ্ট, তাদের ট্র্যাকার প্রগ্রেস, রিভিশন ও সম্পর্কিত Todo স্থায়ীভাবে মুছে যাবে।"
    : "নির্বাচিত কনসেপ্ট থাকবে, তবে তাদের ট্র্যাকার প্রগ্রেস, রিভিশন, স্টাডি লগ ও সম্পর্কিত Todo মুছে যাবে।";

  return (
    <div
      className="fixed inset-0 z-[150] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={() => {
        if (!isSubmitting) {
          onClose();
        }
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="bulk-concept-action-title"
        className="w-full max-w-md rounded-2xl border border-border-subtle bg-pure-white p-6 shadow-xl dark:border-white/10 dark:bg-neutral-950"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <span className={`material-symbols-outlined flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${isDelete ? "bg-red-50 text-error-red dark:bg-red-950/40 dark:text-red-200" : "bg-amber-50 text-warm-amber dark:bg-amber-950/30 dark:text-amber-200"}`}>
            {isDelete ? "delete_forever" : "restart_alt"}
          </span>
          <div>
            <h2 id="bulk-concept-action-title" className="font-card-title text-card-title text-on-surface dark:text-neutral-50">
              {formattedCount}টি কনসেপ্ট {actionLabel}?
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-gray-500 dark:text-neutral-400">{description}</p>
          </div>
        </div>
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onClose}
            className="rounded-full px-5 py-2.5 font-label-uppercase text-label-uppercase text-gray-700 transition-colors hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-green disabled:cursor-not-allowed disabled:opacity-50 dark:text-neutral-200 dark:hover:bg-white/[0.08]"
          >
            বাতিল
          </button>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onConfirm}
            className={`rounded-full px-5 py-2.5 font-label-uppercase text-label-uppercase text-pure-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-green focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60 dark:focus-visible:ring-offset-neutral-950 ${isDelete ? "bg-error-red hover:bg-red-700" : "bg-warm-amber hover:bg-amber-600"}`}
          >
            {isSubmitting ? "কাজ হচ্ছে..." : actionLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function AdvanceReadyConceptReviewsDialog({
  isOpen,
  conceptCount,
  isSubmitting,
  onClose,
  onConfirm,
}: AdvanceReadyConceptReviewsDialogProps) {
  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isSubmitting) onClose();
    };
    if (isOpen) document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isSubmitting, onClose]);

  if (!isOpen) return null;

  const formattedCount = new Intl.NumberFormat("bn-BD").format(conceptCount);

  return (
    <div
      className="fixed inset-0 z-[150] flex items-center justify-center bg-neutral-950/45 p-4 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={() => !isSubmitting && onClose()}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="advance-ready-concepts-title"
        className="w-full max-w-md overflow-hidden rounded-[28px] border border-border-subtle bg-pure-white shadow-[0_18px_60px_rgba(13,29,24,0.16)] animate-in zoom-in-95 duration-200 dark:border-white/10 dark:bg-neutral-950 dark:shadow-[0_18px_60px_rgba(0,0,0,0.45)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-b border-border-subtle px-6 pb-5 pt-6 dark:border-white/10">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-green-light text-brand-green-deep dark:bg-brand-green/15 dark:text-brand-green">
            <span className="material-symbols-outlined text-[25px]">trending_up</span>
          </div>
          <p className="mt-5 font-mono-code text-mono-code uppercase tracking-[0.12em] text-brand-green-deep dark:text-brand-green">
            প্রস্তুত কনসেপ্ট
          </p>
          <h2 id="advance-ready-concepts-title" className="mt-2 font-card-title text-[22px] leading-tight text-on-surface dark:text-neutral-50">
            রিভিশন সম্পন্ন করবেন?
          </h2>
          <p className="mt-3 text-sm leading-6 text-gray-500 dark:text-neutral-400">
            সম্পূর্ণ হওয়া {formattedCount}টি কনসেপ্টের রিভিশন সম্পন্ন হবে। আপনার রিভিশন সেটিংস অনুযায়ী নতুন তারিখ ঠিক হবে।
          </p>
        </div>
        <div className="mx-6 mt-5 flex items-center gap-3 rounded-2xl border border-border-subtle bg-gray-50/70 px-4 py-3 dark:border-white/10 dark:bg-white/[0.045]">
          <span className="material-symbols-outlined text-[20px] text-brand-green-deep dark:text-brand-green">auto_awesome</span>
          <p className="text-sm text-gray-600 dark:text-neutral-300">অসম্পূর্ণ কনসেপ্টগুলো অপরিবর্তিত থাকবে।</p>
        </div>
        <div className="mt-6 flex flex-col-reverse gap-3 border-t border-border-subtle px-6 py-5 sm:flex-row sm:justify-end dark:border-white/10">
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onClose}
            className="rounded-full px-5 py-2.5 font-label-uppercase text-label-uppercase text-gray-700 transition-colors hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-green disabled:cursor-not-allowed disabled:opacity-50 dark:text-neutral-200 dark:hover:bg-white/[0.08]"
          >
            এখন নয়
          </button>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onConfirm}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-on-surface px-5 py-2.5 font-label-uppercase text-label-uppercase text-pure-white shadow-sm transition-colors hover:bg-brand-green hover:text-on-primary-container focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-green focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60 dark:bg-neutral-100 dark:text-neutral-950 dark:hover:bg-brand-green dark:focus-visible:ring-offset-neutral-950"
          >
            <span className="material-symbols-outlined text-[18px]">arrow_upward</span>
            {isSubmitting ? "সেট করা হচ্ছে..." : "রিভিশন সম্পন্ন করুন"}
          </button>
        </div>
      </div>
    </div>
  );
}

function stripListMarker(line: string) {
  return line
    .trim()
    .replace(/^[>*\-\s•]+/u, "")
    .replace(/^[\d০-৯]+[.)।:\-\s]+/u, "")
    .trim();
}

function BulkRenameConceptModal({
  isOpen,
  concepts,
  isSubmitting,
  onClose,
  onSubmit,
}: BulkRenameConceptModalProps) {
  const [value, setValue] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!isOpen) {
      return;
    }

    setValue(concepts.map((concept) => concept.name).join("\n"));
    setError(null);
  }, [concepts, isOpen]);

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
  const existingNames = concepts.map((concept) => concept.name);
  const hasChanges =
    parsedNames.length !== existingNames.length ||
    parsedNames.some((name, index) => name !== existingNames[index]);
  const addedCount = Math.max(0, parsedNames.length - concepts.length);
  const deletedCount = Math.max(0, concepts.length - parsedNames.length);
  const matchedCount = Math.min(parsedNames.length, concepts.length);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (parsedNames.length === 0) {
      setError("কমপক্ষে একটি কনসেপ্টের নাম রাখুন।");
      return;
    }

    if (!hasChanges) {
      setError("লিস্টে কোনো পরিবর্তন হয়নি।");
      return;
    }

    try {
      await onSubmit(parsedNames);
    } catch (submitError) {
      console.error("Failed to update concept list:", submitError);
      setError("কনসেপ্ট লিস্ট আপডেট করা যায়নি। আবার চেষ্টা করুন।");
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
              কনসেপ্ট লিস্ট এডিট
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-gray-500 dark:text-neutral-400">
              প্রতি লাইনে একটি কনসেপ্ট রাখুন। নতুন লাইন যোগ করলে নতুন কনসেপ্ট হবে, লাইন মুছলে কনসেপ্ট মুছে যাবে।
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-100 hover:text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-green disabled:cursor-not-allowed disabled:opacity-50 dark:text-neutral-500 dark:hover:bg-white/[0.08] dark:hover:text-neutral-100"
            aria-label="নাম এডিট বন্ধ করুন"
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
            placeholder="প্রতি লাইনে একটি কনসেপ্টের নাম লিখুন"
            disabled={isSubmitting}
            spellCheck={false}
          />

          <div className="flex flex-col gap-2 text-sm sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-gray-500 dark:text-neutral-400">
              সেভের পর {parsedNames.length}টি কনসেপ্ট থাকবে
            </p>
            <p className="text-sm text-gray-500 dark:text-neutral-400">
              {matchedCount}টি মিলবে, {addedCount}টি যোগ হবে, {deletedCount}টি মুছবে
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

function getFloatingMenuPosition(
  triggerRect: DOMRect,
  menuWidth: number,
  menuHeight: number,
): FloatingMenuPosition {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const gutter = 12;
  const gap = 8;

  let top = triggerRect.bottom + gap;
  if (top + menuHeight > viewportHeight - gutter) {
    top = Math.max(gutter, triggerRect.top - menuHeight - gap);
  }

  const left = Math.min(
    Math.max(gutter, triggerRect.right - menuWidth),
    viewportWidth - menuWidth - gutter,
  );

  return {
    top,
    left,
    visibility: "visible",
  };
}

function ActionMenu({
  onEdit,
  onSelect,
  onAddToTodo,
  onDelete,
  onReset,
  isAddingToTodo,
}: {
  onEdit: () => void;
  onSelect: () => void;
  onAddToTodo: () => Promise<void>;
  onDelete: () => void;
  onReset: () => void;
  isAddingToTodo: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [showConfirm, setShowConfirm] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement>(null);
  const buttonRef = React.useRef<HTMLButtonElement>(null);
  const [menuPosition, setMenuPosition] = React.useState<FloatingMenuPosition>({
    top: 0,
    left: 0,
    visibility: "hidden",
  });

  React.useLayoutEffect(() => {
    if (!open) {
      return;
    }

    const updateMenuPosition = () => {
      const button = buttonRef.current;
      const menu = menuRef.current;

      if (!button || !menu) {
        return;
      }

      setMenuPosition(
        getFloatingMenuPosition(
          button.getBoundingClientRect(),
          menu.offsetWidth || 200,
          menu.offsetHeight || 220,
        ),
      );
    };

    updateMenuPosition();
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);

    return () => {
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [open, showConfirm]);

  // Close menu on outside click
  React.useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (
        menuRef.current &&
        !menuRef.current.contains(target) &&
        buttonRef.current &&
        !buttonRef.current.contains(target)
      ) {
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
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={(e) => {
          e.stopPropagation();
          if (open) {
            setOpen(false);
            setMenuPosition({
              top: 0,
              left: 0,
              visibility: "hidden",
            });
          } else {
            setMenuPosition(
              getFloatingMenuPosition(
                e.currentTarget.getBoundingClientRect(),
                200,
                showConfirm ? 170 : 220,
              ),
            );
            setOpen(true);
          }
          setShowConfirm(false);
        }}
        className="text-gray-400 hover:text-on-surface transition-colors p-1 rounded-lg hover:bg-gray-100"
      >
        <span className="material-symbols-outlined text-xl">more_horiz</span>
      </button>

      {open && typeof document !== "undefined" && createPortal(
        <div
          ref={menuRef}
          className="fixed z-[120] min-w-[200px] animate-in fade-in rounded-2xl border border-border-subtle bg-pure-white py-1.5 shadow-[0_8px_30px_rgba(0,0,0,0.08)] duration-150"
          style={menuPosition}
        >
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
            onClick={(e) => {
              e.stopPropagation();
              onSelect();
              setOpen(false);
            }}
            className="flex items-center gap-3 w-full px-4 py-2.5 text-left text-sm text-on-surface hover:bg-gray-100 transition-colors dark:text-neutral-100 dark:hover:bg-white/[0.08]"
          >
            <span className="material-symbols-outlined text-lg text-gray-500">checklist</span>
            Select
          </button>

          <button
            disabled={isAddingToTodo}
            onClick={async (e) => {
              e.stopPropagation();
              await onAddToTodo();
              setOpen(false);
            }}
            className="flex items-center gap-3 w-full px-4 py-2.5 text-left text-sm text-on-surface hover:bg-gray-100 transition-colors disabled:cursor-wait disabled:opacity-60"
          >
            <span className="material-symbols-outlined text-lg text-gray-500">event_available</span>
            {isAddingToTodo ? "যোগ হচ্ছে..." : "আজকের Todo-তে যোগ"}
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
        </div>,
        document.body,
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

function CustomCheckbox({
  checked,
  onChange,
  ariaLabel,
  idPrefix,
}: {
  checked: boolean;
  onChange: () => void;
  ariaLabel: string;
  idPrefix: string;
}) {
  const generatedId = React.useId();
  const id = `cbx-${idPrefix}-${generatedId}`;

  return (
    <div className="checkbox-wrapper-46 flex items-center justify-center" onClick={(event) => event.stopPropagation()}>
      <input
        className="inp-cbx"
        id={id}
        type="checkbox"
        checked={checked}
        onChange={onChange}
        aria-label={ariaLabel}
      />
      <label className="cbx" htmlFor={id}>
        <span>
          <svg width="12px" height="10px" viewBox="0 0 12 10">
            <polyline points="1.5 6 4.5 9 10.5 1" />
          </svg>
        </span>
      </label>
    </div>
  );
}

function DragHandle({ attributes, listeners, disabled, revealOnHover = false }: DragHandleProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-label="Drag row"
      title="Drag to reorder"
      {...attributes}
      {...listeners}
      className={`flex h-8 w-8 flex-shrink-0 cursor-grab items-center justify-center rounded-lg border border-border-subtle bg-pure-white text-gray-400 opacity-100 transition-all hover:border-brand-green/30 hover:bg-brand-green-light/60 hover:text-on-surface active:cursor-grabbing focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-green/40 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/10 dark:bg-white/[0.05] dark:text-neutral-500 dark:hover:border-brand-green/30 dark:hover:bg-brand-green/10 dark:hover:text-neutral-100 ${revealOnHover ? "md:absolute md:inset-0 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100" : ""
        }`}
    >
      <span className="material-symbols-outlined text-[19px]">drag_indicator</span>
    </button>
  );
}

function OrderDragSlot({
  order,
  attributes,
  listeners,
  disabled,
}: {
  order: string;
  attributes: React.HTMLAttributes<HTMLElement>;
  listeners?: React.HTMLAttributes<HTMLElement>;
  disabled?: boolean;
}) {
  return (
    <div className="relative h-8 w-8 flex-shrink-0">
      <span className="hidden h-8 w-8 items-center justify-center rounded-lg bg-surface-container font-mono-code text-mono-code text-gray-400 transition-opacity md:flex md:group-hover:opacity-0 md:group-focus-within:opacity-0 dark:bg-white/[0.07] dark:text-neutral-400">
        {order}
      </span>
      <DragHandle attributes={attributes} listeners={listeners} disabled={disabled} revealOnHover />
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
      className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${!isUnlocked
          ? "bg-gray-100 text-gray-300 cursor-not-allowed"
          : isDue
            ? "bg-brand-green text-near-black shadow-md shadow-brand-green/20 hover:shadow-lg active:scale-95"
            : "bg-brand-green-light text-brand-green-deep hover:bg-brand-green-light/80 dark:bg-brand-green/15 dark:text-brand-green"
        }`}
    >
      <span className="material-symbols-outlined text-xl">refresh</span>
    </button>
  );
}

function MobileConceptCard({
  concept,
  trackerConfigs,
  displayOrder,
  dragHandle,
  isDragging,
  isUnlocked,
  isDue,
  onEdit,
  onSelect,
  onAddToTodo,
  onDelete,
  onReset,
  onReview,
  isAddingToTodo,
}: {
  concept: ConceptRowData;
  trackerConfigs: TrackerConfig[];
  displayOrder: string;
  dragHandle: React.ReactNode;
  isDragging: boolean;
  isUnlocked: boolean;
  isDue: boolean;
  onEdit: () => void;
  onSelect: () => void;
  onAddToTodo: () => Promise<void>;
  onDelete: () => void;
  onReset: () => void;
  onReview: () => void;
  isAddingToTodo: boolean;
}) {
  return (
    <article
      className={`rounded-[24px] border border-border-subtle bg-pure-white p-4 shadow-[0_2px_8px_rgba(0,0,0,0.02)] transition-shadow dark:border-white/10 dark:bg-slate-900 ${isDragging ? "shadow-[0_18px_50px_rgba(0,0,0,0.16)] ring-2 ring-brand-green/30" : ""
        }`}
    >
      <div className="flex items-start gap-3">
        <div className="relative h-8 w-8 flex-shrink-0">
          <span className="hidden h-8 w-8 items-center justify-center rounded-lg bg-surface-container font-mono-code text-mono-code text-gray-400 transition-opacity md:flex md:group-hover:opacity-0 md:group-focus-within:opacity-0 dark:bg-white/[0.07] dark:text-neutral-400">
            {displayOrder}
          </span>
          {dragHandle}
        </div>
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
          onSelect={onSelect}
          onAddToTodo={onAddToTodo}
          onDelete={onDelete}
          onReset={onReset}
          isAddingToTodo={isAddingToTodo}
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
              <span className="flex min-w-0 items-center gap-1.5 truncate font-mono-code text-mono-code uppercase text-gray-500">
                <span className="truncate">{trackerConfig.label}</span>
                {trackerConfig.isOptional ? (
                  <span
                    className="shrink-0 rounded-full border border-warm-amber/20 bg-warm-amber/10 px-1.5 py-0.5 text-[9px] font-semibold tracking-normal text-warm-amber dark:border-warm-amber/30 dark:bg-warm-amber/10"
                    title="ঐচ্ছিক ট্র্যাকার"
                  >
                    ঐচ্ছিক
                  </span>
                ) : null}
              </span>
              <TrackerCell
                isCompleted={tracker?.isCompleted ?? false}
                studyItemId={tracker?.studyItemId}
              />
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-brand-green/20 bg-brand-green-light/55 p-3 dark:border-brand-green/20 dark:bg-brand-green/10">
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

function SortableMobileConcept({
  concept,
  trackerConfigs,
  displayOrder,
  isUnlocked,
  isDue,
  onEdit,
  onSelect,
  onAddToTodo,
  onDelete,
  onReset,
  onReview,
  isAddingToTodo,
  isSelectionMode,
  isSelected,
  onSelectionChange,
}: {
  concept: ConceptRowData;
  trackerConfigs: TrackerConfig[];
  displayOrder: string;
  isUnlocked: boolean;
  isDue: boolean;
  onEdit: () => void;
  onSelect: () => void;
  onAddToTodo: () => Promise<void>;
  onDelete: () => void;
  onReset: () => void;
  onReview: () => void;
  isAddingToTodo: boolean;
  isSelectionMode: boolean;
  isSelected: boolean;
  onSelectionChange: (selected: boolean) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: concept._id, disabled: isSelectionMode });

  return (
    <div
      ref={setNodeRef}
      className="group relative"
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 30 : undefined,
      }}
    >
      <div className={`absolute left-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-border-subtle bg-pure-white shadow-[0_1px_3px_rgba(0,0,0,0.04)] mobile-select-bubble dark:border-white/10 dark:bg-neutral-900 ${isSelectionMode ? "is-active" : ""}`}>
        <CustomCheckbox
          checked={isSelected}
          onChange={() => onSelectionChange(!isSelected)}
          idPrefix={`mobile-sel-${concept._id}`}
          ariaLabel={`${concept.name} নির্বাচন করুন`}
        />
      </div>
      <div className={`mobile-card-wrap ${isSelectionMode ? "is-shifted" : ""}`}>
        <MobileConceptCard
          concept={concept}
          trackerConfigs={trackerConfigs}
          displayOrder={displayOrder}
          dragHandle={<DragHandle attributes={attributes} listeners={listeners} disabled={isSelectionMode} />}
          isDragging={isDragging}
          isUnlocked={isUnlocked}
          isDue={isDue}
          onEdit={onEdit}
          onSelect={onSelect}
          onAddToTodo={onAddToTodo}
          onDelete={onDelete}
          onReset={onReset}
          onReview={onReview}
          isAddingToTodo={isAddingToTodo}
        />
      </div>
    </div>
  );
}

function SortableConceptRow({
  concept,
  trackerConfigs,
  displayOrder,
  isUnlocked,
  isDue,
  isLast,
  onEdit,
  onSelect,
  onAddToTodo,
  onDelete,
  onReset,
  onReview,
  isAddingToTodo,
  isSelectionMode,
  isSelected,
  onSelectionChange,
}: {
  concept: ConceptRowData;
  trackerConfigs: TrackerConfig[];
  displayOrder: string;
  isUnlocked: boolean;
  isDue: boolean;
  isLast: boolean;
  onEdit: () => void;
  onSelect: () => void;
  onAddToTodo: () => Promise<void>;
  onDelete: () => void;
  onReset: () => void;
  onReview: () => void;
  isAddingToTodo: boolean;
  isSelectionMode: boolean;
  isSelected: boolean;
  onSelectionChange: (selected: boolean) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: concept._id, disabled: isSelectionMode });

  return (
    <tr
      ref={setNodeRef}
      className={`group transition-colors hover:bg-surface-container/20 dark:hover:bg-white/[0.04] ${isDragging ? "relative z-30 bg-brand-green-light/70 shadow-lg dark:bg-brand-green/10" : ""
        } ${!isLast ? "border-b border-border-subtle dark:border-white/10" : ""}`}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
    >
      <td className={`select-col-cell ${isLast ? "rounded-bl-2xl" : ""}`}>
        <div className={`select-col-inner flex items-center justify-center ${isSelectionMode ? "is-active" : ""}`}>
          <CustomCheckbox
            checked={isSelected}
            onChange={() => onSelectionChange(!isSelected)}
            idPrefix={`row-sel-${concept._id}`}
            ariaLabel={`${concept.name} নির্বাচন করুন`}
          />
        </div>
      </td>
      <td className={`py-4 px-5 ${!isSelectionMode && isLast ? "rounded-bl-2xl" : ""}`}>
        <div className="flex items-center gap-3">
          <OrderDragSlot
            order={displayOrder}
            attributes={attributes}
            listeners={listeners}
            disabled={isSelectionMode}
          />
          <span className="font-body text-body leading-tight text-on-surface dark:text-neutral-100">
            {concept.name}
          </span>
        </div>
      </td>
      {trackerConfigs.map((trackerConfig) => {
        const tracker = concept.trackerData.find((data) => data.key === trackerConfig.key);
        return (
          <td key={trackerConfig.key} className="py-4 px-5 text-center">
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
            onClick={onReview}
            title={!isUnlocked ? "প্রয়োজনীয় ট্র্যাকারগুলো শেষ করুন" : ""}
            className={`flex h-10 w-10 items-center justify-center rounded-full transition-all ${!isUnlocked
                ? "cursor-not-allowed bg-gray-100 text-gray-300 dark:bg-white/[0.06] dark:text-neutral-600"
                : isDue
                  ? "bg-brand-green text-pure-white shadow-md hover:shadow-lg active:scale-95"
                  : "bg-surface-container text-gray-400 hover:bg-gray-200 dark:bg-white/[0.07] dark:hover:bg-white/[0.12]"
              }`}
          >
            <span className="material-symbols-outlined text-xl">refresh</span>
          </button>
        </div>
      </td>
      <td className="py-4 px-5 text-center">
        <StatusBadge status={concept.status} />
      </td>
      <td className={`py-4 px-5 text-right ${isLast ? "rounded-br-2xl" : ""}`}>
        <ActionMenu
          onEdit={onEdit}
          onSelect={onSelect}
          onAddToTodo={onAddToTodo}
          onDelete={onDelete}
          onReset={onReset}
          isAddingToTodo={isAddingToTodo}
        />
      </td>
    </tr>
  );
}

export default function ConceptTable({
  title,
  concepts,
  trackerConfigs,
  chapterId,
}: ConceptTableProps) {
  const [isModalOpen, setIsModalOpen] = React.useState(false);
  const [isBulkRenameOpen, setIsBulkRenameOpen] = React.useState(false);
  const [isBulkRenameSubmitting, setIsBulkRenameSubmitting] = React.useState(false);
  const [editingConcept, setEditingConcept] = React.useState<ConceptRowData | null>(null);
  const [reviewingConcept, setReviewingConcept] = React.useState<ConceptRowData | null>(null);
  const [addingTodoConceptId, setAddingTodoConceptId] = React.useState<Id<"concepts"> | null>(null);
  const [isSelectionMode, setIsSelectionMode] = React.useState(false);
  const [selectedConceptIds, setSelectedConceptIds] = React.useState<Set<Id<"concepts">>>(
    () => new Set(),
  );
  const [bulkAction, setBulkAction] = React.useState<BulkConceptAction | null>(null);
  const [isBulkProcessing, setIsBulkProcessing] = React.useState(false);
  const [isAdvanceDialogOpen, setIsAdvanceDialogOpen] = React.useState(false);
  const [isAdvancingReadyReviews, setIsAdvancingReadyReviews] = React.useState(false);
  const [now] = React.useState(() => Date.now());
  const toast = useToast();

  const deleteConcept = useMutation(api.mutations.deleteConcept);
  const resetConcept = useMutation(api.mutations.resetConceptProgress);
  const advanceReadyConceptReviews = useMutation(api.mutations.advanceReadyConceptReviews);
  const addConceptStudyItemsToTodayTodo = useMutation(
    api.mutations.addConceptStudyItemsToTodayTodo,
  );
  const reorderConcepts = useMutation(api.mutations.reorderConcepts);
  const syncConceptList = useMutation(api.mutations.syncConceptList);
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const sortableConceptIds = concepts.map((concept) => concept._id);
  const numberFormatter = React.useMemo(() => new Intl.NumberFormat("bn-BD"), []);
  const selectedConceptIdsInCurrentList = concepts
    .filter((concept) => selectedConceptIds.has(concept._id))
    .map((concept) => concept._id);
  const selectedCount = selectedConceptIdsInCurrentList.length;
  const areAllConceptsSelected = selectedCount === concepts.length;
  const readyConceptCount = concepts.filter(
    (concept) =>
      concept.totalItems > 0 &&
      concept.completedItems === concept.totalItems &&
      (concept.lastReviewedAt === undefined ||
        concept.nextReviewAt === undefined ||
        concept.nextReviewAt <= now),
  ).length;

  const setConceptSelected = (conceptId: Id<"concepts">, selected: boolean) => {
    setSelectedConceptIds((current) => {
      const next = new Set(current);
      if (selected) {
        next.add(conceptId);
      } else {
        next.delete(conceptId);
      }
      return next;
    });
  };

  const exitSelectionMode = () => {
    setSelectedConceptIds(new Set());
    setBulkAction(null);
    setIsSelectionMode(false);
  };

  const enterSelectionMode = (conceptId: Id<"concepts">) => {
    setSelectedConceptIds(new Set([conceptId]));
    setIsSelectionMode(true);
  };

  const toggleSelectAll = () => {
    setSelectedConceptIds(
      areAllConceptsSelected ? new Set() : new Set(concepts.map((concept) => concept._id)),
    );
  };

  const handleBulkAction = async () => {
    if (!bulkAction || selectedConceptIdsInCurrentList.length === 0) {
      return;
    }

    const conceptIds = selectedConceptIdsInCurrentList;
    setIsBulkProcessing(true);
    try {
      for (const conceptId of conceptIds) {
        if (bulkAction === "delete") {
          await deleteConcept({ conceptId });
        } else {
          await resetConcept({ conceptId });
        }
      }
      toast.success(
        bulkAction === "delete"
          ? `${numberFormatter.format(conceptIds.length)}টি কনসেপ্ট মুছে ফেলা হয়েছে।`
          : `${numberFormatter.format(conceptIds.length)}টি কনসেপ্টের প্রগ্রেস রিসেট হয়েছে।`,
      );
      exitSelectionMode();
    } catch (error) {
      console.error(`Failed to ${bulkAction} selected concepts:`, error);
      toast.error("সব কনসেপ্টে কাজ শেষ করা যায়নি। অনুগ্রহ করে আবার চেষ্টা করুন।");
    } finally {
      setIsBulkProcessing(false);
    }
  };

  const handleEdit = (concept: ConceptRowData) => {
    setEditingConcept(concept);
    setIsModalOpen(true);
  };

  const handleAdd = () => {
    setEditingConcept(null);
    setIsModalOpen(true);
  };

  const handleBulkRename = async (names: string[]) => {
    setIsBulkRenameSubmitting(true);
    try {
      const result = await syncConceptList({
        chapterId,
        names,
      });
      const totalChanges =
        result.createdCount +
        result.deletedCount +
        result.renamedCount +
        result.reorderedCount;
      setIsBulkRenameOpen(false);
      toast.success(`${numberFormatter.format(totalChanges)}টি পরিবর্তন সেভ হয়েছে।`);
    } finally {
      setIsBulkRenameSubmitting(false);
    }
  };

  const handleReview = (concept: ConceptRowData) => {
    setReviewingConcept(concept);
  };

  const handleAdvanceReadyConceptReviews = async () => {
    setIsAdvancingReadyReviews(true);
    try {
      const result = await advanceReadyConceptReviews({ chapterId });
      setIsAdvanceDialogOpen(false);
      toast.success(
        `${numberFormatter.format(result.reviewedCount)}টি কনসেপ্টের রিভিশন সম্পন্ন হয়েছে।`,
      );
    } catch (error) {
      console.error("Failed to advance ready concept reviews:", error);
      toast.error("রিভিশন সম্পন্ন করা যায়নি। অনুগ্রহ করে আবার চেষ্টা করুন।");
    } finally {
      setIsAdvancingReadyReviews(false);
    }
  };

  const handleAddConceptToTodayTodo = async (concept: ConceptRowData) => {
    if (addingTodoConceptId) {
      return;
    }

    setAddingTodoConceptId(concept._id);

    try {
      const result = await addConceptStudyItemsToTodayTodo({
        conceptId: concept._id,
      });

      if (result.addedCount > 0) {
        toast.success(
          `${numberFormatter.format(result.addedCount)}টি টাস্ক আজকের Todo-তে যোগ হয়েছে।`,
        );
      } else {
        toast.info("নতুন কোনো টাস্ক যোগ করার নেই।");
      }
    } catch (error) {
      console.error("Failed to add concept study items to todo:", error);
      toast.error("আজকের Todo-তে টাস্ক যোগ করা যায়নি। আবার চেষ্টা করুন।");
    } finally {
      setAddingTodoConceptId(null);
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) {
      return;
    }

    const oldIndex = sortableConceptIds.indexOf(active.id as Id<"concepts">);
    const newIndex = sortableConceptIds.indexOf(over.id as Id<"concepts">);
    if (oldIndex === -1 || newIndex === -1) {
      return;
    }

    await reorderConcepts({
      chapterId,
      conceptIds: arrayMove(sortableConceptIds, oldIndex, newIndex),
    });
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
          onClick={() => setIsBulkRenameOpen(true)}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-full px-3 font-label-uppercase text-xs text-gray-600 transition-colors hover:bg-gray-100 hover:text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-green dark:text-neutral-300 dark:hover:bg-white/[0.08] dark:hover:text-neutral-50 sm:ml-auto sm:w-auto"
          aria-label="কনসেপ্টের নাম এডিট করুন"
          title="কনসেপ্টের নাম এডিট করুন"
        >
          <span className="material-symbols-outlined text-[19px]">edit_note</span>
          এডিট
        </button>
        <button
          type="button"
          onClick={() => setIsAdvanceDialogOpen(true)}
          disabled={readyConceptCount === 0}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-full border border-border-medium bg-pure-white px-4 font-label-uppercase text-xs text-on-surface shadow-sm transition-colors hover:border-brand-green/40 hover:bg-brand-green-light/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-green disabled:cursor-not-allowed disabled:opacity-45 dark:border-white/10 dark:bg-white/[0.04] dark:text-neutral-100 dark:hover:border-brand-green/40 dark:hover:bg-brand-green/10 sm:w-auto"
          aria-label={`${numberFormatter.format(readyConceptCount)}টি প্রস্তুত কনসেপ্টের রিভিশন সম্পন্ন করুন`}
        >
          <span className="material-symbols-outlined text-[19px] text-brand-green-deep dark:text-brand-green">trending_up</span>
          <span>রিভিশন সম্পন্ন করুন</span>
          <span className="rounded-full bg-brand-green-light px-2 py-0.5 font-mono-code text-[10px] text-brand-green-deep dark:bg-brand-green/15 dark:text-brand-green">
            {numberFormatter.format(readyConceptCount)}
          </span>
        </button>
        <button
          onClick={handleAdd}
          className="flex w-full items-center justify-center gap-2 px-4 py-3 bg-on-surface text-pure-white rounded-full font-label-uppercase text-xs hover:bg-brand-green focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-green transition-all shadow-sm dark:bg-neutral-100 dark:text-neutral-950 dark:hover:bg-brand-green sm:w-auto sm:py-2"
        >
          <span className="material-symbols-outlined text-base">add</span>
          নতুন কনসেপ্ট
        </button>
      </div>
      <div className={`selection-toolbar ${isSelectionMode ? "is-active" : ""}`}>
        <div className="selection-toolbar-inner">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={toggleSelectAll}
              tabIndex={isSelectionMode ? 0 : -1}
              className="inline-flex h-9 items-center gap-2 rounded-full border border-border-subtle bg-pure-white px-4 font-mono-code text-mono-code uppercase text-gray-500 transition-colors hover:border-border-medium hover:text-on-surface md:hidden dark:border-white/10 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:text-neutral-100"
            >
              <span className="material-symbols-outlined text-base">{areAllConceptsSelected ? "deselect" : "select_all"}</span>
              {areAllConceptsSelected ? "সব বাদ" : "সব সিলেক্ট"}
            </button>
            {selectedCount > 0 && (
              <span className="inline-flex h-9 items-center rounded-full bg-surface-container px-3 font-mono-code text-mono-code text-gray-500 dark:bg-white/[0.07] dark:text-neutral-300">
                {numberFormatter.format(selectedCount)} selected
              </span>
            )}
            <div className="ml-auto flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setBulkAction("reset")}
            disabled={selectedCount === 0 || isBulkProcessing}
            className="flex items-center gap-1.5 rounded-full px-3 py-2 font-label-uppercase text-xs text-warm-amber transition-colors hover:bg-amber-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-green disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-amber-950/30"
          >
            <span className="material-symbols-outlined text-[18px]">restart_alt</span>
            রিসেট
          </button>
          <button
            type="button"
            onClick={() => setBulkAction("delete")}
            disabled={selectedCount === 0 || isBulkProcessing}
            className="flex items-center gap-1.5 rounded-full px-3 py-2 font-label-uppercase text-xs text-error-red transition-colors hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-green disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-red-950/30"
          >
            <span className="material-symbols-outlined text-[18px]">delete</span>
            মুছুন
          </button>
          <button
            type="button"
            onClick={exitSelectionMode}
            disabled={isBulkProcessing}
            className="rounded-full px-3 py-2 font-label-uppercase text-xs text-gray-700 transition-colors hover:bg-pure-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-green disabled:cursor-not-allowed disabled:opacity-50 dark:text-neutral-200 dark:hover:bg-white/[0.08]"
          >
            বাতিল
          </button>
            </div>
          </div>
        </div>
      </div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={sortableConceptIds} strategy={verticalListSortingStrategy}>
          <div className="space-y-3 md:hidden">
            {concepts.map((concept, idx) => {
              const isUnlocked = concept.completedItems === concept.totalItems && concept.totalItems > 0;
              const isDue = concept.nextReviewAt ? concept.nextReviewAt <= now : false;

              return (
                <SortableMobileConcept
                  key={concept._id}
                  concept={concept}
                  trackerConfigs={trackerConfigs}
                  displayOrder={String(idx + 1).padStart(2, "0")}
                  isUnlocked={isUnlocked}
                  isDue={isDue}
                  onEdit={() => handleEdit(concept)}
                  onSelect={() => enterSelectionMode(concept._id)}
                  onAddToTodo={() => handleAddConceptToTodayTodo(concept)}
                  onDelete={() => deleteConcept({ conceptId: concept._id })}
                  onReset={() => resetConcept({ conceptId: concept._id })}
                  onReview={() => handleReview(concept)}
                  isAddingToTodo={addingTodoConceptId === concept._id}
                  isSelectionMode={isSelectionMode}
                  isSelected={selectedConceptIds.has(concept._id)}
                  onSelectionChange={(selected) => setConceptSelected(concept._id, selected)}
                />
              );
            })}
          </div>
        </SortableContext>
      </DndContext>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={sortableConceptIds} strategy={verticalListSortingStrategy}>
          <div className="hidden overflow-x-auto bg-pure-white border border-border-subtle rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.02)] md:block">
            <table className="w-full min-w-[720px] border-separate border-spacing-0">
              <thead>
                <tr className="border-b border-border-subtle">
                  <th className="select-col-cell">
                    <div className={`select-col-inner flex items-center justify-center ${isSelectionMode ? "is-active" : ""}`}>
                      <CustomCheckbox
                        checked={areAllConceptsSelected}
                        onChange={toggleSelectAll}
                        idPrefix="header-select-all"
                        ariaLabel={`${title} select all`}
                      />
                    </div>
                  </th>
                  <th className="text-left py-3.5 px-5 font-mono-code text-mono-code text-gray-500 uppercase first:rounded-tl-2xl">
                    কনসেপ্ট
                  </th>
                  {trackerConfigs.map((t) => (
                    <th
                      key={t.key}
                      className="text-center py-3.5 px-5 font-mono-code text-mono-code text-gray-500 uppercase"
                    >
                      <span className="inline-flex items-center justify-center gap-1.5">
                        <span>{t.label}</span>
                        {t.isOptional ? (
                          <span
                            className="rounded-full border border-warm-amber/20 bg-warm-amber/10 px-1.5 py-0.5 text-[9px] font-semibold tracking-normal text-warm-amber dark:border-warm-amber/30 dark:bg-warm-amber/10"
                            title="ঐচ্ছিক ট্র্যাকার"
                          >
                            ঐচ্ছিক
                          </span>
                        ) : null}
                      </span>
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
                    <SortableConceptRow
                      key={concept._id}
                      concept={concept}
                      trackerConfigs={trackerConfigs}
                      displayOrder={String(idx + 1).padStart(2, "0")}
                      isUnlocked={isUnlocked}
                      isDue={isDue}
                      isLast={idx === concepts.length - 1}
                      onEdit={() => handleEdit(concept)}
                      onSelect={() => enterSelectionMode(concept._id)}
                      onAddToTodo={() => handleAddConceptToTodayTodo(concept)}
                      onDelete={() => deleteConcept({ conceptId: concept._id })}
                      onReset={() => resetConcept({ conceptId: concept._id })}
                      onReview={() => handleReview(concept)}
                      isAddingToTodo={addingTodoConceptId === concept._id}
                      isSelectionMode={isSelectionMode}
                      isSelected={selectedConceptIds.has(concept._id)}
                      onSelectionChange={(selected) => setConceptSelected(concept._id, selected)}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
        </SortableContext>
      </DndContext>

      <ConceptModal
        key={editingConcept?._id || "new"}
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingConcept(null);
        }}
        chapterId={chapterId}
        initialData={editingConcept || undefined}
      />

      <BulkRenameConceptModal
        isOpen={isBulkRenameOpen}
        concepts={concepts}
        isSubmitting={isBulkRenameSubmitting}
        onClose={() => {
          if (!isBulkRenameSubmitting) {
            setIsBulkRenameOpen(false);
          }
        }}
        onSubmit={handleBulkRename}
      />

      <BulkConceptActionDialog
        action={bulkAction}
        conceptCount={selectedCount}
        isSubmitting={isBulkProcessing}
        onClose={() => setBulkAction(null)}
        onConfirm={handleBulkAction}
      />

      <AdvanceReadyConceptReviewsDialog
        isOpen={isAdvanceDialogOpen}
        conceptCount={readyConceptCount}
        isSubmitting={isAdvancingReadyReviews}
        onClose={() => {
          if (!isAdvancingReadyReviews) setIsAdvanceDialogOpen(false);
        }}
        onConfirm={handleAdvanceReadyConceptReviews}
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

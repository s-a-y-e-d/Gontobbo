"use client";

import React, { useState, useRef, useEffect, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import Link from "next/link";
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
};

type ChapterRowData = {
  _id: Id<"chapters">;
  subjectId: Id<"subjects">;
  name: string;
  slug: string;
  order: number;
  nextTermOrder?: number;
  inNextTerm: boolean;
  totalConcepts: number;
  completedConcepts: number;
  trackerData: Array<{ key: string; isCompleted: boolean; score?: number; studyItemId?: string }>;
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
  orderMode: "full" | "nextTerm";
  selectionMode: boolean;
  selectedChapterIds: Set<Id<"chapters">>;
  onToggleChapterSelection: (chapterId: Id<"chapters">) => void;
  onToggleVisibleChapters: (chapterIds: Id<"chapters">[], shouldSelect: boolean) => void;
  onEnterSelectionMode: (chapterId: Id<"chapters">) => void;
  onClearSelection: () => void;
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

function CustomCheckbox({
  checked,
  onChange,
  ariaLabel,
  idPrefix,
  disabled,
}: {
  checked: boolean;
  onChange: () => void;
  ariaLabel?: string;
  idPrefix: string;
  disabled?: boolean;
}) {
  const generatedId = React.useId();
  const id = `cbx-${idPrefix}-${generatedId}`;

  return (
    <div
      className={`checkbox-wrapper-46 flex justify-center items-center ${disabled ? "opacity-50 pointer-events-none" : ""}`}
      onClick={(e) => e.stopPropagation()}
    >
      <input
        className="inp-cbx"
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        aria-label={ariaLabel}
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

function DragHandle({ attributes, listeners, disabled, revealOnHover = false }: DragHandleProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-label="Drag row"
      title={disabled ? "Selection mode disables reordering" : "Drag to reorder"}
      {...attributes}
      {...listeners}
      className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border text-gray-400 opacity-100 transition-all focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-green/40 dark:text-neutral-500 ${
        revealOnHover ? "md:absolute md:inset-0 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100" : ""
      } ${
        disabled
          ? "cursor-not-allowed border-transparent bg-transparent md:group-hover:opacity-40 md:group-focus-within:opacity-40"
          : "cursor-grab border-border-subtle bg-pure-white hover:border-brand-green/30 hover:bg-brand-green-light/60 hover:text-on-surface active:cursor-grabbing dark:border-white/10 dark:bg-white/[0.05] dark:hover:border-brand-green/30 dark:hover:bg-brand-green/10 dark:hover:text-neutral-100"
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
      <DragHandle
        attributes={attributes}
        listeners={listeners}
        disabled={disabled}
        revealOnHover
      />
    </div>
  );
}

function TrackerCell({ isCompleted, studyItemId }: { isCompleted: boolean; studyItemId?: string }) {
  const toggle = useMutation(api.mutations.toggleStudyItemCompletion);

  return (
    <CustomCheckbox
      checked={isCompleted}
      disabled={!studyItemId}
      onChange={() => {
        if (studyItemId) {
          toggle({ studyItemId: studyItemId as Id<"studyItems"> });
        }
      }}
      idPrefix={`tracker-${studyItemId || "empty"}`}
    />
  );
}

function ActionMenu({
  chapterId,
  inNextTerm,
  subjectSlug,
  chapterSlug,
  onEdit,
  onDelete,
  onSelect,
}: {
  chapterId: Id<"chapters">;
  inNextTerm: boolean;
  subjectSlug: string;
  chapterSlug: string;
  onEdit: () => void;
  onDelete: () => void;
  onSelect: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [menuPosition, setMenuPosition] = useState<FloatingMenuPosition>({
    top: 0,
    left: 0,
    visibility: "hidden",
  });

  const toggleExam = useMutation(api.mutations.toggleChapterInNextTerm);
  const resetProgress = useMutation(api.mutations.resetChapterProgress);

  useLayoutEffect(() => {
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
          menu.offsetWidth || 220,
          menu.offsetHeight || 260,
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
  useEffect(() => {
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
                220,
                showConfirm ? 200 : 260,
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
          className="fixed z-[120] min-w-[220px] animate-in fade-in rounded-2xl border border-border-subtle bg-pure-white py-1.5 shadow-[0_8px_30px_rgba(0,0,0,0.08)] duration-150"
          style={menuPosition}
        >
          <Link
            href={`/subjects/${subjectSlug}/${chapterSlug}`}
            onClick={(e) => {
              e.stopPropagation();
              setOpen(false);
            }}
            className="flex items-center gap-3 w-full px-4 py-2.5 text-left text-sm text-on-surface hover:bg-gray-100 transition-colors"
          >
            <span className="material-symbols-outlined text-lg text-gray-500">visibility</span>
            অধ্যায় দেখুন
          </Link>
          
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
            className="flex items-center gap-3 w-full px-4 py-2.5 text-left text-sm text-on-surface hover:bg-gray-100 transition-colors"
          >
            <span className="material-symbols-outlined text-lg text-gray-500">checklist</span>
            Select
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
        </div>,
        document.body,
      )}
    </div>
  );
}

import ChapterModal from "./ChapterModal";

function MobileConceptProgress({ completed, total }: { completed: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((completed / total) * 100);

  return (
    <div className="rounded-2xl border border-brand-green/20 bg-brand-green-light/55 p-3 dark:border-brand-green/20 dark:bg-brand-green/10">
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="font-mono-code text-mono-code uppercase text-gray-500">
          Concepts
        </span>
        <span className="font-mono-code text-mono-code text-on-surface">
          {total === 0 ? "-" : `${completed}/${total}`}
        </span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-white/80 dark:bg-black/30">
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            pct === 100 ? "bg-brand-green" : pct > 0 ? "bg-warm-amber" : "bg-gray-300"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function MobileChapterCard({
  chapter,
  trackerConfigs,
  subjectSlug,
  onEdit,
  onDelete,
  onSelect,
  displayOrder,
  dragHandle,
  isDragging,
}: {
  chapter: ChapterRowData;
  trackerConfigs: TrackerConfig[];
  subjectSlug: string;
  onEdit: () => void;
  onDelete: () => void;
  onSelect: () => void;
  displayOrder: string;
  dragHandle: React.ReactNode;
  isDragging: boolean;
}) {
  return (
    <article
      className={`rounded-[24px] border border-border-subtle bg-pure-white p-4 shadow-[0_2px_8px_rgba(0,0,0,0.02)] transition-shadow dark:border-white/10 dark:bg-slate-900 ${
        isDragging ? "shadow-[0_18px_50px_rgba(0,0,0,0.16)] ring-2 ring-brand-green/30" : ""
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
          <Link
            href={`/subjects/${subjectSlug}/${chapter.slug}`}
            className="block w-full text-left font-body text-[17px] font-semibold leading-snug text-on-surface transition-colors hover:text-brand-green"
          >
            {chapter.name}
          </Link>
          <div className="mt-2">
            <StatusBadge status={chapter.status} />
          </div>
        </div>
        <ActionMenu
          chapterId={chapter._id}
          inNextTerm={chapter.inNextTerm}
          subjectSlug={subjectSlug}
          chapterSlug={chapter.slug}
          onEdit={onEdit}
          onDelete={onDelete}
          onSelect={onSelect}
        />
      </div>

      <div className="mt-4">
        <MobileConceptProgress completed={chapter.completedConcepts} total={chapter.totalConcepts} />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        {trackerConfigs.map((trackerConfig) => {
          const tracker = chapter.trackerData.find((data) => data.key === trackerConfig.key);

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
    </article>
  );
}

function SortableMobileChapter({
  chapter,
  trackerConfigs,
  subjectSlug,
  displayOrder,
  selectionMode,
  selected,
  onToggleSelection,
  onEdit,
  onDelete,
  onSelect,
}: {
  chapter: ChapterRowData;
  trackerConfigs: TrackerConfig[];
  subjectSlug: string;
  displayOrder: string;
  selectionMode: boolean;
  selected: boolean;
  onToggleSelection: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onSelect: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: chapter._id,
    disabled: selectionMode,
  });

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
      <div className={`absolute left-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-border-subtle bg-pure-white shadow-[0_1px_3px_rgba(0,0,0,0.04)] mobile-select-bubble ${selectionMode ? "is-active" : ""}`}>
        <CustomCheckbox
          checked={selected}
          onChange={onToggleSelection}
          idPrefix={`mobile-sel-${chapter._id}`}
          ariaLabel={`${chapter.name} select`}
        />
      </div>
      <div className={`mobile-card-wrap ${selectionMode ? "is-shifted" : ""}`}>
        <MobileChapterCard
          chapter={chapter}
          trackerConfigs={trackerConfigs}
          subjectSlug={subjectSlug}
          displayOrder={displayOrder}
          dragHandle={
            <DragHandle
              attributes={attributes}
              listeners={listeners}
              disabled={selectionMode}
              revealOnHover={false}
            />
          }
          isDragging={isDragging}
          onEdit={onEdit}
          onDelete={onDelete}
          onSelect={onSelect}
        />
      </div>
    </div>
  );
}

function SortableChapterRow({
  chapter,
  trackerConfigs,
  subjectSlug,
  displayOrder,
  selectionMode,
  selected,
  isLast,
  onToggleSelection,
  onEdit,
  onDelete,
  onSelect,
}: {
  chapter: ChapterRowData;
  trackerConfigs: TrackerConfig[];
  subjectSlug: string;
  displayOrder: string;
  selectionMode: boolean;
  selected: boolean;
  isLast: boolean;
  onToggleSelection: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onSelect: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: chapter._id,
    disabled: selectionMode,
  });

  return (
    <tr
      ref={setNodeRef}
      className={`group transition-colors hover:bg-gray-50 dark:hover:bg-white/[0.04] ${
        isDragging ? "relative z-30 bg-brand-green-light/70 shadow-lg dark:bg-brand-green/10" : ""
      } ${!isLast ? "[&>td]:border-b [&>td]:border-border-subtle dark:[&>td]:border-white/10" : ""}`}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
    >
      <td className={`select-col-cell ${isLast ? "rounded-bl-2xl" : ""}`}>
        <div className={`select-col-inner flex items-center justify-center ${selectionMode ? "is-active" : ""}`}>
          <CustomCheckbox
            checked={selected}
            onChange={onToggleSelection}
            idPrefix={`row-sel-${chapter._id}`}
            ariaLabel={`${chapter.name} select`}
          />
        </div>
      </td>
      <td className={`py-4 px-5 ${!selectionMode && isLast ? "rounded-bl-2xl" : ""}`}>
        <div className="flex items-center gap-3">
          <OrderDragSlot
            order={displayOrder}
            attributes={attributes}
            listeners={listeners}
            disabled={selectionMode}
          />
          <Link
            href={`/subjects/${subjectSlug}/${chapter.slug}`}
            className="text-left font-body text-body leading-tight text-on-surface transition-colors hover:text-brand-green dark:text-neutral-100"
          >
            {chapter.name}
          </Link>
        </div>
      </td>
      <td className="py-4 px-5">
        <div className="flex justify-center">
          <ConceptBar completed={chapter.completedConcepts} total={chapter.totalConcepts} />
        </div>
      </td>
      {trackerConfigs.map((trackerConfig) => {
        const tracker = chapter.trackerData.find((data) => data.key === trackerConfig.key);
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
        <StatusBadge status={chapter.status} />
      </td>
      <td className={`py-4 px-5 text-right ${isLast ? "rounded-br-2xl" : ""}`}>
        <ActionMenu
          chapterId={chapter._id}
          inNextTerm={chapter.inNextTerm}
          subjectSlug={subjectSlug}
          chapterSlug={chapter.slug}
          onEdit={onEdit}
          onDelete={onDelete}
          onSelect={onSelect}
        />
      </td>
    </tr>
  );
}

export default function ChapterTable({
  title,
  chapters,
  trackerConfigs,
  subjectSlug,
  subjectId,
  orderMode,
  selectionMode,
  selectedChapterIds,
  onToggleChapterSelection,
  onToggleVisibleChapters,
  onEnterSelectionMode,
  onClearSelection,
}: ChapterTableProps) {
  const [editingChapter, setEditingChapter] = useState<ChapterRowData | null>(null);
  const [savingBulkStatus, setSavingBulkStatus] = useState(false);
  const deleteChapter = useMutation(api.mutations.deleteChapter);
  const setChaptersInNextTerm = useMutation(api.mutations.setChaptersInNextTerm);
  const reorderChapters = useMutation(api.mutations.reorderChapters);
  const reorderNextTermChapters = useMutation(api.mutations.reorderNextTermChapters);
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  if (chapters.length === 0) {
    return (
      <section className="mb-12">
        <h2 className="font-sub-heading text-sub-heading text-on-surface mb-6">{title}</h2>
        <div className="text-center py-12 px-4 text-gray-400 border border-border-subtle rounded-2xl bg-pure-white">
          কোনো অধ্যায় পাওয়া যায়নি
        </div>
      </section>
    );
  }

  const finalSubjectId = subjectId || chapters[0]?.subjectId;
  const selectedCount = selectedChapterIds.size;
  const allVisibleSelected =
    chapters.length > 0 && chapters.every((chapter) => selectedChapterIds.has(chapter._id));
  const selectedIds = Array.from(selectedChapterIds);
  const visibleChapterIds = chapters.map((chapter) => chapter._id);
  const sortableChapterIds = chapters.map((chapter) => chapter._id);
  const getDisplayOrder = (chapter: ChapterRowData, index: number) =>
    String(orderMode === "nextTerm" ? chapter.order : index + 1).padStart(2, "0");

  const toggleAllVisible = () => {
    onToggleVisibleChapters(visibleChapterIds, !allVisibleSelected);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    if (selectionMode || !finalSubjectId) {
      return;
    }

    const { active, over } = event;
    if (!over || active.id === over.id) {
      return;
    }

    const oldIndex = sortableChapterIds.indexOf(active.id as Id<"chapters">);
    const newIndex = sortableChapterIds.indexOf(over.id as Id<"chapters">);
    if (oldIndex === -1 || newIndex === -1) {
      return;
    }

    const nextChapterIds = arrayMove(sortableChapterIds, oldIndex, newIndex);
    if (orderMode === "nextTerm") {
      await reorderNextTermChapters({
        subjectId: finalSubjectId,
        chapterIds: nextChapterIds,
      });
      return;
    }

    await reorderChapters({
      subjectId: finalSubjectId,
      chapterIds: nextChapterIds,
    });
  };

  const applyBulkNextTermStatus = async (inNextTerm: boolean) => {
    if (!finalSubjectId || selectedIds.length === 0) {
      return;
    }

    setSavingBulkStatus(true);
    try {
      await setChaptersInNextTerm({
        subjectId: finalSubjectId,
        chapterIds: selectedIds,
        inNextTerm,
      });
      onClearSelection();
    } finally {
      setSavingBulkStatus(false);
    }
  };

  return (
    <section className="mb-12">
      <div className="mb-4 flex flex-col gap-3 md:mb-6 md:flex-row md:items-center md:justify-between">
        <h2 className="font-sub-heading text-[22px] leading-tight text-on-surface md:text-sub-heading">{title}</h2>
        <div className={`selection-toolbar ${selectionMode ? "is-active" : ""}`}>
          <div className="selection-toolbar-inner">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={toggleAllVisible}
                tabIndex={selectionMode ? 0 : -1}
                className="inline-flex h-9 items-center gap-2 rounded-full border border-border-subtle bg-pure-white px-4 font-mono-code text-mono-code uppercase text-gray-500 transition-colors hover:border-border-medium hover:text-on-surface md:hidden"
              >
                <span className="material-symbols-outlined text-base">
                  {allVisibleSelected ? "deselect" : "select_all"}
                </span>
                {allVisibleSelected ? "সব বাদ" : "সব সিলেক্ট"}
              </button>
              {selectedCount > 0 && (
                <>
                  <span className="inline-flex h-9 items-center rounded-full bg-surface-container px-3 font-mono-code text-mono-code text-gray-500">
                    {selectedCount} selected
                  </span>
                  <button
                    type="button"
                    disabled={savingBulkStatus}
                    onClick={() => void applyBulkNextTermStatus(true)}
                    className="inline-flex h-9 items-center gap-2 rounded-full bg-on-surface px-4 font-mono-code text-mono-code uppercase text-pure-white transition-colors hover:bg-brand-green hover:text-on-surface disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <span className="material-symbols-outlined text-base">event_available</span>
                    পরীক্ষায় যোগ
                  </button>
                  <button
                    type="button"
                    disabled={savingBulkStatus}
                    onClick={() => void applyBulkNextTermStatus(false)}
                    className="inline-flex h-9 items-center gap-2 rounded-full border border-border-subtle bg-pure-white px-4 font-mono-code text-mono-code uppercase text-gray-500 transition-colors hover:border-border-medium hover:text-on-surface disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <span className="material-symbols-outlined text-base">event_busy</span>
                    বাদ দিন
                  </button>
                </>
              )}
              <button
                type="button"
                disabled={savingBulkStatus}
                onClick={onClearSelection}
                tabIndex={selectionMode ? 0 : -1}
                className="inline-flex h-9 items-center gap-2 rounded-full border border-border-subtle bg-pure-white px-4 font-mono-code text-mono-code uppercase text-gray-500 transition-colors hover:border-border-medium hover:text-on-surface disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-base">close</span>
                বাতিল
              </button>
            </div>
          </div>
        </div>
      </div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={sortableChapterIds} strategy={verticalListSortingStrategy}>
          <div className="space-y-3 md:hidden">
            {chapters.map((chapter, idx) => (
              <SortableMobileChapter
                key={chapter._id}
                chapter={chapter}
                trackerConfigs={trackerConfigs}
                subjectSlug={subjectSlug}
                displayOrder={getDisplayOrder(chapter, idx)}
                selectionMode={selectionMode}
                selected={selectedChapterIds.has(chapter._id)}
                onToggleSelection={() => onToggleChapterSelection(chapter._id)}
                onEdit={() => setEditingChapter(chapter)}
                onDelete={() => deleteChapter({ chapterId: chapter._id })}
                onSelect={() => onEnterSelectionMode(chapter._id)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={sortableChapterIds} strategy={verticalListSortingStrategy}>
          <div className="hidden overflow-x-auto bg-pure-white border border-border-subtle rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.02)] md:block">
            <table className="w-full min-w-[760px] border-separate border-spacing-0">
              <thead>
                <tr className="border-b border-border-subtle">
                  <th className="select-col-cell">
                    <div className={`select-col-inner flex items-center justify-center ${selectionMode ? "is-active" : ""}`}>
                      <CustomCheckbox
                        checked={allVisibleSelected}
                        onChange={toggleAllVisible}
                        idPrefix="header-select-all"
                        ariaLabel={`${title} select all`}
                      />
                    </div>
                  </th>
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
                  <SortableChapterRow
                    key={chapter._id}
                    chapter={chapter}
                    trackerConfigs={trackerConfigs}
                    subjectSlug={subjectSlug}
                    displayOrder={getDisplayOrder(chapter, idx)}
                    selectionMode={selectionMode}
                    selected={selectedChapterIds.has(chapter._id)}
                    isLast={idx === chapters.length - 1}
                    onToggleSelection={() => onToggleChapterSelection(chapter._id)}
                    onEdit={() => setEditingChapter(chapter)}
                    onDelete={() => deleteChapter({ chapterId: chapter._id })}
                    onSelect={() => onEnterSelectionMode(chapter._id)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </SortableContext>
      </DndContext>

      {editingChapter && (
        <ChapterModal
          key={editingChapter._id}
          isOpen={!!editingChapter}
          onClose={() => setEditingChapter(null)}
          subjectId={finalSubjectId}
          initialData={editingChapter}
        />
      )}
    </section>
  );
}

"use client";

import React, { useState, useEffect, useRef } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";

type AddSubjectModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

type TrackerEntry = {
  label: string;
  avgMinutes: number;
};

const DURATION_PRESETS = Array.from({ length: 16 }, (_, index) => (index + 1) * 15);

function formatDurationLabel(minutes: number): string {
  if (minutes < 60) {
    return `${minutes} min`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (remainingMinutes === 0) {
    return `${hours}h`;
  }

  return `${hours}h ${remainingMinutes} min`;
}

function DurationSelect({
  value,
  onChange,
}: {
  value: number;
  onChange: (minutes: number) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div ref={containerRef} className="relative w-40 shrink-0">
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        className={`flex w-full items-center rounded-full border bg-pure-white py-2 pl-4 pr-3 text-left transition-all ${
          isOpen
            ? "border-brand-green ring-4 ring-brand-green/10"
            : "border-border-medium hover:border-brand-green/35"
        }`}
      >
        <span className="material-symbols-outlined text-[18px] text-brand-green">schedule</span>
        <span className="ml-2.5 flex-1 font-medium text-on-surface">
          {formatDurationLabel(value)}
        </span>
        <span
          className={`material-symbols-outlined text-[18px] text-gray-400 transition-transform ${
            isOpen ? "rotate-180" : ""
          }`}
        >
          expand_more
        </span>
      </button>

      {isOpen && (
        <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-50 overflow-hidden rounded-3xl border border-border-subtle bg-pure-white p-2 shadow-[0_20px_50px_rgba(15,23,42,0.16)]">
          <div className="max-h-64 overflow-y-auto">
            {DURATION_PRESETS.map((minutes) => {
              const isSelected = minutes === value;

              return (
                <button
                  key={minutes}
                  type="button"
                  onClick={() => {
                    onChange(minutes);
                    setIsOpen(false);
                  }}
                  className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-all ${
                    isSelected
                      ? "bg-brand-green/10 text-brand-green"
                      : "text-on-surface hover:bg-gray-50"
                  }`}
                >
                  <span
                    className={`material-symbols-outlined text-[18px] ${
                      isSelected ? "text-brand-green" : "text-gray-300"
                    }`}
                  >
                    schedule
                  </span>
                  <span className="flex-1 font-medium">{formatDurationLabel(minutes)}</span>
                  {isSelected && (
                    <span className="material-symbols-outlined text-[18px] text-brand-green">
                      check
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function toKey(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .trim() || `tracker-${Date.now()}`;
}

function ensureUniqueKeys(trackers: { label: string; avgMinutes: number }[]) {
  const keys = new Set<string>();
  return trackers.map((t) => {
    let key = toKey(t.label);
    const originalKey = key;
    let counter = 2;
    while (keys.has(key)) {
      key = `${originalKey}-${counter}`;
      counter++;
    }
    keys.add(key);
    return { ...t, key };
  });
}

const ICON_OPTIONS = [
  { label: "Book", value: "menu_book" },
  { label: "Science", value: "science" },
  { label: "Physics", value: "rocket_launch" },
  { label: "Math", value: "calculate" },
  { label: "Finance", value: "account_balance" },
  { label: "Economics", value: "trending_up" },
  { label: "Stats", value: "pie_chart" },
  { label: "Bio", value: "biotech" },
  { label: "History", value: "history_edu" },
  { label: "Language", value: "language" },
  { label: "ICT", value: "terminal" },
  { label: "Brain", value: "psychology" },
  { label: "Design", value: "architecture" },
  { label: "Symbols", value: "functions" },
  { label: "Translate", value: "translate" },
  { label: "Globe", value: "public" },
  { label: "School", value: "school" },
  { label: "Art", value: "brush" },
  { label: "Idea", value: "emoji_objects" },
  { label: "Social", value: "groups" },
];

export default function AddSubjectModal({ isOpen, onClose }: AddSubjectModalProps) {
  const createSubject = useMutation(api.mutations.createSubject);
  
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("menu_book");
  const [color, setColor] = useState("green");
  const [examWeight, setExamWeight] = useState("");
  const [chapterTrackers, setChapterTrackers] = useState<TrackerEntry[]>([
    { label: "MCQ", avgMinutes: 30 },
    { label: "বোর্ড", avgMinutes: 45 }
  ]);
  const [conceptTrackers, setConceptTrackers] = useState<TrackerEntry[]>([
    { label: "ক্লাস ", avgMinutes: 20 },
    { label: "বই", avgMinutes: 25 }
  ]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isIconDropdownOpen, setIsIconDropdownOpen] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (chapterTrackers.length === 0 || conceptTrackers.length === 0) {
      alert("অন্তত একটি অধ্যায় ট্র্যাকার এবং একটি কনসেপ্ট ট্র্যাকার প্রয়োজন।");
      return;
    }

    setIsSubmitting(true);
    try {
      await createSubject({
        name,
        icon,
        color,
        examWeight: examWeight.trim() === "" ? undefined : Number(examWeight),
        order: Date.now(),
        chapterTrackers: ensureUniqueKeys(chapterTrackers),
        conceptTrackers: ensureUniqueKeys(conceptTrackers),
      });
      setName("");
      setExamWeight("");
      setChapterTrackers([]);
      setConceptTrackers([]);
      onClose();
    } catch (error) {
      console.error("Failed to create subject:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const addTracker = (type: "chapter" | "concept") => {
    const newTracker = { label: "", avgMinutes: 30 };
    if (type === "chapter") {
      setChapterTrackers([...chapterTrackers, newTracker]);
    } else {
      setConceptTrackers([...conceptTrackers, newTracker]);
    }
  };

  const removeTracker = (type: "chapter" | "concept", index: number) => {
    if (type === "chapter") {
      setChapterTrackers(chapterTrackers.filter((_, i) => i !== index));
    } else {
      setConceptTrackers(conceptTrackers.filter((_, i) => i !== index));
    }
  };

  const updateTracker = (type: "chapter" | "concept", index: number, field: keyof TrackerEntry, value: string | number) => {
    if (type === "chapter") {
      const updated = [...chapterTrackers];
      updated[index] = { ...updated[index], [field]: value };
      setChapterTrackers(updated);
    } else {
      const updated = [...conceptTrackers];
      updated[index] = { ...updated[index], [field]: value };
      setConceptTrackers(updated);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (isOpen) {
      document.addEventListener("keydown", handleKeyDown);
    }
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 overflow-y-auto"
      onClick={onClose}
    >
      <div 
        className="bg-pure-white rounded-xl shadow-xl w-full max-w-2xl my-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center p-6 border-b border-border-subtle sticky top-0 bg-pure-white z-10">
          <h2 className="font-card-title text-card-title text-on-surface">নতুন বিষয় যোগ করুন</h2>
          <button 
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 transition-colors"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-8">
          {/* Metadata Section */}
          <div className="flex flex-col gap-4">
            <div>
              <label className="block font-label-uppercase text-label-uppercase text-gray-500 mb-2">বিষয়ের নাম</label>
              <input 
                type="text" 
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-4 py-2 border border-border-medium rounded-full focus:outline-none focus:border-brand-green"
                placeholder="যেমন: পদার্থবিজ্ঞান ১ম পত্র"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="relative">
                <label className="block font-label-uppercase text-label-uppercase text-gray-500 mb-2">আইকন</label>
                <button
                  type="button"
                  onClick={() => setIsIconDropdownOpen(!isIconDropdownOpen)}
                  className="w-full px-4 py-2 border border-border-medium rounded-full focus:outline-none focus:border-brand-green bg-pure-white flex items-center justify-between"
                >
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[20px] text-gray-600">
                      {icon}
                    </span>
                    <span className="text-on-surface">
                      {ICON_OPTIONS.find((opt) => opt.value === icon)?.label || "Select Icon"}
                    </span>
                  </div>
                  <span className="material-symbols-outlined text-gray-400">
                    {isIconDropdownOpen ? "expand_less" : "expand_more"}
                  </span>
                </button>

                {isIconDropdownOpen && (
                  <div className="absolute top-full left-0 right-0 mt-2 bg-pure-white border border-border-subtle rounded-2xl shadow-lg z-50 max-h-60 overflow-y-auto grid grid-cols-2 p-2">
                    {ICON_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => {
                          setIcon(opt.value);
                          setIsIconDropdownOpen(false);
                        }}
                        className={`flex items-center gap-3 px-3 py-2 rounded-xl transition-colors hover:bg-gray-50 ${
                          icon === opt.value ? "bg-brand-green/10 text-brand-green" : "text-gray-700"
                        }`}
                      >
                        <span className="material-symbols-outlined text-[20px]">
                          {opt.value}
                        </span>
                        <span className="text-sm font-medium">{opt.label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <label className="block font-label-uppercase text-label-uppercase text-gray-500 mb-2">থিম কালার</label>
                <select 
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="w-full px-4 py-2 border border-border-medium rounded-full focus:outline-none focus:border-brand-green bg-pure-white appearance-none"
                >
                  <option value="green">Green</option>
                  <option value="blue">Blue</option>
                  <option value="red">Red</option>
                  <option value="amber">Amber</option>
                  <option value="purple">Purple</option>
                  <option value="teal">Teal</option>
                  <option value="indigo">Indigo</option>
                  <option value="pink">Pink</option>
                  <option value="gray">Gray</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block font-label-uppercase text-label-uppercase text-gray-500 mb-2">Exam Weight</label>
              <input
                type="number"
                min="0"
                step="0.1"
                value={examWeight}
                onChange={(e) => setExamWeight(e.target.value)}
                className="w-full px-4 py-2 border border-border-medium rounded-full focus:outline-none focus:border-brand-green"
                placeholder="যেমন: 30"
              />
              <p className="mt-2 text-xs text-gray-400">
                Dashboard-এর Effort vs Weightage chart-এ এই মান ব্যবহার হবে।
              </p>
            </div>
          </div>

          {/* Chapter Trackers Section */}
          <div>
            <div className="flex justify-between items-center mb-4">
              <label className="block font-label-uppercase text-label-uppercase text-gray-500">অধ্যায় ট্র্যাকার (Subject Page)</label>
              <button 
                type="button" 
                onClick={() => addTracker("chapter")}
                className="text-brand-green font-medium flex items-center gap-1 text-sm hover:opacity-80 transition-opacity"
              >
                <span className="material-symbols-outlined text-sm">add</span>
                অ্যাড করুন
              </button>
            </div>
            <div className="flex flex-col gap-3">
              {chapterTrackers.map((tracker, index) => (
                <div key={index} className="flex gap-3 items-center">
                  <input 
                    type="text" 
                    placeholder="লেবেল (যেমন: MCQ)"
                    required
                    value={tracker.label}
                    onChange={(e) => updateTracker("chapter", index, "label", e.target.value)}
                    className="flex-1 px-4 py-2 border border-border-medium rounded-full focus:outline-none focus:border-brand-green"
                  />
                  <DurationSelect
                    value={tracker.avgMinutes}
                    onChange={(minutes) => updateTracker("chapter", index, "avgMinutes", minutes)}
                  />
                  <button 
                    type="button" 
                    onClick={() => removeTracker("chapter", index)}
                    className="p-2 text-error-red hover:bg-red-50 rounded-full transition-colors"
                  >
                    <span className="material-symbols-outlined">delete</span>
                  </button>
                </div>
              ))}
              {chapterTrackers.length === 0 && (
                <p className="text-sm text-gray-400 italic text-center py-4 border border-dashed border-border-medium rounded-xl">কোনো ট্র্যাকার নেই</p>
              )}
            </div>
          </div>

          {/* Concept Trackers Section */}
          <div>
            <div className="flex justify-between items-center mb-4">
              <label className="block font-label-uppercase text-label-uppercase text-gray-500">কনসেপ্ট ট্র্যাকার (Chapter Page)</label>
              <button 
                type="button" 
                onClick={() => addTracker("concept")}
                className="text-brand-green font-medium flex items-center gap-1 text-sm hover:opacity-80 transition-opacity"
              >
                <span className="material-symbols-outlined text-sm">add</span>
                অ্যাড করুন
              </button>
            </div>
            <div className="flex flex-col gap-3">
              {conceptTrackers.map((tracker, index) => (
                <div key={index} className="flex gap-3 items-center">
                  <input 
                    type="text" 
                    placeholder="লেবেল (যেমন: ক্লাস নোট)"
                    required
                    value={tracker.label}
                    onChange={(e) => updateTracker("concept", index, "label", e.target.value)}
                    className="flex-1 px-4 py-2 border border-border-medium rounded-full focus:outline-none focus:border-brand-green"
                  />
                  <DurationSelect
                    value={tracker.avgMinutes}
                    onChange={(minutes) => updateTracker("concept", index, "avgMinutes", minutes)}
                  />
                  <button 
                    type="button" 
                    onClick={() => removeTracker("concept", index)}
                    className="p-2 text-error-red hover:bg-red-50 rounded-full transition-colors"
                  >
                    <span className="material-symbols-outlined">delete</span>
                  </button>
                </div>
              ))}
              {conceptTrackers.length === 0 && (
                <p className="text-sm text-gray-400 italic text-center py-4 border border-dashed border-border-medium rounded-xl">কোনো ট্র্যাকার নেই</p>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-3 mt-6">
            <button 
              type="button"
              onClick={onClose}
              className="px-6 py-2.5 rounded-full font-label-uppercase text-label-uppercase text-gray-700 hover:bg-gray-100 transition-colors"
            >
              বাতিল
            </button>
            <button 
              type="submit"
              disabled={isSubmitting}
              className="px-8 py-2.5 rounded-full font-label-uppercase text-label-uppercase text-pure-white bg-on-surface hover:bg-brand-green transition-colors disabled:opacity-50"
            >
              {isSubmitting ? "যুক্ত হচ্ছে..." : "বিষয় যোগ করুন"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

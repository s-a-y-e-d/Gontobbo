"use client";

import React, { useState, useEffect } from "react";
import { useMutation, useConvex } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";

type EditSubjectModalProps = {
  isOpen: boolean;
  onClose: () => void;
  subject: {
    _id: Id<"subjects">;
    name: string;
    icon?: string;
    color?: string;
    chapterTrackers: { key: string; label: string; avgMinutes: number }[];
    conceptTrackers: { key: string; label: string; avgMinutes: number }[];
    slug: string; // Add slug here
  };
};

type TrackerEntry = {
  key?: string;
  label: string;
  avgMinutes: number;
};

function toKey(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .trim() || `tracker-${Date.now()}`;
}

function ensureUniqueKeys(trackers: TrackerEntry[]) {
  const keys = new Set<string>();
  return trackers.map((t) => {
    let key = t.key || toKey(t.label);
    const originalKey = key;
    let counter = 2;
    while (keys.has(key)) {
      key = `${originalKey}-${counter}`;
      counter++;
    }
    keys.add(key);
    return { 
        key,
        label: t.label,
        avgMinutes: t.avgMinutes
    };
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

export default function EditSubjectModal({ isOpen, onClose, subject }: EditSubjectModalProps) {
  const convex = useConvex();
  const updateSubject = useMutation(api.mutations.updateSubject);
  
  const [name, setName] = useState(subject.name);
  const [icon, setIcon] = useState(subject.icon || "menu_book");
  const [color, setColor] = useState(subject.color || "green");
  const [chapterTrackers, setChapterTrackers] = useState<TrackerEntry[]>(subject.chapterTrackers);
  const [conceptTrackers, setConceptTrackers] = useState<TrackerEntry[]>(subject.conceptTrackers);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isIconDropdownOpen, setIsIconDropdownOpen] = useState(false);
  
  const [pendingRemoval, setPendingRemoval] = useState<{ type: "chapter" | "concept", index: number } | null>(null);
  const [isCheckingRemoval, setIsCheckingRemoval] = useState(false);

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
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (chapterTrackers.length === 0 || conceptTrackers.length === 0) {
      alert("অন্তত একটি অধ্যায় ট্র্যাকার এবং একটি কনসেপ্ট ট্র্যাকার প্রয়োজন।");
      return;
    }

    setIsSubmitting(true);
    try {
      await updateSubject({
        subjectId: subject._id,
        name,
        icon,
        color,
        chapterTrackers: ensureUniqueKeys(chapterTrackers),
        conceptTrackers: ensureUniqueKeys(conceptTrackers),
      });
      
      onClose();
    } catch (error) {
      console.error("Failed to update subject:", error);
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

  const initiateRemoval = async (type: "chapter" | "concept", index: number) => {
    const tracker = type === "chapter" ? chapterTrackers[index] : conceptTrackers[index];
    
    if (!tracker.key) {
      // New tracker, just remove it
      performRemoval(type, index);
      return;
    }

    setIsCheckingRemoval(true);
    try {
      const count = await convex.query(api.queries.countStudyItemsByType, {
        subjectId: subject._id,
        type: tracker.key
      });

      if (count > 0) {
        setPendingRemoval({ type, index });
      } else {
        performRemoval(type, index);
      }
    } catch (error) {
      console.error("Error checking study items:", error);
      performRemoval(type, index);
    } finally {
      setIsCheckingRemoval(false);
    }
  };

  const performRemoval = (type: "chapter" | "concept", index: number) => {
    if (type === "chapter") {
      setChapterTrackers(chapterTrackers.filter((_, i) => i !== index));
    } else {
      setConceptTrackers(conceptTrackers.filter((_, i) => i !== index));
    }
    setPendingRemoval(null);
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
          <h2 className="font-card-title text-card-title text-on-surface">বিষয় এডিট করুন</h2>
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
                <div key={index} className="flex flex-col gap-2">
                  <div className="flex gap-3 items-center">
                    <input 
                      type="text" 
                      placeholder="লেবেল"
                      required
                      value={tracker.label}
                      onChange={(e) => updateTracker("chapter", index, "label", e.target.value)}
                      className="flex-1 px-4 py-2 border border-border-medium rounded-full focus:outline-none focus:border-brand-green"
                    />
                    <input 
                      type="number" 
                      placeholder="মিনিট"
                      required
                      value={tracker.avgMinutes}
                      onChange={(e) => updateTracker("chapter", index, "avgMinutes", parseInt(e.target.value) || 0)}
                      className="w-24 px-4 py-2 border border-border-medium rounded-full focus:outline-none focus:border-brand-green text-center"
                    />
                    <button 
                      type="button" 
                      disabled={isCheckingRemoval}
                      onClick={() => initiateRemoval("chapter", index)}
                      className="p-2 text-error-red hover:bg-red-50 rounded-full transition-colors disabled:opacity-50"
                    >
                      <span className="material-symbols-outlined">delete</span>
                    </button>
                  </div>
                  {pendingRemoval?.type === "chapter" && pendingRemoval?.index === index && (
                    <div className="bg-amber-50 border border-warm-amber/20 p-3 rounded-2xl flex flex-col gap-2">
                      <p className="text-sm text-warm-amber font-medium flex items-center gap-1">
                        <span className="material-symbols-outlined text-sm">warning</span>
                        এই কলামে ইতোমধ্যে ডেটা আছে। মুছলে সব প্রগ্রেস হারিয়ে যাবে।
                      </p>
                      <div className="flex justify-end gap-2">
                        <button 
                          type="button"
                          onClick={() => setPendingRemoval(null)}
                          className="px-3 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded-full"
                        >
                          বাতিল
                        </button>
                        <button 
                          type="button"
                          onClick={() => performRemoval("chapter", index)}
                          className="px-3 py-1 text-xs font-medium text-error-red hover:bg-red-100 rounded-full"
                        >
                          তবুও মুছুন
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
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
                <div key={index} className="flex flex-col gap-2">
                  <div className="flex gap-3 items-center">
                    <input 
                      type="text" 
                      placeholder="লেবেল"
                      required
                      value={tracker.label}
                      onChange={(e) => updateTracker("concept", index, "label", e.target.value)}
                      className="flex-1 px-4 py-2 border border-border-medium rounded-full focus:outline-none focus:border-brand-green"
                    />
                    <input 
                      type="number" 
                      placeholder="মিনিট"
                      required
                      value={tracker.avgMinutes}
                      onChange={(e) => updateTracker("concept", index, "avgMinutes", parseInt(e.target.value) || 0)}
                      className="w-24 px-4 py-2 border border-border-medium rounded-full focus:outline-none focus:border-brand-green text-center"
                    />
                    <button 
                      type="button" 
                      disabled={isCheckingRemoval}
                      onClick={() => initiateRemoval("concept", index)}
                      className="p-2 text-error-red hover:bg-red-50 rounded-full transition-colors disabled:opacity-50"
                    >
                      <span className="material-symbols-outlined">delete</span>
                    </button>
                  </div>
                  {pendingRemoval?.type === "concept" && pendingRemoval?.index === index && (
                    <div className="bg-amber-50 border border-warm-amber/20 p-3 rounded-2xl flex flex-col gap-2">
                      <p className="text-sm text-warm-amber font-medium flex items-center gap-1">
                        <span className="material-symbols-outlined text-sm">warning</span>
                        এই কলামে ইতোমধ্যে ডেটা আছে। মুছলে সব প্রগ্রেস হারিয়ে যাবে।
                      </p>
                      <div className="flex justify-end gap-2">
                        <button 
                          type="button"
                          onClick={() => setPendingRemoval(null)}
                          className="px-3 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded-full"
                        >
                          বাতিল
                        </button>
                        <button 
                          type="button"
                          onClick={() => performRemoval("concept", index)}
                          className="px-3 py-1 text-xs font-medium text-error-red hover:bg-red-100 rounded-full"
                        >
                          তবুও মুছুন
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
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
              {isSubmitting ? "আপডেট হচ্ছে..." : "পরিবর্তন সংরক্ষণ করুন"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

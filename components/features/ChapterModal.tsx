"use client";

import React, { useState, useEffect } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";

type ChapterModalProps = {
  isOpen: boolean;
  onClose: () => void;
  subjectId: Id<"subjects">;
  suggestedOrder?: number;
  initialData?: {
    _id: Id<"chapters">;
    name: string;
    slug: string;
    order: number;
    inNextTerm: boolean;
    priorityBoost?: number;
  };
};

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim();
}

export default function ChapterModal({ isOpen, onClose, subjectId, suggestedOrder, initialData }: ChapterModalProps) {
  const createChapter = useMutation(api.mutations.createChapter);
  const updateChapter = useMutation(api.mutations.updateChapter);
  
  const [name, setName] = useState("");
  const [order, setOrder] = useState<number>(0);
  const [inNextTerm, setInNextTerm] = useState(false);
  const [priorityBoost, setPriorityBoost] = useState<number>(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (initialData) {
      setName(initialData.name);
      setOrder(initialData.order);
      setInNextTerm(initialData.inNextTerm);
      setPriorityBoost(initialData.priorityBoost || 0);
    } else {
      setName("");
      setOrder(suggestedOrder || 1);
      setInNextTerm(false);
      setPriorityBoost(0);
    }
  }, [initialData, isOpen, suggestedOrder]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      if (initialData) {
        await updateChapter({
          chapterId: initialData._id,
          name,
          slug: slugify(name),
          order,
          inNextTerm,
          priorityBoost: priorityBoost || undefined,
        });
      } else {
        await createChapter({
          subjectId,
          name,
          slug: slugify(name),
          order,
          inNextTerm,
          priorityBoost: priorityBoost || undefined,
        });
      }
      onClose();
    } catch (error) {
      console.error("Failed to save chapter:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-pure-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="flex justify-between items-center p-6 border-b border-border-subtle">
          <h2 className="font-card-title text-card-title text-on-surface">
            {initialData ? "অধ্যায় পরিবর্তন" : "নতুন অধ্যায় যোগ"}
          </h2>
          <button 
            onClick={onClose}
            className="text-gray-400 hover:text-on-surface transition-colors p-1 rounded-lg hover:bg-gray-100"
          >
            <span className="material-symbols-outlined text-xl">close</span>
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-5">
          <div>
            <label className="block font-label-uppercase text-label-uppercase text-gray-500 mb-2">অধ্যায়ের নাম (বাংলা)</label>
            <input 
              type="text" 
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-2.5 border border-border-medium rounded-full focus:outline-none focus:border-brand-green bg-gray-50/50 transition-all font-body text-body"
              placeholder="যেমন: অধ্যায় ১: ল্যাবরেটরির নিরাপদ ব্যবহার"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block font-label-uppercase text-label-uppercase text-gray-500 mb-2">ক্রম (Order)</label>
              <input 
                type="number" 
                required
                value={order}
                onChange={(e) => setOrder(Number(e.target.value))}
                className="w-full px-4 py-2.5 border border-border-medium rounded-full focus:outline-none focus:border-brand-green bg-gray-50/50 transition-all font-mono-code text-mono-code"
              />
            </div>
            <div>
              <label className="block font-label-uppercase text-label-uppercase text-gray-500 mb-2">বুস্ট (Priority)</label>
              <input 
                type="number" 
                value={priorityBoost}
                onChange={(e) => setPriorityBoost(Number(e.target.value))}
                className="w-full px-4 py-2.5 border border-border-medium rounded-full focus:outline-none focus:border-brand-green bg-gray-50/50 transition-all font-mono-code text-mono-code"
                placeholder="0"
              />
            </div>
          </div>

          <div className="flex items-center gap-3 py-1">
            <div className="checkbox-wrapper-46 scale-75 origin-left">
              <input 
                className="inp-cbx" 
                id="inNextTermCbx" 
                type="checkbox" 
                checked={inNextTerm}
                onChange={(e) => setInNextTerm(e.target.checked)}
              />
              <label className="cbx" htmlFor="inNextTermCbx">
                <span>
                  <svg width="12px" height="10px" viewBox="0 0 12 10">
                    <polyline points="1.5 6 4.5 9 10.5 1"></polyline>
                  </svg>
                </span>
              </label>
            </div>
            <label htmlFor="inNextTermCbx" className="text-sm text-gray-600 font-body cursor-pointer">পরবর্তী পরীক্ষার সিলেবাসে অন্তর্ভুক্ত?</label>
          </div>

          <div className="flex justify-end gap-3 mt-4">
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
              className="px-8 py-2.5 rounded-full font-label-uppercase text-label-uppercase text-pure-white bg-on-surface hover:bg-brand-green transition-all shadow-sm hover:shadow-md disabled:opacity-50"
            >
              {isSubmitting ? "সংরক্ষণ হচ্ছে..." : (initialData ? "আপডেট করুন" : "অধ্যায় যোগ")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

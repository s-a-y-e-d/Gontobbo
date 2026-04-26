"use client";

import React, { useState, useEffect } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";

type ConceptModalProps = {
  isOpen: boolean;
  onClose: () => void;
  chapterId: Id<"chapters">;
  suggestedOrder?: number;
  initialData?: {
    _id: Id<"concepts">;
    name: string;
    order: number;
    difficulty?: number;
  };
};

export default function ConceptModal({ isOpen, onClose, chapterId, suggestedOrder, initialData }: ConceptModalProps) {
  const createConcept = useMutation(api.mutations.createConcept);
  const updateConcept = useMutation(api.mutations.updateConcept);
  
  const [name, setName] = useState("");
  const [order, setOrder] = useState<number>(0);
  const [difficulty, setDifficulty] = useState<number>(1);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (initialData) {
      setName(initialData.name);
      setOrder(initialData.order);
      setDifficulty(initialData.difficulty || 1);
    } else {
      setName("");
      setOrder(suggestedOrder || 1);
      setDifficulty(1);
    }
  }, [initialData, isOpen, suggestedOrder]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      if (initialData) {
        await updateConcept({
          conceptId: initialData._id,
          name,
          order,
          difficulty: difficulty || undefined,
        });
      } else {
        await createConcept({
          chapterId,
          name,
          order,
          difficulty: difficulty || undefined,
        });
      }
      onClose();
    } catch (error) {
      console.error("Failed to save concept:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-pure-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="flex justify-between items-center p-6 border-b border-border-subtle">
          <h2 className="font-card-title text-card-title text-on-surface">
            {initialData ? "কনসেপ্ট এডিট" : "নতুন কনসেপ্ট যোগ"}
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
            <label className="block font-label-uppercase text-label-uppercase text-gray-500 mb-2">কনসেপ্টের নাম (বাংলা)</label>
            <input 
              type="text" 
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-2.5 border border-border-medium rounded-full focus:outline-none focus:border-brand-green bg-gray-50/50 transition-all font-body text-body"
              placeholder="যেমন: পরমাণু মডেল"
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
              <label className="block font-label-uppercase text-label-uppercase text-gray-500 mb-2">কঠিন্য (Difficulty)</label>
              <select
                value={difficulty}
                onChange={(e) => setDifficulty(Number(e.target.value))}
                className="w-full px-4 py-2.5 border border-border-medium rounded-full focus:outline-none focus:border-brand-green bg-gray-50/50 transition-all font-body text-body"
              >
                <option value={1}>১ - সহজ</option>
                <option value={2}>২ - সাধারণ</option>
                <option value={3}>৩ - মাঝারি</option>
                <option value={4}>৪ - কঠিন</option>
                <option value={5}>৫ - খুব কঠিন</option>
              </select>
            </div>
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
              {isSubmitting ? "সংরক্ষণ হচ্ছে..." : (initialData ? "আপডেট করুন" : "কনসেপ্ট যোগ")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

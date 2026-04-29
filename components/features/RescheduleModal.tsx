"use client";

import React, { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";

type RescheduleModalProps = {
  isOpen: boolean;
  onClose: () => void;
  concept: {
    _id: Id<"concepts">;
    name: string;
    nextReviewAt?: number;
  };
};

function getDateInputValue(timestamp?: number) {
  if (!timestamp) return "";

  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default function RescheduleModal({ isOpen, onClose, concept }: RescheduleModalProps) {
  const [selectedDate, setSelectedDate] = useState(() =>
    getDateInputValue(concept.nextReviewAt)
  );
  const reschedule = useMutation(api.mutations.rescheduleConceptReview);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDate) return;

    // Convert local date string to Dhaka timestamp
    const [year, month, day] = selectedDate.split("-").map(Number);
    
    // Dhaka is UTC+6
    const dhakaOffset = 6 * 60 * 60 * 1000;
    const date = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
    const timestamp = date.getTime() - dhakaOffset;

    await reschedule({
      conceptId: concept._id,
      newNextReviewAt: timestamp,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <div 
        className="absolute inset-0 bg-near-black/20 backdrop-blur-sm animate-in fade-in duration-300" 
        onClick={onClose}
      />
      
      <div className="relative w-full max-w-sm bg-pure-white rounded-[32px] shadow-[0_20px_50px_rgba(0,0,0,0.1)] p-8 animate-in zoom-in-95 slide-in-from-bottom-4 duration-300">
        <div className="flex justify-between items-start mb-6">
          <div>
            <h2 className="text-xl font-sub-heading text-on-surface mb-1">তারিখ পরিবর্তন</h2>
            <p className="text-xs font-mono-code text-gray-400 uppercase tracking-wider">{concept.name}</p>
          </div>
          <button 
            onClick={onClose}
            className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
          >
            <span className="material-symbols-outlined text-gray-400">close</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-xs font-mono-code text-gray-500 uppercase mb-2 px-1">নতুন তারিখ নির্বাচন করুন</label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full bg-surface-container border-2 border-transparent focus:border-brand-green outline-none rounded-2xl px-4 py-3 text-on-surface transition-all font-body"
              required
            />
          </div>

          <button
            type="submit"
            className="w-full py-4 bg-on-surface text-pure-white rounded-full font-label-uppercase text-sm hover:bg-brand-green transition-all shadow-md active:scale-[0.98]"
          >
            পরিবর্তন নিশ্চিত করি
          </button>
        </form>
      </div>
    </div>
  );
}

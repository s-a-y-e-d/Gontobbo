"use client";

import React, { useState, useEffect } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";

type ConceptReviewModalProps = {
  isOpen: boolean;
  onClose: () => void;
  concept: {
    _id: Id<"concepts">;
    name: string;
    reviewCount?: number;
    nextReviewAt?: number;
  };
};

export default function ConceptReviewModal({ isOpen, onClose, concept }: ConceptReviewModalProps) {
  const [rating, setRating] = useState<"hard" | "medium" | "easy" | null>(null);
  const review = useMutation(api.mutations.reviewConcept);

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

  const handleSubmit = async () => {
    if (!rating) return;
    await review({ conceptId: concept._id, rating });
    onClose();
    setRating(null);
  };

  const formatDate = (ts?: number) => {
    if (!ts) return "নির্ধারিত নয়";
    return new Date(ts).toLocaleDateString("bn-BD", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-near-black/20 backdrop-blur-sm animate-in fade-in duration-300" 
        onClick={onClose}
      />
      
      {/* Modal Content */}
      <div className="relative w-full max-w-md bg-pure-white rounded-[32px] shadow-[0_20px_50px_rgba(0,0,0,0.1)] p-8 animate-in zoom-in-95 slide-in-from-bottom-4 duration-300">
        <div className="flex justify-between items-start mb-6">
          <div>
            <h2 className="text-xl font-sub-heading text-on-surface mb-1">{concept.name}</h2>
            <p className="text-xs font-mono-code text-gray-400 uppercase tracking-wider">রিভিশন সেশন</p>
          </div>
          <button 
            onClick={onClose}
            className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
          >
            <span className="material-symbols-outlined text-gray-400">close</span>
          </button>
        </div>

        {/* Stats */}
        <div className="flex gap-4 mb-8">
          <div className="flex-1 bg-surface-container rounded-2xl p-4 text-center">
            <p className="text-[10px] font-mono-code text-gray-500 uppercase mb-1">মোট রিভিশন</p>
            <p className="text-lg font-semibold text-on-surface">{concept.reviewCount || 0}</p>
          </div>
          <div className="flex-1 bg-surface-container rounded-2xl p-4 text-center">
            <p className="text-[10px] font-mono-code text-gray-500 uppercase mb-1">পরবর্তী রিভিশন</p>
            <p className="text-sm font-medium text-on-surface">{formatDate(concept.nextReviewAt)}</p>
          </div>
        </div>

        {/* Rating Step */}
        <div className="space-y-3 mb-8">
          <p className="text-sm font-body text-gray-500 mb-4 px-1">আপনার রিভিশন কেমন ছিল?</p>
          
          <RatingCard 
            label="কঠিন" 
            subLabel="আবার দ্রুত দেখতে হবে"
            icon="sentiment_very_dissatisfied"
            color="text-error-red"
            isSelected={rating === "hard"}
            onClick={() => setRating("hard")}
          />
          <RatingCard 
            label="মোটামুটি" 
            subLabel="কিছু জিনিস ভুলে গেছি"
            icon="sentiment_neutral"
            color="text-warm-amber"
            isSelected={rating === "medium"}
            onClick={() => setRating("medium")}
          />
          <RatingCard 
            label="সহজ" 
            subLabel="সব পরিষ্কার মনে আছে"
            icon="sentiment_very_satisfied"
            color="text-brand-green-deep"
            isSelected={rating === "easy"}
            onClick={() => setRating("easy")}
          />
        </div>

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={!rating}
          className={`w-full py-4 rounded-full font-label-uppercase text-sm transition-all shadow-md ${
            rating 
              ? "bg-on-surface text-pure-white hover:bg-brand-green hover:shadow-lg active:scale-[0.98]" 
              : "bg-gray-100 text-gray-400 cursor-not-allowed shadow-none"
          }`}
        >
          আজকের রিভিশন সম্পন্ন
        </button>
      </div>
    </div>
  );
}

function RatingCard({ label, subLabel, icon, color, isSelected, onClick }: {
  label: string;
  subLabel: string;
  icon: string;
  color: string;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-4 p-4 rounded-2xl border-2 transition-all text-left group ${
        isSelected 
          ? "border-brand-green bg-green-50/30" 
          : "border-border-subtle hover:border-border-medium bg-transparent"
      }`}
    >
      <span className={`material-symbols-outlined text-3xl ${color} transition-transform group-hover:scale-110`}>
        {icon}
      </span>
      <div>
        <p className="text-sm font-semibold text-on-surface">{label}</p>
        <p className="text-[11px] text-gray-500">{subLabel}</p>
      </div>
      {isSelected && (
        <span className="material-symbols-outlined ml-auto text-brand-green">check_circle</span>
      )}
    </button>
  );
}

"use client";

import React from "react";
import CircularProgress from "./CircularProgress";

type SubjectHeaderProps = {
  name: string;
  progressPercentage: number;
};

export default function SubjectHeader({ name, progressPercentage }: SubjectHeaderProps) {
  return (
    <div className="bg-pure-white border border-border-subtle rounded-3xl p-8 mb-10 flex items-center justify-between shadow-[0_2px_8px_rgba(0,0,0,0.02)]">
      <h1 className="font-section-heading text-section-heading text-on-surface">
        {name}
      </h1>
      <div className="flex items-center gap-3">
        <CircularProgress percentage={progressPercentage} size={60} strokeWidth={5} />
        <div className="flex flex-col">
          <span className="font-mono-code text-mono-code text-gray-500 uppercase">
            সম্পন্ন
          </span>
          <span className="font-card-title text-card-title text-on-surface">
            {progressPercentage}%
          </span>
        </div>
      </div>
    </div>
  );
}

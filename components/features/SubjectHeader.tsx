"use client";

import React from "react";
import CircularProgress from "./CircularProgress";

type SubjectHeaderProps = {
  name: string;
  progressPercentage: number;
};

export default function SubjectHeader({ name, progressPercentage }: SubjectHeaderProps) {
  return (
    <div className="bg-pure-white border border-border-subtle rounded-[28px] p-5 mb-6 flex flex-col gap-5 shadow-[0_2px_8px_rgba(0,0,0,0.02)] sm:p-6 md:mb-10 md:flex-row md:items-center md:justify-between md:rounded-3xl md:p-8">
      <h1 className="font-section-heading text-[30px] leading-[1.12] font-bold text-on-surface break-words sm:text-[34px] md:text-section-heading">
        {name}
      </h1>
      <div className="flex items-center gap-3 rounded-2xl border border-brand-green/20 bg-brand-green-light/60 p-3 dark:border-brand-green/20 dark:bg-brand-green/10 md:border-0 md:bg-transparent md:p-0 md:dark:bg-transparent">
        <CircularProgress percentage={progressPercentage} size={56} strokeWidth={5} />
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

import React from "react";

export type SubjectStats = {
  totalChapters: number;
  completedChapters: number;
  tasksPending: number;
  progressPercentage: number;
};

export type SubjectCardProps = {
  _id: string;
  name: string;
  description: string;
  icon: string;
  colorTheme: string;
  stats?: SubjectStats;
};

const themeMap: Record<string, {
  iconBg: string;
  iconColor: string;
  progressBadgeBg: string;
  progressBadgeText: string;
  progressBarBg: string;
}> = {
  green: {
    iconBg: "bg-brand-green-light",
    iconColor: "text-brand-green-deep",
    progressBadgeBg: "bg-brand-green-light",
    progressBadgeText: "text-brand-green-deep",
    progressBarBg: "bg-brand-green",
  },
  red: {
    iconBg: "bg-[#fef2f2]",
    iconColor: "text-[#dc2626]",
    progressBadgeBg: "bg-[#fee2e2]",
    progressBadgeText: "text-[#991b1b]",
    progressBarBg: "bg-[#ef4444]",
  },
  blue: {
    iconBg: "bg-[#eff6ff]",
    iconColor: "text-[#2563eb]",
    progressBadgeBg: "bg-[#dbeafe]",
    progressBadgeText: "text-[#1e40af]",
    progressBarBg: "bg-[#3b82f6]",
  },
  gray: {
    iconBg: "bg-surface-container",
    iconColor: "text-gray-500",
    progressBadgeBg: "bg-gray-100",
    progressBadgeText: "text-gray-600",
    progressBarBg: "bg-gray-300",
  },
};

export default function SubjectCard({
  name,
  description,
  icon,
  colorTheme,
  stats,
}: SubjectCardProps) {
  const theme = themeMap[colorTheme] || themeMap.gray;
  
  // Default stats if not loaded yet
  const displayStats = stats || {
    totalChapters: 0,
    completedChapters: 0,
    tasksPending: 0,
    progressPercentage: 0,
  };

  return (
    <div className="bg-pure-white border border-border-subtle rounded-[24px] p-card-padding flex flex-col gap-6 shadow-[0_4px_24px_rgba(0,0,0,0.02)] transition-colors hover:border-border-medium">
      <div className="flex justify-between items-start">
        <div className="flex items-center gap-4">
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${theme.iconBg}`}>
            <span className={`material-symbols-outlined ${theme.iconColor}`}>{icon}</span>
          </div>
          <div>
            <h2 className="font-card-title text-card-title text-on-surface">{name}</h2>
            <p className="font-mono-code text-mono-code text-gray-400">{description}</p>
          </div>
        </div>
        <button className="text-gray-400 hover:text-on-surface transition-colors">
          <span className="material-symbols-outlined">more_horiz</span>
        </button>
      </div>
      
      <div className="grid grid-cols-2 gap-4 py-4 border-y border-border-subtle">
        <div className="flex flex-col gap-1">
          <span className="font-mono-code text-mono-code text-gray-500">CHAPTERS</span>
          <span className="font-sub-heading text-sub-heading text-on-surface">
            {displayStats.completedChapters}
            <span className="text-sm text-gray-400 font-normal">/{displayStats.totalChapters}</span>
          </span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="font-mono-code text-mono-code text-gray-500">TASKS PENDING</span>
          <span className="font-sub-heading text-sub-heading text-on-surface">{displayStats.tasksPending}</span>
        </div>
      </div>
      
      <div className="flex flex-col gap-2">
        <div className="flex justify-between items-center">
          <span className="font-label-uppercase text-label-uppercase text-on-surface">Overall Progress</span>
          <span className={`font-mono-code text-mono-code px-2 py-0.5 rounded-full ${theme.progressBadgeBg} ${theme.progressBadgeText}`}>
            {displayStats.progressPercentage}%
          </span>
        </div>
        <div className="w-full bg-surface-container h-2 rounded-full overflow-hidden">
          <div 
            className={`h-full rounded-full ${theme.progressBarBg}`} 
            style={{ width: `${displayStats.progressPercentage}%` }}
          ></div>
        </div>
      </div>
    </div>
  );
}

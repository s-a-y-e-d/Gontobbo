"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Id } from "@/convex/_generated/dataModel";
import EditSubjectModal from "./EditSubjectModal";

export type SubjectStats = {
  totalChapters: number;
  completedChapters: number;
  tasksPending: number;
  progressPercentage: number;
};

export type SubjectCardProps = {
  _id: Id<"subjects">;
  name: string;
  slug: string;
  icon?: string;
  color?: string;
  chapterTrackers: { key: string; label: string; avgMinutes: number }[];
  conceptTrackers: { key: string; label: string; avgMinutes: number }[];
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
  amber: {
    iconBg: "bg-orange-50",
    iconColor: "text-orange-600",
    progressBadgeBg: "bg-orange-100",
    progressBadgeText: "text-orange-700",
    progressBarBg: "bg-orange-500",
  },
  purple: {
    iconBg: "bg-purple-50",
    iconColor: "text-purple-600",
    progressBadgeBg: "bg-purple-100",
    progressBadgeText: "text-purple-700",
    progressBarBg: "bg-purple-500",
  },
  teal: {
    iconBg: "bg-teal-50",
    iconColor: "text-teal-600",
    progressBadgeBg: "bg-teal-100",
    progressBadgeText: "text-teal-700",
    progressBarBg: "bg-teal-500",
  },
  indigo: {
    iconBg: "bg-indigo-50",
    iconColor: "text-indigo-600",
    progressBadgeBg: "bg-indigo-100",
    progressBadgeText: "text-indigo-700",
    progressBarBg: "bg-indigo-500",
  },
  pink: {
    iconBg: "bg-pink-50",
    iconColor: "text-pink-600",
    progressBadgeBg: "bg-pink-100",
    progressBadgeText: "text-pink-700",
    progressBarBg: "bg-pink-500",
  },
};

export default function SubjectCard(props: SubjectCardProps) {
  const {
    _id,
    name,
    slug,
    icon,
    color,
    chapterTrackers,
    conceptTrackers,
    stats,
  } = props;
  
  const router = useRouter();
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const theme = themeMap[color || "gray"] || themeMap.gray;

  // Default stats if not loaded yet
  const displayStats = stats || {
    totalChapters: 0,
    completedChapters: 0,
    tasksPending: 0,
    progressPercentage: 0,
  };

  return (
    <>
      <div
        onClick={() => router.push(`/subjects/${slug}`)}
        className="group bg-pure-white border border-border-subtle rounded-2xl p-card-padding flex flex-col gap-6 shadow-[0_4px_24px_rgba(0,0,0,0.02)] transition-all hover:border-border-medium hover:shadow-[0_8px_30px_rgba(0,0,0,0.04)] cursor-pointer active:scale-[0.99]"
      >
        <div className="flex justify-between items-start">
          <div className="flex items-center gap-4">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${theme.iconBg}`}>
              <span className={`material-symbols-outlined ${theme.iconColor}`}>{icon || "book"}</span>
            </div>
            <div>
              <h2 className="font-card-title text-card-title text-on-surface">{name}</h2>
              <p className="font-mono-code text-mono-code text-gray-400">
                {displayStats.totalChapters} অধ্যায়
              </p>
            </div>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsEditModalOpen(true);
            }}
            className="text-gray-400 hover:text-on-surface transition-colors p-2 hover:bg-gray-50 rounded-full"
          >
            <span className="material-symbols-outlined">more_horiz</span>
          </button>
        </div>

        <div className="grid grid-cols-2 gap-4 py-4 border-y border-border-subtle">
          <div className="flex flex-col gap-1">
            <span className="font-mono-code text-mono-code text-gray-500 uppercase">Chapters</span>
            <span className="font-sub-heading text-sub-heading text-on-surface">
              {displayStats.completedChapters}
              <span className="text-sm text-gray-400 font-normal">/{displayStats.totalChapters}</span>
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="font-mono-code text-mono-code text-gray-500 uppercase">Tasks Pending</span>
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
              className={`h-full rounded-full transition-all duration-500 ${theme.progressBarBg}`}
              style={{ width: `${displayStats.progressPercentage}%` }}
            ></div>
          </div>
        </div>
      </div>

      <EditSubjectModal 
        key={_id}
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        subject={{
            _id,
            name,
            icon,
            color,
            chapterTrackers,
            conceptTrackers,
            slug // Pass slug
        }}
      />
    </>
  );
}

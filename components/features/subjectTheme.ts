export type SubjectTheme = {
  accentHex: string;
  iconBg: string;
  iconColor: string;
  progressBadgeBg: string;
  progressBadgeText: string;
  progressBarBg: string;
};

const subjectThemeMap: Record<string, SubjectTheme> = {
  green: {
    accentHex: "#18E299",
    iconBg: "bg-brand-green-light",
    iconColor: "text-brand-green-deep",
    progressBadgeBg: "bg-brand-green-light",
    progressBadgeText: "text-brand-green-deep",
    progressBarBg: "bg-brand-green",
  },
  red: {
    accentHex: "#ef4444",
    iconBg: "bg-[#fef2f2]",
    iconColor: "text-[#dc2626]",
    progressBadgeBg: "bg-[#fee2e2]",
    progressBadgeText: "text-[#991b1b]",
    progressBarBg: "bg-[#ef4444]",
  },
  blue: {
    accentHex: "#3b82f6",
    iconBg: "bg-[#eff6ff]",
    iconColor: "text-[#2563eb]",
    progressBadgeBg: "bg-[#dbeafe]",
    progressBadgeText: "text-[#1e40af]",
    progressBarBg: "bg-[#3b82f6]",
  },
  gray: {
    accentHex: "#888888",
    iconBg: "bg-surface-container",
    iconColor: "text-gray-500",
    progressBadgeBg: "bg-gray-100",
    progressBadgeText: "text-gray-600",
    progressBarBg: "bg-gray-300",
  },
  amber: {
    accentHex: "#f59e0b",
    iconBg: "bg-orange-50",
    iconColor: "text-orange-600",
    progressBadgeBg: "bg-orange-100",
    progressBadgeText: "text-orange-700",
    progressBarBg: "bg-orange-500",
  },
  purple: {
    accentHex: "#a855f7",
    iconBg: "bg-purple-50",
    iconColor: "text-purple-600",
    progressBadgeBg: "bg-purple-100",
    progressBadgeText: "text-purple-700",
    progressBarBg: "bg-purple-500",
  },
  teal: {
    accentHex: "#14b8a6",
    iconBg: "bg-teal-50",
    iconColor: "text-teal-600",
    progressBadgeBg: "bg-teal-100",
    progressBadgeText: "text-teal-700",
    progressBarBg: "bg-teal-500",
  },
  indigo: {
    accentHex: "#6366f1",
    iconBg: "bg-indigo-50",
    iconColor: "text-indigo-600",
    progressBadgeBg: "bg-indigo-100",
    progressBadgeText: "text-indigo-700",
    progressBarBg: "bg-indigo-500",
  },
  pink: {
    accentHex: "#ec4899",
    iconBg: "bg-pink-50",
    iconColor: "text-pink-600",
    progressBadgeBg: "bg-pink-100",
    progressBadgeText: "text-pink-700",
    progressBarBg: "bg-pink-500",
  },
};

export function getSubjectTheme(color?: string): SubjectTheme {
  return subjectThemeMap[color ?? "gray"] ?? subjectThemeMap.gray;
}

export const REVISION_INTERVAL_SETTING_KEYS = [
  "revisionIntervalLevel0Days",
  "revisionIntervalLevel1Days",
  "revisionIntervalLevel2Days",
  "revisionIntervalLevel3Days",
  "revisionIntervalLevel4Days",
  "revisionIntervalLevel5Days",
] as const;

export const REVISION_RATING_SETTING_KEYS = {
  hard: "revisionHardLevelChange",
  medium: "revisionMediumLevelChange",
  easy: "revisionEasyLevelChange",
} as const;

export const DEFAULT_REVISION_INTERVAL_DAYS = [1, 3, 7, 14, 30, 60] as const;
export const DEFAULT_REVISION_RATING_LEVEL_CHANGES = {
  hard: -1,
  medium: 1,
  easy: 2,
} as const;
export const REVISION_LEVEL_COUNT = DEFAULT_REVISION_INTERVAL_DAYS.length;
export const MIN_REVISION_INTERVAL_DAYS = 1;
export const MAX_REVISION_INTERVAL_DAYS = 3650;
export const MIN_REVISION_RATING_LEVEL_CHANGE = -5;
export const MAX_REVISION_RATING_LEVEL_CHANGE = 5;

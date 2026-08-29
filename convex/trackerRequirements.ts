import type { Doc } from "./_generated/dataModel";

export type TrackerLevel = "chapter" | "concept";

type TrackerConfig = {
  key: string;
  label: string;
  avgMinutes: number;
  isOptional?: boolean;
};

type SubjectTrackerConfig = Pick<
  Doc<"subjects">,
  "chapterTrackers" | "conceptTrackers"
>;

type StudyItemTrackerFields = Pick<
  Doc<"studyItems">,
  "type" | "conceptId" | "isCompleted"
>;

/** Return the config list that applies to a chapter- or concept-level item. */
export function getTrackersForLevel(
  subject: SubjectTrackerConfig,
  level: TrackerLevel,
): readonly TrackerConfig[] {
  return level === "concept" ? subject.conceptTrackers : subject.chapterTrackers;
}

/**
 * A missing tracker is intentionally not required progress. This covers old
 * orphaned items and keeps tracker removal safe until their item is deleted.
 */
export function isRequiredTracker(
  subject: SubjectTrackerConfig,
  level: TrackerLevel,
  trackerKey: string,
) {
  const tracker = getTrackersForLevel(subject, level).find(
    (candidate) => candidate.key === trackerKey,
  );
  return tracker !== undefined && tracker.isOptional !== true;
}

export function isStudyItemRequired(
  subject: SubjectTrackerConfig,
  item: StudyItemTrackerFields,
) {
  return isRequiredTracker(
    subject,
    item.conceptId === undefined ? "chapter" : "concept",
    item.type,
  );
}

export function getRequiredTrackerKeys(
  subject: SubjectTrackerConfig,
  level: TrackerLevel,
) {
  return new Set(
    getTrackersForLevel(subject, level)
      .filter((tracker) => tracker.isOptional !== true)
      .map((tracker) => tracker.key),
  );
}

export function hasRequiredTrackers(
  subject: SubjectTrackerConfig,
  level: TrackerLevel,
) {
  return getTrackersForLevel(subject, level).some(
    (tracker) => tracker.isOptional !== true,
  );
}

/** Whether this subject has any tracker whose completion is optional. */
export function hasOptionalTrackers(subject: SubjectTrackerConfig) {
  return (
    subject.chapterTrackers.some((tracker) => tracker.isOptional === true) ||
    subject.conceptTrackers.some((tracker) => tracker.isOptional === true)
  );
}

export function summarizeRequiredStudyItems(
  subject: SubjectTrackerConfig,
  items: readonly StudyItemTrackerFields[],
) {
  let total = 0;
  let completed = 0;

  for (const item of items) {
    if (!isStudyItemRequired(subject, item)) {
      continue;
    }
    total += 1;
    if (item.isCompleted) {
      completed += 1;
    }
  }

  return { total, completed };
}

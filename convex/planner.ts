import type { Doc, Id } from "./_generated/dataModel";

export const PLANNER_SUGGESTION_KIND = {
  studyItem: "study_item",
  conceptReview: "concept_review",
} as const;

export type PlannerSuggestionKind =
  (typeof PLANNER_SUGGESTION_KIND)[keyof typeof PLANNER_SUGGESTION_KIND];

export type PlannerCommentSignals = {
  preferredSubjectIds: Id<"subjects">[];
  examChapterIds: Id<"chapters">[];
  rawComment: string;
};

export type PlannerCommentParserContext = {
  comment: string;
  subjects: Array<Pick<Doc<"subjects">, "_id" | "name" | "slug">>;
  chapters: Array<Pick<Doc<"chapters">, "_id" | "name" | "slug">>;
};

export interface PlannerCommentParser {
  parse(context: PlannerCommentParserContext): PlannerCommentSignals;
}

function normalizeText(value: string) {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function matchesName(haystack: string, candidates: string[]) {
  return candidates.some((candidate) => {
    const normalizedCandidate = normalizeText(candidate);
    return normalizedCandidate.length > 0 && haystack.includes(normalizedCandidate);
  });
}

const EXAM_HINTS = [
  "exam",
  "test",
  "quiz",
  "model test",
  "পরীক্ষা",
  "টেস্ট",
  "এক্সাম",
];

export const ruleBasedPlannerCommentParser: PlannerCommentParser = {
  parse(context) {
    const normalizedComment = normalizeText(context.comment);
    if (normalizedComment.length === 0) {
      return {
        preferredSubjectIds: [],
        examChapterIds: [],
        rawComment: context.comment.trim(),
      };
    }

    const preferredSubjectIds = context.subjects
      .filter((subject) =>
        matchesName(normalizedComment, [subject.name, subject.slug]),
      )
      .map((subject) => subject._id);

    const hasExamSignal = EXAM_HINTS.some((hint) =>
      normalizedComment.includes(normalizeText(hint)),
    );

    const examChapterIds = hasExamSignal
      ? context.chapters
          .filter((chapter) =>
            matchesName(normalizedComment, [chapter.name, chapter.slug]),
          )
          .map((chapter) => chapter._id)
      : [];

    return {
      preferredSubjectIds,
      examChapterIds,
      rawComment: context.comment.trim(),
    };
  },
};

export type PlannerCandidate = {
  identity: string;
  kind: PlannerSuggestionKind;
  studyItemId?: Id<"studyItems">;
  conceptId?: Id<"concepts">;
  conceptGroupKey?: string;
  title: string;
  subjectId: Id<"subjects">;
  subjectName: string;
  subjectColor?: string;
  chapterId: Id<"chapters">;
  chapterName: string;
  conceptName?: string;
  durationMinutes: number;
  chapterOrder: number;
  conceptOrder?: number;
  trackerOrder: number;
  score: number;
  isRevision: boolean;
  isPreferredSubject: boolean;
  isExamMatch: boolean;
};

export function buildPlannerCandidateIdentity(candidate: {
  kind: PlannerSuggestionKind;
  studyItemId?: Id<"studyItems">;
  conceptId?: Id<"concepts">;
}) {
  if (candidate.kind === PLANNER_SUGGESTION_KIND.studyItem && candidate.studyItemId) {
    return `study_item:${candidate.studyItemId}`;
  }

  if (
    candidate.kind === PLANNER_SUGGESTION_KIND.conceptReview &&
    candidate.conceptId
  ) {
    return `concept_review:${candidate.conceptId}`;
  }

  return `${candidate.kind}:unknown`;
}

function compareCandidates(
  a: PlannerCandidate,
  b: PlannerCandidate,
  preferFewerTasks: boolean,
) {
  if (a.score !== b.score) {
    return b.score - a.score;
  }

  if (a.isRevision !== b.isRevision) {
    return a.isRevision ? -1 : 1;
  }

  if (a.isExamMatch !== b.isExamMatch) {
    return a.isExamMatch ? -1 : 1;
  }

  if (a.isPreferredSubject !== b.isPreferredSubject) {
    return a.isPreferredSubject ? -1 : 1;
  }

  if (a.chapterOrder !== b.chapterOrder) {
    return a.chapterOrder - b.chapterOrder;
  }

  const aConceptOrder = a.conceptOrder ?? Number.MAX_SAFE_INTEGER;
  const bConceptOrder = b.conceptOrder ?? Number.MAX_SAFE_INTEGER;
  if (aConceptOrder !== bConceptOrder) {
    return aConceptOrder - bConceptOrder;
  }

  if (a.trackerOrder !== b.trackerOrder) {
    return a.trackerOrder - b.trackerOrder;
  }

  if (a.durationMinutes !== b.durationMinutes) {
    return preferFewerTasks
      ? b.durationMinutes - a.durationMinutes
      : a.durationMinutes - b.durationMinutes;
  }

  return a.title.localeCompare(b.title);
}

function pickCandidates(options: {
  candidates: PlannerCandidate[];
  selectedIdentities: Set<string>;
  budgetMinutes: number;
  predicate?: (candidate: PlannerCandidate) => boolean;
  preferFewerTasks: boolean;
}) {
  const ordered = [...options.candidates].sort((a, b) =>
    compareCandidates(a, b, options.preferFewerTasks),
  );
  const chosen: PlannerCandidate[] = [];
  const consideredGroups = new Set<string>();
  let spentMinutes = 0;

  for (const candidate of ordered) {
    if (options.selectedIdentities.has(candidate.identity)) {
      continue;
    }

    if (options.predicate && !options.predicate(candidate)) {
      continue;
    }

    if (!candidate.conceptGroupKey) {
      if (spentMinutes + candidate.durationMinutes > options.budgetMinutes) {
        continue;
      }

      chosen.push(candidate);
      options.selectedIdentities.add(candidate.identity);
      spentMinutes += candidate.durationMinutes;
      continue;
    }

    if (consideredGroups.has(candidate.conceptGroupKey)) {
      continue;
    }
    consideredGroups.add(candidate.conceptGroupKey);

    const groupCandidates = ordered.filter(
      (groupCandidate) =>
        groupCandidate.conceptGroupKey === candidate.conceptGroupKey &&
        !options.selectedIdentities.has(groupCandidate.identity) &&
        (!options.predicate || options.predicate(groupCandidate)),
    );
    const groupMinutes = groupCandidates.reduce(
      (sum, groupCandidate) => sum + groupCandidate.durationMinutes,
      0,
    );

    if (spentMinutes + groupMinutes > options.budgetMinutes) {
      continue;
    }

    chosen.push(...groupCandidates);
    for (const groupCandidate of groupCandidates) {
      options.selectedIdentities.add(groupCandidate.identity);
    }
    spentMinutes += groupMinutes;
  }

  return {
    chosen,
    spentMinutes,
  };
}

export function buildPlannerSelection(args: {
  candidates: PlannerCandidate[];
  availableMinutes: number;
  preferredSubjectIds: Id<"subjects">[];
  examChapterIds: Id<"chapters">[];
}) {
  const availableMinutes = Math.max(0, Math.floor(args.availableMinutes));
  const preferFewerTasks = availableMinutes <= 30;
  const selectedIdentities = new Set<string>();

  const revisionCandidates = args.candidates.filter((candidate) => candidate.isRevision);
  const nonRevisionCandidates = args.candidates.filter(
    (candidate) => !candidate.isRevision,
  );

  const selected: PlannerCandidate[] = [];
  let usedMinutes = 0;

  const revisionTotal = revisionCandidates.reduce(
    (sum, candidate) => sum + candidate.durationMinutes,
    0,
  );

  if (revisionTotal <= availableMinutes) {
    const revisionPick = pickCandidates({
      candidates: revisionCandidates,
      selectedIdentities,
      budgetMinutes: availableMinutes,
      preferFewerTasks,
    });
    selected.push(...revisionPick.chosen);
    usedMinutes += revisionPick.spentMinutes;
  } else {
    const reservedRevisionBudget = Math.max(
      15,
      Math.min(availableMinutes, Math.round(availableMinutes * 0.5)),
    );
    const revisionPick = pickCandidates({
      candidates: revisionCandidates,
      selectedIdentities,
      budgetMinutes: reservedRevisionBudget,
      preferFewerTasks,
    });
    selected.push(...revisionPick.chosen);
    usedMinutes += revisionPick.spentMinutes;
  }

  const remainingMinutes = Math.max(0, availableMinutes - usedMinutes);
  const nonRevisionBudget = remainingMinutes;

  if (nonRevisionBudget > 0) {
    if (args.examChapterIds.length > 0) {
      const examTargetMinutes = Math.min(
        nonRevisionBudget,
        Math.round(nonRevisionBudget * 0.8),
      );
      const examPick = pickCandidates({
        candidates: nonRevisionCandidates,
        selectedIdentities,
        budgetMinutes: examTargetMinutes,
        predicate: (candidate) => args.examChapterIds.includes(candidate.chapterId),
        preferFewerTasks,
      });
      selected.push(...examPick.chosen);
      usedMinutes += examPick.spentMinutes;
    } else if (args.preferredSubjectIds.length > 0) {
      const preferredTargetMinutes = Math.min(
        nonRevisionBudget,
        Math.round(nonRevisionBudget * 0.5),
      );
      const preferredPick = pickCandidates({
        candidates: nonRevisionCandidates,
        selectedIdentities,
        budgetMinutes: preferredTargetMinutes,
        predicate: (candidate) =>
          args.preferredSubjectIds.includes(candidate.subjectId),
        preferFewerTasks,
      });
      selected.push(...preferredPick.chosen);
      usedMinutes += preferredPick.spentMinutes;
    }
  }

  const fillPick = pickCandidates({
    candidates: args.candidates,
    selectedIdentities,
    budgetMinutes: Math.max(0, availableMinutes - usedMinutes),
    preferFewerTasks,
  });
  selected.push(...fillPick.chosen);
  usedMinutes += fillPick.spentMinutes;

  if (usedMinutes < availableMinutes && revisionTotal > availableMinutes) {
    const revisionOverflowPick = pickCandidates({
      candidates: revisionCandidates,
      selectedIdentities,
      budgetMinutes: availableMinutes - usedMinutes,
      preferFewerTasks,
    });
    selected.push(...revisionOverflowPick.chosen);
    usedMinutes += revisionOverflowPick.spentMinutes;
  }

  return {
    selected,
    usedMinutes,
  };
}

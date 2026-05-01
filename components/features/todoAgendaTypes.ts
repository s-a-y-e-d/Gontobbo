export type TodoAgendaTask = {
  id: string;
  kind: "study_item" | "concept_review";
  studyItemId?: string;
  conceptId?: string;
  title: string;
  isCompleted: boolean;
  subjectName: string;
  chapterName: string;
  conceptName?: string;
  subjectColor?: string;
  startTimeMinutes?: number;
  durationMinutes: number;
  source: "manual" | "ai_accepted";
  sortOrder: number;
};

export type TodoAgendaDay = {
  date: number;
  tasks: TodoAgendaTask[];
  isToday: boolean;
  isSelected: boolean;
  dayNumber: string;
  shortWeekday: string;
  heading: string;
};

export type TodoStudyItemSearchResult = {
  _id: string;
  title: string;
  subjectName: string;
  chapterName: string;
  conceptName?: string;
  subjectColor?: string;
  estimatedMinutes: number;
};

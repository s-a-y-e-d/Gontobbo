import DateRangeStrip from "./DateRangeStrip";
import { TodoAgendaDay } from "./todoAgendaTypes";

type TodoViewMode = "agenda" | "calendar";

type TodoAgendaDateStripProps = {
  days: TodoAgendaDay[];
  monthLabel: string;
  viewMode: TodoViewMode;
  onViewModeChange: (mode: TodoViewMode) => void;
  onSelectDate: (date: number) => void;
  onGoToPreviousRange: () => void;
  onGoToToday: () => void;
  onGoToNextRange: () => void;
};

const todoViewOptions = [
  { value: "agenda", label: "Agenda", icon: "view_agenda" },
  { value: "calendar", label: "Calendar", icon: "calendar_view_week" },
] satisfies {
  value: TodoViewMode;
  label: string;
  icon: string;
}[];

export default function TodoAgendaDateStrip({
  days,
  monthLabel,
  viewMode,
  onViewModeChange,
  onSelectDate,
  onGoToPreviousRange,
  onGoToToday,
  onGoToNextRange,
}: TodoAgendaDateStripProps) {
  return (
    <DateRangeStrip
      days={days}
      monthLabel={monthLabel}
      title="করণীয়"
      viewMode={viewMode}
      viewOptions={todoViewOptions}
      onViewModeChange={onViewModeChange}
      onSelectDate={onSelectDate}
      onGoToPreviousRange={onGoToPreviousRange}
      onGoToToday={onGoToToday}
      onGoToNextRange={onGoToNextRange}
    />
  );
}

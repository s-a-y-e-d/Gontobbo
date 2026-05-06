import { TodoAgendaDay } from "./todoAgendaTypes";

type TodoAgendaDateStripProps = {
  days: TodoAgendaDay[];
  monthLabel: string;
  viewMode: "agenda" | "calendar";
  onViewModeChange: (mode: "agenda" | "calendar") => void;
  onSelectDate: (date: number) => void;
  onGoToPreviousRange: () => void;
  onGoToToday: () => void;
  onGoToNextRange: () => void;
};

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
    <section className="mb-8 border-b border-border-subtle pb-4">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-section-heading text-[2rem] leading-tight tracking-[-0.04em] text-on-surface md:text-section-heading">
            করণীয়
          </h1>
          <p className="mt-2 font-body text-sm text-gray-500 md:text-base">
            {monthLabel}
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <div className="flex items-center rounded-full border border-border-subtle bg-pure-white p-0.5">
            <button
              type="button"
              onClick={() => onViewModeChange("agenda")}
              className={`flex h-8 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium transition-all ${
                viewMode === "agenda"
                  ? "bg-on-surface text-pure-white shadow-sm"
                  : "text-gray-500 hover:bg-gray-100 hover:text-on-surface"
              }`}
              aria-label="Agenda view"
              title="Agenda"
            >
              <span className="material-symbols-outlined text-[16px]">
                view_agenda
              </span>
              <span className="hidden sm:inline">Agenda</span>
            </button>
            <button
              type="button"
              onClick={() => onViewModeChange("calendar")}
              className={`flex h-8 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium transition-all ${
                viewMode === "calendar"
                  ? "bg-on-surface text-pure-white shadow-sm"
                  : "text-gray-500 hover:bg-gray-100 hover:text-on-surface"
              }`}
              aria-label="Calendar view"
              title="Calendar"
            >
              <span className="material-symbols-outlined text-[16px]">
                calendar_view_week
              </span>
              <span className="hidden sm:inline">Calendar</span>
            </button>
          </div>

          <div className="flex items-center rounded-full border border-border-subtle bg-pure-white p-1">
            <button
              type="button"
              onClick={onGoToPreviousRange}
              className="flex h-9 w-9 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-100 hover:text-on-surface"
              aria-label="আগের দিনগুলো"
            >
              <span className="material-symbols-outlined text-[18px]">
                chevron_left
              </span>
            </button>
            <button
              type="button"
              onClick={onGoToToday}
              className="rounded-full px-4 py-2 font-body text-sm text-on-surface transition-colors hover:bg-gray-100"
            >
              আজ
            </button>
            <button
              type="button"
              onClick={onGoToNextRange}
              className="flex h-9 w-9 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-100 hover:text-on-surface"
              aria-label="পরের দিনগুলো"
            >
              <span className="material-symbols-outlined text-[18px]">
                chevron_right
              </span>
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-2">
        {days.map((day) => (
          <button
            type="button"
            key={day.date}
            onClick={() => onSelectDate(day.date)}
            className={`rounded-2xl px-2 py-3 text-center transition-colors ${
              day.isSelected
                ? "bg-on-surface text-pure-white shadow-[0_6px_20px_rgba(0,0,0,0.08)]"
                : "text-gray-500 hover:bg-gray-100"
            }`}
          >
            <div
              className={`font-mono-code text-[10px] uppercase tracking-[0.18em] md:text-[11px] ${
                day.isSelected ? "text-pure-white/80" : "text-gray-400"
              }`}
            >
              {day.shortWeekday}
            </div>
            <div className="mt-1 font-card-title text-lg leading-none md:text-xl">
              {day.dayNumber}
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}

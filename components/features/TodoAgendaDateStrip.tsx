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
      <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-section-heading text-[2rem] leading-tight tracking-[-0.04em] text-on-surface md:text-section-heading">
            করণীয়
          </h1>
          <p className="mt-2 font-body text-sm text-gray-500 md:text-base">
            {monthLabel}
          </p>
        </div>

        <div className="flex w-full flex-col items-start gap-3 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:justify-end sm:gap-2">
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

      <div className="-mx-4 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mx-0 sm:px-0">
        <div className="flex min-w-max gap-2 sm:grid sm:min-w-0 sm:grid-cols-7">
        {days.map((day) => (
          <button
            type="button"
            key={day.date}
            onClick={() => onSelectDate(day.date)}
            className={`group min-w-14 rounded-[22px] border px-2 py-3 text-center transition-all sm:min-w-0 ${
              day.isSelected
                ? "border-brand-green/40 bg-brand-green/10 text-on-surface shadow-[0_8px_24px_rgba(24,226,153,0.12)]"
                : day.isToday
                  ? "border-brand-green/30 bg-pure-white text-on-surface hover:bg-brand-green/5"
                  : "border-border-subtle bg-pure-white text-gray-500 hover:border-border-medium hover:bg-gray-100"
            }`}
          >
            <div
              className={`font-mono-code text-[10px] uppercase tracking-[0.18em] md:text-[11px] ${
                day.isSelected || day.isToday ? "text-brand-green" : "text-gray-400"
              }`}
            >
              {day.shortWeekday}
            </div>
            <div
              className={`mx-auto mt-2 flex h-9 w-9 items-center justify-center rounded-full font-card-title text-lg leading-none md:text-xl ${
                day.isToday
                  ? "bg-brand-green text-near-black"
                  : day.isSelected
                    ? "bg-on-surface text-pure-white"
                    : "text-on-surface group-hover:bg-surface-container"
              }`}
            >
              {day.dayNumber}
            </div>
          </button>
        ))}
        </div>
      </div>
    </section>
  );
}

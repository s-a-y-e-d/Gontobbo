type DateRangeStripDay = {
  date: number;
  isToday: boolean;
  isSelected: boolean;
  dayNumber: string;
  shortWeekday: string;
};

type ViewToggleOption<TViewMode extends string> = {
  value: TViewMode;
  label: string;
  icon: string;
};

type DateRangeStripProps<TViewMode extends string> = {
  days: DateRangeStripDay[];
  monthLabel: string;
  title: string;
  eyebrow?: string;
  description?: string;
  variant?: "page" | "card";
  viewMode?: TViewMode;
  viewOptions?: ViewToggleOption<TViewMode>[];
  onViewModeChange?: (mode: TViewMode) => void;
  onSelectDate: (date: number) => void;
  onGoToPreviousRange: () => void;
  onGoToToday: () => void;
  onGoToNextRange: () => void;
};

export default function DateRangeStrip<TViewMode extends string>({
  days,
  monthLabel,
  title,
  eyebrow,
  description,
  variant = "page",
  viewMode,
  viewOptions,
  onViewModeChange,
  onSelectDate,
  onGoToPreviousRange,
  onGoToToday,
  onGoToNextRange,
}: DateRangeStripProps<TViewMode>) {
  const hasViewToggle =
    viewMode !== undefined && viewOptions !== undefined && onViewModeChange !== undefined;

  const sectionClassName =
    variant === "card"
      ? "rounded-[36px] border border-border-subtle bg-white p-6 shadow-[0_18px_60px_rgba(0,0,0,0.04)] dark:bg-pure-white dark:shadow-none md:p-8"
      : "mb-8 border-b border-border-subtle pb-4";

  return (
    <section className={sectionClassName}>
      <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          {eyebrow ? (
            <p className="font-mono-code text-[11px] uppercase tracking-[0.18em] text-brand-green">
              {eyebrow}
            </p>
          ) : null}
          <h1
            className={`font-section-heading text-[2rem] leading-tight tracking-[-0.04em] text-on-surface md:text-section-heading ${
              eyebrow ? "mt-3" : ""
            }`}
          >
            {title}
          </h1>
          {description ? (
            <p className="mt-3 max-w-2xl font-body text-sm text-gray-500 md:text-base">
              {description}
            </p>
          ) : null}
          <p className="mt-2 font-body text-sm text-gray-500 md:text-base">
            {monthLabel}
          </p>
        </div>

        <div className="flex w-full flex-col items-start gap-3 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:justify-end sm:gap-2">
          {hasViewToggle ? (
            <div className="flex items-center rounded-full border border-border-subtle bg-pure-white p-0.5">
              {viewOptions.map((option) => (
                <button
                  type="button"
                  key={option.value}
                  onClick={() => onViewModeChange(option.value)}
                  className={`flex h-8 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium transition-all ${
                    viewMode === option.value
                      ? "bg-on-surface text-pure-white shadow-sm"
                      : "text-gray-500 hover:bg-gray-100 hover:text-on-surface"
                  }`}
                  aria-label={`${option.label} view`}
                  title={option.label}
                >
                  <span className="material-symbols-outlined text-[16px]">
                    {option.icon}
                  </span>
                  <span className="hidden sm:inline">{option.label}</span>
                </button>
              ))}
            </div>
          ) : null}

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
                      : "text-on-surface"
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

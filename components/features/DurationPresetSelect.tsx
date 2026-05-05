"use client";

import { useEffect, useRef, useState } from "react";

export const DURATION_PRESETS = Array.from(
  { length: 48 },
  (_, index) => (index + 1) * 15,
);

export function formatPresetDurationLabel(minutes: number): string {
  if (minutes < 60) {
    return `${minutes} min`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (remainingMinutes === 0) {
    return `${hours}h`;
  }

  return `${hours}h ${remainingMinutes} min`;
}

export function roundToNearestPresetDuration(minutes: number): number {
  let nearest = DURATION_PRESETS[0]!;
  let nearestDifference = Math.abs(minutes - nearest);

  for (const option of DURATION_PRESETS) {
    const difference = Math.abs(minutes - option);
    if (
      difference < nearestDifference ||
      (difference === nearestDifference && option > nearest)
    ) {
      nearest = option;
      nearestDifference = difference;
    }
  }

  return nearest;
}

type DurationPresetSelectProps = {
  value: number;
  onChange: (minutes: number) => void;
  className?: string;
  disabledOptions?: (minutes: number) => boolean;
};

export default function DurationPresetSelect({
  value,
  onChange,
  className = "w-40 shrink-0",
  disabledOptions,
}: DurationPresetSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const normalizedValue = roundToNearestPresetDuration(value);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        className={`flex w-full items-center rounded-full border bg-pure-white py-2 pl-4 pr-3 text-left transition-all ${
          isOpen
            ? "border-brand-green ring-4 ring-brand-green/10"
            : "border-border-medium hover:border-brand-green/35"
        }`}
      >
        <span className="material-symbols-outlined text-[18px] text-brand-green">
          schedule
        </span>
        <span className="ml-2.5 flex-1 font-medium text-on-surface">
          {formatPresetDurationLabel(normalizedValue)}
        </span>
        <span
          className={`material-symbols-outlined text-[18px] text-gray-400 transition-transform ${
            isOpen ? "rotate-180" : ""
          }`}
        >
          expand_more
        </span>
      </button>

      {isOpen ? (
        <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-50 overflow-hidden rounded-3xl border border-border-subtle bg-pure-white p-2 shadow-[0_20px_50px_rgba(15,23,42,0.16)]">
          <div className="max-h-64 overflow-y-auto">
            {DURATION_PRESETS.map((minutes) => {
              const isSelected = minutes === normalizedValue;
              const isDisabled = disabledOptions?.(minutes) ?? false;

              return (
                <button
                  key={minutes}
                  type="button"
                  disabled={isDisabled}
                  onClick={() => {
                    onChange(minutes);
                    setIsOpen(false);
                  }}
                  className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-all ${
                    isSelected
                      ? "bg-brand-green/10 text-brand-green"
                      : "text-on-surface hover:bg-gray-50"
                  } disabled:cursor-not-allowed disabled:text-gray-300 disabled:hover:bg-transparent`}
                >
                  <span
                    className={`material-symbols-outlined text-[18px] ${
                      isSelected ? "text-brand-green" : "text-gray-300"
                    }`}
                  >
                    schedule
                  </span>
                  <span className="flex-1 font-medium">
                    {formatPresetDurationLabel(minutes)}
                  </span>
                  {isSelected ? (
                    <span className="material-symbols-outlined text-[18px] text-brand-green">
                      check
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

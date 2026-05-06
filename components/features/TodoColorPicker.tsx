"use client";

import {
  getSubjectTheme,
  SUBJECT_COLOR_OPTIONS,
  type SubjectColor,
} from "./subjectTheme";

type TodoColorPickerProps = {
  value: string;
  onChange: (color: SubjectColor) => void;
};

const colorLabels: Record<SubjectColor, string> = {
  green: "Green",
  red: "Red",
  blue: "Blue",
  gray: "Gray",
  amber: "Amber",
  purple: "Purple",
  teal: "Teal",
  indigo: "Indigo",
  pink: "Pink",
};

export default function TodoColorPicker({
  value,
  onChange,
}: TodoColorPickerProps) {
  return (
    <div>
      <label className="mb-2 block font-label-uppercase text-label-uppercase text-gray-500">
        রং
      </label>
      <div className="flex flex-wrap gap-2">
        {SUBJECT_COLOR_OPTIONS.map((color) => {
          const theme = getSubjectTheme(color);
          const isSelected = value === color;

          return (
            <button
              key={color}
              type="button"
              onClick={() => onChange(color)}
              className={`flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-medium transition-all ${
                isSelected
                  ? "border-on-surface bg-on-surface text-pure-white"
                  : "border-border-medium bg-pure-white text-gray-500 hover:border-brand-green/40 hover:text-on-surface"
              }`}
              aria-pressed={isSelected}
            >
              <span
                className="h-3 w-3 rounded-full"
                style={{ backgroundColor: theme.accentHex }}
              />
              {colorLabels[color]}
            </button>
          );
        })}
      </div>
    </div>
  );
}

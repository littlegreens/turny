"use client";

import { WEEKDAY_OPTIONS } from "@/lib/weekdays";

type Props = {
  value: number[];
  onChange: (days: number[]) => void;
  disabled?: boolean;
};

export function WeekdayPicker({ value, onChange, disabled = false }: Props) {
  function toggle(day: number) {
    if (value.includes(day)) {
      if (value.length === 1) return;
      onChange(value.filter((item) => item !== day));
      return;
    }
    onChange([...value, day]);
  }

  return (
    <div>
      <label className="form-label small mb-1 d-block">Giorni attivi</label>
      <div className="d-flex flex-wrap gap-1">
        {WEEKDAY_OPTIONS.map((day) => {
          const active = value.includes(day.value);
          return (
            <button
              key={day.value}
              type="button"
              disabled={disabled}
              className={`btn btn-sm ${active ? "btn-success" : "btn-outline-success"}`}
              onClick={() => toggle(day.value)}
            >
              {day.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

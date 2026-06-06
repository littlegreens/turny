"use client";

import {
  slotAppliesOnWeekday,
  WEEKLY_SLOT_LABELS,
  weeklyCellKey,
  slotsForWeekday,
  type WeeklySlot,
} from "@/lib/weekly-unavailability";
import { WEEKDAY_OPTIONS } from "@/lib/weekdays";

type Props = {
  cellKeys: ReadonlySet<string>;
  onToggle: (weekday: number, slot: WeeklySlot) => void;
  onToggleDay?: (weekday: number) => void;
  disabled?: boolean;
};

function dayButtonClass(allOff: boolean): string {
  return allOff ? "btn-danger" : "btn-outline-success";
}

export function WeeklyUnavailabilityGrid({ cellKeys, onToggle, onToggleDay, disabled }: Props) {
  return (
    <div className="d-grid gap-2">
      <p className="small text-secondary mb-0 lh-sm">
        Rosso = non disponibile. Verde contorno = disponibile. Clicca il giorno per attivare o disattivare tutte le fasce.
      </p>
      {WEEKDAY_OPTIONS.map((day) => {
        const daySlots = slotsForWeekday(day.value);
        const allOff = daySlots.every((s) => cellKeys.has(weeklyCellKey(day.value, s)));
        const isSunday = day.value === 0;

        return (
          <div key={day.value} className="d-flex align-items-stretch gap-2">
            <button
              type="button"
              className={`btn btn-sm schedule-member-popup-tile ${dayButtonClass(allOff)}`}
              onClick={() => onToggleDay?.(day.value)}
              disabled={disabled || !onToggleDay}
              style={{ width: 120, flexShrink: 0, justifyContent: "center" }}
              title={onToggleDay ? "Clicca per attivare/disattivare tutte le fasce del giorno" : day.label}
            >
              {day.label}
            </button>
            <div className="weekly-unavail-slots-grid">
              {isSunday ? (
                <>
                  <button
                    type="button"
                    className={`btn btn-sm schedule-member-popup-tile weekly-unavail-slot--wide ${cellKeys.has(weeklyCellKey(day.value, "turnoUnico")) ? "btn-danger" : "btn-outline-success"}`}
                    onClick={() => onToggle(day.value, "turnoUnico")}
                    disabled={disabled}
                  >
                    {WEEKLY_SLOT_LABELS.turnoUnico}
                  </button>
                  <button
                    type="button"
                    className={`btn btn-sm schedule-member-popup-tile ${cellKeys.has(weeklyCellKey(day.value, "notte")) ? "btn-danger" : "btn-outline-success"}`}
                    onClick={() => onToggle(day.value, "notte")}
                    disabled={disabled}
                  >
                    {WEEKLY_SLOT_LABELS.notte}
                  </button>
                </>
              ) : (
                daySlots.map((slot) => {
                  const active = cellKeys.has(weeklyCellKey(day.value, slot));
                  if (!slotAppliesOnWeekday(slot, day.value)) return null;
                  return (
                    <button
                      key={`${day.value}|${slot}`}
                      type="button"
                      className={`btn btn-sm schedule-member-popup-tile ${active ? "btn-danger" : "btn-outline-success"}`}
                      onClick={() => onToggle(day.value, slot)}
                      disabled={disabled}
                    >
                      {WEEKLY_SLOT_LABELS[slot]}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

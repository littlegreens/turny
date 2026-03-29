export const WEEKDAY_OPTIONS = [
  { value: 1, label: "Lun" },
  { value: 2, label: "Mar" },
  { value: 3, label: "Mer" },
  { value: 4, label: "Gio" },
  { value: 5, label: "Ven" },
  { value: 6, label: "Sab" },
  { value: 0, label: "Dom" },
];

export function formatWeekdays(days: number[]) {
  const uniqueSorted = [...new Set(days)].sort((a, b) => {
    const ai = WEEKDAY_OPTIONS.findIndex((d) => d.value === a);
    const bi = WEEKDAY_OPTIONS.findIndex((d) => d.value === b);
    return ai - bi;
  });

  return uniqueSorted
    .map((day) => WEEKDAY_OPTIONS.find((item) => item.value === day)?.label)
    .filter(Boolean)
    .join(", ");
}

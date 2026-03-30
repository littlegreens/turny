"use client";

type RowCompact = {
  label: string;
  shiftCount: number;
  nightCount?: number;
  satCount?: number;
  sunCount?: number;
  hoursTotal: number;
  freeDays: number;
  freeWeekend: number;
};

type RowFull = {
  label: string;
  email: string;
  professionalRole: string;
  shiftCount: number;
  nightCount?: number;
  satCount?: number;
  sunCount?: number;
  hoursTotal: number;
  contractMode: string;
};

type Row = RowCompact | RowFull;

type Props = {
  filename: string;
  rows: Row[];
};

function csvEscape(s: string) {
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function isCompactRow(r: Row): r is RowCompact {
  return "freeDays" in r;
}

export function ScheduleReportCsvButton({ filename, rows }: Props) {
  function download() {
    let header: string[];
    let lines: string[];
    const r0 = rows[0];
    if (r0 && isCompactRow(r0)) {
      header = ["Nome", "Turni", "Notti", "Sabati", "Domeniche", "Ore", "Giorni_liberi"];
      lines = [
        header.join(","),
        ...(rows as RowCompact[]).map((r) =>
          [r.label, String(r.shiftCount), String(r.nightCount ?? 0), String(r.satCount ?? 0), String(r.sunCount ?? 0), String(r.hoursTotal), String(r.freeDays)]
            .map((c) => csvEscape(String(c)))
            .join(","),
        ),
      ];
    } else {
      header = ["Nome", "Email", "Ruolo professionale", "Turni", "Notti", "Sabati", "Domeniche", "Ore", "Modalita contratto"];
      lines = [
        header.join(","),
        ...(rows as RowFull[]).map((r) =>
          [r.label, r.email, r.professionalRole, String(r.shiftCount), String(r.nightCount ?? 0), String(r.satCount ?? 0), String(r.sunCount ?? 0), String(r.hoursTotal), r.contractMode]
            .map((c) => csvEscape(String(c)))
            .join(","),
        ),
      ];
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <button type="button" className="btn btn-sm btn-outline-success" onClick={download} disabled={rows.length === 0}>
      Scarica CSV (persone)
    </button>
  );
}

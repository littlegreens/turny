"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ColorPalettePicker } from "@/components/color-palette-picker";
import { useBeforeUnloadWhen } from "@/hooks/use-unsaved-prompt";

type ShiftTypeCol = {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  color: string;
  activeWeekdays: number[];
};

type MemberOpt = {
  id: string;
  userId?: string;
  label: string;
  memberColor: string | null;
};

type GridAssignment = {
  id: string;
  memberId: string;
  shiftTypeId: string;
  date: string;
  memberLabel: string;
  shiftTypeName: string;
  shiftTypeColor: string;
};

type Props = {
  year: number;
  month: number;
  startDate?: string;
  endDate?: string;
  currentUserId?: string;
  shiftTypes: ShiftTypeCol[];
  members: MemberOpt[];
  assignments: GridAssignment[];
};

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function daysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

function utcDayOfWeek(dateStr: string): number {
  return new Date(`${dateStr}T00:00:00.000Z`).getUTCDay();
}

function formatDateIt(isoDate: string) {
  const d = new Date(`${isoDate}T00:00:00.000Z`);
  return new Intl.DateTimeFormat("it-IT").format(d);
}

export function WorkerTurnsView({
  year,
  month,
  startDate,
  endDate,
  currentUserId,
  shiftTypes,
  members,
  assignments,
}: Props) {
  const router = useRouter();
  const [viewMode, setViewMode] = useState<"standard" | "calendar" | "mine">("mine");
  const [myColorDraft, setMyColorDraft] = useState<string | null>(null);
  const [colorSaving, setColorSaving] = useState(false);
  const [colorMsg, setColorMsg] = useState<string | null>(null);

  const dates = useMemo(() => {
    if (startDate && endDate && endDate >= startDate) {
      const out: string[] = [];
      const d = new Date(`${startDate}T00:00:00.000Z`);
      const end = new Date(`${endDate}T00:00:00.000Z`);
      while (d <= end) {
        out.push(d.toISOString().slice(0, 10));
        d.setUTCDate(d.getUTCDate() + 1);
      }
      return out;
    }
    const dim = daysInMonth(year, month);
    return Array.from({ length: dim }, (_, i) => `${year}-${pad(month)}-${pad(i + 1)}`);
  }, [endDate, month, startDate, year]);

  const days = dates.map((dateStr) => {
    const dt = new Date(`${dateStr}T00:00:00.000Z`);
    return {
      dateStr,
      day: dt.getUTCDate(),
      weekday: new Intl.DateTimeFormat("it-IT", { weekday: "short" }).format(dt),
    };
  });

  const byCell = useMemo(() => {
    const m = new Map<string, GridAssignment[]>();
    for (const a of assignments) {
      const k = `${a.date}|${a.shiftTypeId}`;
      const list = m.get(k) ?? [];
      list.push(a);
      m.set(k, list);
    }
    return m;
  }, [assignments]);

  const memberById = useMemo(() => {
    const m = new Map<string, MemberOpt>();
    for (const x of members) m.set(x.id, x);
    return m;
  }, [members]);

  const myMember = useMemo(
    () => (currentUserId ? members.find((m) => m.userId === currentUserId) ?? null : null),
    [currentUserId, members],
  );

  const savedColorForCompare =
    myMember?.memberColor && /^#[0-9A-Fa-f]{6}$/.test(myMember.memberColor) ? myMember.memberColor : "#3B8BD4";
  const effectiveColor = myColorDraft ?? savedColorForCompare;
  const colorDraftDirty = Boolean(myMember) && myColorDraft !== null && myColorDraft !== savedColorForCompare;
  useBeforeUnloadWhen(colorDraftDirty);

  const myAssignments = useMemo(() => {
    if (!myMember) return [] as GridAssignment[];
    return assignments
      .filter((a) => a.memberId === myMember.id)
      .sort((a, b) => `${a.date}|${a.shiftTypeName}`.localeCompare(`${b.date}|${b.shiftTypeName}`));
  }, [assignments, myMember]);

  const myHours = useMemo(
    () =>
      myAssignments.reduce((acc, a) => {
        const st = shiftTypes.find((s) => s.id === a.shiftTypeId);
        if (!st) return acc;
        const [sh, sm] = st.startTime.split(":").map(Number);
        const [eh, em] = st.endTime.split(":").map(Number);
        const startMin = sh * 60 + sm;
        let endMin = eh * 60 + em;
        if (endMin <= startMin) endMin += 24 * 60;
        return acc + (endMin - startMin) / 60;
      }, 0),
    [myAssignments, shiftTypes],
  );

  return (
    <section className="card mt-3">
      <div className="card-body p-3 p-md-4">
        <div className="d-flex align-items-center gap-2 flex-wrap mb-3" aria-label="Viste visualizzazione">
          <button
            type="button"
            className={`btn btn-sm ${viewMode === "standard" ? "btn-success" : "btn-outline-success"}`}
            onClick={() => setViewMode("standard")}
          >
            <Image src="/dashboard.svg" alt="" width={20} height={20} style={{ marginRight: 8, filter: viewMode === "standard" ? "brightness(0) invert(1)" : "none" }} />
            Standard
          </button>
          <button
            type="button"
            className={`btn btn-sm ${viewMode === "calendar" ? "btn-success" : "btn-outline-success"}`}
            onClick={() => setViewMode("calendar")}
          >
            <Image src="/calendar.svg" alt="" width={20} height={20} style={{ marginRight: 8, filter: viewMode === "calendar" ? "brightness(0) invert(1)" : "none" }} />
            Calendario
          </button>
          <button
            type="button"
            className={`btn btn-sm ${viewMode === "mine" ? "btn-success" : "btn-outline-success"}`}
            onClick={() => setViewMode("mine")}
          >
            <Image src="/my_turni.svg" alt="" width={20} height={20} style={{ marginRight: 8, filter: viewMode === "mine" ? "brightness(0) invert(1)" : "none" }} />
            I miei turni
          </button>
        </div>

        {viewMode === "standard" ? (
          <div className="table-responsive">
            <table className="table table-bordered align-middle mb-0" style={{ minWidth: 880, tableLayout: "fixed" }}>
              <thead>
                <tr>
                  <th style={{ width: 100 }}>Giorno</th>
                  {shiftTypes.map((st) => (
                    <th key={`preview-${st.id}`} className="text-center">
                      <div className="fw-semibold">{st.name}</div>
                      <div className="small text-secondary">{st.startTime} - {st.endTime}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {days.map((d) => (
                  <tr key={`preview-row-${d.dateStr}`}>
                    <th className="py-3">
                      <div className="fw-semibold">{d.day}</div>
                      <div className="small text-secondary text-capitalize">{d.weekday}</div>
                    </th>
                    {shiftTypes.map((st) => {
                      const cell = byCell.get(`${d.dateStr}|${st.id}`) ?? [];
                      const shiftInactive = !st.activeWeekdays.includes(utcDayOfWeek(d.dateStr));
                      return (
                        <td key={`preview-${d.dateStr}-${st.id}`} className="p-2" style={{ background: shiftInactive ? "#f8f9fa" : `${st.color}14`, minHeight: 96 }}>
                          <div className="d-flex flex-wrap gap-1 align-items-start">
                            {cell.map((a) => {
                              const m = memberById.get(a.memberId);
                              const chipBg = m?.memberColor ? `${m.memberColor}1f` : `${a.shiftTypeColor}2a`;
                              return (
                                <span
                                  key={`preview-chip-${a.id}`}
                                  className="d-inline-flex align-items-center rounded-2 px-2 py-2 small fw-semibold"
                                  style={{ backgroundColor: chipBg, color: m?.memberColor ?? "#1f2937" }}
                                >
                                  {a.memberLabel}
                                </span>
                              );
                            })}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {viewMode === "calendar" ? (
          <div className="row g-2">
            {days.map((d) => (
              <div key={`cal-${d.dateStr}`} className="col-12 col-md-6 col-xl-4">
                <div className="border rounded-3 p-2 h-100 bg-white">
                  <p className="fw-semibold mb-2">{d.weekday} {d.day}</p>
                  <div className="d-grid gap-2">
                    {shiftTypes.map((st) => {
                      const cell = byCell.get(`${d.dateStr}|${st.id}`) ?? [];
                      const inactive = !st.activeWeekdays.includes(utcDayOfWeek(d.dateStr));
                      return (
                        <div key={`cal-${d.dateStr}-${st.id}`} className="rounded-2 p-2" style={{ background: inactive ? "#f8f9fa" : `${st.color}18` }}>
                          <div className="small fw-semibold">
                            {st.name} <span className="text-secondary fw-normal">{st.startTime}-{st.endTime}</span>
                          </div>
                          <div className="d-flex flex-wrap gap-1 mt-1">
                            {cell.length === 0 ? <span className="small text-secondary">—</span> : null}
                            {cell.slice(0, 3).map((a) => {
                              const m = memberById.get(a.memberId);
                              return (
                                <span key={`cal-chip-${a.id}`} className="d-inline-flex rounded-2 px-2 py-1 small fw-semibold" style={{ backgroundColor: m?.memberColor ? `${m.memberColor}1f` : `${a.shiftTypeColor}2a`, color: m?.memberColor ?? "#1f2937" }}>
                                  {a.memberLabel}
                                </span>
                              );
                            })}
                            {cell.length > 3 ? <span className="badge text-bg-light">+{cell.length - 3}</span> : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {viewMode === "mine" ? (
          <div>
            <h2 className="h6 fw-semibold mb-3">I miei turni</h2>
            {!myMember ? (
              <p className="small text-secondary mb-0">Nessun profilo worker associato a questo calendario.</p>
            ) : (
              <>
                <div className="border rounded-3 p-3 mb-3 bg-light">
                  <p className="small fw-semibold mb-1">Colore nella griglia</p>
                  <p className="small text-secondary mb-2">
                    Di base il colore è quello impostato sulla scheda persona dall&apos;organizzazione. Qui puoi definire un colore
                    solo per questo calendario (sovrascrive il default nei turni di questa squadra).
                  </p>
                  <ColorPalettePicker value={effectiveColor} onChange={(hex) => setMyColorDraft(hex)} disabled={colorSaving} label="Colore persona" />
                  <div className="d-flex flex-wrap align-items-center gap-2 mt-2">
                    <button
                      type="button"
                      className="btn btn-sm btn-success"
                      disabled={colorSaving || !/^#[0-9A-Fa-f]{6}$/.test(effectiveColor) || !colorDraftDirty}
                      onClick={() => {
                        void (async () => {
                          setColorSaving(true);
                          setColorMsg(null);
                          const res = await fetch(`/api/calendar-members/${myMember.id}`, {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ color: effectiveColor }),
                          });
                          setColorSaving(false);
                          if (!res.ok) {
                            setColorMsg("Salvataggio colore non riuscito.");
                            return;
                          }
                          setColorMsg("Colore aggiornato.");
                          setMyColorDraft(null);
                          router.refresh();
                        })();
                      }}
                    >
                      {colorSaving ? "Salvo..." : "Salva colore"}
                    </button>
                    {colorMsg ? <span className="small text-secondary">{colorMsg}</span> : null}
                  </div>
                </div>
                <div className="row g-2 mb-3">
                  <div className="col-md-4"><div className="border rounded-3 p-3"><div className="small text-secondary">Persona</div><div className="fw-semibold">{myMember.label}</div></div></div>
                  <div className="col-md-4"><div className="border rounded-3 p-3"><div className="small text-secondary">Turni</div><div className="fw-semibold">{myAssignments.length}</div></div></div>
                  <div className="col-md-4"><div className="border rounded-3 p-3"><div className="small text-secondary">Ore totali</div><div className="fw-semibold">{Math.round(myHours * 10) / 10}</div></div></div>
                </div>
                <div className="table-responsive">
                  <table className="table table-sm table-bordered mb-0">
                    <thead><tr><th>Data</th><th>Turno</th><th>Orario</th></tr></thead>
                    <tbody>
                      {myAssignments.map((a) => {
                        const st = shiftTypes.find((s) => s.id === a.shiftTypeId);
                        return (
                          <tr key={`mine-${a.id}`}>
                            <td>{formatDateIt(a.date)}</td>
                            <td>{a.shiftTypeName}</td>
                            <td>{st ? `${st.startTime} - ${st.endTime}` : "-"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        ) : null}
      </div>
    </section>
  );
}

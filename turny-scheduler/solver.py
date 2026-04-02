"""
CP-SAT (OR-Tools) per Turny — input JSON da Next (`problem`).

Obiettivo «best effort»: copertura minima e massimali contrattuali sono soft (penalità + alert);
**Obblighi scheda** (requiredDates / requiredShifts) sono HARD sulle assegnazioni: non si ignorano.
Co-presenza «insieme» / «non insieme» e i vincoli tra giorni sono preferiti ma rilassabili nel target
(penalità) così il piano non diventa INFEASIBLE; copertura sotto minimo resta soft. DEVE e indisponibilità restano rigidi.
Il bilanciamento turni tra persone è affidato a W_SPREAD (gap max−min totale) e W_SHIFT_MIX (mix tipi turno
per persona); il tiebreaker casuale (RAND_W) differenzia piani equivalenti tra generazioni successive.
"""

from __future__ import annotations

import copy
import datetime as dt
import random
from typing import Any

from ortools.sat.python import cp_model


def _fmt_date_it(date_str: str) -> str:
    """Es. 2026-04-30 → 30/04/2026."""
    d = dt.date.fromisoformat(date_str)
    return f"{d.day:02d}/{d.month:02d}/{d.year}"


def _dow_relaxed_plain_message(meta: dict[str, Any]) -> str:
    """Testo per responsabili non tecnici (report / UI)."""
    kind = str(meta.get("ruleKind", ""))
    lbl = str(meta.get("memberLabel", "?"))
    fd = _fmt_date_it(str(meta.get("fromDate", "")))
    td = _fmt_date_it(str(meta.get("toDate", "")))
    rname = meta.get("ruleName")
    rbit = f"«{rname}»" if rname else "una regola del calendario sui giorni della settimana"
    if kind == "DAY_IMPLIES_DAY":
        return (
            f"Persona coinvolta: {lbl}. {rbit} collega il giorno {fd} al giorno {td}: in sintesi, se si lavora "
            f"in modo coerente il primo giorno, il calendario si aspetta anche un impegno il secondo. "
            f"Per chiudere il piano il motore ha dovuto accettare un’eccezione su questo legame in un caso concreto: "
            f"conviene rivedere a mano i turni di {lbl} intorno al {fd} e al {td}."
        )
    if kind == "DAY_EXCLUDES_DAY":
        return (
            f"Persona coinvolta: {lbl}. {rbit} dice di non lavorare sia il {fd} sia il {td}. "
            f"Per completare le assegnazioni il sistema ha dovuto applicare un’eccezione. "
            f"Controlla visivamente quelle due date per {lbl}."
        )
    return (
        f"Persona: {lbl}. Regola tra giorni ({kind}), date {fd} e {td}. "
        f"Il motore ha applicato un’eccezione: verifica a mano."
    )


def js_utcdow_from_iso(date_str: str) -> int:
    """Allineamento a JS Date.getUTCDay(): domenica=0, sabato=6."""
    d = dt.date.fromisoformat(date_str)
    w = d.weekday()  # lun=0 ... dom=6
    return (w + 1) % 7


def _bump_contract_caps(members: list[dict[str, Any]], bump: int) -> list[dict[str, Any]]:
    """Incremento omogeneo (+bump) su ogni tetto mensile già definito nella scheda membro."""
    out = copy.deepcopy(members)
    for m in out:
        for key in (
            "maxShiftsMonth",
            "maxNightsMonth",
            "maxSaturdaysMonth",
            "maxSundaysMonth",
            "maxWeekendDaysMonth",
        ):
            v = m.get(key)
            if v is not None and isinstance(v, (int, float)):
                m[key] = int(v) + bump
    return out


def _bump_consecutive(members: list[dict[str, Any]], extra: int) -> list[dict[str, Any]]:
    out = copy.deepcopy(members)
    for m in out:
        k = int(m.get("maxConsecutiveDays") or 6)
        m["maxConsecutiveDays"] = max(1, k + extra)
    return out


def _single_cp_solve(
    problem: dict[str, Any],
    schedule_id: str,
    *,
    relaxation_preface: list[dict[str, Any]] | None = None,
    time_limit_sec: float = 45.0,
) -> dict[str, Any]:
    dates = problem.get("dates") or []
    if not dates:
        return {
            "status": "MODEL_INVALID",
            "message": "problem.dates vuoto.",
        }

    shift_types: list[dict[str, Any]] = problem.get("shiftTypes") or []
    members: list[dict[str, Any]] = problem.get("members") or []
    fixed: list[dict[str, Any]] = problem.get("fixedAssignments") or []
    rest_after_night = bool(problem.get("restAfterNight", True))
    rest_days_after_night: int = int(problem.get("restDaysAfterNight", 1))
    co_rules: list[dict[str, Any]] = problem.get("coPresenceRules") or []
    dow_rules: list[dict[str, Any]] = problem.get("dowRules") or []

    st_by_id = {str(st["id"]): st for st in shift_types}
    D = len(dates)
    M = len(members)
    S = len(shift_types)
    if M == 0 or S == 0:
        return {"status": "MODEL_INVALID", "message": "Nessun membro o tipo turno."}

    holiday_raw = problem.get("holidayOverrides") or []
    holiday_map: dict[str, dict[str, Any]] = {}
    for h in holiday_raw:
        if not isinstance(h, dict):
            continue
        dte = str(h.get("date", ""))
        if not dte:
            continue
        mode = str(h.get("mode", "SUNDAY_LIKE")).upper()
        stids = [str(x) for x in (h.get("shiftTypeIds") or []) if str(x)]
        holiday_map[dte] = {"mode": mode, "shiftTypeIds": set(stids)}

    fixed_cell: dict[tuple[str, str], int] = {}
    fixed_md: list[list[bool]] = [[False] * D for _ in range(M)]
    fixed_night_md: list[list[bool]] = [[False] * D for _ in range(M)]
    mid_by_cal = {str(members[mi]["id"]): mi for mi in range(M)}

    fixed_tot = [0] * M
    fixed_nights = [0] * M
    fixed_sats = [0] * M
    fixed_suns = [0] * M
    fixed_we = [0] * M
    fixed_by_ms = [[0] * S for _ in range(M)]

    for fa in fixed:
        dte = str(fa.get("date", ""))
        sid = str(fa.get("shiftTypeId", ""))
        if sid not in st_by_id:
            return {
                "status": "MODEL_INVALID",
                "message": "fixedAssignments riferisce turno inesistente.",
            }
        if bool(fa.get("isGuestFixed")):
            fixed_cell[(dte, sid)] = fixed_cell.get((dte, sid), 0) + 1
            continue
        mid_cal = str(fa.get("memberId", "") or "")
        if mid_cal not in mid_by_cal:
            return {
                "status": "MODEL_INVALID",
                "message": "fixedAssignments riferisce membro inesistente.",
            }
        mi = mid_by_cal[mid_cal]
        si_fix = next(i for i, st in enumerate(shift_types) if str(st["id"]) == sid)
        fixed_by_ms[mi][si_fix] += 1
        fixed_cell[(dte, sid)] = fixed_cell.get((dte, sid), 0) + 1
        di = dates.index(dte)
        fixed_md[mi][di] = True
        fixed_tot[mi] += 1
        st = st_by_id[sid]
        if bool(st.get("isNight")):
            fixed_night_md[mi][di] = True
            fixed_nights[mi] += 1
        dow = js_utcdow_from_iso(dte)
        is_we = False
        if dow == 6:
            fixed_sats[mi] += 1
            is_we = True
        elif dow == 0:
            fixed_suns[mi] += 1
            is_we = True
        elif bool(st.get("countsAsWeekend")) and dow in (5, 6, 0):
            is_we = True
        if is_we:
            fixed_we[mi] += 1

    # Giorni con obbligo DEVE (data e/o turno): servono a rilassare altri vincoli solo su queste scelte esplicite.
    deve_day: list[list[bool]] = [[False] * D for _ in range(M)]
    for mi in range(M):
        m = members[mi]
        for dte_raw in m.get("requiredDates") or []:
            dte = str(dte_raw)
            if dte in dates:
                deve_day[mi][dates.index(dte)] = True
        for req in m.get("requiredShifts") or []:
            if not isinstance(req, dict):
                continue
            dte = str(req.get("date", ""))
            if dte in dates:
                deve_day[mi][dates.index(dte)] = True

    req_shift_cnt: list[list[int]] = [[0] * D for _ in range(M)]
    for mi in range(M):
        m = members[mi]
        for req in m.get("requiredShifts") or []:
            if not isinstance(req, dict):
                continue
            dte = str(req.get("date", ""))
            if dte not in dates:
                continue
            di = dates.index(dte)
            req_shift_cnt[mi][di] += 1

    # Celle giorno×turno dove un membro ha REQUIRED_SHIFT non già soddisfatto da un fisso:
    # servono variabili x anche se min_staff è già coperto solo dai fissi degli altri.
    required_shift_cells: dict[tuple[int, int], set[int]] = {}
    for mi in range(M):
        mid_cal = str(members[mi]["id"])
        for req in members[mi].get("requiredShifts") or []:
            if not isinstance(req, dict):
                continue
            dte = str(req.get("date", ""))
            sid = str(req.get("shiftTypeId", ""))
            if dte not in dates or sid not in st_by_id:
                continue
            di = dates.index(dte)
            si_match = next((i for i, st in enumerate(shift_types) if str(st["id"]) == sid), None)
            if si_match is None:
                continue
            dow = js_utcdow_from_iso(dte)
            if dow not in shift_types[si_match].get("activeWeekdays", []):
                continue
            ok_fixed = any(
                str(fa.get("memberId", "")) == mid_cal
                and str(fa.get("date", "")) == dte
                and str(fa.get("shiftTypeId", "")) == sid
                for fa in fixed
            )
            if ok_fixed:
                continue
            required_shift_cells.setdefault((di, si_match), set()).add(mi)

    need: dict[tuple[int, int], int] = {}
    active_cells: list[tuple[int, int]] = []
    for di, dte in enumerate(dates):
        dow = js_utcdow_from_iso(dte)
        ho = holiday_map.get(dte)
        for si, st in enumerate(shift_types):
            sid = str(st["id"])
            aw = st.get("activeWeekdays", [])
            if ho:
                hm = str(ho["mode"])
                if hm == "CLOSED":
                    continue
                if hm == "SUNDAY_LIKE":
                    if 0 not in aw:
                        continue
                elif hm == "CUSTOM":
                    if sid not in ho["shiftTypeIds"]:
                        continue
                elif dow not in aw:
                    continue
            elif dow not in aw:
                continue
            min_staff = int(st.get("minStaff", 1))
            have = fixed_cell.get((dte, sid), 0)
            base_n = max(0, min_staff - have)
            req_here = required_shift_cells.get((di, si), set())
            n = max(base_n, len(req_here))
            if n > 0:
                need[(di, si)] = n
                active_cells.append((di, si))

    assignments_out: list[dict[str, str]] = []

    if not active_cells:
        cal = _calendar_out(schedule_id or str(problem.get("scheduleId", "")), assignments_out, "OPTIMAL")
        return {"status": "OPTIMAL", "message": "Nessun slot da riempire.", "calendar": cal, "assignments": assignments_out, "alerts": []}

    st_id_at = [str(st["id"]) for st in shift_types]
    mem_id_at = [str(members[mi]["id"]) for mi in range(M)]

    def _member_label(mi: int) -> str:
        return str(members[mi].get("label") or members[mi].get("id") or "?")

    pre_alerts: list[dict[str, Any]] = []
    big = D * S + (max(fixed_tot) if fixed_tot else 0) + 20

    # Pesi: copertura sotto minimo, poi massimali contrattuali, poi equità.
    W_COVER = 50_000_000
    # ALWAYS_WITH sotto W_COVER: meglio buco organico che INFEASIBLE globale.
    W_ALWAYS_WITH_VIOL = 44_000_000
    # NEVER_WITH sopra W_COVER: meglio slot vuoto che due persone incompatibili insieme.
    W_NEVER_WITH_VIOL = 55_000_000
    W_DOW_RULE_VIOL = 43_000_000
    W_CAP_M = 28_000_000
    W_CAP_N = 26_000_000
    W_CAP_DOW = 24_000_000
    W_CAP_WE = 24_000_000

    model = cp_model.CpModel()
    obj_terms: list[cp_model.LinearExpr] = []

    def hard_blocked(mi: int, di: int, si: int) -> bool:
        m = members[mi]
        st = shift_types[si]
        dte = dates[di]
        dow = js_utcdow_from_iso(dte)
        sid = str(st["id"])
        unlock_days = set(m.get("weekdayUnlockDates") or [])
        unlock_shifts = set(str(x) for x in (m.get("shiftGenericUnlock") or []))
        pair = f"{dte}|{sid}"
        req_dates = set(m.get("requiredDates") or [])
        req_shift_pairs = set(
            f"{str(r.get('date'))}|{str(r.get('shiftTypeId'))}"
            for r in (m.get("requiredShifts") or [])
            if isinstance(r, dict)
        )
        day_unlocked = dte in unlock_days or dte in req_dates or pair in req_shift_pairs
        shift_unlocked = pair in unlock_shifts or pair in req_shift_pairs or day_unlocked

        if dte in set(m.get("unavailableDates") or []):
            if not day_unlocked:
                return True
        for p in m.get("unavailableShifts") or []:
            if str(p.get("date")) == dte and str(p.get("shiftTypeId")) == sid:
                if not shift_unlocked:
                    return True
        if sid in set(m.get("unavailableShiftTypeIdsHard") or []):
            if not shift_unlocked:
                return True
        if dow in set(m.get("unavailableWeekdaysHard") or []):
            if not day_unlocked:
                return True
        if fixed_md[mi][di]:
            return True
        return False

    def soft_penalty(mi: int, di: int, si: int) -> int:
        m = members[mi]
        dte = dates[di]
        dow = js_utcdow_from_iso(dte)
        sid = str(shift_types[si]["id"])
        pen = 0
        unlock_days = set(m.get("weekdayUnlockDates") or [])
        unlock_shifts = set(str(x) for x in (m.get("shiftGenericUnlock") or []))
        pair = f"{dte}|{sid}"
        req_dates = set(m.get("requiredDates") or [])
        req_shift_pairs = set(
            f"{str(r.get('date'))}|{str(r.get('shiftTypeId'))}"
            for r in (m.get("requiredShifts") or [])
            if isinstance(r, dict)
        )
        day_unlocked = dte in unlock_days or dte in req_dates or pair in req_shift_pairs
        shift_unlocked = pair in unlock_shifts or pair in req_shift_pairs or day_unlocked
        if sid in set(m.get("unavailableShiftTypeIdsSoft") or []):
            if not shift_unlocked:
                pen += 1
        if dow in set(m.get("unavailableWeekdaysSoft") or []):
            if not day_unlocked:
                pen += 1
        return pen

    x: dict[tuple[int, int, int], cp_model.IntVar] = {}
    for di, si in active_cells:
        for mi in range(M):
            x[(mi, di, si)] = model.NewBoolVar(f"x_{mi}_{di}_{si}")
            if hard_blocked(mi, di, si):
                model.Add(x[(mi, di, si)] == 0)

    # DEVE impossibili: esci subito con messaggi chiari (evita hw=0 e hw=1 insieme).
    br_req: list[dict[str, Any]] = []
    for mi in range(M):
        m = members[mi]
        mid_cal = str(members[mi]["id"])
        label = _member_label(mi)
        for dte_raw in m.get("requiredDates") or []:
            dte = str(dte_raw)
            if dte not in dates:
                continue
            di = dates.index(dte)
            if fixed_md[mi][di]:
                continue
            xs_day = [x[(mi, di, si)] for si in range(S) if (mi, di, si) in x]
            if not xs_day:
                br_req.append(
                    {
                        "type": "REQ_DATE_IMPOSSIBLE",
                        "message": f"{label}: obbligo di lavorare il {dte} non realizzabile "
                        "(nessuna fascia attiva quel giorno o tutti gli slot bloccati per questa persona).",
                        "memberId": mid_cal,
                        "date": dte,
                    }
                )
        for req in m.get("requiredShifts") or []:
            if not isinstance(req, dict):
                continue
            dte = str(req.get("date", ""))
            sid = str(req.get("shiftTypeId", ""))
            if dte not in dates or sid not in st_by_id:
                continue
            di = dates.index(dte)
            si_match = next((i for i, st in enumerate(shift_types) if str(st["id"]) == sid), None)
            if si_match is None:
                continue
            st_name = str(st_by_id[sid].get("name") or sid)
            ok_fixed = any(
                str(fa.get("memberId", "")) == mid_cal
                and str(fa.get("date", "")) == dte
                and str(fa.get("shiftTypeId", "")) == sid
                for fa in fixed
            )
            if ok_fixed:
                continue
            if (mi, di, si_match) not in x:
                br_req.append(
                    {
                        "type": "REQ_SHIFT_IMPOSSIBLE",
                        "message": f"{label}: obbligo turno «{st_name}» il {dte} non assegnabile "
                        "(tipo non attivo quel giorno o non in elenco slot).",
                        "memberId": mid_cal,
                        "date": dte,
                        "shiftTypeId": sid,
                    }
                )
            elif hard_blocked(mi, di, si_match):
                br_req.append(
                    {
                        "type": "REQ_SHIFT_CONFLICT",
                        "message": f"{label}: obbligo turno «{st_name}» il {dte} è in conflitto con "
                        "indisponibilità, fisso o altro blocco.",
                        "memberId": mid_cal,
                        "date": dte,
                        "shiftTypeId": sid,
                    }
                )
    if br_req:
        return {
            "status": "INFEASIBLE",
            "message": "Alcuni obblighi DEVE del periodo sono incompatibili con indisponibilità, "
            "fissi o giorni/tipi turno non attivi. Correggi la scheda sulla griglia.",
            "alerts": br_req,
        }

    cover_slacks: list[tuple[cp_model.IntVar, int, str, str, str]] = []
    for di, si in active_cells:
        n = need[(di, si)]
        slack = model.NewIntVar(0, n, f"cov_sl_{di}_{si}")
        x_sum_terms = [x[(mi, di, si)] for mi in range(M)]
        max_s = shift_types[si].get("maxStaff")
        have_fixed = fixed_cell.get((dates[di], st_id_at[si]), 0)
        if max_s is not None and isinstance(max_s, (int, float)) and int(max_s) > n + have_fixed:
            # maxStaff configurato e > minStaff: consente over-staffing fino a maxStaff.
            cap_new = max(0, int(max_s) - have_fixed)
            model.Add(sum(x_sum_terms) + slack >= n)
            model.Add(sum(x_sum_terms) <= cap_new)
        else:
            # maxStaff assente o == minStaff: eguaglianza — slot riempito esattamente a n (comportamento storico).
            model.Add(sum(x_sum_terms) + slack == n)
        obj_terms.append(W_COVER * slack)
        dte = dates[di]
        sn = str(shift_types[si].get("name") or st_id_at[si])
        cover_slacks.append((slack, n, dte, sn, str(st_id_at[si])))

    # Composizione per ruolo (minimi). È "best effort" come la copertura:
    # il solver prova a rispettarla; se i fissi la rendono impossibile nella cella (slot pieno), non blocca e genera alert.
    role_slacks: list[tuple[cp_model.IntVar, int, str, str, str, str]] = []
    for di, si in active_cells:
        st = shift_types[si]
        rc = st.get("roleCoverage") or []
        if not isinstance(rc, list) or not rc:
            continue
        dte = dates[di]
        sid = str(st_id_at[si])
        st_name = str(st.get("name") or sid)
        have_fixed = fixed_cell.get((dte, sid), 0)
        min_staff = int(st.get("minStaff", 1))
        cap_total = max(0, min_staff)

        # Se la cella è già piena di fissi (membri + extra), non possiamo aggiungere persone.
        # In quel caso: se non soddisfa i minimi ruolo → alert, niente vincolo.
        if have_fixed >= cap_total:
            # stimiamo quanti fissi "contano" per ruolo guardando i fixedAssignments membri (no extra)
            fixed_mis = []
            for fa in fixed:
                if str(fa.get("date", "")) != dte or str(fa.get("shiftTypeId", "")) != sid:
                    continue
                if bool(fa.get("isGuestFixed")):
                    continue
                mid_cal = str(fa.get("memberId", "") or "")
                if mid_cal and mid_cal in mid_by_cal:
                    fixed_mis.append(mid_by_cal[mid_cal])

            for rr in rc:
                if not isinstance(rr, dict):
                    continue
                role = str(rr.get("role") or "").strip()
                member_ids = [str(x) for x in (rr.get("memberIds") or []) if str(x)]
                min_cnt = int(rr.get("minCount") or 0)
                if min_cnt <= 0 or not member_ids:
                    continue
                member_set = set(member_ids)
                have_role = 0
                for mi in fixed_mis:
                    mid = str(members[mi].get("id") or "")
                    if mid in member_set:
                        have_role += 1
                if have_role < min_cnt:
                    pre_alerts.append(
                        {
                            "type": "ROLE_COVERAGE_BYPASSED",
                            "message": f"Composizione ruoli non rispettata in {st_name} il {dte}: manca {role}. "
                            "La cella è piena di assegnazioni manuali, quindi il motore non può correggere.",
                            "date": dte,
                            "shiftTypeId": sid,
                            "role": role,
                            "need": min_cnt,
                            "have": have_role,
                        }
                    )
            continue

        # Caso normale: imponiamo minimi ruolo con slack (penalità alta), usando sia fissi sia variabili x.
        for rr in rc:
            if not isinstance(rr, dict):
                continue
            role = str(rr.get("role") or "").strip()
            member_ids = [str(x) for x in (rr.get("memberIds") or []) if str(x)]
            min_cnt = int(rr.get("minCount") or 0)
            if min_cnt <= 0 or not member_ids:
                continue

            member_set = set(member_ids)
            fixed_role = 0
            for fa in fixed:
                if str(fa.get("date", "")) != dte or str(fa.get("shiftTypeId", "")) != sid:
                    continue
                if bool(fa.get("isGuestFixed")):
                    continue
                mid_cal = str(fa.get("memberId", "") or "")
                if mid_cal and mid_cal in member_set:
                    fixed_role += 1

            n_need = max(0, min_cnt - fixed_role)
            if n_need <= 0:
                continue
            slack = model.NewIntVar(0, n_need, f"role_sl_{di}_{si}_{role}")
            role_vars = []
            for mi in range(M):
                mid = str(members[mi].get("id") or "")
                if mid in member_set and (mi, di, si) in x:
                    role_vars.append(x[(mi, di, si)])
            if role_vars:
                model.Add(sum(role_vars) + slack >= n_need)
            else:
                model.Add(slack >= n_need)
            # Penale più alta della copertura, così il solver preferisce soddisfare i ruoli se possibile.
            obj_terms.append((W_COVER + 2_000_000) * slack)
            role_slacks.append((slack, n_need, dte, st_name, sid, role))

    # Co-presenza: ALWAYS e NEVER sono soft (rilassabili, default) o hard (mai violabili) in base a weight.
    # Soft: penalità nell'obiettivo + alert. Hard: vincolo diretto; INFEASIBLE se impossibile rispettarlo.
    aw_relax_idx = 0
    nev_relax_idx = 0
    always_with_slacks: list[tuple[cp_model.IntVar, str, str, str, str]] = []
    never_with_slacks: list[tuple[cp_model.IntVar, str, str, str, str]] = []
    if co_rules:
        for rr in co_rules:
            if not isinstance(rr, dict):
                continue
            kind = str(rr.get("kind") or "")
            if kind not in ("ALWAYS_WITH", "NEVER_WITH"):
                continue
            if_ids = [str(v) for v in (rr.get("ifMemberIds") or []) if str(v)]
            then_ids = [str(v) for v in (rr.get("thenMemberIds") or []) if str(v)]
            if not if_ids or not then_ids:
                continue
            if_mis = [mid_by_cal[i] for i in if_ids if i in mid_by_cal]
            then_mis = [mid_by_cal[i] for i in then_ids if i in mid_by_cal]
            if not if_mis or not then_mis:
                continue
            rule_dates = rr.get("dates") or []
            date_set = set(str(d) for d in rule_dates if isinstance(d, str) and d)
            include_shift_ids = set(str(v) for v in (rr.get("shiftTypeIds") or []) if str(v))
            exclude_shift_ids = set(str(v) for v in (rr.get("excludeShiftTypeIds") or []) if str(v))
            is_hard_co = str(rr.get("weight", "SOFT")).upper() == "HARD"

            for di, dte in enumerate(dates):
                if date_set and dte not in date_set:
                    continue
                for si in range(S):
                    sid = str(st_id_at[si])
                    if include_shift_ids and sid not in include_shift_ids:
                        continue
                    if sid in exclude_shift_ids:
                        continue
                    a_vars = [x[(mi, di, si)] for mi in if_mis if (mi, di, si) in x]
                    b_vars = [x[(mi, di, si)] for mi in then_mis if (mi, di, si) in x]
                    if not a_vars or not b_vars:
                        continue
                    if kind == "ALWAYS_WITH":
                        la = len(a_vars)
                        # Gruppi disgiunti (es. due ruoli): senza nessuno del «then» si limita il «if».
                        disjoint_groups = not (set(if_mis) & set(then_mis))
                        sb = sum(b_vars)
                        if is_hard_co:
                            if disjoint_groups:
                                no_b = model.NewBoolVar(f"aw_nob_{aw_relax_idx}")
                                aw_relax_idx += 1
                                model.Add(sb >= 1).OnlyEnforceIf(no_b.Not())
                                model.Add(sb == 0).OnlyEnforceIf(no_b)
                                model.Add(sum(a_vars) == 0).OnlyEnforceIf(no_b)
                                model.Add(sum(a_vars) <= la * sb).OnlyEnforceIf(no_b.Not())
                            else:
                                model.Add(sum(a_vars) <= la * sb)
                        else:
                            viol_aw = model.NewBoolVar(f"aw_viol_{aw_relax_idx}")
                            aw_relax_idx += 1
                            if disjoint_groups:
                                no_b = model.NewBoolVar(f"aw_nob_{aw_relax_idx - 1}")
                                model.Add(sb >= 1).OnlyEnforceIf(no_b.Not())
                                model.Add(sb == 0).OnlyEnforceIf(no_b)
                                model.Add(sum(a_vars) <= 1 + la * viol_aw).OnlyEnforceIf(no_b)
                                model.Add(sum(a_vars) <= la * sb + la * viol_aw).OnlyEnforceIf(no_b.Not())
                            else:
                                model.Add(sum(a_vars) <= la * sb + la * viol_aw)
                            obj_terms.append(W_ALWAYS_WITH_VIOL * viol_aw)
                            sn = str(shift_types[si].get("name") or st_id_at[si])
                            rlabel = str(rr.get("name") or "").strip() or str(rr.get("id") or "co-presenza")
                            always_with_slacks.append((viol_aw, dte, sn, rlabel, sid))
                    else:  # NEVER_WITH
                        paired = False
                        if is_hard_co:
                            for mi_a in if_mis:
                                if deve_day[mi_a][di]:
                                    continue
                                if (mi_a, di, si) not in x:
                                    continue
                                av = x[(mi_a, di, si)]
                                for mi_b in then_mis:
                                    if deve_day[mi_b][di]:
                                        continue
                                    if (mi_b, di, si) not in x:
                                        continue
                                    bv = x[(mi_b, di, si)]
                                    model.Add(av + bv <= 1)
                        else:
                            viol_nev = model.NewBoolVar(f"nev_viol_{nev_relax_idx}")
                            nev_relax_idx += 1
                            for mi_a in if_mis:
                                if deve_day[mi_a][di]:
                                    continue
                                if (mi_a, di, si) not in x:
                                    continue
                                av = x[(mi_a, di, si)]
                                for mi_b in then_mis:
                                    if deve_day[mi_b][di]:
                                        continue
                                    if (mi_b, di, si) not in x:
                                        continue
                                    bv = x[(mi_b, di, si)]
                                    model.Add(av + bv <= 1 + 2 * viol_nev)
                                    paired = True
                            if paired:
                                obj_terms.append(W_NEVER_WITH_VIOL * viol_nev)
                                sn = str(shift_types[si].get("name") or st_id_at[si])
                                rlabel = str(rr.get("name") or "").strip() or str(rr.get("id") or "co-presenza")
                                never_with_slacks.append((viol_nev, dte, sn, rlabel, sid))
    for mi in range(M):
        for di in range(D):
            xs = [x[(mi, di, si)] for si in range(S) if (mi, di, si) in x]
            if not xs:
                continue
            if fixed_md[mi][di]:
                model.Add(sum(xs) == 0)
            else:
                daily_cap = max(1, int(req_shift_cnt[mi][di]))
                model.Add(sum(xs) <= daily_cap)

    for mi in range(M):
        m = members[mi]
        cap = m.get("maxShiftsMonth")
        if cap is not None and isinstance(cap, (int, float)):
            c = int(cap)
            xs = [x[k] for k in x if k[0] == mi]
            viol = model.NewIntVar(0, big, f"capm_{mi}")
            if xs:
                model.Add(sum(xs) + fixed_tot[mi] <= c + viol)
            else:
                model.Add(fixed_tot[mi] <= c + viol)
            obj_terms.append(W_CAP_M * viol)

        cap_n = m.get("maxNightsMonth")
        if cap_n is not None and isinstance(cap_n, (int, float)):
            terms = [x[k] for k in x if k[0] == mi and bool(shift_types[k[2]].get("isNight"))]
            viol = model.NewIntVar(0, big, f"capn_{mi}")
            if terms:
                model.Add(sum(terms) + fixed_nights[mi] <= int(cap_n) + viol)
            else:
                model.Add(fixed_nights[mi] <= int(cap_n) + viol)
            obj_terms.append(W_CAP_N * viol)

        cap_sa = m.get("maxSaturdaysMonth")
        if cap_sa is not None and isinstance(cap_sa, (int, float)):
            terms = [x[k] for k in x if k[0] == mi and js_utcdow_from_iso(dates[k[1]]) == 6]
            viol = model.NewIntVar(0, big, f"capsa_{mi}")
            if terms:
                model.Add(sum(terms) + fixed_sats[mi] <= int(cap_sa) + viol)
            else:
                model.Add(fixed_sats[mi] <= int(cap_sa) + viol)
            obj_terms.append(W_CAP_DOW * viol)

        cap_su = m.get("maxSundaysMonth")
        if cap_su is not None and isinstance(cap_su, (int, float)):
            terms = [x[k] for k in x if k[0] == mi and js_utcdow_from_iso(dates[k[1]]) == 0]
            viol = model.NewIntVar(0, big, f"capsu_{mi}")
            if terms:
                model.Add(sum(terms) + fixed_suns[mi] <= int(cap_su) + viol)
            else:
                model.Add(fixed_suns[mi] <= int(cap_su) + viol)
            obj_terms.append(W_CAP_DOW * viol)

        cap_we = m.get("maxWeekendDaysMonth")
        if cap_we is not None and isinstance(cap_we, (int, float)):
            terms = []
            for k in x:
                if k[0] != mi:
                    continue
                di = k[1]
                si = k[2]
                dte = dates[di]
                dow = js_utcdow_from_iso(dte)
                st = shift_types[si]
                if dow in (0, 6) or (bool(st.get("countsAsWeekend")) and dow in (5, 6, 0)):
                    terms.append(x[k])
            viol = model.NewIntVar(0, big, f"capwe_{mi}")
            if terms:
                model.Add(sum(terms) + fixed_we[mi] <= int(cap_we) + viol)
            else:
                model.Add(fixed_we[mi] <= int(cap_we) + viol)
            obj_terms.append(W_CAP_WE * viol)

    hw: list[list[cp_model.IntVar]] = [[model.NewBoolVar(f"hw_{mi}_{di}") for di in range(D)] for mi in range(M)]
    for mi in range(M):
        for di in range(D):
            xs = [x[(mi, di, si)] for si in range(S) if (mi, di, si) in x]
            if fixed_md[mi][di]:
                model.Add(hw[mi][di] == 1)
                if xs:
                    model.Add(sum(xs) == 0)
            else:
                if not xs:
                    model.Add(hw[mi][di] == 0)
                else:
                    sxs = sum(xs)
                    model.Add(sxs >= 1).OnlyEnforceIf(hw[mi][di])
                    model.Add(sxs == 0).OnlyEnforceIf(hw[mi][di].Not())

    for mi in range(M):
        m = members[mi]
        mid_cal = str(members[mi]["id"])
        for dte_raw in m.get("requiredDates") or []:
            dte = str(dte_raw)
            if dte not in dates:
                continue
            di = dates.index(dte)
            if fixed_md[mi][di]:
                continue
            xs_day = [x[(mi, di, si)] for si in range(S) if (mi, di, si) in x]
            if xs_day:
                model.Add(hw[mi][di] == 1)

        for req in m.get("requiredShifts") or []:
            if not isinstance(req, dict):
                continue
            dte = str(req.get("date", ""))
            sid = str(req.get("shiftTypeId", ""))
            if dte not in dates or sid not in st_by_id:
                continue
            di = dates.index(dte)
            si_match = next((i for i, st in enumerate(shift_types) if str(st["id"]) == sid), None)
            if si_match is None:
                continue
            ok_fixed = any(
                str(fa.get("memberId", "")) == mid_cal
                and str(fa.get("date", "")) == dte
                and str(fa.get("shiftTypeId", "")) == sid
                for fa in fixed
            )
            if ok_fixed:
                continue
            model.Add(x[(mi, di, si_match)] == 1)

    # Consecutivi: contano solo i giorni non-DEVE in ogni finestra (le sequenze di obblighi a mano non
    # consumano il tetto). Riposo dopo notte: non si impone su un giorno DEVE; sul giorno successivo sì.
    for mi in range(M):
        k_max = int(members[mi].get("maxConsecutiveDays") or 6)
        if k_max < 1:
            k_max = 1
        win = k_max + 1
        if D >= win:
            for start in range(0, D - win + 1):
                flex_js = [start + j for j in range(win) if not deve_day[mi][start + j]]
                if not flex_js:
                    continue
                model.Add(sum(hw[mi][j] for j in flex_js) <= k_max)

    if rest_after_night:
        night_si = {si for si, st in enumerate(shift_types) if bool(st.get("isNight"))}
        rest_days = max(1, min(int(rest_days_after_night), 3))
        for mi in range(M):
            for di in range(1, D):
                np = model.NewBoolVar(f"npn_{mi}_{di}")
                prev_fix = fixed_night_md[mi][di - 1]
                pn_vars = [x[(mi, di - 1, si)] for si in night_si if (mi, di - 1, si) in x]
                if prev_fix:
                    model.Add(np == 1)
                elif not pn_vars:
                    model.Add(np == 0)
                else:
                    model.Add(np == sum(pn_vars))
                if not deve_day[mi][di]:
                    model.AddImplication(np, hw[mi][di].Not())
                if rest_days >= 2 and di + 1 < D and not deve_day[mi][di + 1]:
                    model.AddImplication(np, hw[mi][di + 1].Not())

    # Day-of-week rules: se lavora il giorno X → fa/non fa il giorno Y
    # Per DAY_IMPLIES_DAY il lato FROM usa solo turni diurni (non notturni) per evitare
    # il conflitto con rest_after_night: es. sabato-notte → riposo domenica contraddirebbe
    # l'implicazione sabato→domenica. Chi fa notte attraversa già il giorno dopo per natura.
    night_si_set = {si for si, st in enumerate(shift_types) if bool(st.get("isNight"))}
    day_si_set = {si for si in range(S) if si not in night_si_set}
    stid_to_si = {str(st["id"]): si for si, st in enumerate(shift_types)}

    dow_viol_idx = 0
    dow_rule_slacks: list[tuple[cp_model.IntVar, dict[str, Any]]] = []

    for rule in dow_rules:
        from_dow = int(rule.get("fromDow", -1))
        to_dow = int(rule.get("toDow", -1))
        rk = str(rule.get("kind", ""))
        rule_weight = str(rule.get("weight", "HARD")).upper()
        is_soft_dow = rule_weight == "SOFT"
        rule_name_snap = str(rule.get("name") or "").strip()

        def dow_meta(mi_i: int, date_a: str, date_b: str) -> dict[str, Any]:
            out: dict[str, Any] = {
                "ruleKind": rk,
                "fromDate": date_a,
                "toDate": date_b,
                "memberId": mem_id_at[mi_i],
                "memberLabel": _member_label(mi_i),
            }
            if rule_name_snap:
                out["ruleName"] = rule_name_snap
            return out
        from_shift_type_id = str(rule.get("fromShiftTypeId", "") or "")
        to_shift_type_id = str(rule.get("toShiftTypeId", "") or "")
        from_si = stid_to_si.get(from_shift_type_id) if from_shift_type_id else None
        to_si = stid_to_si.get(to_shift_type_id) if to_shift_type_id else None
        if from_dow < 0 or to_dow < 0 or from_dow == to_dow:
            continue
        diff = (to_dow - from_dow) % 7
        for mi in range(M):
            for di in range(D):
                if js_utcdow_from_iso(dates[di]) != from_dow:
                    continue
                dte_from = dates[di]
                dj = di + diff
                if dj >= D:
                    continue
                if js_utcdow_from_iso(dates[dj]) != to_dow:
                    continue
                if rk == "DAY_IMPLIES_DAY" and deve_day[mi][dj]:
                    continue
                if rk == "DAY_EXCLUDES_DAY" and (deve_day[mi][di] or deve_day[mi][dj]):
                    continue
                if rk == "DAY_IMPLIES_DAY":
                    if from_si is not None:
                        if (mi, di, from_si) not in x:
                            continue
                        trigger = x[(mi, di, from_si)]
                    else:
                        day_xs = [x[(mi, di, si)] for si in day_si_set if (mi, di, si) in x]
                        if not day_xs:
                            continue
                        trigger = model.NewBoolVar(f"dow_day_{mi}_{di}")
                        model.Add(sum(day_xs) >= 1).OnlyEnforceIf(trigger)
                        model.Add(sum(day_xs) == 0).OnlyEnforceIf(trigger.Not())
                    if is_soft_dow:
                        if to_si is not None:
                            if (mi, dj, to_si) not in x:
                                continue
                            viol_d = model.NewBoolVar(f"dow_v_{dow_viol_idx}")
                            dow_viol_idx += 1
                            model.AddBoolOr([trigger.Not(), x[(mi, dj, to_si)], viol_d])
                        else:
                            # Guard: se il membro non può lavorare dj, salta per evitare falsi alert.
                            has_to_slots_s = any((mi, dj, si_) in x for si_ in range(S)) or fixed_md[mi][dj]
                            if not has_to_slots_s:
                                continue
                            viol_d = model.NewBoolVar(f"dow_v_{dow_viol_idx}")
                            dow_viol_idx += 1
                            model.AddBoolOr([trigger.Not(), hw[mi][dj], viol_d])
                        obj_terms.append(W_DOW_RULE_VIOL * viol_d)
                        dow_rule_slacks.append((viol_d, dow_meta(mi, dte_from, dates[dj])))
                    else:
                        if to_si is not None:
                            if (mi, dj, to_si) not in x:
                                continue
                            model.AddImplication(trigger, x[(mi, dj, to_si)])
                        else:
                            # Guard: se il membro non può lavorare dj (nessuno slot), saltare il vincolo
                            # per evitare che l'implicazione blocchi anche il giorno-origine (di).
                            has_to_slots = any((mi, dj, si_) in x for si_ in range(S)) or fixed_md[mi][dj]
                            if not has_to_slots:
                                continue
                            model.AddImplication(trigger, hw[mi][dj])
                elif rk == "DAY_EXCLUDES_DAY":
                    if is_soft_dow:
                        if from_si is not None and to_si is not None:
                            if (mi, di, from_si) not in x or (mi, dj, to_si) not in x:
                                continue
                            viol_d = model.NewBoolVar(f"dow_v_{dow_viol_idx}")
                            dow_viol_idx += 1
                            model.Add(x[(mi, di, from_si)] + x[(mi, dj, to_si)] <= 1 + 2 * viol_d)
                        elif from_si is not None:
                            if (mi, di, from_si) not in x:
                                continue
                            viol_d = model.NewBoolVar(f"dow_v_{dow_viol_idx}")
                            dow_viol_idx += 1
                            model.AddBoolOr([x[(mi, di, from_si)].Not(), hw[mi][dj].Not(), viol_d])
                        elif to_si is not None:
                            if (mi, dj, to_si) not in x:
                                continue
                            viol_d = model.NewBoolVar(f"dow_v_{dow_viol_idx}")
                            dow_viol_idx += 1
                            model.AddBoolOr([hw[mi][di].Not(), x[(mi, dj, to_si)].Not(), viol_d])
                        else:
                            viol_d = model.NewBoolVar(f"dow_v_{dow_viol_idx}")
                            dow_viol_idx += 1
                            model.AddBoolOr([hw[mi][di].Not(), hw[mi][dj].Not(), viol_d])
                        obj_terms.append(W_DOW_RULE_VIOL * viol_d)
                        dow_rule_slacks.append((viol_d, dow_meta(mi, dte_from, dates[dj])))
                    else:
                        if from_si is not None and to_si is not None:
                            if (mi, di, from_si) not in x or (mi, dj, to_si) not in x:
                                continue
                            model.Add(x[(mi, di, from_si)] + x[(mi, dj, to_si)] <= 1)
                        elif from_si is not None:
                            if (mi, di, from_si) not in x:
                                continue
                            model.AddImplication(x[(mi, di, from_si)], hw[mi][dj].Not())
                        elif to_si is not None:
                            if (mi, dj, to_si) not in x:
                                continue
                            model.AddImplication(hw[mi][di], x[(mi, dj, to_si)].Not())
                        else:
                            model.AddBoolOr([hw[mi][di].Not(), hw[mi][dj].Not()])

    rng_seed = problem.get("randomSeed")
    if isinstance(rng_seed, int):
        rng = random.Random(rng_seed % (2**32))
    elif isinstance(rng_seed, float) and rng_seed == rng_seed:
        rng = random.Random(int(rng_seed) % (2**32))
    else:
        rng = random.Random((hash(str(schedule_id)) & 0xFFFFFFFF) or 42)

    W_JOLLY = 10_000
    W_SOFT = 50
    RAND_W = 6

    for (mi, di, si), var in x.items():
        if bool(members[mi].get("isJolly")):
            obj_terms.append(W_JOLLY * var)
        sp = soft_penalty(mi, di, si)
        if sp:
            obj_terms.append(W_SOFT * sp * var)
        coef = rng.randint(0, RAND_W)
        if coef:
            obj_terms.append(coef * var)

    upper_bound = D * S + (max(fixed_tot) if fixed_tot else 0)
    tot_vars: list[cp_model.IntVar] = []
    for mi in range(M):
        t_mi = model.NewIntVar(0, upper_bound, f"tot_shifts_{mi}")
        terms = [x[k] for k in x if k[0] == mi]
        if terms:
            model.Add(t_mi == sum(terms) + fixed_tot[mi])
        else:
            model.Add(t_mi == fixed_tot[mi])
        tot_vars.append(t_mi)
    max_shifts = model.NewIntVar(0, upper_bound, "max_shifts_bal")
    min_shifts = model.NewIntVar(0, upper_bound, "min_shifts_bal")
    model.AddMaxEquality(max_shifts, tot_vars)
    model.AddMinEquality(min_shifts, tot_vars)
    spread = model.NewIntVar(0, upper_bound, "spread_bal")
    model.Add(spread == max_shifts - min_shifts)
    W_SPREAD = 400
    obj_terms.append(W_SPREAD * spread)

    if S >= 2:
        W_SHIFT_MIX = 180
        for mi in range(M):
            type_totals: list[cp_model.IntVar] = []
            for si in range(S):
                terms_st = [x[(mi, di, si)] for di in range(D) if (mi, di, si) in x]
                # Includi solo shift types dove il membro ha almeno una cella eligibile o un fisso:
                # esclude i tipi bloccati (es. solo notti per chi non può fare diurni), evitando
                # che lo spread artificiale riduca i turni per lavoratori specializzati.
                if not terms_st and fixed_by_ms[mi][si] == 0:
                    continue
                c_st = model.NewIntVar(0, upper_bound, f"cnt_type_{mi}_{si}")
                if terms_st:
                    model.Add(c_st == sum(terms_st) + fixed_by_ms[mi][si])
                else:
                    model.Add(c_st == fixed_by_ms[mi][si])
                type_totals.append(c_st)
            if len(type_totals) < 2:
                continue  # nessuno spread significativo da ottimizzare
            mx_st = model.NewIntVar(0, upper_bound, f"max_type_{mi}")
            mn_st = model.NewIntVar(0, upper_bound, f"min_type_{mi}")
            model.AddMaxEquality(mx_st, type_totals)
            model.AddMinEquality(mn_st, type_totals)
            spread_st = model.NewIntVar(0, upper_bound, f"spread_type_{mi}")
            model.Add(spread_st == mx_st - mn_st)
            obj_terms.append(W_SHIFT_MIX * spread_st)

    model.Minimize(sum(obj_terms))

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = max(3.0, float(time_limit_sec))
    status = solver.Solve(model)

    if status == cp_model.INFEASIBLE:
        alerts_out: list[dict[str, Any]] = list(pre_alerts)
        if not alerts_out:
            n_co = len(co_rules) if co_rules else 0
            n_dow = len(dow_rules) if dow_rules else 0
            n_rd = sum(len(m.get("requiredDates") or []) for m in members)
            n_rs = sum(len(m.get("requiredShifts") or []) for m in members)
            alerts_out.append(
                {
                    "type": "INFEASIBLE_HINT",
                    "message": (
                        f"Nessun dettaglio automatico dal singolo vincolo. Riepilogo nel modello: "
                        f"co-presenza/esclusione {n_co}, vincoli giorni {n_dow}, "
                        f"obblighi «lavora questo giorno» {n_rd}, obblighi «questo turno» {n_rs}. "
                        "Co-presenza «insieme» e «non insieme» e i vincoli tra giorni sono rilassabili nel target; "
                        "restano HARD: DEVE coerenti, indisponibilità, consecutivi (giorni non-DEVE), riposo dopo notte, vincoli su hw."
                    ),
                }
            )
        return {
            "status": "INFEASIBLE",
            "message": "Il solver non trova un piano che rispetti tutti i vincoli obbligatori contemporaneamente. "
            "Controlla gli avvisi sotto e la scheda persona sulla griglia.",
            "alerts": alerts_out,
        }
    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        return {
            "status": "UNKNOWN",
            "message": f"Solver terminato senza soluzione (status={solver.StatusName(status)}).",
            "alerts": list(relaxation_preface or []) + list(pre_alerts),
        }

    alerts: list[dict[str, Any]] = list(relaxation_preface or []) + list(pre_alerts)

    for slack, n, dte, sn, st_id in cover_slacks:
        sv = int(solver.Value(slack))
        if sv > 0:
            alerts.append(
                {
                    "type": "COVERAGE_SHORTFALL",
                    "message": f"Copertura: mancano {sv} assegnazioni su {dte} · {sn} (minimo {n}; "
                    "completato il possibile).",
                    "date": dte,
                    "shiftTypeId": st_id,
                    "shiftTypeName": sn,
                }
            )

    for slack, n_need, dte, sn, st_id, role in role_slacks:
        sv = int(solver.Value(slack))
        if sv > 0:
            alerts.append(
                {
                    "type": "ROLE_COVERAGE_SHORTFALL",
                    "message": f"Composizione ruoli: mancano {sv} persone con ruolo «{role}» su {dte} · {sn}.",
                    "date": dte,
                    "shiftTypeId": st_id,
                    "shiftTypeName": sn,
                    "role": role,
                    "need": n_need,
                    "missing": sv,
                }
            )

    for viol_aw, dte, sn, rlabel, st_id in always_with_slacks:
        if int(solver.Value(viol_aw)) == 1:
            d_it = _fmt_date_it(dte)
            alerts.append(
                {
                    "type": "ALWAYS_WITH_RELAXED",
                    "message": (
                        f"Dove: {d_it}, fascia «{sn}». Regola «{rlabel}» (due gruppi es. due ruoli diversi che dovrebbero stare insieme): "
                        f"non c’era modo di coprire bene anche il secondo gruppo. "
                        f"Se i gruppi sono separati (nessuna persona in comune), il motore non assegna più di una persona solo dal primo gruppo "
                        f"senza il secondo: meglio un buco che «due volte lo stesso ruolo». Controlla quel giorno e quella fascia."
                    ),
                    "date": dte,
                    "shiftTypeId": st_id,
                    "shiftTypeName": sn,
                    "ruleLabel": rlabel,
                }
            )

    for viol_nev, dte, sn, rlabel, st_id in never_with_slacks:
        if int(solver.Value(viol_nev)) == 1:
            d_it = _fmt_date_it(dte)
            alerts.append(
                {
                    "type": "NEVER_WITH_RELAXED",
                    "message": (
                        f"Dove: {d_it}, fascia «{sn}». Regola «{rlabel}» (due gruppi non devono mai stare insieme su questo turno): "
                        f"per chiudere il mese il motore ha accettato un’eccezione, quindi su quello slot possono risultare assegnati "
                        f"anche persone che in teoria andrebbero separate. Verifica a mano."
                    ),
                    "date": dte,
                    "shiftTypeId": st_id,
                    "shiftTypeName": sn,
                    "ruleLabel": rlabel,
                }
            )

    for viol_d, meta in dow_rule_slacks:
        if int(solver.Value(viol_d)) == 1:
            msg = _dow_relaxed_plain_message(meta)
            row: dict[str, Any] = {
                "type": "DOW_RULE_RELAXED",
                "message": msg,
                "ruleKind": meta.get("ruleKind"),
                "fromDate": meta.get("fromDate"),
                "toDate": meta.get("toDate"),
                "memberId": meta.get("memberId"),
                "memberLabel": meta.get("memberLabel"),
            }
            if meta.get("ruleName") is not None:
                row["ruleName"] = meta.get("ruleName")
            alerts.append(row)

    new_assign_count = [0] * M
    new_nights = [0] * M
    new_sats = [0] * M
    new_suns = [0] * M
    new_we = [0] * M
    for k, var in x.items():
        if int(solver.Value(var)) != 1:
            continue
        mi, di, si = k
        new_assign_count[mi] += 1
        dte = dates[di]
        dow = js_utcdow_from_iso(dte)
        st = shift_types[si]
        if bool(st.get("isNight")):
            new_nights[mi] += 1
        if dow == 6:
            new_sats[mi] += 1
        elif dow == 0:
            new_suns[mi] += 1
        if dow in (0, 6) or (bool(st.get("countsAsWeekend")) and dow in (5, 6, 0)):
            new_we[mi] += 1

    for mi in range(M):
        m = members[mi]
        cap = m.get("maxShiftsMonth")
        if cap is not None and isinstance(cap, (int, float)):
            c = int(cap)
            tot = new_assign_count[mi] + fixed_tot[mi]
            if tot > c:
                alerts.append(
                    {
                        "type": "CONTRACT_CAP_MONTH",
                        "message": f"{_member_label(mi)}: {tot} turni nel periodo rispetto a un tetto di {c} "
                        f"(superato di {tot - c}; necessario per chiudere il piano).",
                        "memberId": mem_id_at[mi],
                    }
                )

        cap_n = m.get("maxNightsMonth")
        if cap_n is not None and isinstance(cap_n, (int, float)):
            cn = int(cap_n)
            totn = new_nights[mi] + fixed_nights[mi]
            if totn > cn:
                alerts.append(
                    {
                        "type": "CONTRACT_CAP_NIGHTS",
                        "message": f"{_member_label(mi)}: {totn} notti nel periodo (tetto {cn}).",
                        "memberId": mem_id_at[mi],
                    }
                )

        cap_sa = m.get("maxSaturdaysMonth")
        if cap_sa is not None and isinstance(cap_sa, (int, float)):
            csa = int(cap_sa)
            tsa = new_sats[mi] + fixed_sats[mi]
            if tsa > csa:
                alerts.append(
                    {
                        "type": "CONTRACT_CAP_SAT",
                        "message": f"{_member_label(mi)}: {tsa} sabati lavorati (tetto {csa}).",
                        "memberId": mem_id_at[mi],
                    }
                )

        cap_su = m.get("maxSundaysMonth")
        if cap_su is not None and isinstance(cap_su, (int, float)):
            csu = int(cap_su)
            tsu = new_suns[mi] + fixed_suns[mi]
            if tsu > csu:
                alerts.append(
                    {
                        "type": "CONTRACT_CAP_SUN",
                        "message": f"{_member_label(mi)}: {tsu} domeniche lavorate (tetto {csu}).",
                        "memberId": mem_id_at[mi],
                    }
                )

        cap_we = m.get("maxWeekendDaysMonth")
        if cap_we is not None and isinstance(cap_we, (int, float)):
            cwe = int(cap_we)
            twe = new_we[mi] + fixed_we[mi]
            if twe > cwe:
                alerts.append(
                    {
                        "type": "CONTRACT_CAP_WEEKEND",
                        "message": f"{_member_label(mi)}: {twe} giorni weekend lavorati (tetto {cwe}).",
                        "memberId": mem_id_at[mi],
                    }
                )

    for mi in range(M):
        for dte_raw in members[mi].get("requiredDates") or []:
            dte = str(dte_raw)
            if dte not in dates:
                continue
            di = dates.index(dte)
            if int(solver.Value(hw[mi][di])) == 0:
                alerts.append(
                    {
                        "type": "REQ_DATE_MISS",
                        "message": f"{_member_label(mi)}: obbligo di lavorare il {dte} non rispettato nel piano generato.",
                        "memberId": mem_id_at[mi],
                        "date": dte,
                    }
                )

        for req in members[mi].get("requiredShifts") or []:
            if not isinstance(req, dict):
                continue
            dte = str(req.get("date", ""))
            sid = str(req.get("shiftTypeId", ""))
            if dte not in dates or sid not in st_by_id:
                continue
            di = dates.index(dte)
            si_match = next((i for i, st in enumerate(shift_types) if str(st["id"]) == sid), None)
            if si_match is None:
                continue
            if (mi, di, si_match) in x and int(solver.Value(x[(mi, di, si_match)])) == 0:
                alerts.append(
                    {
                        "type": "REQ_SHIFT_MISS",
                        "message": f"{_member_label(mi)}: obbligo turno «{st_by_id[sid].get('name') or sid}» il {dte} "
                        "non assegnato nel piano.",
                        "memberId": mem_id_at[mi],
                        "date": dte,
                        "shiftTypeId": sid,
                    }
                )

    for (mi, di, si), var in x.items():
        if int(solver.Value(var)) == 1:
            assignments_out.append(
                {
                    "memberId": mem_id_at[mi],
                    "shiftTypeId": st_id_at[si],
                    "date": dates[di],
                }
            )

    st_name = "OPTIMAL" if status == cp_model.OPTIMAL else "FEASIBLE"
    cal = _calendar_out(schedule_id or str(problem.get("scheduleId", "")), assignments_out, st_name)
    summary = (
        f"Piano calcolato con possibili compromessi ({len(alerts)} avvisi)."
        if alerts
        else "Piano calcolato senza compromessi sui vincoli pesati."
    )
    return {"status": st_name, "calendar": cal, "assignments": assignments_out, "alerts": alerts, "message": summary}


def _calendar_out(schedule_id: str, assignments: list[dict[str, str]], solver_status: str) -> dict[str, Any]:
    return {
        "schemaVersion": 1,
        "scheduleId": schedule_id,
        "assignments": assignments,
        "solverStatus": solver_status,
    }


def solve_scheduling_problem(payload: dict[str, Any]) -> dict[str, Any]:
    """Prima prova rigida; se INFEASIBLE, passate con tetti più alti, consecutivi e riposo post-notte.
    Co-presenza «insieme» è rilassabile nel target (fallback solo gruppo «if» + buco copertura). Indisponibilità sempre rispettate."""
    problem = payload.get("problem")
    schedule_id = str(payload.get("scheduleId", ""))
    if not problem or not isinstance(problem, dict):
        return {
            "status": "MODEL_INVALID",
            "message": "Payload mancante: richiesto { scheduleId, problem }.",
        }

    dates = problem.get("dates") or []
    if not dates:
        return {
            "status": "MODEL_INVALID",
            "message": "problem.dates vuoto.",
        }

    shift_types = problem.get("shiftTypes") or []
    members = problem.get("members") or []
    if len(members) == 0 or len(shift_types) == 0:
        return {"status": "MODEL_INVALID", "message": "Nessun membro o tipo turno."}

    base = copy.deepcopy(problem)

    attempts: list[tuple[str, list[dict[str, Any]], dict[str, Any]]] = [("BASE", [], {})]

    # Stesso incremento (+b) su ogni tetto mensile già definito per tutte le persone (es. 16→20 come 12→16 con +4).
    # Indisponibilità (generali + periodo + variazioni) restano sempre rigide: non si ignorano.
    cap_late = 12
    for b in (4, 8, cap_late):
        attempts.append(
            (
                f"RELAX_CAPS_PLUS_{b}",
                [
                    {
                        "type": "RELAXATION_APPLIED",
                        "message": (
                            "Con i tetti contrattuali attuali non risulta un piano fattibile. "
                            f"Aumentiamo in modo omogeneo di +{b} ogni tetto mensile già definito per ogni persona "
                            "(turni, notti, sabato, domenica, giorni weekend) — senza modificare indisponibilità — e ricalcoliamo."
                        ),
                    }
                ],
                {"members": _bump_contract_caps(base["members"], b)},
            )
        )

    attempts.append(
        (
            "RELAX_CAPS_PLUS_12_CONSEC_PLUS_2",
            [
                {
                    "type": "RELAXATION_APPLIED",
                    "message": (
                        "Estendiamo anche i giorni lavorativi consecutivi massimi (+2 per tutti), "
                        f"oltre a +{cap_late} su ogni tetto mensile già definito, per sbloccare sequenze troppo strette. "
                        "Indisponibilità invariate."
                    ),
                }
            ],
            {"members": _bump_consecutive(_bump_contract_caps(base["members"], cap_late), 2)},
        )
    )

    attempts.append(
        (
            "RELAX_NO_REST_AFTER_NIGHT",
            [
                {
                    "type": "RELAXATION_APPLIED",
                    "message": (
                        "Disattiviamo il riposo obbligatorio dopo notte in questa passata "
                        f"(con tetti +{cap_late} e consecutivi già ampliati). Indisponibilità invariate."
                    ),
                }
            ],
            {
                "members": _bump_consecutive(_bump_contract_caps(base["members"], cap_late), 2),
                "restAfterNight": False,
            },
        )
    )

    last_infeasible: dict[str, Any] | None = None
    last_unknown: dict[str, Any] | None = None

    for label, relax_msgs, patch in attempts:
        trial = copy.deepcopy(base)
        if "members" in patch:
            trial["members"] = patch["members"]
        if "restAfterNight" in patch:
            trial["restAfterNight"] = patch["restAfterNight"]
        # Rispetta timeout client (~120s): passate brevi tranne la base più lunga.
        if label == "BASE":
            tl = 40.0
        else:
            tl = 7.0

        res = _single_cp_solve(
            trial,
            schedule_id,
            relaxation_preface=relax_msgs if relax_msgs else None,
            time_limit_sec=tl,
        )
        st = res.get("status")
        if st in ("OPTIMAL", "FEASIBLE"):
            return res
        if st == "MODEL_INVALID":
            return res
        if st == "INFEASIBLE":
            last_infeasible = res
        elif st == "UNKNOWN":
            last_unknown = res

    if last_infeasible:
        base_msg = str(last_infeasible.get("message") or "")
        extra = (
            " Sono state eseguite anche passate con tetti mensili aumentati in modo omogeneo per tutti, "
            "giorni consecutivi ampliati e riposo dopo notte disattivato; le indisponibilità non sono state modificate."
        )
        out_inf = {**last_infeasible, "message": base_msg + extra}
        al = list(out_inf.get("alerts") or [])
        al.insert(
            0,
            {
                "type": "INFEASIBLE_AFTER_RELAXATIONS",
                "message": (
                    "Nessun piano nemmeno dopo il rilassamento dei soli tetti/consecutivi e (nell’ultima passata) del riposo dopo notte; "
                    "obblighi DEVE del periodo, co-presenza e regole tra giorni restano intatti. "
                    "Rivedi vincoli in conflitto o ampli il periodo."
                ),
            },
        )
        out_inf["alerts"] = al
        return out_inf
    if last_unknown:
        return last_unknown
    return {
        "status": "INFEASIBLE",
        "message": "Impossibile generare anche applicando le regole extra progressive.",
        "alerts": [],
    }

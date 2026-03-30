"""
CP-SAT (OR-Tools) per Turny — input JSON da Next (`problem`).

Obiettivo «best effort»: copertura, massimali e obblighi scheda sono soft (penalità + alert);
giorni consecutivi e riposo dopo notte restano HARD per tenere il modello compatto e veloce.
"""

from __future__ import annotations

import datetime as dt
import random
from typing import Any

from ortools.sat.python import cp_model


def js_utcdow_from_iso(date_str: str) -> int:
    """Allineamento a JS Date.getUTCDay(): domenica=0, sabato=6."""
    d = dt.date.fromisoformat(date_str)
    w = d.weekday()  # lun=0 ... dom=6
    return (w + 1) % 7


def solve_scheduling_problem(payload: dict[str, Any]) -> dict[str, Any]:
    problem = payload.get("problem")
    schedule_id = payload.get("scheduleId", "")
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
        mid_cal = str(fa.get("memberId", ""))
        if mid_cal not in mid_by_cal or sid not in st_by_id:
            return {
                "status": "MODEL_INVALID",
                "message": "fixedAssignments riferisce membro o turno inesistente.",
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

    need: dict[tuple[int, int], int] = {}
    active_cells: list[tuple[int, int]] = []
    for di, dte in enumerate(dates):
        dow = js_utcdow_from_iso(dte)
        for si, st in enumerate(shift_types):
            if dow not in st.get("activeWeekdays", []):
                continue
            sid = str(st["id"])
            min_staff = int(st.get("minStaff", 1))
            have = fixed_cell.get((dte, sid), 0)
            n = min_staff - have
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

    # Pesi: prima copertura e obblighi scheda, poi massimali e regole di riposo, poi equità.
    W_COVER = 50_000_000
    W_REQ = 40_000_000
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

        if dte in set(m.get("unavailableDates") or []):
            return True
        for p in m.get("unavailableShifts") or []:
            if str(p.get("date")) == dte and str(p.get("shiftTypeId")) == sid:
                return True
        if sid in set(m.get("unavailableShiftTypeIdsHard") or []):
            return True
        if dow in set(m.get("unavailableWeekdaysHard") or []):
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
        if sid in set(m.get("unavailableShiftTypeIdsSoft") or []):
            pen += 1
        if dow in set(m.get("unavailableWeekdaysSoft") or []):
            pen += 1
        return pen

    x: dict[tuple[int, int, int], cp_model.IntVar] = {}
    for di, si in active_cells:
        for mi in range(M):
            x[(mi, di, si)] = model.NewBoolVar(f"x_{mi}_{di}_{si}")
            if hard_blocked(mi, di, si):
                model.Add(x[(mi, di, si)] == 0)

    cover_slacks: list[tuple[cp_model.IntVar, int, str, str]] = []
    for di, si in active_cells:
        n = need[(di, si)]
        slack = model.NewIntVar(0, n, f"cov_sl_{di}_{si}")
        model.Add(sum(x[(mi, di, si)] for mi in range(M)) + slack == n)
        obj_terms.append(W_COVER * slack)
        dte = dates[di]
        sn = str(shift_types[si].get("name") or st_id_at[si])
        cover_slacks.append((slack, n, dte, sn))

    # Co-presenza / esclusione (HARD) per slot giorno×turno
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

            for di, dte in enumerate(dates):
                if date_set and dte not in date_set:
                    continue
                for si in range(S):
                    a_vars = [x[(mi, di, si)] for mi in if_mis if (mi, di, si) in x]
                    b_vars = [x[(mi, di, si)] for mi in then_mis if (mi, di, si) in x]
                    if not a_vars or not b_vars:
                        continue
                    if kind == "ALWAYS_WITH":
                        model.Add(sum(a_vars) <= len(a_vars) * sum(b_vars))
                    else:
                        for av in a_vars:
                            for bv in b_vars:
                                model.Add(av + bv <= 1)

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
            miss = model.NewBoolVar(f"miss_rd_{mi}_{di}")
            model.Add(hw[mi][di] + miss >= 1)
            obj_terms.append(W_REQ * miss)

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
            if (mi, di, si_match) in x:
                miss = model.NewBoolVar(f"miss_rs_{mi}_{di}_{si_match}")
                model.Add(x[(mi, di, si_match)] + miss >= 1)
                obj_terms.append(W_REQ * miss)
            else:
                ok_fixed = any(
                    str(fa.get("memberId", "")) == mid_cal
                    and str(fa.get("date", "")) == dte
                    and str(fa.get("shiftTypeId", "")) == sid
                    for fa in fixed
                )
                if not ok_fixed:
                    pre_alerts.append(
                        {
                            "type": "REQ_SHIFT_IMPOSSIBLE",
                            "message": f"{_member_label(mi)}: obbligo turno «{st_name}» il {dte} non assegnabile "
                            "(tipo non attivo quel giorno o slot già coperto da fisso).",
                            "memberId": mid_cal,
                            "date": dte,
                            "shiftTypeId": sid,
                        }
                    )

    # Consecutivi e riposo dopo notte restano HARD: rilassarli creava migliaia di variabili
    # (una per finestra/giorno) e il modello diventava lentissimo.
    for mi in range(M):
        k_max = int(members[mi].get("maxConsecutiveDays") or 6)
        if k_max < 1:
            k_max = 1
        win = k_max + 1
        if D >= win:
            for start in range(0, D - win + 1):
                model.Add(sum(hw[mi][start + j] for j in range(win)) <= k_max)

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
                model.AddImplication(np, hw[mi][di].Not())
                if rest_days >= 2 and di + 1 < D:
                    model.AddImplication(np, hw[mi][di + 1].Not())

    # Day-of-week rules: se lavora il giorno X → fa/non fa il giorno Y
    # Per DAY_IMPLIES_DAY il lato FROM usa solo turni diurni (non notturni) per evitare
    # il conflitto con rest_after_night: es. sabato-notte → riposo domenica contraddirebbe
    # l'implicazione sabato→domenica. Chi fa notte attraversa già il giorno dopo per natura.
    night_si_set = {si for si, st in enumerate(shift_types) if bool(st.get("isNight"))}
    day_si_set = {si for si in range(S) if si not in night_si_set}

    for rule in dow_rules:
        from_dow = int(rule.get("fromDow", -1))
        to_dow = int(rule.get("toDow", -1))
        kind = str(rule.get("kind", ""))
        if from_dow < 0 or to_dow < 0 or from_dow == to_dow:
            continue
        diff = (to_dow - from_dow) % 7
        for mi in range(M):
            for di in range(D):
                if js_utcdow_from_iso(dates[di]) != from_dow:
                    continue
                dj = di + diff
                if dj >= D:
                    continue
                if js_utcdow_from_iso(dates[dj]) != to_dow:
                    continue
                if kind == "DAY_IMPLIES_DAY":
                    # L'implicazione scatta solo se il membro lavora un turno NON notturno
                    # nel giorno FROM. I turni notturni non portano l'obbligo del giorno TO
                    # perché il riposo post-notte ha priorità.
                    day_xs = [x[(mi, di, si)] for si in day_si_set if (mi, di, si) in x]
                    if not day_xs:
                        continue
                    works_day_shift = model.NewBoolVar(f"dow_day_{mi}_{di}")
                    model.Add(sum(day_xs) >= 1).OnlyEnforceIf(works_day_shift)
                    model.Add(sum(day_xs) == 0).OnlyEnforceIf(works_day_shift.Not())
                    model.AddImplication(works_day_shift, hw[mi][dj])
                elif kind == "DAY_EXCLUDES_DAY":
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
                c_st = model.NewIntVar(0, upper_bound, f"cnt_type_{mi}_{si}")
                if terms_st:
                    model.Add(c_st == sum(terms_st) + fixed_by_ms[mi][si])
                else:
                    model.Add(c_st == fixed_by_ms[mi][si])
                type_totals.append(c_st)
            mx_st = model.NewIntVar(0, upper_bound, f"max_type_{mi}")
            mn_st = model.NewIntVar(0, upper_bound, f"min_type_{mi}")
            model.AddMaxEquality(mx_st, type_totals)
            model.AddMinEquality(mn_st, type_totals)
            spread_st = model.NewIntVar(0, upper_bound, f"spread_type_{mi}")
            model.Add(spread_st == mx_st - mn_st)
            obj_terms.append(W_SHIFT_MIX * spread_st)

    model.Minimize(sum(obj_terms))

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = 45.0
    status = solver.Solve(model)

    if status == cp_model.INFEASIBLE:
        return {
            "status": "INFEASIBLE",
            "message": "Modello interno impossibile (segnala al supporto).",
            "alerts": pre_alerts,
        }
    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        return {
            "status": "UNKNOWN",
            "message": f"Solver terminato senza soluzione (status={solver.StatusName(status)}).",
            "alerts": pre_alerts,
        }

    alerts: list[dict[str, Any]] = list(pre_alerts)

    for slack, n, dte, sn in cover_slacks:
        sv = int(solver.Value(slack))
        if sv > 0:
            alerts.append(
                {
                    "type": "COVERAGE_SHORTFALL",
                    "message": f"Copertura: mancano {sv} assegnazioni su {dte} · {sn} (minimo {n}; "
                    "completato il possibile).",
                    "date": dte,
                }
            )

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

"""Simula Mattina PS+degenza — diagnostica buchi organico."""
from __future__ import annotations

import datetime as dt
import json

from solver import solve_scheduling_problem

# Giugno 2026 (stesse date segnalate dall'utente)
dates = []
d = dt.date(2026, 6, 1)
while d.month == 6:
    dates.append(d.isoformat())
    d += dt.timedelta(days=1)

PS = "medico ps"
DEG = "medico degenza"

def make_members(n_ps: int, n_deg: int, n_other: int, *, max_shifts: int = 22):
    members = []
    i = 0
    for _ in range(n_ps):
        members.append(
            {
                "id": f"m-ps-{i}",
                "label": f"PS {i}",
                "extraAvailability": False,
                "maxShiftsMonth": max_shifts,
                "maxSaturdaysMonth": 4,
                "maxWeekendDaysMonth": 8,
            }
        )
        i += 1
    for _ in range(n_deg):
        members.append(
            {
                "id": f"m-deg-{i}",
                "label": f"DEG {i}",
                "extraAvailability": False,
                "maxShiftsMonth": max_shifts,
                "maxSaturdaysMonth": 4,
                "maxWeekendDaysMonth": 8,
            }
        )
        i += 1
    for j in range(n_other):
        members.append(
            {
                "id": f"m-oth-{j}",
                "label": f"OTH {j}",
                "extraAvailability": False,
                "maxShiftsMonth": max_shifts,
            }
        )
    return members


def role_coverage(n_ps: int, n_deg: int):
    ps_ids = [f"m-ps-{i}" for i in range(n_ps)]
    deg_ids = [f"m-deg-{i}" for i in range(n_ps, n_ps + n_deg)]
    return [
        {"role": PS, "memberIds": ps_ids, "minCount": 1},
        {"role": DEG, "memberIds": deg_ids, "minCount": 1},
    ]


def run_case(label: str, *, n_ps: int, n_deg: int, n_other: int, role_hard: bool, empty_deg_ids: bool = False):
    st_id = "st-mattina"
    rc = role_coverage(n_ps, n_deg)
    if empty_deg_ids:
        rc[1]["memberIds"] = []

    problem = {
        "scheduleId": "sim",
        "dates": dates,
        "restAfterNight": True,
        "shiftTypes": [
            {
                "id": st_id,
                "name": "Mattina",
                "minStaff": 2,
                "maxStaff": 2,
                "activeWeekdays": [0, 1, 2, 3, 4, 5, 6],
                "isNight": False,
                "roleCoverage": rc,
                **({"roleCompositionHard": True} if role_hard else {}),
            }
        ],
        "members": make_members(n_ps, n_deg, n_other),
        "fixedAssignments": [],
    }

    out = solve_scheduling_problem({"scheduleId": "sim", "problem": problem})
    by_date: dict[str, list[str]] = {}
    for a in out.get("assignments") or []:
        if a.get("shiftTypeId") != st_id:
            continue
        by_date.setdefault(a["date"], []).append(a["memberId"])

    understaff = []
    for dte in dates:
        n = len(by_date.get(dte, []))
        if n < 2:
            understaff.append((dte, n))

    meta = out.get("solveMeta") or {}
    print(f"\n=== {label} ===")
    print(f"status={out.get('status')} wall={meta.get('wallTimeSec')}s cp={meta.get('cpStatus')}")
    print(f"buchi mattina: {len(understaff)} / {len(dates)}")
    for dte, n in understaff:
        dow = dt.date.fromisoformat(dte).strftime("%a")
        print(f"  {dte} ({dow}): {n}/2 -> {by_date.get(dte, [])}")

    alerts = [a for a in (out.get("alerts") or []) if a.get("type") in ("ROLE_COVERAGE_IMPOSSIBLE", "COVERAGE_SHORTFALL", "ROLE_COVERAGE_SHORTFALL")]
    if alerts:
        print(f"alert rilevanti ({len(alerts)}):")
        for a in alerts[:8]:
            print(f"  [{a.get('type')}] {a.get('message')}")
        if len(alerts) > 8:
            print(f"  ... +{len(alerts) - 8}")


if __name__ == "__main__":
    run_case("Senza role hard (solo roleCoverage soft)", n_ps=4, n_deg=4, n_other=4, role_hard=False)
    run_case("Role hard — 4 PS + 4 degenza", n_ps=4, n_deg=4, n_other=4, role_hard=True)
    run_case("Role hard — degenza memberIds VUOTI (mismatch anagrafica)", n_ps=4, n_deg=4, n_other=4, role_hard=True, empty_deg_ids=True)
    run_case("Role hard — pochi degenza (2)", n_ps=4, n_deg=2, n_other=6, role_hard=True)
    run_case("Role hard — 1 solo degenza, cap 22", n_ps=4, n_deg=1, n_other=7, role_hard=True)
    run_case("Role hard — 4 PS + 0 degenza in team", n_ps=4, n_deg=0, n_other=8, role_hard=True)

    # Dual-role: stesso medico PS+degenza — una persona = un solo posto
    st_id = "st-mattina"
    PS_L = "medico ps"
    DEG_L = "medico degenza"
    dual_members = []
    for i in range(3):
        dual_members.append(
            {
                "id": f"dual-{i}",
                "label": f"Dual {i}",
                "extraAvailability": False,
                "maxShiftsMonth": 22,
            }
        )
    for i in range(3):
        dual_members.append(
            {
                "id": f"ps-{i}",
                "label": f"PS {i}",
                "extraAvailability": False,
                "maxShiftsMonth": 22,
            }
        )
    for i in range(3):
        dual_members.append(
            {
                "id": f"deg-{i}",
                "label": f"DEG {i}",
                "extraAvailability": False,
                "maxShiftsMonth": 22,
            }
        )
    dual_ids = [f"dual-{i}" for i in range(3)]
    ps_ids = [f"ps-{i}" for i in range(3)] + dual_ids
    deg_ids = [f"deg-{i}" for i in range(3)] + dual_ids
    problem = {
        "scheduleId": "sim-dual",
        "dates": dates,
        "restAfterNight": True,
        "shiftTypes": [
            {
                "id": st_id,
                "name": "Mattina",
                "minStaff": 2,
                "maxStaff": 2,
                "activeWeekdays": [0, 1, 2, 3, 4, 5, 6],
                "isNight": False,
                "roleCoverage": [
                    {"role": PS_L, "memberIds": ps_ids, "minCount": 1},
                    {"role": DEG_L, "memberIds": deg_ids, "minCount": 1},
                ],
                "roleCompositionHard": True,
            }
        ],
        "members": dual_members,
        "fixedAssignments": [],
    }
    out = solve_scheduling_problem({"scheduleId": "sim-dual", "problem": problem})
    understaff = sum(
        1
        for dte in dates
        if len([a for a in (out.get("assignments") or []) if a.get("date") == dte and a.get("shiftTypeId") == st_id]) < 2
    )
    print(f"\n=== Role hard — dual PS+degenza (6 persone, 3 con entrambi i ruoli) ===")
    print(f"status={out.get('status')} buchi mattina: {understaff} / {len(dates)}")

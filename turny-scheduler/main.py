"""
Turny — microservizio scheduler (OR-Tools CP-SAT + FastAPI).

Avvio locale:
  pip install -r requirements.txt
  uvicorn main:app --reload --port 8000

Body POST /generate: { "scheduleId": "...", "problem": { ... } }
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from solver import solve_scheduling_problem

app = FastAPI(title="Turny Scheduler", version="0.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class GenerateBody(BaseModel):
    scheduleId: str = ""
    problem: dict = Field(default_factory=dict)


@app.get("/health")
def health():
    return {"status": "ok", "engine": "ortools_cp_sat"}


@app.post("/generate")
def generate(body: GenerateBody):
    raw = {"scheduleId": body.scheduleId, "problem": body.problem}
    out = solve_scheduling_problem(raw)
    status = out.get("status", "ERROR")
    if status in ("INFEASIBLE", "MODEL_INVALID"):
        return {
            "status": status,
            "message": out.get("message", "Impossibile."),
            "calendar": None,
            "assignments": [],
        }
    if status in ("OPTIMAL", "FEASIBLE"):
        return {
            "status": status,
            "message": out.get("message"),
            "calendar": out.get("calendar"),
            "assignments": out.get("assignments", []),
            "alerts": out.get("alerts") or [],
        }
    return {
        "status": status,
        "message": out.get("message", "Errore solver."),
        "assignments": [],
    }

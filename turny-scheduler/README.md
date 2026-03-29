# Turny Scheduler (Python)

Microservizio **FastAPI** + **OR-Tools CP-SAT** (brain §2d). L’app Next invia lo snapshot del problema in JSON, senza leggere il database.

## Contratto `POST /generate`

Body JSON:

```json
{
  "scheduleId": "<id>",
  "problem": { "...": "vedi turni-app/lib/scheduler-problem.ts — schemaVersion, dates, shiftTypes, members, fixedAssignments, restAfterNight, calendarRules" }
}
```

Risposte:

- `status`: `OPTIMAL` | `FEASIBLE` | `INFEASIBLE` | `MODEL_INVALID` | `UNKNOWN`
- `assignments`: solo nuove assegnazioni `{ memberId, shiftTypeId, date }`
- `calendar`: oggetto standard (schemaVersion, scheduleId, assignments, solverStatus)

## Avvio locale

```bash
cd turny-scheduler
python -m venv .venv
.venv\Scripts\activate   # Windows
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

In `turni-app/.env`:

```env
SCHEDULER_SERVICE_URL=http://localhost:8000
```

## Prossimi passi

- Tradurre `Calendar.customRules` con Gemini in vincoli strutturati (output JSON controllato, no `exec`).
- Affinare vincoli (riposo ore tra turni, ecc.).

# Turny — Brain Document per Cursor
> Documento di analisi e specifica completa. Usare come riferimento primario per tutto lo sviluppo.
> Versione 1.10 — modal INFEASIBLE + hint euristiche; roadmap form turni extra/jolly dal modal (vedi §2e)

**Prodotto:** Turny
**Dominio:** turny.app (o turny.it — da verificare disponibilità)
**NEXTAUTH_URL prod:** https://turny.app
**Email from:** noreply@turny.app

---

## 1. Visione del prodotto

**Cos'è:** Un SaaS web per la gestione turni del personale, universale per settore (veterinaria, sanità, ristorazione, retail, sicurezza, ecc.).

**Il problema che risolve:** Il responsabile oggi usa Excel condiviso su Google Drive. È illeggibile, non valida nulla, non conta le ore, non gestisce i vincoli del personale, non notifica nessuno.

**Il vantaggio competitivo:** I software veterinari/gestionali non hanno un modulo turni serio. I software di turni generici sono costosi e overkill per PMI. Questo prodotto si posiziona nel mezzo: semplice da configurare, potente nella logica, con AI opzionale in fase avanzata.

**Primo cliente reale (caso pilota):** Clinica veterinaria con pronto soccorso h24, ~20 persone, 3 fasce orarie (mattina/pomeriggio/notte), più calendari separati per reparto.

---

## 2. Concetti fondamentali

### Le tre aree dell'app — flusso reale di utilizzo

```
AREA 1 — SETUP (si fa una volta, poi raramente si tocca)
  Persone    → crei l'anagrafica, assegni a calendari, imposti vincoli permanenti
  Calendari  → crei "Pronto Soccorso", "Chirurgia" ecc., configuri le fasce orarie

AREA 2 — TURNI (si fa ogni mese)
  Scegli calendario + mese → hai già persone e fasce pronte
  → incaselli manualmente o fai generare automaticamente
  → correggi con drag & drop con pannello laterale sott'occhio
  → pubblichi → diventa archivio

AREA 3 — ARCHIVIO (sempre disponibile, read-only)
  "Pronto Soccorso — Maggio 2025"
  "Pronto Soccorso — Giugno 2025"
  Ogni voce include: assegnazioni + indisponibilità mensili di quel mese
```

### Gerarchia dei dati
```
Organization (tenant SaaS)
  ├── Person (anagrafica — esiste una volta, indipendente dai calendari)
  │     └── Constraint permanente (vincoli stabili sul profilo persona)
  │
  └── Calendar (es. "Pronto Soccorso")
        ├── ShiftType (fasce orarie, possono sovrapporsi — è normale)
        ├── CalendarMember (assegnazione persona↔calendario + modalità contratto)
        └── Schedule (il turno di un mese — unità di archivio)
              ├── MonthlyConstraint (indisponibilità specifiche di quel mese)
              └── ShiftAssignment (persona × giorno × fascia oraria)
```

### Le due tipologie di vincoli — dove vivono

**Sul profilo persona (permanenti):**
Configurate dal manager nella scheda persona. Sempre attive su tutti i mesi futuri.
Es: "Marco non fa mai le notti", "Anna max 3 turni/settimana", "Luca solo mattina".

**Sul turno mensile (temporanee):**
Specifiche di un mese. Inseribili dal manager (telefonate, messaggi) o dal worker
dal proprio profilo. Vengono archiviate insieme al mese — tra sei mesi si può
rivedere perché quel turno era fatto così.
Es: "Giulia non può 15–16 giugno", "Luca ferie 20–27 giugno".

### Turni sovrapposti — comportamento normale, non un errore

In sanità i turni si sovrappongono per garantire continuità nel passaggio consegne.
Esempio reale tipico:
  Mattina:    08:00 – 16:00
  Pomeriggio: 11:00 – 19:00  ← 5h di sovrapposizione con mattina: NORMALE
  Notte:      19:00 – 08:00  ← attraversa mezzanotte: NORMALE

La sovrapposizione tra turni diversi NON è un conflitto — è voluta.

**Conflitto reale:** una persona è assegnata a DUE turni che si sovrappongono
TRA DI LORO per LEI nello stesso giorno.
Es: assegnare Giulia sia alla Mattina (08–16) che al Pomeriggio (11–19) nello
stesso giorno → CONFLITTO HARD (sarebbe al lavoro due volte dalle 11 alle 16).

**Regola implementativa in `/lib/scheduler.ts`:**
```typescript
// NON controllare se due ShiftType si sovrappongono in astratto.
// Controllare se una PERSONA specifica ha già un turno che si sovrappone
// con quello che stai per assegnarle.

function hasPersonalConflict(person, day, newShift, assignments): boolean {
  const personAssignmentsToday = assignments
    .filter(a => a.memberId === person.id && a.date === day)
  
  for (const existing of personAssignmentsToday) {
    if (shiftsOverlap(newShift, existing.shiftType)) return true
  }
  return false
}

function shiftsOverlap(a: ShiftType, b: ShiftType): boolean {
  // converte in minuti dall'inizio della giornata, gestisce mezzanotte
  const toMinutes = (t: string) => parseInt(t.split(':')[0]) * 60 + parseInt(t.split(':')[1])
  const aStart = toMinutes(a.startTime)
  const aEnd = a.durationHours * 60 + aStart  // può superare 1440 (mezzanotte)
  const bStart = toMinutes(b.startTime)
  const bEnd = b.durationHours * 60 + bStart
  return aStart < bEnd && bStart < aEnd
}
```

### Distinzione fondamentale vincoli hard/soft
- **Hard:** non negoziabili. Il sistema non può violare questi vincoli. Se non riesce a coprire tutti i turni rispettando i vincoli hard, genera un alert esplicito.
- **Soft:** preferenze. Il sistema cerca di rispettarli, ma può violarli se necessario per garantire la copertura. Ogni violazione viene registrata e mostrata al manager.

## 2c. Regole — tre livelli distinti

Turny gestisce tre livelli di regole che lo scheduler legge insieme.
Sono separati perché hanno vita, responsabile e scope diversi.

---

### LIVELLO 1 — Regole del calendario

Vivono su `Calendar.rules` (JSON). Configurate una volta, valgono per tutti i mesi.

**Regole standard (hardcoded nello scheduler Python):**

| Regola | Descrizione |
|--------|-------------|
| `rest_after_night` | Nessun turno il giorno dopo una notte |
| `saturday_night_counts_full_weekend` | Notte sab→dom = weekend completo consumato |
| `max_consecutive_days` | Giorni lavorativi consecutivi massimi |
| `min_rest_between_shifts` | Ore minime tra due turni della stessa persona |
| `max_nights_per_month` | Notti massime al mese per persona |
| `max_weekends_per_month` | Weekend massimi al mese per persona |
| `equalize_nights` | Distribuisce le notti equamente tra chi le fa |
| `equalize_weekends` | Distribuisce i weekend equamente |

**Regole personalizzate — `Calendar.customRules` (array JSON di stringhe):**

Regole scritte in italiano libero che non rientrano nelle standard.
**Gemini API** (Google) traduce in vincoli strutturati / OR-Tools al momento della generazione (preferenza prodotto: evitare `exec` di codice arbitrario; output JSON controllato).
Il codice generato viene salvato in `Schedule.generationLog.customRulesCode` per debug.

Esempio:
```json
{ "customRules": [
    "Chi fa la notte del venerdì ha il sabato libero",
    "Non si possono fare più di 2 notti consecutive",
    "Chi ha fatto più di 4 turni la settimana scorsa ha priorità per turni meno pesanti"
] }
```

**Aggiornamento schema.prisma — Calendar:**
```prisma
model Calendar {
  // campi esistenti...
  rules        Json?  // regole standard: { rest_after_night: {hours:11}, ... }
  customRules  Json?  // regole libere in italiano
  aiConfig     Json?  // contesto per Gemini: { context: 'Pronto soccorso h24...' }
}
```

---

### LIVELLO 2 — Regole del turno (ShiftType)

Vivono su `ShiftType.rules` (JSON). Specifiche per quel tipo di turno.

| Regola | Descrizione |
|--------|-------------|
| `requires_role` | Solo persone con questo ruolo (`{ role: 'veterinario' }`) |
| `max_consecutive_occurrences` | Max volte consecutive stessa persona |
| `not_after_shift` | Non assegnare a chi ha appena finito un altro turno specifico |
| `counts_as_weekend` | Questo turno conta come weekend consumato (`true`) |
| `custom` | Regola libera specifica per questo turno (tradotta da Gemini) |

**Aggiornamento schema.prisma — ShiftType:**
```prisma
model ShiftType {
  // campi esistenti...
  rules  Json?  // { requires_role: 'veterinario', counts_as_weekend: true }
}
```

---

### LIVELLO 3 — Vincoli sulla persona

Già documentati nella sezione 2. Permanenti (`Constraint`) e mensili (`MonthlyConstraint`).

---

## 2d. OR-Tools — motore di scheduling

OR-Tools è una libreria open source di Google per l'ottimizzazione matematica.
Licenza Apache 2.0 — gratuita anche per uso commerciale, nessuna royalty.
Non è AI: matematica deterministica. Stesso input = stesso output sempre.
Risolve 20 persone x 30 giorni x 3 turni in meno di 2 secondi.

### Architettura — microservizio Python sul VPS

```
Next.js  POST /api/schedules/[id]/generate
             downarrow
         http://localhost:8000/generate  (FastAPI Python)
             legge DB, costruisce modello OR-Tools
             inietta customRules tradotte da Gemini (se presenti)
             chiama solver.Solve()
             ritorna { assignments, alerts, stats, customRulesCode }
             downarrow
         Next.js salva ShiftAssignment nel DB
```

Avvio con PM2: `pm2 start 'uvicorn scheduler.main:app --port 8000' --name turny-scheduler`

### Come OR-Tools traduce i tre livelli — esempio

```python
from ortools.sat.python import cp_model
model = cp_model.CpModel()

# x[p,g,t] = 1 se persona P lavora turno T il giorno G
x = {(p,g,t): model.NewBoolVar(f'{p}_{g}_{t}')
     for p in persone for g in giorni for t in turni}

# LIVELLO 1 — rest_after_night
for p in persone:
    for g in range(len(giorni)-1):
        for t in turni:
            model.Add(x[p,g+1,t] == 0).OnlyEnforceIf(x[p,g,'notte'])

# LIVELLO 1 — max_nights_per_month: max 8 notti
for p in persone:
    model.Add(sum(x[p,g,'notte'] for g in giorni) <= 8)

# LIVELLO 2 — requires_role: solo veterinari per la notte
for p in persone:
    if ruolo[p] != 'veterinario':
        for g in giorni:
            model.Add(x[p,g,'notte'] == 0)

# LIVELLO 3 — vincolo permanente: Marco non fa mai le notti
for g in giorni:
    model.Add(x['marco',g,'notte'] == 0)

# LIVELLO 3 — vincolo mensile: Giulia indisponibile 15-16 giugno
for t in turni:
    model.Add(x['giulia',14,t] == 0)
    model.Add(x['giulia',15,t] == 0)

# COPERTURA MINIMA
for g in giorni:
    model.Add(sum(x[p,g,'mattina'] for p in persone) >= 2)
    model.Add(sum(x[p,g,'pomeriggio'] for p in persone) >= 2)
    model.Add(sum(x[p,g,'notte'] for p in persone) >= 1)

solver = cp_model.CpSolver()
solver.parameters.max_time_in_seconds = 30.0
status = solver.Solve(model)
# OPTIMAL, FEASIBLE, INFEASIBLE, UNKNOWN
```

### Regole custom — Gemini produce vincoli strutturati (non codice eseguito alla cieca)

Se `Calendar.customRules` è popolato, prima di avviare OR-Tools si può chiamare **Gemini API** con contesto (`aiConfig`) e regole in italiano. L’output desiderato è **JSON di vincoli dichiarativi** mappati dal microservizio Python su vincoli CP-SAT — **evitare `exec()`** su codice generato dall’LLM in produzione.

---

## 2e. Feasibility check — impossibile, servono altre N persone

Questo e' il controllo piu' critico per l'usabilita'.
Il sistema deve dire al manager ESATTAMENTE cosa non va e cosa servirebbe.

### Quando viene eseguito

1. **Pre-check** — analisi teorica prima di avviare OR-Tools
2. **Post-generazione** — se OR-Tools restituisce INFEASIBLE o copertura parziale
3. **Tempo reale sulla griglia** — ad ogni modifica manuale del manager

### Tipi di alert

```typescript
type FeasibilityAlert = {
  type:
    | 'NOT_ENOUGH_PEOPLE'      // persone totali insufficienti
    | 'NOT_ENOUGH_QUALIFIED'   // ruolo richiesto non coperto
    | 'COVERAGE_IMPOSSIBLE'    // copertura minima impossibile in data/turno
    | 'COVERAGE_PARTIAL'       // copertura con violazioni soft
    | 'PERSON_OVERLOADED'      // persona supererebbe il contratto
    | 'JOLLY_EXHAUSTED'        // nessun jolly disponibile
    | 'CUSTOM_RULE_CONFLICT'   // regola custom irrisolvibile
  severity: 'BLOCKING' | 'WARNING' | 'INFO'
  message: string      // 'Mar 15 Notte: servono 2 veterinari, disponibile 1'
  suggestion: string   // 'Aggiungi 1 veterinario disponibile martedi notte'
  missingCount?: number
  affectedDays?: string[]
  affectedShift?: string
}
```

### Configuratore griglia — risposta a `INFEASIBLE` / `MODEL_INVALID` (implementato)

Quando `POST /api/schedules/[scheduleId]/generate` fallisce perché il microservizio CP-SAT restituisce **nessuna soluzione** (tipicamente `INFEASIBLE`):

- La risposta JSON include `impossible: true` e, per errori 422, un oggetto **`hints`** prodotto da `lib/infeasibility-hints.ts`: conteggi euristici (es. slot ancora da coprire rispetto a `minStaff` e assegnazioni già fisse, somma dei massimali turni/mese se tutti impostati, numero di **jolly**, confronto tra max `minStaff` su uno slot e numero di membri attivi, numero di vincoli mensili, ecc.) più **suggerimenti** testuali in italiano.
- Il client (`ScheduleGridPanel`) apre un **modal** (`components/infeasible-generate-modal.tsx`): messaggio restituito dal servizio, riepilogo numerico, lista «Cosa provare», box che spiega il rapporto tra **turni extra**, **massimali** e flag **jolly**, pulsante per **aprire il calendario** (`/{orgSlug}/{calId}`) dove si modificano membri e tipi turno.
- Il solver **non** espone un motivo formale dell’impossibilità; le hint sono solo **orientative**.

**Roadmap (non implementato):** form nel modal che persista «**N turni extra**» o imposti rapidamente **jolly** / massimali via **API** senza passare dalla pagina calendario. Fino ad allora il flusso previsto è intervenire manualmente su `CalendarMember` (massimali contrattuali, `isJolly`) e su `ShiftType` (coperture minime, giorni attivi) dal dettaglio calendario.

### Pre-check (Python, gira prima di OR-Tools)

```python
def feasibility_check(schedule, members, shift_types, constraints):
    alerts = []
    days = get_days_of_month(schedule.year, schedule.month)

    for shift in shift_types:
        for day in days:
            available = [m for m in members
                         if is_available(m, day, shift, constraints)
                         and has_required_role(m, shift)]

            if len(available) < shift.min_staff:
                shortage = shift.min_staff - len(available)
                alerts.append({
                    'type': 'COVERAGE_IMPOSSIBLE',
                    'severity': 'BLOCKING',
                    'message': f'{format_day(day)} {shift.name}: servono {shift.min_staff}, disponibili {len(available)}',
                    'suggestion': f'Aggiungi {shortage} persona/e per {shift.name}, oppure riduci minStaff a {len(available)}',
                    'missingCount': shortage
                })

    # Check globale: i turni totali sono compatibili con i contratti?
    total_slots = sum(s.min_staff * len(days) for s in shift_types)
    if members:
        avg_needed = total_slots / len(members)
        contract_max = max(m.contract_shifts_month or 20 for m in members)
        if avg_needed > contract_max * 1.15:
            min_people = math.ceil(total_slots / contract_max)
            alerts.append({
                'type': 'NOT_ENOUGH_PEOPLE',
                'severity': 'WARNING',
                'message': f'Con {len(members)} persone la media e {avg_needed:.1f} turni/persona (max contratto {contract_max})',
                'suggestion': f'Servirebbero almeno {min_people} persone ({min_people - len(members)} in piu)',
                'missingCount': min_people - len(members)
            })
    return alerts
```

### Comportamento UI per severita'

**BLOCKING (rosso):** mostrato in cima, impedisce la pubblicazione.
Il manager puo' fare override con conferma esplicita:
'Pubblica comunque — sono consapevole che questi turni non sono coperti'.

**WARNING (arancione):** visibile nel pannello, non blocca la pubblicazione.
Ogni alert mostra il campo `suggestion` in verde sotto il messaggio.

**INFO (blu):** statistiche, squilibri non critici, suggerimenti ottimizzazione.

**Nella griglia:**
- Celle BLOCKING: sfondo rosso tenue + badge '0/2'
- Celle WARNING: sfondo arancione tenue + badge '1/2'
- Celle OK: sfondo verde tenue + badge '2/2'

---

## 3. Modello dati completo (schema.prisma)

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ─── TENANT ───────────────────────────────────────────────

model Organization {
  id          String   @id @default(cuid())
  name        String
  slug        String   @unique  // usato nell'URL: app.turni.com/acme-clinic
  plan        Plan     @default(FREE)
  stripeCustomerId String?
  stripeSubscriptionId String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  calendars   Calendar[]
  members     OrgMember[]
}

enum Plan {
  FREE        // 1 calendario, max 10 persone
  STARTER     // 3 calendari, max 30 persone
  PRO         // calendari illimitati, persone illimitate
  ENTERPRISE  // custom
}

// ─── UTENTI E RUOLI ───────────────────────────────────────

model User {
  id            String    @id @default(cuid())
  email         String    @unique
  name          String?
  passwordHash  String?
  emailVerified DateTime?
  image         String?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  orgMemberships    OrgMember[]
  calendarMemberships CalendarMember[]
  sessions          Session[]
  accounts          Account[]         // per OAuth futuro
}

model OrgMember {
  id        String   @id @default(cuid())
  userId    String
  orgId     String
  role      OrgRole  @default(WORKER)
  createdAt DateTime @default(now())

  user      User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  org       Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)

  @@unique([userId, orgId])
}

enum OrgRole {
  OWNER     // fondatore, accesso totale, gestisce abbonamento
  ADMIN     // gestisce org, utenti, tutti i calendari
  MANAGER   // gestisce uno o più calendari specifici
  WORKER    // vede i propri turni, invia richieste
}

// ─── CALENDARI ────────────────────────────────────────────

model Calendar {
  id          String   @id @default(cuid())
  orgId       String
  name        String                    // es. "Pronto Soccorso", "Chirurgia"
  description String?
  color       String   @default("#3B8BD4") // colore UI per distinguere i calendari
  timezone    String   @default("Europe/Rome")
  isActive    Boolean  @default(true)

  // Configurazione per lo scheduler automatico e per l'AI (fase 3)
  // Contiene: descrizione del contesto, regole speciali, note per l'AI
  aiConfig    Json?
  // Esempio aiConfig:
  // {
  //   "context": "Pronto soccorso veterinario h24, non si scende mai sotto 2 veterinari per turno",
  //   "fairnessRules": ["notti distribuite equamente", "weekend a rotazione"],
  //   "notes": "Luglio e agosto molte ferie, pianificare con anticipo"
  // }

  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  org         Organization   @relation(fields: [orgId], references: [id], onDelete: Cascade)
  shiftTypes  ShiftType[]
  members     CalendarMember[]
  schedules   Schedule[]
}

// ─── TIPI DI TURNO ────────────────────────────────────────

model ShiftType {
  id            String   @id @default(cuid())
  calendarId    String
  name          String   // es. "Mattina", "Pomeriggio", "Notte"
  startTime     String   // "08:00" — formato HH:MM, sempre ora di inizio
  endTime       String   // "16:00" — se < startTime il turno attraversa mezzanotte
  durationHours Float    // calcolato al salvataggio:
                         //   se endTime > startTime: endH - startH
                         //   se endTime < startTime: (24 - startH) + endH  ← attraversa mezzanotte
  crossesMidnight Boolean @default(false) // true se endTime < startTime
  color         String   @default("#E1F5EE")
  minStaff      Int      @default(1)  // copertura minima HARD
  maxStaff      Int?                  // copertura massima (opzionale)
  order         Int      @default(0)  // ordine nella griglia (0 = primo in alto)
  isActive      Boolean  @default(true)
  isOnCall      Boolean  @default(false) // reperibilità — stile visivo diverso

  // I turni POSSONO avere orari sovrapposti con altri turni dello stesso calendario.
  // Es: Mattina 08–16, Pomeriggio 11–19 → sovrapposizione 11–16 è NORMALE (handover).
  // Il conflitto si verifica solo se la STESSA PERSONA è assegnata a due turni
  // i cui orari si sovrappongono nello stesso giorno.

  // Requisiti di ruolo opzionali
  // { "roles": [{ "role": "veterinario", "min": 1 }, { "role": "assistente", "min": 1 }] }
  roleRequirements Json?

  createdAt     DateTime @default(now())

  calendar      Calendar          @relation(fields: [calendarId], references: [id], onDelete: Cascade)
  assignments   ShiftAssignment[]
}

// ─── MEMBRI DEL CALENDARIO ────────────────────────────────

// MODALITÀ CONTRATTO — determina l'unità primaria di misura del lavoro.
// Impatta scheduler, contatori UI, alert e report.
// SHIFTS: "devi fare 15 turni al mese" — tipico di sanità, veterinaria, sicurezza h24.
//         Le ore sono calcolate ma sono informative, non vincolanti.
// HOURS:  "devi fare 36 ore a settimana" — tipico di part-time, retail, ristorazione.
//         I turni sono il mezzo, le ore sono il vincolo.
enum ContractMode {
  SHIFTS
  HOURS
}

model CalendarMember {
  id                String       @id @default(cuid())
  calendarId        String
  userId            String
  roleInCalendar    String?      // es. "veterinario", "assistente", "reception"

  // Una sola modalità attiva per persona — l'altra coppia di campi viene ignorata
  contractMode      ContractMode @default(SHIFTS)

  // Usati quando contractMode = HOURS
  contractHoursWeek  Float?      // es. 40.0
  contractHoursMonth Float?      // es. 160.0 — alternativo a week

  // Usati quando contractMode = SHIFTS
  contractShiftsMonth Int?       // es. 15 — più comune in ambito sanitario
  contractShiftsWeek  Int?       // es. 5 — alternativo a month

  // Limiti legali/sindacali — SEMPRE validi indipendentemente dal contractMode
  // Sono vincoli HARD di legge italiana/europea — non saltabili mai
  maxHoursWeekLegal       Float @default(48)   // Dir. EU 2003/88: max 48h/settimana media
  minRestHoursBetweenShifts Float @default(11) // Legge italiana: 11h riposo minimo tra turni
  maxConsecutiveDays      Int   @default(6)    // Max giorni consecutivi senza riposo

  isActive          Boolean  @default(true)
  isJolly           Boolean  @default(false)
  joinedAt          DateTime @default(now())

  calendar     Calendar     @relation(fields: [calendarId], references: [id], onDelete: Cascade)
  user         User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  constraints         Constraint[]
  monthlyConstraints  MonthlyConstraint[]
  assignments         ShiftAssignment[]

  @@unique([calendarId, userId])
}

// ─── VINCOLI ──────────────────────────────────────────────

model Constraint {
  id          String         @id @default(cuid())
  memberId    String
  type        ConstraintType
  weight      ConstraintWeight @default(SOFT)
  value       Json           // struttura dipende dal tipo (vedi sotto)
  validFrom   DateTime?      // null = permanente
  validTo     DateTime?      // null = permanente
  note        String?        // spiegazione leggibile
  createdBy   String?        // userId di chi ha creato il vincolo
  createdAt   DateTime       @default(now())

  member      CalendarMember @relation(fields: [memberId], references: [id], onDelete: Cascade)
}

enum ConstraintType {
  // Indisponibilità
  UNAVAILABLE_DATE        // value: { "date": "2025-06-15" }
  UNAVAILABLE_DATES       // value: { "dates": ["2025-06-15", "2025-06-16"] }
  UNAVAILABLE_DATERANGE   // value: { "from": "2025-06-10", "to": "2025-06-20" }
  UNAVAILABLE_WEEKDAY     // value: { "weekday": 1 } // 0=dom, 1=lun...
  UNAVAILABLE_SHIFT       // value: { "shiftTypeId": "xxx" } // es. mai le notti
  PREFER_SHIFT            // value: { "shiftTypeId": "xxx" }
  MAX_HOURS_WEEK          // value: { "hours": 36 } — solo per contractMode HOURS
  MAX_HOURS_MONTH         // value: { "hours": 140 } — solo per contractMode HOURS
  MAX_SHIFTS_MONTH        // value: { "shifts": 15 } — solo per contractMode SHIFTS
  MAX_SHIFTS_WEEK         // value: { "shifts": 5 } — solo per contractMode SHIFTS
  MAX_CONSECUTIVE_DAYS    // value: { "days": 5 }
  MIN_REST_HOURS          // value: { "hours": 11 } // riposo minimo tra turni
  NO_WEEKEND              // value: {} // mai sabato/domenica
  PREFER_NO_WEEKEND       // value: {}
  FIXED_DAYS              // value: { "weekdays": [1, 2, 3] } // solo lun/mar/mer
  ONLY_MORNING            // value: {} // shortcut per PREFER_SHIFT mattina
  ONLY_AFTERNOON          // value: {}
  CUSTOM                  // value: { "description": "testo libero per l'AI" }
}

enum ConstraintWeight {
  HARD    // non violabile
  SOFT    // preferenza, può essere violata con alert
}

// ─── SCHEDULE (CALENDARIO MENSILE) ────────────────────────

model Schedule {
  id           String         @id @default(cuid())
  calendarId   String
  year         Int
  month        Int            // 1-12
  status       ScheduleStatus @default(DRAFT)
  publishedAt  DateTime?
  publishedBy  String?        // userId

  // Log generazione automatica — archiviato insieme al mese:
  // {
  //   generatedAt: "2025-05-01T10:00:00Z",
  //   alerts: [...],
  //   violations: [...],
  //   stats: { avgShifts: 15, avgHours: 112, nightsPerPerson: {...} }
  // }
  generationLog Json?

  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  calendar             Calendar             @relation(fields: [calendarId], references: [id], onDelete: Cascade)
  assignments          ShiftAssignment[]
  monthlyConstraints   MonthlyConstraint[]  // indisponibilità specifiche di questo mese

  @@unique([calendarId, year, month])
}

// Indisponibilità mensili — separate dai vincoli generali della persona.
// Archiviate con il Schedule: quando il mese viene archiviato, queste rimangono
// come storico di "chi era indisponibile e perché in quel mese".
model MonthlyConstraint {
  id           String         @id @default(cuid())
  scheduleId   String
  memberId     String
  type         ConstraintType
  weight       ConstraintWeight @default(HARD)
  value        Json
  isOverride   Boolean        @default(false)
  // isOverride = true significa che questo record IGNORA un vincolo generale esistente.
  // Es: Marco ha vincolo generale "no notti" ma per questo mese
  // il manager ha forzato una notte come disponibile.
  // Viene mostrato in arancione ovunque nell'UI.
  // Non modifica mai il vincolo generale — vale solo per questo Schedule.
  overriddenConstraintId String? // ref al Constraint generale che si sta ignorando
  note         String?
  createdBy    String?
  createdAt    DateTime       @default(now())

  schedule     Schedule       @relation(fields: [scheduleId], references: [id], onDelete: Cascade)
  member       CalendarMember @relation(fields: [memberId], references: [id], onDelete: Cascade)
}

enum ScheduleStatus {
  DRAFT       // in lavorazione, visibile solo al manager
  PUBLISHED   // visibile a tutto il personale
  ARCHIVED    // mese passato, read-only
}

// ─── INDISPONIBILITÀ MENSILI ─────────────────────────────
// Separate dai Constraint permanenti (che stanno su CalendarMember).
// Archiviate con lo Schedule — fanno parte della "fotografia" di quel mese.
// Inseribili dal manager o dal worker, in qualsiasi momento prima della pubblicazione.

model MonthlyConstraint {
  id          String         @id @default(cuid())
  scheduleId  String         // appartiene a questo mese specifico
  memberId    String         // la persona a cui si riferisce
  type        ConstraintType // stesso enum dei Constraint permanenti
  weight      ConstraintWeight @default(SOFT)
  value       Json           // stessa struttura dei Constraint permanenti
  note        String?        // "me l'ha detto al telefono", "richiesta via app"
  createdBy   String?        // userId di chi l'ha inserita
  createdAt   DateTime       @default(now())

  schedule    Schedule       @relation(fields: [scheduleId], references: [id], onDelete: Cascade)
  member      CalendarMember @relation(fields: [memberId], references: [id], onDelete: Cascade)
}

// ─── ASSEGNAZIONI ─────────────────────────────────────────

model ShiftAssignment {
  id            String           @id @default(cuid())
  scheduleId    String
  shiftTypeId   String
  memberId      String
  date          DateTime         // solo la data, ora viene da ShiftType
  status        AssignmentStatus @default(CONFIRMED)
  note          String?
  isAutoGenerated Boolean        @default(false) // true se generato dallo scheduler
  createdAt     DateTime         @default(now())
  updatedAt     DateTime         @updatedAt

  schedule      Schedule         @relation(fields: [scheduleId], references: [id], onDelete: Cascade)
  shiftType     ShiftType        @relation(fields: [shiftTypeId], references: [id])
  member        CalendarMember   @relation(fields: [memberId], references: [id])

  swapRequests  SwapRequest[]    @relation("OriginalAssignment")

  @@unique([scheduleId, shiftTypeId, memberId, date])
}

enum AssignmentStatus {
  CONFIRMED   // assegnazione attiva
  SWAP_PENDING // richiesta di scambio in corso
  CANCELLED   // rimossa
}

// ─── SCAMBI TURNO ─────────────────────────────────────────

model SwapRequest {
  id                   String      @id @default(cuid())
  originalAssignmentId String
  requestedById        String      // chi vuole cedere il turno
  targetMemberId       String?     // a chi vuole cederlo (null = aperto a tutti)
  status               SwapStatus  @default(PENDING)
  note                 String?
  managerApprovedAt    DateTime?
  managerApprovedBy    String?
  createdAt            DateTime    @default(now())
  updatedAt            DateTime    @updatedAt

  originalAssignment   ShiftAssignment @relation("OriginalAssignment", fields: [originalAssignmentId], references: [id])
}

enum SwapStatus {
  PENDING             // in attesa di risposta dal collega
  ACCEPTED_BY_TARGET  // il collega ha accettato, attende approvazione manager
  APPROVED            // manager ha approvato, scambio effettivo
  REJECTED            // rifiutato dal collega o dal manager
  CANCELLED           // annullato da chi ha fatto la richiesta
}

// ─── NOTIFICHE ────────────────────────────────────────────

model Notification {
  id        String           @id @default(cuid())
  userId    String
  type      NotificationType
  title     String
  body      String
  isRead    Boolean          @default(false)
  link      String?          // URL relativo a cui puntare al click
  createdAt DateTime         @default(now())

  // Non serve relazione esplicita con User per semplicità
}

enum NotificationType {
  SCHEDULE_PUBLISHED    // il calendario del mese è stato pubblicato
  SCHEDULE_UPDATED      // il calendario è stato modificato dopo la pubblicazione
  SWAP_REQUEST_RECEIVED // hai ricevuto una richiesta di scambio
  SWAP_REQUEST_ACCEPTED // il collega ha accettato il tuo scambio
  SWAP_REQUEST_APPROVED // il manager ha approvato lo scambio
  SWAP_REQUEST_REJECTED
  CONSTRAINT_REMINDER   // reminder: inserisci le tue indisponibilità per il mese prossimo
  SYSTEM               // notifiche di sistema
}

// ─── SESSIONI (NextAuth) ──────────────────────────────────

model Session {
  id           String   @id @default(cuid())
  sessionToken String   @unique
  userId       String
  expires      DateTime
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model Account {
  id                String  @id @default(cuid())
  userId            String
  type              String
  provider          String
  providerAccountId String
  refresh_token     String?
  access_token      String?
  expires_at        Int?
  token_type        String?
  scope             String?
  id_token          String?
  session_state     String?
  user              User    @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([provider, providerAccountId])
}

model VerificationToken {
  identifier String
  token      String   @unique
  expires    DateTime

  @@unique([identifier, token])
}
```

---

## 4. Ruoli e permessi dettagliati

### Matrice permessi completa

| Azione | OWNER | ADMIN | MANAGER | WORKER |
|--------|-------|-------|---------|--------|
| Gestire abbonamento/fatturazione | ✓ | — | — | — |
| Invitare/rimuovere utenti org | ✓ | ✓ | — | — |
| Cambiare ruoli utenti | ✓ | ✓ | — | — |
| Creare/eliminare calendari | ✓ | ✓ | — | — |
| Vedere tutti i calendari org | ✓ | ✓ | solo assegnati | solo assegnati |
| Configurare ShiftType | ✓ | ✓ | ✓ | — |
| Aggiungere/rimuovere persone dal calendario | ✓ | ✓ | ✓ | — |
| Impostare vincoli base dei lavoratori | ✓ | ✓ | ✓ | — |
| Creare/modificare bozza Schedule | ✓ | ✓ | ✓ | — |
| Eseguire auto-generazione turni | ✓ | ✓ | ✓ | — |
| Pubblicare Schedule | ✓ | ✓ | ✓ | — |
| Vedere Schedule pubblicato | ✓ | ✓ | ✓ | ✓ (solo il proprio) |
| Vedere Schedule altrui | ✓ | ✓ | ✓ | — |
| Inserire proprie richieste mensili | ✓ | ✓ | ✓ | ✓ |
| Vedere richieste degli altri | ✓ | ✓ | ✓ | — |
| Richiedere scambio turno | ✓ | ✓ | ✓ | ✓ |
| Approvare scambi turno | ✓ | ✓ | ✓ | — |
| Vedere report ore/statistiche | ✓ | ✓ | ✓ | solo proprie |
| Esportare calendario (PDF/Excel) | ✓ | ✓ | ✓ | solo proprio |

### Vista WORKER (personale)
Il worker ha una dashboard semplificata:
- **I miei turni questo mese:** vista lista o mini-calendario con solo i propri turni
- **Richiesta indisponibilità:** form per inviare richieste per il mese successivo (con deadline configurabile dal manager)
- **Scambi:** richieste di scambio inviate/ricevute
- **Notifiche:** alert quando il calendario viene pubblicato o modificato
- **Storico:** i propri turni dei mesi passati

Il worker NON vede: i turni degli altri (a meno che il manager non lo abiliti a livello di calendario), le ore degli altri, le richieste degli altri.

**Opzione visibilità calendario:** Il manager può abilitare per ogni calendario la visibilità pubblica (tutto il team vede tutti i turni) o privata (ognuno vede solo i propri). Default: pubblica, come avviene ora con il Drive condiviso.

---

## 5. Logica scheduler automatico (senza AI)

### Principio
Lo scheduler è un algoritmo deterministico di constraint satisfaction. Non serve un LLM per questo — serve logica di ottimizzazione. L'AI (es. **Gemini**) entra solo come layer opzionale sopra (traduzione regole in linguaggio naturale → vincoli).

### Algoritmo di generazione (da implementare in `/lib/scheduler.ts`)

```
FUNZIONE generateSchedule(calendarId, year, month):

  1. CARICA tutti i ShiftType del calendario (con minStaff, maxStaff)
  2. CARICA tutti i CalendarMember attivi
  3. CARICA tutti i Constraint attivi per il mese (permanenti + mensili)
  4. GENERA lista di tutti i giorni del mese
  5. INIZIALIZZA griglia vuota: { [data]: { [shiftTypeId]: [] } }

  5b. CARICA indisponibilità mensili da MonthlyConstraint per questo Schedule

  6. PER OGNI GIORNO del mese:
     PER OGNI SHIFT TYPE (in ordine di `order`):
       TROVA persone disponibili = tutti i membri attivi

       // VINCOLI HARD — esclusione totale (4 regole, non una di più)
       //
       // 1. Indisponibilità per quel giorno
       ESCLUDI chi ha MonthlyConstraint UNAVAILABLE_* che copre questo giorno
       ESCLUDI chi ha Constraint generale UNAVAILABLE_* che copre questo giorno
       //
       // 2. Vincolo su tipo di turno
       ESCLUDI chi ha UNAVAILABLE_SHIFT per questo specifico shiftTypeId
       //
       // 3. Limiti contrattuali raggiunti
       ESCLUDI chi ha già raggiunto MAX_SHIFTS_MONTH o MAX_HOURS_MONTH (se hard)
       ESCLUDI chi ha superato MAX_CONSECUTIVE_DAYS
       //
       // 4. Duplicato identico — ma questo non arriva mai qui:
       //    il DB lo impedisce con @@unique([scheduleId, shiftTypeId, memberId, date])
       //    È un errore di dati, non una regola di business.

       // ALERT (non esclusione) — segnalato ma non bloccante
       SEGNALA se la persona è già assegnata a UN ALTRO turno oggi:
         → tipo: DOUBLE_SHIFT_WARNING
         → messaggio: "Franco è già al turno Mattina oggi — doppio turno?"
         → il manager può confermare con flag allowDoubleShift=true sull'assegnazione
         → se confermato, l'alert scompare e rimane solo una nota visiva sul chip

       ORDINA disponibili per PRIORITÀ:
         1. Chi ha meno ore assegnate nel mese (equità)
         2. Chi preferisce questo turno (PREFER_SHIFT soft)
         3. Chi ha fatto meno weekend (equità weekend)
         4. Chi ha fatto meno notti (equità notti)

       ASSEGNA i primi N disponibili (fino a minStaff)

       SE disponibili < minStaff:
         REGISTRA alert: {
           type: "COVERAGE_IMPOSSIBLE",
           date: ...,
           shiftTypeId: ...,
           required: minStaff,
           available: disponibili.length,
           reason: "Vincoli hard impediscono copertura"
         }

### Logica scheduler — differenza tra SHIFTS e HOURS

**Il contractMode cambia cosa lo scheduler ottimizza come priorità:**

```
MODALITÀ SHIFTS (es. clinica veterinaria):
  Vincolo primario:   "questa persona deve fare N turni al mese"
  Vincolo secondario: le ore sono calcolate e mostrate ma NON bloccano
  Equità calcolata su: numero di turni (chi ne ha di meno ha priorità)
  Alert primari: SHIFTS_UNDER_CONTRACT, SHIFTS_OVER_CONTRACT
  Alert secondari: HOURS_OVER_LEGAL (solo se sfora il limite di legge 48h/sett)

  Esempio: Marco deve fare 15 turni/mese.
  Lo scheduler conta i turni assegnati, non le ore.
  Se Marco ha 10 turni e Giulia ne ha 18, Marco ha priorità.
  Le ore vengono mostrate per informazione ma non fermano nulla.

MODALITÀ HOURS (es. part-time retail):
  Vincolo primario:   "questa persona deve fare N ore a settimana/mese"
  Vincolo secondario: i turni sono il mezzo per raggiungere le ore
  Equità calcolata su: ore assegnate (chi ne ha di meno ha priorità)
  Alert primari: HOURS_UNDER_CONTRACT, HOURS_OVER_CONTRACT

ENTRAMBE LE MODALITÀ — vincoli legali SEMPRE HARD:
  - minRestHoursBetweenShifts (default 11h): non si può assegnare un turno
    se non sono passate almeno 11h dal termine del turno precedente.
    Questo è indipendente dal contractMode — è legge.
  - maxConsecutiveDays (default 6): dopo 6 giorni consecutivi
    il lavoratore DEVE avere un giorno di riposo.
  - maxHoursWeekLegal (default 48h): anche in modalità SHIFTS,
    se in una settimana si superano 48h lo scheduler genera alert ERROR.
```

### Contatori UI — cosa mostrare nella griglia

**Per ogni persona, la colonna finale della griglia mostra:**

```typescript
// In modalità SHIFTS:
// Primario: "12 / 15 turni"  (turni assegnati / turni contratto)
// Secondario (piccolo, grigio): "84h"  (ore calcolate, informative)

// In modalità HOURS:
// Primario: "128 / 160h"  (ore assegnate / ore contratto mese)
// Secondario (piccolo, grigio): "16 turni"  (numero turni, informativo)

// Il colore del contatore primario:
// Verde: entro il 95-105% del target
// Arancione: sotto l'85% o sopra il 110%
// Rosso: sotto il 70% o sopra il 120%, o violazione legale
```

**Il Calendar stesso ha un flag `defaultContractMode`** che pre-imposta la modalità per i nuovi membri aggiunti, ma ogni membro può avere la propria modalità indipendente. Nello stesso calendario possono coesistere persone a turni e persone a ore.

```prisma
// Aggiunta al model Calendar:
defaultContractMode ContractMode @default(SHIFTS)
```

### Comportamento post-generazione
1. Lo scheduler genera sempre una bozza, anche se incompleta
2. Tutti gli alert vengono mostrati nella UI con spiegazione chiara
3. Il manager può correggere manualmente le lacune segnalate
4. Può rigenerare completamente o per singolo giorno
5. Ogni rigenerazione sovrascrive solo le celle non modificate manualmente (flag `isAutoGenerated`)

---

## 6. Visualizzazione — le due viste principali

### Vista A: Griglia per fascia oraria (vista operativa)
**Quando si usa:** costruzione del calendario, controllo copertura giornaliera

**Layout:**
- Asse X: giorni del mese (colonne), con evidenza sabato/domenica
- Asse Y: fasce orarie (righe), nell'ordine definito dal manager
- Celle: nomi delle persone assegnate a quella fascia quel giorno
- Sopra ogni colonna di fascia: badge copertura (es. "2/2" verde, "1/2" rosso)
- Sotto la griglia: riga per ogni persona con i chip dei turni e contatore ore

**Funzionalità interattive:**
- Click su "+" in una cella → pannello picker persone disponibili
- Click su nome in cella → rimuovi o dettaglio
- Badge copertura rosso → click per vedere chi manca e perché
- Chip arancione → vincolo violato, hover per dettaglio
- Toggle vista settimana / mese intero
- Navigazione mese precedente/successivo

### Vista B: Griglia per persona (vista amministrativa/mensile)
**Quando si usa:** controllo turni/ore, ferie, equità, export

**Layout:**
- Asse X: giorni del mese
- Asse Y: persone (righe)
- Celle: chip turno (M/P/N) o vuoto (riposo)
- Colonna finale: contatore PRIMARIO (turni o ore, dipende da contractMode della persona)
- Sotto il numero primario: contatore secondario in grigio piccolo
- Righe inferiori: statistiche aggregate (notti totali, weekend totali, media turni/ore)

**Esempio colonna finale per persona in modalità SHIFTS:**
```
12 / 15 turni   ← primario, colorato (verde/arancione/rosso)
84h             ← secondario, grigio, informativo
```

**Esempio colonna finale per persona in modalità HOURS:**
```
128 / 160h      ← primario
16 turni        ← secondario, grigio, informativo
```

**Le due viste mostrano gli stessi dati, sono sempre sincronizzate.**

### Interattività della griglia — regole fondamentali

**Principio cardine:** lo scheduler automatico genera sempre una bozza. Il manager ha sempre e comunque l'ultima parola — può modificare qualsiasi cella in qualsiasi momento, anche dopo la pubblicazione.

**Drag & drop:**
- Trascina un chip persona da una cella a un'altra (stesso giorno, turno diverso) → sposta l'assegnazione
- Trascina da un giorno a un altro → sposta su data diversa
- Se la destinazione viola un vincolo HARD → animazione di rifiuto (shake), il chip torna al posto originale, tooltip con spiegazione
- Se viola un vincolo SOFT → si sposta, appare badge arancione sul chip e alert nel pannello laterale
- Trascina fuori dalla griglia (zona "rimuovi") → elimina l'assegnazione

**Click su cella vuota / "+":**
- Apre il pannello laterale in modalità "picker" per quella cella
- Mostra lista persone con disponibilità, ore attuali, vincoli attivi

**Click su chip persona:**
- Seleziona la persona → pannello laterale mostra dettaglio (ore mese, turni assegnati, vincoli)
- Tasto destro o long press → menu contestuale: Rimuovi / Sostituisci / Vedi profilo

**Undo:** Ctrl+Z annulla l'ultima azione sulla griglia (almeno 10 livelli di history). Fondamentale per il drag & drop — errori accidentali sono frequenti.

**Modifiche manuali vs automatiche:**
- Le celle modificate manualmente hanno un indicatore visivo sottile (punto nell'angolo)
- La rigenerazione automatica NON sovrascrive mai le celle modificate manualmente (`isAutoGenerated: false`)
- Il manager può resettare una cella specifica all'ultimo stato auto-generato
- Può anche resettare tutto il mese e rigenerare da zero

**Jolly:**
- Possono essere più di uno per calendario — nessun limite
- Nella griglia i jolly hanno un badge visivo distinto (es. stella o colore diverso sul chip)
- Nel pannello laterale c'è una sezione dedicata "Jolly disponibili oggi"

### Pannello laterale contestuale (sempre visibile mentre si lavora sulla griglia)

Il pannello è fisso a destra della griglia, si aggiorna in tempo reale in base alla selezione attiva. Ha 4 modalità che si attivano automaticamente:

**Modalità DEFAULT (nessuna selezione):**
- Statistiche mese in corso: % copertura, ore medie, numero alert
- Lista alert attivi ordinati per gravità (ERROR prima, poi WARNING)
- Sezione "Jolly disponibili" con stato di ogni jolly
- Bottone "Genera automaticamente" / "Rigenera"

**Modalità CELLA SELEZIONATA (click su cella o "+"):**
- Header: giorno + fascia oraria selezionata
- Copertura attuale: "1/2 — manca 1 persona"
- Lista persone DISPONIBILI per quella cella:
  - Nome, ruolo, ore già assegnate questo mese
  - Badge verde "disponibile" / arancione "vincolo soft" / rosso "vincolo hard"
  - Per ogni vincolo violato: spiegazione leggibile ("ha già 5 giorni consecutivi", "preferisce mattina")
  - I jolly in fondo alla lista, separati
- Lista persone NON DISPONIBILI (collassabile) con motivo
- Click su persona → aggiunge alla cella

**Modalità PERSONA SELEZIONATA (click su chip):**
- Nome, ruolo, flag jolly
- Ore assegnate questo mese vs ore contrattuali (barra progresso)
- Numero notti, numero weekend
- Mini calendario del mese con i suoi turni evidenziati (compatto)
- Lista vincoli attivi (permanenti + mensili)
- Alert specifici per questa persona
- Bottone "Rimuovi da questo turno" / "Sostituisci"

**Modalità ALERT SELEZIONATO (click su alert):**
- Descrizione completa dell'alert
- Giorni/turni coinvolti evidenziati nella griglia
- Suggerimenti concreti: "Puoi assegnare: Marco V. (disponibile, 32h questo mese)"
- Bottone "Applica suggerimento" per risolvere con un click

### Vista C: Vista personale (WORKER)
- Mini calendario mensile con i propri turni evidenziati
- Lista turni in ordine cronologico
- Ore totali mese
- Pulsante "Invia indisponibilità"

### Vista D: Dashboard manager
- Card riassuntive: giorni coperti/totali, conflitti aperti, richieste pendenti
- Alert scheduler in evidenza
- Scadenza raccolta richieste (countdown)
- Link rapido a calendario mese corrente e prossimo

---

## 6b. Struttura schermate — navigazione e flusso Schedule

### Le tre aree della sidebar

**Area 1 — Persone** (`/[orgSlug]/people`)
Gestione anagrafica centralizzata. Crea/modifica utenti, assegnali ai calendari,
imposta i vincoli GENERALI permanenti per ogni persona su ogni calendario.
Questa è l'unica schermata dove si toccano i vincoli permanenti.

**Area 2 — Calendari** (`/[orgSlug]/calendars`)
Configurazione dei calendari. Crea/modifica Calendar, definisci i ShiftType
(nome, orari, minStaff, colori), gestisci i membri assegnati.

**Area 3 — Turni** (`/[orgSlug]/calendars/[calId]/schedules`)
L'area operativa. Lista degli Schedule archiviati per quel calendario:
```
Pronto Soccorso
├── Giugno 2025      [BOZZA]      → apri
├── Maggio 2025      [PUBBLICATO] → visualizza / archivia
├── Aprile 2025      [ARCHIVIATO] → sola lettura
└── ...
```

---

### Flusso interno di uno Schedule — 3 passi in sequenza

Aprendo uno Schedule si entra sempre dal Passo 1.
Si può passare avanti e indietro liberamente, ma l'ordine logico è questo:

```
PASSO 1 → PASSO 2 → PASSO 3
Disponibilità   Griglia turni   Report/Pubblica
```

---

### PASSO 1 — Disponibilità per questo turno

**Cosa NON è:** la scheda persona, non si modificano i vincoli generali permanenti.

**Cosa È:** la scheda disponibilità di ogni persona per QUESTO specifico
Schedule (es. "Giugno 2025 — Pronto Soccorso"). Esiste solo per questo mese.
Parte precompilata dai vincoli generali della persona, ma tutto modificabile
liberamente qui. Le modifiche non toccano mai la scheda persona.

**Layout:**
- Lista persone a sinistra, una card per ciascuna.
  Ogni card mostra: nome, ruolo, barra disponibilità (giorni liberi / tot giorni mese).
  Badge arancione warning se ha pochi giorni disponibili.
  Click su una persona → apre la sua scheda disponibilità a destra.

- Scheda disponibilità (parte destra, non è un modale overlay):
  Header: "Marco V. — Disponibilità Giugno 2025"  ← titolo sempre esplicito
  Sottotitolo: ruolo nel calendario

  Una riga per ogni giorno del mese:
  ```
  [Lun 01/06] [✓] [Mattina] [Pomeriggio] [Notte]
  [Mar 02/06] [✓] [Mattina] [Pomeriggio] [Notte]
  [Mer 03/06] [✕] [Mattina] [Pomeriggio] [Notte]   ← tutto il giorno bloccato
  [Gio 04/06] [~] [Mattina] [...........]  [Notte]  ← solo pomeriggio bloccato
  ```

  Stato turno verde = disponibile
  Stato turno grigio pieno = non disponibile per questo mese
  Stato turno tratteggiato = vincolo generale precompilato (modificabile qui,
    ma la modifica vale solo per questo mese — non tocca il vincolo permanente)

  Quadratino a sinistra del giorno:
  ✓ = tutti i turni disponibili → click → blocca tutto il giorno → ✕
  ✕ = tutto bloccato → click → libera tutto → ✓
  ~ = stato misto → click → blocca tutto → ✕

  Click su un singolo turno → toggle quel turno specifico

  Footer scheda:
  - Bottone "Reset" → ripristina allo stato dei vincoli generali della persona
  - Bottone "Salva per questo mese" ← wording esplicito, mai solo "Salva"

**Queste disponibilità:**
- Valgono SOLO per questo Schedule — non per i mesi successivi
- Si archiviano con lo Schedule (storico immutabile)
- NON modificano i vincoli generali sulla scheda persona
- Per cambiare un vincolo permanente → Area Persone

Bottone fine pagina: **"Vai alla griglia →"** → Passo 2.

---

### PASSO 2 — Griglia turni

L'area operativa dove si costruisce il calendario.

**Layout a tre colonne:**

```
[Lista persone] | [Griglia giorni × turni] | [Pannello alert/stats]
   130px        |        flex 1            |       180px
```

**Colonna sinistra — lista persone:**
Una card per ogni membro del calendario, ordinate per disponibilità residua
(chi ha più giorni liberi in cima — è più facile da piazzare).
Ogni card: nome, ruolo, barra disponibilità, badge turni già assegnati.
Jolly: bordo/stella dorata.
Le persone sono TRASCINABILI → drag verso la griglia per assegnare.
Click sulla persona → apre popup di consultazione rapida (read-only)
con la sua scheda disponibilità del Passo 1.

**Colonna centrale — griglia:**
Righe = turni del calendario (Mattina / Pomeriggio / Notte)
Colonne = giorni del mese
Sopra ogni cella: badge copertura (es. "2/2" verde, "1/2" rosso)
Nelle celle: chip con il nome della persona assegnata

Chip: colore per turno (verde mattina, blu pomeriggio, viola notte)
      bordo dorato se è un jolly
      bordo arancione tratteggiato se viola un vincolo soft
Click su chip → seleziona persona, aggiorna pannello destro
Click "+" in cella vuota → aggiunge da lista picker
Drag chip da cella a cella → sposta assegnazione
Drag chip fuori dalla griglia → rimuove
Ctrl+Z → annulla ultima azione (10 livelli)

Le celle modificate manualmente hanno un punto nell'angolo.
La rigenerazione automatica non sovrascrive mai queste celle.

**Colonna destra — pannello contestuale:**
Cambia contenuto in base alla selezione:
- Nessuna selezione: stats globali (copertura %, errori, warning) + lista alert
- Cella selezionata: picker persone disponibili per quella cella con motivo
  se non disponibili (vincolo generale, indisponibilità mensile, jolly)
- Persona selezionata: ore/turni mese, mini calendario personale, vincoli attivi
- Alert selezionato: dettaglio + suggerimento + bottone "Applica"

**Azioni header:**
- "Genera automatico" → scheduler riempie celle vuote rispettando vincoli
- "Pubblica" → passa a Passo 3 (conferma + invio notifiche)

---

### PASSO 3 — Report e pubblicazione

Accessibile dopo la generazione. Mostra:
- Tabella turni/ore per ogni persona (primario + secondario per contractMode)
- Distribuzione notti, weekend, giorni consecutivi
- Eventuali alert residui non risolti
- Export: PDF (stampa), Excel, CSV
- Bottone "Pubblica" → status PUBLISHED, notifica email/push a tutto il team
- Dopo pubblicazione: bottone "Archivia" disponibile a fine mese

### Contatori nel pannello laterale e nella griglia — regola contractMode
La modalità contratto del calendario (o del singolo membro) determina cosa mostrare:

| Elemento UI | Mode SHIFTS | Mode HOURS |
|-------------|-------------|------------|
| Colonna destra griglia persona | "12/15 turni" | "128/160h" |
| Barra progresso pannello | turni assegnati / target turni | ore totali / target ore |
| Info secondaria pannello | ore totali (piccolo, grigio) | n. turni (piccolo, grigio) |
| Alert soglia superamento | SHIFTS_OVER_CONTRACT | HOURS_OVER_CONTRACT |
| Criterio equità scheduler | distribuisce turni equamente | distribuisce ore equamente |
| Export report | turni per persona + ore derivate | ore per persona + turni derivati |

Un calendario può avere membri con modalità miste (es. full-time a turni + part-time a ore).
Il pannello mostra sempre la modalità corretta per quella persona specifica.

---

## 7. Flusso mensile completo

```
MESE -1 (es. maggio per giugno):

  [25 del mese] Manager apre raccolta richieste per mese successivo
    → notifica push/email a tutto il personale del calendario
    → ogni worker vede il banner "Inserisci le tue indisponibilità per giugno"

  [Worker] Accede alla propria dashboard
    → compila form: giorni liberi richiesti, ferie, preferenze turno
    → invia (può modificare fino alla deadline)

  [Manager] Vede in tempo reale le richieste arrivate
    → può vedere eventuali conflitti già evidenti (es. troppi in ferie la stessa settimana)

  [1-3 del mese] Deadline raccolta richieste
    → il manager genera la bozza (manuale o automatica)
    → rivede gli alert, corregge manualmente dove necessario
    → pubblica

  [Pubblicazione]
    → notifica a tutto il personale
    → calendario diventa visibile ai worker
    → lo status passa da DRAFT a PUBLISHED

  [Durante il mese]
    → richieste di scambio turno tra colleghi
    → modifiche di emergenza da parte del manager (con notifica ai coinvolti)
```

---

## 8. Stack tecnico

### Ambiente di sviluppo
- **OS:** Windows locale
- **Node.js:** già installato
- **Database locale:** PostgreSQL (installer ufficiale + pgAdmin per GUI)
- **Editor:** Cursor (con questo documento come contesto)

### Stack applicativo
| Layer | Tecnologia | Motivo |
|-------|-----------|--------|
| Frontend + Backend | Next.js 14 (App Router) | SSR, API routes, tutto in un repo |
| Linguaggio | TypeScript | type safety end-to-end, errori a compile time |
| UI components | Tailwind CSS + shadcn/ui | componenti pronti, design system coerente |
| State management | Zustand (locale) + React Query (server) | griglia interattiva + sync dati |
| ORM | Prisma | schema type-safe, migration automatiche |
| Database | PostgreSQL | JSON nativo per Constraint.value e aiConfig |
| Auth | NextAuth v5 | sessioni, ruoli, invite flow |
| Email | Resend | notifiche transazionali (3000/mese gratis) |
| Process manager | PM2 | keep-alive Next.js su VPS |
| Reverse proxy | Nginx (via HestiaCP) | proxy_pass → porta 3000, SSL Let's Encrypt |
| Pagamenti (fase 2+) | Stripe | abbonamenti SaaS |
| AI scheduler (fase 3) | Gemini API / OR-Tools | generazione turni intelligente |

### Struttura repository
```
/turni-app
  /app
    /(auth)
      /login          → pagina login
      /register       → registrazione + creazione org
      /invite/[token] → accetta invito al calendario
    /(dashboard)
      /layout.tsx     → sidebar, header, auth guard
      /page.tsx       → redirect a /[orgSlug]
      /[orgSlug]
        /page.tsx     → dashboard org (lista calendari)
        /settings     → impostazioni org, utenti, piano
        /[calId]
          /page.tsx   → redirect a /schedule
          /settings   → configura turni, persone, vincoli base
          /schedules              → lista Schedule archiviati
          /schedules/new          → crea nuovo Schedule
          /schedules/[schedId]
            /availability         → Passo 1: disponibilità mensili persone
            /grid                 → Passo 2: griglia turni interattiva
            /report               → Passo 3: report e pubblicazione
          /settings               → configura turni, persone, vincoli base
    /api
      /auth/[...nextauth]  → NextAuth handler
      /orgs/[orgId]        → CRUD org
      /calendars/[calId]   → CRUD calendari
      /shift-types/[id]    → CRUD tipi turno
      /members/[id]        → CRUD membri + vincoli base
      /schedules/[id]      → CRUD schedule
      /assignments/[id]    → CRUD assegnazioni singole
      /constraints/[id]    → CRUD vincoli
      /scheduler/generate  → POST: genera bozza automatica
      /swap-requests/[id]  → CRUD richieste scambio
      /notifications/[id]  → lettura notifiche
  /components
    /schedule
      ScheduleGrid.tsx     → griglia principale (vista A)
      PersonGrid.tsx       → griglia per persona (vista B)
      ShiftCell.tsx        → singola cella della griglia
      PersonPicker.tsx     → pannello aggiunta persona
      AlertPanel.tsx       → pannello alert scheduler
      CoverageBar.tsx      → badge copertura sopra le colonne
    /dashboard
      CalendarCard.tsx
      StatsCards.tsx
      AlertSummary.tsx
    /requests
      RequestForm.tsx      → form indisponibilità worker
      RequestList.tsx      → lista richieste (manager)
    /ui                    → shadcn components
  /lib
    /scheduler.ts          → algoritmo auto-generazione turni
    /constraints.ts        → logica validazione vincoli
    /notifications.ts      → invio email + notifiche in-app
    /auth.ts               → config NextAuth, helper ruoli
    /prisma.ts             → singleton Prisma client
  /prisma
    schema.prisma
    /migrations
  /types
    index.ts               → tipi TypeScript condivisi
  .env.local               → sviluppo (NON su git)
  .env.example             → template variabili (su git)
  .gitignore
  next.config.ts
  tailwind.config.ts
  tsconfig.json
```

### Variabili d'ambiente necessarie
```env
# Database
DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/turnidb"

# NextAuth
NEXTAUTH_SECRET="stringa-random-lunga-almeno-32-caratteri"
NEXTAUTH_URL="http://localhost:3000"  # in prod: https://tuodominio.com

# Email (Resend)
RESEND_API_KEY="re_..."
EMAIL_FROM="noreply@tuodominio.com"

# Stripe (fase 2)
STRIPE_SECRET_KEY="sk_..."
STRIPE_WEBHOOK_SECRET="whsec_..."
STRIPE_PRICE_STARTER="price_..."
STRIPE_PRICE_PRO="price_..."

# AI (fase 3) — Gemini
GEMINI_API_KEY=""
```

---

## 9. Deploy su VPS con HestiaCP

### Setup server (una volta sola)
```bash
# Installa PostgreSQL
sudo apt update
sudo apt install postgresql postgresql-contrib -y

# Crea utente e database
sudo -u postgres psql
  CREATE USER turniapp WITH PASSWORD 'PASSWORD_SICURA';
  CREATE DATABASE turnidb OWNER turniapp;
  \q

# Installa PM2
npm install -g pm2

# Clona il repo
git clone https://github.com/tuonome/turni-app.git /home/utente/turni-app
cd /home/utente/turni-app
npm install
cp .env.example .env.production
# Modifica .env.production con i valori del server

# Prima migration
npx prisma migrate deploy

# Build
npm run build

# Avvia con PM2
pm2 start npm --name "turni-app" -- start
pm2 save
pm2 startup
```

### HestiaCP: configurazione Nginx
In HestiaCP crea un dominio (es. `turni.tuodominio.com`), abilita SSL, poi nel template Nginx custom aggiungi:
```nginx
location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_cache_bypass $http_upgrade;
}
```

### Script deploy (ogni aggiornamento)
```bash
#!/bin/bash
# deploy.sh — da eseguire sul server dopo git push
cd /home/utente/turni-app
git pull origin main
npm install
npx prisma migrate deploy
npm run build
pm2 restart turni-app
echo "Deploy completato"
```

---

## 10. Fasi di sviluppo

### Fase 0 — Fondamenta (1-2 settimane)
- [ ] Setup repo, Next.js, TypeScript, Tailwind, shadcn
- [ ] Schema Prisma completo + prima migration
- [ ] NextAuth: login email/password, sessioni
- [ ] Middleware auth: protezione route, redirect
- [ ] Creazione Organization al primo login (onboarding)
- [ ] Invito utenti via email (link con token)
- [ ] Deploy base su VPS

### Fase 1 — Area SETUP: persone e calendari (2-3 settimane)
Obiettivo: il manager può configurare tutto prima di creare il primo turno.

- [ ] CRUD Persone (anagrafica: nome, ruolo, contratto, vincoli permanenti)
- [ ] CRUD Calendari (nome, colore, fasce orarie)
- [ ] CRUD ShiftType per calendario (nome, 08:00–16:00, minStaff, isOnCall)
      → gestione turni sovrapposti: nessun vincolo su overlap tra ShiftType diversi
- [ ] Assegnazione persona ↔ calendario (CalendarMember + contractMode)
- [ ] Scheda persona: sezione vincoli permanenti (add/edit/remove)
- [ ] Vista lista persone con badge calendari assegnati

### Fase 2 — Area TURNI: costruzione mensile (3-4 settimane)
Obiettivo: il manager crea il turno mensile e lo pubblica.

- [ ] Selezione calendario + mese → apre griglia vuota o bozza
- [ ] Pannello indisponibilità mensili (inseribili da manager o worker)
      → MonthlyConstraint: separate dai vincoli permanenti
- [ ] Griglia per fascia oraria (Vista A) con:
      → badge copertura per ogni cella
      → rilevamento conflitto personale (non conflitto tra ShiftType!)
      → chip turno con colore fascia, badge jolly, badge violazione soft
- [ ] Griglia per persona (Vista B) con contatori primari (turni o ore per modalità)
- [ ] Pannello laterale contestuale 4 modalità (default / cella / persona / alert)
- [ ] Drag & drop assegnazioni (con @dnd-kit/core)
- [ ] Undo/redo (10 livelli)
- [ ] Scheduler automatico (/lib/scheduler.ts)
- [ ] Alert panel con suggerimenti e "applica"
- [ ] Pubblicazione → notifica email personale
- [ ] Archiviazione automatica a fine mese (status → ARCHIVED)

### Fase 2b — Area ARCHIVIO (1 settimana)
- [ ] Lista schedule archiviati per calendario
- [ ] Vista read-only di ogni mese archiviato
- [ ] Filtro per anno/mese/calendario
- [ ] Export PDF del mese archiviato

### Fase 2 — Flusso mensile completo (2-3 settimane)
- [ ] Form richieste indisponibilità (worker)
- [ ] Dashboard richieste (manager)
- [ ] Scheduler automatico (`/lib/scheduler.ts`)
- [ ] Alert panel con spiegazione errori
- [ ] Rigenera turno singolo / intero mese
- [ ] Scambi turno (richiesta + approvazione)
- [ ] Notifiche in-app
- [ ] Report ore mensili
- [ ] Export PDF calendario personale

### Fase 3 — SaaS e AI (2+ mesi)
- [ ] Multi-tenancy completo (slug org in URL)
- [ ] Piani e abbonamenti (Stripe)
- [ ] AI scheduler via Gemini API (usa `aiConfig` come prompt; vincoli strutturati, no exec)
- [ ] Export Excel
- [ ] App mobile (PWA first, poi nativa se serve)
- [ ] API pubblica per integrazioni

---

## 11. Cose da non dimenticare

### Sicurezza
- Ogni query API deve filtrare per `orgId` preso dalla sessione — mai fidarsi del body della request per determinare il tenant
- Rate limiting sulle API (specie login e inviti)
- Validazione input server-side con Zod su ogni endpoint
- CSRF protection (NextAuth la gestisce per le sue route, aggiungere per le API custom)
- Password hashing con bcrypt (min 12 rounds)
- Token invito: scadenza 48h, monouso

### UX critica
- La griglia deve funzionare bene su tablet (i manager spesso lavorano da iPad)
- La vista worker deve funzionare perfettamente su mobile (il personale vede i turni dal telefono)
- Feedback immediato su ogni azione (ottimistic updates dove possibile)
- Stato "salvato automaticamente" visibile nella griglia
- Undo dell'ultima azione nella griglia (almeno 1 livello)

### Business logic delicata
- Quando un calendario viene pubblicato, i worker ricevono notifica — se viene modificato dopo la pubblicazione, deve esserci una notifica esplicita "il calendario è stato aggiornato" con le modifiche evidenziate
- Un vincolo HARD non può essere violato nemmeno dal manager nell'assegnazione manuale — deve chiedere conferma esplicita con warning
- Le ore contrattuali del worker sono un riferimento, non un limite automatico hard — il manager decide se sforare
- Lo scheduler non sovrascrive mai le assegnazioni create manualmente (flag `isAutoGenerated: false`)
- Un mese archiviato è read-only — nessuna modifica possibile (storico immutabile)

### Multi-calendario
- Una persona può essere membro di più calendari nella stessa org
- I vincoli sono per CalendarMember, non per User — la stessa persona può avere vincoli diversi su calendari diversi
- Il conteggio ore è per calendario — non aggregato tra calendari (a meno di feature futura)

### GDPR / Privacy (Italia)
- Al momento della registrazione: consenso trattamento dati
- I dati dei turni sono dati lavorativi — retention policy da definire (es. 5 anni per obblighi contabili)
- Il worker ha diritto di vedere i propri dati e richiederli in export
- Password dimenticata: reset via email con token temporaneo

---

## 12. Decisioni architetturali prese

Tutte le domande aperte sono state risolte. Queste sono decisioni definitive — non riaprirle durante lo sviluppo.

### 1. Nome e dominio
**Turny.** Dominio da verificare (turny.app / turny.it).
NEXTAUTH_URL prod: `https://turny.app` — in locale: `http://localhost:3000`

### 2. Deadline raccolta richieste
**Non esiste una deadline automatica.** Le indisponibilità le può inserire chiunque abbia accesso: il worker dal proprio profilo, oppure il manager direttamente (es. glielo dicono al telefono e lui le inserisce lui stesso per conto del worker). Nessun reminder automatico obbligatorio — opzionale in fase 2. Il form di inserimento indisponibilità è accessibile sia dalla dashboard manager che dalla dashboard worker, per lo stesso membro.

**Implicazione sul codice:** non serve un campo `deadline` nel Calendar per il MVP. Il manager crea la bozza quando vuole.

### 3. Visibilità calendario
**Ogni utente ha sempre la propria vista personale** (i miei turni) — questo è garantito sempre.

La visibilità degli altri è configurabile a livello di Calendar con un flag booleano `isPublicWithinOrg`:
- `true` (default): tutto il team del calendario vede tutti i turni di tutti — come il Drive condiviso attuale
- `false`: ognuno vede solo i propri turni

In futuro: possibilità di abilitare la visibilità per singola persona (es. "vedo i turni di Mario ma non di Anna"). Non implementare in fase 1.

**Aggiunta al modello Calendar:**
```prisma
isPublicWithinOrg Boolean @default(true)
```

### 4. Ore contrattuali — comportamento scheduler
**Solo warning, mai blocco hard.** Se lo scheduler supera le ore contrattuali di un lavoratore, lo segnala con alert `HOURS_OVER_CONTRACT` ma assegna comunque il turno — perché in emergenza (malattie, ferie impreviste) può essere l'unica opzione disponibile.

**Concetto "jolly":** aggiungere flag `isJolly Boolean @default(false)` su `CalendarMember`. Un jolly è una persona disponibile come ultima risorsa, con priorità più alta nelle situazioni di emergenza. Lo scheduler la usa solo se non ci sono altre opzioni valide per garantire la copertura minima. Nella UI il jolly ha un badge visivo distinto.

**Aggiunta al modello CalendarMember:**
```prisma
isJolly Boolean @default(false)
```

**Logica scheduler:** nella fase di selezione candidati, i jolly entrano in coda dopo tutti gli altri disponibili. Se un turno rimane scoperto e c'è un jolly disponibile, viene assegnato lui con alert `JOLLY_USED` che informa il manager.

### 5. Turni che attraversano mezzanotte
**Il turno conta sul giorno di inizio** — quando il lavoratore attacca. Standard de facto in tutti i software di turni sanitari (come Silfe, Gesturno, ecc.).

Es: turno notte 21:00–07:00 del lunedì → compare nella colonna "Lunedì", le 10 ore vengono conteggiate nel lunedì.

**Implicazione UI:** nella griglia giornaliera, la notte del lunedì appare nella riga lunedì. Il giorno di martedì non mostra nulla per quella persona (è a letto). Questo è intuitivo per chi fa i turni.

**Implicazione sul calcolo ore:** `durationHours` su `ShiftType` viene calcolato una volta al salvataggio. Se `endTime < startTime` → il turno attraversa mezzanotte → `duration = (24 - startHour) + endHour`.

### 6. Reperibilità
**ShiftType speciale.** Gestirla come un normale tipo di turno con un flag `isOnCall Boolean @default(false)`. Questo permette di configurarne nome, orario e copertura minima esattamente come gli altri turni, senza logica separata.

La differenza pratica nella UI: i chip di reperibilità hanno stile visivo distinto (es. bordo tratteggiato invece di sfondo pieno) per distinguerli a colpo d'occhio dai turni attivi.

**Aggiunta al modello ShiftType:**
```prisma
isOnCall Boolean @default(false)
```

### 7. Ferie vs permessi vs indisponibilità
**Tutto è "indisponibilità".** Il sistema non gestisce buste paga, quindi la distinzione ferie/permesso/malattia non ha rilevanza funzionale. Il campo `note` su `Constraint` permette al manager di annotare il motivo se vuole, ma non è strutturato. Tipo unico: `UNAVAILABLE_*`.

### 8. Export formati
Supportare tutti e quattro, in ordine di priorità di implementazione:
1. **PDF** (fase 1) — stampa del calendario mensile, vista per persona
2. **Excel/XLSX** (fase 2) — griglia completa, utile per archivio e HR
3. **CSV** (fase 2) — export dati grezzi per chi vuole elaborarli altrove
4. **JSON** (fase 3) — API export per integrazioni

---

## 13. Cose aggiunte dopo l'analisi iniziale

### Flag e campi aggiunti al modello
Rispetto alla versione 1.0, questi campi sono stati aggiunti:

- `Calendar.isPublicWithinOrg Boolean @default(true)`
- `CalendarMember.isJolly Boolean @default(false)`
- `CalendarMember.contractMode ContractMode @default(SHIFTS)`
- `CalendarMember.contractShiftsMonth Int?`
- `CalendarMember.contractShiftsWeek Int?`
- `ShiftType.isOnCall Boolean @default(false)`
- `ConstraintType.MAX_SHIFTS_MONTH` e `MAX_SHIFTS_WEEK` (nuovi tipi)
- `MonthlyConstraint` — nuovo modello separato da `Constraint` per le indisponibilità mensili archiviate con il Schedule

### Nota su contractMode misto
Un singolo calendario può avere membri con contractMode diversi — es. un veterinario full-time a turni (15 turni/mese) e un'assistente part-time a ore (20h/settimana). Lo scheduler e il pannello gestiscono ogni membro con la sua modalità individuale. L'equità nella distribuzione viene calcolata separatamente per gruppo di modalità.

### Nuovi tipi di alert scheduler
Rispetto alla sezione 5, aggiungere:
- `HOURS_OVER_CONTRACT` — ore superate, assegnazione fatta comunque
- `JOLLY_USED` — usato un jolly per coprire turno altrimenti scoperto

### Logica jolly nello scheduler
```
// Dopo aver esaurito i candidati normali:
SE turno ancora sotto minStaff:
  candidatiJolly = membri con isJolly=true ancora disponibili quel giorno
  SE candidatiJolly.length > 0:
    assegna jolly necessari
    aggiungi alert JOLLY_USED per ogni jolly usato
  ALTRIMENTI:
    aggiungi alert COVERAGE_IMPOSSIBLE
```

---

## 14. Guida UI/UX — applicazione Next.js (stato attuale)

Questa sezione descrive **cosa vede l’utente e cosa può fare** nell’implementazione corrente (`/turni-app`), partendo dalla shell grafica. Integra e, dove necessario, **sostituisce** i riferimenti generici delle sezioni 6–6b (path tipo `/people` o `/calendars` senza slug org non sono più validi).

**Stack UI reale:** Next.js App Router, **Bootstrap** (classi utility), componenti React dedicati; il documento originale citava Tailwind/shadcn come target — l’app usa pattern Turny (es. `input-underlined`, modali custom).

### 14.1 Shell globale: header, home, sidebar

- **Header (`AppHeader`):** logo `turny_logo.svg` (larghezza indicativa 250px), nessun bordo inferiore. Se autenticato: messaggio **«Benvenuto [nome]»** (preferisce `User.name`, altrimenti parte locale dell’email) e pulsante logout; altrimenti pulsante **Login** verso `/login`.
- **Home (`/`):** pagina marketing con hero (immagine full width, altezza fissa ~480px), titoli/value proposition, card funzionalità, sezione “come funziona”, CTA. Se l’utente è loggato con almeno un’organizzazione, compare la **sidebar** (vedi sotto) e un CTA verso l’area org (es. `/{orgSlug}`). **`/dashboard`** reindirizza a **`/`**.
- **Sidebar organizzazione (`OrgSidebar`):** visibile su viewport grandi (`d-none d-lg-flex`). Mostra nome org, toggle collassa/espandi (stato in `localStorage`). Voci:
  - **Home** → `/`
  - **Calendari** → `/{orgSlug}` — **nascosta** se l’utente è **solo WORKER** (nessun ruolo tra OWNER, ADMIN, MANAGER)
  - **Turni** → `/{orgSlug}/turni` — sempre visibile se si è nell’area org; evidenziata anche quando il path contiene `/schedules/`
  - **Membri**, **Settings** — come Calendari, nascoste per **solo WORKER**
- **Layout org (`/{orgSlug}/...`):** stessa header + sidebar con `isWorkerOnly` calcolato da ruoli; i worker che provano ad aprire Calendari/Membri/Settings/Dettaglio calendario vengono **reindirizzati** a `/{orgSlug}/turni` dove applicabile.
- **Nota:** sulla **home** la sidebar viene renderizzata **senza** `isWorkerOnly`; un worker può vedere temporaneamente voci extra finché resta sulla home (comportamento da allineare in futuro se serve coerenza totale).

### 14.2 Autenticazione

- **Login (`/login`):** campo unico **«Username o email»** (`credentials.login`) + password. NextAuth risolve l’utente per email o per **username** (campo `User.name` in DB, usato anche come display name in header).
- **Registrazione (`/register`):** flusso esistente; dopo la registrazione il `signIn` usa lo stesso schema `login` + password.

### 14.3 Ruoli — cosa cambia in interfaccia

| Ruolo (effettivo) | Sidebar | Pagine principali |
|-------------------|---------|-------------------|
| **OWNER / ADMIN** | Tutte le voci | Calendari, Turni, Membri, Settings; creazione calendari (solo chi ha permesso API). |
| **MANAGER** | Come sopra ma **solo calendari** a cui è assegnato come `CalendarMember` | Stesso principio di filtro su API/pagine calendario. |
| **Solo WORKER** | Solo **Home** + **Turni** | Solo `/{orgSlug}/turni`: vista lettura turni (nessun pop-up obbligatorio; vedi §14.8). |

### 14.4 Sezione «Calendari» — `/{orgSlug}`

- **Titolo:** `h2` «Calendari» + sottotitolo descrittivo (non il nome azienda come titolo principale).
- **Breadcrumb:** `Home / Calendari`.
- **Lista calendari:** ogni riga mostra pallino colore, nome, timezone e **giorni attivi** (formattati da `activeWeekdays`), stato Attivo/Disattivo.
- **«Aggiungi calendario»** (OWNER/ADMIN): apre modale **Nuovo calendario** con **padding bottom** sul body per staccare il bottone dal bordo. Campi: **nome**, **descrizione** (textarea), **colore** (palette). Timezone fissata a `Europe/Rome` lato API al momento della creazione.
- **«Modifica»** su una riga: modale **Modifica calendario** con gli stessi campi (**nome**, **descrizione**, **colore**). Salva via `PATCH` calendario.
- **«Configura»:** porta al **dettaglio calendario** `/{orgSlug}/{calId}` (non passa da una pagina “Calendario” fittizia nel breadcrumb dei Turni).
- **«Elimina»:** conferma poi `DELETE`.

### 14.5 Dettaglio calendario — `/{orgSlug}/{calId}`

- **Breadcrumb:** `Home / Calendari / [Nome calendario]`.
- **Intestazione:** titolo «Calendario: [nome]», sottotitolo con descrizione o testo se assente + timezone.
- **Tipi di turno (`CalendarShiftTypesPanel`):** elenco turni configurati; per ciascuno **Modifica** / **Elimina**; **Aggiungi turno** apre modale **Nuovo turno**.
  - **Creazione turno (`ShiftTypeCreateForm`):** nome, **inizio/fine** (time), **min staff**, **colore**.
  - **Modifica (`ShiftTypeItem` → modale):** nome, orari, **min staff**, colore, **giorni della settimana** attivi (toggle per giorno; almeno un giorno deve restare selezionato).
- **Persone del calendario (`CalendarMembersPanel`):** elenco membri già collegati; autocomplete per aggiungere **solo utenti già membri dell’organizzazione** (cerca nome/email); rimozione con conferma. Nessun form anagrafica qui: è legato alla sezione Membri.

### 14.6 Turni mensili per calendario — `/{orgSlug}/{calId}/schedules`

- **Breadcrumb:** `Home / Turni / [Nome calendario]` (il nome del calendario è contesto, **non** una voce “Calendario” intermedia inventata).
- **Contenuto:** lista **Schedule** (bozza/pubblicato/archiviato) con etichetta periodo (mensile da `generationLog` o custom/settimanale).
- **Azioni per riga (`ScheduleListItem`):** **Configuratore** → griglia; **Report** → report; se non già pubblicato e permessi ok, **Pubblica** (PATCH stato). *Link diretto a Disponibilità non è in questa lista* — la pagina disponibilità resta raggiungibile dal report o URL manuale (vedi §14.9).

### 14.7 Hub «Turni» organizzazione — `/{orgSlug}/turni`

- **Non-worker (`OrgTurnsBoard`):** panoramica turni **raggruppati per calendario**; link ad **Archivio turni**; **Aggiungi turno** apre modale con scelta calendario e creazione schedule. Dalla lista turno: **Configuratore**; **Modifica** apre modale con:
  - **Periodo:** Mensile / Settimanale / Custom
  - **Mensile:** anno + mese
  - **Settimanale/Custom:** date inizio/fine (settimanale può derivare la fine da inizio + 6 giorni)
  - **Stato:** Bozza / Pubblicato
  - Salva / Annulla; **Elimina** con conferma.
- **Nota UX:** dalla lista turni nella board **non** c’è più un pulsante «Visualizza» che apre l’anteprima: la visualizzazione multi-vista resta nel **configuratore** (e nella vista worker).

### 14.8 Vista WORKER — solo `/{orgSlug}/turni`

- Se non ha calendari assegnati: messaggio informativo.
- Se **un solo** calendario: mostra subito il contenuto.
- Se **più calendari:** in alto form **GET** con `<select name="calendarId">` + **Apri** per cambiare calendario (query string).
- Contenuto: **schedule non archiviato** più recente per il calendario scelto; componente **`WorkerTurnsView`** (full page, non modale): tre pulsanti vista — **Standard**, **Calendario**, **I miei turni** — con icone a sinistra (verde pieno = attivo, icona in bianco come testo). L’icona «I miei turni» è prevista come **`/my_turni.svg`** (se il file non è in `public/`, il codice può ancora usare un’icona placeholder come `badge.svg` finché non si aggiunge l’asset).

### 14.9 Configuratore turni — `/{orgSlug}/{calId}/schedules/{schedId}/grid`

- **Breadcrumb:** `Home / Turni / Configuratore turni` (senza nome calendario nel mezzo del path, per evitare pagine ridondanti).
- **Titolo:** «Configurazione turni» + sottotitolo con nome calendario, periodo, nota se lo schedule non è in bozza (modifiche assegnazioni consentite solo in bozza — logica `canEditScheduleAssignments`).
- **`ScheduleGridPanel` — cosa si fa sul “calendario” (griglia):**
  - Griglia **giorni × tipi di turno** (rispetta `activeWeekdays` dei tipi turno); celle con persone assegnate, conteggi copertura vs `minStaff`.
  - **Aggiunta assegnazione:** selezione membro e azioni per cella (drag da lista persone, click, ecc. — flussi client con refresh dopo API).
  - **Rimozione** assegnazione; pulsante **Genera turni** (`POST .../generate`, OR-Tools) se in bozza. Se il solver risponde **impossibile**, **modal** con hint euristiche e link al calendario per modificare membri/tipi turno (vedi §2e — roadmap: form «turni extra» / jolly dal modal non ancora presente).
  - **Indisponibilità mensili** e vincoli base membri influenzano validazioni; pannello **alert** (copertura, doppi turni, indisponibilità violate, regole es. riposo dopo notte).
  - **Colori membro**, giorni/turni non disponibili: gestiti da constraint e stato locale nel pannello dove previsto.
  - **Tre modalità di anteprima** (pulsanti): **Standard** (griglia classica), **Calendario** (vista calendario), **I miei turni** (solo turni utente corrente se è membro del calendario); possibile **export .ics** dei propri turni dalla vista dedicata.
- **Link in fondo pagina:** verso **Report e pubblicazione** e torna ai turni mensili del calendario.
- **Query `?preview=1`:** può aprire l’anteprima inizialmente (uso da scenari specifici).

### 14.10 Disponibilità — `.../schedules/{schedId}/availability`

- **Breadcrumb:** `Home / Turni / Disponibilita` (il nome del calendario compare nel titolo pagina, non nel breadcrumb).
- Pagina **`ScheduleMonthlyConstraintsPanel`:** indisponibilità **mensili** legate allo schedule (archiviate con il mese), distinte dai vincoli permanenti sul membro. Collegamento tipico dal **report** (link in fondo).

### 14.11 Report — `.../schedules/{schedId}/report`

- **Breadcrumb:** `Home / Turni / Report`.
- Contenuti: tabella/riepilogo da `buildScheduleReport`, azioni (`ScheduleReportActions`), export CSV dove previsto, link verso disponibilità e navigazione correlata.

### 14.12 Membri organizzazione — `/{orgSlug}/members`

- **Breadcrumb:** `Home / Membri`.
- Invito/creazione utenti org: form con **nome, cognome, username, ruolo professionale, email, password**, selezione **ruoli** (RESPONSABILE/MANAGER/WORKER multipli con toggle). L’**username** è obbligatorio per API e viene salvato sul profilo utente; in lista membri si mostra anche **@username** accanto all’email.
- Modifica membro (per ruoli autorizzati): aggiornamento ruoli e username come da UI elenco.

### 14.13 Impostazioni — `/{orgSlug}/settings`

- **Breadcrumb:** `Home / Impostazioni`. Voce sidebar in inglese **Settings**; la pagina è accessibile solo a **OWNER / ADMIN** (altri ruoli reindirizzati ai Calendari).
- Contenuto attuale: intestazione con nome organizzazione; sezione dettaglio da espandere quando verranno aggiunti form (piano, dati fatturazione, ecc.).

### 14.14 Archivio turni — `/{orgSlug}/archivio-turni`

- Elenco storico / schedule archiviati; breadcrumb dedicato; worker reindirizzati ai soli Turni se tentano l’accesso diretto (come altre pagine riservate).

### 14.15 Coerenza breadcrumb (riepilogo)

- **Calendari:** `Home / Calendari` → dettaglio `Home / Calendari / [Nome]`.
- **Lista turni per calendario:** `Home / Turni / [Nome calendario]`.
- **Sotto-schedule (stesso schema per tutte):** `Home / Turni / Configuratore turni`, `Home / Turni / Disponibilita`, `Home / Turni / Report` — il contesto (nome calendario, periodo) è nel **titolo** della pagina, non nel breadcrumb, per evitare voci ridondanti.
- **Impostazioni:** `Home / Impostazioni`.

---

*Fine documento — versione 1.10*
*Aggiornare questo file ad ogni decisione architetturale significativa presa durante lo sviluppo.*

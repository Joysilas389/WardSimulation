# Ward Life GH

A live, multiplayer hospital simulation for Ghanaian health workers and students, set in the fictional Akwaaba Teaching Hospital.

## Run it

```bash
cd backend
python -m venv .venv && source .venv/bin/activate     # Windows: .venv\Scripts\activate
pip install -r requirements.txt
export WARDLIFE_ADMIN_TOKEN="pick-a-long-secret"       # Windows: set WARDLIFE_ADMIN_TOKEN=...
uvicorn app:app --reload --port 8000
```

Open http://localhost:8000 to play and http://localhost:8000/admin.html for the dashboard. Open the game in two browsers with different roles to see the live multiplayer.

## How a patient moves through the hospital

1. **Arrival.** Walk-ins go to OPD (via Records & NHIS for a folder), Emergency, Maternity or Paediatrics. Ambulances and referrals from CHPS compounds and district hospitals drive in on the road and park at the Ambulance bay.
2. **Handover.** A paramedic hands over with vitals.
3. **Triage.** A nurse, midwife, doctor or student triages.
4. **Clerking.** A doctor or student clerks, which reveals the history and examination.
5. **Investigations.** The doctor orders tests in the folder. Bedside tests are instant. Lab tests wait for a lab scientist in the Laboratory; imaging waits for a radiographer in Radiology. Power cuts pause both.
6. **The plan.** The doctor sets the diagnosis, management and disposition, and is scored against the case.
7. **Pharmacy.** A pharmacist dispenses, or queries the prescription. Catching an unsafe drug, such as aspirin in a haemorrhagic stroke, earns big points.
8. **Care.** A nurse or midwife gives care. Then the patient goes home, to a ward, to theatre (a doctor operates) or out by ambulance.
9. **Ward life.** Inpatients get observations and appear in ward rounds. Ward rounds run every 7 minutes on the busiest ward, and clinical meetings every 15 minutes in the Conference room. Both use timed questions, and only players in the room can answer.
10. **Presentations.** Players present patients they managed in the Conference room, and colleagues can endorse them.

Patients lose condition while they wait, faster for red triage. At zero they are moved to ICU and the team loses points. If no one in a role is on shift, slower duty staff do that step, so small groups can still play.

## Referrals, ambulances, beds and oxygen

- **Referral calls.** District hospitals, polyclinics, health centres, CHPS compounds and a regional hospital phone in referrals. The phone rings in Emergency, Maternity or Paediatrics, and a doctor, the nurse in charge, or the midwife in charge on the labour ward must go there to answer. Each call is an SBAR handover (situation, background, assessment, request) with the unit's free space and oxygen stock.
- **Responses.** Accept, advise to manage locally, find another hospital, or decline. Accepting when you have space scores best. Refusing a sick patient without finding an alternative loses points. Advising local care is right for referrals the facility can handle, such as uncomplicated malaria. Advice given on the phone (first-line treatment, referral note, escort) improves the patient's condition; sending them by taxi with no escort makes them arrive worse. Unanswered calls ring again, then the duty doctor answers.
- **Ambulances.** Three units are based at the bay. Accepted referrals and 999 calls need a paramedic to dispatch a unit, which drives out to collect the patient and back. When all units are out, patients wait.
- **No beds.** Wards have fixed beds (Medical and Surgical 8; Paediatrics and Maternity 6). When a ward is full, admitted patients wait on a trolley until a bed frees up. Doctors can discharge stable patients early to free beds.
- **Oxygen.** The hospital starts with 12 cylinders, used by patients who need oxygen. When it runs out those patients get worse. Order more from Pharmacy; delivery takes a minute.
- **Referring out.** Patients the hospital cannot treat (for example major burns) need a doctor to call a specialist centre and confirm a bed, which is sometimes not available, before a paramedic can transfer them.

## Visitor tracking

| Metric | How it is counted |
|---|---|
| Online now, peak | Live websocket connections, one per player |
| Visits, unique visitors | Each page load posts to `/api/visit`; a random cookie (`wl_vid`) tells visitors apart. No IP addresses are stored. |
| Players, sign-ups | Registered accounts |
| Active today/7d/30d | Players who connected that day |
| Referrers | The site a visitor came from (domain only) |
| Game activity | Arrivals, admissions, referrals, deteriorations, unsafe prescriptions stopped, presentations |

The admin dashboard refreshes every 15 seconds and is protected by `WARDLIFE_ADMIN_TOKEN`.

## 3D hospital

The game opens in a 3D view built with three.js (`frontend/js/world3d.js`): rooms with walls and doors, beds whose blankets show the triage colour (and flash red when a patient is deteriorating), staff who walk the corridors between departments, ambulances that drive in and out with flashing lights, Accra day and night, and dimmed lights during power cuts. Drag to turn, pinch or use the buttons to zoom, and tap a room to walk there. Players can switch to the flat floor plan at any time, and phones without WebGL get the floor plan automatically.

## Files

```
backend/
  app.py       FastAPI routes, auth, visitor tracking, admin API, websocket
  game.py      The live engine: patient flow, roles, scoring, rounds, meetings, power cuts
  content.py   Roles, departments, tests, capacity, referral network and the 11 clinical cases
  db.py        SQLite storage
frontend/
  index.html, js/app.js, css/style.css   The game (Bootstrap 5)
  js/world3d.js                          The 3D hospital (three.js)
  admin.html, js/admin.js                The dashboard
```

## Before you launch

- **Clinical review.** Have a doctor, midwife and pharmacist check every case in `content.py` against Ghana's Standard Treatment Guidelines. The cases are simplified and contain no doses on purpose.
- **Data protection.** Ghana's Data Protection Act, 2012 (Act 843) applies. Register with the Data Protection Commission, publish a privacy policy, and get consent for the visitor cookie.
- **Accounts.** Add email or phone verification so your player counts can be trusted, plus password reset.
- **Fonts.** The type uses SF Pro on Apple devices and Helvetica Neue next. SF Pro cannot be self-hosted on a website under Apple's licence, so it relies on the visitor's system font.
- **Scale.** One server process handles a few thousand players. Beyond that, move state to Redis and the database to PostgreSQL, and run several game "shifts" (hospital instances).

## Adding a case

Copy a case in `content.py` and change the content. `key_tests` must be ordered for full marks; `useful_tests` are allowed without penalty. In `mgmt`, `good: True` is correct, `False` is unsafe, and `drug: True` sends it through Pharmacy.

## Deploy: pages on Vercel, game server on Render

Players use your Vercel link. Vercel serves the pages in `frontend/`; the live hospital runs on Render, because Vercel shuts its servers down after each request and cannot keep the game loop and live connections open.

1. **Render (game server).** On render.com, sign in with GitHub, choose **New > Blueprint**, pick this repository and apply. Note the address it gives you, e.g. `https://wardsimulation.onrender.com`. Your admin token is under the service's **Environment** tab.
2. **Point the pages at it.** If your Render address is different, edit `frontend/js/config.js` and change `window.WARDLIFE_API`.
3. **Vercel (pages).** On vercel.com, sign in with GitHub, **Add New > Project**, import this repository, set **Root Directory** to `frontend` and **Framework Preset** to **Other**, then deploy.
4. **Lock the server to your site (recommended).** In Render's **Environment** tab, add `WARDLIFE_ALLOWED_ORIGINS` with your Vercel address, e.g. `https://ward-simulation.vercel.app`.

On Render's free plan the server sleeps after about 15 minutes without visitors (the first visit then takes up to a minute), and the SQLite database is wiped whenever the service restarts or redeploys. Before a real launch, add a paid persistent disk or move to PostgreSQL.

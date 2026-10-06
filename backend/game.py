"""The live hospital. One engine instance runs in the server's event loop.

Every player action is checked here; the browser only shows buttons.
When nobody in a role is online, a slower "duty" NPC does that step so
the hospital keeps moving for small groups.
"""
import asyncio
import json
import random
import time
import traceback
from collections import Counter, deque

import db
from content import (ADVICE, CASE_BY_ID, CASES, DEFAULT_DEPT, DEPTS, DISPOSITIONS, FACILITIES, FLEET, HOSPITAL,
                     NAMES_F, NAMES_M, OXYGEN_START, REDIRECT_HOSPITALS, REFERRING, ROLES, SCENES,
                     SPECIALIST_CENTRES, SURNAMES, TESTS, UNIT_CAP, WARD_BEDS, WARD_OF, WARDS, rank_for)

DECAY = {"red": 0.33, "orange": 0.17, "yellow": 0.08, "green": 0.03}   # condition points lost per second
STAGE_MULT = {"registration": 0.3, "waiting": 1.0, "arrived": 0.6, "triaged": 0.8, "reviewed": 0.7,
              "pharmacy": 0.5, "care": 0.5, "surgery": 0.5, "transfer": 0.3, "transfer_call": 0.3,
              "awaiting_ambulance": 0.35, "pickup": 0.35, "boarding": 0.25}
CLINICIANS = ("doctor", "student")
TRIAGERS = ("nurse", "midwife", "doctor", "student", "paramedic")
CARERS = ("nurse", "midwife")
ROUND_EVERY, MEETING_EVERY = 420, 900
Q_SECONDS, REVEAL_SECONDS, SUMMARY_SECONDS = 25, 8, 15
ACTIONS = {"move", "folder", "register", "handover", "triage", "clerk", "order", "run_test", "decide",
           "dispense", "care", "operate", "transfer", "obs", "answer", "chat", "present", "endorse", "my_cases",
           "answer_call", "dispatch", "call_centre", "order_o2", "early_discharge"}
CALL_ROLES = ("doctor", "midwife", "nurse")


def role_names(roles):
    names = [ROLES[r]["name"].lower() + "s" for r in roles]
    return ", ".join(names[:-1]) + " and " + names[-1] if len(names) > 1 else names[0]


class Engine:
    def __init__(self):
        t = time.time()
        self.conns = {}          # websocket -> user id
        self.players = {}        # user id -> live player
        self.patients = {}
        self.seq = int(db.meta_get("patient_seq") or 0)
        self.outbox = []
        self.ticker = deque(maxlen=8)
        self.power_until = 0.0
        self.next_power = t + random.uniform(600, 1100)
        self.next_spawn = t + 3
        self.session = None
        self.session_seq = 0
        self.next_round = t + 180
        self.next_meeting = t + 480
        self.pending = {}
        self.period = Counter()
        self.period_xp = Counter()
        self.treated = {}        # user id -> {pid: summary} for presentations
        self.chat_last = {}
        self.feed = deque(db.recent_presentations(15), maxlen=15)
        self.peak = int(db.meta_get("peak_online") or 0)
        self.calls = {}
        self.call_seq = 0
        self.fleet = [{"id": i, "name": n, "status": "base", "until": 0.0, "total": 0.0, "pid": None, "dest": ""}
                      for i, n in enumerate(FLEET)]
        self.o2 = OXYGEN_START
        self.o2_due = 0.0
        self.o2_empty_since = None
        self.o2_low_warned = False

    # ---------- messaging ----------
    def to_user(self, uid, payload):
        self.outbox.append(("user", uid, payload))

    def to_all(self, payload):
        self.outbox.append(("all", None, payload))

    def to_dept(self, dept, payload):
        self.outbox.append(("dept", dept, payload))

    def pa(self, text, kind="info"):
        item = {"text": text, "kind": kind, "ts": time.time()}
        self.ticker.appendleft(item)
        self.to_all({"t": "pa", **item})

    async def flush(self):
        if not self.outbox:
            return
        box, self.outbox = self.outbox, []
        sends = []
        for kind, target, payload in box:
            msg = json.dumps(payload)
            for ws, uid in list(self.conns.items()):
                if (kind == "all" or (kind == "user" and uid == target)
                        or (kind == "dept" and self.players.get(uid, {}).get("dept") == target)):
                    sends.append(self._send(ws, msg))
        if sends:
            await asyncio.gather(*sends)

    @staticmethod
    async def _send(ws, msg):
        try:
            await ws.send_text(msg)
        except Exception:
            pass

    # ---------- connections ----------
    def me_view(self, uid):
        p = self.players[uid]
        lvl, title, floor, nxt = rank_for(p["role"], p["xp"])
        return {"uid": uid, "name": p["name"], "role": p["role"], "role_name": ROLES[p["role"]]["name"],
                "inst": p["inst"], "xp": p["xp"], "level": lvl, "title": title, "floor": floor, "next": nxt,
                "dept": p["dept"]}

    async def connect(self, ws, user):
        uid = user["id"]
        self.conns[ws] = uid
        if uid not in self.players:
            self.players[uid] = {"uid": uid, "name": user["name"], "role": user["role"], "inst": user["institution"],
                                 "xp": user["xp"], "dept": DEFAULT_DEPT[user["role"]], "socks": 0}
            if len(self.players) <= 60:
                self.pa(f"{user['name']} ({ROLES[user['role']]['name']}) has started a shift.", "join")
            if not self.patients:
                self.next_spawn = min(self.next_spawn, time.time() + 2)
        self.players[uid]["socks"] += 1
        db.mark_active(uid)
        if len(self.players) > self.peak:
            self.peak = len(self.players)
            db.meta_set("peak_online", self.peak)
        self.to_user(uid, {"t": "hello", "me": self.me_view(uid), "hospital": HOSPITAL, "ticker": list(self.ticker),
                           "feed": list(self.feed), "depts": DEPTS, "tests": TESTS, "dispositions": DISPOSITIONS,
                           "roles": {k: {"name": v["name"], "icon": v["icon"]} for k, v in ROLES.items()}})
        await self.flush()

    async def disconnect(self, ws):
        uid = self.conns.pop(ws, None)
        if uid in self.players:
            self.players[uid]["socks"] -= 1
            if self.players[uid]["socks"] <= 0:
                del self.players[uid]

    async def handle(self, ws, raw):
        uid = self.conns.get(ws)
        if uid not in self.players:
            return
        try:
            msg = json.loads(raw)
        except (ValueError, TypeError):
            return
        action = msg.get("a")
        if action not in ACTIONS:
            return
        try:
            err = getattr(self, "act_" + action)(uid, msg)
        except Exception:
            traceback.print_exc()
            err = "That action could not be completed. Try again."
        if err:
            self.to_user(uid, {"t": "error", "msg": err})
        await self.flush()

    # ---------- helpers ----------
    def stat(self, key, n=1):
        db.stat_inc(key, n)
        self.period[key] += n

    def award(self, uid, amount, reason):
        if uid is None or not amount:
            return
        new_xp = db.add_xp(uid, amount)
        p = self.players.get(uid)
        if not p:
            return
        before = rank_for(p["role"], p["xp"])[0]
        p["xp"] = new_xp
        self.period_xp[uid] += amount
        self.to_user(uid, {"t": "xp", "amount": amount, "reason": reason, "me": self.me_view(uid)})
        lvl, title, _, _ = rank_for(p["role"], new_xp)
        if lvl > before:
            self.pa(f"{p['name']} has been promoted to {title}.", "promo")

    def touch(self, p):
        p["rev"] += 1

    def plog(self, p, text):
        p["log"].append({"ts": time.time(), "text": text})
        self.touch(p)

    def set_stage(self, p, stage):
        p["stage"] = stage
        p["since"] = time.time()
        self.touch(p)

    def join_team(self, p, uid):
        if uid is not None and uid in self.players:
            p["team"][uid] = self.players[uid]["name"]

    def who(self, uid, fallback):
        return self.players[uid]["name"] if uid in self.players else fallback

    def check(self, uid, p, roles=None, stage=None, here=True):
        me = self.players[uid]
        if p is None:
            return "That patient is no longer in the hospital."
        if roles and me["role"] not in roles:
            return f"Only {role_names(roles)} can do this."
        if stage and p["stage"] not in ((stage,) if isinstance(stage, str) else stage):
            return "This step has already been done or is not ready yet."
        if here and me["dept"] != p["location"]:
            return f"Go to {DEPTS[p['location']]['name']} first."
        return None

    def pat(self, msg):
        return self.patients.get(str(msg.get("pid", "")))

    def roles_online(self):
        return Counter(p["role"] for p in self.players.values())

    # ---------- patients ----------
    def make_patient(self, case, mode, t):
        sex = case["sex"] if case["sex"] in ("M", "F") else random.choice("MF")
        self.seq += 1
        db.meta_set("patient_seq", self.seq)
        nhis = random.random() < 0.7
        return {"pid": f"P{self.seq:05d}", "case": case, "rev": 0, "since": t, "created": t,
                "name": f"{random.choice(NAMES_F if sex == 'F' else NAMES_M)} {random.choice(SURNAMES)}",
                "age": random.randint(*case["age"]), "sex": sex,
                "folder": f"AKT/{random.randint(10, 99)}/{random.randint(1000, 9999)}",
                "nhis": nhis, "nhis_no": f"{random.randint(10000000, 99999999)}" if nhis else None,
                "mode": mode, "source": None, "location": case["dept"], "stage": "waiting",
                "stability": 100.0 if case["triage"] in ("green", "yellow") else random.uniform(80, 95),
                "triaged": False, "clerked": False, "tests": {}, "feedback": None, "dx_chosen": None,
                "dispo": None, "prescription": [], "bad_given": [], "team": {}, "log": [], "bed": None,
                "obs_at": 0, "eta": None, "eta_total": None, "discharge_at": None, "pickup": None,
                "unit": None, "taxi": False, "notes_pre": [], "refer_centre": None, "board_ward": None,
                "o2_t": 0, "call_at": 0}

    def spawn(self, t):
        case = random.choice(CASES)
        if random.random() < 0.3 or case["arrival"] == ["referral"]:
            self.new_call(t, case if case["arrival"] == ["referral"] else None)
            return
        mode = random.choice([m for m in case["arrival"] if m != "referral"])
        p = self.make_patient(case, mode, t)
        if mode == "walk_in":
            p["source"] = "Walked in"
            if case["dept"] == "opd":
                p["location"], p["stage"] = "records", "registration"
            self.plog(p, f"Arrived at {DEPTS[p['location']]['name']}.")
        else:  # 999 call: an ambulance must be dispatched to the scene
            scene = case.get("scene") or random.choice(SCENES)
            p.update(source=scene, pickup=scene.replace("999 call from ", "").replace("999 call on ", ""),
                     location="ambulance", stage="awaiting_ambulance")
            self.plog(p, f"{scene}. Waiting for an ambulance to be dispatched.")
            self.pa(f"999 call: {scene}. {case['complaint']}. Dispatch an ambulance from the bay.", "amb")
        self.patients[p["pid"]] = p
        self.stat("arrivals")

    # ---------- referral calls ----------
    def new_call(self, t, case=None):
        if case is None:
            pool = [c for c in CASES if "referral" in c["arrival"]]
            green = [c for c in pool if c["triage"] == "green"]
            case = random.choice(green) if green and random.random() < 0.2 else random.choice([c for c in pool if c["triage"] != "green"])
        facility, level = random.choice(REFERRING)
        p = self.make_patient(case, "referral", t)
        p.update(source=f"Referral from {facility}", pickup=facility)
        unit = case["dept"] if case["dept"] in UNIT_CAP else "emergency"
        self.call_seq += 1
        cid = f"C{self.call_seq}"
        self.calls[cid] = {"cid": cid, "p": p, "facility": facility, "level": level, "unit": unit,
                           "created": t, "missed": False, "appropriate": case["triage"] != "green",
                           "redirect_tried": 0}
        self.pa(f"Referral call from {facility} for {DEPTS[unit]['name']}. Pick up the phone there.", "call")
        self.stat("referral_calls")

    def unit_space(self, unit):
        used = sum(1 for p in self.patients.values() if p["location"] == unit and p["stage"] != "leaving")
        return max(0, UNIT_CAP.get(unit, 6) - used)

    def call_view(self, c, t):
        p, case = c["p"], c["p"]["case"]
        need = {"discharge": "review", "theatre": "surgery", "refer_out": "specialist care"}.get(case["dispo"], "admission")
        return {"cid": c["cid"], "from": c["facility"], "level": c["level"], "unit": c["unit"],
                "ring": int(t - c["created"]), "missed": c["missed"], "name": p["name"], "age": p["age"], "sex": p["sex"],
                "s": case["complaint"] + ".", "b": case["history"].split(". ")[0].rstrip(".") + ".",
                "a": ", ".join(f"{k} {v}" for k, v in case["vitals"].items()),
                "r": f"Requesting transfer for {need}.", "o2": bool(case.get("needs_o2")),
                "space": self.unit_space(c["unit"]), "cap": UNIT_CAP.get(c["unit"], 6)}

    def close_call(self, c):
        self.calls.pop(c["cid"], None)

    def accept_call(self, c, uid, advice, t):
        p = c["p"]
        good = [i for i in advice if ADVICE[i][1]]
        taxi = any(not ADVICE[i][1] for i in advice)
        p["notes_pre"].append(f"Referral accepted by {self.who(uid, 'the duty doctor')}"
                              + (f" with advice: {'; '.join(ADVICE[i][0].lower() for i in good)}." if good else " without advice."))
        self.join_team(p, uid)
        if taxi:
            p.update(taxi=True, stage="en_route", eta=t + 30, eta_total=30, location="ambulance")
            p["notes_pre"].append("The patient was sent by taxi with no escort and arrived worse.")
            self.plog(p, f"Referral accepted. Coming from {c['facility']} by taxi.")
        else:
            p.update(stage="awaiting_ambulance", location="ambulance")
            self.plog(p, f"Referral accepted from {c['facility']}. Ambulance needed to collect.")
            self.pa(f"Referral accepted: dispatch an ambulance to {c['facility']}.", "amb")
        if 1 in good:  # referral note: the facility has started treatment
            p["stability"] = min(100.0, p["stability"] + 5)
        self.patients[p["pid"]] = p
        self.stat("referrals_in")
        self.stat("arrivals")
        self.close_call(c)

    def npc_call(self, c, t):
        has_room = c["space"] if "space" in c else self.unit_space(c["unit"])
        o2_ok = not c["p"]["case"].get("needs_o2") or self.o2 > 0
        if not c["appropriate"]:
            self.pa(f"The duty doctor advised {c['facility']} to manage their patient locally.", "info")
            self.close_call(c)
        elif has_room and o2_ok:
            self.accept_call(c, None, [0, 1, 2], t)
        else:
            self.pa(f"The duty doctor redirected the referral from {c['facility']} to {random.choice(REDIRECT_HOSPITALS)}.", "info")
            self.stat("redirected")
            self.close_call(c)

    # ---------- ambulances ----------
    def free_unit(self):
        return next((u for u in self.fleet if u["status"] == "base"), None)

    def dispatch(self, p, uid, t):
        u = self.free_unit()
        if not u:
            return "All ambulances are out. Wait for one to come back."
        who = self.who(uid, "Ambulance control")
        if p["stage"] == "awaiting_ambulance":
            out = random.uniform(15, 25)
            u.update(status="out", until=t + out, total=out, pid=p["pid"], dest=p["pickup"])
            p["unit"] = u["name"]
            self.set_stage(p, "pickup")
            self.plog(p, f"{u['name']} dispatched to {p['pickup']} by {who}.")
            self.award(uid, 6, f"Dispatched {u['name']} for {p['name']}")
        else:  # transfer out
            u.update(status="transfer", until=t + 40, total=40, pid=None, dest=p["refer_centre"])
            self.plog(p, f"{u['name']} dispatched to {p['refer_centre']} by {who}.")
            self.do_transfer(p, uid)
        self.join_team(p, uid)
        return None

    def tick_fleet(self, t):
        for u in self.fleet:
            if u["status"] == "out" and t >= u["until"]:
                p = self.patients.get(u["pid"])
                back = random.uniform(20, 35)
                u.update(status="back", until=t + back, total=back)
                if p:
                    p.update(eta=t + back, eta_total=back)
                    self.set_stage(p, "en_route")
                    self.plog(p, f"Collected from {p['pickup']} by {u['name']}.")
            elif u["status"] in ("back", "transfer") and t >= u["until"]:
                u.update(status="base", pid=None, dest="")

    # ---------- beds and oxygen ----------
    def ward_used(self, ward):
        return sum(1 for p in self.patients.values() if p["location"] == ward and p["stage"] == "inpatient")

    def admit(self, p, ward):
        if self.ward_used(ward) >= WARD_BEDS[ward]:
            if p["stage"] != "boarding":
                p["board_ward"] = ward
                self.set_stage(p, "boarding")
                self.plog(p, f"No bed on {DEPTS[ward]['name']}. Waiting on a trolley in {DEPTS[p['location']]['name']}.")
                self.pa(f"No bed on {DEPTS[ward]['name']}: {p['name']} is waiting on a trolley.", "bad")
                self.stat("no_bed")
            return False
        taken = {x["bed"] for x in self.patients.values() if x["location"] == ward and x["stage"] == "inpatient"}
        bed = next(b for b in range(1, WARD_BEDS[ward] + 1) if b not in taken)
        p.update(location=ward, bed=bed, discharge_at=time.time() + 300, board_ward=None)
        self.set_stage(p, "inpatient")
        self.plog(p, f"Admitted to {DEPTS[ward]['name']}, bed {bed}.")
        self.stat("admissions")
        return True

    def tick_oxygen(self, t):
        if self.o2_due and t >= self.o2_due:
            self.o2 += 10
            self.o2_due = 0.0
            self.o2_low_warned = False
            self.pa("Oxygen delivery arrived: 10 cylinders.", "good")
        users = [p for p in self.patients.values() if p["case"].get("needs_o2") and p["triaged"]
                 and p["stage"] not in ("en_route", "pickup", "awaiting_ambulance", "leaving")]
        for p in users:
            if self.o2 <= 0:
                p["stability"] -= 0.25
                continue
            p["o2_t"] += 1
            if p["o2_t"] >= 40:
                p["o2_t"] = 0
                self.o2 -= 1
        if 0 < self.o2 <= 3 and not self.o2_low_warned:
            self.o2_low_warned = True
            self.pa(f"Oxygen is low: {self.o2} cylinder{'s' if self.o2 > 1 else ''} left. Order more from Pharmacy.", "power")
        if self.o2 <= 0:
            if self.o2_empty_since is None:
                self.o2_empty_since = t
                self.pa("Oxygen has run out. Patients on oxygen are getting worse. Order cylinders from Pharmacy.", "bad")
                self.stat("o2_outs")
            elif not self.o2_due and t - self.o2_empty_since > 60:
                self.o2_due = t + 60
                self.pa("Stores have ordered oxygen. Delivery in 1 minute.", "info")
        else:
            self.o2_empty_since = None

    def deteriorate(self, p):
        p["remove"] = True
        self.pa(f"Code red: {p['name']} deteriorated and was moved to ICU.", "bad")
        for uid in p["team"]:
            self.award(uid, -8, f"{p['name']} deteriorated")
        self.stat("deteriorations")

    def complete_test(self, p, key, uid):
        test = p["tests"][key]
        test["status"] = "done"
        test["result"] = p["case"]["results"].get(key, "Within normal limits.")
        dept = TESTS[key]["dept"]
        who = self.who(uid, {"lab": "Duty lab staff", "radiology": "Duty radiographer"}.get(dept, "Bedside test"))
        self.plog(p, f"{TESTS[key]['name']} reported by {who}.")
        if uid is not None:
            self.award(uid, 4, f"{TESTS[key]['name']} for {p['name']}")

    def route(self, p):
        """Send the patient where the plan says once care is given."""
        dispo, t = p["dispo"], time.time()
        if dispo == "discharge":
            self.set_stage(p, "leaving")
            self.plog(p, "Discharged home with medicines and advice.")
            self.stat("discharges")
        elif dispo in WARD_OF:
            self.admit(p, WARD_OF[dispo])
        elif dispo == "theatre":
            p["location"] = "theatre"
            self.set_stage(p, "surgery")
            self.plog(p, "Moved to theatre.")
            self.pa(f"Theatre: {p['name']} is waiting for surgery.", "event")
        elif dispo == "refer_out":
            self.set_stage(p, "transfer_call")
            self.plog(p, "Needs a receiving centre. A doctor must call and confirm a bed before transfer.")

    # Each do_* can be called by a player (uid) or by the duty NPC (uid=None).
    def do_register(self, p, uid):
        p["location"] = p["case"]["dept"]
        self.set_stage(p, "waiting")
        self.plog(p, f"Folder opened by {self.who(uid, 'Records staff')}. Sent to {DEPTS[p['location']]['name']}.")
        self.award(uid, 3, f"Folder for {p['name']}")

    def do_handover(self, p, uid):
        p["location"] = p["case"]["dept"]
        if uid is not None:
            p["triaged"] = True
            self.set_stage(p, "triaged")
            self.join_team(p, uid)
            self.plog(p, f"Handed over with vitals by {self.who(uid, '')}. Moved to {DEPTS[p['location']]['name']}.")
            self.award(uid, 8, f"Handover of {p['name']}")
        else:
            self.set_stage(p, "waiting")
            self.plog(p, f"Ambulance crew moved the patient to {DEPTS[p['location']]['name']}.")

    def do_triage(self, p, uid):
        p["triaged"] = True
        self.set_stage(p, "triaged")
        self.join_team(p, uid)
        self.plog(p, f"Triaged {p['case']['triage']} by {self.who(uid, 'the duty nurse')}.")
        bonus = 2 if uid in self.players and self.players[uid]["role"] in CARERS else 0
        self.award(uid, 6 + bonus, f"Triage of {p['name']}")

    def do_clerk(self, p, uid):
        p["clerked"] = True
        self.set_stage(p, "reviewed")
        self.join_team(p, uid)
        self.plog(p, f"Clerked by {self.who(uid, 'the duty doctor')}.")
        self.award(uid, 6, f"Clerking {p['name']}")

    def order_tests(self, p, keys, uid):
        t = time.time()
        added = []
        for k in keys:
            if k in TESTS and k not in p["tests"]:
                p["tests"][k] = {"status": "pending", "at": t, "result": None}
                added.append(k)
                if TESTS[k]["dept"] == "bedside":
                    self.complete_test(p, k, None)
        if added:
            self.plog(p, f"{self.who(uid, 'Duty doctor')} ordered: {', '.join(TESTS[k]['name'] for k in added)}.")
        return added

    def decide(self, p, uid, dx, chosen, dispo):
        c = p["case"]
        xp = 15 if dx == c["dx"] else -5
        plan = []
        for i, opt in enumerate(c["mgmt"]):
            picked = i in chosen
            if opt["good"] and picked:
                xp += 5
            elif opt["good"] and not picked:
                xp -= 3
            elif opt["good"] is False and picked:
                xp -= 6
            plan.append({"t": opt["t"], "chosen": picked, "good": opt["good"]})
        ordered, key, useful = set(p["tests"]), set(c["key_tests"]), set(c.get("useful_tests", []))
        missed, extra = key - ordered, ordered - key - useful
        xp += 3 * len(key & ordered) - 4 * len(missed) - 2 * len(extra)
        xp += 8 if dispo == c["dispo"] else -6
        p["feedback"] = {
            "by": self.who(uid, "Duty doctor"), "xp": xp,
            "dx_ok": dx == c["dx"], "dx_given": c["dx_options"][dx], "dx_correct": c["dx_options"][c["dx"]],
            "plan": plan, "missed": [TESTS[k]["name"] for k in missed], "extra": [TESTS[k]["name"] for k in extra],
            "dispo_ok": dispo == c["dispo"], "dispo_given": DISPOSITIONS[dispo], "dispo_correct": DISPOSITIONS[c["dispo"]],
            "learning": c["learning"], "notes": list(p["notes_pre"])}
        p.update(dx_chosen=dx, dispo=dispo, prescription=[i for i in chosen if c["mgmt"][i]["drug"]])
        self.join_team(p, uid)
        for member in p["team"]:
            self.remember(member, p)
        self.plog(p, f"Plan set by {self.who(uid, 'the duty doctor')}: {DISPOSITIONS[dispo]}.")
        self.set_stage(p, "pharmacy" if p["prescription"] else "care")
        self.award(uid, xp, f"Managing {p['name']}")
        self.stat("decisions")

    def do_dispense(self, p, uid, query):
        c = p["case"]
        who = self.who(uid, "The pharmacy technician")
        bad = [i for i in p["prescription"] if c["mgmt"][i]["good"] is False]
        if query:
            if bad:
                names = "; ".join(c["mgmt"][i]["t"] for i in bad)
                p["prescription"] = [i for i in p["prescription"] if i not in bad]
                p["stability"] = min(100.0, p["stability"] + 10)
                p["feedback"]["notes"].append(f"{who} queried the prescription and stopped: {names}.")
                self.pa(f"Good catch: {who} stopped an unsafe prescription for {p['name']}.", "good")
                self.award(uid, 15, f"Unsafe prescription stopped for {p['name']}")
                self.stat("prescriptions_stopped")
                bad = []
            else:
                p["feedback"]["notes"].append(f"{who} queried the prescription; it was safe to dispense.")
                self.award(uid, -3, "Query on a safe prescription")
        elif uid is not None:
            self.award(uid, -4 if bad else 5, f"Dispensing for {p['name']}")
        p["bad_given"] = bad
        self.join_team(p, uid)
        self.plog(p, f"Medicines dispensed by {who}.")
        self.set_stage(p, "care")

    def do_care(self, p, uid):
        c = p["case"]
        if p["bad_given"]:
            names = "; ".join(c["mgmt"][i]["t"] for i in p["bad_given"])
            p["stability"] = max(1.0, p["stability"] - 20)
            p["feedback"]["notes"].append(f"Adverse event: {names} was given.")
            self.pa(f"Adverse event on {p['name']}: an unsafe treatment was given.", "bad")
            for member in p["team"]:
                self.award(member, -3, f"Adverse event for {p['name']}")
            p["bad_given"] = []
        self.join_team(p, uid)
        self.plog(p, f"Care and medicines given by {self.who(uid, 'the duty nurse')}.")
        self.award(uid, 6, f"Care for {p['name']}")
        self.route(p)

    def do_operate(self, p, uid):
        ward = p["case"].get("post_op", "surgical")
        self.join_team(p, uid)
        self.plog(p, f"Operated on by {self.who(uid, 'the duty surgeon')}.")
        self.award(uid, 12, f"Surgery for {p['name']}")
        self.stat("operations")
        self.admit(p, ward)

    def do_transfer(self, p, uid):
        p["location"] = "ambulance"
        self.set_stage(p, "leaving")
        self.plog(p, f"Transferred out by {self.who(uid, 'the duty ambulance crew')}.")
        self.award(uid, 8, f"Transfer of {p['name']}")
        self.stat("referrals_out")

    def npc_doctor(self, p, t):
        """Duty doctor for when no doctor or student is on shift."""
        c = p["case"]
        if not p["tests"]:
            self.order_tests(p, c["key_tests"], None)
        if all(x["status"] == "done" for x in p["tests"].values()):
            chosen = [i for i, m in enumerate(c["mgmt"]) if m["good"]]
            self.decide(p, None, c["dx"], chosen, c["dispo"])

    def remember(self, uid, p):
        cases = self.treated.setdefault(uid, {})
        if p["pid"] not in cases:
            cases[p["pid"]] = {"pid": p["pid"], "name": p["name"], "age": p["age"], "sex": p["sex"],
                               "case_id": p["case"]["id"], "title": p["case"]["title"], "presented": False}
            while len(cases) > 12:
                cases.pop(next(iter(cases)))

    # ---------- tick ----------
    async def run(self):
        while True:
            t = time.time()
            try:
                self.tick(t)
                self.to_all(self.state_payload(t))
                await self.flush()
            except Exception:
                traceback.print_exc()
            await asyncio.sleep(max(0.2, 1.0 - (time.time() - t)))

    def tick(self, t):
        if not self.players:
            return
        online = self.roles_online()
        if t >= self.next_spawn:
            n = len(self.players)
            cap = max(4, min(30, 3 + 2 * n))
            if len(self.patients) < cap:
                self.spawn(t)
            self.next_spawn = t + random.uniform(30, 60) * (1.0 if n < 4 else 0.6)
        self.tick_fleet(t)
        self.tick_oxygen(t)
        for c in list(self.calls.values()):
            age = t - c["created"]
            if age > 45 and not c["missed"]:
                c["missed"] = True
                self.pa(f"Missed referral call from {c['facility']}. They are ringing {DEPTS[c['unit']]['name']} again.", "bad")
                self.stat("missed_calls")
            if age > 100:
                self.npc_call(c, t)
        for p in list(self.patients.values()):
            self.update_patient(p, t, online)
        for pid in [k for k, p in self.patients.items() if p.get("remove")]:
            del self.patients[pid]
        if t >= self.next_power:
            self.power_until = t + 25
            self.next_power = t + random.uniform(700, 1300)
            self.pa("Power outage. Generator starting. Lab and radiology are paused.", "power")
            self.stat("power_cuts")
        elif self.power_until and t >= self.power_until:
            self.power_until = 0
            self.pa("Power restored. Lab and radiology are back.", "good")
        self.schedule(t)

    def update_patient(self, p, t, online):
        st = p["stage"]
        if st == "en_route":
            if t >= p["eta"]:
                if p["taxi"]:
                    p["location"] = p["case"]["dept"]
                    p["stability"] = max(5.0, p["stability"] - 20)
                    self.set_stage(p, "waiting")
                    self.plog(p, f"Arrived by taxi at {DEPTS[p['location']]['name']} with no escort, and worse.")
                    self.pa(f"{p['name']} arrived by taxi with no escort and is worse.", "bad")
                else:
                    self.set_stage(p, "arrived")
                    self.plog(p, "Ambulance arrived at the bay.")
                    self.pa(f"Ambulance has arrived with {p['name']}. Hand-over needed at the Ambulance bay.", "amb")
            return
        if st == "pickup":
            return
        if st == "leaving":
            if t - p["since"] > 8:
                p["remove"] = True
            return
        if st == "inpatient":
            p["stability"] = min(100.0, p["stability"] + 0.5)
            if t >= p["discharge_at"]:
                self.set_stage(p, "leaving")
                self.plog(p, "Discharged from the ward.")
                self.stat("discharges")
            return
        p["stability"] -= DECAY[p["case"]["triage"]] * STAGE_MULT.get(st, 0.5)
        if p["stability"] <= 0:
            self.deteriorate(p)
            return
        age = t - p["since"]
        any_online = lambda roles: any(online[r] for r in roles)
        if st in ("awaiting_ambulance", "transfer") and age > (60 if online["paramedic"] else 15) and self.free_unit():
            self.dispatch(p, None, t)
            return
        if st == "boarding":
            self.admit(p, p["board_ward"])
            return
        if st == "transfer_call" and age > (120 if online["doctor"] else 45):
            centre = next(n for n, kinds in SPECIALIST_CENTRES.items() if p["case"].get("refer_specialty") in kinds)
            p["refer_centre"] = centre
            self.set_stage(p, "transfer")
            self.plog(p, f"The duty doctor confirmed a bed at {centre}.")
            return
        if st == "arrived" and age > (45 if online["paramedic"] else 12):
            self.do_handover(p, None)
        elif st == "registration" and age > 15:
            self.do_register(p, None)
        elif st == "waiting" and not any_online(TRIAGERS) and age > 30:
            self.do_triage(p, None)
        elif st == "triaged" and not any_online(CLINICIANS) and age > 40:
            self.do_clerk(p, None)
        elif st == "reviewed":
            if t >= self.power_until:
                for k, test in p["tests"].items():
                    if test["status"] == "pending":
                        role = "lab_scientist" if TESTS[k]["dept"] == "lab" else "radiographer"
                        if t - test["at"] > (90 if online[role] else 20):
                            self.complete_test(p, k, None)
            if not any_online(CLINICIANS) and age > 40:
                self.npc_doctor(p, t)
        elif st == "pharmacy" and age > (90 if online["pharmacist"] else 20):
            self.do_dispense(p, None, False)
        elif st == "care" and age > (90 if any_online(CARERS) else 25):
            self.do_care(p, None)
        elif st == "surgery" and age > (120 if online["doctor"] else 35):
            self.do_operate(p, None)

    # ---------- ward rounds and meetings ----------
    def pick_ward(self):
        counts = Counter(p["location"] for p in self.patients.values() if p["stage"] == "inpatient")
        busiest = [w for w in WARDS if counts[w] and counts[w] == max(counts[x] for x in WARDS)]
        return random.choice(busiest or list(WARDS))

    def schedule(self, t):
        if self.session:
            self.step_session(t)
            return
        if t >= self.next_meeting - 60 and "meeting" not in self.pending:
            self.pending["meeting"] = True
            self.pa("Clinical meeting in the Conference room in 1 minute.", "event")
        if t >= self.next_round - 60 and "round" not in self.pending:
            self.pending["round"] = self.pick_ward()
            self.pa(f"Ward round on {DEPTS[self.pending['round']]['name']} in 1 minute.", "event")
        if "meeting" in self.pending and t >= self.next_meeting:
            self.start_meeting(t)
        elif "round" in self.pending and t >= self.next_round:
            self.start_round(t, self.pending["round"])

    def present_in(self, dept):
        return [u for u, p in self.players.items() if p["dept"] == dept]

    def start_round(self, t, ward):
        qs, seen = [], set()
        for p in self.patients.values():
            c = p["case"]
            if p["location"] == ward and p["stage"] == "inpatient" and c["id"] not in seen:
                seen.add(c["id"])
                qs.append(dict(c["round_q"], label=f"Bed {p['bed']}, {p['name']} ({p['age']}{p['sex']}), {c['title']}"))
        qs = qs[:3]
        pool = [c for c in CASES if c["id"] not in seen and
                (WARD_OF.get(c["dispo"]) == ward or c.get("post_op") == ward)]
        random.shuffle(pool)
        while len(qs) < 2 and pool:
            c = pool.pop()
            qs.append(dict(c["round_q"], label=f"Teaching case: {c['title']}"))
        if not qs:
            c = random.choice(CASES)
            qs.append(dict(c["round_q"], label=f"Teaching case: {c['title']}"))
        self.session_seq += 1
        self.session = {"id": self.session_seq, "type": "round", "dept": ward,
                        "title": f"Ward round, {DEPTS[ward]['name']}", "qs": qs, "idx": 0,
                        "phase": "question", "until": t + Q_SECONDS, "answers": {}, "summary": None}
        for uid in self.present_in(ward):
            self.award(uid, 3, "Joined the ward round")
        self.pa(f"The ward round has started on {DEPTS[ward]['name']}.", "event")
        self.stat("ward_rounds")

    def start_meeting(self, t):
        top = [{"name": self.players[u]["name"] if u in self.players else "Former staff", "xp": n}
               for u, n in self.period_xp.most_common(3) if n > 0]
        keys = ["arrivals", "admissions", "discharges", "operations", "referrals_in", "referrals_out",
                "deteriorations", "prescriptions_stopped", "presentations", "no_bed", "missed_calls"]
        summary = {"counts": {k: self.period[k] for k in keys}, "top": top}
        self.period, self.period_xp = Counter(), Counter()
        c = random.choice(CASES)
        self.session_seq += 1
        self.session = {"id": self.session_seq, "type": "meeting", "dept": "conference",
                        "title": "Clinical meeting", "summary": summary, "idx": 0, "phase": "summary",
                        "until": t + SUMMARY_SECONDS, "answers": {},
                        "qs": [dict(c["round_q"], label=f"Case discussion: {c['title']}")]}
        for uid in self.present_in("conference"):
            self.award(uid, 5, "Attended the clinical meeting")
        self.pa("The clinical meeting has started in the Conference room.", "event")
        self.stat("meetings")

    def step_session(self, t):
        s = self.session
        if t < s["until"]:
            return
        if s["phase"] == "summary":
            s.update(phase="question", until=t + Q_SECONDS, answers={})
        elif s["phase"] == "question":
            q = s["qs"][s["idx"]]
            right = [u for u, o in s["answers"].items() if o == q["answer"]]
            for uid in right:
                self.award(uid, 10, "Correct answer on " + ("the ward round" if s["type"] == "round" else "the meeting"))
            s.update(phase="reveal", until=t + REVEAL_SECONDS, n_correct=len(right), n_answered=len(s["answers"]))
        elif s["idx"] + 1 < len(s["qs"]):
            s.update(idx=s["idx"] + 1, phase="question", until=t + Q_SECONDS, answers={})
        else:
            kind = s["type"]
            self.session = None
            if kind == "round":
                self.pending.pop("round", None)
                self.next_round = t + ROUND_EVERY
            else:
                self.pending.pop("meeting", None)
                self.next_meeting = t + MEETING_EVERY
            self.pa(("Ward round" if kind == "round" else "Clinical meeting") + " finished.", "info")

    def session_view(self, t):
        s = self.session
        if not s:
            return None
        v = {"id": s["id"], "type": s["type"], "dept": s["dept"], "title": s["title"], "phase": s["phase"],
             "left": max(0, int(s["until"] - t)), "idx": s["idx"], "total": len(s["qs"])}
        if s["phase"] == "summary":
            v["summary"] = s["summary"]
        else:
            q = s["qs"][s["idx"]]
            v.update(q=q["q"], options=q["options"], label=q["label"], answered=len(s["answers"]))
            if s["phase"] == "reveal":
                v.update(answer=q["answer"], why=q["why"], correct=s.get("n_correct", 0))
        return v

    # ---------- views ----------
    def lview(self, p, t):
        c = p["case"]
        v = {"pid": p["pid"], "name": p["name"], "age": p["age"], "sex": p["sex"], "loc": p["location"],
             "stage": p["stage"], "stab": max(0, round(p["stability"])), "tri": c["triage"] if p["triaged"] else None,
             "cc": c["complaint"], "mode": p["mode"], "src": p["source"], "rev": p["rev"], "nhis": p["nhis"],
             "bed": p["bed"], "team": list(p["team"].values()),
             "pend": [{"k": k, "n": TESTS[k]["name"], "d": TESTS[k]["dept"], "w": int(t - x["at"])}
                      for k, x in p["tests"].items() if x["status"] == "pending"]}
        if p["stage"] == "en_route":
            v.update(eta=max(0, round(p["eta"] - t)), eta_total=round(p["eta_total"]))
        if p["feedback"]:
            v.update(title=c["title"], dx=c["dx_options"][p["dx_chosen"]], dispo=DISPOSITIONS[p["dispo"]])
        if p["stage"] == "pharmacy":
            v["rx"] = [c["mgmt"][i]["t"] for i in p["prescription"]]
        if p["pickup"]:
            v["pickup"] = p["pickup"]
        if p["unit"]:
            v["unit"] = p["unit"]
        if p["taxi"]:
            v["taxi"] = True
        if p["refer_centre"]:
            v["centre"] = p["refer_centre"]
        if p["board_ward"]:
            v["board"] = p["board_ward"]
        if c.get("needs_o2"):
            v["o2"] = True
        if p["stage"] == "inpatient":
            v["ward_secs"] = int(t - p["since"])
        return v

    def fview(self, p, t):
        c = p["case"]
        v = self.lview(p, t)
        v.update({"folder": p["folder"], "nhis_no": p["nhis_no"], "triaged": p["triaged"], "clerked": p["clerked"],
                  "vitals": c["vitals"] if p["triaged"] else None,
                  "history": c["history"] if p["clerked"] else None,
                  "exam": c["exam"] if p["clerked"] else None,
                  "tests": [{"k": k, "n": TESTS[k]["name"], "d": TESTS[k]["dept"], "status": x["status"],
                             "result": x["result"]} for k, x in p["tests"].items()],
                  "dx_options": c["dx_options"] if p["clerked"] else None,
                  "mgmt_options": [m["t"] for m in c["mgmt"]] if p["clerked"] else None,
                  "feedback": p["feedback"],
                  "rx_all": [c["mgmt"][i]["t"] for i in p["prescription"]] if p["feedback"] else None,
                  "log": p["log"][-25:]})
        return v

    def state_payload(self, t):
        players = [{"uid": u, "name": p["name"], "role": p["role"], "dept": p["dept"], "xp": p["xp"],
                    "lvl": rank_for(p["role"], p["xp"])[0]} for u, p in list(self.players.items())[:400]]
        return {"t": "state", "now": t, "online": len(self.players), "peak": self.peak,
                "power": t < self.power_until, "patients": [self.lview(p, t) for p in self.patients.values()],
                "players": players, "session": self.session_view(t),
                "calls": [self.call_view(c, t) for c in self.calls.values()],
                "fleet": [{"name": u["name"], "status": u["status"], "left": max(0, round(u["until"] - t)),
                           "total": round(u["total"]) or 1, "dest": u["dest"]} for u in self.fleet],
                "o2": {"stock": self.o2, "due_in": max(0, round(self.o2_due - t)) if self.o2_due else None},
                "beds": {w: {"used": self.ward_used(w), "total": n} for w, n in WARD_BEDS.items()},
                "units": {u: {"free": self.unit_space(u), "total": n} for u, n in UNIT_CAP.items()},
                "advice": [a[0] for a in ADVICE],
                "centres": list(SPECIALIST_CENTRES),
                "next": {"round_in": max(0, int(self.next_round - t)), "round_ward": self.pending.get("round"),
                         "meeting_in": max(0, int(self.next_meeting - t))}}

    # ---------- player actions ----------
    def act_move(self, uid, m):
        dept = m.get("dept")
        if dept not in DEPTS:
            return "That place does not exist in this hospital."
        self.players[uid]["dept"] = dept
        self.to_user(uid, {"t": "me", "me": self.me_view(uid)})

    def act_folder(self, uid, m):
        p = self.pat(m)
        if not p:
            return "That patient has left the hospital."
        self.to_user(uid, {"t": "folder", "patient": self.fview(p, time.time())})

    def act_register(self, uid, m):
        p = self.pat(m)
        err = self.check(uid, p, stage="registration")
        if err:
            return err
        self.do_register(p, uid)

    def act_handover(self, uid, m):
        p = self.pat(m)
        err = self.check(uid, p, ("paramedic",), "arrived")
        if err:
            return err
        self.do_handover(p, uid)

    def act_triage(self, uid, m):
        p = self.pat(m)
        err = self.check(uid, p, TRIAGERS, "waiting")
        if err:
            return err
        self.do_triage(p, uid)

    def act_clerk(self, uid, m):
        p = self.pat(m)
        err = self.check(uid, p, CLINICIANS, "triaged")
        if err:
            return err
        self.do_clerk(p, uid)

    def act_order(self, uid, m):
        p = self.pat(m)
        err = self.check(uid, p, CLINICIANS, "reviewed")
        if err:
            return err
        keys = [k for k in (m.get("tests") or []) if isinstance(k, str)][:12]
        if not self.order_tests(p, keys, uid):
            return "Choose at least one new test."
        self.join_team(p, uid)

    def act_run_test(self, uid, m):
        p = self.pat(m)
        key = m.get("test")
        if not p or key not in p["tests"] or p["tests"][key]["status"] != "pending":
            return "That test has already been reported."
        dept = TESTS[key]["dept"]
        role = "lab_scientist" if dept == "lab" else "radiographer"
        me = self.players[uid]
        if me["role"] != role:
            return f"Only {ROLES[role]['name'].lower()}s can run this test."
        if me["dept"] != dept:
            return f"Go to {DEPTS[dept]['name']} first."
        if time.time() < self.power_until:
            return "No power. Wait for the generator."
        self.join_team(p, uid)
        self.complete_test(p, key, uid)

    def act_decide(self, uid, m):
        p = self.pat(m)
        err = self.check(uid, p, CLINICIANS, "reviewed")
        if err:
            return err
        if any(x["status"] == "pending" for x in p["tests"].values()):
            return "Some results are still pending."
        c = p["case"]
        try:
            dx = int(m.get("dx"))
            chosen = sorted({int(i) for i in (m.get("mgmt") or [])})
        except (TypeError, ValueError):
            return "Choose a diagnosis, the plan and where the patient goes."
        dispo = m.get("dispo")
        if not 0 <= dx < len(c["dx_options"]) or dispo not in DISPOSITIONS or any(not 0 <= i < len(c["mgmt"]) for i in chosen):
            return "Choose a diagnosis, the plan and where the patient goes."
        if not chosen:
            return "Choose at least one management step."
        self.decide(p, uid, dx, chosen, dispo)

    def act_dispense(self, uid, m):
        p = self.pat(m)
        err = self.check(uid, p, ("pharmacist",), "pharmacy", here=False)
        if err:
            return err
        if self.players[uid]["dept"] != "pharmacy":
            return "Go to Pharmacy first."
        self.do_dispense(p, uid, bool(m.get("query")))

    def act_care(self, uid, m):
        p = self.pat(m)
        err = self.check(uid, p, CARERS, "care")
        if err:
            return err
        self.do_care(p, uid)

    def act_operate(self, uid, m):
        p = self.pat(m)
        err = self.check(uid, p, ("doctor",), "surgery")
        if err:
            return err
        self.do_operate(p, uid)

    def act_transfer(self, uid, m):
        return self.act_dispatch(uid, m)

    def act_dispatch(self, uid, m):
        p = self.pat(m)
        err = self.check(uid, p, ("paramedic",), ("awaiting_ambulance", "transfer"), here=False)
        if err:
            return err
        if self.players[uid]["dept"] != "ambulance":
            return "Go to the Ambulance bay first."
        return self.dispatch(p, uid, time.time())

    def act_answer_call(self, uid, m):
        c = self.calls.get(str(m.get("cid", "")))
        if not c:
            return "That call has ended."
        me = self.players[uid]
        if me["role"] not in CALL_ROLES or (me["role"] == "midwife" and c["unit"] != "maternity"):
            return "Referral calls are taken by the doctor, the nurse in charge, or the midwife in charge on the labour ward."
        if me["dept"] != c["unit"]:
            return f"The phone is ringing in {DEPTS[c['unit']]['name']}."
        choice = m.get("choice")
        t = time.time()
        p = c["p"]
        room = self.unit_space(c["unit"]) > 0
        o2_ok = not p["case"].get("needs_o2") or self.o2 > 0
        capacity = room and o2_ok
        lack = "no oxygen" if room else "no bed"
        if choice == "accept":
            try:
                advice = sorted({int(i) for i in (m.get("advice") or []) if 0 <= int(i) < len(ADVICE)})
            except (TypeError, ValueError):
                advice = []
            bonus = sum(1 for i in advice if ADVICE[i][1]) - sum(5 for i in advice if not ADVICE[i][1])
            if not c["appropriate"]:
                self.award(uid, -3 + bonus, "Accepted a referral that could be managed locally")
            elif capacity:
                self.award(uid, 10 + bonus, f"Accepted referral from {c['facility']}")
            else:
                self.award(uid, 6 + bonus, f"Accepted a referral despite {lack}")
                p["notes_pre"].append(f"Accepted with {lack}; the patient will wait on a trolley.")
            self.accept_call(c, uid, advice, t)
        elif choice == "local":
            if c["appropriate"]:
                self.award(uid, -12, "Turned away a patient who needed a higher level of care")
                self.pa(f"Referral from {c['facility']} was turned away. That patient needed our care.", "bad")
                self.stat("referrals_refused")
            else:
                self.award(uid, 8, f"Advised {c['facility']} to manage locally")
            self.close_call(c)
        elif choice == "redirect":
            if capacity and c["appropriate"]:
                self.award(uid, -6, "Redirected a referral while we had space")
                self.close_call(c)
            elif random.random() < 0.65:
                other = random.choice(REDIRECT_HOSPITALS)
                self.award(uid, 6, f"Found a bed at {other}")
                self.pa(f"{me['name']} found a bed at {other} for the referral from {c['facility']}.", "good")
                self.stat("redirected")
                self.close_call(c)
            else:
                c["redirect_tried"] += 1
                return "No space at the other hospitals you called either. Accept the patient or try again."
        elif choice == "decline":
            self.award(uid, -10 if c["appropriate"] else -2, "Declined a referral without finding an alternative")
            self.pa(f"Referral from {c['facility']} was declined with no alternative found.", "bad")
            self.stat("referrals_refused")
            self.close_call(c)
        else:
            return "Choose how to respond."

    def act_call_centre(self, uid, m):
        p = self.pat(m)
        err = self.check(uid, p, ("doctor", "student"), "transfer_call")
        if err:
            return err
        centre = m.get("centre")
        if centre not in SPECIALIST_CENTRES:
            return "Choose a centre to call."
        t = time.time()
        if t - p["call_at"] < 8:
            return "You just called. Give it a few seconds."
        p["call_at"] = t
        if p["case"].get("refer_specialty") not in SPECIALIST_CENTRES[centre]:
            self.award(uid, -2, f"{centre} does not take this kind of patient")
            return None
        if random.random() < 0.4:
            self.plog(p, f"{centre} has no bed right now.")
            return f"{centre} has no bed right now. Try the other centre or call again shortly."
        p["refer_centre"] = centre
        self.join_team(p, uid)
        self.set_stage(p, "transfer")
        self.plog(p, f"{self.who(uid, '')} confirmed a bed at {centre}. Ambulance needed.")
        self.pa(f"{centre} accepted {p['name']}. Dispatch an ambulance from the bay.", "amb")
        self.award(uid, 8, f"Secured a bed at {centre}")

    def act_order_o2(self, uid, m):
        me = self.players[uid]
        if me["role"] not in ("pharmacist", "nurse", "doctor"):
            return "Pharmacists, nurses and doctors can order oxygen."
        if me["dept"] != "pharmacy":
            return "Go to Pharmacy to order oxygen."
        if self.o2_due:
            return "Oxygen is already on the way."
        self.o2_due = time.time() + 60
        self.pa(f"{me['name']} ordered 10 oxygen cylinders. Delivery in 1 minute.", "info")
        self.award(uid, 4 if self.o2 <= 4 else 1, "Ordered oxygen")

    def act_early_discharge(self, uid, m):
        p = self.pat(m)
        err = self.check(uid, p, ("doctor",), "inpatient")
        if err:
            return err
        if p["stability"] < 90 or time.time() - p["since"] < 45:
            return "This patient is not ready for discharge yet."
        self.set_stage(p, "leaving")
        self.plog(p, f"Discharged early by {self.who(uid, '')} to free a bed.")
        self.stat("discharges")
        self.award(uid, 3, "Freed a bed with a safe early discharge")

    def act_obs(self, uid, m):
        p = self.pat(m)
        err = self.check(uid, p, CARERS + ("student",), "inpatient")
        if err:
            return err
        t = time.time()
        if t - p["obs_at"] < 60:
            return "Observations were done less than a minute ago."
        p["obs_at"] = t
        p["stability"] = min(100.0, p["stability"] + 5)
        self.join_team(p, uid)
        self.plog(p, f"Observations done by {self.who(uid, '')}: stable.")
        self.award(uid, 2, f"Observations on {p['name']}")

    def act_answer(self, uid, m):
        s = self.session
        if not s or s["phase"] != "question":
            return "There is no open question right now."
        if self.players[uid]["dept"] != s["dept"]:
            return f"Go to {DEPTS[s['dept']]['name']} to take part."
        if uid in s["answers"]:
            return "You have already answered."
        try:
            opt = int(m.get("opt"))
        except (TypeError, ValueError):
            return None
        if 0 <= opt < len(s["qs"][s["idx"]]["options"]):
            s["answers"][uid] = opt

    def act_chat(self, uid, m):
        t = time.time()
        text = str(m.get("text", "")).strip()[:280]
        if not text:
            return None
        if t - self.chat_last.get(uid, 0) < 1.0:
            return "Slow down a little."
        self.chat_last[uid] = t
        me = self.players[uid]
        scope = "dept" if m.get("scope") == "dept" else "all"
        payload = {"t": "chat", "scope": scope, "dept": me["dept"], "from": me["name"], "role": me["role"],
                   "text": text, "ts": t}
        if scope == "dept":
            self.to_dept(me["dept"], payload)
        else:
            self.to_all(payload)

    def act_my_cases(self, uid, m):
        cases = list(reversed(list(self.treated.get(uid, {}).values())))
        self.to_user(uid, {"t": "my_cases", "cases": cases})

    def act_present(self, uid, m):
        me = self.players[uid]
        if me["dept"] != "conference":
            return "Presentations happen in the Conference room."
        item = self.treated.get(uid, {}).get(str(m.get("pid", "")))
        if not item:
            return "Choose a patient you helped manage."
        if item["presented"]:
            return "You have already presented this patient."
        sec = m.get("sections") or {}
        keys = ["pc", "findings", "ix", "assessment", "plan", "learning"]
        body = {k: str(sec.get(k, "")).strip()[:600] for k in keys}
        filled = sum(1 for k in keys if len(body[k]) >= 15)
        if filled < 3:
            return "Fill in at least three sections with a sentence each."
        case = CASE_BY_ID[item["case_id"]]
        score = 3 * filled + (10 if any(kw in body["assessment"].lower() for kw in case["dx_keywords"]) else 0)
        patient = f"{item['name']} ({item['age']}{item['sex']})"
        pres_id = db.add_presentation(uid, me["name"], me["role"], patient, case["title"], body, score)
        item["presented"] = True
        self.feed.appendleft({"id": pres_id, "uid": uid, "author": me["name"], "role": me["role"], "patient": patient,
                              "title": case["title"], "body": body, "score": score, "endorsements": 0, "ts": time.time()})
        self.to_all({"t": "feed", "feed": list(self.feed)})
        self.award(uid, score, "Case presentation")
        self.pa(f"{me['name']} presented a case: {case['title']}.", "event")
        self.stat("presentations")
        self.act_my_cases(uid, m)

    def act_endorse(self, uid, m):
        try:
            pres_id = int(m.get("id"))
        except (TypeError, ValueError):
            return None
        author = db.endorse(pres_id, uid)
        if author is None:
            return "You can endorse each colleague's presentation once, and not your own."
        for entry in self.feed:
            if entry["id"] == pres_id:
                entry["endorsements"] += 1
        self.award(author, 3, "A colleague endorsed your presentation")
        self.to_all({"t": "feed", "feed": list(self.feed)})
